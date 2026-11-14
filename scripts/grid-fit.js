// Finds the printed grid of a map image in the browser: reads the pixels, runs the detection on a reduced copy and
// turns the result into a grid choice for the scene.

import {detectGrid, locateGrid, KINDS} from "./grid-detect.js";
import {gridFamily, gridFromDetection} from "./scene-grid.js";

// Longest side of the copy that is analysed. Larger maps are reduced, a grid needs no more pixels than this.
const ANALYSIS_SIDE = 1200;

// The map as gray values at the analysis size, the scale from original pixels, or null when it cannot be read
async function readGrayImage(source, {width, height, maxSide=ANALYSIS_SIDE}={}) {
  if ( !(width > 0) || !(height > 0) ) return null;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  let bitmap = null;
  try {
    // Decoding straight to the small size keeps a huge map from filling the memory with its full-size pixels
    try {
      bitmap = await createImageBitmap(source, {resizeWidth: targetWidth, resizeHeight: targetHeight, resizeQuality: "high"});
    } catch (_error) {
      bitmap = await createImageBitmap(source);
    }
    const canvas = typeof OffscreenCanvas === "function"
      ? new OffscreenCanvas(targetWidth, targetHeight)
      : Object.assign(document.createElement("canvas"), {width: targetWidth, height: targetHeight});
    const context = canvas.getContext("2d", {willReadFrequently: true});
    // Transparent areas count as mid gray, so they carry no grid lines
    context.fillStyle = "#808080";
    context.fillRect(0, 0, targetWidth, targetHeight);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    const pixels = context.getImageData(0, 0, targetWidth, targetHeight).data;
    const data = new Float32Array(targetWidth * targetHeight);
    for ( let i = 0, p = 0; i < data.length; i++, p += 4 ) data[i] = (pixels[p] * 0.299) + (pixels[p + 1] * 0.587) + (pixels[p + 2] * 0.114);
    return {data, width: targetWidth, height: targetHeight, scale: targetWidth / width};
  } catch (_error) {
    return null;
  } finally {
    bitmap?.close?.();
  }
}

// Lets the browser breathe between the heavy steps
const yieldToBrowser = () => new Promise(resolve => setTimeout(resolve, 0));

// The grid printed on a map image: {found: true, grid} or {found: false, reason}
async function findGrid(source, {width, height, types}={}) {
  const image = await readGrayImage(source, {width, height});
  if ( !image ) return {found: false, reason: "unreadable"};
  await yieldToBrowser();
  const result = detectGrid(image, {scale: image.scale});
  if ( !result.found ) return {found: false, reason: result.reason ?? "noGrid", metrics: result};
  return {found: true, grid: gridFromDetection(result, {scale: image.scale, types}), metrics: result};
}

// A grid of known type and about known size, placed (and its size corrected) by the picture. Used after a measurement.
async function fitGridAt(source, {width, height, type, size, types}={}) {
  const family = gridFamily(type, types);
  const kind = family === "rows" ? KINDS.POINTY : (family === "columns" ? KINDS.FLAT : KINDS.SQUARE);
  const image = await readGrayImage(source, {width, height});
  if ( !image ) return {found: false, reason: "unreadable"};
  const result = locateGrid(image, kind, size * image.scale);
  if ( !result.found ) return {found: false, reason: "noGrid", metrics: result};
  return {found: true, grid: gridFromDetection({...result, found: true}, {scale: image.scale, types}), metrics: result};
}

export {ANALYSIS_SIDE, readGrayImage, findGrid, fitGridAt};
