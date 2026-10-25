// Grid of a new scene: read from the map's file name ("Tavern 30x20", "forest_140px") or entered in the dialog.

// CONST.GRID_MIN_SIZE in v13 and v14
const GRID_MIN_SIZE = 20;
// Foundry's initial grid size of a new scene
const DEFAULT_GRID_SIZE = 100;
// A file name only counts as a grid within these limits, "v2x3" or a huge square are no map grid
const MIN_SQUARES = 5;
const MAX_SQUARES = 200;
const MAX_DETECTED_SIZE = 600;
// Aspect ratios in file names ("wallpaper 16x9") are no grid
const ASPECT_RATIOS = Object.freeze(["16x9", "9x16", "16x10", "10x16", "21x9", "9x21", "32x9", "9x32"]);
// Squares may be a little wider than high, many maps carry a thin border
const SQUARE_TOLERANCE = 0.05;
// "30x20", "30 x 20", "30×20" or "30_x_20" squares, but no pixel size such as "4096x2048"
const SQUARES_PATTERN = /(?<!\d)(\d{1,3})[\s_-]*[x×][\s_-]*(\d{1,3})(?!\d)/gi;
// "140px" or "70ppi" for one square
const PIXELS_PATTERN = /(?<!\d)(\d{2,3})\s*(?:px|ppi)(?![a-z])/i;

function decodeFileName(fileName) {
  const value = String(fileName ?? "");
  try {
    return decodeURIComponent(value);
  } catch (_error) {
    return value;
  }
}

// Pixels per square from "columns x rows". Both orders are tried, the one that fits the image wins.
function sizeFromSquares(first, second, width, height) {
  if ( ASPECT_RATIOS.includes(`${first}x${second}`) ) return null;
  for ( const [columns, rows] of [[first, second], [second, first]] ) {
    if ( (columns < MIN_SQUARES) || (rows < MIN_SQUARES) || (columns > MAX_SQUARES) || (rows > MAX_SQUARES) ) continue;
    const across = width / columns;
    const down = height / rows;
    if ( Math.abs(across - down) > (Math.max(across, down) * SQUARE_TOLERANCE) ) continue;
    const size = Math.round(across);
    if ( (size >= GRID_MIN_SIZE) && (size <= MAX_DETECTED_SIZE) ) return {size, columns, rows};
  }
  return null;
}

// The grid a map's file name names, or null. Squares count before pixels.
function detectGridFromFileName(fileName, {width, height}={}) {
  if ( !(width > 0) || !(height > 0) ) return null;
  const name = decodeFileName(fileName).replace(/\.[^./]+$/, "");

  for ( const match of name.matchAll(SQUARES_PATTERN) ) {
    const grid = sizeFromSquares(Number(match[1]), Number(match[2]), width, height);
    if ( grid ) return {...grid, source: "squares"};
  }

  const size = Number(PIXELS_PATTERN.exec(name)?.[1]);
  if ( (size >= GRID_MIN_SIZE) && (size <= Math.min(width, height, MAX_DETECTED_SIZE)) ) return {size, source: "pixels"};
  return null;
}

// Squares across and down for a grid size, with one decimal.
function countSquares(width, height, size) {
  const value = Number(size);
  if ( !(value > 0) ) return {columns: 0, rows: 0};
  const round = number => Math.round(number * 10) / 10;
  return {columns: round(width / value), rows: round(height / value)};
}

// Grid size for a number of squares across.
function sizeForColumns(width, columns) {
  const value = Number(columns);
  if ( !(value > 0) || !(width > 0) ) return null;
  return Math.max(GRID_MIN_SIZE, Math.round(width / value));
}

// A grid type Foundry knows and a whole size of at least the minimum, or null without a size. Squares across are
// kept when they set the grid, they are more exact than the rounded size.
function normalizeGridChoice(grid, {types=[], defaultType=1}={}) {
  if ( !grid ) return null;
  const value = Math.round(Number(grid.size));
  if ( !Number.isFinite(value) || (value <= 0) ) return null;
  const type = Number(grid.type);
  const columns = Number(grid.columns);
  return {
    type: types.includes(type) ? type : defaultType,
    size: Math.max(GRID_MIN_SIZE, value),
    ...((columns > 0) && Number.isFinite(columns) ? {columns} : {})
  };
}

// Grid and scene size for an uploaded map. The grid was chosen for the original image, a shrunk upload shrinks it.
// Foundry needs a whole number of pixels per square and stretches the background to the scene, so the scene gets the
// size of the map's squares at the rounded grid size. Foundry's grid then stays on the grid drawn into the map.
function fitSceneToGrid(grid, original={}, upload={}) {
  const keep = {width: upload.width, height: upload.height};
  if ( !grid ) return {grid: null, ...keep};
  const exact = grid.columns ? (original.width / grid.columns) : grid.size;
  const scale = ((original.width > 0) && (upload.width > 0)) ? (upload.width / original.width) : 1;
  const scaled = exact * scale;
  if ( !Number.isFinite(scaled) || (scaled < GRID_MIN_SIZE) ) {
    return {grid: {type: grid.type, size: Math.max(GRID_MIN_SIZE, Math.round(grid.size * scale))}, ...keep};
  }
  const size = Math.round(scaled);
  return {
    grid: {type: grid.type, size},
    width: Math.max(1, Math.round((original.width / exact) * size)),
    height: Math.max(1, Math.round((original.height / exact) * size))
  };
}

export {
  GRID_MIN_SIZE,
  DEFAULT_GRID_SIZE,
  detectGridFromFileName,
  countSquares,
  sizeForColumns,
  normalizeGridChoice,
  fitSceneToGrid
};
