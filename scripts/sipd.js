import {
  describeOptimizationPlan,
  getImageOptimizationPlan,
  hasOptimizationOptions,
  optimizationLabelVariant,
  optimizeImageFile,
  resolveOptimizationOptions,
  summarizeOptimizationPlans
} from "./image-optimize.js";
import {
  batchItemName,
  buildChatImageContent,
  clampPointToRect,
  clampSpan,
  imagePostMode,
  layoutTileGrid,
  normalizeRecipientIds,
  parseImageUrlList,
  parseUriList,
  pickDroppedUri,
  toLegacyRollMode,
  toMessageMode,
  withVersionQuery
} from "./target-helpers.js";

const MODULE_ID = "sephrals-image-paste-drop";
const STORAGE_ROOT = "clipboard-images";
const ENABLE_PASTE_SETTING = "enablePasteImport";
const ENABLE_DROP_SETTING = "enableDropImport";
const DEFAULT_ACTION_SETTING = "defaultAction";
const REMEMBER_LAST_ACTION_SETTING = "rememberLastAction";
const LAST_ACTION_SETTING = "lastAction";
const DEFAULT_SHARE_SETTING = "defaultShareToPlayers";
const DEFAULT_ACTIVATE_SCENE_SETTING = "defaultActivateScene";
const DEFAULT_NAVIGATION_SETTING = "defaultNavigation";
const DEFAULT_UPLOAD_DIRECTORY_SETTING = "defaultUploadDirectory";
const UPLOAD_DIRECTORY_HISTORY_SETTING = "uploadDirectoryHistory";
const ALLOW_PLAYER_TOOL_SETTING = "allowPlayerToolUse";
const PLAYER_ACTIONS_SETTING = "playerAllowedActions";
const STORAGE_FOLDER_SETTING = "storageFolder";
const UI_LANGUAGE_SETTING = "uiLanguage";
const UI_THEME_SETTING = "uiTheme";
const WINDOW_STATE_SETTING = "windowState";
const LAST_BATCH_ACTION_SETTING = "lastBatchAction";
const MAX_IMAGE_SIZE_SETTING = "maxImageSize";
const CONVERT_WEBP_SETTING = "convertToWebp";
const WEBP_QUALITY_SETTING = "webpQuality";
const ACKNOWLEDGED_VERSIONS_SETTING = "acknowledgedVersions";
// The Foundry version the module was verified against (see the self-test).
const TESTED_VERSIONS = Object.freeze({core: "14.369"});
const MAX_IMAGE_SIZE_CHOICES = Object.freeze([0, 2048, 4096, 8192]);
const WORLD_STORAGE_ROOT = MODULE_ID;
const SUPPORTED_UI_LANGUAGES = Object.freeze(["en", "de"]);
const DEFAULT_UI_LANGUAGE = "en";
const UI_THEMES = {
  SIGNATURE: "signature",
  FOUNDRY: "foundry"
};
const WINDOW_KEYS = {
  IMPORT: "import",
  SETTINGS: "settings",
  PREVIEW: "preview",
  BATCH: "batch"
};
// The import dialogs fit their height to the content. Only their width is remembered.
const AUTO_HEIGHT_WINDOW_KEYS = Object.freeze([WINDOW_KEYS.IMPORT, WINDOW_KEYS.BATCH]);
const IMPORT_WINDOW_WIDTH = 860;
const BATCH_WINDOW_WIDTH = 900;
const ACTIONS = {
  SCENE_BACKGROUND: "scene-background",
  SCENE_BACKGROUND_CURRENT: "scene-background-current",
  SCENE_FOREGROUND_CURRENT: "scene-foreground-current",
  TILE_CENTERED: "tile-centered",
  TILE_FIT: "tile-fit",
  JOURNAL_IMAGE: "journal-image",
  MAP_PIN: "map-pin",
  TOKEN_IMAGE: "token-image",
  ACTOR_PORTRAIT: "actor-portrait",
  CHAT_IMAGE: "chat-image",
  UPLOAD_DIRECTORY: "upload-directory",
  SHARE_IMAGE: "share-image",
  PREVIEW_ONLY: "preview-only"
};
// Targets for several images at once that have no single-image counterpart
const BATCH_ACTIONS = {
  JOURNAL_PAGES: "batch-journal-pages",
  TILE_GRID: "batch-tile-grid"
};
const CHAT_MODES = {
  CURRENT: "current",
  PUBLIC: "public"
};
// Targets the GM can open up for players on top of the preview. Scene, tile and map pin targets stay GM-only,
// because Foundry requires the Assistant role to create scenes, tiles and notes.
// Token and portrait targets only touch tokens and actors the player owns.
const PLAYER_SELECTABLE_ACTIONS = Object.freeze([
  ACTIONS.JOURNAL_IMAGE,
  ACTIONS.TOKEN_IMAGE,
  ACTIONS.ACTOR_PORTRAIT,
  ACTIONS.CHAT_IMAGE,
  ACTIONS.UPLOAD_DIRECTORY,
  ACTIONS.SHARE_IMAGE
]);
// Targets that can show a linked image the browser could not download. Foundry draws scene backgrounds,
// tiles and tokens with WebGL, which needs the same cross-origin access the download lacked, and uploads need a copy.
// Portraits, chat posts and map pins show the image in HTML (a map pin draws only its icon on the canvas).
const REMOTE_URL_ACTIONS = Object.freeze([
  ACTIONS.JOURNAL_IMAGE,
  ACTIONS.MAP_PIN,
  ACTIONS.ACTOR_PORTRAIT,
  ACTIONS.CHAT_IMAGE,
  ACTIONS.SHARE_IMAGE,
  ACTIONS.PREVIEW_ONLY
]);
// Targets that need a viewed scene
const SCENE_ACTIONS = Object.freeze([
  ACTIONS.SCENE_BACKGROUND_CURRENT,
  ACTIONS.SCENE_FOREGROUND_CURRENT,
  ACTIONS.TILE_CENTERED,
  ACTIONS.TILE_FIT,
  ACTIONS.MAP_PIN,
  BATCH_ACTIONS.TILE_GRID
]);
const IMAGE_URL_EXTENSIONS = Object.freeze(["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"]);
// Players cannot create directories, so their uploads go into folders a GM client prepares.
const PLAYER_UPLOAD_DIRECTORY = `${STORAGE_ROOT}/players`;
const SHARED_UPLOAD_DIRECTORY = `${STORAGE_ROOT}/shared`;
const MODULE_TRANSLATION_CACHE = new Map();
let MODULE_TRANSLATION_LOAD = null;

function getAllActionChoices() {
  return [
    {value: ACTIONS.SCENE_BACKGROUND, label: localize("SIPD.Action.SceneBackground")},
    {value: ACTIONS.SCENE_BACKGROUND_CURRENT, label: localize("SIPD.Action.SceneBackgroundCurrent")},
    {value: ACTIONS.SCENE_FOREGROUND_CURRENT, label: localize("SIPD.Action.SceneForegroundCurrent")},
    {value: ACTIONS.TILE_CENTERED, label: localize("SIPD.Action.TileCentered")},
    {value: ACTIONS.TILE_FIT, label: localize("SIPD.Action.TileFit")},
    {value: ACTIONS.JOURNAL_IMAGE, label: localize("SIPD.Action.JournalImage")},
    {value: ACTIONS.MAP_PIN, label: localize("SIPD.Action.MapPin")},
    {value: ACTIONS.TOKEN_IMAGE, label: localize("SIPD.Action.TokenImage")},
    {value: ACTIONS.ACTOR_PORTRAIT, label: localize("SIPD.Action.ActorPortrait")},
    {value: ACTIONS.CHAT_IMAGE, label: localize("SIPD.Action.ChatImage")},
    {value: ACTIONS.UPLOAD_DIRECTORY, label: localize("SIPD.Action.UploadDirectory")},
    {value: ACTIONS.SHARE_IMAGE, label: localize("SIPD.Action.ShareImage")},
    {value: ACTIONS.PREVIEW_ONLY, label: localize("SIPD.Action.PreviewOnly")}
  ];
}

function getActionSettingChoices() {
  return Object.fromEntries(getAllActionChoices().map(choice => [choice.value, choice.label]));
}

function getPlayerActionSettingChoices() {
  return Object.fromEntries(getAllActionChoices()
    .filter(choice => PLAYER_SELECTABLE_ACTIONS.includes(choice.value))
    .map(choice => [choice.value, choice.label]));
}

function getThemeSettingChoices() {
  return Object.fromEntries(getThemeChoices().map(choice => [choice.value, choice.label]));
}

function interpolateTemplate(template, data = {}) {
  return String(template ?? "").replace(/\{([^}]+)\}/g, (_match, field) => {
    const replacement = data[field];
    return replacement === undefined || replacement === null ? `{${field}}` : String(replacement);
  });
}

function getRegisteredSettingValue(settingKey, fallback) {
  try {
    const value = game.settings.get(MODULE_ID, settingKey);
    return value === undefined ? fallback : value;
  } catch (_error) {
    return fallback;
  }
}

function normalizeUiLanguage(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if ( !normalized ) return DEFAULT_UI_LANGUAGE;
  if ( SUPPORTED_UI_LANGUAGES.includes(normalized) ) return normalized;

  const baseLanguage = normalized.split(/[-_.]/)[0];
  return SUPPORTED_UI_LANGUAGES.includes(baseLanguage) ? baseLanguage : DEFAULT_UI_LANGUAGE;
}

function getPreferredLanguage() {
  return getRegisteredSettingValue(UI_LANGUAGE_SETTING, "default");
}

function getModuleLanguage(preferredLanguage = getPreferredLanguage()) {
  if ( SUPPORTED_UI_LANGUAGES.includes(preferredLanguage) ) return preferredLanguage;
  return normalizeUiLanguage(game.i18n?.lang);
}

// Bundled translations only override Foundry's own when a language was picked explicitly,
// so "Follow Foundry" keeps community translations from game.i18n.
function getOverrideLanguage(preferredLanguage = getPreferredLanguage()) {
  return SUPPORTED_UI_LANGUAGES.includes(preferredLanguage) ? preferredLanguage : null;
}

async function loadModuleTranslations(language) {
  const normalized = normalizeUiLanguage(language);
  if ( MODULE_TRANSLATION_CACHE.has(normalized) ) return MODULE_TRANSLATION_CACHE.get(normalized);

  const response = await fetch(`modules/${MODULE_ID}/lang/${normalized}.json`);
  if ( !response.ok ) throw new Error(`Failed to load ${normalized} translations (${response.status})`);

  const translations = await response.json();
  MODULE_TRANSLATION_CACHE.set(normalized, translations);
  return translations;
}

async function ensureModuleTranslationsLoaded() {
  if ( !MODULE_TRANSLATION_LOAD ) {
    MODULE_TRANSLATION_LOAD = Promise.all(SUPPORTED_UI_LANGUAGES.map((language) => loadModuleTranslations(language)))
      .catch((error) => {
        console.warn(`${MODULE_ID} |`, error);
        return null;
      });
  }

  return MODULE_TRANSLATION_LOAD;
}

function refreshLocalizedUi() {
  for ( const app of Object.values(ui?.windows ?? {}) ) {
    const element = getApplicationElement(app);
    if ( !element?.classList?.contains?.("sipd-app") ) continue;
    if ( app.options?.window ) app.options.window.title = localize("SIPD.Dialog.Title");
    if ( typeof app.render === "function" ) app.render(true);
  }
}

function resetModuleTranslations() {
  MODULE_TRANSLATION_CACHE.clear();
  MODULE_TRANSLATION_LOAD = null;
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, UI_LANGUAGE_SETTING, {
    scope: "client",
    config: true,
    name: game.i18n.localize("SIPD.Settings.Language.Label"),
    hint: game.i18n.localize("SIPD.Settings.Language.Hint"),
    type: String,
    choices: {
      default: game.i18n.localize("SIPD.Language.Default"),
      de: game.i18n.localize("SIPD.Language.De"),
      en: game.i18n.localize("SIPD.Language.En")
    },
    default: "default",
    onChange: () => {
      void ensureModuleTranslationsLoaded().then(() => refreshLocalizedUi());
    }
  });

  game.settings.register(MODULE_ID, ENABLE_PASTE_SETTING, {
    name: localize("SIPD.Settings.EnablePaste.Label"),
    hint: localize("SIPD.Settings.EnablePaste.Hint"),
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, ENABLE_DROP_SETTING, {
    scope: "client",
    config: true,
    name: localize("SIPD.Settings.EnableDrop.Label"),
    hint: localize("SIPD.Settings.EnableDrop.Hint"),
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, DEFAULT_ACTION_SETTING, {
    scope: "client",
    config: true,
    name: localize("SIPD.Settings.DefaultAction.Label"),
    hint: localize("SIPD.Settings.DefaultAction.Hint"),
    type: String,
    choices: getActionSettingChoices(),
    default: ACTIONS.SCENE_BACKGROUND_CURRENT
  });

  game.settings.register(MODULE_ID, REMEMBER_LAST_ACTION_SETTING, {
    scope: "client",
    config: true,
    name: localize("SIPD.Settings.RememberAction.Label"),
    hint: localize("SIPD.Settings.RememberAction.Hint"),
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, LAST_ACTION_SETTING, {
    scope: "client",
    config: false,
    type: String,
    default: ACTIONS.SCENE_BACKGROUND_CURRENT
  });

  game.settings.register(MODULE_ID, DEFAULT_SHARE_SETTING, {
    scope: "client",
    config: true,
    name: localize("SIPD.Settings.DefaultShare.Label"),
    hint: localize("SIPD.Settings.DefaultShare.Hint"),
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, DEFAULT_ACTIVATE_SCENE_SETTING, {
    scope: "client",
    config: true,
    name: localize("SIPD.Settings.DefaultActivateScene.Label"),
    hint: localize("SIPD.Settings.DefaultActivateScene.Hint"),
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, DEFAULT_NAVIGATION_SETTING, {
    scope: "client",
    config: true,
    name: localize("SIPD.Settings.DefaultNavigation.Label"),
    hint: localize("SIPD.Settings.DefaultNavigation.Hint"),
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, DEFAULT_UPLOAD_DIRECTORY_SETTING, {
    scope: "client",
    config: false,
    type: String,
    default: defaultUploadDirectory()
  });

  game.settings.register(MODULE_ID, UPLOAD_DIRECTORY_HISTORY_SETTING, {
    scope: "client",
    config: false,
    type: Object,
    default: []
  });

  game.settings.register(MODULE_ID, ALLOW_PLAYER_TOOL_SETTING, {
    scope: "world",
    config: true,
    name: localize("SIPD.Settings.AllowPlayerToolUse.Label"),
    hint: localize("SIPD.Settings.AllowPlayerToolUse.Hint"),
    type: Boolean,
    default: false,
    onChange: () => {
      void ensurePlayerStorageDirectories();
    }
  });

  const {SetField, StringField} = foundry.data.fields;
  game.settings.register(MODULE_ID, PLAYER_ACTIONS_SETTING, {
    scope: "world",
    config: true,
    name: localize("SIPD.Settings.PlayerActions.Label"),
    hint: localize("SIPD.Settings.PlayerActions.Hint"),
    type: new SetField(new StringField({required: true, blank: false, choices: getPlayerActionSettingChoices()})),
    default: [],
    onChange: () => {
      void ensurePlayerStorageDirectories();
    }
  });

  game.settings.register(MODULE_ID, STORAGE_FOLDER_SETTING, {
    scope: "world",
    config: true,
    name: localize("SIPD.Settings.StorageFolder.Label"),
    hint: localize("SIPD.Settings.StorageFolder.Hint"),
    type: String,
    default: "",
    onChange: () => {
      void ensurePlayerStorageDirectories();
    }
  });

  game.settings.register(MODULE_ID, UI_THEME_SETTING, {
    scope: "client",
    config: true,
    name: localize("SIPD.Settings.Theme.Label"),
    hint: localize("SIPD.Settings.Theme.Hint"),
    type: String,
    choices: getThemeSettingChoices(),
    default: UI_THEMES.SIGNATURE
  });

  game.settings.register(MODULE_ID, WINDOW_STATE_SETTING, {
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register(MODULE_ID, LAST_BATCH_ACTION_SETTING, {
    scope: "client",
    config: false,
    type: String,
    default: BATCH_ACTIONS.JOURNAL_PAGES
  });

  game.settings.register(MODULE_ID, MAX_IMAGE_SIZE_SETTING, {
    scope: "client",
    config: true,
    name: localize("SIPD.Settings.MaxImageSize.Label"),
    hint: localize("SIPD.Settings.MaxImageSize.Hint"),
    type: Number,
    choices: getMaxImageSizeChoices(),
    default: 0
  });

  game.settings.register(MODULE_ID, CONVERT_WEBP_SETTING, {
    scope: "client",
    config: true,
    name: localize("SIPD.Settings.ConvertWebp.Label"),
    hint: localize("SIPD.Settings.ConvertWebp.Hint"),
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, WEBP_QUALITY_SETTING, {
    scope: "client",
    config: true,
    name: localize("SIPD.Settings.WebpQuality.Label"),
    hint: localize("SIPD.Settings.WebpQuality.Hint"),
    type: Number,
    range: {min: 50, max: 100, step: 5},
    default: 85
  });

  game.settings.register(MODULE_ID, ACKNOWLEDGED_VERSIONS_SETTING, {
    scope: "client",
    config: false,
    type: String,
    default: ""
  });

  game.settings.registerMenu(MODULE_ID, "selfTest", {
    name: localize("SIPD.SelfTest.Title"),
    label: localize("SIPD.SelfTest.Run"),
    hint: localize("SIPD.SelfTest.Hint"),
    icon: "fa-solid fa-stethoscope",
    type: SelfTestMenu,
    restricted: true
  });

  Hooks.on("renderChatMessageHTML", onRenderChatMessage);
});

function getMaxImageSizeChoices() {
  return Object.fromEntries(MAX_IMAGE_SIZE_CHOICES.map(size => [
    size,
    size ? `${size} px` : localize("SIPD.Settings.MaxImageSize.Off")
  ]));
}

// Images posted to chat open in a popout on click, like images in journal pages.
function onRenderChatMessage(_message, html) {
  const element = html instanceof HTMLElement ? html : html?.[0];
  for ( const image of element?.querySelectorAll?.(".sipd-chat-images img") ?? [] ) {
    image.addEventListener("click", () => openImagePreview(image.getAttribute("src"), image.getAttribute("alt") || ""));
  }
}

Hooks.once("ready", () => {
  void ensureModuleTranslationsLoaded().then(() => noticeNewVersions());
  const module = game.modules?.get?.(MODULE_ID);
  if ( module ) module.api = {runSelfTest};
  void ensurePlayerStorageDirectories();
  document.addEventListener("paste", onPaste, true);
  document.addEventListener("dragover", onDragOver, true);
  document.addEventListener("drop", onDrop, true);
});

async function onPaste(event) {
  if ( !game.settings.get(MODULE_ID, ENABLE_PASTE_SETTING) ) return;
  if ( isEditableTarget(event.target) ) return;
  if ( !canCurrentUserUseTool() ) return;

  // Several images (or several image links, one per line) become a batch
  const clipboardImages = extractClipboardImages(event);
  const imageUrls = clipboardImages.length ? [] : extractClipboardImageUrls(event);
  const batch = clipboardImages.length > 1 ? clipboardImages : imageUrls;
  const clipboardImage = clipboardImages[0] ?? null;
  // The same link on several lines collapses to one link, which is a normal single image
  const imageUrl = (clipboardImage || (batch.length > 1)) ? null : (batch[0] ?? extractClipboardImageUrl(event));
  if ( !clipboardImage && !imageUrl && (batch.length < 2) ) return;

  event.preventDefault();
  event.stopPropagation();

  try {
    if ( batch.length > 1 ) await importImageBatch(batch);
    else await importImage(async () => clipboardImage ?? fetchDroppedImage(imageUrl));
  } catch (error) {
    console.error(`${MODULE_ID} | Paste handling failed`, error);
    ui.notifications.error(localize("SIPD.Notification.Error", {message: error.message ?? String(error)}));
  }
}

function onDragOver(event) {
  if ( !game.settings.get(MODULE_ID, ENABLE_DROP_SETTING) ) return;
  if ( isEditableTarget(event.target) ) return;
  if ( !canCurrentUserUseTool() ) return;
  if ( !hasTransferableImage(event.dataTransfer) ) return;

  event.preventDefault();
  if ( event.dataTransfer ) event.dataTransfer.dropEffect = "copy";
}

async function onDrop(event) {
  if ( !game.settings.get(MODULE_ID, ENABLE_DROP_SETTING) ) return;
  if ( isEditableTarget(event.target) ) return;
  if ( !canCurrentUserUseTool() ) return;
  if ( !hasTransferableImage(event.dataTransfer) ) return;

  // Dropped files can only be read during the event, so the batch is collected before anything awaits
  const droppedFiles = extractDroppedImageFiles(event.dataTransfer);
  // Dropped text without a link (a text selection, Foundry's own drag data) is left to Foundry
  if ( !droppedFiles.length && !getDroppedUri(event.dataTransfer) ) return;

  event.preventDefault();
  event.stopPropagation();

  // Tiles from a drop onto the canvas go where the image was dropped
  const dropPoint = getCanvasDropPoint(event);
  const droppedUrls = droppedFiles.length ? [] : extractDroppedImageUrls(event.dataTransfer);
  const batch = droppedFiles.length > 1 ? droppedFiles : droppedUrls;
  try {
    if ( batch.length > 1 ) await importImageBatch(batch, {dropPoint});
    else await importImage(() => extractDroppedImage(event.dataTransfer), {dropPoint});
  } catch (error) {
    console.error(`${MODULE_ID} | Drop handling failed`, error);
    ui.notifications.error(localize("SIPD.Notification.Error", {message: error.message ?? String(error)}));
  }
}

function isEditableTarget(target) {
  if ( !(target instanceof HTMLElement) ) return false;
  return Boolean(target.closest([
    "input",
    "textarea",
    "select",
    "[contenteditable='']",
    "[contenteditable='true']",
    ".editor-content",
    ".cm-content",
    ".prosemirror"
  ].join(", ")));
}

function extractClipboardImage(event) {
  return extractClipboardImages(event)[0] ?? null;
}

function extractClipboardImages(event) {
  return collectImageFiles(event.clipboardData);
}

// Image files of a clipboard or drop, from its items or else from its file list.
function collectImageFiles(transfer) {
  const files = [];
  for ( const item of Array.from(transfer?.items ?? []) ) {
    if ( item.kind !== "file" ) continue;
    if ( !item.type?.startsWith("image/") ) continue;
    const file = item.getAsFile();
    if ( file ) files.push(file);
  }
  if ( files.length ) return files;
  return Array.from(transfer?.files ?? []).filter(file => file.type?.startsWith("image/"));
}

// Copied image links arrive as plain text. Only a single image URL counts, any other text is left alone.
function extractClipboardImageUrl(event) {
  return parseImageUrl(event.clipboardData?.getData?.("text/plain"));
}

// Several image links, one per line
function extractClipboardImageUrls(event) {
  return parseImageUrlList(event.clipboardData?.getData?.("text/plain"), parseImageUrl);
}

function parseImageUrl(text) {
  const value = String(text ?? "").trim();
  if ( !value || /\s/.test(value) ) return null;
  if ( /^data:image\/[a-z0-9.+-]+[;,]/i.test(value) ) return value;

  let url;
  try {
    url = new URL(value);
  } catch (_error) {
    return null;
  }
  if ( !["http:", "https:"].includes(url.protocol) ) return null;
  return IMAGE_URL_EXTENSIONS.includes(getFileExtension(url.pathname)) ? url.href : null;
}

function hasTransferableImage(dataTransfer) {
  if ( !dataTransfer ) return false;

  const files = Array.from(dataTransfer.files ?? []);
  if ( files.some(file => file.type?.startsWith("image/")) ) return true;

  const items = Array.from(dataTransfer.items ?? []);
  if ( items.some(item => item.kind === "file" && item.type?.startsWith("image/")) ) return true;

  const types = Array.from(dataTransfer.types ?? []);
  return types.includes("text/uri-list") || types.includes("text/html");
}

async function extractDroppedImage(dataTransfer) {
  const items = Array.from(dataTransfer?.items ?? []);
  for ( const item of items ) {
    if ( item.kind !== "file" ) continue;
    if ( !item.type.startsWith("image/") ) continue;
    const file = item.getAsFile();
    if ( file ) return file;
  }

  const files = Array.from(dataTransfer?.files ?? []);
  const imageFile = files.find(file => file.type?.startsWith("image/"));
  if ( imageFile ) return imageFile;

  const uri = getDroppedUri(dataTransfer);
  if ( !uri ) return null;

  return fetchDroppedImage(uri);
}

function getDroppedUri(dataTransfer) {
  const read = (type) => {
    try {
      return dataTransfer?.getData?.(type) ?? "";
    } catch (_error) {
      return "";
    }
  };
  return pickDroppedUri({uriList: read("text/uri-list"), text: read("text/plain"), html: read("text/html")});
}

function extractDroppedImageFiles(dataTransfer) {
  return collectImageFiles(dataTransfer);
}

// A drop of several links lists them in text/uri-list, one per line
function extractDroppedImageUrls(dataTransfer) {
  return parseUriList(dataTransfer?.getData?.("text/uri-list"));
}

async function fetchDroppedImage(rawUri) {
  const uri = rawUri.split(/\r?\n/).find(line => line && !line.startsWith("#"))?.trim();
  if ( !uri ) return null;

  let response;
  try {
    response = await fetch(uri);
  } catch (error) {
    throw createFetchFailedError(uri);
  }

  if ( !response.ok ) {
    throw createFetchFailedError(uri);
  }

  const blob = await response.blob();
  const mimeType = blob.type || guessMimeTypeFromUri(uri);
  if ( !mimeType?.startsWith("image/") ) return null;

  const extension = extensionForMimeType(mimeType);
  const fileName = fileNameFromUri(uri, extension);
  return new File([blob], fileName, {type: mimeType, lastModified: Date.now()});
}

// Carries the URL along, so the caller can offer to use it directly (CORS blocks or network errors).
function createFetchFailedError(uri) {
  const error = new Error(localize("SIPD.Error.DropFetchFailed"));
  error.remoteUrl = uri;
  return error;
}

function guessMimeTypeFromUri(uri) {
  const normalized = uri.toLowerCase();
  if ( normalized.endsWith(".jpg") || normalized.endsWith(".jpeg") ) return "image/jpeg";
  if ( normalized.endsWith(".gif") ) return "image/gif";
  if ( normalized.endsWith(".webp") ) return "image/webp";
  if ( normalized.endsWith(".svg") ) return "image/svg+xml";
  if ( normalized.endsWith(".avif") ) return "image/avif";
  if ( normalized.endsWith(".png") ) return "image/png";
  return "";
}

function fileNameFromUri(uri, fallbackExtension) {
  try {
    const url = new URL(uri);
    // A data: URL holds the image itself, its "path" is no file name
    const candidate = url.protocol === "data:" ? "" : url.pathname.split("/").at(-1)?.trim();
    if ( candidate ) return candidate;
  } catch (error) {}

  return `${slugify(defaultDocumentName()) || "dropped-image"}.${fallbackExtension}`;
}

function canCurrentUserUseTool() {
  return game.user?.isGM || game.settings.get(MODULE_ID, ALLOW_PLAYER_TOOL_SETTING);
}

function getPlayerActionWhitelist() {
  const value = getRegisteredSettingValue(PLAYER_ACTIONS_SETTING, []);
  const actions = value instanceof Set || Array.isArray(value) ? Array.from(value) : [];
  return new Set(actions.filter(action => PLAYER_SELECTABLE_ACTIONS.includes(action)));
}

function canUserPerformAction(action) {
  const user = game.user;
  if ( !user ) return false;
  if ( user.isGM ) return true;
  if ( !canCurrentUserUseTool() ) return false;
  if ( action === ACTIONS.PREVIEW_ONLY ) return true;
  if ( !getPlayerActionWhitelist().has(action) ) return false;

  // The GM opt-in above is the only gate for sharing: Foundry relays shared images without a permission check.
  // Token and portrait targets also check ownership of each token or actor when they run.
  switch ( action ) {
    case ACTIONS.UPLOAD_DIRECTORY:
    case ACTIONS.SHARE_IMAGE:
    case ACTIONS.CHAT_IMAGE:
    case ACTIONS.TOKEN_IMAGE:
    case ACTIONS.ACTOR_PORTRAIT:
      return user.hasPermission("FILES_UPLOAD");
    case ACTIONS.JOURNAL_IMAGE:
      return user.hasPermission("FILES_UPLOAD") && user.hasPermission("JOURNAL_CREATE");
    default:
      return false;
  }
}

function canUserShareImages() {
  return canUserPerformAction(ACTIONS.SHARE_IMAGE);
}

function getPermittedActions() {
  if ( game.user?.isGM ) return Object.values(ACTIONS);
  if ( !canCurrentUserUseTool() ) return [];
  return Object.values(ACTIONS).filter(action => canUserPerformAction(action));
}

// Loads the image and runs the import. An image URL that cannot be downloaded may be used directly instead.
async function importImage(loadImage, options={}) {
  let file;
  try {
    file = await loadImage();
  } catch (error) {
    if ( !error?.remoteUrl ) throw error;
    return handleRemoteImageUrl(error.remoteUrl, options);
  }
  if ( file ) await handleImportedImage(file, options);
}

async function handleImportedImage(file, {dropPoint=null}={}) {
  const preparedFile = prepareClipboardFile(file);
  const objectUrl = URL.createObjectURL(preparedFile);
  let releaseObjectUrl = true;

  try {
    const dimensions = await readImageDimensions(objectUrl);
    const optimizePlan = await getImageOptimizationPlan(preparedFile, dimensions, getImageOptimizationOptions());
    const decision = await promptForImportDecision({previewUrl: objectUrl, ...dimensions, optimizePlan, sourceType: preparedFile.type});
    if ( !decision ) return;

    if ( game.user?.isGM && actionUsesSelectableUploadDirectory(decision.action) ) {
      await rememberUploadDirectory(decision.uploadDirectory);
    }

    // Shrinking and WebP only apply to uploads, unless the dialog switched them off. The file name hashes the final bytes.
    const needsUpload = requiresPersistentPath(decision.action, decision.shareToPlayers);
    const upload = needsUpload
      ? await prepareUploadFile(preparedFile, dimensions, {optimize: decision.optimize})
      : {file: preparedFile, ...dimensions};
    const reusableUploadTarget = getReusableManagedUploadTarget(decision.action, upload.file);
    const path = needsUpload
      ? await uploadClipboardFile(upload.file, {directory: decision.uploadDirectory, targetPath: reusableUploadTarget})
      : objectUrl;

    if ( path === objectUrl ) releaseObjectUrl = false;

    await executeAction({
      ...getDecisionOptions(decision),
      path,
      width: upload.width,
      height: upload.height,
      temporaryObjectUrl: path === objectUrl ? objectUrl : null,
      dropPoint
    });
  } finally {
    if ( releaseObjectUrl ) URL.revokeObjectURL(objectUrl);
  }
}

function getDecisionOptions(decision) {
  return {
    action: decision.action,
    name: decision.name,
    shareToPlayers: decision.shareToPlayers,
    activateScene: decision.activateScene,
    navigation: decision.navigation,
    recipients: decision.recipients ?? [],
    prototypeToken: Boolean(decision.prototypeToken),
    chatMode: decision.chatMode ?? CHAT_MODES.CURRENT
  };
}

function getImageOptimizationOptions() {
  return {
    maxSize: Number(getRegisteredSettingValue(MAX_IMAGE_SIZE_SETTING, 0)) || 0,
    webp: Boolean(getRegisteredSettingValue(CONVERT_WEBP_SETTING, false)),
    quality: Number(getRegisteredSettingValue(WEBP_QUALITY_SETTING, 85))
  };
}

// The file that gets uploaded, shrunk or converted when the settings ask for it and the import did not opt out.
async function prepareUploadFile(file, dimensions, {optimize=true}={}) {
  const options = resolveOptimizationOptions(getImageOptimizationOptions(), optimize);
  if ( !hasOptimizationOptions(options) ) return {file, ...dimensions};
  const result = await optimizeImageFile(file, dimensions, options);
  return {file: result.file, width: result.width, height: result.height};
}

// Several images from one paste or drop. Links that cannot be downloaded are skipped.
async function importImageBatch(sources, options={}) {
  const files = [];
  let skipped = 0;
  for ( const source of sources ) {
    if ( typeof source !== "string" ) {
      files.push(source);
      continue;
    }
    try {
      const file = await fetchDroppedImage(source);
      if ( file ) files.push(file);
      else skipped += 1;
    } catch (_error) {
      skipped += 1;
    }
  }

  if ( skipped ) ui.notifications.warn(localize("SIPD.Notification.BatchSkipped", {count: skipped}));
  if ( !files.length ) throw new Error(localize("SIPD.Error.DropFetchFailed"));
  if ( files.length === 1 ) return handleImportedImage(files[0], options);
  return handleImportedBatch(files, options);
}

async function handleImportedBatch(files, {dropPoint=null}={}) {
  const items = [];
  let skipped = 0;

  try {
    for ( const [index, file] of files.entries() ) {
      const preparedFile = prepareClipboardFile(file);
      const objectUrl = URL.createObjectURL(preparedFile);
      try {
        const dimensions = await readImageDimensions(objectUrl);
        const plan = await getImageOptimizationPlan(preparedFile, dimensions, getImageOptimizationOptions());
        items.push({file: preparedFile, objectUrl, sourceName: file.name, index, plan, ...dimensions});
      } catch (_error) {
        URL.revokeObjectURL(objectUrl);
        skipped += 1;
      }
    }
    if ( skipped ) ui.notifications.warn(localize("SIPD.Notification.BatchSkipped", {count: skipped}));
    if ( !items.length ) throw new Error(localize("SIPD.Error.DimensionRead"));
    // Only one readable image left: it gets the normal dialog with every single-image target
    if ( items.length === 1 ) return handleImportedImage(items[0].file, {dropPoint});

    const choices = getBatchActionChoices();
    if ( !choices.some(choice => !choice.disabled) ) {
      ui.notifications.warn(localize("SIPD.Notification.BatchUnavailable"));
      return;
    }

    const decision = normalizeBatchDecision(await promptForBatchAction({items, defaultName: defaultDocumentName()}));
    if ( !decision ) return;

    if ( game.settings.get(MODULE_ID, REMEMBER_LAST_ACTION_SETTING) ) {
      await game.settings.set(MODULE_ID, LAST_BATCH_ACTION_SETTING, decision.action);
    }
    if ( game.user?.isGM && actionUsesSelectableUploadDirectory(decision.action) ) {
      await rememberUploadDirectory(decision.uploadDirectory);
    }

    ui.notifications.info(localize("SIPD.Notification.BatchUploading", {count: items.length}));
    const results = [];
    for ( const [position, item] of items.entries() ) {
      const upload = await prepareUploadFile(item.file, {width: item.width, height: item.height}, {optimize: decision.optimize});
      const path = await uploadClipboardFile(upload.file, {directory: decision.uploadDirectory});
      results.push({
        path,
        width: upload.width,
        height: upload.height,
        name: batchItemName(decision.name, item.sourceName, position)
      });
    }

    await executeBatchAction({...decision, items: results, dropPoint});
  } finally {
    for ( const item of items ) URL.revokeObjectURL(item.objectUrl);
  }
}

// Uses an image URL the browser could not download as it is, without uploading a copy.
async function handleRemoteImageUrl(url, {dropPoint=null}={}) {
  let dimensions;
  try {
    dimensions = await readImageDimensions(url);
  } catch (_error) {
    throw new Error(localize("SIPD.Error.DropFetchFailed"));
  }
  if ( !(await confirmRemoteImageUrl(url)) ) return;

  const decision = await promptForImportDecision({previewUrl: url, ...dimensions, remoteUrl: true});
  if ( !decision ) return;

  await executeAction({
    ...getDecisionOptions(decision),
    path: url,
    width: dimensions.width,
    height: dimensions.height,
    temporaryObjectUrl: null,
    dropPoint
  });
}

async function confirmRemoteImageUrl(url) {
  const theme = getUITheme();
  const useUrlLabel = localize("SIPD.UrlFallback.UseUrl");
  const content = `
    <div class="sipd-shell" data-ui-theme="${escapeHtml(theme)}">
      <section class="sipd-hero">
        <div class="sipd-eyebrow">${localize("SIPD.Dialog.Eyebrow")}</div>
        <h2 class="sipd-heading">${localize("SIPD.UrlFallback.Heading")}</h2>
        <p class="sipd-summary">${localize("SIPD.UrlFallback.Intro", {host: escapeHtml(getUrlHostLabel(url))})}</p>
        <p class="sipd-summary">${localize("SIPD.UrlFallback.Hint")}</p>
        <p class="sipd-summary">${localize("SIPD.UrlFallback.Targets")}</p>
      </section>
    </div>
  `;

  const result = await foundry.applications.api.DialogV2.wait({
    rejectClose: false,
    window: {title: localize("SIPD.UrlFallback.Title")},
    content,
    modal: true,
    render: (_event, dialog) => {
      dialog.element.classList.add("sipd-app");
      applyDialogTheme(dialog.element, theme);
      styleActionButtons(dialog.element, {primaryLabel: useUrlLabel, secondaryLabel: localize("SIPD.Dialog.Cancel")});
    },
    buttons: [
      {
        action: "useUrl",
        label: useUrlLabel,
        default: true,
        callback: () => true
      },
      {
        action: "cancel",
        label: localize("SIPD.Dialog.Cancel")
      }
    ]
  });
  return result === true;
}

function getUrlHostLabel(url) {
  try {
    const host = new URL(url).host;
    if ( host ) return host;
  } catch (_error) {}
  return String(url ?? "").slice(0, 60);
}

async function promptForImportDecision({previewUrl, width, height, remoteUrl=false, optimizePlan=null, sourceType=null}) {
  const decision = normalizeActionDecision(await promptForAction({
    previewUrl,
    defaultName: defaultDocumentName(),
    width,
    height,
    remoteUrl,
    optimizePlan,
    sourceType
  }), {remoteUrl});
  if ( !decision ) return null;

  if ( game.settings.get(MODULE_ID, REMEMBER_LAST_ACTION_SETTING) ) {
    await game.settings.set(MODULE_ID, LAST_ACTION_SETTING, decision.action);
  }
  return decision;
}

function requiresPersistentPath(action, shareToPlayers) {
  return shareToPlayers || (action !== ACTIONS.PREVIEW_ONLY);
}

function normalizeActionDecision(decision, {remoteUrl=false}={}) {
  if ( !decision ) return null;

  const allowedActions = new Set(getPermittedActions().filter(action => !remoteUrl || REMOTE_URL_ACTIONS.includes(action)));
  const action = allowedActions.has(decision.action) ? decision.action : ACTIONS.PREVIEW_ONLY;
  const behavior = getActionBehavior(action);
  const shareToPlayers = behavior.supportsShareToPlayers && canUserShareImages() && Boolean(decision.shareToPlayers);
  const sharing = shareToPlayers || behavior.supportsRecipients;

  return {
    name: String(decision.name ?? "").trim() || defaultDocumentName(),
    action,
    uploadDirectory: game.user?.isGM ? normalizeUploadDirectory(decision.uploadDirectory) : PLAYER_UPLOAD_DIRECTORY,
    shareToPlayers,
    activateScene: behavior.supportsActivateScene && Boolean(decision.activateScene),
    navigation: behavior.supportsNavigation && Boolean(decision.navigation),
    recipients: sharing ? normalizeRecipientIds(decision.recipients, getAllUserIds()) : [],
    prototypeToken: behavior.supportsPrototypeToken && Boolean(decision.prototypeToken),
    chatMode: (behavior.supportsChatMode && (decision.chatMode === CHAT_MODES.PUBLIC)) ? CHAT_MODES.PUBLIC : CHAT_MODES.CURRENT,
    optimize: readOptimizeChoice(decision)
  };
}

// Only an unchecked "save optimized" box turns optimizing off. Without the box the settings apply.
function readOptimizeChoice(decision) {
  return decision?.optimize !== false;
}

function getAllUserIds() {
  return Array.from(game.users ?? [], user => user.id);
}

// Users a shared image can go to: everyone else who is connected right now.
function getShareRecipientChoices() {
  const currentUserId = game.user?.id;
  return Array.from(game.users ?? [])
    .filter(user => user.active && (user.id !== currentUserId))
    .map(user => ({id: user.id, name: user.name}))
    .sort((left, right) => String(left.name).localeCompare(String(right.name)));
}

function defaultUploadDirectory() {
  const now = new Date();
  return `${STORAGE_ROOT}/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function isForge() {
  // The Forge may declare ForgeVTT as a top-level class, which is global but not a globalThis property.
  return typeof ForgeVTT !== "undefined" && ForgeVTT?.usingTheForge === true;
}

// The Forge keeps uploads in the user's Assets Library; the world folder is not available there.
function getStorageSource() {
  return isForge() ? "forgevtt" : "data";
}

function getConfiguredStorageFolder() {
  return String(getRegisteredSettingValue(STORAGE_FOLDER_SETTING, "") ?? "")
    .replace(/\\/g, "/")
    .trim()
    .replace(/^\/+|\/+$/g, "");
}

function getWorldStorageRoot() {
  const configured = getConfiguredStorageFolder();
  if ( configured ) return configured;
  return isForge() ? `${WORLD_STORAGE_ROOT}/${game.world.id}` : `worlds/${game.world.id}/${WORLD_STORAGE_ROOT}`;
}

function getRootedStoragePath(path="") {
  const relativePath = String(path ?? "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const root = getWorldStorageRoot();
  return relativePath ? `${root}/${relativePath}` : root;
}

function normalizeUploadDirectory(directory) {
  const normalized = String(directory ?? "")
    .replace(/\\/g, "/")
    .trim()
    .replace(/^data\//i, "")
    .replace(new RegExp(`^${getWorldStorageRoot().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/?`, "i"), "")
    .replace(new RegExp(`^modules/${MODULE_ID}/storage/?`, "i"), "")
    .replace(/^\/+|\/+$/g, "");

  return normalized || defaultUploadDirectory();
}

function getFileExtension(fileName) {
  const normalized = String(fileName ?? "").trim();
  const index = normalized.lastIndexOf(".");
  if ( index < 0 ) return "";
  return normalized.slice(index + 1).toLowerCase();
}

function getReusableManagedUploadTarget(action, file) {
  const extension = getFileExtension(file?.name) || extensionForMimeType(file?.type);

  if ( action === ACTIONS.SHARE_IMAGE ) {
    return {
      directory: SHARED_UPLOAD_DIRECTORY,
      fileName: `shared-${game.user.id}.${extension}`
    };
  }

  if ( !hasCanvasScene() ) return null;

  if ( action === ACTIONS.SCENE_BACKGROUND_CURRENT ) {
    return {
      directory: `${STORAGE_ROOT}/scenes/${canvas.scene.id}`,
      fileName: `background.${extension}`
    };
  }

  if ( action === ACTIONS.SCENE_FOREGROUND_CURRENT ) {
    return {
      directory: `${STORAGE_ROOT}/scenes/${canvas.scene.id}`,
      fileName: `foreground.${extension}`
    };
  }

  return null;
}

function getUploadDirectoryChoices(preferredDirectory=null) {
  const preferred = normalizeUploadDirectory(preferredDirectory ?? game.settings.get(MODULE_ID, DEFAULT_UPLOAD_DIRECTORY_SETTING));
  const history = Array.isArray(game.settings.get(MODULE_ID, UPLOAD_DIRECTORY_HISTORY_SETTING))
    ? game.settings.get(MODULE_ID, UPLOAD_DIRECTORY_HISTORY_SETTING)
    : [];

  return Array.from(new Set([
    preferred,
    ...history.map(normalizeUploadDirectory),
    defaultUploadDirectory(),
    STORAGE_ROOT
  ].filter(Boolean)));
}

async function hashFileContent(file) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function buildContentAddressedUploadFileName(file) {
  const originalName = String(file?.name ?? "clipboard-image").trim();
  const extension = getFileExtension(originalName) || extensionForMimeType(file?.type);
  const contentHash = await hashFileContent(file);
  return `${contentHash}.${extension}`;
}

async function rememberUploadDirectory(directory) {
  const normalized = normalizeUploadDirectory(directory);
  const history = Array.isArray(game.settings.get(MODULE_ID, UPLOAD_DIRECTORY_HISTORY_SETTING))
    ? game.settings.get(MODULE_ID, UPLOAD_DIRECTORY_HISTORY_SETTING)
    : [];
  const nextHistory = [normalized, ...history.map(normalizeUploadDirectory).filter(entry => entry !== normalized)].slice(0, 8);
  await game.settings.set(MODULE_ID, DEFAULT_UPLOAD_DIRECTORY_SETTING, normalized);
  await game.settings.set(MODULE_ID, UPLOAD_DIRECTORY_HISTORY_SETTING, nextHistory);
}

function prepareClipboardFile(file) {
  const extension = extensionForMimeType(file.type);
  const originalName = file.name?.replace(/\.[^.]+$/, "")?.trim();
  const baseName = slugify(originalName || uniqueDocumentName());
  const fileName = `${baseName || "clipboard-image"}.${extension}`;
  return new File([file], fileName, {
    type: file.type || `image/${extension}`,
    lastModified: Date.now()
  });
}

function extensionForMimeType(mimeType) {
  switch ( mimeType ) {
    case "image/jpeg":
      return "jpg";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    case "image/svg+xml":
      return "svg";
    case "image/avif":
      return "avif";
    default:
      return "png";
  }
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function defaultDocumentName() {
  const timestamp = new Date().toISOString().replace(/[T:]/g, "-").replace(/\..+$/, "");
  return `${localize("SIPD.DefaultName")}-${timestamp}`;
}

function uniqueDocumentName() {
  return `${defaultDocumentName()}-${Date.now().toString(36)}`;
}

async function readImageDimensions(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({width: image.naturalWidth || image.width, height: image.naturalHeight || image.height});
    image.onerror = () => reject(new Error(localize("SIPD.Error.DimensionRead")));
    image.src = src;
  });
}

async function promptForAction({previewUrl, defaultName, width, height, remoteUrl=false, optimizePlan=null, sourceType=null}) {
  const defaults = getDialogDefaults({remoteUrl});
  const importWindowState = getSavedWindowState(WINDOW_KEYS.IMPORT, {width: IMPORT_WINDOW_WIDTH});
  const optimizeDescription = remoteUrl ? null : describeOptimizationPlan(optimizePlan, sourceType);
  const content = `
    <div class="sipd-shell sipd-shell--import" data-ui-theme="${escapeHtml(defaults.uiTheme)}">
      <section class="sipd-hero">
        <div class="sipd-eyebrow">${localize("SIPD.Dialog.Eyebrow")}</div>
        <div class="sipd-heading-row">
          <div>
            <h2 class="sipd-heading">${localize("SIPD.Dialog.Title")}</h2>
            <p class="sipd-summary">${localize("SIPD.Dialog.Intro")}</p>
          </div>
          <div class="sipd-stat-inline" aria-label="${localize("SIPD.Dialog.StatsLabel")}">
            <span class="sipd-stat-value">${width} x ${height}</span>
            <span class="sipd-stat-label">${localize("SIPD.Dialog.StatsValue")}</span>
          </div>
        </div>
      </section>

      <div class="sipd-dialog">
        <section class="sipd-panel sipd-panel--preview">
          <header class="sipd-panel-header">
            <div class="sipd-panel-heading">
              <span class="sipd-panel-title">${localize("SIPD.Dialog.PreviewTitle")}</span>
              <span class="sipd-panel-hint">${localize("SIPD.Dialog.Summary", {width, height})}</span>
            </div>
            <span class="sipd-pill is-type">${localize(remoteUrl ? "SIPD.Dialog.PreviewBadgeLinked" : "SIPD.Dialog.PreviewBadge")}</span>
          </header>
          <div class="sipd-dialog__preview">
            <img alt="${escapeHtml(defaultName)}" data-preview-image>
          </div>
        </section>

        <section class="sipd-panel sipd-panel--form">
          <header class="sipd-panel-header">
            <div class="sipd-panel-heading">
              <span class="sipd-panel-title">${localize("SIPD.Dialog.ConfigureTitle")}</span>
              <span class="sipd-panel-hint">${localize("SIPD.Dialog.ConfigureHint")}</span>
            </div>
          </header>

          <div class="sipd-dialog__fields">
            <div class="form-group">
              <label>${localize("SIPD.Dialog.Name")}</label>
              <div class="form-fields">
                <input type="text" name="name" value="${escapeHtml(defaultName)}" autofocus>
              </div>
            </div>
            <div class="form-group">
              <label>${localize("SIPD.Dialog.Action")}</label>
              <div class="form-fields">
                <select name="action">
                  ${actionOptionsMarkup(defaults.action, {remoteUrl})}
                </select>
              </div>
            </div>
            <div class="form-group sipd-upload-directory-row" data-option-row="uploadDirectory">
              <label>${localize("SIPD.Dialog.UploadDirectory")}</label>
              <div class="form-fields sipd-field-stack">
                <input type="text" name="uploadDirectory" value="${escapeHtml(defaults.uploadDirectory)}" list="sipd-upload-directories">
                <datalist id="sipd-upload-directories">
                  ${uploadDirectoryOptionsMarkup(defaults.uploadDirectoryChoices)}
                </datalist>
                <small class="sipd-field-hint">${uploadDirectoryHintMarkup()}</small>
              </div>
            </div>
            <div class="form-group" data-option-row="chatMode">
              <label>${localize("SIPD.Dialog.ChatMode")}</label>
              <div class="form-fields">
                <select name="chatMode">
                  <option value="${CHAT_MODES.CURRENT}">${localize("SIPD.Dialog.ChatModeCurrent")}</option>
                  <option value="${CHAT_MODES.PUBLIC}">${localize("SIPD.Dialog.ChatModePublic")}</option>
                </select>
              </div>
            </div>
            ${recipientsMarkup(getShareRecipientChoices())}
            <div class="form-group stacked sipd-choice-stack">
              <label class="checkbox sipd-choice-row" data-option-row="prototypeToken">
                <input type="checkbox" name="prototypeToken" checked>
                <span>
                  <strong>${localize("SIPD.Dialog.PrototypeToken")}</strong>
                  <small>${localize("SIPD.Dialog.PrototypeTokenHint")}</small>
                </span>
              </label>
              <label class="checkbox sipd-choice-row" data-option-row="shareToPlayers">
                <input type="checkbox" name="shareToPlayers"${defaults.shareToPlayers ? " checked" : ""}>
                <span>
                  <strong>${localize("SIPD.Dialog.ShareToPlayers")}</strong>
                  <small>${localize("SIPD.Dialog.ShareHint")}</small>
                </span>
              </label>
              <label class="checkbox sipd-choice-row" data-option-row="activateScene">
                <input type="checkbox" name="activateScene"${defaults.activateScene ? " checked" : ""}>
                <span>
                  <strong>${localize("SIPD.Dialog.ActivateScene")}</strong>
                  <small>${localize("SIPD.Dialog.ActivateHint")}</small>
                </span>
              </label>
              <label class="checkbox sipd-choice-row" data-option-row="navigation">
                <input type="checkbox" name="navigation"${defaults.navigation ? " checked" : ""}>
                <span>
                  <strong>${localize("SIPD.Dialog.Navigation")}</strong>
                  <small>${localize("SIPD.Dialog.NavigationHint")}</small>
                </span>
              </label>
              ${optimizeChoiceMarkup(optimizeDescription)}
            </div>
          </div>
        </section>
      </div>
    </div>
  `;

  return foundry.applications.api.DialogV2.wait({
    rejectClose: false,
    window: {
      title: localize("SIPD.Dialog.Title"),
      resizable: true
    },
    // The height follows the content, only the width is remembered
    position: {...importWindowState, height: "auto"},
    content,
    modal: true,
    render: (_event, dialog) => configureDialogForm(dialog, defaults.uiTheme, previewUrl),
    buttons: [
      {
        action: "confirm",
        label: localize("SIPD.Dialog.Insert"),
        default: true,
        callback: (_event, button) => ({
          name: button.form.elements.name.value.trim() || defaultName,
          action: button.form.elements.action.value,
          uploadDirectory: normalizeUploadDirectory(button.form.elements.uploadDirectory?.value),
          shareToPlayers: button.form.elements.shareToPlayers.checked,
          activateScene: button.form.elements.activateScene.checked,
          navigation: button.form.elements.navigation.checked,
          recipients: readCheckedRecipients(button.form),
          prototypeToken: Boolean(button.form.elements.prototypeToken?.checked),
          chatMode: button.form.elements.chatMode?.value ?? CHAT_MODES.CURRENT,
          optimize: readOptimizeCheckbox(button.form)
        })
      },
      {
        action: "cancel",
        label: localize("SIPD.Dialog.Cancel")
      }
    ]
  });
}

// Checkbox for uploads that get shrunk or converted. Checked by default, unchecked uploads the original file.
function optimizeChoiceMarkup(description, {label=null, hint=null}={}) {
  if ( !description ) return "";
  return `
              <label class="checkbox sipd-choice-row sipd-optimize-choice" data-option-row="optimize">
                <input type="checkbox" name="optimize" checked>
                <span>
                  <strong>${escapeHtml(label ?? optimizeLabelText(description))}</strong>
                  <small>${escapeHtml(hint ?? optimizeHintText(description))}</small>
                </span>
              </label>`;
}

function optimizeLabelText(description) {
  const variant = optimizationLabelVariant(description);
  return localize(`SIPD.Dialog.Optimize${variant}`, {width: description.width, height: description.height, format: description.format});
}

// A pure format change is only kept when it makes the file smaller, so the hint does not promise it.
function optimizeHintText(description) {
  return localize(description.ifSmaller ? "SIPD.Dialog.OptimizeHintIfSmaller" : "SIPD.Dialog.OptimizeHint");
}

function readOptimizeCheckbox(form) {
  const field = form?.elements?.optimize;
  return field ? Boolean(field.checked) : true;
}

// No recipient checked means everyone
function recipientsMarkup(users=[]) {
  const options = users.map(user => `
    <label class="checkbox sipd-recipient">
      <input type="checkbox" name="recipients" value="${escapeHtml(user.id)}">
      <span>${escapeHtml(user.name)}</span>
    </label>`).join("");
  const hint = localize(users.length ? "SIPD.Dialog.RecipientsHint" : "SIPD.Dialog.RecipientsNone");
  return `
    <div class="form-group" data-option-row="recipients">
      <label>${localize("SIPD.Dialog.Recipients")}</label>
      <div class="form-fields sipd-field-stack">
        ${options ? `<div class="sipd-recipient-list">${options}</div>` : ""}
        <small class="sipd-field-hint">${hint}</small>
      </div>
    </div>`;
}

// The hint names the real storage root. Its text is escaped, a placeholder such as <world-id> would become a tag.
function uploadDirectoryHintMarkup() {
  return escapeHtml(localize("SIPD.Dialog.UploadDirectoryHint", {root: getWorldStorageRoot()}));
}

function readCheckedRecipients(form) {
  return Array.from(form?.querySelectorAll?.('input[name="recipients"]:checked') ?? [], input => input.value);
}

function uploadDirectoryOptionsMarkup(choices=[]) {
  return choices.map(choice => `<option value="${escapeHtml(choice)}"></option>`).join("");
}

function actionOptionsMarkup(selectedAction=null, {remoteUrl=false}={}) {
  return getActionChoices({remoteUrl}).map(({value, label, disabled}) => {
    const disabledAttribute = disabled ? " disabled" : "";
    const selectedAttribute = value === selectedAction ? " selected" : "";
    return `<option value="${value}"${disabledAttribute}${selectedAttribute}>${escapeHtml(label)}</option>`;
  }).join("");
}

function getActionChoices({remoteUrl=false}={}) {
  const allowedActions = new Set(getPermittedActions());
  return getAllActionChoices().map(choice => ({
    ...choice,
    disabled: !isActionAvailable(choice.value) || (remoteUrl && !REMOTE_URL_ACTIONS.includes(choice.value))
  })).filter(choice => allowedActions.has(choice.value));
}

// Whether the current canvas state allows a target: a viewed scene, selected tokens or an actor to change.
function isActionAvailable(action) {
  if ( SCENE_ACTIONS.includes(action) ) return hasCanvasScene();
  if ( action === ACTIONS.TOKEN_IMAGE ) return getEligibleTokens().length > 0;
  if ( action === ACTIONS.ACTOR_PORTRAIT ) return getEligibleActors().length > 0;
  return true;
}

const NO_ACTION_OPTIONS = Object.freeze({
  supportsShareToPlayers: false,
  supportsActivateScene: false,
  supportsNavigation: false,
  supportsUploadDirectory: false,
  supportsRecipients: false,
  supportsPrototypeToken: false,
  supportsChatMode: false
});

function getActionBehavior(action) {
  switch ( action ) {
    case ACTIONS.SCENE_BACKGROUND:
      return {
        ...NO_ACTION_OPTIONS,
        supportsShareToPlayers: true,
        supportsActivateScene: true,
        supportsNavigation: true
      };
    case ACTIONS.SCENE_BACKGROUND_CURRENT:
    case ACTIONS.SCENE_FOREGROUND_CURRENT:
    case ACTIONS.TILE_CENTERED:
    case ACTIONS.TILE_FIT:
    case ACTIONS.MAP_PIN:
    case ACTIONS.JOURNAL_IMAGE:
      return {
        ...NO_ACTION_OPTIONS,
        supportsShareToPlayers: true
      };
    case ACTIONS.UPLOAD_DIRECTORY:
      return {
        ...NO_ACTION_OPTIONS,
        supportsUploadDirectory: true
      };
    case ACTIONS.TOKEN_IMAGE:
      return {
        ...NO_ACTION_OPTIONS,
        supportsPrototypeToken: true
      };
    case ACTIONS.CHAT_IMAGE:
      return {
        ...NO_ACTION_OPTIONS,
        supportsChatMode: true
      };
    case ACTIONS.SHARE_IMAGE:
      return {
        ...NO_ACTION_OPTIONS,
        supportsRecipients: true
      };
    case ACTIONS.ACTOR_PORTRAIT:
    case ACTIONS.PREVIEW_ONLY:
    default:
      return {...NO_ACTION_OPTIONS};
  }
}

function actionSupportsShareToPlayers(action) {
  return getActionBehavior(action).supportsShareToPlayers;
}

function actionUsesSelectableUploadDirectory(action) {
  return getActionBehavior(action).supportsUploadDirectory;
}

function configureDialogForm(dialog, theme=getUITheme(), previewUrl=null) {
  const form = dialog.element.querySelector("form");
  if ( !form ) return;

  dialog.element.classList.add("sipd-app", "sipd-import-dialog");
  applyDialogTheme(dialog.element, theme);
  addSettingsGear(dialog);
  const windowContent = form.closest(".window-content") ?? dialog.element;
  styleActionButtons(windowContent, {
    primaryLabel: localize("SIPD.Dialog.Insert"),
    secondaryLabel: localize("SIPD.Dialog.Cancel")
  });

  const previewImage = form.querySelector("[data-preview-image]");
  if ( previewImage && previewUrl ) {
    previewImage.src = previewUrl;
  }

  applyWindowState(dialog, WINDOW_KEYS.IMPORT, {width: IMPORT_WINDOW_WIDTH});
  bindWindowStatePersistence(dialog, WINDOW_KEYS.IMPORT);

  const actionField = form.elements.action;
  const shareToPlayersField = form.elements.shareToPlayers;
  const activateSceneField = form.elements.activateScene;
  const navigationField = form.elements.navigation;
  const uploadDirectoryField = form.elements.uploadDirectory;
  const prototypeTokenField = form.elements.prototypeToken;
  const chatModeField = form.elements.chatMode;
  const optimizeRow = form.querySelector('[data-option-row="optimize"]');
  const optionRows = {
    shareToPlayers: form.querySelector('[data-option-row="shareToPlayers"]'),
    activateScene: form.querySelector('[data-option-row="activateScene"]'),
    navigation: form.querySelector('[data-option-row="navigation"]'),
    uploadDirectory: form.querySelector('[data-option-row="uploadDirectory"]'),
    recipients: form.querySelector('[data-option-row="recipients"]'),
    prototypeToken: form.querySelector('[data-option-row="prototypeToken"]'),
    chatMode: form.querySelector('[data-option-row="chatMode"]')
  };
  const setRowVisible = (row, visible) => {
    if ( !row ) return;
    row.hidden = !visible;
  };
  // Players upload into a fixed folder and may only share when the GM allows it.
  const canShare = canUserShareImages();
  const canChooseDirectory = Boolean(game.user?.isGM);
  const updateFields = () => {
    const behavior = getActionBehavior(actionField.value);
    const showShare = behavior.supportsShareToPlayers && canShare;
    const showUploadDirectory = behavior.supportsUploadDirectory && canChooseDirectory;
    activateSceneField.disabled = !behavior.supportsActivateScene;
    navigationField.disabled = !behavior.supportsNavigation;
    shareToPlayersField.disabled = !showShare;
    uploadDirectoryField.disabled = !showUploadDirectory;

    if ( prototypeTokenField ) prototypeTokenField.disabled = !behavior.supportsPrototypeToken;
    if ( chatModeField ) chatModeField.disabled = !behavior.supportsChatMode;

    // Recipients apply to the share target and to the "also show" option once it is checked
    const sharing = showShare && Boolean(shareToPlayersField.checked);
    setRowVisible(optionRows.shareToPlayers, showShare);
    setRowVisible(optionRows.activateScene, behavior.supportsActivateScene);
    setRowVisible(optionRows.navigation, behavior.supportsNavigation);
    setRowVisible(optionRows.uploadDirectory, showUploadDirectory);
    setRowVisible(optionRows.recipients, canShare && (behavior.supportsRecipients || sharing));
    setRowVisible(optionRows.prototypeToken, behavior.supportsPrototypeToken);
    setRowVisible(optionRows.chatMode, behavior.supportsChatMode);
    setRowVisible(optimizeRow, requiresPersistentPath(actionField.value, sharing));
  };

  actionField.addEventListener("change", updateFields);
  shareToPlayersField.addEventListener?.("change", updateFields);
  updateFields();
}

function getDialogDefaults({remoteUrl=false}={}) {
  const choices = getActionChoices({remoteUrl});
  const preferredAction = game.settings.get(MODULE_ID, REMEMBER_LAST_ACTION_SETTING)
    ? game.settings.get(MODULE_ID, LAST_ACTION_SETTING)
    : game.settings.get(MODULE_ID, DEFAULT_ACTION_SETTING);

  const resolvedAction = choices.find(choice => choice.value === preferredAction && !choice.disabled)?.value
    ?? choices.find(choice => choice.value === game.settings.get(MODULE_ID, DEFAULT_ACTION_SETTING) && !choice.disabled)?.value
    ?? choices.find(choice => !choice.disabled)?.value
    ?? ACTIONS.PREVIEW_ONLY;

  return {
    action: resolvedAction,
    shareToPlayers: canUserShareImages() && game.settings.get(MODULE_ID, DEFAULT_SHARE_SETTING),
    activateScene: game.settings.get(MODULE_ID, DEFAULT_ACTIVATE_SCENE_SETTING),
    navigation: game.settings.get(MODULE_ID, DEFAULT_NAVIGATION_SETTING),
    uploadDirectory: normalizeUploadDirectory(game.settings.get(MODULE_ID, DEFAULT_UPLOAD_DIRECTORY_SETTING)),
    uploadDirectoryChoices: getUploadDirectoryChoices(game.settings.get(MODULE_ID, DEFAULT_UPLOAD_DIRECTORY_SETTING)),
    uiTheme: getUITheme()
  };
}

function getUITheme() {
  const theme = game.settings.get(MODULE_ID, UI_THEME_SETTING);
  return Object.values(UI_THEMES).includes(theme) ? theme : UI_THEMES.SIGNATURE;
}

function getThemeChoices() {
  return [
    {value: UI_THEMES.SIGNATURE, label: localize("SIPD.Settings.Theme.OptionSignature")},
    {value: UI_THEMES.FOUNDRY, label: localize("SIPD.Settings.Theme.OptionFoundry")}
  ];
}

function getSavedWindowStates() {
  return game.settings.get(MODULE_ID, WINDOW_STATE_SETTING) || {};
}

function getSavedWindowState(key, fallback={}) {
  const state = getSavedWindowStates()?.[key] ?? {};
  const width = Number.isFinite(state.width) ? Math.max(320, Math.round(state.width)) : fallback.width;
  const height = AUTO_HEIGHT_WINDOW_KEYS.includes(key)
    ? undefined
    : (Number.isFinite(state.height) ? Math.max(240, Math.round(state.height)) : fallback.height);
  return {
    ...(Number.isFinite(width) ? {width} : {}),
    ...(Number.isFinite(height) ? {height} : {})
  };
}

function getApplicationElement(app) {
  if ( app?.element instanceof HTMLElement ) return app.element;
  if ( app?.element?.[0] instanceof HTMLElement ) return app.element[0];
  return null;
}

function getApplicationSize(app) {
  const element = getApplicationElement(app);
  const rect = element?.getBoundingClientRect?.() ?? null;
  const position = app?.position ?? {};
  const width = Math.max(
    Number.isFinite(rect?.width) ? rect.width : 0,
    Number.isFinite(position.width) ? position.width : 0
  );
  const height = Math.max(
    Number.isFinite(rect?.height) ? rect.height : 0,
    Number.isFinite(position.height) ? position.height : 0
  );
  if ( !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 ) return null;
  return {
    width: Math.max(320, Math.round(width)),
    height: Math.max(240, Math.round(height))
  };
}

function applyWindowState(app, key, fallback={}) {
  const state = getSavedWindowState(key, fallback);
  if ( !state.width && !state.height ) return;
  const element = getApplicationElement(app);
  if ( element instanceof HTMLElement ) {
    if ( state.width ) element.style.width = `${state.width}px`;
    if ( state.height ) element.style.height = `${state.height}px`;
    if ( app?.position ) {
      if ( state.width ) app.position.width = state.width;
      if ( state.height ) app.position.height = state.height;
    }
    return;
  }

  if ( typeof app?.setPosition === "function" ) {
    app.setPosition(state);
  }
}

function queueWindowStateSave(app, key) {
  if ( !game?.ready || !key ) return;
  const size = getApplicationSize(app);
  if ( !size ) return;

  clearTimeout(app._sipdWindowStateTimer);
  app._sipdWindowStateTimer = window.setTimeout(async () => {
    await persistWindowState(app, key, size);
  }, 120);
}

async function persistWindowState(app, key, size=null) {
  if ( !game?.ready || !key ) return;
  const resolvedSize = size ?? getApplicationSize(app);
  if ( !resolvedSize ) return;
  const states = foundry.utils.deepClone(getSavedWindowStates());
  states[key] = resolvedSize;
  await game.settings.set(MODULE_ID, WINDOW_STATE_SETTING, states);
}

function bindWindowStatePersistence(app, key) {
  if ( app._sipdWindowStateBound ) return;
  const element = getApplicationElement(app);
  if ( !element || typeof ResizeObserver === "undefined" ) return;

  const observer = new ResizeObserver(() => queueWindowStateSave(app, key));
  observer.observe(element);
  const pointerUpHandler = () => {
    clearTimeout(app._sipdWindowStateTimer);
    void persistWindowState(app, key);
  };
  element.addEventListener("pointerup", pointerUpHandler);
  app._sipdWindowStateBound = true;
  app._sipdWindowStateObserver = observer;
  app._sipdWindowStatePointerUpHandler = pointerUpHandler;

  if ( typeof app.addEventListener === "function" ) {
    app.addEventListener("close", () => {
      observer.disconnect();
      element.removeEventListener("pointerup", pointerUpHandler);
      clearTimeout(app._sipdWindowStateTimer);
      void persistWindowState(app, key);
    }, {once: true});
  }
}

function applyDialogTheme(element, theme = UI_THEMES.SIGNATURE) {
  if ( !element ) return;
  const resolvedTheme = theme === UI_THEMES.FOUNDRY ? UI_THEMES.FOUNDRY : UI_THEMES.SIGNATURE;
  element.dataset.uiTheme = resolvedTheme;
  element.classList.toggle("is-theme-foundry", resolvedTheme === UI_THEMES.FOUNDRY);
  element.classList.toggle("is-theme-signature", resolvedTheme !== UI_THEMES.FOUNDRY);
}

function styleActionButtons(root, {primaryLabel, secondaryLabel}={}) {
  const buttons = Array.from(root?.querySelectorAll("button") ?? []);
  for ( const button of buttons ) {
    const label = button.textContent?.trim() ?? "";
    if ( primaryLabel && label.includes(primaryLabel) ) {
      button.classList.add("sipd-button-primary");
    }

    if ( secondaryLabel && label.includes(secondaryLabel) ) {
      button.classList.add("sipd-button-secondary");
    }
  }
}

async function uploadClipboardFile(file, {directory=null, targetPath=null}={}) {
  if ( !game.user.hasPermission("FILES_UPLOAD") ) {
    throw new Error(localize("SIPD.Error.UploadPermission"));
  }

  const isGM = Boolean(game.user.isGM);
  const reusableTarget = targetPath?.fileName ? targetPath : null;
  const fallbackDirectory = isGM ? normalizeUploadDirectory(directory) : PLAYER_UPLOAD_DIRECTORY;
  const path = reusableTarget ? reusableTarget.directory : fallbackDirectory;
  const uploadFileName = reusableTarget?.fileName || await buildContentAddressedUploadFileName(file);
  const uploadFile = uploadFileName !== file.name
    ? new File([file], uploadFileName, {
      type: file.type,
      lastModified: Date.now()
    })
    : file;
  const filePicker = getFilePickerClass();
  const target = getRootedStoragePath(path);

  // Foundry only lets Assistant GMs and above create directories; players upload into prepared folders.
  if ( isGM ) await ensureDirectoryExists(filePicker, target);

  if ( !reusableTarget && (isGM || game.user.hasPermission("FILES_BROWSE")) ) {
    const existingPath = await findExistingFilePath(filePicker, target, uploadFileName);
    if ( existingPath ) return existingPath;
  }

  const response = await filePicker.upload(getStorageSource(), target, uploadFile, {}, {notify: false});
  if ( !response?.path ) {
    throw new Error(localize(isGM ? "SIPD.Error.UploadFailed" : "SIPD.Error.PlayerUploadFailed"));
  }
  // A replaced background, foreground or shared image keeps its file name. Without a new URL the canvas
  // and the players' browsers keep showing the previous image.
  if ( reusableTarget ) return withVersionQuery(response.path, (await hashFileContent(uploadFile)).slice(0, 12));
  return response.path;
}

function getFilePickerClass() {
  return foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
}

async function findExistingFilePath(filePicker, target, fileName) {
  let response;
  try {
    response = await filePicker.browse(getStorageSource(), target, {wildcard: false});
  } catch (_error) {
    return null;
  }
  // The Forge returns absolute asset URLs, so a stored file may only match by its ending.
  const expectedPath = `${target}/${fileName}`.replace(/\\/g, "/");
  return response?.files?.find(path => {
    const normalized = String(path).replace(/\\/g, "/");
    return normalized === expectedPath || normalized.endsWith(`/${expectedPath}`);
  }) ?? null;
}

async function ensurePlayerStorageDirectories() {
  if ( !game.user?.isGM || !game.settings.get(MODULE_ID, ALLOW_PLAYER_TOOL_SETTING) ) return;
  if ( !getPlayerActionWhitelist().size ) return;

  const filePicker = getFilePickerClass();
  try {
    for ( const directory of [PLAYER_UPLOAD_DIRECTORY, SHARED_UPLOAD_DIRECTORY] ) {
      await ensureDirectoryExists(filePicker, getRootedStoragePath(directory));
    }
  } catch (error) {
    console.warn(`${MODULE_ID} | Could not prepare the player upload folders`, error);
  }
}

async function ensureDirectoryExists(filePicker, target) {
  // The Forge creates every nested folder in one call (and uploads create missing folders, too).
  if ( getStorageSource() === "forgevtt" ) {
    try {
      await filePicker.createDirectory("forgevtt", target, {notify: false});
    } catch (_error) {}
    return;
  }

  const segments = target.split("/").filter(Boolean);
  let currentPath = "";

  for ( const segment of segments ) {
    currentPath = currentPath ? `${currentPath}/${segment}` : segment;
    try {
      await filePicker.createDirectory("data", currentPath, {notify: false});
    } catch (error) {
      const message = error?.message ?? String(error ?? "");
      if ( !/EEXIST|already exists|FILES.ErrorCreateDirExists/i.test(message) ) throw error;
    }
  }
}

async function executeAction(data) {
  switch ( data.action ) {
    case ACTIONS.SCENE_BACKGROUND:
      await createSceneFromImage(data);
      break;
    case ACTIONS.SCENE_BACKGROUND_CURRENT:
      await updateCurrentSceneBackground(data);
      break;
    case ACTIONS.SCENE_FOREGROUND_CURRENT:
      await updateCurrentSceneForeground(data);
      break;
    case ACTIONS.TILE_CENTERED:
      await createTileFromImage(data, {fitToScene: false});
      break;
    case ACTIONS.TILE_FIT:
      await createTileFromImage(data, {fitToScene: true});
      break;
    case ACTIONS.MAP_PIN:
      await createMapPinFromImage(data);
      break;
    case ACTIONS.TOKEN_IMAGE:
      await updateTokenImages(data);
      break;
    case ACTIONS.ACTOR_PORTRAIT:
      await updateActorPortraits(data);
      break;
    case ACTIONS.JOURNAL_IMAGE:
      await createJournalEntryFromImage(data);
      break;
    case ACTIONS.CHAT_IMAGE:
      await postImagesToChat([{path: data.path, name: data.name}], {chatMode: data.chatMode});
      break;
    case ACTIONS.UPLOAD_DIRECTORY:
      ui.notifications.info(localize("SIPD.Notification.Uploaded", {path: data.path}));
      break;
    case ACTIONS.SHARE_IMAGE:
      shareImageToPlayers(data.path, data.name, data.recipients);
      break;
    case ACTIONS.PREVIEW_ONLY:
      openImagePreview(data.path, data.name, {revokeOnClose: data.temporaryObjectUrl});
      break;
    default:
      throw new Error(localize("SIPD.Error.UnsupportedAction"));
  }

  if ( data.shareToPlayers && actionSupportsShareToPlayers(data.action) ) {
    shareImageToPlayers(data.path, data.name, data.recipients);
  }
}

function hasCanvasScene() {
  return Boolean(canvas?.scene && canvas?.ready);
}

async function createSceneFromImage({name, path, width, height, activateScene, navigation}, {notify=true}={}) {
  const scene = await Scene.create({
    name,
    navigation,
    active: activateScene,
    width,
    height,
    padding: 0
  });

  await applyImageToSceneLevel(scene, {path, width, height});

  if ( activateScene && scene && !scene.active && scene.activate ) {
    await scene.activate();
  }

  if ( notify ) ui.notifications.info(localize("SIPD.Notification.SceneCreated", {name: scene?.name ?? name}));
  return scene;
}

async function updateCurrentSceneBackground({path, width, height}) {
  if ( !hasCanvasScene() ) {
    throw new Error(localize("SIPD.Error.NoScene"));
  }

  const scene = canvas.scene;
  await applyImageToSceneLevel(scene, {path, width, height});

  ui.notifications.info(localize("SIPD.Notification.SceneUpdated", {name: scene.name}));
  return scene;
}

async function updateCurrentSceneForeground({path}) {
  if ( !hasCanvasScene() ) {
    throw new Error(localize("SIPD.Error.NoScene"));
  }

  const scene = canvas.scene;
  await applyImageToSceneForeground(scene, {path});

  ui.notifications.info(localize("SIPD.Notification.SceneForegroundUpdated", {name: scene.name}));
  return scene;
}

async function applyImageToSceneLevel(scene, {path, width, height}) {
  if ( !supportsSceneLevels(scene) ) {
    const background = foundry.utils.deepClone(scene.background ?? {});
    background.src = path;

    await scene.update({
      width,
      height,
      padding: 0,
      img: path,
      background
    });

    return;
  }

  const {level, isNew} = getTargetLevelData(scene);
  level.background ??= {};
  level.background.src = path;

  await scene.update({
    width,
    height,
    padding: 0,
    levels: [level],
    ...(isNew ? {initialLevel: level._id} : {})
  });
}

async function applyImageToSceneForeground(scene, {path}) {
  if ( !supportsSceneLevels(scene) ) {
    await scene.update({foreground: path});
    return;
  }

  const {level, isNew} = getTargetLevelData(scene);
  level.foreground ??= {};
  level.foreground.src = path;

  await scene.update({
    levels: [level],
    ...(isNew ? {initialLevel: level._id} : {})
  });
}

function supportsSceneLevels(scene) {
  return Boolean(scene?.constructor?.metadata?.defaultLevelId);
}

// The level the GM is looking at, else the scene's initial level. Level updates merge by _id, other levels stay.
function getTargetLevelData(scene) {
  const viewedLevel = (scene === globalThis.canvas?.scene) ? globalThis.canvas?.level : null;
  const level = viewedLevel ?? scene.initialLevel;
  if ( level?.toObject ) return {level: level.toObject(), isNew: false};
  return {level: createDefaultLevelData(scene), isNew: true};
}

// v14 tiles with an empty levels list show on every level, so pin new tiles to the viewed level.
function getViewedLevelIds(scene) {
  if ( !supportsSceneLevels(scene) || (scene !== globalThis.canvas?.scene) ) return null;
  const levelId = globalThis.canvas?.level?.id;
  return levelId ? [levelId] : null;
}

function createDefaultLevelData(scene) {
  return {
    _id: scene.constructor.metadata.defaultLevelId,
    name: "Level",
    elevation: {bottom: 0, top: 20},
    background: {
      color: "#999999",
      src: null,
      tint: "#ffffff",
      alphaThreshold: 0.75
    },
    foreground: {
      src: null,
      tint: "#ffffff",
      alphaThreshold: 0.75
    },
    fog: {
      src: null,
      tint: "#ffffff"
    },
    textures: {
      anchorX: 0.5,
      anchorY: 0.5,
      offsetX: 0,
      offsetY: 0,
      fit: "fill",
      scaleX: 1,
      scaleY: 1,
      rotation: 0
    },
    visibility: {levels: []},
    sort: 0,
    flags: {}
  };
}

async function createTileFromImage({name, path, width, height, dropPoint=null}, {fitToScene}) {
  if ( !hasCanvasScene() ) {
    throw new Error(localize("SIPD.Error.NoScene"));
  }

  const rect = canvas.dimensions.sceneRect;
  const tileSize = fitToScene ? fitDimensions(width, height, rect.width, rect.height) : {width, height};
  const size = {width: Math.max(1, Math.round(tileSize.width)), height: Math.max(1, Math.round(tileSize.height))};
  // Pasted images and fitted tiles stay centered on the scene
  const point = (!fitToScene && (dropPoint?.sceneId === canvas.scene.id)) ? dropPoint : null;
  const {x, y} = getTilePosition(size, rect, point);

  const levels = getViewedLevelIds(canvas.scene);
  const [tile] = await canvas.scene.createEmbeddedDocuments("Tile", [{
    name,
    x,
    y,
    width: size.width,
    height: size.height,
    texture: {src: path},
    ...(levels ? {levels} : {})
  }]);

  ui.notifications.info(localize("SIPD.Notification.TileCreated", {name: tile?.name ?? name}));
  return tile;
}

// Canvas point of a drop onto the board. Shift skips grid snapping, as in Foundry's own tile drop.
function getCanvasDropPoint(event) {
  const board = globalThis.canvas?.app?.view;
  if ( !hasCanvasScene() || !board || (event?.target !== board) ) return null;
  const point = canvas.canvasCoordinatesFromClient?.({x: event.clientX, y: event.clientY});
  if ( !Number.isFinite(point?.x) || !Number.isFinite(point?.y) ) return null;
  return {x: point.x, y: point.y, sceneId: canvas.scene.id, snap: !event.shiftKey};
}

// x/y of a new tile centered on a point (or on the scene) and kept inside the scene rect.
// v13 positions tiles by their top-left corner, v14 by the texture anchor, which defaults to the center.
function getTilePosition(size, rect, point=null) {
  const offset = tilesUseAnchorPosition() ? {x: size.width / 2, y: size.height / 2} : {x: 0, y: 0};
  let left = rect.x + ((rect.width - size.width) / 2);
  let top = rect.y + ((rect.height - size.height) / 2);

  if ( point ) {
    let origin = {x: point.x - (size.width / 2) + offset.x, y: point.y - (size.height / 2) + offset.y};
    // Foundry snaps the same point when it creates a tile from a drop
    if ( point.snap && (typeof canvas.tiles?.getSnappedPoint === "function") ) origin = canvas.tiles.getSnappedPoint(origin);
    left = clampSpan(origin.x - offset.x, size.width, rect.x, rect.width);
    top = clampSpan(origin.y - offset.y, size.height, rect.y, rect.height);
  }

  return {x: Math.round(left + offset.x), y: Math.round(top + offset.y)};
}

function tilesUseAnchorPosition() {
  return Number(globalThis.game?.release?.generation) >= 14;
}

function fitDimensions(width, height, maxWidth, maxHeight) {
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale)
  };
}

async function createJournalEntryFromImage({name, path}, {notify=true}={}) {
  const entry = await JournalEntry.create({
    name,
    pages: [{
      name,
      type: "image",
      src: path,
      title: {show: false}
    }]
  });

  if ( notify ) ui.notifications.info(localize("SIPD.Notification.JournalCreated", {name: entry?.name ?? name}));
  return entry;
}

// One journal entry with an image page per image, in the order of the batch
async function createJournalEntryWithPages({name, items}) {
  const entry = await JournalEntry.create({
    name,
    pages: items.map((item, index) => ({
      name: item.name,
      type: "image",
      src: item.path,
      title: {show: false},
      sort: (index + 1) * 100000
    }))
  });

  ui.notifications.info(localize("SIPD.Notification.JournalCreated", {name: entry?.name ?? name}));
  return entry;
}

// A map pin: a journal entry with the image page and a note at the drop point (or the scene center).
async function createMapPinFromImage({name, path, dropPoint=null}) {
  if ( !hasCanvasScene() ) {
    throw new Error(localize("SIPD.Error.NoScene"));
  }

  const scene = canvas.scene;
  const entry = await createJournalEntryFromImage({name, path}, {notify: false});
  const page = entry?.pages?.contents?.[0] ?? null;
  const point = (dropPoint?.sceneId === scene.id) ? getSnappedNotePoint(dropPoint) : null;
  const {x, y} = clampPointToRect(point, canvas.dimensions.sceneRect);
  const levels = getViewedLevelIds(scene);

  const [note] = await scene.createEmbeddedDocuments("Note", [{
    entryId: entry?.id ?? null,
    ...(page?.id ? {pageId: page.id} : {}),
    x,
    y,
    ...(levels ? {levels} : {})
  }]);

  ui.notifications.info(localize("SIPD.Notification.MapPinCreated", {name: entry?.name ?? name}));
  return note;
}

// Foundry snaps dropped journal entries the same way, Shift skips it
function getSnappedNotePoint(point) {
  if ( !point.snap || (typeof canvas.notes?.getSnappedPoint !== "function") ) return point;
  return canvas.notes.getSnappedPoint({x: point.x, y: point.y});
}

// Selected tokens the user may change. Players only get the tokens of actors they own.
function getEligibleTokens() {
  if ( !hasCanvasScene() ) return [];
  const isGM = Boolean(game.user?.isGM);
  return Array.from(canvas.tokens?.controlled ?? []).filter(token => token?.document && (isGM || token.document.isOwner));
}

// Actors of the selected tokens, else the user's own character.
function getEligibleActors() {
  const isGM = Boolean(game.user?.isGM);
  const actors = new Map();
  for ( const token of getEligibleTokens() ) {
    const actor = token.actor;
    if ( actor && (isGM || actor.isOwner) ) actors.set(actor.uuid ?? actor.id, actor);
  }
  const character = game.user?.character;
  if ( !actors.size && character && (isGM || character.isOwner) ) actors.set(character.uuid ?? character.id, character);
  return Array.from(actors.values());
}

async function updateTokenImages({path, prototypeToken=false}) {
  const tokens = getEligibleTokens();
  if ( !tokens.length ) {
    throw new Error(localize("SIPD.Error.NoToken"));
  }

  const updates = tokens.map(token => ({_id: token.document.id, "texture.src": path}));
  await canvas.scene.updateEmbeddedDocuments("Token", updates);

  // Linked tokens share their actor, so the prototype keeps the new image for the next placement
  if ( prototypeToken ) {
    const actors = new Map();
    for ( const token of tokens ) {
      if ( token.document.actorLink && token.actor ) actors.set(token.actor.id, token.actor);
    }
    for ( const actor of actors.values() ) await actor.update({"prototypeToken.texture.src": path});
  }

  ui.notifications.info(localize("SIPD.Notification.TokenUpdated", {count: tokens.length}));
  return tokens;
}

async function updateActorPortraits({path}) {
  const actors = getEligibleActors();
  if ( !actors.length ) {
    throw new Error(localize("SIPD.Error.NoActor"));
  }

  for ( const actor of actors ) await actor.update({img: path});
  ui.notifications.info(localize("SIPD.Notification.PortraitUpdated", {name: actors.map(actor => actor.name).join(", ")}));
  return actors;
}

// One chat message with all images, in the user's current chat mode or public.
async function postImagesToChat(images, {chatMode=CHAT_MODES.CURRENT}={}) {
  const chatMessageClass = globalThis.ChatMessage?.implementation ?? globalThis.ChatMessage;
  const chatData = {
    content: buildChatImageContent(images, escapeHtml),
    speaker: chatMessageClass.getSpeaker?.() ?? {}
  };
  const mode = chatMode === CHAT_MODES.PUBLIC ? "public" : imagePostMode(getCurrentMessageMode());
  applyChatMessageMode(chatMessageClass, chatData, mode);
  const message = await chatMessageClass.create(chatData);
  ui.notifications.info(localize("SIPD.Notification.ChatPosted", {count: images.length}));
  return message;
}

function usesMessageModes() {
  return Number(globalThis.game?.release?.generation) >= 14;
}

// v14 calls it the message mode, v13 the roll mode
function getCurrentMessageMode() {
  const settingKey = usesMessageModes() ? "messageMode" : "rollMode";
  try {
    return toMessageMode(game.settings.get("core", settingKey));
  } catch (_error) {
    return "public";
  }
}

function applyChatMessageMode(chatMessageClass, chatData, mode) {
  if ( usesMessageModes() && (typeof chatMessageClass.applyMode === "function") ) {
    return chatMessageClass.applyMode(chatData, mode);
  }
  if ( typeof chatMessageClass.applyRollMode === "function" ) {
    return chatMessageClass.applyRollMode(chatData, toLegacyRollMode(mode));
  }
  return chatData;
}

// Shows the image to everyone, or only to the given users. Both Foundry versions route it by user id.
function shareImageToPlayers(path, name, recipients=[]) {
  const journalCollection = foundry.documents.collections?.Journal ?? globalThis.Journal;
  const users = Array.isArray(recipients) ? recipients.filter(Boolean) : [];
  journalCollection.showImage(path, {title: name, showTitle: true, ...(users.length ? {users} : {})});
}

function openImagePreview(path, name, {revokeOnClose=null}={}) {
  const popout = new foundry.applications.apps.ImagePopout({
    src: path,
    showTitle: true,
    window: {
      title: name,
      resizable: true,
      ...getSavedWindowState(WINDOW_KEYS.PREVIEW)
    }
  });

  popout.addEventListener("render", () => {
    applyWindowState(popout, WINDOW_KEYS.PREVIEW);
    bindWindowStatePersistence(popout, WINDOW_KEYS.PREVIEW);
  }, {once: true});

  if ( revokeOnClose ) {
    popout.addEventListener("close", () => URL.revokeObjectURL(revokeOnClose), {once: true});
  }

  popout.render({force: true});
}

// Targets offered for several images. Each one needs the same permission as its single-image counterpart.
function getBatchActionChoices() {
  const allowedActions = new Set(getPermittedActions());
  return [
    {value: BATCH_ACTIONS.JOURNAL_PAGES, label: localize("SIPD.Batch.Action.JournalPages"), permission: ACTIONS.JOURNAL_IMAGE},
    {value: BATCH_ACTIONS.TILE_GRID, label: localize("SIPD.Batch.Action.TileGrid"), permission: ACTIONS.TILE_CENTERED},
    {value: ACTIONS.JOURNAL_IMAGE, label: localize("SIPD.Batch.Action.JournalEach"), permission: ACTIONS.JOURNAL_IMAGE},
    {value: ACTIONS.SCENE_BACKGROUND, label: localize("SIPD.Batch.Action.SceneEach"), permission: ACTIONS.SCENE_BACKGROUND},
    {value: ACTIONS.CHAT_IMAGE, label: localize("SIPD.Batch.Action.Chat"), permission: ACTIONS.CHAT_IMAGE},
    {value: ACTIONS.UPLOAD_DIRECTORY, label: localize("SIPD.Batch.Action.Upload"), permission: ACTIONS.UPLOAD_DIRECTORY}
  ]
    .filter(choice => allowedActions.has(choice.permission))
    .map(({permission: _permission, ...choice}) => ({...choice, disabled: !isActionAvailable(choice.value)}));
}

function getBatchDialogDefaults() {
  const choices = getBatchActionChoices().filter(choice => !choice.disabled);
  const preferredAction = game.settings.get(MODULE_ID, REMEMBER_LAST_ACTION_SETTING)
    ? getRegisteredSettingValue(LAST_BATCH_ACTION_SETTING, null)
    : null;

  return {
    action: choices.find(choice => choice.value === preferredAction)?.value ?? choices[0]?.value ?? null,
    navigation: game.settings.get(MODULE_ID, DEFAULT_NAVIGATION_SETTING),
    uploadDirectory: normalizeUploadDirectory(game.settings.get(MODULE_ID, DEFAULT_UPLOAD_DIRECTORY_SETTING)),
    uploadDirectoryChoices: getUploadDirectoryChoices(game.settings.get(MODULE_ID, DEFAULT_UPLOAD_DIRECTORY_SETTING)),
    uiTheme: getUITheme()
  };
}

function batchThumbnailsMarkup(items, defaultName) {
  return items.map((item, index) => {
    const label = batchItemName(defaultName, item.sourceName, index);
    const description = describeOptimizationPlan(item.plan, item.file?.type);
    const note = description
      ? `<small class="sipd-batch-thumb__optimized" data-optimize-thumb>${escapeHtml(batchThumbOptimizeText(description))}</small>`
      : "";
    return `
      <figure class="sipd-batch-thumb">
        <img alt="${escapeHtml(label)}" data-batch-thumb="${index}">
        <figcaption>
          <span>${escapeHtml(label)}</span>
          <small>${item.width} x ${item.height}</small>
          ${note}
        </figcaption>
      </figure>`;
  }).join("");
}

// Short result below a thumbnail, for example "2048 x 1024 WebP". It hides when the batch checkbox is unchecked.
function batchThumbOptimizeText(description) {
  const parts = [];
  if ( description.scaled ) parts.push(`${description.width} x ${description.height}`);
  if ( description.converted ) parts.push(description.format);
  return `\u2192 ${parts.join(" ")}`;
}

// One checkbox for every image of the batch. The label names the size limit and the target format.
function batchOptimizeChoiceMarkup(items) {
  const summary = summarizeOptimizationPlans(items.map(item => ({plan: item.plan, type: item.file?.type})));
  if ( !summary ) return "";
  const variant = optimizationLabelVariant(summary);
  const label = localize(`SIPD.Batch.Optimize${variant}`, {size: getImageOptimizationOptions().maxSize, format: summary.format});
  const hint = localize(summary.ifSmaller ? "SIPD.Batch.OptimizeHintIfSmaller" : "SIPD.Batch.OptimizeHint", {count: summary.count, total: summary.total});
  return optimizeChoiceMarkup(summary, {label, hint});
}

async function promptForBatchAction({items, defaultName}) {
  const defaults = getBatchDialogDefaults();
  const windowState = getSavedWindowState(WINDOW_KEYS.BATCH, {width: BATCH_WINDOW_WIDTH});
  const actionOptions = getBatchActionChoices().map(({value, label, disabled}) => {
    const disabledAttribute = disabled ? " disabled" : "";
    const selectedAttribute = value === defaults.action ? " selected" : "";
    return `<option value="${value}"${disabledAttribute}${selectedAttribute}>${escapeHtml(label)}</option>`;
  }).join("");

  const content = `
    <div class="sipd-shell sipd-shell--import sipd-shell--batch" data-ui-theme="${escapeHtml(defaults.uiTheme)}">
      <section class="sipd-hero">
        <div class="sipd-eyebrow">${localize("SIPD.Dialog.Eyebrow")}</div>
        <div class="sipd-heading-row">
          <div>
            <h2 class="sipd-heading">${localize("SIPD.Batch.Title")}</h2>
            <p class="sipd-summary">${localize("SIPD.Batch.Intro")}</p>
          </div>
          <div class="sipd-stat-inline">
            <span class="sipd-stat-value">${items.length}</span>
            <span class="sipd-stat-label">${localize("SIPD.Batch.StatsValue")}</span>
          </div>
        </div>
      </section>

      <div class="sipd-dialog">
        <section class="sipd-panel sipd-panel--preview">
          <header class="sipd-panel-header">
            <div class="sipd-panel-heading">
              <span class="sipd-panel-title">${localize("SIPD.Batch.PreviewTitle")}</span>
            </div>
            <span class="sipd-pill is-type">${localize("SIPD.Dialog.PreviewBadge")}</span>
          </header>
          <div class="sipd-batch-grid">
            ${batchThumbnailsMarkup(items, defaultName)}
          </div>
        </section>

        <section class="sipd-panel sipd-panel--form">
          <header class="sipd-panel-header">
            <div class="sipd-panel-heading">
              <span class="sipd-panel-title">${localize("SIPD.Dialog.ConfigureTitle")}</span>
              <span class="sipd-panel-hint">${localize("SIPD.Batch.NameHint")}</span>
            </div>
          </header>

          <div class="sipd-dialog__fields">
            <div class="form-group">
              <label>${localize("SIPD.Dialog.Name")}</label>
              <div class="form-fields">
                <input type="text" name="name" value="${escapeHtml(defaultName)}" autofocus>
              </div>
            </div>
            <div class="form-group">
              <label>${localize("SIPD.Dialog.Action")}</label>
              <div class="form-fields">
                <select name="action">${actionOptions}</select>
              </div>
            </div>
            <div class="form-group sipd-upload-directory-row" data-option-row="uploadDirectory">
              <label>${localize("SIPD.Dialog.UploadDirectory")}</label>
              <div class="form-fields sipd-field-stack">
                <input type="text" name="uploadDirectory" value="${escapeHtml(defaults.uploadDirectory)}" list="sipd-batch-upload-directories">
                <datalist id="sipd-batch-upload-directories">
                  ${uploadDirectoryOptionsMarkup(defaults.uploadDirectoryChoices)}
                </datalist>
                <small class="sipd-field-hint">${uploadDirectoryHintMarkup()}</small>
              </div>
            </div>
            <div class="form-group" data-option-row="chatMode">
              <label>${localize("SIPD.Dialog.ChatMode")}</label>
              <div class="form-fields">
                <select name="chatMode">
                  <option value="${CHAT_MODES.CURRENT}">${localize("SIPD.Dialog.ChatModeCurrent")}</option>
                  <option value="${CHAT_MODES.PUBLIC}">${localize("SIPD.Dialog.ChatModePublic")}</option>
                </select>
              </div>
            </div>
            <div class="form-group stacked sipd-choice-stack">
              <label class="checkbox sipd-choice-row" data-option-row="navigation">
                <input type="checkbox" name="navigation"${defaults.navigation ? " checked" : ""}>
                <span>
                  <strong>${localize("SIPD.Batch.Navigation")}</strong>
                  <small>${localize("SIPD.Dialog.NavigationHint")}</small>
                </span>
              </label>
              ${batchOptimizeChoiceMarkup(items)}
            </div>
          </div>
        </section>
      </div>
    </div>
  `;

  return foundry.applications.api.DialogV2.wait({
    rejectClose: false,
    window: {
      title: localize("SIPD.Batch.Title"),
      resizable: true
    },
    // The height follows the content, only the width is remembered
    position: {...windowState, height: "auto"},
    content,
    modal: true,
    render: (_event, dialog) => configureBatchDialogForm(dialog, defaults.uiTheme, items),
    buttons: [
      {
        action: "confirm",
        label: localize("SIPD.Dialog.Insert"),
        default: true,
        callback: (_event, button) => ({
          name: button.form.elements.name.value.trim() || defaultName,
          action: button.form.elements.action.value,
          uploadDirectory: normalizeUploadDirectory(button.form.elements.uploadDirectory?.value),
          navigation: Boolean(button.form.elements.navigation?.checked),
          chatMode: button.form.elements.chatMode?.value ?? CHAT_MODES.CURRENT,
          optimize: readOptimizeCheckbox(button.form)
        })
      },
      {
        action: "cancel",
        label: localize("SIPD.Dialog.Cancel")
      }
    ]
  });
}

function configureBatchDialogForm(dialog, theme=getUITheme(), items=[]) {
  const form = dialog.element.querySelector("form");
  if ( !form ) return;

  dialog.element.classList.add("sipd-app", "sipd-import-dialog", "sipd-batch-dialog");
  applyDialogTheme(dialog.element, theme);
  addSettingsGear(dialog);
  styleActionButtons(form.closest(".window-content") ?? dialog.element, {
    primaryLabel: localize("SIPD.Dialog.Insert"),
    secondaryLabel: localize("SIPD.Dialog.Cancel")
  });

  // Blob URLs are set after rendering, like the single image preview
  for ( const [index, item] of items.entries() ) {
    const thumbnail = form.querySelector(`[data-batch-thumb="${index}"]`);
    if ( thumbnail ) thumbnail.src = item.objectUrl;
  }

  applyWindowState(dialog, WINDOW_KEYS.BATCH, {width: BATCH_WINDOW_WIDTH});
  bindWindowStatePersistence(dialog, WINDOW_KEYS.BATCH);

  const actionField = form.elements.action;
  const rows = {
    uploadDirectory: form.querySelector('[data-option-row="uploadDirectory"]'),
    chatMode: form.querySelector('[data-option-row="chatMode"]'),
    navigation: form.querySelector('[data-option-row="navigation"]')
  };
  const canChooseDirectory = Boolean(game.user?.isGM);
  const updateFields = () => {
    const action = actionField.value;
    const visible = {
      uploadDirectory: canChooseDirectory && (action === ACTIONS.UPLOAD_DIRECTORY),
      chatMode: action === ACTIONS.CHAT_IMAGE,
      navigation: action === ACTIONS.SCENE_BACKGROUND
    };
    for ( const [key, row] of Object.entries(rows) ) {
      if ( row ) row.hidden = !visible[key];
    }
  };

  actionField.addEventListener("change", updateFields);
  updateFields();

  // The size and format below each thumbnail only apply while the batch checkbox is checked
  const optimizeField = form.elements.optimize;
  const thumbNotes = Array.from(form.querySelectorAll?.("[data-optimize-thumb]") ?? []);
  const updateThumbNotes = () => {
    for ( const note of thumbNotes ) note.hidden = !optimizeField.checked;
  };
  if ( optimizeField ) {
    optimizeField.addEventListener?.("change", updateThumbNotes);
    updateThumbNotes();
  }
}

function normalizeBatchDecision(decision) {
  if ( !decision ) return null;

  const allowedActions = new Set(getBatchActionChoices().filter(choice => !choice.disabled).map(choice => choice.value));
  if ( !allowedActions.has(decision.action) ) return null;
  const action = decision.action;

  return {
    name: String(decision.name ?? "").trim() || defaultDocumentName(),
    action,
    uploadDirectory: game.user?.isGM ? normalizeUploadDirectory(decision.uploadDirectory) : PLAYER_UPLOAD_DIRECTORY,
    navigation: (action === ACTIONS.SCENE_BACKGROUND) && Boolean(decision.navigation),
    chatMode: ((action === ACTIONS.CHAT_IMAGE) && (decision.chatMode === CHAT_MODES.PUBLIC)) ? CHAT_MODES.PUBLIC : CHAT_MODES.CURRENT,
    optimize: readOptimizeChoice(decision)
  };
}

async function executeBatchAction({action, name, navigation=false, chatMode=CHAT_MODES.CURRENT, items, dropPoint=null}) {
  switch ( action ) {
    case BATCH_ACTIONS.JOURNAL_PAGES:
      return createJournalEntryWithPages({name, items});
    case BATCH_ACTIONS.TILE_GRID:
      return createTileGrid({items, dropPoint});
    case ACTIONS.JOURNAL_IMAGE:
      for ( const item of items ) await createJournalEntryFromImage(item, {notify: false});
      ui.notifications.info(localize("SIPD.Notification.BatchJournalsCreated", {count: items.length}));
      return;
    case ACTIONS.SCENE_BACKGROUND:
      // Several new scenes are never activated, only the navigation choice applies
      for ( const item of items ) {
        await createSceneFromImage({...item, activateScene: false, navigation}, {notify: false});
      }
      ui.notifications.info(localize("SIPD.Notification.BatchScenesCreated", {count: items.length}));
      return;
    case ACTIONS.CHAT_IMAGE:
      return postImagesToChat(items.map(({path, name: itemName}) => ({path, name: itemName})), {chatMode});
    case ACTIONS.UPLOAD_DIRECTORY:
      ui.notifications.info(localize("SIPD.Notification.BatchUploaded", {
        count: items.length,
        path: String(items[0]?.path ?? "").replace(/\/[^/]*$/, "")
      }));
      return;
    default:
      throw new Error(localize("SIPD.Error.UnsupportedAction"));
  }
}

// Tiles in a grid around the drop point (or the scene center), spaced by one grid square, on the viewed level.
async function createTileGrid({items, dropPoint=null}) {
  if ( !hasCanvasScene() ) {
    throw new Error(localize("SIPD.Error.NoScene"));
  }

  const scene = canvas.scene;
  const center = (dropPoint?.sceneId === scene.id) ? {x: dropPoint.x, y: dropPoint.y} : null;
  const layout = layoutTileGrid(items, canvas.dimensions.sceneRect, {
    gap: Number(canvas.dimensions?.size) || 100,
    center,
    anchor: tilesUseAnchorPosition()
  });
  const levels = getViewedLevelIds(scene);
  const tiles = await scene.createEmbeddedDocuments("Tile", items.map((item, index) => ({
    name: item.name,
    ...layout[index],
    texture: {src: item.path},
    ...(levels ? {levels} : {})
  })));

  ui.notifications.info(localize("SIPD.Notification.BatchTilesCreated", {count: items.length}));
  return tiles;
}

function localize(key, formatters) {
  const overrideLanguage = getOverrideLanguage();
  const override = overrideLanguage ? MODULE_TRANSLATION_CACHE.get(overrideLanguage)?.[key] : null;
  if ( override ) return formatters ? interpolateTemplate(override, formatters) : override;
  return formatters ? game.i18n.format(key, formatters) : game.i18n.localize(key);
}

function escapeHtml(value) {
  return foundry.utils.escapeHTML(String(value ?? ""));
}

// Whether the current user finds settings of this module in the settings dialog.
function hasOwnSettings() {
  if ( game.user?.isGM ) return true;
  return Array.from(game.settings.settings.values()).some(setting => (setting.namespace === MODULE_ID) && setting.config && (setting.scope !== "world"));
}

// Opens Foundry's settings on the tab of this module.
async function openModuleSettings() {
  const sheet = game.settings.sheet;
  await sheet.render({force: true});
  try {
    sheet.changeTab(MODULE_ID, "categories");
  } catch ( error ) {
    console.warn(`${MODULE_ID} | The settings have no tab for this module`, error);
  }
  sheet.bringToFront?.();
}

// A gear in the title bar of the import window. The window is modal, so it closes before the settings open.
function addSettingsGear(dialog) {
  const header = dialog.element?.querySelector(".window-header");
  if ( !header || header.querySelector(".sipd-settings") || !hasOwnSettings() ) return;
  const label = localize("SIPD.Dialog.Settings");
  const gear = document.createElement("button");
  gear.type = "button";
  gear.className = "header-control icon fa-solid fa-gear sipd-settings";
  gear.dataset.tooltip = label;
  gear.setAttribute("aria-label", label);
  gear.addEventListener("click", async event => {
    event.preventDefault();
    event.stopPropagation();
    await dialog.close();
    await openModuleSettings();
  });
  const anchor = header.querySelector("[data-action=toggleControls]") ?? header.querySelector("[data-action=close]");
  if ( anchor ) anchor.before(gear);
  else header.append(gear);
}

// Self-test: the file picker, the storage folder, the documents the targets create, WebP in this browser and the
// upload permission of players. Meant to be run after every Foundry update; the GM also gets a notice once when a
// newer Foundry is installed.
async function checkIntegrations() {
  const problems = [];
  let checks = 0;
  const check = (ok, key, data) => {
    checks++;
    if ( !ok ) problems.push(localize(`SIPD.SelfTest.${key}`, data));
  };

  const filePicker = getFilePickerClass();
  check((typeof filePicker?.upload === "function") && (typeof filePicker?.createDirectory === "function"), "FilePicker");

  let storage = true;
  try {
    await ensureDirectoryExists(filePicker, getRootedStoragePath(STORAGE_ROOT));
  } catch ( error ) {
    storage = false;
    console.warn(`${MODULE_ID} | Self-test could not create the storage folder`, error);
  }
  check(storage, "Storage", {folder: getRootedStoragePath(STORAGE_ROOT)});

  const targets = [CONFIG.Scene?.documentClass, CONFIG.Tile?.documentClass, CONFIG.JournalEntry?.documentClass,
    foundry.applications?.apps?.ImagePopout];
  check(targets.every(Boolean), "Targets");
  check(game.i18n.has("SIPD.Dialog.Title"), "Texts");

  if ( game.settings.get(MODULE_ID, CONVERT_WEBP_SETTING) ) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    check(canvas.toDataURL("image/webp").startsWith("data:image/webp"), "Webp");
  }

  // Players who may use the tool upload their images, and Foundry only allows that with the upload permission.
  const uploads = Array.from(getPlayerActionWhitelist()).some(action => action !== ACTIONS.PREVIEW_ONLY);
  if ( game.settings.get(MODULE_ID, ALLOW_PLAYER_TOOL_SETTING) && uploads ) {
    const roles = game.permissions?.FILES_UPLOAD ?? [];
    check(roles.some(role => role < CONST.USER_ROLES.GAMEMASTER), "PlayerUpload");
  }
  return {problems, checks};
}

// Runs the self-test and reports the result as a notification and a whispered chat message.
async function runSelfTest({report = true} = {}) {
  await ensureModuleTranslationsLoaded();
  const {problems, checks} = await checkIntegrations();
  const versions = localize("SIPD.SelfTest.Version", {current: game.version, tested: TESTED_VERSIONS.core});
  const summary = problems.length
    ? localize("SIPD.SelfTest.Problems", {problems: problems.length, checks})
    : localize("SIPD.SelfTest.Passed", {checks});

  if ( problems.length ) ui.notifications.warn(summary, {permanent: true});
  else ui.notifications.info(summary);

  if ( report ) {
    let content = `<h3>${escapeHtml(localize("SIPD.SelfTest.Title"))}</h3><p>${escapeHtml(summary)}</p><p><small>${escapeHtml(versions)}</small></p>`;
    if ( problems.length ) content += `<ul>${problems.map(problem => `<li>${escapeHtml(problem)}</li>`).join("")}</ul>`;
    await ChatMessage.implementation.create({content, whisper: [game.user.id], speaker: {alias: game.modules.get(MODULE_ID)?.title}});
  }
  return {problems, checks};
}

// Tells the GM once when Foundry is newer than the version the module was verified against.
function noticeNewVersions() {
  if ( !game.user?.isGM || !foundry.utils.isNewerVersion(game.version, TESTED_VERSIONS.core) ) return;
  const signature = `core ${game.version}`;
  if ( game.settings.get(MODULE_ID, ACKNOWLEDGED_VERSIONS_SETTING) === signature ) return;
  void game.settings.set(MODULE_ID, ACKNOWLEDGED_VERSIONS_SETTING, signature);
  ui.notifications.info(localize("SIPD.SelfTest.NewVersions", {versions: signature}), {permanent: true});
}

// The menu button which runs the self-test. Foundry only accepts application classes as menus.
class SelfTestMenu extends foundry.applications.api.ApplicationV2 {
  async render() {
    if ( game.user?.isGM ) await runSelfTest();
    return this;
  }
}

export const __test__ = {
  MODULE_ID,
  STORAGE_ROOT,
  ENABLE_PASTE_SETTING,
  ENABLE_DROP_SETTING,
  DEFAULT_ACTION_SETTING,
  REMEMBER_LAST_ACTION_SETTING,
  LAST_ACTION_SETTING,
  DEFAULT_SHARE_SETTING,
  DEFAULT_ACTIVATE_SCENE_SETTING,
  DEFAULT_NAVIGATION_SETTING,
  DEFAULT_UPLOAD_DIRECTORY_SETTING,
  UPLOAD_DIRECTORY_HISTORY_SETTING,
  ALLOW_PLAYER_TOOL_SETTING,
  PLAYER_ACTIONS_SETTING,
  STORAGE_FOLDER_SETTING,
  UI_LANGUAGE_SETTING,
  UI_THEME_SETTING,
  WINDOW_STATE_SETTING,
  LAST_BATCH_ACTION_SETTING,
  MAX_IMAGE_SIZE_SETTING,
  CONVERT_WEBP_SETTING,
  WEBP_QUALITY_SETTING,
  WORLD_STORAGE_ROOT,
  SUPPORTED_UI_LANGUAGES,
  UI_THEMES,
  WINDOW_KEYS,
  ACTIONS,
  BATCH_ACTIONS,
  CHAT_MODES,
  PLAYER_SELECTABLE_ACTIONS,
  REMOTE_URL_ACTIONS,
  SCENE_ACTIONS,
  PLAYER_UPLOAD_DIRECTORY,
  SHARED_UPLOAD_DIRECTORY,
  getAllActionChoices,
  getActionSettingChoices,
  getPlayerActionSettingChoices,
  getThemeSettingChoices,
  getMaxImageSizeChoices,
  onRenderChatMessage,
  normalizeUiLanguage,
  getPreferredLanguage,
  getModuleLanguage,
  getOverrideLanguage,
  ensureModuleTranslationsLoaded,
  refreshLocalizedUi,
  resetModuleTranslations,
  onPaste,
  onDragOver,
  onDrop,
  isEditableTarget,
  extractClipboardImage,
  extractClipboardImages,
  collectImageFiles,
  extractClipboardImageUrl,
  extractClipboardImageUrls,
  parseImageUrl,
  hasTransferableImage,
  extractDroppedImage,
  extractDroppedImageFiles,
  extractDroppedImageUrls,
  getDroppedUri,
  fetchDroppedImage,
  createFetchFailedError,
  guessMimeTypeFromUri,
  fileNameFromUri,
  canCurrentUserUseTool,
  getPlayerActionWhitelist,
  canUserPerformAction,
  canUserShareImages,
  getPermittedActions,
  importImage,
  handleImportedImage,
  getDecisionOptions,
  getImageOptimizationOptions,
  prepareUploadFile,
  importImageBatch,
  handleImportedBatch,
  handleRemoteImageUrl,
  confirmRemoteImageUrl,
  getUrlHostLabel,
  promptForImportDecision,
  requiresPersistentPath,
  normalizeActionDecision,
  getAllUserIds,
  getShareRecipientChoices,
  defaultUploadDirectory,
  isForge,
  getStorageSource,
  getConfiguredStorageFolder,
  getWorldStorageRoot,
  getRootedStoragePath,
  normalizeUploadDirectory,
  getFileExtension,
  getReusableManagedUploadTarget,
  getUploadDirectoryChoices,
  hashFileContent,
  buildContentAddressedUploadFileName,
  rememberUploadDirectory,
  prepareClipboardFile,
  extensionForMimeType,
  slugify,
  defaultDocumentName,
  uniqueDocumentName,
  readImageDimensions,
  promptForAction,
  optimizeChoiceMarkup,
  optimizeLabelText,
  optimizeHintText,
  readOptimizeCheckbox,
  readOptimizeChoice,
  batchThumbOptimizeText,
  batchOptimizeChoiceMarkup,
  recipientsMarkup,
  readCheckedRecipients,
  uploadDirectoryHintMarkup,
  uploadDirectoryOptionsMarkup,
  actionOptionsMarkup,
  getActionChoices,
  isActionAvailable,
  getActionBehavior,
  actionSupportsShareToPlayers,
  actionUsesSelectableUploadDirectory,
  configureDialogForm,
  getDialogDefaults,
  getUITheme,
  getThemeChoices,
  getSavedWindowStates,
  getSavedWindowState,
  getApplicationElement,
  getApplicationSize,
  applyWindowState,
  queueWindowStateSave,
  persistWindowState,
  bindWindowStatePersistence,
  applyDialogTheme,
  styleActionButtons,
  uploadClipboardFile,
  getFilePickerClass,
  findExistingFilePath,
  ensurePlayerStorageDirectories,
  ensureDirectoryExists,
  executeAction,
  hasCanvasScene,
  createSceneFromImage,
  updateCurrentSceneBackground,
  updateCurrentSceneForeground,
  applyImageToSceneLevel,
  applyImageToSceneForeground,
  supportsSceneLevels,
  createDefaultLevelData,
  getTargetLevelData,
  getViewedLevelIds,
  createTileFromImage,
  getCanvasDropPoint,
  getTilePosition,
  tilesUseAnchorPosition,
  clampSpan,
  fitDimensions,
  createJournalEntryFromImage,
  createJournalEntryWithPages,
  createMapPinFromImage,
  getSnappedNotePoint,
  getEligibleTokens,
  getEligibleActors,
  updateTokenImages,
  updateActorPortraits,
  postImagesToChat,
  usesMessageModes,
  getCurrentMessageMode,
  applyChatMessageMode,
  shareImageToPlayers,
  openImagePreview,
  getBatchActionChoices,
  getBatchDialogDefaults,
  batchThumbnailsMarkup,
  promptForBatchAction,
  configureBatchDialogForm,
  normalizeBatchDecision,
  executeBatchAction,
  createTileGrid,
  localize,
  addSettingsGear,
  hasOwnSettings,
  runSelfTest,
  noticeNewVersions,
  TESTED_VERSIONS,
  escapeHtml
};

