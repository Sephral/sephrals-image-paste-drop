/**
 * The window "Sephral's Modules": every Sephral module in the world with its version, self test, settings, manual and
 * demo video, the debug file, and on request the other Sephral modules that fit the world.
 *
 * Every module carries an identical copy as scripts/hub.mjs next to scripts/debug-file.mjs. Never change one copy
 * alone: all copies stay the same. The copies share one registry on globalThis. The copy with the highest
 * HUB_LIB_VERSION draws the window, the copy with the newest CATALOG_REVISION lists the modules, so a module released
 * with an older copy keeps working and the list still shows modules that came out later. On a tie the copy loaded first
 * wins, whatever its age: once a copy is released, every change of the window raises HUB_LIB_VERSION and every change
 * of CATALOG or INTEGRATIONS raises CATALOG_REVISION. Modules without a copy (older releases) still appear, their self
 * test runs through api.runSelfTest. The debug file button uses scripts/debug-file.mjs beside this file.
 */

export const HUB_LIB_VERSION = 2;
export const CATALOG_REVISION = 2026103101;

const REGISTRY_KEY = "sephralsHub";
const WINDOW_ID = "sephrals-hub";
const STYLE_ID = "sephrals-hub-styles";
const PREFIX = "sephrals-";
/** Installed in the author's own test worlds only, it has nothing to show. */
const HIDDEN = ["sephrals-usage-optout"];
const GITHUB = "https://github.com/Sephral";
const DISCORD = "https://discord.gg/7BjCgDYaBP";
/** The README demo videos, played from GitHub only when the GM starts one. */
const VIDEO_BASE = "https://raw.githubusercontent.com/Sephral";
const VIDEO_WINDOW_ID = "sephrals-hub-video";
const PROBLEM_LIMIT = 5;

/* -------------------------------------------- */
/*  Catalog                                     */
/* -------------------------------------------- */

/**
 * The released modules. systems: only for these game systems. needs: a module that must be active. supports: game
 * systems with built in support. listed: has a package page on foundryvtt.com, otherwise the link goes to GitHub.
 * video: false keeps the README demo video (media/demo.mp4 on GitHub) out of the window, for videos with AI made images
 * (Foundry's AI content policy) or content we may not show inside a package. released: false has a repository but no
 * release yet: its row gets manual and video, More from Sephral leaves it out. core: the lowest Foundry generation.
 */
const CATALOG = [
  { id: "sephrals-campaign-album", title: "Campaign Album", listed: true, supports: ["crucible", "dnd5e"],
    text: { en: "Crits, fallen bosses and level ups, photographed on their own.",
      de: "Kritische Treffer, gefallene Bosse und Stufenaufstiege, ganz von selbst fotografiert." } },
  { id: "sephrals-combat-log-stats", title: "Combat Log & Stats", listed: true,
    text: { en: "Every fight recorded round by round, with stats and recaps for the table.",
      de: "Jeder Kampf Runde für Runde aufgezeichnet, mit Statistik und Rückblick für die Runde." } },
  { id: "sephrals-content-backup-restore", title: "Content Backup & Restore", listed: true,
    text: { en: "Back up scenes, actors and journals and bring them back with one click.",
      de: "Sichere Szenen, Akteure und Journale und hol sie mit einem Klick zurück." } },
  { id: "sephrals-crucible-combat-pulse", title: "Crucible Combat Pulse", listed: true, systems: ["crucible"],
    text: { en: "Shows the hidden pulse of a Crucible fight in the combat tracker.",
      de: "Zeigt im Kampftracker, was in einem Crucible-Kampf sonst verborgen bleibt." } },
  { id: "sephrals-crucible-sheet-quickbar", title: "Crucible Sheet & Quickbar", listed: true, systems: ["crucible"],
    text: { en: "A compact hero and adversary sheet with a combat quickbar.",
      de: "Ein kompakter Bogen für Helden und Gegner mit Kampfleiste." } },
  { id: "sephrals-handout-lens", title: "Handout Lens", listed: false, released: false,
    text: { en: "Zoom, pan and a reading lens for every picture you show your players.",
      de: "Zoomen, verschieben und eine Leselupe für jedes Bild, das du deinen Spielern zeigst." } },
  { id: "sephrals-file-commander", title: "File Commander", listed: true,
    text: { en: "A file manager with two panels for Foundry's storage.",
      de: "Ein Dateimanager mit zwei Fenstern für Foundrys Speicher." } },
  { id: "sephrals-image-paste-drop", title: "Image Paste & Drop", listed: true,
    text: { en: "Paste or drop an image and turn it into a scene, tile or journal page.",
      de: "Füg ein Bild ein oder zieh es herein und mach daraus eine Szene, ein Tile oder eine Journalseite." } },
  { id: "sephrals-loot-ledger", title: "Loot Ledger", listed: true, supports: ["crucible", "dnd5e"],
    text: { en: "A shared party inventory with a fair loot table and an open log.",
      de: "Ein gemeinsames Gruppeninventar mit fairer Beuteverteilung und offenem Protokoll." } },
  { id: "sephrals-lunar-almanac", title: "Lunar Almanac", listed: true, needs: "ember",
    text: { en: "Ember's moons and inner realms with their phases at a glance.",
      de: "Embers Monde und innere Reiche mit ihren Phasen auf einen Blick." } },
  { id: "sephrals-map-knowledge", title: "Map Knowledge", listed: false, released: false, core: 14,
    text: { en: "Reveal parts of the map to your players, right in Foundry's own fog of war.",
      de: "Deck Teile der Karte für deine Spieler auf, direkt in Foundrys eigenem Nebel des Krieges." } },
  { id: "sephrals-module-loadouts", title: "Module Loadouts", listed: true,
    text: { en: "Save your active modules as loadouts and switch with one click.",
      de: "Speichere deine aktiven Module als Loadouts und wechsle mit einem Klick." } },
  { id: "sephrals-performance-doctor", title: "Performance Doctor", listed: false,
    text: { en: "Finds out why Foundry runs slowly and helps fix it.",
      de: "Findet heraus, warum Foundry langsam läuft, und hilft beim Beheben." } },
  { id: "sephrals-player-notes", title: "Player Notes", listed: true,
    text: { en: "Private GM notes on every player character.",
      de: "Private Notizen der SL zu jedem Spielercharakter." } },
  { id: "sephrals-roll-breakdown", title: "Roll Breakdown", listed: true,
    text: { en: "Shows where every number of a roll comes from, right on the chat card.",
      de: "Zeigt direkt auf der Chatkarte, woher jede Zahl eines Wurfs kommt." } },
  { id: "sephrals-roll-requests", title: "Roll Requests", listed: false, supports: ["crucible", "dnd5e", "pf2e", "swade"],
    text: { en: "Ask any group for a check or save and get one live result card.",
      de: "Fordere Proben oder Rettungswürfe an und bekomm eine einzige Ergebniskarte." } },
  { id: "sephrals-roll-triggers", title: "Roll Triggers", listed: true,
    text: { en: "Natural 20s, fumbles and doubles set off your house rules.",
      de: "Natürliche 20, Patzer und Paschs lösen eure Hausregeln aus." } },
  { id: "sephrals-saved-encounters", title: "Saved Encounters", listed: false,
    text: { en: "Save monsters as an encounter and place the whole group again with one click.",
      de: "Speichere Monster als Begegnung und stell die ganze Gruppe mit einem Klick wieder auf." } },
  { id: "sephrals-table-compass", title: "Table Compass", listed: true,
    text: { en: "Anonymous feedback from your players on pace and tension.",
      de: "Anonyme Rückmeldung deiner Spieler zu Tempo und Spannung." } },
  { id: "sephrals-tavern-games", title: "Tavern Games", listed: true,
    text: { en: "Dice, card and board games for the tavern table.",
      de: "Würfel, Karten und Brettspiele für den Tavernentisch." } },
  { id: "sephrals-token-tooltips", title: "Token Tooltips", listed: false, supports: ["crucible", "dnd5e", "pf2e", "swade"],
    text: { en: "Health, armor and conditions when you hover over a token.",
      de: "Leben, Rüstung und Zustände, sobald du über ein Token fährst." } },
  { id: "sephrals-vista-portrait-switcher", title: "Vista Portrait Switcher", listed: true, needs: "ember",
    text: { en: "Switch the portraits NPCs show in Ember's Vista scenes.",
      de: "Wechsle die Porträts, die NSC in Embers Vista-Szenen zeigen." } }
];

/** Modules that use each other: module gains something in a world where with is active. */
const INTEGRATIONS = [
  { module: "sephrals-loot-ledger", with: "sephrals-saved-encounters",
    text: { en: "Saved Encounters rolls its loot tables into Loot Ledger, where your players claim the items.",
      de: "Saved Encounters würfelt seine Beutetabellen in den Loot Ledger, dort beanspruchen deine Spieler die Gegenstände." } },
  { module: "sephrals-saved-encounters", with: "sephrals-loot-ledger",
    text: { en: "Place a saved group with one click and roll its loot straight into Loot Ledger.",
      de: "Stell eine gespeicherte Gruppe mit einem Klick auf und würfle ihre Beute direkt in den Loot Ledger." } },
  { module: "sephrals-module-loadouts", with: "sephrals-performance-doctor",
    text: { en: "Performance Doctor tests the world without slow modules and Loadouts brings them back with one click.",
      de: "Performance Doctor testet die Welt ohne langsame Module, Loadouts holt sie mit einem Klick zurück." } },
  { module: "sephrals-performance-doctor", with: "sephrals-module-loadouts",
    text: { en: "Finds the modules that slow Foundry down and tests the world without them through your loadouts.",
      de: "Findet die Module, die Foundry bremsen, und testet die Welt über deine Loadouts ohne sie." } },
  { module: "sephrals-combat-log-stats", with: "sephrals-campaign-album",
    text: { en: "Adds the combat totals of each game night to its album page.",
      de: "Ergänzt jede Albumseite um die Kampfbilanz des Spielabends." } },
  { module: "sephrals-campaign-album", with: "sephrals-combat-log-stats",
    text: { en: "Turns your game nights into an album, with the night's combat totals on every page.",
      de: "Macht aus euren Spielabenden ein Album, mit der Kampfbilanz des Abends auf jeder Seite." } }
];

/* -------------------------------------------- */
/*  Texts                                       */
/* -------------------------------------------- */

const TEXTS = {
  en: {
    title: "Sephral’s Modules",
    menuName: "Sephral’s Modules",
    menuLabel: "Open",
    menuHint: "Self tests, settings and manuals of all Sephral modules in this world, and other modules that fit it.",
    heading: "Your modules in this world",
    summary: "{installed} installed, {active} active",
    runAll: "Run all self tests",
    debugFile: "Save debug file",
    inWorld: "In this world",
    inWorldHint: "Settings, manual, demo video and self test for each module",
    active: "Active",
    off: "Off",
    testOk: "Self test passed",
    testOkChecks: "Self test passed, {checks} checks",
    testProblem: "Self test found 1 problem",
    testProblems: "Self test found {count} problems",
    testRunning: "Self test running",
    testNone: "Self test not run yet",
    testError: "The self test could not run: {error}",
    testMissing: "This version has no self test",
    moreProblems: "and {count} more",
    offNote: "Installed, not active in this world",
    offMissing: "Installed, not active. It needs {missing}, which is not installed.",
    newer: "Newer than tested: {list}. Run the self tests of these modules once.",
    selfTest: "Run the self test",
    settings: "Settings",
    manual: "Manual",
    video: "Demo video",
    watchVideo: "Watch the video",
    videoTitle: "{title}: demo video",
    videoSource: "The video plays from the module page on GitHub.",
    videoError: "The video could not be loaded.",
    enable: "Enable",
    enableTitle: "Enable {title}",
    enableText: "Enable {title} in this world? Foundry then reloads the world for everyone.",
    enableMissing: "{title} needs {missing}, which is not installed.",
    more: "More from Sephral",
    moreHint: "Only the GM sees this list.",
    moreCount: "{count} more modules fit this world.",
    moreOne: "1 more module fits this world.",
    moreNone: "You already have every module that fits this world.",
    show: "Show",
    hide: "Hide",
    worksWith: "Works with your modules",
    fits: "fits {title}",
    madeFor: "Made for this world",
    builtIn: "Built in support for {system}",
    everySystem: "For every system",
    hidden: "{count} modules for other systems or settings are hidden.",
    hiddenOne: "1 module for another system or setting is hidden.",
    packagePage: "Package page",
    github: "On GitHub",
    allModules: "All modules on GitHub",
    discord: "Discord",
    gmOnly: "Only a GM can open Sephral’s Modules."
  },
  de: {
    title: "Sephral’s Module",
    menuName: "Sephral’s Module",
    menuLabel: "Öffnen",
    menuHint: "Selbsttests, Einstellungen und Handbücher aller Module von Sephral in dieser Welt, dazu weitere Module, die zu ihr passen.",
    heading: "Deine Module in dieser Welt",
    summary: "{installed} installiert, {active} aktiv",
    runAll: "Alle Selbsttests starten",
    debugFile: "Debug-Datei speichern",
    inWorld: "In dieser Welt",
    inWorldHint: "Einstellungen, Handbuch, Demo-Video und Selbsttest für jedes Modul",
    active: "Aktiv",
    off: "Aus",
    testOk: "Selbsttest bestanden",
    testOkChecks: "Selbsttest bestanden, {checks} Prüfungen",
    testProblem: "Selbsttest fand 1 Problem",
    testProblems: "Selbsttest fand {count} Probleme",
    testRunning: "Selbsttest läuft",
    testNone: "Selbsttest noch nicht gestartet",
    testError: "Der Selbsttest konnte nicht laufen: {error}",
    testMissing: "Diese Version hat keinen Selbsttest",
    moreProblems: "und {count} weitere",
    offNote: "Installiert, in dieser Welt nicht aktiv",
    offMissing: "Installiert, nicht aktiv. Es braucht {missing}, das ist nicht installiert.",
    newer: "Neuer als getestet: {list}. Starte die Selbsttests dieser Module einmal.",
    selfTest: "Selbsttest starten",
    settings: "Einstellungen",
    manual: "Handbuch",
    video: "Demo-Video",
    watchVideo: "Video ansehen",
    videoTitle: "{title}: Demo-Video",
    videoSource: "Das Video läuft von der Seite des Moduls auf GitHub.",
    videoError: "Das Video konnte nicht geladen werden.",
    enable: "Aktivieren",
    enableTitle: "{title} aktivieren",
    enableText: "{title} in dieser Welt aktivieren? Foundry lädt die Welt danach für alle neu.",
    enableMissing: "{title} braucht {missing}, das ist nicht installiert.",
    more: "Mehr von Sephral",
    moreHint: "Nur die SL sieht diese Liste.",
    moreCount: "{count} weitere Module passen zu dieser Welt.",
    moreOne: "1 weiteres Modul passt zu dieser Welt.",
    moreNone: "Du hast schon alle Module, die zu dieser Welt passen.",
    show: "Zeigen",
    hide: "Ausblenden",
    worksWith: "Arbeitet mit deinen Modulen",
    fits: "passt zu {title}",
    madeFor: "Für diese Welt gemacht",
    builtIn: "Eingebaute Unterstützung für {system}",
    everySystem: "Für jedes System",
    hidden: "{count} Module für andere Systeme oder Settings sind ausgeblendet.",
    hiddenOne: "1 Modul für ein anderes System oder Setting ist ausgeblendet.",
    packagePage: "Paketseite",
    github: "Auf GitHub",
    allModules: "Alle Module auf GitHub",
    discord: "Discord",
    gmOnly: "Nur eine SL kann Sephral’s Module öffnen."
  }
};

/** "de" for German Foundry, English otherwise. */
export function language() {
  return globalThis.game?.i18n?.lang === "de" ? "de" : "en";
}

/**
 * A text of the window.
 * @param {string} key
 * @param {object} [data]
 * @returns {string}
 */
export function text(key, data = {}) {
  const source = TEXTS[language()]?.[key] ?? TEXTS.en[key] ?? key;
  return source.replace(/\{(\w+)\}/g, (match, name) => (name in data ? String(data[name]) : match));
}

function localized(texts) {
  return texts?.[language()] ?? texts?.en ?? "";
}

function escape(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

/* -------------------------------------------- */
/*  Registry                                    */
/* -------------------------------------------- */

function registry() {
  globalThis[REGISTRY_KEY] ??= {
    version: 0, owner: null, catalogRevision: 0, catalog: null, modules: new Map(), results: new Map()
  };
  return globalThis[REGISTRY_KEY];
}

// This copy's window. The newest copy in the world draws it, the newest catalog fills it.
const SELF = { version: HUB_LIB_VERSION, open: openWindow };

function claim() {
  const reg = registry();
  if (HUB_LIB_VERSION > reg.version) Object.assign(reg, { version: HUB_LIB_VERSION, owner: SELF });
  if (CATALOG_REVISION > reg.catalogRevision) {
    Object.assign(reg, { catalogRevision: CATALOG_REVISION, catalog: { modules: CATALOG, integrations: INTEGRATIONS } });
  }
}
claim();

/**
 * What a module contributes. This contract stays compatible across versions of the library.
 * @typedef HubModule
 * @property {string} moduleId
 * @property {object} [tested]          TESTED_VERSIONS: core, game systems or modules and the version verified last
 * @property {(options: object) => Promise<object>} [selfTest]   Default: api.runSelfTest of the module
 * @property {() => void} [openSettings]   Default: Foundry's settings on the tab of the module
 */

/**
 * Register a module and add the button "Sephral's Modules" to its settings (GMs). Call in "init".
 * @param {HubModule} module
 */
export function registerHubModule(module) {
  if (!module?.moduleId) throw new Error("A hub module needs a moduleId");
  claim();
  registry().modules.set(module.moduleId, module);
  const game = globalThis.game;
  if (!globalThis.foundry?.applications?.api || (typeof game?.settings?.registerMenu !== "function")) return;
  game.settings.registerMenu(module.moduleId, "sephralsModules", {
    name: text("menuName"),
    label: text("menuLabel"),
    hint: text("menuHint"),
    icon: "fa-solid fa-layer-group",
    type: hubMenuType(),
    restricted: true
  });
}

/**
 * A settings menu type whose button opens the window instead of a form.
 * @returns {typeof foundry.applications.api.ApplicationV2}
 */
export function hubMenuType() {
  return class SephralsModulesMenu extends globalThis.foundry.applications.api.ApplicationV2 {
    async render() {
      openSephralsModules();
      return this;
    }
  };
}

/** Open the window. GMs only. */
export function openSephralsModules() {
  if (!globalThis.game?.user?.isGM) {
    globalThis.ui?.notifications?.warn(text("gmOnly"));
    return null;
  }
  const owner = registry().owner ?? SELF;
  return owner.open();
}

/* -------------------------------------------- */
/*  What the window shows                       */
/* -------------------------------------------- */

/** "Sephral’s Loot Ledger" becomes "Loot Ledger". */
export function shortTitle(title) {
  return String(title ?? "").replace(/^Sephral[’']s\s+/, "");
}

/**
 * Is version a newer than version b? Numeric parts, missing parts count as 0.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
/**
 * The demo video of a catalog entry, or null when the catalog keeps it out of the window.
 * @param {{id: string, video?: boolean}} [entry]
 * @returns {string|null}
 */
export function demoVideo(entry) {
  return entry?.id && (entry.video !== false) ? `${VIDEO_BASE}/${entry.id}/main/media/demo.mp4` : null;
}

export function isNewer(a, b) {
  const parts = (value) => String(value ?? "").split(".").map((part) => parseInt(part, 10) || 0);
  const left = parts(a);
  const right = parts(b);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference) return difference > 0;
  }
  return false;
}

/**
 * The installed Sephral modules, active ones first.
 * @param {Iterable<object>} modules   game.modules
 * @returns {{id: string, title: string, version: string, active: boolean}[]}
 */
export function installedModules(modules) {
  return Array.from(modules ?? [])
    .filter((module) => module?.id?.startsWith(PREFIX) && !HIDDEN.includes(module.id))
    .map((module) => ({ id: module.id, title: shortTitle(module.title || module.id), version: module.version ?? "", active: Boolean(module.active) }))
    .sort((a, b) => (Number(b.active) - Number(a.active)) || a.title.localeCompare(b.title));
}

/**
 * The versions in the world that are newer than a module verified, grouped by what was updated.
 * @param {{title: string, tested: object}[]} modules   Active modules with their TESTED_VERSIONS
 * @param {{core: string, system: {id: string, title: string, version: string}, modules: Map<string, {title: string, version: string, active: boolean}>}} world
 * @returns {{label: string, version: string, modules: string[]}[]}
 */
export function newerThanTested(modules, world) {
  const found = new Map();
  for (const module of modules) {
    for (const [key, tested] of Object.entries(module.tested ?? {})) {
      let label;
      let version;
      if ((key === "core") || (key === "foundry")) {
        label = "Foundry";
        version = world.core;
      } else if (key === world.system?.id) {
        label = world.system.title || key;
        version = world.system.version;
      } else {
        const other = world.modules?.get(key);
        if (!other?.active) continue;
        label = other.title || key;
        version = other.version;
      }
      if (!version || !isNewer(version, tested)) continue;
      const entry = found.get(label) ?? { label, version, modules: [] };
      entry.modules.push(module.title);
      found.set(label, entry);
    }
  }
  return Array.from(found.values());
}

/**
 * The problems a self-test reported. The modules return {problems, checks}, the Crucible sheet {integrations,
 * results}, the portrait switcher {integrations, missing}.
 * @param {object} result
 * @returns {{state: "ok"|"warn", problems: string[], checks: number|null}}
 */
export function classifyResult(result) {
  const problems = [];
  const describe = (entry) => {
    if (typeof entry === "string") return entry;
    if (entry?.name && Array.isArray(entry.problems)) return `${entry.name}: ${entry.problems.map(describe).join(", ")}`;
    return entry?.message ?? entry?.label ?? entry?.name ?? JSON.stringify(entry);
  };
  const list = (value) => (Array.isArray(value) ? value : []);
  for (const entry of list(result?.problems)) problems.push(describe(entry));
  for (const entry of list(result?.integrations)) problems.push(describe(entry));
  for (const entry of list(result?.missing)) problems.push(describe(entry));
  for (const entry of list(result?.results)) if (entry && (entry.ok === false)) problems.push(describe(entry));
  const checks = Number.isFinite(result?.checks) && (result.checks > 0) ? result.checks
    : (Array.isArray(result?.checks) ? result.checks.length : null);
  return { state: problems.length ? "warn" : "ok", problems, checks };
}

/**
 * The modules not installed yet that fit the world, in groups.
 * @param {{modules: object[], integrations: object[]}} catalog
 * @param {{installed: Set<string>, active: Set<string>, system: string}} world
 *   installed: installed Sephral modules, active: every active module id (Sephral and others), system: game system id
 * @returns {{works: {entry: object, partner: string, text: object}[], made: object[], builtIn: object[], every: object[], hidden: number}}
 */
export function suggestions(catalog, { installed, active, system, core = Infinity }) {
  const groups = { works: [], made: [], builtIn: [], every: [], hidden: 0 };
  for (const entry of catalog.modules ?? []) {
    if (installed.has(entry.id) || (entry.released === false)) continue;
    const fits = (!entry.systems || entry.systems.includes(system)) && (!entry.core || (core >= entry.core));
    const needsMet = !entry.needs || active.has(entry.needs);
    if (!fits || !needsMet) {
      groups.hidden++;
      continue;
    }
    const integration = (catalog.integrations ?? []).find((item) => (item.module === entry.id) && active.has(item.with));
    if (integration) groups.works.push({ entry, partner: integration.with, text: integration.text });
    else if (entry.systems || entry.needs) groups.made.push(entry);
    else if (entry.supports?.includes(system)) groups.builtIn.push(entry);
    else groups.every.push(entry);
  }
  return groups;
}

/* -------------------------------------------- */
/*  Actions                                     */
/* -------------------------------------------- */

/**
 * Run the self-test of a module and keep the result for the window.
 * @param {string} moduleId
 * @param {() => void} [rerender]
 * @param {{report?: boolean}} [options]   report: the module also whispers its own report to the GM
 */
export async function runSelfTest(moduleId, rerender = () => {}, { report = false } = {}) {
  const reg = registry();
  const module = reg.modules.get(moduleId);
  const run = module?.selfTest ?? globalThis.game?.modules?.get(moduleId)?.api?.runSelfTest;
  if (typeof run !== "function") {
    reg.results.set(moduleId, { state: "missing" });
    rerender();
    return;
  }
  reg.results.set(moduleId, { state: "running" });
  rerender();
  try {
    reg.results.set(moduleId, classifyResult(await run({ report })));
  } catch (error) {
    console.error(`Sephral's Modules | The self-test of ${moduleId} failed`, error);
    reg.results.set(moduleId, { state: "error", error: String(error?.message ?? error) });
  }
  rerender();
}

/**
 * Run a task without the info and warning notifications it raises: every self-test announces its own result, the
 * window already shows them all. Errors still appear.
 * @param {() => Promise<*>} task
 */
export async function quietly(task) {
  const notifications = globalThis.ui?.notifications;
  const notify = notifications?.notify;
  if (typeof notify !== "function") return task();
  notifications.notify = function (message, type = "info", ...rest) {
    if (type === "error") return notify.call(this, message, type, ...rest);
    return { message, type };
  };
  try {
    return await task();
  } finally {
    notifications.notify = notify;
  }
}

/** Foundry's settings on the tab of a module. */
async function openSettings(moduleId) {
  const custom = registry().modules.get(moduleId)?.openSettings;
  if (typeof custom === "function") return custom();
  const sheet = globalThis.game.settings.sheet;
  await sheet.render({ force: true });
  try {
    sheet.changeTab(moduleId, "categories");
  } catch (error) {
    console.warn(`Sephral's Modules | The settings have no tab for ${moduleId}`, error);
  }
  sheet.bringToFront?.();
}

/**
 * The modules to switch on for a module: itself and what it requires, recursively. Missing ones are named.
 * @param {string} moduleId
 * @param {{get: (id: string) => object}} modules   game.modules
 * @returns {{ids: string[], missing: string[]}}
 */
export function modulesToEnable(moduleId, modules) {
  const ids = [];
  const missing = [];
  const visit = (id) => {
    if (ids.includes(id)) return;
    const module = modules.get(id);
    if (!module) {
      missing.push(id);
      return;
    }
    ids.push(id);
    for (const requirement of Array.from(module.relationships?.requires ?? [])) {
      if (requirement?.type && (requirement.type !== "module")) continue;
      if (requirement?.id) visit(requirement.id);
    }
  };
  visit(moduleId);
  return { ids, missing };
}

async function enableModule(moduleId) {
  const game = globalThis.game;
  const foundry = globalThis.foundry;
  if (!game.user?.can?.("SETTINGS_MODIFY")) return;
  const title = shortTitle(game.modules.get(moduleId)?.title || moduleId);
  const { ids, missing } = modulesToEnable(moduleId, game.modules);
  if (missing.length) {
    globalThis.ui.notifications.error(text("enableMissing", { title, missing: missing.join(", ") }));
    return;
  }
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: text("enableTitle", { title }) },
    content: `<p>${escape(text("enableText", { title }))}</p>`,
    rejectClose: false
  });
  if (!confirmed) return;
  const key = foundry.applications?.sidebar?.apps?.ModuleManagement?.SETTING ?? "moduleConfiguration";
  const configuration = foundry.utils.deepClone(game.settings.get("core", key) ?? {});
  for (const id of ids) configuration[id] = true;
  await game.settings.set("core", key, configuration);
  game.socket?.emit?.("reload");
  foundry.utils.debouncedReload?.();
}

/* -------------------------------------------- */
/*  Window                                      */
/* -------------------------------------------- */

let WindowClass = null;

function openWindow() {
  WindowClass ??= createWindowClass();
  const existing = globalThis.foundry.applications.instances?.get?.(WINDOW_ID);
  if (existing) {
    existing.render({ force: true });
    existing.bringToFront?.();
    return existing;
  }
  ensureStyles();
  const app = new WindowClass();
  app.render({ force: true });
  return app;
}

function createWindowClass() {
  const { ApplicationV2 } = globalThis.foundry.applications.api;
  return class SephralsModules extends ApplicationV2 {
    static DEFAULT_OPTIONS = {
      id: WINDOW_ID,
      classes: ["sephrals-hub"],
      window: { icon: "fa-solid fa-layer-group", resizable: true },
      position: { width: 720, height: 760 },
      actions: {
        selfTest(event, target) {
          void runSelfTest(target.dataset.module, () => this.render(), { report: true });
        },
        runAll() {
          void quietly(async () => {
            for (const module of installedModules(globalThis.game.modules)) {
              if (module.active) await runSelfTest(module.id, () => this.render());
            }
          });
        },
        settings(event, target) {
          void openSettings(target.dataset.module);
        },
        enable(event, target) {
          void enableModule(target.dataset.module);
        },
        debugFile() {
          const first = Array.from(registry().modules.keys())[0];
          void import("./debug-file.mjs").then(({ saveDebugFile }) => saveDebugFile(null, { moduleId: first }));
        },
        toggleMore() {
          this.moreOpen = !this.moreOpen;
          this.render();
        },
        video(event, target) {
          openVideo(target.dataset.module);
        }
      }
    };

    moreOpen = false;

    get title() {
      return text("title");
    }

    async _renderHTML() {
      return renderContent(this.moreOpen);
    }

    _replaceHTML(result, content) {
      content.innerHTML = result;
    }
  };
}

let VideoWindowClass = null;

/** Play the demo video of a catalog module in a window of its own. */
function openVideo(moduleId) {
  const catalog = registry().catalog ?? { modules: CATALOG };
  const entry = catalog.modules.find((candidate) => candidate.id === moduleId);
  const src = demoVideo(entry);
  if (!src) return null;
  VideoWindowClass ??= createVideoWindowClass();
  ensureStyles();
  const existing = globalThis.foundry.applications.instances?.get?.(VIDEO_WINDOW_ID);
  const app = existing ?? new VideoWindowClass();
  app.entry = entry;
  // A new window has no element before its first render
  void app.render({ force: true }).then(() => app.bringToFront?.());
  return app;
}

function createVideoWindowClass() {
  const { ApplicationV2 } = globalThis.foundry.applications.api;
  return class SephralsModulesVideo extends ApplicationV2 {
    static DEFAULT_OPTIONS = {
      id: VIDEO_WINDOW_ID,
      classes: ["sephrals-hub", "sephrals-hub-video"],
      window: { icon: "fa-solid fa-circle-play", resizable: true },
      position: { width: 860, height: "auto" }
    };

    entry = null;

    get title() {
      return text("videoTitle", { title: this.entry?.title ?? "" });
    }

    async _renderHTML() {
      const id = this.entry?.id ?? "";
      return `<video class="sh-video" src="${escape(demoVideo(this.entry) ?? "")}" controls autoplay muted loop playsinline></video>
        <p class="sh-hint sh-video-note">${escape(text("videoSource"))} ${link(`${GITHUB}/${id}#readme`, text("github"))}</p>
        <p class="sh-note sh-warn sh-video-error" hidden><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> ${escape(text("videoError"))}</p>`;
    }

    _replaceHTML(result, content) {
      content.innerHTML = result;
      const error = content.querySelector(".sh-video-error");
      content.querySelector("video")?.addEventListener("error", () => { if (error) error.hidden = false; });
    }
  };
}

function videoButton(entry) {
  return demoVideo(entry) ? iconButton("video", entry.id, text("video"), "fa-solid fa-play", "sh-flame") : "";
}

function link(href, label, icon = "fa-solid fa-arrow-up-right-from-square") {
  return `<a href="${escape(href)}" target="_blank" rel="noopener">${escape(label)} <i class="${icon}" aria-hidden="true"></i></a>`;
}

function packageLink(entry) {
  return entry.listed
    ? link(`https://foundryvtt.com/packages/${entry.id}`, text("packagePage"))
    : link(`${GITHUB}/${entry.id}`, text("github"));
}

function iconButton(action, moduleId, label, icon, extra = "") {
  return `<button type="button" class="sh-icon${extra ? ` ${extra}` : ""}" data-action="${action}" data-module="${escape(moduleId)}" `
    + `data-tooltip="${escape(label)}" aria-label="${escape(label)}"><i class="${icon}" aria-hidden="true"></i></button>`;
}

function testLine(module, result, missing = []) {
  if (!module.active) {
    const note = missing.length ? text("offMissing", { missing: missing.join(", ") }) : text("offNote");
    return `<div class="sh-note">${escape(note)}</div>`;
  }
  const line = (state, icon, label) => `<div class="sh-note sh-${state}"><i class="${icon}" aria-hidden="true"></i> ${escape(label)}</div>`;
  switch (result?.state) {
    case "running": return line("running", "fa-solid fa-spinner fa-spin", text("testRunning"));
    case "ok": return line("ok", "fa-solid fa-circle-check",
      result.checks ? text("testOkChecks", { checks: result.checks }) : text("testOk"));
    case "warn": {
      const shown = result.problems.slice(0, PROBLEM_LIMIT).map((problem) => `<li>${escape(problem)}</li>`).join("");
      const rest = result.problems.length - PROBLEM_LIMIT;
      const label = result.problems.length === 1 ? text("testProblem") : text("testProblems", { count: result.problems.length });
      return line("warn", "fa-solid fa-triangle-exclamation", label)
        + `<ul class="sh-problems">${shown}${rest > 0 ? `<li>${escape(text("moreProblems", { count: rest }))}</li>` : ""}</ul>`;
    }
    case "error": return line("warn", "fa-solid fa-triangle-exclamation", text("testError", { error: result.error }));
    case "missing": return line("none", "fa-regular fa-circle", text("testMissing"));
    default: return line("none", "fa-regular fa-circle", text("testNone"));
  }
}

function moduleRow(module, entry) {
  const inCatalog = Boolean(entry);
  const result = registry().results.get(module.id);
  const missing = module.active ? [] : modulesToEnable(module.id, globalThis.game.modules).missing;
  const manual = inCatalog ? `<a class="sh-icon" href="${GITHUB}/${escape(module.id)}/blob/main/MANUAL.md" target="_blank" rel="noopener" `
    + `data-tooltip="${escape(text("manual"))}" aria-label="${escape(text("manual"))}"><i class="fa-solid fa-book" aria-hidden="true"></i></a>` : "";
  let actions = "";
  if (module.active) {
    actions = iconButton("selfTest", module.id, text("selfTest"), "fa-solid fa-stethoscope")
      + iconButton("settings", module.id, text("settings"), "fa-solid fa-gear");
  } else if (!missing.length) {
    actions = `<button type="button" class="sh-button" data-action="enable" data-module="${escape(module.id)}">`
      + `<i class="fa-solid fa-power-off" aria-hidden="true"></i> ${escape(text("enable"))}</button>`;
  }
  return `<li class="sh-row${module.active ? "" : " sh-inactive"}">
    <div class="sh-row-main">
      <div class="sh-row-title"><strong>${escape(module.title)}</strong>
        <span class="sh-pill">${escape(module.version)}</span>
        <span class="sh-pill ${module.active ? "sh-on" : ""}">${escape(text(module.active ? "active" : "off"))}</span></div>
      ${testLine(module, result, missing)}
    </div>
    <div class="sh-row-actions">${actions}${manual}${videoButton(entry)}</div>
  </li>`;
}

function card(entry, extra = {}) {
  const fit = extra.partner ? `<span class="sh-pill sh-accent">${escape(text("fits", { title: extra.partner }))}</span>` : "";
  return `<li class="sh-card${extra.partner ? " sh-card-works" : ""}">
    <div class="sh-row-title"><strong>${escape(entry.title)}</strong>${fit}</div>
    <p>${escape(extra.text ? localized(extra.text) : localized(entry.text))}</p>
    <div class="sh-card-links">${packageLink(entry)}${demoVideo(entry) ? `<button type="button" class="sh-play sh-flame" data-action="video" data-module="${escape(entry.id)}"><i class="fa-solid fa-play" aria-hidden="true"></i><span>${escape(text("watchVideo"))}</span></button>` : ""}</div>
  </li>`;
}

function renderContent(moreOpen) {
  const game = globalThis.game;
  const reg = registry();
  const catalog = reg.catalog ?? { modules: CATALOG, integrations: INTEGRATIONS };
  const catalogById = new Map(catalog.modules.map((entry) => [entry.id, entry]));
  const installed = installedModules(game.modules);
  const activeCount = installed.filter((module) => module.active).length;
  const system = game.system;

  const worldModules = new Map(Array.from(game.modules ?? []).map((module) => [module.id, module]));
  const newer = newerThanTested(
    installed.filter((module) => module.active && reg.modules.get(module.id)?.tested)
      .map((module) => ({ title: module.title, tested: reg.modules.get(module.id).tested })),
    { core: game.version, system: { id: system.id, title: system.title, version: system.version }, modules: worldModules }
  );
  const newerList = newer.map((entry) => `${entry.label} ${entry.version} (${entry.modules.join(", ")})`).join(", ");

  const summary = [
    text("summary", { installed: installed.length, active: activeCount }),
    `Foundry ${game.version}`,
    `${system.title} ${system.version}`
  ].join(" · ");

  const groups = suggestions(catalog, {
    installed: new Set(installed.map((module) => module.id)),
    active: new Set(Array.from(game.modules ?? []).filter((module) => module.active).map((module) => module.id)),
    system: system.id,
    core: Number(game.release?.generation ?? Infinity)
  });
  const fitting = groups.works.length + groups.made.length + groups.builtIn.length + groups.every.length;
  const titleOf = (id) => shortTitle(game.modules.get(id)?.title)
    || catalog.modules.find((entry) => entry.id === id)?.title || id;
  const section = (label, cards) => (cards.length ? `<h3>${escape(label)}</h3><ul class="sh-cards">${cards.join("")}</ul>` : "");
  const moreBody = moreOpen ? [
    section(text("worksWith"), groups.works.map((item) => card(item.entry, { partner: titleOf(item.partner), text: item.text }))),
    section(text("madeFor"), groups.made.map((entry) => card(entry))),
    section(text("builtIn", { system: system.title }), groups.builtIn.map((entry) => card(entry))),
    section(text("everySystem"), groups.every.map((entry) => card(entry))),
    groups.hidden ? `<p class="sh-hint">${escape(groups.hidden === 1 ? text("hiddenOne") : text("hidden", { count: groups.hidden }))}</p>` : ""
  ].join("") : "";
  const moreCount = fitting === 0 ? text("moreNone") : (fitting === 1 ? text("moreOne") : text("moreCount", { count: fitting }));
  const toggle = fitting ? `<button type="button" class="sh-button" data-action="toggleMore" aria-expanded="${moreOpen}">
      <i class="fa-solid fa-chevron-${moreOpen ? "up" : "down"}" aria-hidden="true"></i> ${escape(text(moreOpen ? "hide" : "show"))}</button>` : "";

  return `
  <section class="sh-hero">
    <div class="sh-hero-text">
      <div class="sh-eyebrow">${escape(text("title"))}</div>
      <h2>${escape(text("heading"))}</h2>
      <p>${escape(summary)}</p>
    </div>
    <div class="sh-hero-actions">
      <button type="button" class="sh-button sh-primary" data-action="runAll"><i class="fa-solid fa-stethoscope" aria-hidden="true"></i> ${escape(text("runAll"))}</button>
      <button type="button" class="sh-button" data-action="debugFile"><i class="fa-solid fa-bug" aria-hidden="true"></i> ${escape(text("debugFile"))}</button>
    </div>
  </section>
  ${newer.length ? `<div class="sh-banner"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><p>${escape(text("newer", { list: newerList }))}</p></div>` : ""}
  <section class="sh-panel">
    <header class="sh-panel-head"><h2>${escape(text("inWorld"))}</h2><span class="sh-hint">${escape(text("inWorldHint"))}</span></header>
    <ul class="sh-rows">${installed.map((module) => moduleRow(module, catalogById.get(module.id))).join("")}</ul>
  </section>
  <section class="sh-panel sh-more">
    <header class="sh-panel-head sh-more-head">
      <div><h2>${escape(text("more"))}</h2><p class="sh-hint">${escape(text("moreHint"))} ${escape(moreCount)}</p></div>
      ${toggle}
    </header>
    ${moreBody}
  </section>
  <footer class="sh-footer">${link(GITHUB, text("allModules"))}${link(DISCORD, text("discord"))}</footer>`;
}

/* -------------------------------------------- */
/*  Styles                                      */
/* -------------------------------------------- */

// Injected once. The rules are unlayered and outrank core, so every selector stays inside the window. Dark follows
// Foundry, light uses the warm Signature look of the modules.
const STYLES = `
.sephrals-hub {
  --sh-bg: #222026; --sh-panel: #2c2a31; --sh-row: #33313a; --sh-line: rgba(218, 197, 167, 0.16);
  --sh-ink: #ece6da; --sh-muted: #b9b0a2; --sh-accent: #e8a27c; --sh-accent-ink: #1b1a1f;
  --sh-accent-soft: rgba(232, 162, 124, 0.12); --sh-ok: #7fcf9f; --sh-warn: #f0c27a;
  --sh-warn-soft: rgba(240, 194, 122, 0.12); --sh-radius: 6px; --sh-radius-small: 6px;
}
body.theme-light .sephrals-hub:not(.themed), .sephrals-hub.themed.theme-light {
  --sh-bg: #f3ecde; --sh-panel: rgba(255, 250, 240, 0.8); --sh-row: #fffdf7; --sh-line: rgba(73, 49, 32, 0.14);
  --sh-ink: #1f1a17; --sh-muted: #665c54; --sh-accent: #a8481f; --sh-accent-ink: #fffaf0;
  --sh-accent-soft: rgba(168, 72, 31, 0.12); --sh-ok: #2d7753; --sh-warn: #8a5300;
  --sh-warn-soft: rgba(176, 112, 0, 0.12); --sh-radius: 16px; --sh-radius-small: 12px;
}
.sephrals-hub .window-content {
  display: flex; flex-direction: column; gap: 12px; padding: 14px; overflow-y: auto;
  background: var(--sh-bg); color: var(--sh-ink); font-family: var(--font-primary, "Signika", sans-serif);
}
.sephrals-hub h2, .sephrals-hub h3 { margin: 0; padding: 0; border: 0; color: var(--sh-ink); font-family: inherit; }
.sephrals-hub h2 { font-size: 17px; font-weight: 600; }
.sephrals-hub h3 { margin-top: 6px; font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--sh-accent); }
.sephrals-hub p { margin: 0; }
.sephrals-hub ul { margin: 0; padding: 0; list-style: none; }
.sephrals-hub a { color: var(--sh-accent); text-decoration: none; }
.sephrals-hub a:hover { text-decoration: underline; }
.sephrals-hub .sh-hint { font-size: 13px; color: var(--sh-muted); }
.sephrals-hub .sh-hero, .sephrals-hub .sh-panel {
  background: var(--sh-panel); border: 1px solid var(--sh-line); border-radius: var(--sh-radius);
}
.sephrals-hub .sh-hero { display: flex; align-items: center; gap: 16px; padding: 16px 18px; flex: none; }
.sephrals-hub .sh-hero-text { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.sephrals-hub .sh-hero h2 { font-size: 21px; font-weight: 700; }
.sephrals-hub .sh-hero p { font-size: 14px; color: var(--sh-muted); }
.sephrals-hub .sh-eyebrow { font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--sh-accent); }
.sephrals-hub .sh-hero-actions { display: flex; flex-direction: column; gap: 8px; }
.sephrals-hub .sh-button {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px; width: auto; height: 36px; margin: 0;
  padding: 0 14px; font: 500 14px var(--font-primary, "Signika", sans-serif); color: var(--sh-ink); background: var(--sh-row);
  border: 1px solid var(--sh-line); border-radius: var(--sh-radius-small); cursor: pointer; white-space: nowrap;
}
.sephrals-hub .sh-button.sh-primary { color: var(--sh-accent-ink); background: var(--sh-accent); border-color: var(--sh-accent); }
.sephrals-hub .sh-button:hover, .sephrals-hub .sh-icon:hover { border-color: var(--sh-accent); box-shadow: none; }
.sephrals-hub .sh-banner {
  display: flex; align-items: flex-start; gap: 10px; padding: 10px 14px; font-size: 14px; flex: none;
  background: var(--sh-warn-soft); border: 1px solid var(--sh-warn); border-radius: var(--sh-radius-small);
}
.sephrals-hub .sh-banner i { color: var(--sh-warn); margin-top: 3px; }
.sephrals-hub .sh-panel { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px 14px; flex: none; }
.sephrals-hub .sh-panel-head { display: flex; align-items: baseline; gap: 10px; }
.sephrals-hub .sh-more-head { align-items: center; justify-content: space-between; }
.sephrals-hub .sh-rows { display: flex; flex-direction: column; gap: 8px; }
.sephrals-hub .sh-row {
  display: flex; align-items: center; gap: 12px; padding: 8px 8px 8px 14px;
  background: var(--sh-row); border: 1px solid var(--sh-line); border-radius: var(--sh-radius-small);
}
.sephrals-hub .sh-row-main { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.sephrals-hub .sh-row-title { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 15px; }
.sephrals-hub .sh-row-actions { display: flex; align-items: center; gap: 6px; }
.sephrals-hub .sh-pill {
  font-size: 12px; padding: 1px 8px; border-radius: 999px; background: var(--sh-line); color: var(--sh-muted); white-space: nowrap;
}
.sephrals-hub .sh-pill.sh-on { color: var(--sh-ok); }
.sephrals-hub .sh-pill.sh-accent { color: var(--sh-accent); background: var(--sh-accent-soft); }
.sephrals-hub .sh-note { font-size: 13px; color: var(--sh-muted); }
.sephrals-hub .sh-note.sh-ok i { color: var(--sh-ok); }
.sephrals-hub .sh-note.sh-warn i { color: var(--sh-warn); }
.sephrals-hub .sh-problems { font-size: 13px; color: var(--sh-muted); padding-left: 22px; list-style: disc; }
.sephrals-hub .sh-icon {
  display: inline-flex; align-items: center; justify-content: center; flex: none; width: 36px; height: 36px; margin: 0; padding: 0;
  color: var(--sh-ink); background: transparent; border: 1px solid var(--sh-line); border-radius: var(--sh-radius-small); cursor: pointer;
}
.sephrals-hub a.sh-icon:hover { text-decoration: none; }
.sephrals-hub .sh-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.sephrals-hub .sh-card {
  display: flex; flex-direction: column; gap: 4px; padding: 10px 12px;
  background: var(--sh-row); border: 1px solid var(--sh-line); border-radius: var(--sh-radius-small);
}
.sephrals-hub .sh-card-works { grid-column: 1 / -1; background: var(--sh-accent-soft); border-color: var(--sh-accent); }
.sephrals-hub .sh-card p { flex: 1; font-size: 13px; color: var(--sh-muted); }
.sephrals-hub .sh-card a { font-size: 13px; font-weight: 500; }
.sephrals-hub .sh-card-links { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 16px; }
/* The play buttons burn: a rising fire gradient, flickering tongues on top and a glow, calm for reduced motion */
.sephrals-hub .sh-flame {
  position: relative; overflow: hidden; isolation: isolate; color: #fff; border: 0;
  background: linear-gradient(0deg, #b3170a 0%, #ff4d00 30%, #ff9a00 62%, #ffd84a 100%); background-size: 100% 220%;
  text-shadow: 0 1px 2px rgba(90, 10, 0, 0.75);
  animation: sh-burn 1.4s ease-in-out infinite alternate, sh-glow 1.4s ease-in-out infinite alternate;
}
.sephrals-hub .sh-flame::before {
  content: ""; position: absolute; inset: -60% -20% -10%; z-index: -1; pointer-events: none; mix-blend-mode: screen;
  background:
    radial-gradient(ellipse 22% 55% at 18% 100%, rgba(255, 236, 140, 0.95), transparent 70%),
    radial-gradient(ellipse 26% 70% at 50% 100%, rgba(255, 170, 40, 0.9), transparent 70%),
    radial-gradient(ellipse 20% 50% at 82% 100%, rgba(255, 226, 120, 0.9), transparent 70%);
  animation: sh-flicker 0.8s ease-in-out infinite alternate;
}
.sephrals-hub .sh-flame > * { position: relative; }
.sephrals-hub .sh-flame:hover, .sephrals-hub .sh-flame:focus-visible { filter: brightness(1.15) saturate(1.15); box-shadow: 0 0 18px rgba(255, 140, 0, 0.95); }
.sephrals-hub .sh-play {
  display: inline-flex; align-items: center; gap: 8px; width: auto; height: 30px; margin: 0; padding: 0 14px 0 12px;
  border-radius: 999px; font: 600 13px var(--font-primary, "Signika", sans-serif); cursor: pointer; white-space: nowrap;
}
.sephrals-hub .sh-icon.sh-flame { border-radius: 50%; }
@keyframes sh-burn { from { background-position: 0 0; } to { background-position: 0 100%; } }
@keyframes sh-flicker {
  0% { transform: translate(0, 12%) scale(1, 0.9); opacity: 0.75; }
  40% { transform: translate(-4%, -4%) scale(1.05, 1.15); opacity: 1; }
  100% { transform: translate(4%, 6%) scale(0.95, 1); opacity: 0.85; }
}
@keyframes sh-glow { from { box-shadow: 0 0 5px rgba(255, 90, 0, 0.45); } to { box-shadow: 0 0 14px rgba(255, 150, 0, 0.9); } }
@media (prefers-reduced-motion: reduce) {
  .sephrals-hub .sh-flame, .sephrals-hub .sh-flame::before { animation: none; }
}
.sephrals-hub-video .window-content { gap: 8px; }
.sephrals-hub .sh-video { display: block; width: 100%; aspect-ratio: 16 / 10; background: #000; border-radius: var(--sh-radius-small); }
.sephrals-hub .sh-footer { display: flex; justify-content: flex-end; gap: 16px; padding: 0 4px; font-size: 13px; flex: none; }
`;

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = STYLES;
  document.head.appendChild(style);
}
