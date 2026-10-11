import path from "node:path";
import { pathToFileURL } from "node:url";

class TestClassList {
  constructor(initial = []) {
    this.values = new Set(initial);
  }

  add(...tokens) {
    for (const token of tokens) this.values.add(token);
  }

  toggle(token, force) {
    if (force === undefined) {
      if (this.values.has(token)) this.values.delete(token);
      else this.values.add(token);
      return this.values.has(token);
    }

    if (force) this.values.add(token);
    else this.values.delete(token);
    return force;
  }

  contains(token) {
    return this.values.has(token);
  }
}

export class TestHTMLElement {
  constructor() {
    this.dataset = {};
    this.style = {};
    this.hidden = false;
    this.classList = new TestClassList();
    this.listeners = new Map();
    this.queryMap = new Map();
    this.queryAllMap = new Map();
    this.closestHandler = null;
    this.textContent = "";
  }

  addEventListener(type, handler) {
    const bucket = this.listeners.get(type) ?? [];
    bucket.push(handler);
    this.listeners.set(type, bucket);
  }

  removeEventListener(type, handler) {
    const bucket = this.listeners.get(type) ?? [];
    this.listeners.set(type, bucket.filter((entry) => entry !== handler));
  }

  dispatch(type, event = {}) {
    for (const handler of this.listeners.get(type) ?? []) handler({ currentTarget: this, ...event });
  }

  querySelector(selector) {
    return this.queryMap.get(selector) ?? null;
  }

  querySelectorAll(selector) {
    return this.queryAllMap.get(selector) ?? [];
  }

  closest(selector) {
    return this.closestHandler ? this.closestHandler(selector) : null;
  }

  setClosest(handler) {
    this.closestHandler = handler;
  }

  setQuerySelector(selector, value) {
    this.queryMap.set(selector, value);
  }

  setQuerySelectorAll(selector, value) {
    this.queryAllMap.set(selector, value);
  }

  getBoundingClientRect() {
    return this.rect ?? { width: 0, height: 0 };
  }
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;

  return Object.keys(value).sort((left, right) => left.localeCompare(right)).reduce((result, key) => {
    result[key] = stableValue(value[key]);
    return result;
  }, {});
}

function createHooksStub() {
  const onceHandlers = new Map();
  return {
    onceHandlers,
    once(event, handler) {
      const bucket = onceHandlers.get(event) ?? [];
      bucket.push(handler);
      onceHandlers.set(event, bucket);
    },
    async trigger(event, ...args) {
      for (const handler of onceHandlers.get(event) ?? []) await handler(...args);
    }
  };
}

export function modulePath(relativePath) {
  const absolute = path.resolve("d:\\_Projekte\\_Foundry-Development\\FoundryVTT_Module\\sephrals-image-paste-drop", relativePath);
  return pathToFileURL(absolute).href;
}

export async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

export function createButton(label = "") {
  const button = new TestHTMLElement();
  button.textContent = label;
  return button;
}

export function createTestEnvironment() {
  const state = {
    registerCalls: [],
    settingWrites: [],
    settingsValues: new Map(),
    settingsRegistry: new Map(),
    documentListeners: new Map(),
    notifications: { info: [], warn: [], error: [] },
    localizations: new Map(),
    dialogWaitResult: null,
    lastDialogOptions: null,
    browseResponse: { files: [] },
    uploadResponse: { path: "" },
    createDirectoryErrors: new Map(),
    createDirectoryCalls: [],
    uploadCalls: [],
    browseCalls: [],
    showImageCalls: [],
    imagePopouts: [],
    revokedUrls: [],
    objectUrls: [],
    sceneCreates: [],
    journalCreates: [],
    imageBehavior: { width: 320, height: 200, error: false },
    resizeObservers: [],
    fetchImpl: async () => ({ ok: true, blob: async () => new Blob(["png"], { type: "image/png" }), json: async () => ({}) }),
    now: 1710000000000,
    gm: true,
    allowPlayerToolUse: false,
    filesUploadPermission: true,
    permissions: {},
    ready: true,
    world: { id: "world-id", title: "World Title" },
    userId: "gm-user"
  };

  const hooks = createHooksStub();

  class TestImage {
    set src(value) {
      this._src = value;
      queueMicrotask(() => {
        if (state.imageBehavior.error) this.onerror?.(new Error("image error"));
        else {
          this.naturalWidth = state.imageBehavior.width;
          this.naturalHeight = state.imageBehavior.height;
          this.width = state.imageBehavior.width;
          this.height = state.imageBehavior.height;
          this.onload?.();
        }
      });
    }
  }

  class TestResizeObserver {
    constructor(callback) {
      this.callback = callback;
      state.resizeObservers.push(this);
    }

    observe(element) {
      this.element = element;
    }

    disconnect() {
      this.disconnected = true;
    }
  }

  class TestImagePopout {
    constructor(config) {
      this.config = config;
      this.position = { width: config.window?.width ?? 0, height: config.window?.height ?? 0 };
      this.element = new TestHTMLElement();
      this.listeners = new Map();
      state.imagePopouts.push(this);
    }

    addEventListener(type, handler, options) {
      const bucket = this.listeners.get(type) ?? [];
      bucket.push({ handler, options });
      this.listeners.set(type, bucket);
    }

    trigger(type) {
      for (const entry of this.listeners.get(type) ?? []) entry.handler();
    }

    render(options) {
      this.renderOptions = options;
    }

    setPosition(position) {
      this.setPositionCalls = [...(this.setPositionCalls ?? []), position];
    }
  }

  class TestStringField {
    constructor(options = {}) {
      this.options = options;
    }
  }

  class TestSetField {
    constructor(element, options = {}) {
      this.element = element;
      this.options = options;
    }
  }

  const foundry = {
    data: {
      fields: {
        SetField: TestSetField,
        StringField: TestStringField
      }
    },
    utils: {
      deepClone(value) {
        return structuredClone(value);
      },
      escapeHTML(value) {
        return String(value)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;");
      },
      diffObject(left, right) {
        return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right)) ? {} : { changed: true };
      }
    },
    applications: {
      api: {
        DialogV2: {
          async wait(options) {
            state.lastDialogOptions = options;
            return typeof state.dialogWaitResult === "function" ? state.dialogWaitResult(options) : state.dialogWaitResult;
          }
        }
      },
      apps: {
        FilePicker: {
          implementation: {
            async browse(source, target, options) {
              state.browseCalls.push({ source, target, options });
              return state.browseResponse;
            },
            async upload(source, target, file, body, options) {
              state.uploadCalls.push({ source, target, file, body, options });
              return state.uploadResponse;
            },
            async createDirectory(source, target, options) {
              state.createDirectoryCalls.push({ source, target, options });
              if (state.createDirectoryErrors.has(target)) throw state.createDirectoryErrors.get(target);
              return true;
            }
          }
        },
        ImagePopout: TestImagePopout
      }
    },
    documents: {
      collections: {
        Journal: {
          showImage(path, options) {
            state.showImageCalls.push({ path, options });
          }
        }
      }
    }
  };

  const game = {
    ready: state.ready,
    world: state.world,
    i18n: {
      lang: "en",
      localize(key) {
        return state.localizations.get(key) ?? key;
      },
      format(key, data) {
        const template = state.localizations.get(key) ?? key;
        return Object.entries(data ?? {}).reduce((result, [token, value]) => result.replaceAll(`{${token}}`, value), template);
      }
    },
    settings: {
      register(moduleId, key, data) {
        state.registerCalls.push({ moduleId, key, data });
        state.settingsRegistry.set(`${moduleId}.${key}`, data);
      },
      get(moduleId, key) {
        return state.settingsValues.get(`${moduleId}.${key}`);
      },
      async set(moduleId, key, value) {
        state.settingWrites.push({ moduleId, key, value });
        state.settingsValues.set(`${moduleId}.${key}`, value);
        return value;
      }
    },
    user: {
      get isGM() {
        return state.gm;
      },
      get id() {
        return state.userId;
      },
      hasPermission(permission) {
        return permission === "FILES_UPLOAD" ? state.filesUploadPermission : Boolean(state.permissions[permission]);
      }
    }
  };

  const ui = {
    windows: {},
    notifications: {
      info(message) {
        state.notifications.info.push(message);
      },
      warn(message) {
        state.notifications.warn.push(message);
      },
      error(message) {
        state.notifications.error.push(message);
      }
    }
  };

  const document = {
    addEventListener(type, handler, capture) {
      const bucket = state.documentListeners.get(type) ?? [];
      bucket.push({ handler, capture });
      state.documentListeners.set(type, bucket);
    }
  };

  const canvas = {
    ready: false,
    scene: null,
    dimensions: {
      sceneRect: { x: 0, y: 0, width: 1000, height: 800 }
    }
  };

  const Scene = {
    async create(data) {
      state.sceneCreates.push(data);
      return {
        ...data,
        name: data.name,
        active: data.active,
        updateCalls: [],
        async update(updateData) {
          this.updateCalls.push(updateData);
          return updateData;
        },
        async activate() {
          this.activated = true;
        },
        constructor: { metadata: {} }
      };
    }
  };

  const JournalEntry = {
    async create(data) {
      state.journalCreates.push(data);
      return { ...data, name: data.name };
    }
  };

  const originalDateNow = Date.now;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const originalFetch = globalThis.fetch;

  globalThis.HTMLElement = TestHTMLElement;
  globalThis.Hooks = hooks;
  globalThis.foundry = foundry;
  globalThis.game = game;
  globalThis.ui = ui;
  globalThis.document = document;
  globalThis.canvas = canvas;
  globalThis.Scene = Scene;
  globalThis.JournalEntry = JournalEntry;
  globalThis.Image = TestImage;
  globalThis.ResizeObserver = TestResizeObserver;
  globalThis.window = globalThis;
  globalThis.fetch = async (...args) => state.fetchImpl(...args);
  Date.now = () => state.now;
  URL.createObjectURL = (value) => {
    const url = `blob:${state.objectUrls.length + 1}`;
    state.objectUrls.push({ url, value });
    return url;
  };
  URL.revokeObjectURL = (value) => {
    state.revokedUrls.push(value);
  };

  state.localizations = new Map([
    ["SIPD.Action.SceneBackground", "Scene Background"],
    ["SIPD.Action.SceneBackgroundCurrent", "Current Background"],
    ["SIPD.Action.SceneForegroundCurrent", "Current Foreground"],
    ["SIPD.Action.TileCentered", "Tile Centered"],
    ["SIPD.Action.TileFit", "Tile Fit"],
    ["SIPD.Action.JournalImage", "Journal Image"],
    ["SIPD.Action.UploadDirectory", "Upload Directory"],
    ["SIPD.Action.ShareImage", "Share Image"],
    ["SIPD.Action.PreviewOnly", "Preview Only"],
    ["SIPD.DefaultName", "clipboard-image"],
    ["SIPD.Error.DropFetchFailed", "drop fetch failed"],
    ["SIPD.Error.DimensionRead", "dimension read failed"],
    ["SIPD.Error.UploadPermission", "upload permission"],
    ["SIPD.Error.UploadFailed", "upload failed"],
    ["SIPD.Error.PlayerUploadFailed", "player upload failed"],
    ["SIPD.Error.UnsupportedAction", "unsupported action"],
    ["SIPD.Error.NoScene", "no scene"],
    ["SIPD.Notification.Error", "error {message}"],
    ["SIPD.Notification.Uploaded", "uploaded {path}"],
    ["SIPD.Notification.SceneCreated", "scene created {name}"],
    ["SIPD.Notification.SceneUpdated", "scene updated {name}"],
    ["SIPD.Notification.SceneForegroundUpdated", "foreground updated {name}"],
    ["SIPD.Notification.TileCreated", "tile created {name}"],
    ["SIPD.Notification.JournalCreated", "journal created {name}"],
    ["SIPD.Dialog.Insert", "Insert"],
    ["SIPD.Dialog.Cancel", "Cancel"],
    ["SIPD.Dialog.Title", "Dialog Title"],
    ["SIPD.Dialog.Eyebrow", "Eyebrow"],
    ["SIPD.Dialog.Intro", "Intro"],
    ["SIPD.Dialog.StatsLabel", "Stats"],
    ["SIPD.Dialog.StatsValue", "Pixels"],
    ["SIPD.Dialog.PreviewTitle", "Preview"],
    ["SIPD.Dialog.Summary", "Summary {width} {height}"],
    ["SIPD.Dialog.PreviewBadge", "Preview Badge"],
    ["SIPD.Dialog.ConfigureTitle", "Configure"],
    ["SIPD.Dialog.ConfigureHint", "Hint"],
    ["SIPD.Dialog.Name", "Name"],
    ["SIPD.Dialog.Action", "Action"],
    ["SIPD.Dialog.UploadDirectory", "Upload Directory"],
    ["SIPD.Dialog.UploadDirectoryHint", "Upload Hint"],
    ["SIPD.Dialog.ShareToPlayers", "Share"],
    ["SIPD.Dialog.ShareHint", "Share Hint"],
    ["SIPD.Dialog.ActivateScene", "Activate"],
    ["SIPD.Dialog.ActivateHint", "Activate Hint"],
    ["SIPD.Dialog.Navigation", "Navigation"],
    ["SIPD.Dialog.NavigationHint", "Navigation Hint"],
    ["SIPD.Settings.Language.Label", "Language"],
    ["SIPD.Settings.Language.Hint", "Language hint"],
    ["SIPD.Language.Default", "Follow Foundry"],
    ["SIPD.Language.De", "Deutsch"],
    ["SIPD.Language.En", "English"],
    ["SIPD.Settings.Theme.OptionSignature", "Signature"],
    ["SIPD.Settings.Theme.OptionFoundry", "Foundry"]
  ]);

  const reset = () => {
    state.registerCalls = [];
    state.settingWrites = [];
    state.settingsValues = new Map();
    state.settingsRegistry = new Map();
    state.documentListeners = new Map();
    state.notifications = { info: [], warn: [], error: [] };
    state.dialogWaitResult = null;
    state.lastDialogOptions = null;
    state.browseResponse = { files: [] };
    state.uploadResponse = { path: "" };
    state.createDirectoryErrors = new Map();
    state.createDirectoryCalls = [];
    state.uploadCalls = [];
    state.browseCalls = [];
    state.showImageCalls = [];
    state.imagePopouts = [];
    state.revokedUrls = [];
    state.objectUrls = [];
    state.sceneCreates = [];
    state.journalCreates = [];
    state.imageBehavior = { width: 320, height: 200, error: false };
    state.resizeObservers = [];
    state.fetchImpl = async () => ({ ok: true, blob: async () => new Blob(["png"], { type: "image/png" }), json: async () => ({}) });
    state.now = 1710000000000;
    state.gm = true;
    state.allowPlayerToolUse = false;
    state.filesUploadPermission = true;
    state.permissions = {};
    state.ready = true;
    state.world = { id: "world-id", title: "World Title" };
    state.userId = "gm-user";
    game.ready = true;
    game.world = state.world;
    canvas.ready = false;
    canvas.scene = null;
    ui.windows = {};
    state.settingsValues.set("sephrals-image-paste-drop.enablePasteImport", true);
    state.settingsValues.set("sephrals-image-paste-drop.enableDropImport", true);
    state.settingsValues.set("sephrals-image-paste-drop.uiLanguage", "default");
    state.settingsValues.set("sephrals-image-paste-drop.defaultAction", "scene-background-current");
    state.settingsValues.set("sephrals-image-paste-drop.rememberLastAction", true);
    state.settingsValues.set("sephrals-image-paste-drop.lastAction", "scene-background-current");
    state.settingsValues.set("sephrals-image-paste-drop.defaultShareToPlayers", false);
    state.settingsValues.set("sephrals-image-paste-drop.defaultActivateScene", true);
    state.settingsValues.set("sephrals-image-paste-drop.defaultNavigation", true);
    state.settingsValues.set("sephrals-image-paste-drop.defaultUploadDirectory", "clipboard-images/2024/03");
    state.settingsValues.set("sephrals-image-paste-drop.uploadDirectoryHistory", []);
    state.settingsValues.set("sephrals-image-paste-drop.allowPlayerToolUse", false);
    state.settingsValues.set("sephrals-image-paste-drop.playerAllowedActions", new Set());
    state.settingsValues.set("sephrals-image-paste-drop.uiTheme", "signature");
    state.settingsValues.set("sephrals-image-paste-drop.windowState", {});
    game.i18n.lang = "en";
  };

  reset();

  return {
    state,
    hooks,
    game,
    canvas,
    reset,
    restore() {
      Date.now = originalDateNow;
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      globalThis.fetch = originalFetch;
    }
  };
}