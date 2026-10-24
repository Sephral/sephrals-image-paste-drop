import assert from "node:assert/strict";
import test from "node:test";

import {
  TestHTMLElement,
  createButton,
  createTestEnvironment,
  flushPromises,
  modulePath
} from "./helpers/test-helpers.mjs";

const env = createTestEnvironment();
const { __test__ } = await import(modulePath("scripts/sipd.js"));

function createImageFile(name = "Sample Image.png", type = "image/png", content = "image") {
  return new File([content], name, { type, lastModified: env.state.now });
}

function createDialogForm() {
  const form = new TestHTMLElement();
  const preview = new TestHTMLElement();
  const shareRow = new TestHTMLElement();
  const activateRow = new TestHTMLElement();
  const navigationRow = new TestHTMLElement();
  const uploadRow = new TestHTMLElement();
  const windowContent = new TestHTMLElement();
  const actionField = {
    value: __test__.ACTIONS.SCENE_BACKGROUND,
    listeners: [],
    addEventListener(_type, handler) {
      this.listeners.push(handler);
    },
    fire() {
      for (const handler of this.listeners) handler();
    }
  };
  const shareField = { checked: false, disabled: false };
  const activateField = { checked: true, disabled: false };
  const navigationField = { checked: true, disabled: false };
  const uploadField = { value: "clipboard-images/2024/03", disabled: false };
  form.elements = {
    action: actionField,
    shareToPlayers: shareField,
    activateScene: activateField,
    navigation: navigationField,
    uploadDirectory: uploadField
  };
  form.setQuerySelector("[data-preview-image]", preview);
  form.setQuerySelector('[data-option-row="shareToPlayers"]', shareRow);
  form.setQuerySelector('[data-option-row="activateScene"]', activateRow);
  form.setQuerySelector('[data-option-row="navigation"]', navigationRow);
  form.setQuerySelector('[data-option-row="uploadDirectory"]', uploadRow);
  form.setClosest((selector) => selector === ".window-content" ? windowContent : null);

  const dialogElement = new TestHTMLElement();
  dialogElement.setQuerySelector("form", form);

  const app = {
    element: dialogElement,
    position: {},
    listeners: [],
    addEventListener(type, handler, options) {
      this.listeners.push({ type, handler, options });
    }
  };

  return { app, form, preview, shareRow, activateRow, navigationRow, uploadRow, windowContent, actionField, shareField, activateField, navigationField, uploadField };
}

function createPasteEvent(text, { target = new TestHTMLElement(), file = null } = {}) {
  return {
    target,
    clipboardData: {
      items: file ? [{ kind: "file", type: file.type, getAsFile: () => file }] : [{ kind: "string", type: "text/plain", getAsFile: () => null }],
      getData: (type) => type === "text/plain" ? text : ""
    },
    preventDefault() {
      this.prevented = true;
    },
    stopPropagation() {}
  };
}

test.beforeEach(() => {
  env.reset();
  __test__.resetModuleTranslations();
});

test.after(() => {
  env.restore();
});

test("registers all settings on init and event listeners on ready", async () => {
  await env.hooks.trigger("init");
  assert.equal(env.state.registerCalls.length, 21);
  const maxSize = env.state.registerCalls.find((entry) => entry.key === __test__.MAX_IMAGE_SIZE_SETTING);
  assert.equal(maxSize.data.default, 0);
  assert.deepEqual(Object.keys(maxSize.data.choices), ["0", "2048", "4096", "8192"]);
  assert.equal(env.state.registerCalls.find((entry) => entry.key === __test__.CONVERT_WEBP_SETTING).data.default, false);
  assert.equal(env.state.registerCalls.find((entry) => entry.key === __test__.WEBP_QUALITY_SETTING).data.default, 85);
  assert.equal(env.hooks.onHandlers.get("renderChatMessageHTML").length, 1);
  const storageFolder = env.state.registerCalls.find((entry) => entry.key === __test__.STORAGE_FOLDER_SETTING);
  assert.equal(storageFolder.data.scope, "world");
  assert.equal(storageFolder.data.default, "");
  const playerActions = env.state.registerCalls.find((entry) => entry.key === __test__.PLAYER_ACTIONS_SETTING);
  assert.equal(playerActions.data.scope, "world");
  assert.deepEqual(playerActions.data.default, []);
  assert.deepEqual(Object.keys(playerActions.data.type.element.options.choices), [...__test__.PLAYER_SELECTABLE_ACTIONS]);
  const languageSetting = env.state.registerCalls.find((entry) => entry.key === __test__.UI_LANGUAGE_SETTING);
  assert.deepEqual(languageSetting.data.choices, {
    default: "Follow Foundry",
    de: "Deutsch",
    en: "English"
  });
  const defaultAction = env.state.registerCalls.find((entry) => entry.key === __test__.DEFAULT_ACTION_SETTING);
  assert.equal(defaultAction.data.default, __test__.ACTIONS.SCENE_BACKGROUND_CURRENT);
  assert.equal(defaultAction.data.choices[__test__.ACTIONS.PREVIEW_ONLY], "Preview Only");

  await env.hooks.trigger("ready");
  assert.equal(env.state.documentListeners.get("paste").length, 1);
  assert.equal(env.state.documentListeners.get("dragover").length, 1);
  assert.equal(env.state.documentListeners.get("drop").length, 1);
});

test("action and theme choice helpers expose localized maps", () => {
  const actionChoices = __test__.getAllActionChoices();
  assert.equal(actionChoices.length, 13);
  assert.equal(__test__.getActionSettingChoices()[__test__.ACTIONS.SHARE_IMAGE], "Share Image");
  assert.equal(__test__.getThemeSettingChoices()[__test__.UI_THEMES.FOUNDRY], "Foundry");
  assert.equal(__test__.localize("SIPD.Notification.Uploaded", { path: "abc" }), "uploaded abc");
  assert.equal(__test__.escapeHtml('<x>'), "&lt;x&gt;");
});

test("language helpers load overrides and refresh open SIPD dialogs", async () => {
  await env.hooks.trigger("init");

  env.state.fetchImpl = async (url) => ({
    ok: true,
    async json() {
      const language = /\/(en|de)\.json$/.exec(String(url))?.[1];
      if ( language === "de" ) {
        return {
          "SIPD.Dialog.Title": "Bild einfügen",
          "SIPD.Action.PreviewOnly": "Nur Vorschau"
        };
      }

      return {
        "SIPD.Dialog.Title": "Dialog Title",
        "SIPD.Action.PreviewOnly": "Preview Only"
      };
    }
  });

  assert.equal(__test__.normalizeUiLanguage("de-DE"), "de");
  assert.equal(__test__.normalizeUiLanguage("en_US"), "en");
  assert.equal(__test__.normalizeUiLanguage("fr"), "en");

  env.game.i18n.lang = "de-DE";
  env.state.settingsValues.set("sephrals-image-paste-drop.uiLanguage", "default");
  assert.equal(__test__.getModuleLanguage(), "de");

  env.state.settingsValues.set("sephrals-image-paste-drop.uiLanguage", "en");
  assert.equal(__test__.getModuleLanguage(), "en");

  const appElement = new TestHTMLElement();
  appElement.classList.add("sipd-app");
  const dialogApp = {
    element: appElement,
    options: { window: { title: "Dialog Title" } },
    renderCalls: [],
    render(force) {
      this.renderCalls.push(force);
    }
  };
  globalThis.ui.windows = { dialogApp };

  const languageSetting = env.state.registerCalls.find((entry) => entry.key === __test__.UI_LANGUAGE_SETTING);
  env.state.settingsValues.set("sephrals-image-paste-drop.uiLanguage", "de");
  languageSetting.data.onChange("de");
  await flushPromises();

  assert.equal(dialogApp.options.window.title, "Bild einfügen");
  assert.deepEqual(dialogApp.renderCalls, [true]);
  assert.equal(__test__.localize("SIPD.Dialog.Title"), "Bild einfügen");
  assert.equal(__test__.getActionSettingChoices()[__test__.ACTIONS.PREVIEW_ONLY], "Nur Vorschau");
});

test("paste, dragover, and drop handlers cover gatekeeping, success, and error paths", async () => {
  const event = {
    target: new TestHTMLElement(),
    clipboardData: {
      items: [{ kind: "file", type: "image/png", getAsFile: () => createImageFile() }]
    },
    preventDefault() {
      this.prevented = true;
    },
    stopPropagation() {
      this.stopped = true;
    }
  };

  env.state.dialogWaitResult = {
    name: "Clip",
    action: __test__.ACTIONS.PREVIEW_ONLY,
    uploadDirectory: "clipboard-images/custom",
    shareToPlayers: false,
    activateScene: false,
    navigation: false
  };

  await __test__.onPaste(event);
  assert.equal(event.prevented, true);
  assert.deepEqual(env.state.settingWrites.map((entry) => entry.key), [__test__.LAST_ACTION_SETTING]);

  env.reset();
  env.state.imageBehavior.error = true;
  const failingPasteEvent = {
    target: new TestHTMLElement(),
    clipboardData: {
      items: [{ kind: "file", type: "image/png", getAsFile: () => createImageFile() }]
    },
    preventDefault() {},
    stopPropagation() {}
  };
  await __test__.onPaste(failingPasteEvent);
  assert.equal(env.state.notifications.error.at(-1), "error dimension read failed");

  env.state.settingsValues.set(`sephrals-image-paste-drop.${__test__.ENABLE_DROP_SETTING}`, true);
  const dataTransfer = {
    files: [createImageFile()],
    items: [],
    types: [],
    dropEffect: "",
    getData() {
      return "";
    }
  };
  const dragEvent = {
    target: new TestHTMLElement(),
    dataTransfer,
    preventDefault() {
      this.prevented = true;
    }
  };
  __test__.onDragOver(dragEvent);
  assert.equal(dragEvent.prevented, true);
  assert.equal(dataTransfer.dropEffect, "copy");

  const dropEvent = {
    target: new TestHTMLElement(),
    dataTransfer,
    preventDefault() {
      this.prevented = true;
    },
    stopPropagation() {
      this.stopped = true;
    }
  };
  await __test__.onDrop(dropEvent);
  assert.equal(dropEvent.prevented, true);

  env.state.fetchImpl = async () => {
    throw new Error("network");
  };
  const uriDrop = {
    target: new TestHTMLElement(),
    dataTransfer: {
      files: [],
      items: [],
      types: ["text/uri-list"],
      getData(type) {
        return type === "text/uri-list" ? "https://example.com/image.png" : "";
      }
    },
    preventDefault() {},
    stopPropagation() {}
  };
  // The image stub still fails to load, so the link cannot be shown either: an error and no link offer
  await __test__.onDrop(uriDrop);
  assert.equal(env.state.notifications.error.at(-1), "error drop fetch failed");
  assert.equal(env.state.lastDialogOptions, null);
});

test("editable target, clipboard extraction, transfer detection, and dropped-image fetching handle variants", async () => {
  const editable = new TestHTMLElement();
  editable.setClosest(() => new TestHTMLElement());
  assert.equal(__test__.isEditableTarget(editable), true);
  assert.equal(__test__.isEditableTarget({}), false);

  const clipboardFile = createImageFile();
  const clipboardImage = __test__.extractClipboardImage({
    clipboardData: {
      items: [
        { kind: "string", type: "text/plain", getAsFile: () => null },
        { kind: "file", type: "image/png", getAsFile: () => clipboardFile }
      ]
    }
  });
  assert.equal(clipboardImage, clipboardFile);
  assert.equal(__test__.extractClipboardImage({ clipboardData: { items: [] } }), null);

  assert.equal(__test__.hasTransferableImage(null), false);
  assert.equal(__test__.hasTransferableImage({ files: [createImageFile()] }), true);
  assert.equal(__test__.hasTransferableImage({ files: [], items: [{ kind: "file", type: "image/png" }], types: [] }), true);
  assert.equal(__test__.hasTransferableImage({ files: [], items: [], types: ["text/html"] }), true);

  const fileItem = createImageFile("drop.png");
  assert.equal(await __test__.extractDroppedImage({ items: [{ kind: "file", type: "image/png", getAsFile: () => fileItem }] }), fileItem);
  const fileEntry = createImageFile("drop2.png");
  assert.equal(await __test__.extractDroppedImage({ items: [], files: [fileEntry] }), fileEntry);

  env.state.fetchImpl = async () => ({ ok: true, blob: async () => new Blob(["img"], { type: "image/jpeg" }) });
  const fetched = await __test__.extractDroppedImage({
    items: [],
    files: [],
    getData(type) {
      return type === "text/plain" ? "#comment\nhttps://example.com/path/photo.jpg" : "";
    }
  });
  assert.equal(fetched.name, "photo.jpg");

  env.state.fetchImpl = async () => ({ ok: true, blob: async () => new Blob(["txt"], { type: "text/plain" }) });
  assert.equal(await __test__.fetchDroppedImage("https://example.com/file.txt"), null);
  env.state.fetchImpl = async () => ({ ok: false, blob: async () => new Blob(["bad"], { type: "image/png" }) });
  await assert.rejects(() => __test__.fetchDroppedImage("https://example.com/file.png"), /drop fetch failed/);
  assert.equal(await __test__.fetchDroppedImage("#only-comment"), null);
  assert.equal(__test__.guessMimeTypeFromUri("asset.webp"), "image/webp");
  assert.equal(__test__.guessMimeTypeFromUri("asset.gif"), "image/gif");
  assert.equal(__test__.guessMimeTypeFromUri("asset.svg"), "image/svg+xml");
  assert.equal(__test__.guessMimeTypeFromUri("asset.avif"), "image/avif");
  assert.equal(__test__.guessMimeTypeFromUri("asset.png"), "image/png");
  assert.equal(__test__.guessMimeTypeFromUri("asset.bin"), "");
  assert.match(__test__.fileNameFromUri("not a uri", "png"), /clipboard-image|dropped-image/);
});

test("user access, directory, and naming helpers normalize values and permissions", async () => {
  assert.equal(__test__.canCurrentUserUseTool(), true);
  env.state.gm = false;
  assert.equal(__test__.canCurrentUserUseTool(), false);
  env.state.settingsValues.set(`sephrals-image-paste-drop.${__test__.ALLOW_PLAYER_TOOL_SETTING}`, true);
  assert.equal(__test__.canCurrentUserUseTool(), true);
  assert.deepEqual(__test__.getPermittedActions(), [__test__.ACTIONS.PREVIEW_ONLY]);

  assert.deepEqual(__test__.normalizeActionDecision({
    name: " Preview ",
    action: __test__.ACTIONS.PREVIEW_ONLY,
    uploadDirectory: "custom",
    shareToPlayers: true,
    activateScene: true,
    navigation: true
  }), {
    name: "Preview",
    action: __test__.ACTIONS.PREVIEW_ONLY,
    uploadDirectory: __test__.PLAYER_UPLOAD_DIRECTORY,
    shareToPlayers: false,
    activateScene: false,
    navigation: false,
    recipients: [],
    prototypeToken: false,
    chatMode: "current",
    optimize: true
  });

  assert.equal(__test__.requiresPersistentPath(__test__.ACTIONS.PREVIEW_ONLY, false), false);
  assert.equal(__test__.requiresPersistentPath(__test__.ACTIONS.SHARE_IMAGE, false), true);
  assert.match(__test__.defaultUploadDirectory(), /^clipboard-images\/\d{4}\/\d{2}$/);
  assert.equal(__test__.getWorldStorageRoot(), "worlds/world-id/sephrals-image-paste-drop");
  assert.equal(__test__.getRootedStoragePath("a/b"), "worlds/world-id/sephrals-image-paste-drop/a/b");
  assert.equal(__test__.normalizeUploadDirectory("data/worlds/world-id/sephrals-image-paste-drop/custom/"), "custom");
  assert.equal(__test__.getFileExtension("A.PNG"), "png");

  env.canvas.ready = true;
  env.canvas.scene = { id: "scene-1" };
  assert.deepEqual(__test__.getReusableManagedUploadTarget(__test__.ACTIONS.SHARE_IMAGE, createImageFile("any.png")), {
    directory: "clipboard-images/shared",
    fileName: "shared-gm-user.png"
  });
  assert.deepEqual(__test__.getReusableManagedUploadTarget(__test__.ACTIONS.SCENE_BACKGROUND_CURRENT, createImageFile("any.webp", "image/webp")), {
    directory: "clipboard-images/scenes/scene-1",
    fileName: "background.webp"
  });
  assert.deepEqual(__test__.getReusableManagedUploadTarget(__test__.ACTIONS.SCENE_FOREGROUND_CURRENT, createImageFile("any.jpg", "image/jpeg")), {
    directory: "clipboard-images/scenes/scene-1",
    fileName: "foreground.jpg"
  });

  env.state.settingsValues.set(`sephrals-image-paste-drop.${__test__.UPLOAD_DIRECTORY_HISTORY_SETTING}`, ["custom", "clipboard-images/2024/03"]);
  const choices = __test__.getUploadDirectoryChoices("custom");
  assert.equal(choices.includes("custom"), true);

  const hashedName = await __test__.buildContentAddressedUploadFileName(createImageFile("hash.png"));
  assert.match(hashedName, /^[a-f0-9]+\.png$/);
  await __test__.rememberUploadDirectory("custom");
  assert.deepEqual(env.state.settingWrites.map((entry) => entry.key), [__test__.DEFAULT_UPLOAD_DIRECTORY_SETTING, __test__.UPLOAD_DIRECTORY_HISTORY_SETTING]);

  const prepared = __test__.prepareClipboardFile(createImageFile(" Fancy Name.JPG ", "image/jpeg"));
  assert.equal(prepared.name.endsWith(".jpg"), true);
  assert.equal(__test__.extensionForMimeType("image/gif"), "gif");
  assert.equal(__test__.extensionForMimeType("image/webp"), "webp");
  assert.equal(__test__.extensionForMimeType("image/svg+xml"), "svg");
  assert.equal(__test__.extensionForMimeType("image/avif"), "avif");
  assert.equal(__test__.slugify(" Fancy Name "), "fancy-name");
  assert.match(__test__.defaultDocumentName(), /^clipboard-image-/);
  assert.match(__test__.uniqueDocumentName(), /^clipboard-image-/);
});

test("readImageDimensions and promptForAction cover dialog defaults, markup, and callback extraction", async () => {
  const dimensions = await __test__.readImageDimensions("blob:1");
  assert.deepEqual(dimensions, { width: 320, height: 200 });

  env.state.imageBehavior.error = true;
  await assert.rejects(() => __test__.readImageDimensions("blob:2"), /dimension read failed/);
  env.state.imageBehavior.error = false;

  env.canvas.ready = true;
  env.canvas.scene = { id: "scene-1" };
  env.state.dialogWaitResult = (options) => {
    const result = options.buttons[0].callback(null, {
      form: {
        elements: {
          name: { value: "Chosen" },
          action: { value: __test__.ACTIONS.UPLOAD_DIRECTORY },
          uploadDirectory: { value: "custom" },
          shareToPlayers: { checked: true },
          activateScene: { checked: false },
          navigation: { checked: true }
        }
      }
    });
    return result;
  };

  const decision = await __test__.promptForAction({ previewUrl: "blob:1", defaultName: "Default", width: 320, height: 200 });
  assert.deepEqual(decision, {
    name: "Chosen",
    action: __test__.ACTIONS.UPLOAD_DIRECTORY,
    uploadDirectory: "custom",
    shareToPlayers: true,
    activateScene: false,
    navigation: true,
    recipients: [],
    prototypeToken: false,
    chatMode: "current",
    optimize: true
  });
  assert.match(env.state.lastDialogOptions.content, /sipd-shell/);
  // The height follows the content, only the width comes from the saved window state
  assert.deepEqual(env.state.lastDialogOptions.position, { width: 860, height: "auto" });
  assert.equal(env.state.lastDialogOptions.window.height, undefined);
});

test("dialog configuration, action choices, and defaults respond to selected actions and themes", () => {
  env.canvas.ready = true;
  env.canvas.scene = { id: "scene-1" };
  env.state.settingsValues.set(`sephrals-image-paste-drop.${__test__.REMEMBER_LAST_ACTION_SETTING}`, true);
  env.state.settingsValues.set(`sephrals-image-paste-drop.${__test__.LAST_ACTION_SETTING}`, __test__.ACTIONS.UPLOAD_DIRECTORY);
  env.state.settingsValues.set(`sephrals-image-paste-drop.${__test__.DEFAULT_ACTION_SETTING}`, __test__.ACTIONS.SCENE_BACKGROUND_CURRENT);
  env.state.settingsValues.set(`sephrals-image-paste-drop.${__test__.UPLOAD_DIRECTORY_HISTORY_SETTING}`, ["custom"]);
  env.state.settingsValues.set(`sephrals-image-paste-drop.${__test__.UI_THEME_SETTING}`, __test__.UI_THEMES.FOUNDRY);

  const defaults = __test__.getDialogDefaults();
  assert.equal(defaults.action, __test__.ACTIONS.UPLOAD_DIRECTORY);
  assert.equal(defaults.uiTheme, __test__.UI_THEMES.FOUNDRY);

  const actionChoices = __test__.getActionChoices();
  assert.equal(actionChoices.some((entry) => entry.value === __test__.ACTIONS.TILE_FIT && entry.disabled === false), true);
  env.state.gm = false;
  env.state.settingsValues.set(`sephrals-image-paste-drop.${__test__.ALLOW_PLAYER_TOOL_SETTING}`, true);
  assert.deepEqual(__test__.getActionChoices().map((entry) => entry.value), [__test__.ACTIONS.PREVIEW_ONLY]);
  env.state.gm = true;

  assert.equal(__test__.getActionBehavior(__test__.ACTIONS.SCENE_BACKGROUND).supportsActivateScene, true);
  assert.equal(__test__.actionSupportsShareToPlayers(__test__.ACTIONS.JOURNAL_IMAGE), true);
  assert.equal(__test__.actionUsesSelectableUploadDirectory(__test__.ACTIONS.UPLOAD_DIRECTORY), true);
  assert.match(__test__.uploadDirectoryOptionsMarkup(["one"]), /option/);
  assert.match(__test__.actionOptionsMarkup(__test__.ACTIONS.SCENE_BACKGROUND_CURRENT), /selected/);

  const dialog = createDialogForm();
  const primaryButton = createButton("Insert");
  const secondaryButton = createButton("Cancel");
  dialog.windowContent.setQuerySelectorAll("button", [primaryButton, secondaryButton]);
  __test__.configureDialogForm(dialog.app, __test__.UI_THEMES.FOUNDRY, "blob:preview");
  assert.equal(dialog.app.element.dataset.uiTheme, __test__.UI_THEMES.FOUNDRY);
  assert.equal(dialog.preview.src, "blob:preview");
  assert.equal(primaryButton.classList.contains("sipd-button-primary"), true);
  assert.equal(secondaryButton.classList.contains("sipd-button-secondary"), true);
  assert.equal(dialog.activateField.disabled, false);

  dialog.actionField.value = __test__.ACTIONS.UPLOAD_DIRECTORY;
  dialog.actionField.fire();
  assert.equal(dialog.uploadField.disabled, false);
  assert.equal(dialog.uploadRow.hidden, false);
  assert.equal(dialog.shareField.disabled, true);
});

test("window state helpers read, apply, persist, and bind application sizes", async () => {
  env.state.settingsValues.set(`sephrals-image-paste-drop.${__test__.WINDOW_STATE_SETTING}`, {
    import: { width: 200, height: 100 },
    preview: { width: 500.6, height: 333.2 }
  });
  assert.deepEqual(__test__.getSavedWindowStates(), { import: { width: 200, height: 100 }, preview: { width: 500.6, height: 333.2 } });
  // The import dialogs only remember their width, their height follows the content
  assert.deepEqual(__test__.getSavedWindowState(__test__.WINDOW_KEYS.IMPORT, { width: 860, height: 720 }), { width: 320 });
  assert.deepEqual(__test__.getSavedWindowState(__test__.WINDOW_KEYS.BATCH, { width: 900 }), { width: 900 });
  assert.deepEqual(__test__.getSavedWindowState(__test__.WINDOW_KEYS.PREVIEW, {}), { width: 501, height: 333 });

  const element = new TestHTMLElement();
  element.rect = { width: 510, height: 341 };
  const app = { element, position: { width: 500, height: 300 } };
  assert.equal(__test__.getApplicationElement(app), element);
  assert.deepEqual(__test__.getApplicationSize(app), { width: 510, height: 341 });
  __test__.applyWindowState(app, __test__.WINDOW_KEYS.PREVIEW, { width: 480, height: 320 });
  assert.equal(element.style.width, "501px");

  const positionedApp = { position: {}, setPositionCalls: [], setPosition(state) { this.setPositionCalls.push(state); } };
  __test__.applyWindowState(positionedApp, "missing", { width: 480, height: 320 });
  assert.deepEqual(positionedApp.setPositionCalls[0], { width: 480, height: 320 });

  await __test__.persistWindowState(app, __test__.WINDOW_KEYS.IMPORT, { width: 540, height: 380 });
  assert.equal(env.state.settingWrites.at(-1).key, __test__.WINDOW_STATE_SETTING);

  __test__.queueWindowStateSave(app, __test__.WINDOW_KEYS.IMPORT);
  await flushPromises();

  const bindApp = { element: new TestHTMLElement(), position: { width: 600, height: 400 }, listeners: [], addEventListener(type, handler) { this.listeners.push({ type, handler }); } };
  bindApp.element.rect = { width: 620, height: 410 };
  __test__.bindWindowStatePersistence(bindApp, __test__.WINDOW_KEYS.PREVIEW);
  assert.equal(env.state.resizeObservers.length, 1);
  bindApp.element.dispatch("pointerup");
  await flushPromises();
  bindApp.listeners[0].handler();
  await flushPromises();
});

test("upload helpers cover permissions, reuse, existing files, directory creation, and errors", async () => {
  env.state.filesUploadPermission = false;
  await assert.rejects(() => __test__.uploadClipboardFile(createImageFile()), /upload permission/);
  env.state.filesUploadPermission = true;
  env.state.uploadResponse = { path: "worlds/world-id/sephrals-image-paste-drop/custom/target.png" };

  const reusablePath = await __test__.uploadClipboardFile(createImageFile("image.png"), {
    targetPath: { directory: "custom", fileName: "target.png" }
  });
  // A reused file name gets a version query from its content, so a replaced image gets a new URL
  const reusedFile = createImageFile("image.png");
  const version = (await __test__.hashFileContent(reusedFile)).slice(0, 12);
  assert.equal(reusablePath, `${env.state.uploadResponse.path}?v=${version}`);
  assert.equal(env.state.uploadCalls[0].target, "worlds/world-id/sephrals-image-paste-drop/custom");

  env.reset();
  const hashedUploadName = await __test__.buildContentAddressedUploadFileName(createImageFile("image.png"));
  env.state.browseResponse = { files: [`worlds/world-id/sephrals-image-paste-drop/custom/${hashedUploadName}`] };
  const existing = await __test__.uploadClipboardFile(createImageFile("image.png"), { directory: "custom" });
  assert.equal(existing, `worlds/world-id/sephrals-image-paste-drop/custom/${hashedUploadName}`);

  env.reset();
  env.state.createDirectoryErrors.set("worlds/world-id", new Error("already exists"));
  env.state.createDirectoryErrors.set("worlds/world-id/sephrals-image-paste-drop/custom", new Error("EEXIST"));
  await __test__.ensureDirectoryExists(foundry.applications.apps.FilePicker.implementation, "worlds/world-id/sephrals-image-paste-drop/custom");
  assert.equal(env.state.createDirectoryCalls.length >= 3, true);

  env.state.createDirectoryErrors.set("worlds/world-id/sephrals-image-paste-drop/custom/deeper", new Error("boom"));
  await assert.rejects(() => __test__.ensureDirectoryExists(foundry.applications.apps.FilePicker.implementation, "worlds/world-id/sephrals-image-paste-drop/custom/deeper"), /boom/);

  env.state.uploadResponse = {};
  await assert.rejects(() => __test__.uploadClipboardFile(createImageFile("image.png"), { targetPath: { directory: "custom", fileName: "target.png" } }), /upload failed/);
  assert.equal(await __test__.findExistingFilePath(foundry.applications.apps.FilePicker.implementation, "target", "file.png"), null);
});

test("action execution and scene or journal helpers cover all variants", async () => {
  const v13Scene = {
    background: { src: "old" },
    updateCalls: [],
    async update(data) {
      this.updateCalls.push(data);
    },
    constructor: { metadata: {} }
  };
  await __test__.applyImageToSceneLevel(v13Scene, { path: "new.png", width: 100, height: 80 });
  assert.equal(v13Scene.updateCalls[0].background.src, "new.png");

  const v14Scene = {
    initialLevel: { toObject: () => ({ _id: "level-1", background: {}, foreground: {} }) },
    updateCalls: [],
    async update(data) {
      this.updateCalls.push(data);
    },
    constructor: { metadata: { defaultLevelId: "level-1" } }
  };
  await __test__.applyImageToSceneLevel(v14Scene, { path: "new.png", width: 100, height: 80 });
  await __test__.applyImageToSceneForeground(v14Scene, { path: "fg.png" });
  assert.equal(__test__.supportsSceneLevels(v14Scene), true);
  assert.equal(v14Scene.updateCalls[0].levels[0].background.src, "new.png");
  assert.equal("initialLevel" in v14Scene.updateCalls[0], false);
  assert.equal(__test__.createDefaultLevelData({ constructor: { metadata: { defaultLevelId: "level-2" } } })._id, "level-2");

  // The viewed level wins over the initial level, other levels are left alone.
  const previousCanvasScene = env.canvas.scene;
  const previousCanvasLevel = env.canvas.level;
  const multiLevelScene = {
    initialLevel: { toObject: () => ({ _id: "ground", background: {}, foreground: {} }) },
    updateCalls: [],
    async update(data) {
      this.updateCalls.push(data);
    },
    constructor: { metadata: { defaultLevelId: "ground" } }
  };
  env.canvas.scene = multiLevelScene;
  env.canvas.level = { id: "upper", toObject: () => ({ _id: "upper", background: {}, foreground: {} }) };
  await __test__.applyImageToSceneForeground(multiLevelScene, { path: "upper-fg.png" });
  assert.deepEqual(multiLevelScene.updateCalls[0].levels.map((level) => level._id), ["upper"]);
  assert.equal(multiLevelScene.updateCalls[0].levels[0].foreground.src, "upper-fg.png");
  assert.equal("initialLevel" in multiLevelScene.updateCalls[0], false);
  assert.deepEqual(__test__.getViewedLevelIds(multiLevelScene), ["upper"]);
  assert.equal(__test__.getViewedLevelIds(v13Scene), null);

  // A v14 scene without any level gets the default level and points its initial level at it.
  const emptyScene = { updateCalls: [], async update(data) { this.updateCalls.push(data); }, constructor: { metadata: { defaultLevelId: "level-0" } } };
  env.canvas.scene = null;
  await __test__.applyImageToSceneForeground(emptyScene, { path: "fg.png" });
  assert.equal(emptyScene.updateCalls[0].initialLevel, "level-0");
  env.canvas.scene = previousCanvasScene;
  env.canvas.level = previousCanvasLevel;

  env.canvas.ready = true;
  env.canvas.scene = {
    id: "scene-1",
    name: "Scene One",
    background: {},
    constructor: { metadata: {} },
    updateCalls: [],
    async update(data) {
      this.updateCalls.push(data);
    },
    async createEmbeddedDocuments(_type, docs) {
      this.tileDocs = docs;
      return [{ name: docs[0].name }];
    }
  };
  const createdScene = await __test__.createSceneFromImage({ name: "Scene", path: "a.png", width: 100, height: 50, activateScene: true, navigation: false });
  assert.equal(createdScene.name, "Scene");

  const originalSceneCreate = globalThis.Scene.create;
  globalThis.Scene.create = async (data) => ({
    ...data,
    name: data.name,
    active: false,
    async update() {},
    async activate() {
      this.activated = true;
    },
    constructor: { metadata: {} }
  });
  const activatedScene = await __test__.createSceneFromImage({ name: "Needs Activate", path: "a.png", width: 100, height: 50, activateScene: true, navigation: false });
  assert.equal(activatedScene.activated, true);
  globalThis.Scene.create = originalSceneCreate;

  await __test__.updateCurrentSceneBackground({ path: "b.png", width: 90, height: 60 });
  await __test__.updateCurrentSceneForeground({ path: "c.png" });
  const tile = await __test__.createTileFromImage({ name: "Tile", path: "tile.png", width: 400, height: 200 }, { fitToScene: true });
  assert.equal(tile.name, "Tile");
  assert.deepEqual(__test__.fitDimensions(1000, 200, 400, 100), { width: 400, height: 80 });
  const journal = await __test__.createJournalEntryFromImage({ name: "Journal", path: "journal.png" });
  assert.equal(journal.name, "Journal");
  __test__.shareImageToPlayers("share.png", "Shared");
  assert.equal(env.state.showImageCalls.length, 1);

  __test__.openImagePreview("preview.png", "Preview", { revokeOnClose: "blob:2" });
  const popout = env.state.imagePopouts[0];
  popout.trigger("render");
  popout.trigger("close");
  assert.equal(env.state.revokedUrls.includes("blob:2"), true);

  await __test__.executeAction({ action: __test__.ACTIONS.SCENE_BACKGROUND, name: "Scene Action", path: "scene.png", width: 100, height: 60, activateScene: false, navigation: true, shareToPlayers: false });
  await __test__.executeAction({ action: __test__.ACTIONS.SCENE_BACKGROUND_CURRENT, name: "Scene Current", path: "current.png", width: 100, height: 60, shareToPlayers: false });
  await __test__.executeAction({ action: __test__.ACTIONS.SCENE_FOREGROUND_CURRENT, name: "Foreground Current", path: "fg.png", shareToPlayers: false });
  await __test__.executeAction({ action: __test__.ACTIONS.TILE_CENTERED, name: "Tile Centered", path: "tile.png", width: 100, height: 60, shareToPlayers: false });
  await __test__.executeAction({ action: __test__.ACTIONS.TILE_FIT, name: "Tile Fit", path: "tile-fit.png", width: 100, height: 60, shareToPlayers: false });
  await __test__.executeAction({ action: __test__.ACTIONS.UPLOAD_DIRECTORY, path: "up.png", name: "Upload", shareToPlayers: false });
  await __test__.executeAction({ action: __test__.ACTIONS.SHARE_IMAGE, path: "share.png", name: "Share", shareToPlayers: false });
  await __test__.executeAction({ action: __test__.ACTIONS.PREVIEW_ONLY, path: "preview.png", name: "Preview", temporaryObjectUrl: "blob:3", shareToPlayers: false });
  await __test__.executeAction({ action: __test__.ACTIONS.JOURNAL_IMAGE, path: "journal.png", name: "Journal", shareToPlayers: true });
  await assert.rejects(() => __test__.executeAction({ action: "unknown", shareToPlayers: false }), /unsupported action/);

  env.canvas.ready = false;
  env.canvas.scene = null;
  await assert.rejects(() => __test__.updateCurrentSceneBackground({ path: "x.png", width: 10, height: 10 }), /no scene/);
  await assert.rejects(() => __test__.updateCurrentSceneForeground({ path: "x.png" }), /no scene/);
  await assert.rejects(() => __test__.createTileFromImage({ name: "Missing", path: "x.png", width: 10, height: 10 }, { fitToScene: false }), /no scene/);
});

test("handleImportedImage covers cancel, remembered action, reusable upload, and preview retention", async () => {
  const file = createImageFile("Picture.png");
  env.canvas.ready = true;
  env.canvas.scene = { id: "scene-1", name: "Scene One", constructor: { metadata: {} }, background: {}, async update() {} };

  env.state.dialogWaitResult = null;
  await __test__.handleImportedImage(file);
  assert.equal(env.state.revokedUrls.includes("blob:1"), true);

  env.reset();
  env.state.gm = false;
  env.state.filesUploadPermission = false;
  env.state.settingsValues.set(`sephrals-image-paste-drop.${__test__.ALLOW_PLAYER_TOOL_SETTING}`, true);
  env.state.dialogWaitResult = {
    name: "Player Preview",
    action: __test__.ACTIONS.PREVIEW_ONLY,
    uploadDirectory: "custom",
    shareToPlayers: true,
    activateScene: true,
    navigation: true
  };
  await __test__.handleImportedImage(file);
  assert.equal(env.state.uploadCalls.length, 0);
  assert.equal(env.state.imagePopouts.length, 1);

  env.reset();
  env.canvas.ready = true;
  env.canvas.scene = { id: "scene-1", name: "Scene One", constructor: { metadata: {} }, background: {}, async update() {} };
  env.state.dialogWaitResult = {
    name: "Preview",
    action: __test__.ACTIONS.PREVIEW_ONLY,
    uploadDirectory: "custom",
    shareToPlayers: false,
    activateScene: false,
    navigation: false
  };
  await __test__.handleImportedImage(file);
  assert.equal(env.state.revokedUrls.includes("blob:1"), false);

  env.reset();
  env.canvas.ready = true;
  env.canvas.scene = { id: "scene-1", name: "Scene One", constructor: { metadata: {} }, background: {}, async update() {} };
  env.state.dialogWaitResult = {
    name: "Upload",
    action: __test__.ACTIONS.UPLOAD_DIRECTORY,
    uploadDirectory: "custom",
    shareToPlayers: false,
    activateScene: false,
    navigation: false
  };
  env.state.uploadResponse = { path: "worlds/world-id/sephrals-image-paste-drop/custom/uploaded.png" };
  await __test__.handleImportedImage(file);
  assert.equal(env.state.settingWrites.some((entry) => entry.key === __test__.LAST_ACTION_SETTING), true);
  assert.equal(env.state.settingWrites.some((entry) => entry.key === __test__.DEFAULT_UPLOAD_DIRECTORY_SETTING), true);
});

function setSetting(key, value) {
  env.state.settingsValues.set(`sephrals-image-paste-drop.${key}`, value);
}

function enablePlayerTargets(...actions) {
  env.state.gm = false;
  env.state.userId = "player-user";
  setSetting(__test__.ALLOW_PLAYER_TOOL_SETTING, true);
  setSetting(__test__.PLAYER_ACTIONS_SETTING, new Set(actions));
}

const PLAYER_FOLDER = "worlds/world-id/sephrals-image-paste-drop/clipboard-images/players";

test("player targets need the GM whitelist and the matching Foundry permissions", () => {
  const { ACTIONS } = __test__;
  env.state.gm = false;
  assert.deepEqual(__test__.getPermittedActions(), []);

  enablePlayerTargets(...__test__.PLAYER_SELECTABLE_ACTIONS, ACTIONS.SCENE_BACKGROUND, "bogus");
  assert.deepEqual([...__test__.getPlayerActionWhitelist()], [...__test__.PLAYER_SELECTABLE_ACTIONS]);

  env.state.filesUploadPermission = false;
  assert.deepEqual(__test__.getPermittedActions(), [ACTIONS.PREVIEW_ONLY]);
  assert.equal(__test__.canUserShareImages(), false);

  env.state.filesUploadPermission = true;
  const uploadTargets = [ACTIONS.TOKEN_IMAGE, ACTIONS.ACTOR_PORTRAIT, ACTIONS.CHAT_IMAGE, ACTIONS.UPLOAD_DIRECTORY, ACTIONS.SHARE_IMAGE, ACTIONS.PREVIEW_ONLY];
  assert.deepEqual(__test__.getPermittedActions(), uploadTargets);
  env.state.permissions.JOURNAL_CREATE = true;
  assert.deepEqual(__test__.getPermittedActions(), [ACTIONS.JOURNAL_IMAGE, ...uploadTargets]);
  assert.equal(__test__.canUserPerformAction(ACTIONS.SCENE_BACKGROUND), false);
  assert.equal(__test__.canUserPerformAction(ACTIONS.TILE_FIT), false);
  assert.equal(__test__.canUserPerformAction(ACTIONS.MAP_PIN), false);

  setSetting(__test__.PLAYER_ACTIONS_SETTING, [ACTIONS.JOURNAL_IMAGE]);
  assert.deepEqual(__test__.getPermittedActions(), [ACTIONS.JOURNAL_IMAGE, ACTIONS.PREVIEW_ONLY]);

  const journalDecision = __test__.normalizeActionDecision({ name: "Clip", action: ACTIONS.JOURNAL_IMAGE, uploadDirectory: "custom", shareToPlayers: true });
  assert.equal(journalDecision.action, ACTIONS.JOURNAL_IMAGE);
  assert.equal(journalDecision.uploadDirectory, __test__.PLAYER_UPLOAD_DIRECTORY);
  assert.equal(journalDecision.shareToPlayers, false);
  assert.equal(__test__.normalizeActionDecision({ action: ACTIONS.TILE_FIT }).action, ACTIONS.PREVIEW_ONLY);

  setSetting(__test__.PLAYER_ACTIONS_SETTING, new Set([ACTIONS.JOURNAL_IMAGE, ACTIONS.SHARE_IMAGE]));
  assert.equal(__test__.normalizeActionDecision({ name: "Clip", action: ACTIONS.JOURNAL_IMAGE, shareToPlayers: true }).shareToPlayers, true);
});

test("player uploads go into the prepared folder without creating directories", async () => {
  enablePlayerTargets(__test__.ACTIONS.UPLOAD_DIRECTORY);
  env.state.uploadResponse = { path: `${PLAYER_FOLDER}/hash.png` };

  assert.equal(await __test__.uploadClipboardFile(createImageFile("image.png"), { directory: "custom" }), `${PLAYER_FOLDER}/hash.png`);
  assert.equal(env.state.createDirectoryCalls.length, 0);
  assert.equal(env.state.browseCalls.length, 0);
  assert.equal(env.state.uploadCalls[0].target, PLAYER_FOLDER);

  env.state.permissions.FILES_BROWSE = true;
  await __test__.uploadClipboardFile(createImageFile("image.png"));
  assert.equal(env.state.browseCalls.length, 1);

  env.state.uploadResponse = false;
  await assert.rejects(() => __test__.uploadClipboardFile(createImageFile("image.png")), /player upload failed/);

  const failingPicker = { async browse() { throw new Error("no browse permission"); } };
  assert.equal(await __test__.findExistingFilePath(failingPicker, "target", "file.png"), null);
});

test("GM clients prepare the player folders once a player target is enabled", async () => {
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args);

  try {
    await env.hooks.trigger("init");
    await __test__.ensurePlayerStorageDirectories();
    setSetting(__test__.ALLOW_PLAYER_TOOL_SETTING, true);
    await __test__.ensurePlayerStorageDirectories();
    assert.equal(env.state.createDirectoryCalls.length, 0);

    setSetting(__test__.PLAYER_ACTIONS_SETTING, new Set([__test__.ACTIONS.UPLOAD_DIRECTORY]));
    const playerActions = env.state.registerCalls.find((entry) => entry.key === __test__.PLAYER_ACTIONS_SETTING);
    playerActions.data.onChange();
    await flushPromises();
    const targets = env.state.createDirectoryCalls.map((entry) => entry.target);
    assert.equal(targets.includes(PLAYER_FOLDER), true);
    assert.equal(targets.includes("worlds/world-id/sephrals-image-paste-drop/clipboard-images/shared"), true);

    env.state.createDirectoryCalls = [];
    env.state.gm = false;
    await __test__.ensurePlayerStorageDirectories();
    assert.equal(env.state.createDirectoryCalls.length, 0);

    env.state.gm = true;
    env.state.createDirectoryErrors.set("worlds", new Error("boom"));
    await __test__.ensurePlayerStorageDirectories();
    assert.equal(warnings.length, 1);
  } finally {
    console.warn = originalWarn;
  }
});

test("dialog hides the folder choice for players and sharing unless the GM allows it", () => {
  const { ACTIONS } = __test__;
  enablePlayerTargets(ACTIONS.JOURNAL_IMAGE, ACTIONS.UPLOAD_DIRECTORY);
  env.state.permissions.JOURNAL_CREATE = true;
  setSetting(__test__.DEFAULT_SHARE_SETTING, true);
  assert.equal(__test__.getDialogDefaults().shareToPlayers, false);

  const dialog = createDialogForm();
  __test__.configureDialogForm(dialog.app, __test__.UI_THEMES.SIGNATURE, null);
  dialog.actionField.value = ACTIONS.UPLOAD_DIRECTORY;
  dialog.actionField.fire();
  assert.equal(dialog.uploadRow.hidden, true);
  assert.equal(dialog.uploadField.disabled, true);
  dialog.actionField.value = ACTIONS.JOURNAL_IMAGE;
  dialog.actionField.fire();
  assert.equal(dialog.shareRow.hidden, true);
  assert.equal(dialog.shareField.disabled, true);

  setSetting(__test__.PLAYER_ACTIONS_SETTING, new Set([ACTIONS.JOURNAL_IMAGE, ACTIONS.SHARE_IMAGE]));
  assert.equal(__test__.getDialogDefaults().shareToPlayers, true);
  const sharingDialog = createDialogForm();
  __test__.configureDialogForm(sharingDialog.app, __test__.UI_THEMES.SIGNATURE, null);
  sharingDialog.actionField.value = ACTIONS.JOURNAL_IMAGE;
  sharingDialog.actionField.fire();
  assert.equal(sharingDialog.shareRow.hidden, false);
  assert.equal(sharingDialog.shareField.disabled, false);
});

test("handleImportedImage lets permitted players create and share journal images", async () => {
  const { ACTIONS } = __test__;
  enablePlayerTargets(ACTIONS.JOURNAL_IMAGE, ACTIONS.UPLOAD_DIRECTORY, ACTIONS.SHARE_IMAGE);
  env.state.permissions.JOURNAL_CREATE = true;
  env.state.uploadResponse = { path: `${PLAYER_FOLDER}/hash.png` };
  env.state.dialogWaitResult = { name: "Handout", action: ACTIONS.JOURNAL_IMAGE, uploadDirectory: "elsewhere", shareToPlayers: true, activateScene: false, navigation: false };

  await __test__.handleImportedImage(createImageFile("Handout.png"));
  assert.equal(env.state.createDirectoryCalls.length, 0);
  assert.equal(env.state.uploadCalls[0].target, PLAYER_FOLDER);
  assert.equal(env.state.journalCreates[0].pages[0].src, `${PLAYER_FOLDER}/hash.png`);
  assert.equal(env.state.showImageCalls.length, 1);

  env.state.dialogWaitResult = { name: "Upload", action: ACTIONS.UPLOAD_DIRECTORY, uploadDirectory: "elsewhere", shareToPlayers: false, activateScene: false, navigation: false };
  await __test__.handleImportedImage(createImageFile("Upload.png"));
  assert.equal(env.state.uploadCalls[1].target, PLAYER_FOLDER);
  assert.equal(env.state.settingWrites.some((entry) => entry.key === __test__.DEFAULT_UPLOAD_DIRECTORY_SETTING), false);
});

test("dragover leaves images alone for users who may not use the tool", () => {
  env.state.gm = false;
  const dragEvent = {
    target: new TestHTMLElement(),
    dataTransfer: { files: [createImageFile()], items: [], types: [], dropEffect: "" },
    preventDefault() {
      this.prevented = true;
    }
  };
  __test__.onDragOver(dragEvent);
  assert.equal(dragEvent.prevented, undefined);
  assert.equal(dragEvent.dataTransfer.dropEffect, "");
});

test("Follow Foundry uses Foundry's translation for languages the module does not bundle", async () => {
  env.state.fetchImpl = async (url) => ({
    ok: true,
    async json() {
      return /\/de\.json$/.test(String(url)) ? { "SIPD.Dialog.Title": "Bild einfügen" } : { "SIPD.Dialog.Title": "Dialog Title" };
    }
  });
  await __test__.ensureModuleTranslationsLoaded();
  env.game.i18n.lang = "fr";
  env.state.localizations.set("SIPD.Dialog.Title", "Insérer une image");
  setSetting(__test__.UI_LANGUAGE_SETTING, "default");
  assert.equal(__test__.getOverrideLanguage(), null);
  assert.equal(__test__.localize("SIPD.Dialog.Title"), "Insérer une image");

  setSetting(__test__.UI_LANGUAGE_SETTING, "de");
  assert.equal(__test__.localize("SIPD.Dialog.Title"), "Bild einfügen");
});

test("The Forge stores images in the Assets Library and matches absolute asset URLs", async () => {
  globalThis.ForgeVTT = { usingTheForge: true, ASSETS_LIBRARY_URL_PREFIX: "https://assets.forge-vtt.com/" };
  try {
    assert.equal(__test__.isForge(), true);
    assert.equal(__test__.getStorageSource(), "forgevtt");
    assert.equal(__test__.getWorldStorageRoot(), "sephrals-image-paste-drop/world-id");

    const root = "sephrals-image-paste-drop/world-id/custom";
    env.state.uploadResponse = { path: `https://assets.forge-vtt.com/user123/${root}/new.png` };
    const uploaded = await __test__.uploadClipboardFile(createImageFile("image.png"), { directory: "custom" });
    assert.equal(uploaded, env.state.uploadResponse.path);
    assert.deepEqual(env.state.createDirectoryCalls.map((entry) => [entry.source, entry.target]), [["forgevtt", root]]);
    assert.equal(env.state.browseCalls[0].source, "forgevtt");
    assert.equal(env.state.uploadCalls[0].source, "forgevtt");
    assert.equal(env.state.uploadCalls[0].target, root);

    const hashed = await __test__.buildContentAddressedUploadFileName(createImageFile("image.png"));
    env.state.browseResponse = { files: [`https://assets.forge-vtt.com/user123/${root}/${hashed}`] };
    const reused = await __test__.uploadClipboardFile(createImageFile("image.png"), { directory: "custom" });
    assert.equal(reused, `https://assets.forge-vtt.com/user123/${root}/${hashed}`);
    assert.equal(env.state.uploadCalls.length, 1);

    env.state.createDirectoryErrors.set(root, new Error("forge says no"));
    await __test__.ensureDirectoryExists(foundry.applications.apps.FilePicker.implementation, root);
  } finally {
    delete globalThis.ForgeVTT;
  }
  assert.equal(__test__.getStorageSource(), "data");
});

test("a configured storage folder replaces the default root everywhere", async () => {
  setSetting(__test__.STORAGE_FOLDER_SETTING, " /assets/handouts/ ");
  assert.equal(__test__.getConfiguredStorageFolder(), "assets/handouts");
  assert.equal(__test__.getWorldStorageRoot(), "assets/handouts");
  assert.equal(__test__.getRootedStoragePath("clipboard-images/players"), "assets/handouts/clipboard-images/players");
  assert.equal(__test__.normalizeUploadDirectory("assets/handouts/maps"), "maps");

  env.state.uploadResponse = { path: "assets/handouts/maps/x.png" };
  await __test__.uploadClipboardFile(createImageFile("image.png"), { directory: "maps" });
  assert.equal(env.state.uploadCalls[0].source, "data");
  assert.equal(env.state.uploadCalls[0].target, "assets/handouts/maps");
  assert.deepEqual(env.state.createDirectoryCalls.map((entry) => entry.target), ["assets", "assets/handouts", "assets/handouts/maps"]);
});

test("pasted image links run the URL import and other text keeps its normal paste", async () => {
  assert.equal(__test__.parseImageUrl(" https://example.com/maps/Cave.PNG?width=200 "), "https://example.com/maps/Cave.PNG?width=200");
  assert.equal(__test__.parseImageUrl("data:image/png;base64,iVBORw0KGgo="), "data:image/png;base64,iVBORw0KGgo=");
  assert.equal(__test__.parseImageUrl("https://example.com/gallery.html"), null);
  assert.equal(__test__.parseImageUrl("https://example.com/a.png\nhttps://example.com/b.png"), null);
  assert.equal(__test__.parseImageUrl("look at https://example.com/a.png"), null);
  assert.equal(__test__.parseImageUrl("ftp://example.com/a.png"), null);
  assert.equal(__test__.parseImageUrl("javascript:alert(1)//.png"), null);
  assert.equal(__test__.parseImageUrl("data:text/html,x.png"), null);
  assert.equal(__test__.parseImageUrl(null), null);
  assert.equal(__test__.extractClipboardImageUrl({ clipboardData: { items: [] } }), null);
  assert.doesNotMatch(__test__.fileNameFromUri("data:image/png;base64,iVBORw0KGgo=", "png"), /base64/);

  const fetched = [];
  env.state.fetchImpl = async (url) => {
    fetched.push(url);
    return { ok: true, blob: async () => new Blob(["img"], { type: "image/webp" }) };
  };
  env.state.dialogWaitResult = { name: "Linked", action: __test__.ACTIONS.PREVIEW_ONLY, shareToPlayers: false, activateScene: false, navigation: false };

  const linkPaste = createPasteEvent("https://example.com/maps/cave.webp");
  await __test__.onPaste(linkPaste);
  assert.equal(linkPaste.prevented, true);
  assert.deepEqual(fetched, ["https://example.com/maps/cave.webp"]);
  assert.equal(env.state.imagePopouts.length, 1);
  assert.equal(env.state.uploadCalls.length, 0);

  const textPaste = createPasteEvent("just some notes");
  await __test__.onPaste(textPaste);
  assert.equal(textPaste.prevented, undefined);

  const input = new TestHTMLElement();
  input.setClosest(() => input);
  const inputPaste = createPasteEvent("https://example.com/maps/cave.webp", { target: input });
  await __test__.onPaste(inputPaste);
  assert.equal(inputPaste.prevented, undefined);

  // Image data in the clipboard wins over a copied link
  await __test__.onPaste(createPasteEvent("https://example.com/other.png", { file: createImageFile() }));
  assert.equal(fetched.length, 1);
  assert.equal(env.state.imagePopouts.length, 2);

  setSetting(__test__.ENABLE_PASTE_SETTING, false);
  const disabledPaste = createPasteEvent("https://example.com/maps/cave.webp");
  await __test__.onPaste(disabledPaste);
  assert.equal(disabledPaste.prevented, undefined);
});

test("an image URL that cannot be downloaded can be linked for journal pages, sharing, and the preview", async () => {
  const { ACTIONS } = __test__;
  env.canvas.ready = true;
  env.canvas.scene = { id: "scene-1", name: "Scene One", constructor: { metadata: {} } };

  const remoteChoices = __test__.getActionChoices({ remoteUrl: true });
  // Without a selected token or character the portrait target stays unavailable
  assert.deepEqual(remoteChoices.filter((choice) => !choice.disabled).map((choice) => choice.value), __test__.REMOTE_URL_ACTIONS.filter((action) => action !== ACTIONS.ACTOR_PORTRAIT));
  assert.equal(__test__.getActionChoices().find((choice) => choice.value === ACTIONS.TILE_CENTERED).disabled, false);
  assert.equal(__test__.getDialogDefaults({ remoteUrl: true }).action, ACTIONS.JOURNAL_IMAGE);
  assert.equal(__test__.normalizeActionDecision({ action: ACTIONS.TILE_CENTERED }, { remoteUrl: true }).action, ACTIONS.PREVIEW_ONLY);
  assert.equal(__test__.normalizeActionDecision({ action: ACTIONS.UPLOAD_DIRECTORY }, { remoteUrl: true }).action, ACTIONS.PREVIEW_ONLY);
  assert.equal(__test__.normalizeActionDecision({ action: ACTIONS.JOURNAL_IMAGE }, { remoteUrl: true }).action, ACTIONS.JOURNAL_IMAGE);
  assert.equal(__test__.getUrlHostLabel("https://images.example.com/a.png"), "images.example.com");
  assert.equal(__test__.getUrlHostLabel("not a url"), "not a url");
  assert.equal(__test__.createFetchFailedError("https://x.test/a.png").remoteUrl, "https://x.test/a.png");

  const url = "https://images.example.com/maps/cave.png";
  const dialogs = [];
  env.state.fetchImpl = async () => {
    throw new TypeError("Failed to fetch");
  };
  env.state.dialogWaitResult = (options) => {
    dialogs.push(options);
    if ( options.buttons[0].action === "useUrl" ) return options.buttons[0].callback();
    return { name: "Linked Map", action: ACTIONS.JOURNAL_IMAGE, shareToPlayers: true, activateScene: false, navigation: false };
  };

  const linkPaste = createPasteEvent(url);
  await __test__.onPaste(linkPaste);
  assert.equal(linkPaste.prevented, true);
  assert.equal(dialogs.length, 2);
  assert.match(dialogs[0].content, /images\.example\.com/);
  assert.match(dialogs[1].content, /SIPD\.Dialog\.PreviewBadgeLinked/);
  assert.match(dialogs[1].content, /value="tile-centered" disabled/);
  assert.match(dialogs[1].content, /value="journal-image" selected/);
  assert.equal(env.state.uploadCalls.length, 0);
  assert.equal(env.state.objectUrls.length, 0);
  assert.equal(env.state.journalCreates[0].pages[0].src, url);
  assert.deepEqual(env.state.showImageCalls.map((call) => call.path), [url]);
  assert.equal(env.state.notifications.error.length, 0);

  // A failing HTTP response offers the link too, and declining it ends quietly
  env.reset();
  dialogs.length = 0;
  env.state.fetchImpl = async () => ({ ok: false });
  env.state.dialogWaitResult = (options) => {
    dialogs.push(options);
    return null;
  };
  const uriDrop = {
    target: new TestHTMLElement(),
    dataTransfer: { files: [], items: [], types: ["text/uri-list"], getData: (type) => type === "text/uri-list" ? url : "" },
    preventDefault() {},
    stopPropagation() {}
  };
  await __test__.onDrop(uriDrop);
  assert.equal(dialogs.length, 1);
  assert.equal(env.state.journalCreates.length, 0);
  assert.equal(env.state.notifications.error.length, 0);

  // A link the browser cannot show either ends with an error and no offer
  dialogs.length = 0;
  env.state.imageBehavior.error = true;
  await __test__.onDrop(uriDrop);
  assert.equal(dialogs.length, 0);
  assert.equal(env.state.notifications.error.at(-1), "error drop fetch failed");
});

test("tiles dropped on the canvas are centered on the drop point inside the scene", async () => {
  const { ACTIONS } = __test__;
  const board = new TestHTMLElement();
  const scene = {
    id: "scene-1",
    name: "Scene One",
    constructor: { metadata: {} },
    tileDocs: [],
    async createEmbeddedDocuments(_type, docs) {
      this.tileDocs.push(...docs);
      return [{ name: docs[0].name }];
    }
  };
  env.canvas.ready = true;
  env.canvas.scene = scene;
  env.canvas.app = { view: board };
  env.canvas.canvasCoordinatesFromClient = ({ x, y }) => ({ x: x * 2, y: y * 2 });

  try {
    assert.deepEqual(__test__.getCanvasDropPoint({ target: board, clientX: 150, clientY: 100, shiftKey: false }), { x: 300, y: 200, sceneId: "scene-1", snap: true });
    assert.equal(__test__.getCanvasDropPoint({ target: board, clientX: 1, clientY: 1, shiftKey: true }).snap, false);
    assert.equal(__test__.getCanvasDropPoint({ target: new TestHTMLElement(), clientX: 1, clientY: 1 }), null);

    // v13: x/y is the top-left corner
    const rect = { x: 100, y: 100, width: 1000, height: 800 };
    const size = { width: 200, height: 100 };
    assert.equal(__test__.tilesUseAnchorPosition(), false);
    assert.deepEqual(__test__.getTilePosition(size, rect), { x: 500, y: 450 });
    assert.deepEqual(__test__.getTilePosition(size, rect, { x: 400, y: 300 }), { x: 300, y: 250 });
    assert.deepEqual(__test__.getTilePosition(size, rect, { x: 120, y: 880 }), { x: 100, y: 800 });
    assert.deepEqual(__test__.getTilePosition({ width: 1200, height: 100 }, rect, { x: 400, y: 300 }), { x: 0, y: 250 });
    env.canvas.tiles = { getSnappedPoint: ({ x, y }) => ({ x: Math.round(x / 50) * 50, y: Math.round(y / 50) * 50 }) };
    assert.deepEqual(__test__.getTilePosition(size, rect, { x: 433, y: 318, snap: true }), { x: 350, y: 250 });
    assert.deepEqual(__test__.getTilePosition(size, rect, { x: 433, y: 318, snap: false }), { x: 333, y: 268 });
    assert.equal(__test__.clampSpan(-50, 100, 0, 1000), 0);
    assert.equal(__test__.clampSpan(950, 100, 0, 1000), 900);

    // v14: x/y is the texture anchor, the tile center by default, and Foundry snaps that point
    env.game.release = { generation: 14 };
    assert.equal(__test__.tilesUseAnchorPosition(), true);
    assert.deepEqual(__test__.getTilePosition(size, rect), { x: 600, y: 500 });
    assert.deepEqual(__test__.getTilePosition(size, rect, { x: 433, y: 318, snap: true }), { x: 450, y: 300 });
    assert.deepEqual(__test__.getTilePosition(size, rect, { x: 120, y: 880 }), { x: 200, y: 850 });
    delete env.game.release;
    delete env.canvas.tiles;

    // The sceneRect of the stub canvas is 1000 x 800 at 0,0
    const dropPoint = { x: 400, y: 300, sceneId: "scene-1", snap: false };
    await __test__.createTileFromImage({ name: "Dropped", path: "a.png", width: 200, height: 100, dropPoint }, { fitToScene: false });
    await __test__.createTileFromImage({ name: "Fitted", path: "a.png", width: 200, height: 100, dropPoint }, { fitToScene: true });
    await __test__.createTileFromImage({ name: "Elsewhere", path: "a.png", width: 200, height: 100, dropPoint: { ...dropPoint, sceneId: "scene-2" } }, { fitToScene: false });
    assert.deepEqual(scene.tileDocs.map((doc) => [doc.x, doc.y]), [[300, 250], [400, 350], [400, 350]]);

    // Full drop on the board: Shift skips snapping, a paste keeps the scene center
    scene.tileDocs = [];
    env.canvas.tiles = { getSnappedPoint: () => ({ x: 0, y: 0 }) };
    env.state.imageBehavior = { width: 200, height: 100, error: false };
    env.state.uploadResponse = { path: "worlds/world-id/sephrals-image-paste-drop/clipboard-images/tile.png" };
    env.state.dialogWaitResult = { name: "Dropped", action: ACTIONS.TILE_CENTERED, uploadDirectory: "custom", shareToPlayers: false, activateScene: false, navigation: false };
    await __test__.onDrop({
      target: board,
      clientX: 200,
      clientY: 150,
      shiftKey: true,
      dataTransfer: { files: [createImageFile()], items: [], types: [], getData: () => "" },
      preventDefault() {},
      stopPropagation() {}
    });
    await __test__.onPaste(createPasteEvent("", { file: createImageFile() }));
    assert.deepEqual(scene.tileDocs.map((doc) => [doc.x, doc.y]), [[300, 250], [400, 350]]);
    assert.equal(scene.tileDocs[0].texture.src, env.state.uploadResponse.path);
  } finally {
    delete env.canvas.app;
    delete env.canvas.canvasCoordinatesFromClient;
    delete env.canvas.tiles;
    delete env.game.release;
  }
});
function batchForm(values) {
  return {
    form: {
      elements: {
        name: { value: values.name ?? "Batch" },
        action: { value: values.action },
        uploadDirectory: { value: values.uploadDirectory ?? "custom" },
        navigation: { checked: Boolean(values.navigation) },
        chatMode: { value: values.chatMode ?? "current" },
        ...("optimize" in values ? { optimize: { checked: values.optimize } } : {})
      }
    }
  };
}

// Runs the batch dialog callback, or returns the plain decision for the single image dialog
function answerDialogs(batchValues, singleDecision = null) {
  const dialogs = [];
  env.state.dialogWaitResult = (options) => {
    dialogs.push(options);
    if ( /sipd-batch-grid/.test(options.content) ) return options.buttons[0].callback(null, batchForm(batchValues));
    return singleDecision;
  };
  return dialogs;
}

function createBatchScene(extra = {}) {
  return {
    id: "scene-1",
    name: "Scene One",
    constructor: { metadata: {} },
    tileDocs: [],
    notes: [],
    async createEmbeddedDocuments(type, docs) {
      if ( type === "Note" ) this.notes.push(...docs);
      else this.tileDocs.push(...docs);
      return docs;
    },
    ...extra
  };
}

test("pasting several images opens the batch dialog and creates one journal entry with a page each", async () => {
  const { BATCH_ACTIONS } = __test__;
  const dialogs = answerDialogs({ name: "Handouts", action: BATCH_ACTIONS.JOURNAL_PAGES });
  let upload = 0;
  env.state.uploadResponse = null;
  const originalUpload = foundry.applications.apps.FilePicker.implementation.upload;
  foundry.applications.apps.FilePicker.implementation.upload = async (source, target, file) => {
    env.state.uploadCalls.push({ source, target, file });
    upload += 1;
    return { path: `${target}/${upload}.png` };
  };

  try {
    const event = {
      target: new TestHTMLElement(),
      clipboardData: {
        items: [
          { kind: "file", type: "image/png", getAsFile: () => createImageFile("cave.png", "image/png", "one") },
          { kind: "string", type: "text/plain", getAsFile: () => null },
          { kind: "file", type: "image/png", getAsFile: () => createImageFile("image.png", "image/png", "two") }
        ],
        getData: () => ""
      },
      preventDefault() {
        this.prevented = true;
      },
      stopPropagation() {}
    };
    await __test__.onPaste(event);

    assert.equal(event.prevented, true);
    assert.equal(dialogs.length, 1);
    assert.match(dialogs[0].content, /data-batch-thumb="1"/);
    assert.match(dialogs[0].content, /value="batch-journal-pages" selected/);
    assert.equal(env.state.uploadCalls.length, 2);
    const entry = env.state.journalCreates[0];
    assert.equal(entry.name, "Handouts");
    assert.deepEqual(entry.pages.map((page) => [page.name, page.src, page.sort]), [
      ["cave", "worlds/world-id/sephrals-image-paste-drop/custom/1.png", 100000],
      ["Handouts 2", "worlds/world-id/sephrals-image-paste-drop/custom/2.png", 200000]
    ]);
    assert.deepEqual(env.state.revokedUrls, ["blob:1", "blob:2"]);
    assert.equal(env.state.settingWrites.find((entry) => entry.key === __test__.LAST_BATCH_ACTION_SETTING).value, BATCH_ACTIONS.JOURNAL_PAGES);
  } finally {
    foundry.applications.apps.FilePicker.implementation.upload = originalUpload;
  }
});

test("batch dialog wiring shows thumbnails and the options of the chosen target", () => {
  const { ACTIONS } = __test__;
  const form = new TestHTMLElement();
  const thumbs = [new TestHTMLElement(), new TestHTMLElement()];
  const rows = { uploadDirectory: new TestHTMLElement(), chatMode: new TestHTMLElement(), navigation: new TestHTMLElement() };
  const actionField = { value: ACTIONS.UPLOAD_DIRECTORY, listeners: [], addEventListener(_type, handler) { this.listeners.push(handler); } };
  form.elements = { action: actionField };
  thumbs.forEach((thumb, index) => form.setQuerySelector(`[data-batch-thumb="${index}"]`, thumb));
  for ( const [key, row] of Object.entries(rows) ) form.setQuerySelector(`[data-option-row="${key}"]`, row);
  const element = new TestHTMLElement();
  element.setQuerySelector("form", form);

  const optimizeNotes = [new TestHTMLElement()];
  const optimizeField = { checked: true, listeners: [], addEventListener(_type, handler) { this.listeners.push(handler); } };
  form.elements.optimize = optimizeField;
  form.setQuerySelectorAll("[data-optimize-thumb]", optimizeNotes);

  __test__.configureBatchDialogForm({ element, position: {} }, __test__.UI_THEMES.FOUNDRY, [{ objectUrl: "blob:a" }, { objectUrl: "blob:b" }]);
  assert.deepEqual(thumbs.map((thumb) => thumb.src), ["blob:a", "blob:b"]);
  // The size below a thumbnail hides while the batch checkbox is unchecked
  assert.equal(optimizeNotes[0].hidden, false);
  optimizeField.checked = false;
  optimizeField.listeners[0]();
  assert.equal(optimizeNotes[0].hidden, true);
  assert.equal(element.classList.contains("sipd-batch-dialog"), true);
  assert.deepEqual([rows.uploadDirectory.hidden, rows.chatMode.hidden, rows.navigation.hidden], [false, true, true]);

  actionField.value = ACTIONS.SCENE_BACKGROUND;
  actionField.listeners[0]();
  assert.deepEqual([rows.uploadDirectory.hidden, rows.chatMode.hidden, rows.navigation.hidden], [true, true, false]);
  actionField.value = ACTIONS.CHAT_IMAGE;
  actionField.listeners[0]();
  assert.deepEqual([rows.uploadDirectory.hidden, rows.chatMode.hidden, rows.navigation.hidden], [true, false, true]);
});

test("batch targets follow the player permissions and the scene state", () => {
  const { ACTIONS, BATCH_ACTIONS } = __test__;
  const values = () => __test__.getBatchActionChoices().map((choice) => [choice.value, choice.disabled]);
  assert.deepEqual(values(), [
    [BATCH_ACTIONS.JOURNAL_PAGES, false],
    [BATCH_ACTIONS.TILE_GRID, true],
    [ACTIONS.JOURNAL_IMAGE, false],
    [ACTIONS.SCENE_BACKGROUND, false],
    [ACTIONS.CHAT_IMAGE, false],
    [ACTIONS.UPLOAD_DIRECTORY, false]
  ]);
  assert.equal(__test__.normalizeBatchDecision({ action: BATCH_ACTIONS.TILE_GRID }), null);
  assert.equal(__test__.normalizeBatchDecision(null), null);
  assert.deepEqual(__test__.normalizeBatchDecision({ name: " ", action: ACTIONS.CHAT_IMAGE, chatMode: "public", navigation: true, uploadDirectory: "x" }).chatMode, "public");
  assert.equal(__test__.normalizeBatchDecision({ action: ACTIONS.SCENE_BACKGROUND, navigation: true }).navigation, true);

  enablePlayerTargets(ACTIONS.JOURNAL_IMAGE, ACTIONS.CHAT_IMAGE);
  assert.deepEqual(values(), [[ACTIONS.CHAT_IMAGE, false]]);
  assert.equal(__test__.normalizeBatchDecision({ action: ACTIONS.CHAT_IMAGE, uploadDirectory: "elsewhere" }).uploadDirectory, __test__.PLAYER_UPLOAD_DIRECTORY);
  env.state.permissions.JOURNAL_CREATE = true;
  assert.equal(values()[0][0], BATCH_ACTIONS.JOURNAL_PAGES);

  // A player without upload permission gets no batch target at all
  env.state.filesUploadPermission = false;
  assert.deepEqual(values(), []);
});

test("a batch without any usable target warns and a batch of failing links falls back to one image", async () => {
  enablePlayerTargets();
  await __test__.handleImportedBatch([createImageFile("a.png", "image/png", "a"), createImageFile("b.png", "image/png", "b")]);
  assert.equal(env.state.notifications.warn.at(-1), "SIPD.Notification.BatchUnavailable");
  assert.equal(env.state.lastDialogOptions, null);
  assert.deepEqual(env.state.revokedUrls, ["blob:1", "blob:2"]);

  env.reset();
  const fetched = [];
  env.state.fetchImpl = async (url) => {
    fetched.push(url);
    if ( url.includes("broken") ) return { ok: false };
    return { ok: true, blob: async () => new Blob(["img"], { type: "image/png" }) };
  };
  const dialogs = answerDialogs({}, { name: "Single", action: __test__.ACTIONS.PREVIEW_ONLY });
  await __test__.onDrop({
    target: new TestHTMLElement(),
    dataTransfer: {
      files: [],
      items: [],
      types: ["text/uri-list"],
      getData: (type) => type === "text/uri-list" ? "https://a.test/broken.png\nhttps://a.test/fine.png" : ""
    },
    preventDefault() {},
    stopPropagation() {}
  });
  assert.deepEqual(fetched, ["https://a.test/broken.png", "https://a.test/fine.png"]);
  assert.equal(env.state.notifications.warn.at(-1), "SIPD.Notification.BatchSkipped");
  assert.equal(dialogs.length, 1);
  assert.doesNotMatch(dialogs[0].content, /sipd-batch-grid/);
  assert.equal(env.state.imagePopouts.length, 1);

  env.state.fetchImpl = async () => ({ ok: false });
  await assert.rejects(() => __test__.importImageBatch(["https://a.test/x.png", "https://a.test/y.png"]), /drop fetch failed/);
});

test("a batch of files with only one readable image opens the single image dialog", async () => {
  env.state.imageBehavior.failSources = ["blob:1"];
  const dialogs = answerDialogs({}, { name: "Single", action: __test__.ACTIONS.PREVIEW_ONLY });
  await __test__.handleImportedBatch([createImageFile("broken.png", "image/png", "x"), createImageFile("fine.png", "image/png", "y")]);
  assert.equal(env.state.notifications.warn.at(-1), "SIPD.Notification.BatchSkipped");
  assert.equal(dialogs.length, 1);
  assert.doesNotMatch(dialogs[0].content, /sipd-batch-grid/);
  assert.equal(env.state.imagePopouts.length, 1);
  // The object URLs of the batch are released, the preview keeps its own
  assert.equal(env.state.revokedUrls.includes("blob:2"), true);
});

test("several pasted image links become a batch, mixed text stays a normal paste", async () => {
  assert.deepEqual(__test__.extractClipboardImageUrls(createPasteEvent("https://a.test/1.png\nhttps://a.test/2.webp")), ["https://a.test/1.png", "https://a.test/2.webp"]);
  assert.deepEqual(__test__.extractClipboardImageUrls(createPasteEvent("https://a.test/1.png\nnotes")), []);
  assert.deepEqual(__test__.extractDroppedImageUrls({ getData: () => "https://a.test/1.png\n#c\nhttps://a.test/2.png" }), ["https://a.test/1.png", "https://a.test/2.png"]);
  const files = [createImageFile("a.png"), new File(["t"], "notes.txt", { type: "text/plain" }), createImageFile("b.png")];
  assert.deepEqual(__test__.extractDroppedImageFiles({ items: [], files }).map((file) => file.name), ["a.png", "b.png"]);
  assert.equal(__test__.collectImageFiles(null).length, 0);

  const dialogs = answerDialogs({ action: __test__.ACTIONS.UPLOAD_DIRECTORY, uploadDirectory: "maps" });
  env.state.uploadResponse = { path: "worlds/world-id/sephrals-image-paste-drop/maps/x.png" };
  const paste = createPasteEvent("https://a.test/1.png\nhttps://a.test/2.png");
  await __test__.onPaste(paste);
  assert.equal(paste.prevented, true);
  assert.equal(dialogs.length, 1);
  assert.equal(env.state.uploadCalls.length, 2);
  assert.equal(env.state.uploadCalls[0].target, "worlds/world-id/sephrals-image-paste-drop/maps");
  assert.equal(env.state.notifications.info.at(-1), "SIPD.Notification.BatchUploaded");
  assert.equal(env.state.settingWrites.some((entry) => entry.key === __test__.DEFAULT_UPLOAD_DIRECTORY_SETTING && entry.value === "maps"), true);
});

test("dropped text without a link is left to Foundry", async () => {
  let prevented = false;
  let fetched = false;
  env.state.fetchImpl = async () => { fetched = true; return { ok: false }; };
  await __test__.onDrop({
    target: new TestHTMLElement(),
    dataTransfer: { files: [], items: [], types: ["text/plain", "text/html"], getData: (type) => type === "text/plain" ? "hello world" : (type === "text/html" ? "<b>hello</b> world" : "") },
    preventDefault() { prevented = true; },
    stopPropagation() {}
  });
  assert.equal(prevented, false);
  assert.equal(fetched, false);
  assert.equal(env.state.notifications.error.length, 0);
});

test("the same image link pasted on two lines is imported as one image", async () => {
  const fetched = [];
  env.state.fetchImpl = async (url) => {
    fetched.push(url);
    return { ok: true, blob: async () => new Blob(["img"], { type: "image/png" }) };
  };
  const dialogs = answerDialogs({}, { name: "Single", action: __test__.ACTIONS.PREVIEW_ONLY });
  const paste = createPasteEvent("https://a.test/1.png\nhttps://a.test/1.png");
  await __test__.onPaste(paste);
  assert.equal(paste.prevented, true);
  assert.deepEqual(fetched, ["https://a.test/1.png"]);
  assert.equal(dialogs.length, 1);
  assert.doesNotMatch(dialogs[0].content, /sipd-batch-grid/);
  assert.equal(env.state.notifications.error.length, 0);
  assert.equal(env.state.imagePopouts.length, 1);
});

test("a batch dropped on the canvas becomes a tile grid around the drop point on the viewed level", async () => {
  const board = new TestHTMLElement();
  const scene = createBatchScene({ constructor: { metadata: { defaultLevelId: "ground" } } });
  env.canvas.ready = true;
  env.canvas.scene = scene;
  env.canvas.level = { id: "upper" };
  env.canvas.app = { view: board };
  env.canvas.canvasCoordinatesFromClient = ({ x, y }) => ({ x, y });
  env.canvas.dimensions.size = 50;
  env.state.imageBehavior = { width: 200, height: 100, error: false };
  env.state.uploadResponse = { path: "tile.png" };
  answerDialogs({ action: __test__.BATCH_ACTIONS.TILE_GRID });

  try {
    await __test__.onDrop({
      target: board,
      clientX: 500,
      clientY: 400,
      shiftKey: false,
      dataTransfer: { files: [createImageFile("a.png", "image/png", "a"), createImageFile("b.png", "image/png", "b")], items: [], types: [], getData: () => "" },
      preventDefault() {},
      stopPropagation() {}
    });
    assert.deepEqual(scene.tileDocs.map((doc) => [doc.name, doc.x, doc.y, doc.width, doc.height]), [["a", 275, 350, 200, 100], ["b", 525, 350, 200, 100]]);
    assert.deepEqual(scene.tileDocs[0].levels, ["upper"]);
    assert.equal(env.state.notifications.info.at(-1), "SIPD.Notification.BatchTilesCreated");
  } finally {
    delete env.canvas.level;
    delete env.canvas.app;
    delete env.canvas.canvasCoordinatesFromClient;
    delete env.canvas.dimensions.size;
  }
});

test("batch targets create one scene, journal entry or chat post per image", async () => {
  const { ACTIONS } = __test__;
  const items = [{ name: "One", path: "1.png", width: 100, height: 50 }, { name: "Two", path: "2.png", width: 80, height: 40 }];

  await __test__.executeBatchAction({ action: ACTIONS.SCENE_BACKGROUND, name: "Maps", navigation: true, items });
  assert.deepEqual(env.state.sceneCreates.map((data) => [data.name, data.active, data.navigation]), [["One", false, true], ["Two", false, true]]);
  assert.deepEqual(env.state.notifications.info, ["SIPD.Notification.BatchScenesCreated"]);

  await __test__.executeBatchAction({ action: ACTIONS.JOURNAL_IMAGE, name: "Maps", items });
  assert.deepEqual(env.state.journalCreates.map((data) => data.pages[0].src), ["1.png", "2.png"]);

  await __test__.executeBatchAction({ action: ACTIONS.CHAT_IMAGE, name: "Maps", chatMode: "public", items });
  assert.match(env.state.chatCreates[0].content, /<img src="1\.png" alt="One"><img src="2\.png" alt="Two">/);

  await assert.rejects(() => __test__.executeBatchAction({ action: "bogus", items }), /unsupported action/);
  await assert.rejects(() => __test__.createTileGrid({ items }), /no scene/);
});

function createTokenScene() {
  const scene = createBatchScene({
    tokenUpdates: [],
    async updateEmbeddedDocuments(type, updates) {
      this.tokenUpdates.push({ type, updates });
      return updates;
    }
  });
  env.canvas.ready = true;
  env.canvas.scene = scene;
  return scene;
}

function createActor(id, { owner = true } = {}) {
  return {
    id,
    uuid: `Actor.${id}`,
    name: `Actor ${id}`,
    isOwner: owner,
    updates: [],
    async update(data) {
      this.updates.push(data);
    }
  };
}

test("token images change the selected tokens and the prototype of linked ones", async () => {
  const { ACTIONS } = __test__;
  const scene = createTokenScene();
  const hero = createActor("hero");
  const goblin = createActor("goblin", { owner: false });
  env.canvas.tokens = {
    controlled: [
      { document: { id: "t1", isOwner: true, actorLink: true }, actor: hero },
      { document: { id: "t2", isOwner: false, actorLink: false }, actor: goblin }
    ]
  };

  try {
    assert.equal(__test__.isActionAvailable(ACTIONS.TOKEN_IMAGE), true);
    await __test__.executeAction({ action: ACTIONS.TOKEN_IMAGE, path: "token.webp", name: "Token", prototypeToken: true });
    assert.deepEqual(scene.tokenUpdates[0], { type: "Token", updates: [{ _id: "t1", "texture.src": "token.webp" }, { _id: "t2", "texture.src": "token.webp" }] });
    assert.deepEqual(hero.updates, [{ "prototypeToken.texture.src": "token.webp" }]);
    assert.deepEqual(goblin.updates, []);

    // Players only change tokens of actors they own, and the prototype only on request
    enablePlayerTargets(ACTIONS.TOKEN_IMAGE);
    hero.updates = [];
    await __test__.updateTokenImages({ path: "mine.png", prototypeToken: false });
    assert.deepEqual(scene.tokenUpdates[1].updates, [{ _id: "t1", "texture.src": "mine.png" }]);
    assert.deepEqual(hero.updates, []);
    assert.equal(__test__.normalizeActionDecision({ action: ACTIONS.TOKEN_IMAGE, prototypeToken: true }).prototypeToken, true);
    assert.equal(__test__.normalizeActionDecision({ action: ACTIONS.CHAT_IMAGE, prototypeToken: true }).action, ACTIONS.PREVIEW_ONLY);

    env.canvas.tokens.controlled = [];
    assert.equal(__test__.isActionAvailable(ACTIONS.TOKEN_IMAGE), false);
    await assert.rejects(() => __test__.updateTokenImages({ path: "x.png" }), /SIPD\.Error\.NoToken/);
  } finally {
    delete env.canvas.tokens;
  }
});

test("portraits change the actors of the selected tokens, else the user's character", async () => {
  const { ACTIONS } = __test__;
  createTokenScene();
  const hero = createActor("hero");
  env.canvas.tokens = { controlled: [{ document: { id: "t1", isOwner: true }, actor: hero }, { document: { id: "t2", isOwner: true }, actor: hero }] };
  const originalUser = Object.getOwnPropertyDescriptor(env.game, "user");

  try {
    await __test__.executeAction({ action: ACTIONS.ACTOR_PORTRAIT, path: "portrait.png", name: "Portrait" });
    assert.deepEqual(hero.updates, [{ img: "portrait.png" }]);

    env.canvas.tokens.controlled = [];
    const character = createActor("pc");
    env.game.user.character = character;
    assert.deepEqual(__test__.getEligibleActors(), [character]);
    await __test__.updateActorPortraits({ path: "pc.png" });
    assert.deepEqual(character.updates, [{ img: "pc.png" }]);

    delete env.game.user.character;
    await assert.rejects(() => __test__.updateActorPortraits({ path: "x.png" }), /SIPD\.Error\.NoActor/);
  } finally {
    delete env.canvas.tokens;
    if ( originalUser ) Object.defineProperty(env.game, "user", originalUser);
    delete env.game.user.character;
  }
});

test("chat posts follow the current roll mode in v13 and the message mode in v14", async () => {
  const { ACTIONS } = __test__;
  env.state.coreSettings.rollMode = "blindroll";
  await __test__.executeAction({ action: ACTIONS.CHAT_IMAGE, path: "a.png", name: "A", chatMode: "current" });
  assert.equal(env.state.chatCreates[0].rollMode, "gmroll");
  assert.deepEqual(env.state.chatCreates[0].speaker, { alias: "Speaker" });
  assert.match(env.state.chatCreates[0].content, /sipd-chat-images/);

  await __test__.postImagesToChat([{ path: "b.png", name: "B" }], { chatMode: "public" });
  assert.equal(env.state.chatCreates[1].rollMode, "publicroll");

  env.game.release = { generation: 14 };
  env.state.coreSettings.messageMode = "self";
  try {
    assert.equal(__test__.getCurrentMessageMode(), "self");
    await __test__.postImagesToChat([{ path: "c.png", name: "C" }]);
    assert.equal(env.state.chatCreates[2].messageMode, "self");
    await __test__.postImagesToChat([{ path: "d.png", name: "D" }], { chatMode: "public" });
    assert.equal(env.state.chatCreates[3].messageMode, "public");
  } finally {
    delete env.game.release;
  }
  assert.equal(__test__.normalizeActionDecision({ action: ACTIONS.CHAT_IMAGE, chatMode: "public" }).chatMode, "public");
  assert.equal(__test__.normalizeActionDecision({ action: ACTIONS.JOURNAL_IMAGE, chatMode: "public" }).chatMode, "current");
});

test("map pins link a new journal entry at the drop point, snapped and on the viewed level", async () => {
  const { ACTIONS } = __test__;
  const scene = createBatchScene({ constructor: { metadata: { defaultLevelId: "ground" } } });
  env.canvas.ready = true;
  env.canvas.scene = scene;
  env.canvas.level = { id: "upper" };
  env.canvas.notes = { getSnappedPoint: ({ x, y }) => ({ x: Math.round(x / 100) * 100, y: Math.round(y / 100) * 100 }) };
  const originalCreate = JournalEntry.create;
  JournalEntry.create = async (data) => {
    env.state.journalCreates.push(data);
    return { id: "entry-1", name: data.name, pages: { contents: [{ id: "page-1" }] } };
  };

  try {
    await __test__.executeAction({ action: ACTIONS.MAP_PIN, path: "pin.png", name: "Pin", dropPoint: { x: 430, y: 270, sceneId: "scene-1", snap: true } });
    assert.deepEqual(scene.notes[0], { entryId: "entry-1", pageId: "page-1", x: 400, y: 300, levels: ["upper"] });
    assert.equal(env.state.journalCreates[0].pages[0].src, "pin.png");
    assert.deepEqual(env.state.notifications.info, ["SIPD.Notification.MapPinCreated"]);

    await __test__.createMapPinFromImage({ name: "Pasted", path: "p.png" });
    await __test__.createMapPinFromImage({ name: "Free", path: "f.png", dropPoint: { x: 2000, y: 33, sceneId: "scene-1", snap: false } });
    assert.deepEqual(scene.notes.slice(1).map((note) => [note.x, note.y]), [[500, 400], [1000, 33]]);
    assert.equal(__test__.canUserPerformAction(ACTIONS.MAP_PIN), true);
  } finally {
    JournalEntry.create = originalCreate;
    delete env.canvas.level;
    delete env.canvas.notes;
  }
  env.canvas.ready = false;
  await assert.rejects(() => __test__.createMapPinFromImage({ name: "None", path: "x.png" }), /no scene/);
});

test("shared images go to everyone or to the chosen users only", async () => {
  const { ACTIONS } = __test__;
  env.state.users = [
    { id: "gm-user", name: "Gamemaster", active: true },
    { id: "p2", name: "Zora", active: true },
    { id: "p1", name: "Anton", active: true },
    { id: "p3", name: "Offline", active: false }
  ];
  assert.deepEqual(__test__.getShareRecipientChoices(), [{ id: "p1", name: "Anton" }, { id: "p2", name: "Zora" }]);
  assert.match(__test__.recipientsMarkup(__test__.getShareRecipientChoices()), /value="p1"[\s\S]*Anton[\s\S]*value="p2"/);
  assert.match(__test__.recipientsMarkup([]), /SIPD\.Dialog\.RecipientsNone/);

  const form = { querySelectorAll: () => [{ value: "p2" }, { value: "ghost" }] };
  assert.deepEqual(__test__.readCheckedRecipients(form), ["p2", "ghost"]);
  assert.deepEqual(__test__.normalizeActionDecision({ action: ACTIONS.SHARE_IMAGE, recipients: ["p2", "ghost"] }).recipients, ["p2"]);
  assert.deepEqual(__test__.normalizeActionDecision({ action: ACTIONS.JOURNAL_IMAGE, recipients: ["p2"], shareToPlayers: false }).recipients, []);
  assert.deepEqual(__test__.normalizeActionDecision({ action: ACTIONS.JOURNAL_IMAGE, recipients: ["p2"], shareToPlayers: true }).recipients, ["p2"]);

  await __test__.executeAction({ action: ACTIONS.SHARE_IMAGE, path: "s.png", name: "S", recipients: ["p2"] });
  await __test__.executeAction({ action: ACTIONS.JOURNAL_IMAGE, path: "j.png", name: "J", shareToPlayers: true, recipients: [] });
  assert.deepEqual(env.state.showImageCalls.map((call) => call.options), [
    { title: "S", showTitle: true, users: ["p2"] },
    { title: "J", showTitle: true }
  ]);
});

test("the import dialog shows recipients, prototype and chat options only where they apply", () => {
  const { ACTIONS } = __test__;
  const dialog = createDialogForm();
  const extraRows = { recipients: new TestHTMLElement(), prototypeToken: new TestHTMLElement(), chatMode: new TestHTMLElement() };
  for ( const [key, row] of Object.entries(extraRows) ) dialog.form.setQuerySelector(`[data-option-row="${key}"]`, row);
  const note = new TestHTMLElement();
  dialog.form.setQuerySelector('[data-option-row="optimize"]', note);
  dialog.form.elements.prototypeToken = { checked: true, disabled: false };
  dialog.form.elements.chatMode = { value: "current", disabled: false };
  const shareListeners = [];
  dialog.shareField.addEventListener = (_type, handler) => shareListeners.push(handler);

  __test__.configureDialogForm(dialog.app, __test__.UI_THEMES.SIGNATURE, null);
  const visible = () => [extraRows.recipients.hidden, extraRows.prototypeToken.hidden, extraRows.chatMode.hidden].map((hidden) => !hidden);
  assert.deepEqual(visible(), [false, false, false]);

  dialog.shareField.checked = true;
  shareListeners[0]();
  assert.deepEqual(visible(), [true, false, false]);

  dialog.actionField.value = ACTIONS.TOKEN_IMAGE;
  dialog.actionField.fire();
  assert.deepEqual(visible(), [false, true, false]);
  assert.equal(dialog.form.elements.prototypeToken.disabled, false);

  dialog.actionField.value = ACTIONS.CHAT_IMAGE;
  dialog.actionField.fire();
  assert.deepEqual(visible(), [false, false, true]);
  assert.equal(note.hidden, false);

  dialog.actionField.value = ACTIONS.SHARE_IMAGE;
  dialog.actionField.fire();
  assert.deepEqual(visible(), [true, false, false]);

  dialog.actionField.value = ACTIONS.PREVIEW_ONLY;
  dialog.actionField.fire();
  assert.equal(note.hidden, true);
});

test("uploads are shrunk and converted to WebP when the settings ask for it, GIFs stay untouched", async () => {
  const { ACTIONS } = __test__;
  setSetting(__test__.CONVERT_WEBP_SETTING, true);
  setSetting(__test__.MAX_IMAGE_SIZE_SETTING, 256);
  setSetting(__test__.WEBP_QUALITY_SETTING, 80);
  const originalBitmap = globalThis.createImageBitmap;
  const originalCanvas = globalThis.OffscreenCanvas;
  const encoded = [];
  globalThis.createImageBitmap = async () => ({ close() {} });
  globalThis.OffscreenCanvas = class {
    constructor(width, height) {
      encoded.push({ width, height });
    }
    getContext() {
      return { drawImage() {} };
    }
    async convertToBlob(options) {
      encoded.push(options);
      return new Blob(["w"], { type: "image/webp" });
    }
  };
  env.canvas.ready = true;
  env.canvas.scene = createBatchScene();
  env.state.uploadResponse = { path: "uploaded.webp" };
  env.state.dialogWaitResult = { name: "Shrunk", action: ACTIONS.TILE_CENTERED, uploadDirectory: "custom" };

  try {
    assert.deepEqual(__test__.getImageOptimizationOptions(), { maxSize: 256, webp: true, quality: 80 });
    await __test__.handleImportedImage(createImageFile("Big.png", "image/png", "a png image"));
    assert.match(env.state.lastDialogOptions.content, /name="optimize" checked/);
    assert.match(env.state.lastDialogOptions.content, /SIPD\.Dialog\.OptimizeScaleFormat/);
    assert.deepEqual(encoded, [{ width: 256, height: 160 }, { type: "image/webp", quality: 0.8 }]);
    const uploaded = env.state.uploadCalls[0].file;
    assert.equal(uploaded.type, "image/webp");
    assert.match(uploaded.name, /^[a-f0-9]{64}\.webp$/);
    assert.equal(uploaded.name, `${await __test__.hashFileContent(new Blob(["w"]))}.webp`);
    assert.deepEqual([env.canvas.scene.tileDocs[0].width, env.canvas.scene.tileDocs[0].height], [256, 160]);

    encoded.length = 0;
    await __test__.handleImportedImage(createImageFile("Anim.gif", "image/gif", "gif data"));
    assert.equal(encoded.length, 0);
    assert.match(env.state.uploadCalls[1].file.name, /\.gif$/);
    assert.doesNotMatch(env.state.lastDialogOptions.content, /data-option-row="optimize"/);
  } finally {
    globalThis.createImageBitmap = originalBitmap;
    globalThis.OffscreenCanvas = originalCanvas;
  }
});

test("images posted to chat open in a popout on click", () => {
  const image = new TestHTMLElement();
  image.getAttribute = (name) => (name === "src" ? "chat.png" : "Chat Image");
  const html = new TestHTMLElement();
  html.setQuerySelectorAll(".sipd-chat-images img", [image]);
  __test__.onRenderChatMessage({}, html);
  image.dispatch("click");
  assert.equal(env.state.imagePopouts[0].config.src, "chat.png");
  assert.equal(env.state.imagePopouts[0].config.window.title, "Chat Image");
  __test__.onRenderChatMessage({}, null);
  assert.equal(__test__.getMaxImageSizeChoices()[0], "SIPD.Settings.MaxImageSize.Off");
  assert.equal(__test__.getMaxImageSizeChoices()[4096], "4096 px");
});

test("the optimize checkbox names size and format and only promises a format change that makes the file smaller", () => {
  const both = { scaled: true, converted: true, width: 2048, height: 1024, format: "WebP", ifSmaller: false };
  const scaleOnly = { scaled: true, converted: false, width: 2048, height: 1024, format: "PNG", ifSmaller: false };
  const formatOnly = { scaled: false, converted: true, width: 300, height: 200, format: "WebP", ifSmaller: true };
  assert.equal(__test__.optimizeLabelText(both), "SIPD.Dialog.OptimizeScaleFormat");
  assert.equal(__test__.optimizeLabelText(scaleOnly), "SIPD.Dialog.OptimizeScale");
  assert.equal(__test__.optimizeLabelText(formatOnly), "SIPD.Dialog.OptimizeFormat");
  assert.equal(__test__.optimizeHintText(both), "SIPD.Dialog.OptimizeHint");
  assert.equal(__test__.optimizeHintText(formatOnly), "SIPD.Dialog.OptimizeHintIfSmaller");

  env.state.localizations.set("SIPD.Dialog.OptimizeScaleFormat", "Save optimized: {width} x {height}, {format}");
  assert.equal(__test__.optimizeLabelText(both), "Save optimized: 2048 x 1024, WebP");
  env.state.localizations.delete("SIPD.Dialog.OptimizeScaleFormat");

  const markup = __test__.optimizeChoiceMarkup(formatOnly);
  assert.match(markup, /data-option-row="optimize"/);
  assert.match(markup, /<input type="checkbox" name="optimize" checked>/);
  assert.equal(__test__.optimizeChoiceMarkup(null), "");
  assert.match(__test__.optimizeChoiceMarkup(both, { label: "A <b>", hint: "B" }), /A &lt;b&gt;/);
});

test("the optimize decision defaults to the settings and only an unchecked box turns it off", () => {
  const { ACTIONS, BATCH_ACTIONS } = __test__;
  assert.equal(__test__.readOptimizeCheckbox({ elements: {} }), true);
  assert.equal(__test__.readOptimizeCheckbox(null), true);
  assert.equal(__test__.readOptimizeCheckbox({ elements: { optimize: { checked: true } } }), true);
  assert.equal(__test__.readOptimizeCheckbox({ elements: { optimize: { checked: false } } }), false);

  assert.equal(__test__.readOptimizeChoice({}), true);
  assert.equal(__test__.readOptimizeChoice({ optimize: "no" }), true);
  assert.equal(__test__.readOptimizeChoice({ optimize: false }), false);
  assert.equal(__test__.normalizeActionDecision({ action: ACTIONS.JOURNAL_IMAGE, optimize: false }).optimize, false);
  assert.equal(__test__.normalizeActionDecision({ action: ACTIONS.JOURNAL_IMAGE }).optimize, true);
  assert.equal(__test__.normalizeBatchDecision({ action: BATCH_ACTIONS.JOURNAL_PAGES, optimize: false }).optimize, false);
  assert.equal(__test__.normalizeBatchDecision({ action: BATCH_ACTIONS.JOURNAL_PAGES }).optimize, true);
});

test("an unchecked optimize box uploads the original file of this import and keeps the settings", async () => {
  const { ACTIONS } = __test__;
  setSetting(__test__.CONVERT_WEBP_SETTING, true);
  setSetting(__test__.MAX_IMAGE_SIZE_SETTING, 256);
  const originalBitmap = globalThis.createImageBitmap;
  const originalCanvas = globalThis.OffscreenCanvas;
  let encodes = 0;
  globalThis.createImageBitmap = async () => ({ close() {} });
  globalThis.OffscreenCanvas = class {
    getContext() {
      return { drawImage() {} };
    }
    async convertToBlob() {
      encodes += 1;
      return new Blob(["w"], { type: "image/webp" });
    }
  };
  env.canvas.ready = true;
  env.canvas.scene = createBatchScene();
  env.state.uploadResponse = { path: "uploaded.png" };
  env.state.dialogWaitResult = { name: "Original", action: ACTIONS.TILE_CENTERED, uploadDirectory: "custom", optimize: false };

  try {
    await __test__.handleImportedImage(createImageFile("Big.png", "image/png", "a png image"));
    assert.equal(encodes, 0);
    const uploaded = env.state.uploadCalls[0].file;
    assert.equal(uploaded.type, "image/png");
    assert.match(uploaded.name, /\.png$/);
    assert.deepEqual([env.canvas.scene.tileDocs[0].width, env.canvas.scene.tileDocs[0].height], [320, 200]);
    assert.equal(env.state.settingWrites.some((entry) => [__test__.CONVERT_WEBP_SETTING, __test__.MAX_IMAGE_SIZE_SETTING].includes(entry.key)), false);

    // The next import follows the settings again
    env.state.dialogWaitResult = { name: "Shrunk", action: ACTIONS.TILE_CENTERED, uploadDirectory: "custom" };
    await __test__.handleImportedImage(createImageFile("Big.png", "image/png", "a png image"));
    assert.equal(encodes, 1);
    assert.equal(env.state.uploadCalls[1].file.type, "image/webp");

    const original = createImageFile("x.png", "image/png", "x");
    const kept = await __test__.prepareUploadFile(original, { width: 320, height: 200 }, { optimize: false });
    assert.equal(kept.file, original);
    assert.deepEqual([kept.width, kept.height], [320, 200]);
  } finally {
    globalThis.createImageBitmap = originalBitmap;
    globalThis.OffscreenCanvas = originalCanvas;
  }
});

test("the batch dialog offers one optimize checkbox for all images and passes the choice to every upload", async () => {
  const { BATCH_ACTIONS } = __test__;
  setSetting(__test__.CONVERT_WEBP_SETTING, true);
  setSetting(__test__.MAX_IMAGE_SIZE_SETTING, 256);
  const originalBitmap = globalThis.createImageBitmap;
  const originalCanvas = globalThis.OffscreenCanvas;
  let encodes = 0;
  globalThis.createImageBitmap = async () => ({ close() {} });
  globalThis.OffscreenCanvas = class {
    getContext() {
      return { drawImage() {} };
    }
    async convertToBlob() {
      encodes += 1;
      return new Blob(["w"], { type: "image/webp" });
    }
  };
  env.state.uploadResponse = { path: "uploaded.png" };
  const dialogs = answerDialogs({ name: "Handouts", action: BATCH_ACTIONS.JOURNAL_PAGES, optimize: false });

  try {
    await __test__.handleImportedBatch([
      createImageFile("one.png", "image/png", "one"),
      createImageFile("two.gif", "image/gif", "two")
    ]);
    assert.equal(dialogs.length, 1);
    const content = dialogs[0].content;
    assert.equal((content.match(/name="optimize"/g) ?? []).length, 1);
    assert.match(content, /SIPD\.Batch\.OptimizeScaleFormat/);
    assert.match(content, /SIPD\.Batch\.OptimizeHint\b/);
    assert.equal((content.match(/data-optimize-thumb/g) ?? []).length, 1);
    assert.deepEqual(dialogs[0].position, { width: 900, height: "auto" });
    assert.equal(encodes, 0);
    assert.deepEqual(env.state.uploadCalls.map((call) => call.file.type), ["image/png", "image/gif"]);
  } finally {
    globalThis.createImageBitmap = originalBitmap;
    globalThis.OffscreenCanvas = originalCanvas;
  }
});

test("batch optimize texts summarize the plans of all images", () => {
  setSetting(__test__.MAX_IMAGE_SIZE_SETTING, 2048);
  env.state.localizations.set("SIPD.Batch.OptimizeScale", "Save optimized: at most {size} px");
  env.state.localizations.set("SIPD.Batch.OptimizeHintIfSmaller", "Applies to {count} of {total} images");
  const scaled = { plan: { width: 2048, height: 1024, scaled: true, type: "image/png" }, file: { type: "image/png" } };
  const converted = { plan: { width: 300, height: 200, scaled: false, type: "image/webp" }, file: { type: "image/png" } };
  const untouched = { plan: null, file: { type: "image/gif" } };

  assert.match(__test__.batchOptimizeChoiceMarkup([scaled, untouched]), /Save optimized: at most 2048 px/);
  assert.match(__test__.batchOptimizeChoiceMarkup([converted, untouched]), /Applies to 1 of 2 images/);
  assert.match(__test__.batchOptimizeChoiceMarkup([scaled, converted]), /SIPD\.Batch\.OptimizeScaleFormat/);
  assert.equal(__test__.batchOptimizeChoiceMarkup([untouched]), "");
  assert.equal(__test__.batchThumbOptimizeText({ scaled: true, converted: true, width: 2048, height: 1024, format: "WebP" }), "\u2192 2048 x 1024 WebP");
  assert.equal(__test__.batchThumbOptimizeText({ scaled: false, converted: true, format: "WebP" }), "\u2192 WebP");
  env.state.localizations.delete("SIPD.Batch.OptimizeScale");
  env.state.localizations.delete("SIPD.Batch.OptimizeHintIfSmaller");
});

test("the upload directory hint names the storage root as escaped text", () => {
  env.state.localizations.set("SIPD.Dialog.UploadDirectoryHint", "Choose a folder below {root}.");
  assert.equal(__test__.uploadDirectoryHintMarkup(), "Choose a folder below worlds/world-id/sephrals-image-paste-drop.");
  env.state.localizations.set("SIPD.Dialog.UploadDirectoryHint", "Below <world-id>/{root}");
  assert.doesNotMatch(__test__.uploadDirectoryHintMarkup(), /<world-id>/);
  env.state.localizations.delete("SIPD.Dialog.UploadDirectoryHint");
});
