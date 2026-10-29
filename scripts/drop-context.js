// Pure helpers for drops and pastes onto what is under the cursor: what a drag carries, which token or tile a point on
// the canvas hits, and where the drop label goes. No Foundry globals here, the callers pass everything in.

// What a drop or paste can land on. Canvas is an empty spot on the board.
const CONTEXT_KINDS = Object.freeze({
  TOKEN: "token",
  TILE: "tile",
  ACTOR: "actor",
  ITEM: "item",
  JOURNAL: "journal",
  CANVAS: "canvas"
});
// The open sheets a drop can change, by document name
const SHEET_KINDS = Object.freeze({
  Actor: CONTEXT_KINDS.ACTOR,
  Item: CONTEXT_KINDS.ITEM,
  JournalEntry: CONTEXT_KINDS.JOURNAL
});
// Tiles that cover at least this share of the scene (overlays, roofs, whole maps) only count on the tiles layer,
// otherwise they would catch every drop meant for an empty spot.
const LARGE_TILE_SHARE = 0.5;

function rectContains(rect, point) {
  if ( !rect || !point ) return false;
  return (point.x >= rect.x) && (point.x <= rect.x + rect.width) && (point.y >= rect.y) && (point.y <= rect.y + rect.height);
}

function rectArea(rect) {
  return Math.max(0, Number(rect?.width) || 0) * Math.max(0, Number(rect?.height) || 0);
}

// The entry drawn on top: higher elevation, then higher sort, then the smaller one (a small token on a large one).
function pickTopmost(entries) {
  let best = null;
  for ( const entry of entries ?? [] ) {
    if ( !best ) {
      best = entry;
      continue;
    }
    const elevation = (Number(entry.elevation) || 0) - (Number(best.elevation) || 0);
    if ( elevation !== 0 ) {
      if ( elevation > 0 ) best = entry;
      continue;
    }
    const sort = (Number(entry.sort) || 0) - (Number(best.sort) || 0);
    if ( sort !== 0 ) {
      if ( sort > 0 ) best = entry;
      continue;
    }
    if ( rectArea(entry.bounds) < rectArea(best.bounds) ) best = entry;
  }
  return best;
}

function isLargeTile(bounds, sceneRect, share=LARGE_TILE_SHARE) {
  const sceneArea = rectArea(sceneRect);
  return (sceneArea > 0) && (rectArea(bounds) >= sceneArea * share);
}

// The token or tile a drop at a canvas point hits. Tokens come first, on the tiles layer tiles do. Large tiles only
// count on the tiles layer. Entries: {bounds, elevation, sort, ...}.
function pickCanvasHit(point, {tokens=[], tiles=[], sceneRect=null, tilesLayerActive=false}={}) {
  const token = pickTopmost(tokens.filter(entry => rectContains(entry.bounds, point)));
  const tile = pickTopmost(tiles.filter(entry => rectContains(entry.bounds, point)
    && (tilesLayerActive || !isLargeTile(entry.bounds, sceneRect))));
  const tokenHit = token ? {kind: CONTEXT_KINDS.TOKEN, entry: token} : null;
  const tileHit = tile ? {kind: CONTEXT_KINDS.TILE, entry: tile} : null;
  return tilesLayerActive ? (tileHit ?? tokenHit) : (tokenHit ?? tileHit);
}

// What a drag carries, read during dragover when the files themselves cannot be read yet: the number of image and
// video files, whether one is a video, and whether it is a dragged link. Only file and link drags show the indicator,
// text selections and Foundry's own drag data do not.
function readDragInfo(dataTransfer, {isSupportedType=() => true, isVideoType=() => false}={}) {
  const types = Array.from(dataTransfer?.types ?? []);
  const fileItems = Array.from(dataTransfer?.items ?? []).filter(item => item?.kind === "file");
  const hasFiles = types.includes("Files") || (fileItems.length > 0);
  if ( hasFiles ) {
    // Some browsers hide the types of dragged files until the drop, then one file of unknown type is assumed
    const typed = fileItems.filter(item => item.type);
    const media = typed.filter(item => isSupportedType(item.type));
    const count = typed.length ? media.length : Math.max(1, fileItems.length);
    return {active: count > 0, files: count, video: media.some(item => isVideoType(item.type)), link: false};
  }
  const link = types.includes("text/uri-list");
  return {active: link, files: link ? 1 : 0, video: false, link};
}

// Screen rectangle of a canvas rectangle, through Foundry's canvas to client conversion.
function toClientRect(bounds, toClient) {
  const start = toClient({x: bounds.x, y: bounds.y});
  const end = toClient({x: bounds.x + bounds.width, y: bounds.y + bounds.height});
  return {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y)
  };
}

// Top-left corner of the label: below and right of the cursor, flipped where the window ends.
function labelPosition(cursor, size, viewport, {offset=18, margin=8}={}) {
  let left = cursor.x + offset;
  let top = cursor.y + offset;
  if ( left + size.width + margin > viewport.width ) left = cursor.x - offset - size.width;
  if ( top + size.height + margin > viewport.height ) top = cursor.y - offset - size.height;
  return {
    left: Math.round(Math.max(margin, left)),
    top: Math.round(Math.max(margin, top))
  };
}

// A dragleave towards nothing leaves the window. Moving between elements names the element entered.
function isLeavingWindow(event) {
  return !event?.relatedTarget;
}

// Shortcut keys as Foundry lists them, such as "Alt + V"
function formatKeybinding(binding) {
  if ( !binding?.key ) return "";
  const key = String(binding.key).replace(/^Key|^Digit/, "");
  return [...(binding.modifiers ?? []), key].join(" + ");
}

export {
  CONTEXT_KINDS,
  SHEET_KINDS,
  LARGE_TILE_SHARE,
  rectContains,
  rectArea,
  pickTopmost,
  isLargeTile,
  pickCanvasHit,
  readDragInfo,
  toClientRect,
  labelPosition,
  isLeavingWindow,
  formatKeybinding
};
