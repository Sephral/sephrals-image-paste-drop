// Optional shrinking and WebP conversion in the browser before an upload.
// GIFs, SVGs and animated PNG, WebP or AVIF files pass through untouched, because a canvas keeps only one frame.

const PASSTHROUGH_TYPES = Object.freeze(["image/gif", "image/svg+xml"]);
const REENCODABLE_TYPES = Object.freeze(["image/png", "image/jpeg", "image/webp"]);
const HEADER_BYTES = 65536;
const JPEG_QUALITY = 0.92;
const FORMAT_LABELS = Object.freeze({
  "image/webp": "WebP",
  "image/png": "PNG",
  "image/jpeg": "JPEG"
});
const TYPE_EXTENSIONS = Object.freeze({
  "image/webp": "webp",
  "image/png": "png",
  "image/jpeg": "jpg"
});

// Scales width and height so the longer side fits maxSize. A limit of 0 (or none) keeps the size.
function computeScaledSize(width, height, maxSize) {
  const limit = Number(maxSize);
  if ( !(limit > 0) || !(width > 0) || !(height > 0) ) return {width, height, scaled: false};
  const scale = Math.min(1, limit / Math.max(width, height));
  if ( scale >= 1 ) return {width, height, scaled: false};
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scaled: true
  };
}

function normalizeQuality(value, fallback=0.85) {
  const number = Number(value);
  if ( !Number.isFinite(number) ) return fallback;
  // Settings store a percentage, the canvas expects 0..1
  const quality = number > 1 ? number / 100 : number;
  return Math.min(1, Math.max(0.1, quality));
}

function readAscii(bytes, start, length) {
  if ( !bytes || (bytes.length < start + length) ) return "";
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function readUint32(bytes, offset) {
  return ((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
}

// APNG has an acTL chunk before the first IDAT chunk.
function isAnimatedPng(bytes) {
  let offset = 8;
  while ( offset + 8 <= bytes.length ) {
    const length = readUint32(bytes, offset);
    const type = readAscii(bytes, offset + 4, 4);
    if ( type === "acTL" ) return true;
    if ( (type === "IDAT") || (type === "IEND") ) return false;
    offset += 12 + length;
  }
  return false;
}

// Animated WebP sets the animation flag in the VP8X chunk.
function isAnimatedWebp(bytes) {
  if ( (readAscii(bytes, 0, 4) !== "RIFF") || (readAscii(bytes, 8, 4) !== "WEBP") ) return false;
  if ( readAscii(bytes, 12, 4) !== "VP8X" ) return false;
  return Boolean(bytes[20] & 0x02);
}

// AVIF image sequences carry the "avis" brand in their ftyp box.
function isAnimatedAvif(bytes) {
  if ( readAscii(bytes, 4, 4) !== "ftyp" ) return false;
  const boxSize = Math.min(readUint32(bytes, 0), bytes.length);
  for ( let offset = 8; offset + 4 <= boxSize; offset += 4 ) {
    if ( readAscii(bytes, offset, 4) === "avis" ) return true;
  }
  return false;
}

function isAnimatedImageData(bytes, mimeType) {
  if ( !bytes?.length ) return false;
  switch ( mimeType ) {
    case "image/gif":
      return true;
    case "image/png":
    case "image/apng":
      return isAnimatedPng(bytes);
    case "image/webp":
      return isAnimatedWebp(bytes);
    case "image/avif":
      return isAnimatedAvif(bytes);
    default:
      return false;
  }
}

function hasOptimizationOptions({maxSize=0, webp=false}={}) {
  return (Number(maxSize) > 0) || Boolean(webp);
}

// Decides whether and how an image gets re-encoded. Returns null when the file stays as it is.
function planImageOptimization({type, width, height, animated=false}={}, {maxSize=0, webp=false, quality=0.85}={}) {
  if ( !String(type ?? "").startsWith("image/") || PASSTHROUGH_TYPES.includes(type) || animated ) return null;
  if ( !(width > 0) || !(height > 0) ) return null;

  const size = computeScaledSize(width, height, maxSize);
  const convert = Boolean(webp) && (type !== "image/webp");
  if ( !size.scaled && !convert ) return null;

  // Without WebP, PNG/JPEG/WebP keep their type and everything else becomes a PNG
  const outputType = webp ? "image/webp" : (REENCODABLE_TYPES.includes(type) ? type : "image/png");
  return {
    width: size.width,
    height: size.height,
    scaled: size.scaled,
    type: outputType,
    quality: outputType === "image/webp" ? normalizeQuality(quality) : (outputType === "image/jpeg" ? JPEG_QUALITY : undefined)
  };
}

function formatLabelForType(type) {
  return FORMAT_LABELS[type] ?? String(type ?? "").replace(/^image\//, "").toUpperCase();
}

// What a plan changes compared to the source file. A pure format change is only kept when it makes the file smaller.
function describeOptimizationPlan(plan, sourceType) {
  if ( !plan ) return null;
  const scaled = Boolean(plan.scaled);
  const converted = plan.type !== sourceType;
  if ( !scaled && !converted ) return null;
  return {
    scaled,
    converted,
    width: plan.width,
    height: plan.height,
    format: formatLabelForType(plan.type),
    ifSmaller: !scaled
  };
}

// One summary for several images: how many change, whether any gets scaled and which formats they get.
function summarizeOptimizationPlans(entries=[]) {
  const described = entries.map(entry => describeOptimizationPlan(entry?.plan, entry?.type)).filter(Boolean);
  if ( !described.length ) return null;
  const formats = [...new Set(described.filter(entry => entry.converted).map(entry => entry.format))];
  return {
    count: described.length,
    total: entries.length,
    scaled: described.some(entry => entry.scaled),
    converted: formats.length > 0,
    format: formats.join(", "),
    ifSmaller: described.every(entry => entry.ifSmaller)
  };
}

// Label variant for the "save optimized" checkbox: size and format, size only or format only.
function optimizationLabelVariant({scaled=false, converted=false}={}) {
  if ( scaled && converted ) return "ScaleFormat";
  if ( scaled ) return "Scale";
  return "Format";
}

// The settings decide how an upload is optimized, the checkbox of one import can switch that off.
function resolveOptimizationOptions(options={}, optimize=true) {
  if ( optimize !== false ) return options;
  return {...options, maxSize: 0, webp: false};
}

function replaceFileExtension(fileName, type) {
  const extension = TYPE_EXTENSIONS[type] ?? "png";
  const baseName = String(fileName ?? "").replace(/\.[^./]+$/, "") || "image";
  return `${baseName}.${extension}`;
}

async function readImageHeader(file) {
  try {
    return new Uint8Array(await file.slice(0, HEADER_BYTES).arrayBuffer());
  } catch (_error) {
    return new Uint8Array();
  }
}

async function getImageOptimizationPlan(file, {width, height}, options={}) {
  if ( !file || !hasOptimizationOptions(options) ) return null;
  const header = await readImageHeader(file);
  return planImageOptimization({type: file.type, width, height, animated: isAnimatedImageData(header, file.type)}, options);
}

async function drawToBlob(bitmap, plan) {
  if ( typeof OffscreenCanvas === "function" ) {
    const canvas = new OffscreenCanvas(plan.width, plan.height);
    const context = canvas.getContext("2d");
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, plan.width, plan.height);
    return canvas.convertToBlob({type: plan.type, quality: plan.quality});
  }

  const canvas = document.createElement("canvas");
  canvas.width = plan.width;
  canvas.height = plan.height;
  const context = canvas.getContext("2d");
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, plan.width, plan.height);
  return new Promise(resolve => canvas.toBlob(resolve, plan.type, plan.quality));
}

// Re-encodes the file when a plan applies. Any failure keeps the original file.
async function optimizeImageFile(file, {width, height}, options={}) {
  const unchanged = {file, width, height, changed: false};
  const plan = await getImageOptimizationPlan(file, {width, height}, options);
  if ( !plan ) return unchanged;

  let blob;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    blob = await drawToBlob(bitmap, plan);
  } catch (error) {
    console.warn("sephrals-image-paste-drop | Image optimization failed, the original file is used", error);
    return unchanged;
  } finally {
    bitmap?.close?.();
  }
  if ( !blob?.size ) return unchanged;

  // A pure format change that does not save space is not worth it
  if ( !plan.scaled && (blob.size >= file.size) ) return unchanged;

  // Browsers without a WebP encoder fall back to PNG, the name follows the real type
  const type = blob.type || plan.type;
  return {
    file: new File([blob], replaceFileExtension(file.name, type), {type, lastModified: Date.now()}),
    width: plan.width,
    height: plan.height,
    changed: true
  };
}

export {
  PASSTHROUGH_TYPES,
  computeScaledSize,
  normalizeQuality,
  isAnimatedImageData,
  hasOptimizationOptions,
  planImageOptimization,
  formatLabelForType,
  describeOptimizationPlan,
  summarizeOptimizationPlans,
  optimizationLabelVariant,
  resolveOptimizationOptions,
  replaceFileExtension,
  getImageOptimizationPlan,
  optimizeImageFile
};
