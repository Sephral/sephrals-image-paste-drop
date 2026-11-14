import assert from "node:assert/strict";
import test from "node:test";

import { modulePath } from "./helpers/test-helpers.mjs";

const grid = await import(modulePath("scripts/scene-grid.js"));
const tools = await import(modulePath("scripts/grid-tools.js"));
const TYPES = grid.FALLBACK_TYPES;

test("grid families and detected kinds map to Foundry's grid types", () => {
  assert.deepEqual([TYPES.SQUARE, TYPES.HEXODDR, TYPES.HEXEVENR, TYPES.HEXODDQ, TYPES.HEXEVENQ].map((type) => grid.gridFamily(type)),
    ["square", "rows", "rows", "columns", "columns"]);
  assert.equal(grid.gridFamily(TYPES.GRIDLESS), null);
  assert.equal(grid.typeForKind("square"), TYPES.SQUARE);
  assert.equal(grid.typeForKind("hexPointy"), TYPES.HEXODDR);
  assert.equal(grid.typeForKind("hexPointy", { even: true }), TYPES.HEXEVENR);
  assert.equal(grid.typeForKind("hexFlat"), TYPES.HEXODDQ);
  assert.equal(grid.typeForKind("hexFlat", { even: true }), TYPES.HEXEVENQ);
});

test("Foundry's first square and first hexagon are where the grid shift expects them", () => {
  const size = 100;
  assert.deepEqual(grid.gridOrigin(TYPES.SQUARE, size), { x: 0, y: 0 });
  const rows = grid.gridOrigin(TYPES.HEXODDR, size);
  assert.deepEqual([rows.x, Math.round(rows.y * 100) / 100], [0, 57.74]);
  assert.equal(grid.gridOrigin(TYPES.HEXEVENR, size).x, 50);
  const columns = grid.gridOrigin(TYPES.HEXODDQ, size);
  assert.deepEqual([Math.round(columns.x * 100) / 100, columns.y], [57.74, 0]);
  assert.equal(grid.gridOrigin(TYPES.HEXEVENQ, size).y, 50);
});

test("the shift puts Foundry's grid on the printed one by the shortest way", () => {
  // A square grid with its first line 17 px right and 29 px down: shifts of 17 and 29, or back by whole cells
  assert.deepEqual(grid.shiftForAnchor({ type: TYPES.SQUARE, size: 100 }, { x: 17, y: 29 }), { x: 17, y: 29 });
  assert.deepEqual(grid.shiftForAnchor({ type: TYPES.SQUARE, size: 100 }, { x: 317, y: 229 }), { x: 17, y: 29 });
  // More than half a cell is shorter the other way round
  assert.deepEqual(grid.shiftForAnchor({ type: TYPES.SQUARE, size: 100 }, { x: 80, y: 90 }), { x: -20, y: -10 });
  // A hexagon centered where Foundry's is needs no shift, an odd and an even grid differ by half a cell
  const origin = grid.gridOrigin(TYPES.HEXODDR, 100);
  assert.deepEqual(grid.shiftForAnchor({ type: TYPES.HEXODDR, size: 100 }, origin), { x: 0, y: 0 });
  const shifted = grid.shiftForAnchor({ type: TYPES.HEXEVENR, size: 100 }, origin);
  assert.equal(Math.hypot(shifted.x, shifted.y) <= 58, true);
  assert.deepEqual(grid.shiftForAnchor({ type: TYPES.SQUARE, size: 100 }, null), { x: 0, y: 0 });
});

test("the odd or even hexagon type that needs the shorter shift is taken", () => {
  const origin = grid.gridOrigin(TYPES.HEXEVENQ, 80);
  assert.equal(grid.pickHexType("hexFlat", 80, origin, { types: TYPES }), TYPES.HEXEVENQ);
  assert.equal(grid.pickHexType("hexFlat", 80, grid.gridOrigin(TYPES.HEXODDQ, 80), { types: TYPES }), TYPES.HEXODDQ);
  assert.equal(grid.pickHexType("square", 80, { x: 3, y: 4 }), TYPES.SQUARE);
  assert.equal(grid.pickHexType("hexPointy", 80, null), TYPES.HEXODDR);
});

test("a detection result becomes a grid choice in pixels of the original image", () => {
  const found = grid.gridFromDetection({ found: true, kind: "square", size: 26.4, x: 10, y: 14 }, { scale: 0.5 });
  assert.equal(found.type, TYPES.SQUARE);
  assert.equal(found.size, 53);
  assert.ok(Math.abs(found.exact - 52.8) < 1e-9);
  assert.deepEqual(found.anchor, { x: 20, y: 28 });
  assert.equal(found.source, "found");
  assert.equal(grid.gridFromDetection({ found: false }), null);
  assert.ok([TYPES.HEXODDQ, TYPES.HEXEVENQ].includes(grid.gridFromDetection({ found: true, kind: "hexFlat", size: 40, x: 0, y: 0 }, { scale: 1 }).type));
});

test("the scene follows the exact cell size and carries the anchor along", () => {
  // 52.8 px cells on a 4224 px map: 80 cells, the scene is 4240 px wide at 53 px per cell
  const original = { width: 4224, height: 2640 };
  const fit = grid.fitSceneToGrid({ type: 1, size: 53, exact: 52.8, anchor: { x: 20, y: 28 } }, original, original);
  assert.equal(fit.grid.size, 53);
  assert.equal(fit.width, 4240);
  assert.equal(fit.height, 2650);
  assert.ok(Math.abs(fit.grid.anchor.x - (20 * 53 / 52.8)) < 1e-9);
  // Without exact and anchor nothing changes
  assert.deepEqual(grid.fitSceneToGrid({ type: 1, size: 140 }, { width: 4200, height: 2800 }, { width: 4200, height: 2800 }),
    { grid: { type: 1, size: 140 }, width: 4200, height: 2800 });
  // A shrunk upload shrinks the grid and the anchor with it
  const small = grid.fitSceneToGrid({ type: 1, size: 100, exact: 100, anchor: { x: 40, y: 10 } }, { width: 4000, height: 3000 }, { width: 2000, height: 1500 });
  assert.deepEqual([small.grid.size, small.width, small.height, small.grid.anchor.x], [50, 2000, 1500, 20]);
});

test("normalizeGridChoice keeps a valid exact size and anchor, nothing else", () => {
  const types = [0, 1, 2, 3, 4, 5];
  assert.deepEqual(grid.normalizeGridChoice({ type: 3, size: 71.2, exact: 71.2, anchor: { x: 4, y: 9 } }, { types }),
    { type: 3, size: 71, exact: 71.2, anchor: { x: 4, y: 9 } });
  assert.deepEqual(grid.normalizeGridChoice({ type: 1, size: 70, exact: 5, anchor: { x: "a", y: 1 } }, { types }), { type: 1, size: 70 });
});

test("cells are counted for squares and for both kinds of hexagons", () => {
  assert.deepEqual(grid.countCells(3000, 2000, 100, TYPES.SQUARE), { columns: 30, rows: 20 });
  // Pointy tops: a row is 0.866 cell high, flat tops the other way round
  assert.deepEqual(grid.countCells(3000, 1732, 100, TYPES.HEXODDR), { columns: 30, rows: 20 });
  assert.deepEqual(grid.countCells(1732, 3000, 100, TYPES.HEXODDQ), { columns: 20, rows: 30 });
  assert.deepEqual(grid.countCells(3000, 2000, 0, TYPES.SQUARE), { columns: 0, rows: 0 });
});

test("a line across a few cells gives the cell size and the anchor", () => {
  assert.deepEqual(grid.gridFromMeasure({ from: { x: 100, y: 50 }, to: { x: 600, y: 55 }, count: 5 }), { size: 100, anchor: { x: 100, y: 50 } });
  // Along the longer direction, whichever way it is drawn
  assert.equal(grid.gridFromMeasure({ from: { x: 50, y: 700 }, to: { x: 55, y: 100 }, count: 6 }).size, 100);
  // Pointy hexagons are 1 apart sideways and 0.866 up and down, flat ones the other way round
  assert.equal(grid.gridFromMeasure({ from: { x: 0, y: 0 }, to: { x: 400, y: 0 }, count: 4, family: "rows" }).size, 100);
  assert.ok(Math.abs(grid.gridFromMeasure({ from: { x: 0, y: 0 }, to: { x: 0, y: 346.41 }, count: 4, family: "rows" }).size - 100) < 0.01);
  assert.ok(Math.abs(grid.gridFromMeasure({ from: { x: 0, y: 0 }, to: { x: 346.41, y: 0 }, count: 4, family: "columns" }).size - 100) < 0.01);
  assert.equal(grid.gridFromMeasure({ from: { x: 0, y: 0 }, to: { x: 0, y: 0 }, count: 4 }), null);
  assert.equal(grid.gridFromMeasure({ from: { x: 0, y: 0 }, to: { x: 10, y: 0 }, count: 0 }), null);
});

test("outline segments of the overlay cover the map with the right spacing", () => {
  const square = tools.gridOutlineSegments({ type: TYPES.SQUARE, exact: 100, anchor: { x: 30, y: 60 } }, { width: 1000, height: 500 });
  const vertical = square.filter(([x0, , x1]) => x0 === x1).map(([x]) => x);
  const horizontal = square.filter(([, y0, , y1]) => y0 === y1).map(([, y]) => y);
  assert.deepEqual([vertical[0], vertical.length, horizontal[0], horizontal.length], [30, 10, 60, 5]);
  // Without an anchor the grid starts at Foundry's origin
  assert.equal(tools.gridOutlineSegments({ type: TYPES.SQUARE, exact: 100 }, { width: 300, height: 300 })[0][0], 0);

  const hexes = tools.gridOutlineSegments({ type: TYPES.HEXODDR, exact: 100, anchor: { x: 50, y: 58 } }, { width: 800, height: 600 });
  assert.ok(hexes.length > 60);
  // Every segment of a pointy hexagon is one circumradius long
  const radius = 100 / Math.sqrt(3);
  assert.ok(hexes.every(([x0, y0, x1, y1]) => Math.abs(Math.hypot(x1 - x0, y1 - y0) - radius) < 1e-6));
  // Impossible input and grids too fine to draw give nothing
  assert.deepEqual(tools.gridOutlineSegments({ type: 0, exact: 100 }, { width: 100, height: 100 }), []);
  assert.deepEqual(tools.gridOutlineSegments({ type: TYPES.SQUARE, exact: 1 }, { width: 100000, height: 100000 }), []);
});

test("the readout text names the cells and where the grid comes from", () => {
  const text = {
    squares: ({ columns, rows }) => `${columns}x${rows} squares.`,
    hexagons: ({ columns, rows }) => `${columns}x${rows} hexagons.`,
    fromName: "name.", found: "found.", measured: "measured.", searching: "searching.", none: "none.", unreadable: "unreadable.", fallback: "default."
  };
  assert.equal(tools.describeGrid({ source: "found", family: "square", counts: { columns: 30, rows: 20 } }, text), "30x20 squares. found.");
  assert.equal(tools.describeGrid({ source: "measured", family: "rows", counts: { columns: 12, rows: 9 } }, text), "12x9 hexagons. measured.");
  assert.equal(tools.describeGrid({ source: "searching", family: "square", counts: null }, text), "searching.");
  assert.equal(tools.describeGrid({ source: "none", family: null, counts: null }, text), "none.");
  assert.equal(tools.isGridSource("found"), true);
  assert.equal(tools.isGridSource("manual"), true);
  assert.equal(tools.isGridSource("none"), false);
  assert.equal(tools.isGridSource("default"), false);
});

test("the image sits centered in its box and the measure start value follows the cell size", () => {
  assert.deepEqual(tools.containedRect(400, 200, 100, 100), { x: 100, y: 0, width: 200, height: 200 });
  assert.deepEqual(tools.containedRect(0, 200, 100, 100), { x: 0, y: 0, width: 0, height: 0 });
  assert.equal(tools.guessCellCount(520, 100), 5);
  assert.equal(tools.guessCellCount(20, 100), 1);
  assert.equal(tools.guessCellCount(0, 100), 5);
});
