import test from "node:test";
import assert from "node:assert/strict";
import * as px from "../scripts/pixel-tools.js";

// RGBA picture with a plain background and a filled box in the middle
function makePicture(width, height, {background=[240, 240, 240], figure=[200, 30, 30], box=null, noise=0}={}) {
  const data = new Uint8ClampedArray(width * height * 4);
  const rect = box ?? {x0: Math.floor(width / 4), y0: Math.floor(height / 4), x1: Math.floor(width * 3 / 4), y1: Math.floor(height * 3 / 4)};
  for ( let y = 0; y < height; y += 1 ) {
    for ( let x = 0; x < width; x += 1 ) {
      const inside = (x >= rect.x0) && (x < rect.x1) && (y >= rect.y0) && (y < rect.y1);
      const color = inside ? figure : background;
      const jitter = noise ? (((x * 7) + (y * 13)) % ((noise * 2) + 1)) - noise : 0;
      const offset = ((y * width) + x) * 4;
      data[offset] = color[0] + jitter;
      data[offset + 1] = color[1] + jitter;
      data[offset + 2] = color[2] + jitter;
      data[offset + 3] = 255;
    }
  }
  return data;
}

const alphaAt = (data, width, x, y) => data[(((y * width) + x) * 4) + 3];
const pixelAt = (data, width, x, y) => Array.from(data.slice(((y * width) + x) * 4, (((y * width) + x) * 4) + 4));

test("detectBackground finds one plain colour at the edge", () => {
  const data = makePicture(40, 40);
  const result = px.detectBackground(data, 40, 40);
  assert.equal(result.plain, true);
  assert.equal(result.transparent, false);
  assert.equal(result.colors.length, 1);
  assert.deepEqual(result.colors[0], [240, 240, 240]);
});

test("detectBackground copes with noise and a second colour", () => {
  const data = makePicture(60, 60, {noise: 4});
  for ( let y = 0; y < 60; y += 1 ) {
    for ( let x = 30; x < 60; x += 1 ) {
      if ( (x === 59) || (y === 0) || (y === 59) ) {
        const o = ((y * 60) + x) * 4;
        data[o] = 20;
        data[o + 1] = 90;
        data[o + 2] = 200;
      }
    }
  }
  const result = px.detectBackground(data, 60, 60);
  assert.equal(result.plain, true);
  assert.equal(result.colors.length, 2);
});

test("detectBackground refuses a busy edge and a cut out picture", () => {
  const busy = new Uint8ClampedArray(30 * 30 * 4);
  for ( let i = 0; i < busy.length; i += 4 ) {
    busy[i] = (i * 37) % 256;
    busy[i + 1] = (i * 91) % 256;
    busy[i + 2] = (i * 17) % 256;
    busy[i + 3] = 255;
  }
  assert.equal(px.detectBackground(busy, 30, 30).plain, false);
  const cut = makePicture(30, 30);
  for ( let i = 3; i < cut.length; i += 4 ) cut[i] = 0;
  const result = px.detectBackground(cut, 30, 30);
  assert.equal(result.transparent, true);
  assert.equal(result.plain, false);
});

test("removeBackground clears the corners, keeps the figure and an enclosed island", () => {
  const width = 40;
  const data = makePicture(width, 40, {box: {x0: 8, y0: 8, x1: 32, y1: 32}});
  for ( let y = 18; y < 22; y += 1 ) {
    for ( let x = 18; x < 22; x += 1 ) {
      const o = ((y * width) + x) * 4;
      data[o] = 240;
      data[o + 1] = 240;
      data[o + 2] = 240;
    }
  }
  const result = px.removeBackground(data, width, 40, {feather: 0});
  assert.ok(result.removed > 0);
  assert.equal(alphaAt(data, width, 0, 0), 0);
  assert.equal(alphaAt(data, width, 39, 39), 0);
  assert.equal(alphaAt(data, width, 3, 20), 0);
  assert.equal(alphaAt(data, width, 12, 12), 255);
  assert.equal(alphaAt(data, width, 20, 20), 255);
});

test("removeBackground tolerance decides about near colours", () => {
  const width = 30;
  const make = () => makePicture(width, 30, {box: {x0: 10, y0: 10, x1: 20, y1: 20}, figure: [228, 228, 228]});
  const low = make();
  px.removeBackground(low, width, 30, {tolerance: 3, feather: 0});
  assert.equal(alphaAt(low, width, 15, 15), 255);
  const high = make();
  px.removeBackground(high, width, 30, {tolerance: 60, feather: 0});
  assert.equal(alphaAt(high, width, 15, 15), 0);
});

test("removeBackground feathers the edge by one or two pixels", () => {
  const width = 40;
  const data = makePicture(width, 40, {box: {x0: 10, y0: 10, x1: 30, y1: 30}});
  px.removeBackground(data, width, 40, {feather: 2});
  const edge = alphaAt(data, width, 10, 20);
  const second = alphaAt(data, width, 11, 20);
  assert.ok(edge > 0 && edge < 255, `edge pixel is soft: ${edge}`);
  assert.ok(second > edge && second < 255, `second pixel is softer: ${second}`);
  assert.equal(alphaAt(data, width, 14, 20), 255);
  assert.equal(alphaAt(data, width, 5, 20), 0);
});

test("removeBackground leaves a cut out picture alone", () => {
  const data = makePicture(20, 20);
  for ( let i = 3; i < data.length; i += 4 ) data[i] = 0;
  const before = Array.from(data);
  const result = px.removeBackground(data, 20, 20);
  assert.equal(result.removed, 0);
  assert.deepEqual(Array.from(data), before);
});

test("removeBackgroundAsync gives the same result and hands control back", async () => {
  const a = makePicture(50, 50);
  const b = makePicture(50, 50);
  px.removeBackground(a, 50, 50);
  await px.removeBackgroundAsync(b, 50, 50);
  assert.deepEqual(Array.from(a), Array.from(b));
});

test("frame thickness and normalizers", () => {
  assert.equal(px.frameThicknessPixels(200, 300, 5), 10);
  assert.equal(px.frameThicknessPixels(10, 10, 2), 1);
  assert.equal(px.normalizeFrameStyle("round"), "round");
  assert.equal(px.normalizeFrameStyle("hexagon"), "none");
  assert.equal(px.normalizeFrameThickness(99), px.FRAME_THICKNESS_MAX);
  assert.equal(px.normalizeFrameThickness("x"), px.FRAME_THICKNESS_DEFAULT);
  assert.equal(px.normalizeHexColor("#ABC"), "#aabbcc");
  assert.equal(px.normalizeHexColor("red", "#000000"), "#000000");
  assert.equal(px.normalizeTolerance(500), px.BACKGROUND_TOLERANCE_MAX);
});

test("resolveFrameColor picks owner, disposition or custom colour", () => {
  assert.equal(px.resolveFrameColor({source: "owner", ownerColor: "#FF8800"}), "#ff8800");
  assert.equal(px.resolveFrameColor({source: "disposition", disposition: 1}), "#43dfdf");
  assert.equal(px.resolveFrameColor({source: "disposition", disposition: -1}), "#e72124");
  assert.equal(px.resolveFrameColor({source: "custom", custom: "#123456", ownerColor: "#ffffff"}), "#123456");
  assert.equal(px.resolveFrameColor({source: "owner"}), "#ffffff");
});

test("a round frame draws a ring and cuts the corners", () => {
  const size = 100;
  const data = makePicture(size, size, {background: [10, 10, 10], figure: [10, 10, 10]});
  assert.equal(px.applyFrame(data, size, size, {style: "round", thickness: 10, color: "#ff0000"}), true);
  assert.equal(alphaAt(data, size, 0, 0), 0);
  assert.deepEqual(pixelAt(data, size, 50, 2), [255, 0, 0, 255]);
  assert.deepEqual(pixelAt(data, size, 2, 50), [255, 0, 0, 255]);
  assert.deepEqual(pixelAt(data, size, 50, 50), [10, 10, 10, 255]);
  assert.deepEqual(pixelAt(data, size, 50, 20), [10, 10, 10, 255]);
});

test("a square frame draws the ring on the outer pixels only", () => {
  const size = 60;
  const data = makePicture(size, size, {background: [0, 0, 200], figure: [0, 0, 200]});
  px.applyFrame(data, size, size, {style: "square", thickness: 10, color: "#00ff00"});
  assert.deepEqual(pixelAt(data, size, 0, 0), [0, 255, 0, 255]);
  assert.deepEqual(pixelAt(data, size, 30, 1), [0, 255, 0, 255]);
  assert.deepEqual(pixelAt(data, size, 30, 30), [0, 0, 200, 255]);
  assert.deepEqual(pixelAt(data, size, 30, 10), [0, 0, 200, 255]);
});

test("a frame over a transparent picture keeps the inside see-through", () => {
  const size = 50;
  const data = new Uint8ClampedArray(size * size * 4);
  px.applyFrame(data, size, size, {style: "round", thickness: 8, color: "#ffffff"});
  assert.equal(alphaAt(data, size, 25, 25), 0);
  assert.equal(alphaAt(data, size, 25, 1), 255);
});

test("frame style none changes nothing", () => {
  const data = makePicture(20, 20);
  const before = Array.from(data);
  assert.equal(px.applyFrame(data, 20, 20, {style: "none"}), false);
  assert.deepEqual(Array.from(data), before);
});
