/**
 * Sephral usage statistics, shared by all Sephral modules.
 *
 * Source: FoundryVTT_Module/_shared/usage/usage.mjs in the foundry_development repo. Every module carries an identical
 * copy as scripts/usage.mjs. Never edit a copy: change the source, raise LIB_VERSION and run
 * `node FoundryVTT_Module/_tools/sync-shared.mjs`. Rules and versioning: FoundryVTT_Module/_shared/usage/README.md.
 *
 * Only the active GM's browser sends, at most once a day, one ping for all Sephral modules of the world, and only after
 * the GM agreed. Nothing here may disturb a module: every entry point catches its own errors, nothing is awaited by the
 * caller, and an unreachable server only costs one failed request followed by a growing pause.
 */

/* -------------------------------------------- */
/*  Versions                                    */
/* -------------------------------------------- */

/** Version of this file. Raise it with every change; the newest copy in a world runs for all modules. */
export const LIB_VERSION = 1;

/** Version of the ping format ("v"). Raise it only for breaking changes; the server keeps a parser per version. */
export const FORMAT_VERSION = 1;

/** Version of what the GM agreed to. Raise it when new kinds of data are sent; GMs who agreed are asked again. */
export const CONSENT_VERSION = 1;

/** Layout of the browser state. A different stored version is migrated or started fresh. */
const STATE_VERSION = 1;

/**
 * Whether this copy may run at all. Shipped switched off until the texts and the privacy notice are final: then nothing
 * is shown, asked, counted or sent. A later copy with ACTIVE true serves the modules of switched-off copies too.
 */
const ACTIVE = false;

/* -------------------------------------------- */
/*  Configuration                               */
/* -------------------------------------------- */

const ENDPOINT = "https://usage.nat20.party/v1/ping";
const PRIVACY_URL = "https://github.com/Sephral/Sephral/blob/main/PRIVACY.md";

/** Installed on the developer's own Foundry servers: nothing is asked, counted or sent there. */
const OPTOUT_MODULE = "sephrals-usage-optout";

/** The developer's own servers: never send from pages under this domain. */
const OPTOUT_HOST = /(^|\.)nat20\.party$/i;

/** localStorage switches of this browser. */
const OPTOUT_KEY = "sephral-usage-optout";
const DEBUG_KEY = "sephral-usage-debug";
const STATE_KEY = "sephral-usage";

/** Third-party modules a ping may name. Keep in sync with usage-server/modules.json. */
const INTEGRATIONS = ["dice-so-nice", "ember", "item-piles", "lib-wrapper", "midi-qol", "ready-set-roll-5e",
  "seasons-and-stars", "socketlib", "tidy5e-sheet"];

const WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;
const HOUR_S = 3600;
const MAX_ERRORS = 5;

/** Delays in ms. Tests set them to 0. */
const TIMING = {askDelay: 20_000, pingDelay: [60_000, 120_000], saveDelay: 3_000, timeout: 5_000};

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
 * - Error entries stay {stack, type}. The consent setting stays "usage" with {answer, version, id, decidedAt, asked}.
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
 * The hidden consent setting at init. The menu once the language is known, and only when a switched-on copy is in the
 * page; its texts come from the newest such copy.
 */
function registerSettings(id) {
  safe(() => game.settings.register(id, "usage", {scope: "world", config: false, type: Object, default: {}}));
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
  if ( OPTOUT_HOST.test(globalThis.location?.hostname ?? "") && !testOverride() ) return "host";
  if ( storageGet(OPTOUT_KEY) === "1" ) return "browser";
  return null;
}

/** Live tests may point the library at a local endpoint and ignore the developer opt-outs, never in production. */
function testOverride() {
  return !!globalThis.SEPHRAL_USAGE_ENDPOINT && !!globalThis.SEPHRAL_USAGE_IGNORE_OPTOUT;
}

/* -------------------------------------------- */
/*  Start                                       */
/* -------------------------------------------- */

const run = {state: null, saveTimer: null, recording: false};

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
    beginRecording(reg);
    schedulePing(reg);
  }
  else {
    discard(reg);
    if ( action === "off" ) stopRecording();
    if ( action === "ask" ) setTimeout(() => ask(reg).catch(err => debug("ask failed", err)), TIMING.askDelay);
  }
}

/** Nothing is recorded without consent: drop what was queued before the decision. */
function discard(reg) {
  reg.pending.length = 0;
  reg.errors.length = 0;
}

function beginRecording(reg) {
  if ( run.recording ) return;
  run.recording = true;
  run.state = loadState();
  dayEntry(run.state, today()).s = 1;
  for ( const [method, args] of reg.pending.splice(0) ) safe(() => LIBRARY[method]?.(reg, ...args));
  processErrors(reg);
  globalThis.addEventListener?.("pagehide", () => saveState());
  scheduleSave();
}

function stopRecording() {
  run.recording = false;
  run.state = null;
  storageRemove(stateKey());
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
    rejectClose: false
  });
  return (answer === "yes") || (answer === "no") ? answer : null;
}

/** Store the decision in every module. Only the active GM's browser records and sends. */
async function decide(reg, answer) {
  const consent = readConsent(reg);
  const next = {answer, version: CONSENT_VERSION, decidedAt: Date.now(), asked: consent.asked ?? 0,
    id: answer === "yes" ? (consent.id ?? crypto.randomUUID()) : null};
  await writeConsent(reg, next);
  if ( answer !== "yes" ) return stopRecording();
  if ( !game.user?.isActiveGM || optOutReason() ) return;
  beginRecording(reg);
  schedulePing(reg);
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
      + `<p><a href="${PRIVACY_URL}" target="_blank" rel="noopener">${escape(text("privacy"))}</a></p>`
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

function askContent(renewal) {
  const items = text("sentList").map(item => `<li>${escape(item)}</li>`).join("");
  return `${renewal ? `<p><strong>${escape(text("renewal"))}</strong></p>` : ""}`
    + `<p>${escape(text("askIntro"))}</p><ul>${items}</ul>`
    + `<p>${escape(text("notSent"))}</p>`
    + `<p>${escape(text("askScope"))} <a href="${PRIVACY_URL}" target="_blank" rel="noopener">${escape(text("privacy"))}</a></p>`;
}

/* -------------------------------------------- */
/*  Ping                                        */
/* -------------------------------------------- */

function schedulePing(reg) {
  const [min, max] = TIMING.pingDelay;
  setTimeout(() => sendPing(reg).catch(err => debug("ping failed", err)), min + (Math.random() * (max - min)));
}

async function sendPing(reg) {
  const state = run.state;
  if ( !state || !run.recording ) return;
  const now = Date.now();
  if ( (state.stoppedLib ?? 0) >= LIB_VERSION ) return debug("stopped by the server");
  if ( now < (state.nextTry ?? 0) ) return debug(`next ping after ${new Date(state.nextTry).toISOString()}`);
  const consent = readConsent(reg);
  if ( consentAction(consent) !== "send" || !consent.id ) return;
  const payload = buildPayload(reg, state, consent.id);
  debug("sending", payload);
  let answer = null;
  try {
    const signal = globalThis.AbortSignal?.timeout ? AbortSignal.timeout(TIMING.timeout) : undefined;
    const response = await fetch(globalThis.SEPHRAL_USAGE_ENDPOINT || ENDPOINT, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {"Content-Type": "text/plain"},
      credentials: "omit",
      referrerPolicy: "no-referrer",
      redirect: "error",
      cache: "no-store",
      signal
    });
    if ( !response.ok ) throw new Error(`HTTP ${response.status}`);
    answer = await response.json().catch(() => ({}));
  } catch (err) {
    answer = null;
    debug("ping not delivered", err);
  }
  Object.assign(state, nextAttempt(state, answer, Date.now()));
  saveState();
}

/**
 * When to try again after a ping. The server can only stop this library version or change the interval within bounds.
 * Other answer fields are ignored, so the server may add some without breaking released copies.
 * @param {object} state                  Browser state (failures)
 * @param {object|null} answer            Parsed server answer, null after a failure
 * @param {number} now
 * @returns {{nextTry: number, failures: number, stoppedLib?: number}}
 */
export function nextAttempt(state, answer, now) {
  if ( answer === null ) {
    const failures = Math.min((state.failures ?? 0) + 1, 5);
    return {failures, nextTry: now + (Math.min(2 ** failures, 30) * DAY_MS)};
  }
  if ( answer.stop === true ) return {failures: 0, nextTry: now + (30 * DAY_MS), stoppedLib: LIB_VERSION};
  const seconds = Number(answer.next);
  const interval = Number.isFinite(seconds) ? Math.min(Math.max(seconds, HOUR_S), 90 * 86_400) : 86_400;
  return {failures: 0, nextTry: now + (interval * 1000)};
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
    if ( Number.isInteger(state.failures) ) fresh.failures = Math.min(Math.max(state.failures, 0), 5);
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

function saveState() {
  if ( !run.state || !run.recording ) return;
  pruneDays(run.state, today());
  storageSet(stateKey(), JSON.stringify(run.state));
}

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

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
 * Written by the module author (FoundryVTT_Module/_shared/usage/texte-vorlage.md, 2026-10-25); user-facing text must be
 * human-authored (Foundry AI Content Policy 4.1). The texts live here instead of the lang files so that one file serves
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
    askIntro: "May Sephral’s modules send a pseudonymous usage report once a day? It includes the following information:",
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
    askScope: "Your choice applies to all of Sephral’s modules in this world and can be changed at any time in the module settings.",
    renewal: "The usage report now includes additional information. Please choose again whether you want to share it.",
    privacy: "Privacy notice",
    yes: "Yes, share",
    no: "No, thanks",
    statusOn: "Usage statistics are enabled for this world.",
    statusOff: "Usage statistics are disabled for this world.",
    optout_module: "Sending usage data is disabled on this server.",
    optout_host: "Sending usage data is disabled on this server.",
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
    askIntro: "Dürfen Sephral’s Module einmal täglich einen pseudonymen Nutzungsbericht senden? Er enthält folgende Angaben:",
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
    askScope: "Deine Entscheidung gilt für alle Sephral’s Module dieser Welt und kann jederzeit in den Moduleinstellungen geändert werden.",
    renewal: "Der Nutzungsbericht enthält jetzt zusätzliche Angaben. Bitte entscheide erneut, ob du ihn teilen möchtest.",
    privacy: "Datenschutzhinweis",
    yes: "Ja, senden",
    no: "Nein, danke",
    statusOn: "Die Nutzungsstatistik ist für diese Welt aktiviert.",
    statusOff: "Die Nutzungsstatistik ist für diese Welt deaktiviert.",
    optout_module: "Das Senden von Nutzungsdaten ist auf diesem Server deaktiviert.",
    optout_host: "Das Senden von Nutzungsdaten ist auf diesem Server deaktiviert.",
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
  ask, count, decorateSettings, LIBRARY, stateKey, loadState, emptyState, TEXT, ENDPOINT, OPTOUT_MODULE, INTEGRATIONS};
