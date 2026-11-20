import assert from "node:assert/strict";
import test from "node:test";

import { modulePath } from "./helpers/test-helpers.mjs";

const { createUndoJournal, describeChange } = await import(modulePath("scripts/undo-journal.js"));
const { shouldShowFirstHint, stateAfterImport } = await import(modulePath("scripts/first-hint.js"));
const optimize = await import(modulePath("scripts/image-optimize.js"));

test("a change needs a document, a path and a different picture", () => {
  assert.deepEqual(describeChange("Tile.a", "texture.src", "old.webp", "new.webp"), { uuid: "Tile.a", path: "texture.src", before: "old.webp", after: "new.webp" });
  assert.equal(describeChange("Tile.a", "texture.src", "same.webp", "same.webp"), null);
  assert.equal(describeChange("", "texture.src", "a", "b"), null);
  assert.equal(describeChange("Tile.a", "texture.src", undefined, "b").before, null);
});

test("the journal keeps the last replacements per document, newest first", () => {
  const journal = createUndoJournal({ limitPerDocument: 3 });
  for (let index = 1; index <= 5; index++) {
    journal.record({ kind: "tile", changes: [describeChange("Tile.a", "texture.src", `p${index - 1}`, `p${index}`)] });
  }
  const list = journal.forDocument("Tile.a");
  assert.deepEqual(list.map((record) => record.changes[0].after), ["p5", "p4", "p3"]);
  assert.equal(journal.latestFor("Tile.a").changes[0].before, "p4");
  assert.equal(journal.latestFor("Tile.other"), null);
  assert.equal(journal.record({ changes: [null] }), null);
});

test("one record holds token, prototype and portrait and is found by each of them", () => {
  const journal = createUndoJournal();
  const record = journal.record({
    kind: "token",
    changes: [
      describeChange("Scene.s.Token.t1", "texture.src", "a", "b"),
      describeChange("Actor.hero", "prototypeToken.texture.src", "a", "b"),
      describeChange("Actor.hero", "img", "p", "b")
    ]
  });
  assert.deepEqual(record.uuids, ["Scene.s.Token.t1", "Actor.hero"]);
  assert.equal(journal.latestFor("Actor.hero").id, record.id);
  assert.equal(journal.get(record.id), record);
  journal.remove(record.id);
  assert.equal(journal.latest(), null);
  assert.equal(journal.size, 0);
});

test("the first hint only comes for a GM who has not used the module and only once", () => {
  assert.equal(shouldShowFirstHint({ isGM: true, state: "", usedBefore: false }), true);
  assert.equal(shouldShowFirstHint({ isGM: false, state: "", usedBefore: false }), false);
  assert.equal(shouldShowFirstHint({ isGM: true, state: "shown", usedBefore: false }), false);
  assert.equal(shouldShowFirstHint({ isGM: true, state: "used", usedBefore: false }), false);
  assert.equal(shouldShowFirstHint({ isGM: true, state: "", usedBefore: true }), false);
  assert.equal(stateAfterImport(), "used");
});

test("file sizes read as KB and MB in the given language", () => {
  assert.equal(optimize.formatFileSize(512), "512 B");
  assert.equal(optimize.formatFileSize(2048), "2 KB");
  assert.equal(optimize.formatFileSize(850 * 1024), "850 KB");
  assert.equal(optimize.formatFileSize(8.2 * 1024 * 1024), "8.2 MB");
  assert.equal(optimize.formatFileSize(8.2 * 1024 * 1024, "de"), "8,2 MB");
  assert.equal(optimize.formatFileSize(40 * 1024 * 1024), "40 MB");
  assert.equal(optimize.formatFileSize(-1), "");
});

test("the size as WebP is only worked out for pictures of a sane size", () => {
  assert.equal(optimize.canEstimateWebp({ width: 4000, height: 3000 }), true);
  assert.equal(optimize.canEstimateWebp({ width: 9000, height: 9000 }), false);
  assert.equal(optimize.canEstimateWebp({ width: 0, height: 0 }), false);
});

test("the WebP size comes from encoding and is empty without an encoder, for GIFs and for files that are WebP", async () => {
  const originalBitmap = globalThis.createImageBitmap;
  const originalCanvas = globalThis.OffscreenCanvas;
  let blobType = "image/webp";
  const calls = [];
  globalThis.createImageBitmap = async () => ({ close() {} });
  globalThis.OffscreenCanvas = class {
    constructor(width, height) {
      calls.push({ width, height });
    }
    getContext() {
      return { drawImage() {} };
    }
    async convertToBlob(options) {
      calls.push(options);
      return new Blob(["12345"], { type: blobType });
    }
  };
  try {
    const png = new File(["x".repeat(100)], "a.png", { type: "image/png" });
    assert.equal(await optimize.estimateWebpSize(png, { width: 400, height: 300 }, { quality: 80 }), 5);
    assert.deepEqual(calls.at(-1), { type: "image/webp", quality: 0.8 });
    // The size setting applies to the estimate too
    await optimize.estimateWebpSize(png, { width: 4000, height: 3000 }, { maxSize: 2000 });
    assert.deepEqual(calls.at(-2), { width: 2000, height: 1500 });
    blobType = "image/png";
    assert.equal(await optimize.estimateWebpSize(png, { width: 400, height: 300 }), null);
    blobType = "image/webp";
    const gif = new File(["g"], "a.gif", { type: "image/gif" });
    assert.equal(await optimize.estimateWebpSize(gif, { width: 400, height: 300 }), null);
    const webp = new File(["w"], "a.webp", { type: "image/webp" });
    assert.equal(await optimize.estimateWebpSize(webp, { width: 400, height: 300 }), null);
    assert.equal(await optimize.estimateWebpSize(png, { width: 9000, height: 9000 }), null);
  } finally {
    globalThis.createImageBitmap = originalBitmap;
    globalThis.OffscreenCanvas = originalCanvas;
  }
});
