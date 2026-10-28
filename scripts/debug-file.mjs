/**
 * One debug file for bug reports about all of Sephral's modules in a world.
 *
 * Every module carries an identical copy as scripts/debug-file.mjs. Never change one copy alone: all copies stay the
 * same, and a change that older copies must notice raises DEBUG_LIB_VERSION.
 *
 * Every module registers a provider. The copies share one registry on globalThis: the newest copy builds every file
 * and serves the single entry in the chat context menu, so a module released with an older copy keeps working. A file
 * holds the versions and active modules, the raw chat messages it is about and, per module, its settings, what it
 * made of those messages and its recent decisions. Chat text and whispers are part of it, so only GMs can save one.
 */

export const DEBUG_LIB_VERSION = 1;
export const DEBUG_FILE_FORMAT = 1;

const REGISTRY_KEY = "sephralsDebugFiles";
const TRACE_LIMIT = 300;
const RECENT_LIMIT = 20;

/** Settings that never go into a debug file: the usage statistics keep the id of the world there. */
const OMITTED_SETTINGS = /^usage/;

/* -------------------------------------------- */
/*  Recent decisions                            */
/* -------------------------------------------- */

/** The recent decisions of a module, newest last. Entries about a chat message carry its id as messageId. */
export class DebugTrace {
  constructor(limit = TRACE_LIMIT) {
    this.limit = limit;
    this.entries = [];
  }

  add(event, data = {}) {
    this.entries.push({ at: new Date().toISOString(), event, ...toPlain(data) });
    if (this.entries.length > this.limit) this.entries.splice(0, this.entries.length - this.limit);
  }

  forMessage(messageId) {
    return this.entries.filter((entry) => entry.messageId === messageId);
  }

  clear() {
    this.entries = [];
  }
}

/* -------------------------------------------- */
/*  Content                                     */
/* -------------------------------------------- */

/**
 * A JSON copy without cycles, functions or live documents (those become their uuid).
 * @param {*} value
 * @returns {*}
 */
export function toPlain(value) {
  const seen = new WeakSet();
  const json = JSON.stringify(value, function (key, current) {
    if (typeof current === "function") return undefined;
    if (typeof current === "bigint") return String(current);
    if (current instanceof Set) return Array.from(current);
    if (current instanceof Map) return Object.fromEntries(current);
    if (current && (typeof current === "object")) {
      // A document nested in other data stands for itself by its uuid, the data it is about is added on purpose.
      if ((key !== "") && current.documentName && current.uuid) return `${current.documentName}:${current.uuid}`;
      if (seen.has(current)) return "[circular]";
      seen.add(current);
    }
    return current;
  });
  return json === undefined ? null : JSON.parse(json);
}

/**
 * Versions, user, active modules and the Sephral modules that took part.
 * @returns {object}
 */
export function collectEnvironment() {
  const game = globalThis.game;
  const modules = Array.from(game?.modules ?? []);
  return {
    foundry: game?.version ?? game?.release?.version ?? "",
    system: `${game?.system?.id ?? ""}@${game?.system?.version ?? ""}`,
    language: game?.i18n?.lang ?? "",
    user: { id: game?.user?.id ?? "", role: game?.user?.role ?? null, isGM: Boolean(game?.user?.isGM) },
    activeGM: game?.users?.activeGM?.id ?? null,
    browser: globalThis.navigator?.userAgent ?? "",
    debugLibrary: registry().version,
    activeModules: modules.filter((module) => module?.active).map((module) => `${module.id}@${module.version ?? ""}`)
  };
}

/**
 * The settings of a module as this user sees them, without the usage statistics.
 * @param {string} moduleId
 * @param {{omit?: string[]}} [options]
 * @returns {object}
 */
export function moduleSettings(moduleId, { omit = [] } = {}) {
  const settings = {};
  for (const setting of globalThis.game?.settings?.settings?.values?.() ?? []) {
    if ((setting?.namespace !== moduleId) || OMITTED_SETTINGS.test(setting.key) || omit.includes(setting.key)) continue;
    try {
      settings[setting.key] = toPlain(globalThis.game.settings.get(moduleId, setting.key));
    } catch {
      settings[setting.key] = "(unreadable)";
    }
  }
  return settings;
}

/**
 * The stored data of a chat message, with its rolls readable (Foundry stores each roll as a JSON string).
 * @param {ChatMessage|object} message
 * @returns {object|null}
 */
export function messageData(message) {
  if (!message) return null;
  const data = typeof message.toObject === "function" ? message.toObject() : toPlain(message);
  data.rolls = (data.rolls ?? []).map((roll) => {
    if (typeof roll !== "string") return roll;
    try {
      return JSON.parse(roll);
    } catch {
      return roll;
    }
  });
  return data;
}

/**
 * The latest chat messages, oldest first.
 * @param {number} [limit]
 * @param {(message: ChatMessage) => boolean} [filter]
 * @returns {ChatMessage[]}
 */
export function recentMessages(limit = RECENT_LIMIT, filter = () => true) {
  return Array.from(globalThis.game?.messages?.contents ?? []).filter(filter).slice(-limit);
}

/* -------------------------------------------- */
/*  Registry of the modules                     */
/* -------------------------------------------- */

/**
 * What a module contributes. This contract stays compatible across versions of the library, a newer copy builds the
 * files for providers registered by older ones.
 * @typedef DebugProvider
 * @property {string} moduleId
 * @property {() => string} label                    Text of the chat entry (the same words in every module)
 * @property {(file: string) => string} notice       The notification after saving
 * @property {(message: ChatMessage) => boolean} [applies]   Chat messages the module reads (default: none)
 * @property {(message: ChatMessage) => object} [message]    What the module makes of one of them (may be async)
 * @property {() => {messages?: ChatMessage[], details?: object}} [recent]   The module's own recent picture (may be async)
 * @property {DebugTrace} [trace]                    The recent decisions of the module
 * @property {string[]} [omitSettings]               Settings to leave out
 */

function registry() {
  globalThis[REGISTRY_KEY] ??= { version: 0, owner: null, providers: new Map() };
  return globalThis[REGISTRY_KEY];
}

// This copy's file builder. The newest copy in the world builds every file.
const SELF = { version: DEBUG_LIB_VERSION, save: saveCombined, entry: chatEntry };
let hookRegistered = false;

function claim() {
  const reg = registry();
  if (DEBUG_LIB_VERSION > reg.version) Object.assign(reg, { version: DEBUG_LIB_VERSION, owner: SELF });
}
claim();

/**
 * Register a module. Call in "init": the chat log builds its context menu before "ready".
 * @param {DebugProvider} provider
 */
export function registerDebugProvider(provider) {
  if (!provider?.moduleId) throw new Error("A debug provider needs a moduleId");
  claim();
  registry().providers.set(provider.moduleId, provider);
  if (hookRegistered || !globalThis.Hooks) return;
  hookRegistered = true;
  // Every copy listens, only the newest adds the entry, once
  globalThis.Hooks.on("getChatMessageContextOptions", (app, entries) => {
    if (registry().owner !== SELF) return;
    if (entries.some((entry) => entry?.sephralsDebug)) return;
    entries.push(chatEntry());
  });
}

function appliesTo(provider, message) {
  if (typeof provider.message !== "function") return false;
  try {
    return typeof provider.applies === "function" ? Boolean(provider.applies(message)) : true;
  } catch {
    return false;
  }
}

/** The single context menu entry. v13 reads name, condition and callback, v14 label, visible and onClick. */
function chatEntry() {
  const find = (li) => {
    const id = li?.dataset?.messageId ?? li?.closest?.("[data-message-id]")?.dataset?.messageId;
    return id ? globalThis.game.messages?.get(id) ?? null : null;
  };
  const shown = (li) => {
    const message = find(li);
    if (!globalThis.game.user?.isGM || !message) return false;
    return Array.from(registry().providers.values()).some((provider) => appliesTo(provider, message));
  };
  const run = (li) => {
    const message = find(li);
    if (message) void saveDebugFile(message.id);
  };
  const label = () => {
    const provider = Array.from(registry().providers.values()).find((entry) => typeof entry.label === "function");
    return provider ? provider.label() : "Save debug file";
  };
  return {
    sephralsDebug: true,
    get name() { return label(); },
    get label() { return label(); },
    icon: '<i class="fa-solid fa-bug"></i>',
    condition: shown,
    visible: shown,
    callback: run,
    onClick: (event, li) => run(li)
  };
}

/* -------------------------------------------- */
/*  Saving                                      */
/* -------------------------------------------- */

/**
 * Save the debug file: about one chat message (every module that reads it), or without an id about the latest
 * picture of every module.
 * @param {string|null} [messageId]
 * @param {{moduleId?: string}} [options]   The module whose button was used, its texts are shown
 * @returns {Promise<string|null>}   The file name
 */
export function saveDebugFile(messageId = null, options = {}) {
  const owner = registry().owner ?? SELF;
  return owner.save(messageId, options);
}

/**
 * Put the file together.
 * @param {ChatMessage|null} message
 * @returns {Promise<object>}
 */
export async function buildDebugFile(message = null) {
  const messages = new Map();
  if (message) messages.set(message.id, message);
  const modules = {};
  for (const provider of registry().providers.values()) {
    if (message && !appliesTo(provider, message)) continue;
    const part = {
      version: globalThis.game?.modules?.get?.(provider.moduleId)?.version ?? "",
      settings: moduleSettings(provider.moduleId, { omit: provider.omitSettings ?? [] }),
      details: null,
      trace: [],
      error: null
    };
    try {
      if (message) {
        part.details = toPlain(await provider.message(message));
        part.trace = toPlain(provider.trace?.forMessage(message.id) ?? []);
      } else {
        const recent = (typeof provider.recent === "function" ? await provider.recent() : null) ?? {};
        for (const entry of recent.messages ?? []) if (entry?.id) messages.set(entry.id, entry);
        part.details = toPlain(recent.details ?? null);
        part.trace = toPlain(provider.trace?.entries ?? []);
      }
    } catch (error) {
      part.error = String(error?.stack ?? error);
    }
    modules[provider.moduleId] = part;
  }
  const time = (entry) => Number(entry?.timestamp ?? entry?._source?.timestamp ?? 0);
  return {
    format: DEBUG_FILE_FORMAT,
    createdAt: new Date().toISOString(),
    subject: message ? "message" : "recent",
    messageId: message?.id ?? null,
    environment: collectEnvironment(),
    messages: Array.from(messages.values()).sort((a, b) => time(a) - time(b)).map(messageData).filter(Boolean),
    modules
  };
}

function download(name, text) {
  const save = globalThis.foundry?.utils?.saveDataToFile ?? globalThis.saveDataToFile;
  if (typeof save === "function") return save(text, "application/json", name);
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  Object.assign(document.createElement("a"), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function saveCombined(messageId = null, { moduleId = null } = {}) {
  const game = globalThis.game;
  if (!game?.user?.isGM) return null;
  const message = messageId ? game.messages?.get(messageId) ?? null : null;
  if (messageId && !message) return null;
  const providers = registry().providers;
  const speaker = providers.get(moduleId) ?? Array.from(providers.values())[0] ?? null;
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const name = `sephrals-debug-${stamp}.json`;
    download(name, JSON.stringify(await buildDebugFile(message), null, 2));
    const notice = typeof speaker?.notice === "function" ? speaker.notice(name) : `${name} saved`;
    globalThis.ui?.notifications?.info(notice, { permanent: true });
    return name;
  } catch (error) {
    console.error("Sephral's modules | The debug file could not be saved", error);
    globalThis.ui?.notifications?.error(`Debug file: ${error?.message ?? error}`);
    return null;
  }
}

/* -------------------------------------------- */
/*  Settings button                             */
/* -------------------------------------------- */

/**
 * A settings menu type whose button saves the debug file instead of opening a window.
 * @param {string} moduleId   The module the button belongs to
 * @returns {typeof foundry.applications.api.ApplicationV2}
 */
export function debugMenuType(moduleId) {
  return class DebugFileMenu extends globalThis.foundry.applications.api.ApplicationV2 {
    async render() {
      await saveDebugFile(null, { moduleId });
      return this;
    }
  };
}

/**
 * The button "Save debug file" in the module settings (GMs). Call in "init" with localized texts or i18n keys.
 * @param {string} moduleId
 * @param {{name: string, label: string, hint: string}} texts
 */
export function registerDebugMenu(moduleId, { name, label, hint }) {
  const game = globalThis.game;
  if (!globalThis.foundry?.applications?.api || (typeof game?.settings?.registerMenu !== "function")) return;
  game.settings.registerMenu(moduleId, "debugFile", {
    name,
    label,
    hint,
    icon: "fa-solid fa-bug",
    type: debugMenuType(moduleId),
    restricted: true
  });
}
