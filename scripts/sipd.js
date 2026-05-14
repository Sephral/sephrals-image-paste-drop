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
const UI_THEME_SETTING = "uiTheme";
const WINDOW_STATE_SETTING = "windowState";
const WORLD_STORAGE_ROOT = MODULE_ID;
const UI_THEMES = {
  SIGNATURE: "signature",
  FOUNDRY: "foundry"
};
const WINDOW_KEYS = {
  IMPORT: "import",
  SETTINGS: "settings",
  PREVIEW: "preview"
};
const ACTIONS = {
  SCENE_BACKGROUND: "scene-background",
  SCENE_BACKGROUND_CURRENT: "scene-background-current",
  SCENE_FOREGROUND_CURRENT: "scene-foreground-current",
  TILE_CENTERED: "tile-centered",
  TILE_FIT: "tile-fit",
  JOURNAL_IMAGE: "journal-image",
  UPLOAD_DIRECTORY: "upload-directory",
  SHARE_IMAGE: "share-image",
  PREVIEW_ONLY: "preview-only"
};
const PLAYER_ALLOWED_ACTIONS = Object.freeze([
  ACTIONS.PREVIEW_ONLY
]);

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, ENABLE_PASTE_SETTING, {
    name: localize("SIPD.Settings.Enable.Name"),
    hint: localize("SIPD.Settings.Enable.Hint"),
    scope: "client",
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, ENABLE_DROP_SETTING, {
    scope: "client",
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, DEFAULT_ACTION_SETTING, {
    scope: "client",
    config: false,
    type: String,
    default: ACTIONS.SCENE_BACKGROUND_CURRENT
  });

  game.settings.register(MODULE_ID, REMEMBER_LAST_ACTION_SETTING, {
    scope: "client",
    config: false,
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
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, DEFAULT_ACTIVATE_SCENE_SETTING, {
    scope: "client",
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, DEFAULT_NAVIGATION_SETTING, {
    scope: "client",
    config: false,
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
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, UI_THEME_SETTING, {
    scope: "client",
    config: false,
    type: String,
    default: UI_THEMES.SIGNATURE
  });

  game.settings.register(MODULE_ID, WINDOW_STATE_SETTING, {
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.registerMenu(MODULE_ID, "preferences", {
    name: localize("SIPD.Settings.Menu.Name"),
    label: localize("SIPD.Settings.Menu.Label"),
    hint: localize("SIPD.Settings.Menu.Hint"),
    icon: "fas fa-images",
    type: SIPDSettingsMenu,
    restricted: false
  });
});

Hooks.once("ready", () => {
  document.addEventListener("paste", onPaste, true);
  document.addEventListener("dragover", onDragOver, true);
  document.addEventListener("drop", onDrop, true);
});

async function onPaste(event) {
  if ( !game.settings.get(MODULE_ID, ENABLE_PASTE_SETTING) ) return;
  if ( isEditableTarget(event.target) ) return;
  if ( !canCurrentUserUseTool() ) return;

  const clipboardImage = extractClipboardImage(event);
  if ( !clipboardImage ) return;

  event.preventDefault();
  event.stopPropagation();

  try {
    await handleImportedImage(clipboardImage);
  } catch (error) {
    console.error(`${MODULE_ID} | Paste handling failed`, error);
    ui.notifications.error(localize("SIPD.Notification.Error", {message: error.message ?? String(error)}));
  }
}

function onDragOver(event) {
  if ( !game.settings.get(MODULE_ID, ENABLE_DROP_SETTING) ) return;
  if ( isEditableTarget(event.target) ) return;
  if ( !hasTransferableImage(event.dataTransfer) ) return;

  event.preventDefault();
  if ( event.dataTransfer ) event.dataTransfer.dropEffect = "copy";
}

async function onDrop(event) {
  if ( !game.settings.get(MODULE_ID, ENABLE_DROP_SETTING) ) return;
  if ( isEditableTarget(event.target) ) return;
  if ( !canCurrentUserUseTool() ) return;
  if ( !hasTransferableImage(event.dataTransfer) ) return;

  event.preventDefault();
  event.stopPropagation();

  try {
    const droppedImage = await extractDroppedImage(event.dataTransfer);
    if ( !droppedImage ) return;
    await handleImportedImage(droppedImage);
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
  const items = Array.from(event.clipboardData?.items ?? []);
  for ( const item of items ) {
    if ( item.kind !== "file" ) continue;
    if ( !item.type.startsWith("image/") ) continue;
    const file = item.getAsFile();
    if ( file ) return file;
  }
  return null;
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

  const uri = dataTransfer?.getData("text/uri-list") || dataTransfer?.getData("text/plain");
  if ( !uri ) return null;

  return fetchDroppedImage(uri);
}

async function fetchDroppedImage(rawUri) {
  const uri = rawUri.split(/\r?\n/).find(line => line && !line.startsWith("#"))?.trim();
  if ( !uri ) return null;

  let response;
  try {
    response = await fetch(uri);
  } catch (error) {
    throw new Error(localize("SIPD.Error.DropFetchFailed"));
  }

  if ( !response.ok ) {
    throw new Error(localize("SIPD.Error.DropFetchFailed"));
  }

  const blob = await response.blob();
  const mimeType = blob.type || guessMimeTypeFromUri(uri);
  if ( !mimeType?.startsWith("image/") ) return null;

  const extension = extensionForMimeType(mimeType);
  const fileName = fileNameFromUri(uri, extension);
  return new File([blob], fileName, {type: mimeType, lastModified: Date.now()});
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
    const candidate = url.pathname.split("/").at(-1)?.trim();
    if ( candidate ) return candidate;
  } catch (error) {}

  return `${slugify(defaultDocumentName()) || "dropped-image"}.${fallbackExtension}`;
}

function canCurrentUserUseTool() {
  return game.user?.isGM || game.settings.get(MODULE_ID, ALLOW_PLAYER_TOOL_SETTING);
}

function getPermittedActions() {
  if ( game.user?.isGM ) return Object.values(ACTIONS);
  if ( !canCurrentUserUseTool() ) return [];
  return PLAYER_ALLOWED_ACTIONS;
}

async function handleImportedImage(file) {
  const preparedFile = prepareClipboardFile(file);
  const objectUrl = URL.createObjectURL(preparedFile);
  let releaseObjectUrl = true;

  try {
    const dimensions = await readImageDimensions(objectUrl);
    const decision = await promptForAction({
      previewUrl: objectUrl,
      defaultName: defaultDocumentName(),
      width: dimensions.width,
      height: dimensions.height
    });

    if ( !decision ) return;

    if ( game.settings.get(MODULE_ID, REMEMBER_LAST_ACTION_SETTING) ) {
      await game.settings.set(MODULE_ID, LAST_ACTION_SETTING, decision.action);
    }

    if ( actionUsesSelectableUploadDirectory(decision.action) ) {
      await rememberUploadDirectory(decision.uploadDirectory);
    }

    const reusableUploadTarget = getReusableManagedUploadTarget(decision.action, preparedFile);
    const path = requiresPersistentPath(decision.action, decision.shareToPlayers)
      ? await uploadClipboardFile(preparedFile, {directory: decision.uploadDirectory, targetPath: reusableUploadTarget})
      : objectUrl;

    if ( path === objectUrl ) releaseObjectUrl = false;

    await executeAction({
      action: decision.action,
      name: decision.name,
      shareToPlayers: decision.shareToPlayers,
      activateScene: decision.activateScene,
      navigation: decision.navigation,
      path,
      width: dimensions.width,
      height: dimensions.height,
      temporaryObjectUrl: path === objectUrl ? objectUrl : null
    });
  } finally {
    if ( releaseObjectUrl ) URL.revokeObjectURL(objectUrl);
  }
}

function requiresPersistentPath(action, shareToPlayers) {
  return shareToPlayers || (action !== ACTIONS.PREVIEW_ONLY);
}

function defaultUploadDirectory() {
  const now = new Date();
  return `${STORAGE_ROOT}/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getWorldStorageRoot() {
  return `worlds/${game.world.id}/${WORLD_STORAGE_ROOT}`;
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
      directory: `${STORAGE_ROOT}/shared`,
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

async function promptForAction({previewUrl, defaultName, width, height}) {
  const defaults = getDialogDefaults();
  const importWindowState = getSavedWindowState(WINDOW_KEYS.IMPORT, {width: 860, height: 720});
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
            <span class="sipd-pill is-type">${localize("SIPD.Dialog.PreviewBadge")}</span>
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
                  ${actionOptionsMarkup(defaults.action)}
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
                <small class="sipd-field-hint">${localize("SIPD.Dialog.UploadDirectoryHint")}</small>
              </div>
            </div>
            <div class="form-group stacked sipd-choice-stack">
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
      resizable: true,
      ...importWindowState
    },
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
          navigation: button.form.elements.navigation.checked
        })
      },
      {
        action: "cancel",
        label: localize("SIPD.Dialog.Cancel")
      }
    ]
  });
}

function uploadDirectoryOptionsMarkup(choices=[]) {
  return choices.map(choice => `<option value="${escapeHtml(choice)}"></option>`).join("");
}

function actionOptionsMarkup(selectedAction=null) {
  return getActionChoices().map(({value, label, disabled}) => {
    const disabledAttribute = disabled ? " disabled" : "";
    const selectedAttribute = value === selectedAction ? " selected" : "";
    return `<option value="${value}"${disabledAttribute}${selectedAttribute}>${escapeHtml(label)}</option>`;
  }).join("");
}

function getActionChoices() {
  const hasScene = hasCanvasScene();
  const allowedActions = new Set(getPermittedActions());
  return [
    {value: ACTIONS.SCENE_BACKGROUND, label: localize("SIPD.Action.SceneBackground")},
    {value: ACTIONS.SCENE_BACKGROUND_CURRENT, label: localize("SIPD.Action.SceneBackgroundCurrent"), disabled: !hasScene},
    {value: ACTIONS.SCENE_FOREGROUND_CURRENT, label: localize("SIPD.Action.SceneForegroundCurrent"), disabled: !hasScene},
    {value: ACTIONS.TILE_CENTERED, label: localize("SIPD.Action.TileCentered"), disabled: !hasScene},
    {value: ACTIONS.TILE_FIT, label: localize("SIPD.Action.TileFit"), disabled: !hasScene},
    {value: ACTIONS.JOURNAL_IMAGE, label: localize("SIPD.Action.JournalImage")},
    {value: ACTIONS.UPLOAD_DIRECTORY, label: localize("SIPD.Action.UploadDirectory")},
    {value: ACTIONS.SHARE_IMAGE, label: localize("SIPD.Action.ShareImage")},
    {value: ACTIONS.PREVIEW_ONLY, label: localize("SIPD.Action.PreviewOnly")}
  ].filter(choice => allowedActions.has(choice.value));
}

function getActionBehavior(action) {
  switch ( action ) {
    case ACTIONS.SCENE_BACKGROUND:
      return {
        supportsShareToPlayers: true,
        supportsActivateScene: true,
        supportsNavigation: true,
        supportsUploadDirectory: false
      };
    case ACTIONS.SCENE_BACKGROUND_CURRENT:
    case ACTIONS.SCENE_FOREGROUND_CURRENT:
    case ACTIONS.TILE_CENTERED:
    case ACTIONS.TILE_FIT:
    case ACTIONS.JOURNAL_IMAGE:
      return {
        supportsShareToPlayers: true,
        supportsActivateScene: false,
        supportsNavigation: false,
        supportsUploadDirectory: false
      };
    case ACTIONS.UPLOAD_DIRECTORY:
      return {
        supportsShareToPlayers: false,
        supportsActivateScene: false,
        supportsNavigation: false,
        supportsUploadDirectory: true
      };
    case ACTIONS.SHARE_IMAGE:
    case ACTIONS.PREVIEW_ONLY:
    default:
      return {
        supportsShareToPlayers: false,
        supportsActivateScene: false,
        supportsNavigation: false,
        supportsUploadDirectory: false
      };
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
  const windowContent = form.closest(".window-content") ?? dialog.element;
  styleActionButtons(windowContent, {
    primaryLabel: localize("SIPD.Dialog.Insert"),
    secondaryLabel: localize("SIPD.Dialog.Cancel")
  });

  const previewImage = form.querySelector("[data-preview-image]");
  if ( previewImage && previewUrl ) {
    previewImage.src = previewUrl;
  }

  applyWindowState(dialog, WINDOW_KEYS.IMPORT, {width: 860, height: 720});
  bindWindowStatePersistence(dialog, WINDOW_KEYS.IMPORT);

  const actionField = form.elements.action;
  const shareToPlayersField = form.elements.shareToPlayers;
  const activateSceneField = form.elements.activateScene;
  const navigationField = form.elements.navigation;
  const uploadDirectoryField = form.elements.uploadDirectory;
  const optionRows = {
    shareToPlayers: form.querySelector('[data-option-row="shareToPlayers"]'),
    activateScene: form.querySelector('[data-option-row="activateScene"]'),
    navigation: form.querySelector('[data-option-row="navigation"]'),
    uploadDirectory: form.querySelector('[data-option-row="uploadDirectory"]')
  };
  const setRowVisible = (row, visible) => {
    if ( !row ) return;
    row.hidden = !visible;
  };
  const updateFields = () => {
    const behavior = getActionBehavior(actionField.value);
    activateSceneField.disabled = !behavior.supportsActivateScene;
    navigationField.disabled = !behavior.supportsNavigation;
    shareToPlayersField.disabled = !behavior.supportsShareToPlayers;
    uploadDirectoryField.disabled = !behavior.supportsUploadDirectory;

    setRowVisible(optionRows.shareToPlayers, behavior.supportsShareToPlayers);
    setRowVisible(optionRows.activateScene, behavior.supportsActivateScene);
    setRowVisible(optionRows.navigation, behavior.supportsNavigation);
    setRowVisible(optionRows.uploadDirectory, behavior.supportsUploadDirectory);
  };

  actionField.addEventListener("change", updateFields);
  updateFields();
}

function getDialogDefaults() {
  const choices = getActionChoices();
  const preferredAction = game.settings.get(MODULE_ID, REMEMBER_LAST_ACTION_SETTING)
    ? game.settings.get(MODULE_ID, LAST_ACTION_SETTING)
    : game.settings.get(MODULE_ID, DEFAULT_ACTION_SETTING);

  const resolvedAction = choices.find(choice => choice.value === preferredAction && !choice.disabled)?.value
    ?? choices.find(choice => choice.value === game.settings.get(MODULE_ID, DEFAULT_ACTION_SETTING) && !choice.disabled)?.value
    ?? choices.find(choice => !choice.disabled)?.value
    ?? ACTIONS.PREVIEW_ONLY;

  return {
    action: resolvedAction,
    shareToPlayers: game.settings.get(MODULE_ID, DEFAULT_SHARE_SETTING),
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
  const height = Number.isFinite(state.height) ? Math.max(240, Math.round(state.height)) : fallback.height;
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

  const reusableTarget = targetPath?.fileName ? targetPath : null;
  const path = reusableTarget ? reusableTarget.directory : normalizeUploadDirectory(directory);
  const uploadFileName = reusableTarget?.fileName || await buildContentAddressedUploadFileName(file);
  const uploadFile = uploadFileName !== file.name
    ? new File([file], uploadFileName, {
      type: file.type,
      lastModified: Date.now()
    })
    : file;
  const filePicker = foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
  const target = getRootedStoragePath(path);
  await ensureDirectoryExists(filePicker, target);

  if ( !reusableTarget ) {
    const existingPath = await findExistingFilePath(filePicker, target, uploadFileName);
    if ( existingPath ) return existingPath;
  }

  const response = await filePicker.upload("data", target, uploadFile, {}, {notify: false});
  if ( !response?.path ) {
    throw new Error(localize("SIPD.Error.UploadFailed"));
  }
  return response.path;
}

async function findExistingFilePath(filePicker, target, fileName) {
  const response = await filePicker.browse("data", target, {wildcard: false});
  const expectedPath = `${target}/${fileName}`.replace(/\\/g, "/");
  return response?.files?.find(path => String(path).replace(/\\/g, "/") === expectedPath) ?? null;
}

async function ensureDirectoryExists(filePicker, target) {
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
    case ACTIONS.JOURNAL_IMAGE:
      await createJournalEntryFromImage(data);
      break;
    case ACTIONS.UPLOAD_DIRECTORY:
      ui.notifications.info(localize("SIPD.Notification.Uploaded", {path: data.path}));
      break;
    case ACTIONS.SHARE_IMAGE:
      shareImageToPlayers(data.path, data.name);
      break;
    case ACTIONS.PREVIEW_ONLY:
      openImagePreview(data.path, data.name, {revokeOnClose: data.temporaryObjectUrl});
      break;
    default:
      throw new Error(localize("SIPD.Error.UnsupportedAction"));
  }

  if ( data.shareToPlayers && actionSupportsShareToPlayers(data.action) ) {
    shareImageToPlayers(data.path, data.name);
  }
}

function hasCanvasScene() {
  return Boolean(canvas?.scene && canvas?.ready);
}

async function createSceneFromImage({name, path, width, height, activateScene, navigation}) {
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

  ui.notifications.info(localize("SIPD.Notification.SceneCreated", {name: scene?.name ?? name}));
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

  const level = scene.initialLevel?.toObject?.() ?? createDefaultLevelData(scene);
  level.background ??= {};
  level.background.src = path;

  await scene.update({
    width,
    height,
    padding: 0,
    levels: [level],
    initialLevel: level._id
  });
}

async function applyImageToSceneForeground(scene, {path}) {
  if ( !supportsSceneLevels(scene) ) {
    await scene.update({foreground: path});
    return;
  }

  const level = scene.initialLevel?.toObject?.() ?? createDefaultLevelData(scene);
  level.foreground ??= {};
  level.foreground.src = path;

  await scene.update({
    levels: [level],
    initialLevel: level._id
  });
}

function supportsSceneLevels(scene) {
  return Boolean(scene?.constructor?.metadata?.defaultLevelId);
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

async function createTileFromImage({name, path, width, height}, {fitToScene}) {
  if ( !hasCanvasScene() ) {
    throw new Error(localize("SIPD.Error.NoScene"));
  }

  const rect = canvas.dimensions.sceneRect;
  const tileSize = fitToScene ? fitDimensions(width, height, rect.width, rect.height) : {width, height};
  const x = Math.round(rect.x + ((rect.width - tileSize.width) / 2));
  const y = Math.round(rect.y + ((rect.height - tileSize.height) / 2));

  const [tile] = await canvas.scene.createEmbeddedDocuments("Tile", [{
    name,
    x,
    y,
    width: Math.max(1, Math.round(tileSize.width)),
    height: Math.max(1, Math.round(tileSize.height)),
    texture: {src: path}
  }]);

  ui.notifications.info(localize("SIPD.Notification.TileCreated", {name: tile?.name ?? name}));
  return tile;
}

function fitDimensions(width, height, maxWidth, maxHeight) {
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale)
  };
}

async function createJournalEntryFromImage({name, path}) {
  const entry = await JournalEntry.create({
    name,
    pages: [{
      name,
      type: "image",
      src: path,
      title: {show: false}
    }]
  });

  ui.notifications.info(localize("SIPD.Notification.JournalCreated", {name: entry?.name ?? name}));
  return entry;
}

function shareImageToPlayers(path, name) {
  const journalCollection = foundry.documents.collections?.Journal ?? globalThis.Journal;
  journalCollection.showImage(path, {title: name, showTitle: true});
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

function localize(key, formatters) {
  return formatters ? game.i18n.format(key, formatters) : game.i18n.localize(key);
}

function escapeHtml(value) {
  return foundry.utils.escapeHTML(String(value ?? ""));
}

class SIPDSettingsMenu extends FormApplication {
  static get defaultOptions() {
    const savedWindowState = getSavedWindowState(WINDOW_KEYS.SETTINGS, {width: 640, height: 780});
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: `${MODULE_ID}-settings-menu`,
      title: localize("SIPD.Settings.Menu.Title"),
      template: `modules/${MODULE_ID}/templates/settings-menu.html`,
      classes: ["sipd-settings", "sipd-app"],
      width: savedWindowState.width ?? 640,
      height: savedWindowState.height,
      resizable: true,
      submitOnChange: false,
      closeOnSubmit: true
    });
  }

  getData() {
    const currentTheme = getUITheme();
    const defaultAction = game.settings.get(MODULE_ID, DEFAULT_ACTION_SETTING);
    const currentThemeLabel = getThemeChoices().find(choice => choice.value === currentTheme)?.label ?? localize("SIPD.Settings.Theme.OptionSignature");
    return {
      enablePasteImport: game.settings.get(MODULE_ID, ENABLE_PASTE_SETTING),
      enableDropImport: game.settings.get(MODULE_ID, ENABLE_DROP_SETTING),
      canManageAccess: game.user?.isGM,
      allowPlayerToolUse: game.settings.get(MODULE_ID, ALLOW_PLAYER_TOOL_SETTING),
      defaultAction,
      rememberLastAction: game.settings.get(MODULE_ID, REMEMBER_LAST_ACTION_SETTING),
      defaultShareToPlayers: game.settings.get(MODULE_ID, DEFAULT_SHARE_SETTING),
      defaultActivateScene: game.settings.get(MODULE_ID, DEFAULT_ACTIVATE_SCENE_SETTING),
      defaultNavigation: game.settings.get(MODULE_ID, DEFAULT_NAVIGATION_SETTING),
      uiTheme: currentTheme,
      themeChoices: getThemeChoices().map(choice => ({
        ...choice,
        selected: choice.value === currentTheme
      })),
      actionChoices: getActionChoices().map(choice => ({
        ...choice,
        selected: choice.value === defaultAction
      })),
      currentThemeLabel,
      previewActionLabel: getActionChoices().find(choice => choice.value === defaultAction)?.label ?? localize("SIPD.Action.PreviewOnly"),
      labels: {
        title: localize("SIPD.Settings.Menu.Title"),
        eyebrow: localize("SIPD.Settings.Dialog.Eyebrow"),
        intro: localize("SIPD.Settings.Dialog.Intro"),
        appearance: localize("SIPD.Settings.Dialog.Appearance"),
        access: localize("SIPD.Settings.Dialog.Access"),
        triggers: localize("SIPD.Settings.Dialog.Triggers"),
        defaults: localize("SIPD.Settings.Dialog.Defaults"),
        allowPlayerToolUse: localize("SIPD.Settings.AllowPlayerToolUse.Label"),
        allowPlayerToolUseHint: localize("SIPD.Settings.AllowPlayerToolUse.Hint"),
        theme: localize("SIPD.Settings.Theme.Label"),
        themeHint: localize("SIPD.Settings.Theme.Hint"),
        previewTitle: localize("SIPD.Settings.Preview.Title"),
        previewHint: localize("SIPD.Settings.Preview.Hint"),
        previewBadge: localize("SIPD.Settings.Preview.Badge"),
        previewThemeLabel: localize("SIPD.Settings.Preview.ThemeLabel"),
        previewSummary: localize("SIPD.Settings.Preview.Summary"),
        previewActionLabel: localize("SIPD.Settings.Preview.ActionLabel"),
        previewShare: localize("SIPD.Settings.Preview.Share"),
        previewScene: localize("SIPD.Settings.Preview.Scene"),
        enablePaste: localize("SIPD.Settings.EnablePaste.Label"),
        enablePasteHint: localize("SIPD.Settings.EnablePaste.Hint"),
        enableDrop: localize("SIPD.Settings.EnableDrop.Label"),
        enableDropHint: localize("SIPD.Settings.EnableDrop.Hint"),
        rememberAction: localize("SIPD.Settings.RememberAction.Label"),
        rememberActionHint: localize("SIPD.Settings.RememberAction.Hint"),
        defaultAction: localize("SIPD.Settings.DefaultAction.Label"),
        defaultActionHint: localize("SIPD.Settings.DefaultAction.Hint"),
        defaultShare: localize("SIPD.Settings.DefaultShare.Label"),
        defaultShareHint: localize("SIPD.Settings.DefaultShare.Hint"),
        defaultActivateScene: localize("SIPD.Settings.DefaultActivateScene.Label"),
        defaultActivateSceneHint: localize("SIPD.Settings.DefaultActivateScene.Hint"),
        defaultNavigation: localize("SIPD.Settings.DefaultNavigation.Label"),
        defaultNavigationHint: localize("SIPD.Settings.DefaultNavigation.Hint"),
        save: localize("SIPD.Settings.Dialog.Save"),
        cancel: localize("SIPD.Settings.Dialog.Cancel")
      }
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    const root = html[0];
    const rememberField = root?.querySelector('[name="rememberLastAction"]');
    const defaultActionField = root?.querySelector('[name="defaultAction"]');
    const themeField = root?.querySelector('[name="uiTheme"]');
    const previewThemeValue = root?.querySelector('[data-preview-theme-value]');
    const previewActionValue = root?.querySelector('[data-preview-action-value]');
    const cancelButton = root?.querySelector('[data-action="close"]');

    applyDialogTheme(this.element?.[0], themeField?.value ?? getUITheme());
    applyDialogTheme(root?.querySelector(".sipd-shell"), themeField?.value ?? getUITheme());
    styleActionButtons(root, {
      primaryLabel: localize("SIPD.Settings.Dialog.Save"),
      secondaryLabel: localize("SIPD.Settings.Dialog.Cancel")
    });
    applyWindowState(this, WINDOW_KEYS.SETTINGS, {width: 640, height: 780});
    bindWindowStatePersistence(this, WINDOW_KEYS.SETTINGS);

    cancelButton?.addEventListener("click", event => {
      event.preventDefault();
      this.close();
    });

    themeField?.addEventListener("change", () => {
      const nextTheme = themeField.value;
      applyDialogTheme(this.element?.[0], nextTheme);
      applyDialogTheme(root?.querySelector(".sipd-shell"), nextTheme);
      if ( previewThemeValue ) {
        previewThemeValue.textContent = getThemeChoices().find(choice => choice.value === nextTheme)?.label ?? localize("SIPD.Settings.Theme.OptionSignature");
      }
    });

    defaultActionField?.addEventListener("change", () => {
      if ( previewActionValue ) {
        previewActionValue.textContent = defaultActionField.selectedOptions[0]?.textContent?.trim() ?? previewActionValue.textContent;
      }
    });

    if ( !rememberField || !defaultActionField ) return;

    const syncDisabledState = () => {
      defaultActionField.disabled = rememberField.checked;
    };

    rememberField.addEventListener("change", syncDisabledState);
    syncDisabledState();
  }

  async _updateObject(_event, formData) {
    const data = foundry.utils.expandObject(formData);
    if ( game.user?.isGM ) {
      await game.settings.set(MODULE_ID, ALLOW_PLAYER_TOOL_SETTING, Boolean(data.allowPlayerToolUse));
    }
    await game.settings.set(MODULE_ID, ENABLE_PASTE_SETTING, Boolean(data.enablePasteImport));
    await game.settings.set(MODULE_ID, ENABLE_DROP_SETTING, Boolean(data.enableDropImport));
    await game.settings.set(MODULE_ID, REMEMBER_LAST_ACTION_SETTING, Boolean(data.rememberLastAction));
    await game.settings.set(MODULE_ID, DEFAULT_ACTION_SETTING, String(data.defaultAction || ACTIONS.SCENE_BACKGROUND_CURRENT));
    await game.settings.set(MODULE_ID, DEFAULT_SHARE_SETTING, Boolean(data.defaultShareToPlayers));
    await game.settings.set(MODULE_ID, DEFAULT_ACTIVATE_SCENE_SETTING, Boolean(data.defaultActivateScene));
    await game.settings.set(MODULE_ID, DEFAULT_NAVIGATION_SETTING, Boolean(data.defaultNavigation));
    await game.settings.set(MODULE_ID, UI_THEME_SETTING, data.uiTheme === UI_THEMES.FOUNDRY ? UI_THEMES.FOUNDRY : UI_THEMES.SIGNATURE);
  }

  setPosition(...args) {
    const position = super.setPosition(...args);
    queueWindowStateSave(this, WINDOW_KEYS.SETTINGS);
    return position;
  }

  async close(options) {
    this._sipdWindowStateObserver?.disconnect?.();
    if ( this._sipdWindowStatePointerUpHandler ) {
      getApplicationElement(this)?.removeEventListener?.("pointerup", this._sipdWindowStatePointerUpHandler);
    }
    clearTimeout(this._sipdWindowStateTimer);
    await persistWindowState(this, WINDOW_KEYS.SETTINGS);
    return super.close(options);
  }
}