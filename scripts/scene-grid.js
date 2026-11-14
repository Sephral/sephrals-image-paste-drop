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
  const exact = Number(grid.exact);
  const anchor = grid.anchor && Number.isFinite(Number(grid.anchor.x)) && Number.isFinite(Number(grid.anchor.y))
    ? {x: Number(grid.anchor.x), y: Number(grid.anchor.y)} : null;
  return {
    type: types.includes(type) ? type : defaultType,
    size: Math.max(GRID_MIN_SIZE, value),
    ...((columns > 0) && Number.isFinite(columns) ? {columns} : {}),
    ...((exact >= GRID_MIN_SIZE) && Number.isFinite(exact) ? {exact} : {}),
    ...(anchor ? {anchor} : {})
  };
}

// Grid and scene size for an uploaded map. The grid was chosen for the original image, a shrunk upload shrinks it.
// Foundry needs a whole number of pixels per square and stretches the background to the scene, so the scene gets the
// size of the map's squares at the rounded grid size. Foundry's grid then stays on the grid drawn into the map.
// The exact size of a square comes from a detected or measured grid (`exact`), from the squares across or from the size.
// An anchor (a corner of a square, the center of a hexagon) moves along with the stretched map.
function fitSceneToGrid(grid, original={}, upload={}) {
  const keep = {width: upload.width, height: upload.height};
  if ( !grid ) return {grid: null, ...keep};
  const exact = grid.exact > 0 ? grid.exact : (grid.columns ? (original.width / grid.columns) : grid.size);
  const scale = ((original.width > 0) && (upload.width > 0)) ? (upload.width / original.width) : 1;
  const scaled = exact * scale;
  if ( !Number.isFinite(scaled) || (scaled < GRID_MIN_SIZE) ) {
    return {grid: {type: grid.type, size: Math.max(GRID_MIN_SIZE, Math.round(grid.size * scale))}, ...keep};
  }
  const size = Math.round(scaled);
  // One factor for both directions: the map keeps its proportions
  const stretch = size / exact;
  const anchor = grid.anchor ? {x: grid.anchor.x * stretch, y: grid.anchor.y * stretch} : null;
  return {
    grid: {type: grid.type, size, ...(anchor ? {anchor} : {})},
    width: Math.max(1, Math.round(original.width * stretch)),
    height: Math.max(1, Math.round(original.height * stretch))
  };
}

const SQRT3 = Math.sqrt(3);
// CONST.GRID_TYPES of Foundry
const FALLBACK_TYPES = Object.freeze({GRIDLESS: 0, SQUARE: 1, HEXODDR: 2, HEXEVENR: 3, HEXODDQ: 4, HEXEVENQ: 5});

// The family of a grid type: "square", "rows" (hexagons with a pointy top) or "columns" (flat top), else null
function gridFamily(type, types=FALLBACK_TYPES) {
  const value = Number(type);
  if ( value === types.SQUARE ) return "square";
  if ( (value === types.HEXODDR) || (value === types.HEXEVENR) ) return "rows";
  if ( (value === types.HEXODDQ) || (value === types.HEXEVENQ) ) return "columns";
  return null;
}

// Foundry's grid type for a detected kind ("square", "hexPointy", "hexFlat"). `even` picks the even variant.
function typeForKind(kind, {even=false, types=FALLBACK_TYPES}={}) {
  if ( kind === "hexPointy" ) return even ? types.HEXEVENR : types.HEXODDR;
  if ( kind === "hexFlat" ) return even ? types.HEXEVENQ : types.HEXODDQ;
  return types.SQUARE;
}

function isEvenType(type, types=FALLBACK_TYPES) {
  return (Number(type) === types.HEXEVENR) || (Number(type) === types.HEXEVENQ);
}

// Lattice vectors of the cells (center to center for hexagons) of a grid with this size
function gridLattice(type, size, types=FALLBACK_TYPES) {
  const family = gridFamily(type, types);
  if ( family === "rows" ) return {a: [size, 0], b: [size / 2, size * SQRT3 / 2]};
  if ( family === "columns" ) return {a: [size * SQRT3 / 2, size / 2], b: [0, size]};
  return {a: [size, 0], b: [0, size]};
}

// Where Foundry puts the reference point of its grid in the canvas, without any shift: the top left corner of the
// first square, the center of the first hexagon. Verified against getCenterPoint in v13 and v14.
function gridOrigin(type, size, types=FALLBACK_TYPES) {
  const family = gridFamily(type, types);
  const even = isEvenType(type, types);
  if ( family === "rows" ) return {x: even ? size / 2 : 0, y: size / SQRT3};
  if ( family === "columns" ) return {x: size / SQRT3, y: even ? size / 2 : 0};
  return {x: 0, y: 0};
}

// The grid shift (scene shiftX and shiftY) that puts Foundry's grid on a printed grid: the anchor of the printed grid
// (in scene pixels) minus the reference point of Foundry's grid, reduced to the shortest shift by whole cells.
function shiftForAnchor({type, size}, anchor, types=FALLBACK_TYPES) {
  if ( !anchor || !(size > 0) ) return {x: 0, y: 0};
  const origin = gridOrigin(type, size, types);
  const {a, b} = gridLattice(type, size, types);
  const dx = anchor.x - origin.x;
  const dy = anchor.y - origin.y;
  const det = (a[0] * b[1]) - (a[1] * b[0]);
  const u = ((dx * b[1]) - (dy * b[0])) / det;
  const v = ((a[0] * dy) - (a[1] * dx)) / det;
  // The nearest lattice point may not give the shortest vector for skewed hexagons, try the neighbors
  let best = null;
  for ( const du of [-1, 0, 1] ) {
    for ( const dv of [-1, 0, 1] ) {
      const ru = Math.round(u) + du;
      const rv = Math.round(v) + dv;
      const x = dx - (ru * a[0]) - (rv * b[0]);
      const y = dy - (ru * a[1]) - (rv * b[1]);
      const length = Math.hypot(x, y);
      if ( !best || (length < best.length) ) best = {x, y, length};
    }
  }
  return {x: Math.round(best.x), y: Math.round(best.y)};
}

// The odd or even variant of a hexagon type that needs the shorter shift
function pickHexType(kind, size, anchor, {types=FALLBACK_TYPES}={}) {
  const odd = typeForKind(kind, {even: false, types});
  if ( !anchor || (odd === types.SQUARE) ) return odd;
  const even = typeForKind(kind, {even: true, types});
  const lengthOf = type => {
    const shift = shiftForAnchor({type, size}, anchor, types);
    return Math.hypot(shift.x, shift.y);
  };
  return lengthOf(even) < lengthOf(odd) ? even : odd;
}

// A detection result (sizes and positions in pixels of the analysed image) as a grid choice for the original image
function gridFromDetection(result, {scale=1, types=FALLBACK_TYPES}={}) {
  if ( !result?.found || !(scale > 0) ) return null;
  const exact = result.size / scale;
  const anchor = {x: result.x / scale, y: result.y / scale};
  const type = pickHexType(result.kind, exact, anchor, {types});
  return {type, size: Math.round(exact), exact, anchor, kind: result.kind, source: "found"};
}

// Rough count of the cells across and down for the grid family
function countCells(width, height, size, type, types=FALLBACK_TYPES) {
  const value = Number(size);
  if ( !(value > 0) ) return {columns: 0, rows: 0};
  const round = number => Math.round(number * 10) / 10;
  const family = gridFamily(type, types);
  if ( family === "rows" ) return {columns: round(width / value), rows: round(height / (value * SQRT3 / 2))};
  if ( family === "columns" ) return {columns: round(width / (value * SQRT3 / 2)), rows: round(height / value)};
  return {columns: round(width / value), rows: round(height / value)};
}

// Size of a cell from a line drawn across a number of cells. A square counts along the longer direction of the line,
// hexagons along their row (pointy top, drawn sideways) or column (flat top, drawn up and down). Other directions are
// measured along the longer axis with the spacing of that axis.
function gridFromMeasure({from, to, count, family="square"}) {
  const cells = Math.round(Number(count));
  if ( !from || !to || !(cells >= 1) ) return null;
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  const horizontal = dx >= dy;
  const length = horizontal ? dx : dy;
  if ( !(length > 0) ) return null;
  let stride = 1;
  if ( family === "rows" ) stride = horizontal ? 1 : SQRT3 / 2;
  else if ( family === "columns" ) stride = horizontal ? SQRT3 / 2 : 1;
  const size = length / (cells * stride);
  return {size, anchor: {x: from.x, y: from.y}};
}

export {
  gridFamily,
  typeForKind,
  gridLattice,
  gridOrigin,
  shiftForAnchor,
  pickHexType,
  gridFromDetection,
  countCells,
  gridFromMeasure,
  FALLBACK_TYPES,
  GRID_MIN_SIZE,
  DEFAULT_GRID_SIZE,
  detectGridFromFileName,
  countSquares,
  sizeForColumns,
  normalizeGridChoice,
  fitSceneToGrid
};
