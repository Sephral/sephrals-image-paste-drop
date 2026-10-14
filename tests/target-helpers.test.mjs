import assert from "node:assert/strict";
import test from "node:test";

import { modulePath } from "./helpers/test-helpers.mjs";

const helpers = await import(modulePath("scripts/target-helpers.js"));

test("layoutTileGrid spaces tiles in a centered grid and keeps their size when it fits", () => {
  const rect = { x: 0, y: 0, width: 1000, height: 800 };
  const sizes = new Array(4).fill({ width: 200, height: 100 });
  assert.deepEqual(helpers.layoutTileGrid(sizes, rect, { gap: 50 }).map(({ x, y }) => [x, y]), [[275, 275], [525, 275], [275, 425], [525, 425]]);

  // v14 positions tiles by their center
  const anchored = helpers.layoutTileGrid(sizes, rect, { gap: 50, anchor: true });
  assert.deepEqual([anchored[0].x, anchored[0].y, anchored[0].width, anchored[0].height], [375, 325, 200, 100]);

  // Mixed sizes are centered in equal cells
  const mixed = helpers.layoutTileGrid([{ width: 200, height: 100 }, { width: 100, height: 100 }], rect, { gap: 0 });
  assert.deepEqual(mixed.map(({ x, y, width }) => [x, y, width]), [[300, 350, 200], [550, 350, 100]]);
});

test("layoutTileGrid shrinks big images to fit the scene and stays inside it near the edge", () => {
  const rect = { x: 100, y: 100, width: 1000, height: 800 };
  const big = helpers.layoutTileGrid(new Array(3).fill({ width: 1000, height: 1000 }), rect, { gap: 0 });
  assert.deepEqual(big.map(({ width, height }) => [width, height]), [[400, 400], [400, 400], [400, 400]]);
  for ( const tile of big ) {
    assert.ok(tile.x >= rect.x && tile.x + tile.width <= rect.x + rect.width);
    assert.ok(tile.y >= rect.y && tile.y + tile.height <= rect.y + rect.height);
  }

  const edge = helpers.layoutTileGrid([{ width: 100, height: 100 }, { width: 100, height: 100 }], rect, { gap: 20, center: { x: 1090, y: 120 } });
  assert.deepEqual(edge.map(({ x, y }) => [x, y]), [[880, 100], [1000, 100]]);

  // A huge gap is reduced so the grid still fits
  const spaced = helpers.layoutTileGrid([{ width: 10, height: 10 }, { width: 10, height: 10 }], { x: 0, y: 0, width: 100, height: 100 }, { gap: 1000 });
  assert.ok(spaced[1].x + spaced[1].width <= 100);
  assert.deepEqual(helpers.layoutTileGrid([], rect), []);
});

test("clampPointToRect keeps map pins inside the scene and centers them without a point", () => {
  const rect = { x: 100, y: 50, width: 400, height: 300 };
  assert.deepEqual(helpers.clampPointToRect(null, rect), { x: 300, y: 200 });
  assert.deepEqual(helpers.clampPointToRect({ x: 20.4, y: 999 }, rect), { x: 100, y: 350 });
  assert.deepEqual(helpers.clampPointToRect({ x: 250.6, y: 100.2 }, rect), { x: 251, y: 100 });
  assert.equal(helpers.clampSpan(-50, 100, 0, 1000), 0);
  assert.equal(helpers.clampSpan(100, 2000, 0, 1000), -500);
});

test("batch item names use real file names and number the generic ones", () => {
  assert.equal(helpers.batchItemName("Batch", "dungeon-map.png", 2), "dungeon-map");
  assert.equal(helpers.batchItemName("Batch", "image.png", 0), "Batch 1");
  assert.equal(helpers.batchItemName("Batch", "image (3).png", 4), "Batch 5");
  assert.equal(helpers.batchItemName("Batch", "", 1), "Batch 2");
  assert.equal(helpers.batchItemName("Batch", undefined, 0), "Batch 1");
});

test("uri lists and pasted link lists return every image link or nothing", () => {
  assert.deepEqual(helpers.parseUriList("#comment\r\nhttps://a.test/1.png\n\n https://a.test/2.png "), ["https://a.test/1.png", "https://a.test/2.png"]);
  assert.deepEqual(helpers.parseUriList(null), []);

  const parse = (line) => (/^https:\/\/\S+\.(png|jpg)$/.test(line) ? line : null);
  assert.deepEqual(helpers.parseImageUrlList("https://a.test/1.png\nhttps://a.test/2.jpg\nhttps://a.test/1.png", parse), ["https://a.test/1.png", "https://a.test/2.jpg"]);
  assert.deepEqual(helpers.parseImageUrlList("https://a.test/1.png", parse), []);
  assert.deepEqual(helpers.parseImageUrlList("https://a.test/1.png\nsome notes", parse), []);
});

test("message modes map between v13 roll modes and v14 message modes", () => {
  assert.equal(helpers.toMessageMode("publicroll"), "public");
  assert.equal(helpers.toMessageMode("gmroll"), "gm");
  assert.equal(helpers.toMessageMode("selfroll"), "self");
  assert.equal(helpers.toMessageMode("ic"), "ic");
  assert.equal(helpers.toMessageMode("roll"), "public");
  assert.equal(helpers.toMessageMode(undefined), "public");
  assert.equal(helpers.imagePostMode("blindroll"), "gm");
  assert.equal(helpers.imagePostMode("blind"), "gm");
  assert.equal(helpers.imagePostMode("self"), "self");
  assert.equal(helpers.toLegacyRollMode("self"), "selfroll");
  assert.equal(helpers.toLegacyRollMode("ic"), "publicroll");
});

test("chat content escapes paths and names, recipients keep known users only", () => {
  const escape = (value) => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  assert.equal(
    helpers.buildChatImageContent([{ path: "a.png?x=1&y=2", name: "A \"map\"" }, { path: "b.png", name: "<b>" }], escape),
    '<div class="sipd-chat-images"><img src="a.png?x=1&amp;y=2" alt="A &quot;map&quot;"><img src="b.png" alt="&lt;b>"></div>'
  );

  assert.deepEqual(helpers.normalizeRecipientIds(["u1", "u2", "u1", "ghost", " u3 "], ["u1", "u2", "u3"]), ["u1", "u2", "u3"]);
  assert.deepEqual(helpers.normalizeRecipientIds("u1", ["u1"]), ["u1"]);
  assert.deepEqual(helpers.normalizeRecipientIds(null, ["u1"]), []);
});

test("withVersionQuery gives a replaced file a new URL and keeps other queries", () => {
  assert.equal(helpers.withVersionQuery("worlds/w/scenes/a/background.png", "abc123"), "worlds/w/scenes/a/background.png?v=abc123");
  assert.equal(helpers.withVersionQuery("https://assets.forge-vtt.com/x/background.png?token=1", "abc"), "https://assets.forge-vtt.com/x/background.png?token=1&v=abc");
  // A second replacement swaps the version instead of adding another one
  assert.equal(helpers.withVersionQuery("worlds/w/background.png?v=old", "new"), "worlds/w/background.png?v=new");
  assert.equal(helpers.withVersionQuery("a.png?x=1&v=old#frag", "new"), "a.png?x=1&v=new#frag");
  assert.equal(helpers.withVersionQuery("a.png", ""), "a.png");
  assert.equal(helpers.withVersionQuery("", "abc"), "");
});

test("pickDroppedUri finds the link of a drop and ignores dropped text", () => {
  assert.equal(helpers.pickDroppedUri({ uriList: "# c\r\nhttps://a.test/1.png\r\nhttps://a.test/2.png", text: "x" }), "https://a.test/1.png");
  assert.equal(helpers.pickDroppedUri({ text: "https://a.test/photo" }), "https://a.test/photo");
  assert.equal(helpers.pickDroppedUri({ text: "#comment\nhttps://a.test/photo.jpg" }), "https://a.test/photo.jpg");
  assert.equal(helpers.pickDroppedUri({ text: "data:image/png;base64,AAAA" }), "data:image/png;base64,AAAA");
  // Selected text, text with a link inside and Foundry's JSON drag data are no image drops
  assert.equal(helpers.pickDroppedUri({ text: "hello world", html: "<b>hello</b> world" }), null);
  assert.equal(helpers.pickDroppedUri({ text: "see https://a.test/1.png here" }), null);
  assert.equal(helpers.pickDroppedUri({ text: "{\"type\":\"Actor\",\"uuid\":\"Actor.x\"}" }), null);
  assert.equal(helpers.pickDroppedUri({ text: "javascript:alert(1)" }), null);
  assert.equal(helpers.pickDroppedUri({}), null);
  // HTML with an image, entities decoded, only web or data sources
  assert.equal(helpers.pickDroppedUri({ html: "<div><img alt='x' src='https://a.test/i.png?a=1&amp;b=2'></div>" }), "https://a.test/i.png?a=1&b=2");
  assert.equal(helpers.pickDroppedUri({ html: "<img src=\"icons/local.png\">" }), null);
});
