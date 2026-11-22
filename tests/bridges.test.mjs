import test from "node:test";
import assert from "node:assert/strict";

import {
  LENS_ID,
  WARDROBE_ID,
  appendOutfit,
  buildOutfitEntry,
  hasApi,
  keepsFullSize,
  noteName,
  outfitLabel
} from "../scripts/bridges.js";
import { CONTEXT_KINDS, pickCanvasHit } from "../scripts/drop-context.js";

test("partner ids are the ids of the Sephral modules", () => {
  assert.equal(WARDROBE_ID, "sephrals-token-wardrobe");
  assert.equal(LENS_ID, "sephrals-handout-lens");
});

test("outfit label: typed name wins, the time stamp default becomes Outfit N", () => {
  assert.equal(outfitLabel("Winter coat"), "Winter coat");
  assert.equal(outfitLabel("  Winter coat  "), "Winter coat");
  const options = { defaultName: "Clipboard Image", fallback: "Outfit" };
  assert.equal(outfitLabel("Clipboard Image-2026-11-21-08-00-00", { ...options, existing: [] }), "Outfit 1");
  assert.equal(outfitLabel("", { ...options, existing: [{ label: "Street" }, { label: "Battle" }] }), "Outfit 3");
  // a taken number is skipped
  assert.equal(outfitLabel("", { ...options, existing: [{ label: "Outfit 2" }, { label: "x" }] }), "Outfit 3");
  assert.equal(outfitLabel(null, { fallback: "Look" }), "Look 1");
});

test("outfit entry: portrait and token, a video only as token", () => {
  assert.deepEqual(buildOutfitEntry({ label: "A", path: "x/a.webp" }), { label: "A", portrait: "x/a.webp", token: "x/a.webp" });
  assert.deepEqual(buildOutfitEntry({ label: "A", path: "x/a.webm", video: true }), { label: "A", portrait: "", token: "x/a.webm" });
});

test("appending an outfit keeps the others and gives the new one an id", () => {
  const before = [{ id: "one", label: "Street", portrait: "p", token: "t" }];
  const { id, outfits } = appendOutfit(before, { label: "New", portrait: "n", token: "n" }, () => "fresh");
  assert.equal(id, "fresh");
  assert.equal(outfits.length, 2);
  assert.deepEqual(outfits[0], before[0]);
  assert.equal(outfits[1].id, "fresh");
  assert.equal(before.length, 1, "the list passed in is not changed");
  assert.deepEqual(appendOutfit(undefined, { label: "N" }, () => "i").outfits, [{ label: "N", id: "i" }]);
});

test("hasApi needs an active module with every function", () => {
  const api = { outfits() {}, wear() {} };
  assert.equal(hasApi({ active: true, api }, ["outfits", "wear"]), true);
  assert.equal(hasApi({ active: false, api }, ["outfits", "wear"]), false);
  assert.equal(hasApi({ active: true, api: { outfits() {} } }, ["outfits", "wear"]), false);
  assert.equal(hasApi({ active: true }, ["outfits"]), false);
  assert.equal(hasApi(undefined, ["outfits"]), false);
});

test("note name: its text, else the entry or the page, else the fallback", () => {
  assert.equal(noteName({ text: " Inn " }, "Pin"), "Inn");
  assert.equal(noteName({ text: "", entry: { name: "Journal" } }, "Pin"), "Journal");
  assert.equal(noteName({ entry: { name: "" }, page: { name: "Page" } }, "Pin"), "Page");
  assert.equal(noteName({}, "Pin"), "Pin");
  assert.equal(noteName(null), "");
});

test("a shared picture keeps its size only with Handout Lens", () => {
  assert.equal(keepsFullSize({ lensActive: true, sharing: true }), true);
  assert.equal(keepsFullSize({ lensActive: true, sharing: false }), false);
  assert.equal(keepsFullSize({ lensActive: false, sharing: true }), false);
  assert.equal(keepsFullSize({}), false);
});

test("canvas hit: tokens before notes before tiles, the active layer wins", () => {
  const rect = { x: 0, y: 0, width: 100, height: 100 };
  const token = { id: "t", bounds: rect };
  const note = { id: "n", bounds: rect };
  const tile = { id: "l", bounds: rect };
  const scene = { x: 0, y: 0, width: 4000, height: 4000 };
  const point = { x: 50, y: 50 };
  const all = { tokens: [token], notes: [note], tiles: [tile], sceneRect: scene };
  assert.deepEqual(pickCanvasHit(point, all), { kind: CONTEXT_KINDS.TOKEN, entry: token });
  assert.deepEqual(pickCanvasHit(point, { ...all, tokens: [] }), { kind: CONTEXT_KINDS.NOTE, entry: note });
  assert.deepEqual(pickCanvasHit(point, { ...all, tokens: [], notes: [] }), { kind: CONTEXT_KINDS.TILE, entry: tile });
  assert.deepEqual(pickCanvasHit(point, { ...all, notesLayerActive: true }), { kind: CONTEXT_KINDS.NOTE, entry: note });
  assert.deepEqual(pickCanvasHit(point, { ...all, tilesLayerActive: true }), { kind: CONTEXT_KINDS.TILE, entry: tile });
  assert.equal(pickCanvasHit({ x: 500, y: 500 }, all), null);
});
