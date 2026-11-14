import assert from "node:assert/strict";
import test from "node:test";

import { modulePath } from "./helpers/test-helpers.mjs";
import { terrain, printGrid } from "./helpers/grid-maps.mjs";

const detect = await import(modulePath("scripts/grid-detect.js"));
const { detectGrid, normalizeOffset, locateGrid, KINDS } = detect;

// The reference point the detection reports is in continuous coordinates, the generator's in pixel indexes
function offsetError(result, grid) {
  const found = normalizeOffset(result.kind, result.size, result.x, result.y);
  const wanted = normalizeOffset(grid.kind, grid.size, grid.x + 0.5, grid.y + 0.5);
  const lattice = detect.latticeOf(grid.kind, grid.size);
  // Compare modulo the lattice
  let best = Infinity;
  for ( const du of [-1, 0, 1] ) {
    for ( const dv of [-1, 0, 1] ) {
      const dx = found.x - wanted.x - (du * lattice.ax) - (dv * lattice.bx);
      const dy = found.y - wanted.y - (du * lattice.ay) - (dv * lattice.by);
      best = Math.min(best, Math.hypot(dx, dy));
    }
  }
  return best;
}

const WIDTH = 1000;
const HEIGHT = 750;

test("a printed square grid is found with its size and position", () => {
  const grid = { kind: "square", size: 52.6, x: 17, y: 29 };
  const result = detectGrid(printGrid(terrain(WIDTH, HEIGHT, { seed: 11 }), grid));
  assert.equal(result.found, true);
  assert.equal(result.kind, KINDS.SQUARE);
  assert.ok(Math.abs(result.size - grid.size) < 0.2, `size ${result.size}`);
  assert.ok(offsetError(result, grid) < 2.5, `offset ${offsetError(result, grid)}`);
});

test("hexagons with a pointy top and with a flat top are told apart", () => {
  const pointy = { kind: "hexPointy", size: 61, x: 20, y: 10 };
  const first = detectGrid(printGrid(terrain(WIDTH, HEIGHT, { seed: 12 }), pointy));
  assert.equal(first.found, true);
  assert.equal(first.kind, KINDS.POINTY);
  assert.ok(Math.abs(first.size - pointy.size) < 0.3);
  assert.ok(offsetError(first, pointy) < 2.5);

  const flat = { kind: "hexFlat", size: 70.5, x: 33, y: 44 };
  const second = detectGrid(printGrid(terrain(WIDTH, HEIGHT, { seed: 13 }), flat));
  assert.equal(second.found, true);
  assert.equal(second.kind, KINDS.FLAT);
  assert.ok(Math.abs(second.size - flat.size) < 0.3);
  assert.ok(offsetError(second, flat) < 2.5);
});

test("a grid with faint lines and a big cell size is found, a multiple or a fraction of the size is not taken", () => {
  const faint = { kind: "square", size: 40, x: 5, y: 9, alpha: 0.22 };
  const first = detectGrid(printGrid(terrain(WIDTH, HEIGHT, { seed: 14 }), faint));
  assert.equal(first.found, true);
  assert.ok(Math.abs(first.size - 40) < 0.2, `size ${first.size}`);

  const big = { kind: "square", size: 120, x: 50, y: 30, lineWidth: 3 };
  const second = detectGrid(printGrid(terrain(WIDTH, HEIGHT, { seed: 15 }), big));
  assert.equal(second.found, true);
  assert.ok(Math.abs(second.size - 120) < 0.6, `size ${second.size}`);
});

test("maps without a printed grid say so instead of guessing", () => {
  for ( const seed of [21, 22, 23, 24] ) {
    const result = detectGrid(terrain(WIDTH, HEIGHT, { seed }));
    assert.equal(result.found, false, `seed ${seed}: ${JSON.stringify(result)}`);
    assert.equal(result.reason, "noGrid");
  }
  // A flat color and a tiny image have nothing to find
  assert.equal(detectGrid({ data: new Float32Array(500 * 400).fill(90), width: 500, height: 400 }).found, false);
  assert.equal(detectGrid({ data: new Float32Array(40 * 40), width: 40, height: 40 }).reason, "small");
  assert.equal(detectGrid({ data: null, width: 0, height: 0 }).reason, "empty");
});

test("a grid with cells below Foundry's minimum or with too few cells is not offered", () => {
  const tiny = { kind: "square", size: 12, x: 3, y: 4, lineWidth: 1 };
  const small = detectGrid(printGrid(terrain(WIDTH, HEIGHT, { seed: 31 }), tiny));
  assert.equal(small.found, false);

  // The scale turns the analysed pixels into original pixels: 50 analysed px are 25 original px at scale 2, fine, but
  // at scale 0.5 they are 100 px, and 12 px stay too small whatever the scale says
  const medium = { kind: "square", size: 36, x: 3, y: 4 };
  const reduced = detectGrid(printGrid(terrain(WIDTH, HEIGHT, { seed: 32 }), medium), { scale: 2 });
  assert.equal(reduced.found, false);
  assert.equal(reduced.reason, "tooSmall");
});

test("locateGrid places a grid of a known size and corrects the size a little", () => {
  const grid = { kind: "hexPointy", size: 64, x: 12, y: 21 };
  const map = printGrid(terrain(WIDTH, HEIGHT, { seed: 41 }), grid);
  const result = locateGrid(map, KINDS.POINTY, 65.2);
  assert.equal(result.found, true);
  assert.ok(Math.abs(result.size - 64) < 0.4, `size ${result.size}`);
  assert.ok(offsetError(result, grid) < 3);

  // Where no grid lies the answer is no
  const none = locateGrid(terrain(WIDTH, HEIGHT, { seed: 42 }), KINDS.SQUARE, 50);
  assert.equal(none.found, false);
});

test("pure helpers: lattice, folding and outline", () => {
  const { latticeOf, foldPoint, outlineOf } = detect.__test__;
  const pointy = latticeOf(KINDS.POINTY, 100);
  assert.deepEqual([pointy.ax, pointy.ay, pointy.bx], [100, 0, 50]);
  assert.ok(Math.abs(pointy.by - 86.6025) < 0.001);
  // A lattice vector folds onto the origin
  const [u, v] = foldPoint(KINDS.POINTY, 100, 150, 86.6025403784);
  assert.ok(Math.abs(u - 1) < 1e-6 && Math.abs(v - 1) < 1e-6);
  const [fu, fv] = foldPoint(KINDS.FLAT, 100, 86.6025403784, 50);
  assert.ok(Math.abs(fu - 1) < 1e-6 && Math.abs(fv) < 1e-6);
  // A hexagon outline has its corners one circumradius from the center
  const outline = outlineOf(KINDS.POINTY, 100, 5);
  assert.ok(outline.every(([x, y]) => Math.hypot(x, y) <= (100 / Math.sqrt(3)) + 1e-6));
  assert.ok(outline.length > 30);
  // A dark line: the signed ridge is negative on it and the line response along the line beats the one across
  const { ridgeImage, lineResponses } = detect.__test__;
  const gray = new Float32Array(60 * 60).fill(100);
  for ( let y = 0; y < 60; y++ ) gray[(y * 60) + 30] = 40;
  const ridge = ridgeImage({ gray, width: 60, height: 60 }, 3, { signed: true });
  assert.ok(ridge[(30 * 60) + 30] < -30);
  const lines = lineResponses(ridge, 60, 60, [0, 90, 30]);
  const at = (degrees) => lines.responses.get(degrees)[(30 * 60) + 30];
  assert.ok(at(90) > 3 * at(0));
  assert.ok(at(90) > 2 * at(30));
});

test("a clean map with only a grid on a plain floor is found, a plain picture with a caption is not", () => {
  for ( const grid of [{ kind: "square", size: 64, x: 10, y: 20, alpha: 0.5 }, { kind: "hexPointy", size: 70, x: 12, y: 9, alpha: 0.5 },
    { kind: "hexFlat", size: 90, x: 12, y: 9, alpha: 0.5 }] ) {
    const map = printGrid(terrain(WIDTH, HEIGHT, { seed: 3, rooms: 0, round: 0, flatTone: true, grain: 0 }), grid);
    const result = detectGrid(map);
    assert.equal(result.found, true, grid.kind);
    assert.equal(result.kind, grid.kind);
    assert.ok(Math.abs(result.size - grid.size) < 0.2);
  }
  // A flat color with a caption in one corner: its edges sit in a small area and no grid runs over the map
  const data = new Float32Array(WIDTH * HEIGHT).fill(110);
  for ( let y = 40; y < 80; y++ ) {
    for ( let x = 20; x < 260; x++ ) if ( (((x >> 2) + (y >> 2)) % 3) === 0 ) data[(y * WIDTH) + x] = 240;
  }
  const caption = detectGrid({ data, width: WIDTH, height: HEIGHT });
  assert.equal(caption.found, false);
  assert.equal(caption.reason, "flat");
  assert.equal(detect.__test__.coverage({ xs: [10, 20], ys: [10, 20], count: 2 }, 100, 100), 0);
});
