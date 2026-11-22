import assert from "node:assert/strict";
import test from "node:test";

import { modulePath } from "./helpers/test-helpers.mjs";

const samples = await import(modulePath("scripts/sample-windows.js"));
const kinds = { TOKEN: "token", TILE: "tile", NOTE: "note", ACTOR: "actor", ITEM: "item", JOURNAL: "journal" };
const actions = { TOKEN_IMAGE: "tokenImage", ACTOR_PORTRAIT: "actorPortrait", TILE_IMAGE: "tileImage", NOTE_IMAGE: "noteImage", ITEM_IMAGE: "itemImage", JOURNAL_PAGE: "journalPage" };

test("the token pictures cover a plain, a transparent and a busy background", () => {
  const plain = samples.tokenPictureSpec("plain");
  assert.equal(plain.background, "plain");
  assert.notEqual(plain.width, plain.height, "a plain picture is not square, so the cut to a square shows");
  assert.equal(samples.tokenPictureSpec("transparent").type, "image/webp");
  assert.equal(samples.tokenPictureSpec("busy").background, "busy");
  assert.match(plain.img, /^icons\//, "the pictures ship with Foundry");
});

test("the maps have a printed grid, none, or a grid in the file name", () => {
  assert.equal(samples.scenePictureSpec("square").grid.type, "square");
  assert.equal(samples.scenePictureSpec("hex").grid.type, "hex");
  assert.equal(samples.scenePictureSpec("none").grid, null);
  assert.match(samples.scenePictureSpec("name").file, /20x14/);
});

test("hexCenters covers the picture with pointy hexagons", () => {
  const { radius, centers } = samples.hexCenters(400, 300, 80);
  assert.ok(Math.abs(radius - (80 / Math.sqrt(3))) < 1e-9);
  assert.ok(centers.some((center) => center.x < 80 && center.y < 80));
  assert.ok(centers.some((center) => center.x > 400 - 80 && center.y > 300 - 80));
  // Odd rows are shifted by half a cell
  const first = centers.filter((center) => Math.abs(center.y - radius) < 1e-9).map((center) => center.x);
  const second = centers.filter((center) => Math.abs(center.y - (radius * 2.5)) < 1e-9).map((center) => center.x);
  assert.ok(Math.abs((second[0] - first[0]) % 80) > 1e-6);
});

test("sampleContext hands the dialog a target that is never saved", () => {
  for (const name of ["token", "portrait", "tile", "note", "item", "journal"]) {
    const context = samples.sampleContext(name, { actions, kinds });
    assert.ok(context.action, name);
    assert.ok(context.document.isOwner, `${name} may be changed by the sample user`);
    assert.equal(typeof context.document.update, "undefined", "a plain object, not a document that could be written");
  }
  assert.equal(samples.sampleContext("token", { actions, kinds }).actor.name, "Ari");
  assert.equal(samples.sampleContext("nothing", { actions, kinds }), null);
});

test("sampleWindows lists every entry once with a label and a group", () => {
  const inner = { localize: (key) => key };
  const entries = samples.sampleWindows(inner);
  assert.deepEqual(entries.map((entry) => entry.id), [...samples.SAMPLE_IDS]);
  assert.equal(new Set(entries.map((entry) => entry.id)).size, entries.length);
  for (const entry of entries) {
    assert.ok(entry.label && entry.group && (typeof entry.open === "function"), entry.id);
    assert.ok(!entry.id.includes("."), entry.id);
  }
});
