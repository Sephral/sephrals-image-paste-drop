import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTEXT_KINDS,
  formatKeybinding,
  isLargeTile,
  isLeavingWindow,
  labelPosition,
  pickCanvasHit,
  pickTopmost,
  readDragInfo,
  rectContains,
  toClientRect
} from "../scripts/drop-context.js";

const rect = (x, y, width, height) => ({ x, y, width, height });
const scene = rect(0, 0, 2000, 1500);

test("the topmost entry wins by elevation, then sort, then the smaller area", () => {
  const low = { id: "low", bounds: rect(0, 0, 100, 100), elevation: 0, sort: 5 };
  const high = { id: "high", bounds: rect(0, 0, 100, 100), elevation: 10, sort: 0 };
  const sorted = { id: "sorted", bounds: rect(0, 0, 100, 100), elevation: 0, sort: 9 };
  const small = { id: "small", bounds: rect(0, 0, 50, 50), elevation: 0, sort: 5 };
  assert.equal(pickTopmost([low, high, sorted]).id, "high");
  assert.equal(pickTopmost([low, sorted]).id, "sorted");
  assert.equal(pickTopmost([low, small]).id, "small");
  assert.equal(pickTopmost([]), null);
  assert.equal(rectContains(rect(10, 10, 20, 20), { x: 30, y: 30 }), true);
  assert.equal(rectContains(rect(10, 10, 20, 20), { x: 31, y: 30 }), false);
});

test("tokens come before tiles, the tiles layer puts tiles first, large tiles only count there", () => {
  const token = { id: "goblin", bounds: rect(100, 100, 100, 100) };
  const handout = { id: "handout", bounds: rect(50, 50, 300, 300) };
  const overlay = { id: "overlay", bounds: rect(0, 0, 2000, 1500) };
  const point = { x: 150, y: 150 };

  assert.deepEqual(pickCanvasHit(point, { tokens: [token], tiles: [handout], sceneRect: scene }), { kind: CONTEXT_KINDS.TOKEN, entry: token });
  assert.deepEqual(pickCanvasHit(point, { tokens: [token], tiles: [handout], sceneRect: scene, tilesLayerActive: true }),
    { kind: CONTEXT_KINDS.TILE, entry: handout });
  assert.deepEqual(pickCanvasHit({ x: 320, y: 320 }, { tokens: [token], tiles: [handout], sceneRect: scene }),
    { kind: CONTEXT_KINDS.TILE, entry: handout });
  // An overlay as large as half the scene would catch every drop meant for an empty spot
  assert.equal(isLargeTile(overlay.bounds, scene), true);
  assert.equal(isLargeTile(handout.bounds, scene), false);
  assert.equal(pickCanvasHit({ x: 1500, y: 1000 }, { tokens: [token], tiles: [overlay], sceneRect: scene }), null);
  assert.deepEqual(pickCanvasHit({ x: 1500, y: 1000 }, { tiles: [overlay], sceneRect: scene, tilesLayerActive: true }),
    { kind: CONTEXT_KINDS.TILE, entry: overlay });
  // On the tiles layer a token still counts where no tile is
  assert.deepEqual(pickCanvasHit(point, { tokens: [token], tiles: [], sceneRect: scene, tilesLayerActive: true }),
    { kind: CONTEXT_KINDS.TOKEN, entry: token });
});

function transfer({ types = [], items = [] } = {}) {
  return { types, items };
}
const isSupportedType = (type) => /^image\//.test(type) || /^video\/(webm|mp4)/.test(type);
const isVideoType = (type) => /^video\//.test(type);

test("a drag shows the indicator only for media files and links", () => {
  const options = { isSupportedType, isVideoType };
  assert.deepEqual(readDragInfo(transfer({ types: ["Files"], items: [{ kind: "file", type: "image/png" }] }), options),
    { active: true, files: 1, video: false, link: false });
  assert.deepEqual(readDragInfo(transfer({ types: ["Files"], items: [{ kind: "file", type: "image/png" }, { kind: "file", type: "video/webm" }] }), options),
    { active: true, files: 2, video: true, link: false });
  // A PDF is no image, SIPD would not take the drop
  assert.equal(readDragInfo(transfer({ types: ["Files"], items: [{ kind: "file", type: "application/pdf" }] }), options).active, false);
  // Browsers that hide the file types until the drop: one file of unknown type
  assert.deepEqual(readDragInfo(transfer({ types: ["Files"], items: [] }), options), { active: true, files: 1, video: false, link: false });
  assert.deepEqual(readDragInfo(transfer({ types: ["text/uri-list", "text/html"] }), options), { active: true, files: 1, video: false, link: true });
  // Text selections and Foundry's own drag data
  assert.equal(readDragInfo(transfer({ types: ["text/plain", "text/html"] }), options).active, false);
  assert.equal(readDragInfo(transfer({ types: ["text/plain"] }), options).active, false);
  assert.equal(readDragInfo(null, options).active, false);
});

test("screen rectangles, the label position and leaving the window", () => {
  const toClient = ({ x, y }) => ({ x: (x * 0.5) + 10, y: (y * 0.5) + 20 });
  assert.deepEqual(toClientRect(rect(100, 200, 300, 100), toClient), { left: 60, top: 120, width: 150, height: 50 });

  const viewport = { width: 1000, height: 800 };
  const size = { width: 200, height: 50 };
  assert.deepEqual(labelPosition({ x: 100, y: 100 }, size, viewport), { left: 118, top: 118 });
  // Near the right and bottom edge the label flips to the other side of the cursor
  assert.deepEqual(labelPosition({ x: 900, y: 780 }, size, viewport), { left: 682, top: 712 });
  assert.deepEqual(labelPosition({ x: 5, y: 5 }, { width: 2000, height: 2000 }, viewport), { left: 8, top: 8 });

  assert.equal(isLeavingWindow({ relatedTarget: null }), true);
  assert.equal(isLeavingWindow({ relatedTarget: {} }), false);
});

test("shortcut keys read like Foundry's controls", () => {
  assert.equal(formatKeybinding({ key: "KeyV", modifiers: ["Alt"] }), "Alt + V");
  assert.equal(formatKeybinding({ key: "Digit1", modifiers: ["Control", "Shift"] }), "Control + Shift + 1");
  assert.equal(formatKeybinding({ key: "F5" }), "F5");
  assert.equal(formatKeybinding(null), "");
});
