import assert from "node:assert/strict";
import test from "node:test";

import { TestHTMLElement, createTestEnvironment, flushPromises, modulePath } from "./helpers/test-helpers.mjs";

const env = createTestEnvironment();
const { __test__ } = await import(modulePath("scripts/sipd.js"));
const { ACTIONS, QUICK_TARGETS } = __test__;

for ( const [key, value] of [
  ["SIPD.Action.TokenImageOf", "Use as image of the token {name}"],
  ["SIPD.Action.ActorPortraitOf", "Use as portrait of {name}"],
  ["SIPD.Action.TileImageOf", "Replace the image of the tile {name}"],
  ["SIPD.Action.ItemImageOf", "Use as image of the item {name}"],
  ["SIPD.Action.JournalPageOf", "Add an image page to {name}"],
  ["SIPD.Drop.Target.TokenImage", "Token image"],
  ["SIPD.Drop.Target.Tile", "New tile"],
  ["SIPD.Drop.Target.SceneBackground", "Scene background"],
  ["SIPD.Drop.Batch", "{count} images"],
  ["SIPD.Drop.DialogHint", "You can change the target in the dialog"]
] ) env.state.localizations.set(key, value);

const rect = (x, y, width, height) => ({ x, y, width, height });

function setSetting(key, value) {
  env.state.settingsValues.set(`sephrals-image-paste-drop.${key}`, value);
}

function enablePlayerTargets(...actions) {
  env.state.gm = false;
  env.state.userId = "player-user";
  setSetting(__test__.ALLOW_PLAYER_TOOL_SETTING, true);
  setSetting(__test__.PLAYER_ACTIONS_SETTING, new Set(actions));
}

function createDoc(documentName, name, { owner = true, ...extra } = {}) {
  return {
    documentName,
    id: `${documentName}-${name}`,
    name,
    isOwner: owner,
    updates: [],
    async update(data) {
      this.updates.push(data);
      return this;
    },
    ...extra
  };
}

// A scene on the canvas with one token, one tile and a board element. Canvas and screen coordinates are the same.
function createBoard({ tokenOwner = true, linked = false, tileBounds = rect(400, 400, 200, 200) } = {}) {
  const scene = {
    id: "scene-1",
    name: "Scene One",
    constructor: { metadata: {} },
    tokenUpdates: [],
    async updateEmbeddedDocuments(type, updates) {
      this.tokenUpdates.push({ type, updates });
      return updates;
    }
  };
  const actor = createDoc("Actor", "Hero", { owner: tokenOwner });
  const tokenDoc = createDoc("Token", "Goblin", { owner: tokenOwner, actorLink: linked, parent: scene, elevation: 0, sort: 0, actor });
  const token = { document: tokenDoc, visible: true, bounds: rect(100, 100, 100, 100), actor };
  tokenDoc.object = token;
  const tileDoc = createDoc("Tile", "", { texture: { src: "worlds/test/maps/Old%20Map.webp" }, elevation: 0, sort: 0 });
  const tile = { document: tileDoc, visible: true, bounds: tileBounds };
  const board = new TestHTMLElement();

  env.canvas.ready = true;
  env.canvas.scene = scene;
  env.canvas.app = { view: board };
  env.canvas.tokens = { placeables: [token], controlled: [] };
  env.canvas.tiles = { placeables: [tile], active: false };
  env.canvas.canvasCoordinatesFromClient = ({ x, y }) => ({ x, y });
  env.canvas.clientCoordinatesFromCanvas = ({ x, y }) => ({ x, y });
  env.canvas.stage = { scale: { x: 1 } };
  env.canvas.dimensions = { size: 100, sceneRect: rect(0, 0, 2000, 1500) };
  return { scene, actor, tokenDoc, token, tileDoc, tile, board };
}

function clearBoard() {
  for ( const key of ["app", "tokens", "tiles", "canvasCoordinatesFromClient", "clientCoordinatesFromCanvas", "stage"] ) delete env.canvas[key];
  env.canvas.dimensions = { sceneRect: rect(0, 0, 1000, 800) };
  delete globalThis.document.elementFromPoint;
  delete foundry.applications.instances;
  __test__.forgetPointer();
}

// An open sheet: the window element and the application behind it
function openSheet(document, { editable = true, v1 = false } = {}) {
  const windowElement = new TestHTMLElement();
  windowElement.id = `app-${document.id}`;
  const app = { document, isEditable: editable, element: windowElement, pages: [] };
  if ( v1 ) {
    windowElement.dataset.appid = "42";
    globalThis.ui.windows = { 42: app };
  } else {
    foundry.applications.instances = new Map([[windowElement.id, app]]);
  }
  const inner = new TestHTMLElement();
  inner.setClosest((selector) => selector === ".application, .window-app" ? windowElement : null);
  return { app, windowElement, inner };
}

test.beforeEach(() => {
  env.reset();
  __test__.resetModuleTranslations();
});

test.afterEach(() => {
  clearBoard();
  __test__.getDropIndicator()?.hide();
});

test.after(() => {
  env.restore();
});

test("a drop onto a token preselects that token's image and changes only it", async () => {
  const { scene, tokenDoc, board } = createBoard();
  env.canvas.tokens.controlled = [{ document: { id: "other", isOwner: true }, actor: null }];

  const context = __test__.resolveContextAt({ x: 150, y: 150, target: board });
  assert.equal(context.kind, "token");
  assert.equal(context.action, ACTIONS.TOKEN_IMAGE);
  assert.equal(context.name, "Goblin");
  // An unlinked token has no portrait of its own to offer
  assert.equal(context.actor, null);

  const choices = __test__.getActionChoices({ context });
  const tokenChoice = choices.find((choice) => choice.value === ACTIONS.TOKEN_IMAGE);
  assert.equal(tokenChoice.label, "Use as image of the token Goblin");
  assert.equal(tokenChoice.disabled, false);
  assert.equal(choices.some((choice) => __test__.CONTEXT_ACTIONS.includes(choice.value)), false);
  assert.equal(__test__.getDialogDefaults({ context }).action, ACTIONS.TOKEN_IMAGE);

  // The full drop: the dialog starts with the token target, the selected token stays untouched
  let content = "";
  env.state.imageBehavior = { width: 256, height: 256, error: false };
  env.state.uploadResponse = { path: "worlds/world-id/sephrals-image-paste-drop/clipboard-images/goblin.png" };
  env.state.dialogWaitResult = (options) => {
    content = options.content;
    return { name: "Goblin", action: ACTIONS.TOKEN_IMAGE, uploadDirectory: "custom", prototypeToken: true };
  };
  await __test__.onDrop({
    target: board,
    clientX: 150,
    clientY: 150,
    dataTransfer: { files: [new File(["png"], "goblin.png", { type: "image/png" })], items: [], types: ["Files"], getData: () => "" },
    preventDefault() {},
    stopPropagation() {}
  });
  assert.match(content, /<option value="token-image" selected>Use as image of the token Goblin<\/option>/);
  assert.deepEqual(scene.tokenUpdates, [{ type: "Token", updates: [{ _id: tokenDoc.id, "texture.src": env.state.uploadResponse.path }] }]);
  // A target that came from the drop position is not the one to start with next time
  assert.equal(env.state.settingWrites.some((write) => write.key === __test__.LAST_ACTION_SETTING), false);
});

test("linked tokens offer their actor's portrait, players only reach their own tokens", async () => {
  const { actor, board } = createBoard({ linked: true });
  let context = __test__.resolveContextAt({ x: 150, y: 150, target: board });
  assert.equal(context.actor, actor);
  assert.equal(__test__.isActionAvailable(ACTIONS.ACTOR_PORTRAIT, context), true);
  assert.equal(__test__.getActionChoices({ context }).find((choice) => choice.value === ACTIONS.ACTOR_PORTRAIT).label, "Use as portrait of Hero");
  await __test__.executeAction({ action: ACTIONS.ACTOR_PORTRAIT, path: "hero.png", name: "Hero", context });
  assert.deepEqual(actor.updates, [{ img: "hero.png" }]);

  // A player who may only change portraits gets the portrait target on the own linked token
  enablePlayerTargets(ACTIONS.ACTOR_PORTRAIT);
  context = __test__.resolveContextAt({ x: 150, y: 150, target: board });
  assert.equal(context.action, ACTIONS.ACTOR_PORTRAIT);
  // A video cannot be a portrait, then the drop counts as one onto the empty board
  assert.equal(__test__.resolveContextAt({ x: 150, y: 150, target: board }, { media: { video: true } }).kind, "canvas");

  clearBoard();
  const foreign = createBoard({ tokenOwner: false });
  enablePlayerTargets(ACTIONS.TOKEN_IMAGE);
  context = __test__.resolveContextAt({ x: 150, y: 150, target: foreign.board });
  assert.deepEqual(context, { kind: "canvas", point: { x: 150, y: 150 } });
  assert.deepEqual(__test__.getEligibleTokens({ kind: "token", document: foreign.tokenDoc }), []);
});

test("tiles take a new picture in place, only for a GM, and large tiles only on the tiles layer", async () => {
  const { tileDoc, board } = createBoard();
  const context = __test__.resolveContextAt({ x: 500, y: 500, target: board });
  assert.equal(context.kind, "tile");
  assert.equal(context.action, ACTIONS.TILE_IMAGE);
  // v13 tiles have no name, the picture's file name stands in
  assert.equal(context.name, "Old Map");
  assert.equal(__test__.getActionChoices({ context }).find((choice) => choice.value === ACTIONS.TILE_IMAGE).label, "Replace the image of the tile Old Map");

  await __test__.executeAction({ action: ACTIONS.TILE_IMAGE, path: "new.webp", name: "Tile", context });
  assert.deepEqual(tileDoc.updates, [{ "texture.src": "new.webp" }]);
  await assert.rejects(() => __test__.replaceTileImage({ path: "x.png", context: null }), /SIPD\.Error\.NoTarget/);
  // Without the drop onto a tile the target does not exist
  assert.equal(__test__.normalizeActionDecision({ action: ACTIONS.TILE_IMAGE }).action, ACTIONS.PREVIEW_ONLY);
  assert.equal(__test__.normalizeActionDecision({ action: ACTIONS.TILE_IMAGE }, { context }).action, ACTIONS.TILE_IMAGE);

  enablePlayerTargets(ACTIONS.TOKEN_IMAGE);
  assert.equal(__test__.resolveContextAt({ x: 500, y: 500, target: board }).kind, "canvas");

  clearBoard();
  env.reset();
  const large = createBoard({ tileBounds: rect(0, 0, 2000, 1500) });
  assert.equal(__test__.resolveContextAt({ x: 900, y: 900, target: large.board }).kind, "canvas");
  env.canvas.tiles.active = true;
  assert.equal(__test__.resolveContextAt({ x: 900, y: 900, target: large.board }).kind, "tile");
  // On the tiles layer a tile under a token wins
  assert.equal(__test__.resolveContextAt({ x: 150, y: 150, target: large.board }).kind, "tile");
});

test("open actor, item and journal sheets get the portrait, the item image or a new page", async () => {
  env.canvas.ready = false;
  const actor = createDoc("Actor", "Mira");
  const actorSheet = openSheet(actor);
  let context = __test__.resolveContextAt({ x: 10, y: 10, target: actorSheet.inner });
  assert.equal(context.kind, "actor");
  assert.equal(context.action, ACTIONS.ACTOR_PORTRAIT);
  assert.equal(context.element, actorSheet.windowElement);
  assert.equal(__test__.getDialogDefaults({ context }).action, ACTIONS.ACTOR_PORTRAIT);
  assert.equal(__test__.resolveContextAt({ x: 10, y: 10, target: actorSheet.inner }, { media: { video: true } }), null);
  await __test__.executeAction({ action: ACTIONS.ACTOR_PORTRAIT, path: "mira.png", name: "Mira", context });
  assert.deepEqual(actor.updates, [{ img: "mira.png" }]);

  const item = createDoc("Item", "Longsword");
  const itemSheet = openSheet(item, { v1: true });
  context = __test__.resolveContextAt({ x: 10, y: 10, target: itemSheet.inner });
  assert.equal(context.action, ACTIONS.ITEM_IMAGE);
  assert.equal(__test__.getActionChoices({ context }).find((choice) => choice.value === ACTIONS.ITEM_IMAGE).label, "Use as image of the item Longsword");
  // Item images, like portraits, show the picture in HTML: a linked image works, a video does not
  assert.equal(__test__.isActionForMedia(ACTIONS.ITEM_IMAGE, { remoteUrl: true }), true);
  assert.equal(__test__.isActionForMedia(ACTIONS.ITEM_IMAGE, { video: true }), false);
  await __test__.executeAction({ action: ACTIONS.ITEM_IMAGE, path: "sword.webp", name: "Sword", context });
  assert.deepEqual(item.updates, [{ img: "sword.webp" }]);

  const created = [];
  const shown = [];
  const journal = createDoc("JournalEntry", "Handouts", {
    pages: { contents: [{ sort: 100000 }, { sort: 300000 }] },
    async createEmbeddedDocuments(type, data) {
      created.push({ type, data });
      return data.map((entry, index) => ({ ...entry, id: `page-${index}` }));
    }
  });
  const journalSheet = openSheet(journal);
  journalSheet.app.goToPage = (id) => shown.push(id);
  context = __test__.resolveContextAt({ x: 10, y: 10, target: journalSheet.inner });
  assert.equal(context.action, ACTIONS.JOURNAL_PAGE);
  await __test__.executeAction({ action: ACTIONS.JOURNAL_PAGE, path: "letter.webp", name: "Letter", context });
  assert.deepEqual(created, [{ type: "JournalEntryPage", data: [{ name: "Letter", type: "image", src: "letter.webp", title: { show: false }, sort: 400000 }] }]);
  assert.deepEqual(shown, ["page-0"]);

  // Sheets the user may not edit, and players who do not own the document, keep the usual drop
  const locked = openSheet(createDoc("Actor", "Statue"), { editable: false });
  assert.equal(__test__.resolveContextAt({ x: 10, y: 10, target: locked.inner }), null);
  enablePlayerTargets(ACTIONS.ACTOR_PORTRAIT, ACTIONS.ITEM_IMAGE);
  const foreign = openSheet(createDoc("Actor", "Villain", { owner: false }));
  assert.equal(__test__.resolveContextAt({ x: 10, y: 10, target: foreign.inner }), null);
  const own = openSheet(createDoc("Item", "Dagger"));
  assert.equal(__test__.resolveContextAt({ x: 10, y: 10, target: own.inner }).action, ACTIONS.ITEM_IMAGE);
  // The journal page target needs its own player opt-in
  const notes = openSheet(createDoc("JournalEntry", "Notes"));
  assert.equal(__test__.resolveContextAt({ x: 10, y: 10, target: notes.inner }), null);
});

test("pastes and the insert shortcut go to what is under the mouse", async () => {
  const { scene, tokenDoc, board } = createBoard();
  globalThis.document.elementFromPoint = () => board;

  assert.equal(__test__.getPointerContext(), null);
  __test__.trackPointer({ clientX: 150, clientY: 150 });
  const context = __test__.getPointerContext();
  assert.equal(context.kind, "token");
  // An empty spot on the board keeps the usual paste
  __test__.trackPointer({ clientX: 1500, clientY: 1200 });
  assert.equal(__test__.getPointerContext(), null);

  // The shortcut changes the token without the dialog, the share shortcut still shows the image
  assert.equal(__test__.buildQuickDecision(QUICK_TARGETS.DEFAULT, { context }).action, ACTIONS.TOKEN_IMAGE);
  assert.equal(__test__.buildQuickDecision(QUICK_TARGETS.SHARE, { context }).action, ACTIONS.SHARE_IMAGE);
  assert.equal(__test__.getQuickTargetLabel(QUICK_TARGETS.DEFAULT, { context }), "Use as image of the token Goblin");
  // A video cannot be a portrait, so the shortcut over an actor sheet falls back to the usual target
  const sheet = openSheet(createDoc("Actor", "Mira"));
  const sheetContext = __test__.resolveContextAt({ x: 1, y: 1, target: sheet.inner });
  assert.equal(__test__.buildQuickDecision(QUICK_TARGETS.DEFAULT, { context: sheetContext, video: true }).action, ACTIONS.SCENE_BACKGROUND_CURRENT);

  // A paste with the mouse over the token
  let content = "";
  __test__.trackPointer({ clientX: 120, clientY: 180 });
  env.state.imageBehavior = { width: 256, height: 256, error: false };
  env.state.uploadResponse = { path: "worlds/world-id/sephrals-image-paste-drop/clipboard-images/pasted.png" };
  env.state.dialogWaitResult = (options) => {
    content = options.content;
    return { name: "Pasted", action: ACTIONS.TOKEN_IMAGE, uploadDirectory: "custom" };
  };
  const file = new File(["png"], "pasted.png", { type: "image/png" });
  await __test__.onPaste({
    target: new TestHTMLElement(),
    clipboardData: { items: [{ kind: "file", type: file.type, getAsFile: () => file }], getData: () => "" },
    preventDefault() {},
    stopPropagation() {}
  });
  assert.match(content, /value="token-image" selected/);
  assert.deepEqual(scene.tokenUpdates[0].updates, [{ _id: tokenDoc.id, "texture.src": env.state.uploadResponse.path }]);

  __test__.forgetPointer();
  assert.equal(__test__.getPointerContext(), null);
});

test("the remembered target only changes for targets picked freely", async () => {
  const actor = createDoc("Actor", "Mira");
  const sheet = openSheet(actor);
  const context = __test__.resolveContextAt({ x: 1, y: 1, target: sheet.inner });
  env.state.dialogWaitResult = { name: "x", action: ACTIONS.ACTOR_PORTRAIT };
  await __test__.promptForImportDecision({ previewUrl: "blob:1", width: 10, height: 10, context });
  assert.equal(env.state.settingWrites.some((write) => write.key === __test__.LAST_ACTION_SETTING), false);
  env.state.dialogWaitResult = { name: "x", action: ACTIONS.CHAT_IMAGE };
  await __test__.promptForImportDecision({ previewUrl: "blob:1", width: 10, height: 10, context });
  assert.deepEqual(env.state.settingWrites.filter((write) => write.key === __test__.LAST_ACTION_SETTING).map((write) => write.value), [ACTIONS.CHAT_IMAGE]);
});

test("the drop indicator names the target and marks where the image lands", async () => {
  const { board } = createBoard();
  const info = { active: true, files: 1, video: false };

  let view = __test__.describeDrop({ x: 150, y: 150, target: board, info });
  assert.deepEqual(view.box, { left: 100, top: 100, width: 100, height: 100, shape: "token" });
  assert.deepEqual(view.label, { icon: "fa-circle-user", title: "Token image", detail: "Goblin" });
  assert.equal(view.theme, "signature");

  // An empty spot: the target the dialog starts with, a marker for a new tile, the scene outline for a background
  setSetting(__test__.LAST_ACTION_SETTING, ACTIONS.TILE_CENTERED);
  view = __test__.describeDrop({ x: 1500, y: 1000, target: board, info });
  assert.equal(view.label.title, "New tile");
  assert.equal(view.label.detail, "You can change the target in the dialog");
  assert.deepEqual(view.marker, { x: 1500, y: 1000, size: 60 });
  assert.equal(view.box, undefined);
  setSetting(__test__.LAST_ACTION_SETTING, ACTIONS.SCENE_BACKGROUND_CURRENT);
  view = __test__.describeDrop({ x: 1500, y: 1000, target: board, info });
  assert.deepEqual(view.box, { left: 0, top: 0, width: 2000, height: 1500, shape: "scene" });
  assert.equal(view.marker, undefined);

  // Several files get the batch dialog
  view = __test__.describeDrop({ x: 150, y: 150, target: board, info: { active: true, files: 3 } });
  assert.equal(view.label.title, "3 images");
  assert.equal(view.box, undefined);

  // An open sheet glows
  const sheet = openSheet(createDoc("Item", "Shield"));
  view = __test__.describeDrop({ x: 1, y: 1, target: sheet.inner, info });
  assert.equal(view.sheet, sheet.windowElement);
  assert.equal(view.label.detail, "Shield");

  setSetting(__test__.DROP_INDICATOR_SETTING, false);
  assert.equal(__test__.describeDrop({ x: 150, y: 150, target: board, info }), null);
});

test("the indicator follows file drags only and stays away from text fields", async () => {
  const { board } = createBoard();
  const fileDrag = (target) => ({
    target,
    clientX: 150,
    clientY: 150,
    dataTransfer: { types: ["Files"], items: [{ kind: "file", type: "image/png" }], files: [] },
    preventDefault() {
      this.prevented = true;
    }
  });
  const drag = fileDrag(board);
  __test__.onDragOver(drag);
  assert.equal(drag.prevented, true);
  assert.ok(__test__.getDropIndicator());

  // Text selections are taken by the drop but get no indicator
  __test__.getDropIndicator().hide();
  const textDrag = { ...fileDrag(board), dataTransfer: { types: ["text/plain", "text/html"], items: [], files: [] } };
  __test__.onDragOver(textDrag);
  assert.equal(textDrag.prevented, true);
  await flushPromises();

  const input = new TestHTMLElement();
  input.setClosest(() => input);
  const inputDrag = fileDrag(input);
  __test__.onDragOver(inputDrag);
  assert.equal(inputDrag.prevented, undefined);
  assert.equal(__test__.acceptsDrag(inputDrag), false);
});

test("the tip only comes for users who can drop onto something, and not after it was dismissed", () => {
  // The stub has no DOM, so the tip is never built here; the conditions decide before that
  setSetting(__test__.DROP_TIP_SETTING, true);
  assert.equal(__test__.showDropTip(), null);
  setSetting(__test__.DROP_TIP_SETTING, false);
  enablePlayerTargets(ACTIONS.CHAT_IMAGE);
  assert.equal(__test__.showDropTip(), null);
  env.state.filesUploadPermission = false;
  enablePlayerTargets(ACTIONS.TOKEN_IMAGE);
  assert.equal(__test__.showDropTip(), null);
});
