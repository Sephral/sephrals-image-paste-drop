// The grid tools of the import dialog: a grid overlay on the preview, the search for the printed grid and measuring
// by dragging across a few cells. The pure parts (outline segments, readouts) are exported for tests, the DOM parts
// get everything they need from the dialog.

import {gridFamily, gridOrigin, gridLattice, countCells, gridFromMeasure, FALLBACK_TYPES} from "./scene-grid.js";

const SQRT3 = Math.sqrt(3);
// More segments than this are not drawn, the grid is then so fine that the overlay shows nothing useful
const MAX_SEGMENTS = 12000;
// Sources of the grid fields that name no grid, Foundry's default stays
const NO_GRID_SOURCES = Object.freeze(["default", "searching", "none", "unreadable"]);
// A drag shorter than this many screen pixels is a click
const MIN_DRAG = 12;

function isGridSource(source) {
  return !NO_GRID_SOURCES.includes(source);
}

// Line segments of a grid over the image, in pixels of the image: [x0, y0, x1, y1]. The grid has a cell size of
// `exact` pixels and its reference point (a corner of a square, the center of a hexagon) at `anchor`. Without an
// anchor the grid starts where Foundry's grid starts in a scene without shift.
function gridOutlineSegments({type, exact, anchor=null}, {width, height}, types=FALLBACK_TYPES) {
  const family = gridFamily(type, types);
  if ( !family || !(exact > 0) || !(width > 0) || !(height > 0) ) return [];
  const origin = gridOrigin(type, exact, types);
  const ref = anchor ?? origin;
  const segments = [];

  if ( family === "square" ) {
    const startX = ((ref.x % exact) + exact) % exact;
    const startY = ((ref.y % exact) + exact) % exact;
    if ( ((width / exact) + (height / exact)) > MAX_SEGMENTS ) return [];
    for ( let x = startX; x <= width + 1e-6; x += exact ) segments.push([x, 0, x, height]);
    for ( let y = startY; y <= height + 1e-6; y += exact ) segments.push([0, y, width, y]);
    return segments;
  }

  const {a, b} = gridLattice(type, exact, types);
  const det = (a[0] * b[1]) - (a[1] * b[0]);
  const reach = exact;
  const corners = [[-reach, -reach], [width + reach, -reach], [-reach, height + reach], [width + reach, height + reach]];
  let iMin = Infinity; let iMax = -Infinity; let jMin = Infinity; let jMax = -Infinity;
  for ( const [cx, cy] of corners ) {
    const i = (((cx - ref.x) * b[1]) - ((cy - ref.y) * b[0])) / det;
    const j = (((cy - ref.y) * a[0]) - ((cx - ref.x) * a[1])) / det;
    iMin = Math.min(iMin, i); iMax = Math.max(iMax, i); jMin = Math.min(jMin, j); jMax = Math.max(jMax, j);
  }
  const radius = exact / SQRT3;
  const first = family === "rows" ? 30 : 0;
  const corner = Array.from({length: 6}, (_, k) => {
    const angle = ((first + (60 * k)) * Math.PI) / 180;
    return [radius * Math.cos(angle), radius * Math.sin(angle)];
  });
  const cells = (Math.ceil(iMax) - Math.floor(iMin) + 1) * (Math.ceil(jMax) - Math.floor(jMin) + 1);
  if ( cells * 3 > MAX_SEGMENTS ) return [];
  for ( let j = Math.floor(jMin); j <= Math.ceil(jMax); j++ ) {
    for ( let i = Math.floor(iMin); i <= Math.ceil(iMax); i++ ) {
      const cx = ref.x + (i * a[0]) + (j * b[0]);
      const cy = ref.y + (i * a[1]) + (j * b[1]);
      if ( (cx < -reach) || (cy < -reach) || (cx > width + reach) || (cy > height + reach) ) continue;
      // Three edges per hexagon are enough, the neighbors draw the others
      for ( const k of [0, 1, 2] ) {
        const [x0, y0] = corner[k];
        const [x1, y1] = corner[k + 1];
        segments.push([cx + x0, cy + y0, cx + x1, cy + y1]);
      }
      const [x0, y0] = corner[3];
      const [x1, y1] = corner[4];
      // The fourth edge closes the border cells, the other edges of inner cells come from their neighbors
      if ( (cx < reach) || (cy < reach) || (cx > width - reach) || (cy > height - reach) ) {
        segments.push([cx + x0, cy + y0, cx + x1, cy + y1]);
        const [x2, y2] = corner[5];
        segments.push([cx + x1, cy + y1, cx + x2, cy + y2]);
        segments.push([cx + x2, cy + y2, cx + corner[0][0], cy + corner[0][1]]);
      }
    }
  }
  return segments;
}

// Where the image lies inside an element that shows it with object-fit: contain
function containedRect(elementWidth, elementHeight, imageWidth, imageHeight) {
  if ( !(elementWidth > 0) || !(elementHeight > 0) || !(imageWidth > 0) || !(imageHeight > 0) ) return {x: 0, y: 0, width: 0, height: 0};
  const scale = Math.min(elementWidth / imageWidth, elementHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {x: (elementWidth - width) / 2, y: (elementHeight - height) / 2, width, height};
}

// Draws the grid onto the overlay canvas above the preview image
function drawGridOverlay(canvas, element, choice, image, types=FALLBACK_TYPES) {
  if ( !canvas || !element ) return;
  const ratio = globalThis.devicePixelRatio || 1;
  const cssWidth = element.clientWidth;
  const cssHeight = element.clientHeight;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.max(1, Math.round(cssWidth * ratio));
  canvas.height = Math.max(1, Math.round(cssHeight * ratio));
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  if ( !choice ) return;
  const rect = containedRect(cssWidth, cssHeight, image.width, image.height);
  if ( !(rect.width > 0) ) return;
  const scale = (rect.width / image.width) * ratio;
  const segments = gridOutlineSegments(choice, image, types);
  if ( !segments.length ) return;
  const left = rect.x * ratio;
  const top = rect.y * ratio;
  context.save();
  context.beginPath();
  context.rect(left, top, rect.width * ratio, rect.height * ratio);
  context.clip();
  // A dark line under a bright one stays visible on any map
  for ( const [width, style] of [[2.4 * ratio, "rgba(0, 0, 0, 0.55)"], [1.1 * ratio, "rgba(255, 214, 64, 0.95)"]] ) {
    context.lineWidth = width;
    context.strokeStyle = style;
    context.beginPath();
    for ( const [x0, y0, x1, y1] of segments ) {
      context.moveTo(left + (x0 * scale), top + (y0 * scale));
      context.lineTo(left + (x1 * scale), top + (y1 * scale));
    }
    context.stroke();
  }
  context.restore();
}

// Rough number of cells along the drag line for the start value of the measure field
function guessCellCount(length, size) {
  if ( !(length > 0) || !(size > 0) ) return 5;
  return Math.max(1, Math.round(length / size));
}

// The text under the grid fields. `counts` is {columns, rows}.
function describeGrid({source, family, counts}, text) {
  const parts = [];
  if ( counts && (counts.columns > 0) ) {
    parts.push(family === "square" ? text.squares(counts) : (family ? text.hexagons(counts) : ""));
  }
  const status = {
    detected: text.fromName,
    found: text.found,
    measured: text.measured,
    searching: text.searching,
    none: text.none,
    unreadable: text.unreadable,
    default: text.fallback
  }[source];
  if ( status ) parts.push(status);
  return parts.filter(Boolean).join(" ");
}

// The pointer handling of the measure mode. `onMeasured({from, to, screenLength})` gets the drag in image pixels,
// `repaint` draws the grid again under the line while it is dragged.
function bindMeasure(canvas, element, image, {onMeasured, repaint}) {
  let start = null;
  let current = null;
  let dragging = false;
  let active = false;

  const toImage = event => {
    const bounds = canvas.getBoundingClientRect();
    const rect = containedRect(bounds.width, bounds.height, image.width, image.height);
    const scale = rect.width / image.width;
    return {
      x: Math.max(0, Math.min(image.width, (event.clientX - bounds.left - rect.x) / scale)),
      y: Math.max(0, Math.min(image.height, (event.clientY - bounds.top - rect.y) / scale)),
      screen: {x: event.clientX - bounds.left, y: event.clientY - bounds.top}
    };
  };
  const drawLine = () => {
    if ( !start || !current ) return;
    const context = canvas.getContext("2d");
    const ratio = canvas.width / (canvas.clientWidth || canvas.width);
    context.save();
    for ( const [width, style] of [[3.4 * ratio, "rgba(0, 0, 0, 0.6)"], [1.6 * ratio, "rgba(80, 220, 255, 1)"]] ) {
      context.lineWidth = width;
      context.strokeStyle = style;
      context.beginPath();
      context.moveTo(start.screen.x * ratio, start.screen.y * ratio);
      context.lineTo(current.screen.x * ratio, current.screen.y * ratio);
      context.stroke();
    }
    context.fillStyle = "rgba(80, 220, 255, 1)";
    context.beginPath();
    context.arc(start.screen.x * ratio, start.screen.y * ratio, 4 * ratio, 0, Math.PI * 2);
    context.fill();
    context.restore();
  };

  canvas.addEventListener("pointerdown", event => {
    if ( !active ) return;
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    start = toImage(event);
    current = start;
    dragging = true;
  });
  canvas.addEventListener("pointermove", event => {
    if ( !active || !dragging ) return;
    current = toImage(event);
    repaint?.();
    drawLine();
  });
  canvas.addEventListener("pointerup", event => {
    if ( !active || !dragging ) return;
    dragging = false;
    current = toImage(event);
    const screenLength = Math.hypot(current.screen.x - start.screen.x, current.screen.y - start.screen.y);
    if ( screenLength < MIN_DRAG ) {
      start = null;
      current = null;
      repaint?.();
      return;
    }
    onMeasured?.({from: {x: start.x, y: start.y}, to: {x: current.x, y: current.y}, screenLength});
  });
  return {
    set active(value) {
      active = Boolean(value);
      canvas.classList.toggle("is-measuring", active);
      if ( !active ) { start = null; current = null; dragging = false; repaint?.(); }
    },
    get active() { return active; },
    redraw: drawLine
  };
}

const __test__ = {NO_GRID_SOURCES, MAX_SEGMENTS, MIN_DRAG};

export {
  isGridSource,
  gridOutlineSegments,
  containedRect,
  drawGridOverlay,
  guessCellCount,
  describeGrid,
  bindMeasure,
  countCells,
  gridFromMeasure,
  __test__
};
