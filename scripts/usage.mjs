/**
 * Sephral usage statistics, shared by all Sephral modules.
 *
 * Every module carries an identical copy as scripts/usage.mjs. Never change one copy alone: all copies stay the same,
 * and every change raises LIB_VERSION.
 *
 * Only the active GM's browser sends, at most once a UTC day, one ping for all Sephral modules of the world, and only
 * after the GM agreed. Nothing here may disturb a module: every entry point catches its own errors, nothing is awaited
 * by the caller, and an unreachable server only costs one failed request followed by a growing pause.
 */

/* -------------------------------------------- */
/*  Versions                                    */
/* -------------------------------------------- */

/** Version of this file. Raise it with every change; the newest copy in a world runs for all modules. */
export const LIB_VERSION = 4;

/** Version of the ping format ("v"). Raise it only for breaking changes; the server keeps a parser per version. */
export const FORMAT_VERSION = 1;

/** Version of what the GM agreed to. Raise it when new kinds of data are sent; GMs who agreed are asked again. */
export const CONSENT_VERSION = 1;

/** Layout of the browser state. A different stored version is migrated or started fresh. */
const STATE_VERSION = 1;

/** The first library version that keeps the state in the world too (setting "usageState" of its modules). */
const WORLD_STATE_LIB = 4;

/**
 * Whether this copy may run at all. Switched off, nothing is shown, asked, counted or sent. Libraries 1 and 2 shipped
 * switched off; a switched-on copy serves the modules of switched-off copies too.
 */
const ACTIVE = true;

/* -------------------------------------------- */
/*  Configuration                               */
/* -------------------------------------------- */

const ENDPOINT = "https://usage.nat20.party/v1/ping";

/** A marker module: while it is installed on a server, nothing is asked, counted or sent there. */
const OPTOUT_MODULE = "sephrals-usage-optout";

/** localStorage switches of this browser. */
const OPTOUT_KEY = "sephral-usage-optout";
const DEBUG_KEY = "sephral-usage-debug";
const STATE_KEY = "sephral-usage";

/** Hidden world setting with the shared state, in the modules that carry a copy of WORLD_STATE_LIB or newer. */
const STATE_SETTING = "usageState";

/** Third-party modules a ping may name. Keep in sync with the list on the server. */
const INTEGRATIONS = ["dice-so-nice", "ember", "item-piles", "lib-wrapper", "midi-qol", "ready-set-roll-5e",
  "seasons-and-stars", "socketlib", "tidy5e-sheet"];

const WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const HOUR_S = 3600;
const MAX_ERRORS = 5;

/** Largest body a keepalive request may carry (browsers allow 64 KiB in flight). */
const KEEPALIVE_BYTES = 60_000;

/**
 * Delays in ms. Tests set them to 0.
 * - pingDelay: after ready for the first ping of a world, and when an earlier session ended before its ping went out
 * - lateDelay: otherwise, so the ping includes the first part of the running session; leaving the page sends earlier
 * - tick: how often an open world checks whether a new UTC day made a ping due
 * - worldSaveDelay: least time between two writes of the world state while counting. Short on purpose: a write while
 *   the page goes away does not reach the Foundry server (tested live), so the world must not wait for the end.
 */
const TIMING = {askDelay: 20_000, pingDelay: [10_000, 30_000], lateDelay: 30 * 60_000, tick: HOUR_MS, saveDelay: 3_000,
  worldSaveDelay: 60_000, timeout: 5_000};

/** Shared by every copy of this file in the page. */
const REGISTRY = Symbol.for("sephral.usage");

/* -------------------------------------------- */
/*  Public API                                  */
/* -------------------------------------------- */

/**
 * Register a module. Call it once from the module's init hook.
 * @param {string} id                         Module id
 * @param {object} [options]
 * @param {string[]} [options.features]       Feature counter keys the module uses (camelCase)
 * @param {string[]} [options.settings]       Setting keys whose value is sent (only choices, booleans, small numbers)
 */
export function registerUsage(id, {features = [], settings = []} = {}) {
  try {
    const reg = registry();
    reg.modules.set(id, {id, lib: LIB_VERSION, features: new Set(features), settings: [...settings]});
    reg.libraries.push(LIBRARY);
    if ( globalThis.game?.settings ) registerSettings(id);
    else Hooks.once("init", () => registerSettings(id));
    installErrorCapture(reg);
    Hooks.once("ready", () => startOnce(reg));
  } catch (err) {
    debug("register failed", err);
  }
}

/**
 * Count one use of a feature (and mark the module as used today). Only has an effect in the active GM's browser after
 * the GM agreed. Never throws, never blocks.
 * @param {string} id      Module id
 * @param {string} key     A feature key declared in registerUsage
 * @param {number} [n]     How many uses
 */
export function countFeature(id, key, n = 1) {
  call("count", id, key, n);
}

/**
 * Mark the module as used today without counting a feature, e.g. when its window opens.
 * @param {string} id      Module id
 */
export function markUsed(id) {
  call("count", id, null, 0);
}

/* -------------------------------------------- */
/*  Registry                                    */
/* -------------------------------------------- */

/*
 * Copies of different library versions meet in one page: every module ships the copy of its own release, and GMs update
 * modules at different times. The registry is the contract between them. Released copies cannot be changed, so it
 * stays backwards compatible forever:
 * - Fields are only added, never renamed, removed or given another type. Each copy fills in the fields it uses.
 * - Module records keep {id, lib, features: Set, settings: string[]}. The active copy reads records of older copies.
 * - LIBRARY keeps {version, active, start, count, openPanel, processErrors, text} with these arguments. Only added to.
 * - startOnce picks the highest version, so the active copy is never older than a record it reads.
 * - Error entries stay {stack, type}. The consent setting stays "usage" with {answer, version, id, decidedAt, asked},
 *   since lib 4 also world (the world folder the id belongs to). The setting "usageState" (lib 4) holds a state in the
 *   layout of the browser state.
 * A newer copy may work completely differently inside: it only has to serve older copies through these methods and
 * records, as an adapter if need be. Calls into another copy go through quiet(), so even a broken copy can only cost
 * the statistics, never disturb a module.
 */
function registry() {
  const reg = globalThis[REGISTRY] ??= {};
  reg.modules ??= new Map();
  reg.libraries ??= [];
  reg.pending ??= [];
  reg.errors ??= [];
  reg.seen ??= new WeakSet();
  return reg;
}

/** This copy's implementation. Only the newest copy in the page is started. */
const LIBRARY = {version: LIB_VERSION, active: ACTIVE || testOverride(), start, count, openPanel, processErrors, text};

function startOnce(reg) {
  if ( reg.started ) return;
  reg.started = true;
  quiet(() => {
    reg.active = reg.libraries.reduce((best, lib) => ((lib?.version ?? 0) > (best?.version ?? 0) ? lib : best));
    return reg.active.start(reg);
  });
}

function call(method, ...args) {
  quiet(() => {
    const reg = registry();
    if ( reg.active ) return reg.active[method](reg, ...args);
    if ( reg.pending.length < 500 ) reg.pending.push([method, args]);
  });
}

/**
 * Collect errors from the moment the first module registers. Kept minimal on purpose: the first copy installs it and
 * cannot be replaced by a newer one. Attribution happens later in the active copy.
 */
function installErrorCapture(reg) {
  if ( reg.capturing ) return;
  reg.capturing = true;
  const push = error => {
    try {
      if ( !error || (typeof error !== "object") || reg.seen.has(error) || (reg.errors.length >= 100) ) return;
      reg.seen.add(error);
      reg.errors.push({stack: String(error.stack ?? ""), type: String(error.name ?? "")});
      quiet(() => reg.active?.processErrors?.(reg));
    } catch {
      // Ignore
    }
  };
  globalThis.addEventListener?.("error", event => push(event.error));
  globalThis.addEventListener?.("unhandledrejection", event => push(event.reason));
  Hooks.on("error", (location, error) => push(error));
}

/* -------------------------------------------- */
/*  Settings and consent                        */
/* -------------------------------------------- */

/**
 * The hidden consent and world state settings at init. The menu once the language is known, and only when a
 * switched-on copy is in the page; its texts come from the newest such copy.
 */
function registerSettings(id) {
  safe(() => game.settings.register(id, "usage", {scope: "world", config: false, type: Object, default: {}}));
  safe(() => game.settings.register(id, STATE_SETTING, {scope: "world", config: false, type: Object, default: {}}));
  Hooks.once("i18nInit", () => safe(() => {
    const on = registry().libraries.filter(lib => lib?.active);
    if ( !on.length ) return;
    const newest = on.reduce((best, lib) => ((lib.version ?? 0) > (best.version ?? 0) ? lib : best));
    const label = key => newest.text?.(key) ?? text(key);
    const Menu = class extends foundry.applications.api.ApplicationV2 {
      async render() {
        quiet(() => registry().active?.openPanel(registry()));
        return this;
      }
    };
    game.settings.registerMenu(id, "usageMenu", {
      name: label("menuName"), label: label("menuLabel"), hint: label("menuHint"),
      icon: "fa-solid fa-chart-simple", type: Menu, restricted: true
    });
  }));
}

/**
 * The world's decision: the newest record among the registered modules, with the highest ask count.
 * @returns {{answer?: string, version?: number, id?: string, decidedAt?: number, asked: number}}
 */
function readConsent(reg) {
  let best = {};
  let asked = 0;
  for ( const id of reg.modules.keys() ) {
    const value = safe(() => game.settings.get(id, "usage")) ?? {};
    asked = Math.max(asked, value.asked ?? 0);
    if ( (value.decidedAt ?? 0) > (best.decidedAt ?? 0) ) best = value;
  }
  return {...best, asked};
}

async function writeConsent(reg, consent) {
  for ( const id of reg.modules.keys() ) {
    try {
      const current = game.settings.get(id, "usage") ?? {};
      if ( JSON.stringify(current) !== JSON.stringify(consent) ) await game.settings.set(id, "usage", consent);
    } catch (err) {
      debug(`could not store consent for ${id}`, err);
    }
  }
}

/**
 * What to do with a consent record: "send", "ask" or "off". Closing the question decides nothing, so it comes again at
 * every start until the GM chooses (as Foundry's own telemetry question does). "asked" only counts how often.
 */
function consentAction(consent) {
  if ( consent.answer === "yes" ) return (consent.version ?? 0) >= CONSENT_VERSION ? "send" : "ask";
  if ( consent.answer === "no" ) return "off";
  return "ask";
}

/** Why this page never takes part, or null. */
function optOutReason() {
  if ( globalThis.game?.modules?.get?.(OPTOUT_MODULE) && !testOverride() ) return "module";
  if ( storageGet(OPTOUT_KEY) === "1" ) return "browser";
  return null;
}

/** Live tests may point the library at a local endpoint and ignore the opt-out marker, never in production. */
function testOverride() {
  return !!globalThis.SEPHRAL_USAGE_ENDPOINT && !!globalThis.SEPHRAL_USAGE_IGNORE_OPTOUT;
}

/* -------------------------------------------- */
/*  Start                                       */
/* -------------------------------------------- */

/**
 * State of this page. id: the world id to send when it was just renewed for a copied world and the consent setting
 * may not be stored yet. skipWorld: ignore the world state until the copy of the original's state is cleared.
 */
const run = {state: null, saveTimer: null, recording: false, reg: null, sendTimer: null, tickTimer: null,
  worldTimer: null, sending: false, worldSaved: null, worldSavedAt: 0, id: null, skipWorld: false};

function start(reg) {
  if ( !LIBRARY.active ) return discard(reg);
  Hooks.on("renderSettingsConfig", (app, html) => safe(() => decorateSettings(reg, html)));
  if ( !game.user?.isActiveGM ) return discard(reg);
  const reason = optOutReason();
  if ( reason ) {
    debug(`opted out (${reason})`);
    return discard(reg);
  }
  const consent = readConsent(reg);
  const action = consentAction(consent);
  debug(`consent ${consent.answer ?? "open"} v${consent.version ?? 0}, action ${action}`);
  if ( action === "send" ) {
    const copied = claimWorld(reg, consent);
    beginRecording(reg, {fresh: copied});
    planPing(reg);
  }
  else {
    discard(reg);
    if ( action === "off" ) stopRecording(reg);
    if ( action === "ask" ) setTimeout(() => ask(reg).catch(err => debug("ask failed", err)), TIMING.askDelay);
  }
}

/**
 * Bind the world id to this world folder. A copied world brings the consent of its original along: it keeps the
 * decision but gets a new id and starts without the original's counts. A record from before lib 4 adopts the folder.
 * @returns {boolean}   Whether this world is a copy
 */
function claimWorld(reg, consent) {
  const folder = String(game.world?.id ?? "");
  if ( !folder || (consent.world === folder) ) return false;
  const copied = !!consent.world;
  const next = {...consent, world: folder};
  if ( copied ) {
    next.id = randomId();
    run.id = next.id;
    debug("copied world, new id");
  }
  writeConsent(reg, next).catch(err => debug("could not bind the world id", err));
  return copied;
}

/** Nothing is recorded without consent: drop what was queued before the decision. */
function discard(reg) {
  reg.pending.length = 0;
  reg.errors.length = 0;
}

/**
 * Start counting on top of what this browser and the world already hold, so all GM browsers of a world count together.
 * @param {object} reg
 * @param {object} [options]
 * @param {boolean} [options.fresh]   A copied world: leave out the world state, it belongs to the original
 */
function beginRecording(reg, {fresh = false} = {}) {
  if ( run.recording ) return;
  run.recording = true;
  run.reg = reg;
  if ( fresh ) {
    run.skipWorld = true;
    clearWorldState(reg).finally(() => { run.skipWorld = false; });
  }
  run.state = mergeStates(loadState(), ...readWorldStates(reg));
  dayEntry(run.state, today()).s = 1;
  for ( const [method, args] of reg.pending.splice(0) ) safe(() => LIBRARY[method]?.(reg, ...args));
  processErrors(reg);
  globalThis.addEventListener?.("pagehide", () => safe(() => leave(reg)));
  run.tickTimer = setInterval(() => safe(() => tick(reg)), TIMING.tick);
  run.tickTimer?.unref?.();
  scheduleSave();
}

function stopRecording(reg) {
  run.recording = false;
  run.state = null;
  clearTimeout(run.sendTimer);
  clearTimeout(run.worldTimer);
  clearInterval(run.tickTimer);
  Object.assign(run, {sendTimer: null, worldTimer: null, tickTimer: null, worldSaved: null});
  storageRemove(stateKey());
  clearWorldState(reg).catch(err => debug("could not clear the world state", err));
}

/* -------------------------------------------- */
/*  Counting                                    */
/* -------------------------------------------- */

function count(reg, id, key, n) {
  if ( !run.recording ) return;
  const module = reg.modules.get(id);
  if ( !module ) return;
  const entry = moduleEntry(dayEntry(run.state, today()), id);
  entry.u = 1;
  if ( key !== null ) {
    if ( !module.features.has(key) ) return debug(`${id}: undeclared feature ${key}`);
    const amount = Number.isInteger(n) && (n > 0) ? n : 1;
    entry.f ??= {};
    entry.f[key] = Math.min((entry.f[key] ?? 0) + amount, 100_000);
  }
  scheduleSave();
}

function processErrors(reg) {
  if ( !run.recording ) return;
  const ids = new Set(reg.modules.keys());
  for ( const {stack, type} of reg.errors.splice(0) ) {
    const location = errorLocation(stack, ids);
    if ( !location ) continue;
    const entry = moduleEntry(dayEntry(run.state, today()), location.module);
    const key = `${location.at}|${/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(type) ? type : ""}`;
    entry.e ??= {};
    entry.e[key] = Math.min((entry.e[key] ?? 0) + 1, 10_000);
  }
  scheduleSave();
}

/**
 * The first stack frame inside a Sephral module: module id and "path:line" relative to the module folder. Host, user
 * folders (The Forge) and query strings are cut off.
 * @param {string} stack
 * @param {Set<string>} ids    Module ids to attribute to
 * @returns {{module: string, at: string}|null}
 */
export function errorLocation(stack, ids) {
  for ( const line of String(stack).split("\n") ) {
    const match = /\/modules\/(sephrals-[a-z0-9-]+)\/([A-Za-z0-9_./-]+?)(?:\?[^:\s)]*)?:(\d+)(?::\d+)?/.exec(line);
    if ( !match || !ids.has(match[1]) || match[2].includes("..") ) continue;
    return {module: match[1], at: `${match[2]}:${match[3]}`};
  }
  return null;
}

/* -------------------------------------------- */
/*  Asking and the settings panel               */
/* -------------------------------------------- */

async function ask(reg) {
  const consent = readConsent(reg);
  if ( consentAction(consent) !== "ask" ) return;
  await writeConsent(reg, {...consent, asked: (consent.asked ?? 0) + 1});
  const answer = await question(consent.answer === "yes");
  if ( answer ) await decide(reg, answer);
}

/**
 * The question with what is sent. Every way of turning the statistics on goes through it.
 * @param {boolean} renewal    The GM agreed to an older version
 * @returns {Promise<"yes"|"no"|null>}   null when closed without a choice
 */
async function question(renewal) {
  const answer = await foundry.applications.api.DialogV2.wait({
    window: {title: text("askTitle"), icon: "fa-solid fa-chart-simple"},
    position: {width: 540},
    content: askContent(renewal),
    buttons: [
      {action: "yes", label: text("yes"), icon: "fa-solid fa-check", default: true, callback: () => "yes"},
      {action: "no", label: text("no"), icon: "fa-solid fa-xmark", callback: () => "no"}
    ],
    // Unfolding the full list makes the window taller: move it so the buttons stay on screen
    render: (event, dialog) => safe(() => dialog.element.querySelector("details")?.addEventListener("toggle",
      () => safe(() => dialog.setPosition({height: "auto"})))),
    rejectClose: false
  });
  return (answer === "yes") || (answer === "no") ? answer : null;
}

/** Store the decision in every module. Only the active GM's browser records and sends. */
async function decide(reg, answer) {
  const consent = readConsent(reg);
  const folder = String(game.world?.id ?? "");
  const ownId = !consent.world || (consent.world === folder) ? consent.id : null;
  const next = {answer, version: CONSENT_VERSION, decidedAt: Date.now(), asked: consent.asked ?? 0,
    id: answer === "yes" ? (ownId ?? randomId()) : null, world: folder};
  run.id = null;
  await writeConsent(reg, next);
  if ( answer !== "yes" ) return stopRecording(reg);
  if ( !game.user?.isActiveGM || optOutReason() ) return;
  beginRecording(reg);
  planPing(reg);
}

/** Turn on (after the question) or off. */
async function turn(reg, on) {
  const answer = on ? await question(readConsent(reg).answer === "yes") : "no";
  if ( answer ) await decide(reg, answer);
}

/**
 * The switch in the settings of every registered module, above its menu button. It shows whether the world sends and
 * acts at once for all Sephral modules; it is no setting of its own, so the form's Save never touches it.
 */
function decorateSettings(reg, html) {
  if ( !game.user?.isGM ) return;
  const root = html?.querySelector ? html : html?.[0];
  if ( !root?.querySelector ) return;
  const reason = optOutReason();
  const inputs = [];
  const sync = () => {
    const on = !reason && (consentAction(readConsent(reg)) === "send");
    for ( const input of inputs ) input.checked = on;
  };
  for ( const id of reg.modules.keys() ) {
    const menu = root.querySelector(`[data-key="${id}.usageMenu"]`)?.closest(".form-group");
    if ( !menu || menu.previousElementSibling?.dataset?.sephralUsage ) continue;
    const group = document.createElement("div");
    group.className = "form-group";
    group.dataset.sephralUsage = id;
    const label = document.createElement("label");
    label.htmlFor = `sephral-usage-${id}`;
    label.textContent = text("toggleName");
    const fields = document.createElement("div");
    fields.className = "form-fields";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.id = `sephral-usage-${id}`;
    input.disabled = !!reason;
    input.addEventListener("change", event => {
      event.stopPropagation();
      turn(reg, input.checked).catch(err => debug("switch failed", err)).finally(sync);
    });
    fields.append(input);
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = reason ? text(`optout_${reason}`) : text("toggleHint");
    group.append(label, fields, hint);
    menu.before(group);
    inputs.push(input);
  }
  sync();
}

async function openPanel(reg) {
  try {
    const reason = optOutReason();
    const consent = readConsent(reg);
    const on = consentAction(consent) === "send";
    const payload = buildPayload(reg, run.state ?? emptyState(), consent.id ?? "00000000-0000-0000-0000-000000000000");
    const status = reason ? text(`optout_${reason}`) : text(on ? "statusOn" : "statusOff");
    const content = `<p>${escape(status)}</p>`
      + (consent.id && on ? `<p>${escape(text("worldId"))} <code>${escape(consent.id)}</code></p>` : "")
      + `<details><summary>${escape(text("preview"))}</summary><pre style="max-height:300px;overflow:auto;`
      + `user-select:text">${escape(JSON.stringify(payload, null, 2))}</pre></details>`;
    const buttons = [{action: "dismiss", label: text("close"), icon: "fa-solid fa-xmark", callback: () => null}];
    if ( !reason && game.user?.isGM ) {
      buttons.unshift(on
        ? {action: "off", label: text("turnOff"), icon: "fa-solid fa-toggle-off", callback: () => "no"}
        : {action: "on", label: text("turnOn"), icon: "fa-solid fa-toggle-on", callback: () => "yes"});
    }
    const answer = await foundry.applications.api.DialogV2.wait({
      window: {title: text("menuName"), icon: "fa-solid fa-chart-simple"},
      position: {width: 560}, content, buttons, rejectClose: false
    });
    if ( (answer === "yes") || (answer === "no") ) await turn(reg, answer === "yes");
  } catch (err) {
    debug("panel failed", err);
  }
}

/** The question: a short summary, everything that is sent to unfold below it. */
function askContent(renewal) {
  const list = (key, style = "") => `<ul${style}>${text(key).map(item => `<li>${escape(item)}</li>`).join("")}</ul>`;
  return `${renewal ? `<p><strong>${escape(text("renewal"))}</strong></p>` : ""}`
    + `<p>${escape(text("askIntro"))}</p>${list("shortList")}`
    + `<details><summary>${escape(text("detailsLabel"))}</summary>${list("sentList", " style=\"max-height:40vh;overflow-y:auto\"")}`
    + `<p>${escape(text("notSent"))}</p></details>`
    + `<p>${escape(text("askScope"))}</p>`;
}

/* -------------------------------------------- */
/*  Ping                                        */
/* -------------------------------------------- */

/**
 * Plan the ping of this session. Worlds often run only briefly, so a due ping must never depend on a long session:
 * - It waits lateDelay to cover the start of the session, but leaving the page sends it at once (leave).
 * - It goes out after pingDelay when the world never sent, or when an earlier session ended before its ping went out
 *   (the page was killed without pagehide). pendingSince marks that a ping is waiting.
 * - An open world checks every tick, for a new UTC day or after a pause.
 */
function planPing(reg) {
  const state = run.state;
  if ( !state || !isDue(state) || run.sendTimer ) return;
  const early = !state.attemptAt || !!state.pendingSince;
  if ( !early ) {
    state.pendingSince = Date.now();
    saveState();
  }
  const [min, max] = early ? TIMING.pingDelay : [TIMING.lateDelay, TIMING.lateDelay];
  run.sendTimer = setTimeout(() => {
    run.sendTimer = null;
    sendPing(reg).catch(err => debug("ping failed", err));
  }, min + (Math.random() * (max - min)));
  run.sendTimer?.unref?.();
}

function tick(reg) {
  if ( run.recording && !run.sendTimer && !run.sending ) sendPing(reg).catch(err => debug("ping failed", err));
}

/** Leaving the page: send a due ping with a request that outlives the page, and save. */
function leave(reg) {
  if ( !run.recording ) return;
  if ( !run.sending ) sendPing(reg, {keepalive: true}).catch(err => debug("ping failed", err));
  saveState({world: true});
}

/** No ping yet on this UTC day (or the pause after a failure is over), and the server did not stop this version. */
function isDue(state, now = Date.now()) {
  return ((state.stoppedLib ?? 0) < LIB_VERSION) && (now >= (state.nextTry ?? 0));
}

/**
 * Send the ping if it is due. Everything up to the request runs synchronously, so pagehide can still send it.
 * @param {object} reg
 * @param {object} [options]
 * @param {boolean} [options.keepalive]   The page is going away: nobody waits for the answer, it counts as delivered
 */
async function sendPing(reg, {keepalive = false} = {}) {
  if ( !run.state || !run.recording || run.sending ) return;
  // Another tab or GM browser may have sent since this page started
  run.state = mergeStates(run.state, loadState(), ...readWorldStates(reg));
  const now = Date.now();
  if ( (run.state.stoppedLib ?? 0) >= LIB_VERSION ) return debug("stopped by the server");
  if ( !isDue(run.state, now) ) return debug(`next ping after ${new Date(run.state.nextTry).toISOString()}`);
  const consent = readConsent(reg);
  const id = run.id ?? consent.id;
  if ( consentAction(consent) !== "send" || !id ) return;
  const payload = buildPayload(reg, run.state, id);
  const body = JSON.stringify(payload);
  debug("sending", payload);
  const request = {method: "POST", body, headers: {"Content-Type": "text/plain"}, credentials: "omit",
    referrerPolicy: "no-referrer", redirect: "error", cache: "no-store"};
  const endpoint = globalThis.SEPHRAL_USAGE_ENDPOINT || ENDPOINT;
  if ( keepalive ) {
    if ( body.length > KEEPALIVE_BYTES ) return;
    // Not sendBeacon: it would send the address of the Foundry server as referrer
    Promise.resolve(safe(() => fetch(endpoint, {...request, keepalive: true}))).catch(err => debug("ping not delivered", err));
    Object.assign(run.state, nextAttempt(run.state, {}, now));
    delete run.state.pendingSince;
    return;
  }
  run.sending = true;
  let answer = null;
  try {
    const signal = globalThis.AbortSignal?.timeout ? AbortSignal.timeout(TIMING.timeout) : undefined;
    const response = await fetch(endpoint, {...request, signal});
    if ( !response.ok ) throw new Error(`HTTP ${response.status}`);
    answer = await response.json().catch(() => ({}));
  } catch (err) {
    answer = null;
    debug("ping not delivered", err);
  } finally {
    run.sending = false;
  }
  if ( !run.state || !run.recording ) return;
  Object.assign(run.state, nextAttempt(run.state, answer, Date.now()));
  if ( answer !== null ) delete run.state.pendingSince;
  saveState({world: true});
}

/**
 * When to try again after a ping. The server can only stop this library version or change the interval within bounds.
 * A daily or shorter interval ends at the next UTC midnight: at most one ping a day, as the question says, but a group
 * that starts at the same hour every day is never a few minutes too early. After a failure the pause grows from one
 * hour to 30 days. Other answer fields are ignored, so the server may add some without breaking released copies.
 * @param {object} state                  Browser state (failures)
 * @param {object|null} answer            Parsed server answer, null after a failure
 * @param {number} now
 * @returns {{nextTry: number, failures: number, attemptAt: number, stoppedLib?: number}}
 */
export function nextAttempt(state, answer, now) {
  if ( answer === null ) {
    const failures = Math.min((state.failures ?? 0) + 1, 7);
    const pause = failures === 1 ? HOUR_MS : Math.min(2 ** (failures - 2), 30) * DAY_MS;
    return {failures, nextTry: now + pause, attemptAt: now};
  }
  if ( answer.stop === true ) return {failures: 0, nextTry: now + (30 * DAY_MS), stoppedLib: LIB_VERSION, attemptAt: now};
  const seconds = Number(answer.next);
  const interval = Number.isFinite(seconds) ? Math.min(Math.max(seconds, HOUR_S), 90 * 86_400) : 86_400;
  return {failures: 0, nextTry: interval <= 86_400 ? nextMidnight(now) : now + (interval * 1000), attemptAt: now};
}

/** Start of the next UTC day. */
function nextMidnight(now) {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
}

/**
 * The ping: world facts and, per installed Sephral module, version, state and the usage of the last 30 days.
 * @returns {object}
 */
export function buildPayload(reg, state, id) {
  const days = recentDays(state);
  const modules = [];
  for ( const module of game.modules ) {
    if ( !module.id?.startsWith("sephrals-") || (module.id === OPTOUT_MODULE) ) continue;
    const entry = {id: module.id, v: String(module.version ?? ""), active: !!module.active};
    const registered = reg.modules.get(module.id);
    if ( module.active && registered ) Object.assign(entry, moduleUsage(days, registered));
    modules.push(entry);
  }
  return {
    v: FORMAT_VERSION,
    lib: LIB_VERSION,
    id,
    core: String(game.version ?? ""),
    system: String(game.system?.id ?? ""),
    systemVersion: String(game.system?.version ?? ""),
    lang: String(game.i18n?.lang ?? ""),
    host: /(^|\.)forge-vtt\.com$/i.test(globalThis.location?.hostname ?? "") ? "forge" : "other",
    browser: browserFamily(globalThis.navigator?.userAgent ?? ""),
    sessions: days.filter(entry => entry.s).length,
    moduleCount: game.modules.filter(m => m.active).length,
    integrations: INTEGRATIONS.filter(name => game.modules.get(name)?.active),
    modules
  };
}

function moduleUsage(days, registered) {
  const features = {};
  const errors = {};
  let used = 0;
  for ( const day of days ) {
    const entry = day.m?.[registered.id];
    if ( !entry ) continue;
    if ( entry.u ) used++;
    for ( const [key, n] of Object.entries(entry.f ?? {}) ) features[key] = (features[key] ?? 0) + n;
    for ( const [key, n] of Object.entries(entry.e ?? {}) ) errors[key] = (errors[key] ?? 0) + n;
  }
  const settings = {};
  for ( const key of registered.settings ) {
    const value = safe(() => game.settings.get(registered.id, key));
    if ( (typeof value === "boolean") || Number.isInteger(value) ) settings[key] = value;
    else if ( (typeof value === "string") && /^[A-Za-z0-9_.-]{1,24}$/.test(value) ) settings[key] = value;
  }
  return {
    days: used,
    features,
    settings,
    errors: Object.entries(errors).sort((a, b) => b[1] - a[1]).slice(0, MAX_ERRORS).map(([key, n]) => {
      const [at, type] = key.split("|");
      return {at, type, n: Math.min(n, 10_000)};
    })
  };
}

/**
 * Coarse browser family, nothing finer.
 * @param {string} agent
 * @returns {"electron"|"firefox"|"chromium"|"safari"|"other"}
 */
export function browserFamily(agent) {
  if ( /Electron\//.test(agent) ) return "electron";
  if ( /Firefox\//.test(agent) ) return "firefox";
  if ( /(Chrome|Chromium|Edg)\//.test(agent) ) return "chromium";
  if ( /Safari\//.test(agent) ) return "safari";
  return "other";
}

/* -------------------------------------------- */
/*  Browser state                               */
/* -------------------------------------------- */

function stateKey() {
  return `${STATE_KEY}.${globalThis.game?.world?.id ?? "world"}`;
}

function emptyState() {
  return {v: STATE_VERSION, days: {}, nextTry: 0, failures: 0, stoppedLib: 0};
}

/**
 * Read the state of this world from localStorage. Unknown layouts start fresh, old days are dropped.
 * @returns {object}
 */
function loadState() {
  let state = null;
  try {
    state = JSON.parse(storageGet(stateKey()) ?? "null");
  } catch {
    state = null;
  }
  state = migrateState(state);
  pruneDays(state, today());
  return state;
}

/**
 * Bring a stored state to STATE_VERSION. Add a step here when the layout changes. The top-level fields nextTry and
 * failures keep their meaning in every layout: a state from a newer copy (its module was disabled or downgraded) loses
 * its days but keeps the pause.
 * @param {object|null} state
 * @returns {object}
 */
export function migrateState(state) {
  if ( !state || (typeof state !== "object") || (typeof state.v !== "number") ) return emptyState();
  if ( state.v > STATE_VERSION ) {
    const fresh = emptyState();
    if ( Number.isFinite(state.nextTry) ) fresh.nextTry = state.nextTry;
    if ( Number.isInteger(state.failures) ) fresh.failures = Math.min(Math.max(state.failures, 0), 7);
    return fresh;
  }
  // Future steps: if ( state.v === 1 ) { ...; state.v = 2; }
  return {...emptyState(), ...state, days: state.days && typeof state.days === "object" ? state.days : {}};
}

/** Keep only the last WINDOW_DAYS days. */
export function pruneDays(state, day) {
  const oldest = shiftDay(day, -(WINDOW_DAYS - 1));
  for ( const key of Object.keys(state.days) ) if ( !/^\d{4}-\d{2}-\d{2}$/.test(key) || (key < oldest) ) delete state.days[key];
}

function recentDays(state) {
  const oldest = shiftDay(today(), -(WINDOW_DAYS - 1));
  return Object.entries(state.days ?? {}).filter(([key]) => key >= oldest).map(([, entry]) => entry);
}

function dayEntry(state, day) {
  return state.days[day] ??= {};
}

function moduleEntry(day, id) {
  day.m ??= {};
  return day.m[id] ??= {};
}

function scheduleSave() {
  if ( run.saveTimer ) return;
  run.saveTimer = setTimeout(() => {
    run.saveTimer = null;
    saveState();
  }, TIMING.saveDelay);
}

/**
 * Save to localStorage, and to the world: at once after a ping, otherwise at most every worldSaveDelay. Leaving the
 * page tries a last write, but that one rarely arrives.
 * @param {object} [options]
 * @param {boolean} [options.world]   Write the world state now
 */
function saveState({world = false} = {}) {
  if ( !run.state || !run.recording ) return;
  pruneDays(run.state, today());
  storageSet(stateKey(), JSON.stringify(run.state));
  if ( world ) saveWorldState(run.reg);
  else if ( !run.worldTimer ) {
    run.worldTimer = setTimeout(() => {
      run.worldTimer = null;
      saveWorldState(run.reg);
    }, Math.max(0, run.worldSavedAt + TIMING.worldSaveDelay - Date.now()));
    run.worldTimer?.unref?.();
  }
}

/**
 * Combine the states of several browsers and of the world. Counts keep the higher value: every browser counts on top of
 * what it merged at its start, so the higher count already contains the lower one. Pause and failures come from the
 * latest attempt. A waiting ping (pendingSince) only counts when no attempt came after it.
 * @param {...object} states
 * @returns {object}
 */
export function mergeStates(...states) {
  const merged = emptyState();
  let latest = null;
  const waiting = [];
  for ( const state of states.map(migrateState) ) {
    for ( const [day, entry] of Object.entries(state.days) ) {
      if ( entry && (typeof entry === "object") ) mergeDay(merged.days[day] ??= {}, entry);
    }
    merged.stoppedLib = Math.max(merged.stoppedLib, Number(state.stoppedLib) || 0);
    if ( Number.isFinite(state.pendingSince) ) waiting.push(state.pendingSince);
    const at = Number(state.attemptAt) || 0;
    const best = Number(latest?.attemptAt) || 0;
    if ( !latest || (at > best) || ((at === best) && ((state.nextTry ?? 0) > (latest.nextTry ?? 0))) ) latest = state;
  }
  if ( latest ) {
    merged.nextTry = Number(latest.nextTry) || 0;
    merged.failures = Number(latest.failures) || 0;
    if ( latest.attemptAt ) merged.attemptAt = latest.attemptAt;
  }
  const since = Math.min(...waiting);
  if ( waiting.length && (since > (merged.attemptAt ?? 0)) ) merged.pendingSince = since;
  return merged;
}

function mergeDay(target, entry) {
  if ( entry.s ) target.s = 1;
  for ( const [id, module] of Object.entries(entry.m ?? {}) ) {
    if ( !module || (typeof module !== "object") ) continue;
    target.m ??= {};
    const into = target.m[id] ??= {};
    if ( module.u ) into.u = 1;
    for ( const field of ["f", "e"] ) {
      for ( const [key, n] of Object.entries(module[field] ?? {}) ) {
        if ( !Number.isFinite(n) ) continue;
        into[field] ??= {};
        into[field][key] = Math.max(into[field][key] ?? 0, n);
      }
    }
  }
}

/* -------------------------------------------- */
/*  World state                                 */
/* -------------------------------------------- */

/** Modules whose copy registers the world state setting, sorted. The first one holds the state. */
function stateModules(reg) {
  return [...(reg?.modules?.values() ?? [])].filter(module => (module.lib ?? 0) >= WORLD_STATE_LIB)
    .map(module => module.id).sort();
}

/** The states stored in the world. Every module that ever held it is read, so a change of the first module loses nothing. */
function readWorldStates(reg) {
  if ( run.skipWorld ) return [];
  return stateModules(reg).map(id => safe(() => game.settings.get(id, STATE_SETTING)))
    .filter(value => value && (typeof value === "object") && (typeof value.v === "number"));
}

/** Only the active GM writes, only when the state changed, and never in a way that could disturb the module. */
function saveWorldState(reg) {
  if ( !run.state || !run.recording || run.skipWorld || !game.user?.isActiveGM ) return;
  const [home] = stateModules(reg);
  if ( !home ) return;
  run.worldSavedAt = Date.now();
  const value = JSON.stringify(run.state);
  if ( value === run.worldSaved ) return;
  run.worldSaved = value;
  Promise.resolve(safe(() => game.settings.set(home, STATE_SETTING, JSON.parse(value))))
    .catch(err => debug("could not store the world state", err));
}

/**
 * Empty the world state in every module that holds one: after turning the statistics off, and in a copied world.
 * @returns {Promise<void>}
 */
async function clearWorldState(reg) {
  if ( !game.user?.isGM ) return;
  for ( const id of stateModules(reg) ) {
    try {
      const value = game.settings.get(id, STATE_SETTING);
      if ( value && (typeof value === "object") && Object.keys(value).length ) await game.settings.set(id, STATE_SETTING, {});
    } catch (err) {
      debug(`could not clear the world state of ${id}`, err);
    }
  }
}

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

/** A random UUID v4. crypto.randomUUID only exists on HTTPS pages, many Foundry servers run on plain HTTP. */
function randomId() {
  if ( typeof globalThis.crypto?.randomUUID === "function" ) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function shiftDay(day, days) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function storageGet(key) {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Private windows and full storage: counting simply stops
  }
}

function storageRemove(key) {
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    // Ignore
  }
}

/** Call into another copy: never throws, and a returned promise never rejects unhandled. */
function quiet(fn) {
  try {
    const result = fn();
    if ( typeof result?.catch === "function" ) result.catch(err => debug("error", err));
  } catch (err) {
    debug("error", err);
  }
}

function safe(fn) {
  try {
    return fn();
  } catch (err) {
    debug("error", err);
    return undefined;
  }
}

function debug(...args) {
  if ( storageGet(DEBUG_KEY) === "1" ) console.debug("Sephral usage |", ...args);
}

function escape(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;",
    "'": "&#39;"})[char]);
}

/* -------------------------------------------- */
/*  Texts                                       */
/* -------------------------------------------- */

/*
 * Written by the module author (2026-10-25). User-facing text must be human-authored (Foundry AI Content Policy 4.1). The texts live here instead of the lang files so that one file serves
 * every module.
 */
const TEXT = {
  en: {
    menuName: "Usage statistics",
    menuLabel: "Manage statistics",
    menuHint: "See which usage data is shared and enable or disable statistics for all of Sephral’s modules in this world.",
    toggleName: "Share usage statistics",
    toggleHint: "This setting applies to all of Sephral’s modules in this world.",
    askTitle: "Help improve Sephral’s modules?",
    askIntro: "A small pseudonymous report once a day, without names, chats or anything from your world:",
    shortList: [
      "Foundry, system and module versions",
      "which features are used and how often",
      "where errors occur in the module code"
    ],
    detailsLabel: "Show all details",
    sentList: [
      "Foundry version, game system and version, and world language",
      "Whether the world is hosted on The Forge and which browser family the GM uses (Chrome/Edge, Firefox, Safari, or Foundry app)",
      "Which of Sephral’s modules are installed, their versions, and whether they are enabled",
      "For each enabled module: days used in the last 30 days, feature usage counts, and selected settings (e.g. theme)",
      "Errors in module code, including source file, line number, error type, and count, but never error messages",
      "How many of the last 30 days the GM opened Foundry and the total number of active modules (count only)",
      "Whether these third-party modules are active: Dice So Nice, Ember, Item Piles, libWrapper, Midi QoL, Ready Set Roll, Seasons & Stars, socketlib, and Tidy 5e Sheet",
      "A randomly generated, persistent world ID to associate reports with the same world and allow deletion on request"
    ],
    notSent: "No world, player, scene, actor, or user file names, chat messages, notes, dice rolls, player counts, or server addresses are sent. The IP address is technically received by the server but is not stored.",
    askScope: "Applies to all of Sephral’s modules in this world and can be changed any time in the settings.",
    renewal: "The usage report now includes additional information. Please choose again whether you want to share it.",
    yes: "Yes, share",
    no: "No, thanks",
    statusOn: "Usage statistics are enabled for this world.",
    statusOff: "Usage statistics are disabled for this world.",
    optout_module: "Sending usage data is disabled on this server.",
    optout_browser: "Sending usage data is disabled in this browser.",
    worldId: "World ID for deletion requests:",
    preview: "Preview usage report",
    turnOn: "Enable statistics",
    turnOff: "Disable statistics",
    close: "Close"
  },
  de: {
    menuName: "Nutzungsstatistik",
    menuLabel: "Statistik verwalten",
    menuHint: "Hier kannst du sehen, welche Nutzungsdaten übermittelt werden, und die Statistik für alle Sephral’s Module dieser Welt ein- oder ausschalten.",
    toggleName: "Nutzungsstatistik teilen",
    toggleHint: "Diese Einstellung gilt für alle Sephral’s Module in dieser Welt.",
    askTitle: "Hilfst du, Sephral’s Module zu verbessern?",
    askIntro: "Einmal am Tag ein kleiner pseudonymer Bericht, ohne Namen, Chats oder Inhalte deiner Welt:",
    shortList: [
      "Versionen von Foundry, System und Modulen",
      "welche Funktionen wie oft genutzt werden",
      "Fehlerstellen im Modulcode"
    ],
    detailsLabel: "Alle Angaben anzeigen",
    sentList: [
      "Foundry-Version, Spielsystem mit Version und Sprache der Welt",
      "Ob die Welt auf The Forge läuft und welche Browser-Familie die SL verwendet (Chrome/Edge, Firefox, Safari oder Foundry-App)",
      "Welche Sephral’s Module installiert sind, ihre Versionen und ob sie aktiviert sind",
      "Je aktiviertem Modul: Nutzungstage der letzten 30 Tage, Häufigkeit einzelner Funktionen und ausgewählte Einstellungen (z. B. Theme)",
      "Fehler im Modulcode mit Quelldatei, Zeilennummer, Fehlertyp und Anzahl, aber ohne Fehlermeldungen",
      "An wie vielen der letzten 30 Tage die SL Foundry geöffnet hatte und wie viele Module insgesamt aktiv sind (nur die Anzahl)",
      "Ob diese Fremdmodule aktiv sind: Dice So Nice, Ember, Item Piles, libWrapper, Midi QoL, Ready Set Roll, Seasons & Stars, socketlib und Tidy 5e Sheet",
      "Eine zufällig erzeugte, gleichbleibende Welt-ID, um Berichte derselben Welt zuzuordnen und auf Wunsch löschen zu können"
    ],
    notSent: "Nicht gesendet werden Namen von Welten, Spielern, Szenen, Akteuren oder eigenen Dateien, Chats, Notizen, Würfelergebnisse, Spielerzahlen oder die Serveradresse. Die IP-Adresse wird beim Empfang technisch übermittelt, aber nicht gespeichert.",
    askScope: "Gilt für alle Sephral’s Module dieser Welt und lässt sich jederzeit in den Einstellungen ändern.",
    renewal: "Der Nutzungsbericht enthält jetzt zusätzliche Angaben. Bitte entscheide erneut, ob du ihn teilen möchtest.",
    yes: "Ja, senden",
    no: "Nein, danke",
    statusOn: "Die Nutzungsstatistik ist für diese Welt aktiviert.",
    statusOff: "Die Nutzungsstatistik ist für diese Welt deaktiviert.",
    optout_module: "Das Senden von Nutzungsdaten ist auf diesem Server deaktiviert.",
    optout_browser: "Das Senden von Nutzungsdaten ist in diesem Browser deaktiviert.",
    worldId: "Welt-ID für Löschanfragen:",
    preview: "Vorschau des Nutzungsberichts",
    turnOn: "Statistik aktivieren",
    turnOff: "Statistik deaktivieren",
    close: "Schließen"
  }
};

function text(key) {
  const lang = String(globalThis.game?.i18n?.lang ?? "en").startsWith("de") ? "de" : "en";
  return TEXT[lang][key] ?? TEXT.en[key] ?? key;
}

/* -------------------------------------------- */

/** Pure helpers and internals for the shared tests. Not part of the module API. */
export const __test__ = {TIMING, registry, run, consentAction, readConsent, optOutReason, start, sendPing, decide,
  ask, count, decorateSettings, LIBRARY, stateKey, loadState, emptyState, TEXT, ENDPOINT, OPTOUT_MODULE, INTEGRATIONS,
  randomId, tick, leave, isDue, nextMidnight, readWorldStates, STATE_SETTING};
