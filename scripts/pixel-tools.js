// Pixel work for token and portrait pictures: removing a plain background and baking a frame into a token picture.
// The pure helpers work on RGBA data (Uint8ClampedArray) and have no browser dependencies, the file and canvas
// functions at the end connect them to the import.

import {isAnimatedFile} from "./image-optimize.js";
import {FRAME_STYLES, FRAME_STYLE_LIST, drawFrame, frameShape, normalizeFrameStyle} from "./frames.js";

const BACKGROUND_TOLERANCE_DEFAULT = 24;
const BACKGROUND_TOLERANCE_MIN = 1;
const BACKGROUND_TOLERANCE_MAX = 80;
// The longest side the background work runs on. Token pictures are never shown bigger than this.
const BACKGROUND_WORK_MAX_SIDE = 4096;
const BACKGROUND_PREVIEW_SIDE = 220;
const BACKGROUND_FEATHER = 2;
// The share of border pixels that have to be one plain colour (or two) to call the background plain
const MIN_BORDER_COVERAGE = 0.6;
// The share of see-through border pixels at which a picture counts as already cut out
const TRANSPARENT_BORDER_SHARE = 0.2;
const FILL_CHUNK = 250000;

const FRAME_COLOR_SOURCES = Object.freeze({OWNER: "owner", DISPOSITION: "disposition", CUSTOM: "custom"});
const FRAME_THICKNESS_DEFAULT = 5;
const FRAME_THICKNESS_MIN = 2;
const FRAME_THICKNESS_MAX = 12;
// The colours Foundry draws token borders in
const DISPOSITION_COLORS = Object.freeze({"1": "#43dfdf", "0": "#f1d836", "-1": "#e72124", "-2": "#a612d4"});
const FALLBACK_FRAME_COLOR = "#ffffff";

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if ( !Number.isFinite(number) ) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizeTolerance(value) {
  return Math.round(clampNumber(value, BACKGROUND_TOLERANCE_MIN, BACKGROUND_TOLERANCE_MAX, BACKGROUND_TOLERANCE_DEFAULT));
}

function normalizeFrameSource(value) {
  return Object.values(FRAME_COLOR_SOURCES).includes(value) ? value : FRAME_COLOR_SOURCES.OWNER;
}

function normalizeFrameThickness(value) {
  return Math.round(clampNumber(value, FRAME_THICKNESS_MIN, FRAME_THICKNESS_MAX, FRAME_THICKNESS_DEFAULT));
}

// "#rgb" or "#rrggbb" as lowercase "#rrggbb", else the fallback
function normalizeHexColor(value, fallback=FALLBACK_FRAME_COLOR) {
  const text = String(value ?? "").trim().toLowerCase();
  if ( /^#[0-9a-f]{6}$/.test(text) ) return text;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(text);
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : fallback;
}

function hexToRgb(value) {
  const hex = normalizeHexColor(value);
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

// The frame colour: the owner's player colour, the token's disposition colour or the chosen one
function resolveFrameColor({source, custom=null, ownerColor=null, disposition=null}={}) {
  switch ( normalizeFrameSource(source) ) {
    case FRAME_COLOR_SOURCES.CUSTOM:
      return normalizeHexColor(custom);
    case FRAME_COLOR_SOURCES.DISPOSITION:
      return DISPOSITION_COLORS[String(disposition)] ?? DISPOSITION_COLORS["-1"];
    default:
      return normalizeHexColor(ownerColor);
  }
}

// ------------------------------------------------------------------------------------------------ background

function colorDistance(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt((dr * dr) + (dg * dg) + (db * db));
}

// Indexes of the pixels on the outer edge, every one once
function borderIndexes(width, height) {
  const list = [];
  for ( let x = 0; x < width; x += 1 ) {
    list.push(x);
    if ( height > 1 ) list.push(((height - 1) * width) + x);
  }
  for ( let y = 1; y < height - 1; y += 1 ) {
    list.push(y * width);
    if ( width > 1 ) list.push((y * width) + width - 1);
  }
  return list;
}

// One colour cluster: the most common coarse colour among the pixels not yet taken, averaged over everything near it
function pickCluster(samples, taken, radius) {
  const bins = new Map();
  samples.forEach((sample, index) => {
    if ( taken[index] ) return;
    const key = ((sample[0] >> 4) << 8) | ((sample[1] >> 4) << 4) | (sample[2] >> 4);
    bins.set(key, (bins.get(key) ?? 0) + 1);
  });
  let bestKey = null;
  let bestCount = 0;
  for ( const [key, count] of bins ) {
    if ( count > bestCount ) {
      bestKey = key;
      bestCount = count;
    }
  }
  if ( bestKey === null ) return null;
  const center = [((bestKey >> 8) << 4) + 8, (((bestKey >> 4) & 15) << 4) + 8, ((bestKey & 15) << 4) + 8];
  let count = 0;
  const sum = [0, 0, 0];
  samples.forEach((sample, index) => {
    if ( taken[index] ) return;
    if ( colorDistance(sample[0], sample[1], sample[2], center[0], center[1], center[2]) > radius ) return;
    count += 1;
    sum[0] += sample[0];
    sum[1] += sample[1];
    sum[2] += sample[2];
  });
  if ( !count ) return null;
  const color = [Math.round(sum[0] / count), Math.round(sum[1] / count), Math.round(sum[2] / count)];
  samples.forEach((sample, index) => {
    if ( !taken[index] && (colorDistance(sample[0], sample[1], sample[2], color[0], color[1], color[2]) <= radius) ) taken[index] = 1;
  });
  return {color, count};
}

// What the edge of a picture says about its background:
// - transparent: the picture is already cut out
// - plain: one or two colours cover most of the edge, those are the background colours
// - otherwise the background is not plain
function detectBackground(data, width, height) {
  const border = borderIndexes(width, height);
  if ( !border.length ) return {plain: false, transparent: false, colors: [], coverage: 0};
  let see = 0;
  const samples = [];
  for ( const index of border ) {
    if ( data[(index * 4) + 3] < 128 ) see += 1;
    else samples.push([data[index * 4], data[(index * 4) + 1], data[(index * 4) + 2]]);
  }
  if ( (see / border.length) >= TRANSPARENT_BORDER_SHARE ) {
    return {plain: false, transparent: true, colors: [], coverage: 0};
  }
  const taken = new Uint8Array(samples.length);
  const colors = [];
  let covered = 0;
  for ( let round = 0; round < 2; round += 1 ) {
    const cluster = pickCluster(samples, taken, 48);
    if ( !cluster ) break;
    // The second colour has to matter, a few stray pixels are no background
    if ( round && ((cluster.count / samples.length) < 0.1) ) break;
    colors.push(cluster.color);
    covered += cluster.count;
  }
  const coverage = samples.length ? covered / samples.length : 0;
  return {plain: coverage >= MIN_BORDER_COVERAGE, transparent: false, colors, coverage};
}

// Flood fill from the edge over pixels near a background colour, as a generator so a caller can hand control back to
// the browser between the steps. Returns the mask (1 = background).
function* floodBackground(data, width, height, colors, tolerance) {
  const limit = normalizeTolerance(tolerance) * 1.5;
  const total = width * height;
  const mask = new Uint8Array(total);
  const stack = new Int32Array(total);
  let top = 0;
  const isBackground = index => {
    const offset = index * 4;
    if ( data[offset + 3] < 8 ) return true;
    for ( const color of colors ) {
      if ( colorDistance(data[offset], data[offset + 1], data[offset + 2], color[0], color[1], color[2]) <= limit ) return true;
    }
    return false;
  };
  const push = index => {
    if ( mask[index] || !isBackground(index) ) return;
    mask[index] = 1;
    stack[top] = index;
    top += 1;
  };
  for ( const index of borderIndexes(width, height) ) push(index);
  let steps = 0;
  while ( top > 0 ) {
    top -= 1;
    const index = stack[top];
    const x = index % width;
    if ( x > 0 ) push(index - 1);
    if ( x < width - 1 ) push(index + 1);
    if ( index >= width ) push(index - width);
    if ( index < total - width ) push(index + width);
    steps += 1;
    if ( (steps % FILL_CHUNK) === 0 ) yield steps;
  }
  return mask;
}

// Softens the cut edge: pixels that stay next to the background lose part of their opacity, 1 or 2 pixels deep
function featherMask(mask, width, height, passes) {
  if ( !(passes > 0) ) return Float32Array.from(mask);
  let current = Float32Array.from(mask);
  for ( let pass = 0; pass < passes; pass += 1 ) {
    const next = new Float32Array(current.length);
    for ( let y = 0; y < height; y += 1 ) {
      for ( let x = 0; x < width; x += 1 ) {
        const index = (y * width) + x;
        if ( mask[index] ) {
          next[index] = 1;
          continue;
        }
        let sum = 0;
        let count = 0;
        for ( let dy = -1; dy <= 1; dy += 1 ) {
          const yy = y + dy;
          if ( (yy < 0) || (yy >= height) ) continue;
          for ( let dx = -1; dx <= 1; dx += 1 ) {
            const xx = x + dx;
            if ( (xx < 0) || (xx >= width) ) continue;
            sum += current[(yy * width) + xx];
            count += 1;
          }
        }
        next[index] = sum / count;
      }
    }
    current = next;
  }
  return current;
}

// Makes the plain background transparent in place. Generator version, see floodBackground.
function* removeBackgroundSteps(data, width, height, {colors=null, tolerance=BACKGROUND_TOLERANCE_DEFAULT, feather=BACKGROUND_FEATHER}={}) {
  const detected = colors ? {plain: true, transparent: false, colors} : detectBackground(data, width, height);
  if ( !detected.colors.length || detected.transparent ) return {removed: 0, ...detected};
  const mask = yield* floodBackground(data, width, height, detected.colors, tolerance);
  const alpha = featherMask(mask, width, height, Math.max(0, Math.min(2, Math.round(feather))));
  let removed = 0;
  for ( let index = 0; index < mask.length; index += 1 ) {
    if ( !alpha[index] ) continue;
    const offset = (index * 4) + 3;
    data[offset] = Math.round(data[offset] * (1 - alpha[index]));
    if ( mask[index] ) removed += 1;
  }
  return {removed, ...detected};
}

function removeBackground(data, width, height, options={}) {
  const run = removeBackgroundSteps(data, width, height, options);
  let step = run.next();
  while ( !step.done ) step = run.next();
  return step.value;
}

const nextTick = () => new Promise(resolve => setTimeout(resolve, 0));

async function removeBackgroundAsync(data, width, height, options={}) {
  const run = removeBackgroundSteps(data, width, height, options);
  let step = run.next();
  while ( !step.done ) {
    await nextTick();
    step = run.next();
  }
  return step.value;
}

// ------------------------------------------------------------------------------------------------ frame

// Ring thickness in pixels for a picture, a share of its shorter side
function frameThicknessPixels(width, height, percent) {
  const side = Math.min(width, height);
  return Math.max(1, Math.round(side * normalizeFrameThickness(percent) / 100));
}

// Paints the ring into the picture in place. Round frames also make everything outside the circle transparent. The
// styles are drawn in frames.js, the color is the accent of the style.
function applyFrame(data, width, height, {style=FRAME_STYLES.NONE, thickness=FRAME_THICKNESS_DEFAULT, color=FALLBACK_FRAME_COLOR}={}) {
  const frameStyle = normalizeFrameStyle(style);
  if ( frameStyle === FRAME_STYLES.NONE ) return false;
  return drawFrame(data, width, height, frameStyle, frameThicknessPixels(width, height, thickness), hexToRgb(color));
}

// ------------------------------------------------------------------------------------------------ files and canvas

const PIXEL_TYPES = Object.freeze(["image/png", "image/jpeg", "image/webp"]);

function fitWorkSize(width, height, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale))};
}

function makeCanvas(width, height) {
  if ( typeof OffscreenCanvas === "function" ) return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function canvasToBlob(canvas, type="image/png") {
  if ( typeof canvas.convertToBlob === "function" ) return canvas.convertToBlob({type});
  return new Promise(resolve => canvas.toBlob(resolve, type));
}

// Decodes a picture into RGBA data at the work size
async function readPixels(file, maxSide) {
  const bitmap = await createImageBitmap(file);
  try {
    if ( !(bitmap.width > 0) || !(bitmap.height > 0) ) throw new Error("empty picture");
    const size = fitWorkSize(bitmap.width, bitmap.height, maxSide);
    const canvas = makeCanvas(size.width, size.height);
    const context = canvas.getContext("2d", {willReadFrequently: true});
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    return {canvas, context, imageData: context.getImageData(0, 0, size.width, size.height), ...size};
  } finally {
    bitmap.close?.();
  }
}

// Background removal and the frame in one pass over a file. The result is a PNG, which keeps the transparency, a
// later WebP conversion keeps it too. Returns null when nothing changed (also on any failure, so the original goes up).
async function processPictureFile(file, {removeBackground: cut=false, tolerance=BACKGROUND_TOLERANCE_DEFAULT, frame=null}={}) {
  const style = normalizeFrameStyle(frame?.style);
  if ( !file || (!cut && (style === FRAME_STYLES.NONE)) || !PIXEL_TYPES.includes(file.type) ) return null;
  try {
    if ( await isAnimatedFile(file) ) return null;
    const {context, canvas, imageData, width, height} = await readPixels(file, BACKGROUND_WORK_MAX_SIDE);
    let changed = false;
    const result = {backgroundRemoved: false, frameAdded: false, backgroundSkipped: null};
    if ( cut ) {
      const outcome = await removeBackgroundAsync(imageData.data, width, height, {tolerance});
      if ( outcome.removed > 0 ) {
        result.backgroundRemoved = true;
        changed = true;
      } else {
        result.backgroundSkipped = outcome.transparent ? "transparent" : "plain";
      }
    }
    if ( style !== FRAME_STYLES.NONE ) {
      applyFrame(imageData.data, width, height, {style, thickness: frame.thickness, color: frame.color});
      result.frameAdded = true;
      changed = true;
    }
    if ( !changed ) return {file: null, ...result};
    context.putImageData(imageData, 0, 0);
    const blob = await canvasToBlob(canvas, "image/png");
    if ( !blob?.size ) return null;
    const base = String(file.name ?? "image").replace(/\.[^./]+$/, "") || "image";
    return {file: new File([blob], `${base}.png`, {type: "image/png", lastModified: Date.now()}), width, height, ...result};
  } catch (error) {
    console.warn("sephrals-image-paste-drop | Background or frame failed, the original file is used", error);
    return null;
  }
}

// The centered square of picture data, as the square crop of the import cuts it
function cropSquare(source) {
  const size = Math.min(source.width, source.height);
  const left = Math.floor((source.width - size) / 2);
  const top = Math.floor((source.height - size) / 2);
  const copy = new ImageData(size, size);
  for ( let y = 0; y < size; y += 1 ) {
    const start = (((top + y) * source.width) + left) * 4;
    copy.data.set(source.data.subarray(start, start + (size * 4)), y * size * 4);
  }
  return copy;
}

// A copy of a canvas with a frame drawn into it, scaled to fit `size` pixels on the long side when given.
// Works on any canvas, so the dialog draws a thumbnail of every style from one picture.
function framedCanvas(source, frame, size=0) {
  const scale = size > 0 ? Math.min(1, size / Math.max(source.width, source.height)) : 1;
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = makeCanvas(width, height);
  const context = canvas.getContext("2d", {willReadFrequently: true});
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, width, height);
  if ( normalizeFrameStyle(frame?.style) !== FRAME_STYLES.NONE ) {
    const image = context.getImageData(0, 0, width, height);
    applyFrame(image.data, width, height, frame);
    context.putImageData(image, 0, 0);
  }
  return canvas;
}

// The live preview of the dialog: a small copy of the picture, analysed once, redrawn as the sliders move
async function createPixelPreview(file) {
  if ( !file || !PIXEL_TYPES.includes(file.type) || (typeof globalThis.createImageBitmap !== "function") ) return null;
  let base;
  try {
    base = await readPixels(file, BACKGROUND_PREVIEW_SIDE);
  } catch (_error) {
    return null;
  }
  const detected = detectBackground(base.imageData.data, base.width, base.height);
  return {
    width: base.width,
    height: base.height,
    detected,
    // Returns a canvas with the picture as it will be saved
    async render({removeBackground: cut=false, tolerance=BACKGROUND_TOLERANCE_DEFAULT, squareCrop=false, frame=null}={}) {
      const copy = squareCrop ? cropSquare(base.imageData) : new ImageData(new Uint8ClampedArray(base.imageData.data), base.width, base.height);
      if ( cut && detected.colors.length && !detected.transparent ) removeBackground(copy.data, copy.width, copy.height, {colors: detected.colors, tolerance});
      if ( normalizeFrameStyle(frame?.style) !== FRAME_STYLES.NONE ) applyFrame(copy.data, copy.width, copy.height, frame);
      const canvas = makeCanvas(copy.width, copy.height);
      canvas.getContext("2d").putImageData(copy, 0, 0);
      return canvas;
    },
    framedCanvas
  };
}

export {
  BACKGROUND_TOLERANCE_DEFAULT,
  BACKGROUND_TOLERANCE_MIN,
  BACKGROUND_TOLERANCE_MAX,
  BACKGROUND_FEATHER,
  FRAME_STYLES,
  FRAME_COLOR_SOURCES,
  FRAME_THICKNESS_DEFAULT,
  FRAME_THICKNESS_MIN,
  FRAME_THICKNESS_MAX,
  DISPOSITION_COLORS,
  PIXEL_TYPES,
  normalizeTolerance,
  normalizeFrameStyle,
  normalizeFrameSource,
  normalizeFrameThickness,
  normalizeHexColor,
  hexToRgb,
  resolveFrameColor,
  detectBackground,
  removeBackground,
  removeBackgroundAsync,
  frameThicknessPixels,
  FRAME_STYLE_LIST,
  frameShape,
  applyFrame,
  framedCanvas,
  processPictureFile,
  createPixelPreview
};
