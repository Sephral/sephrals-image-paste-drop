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
  assert.equal(env.state.registerCalls.length, 16);
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
  assert.equal(actionChoices.length, 9);
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
    navigation: false
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
    navigation: true
  });
  assert.match(env.state.lastDialogOptions.content, /sipd-shell/);
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
  assert.deepEqual(__test__.getSavedWindowState(__test__.WINDOW_KEYS.IMPORT, { width: 860, height: 720 }), { width: 320, height: 240 });
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
  assert.equal(reusablePath, env.state.uploadResponse.path);
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
  assert.deepEqual(__test__.getPermittedActions(), [ACTIONS.UPLOAD_DIRECTORY, ACTIONS.SHARE_IMAGE, ACTIONS.PREVIEW_ONLY]);
  env.state.permissions.JOURNAL_CREATE = true;
  assert.deepEqual(__test__.getPermittedActions(), [ACTIONS.JOURNAL_IMAGE, ACTIONS.UPLOAD_DIRECTORY, ACTIONS.SHARE_IMAGE, ACTIONS.PREVIEW_ONLY]);
  assert.equal(__test__.canUserPerformAction(ACTIONS.SCENE_BACKGROUND), false);
  assert.equal(__test__.canUserPerformAction(ACTIONS.TILE_FIT), false);

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
  assert.deepEqual(remoteChoices.filter((choice) => !choice.disabled).map((choice) => choice.value), [...__test__.REMOTE_URL_ACTIONS]);
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