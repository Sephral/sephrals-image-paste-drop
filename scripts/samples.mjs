/**
 * Sample windows of Sephral's modules: a module shows its windows filled with made-up data, so translators (and anyone
 * testing) see every text in its place without playing a session first.
 *
 * Contract: `game.modules.get(id).api.samples()` returns a list of entries
 *   {id: string, label: string, open: () => Promise<Application>, group?: string}
 * `label` is shown as it is (already in the language of the user), `open` renders a real window of the module with sample
 * data held in memory and returns it. A sample changes nothing: no document, setting, file, chat message, socket message
 * or browser storage is written, no usage counter counts. Buttons that would change something do nothing and say so.
 *
 * The source is FoundryVTT_Module/_shared/samples/samples.mjs, every module carries a copy as scripts/samples.mjs
 * (node FoundryVTT_Module/_tools/sync-shared.mjs). Never change a copy.
 */

export const SAMPLES_LIB_VERSION = 1;

const TEXTS = {
  en: {
    banner: "Sample data: made up to show the texts in their place. Nothing here is saved.",
    blocked: "This is a sample window: this button does nothing here.",
    chatTitle: "Sample chat message",
    textTitle: "Sample text",
    // a place name without an article, so it fits every sentence ("in Millbrook")
    place: "Millbrook",
    bandit: "Bandit",
    wolf: "Wolf",
    troll: "Troll",
    longsword: "Longsword",
    fireBolt: "Fire Bolt",
    cureWounds: "Cure Wounds",
    sacredFlame: "Sacred Flame",
    shortbow: "Shortbow",
    club: "Club",
    bite: "Bite",
    prone: "Prone"
  },
  de: {
    banner: "Beispieldaten: ausgedacht, damit die Texte an ihrem Platz stehen. Hier wird nichts gespeichert.",
    blocked: "Das ist ein Beispielfenster: Dieser Knopf tut hier nichts.",
    chatTitle: "Beispiel einer Chatnachricht",
    textTitle: "Beispieltext",
    place: "Mühlbach",
    bandit: "Bandit",
    wolf: "Wolf",
    troll: "Troll",
    longsword: "Langschwert",
    fireBolt: "Feuerpfeil",
    cureWounds: "Wunden heilen",
    sacredFlame: "Heilige Flamme",
    shortbow: "Kurzbogen",
    club: "Knüppel",
    bite: "Biss",
    prone: "Liegend"
  }
};

/** A text of the library in the language of Foundry (English where it has none). */
export function sampleText(key) {
  const lang = globalThis.game?.i18n?.lang ?? "en";
  return TEXTS[lang]?.[key] ?? TEXTS.en[key] ?? key;
}

/**
 * The same small party and foes in every module's samples, with pictures that ship with Foundry (v13 and v14).
 * Names of the heroes need no translation, the foes and the place follow the language.
 * @returns {{id: string, name: string, img: string, side: "party"|"foe", hp: number, level?: number, player?: string}[]}
 */
export function sampleCast() {
  return [
    {id: "ari", name: "Ari", img: "icons/environment/people/infantry-armored.webp", side: "party", hp: 44, level: 5, player: "Lena", role: "fighter"},
    {id: "mira", name: "Mira", img: "icons/svg/mage-shield.svg", side: "party", hp: 28, level: 5, player: "Tom", role: "wizard"},
    {id: "tovin", name: "Tovin", img: "icons/environment/people/cleric-orange.webp", side: "party", hp: 36, level: 5, player: "Sam", role: "cleric"},
    {id: "sela", name: "Sela", img: "icons/environment/people/archer.webp", side: "party", hp: 32, level: 5, player: "Jo", role: "ranger"},
    {id: "troll", name: sampleText("troll"), img: "icons/creatures/magical/humanoid-giant-forest-blue.webp", side: "foe", hp: 84},
    {id: "bandit1", name: `${sampleText("bandit")} 1`, img: "icons/environment/people/spearfighter.webp", side: "foe", hp: 16},
    {id: "bandit2", name: `${sampleText("bandit")} 2`, img: "icons/environment/people/spearfighter.webp", side: "foe", hp: 16},
    {id: "wolf", name: sampleText("wolf"), img: "icons/creatures/mammals/wolf-howl-moon-gray.webp", side: "foe", hp: 22}
  ];
}

/** Says that a button of a sample window does nothing. */
export function sampleBlocked() {
  globalThis.ui?.notifications?.info(sampleText("blocked"));
}

/** An action handler for ApplicationV2 that does nothing but say so. */
export function blockedAction(event) {
  event?.preventDefault?.();
  sampleBlocked();
}

/** A form handler for ApplicationV2 forms in sample windows: nothing is submitted. */
export async function blockedForm(event) {
  event?.preventDefault?.();
  sampleBlocked();
}

/** Classes of Foundry itself: their actions (close the window, toggle the controls) stay. */
function isCoreClass(Class) {
  const api = globalThis.foundry?.applications?.api ?? {};
  if ( Object.values(api).includes(Class) ) return true;
  return /^(ApplicationV2|HandlebarsApplication|DocumentSheetV2|DialogV2|Application|FormApplication|DocumentSheet)$/.test(Class?.name ?? "");
}

/**
 * Actions for the options of a sample window: every action of the module's window class (and its parents up to
 * Foundry's classes) that is not allowed does nothing but say so. Pass the result as `actions` to the constructor.
 * @param {Function} AppClass       the window class of the module
 * @param {string[]} [allowed]      actions that only look (switch a tab, sort, open a detail)
 * @returns {Record<string, Function>}
 */
export function sampleActions(AppClass, allowed = []) {
  const keep = new Set(allowed);
  const actions = {};
  for ( let Class = AppClass; Class && (Class !== Function.prototype) && !isCoreClass(Class); Class = Object.getPrototypeOf(Class) ) {
    const own = Object.hasOwn(Class, "DEFAULT_OPTIONS") ? Class.DEFAULT_OPTIONS?.actions : null;
    for ( const name of Object.keys(own ?? {}) ) if ( !keep.has(name) ) actions[name] = blockedAction;
  }
  return actions;
}

/** The id of a sample window: never the id of the module's real window, so both can be open. */
export function sampleId(moduleId, id) {
  return `${moduleId}-sample-${String(id).replace(/[^\w-]/g, "-")}`;
}

/** Close an open window with this id (a sample opened again replaces the old one). */
export async function closeSample(id) {
  const open = globalThis.foundry?.applications?.instances?.get(id);
  if ( open ) await open.close({animate: false}).catch(() => {});
}

function elementOf(app) {
  const element = app?.element;
  if ( !element ) return null;
  return (typeof element.querySelector === "function") ? element : (element[0] ?? null);
}

/** The banner at the top of a sample window, in its own colors so it reads on light and dark windows. */
function addBanner(app) {
  const element = elementOf(app);
  if ( !element ) return;
  element.classList.add("sephral-sample");
  const content = element.querySelector(".window-content") ?? element;
  if ( content.querySelector(":scope > .sephral-sample-banner") ) return;
  const banner = document.createElement("p");
  banner.className = "sephral-sample-banner";
  banner.textContent = sampleText("banner");
  banner.style.cssText = "flex:0 0 auto;margin:0 0 6px;padding:3px 8px;border:1px solid #c9a640;border-radius:4px;"
    + "background:#fff4c7;color:#3a2e05;font-size:12px;line-height:1.4;font-weight:600;";
  content.prepend(banner);
}

/**
 * Mark a window as a sample: the banner on top after every render and the class `sephral-sample` (also readable by
 * the module as `app.isSample`). Call it before the first render.
 * @template T
 * @param {T} app
 * @param {{banner?: boolean}} [options]   banner false: no banner (a small question inside a sample of its own)
 * @returns {T}
 */
export function markSample(app, {banner = true} = {}) {
  app.isSample = true;
  const mark = target => {
    elementOf(target)?.classList.add("sephral-sample");
    if ( banner ) addBanner(target);
  };
  const onRender = app._onRender;
  if ( typeof onRender === "function" ) {
    app._onRender = async function(...args) {
      await onRender.apply(this, args);
      mark(this);
    };
  }
  else Hooks.once(`render${app.constructor.name}`, () => mark(app));
  return app;
}

/** Clicks on buttons and links inside a sample window's content do nothing but say so. */
function blockClicks(element) {
  const content = element?.querySelector(".window-content") ?? element;
  content?.addEventListener("click", event => {
    const target = event.target.closest?.("button, a, [data-action], input[type=checkbox], input[type=radio], select");
    if ( !target || target.closest(".sephral-sample-allowed") ) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    sampleBlocked();
  }, true);
}

let SampleWindow = null;

/** An element from an element, HTML, or a function that gives one of them (called again on every render). */
async function toElement(body) {
  const value = (typeof body === "function") ? await body() : body;
  if ( typeof value !== "string" ) return value;
  const element = document.createElement("div");
  element.innerHTML = value;
  return element;
}

/**
 * A plain framed window for chat cards, texts and other parts without a window of their own. Its body is built again on
 * every render, so the texts follow the translations (the translator renders open windows again while one types).
 */
function sampleWindowClass() {
  if ( SampleWindow ) return SampleWindow;
  const {ApplicationV2} = foundry.applications.api;
  SampleWindow = class SephralSampleWindow extends ApplicationV2 {
    static DEFAULT_OPTIONS = {
      classes: ["sephral-sample-window"],
      window: {resizable: true},
      position: {width: 420, height: "auto"}
    };

    constructor({body, title, ...options} = {}) {
      super(options);
      this.body = body;
      this.sampleTitle = title;
    }

    get title() {
      return this.sampleTitle ?? super.title;
    }

    async _renderHTML() {
      return toElement(this.body);
    }

    _replaceHTML(result, content) {
      content.replaceChildren(result);
      content.style.overflowY = "auto";
    }

    async _onFirstRender(context, options) {
      await super._onFirstRender?.(context, options);
      blockClicks(this.element);
    }
  };
  return SampleWindow;
}

/**
 * Open a framed sample window that shows an element or HTML, or what a function gives (built again on every render).
 * @param {{moduleId: string, id: string, title: string, body: HTMLElement|string|Function, width?: number, classes?: string[]}} options
 * @returns {Promise<Application>}
 */
export async function openSampleHtml({moduleId, id, title, body, width = 420, classes = []}) {
  const appId = sampleId(moduleId, id);
  await closeSample(appId);
  const Window = sampleWindowClass();
  const app = markSample(new Window({id: appId, title, body, position: {width}, classes: ["sephral-sample-window", ...classes]}));
  await app.render({force: true});
  return app;
}

/**
 * A chat message of the module as it shows in the chat log, rendered from a message that is never saved, in its own
 * window. The module's own render hooks run like for a real message (they style and wire the card, clicks stay blocked).
 * content, flags and rolls may be functions: they are called again on every render.
 * @param {{moduleId: string, id: string, content: string|Function, title?: string, speaker?: object,
 *   flags?: object|Function, rolls?: object[]|Function, flavor?: string, whisper?: string[], width?: number,
 *   afterRender?: (element: HTMLElement, message: object) => void}} options
 *   rolls: evaluated Roll objects (never sent); afterRender: change the rendered message (open a panel, add a class)
 * @returns {Promise<Application>}
 */
export async function openSampleChat({moduleId, id, content, title = sampleText("chatTitle"), speaker = null, flags = {}, rolls = [],
  flavor = "", whisper = [], width = 360, afterRender = null}) {
  const value = async v => ((typeof v === "function") ? v() : v);
  const body = async () => {
    const Message = globalThis.getDocumentClass?.("ChatMessage") ?? globalThis.ChatMessage;
    const message = new Message({
      // an id of its own: modules that look a message up by its id find nothing, and never a real message
      _id: globalThis.foundry?.utils?.randomID?.() ?? undefined,
      content: await value(content),
      speaker: speaker ?? {alias: globalThis.game?.modules?.get(moduleId)?.title ?? moduleId},
      author: globalThis.game?.user?.id,
      // a message that is never saved gets no time from the server: "just now" instead of a date far back
      timestamp: Date.now(),
      flavor,
      whisper,
      rolls: ((await value(rolls)) ?? []).map(roll => ((typeof roll?.toJSON === "function") ? roll.toJSON() : roll)),
      flags: (await value(flags)) ?? {}
    });
    const rendered = (typeof message.renderHTML === "function") ? await message.renderHTML() : (await message.getHTML())?.[0];
    const log = document.createElement("ol");
    log.className = "chat-log sephral-sample-chat";
    log.style.cssText = "list-style:none;margin:0;padding:0;";
    if ( rendered ) {
      log.append(rendered);
      await afterRender?.(rendered, message);
    }
    return log;
  };
  return openSampleHtml({moduleId, id, title, body, width, classes: ["sephral-sample-chat-window"]});
}

/**
 * A text the module copies or exports (for Discord, a file), shown read only.
 * @param {{moduleId: string, id: string, text: string|Function, title?: string, width?: number, rows?: number}} options
 * @returns {Promise<Application>}
 */
export async function openSampleText({moduleId, id, text, title = sampleText("textTitle"), width = 520, rows = 16}) {
  const body = async () => {
    const area = document.createElement("textarea");
    area.readOnly = true;
    area.rows = rows;
    area.value = (typeof text === "function") ? await text() : text;
    area.style.cssText = "width:100%;font-family:monospace;font-size:12px;resize:vertical;";
    area.classList.add("sephral-sample-allowed");
    return area;
  };
  return openSampleHtml({moduleId, id, title, body, width});
}

/**
 * A question of the module (a DialogV2) as a sample: its buttons only say that they do nothing, Close and Escape close it.
 * @param {{moduleId: string, id: string, title: string, content: string|Function, buttons?: {label: string, icon?: string,
 *   default?: boolean}[], width?: number, classes?: string[], banner?: boolean,
 *   render?: (event: Event, dialog: object) => void}} options
 *   render: wire the content like the real question does (its listeners run, nothing is submitted); classes: the
 *   classes of the real question (the look of the module); banner false: no banner
 * @returns {Promise<Application>}
 */
export async function openSampleDialog({moduleId, id, title, content, buttons = [{label: "OK", icon: "fa-solid fa-check", default: true}], width = 420,
  classes = [], banner = true, render = null}) {
  const appId = sampleId(moduleId, id);
  await closeSample(appId);
  const {DialogV2} = foundry.applications.api;
  const html = (typeof content === "function") ? await content() : content;
  const app = new DialogV2({
    id: appId,
    classes,
    window: {title},
    position: {width},
    content: html,
    buttons: buttons.map((button, index) => ({action: `sample${index}`, ...button, callback: () => {
      sampleBlocked();
      return null;
    }})),
    rejectClose: false,
    // a button says that it does nothing and the question stays open
    form: {closeOnSubmit: false},
    submit: async () => {}
  });
  markSample(app, {banner});
  if ( render ) app.addEventListener?.("render", event => render(event, app));
  await app.render({force: true});
  return app;
}

/**
 * An unsaved document for a sample window (an actor of the cast, a journal entry, a token): built in memory, never
 * created. Its writes (update, delete, flags, embedded documents) only say that they do nothing.
 * @param {string} documentName   "Actor", "JournalEntry", "Item", ...
 * @param {object} data           the document data; an _id of its own is added
 * @returns {object}
 */
export function sampleDocument(documentName, data = {}) {
  const Class = globalThis.getDocumentClass?.(documentName) ?? globalThis.CONFIG?.[documentName]?.documentClass;
  const document = new Class({_id: globalThis.foundry?.utils?.randomID?.(), ...data});
  const refuse = async () => {
    sampleBlocked();
    return null;
  };
  for ( const name of ["update", "delete", "setFlag", "unsetFlag", "createEmbeddedDocuments", "updateEmbeddedDocuments", "deleteEmbeddedDocuments"] ) {
    Object.defineProperty(document, name, {value: refuse, configurable: true});
  }
  document.isSample = true;
  return document;
}

export const __test__ = {TEXTS, isCoreClass};
