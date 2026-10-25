import assert from "node:assert/strict";
import test from "node:test";

import { modulePath } from "./helpers/test-helpers.mjs";

const grid = await import(modulePath("scripts/scene-grid.js"));

test("detectGridFromFileName reads squares across and down from the file name", () => {
  assert.deepEqual(grid.detectGridFromFileName("Tavern_30x20.webp", { width: 4200, height: 2800 }), { size: 140, columns: 30, rows: 20, source: "squares" });
  // Rows first, a multiplication sign and spaces
  assert.deepEqual(grid.detectGridFromFileName("Forest [20 × 30].jpg", { width: 3000, height: 2000 }), { size: 100, columns: 30, rows: 20, source: "squares" });
  // Copied links keep their URL encoding
  assert.equal(grid.detectGridFromFileName("Crypt%2022x17.png", { width: 2200, height: 1700 }).size, 100);
  // A thin border around the map is fine
  assert.equal(grid.detectGridFromFileName("cave-25x25.jpg", { width: 3500, height: 3540 }).size, 140);
  // Letters right before the numbers are fine, the first name that fits wins
  assert.equal(grid.detectGridFromFileName("v2x3_Keep40x30", { width: 4000, height: 3000 }).size, 100);
  // Underscores and hyphens around the x, as file managers and slugs write them
  assert.equal(grid.detectGridFromFileName("tavern-30-x-20.png", { width: 3000, height: 2000 }).size, 100);
  assert.equal(grid.detectGridFromFileName("tavern_30_x_20.png", { width: 3000, height: 2000 }).size, 100);
});

test("pixel sizes and names that do not fit the image are no grid", () => {
  assert.equal(grid.detectGridFromFileName("map_4096x2048.png", { width: 4096, height: 2048 }), null);
  assert.equal(grid.detectGridFromFileName("token_1x1.png", { width: 280, height: 280 }), null);
  assert.equal(grid.detectGridFromFileName("Tavern_30x20.webp", { width: 1000, height: 1000 }), null);
  assert.equal(grid.detectGridFromFileName("Tavern_30x20.webp", { width: 0, height: 0 }), null);
  assert.equal(grid.detectGridFromFileName("image.png", { width: 800, height: 600 }), null);
  assert.equal(grid.detectGridFromFileName(undefined, { width: 800, height: 600 }), null);
  // Squares smaller than Foundry's minimum of 20 pixels
  assert.equal(grid.detectGridFromFileName("huge_150x100.png", { width: 1500, height: 1000 }), null);
  // Version numbers, tiny counts and aspect ratios are no grid
  assert.equal(grid.detectGridFromFileName("Dungeon_v2x3_final.png", { width: 2000, height: 3000 }), null);
  assert.equal(grid.detectGridFromFileName("wallpaper 16x9.png", { width: 1920, height: 1080 }), null);
  assert.equal(grid.detectGridFromFileName("screen 9x16.png", { width: 1080, height: 1920 }), null);
  assert.equal(grid.detectGridFromFileName("room 4x4.png", { width: 800, height: 800 }), null);
  // Squares beyond 600 pixels are no map grid
  assert.equal(grid.detectGridFromFileName("poster 5x5.png", { width: 4000, height: 4000 }), null);
  assert.equal(grid.detectGridFromFileName("room 5x5.png", { width: 3000, height: 3000 }).size, 600);
  // A broken URL encoding is read as it is
  assert.equal(grid.detectGridFromFileName("Bad%E0%A4%A_30x20.png", { width: 3000, height: 2000 }).size, 100);
});

test("detectGridFromFileName reads pixels per square from px or ppi", () => {
  assert.deepEqual(grid.detectGridFromFileName("Ruins_140px.jpg", { width: 3000, height: 2000 }), { size: 140, source: "pixels" });
  assert.equal(grid.detectGridFromFileName("Ruins 70 PPI.jpg", { width: 3000, height: 2000 }).size, 70);
  // Print resolutions and sizes beyond the image are not a grid
  assert.equal(grid.detectGridFromFileName("Ruins_300dpi.jpg", { width: 3000, height: 2000 }), null);
  assert.equal(grid.detectGridFromFileName("Ruins_900px.jpg", { width: 800, height: 600 }), null);
  assert.equal(grid.detectGridFromFileName("Ruins_700px.jpg", { width: 3000, height: 3000 }), null);
  assert.equal(grid.detectGridFromFileName("Ruins_140pxl.jpg", { width: 3000, height: 2000 }), null);
  // Squares that fit the image win over pixels, squares that do not fit leave the pixels
  assert.equal(grid.detectGridFromFileName("Keep_30x20_100px.jpg", { width: 4200, height: 2800 }).size, 140);
  assert.equal(grid.detectGridFromFileName("Keep_30x30_100px.jpg", { width: 4200, height: 2800 }).size, 100);
});

test("squares, sizes, choices and scaling for the grid fields", () => {
  assert.deepEqual(grid.countSquares(4200, 2800, 140), { columns: 30, rows: 20 });
  assert.deepEqual(grid.countSquares(1000, 700, 300), { columns: 3.3, rows: 2.3 });
  assert.deepEqual(grid.countSquares(1000, 700, 0), { columns: 0, rows: 0 });

  assert.equal(grid.sizeForColumns(4200, 30), 140);
  assert.equal(grid.sizeForColumns(4200, "29.5"), 142);
  assert.equal(grid.sizeForColumns(100, 50), grid.GRID_MIN_SIZE);
  assert.equal(grid.sizeForColumns(4200, 0), null);
  assert.equal(grid.sizeForColumns(0, 30), null);

  const options = { types: [0, 1, 2, 3, 4, 5], defaultType: 1 };
  assert.deepEqual(grid.normalizeGridChoice({ type: "2", size: "140.4" }, options), { type: 2, size: 140 });
  assert.deepEqual(grid.normalizeGridChoice({ type: 9, size: 50 }, options), { type: 1, size: 50 });
  // A size below the minimum is raised to it, no size keeps Foundry's default
  assert.deepEqual(grid.normalizeGridChoice({ type: 1, size: 10 }, options), { type: 1, size: 20 });
  assert.equal(grid.normalizeGridChoice({ type: 1, size: "" }, options), null);
  assert.equal(grid.normalizeGridChoice({ type: 1, size: 0 }, options), null);
  assert.equal(grid.normalizeGridChoice({ type: 1, size: -5 }, options), null);
  assert.equal(grid.normalizeGridChoice(null, options), null);
  // Squares across stay when they are given
  assert.deepEqual(grid.normalizeGridChoice({ type: 1, size: 102, columns: "29.5" }, options), { type: 1, size: 102, columns: 29.5 });
  assert.deepEqual(grid.normalizeGridChoice({ type: 1, size: 102, columns: 0 }, options), { type: 1, size: 102 });

  // A map shrunk from 4200 to 2100 pixels gets half the grid size, the scene stays the size of the upload
  const fit = (g, original, upload) => grid.fitSceneToGrid(g, original, upload);
  assert.deepEqual(fit({ type: 1, size: 140 }, { width: 4200, height: 2800 }, { width: 2100, height: 1400 }), { grid: { type: 1, size: 70 }, width: 2100, height: 1400 });
  assert.deepEqual(fit({ type: 1, size: 140 }, { width: 4200, height: 2800 }, { width: 4200, height: 2800 }), { grid: { type: 1, size: 140 }, width: 4200, height: 2800 });
  // 60 x 40 squares of 140 px shrunk to 4096: the grid rounds to 68, the scene takes 60 x 40 squares of 68 px
  assert.deepEqual(fit({ type: 1, size: 140, columns: 60 }, { width: 8400, height: 5600 }, { width: 4096, height: 2731 }), { grid: { type: 1, size: 68 }, width: 4080, height: 2720 });
  // A map of 1000 px named 30x20 gets 33 px squares and a scene of 990 x 660
  assert.deepEqual(fit({ type: 1, size: 33, columns: 30 }, { width: 1000, height: 667 }, { width: 1000, height: 667 }), { grid: { type: 1, size: 33 }, width: 990, height: 660 });
  // 29.5 squares across a 3000 px map
  assert.deepEqual(fit({ type: 1, size: 102, columns: 29.5 }, { width: 3000, height: 2000 }, { width: 3000, height: 2000 }), { grid: { type: 1, size: 102 }, width: 3009, height: 2006 });
  // Pixels per square that fit the map keep the scene size
  assert.deepEqual(fit({ type: 1, size: 140 }, { width: 3000, height: 2000 }, { width: 3000, height: 2000 }), { grid: { type: 1, size: 140 }, width: 3000, height: 2000 });
  // Squares that would shrink below 20 px keep the upload size and the minimum
  assert.deepEqual(fit({ type: 1, size: 30 }, { width: 4000, height: 2000 }, { width: 1000, height: 500 }), { grid: { type: 1, size: 20 }, width: 1000, height: 500 });
  assert.deepEqual(fit({ type: 1, size: 20, columns: 100 }, { width: 1000, height: 500 }, { width: 1000, height: 500 }), { grid: { type: 1, size: 20 }, width: 1000, height: 500 });
  assert.deepEqual(fit({ type: 1, size: 140 }, { width: 0, height: 0 }, { width: 2100, height: 1400 }).grid, { type: 1, size: 140 });
  assert.deepEqual(fit(null, { width: 4200, height: 2800 }, { width: 2100, height: 1400 }), { grid: null, width: 2100, height: 1400 });
  assert.equal(grid.DEFAULT_GRID_SIZE, 100);
});
