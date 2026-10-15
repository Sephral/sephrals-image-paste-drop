import assert from "node:assert/strict";
import test from "node:test";

import { modulePath } from "./helpers/test-helpers.mjs";

const optimize = await import(modulePath("scripts/image-optimize.js"));

function ascii(text) {
  return Array.from(text, (character) => character.charCodeAt(0));
}

function uint32(value) {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function pngChunk(type, length = 0) {
  return [...uint32(length), ...ascii(type), ...new Array(length).fill(0), 0, 0, 0, 0];
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

test("computeScaledSize fits the longer side and leaves smaller images alone", () => {
  assert.deepEqual(optimize.computeScaledSize(4000, 3000, 2048), { width: 2048, height: 1536, scaled: true });
  assert.deepEqual(optimize.computeScaledSize(1000, 3000, 2048), { width: 683, height: 2048, scaled: true });
  assert.deepEqual(optimize.computeScaledSize(1000, 800, 2048), { width: 1000, height: 800, scaled: false });
  assert.deepEqual(optimize.computeScaledSize(4000, 3000, 0), { width: 4000, height: 3000, scaled: false });
  assert.deepEqual(optimize.computeScaledSize(0, 0, 2048), { width: 0, height: 0, scaled: false });
});

test("normalizeQuality accepts percentages and fractions", () => {
  assert.equal(optimize.normalizeQuality(85), 0.85);
  assert.equal(optimize.normalizeQuality(0.5), 0.5);
  assert.equal(optimize.normalizeQuality("x"), 0.85);
  assert.equal(optimize.normalizeQuality(5), 0.1);
  assert.equal(optimize.normalizeQuality(150), 1);
});

test("animated PNG, WebP, AVIF and every GIF are detected from the file header", () => {
  const apng = new Uint8Array([...PNG_SIGNATURE, ...pngChunk("IHDR", 13), ...pngChunk("acTL", 8), ...pngChunk("IDAT", 4)]);
  const png = new Uint8Array([...PNG_SIGNATURE, ...pngChunk("IHDR", 13), ...pngChunk("IDAT", 4), ...pngChunk("acTL", 8)]);
  assert.equal(optimize.isAnimatedImageData(apng, "image/png"), true);
  assert.equal(optimize.isAnimatedImageData(png, "image/png"), false);

  const webp = (flags) => new Uint8Array([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP"), ...ascii("VP8X"), 10, 0, 0, 0, flags, 0, 0, 0]);
  assert.equal(optimize.isAnimatedImageData(webp(0x02), "image/webp"), true);
  assert.equal(optimize.isAnimatedImageData(webp(0x10), "image/webp"), false);
  assert.equal(optimize.isAnimatedImageData(new Uint8Array([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBPVP8 ")]), "image/webp"), false);

  const avif = (brands) => {
    const size = 8 + (4 * (brands.length + 2));
    return new Uint8Array([...uint32(size), ...ascii("ftyp"), ...ascii(brands[0]), 0, 0, 0, 0, ...brands.flatMap((brand) => ascii(brand))]);
  };
  assert.equal(optimize.isAnimatedImageData(avif(["avis", "msf1"]), "image/avif"), true);
  assert.equal(optimize.isAnimatedImageData(avif(["avif", "mif1"]), "image/avif"), false);

  assert.equal(optimize.isAnimatedImageData(new Uint8Array([1]), "image/gif"), true);
  assert.equal(optimize.isAnimatedImageData(new Uint8Array(), "image/png"), false);
  assert.equal(optimize.isAnimatedImageData(new Uint8Array([1, 2]), "image/jpeg"), false);
});

test("planImageOptimization keeps GIF, SVG and animated images and picks the output type", () => {
  const image = (type, extra = {}) => ({ type, width: 4000, height: 2000, ...extra });
  assert.equal(optimize.planImageOptimization(image("image/gif"), { maxSize: 2048, webp: true }), null);
  assert.equal(optimize.planImageOptimization(image("image/svg+xml"), { maxSize: 2048, webp: true }), null);
  assert.equal(optimize.planImageOptimization(image("image/png", { animated: true }), { maxSize: 2048, webp: true }), null);
  assert.equal(optimize.planImageOptimization(image("image/png"), {}), null);
  assert.equal(optimize.planImageOptimization(image("text/plain"), { webp: true }), null);
  assert.equal(optimize.planImageOptimization(image("image/png", { width: 0 }), { webp: true }), null);

  assert.deepEqual(optimize.planImageOptimization(image("image/png"), { webp: true, quality: 80 }), {
    width: 4000, height: 2000, scaled: false, type: "image/webp", quality: 0.8
  });
  assert.deepEqual(optimize.planImageOptimization(image("image/png"), { maxSize: 2048 }), {
    width: 2048, height: 1024, scaled: true, type: "image/png", quality: undefined
  });
  assert.equal(optimize.planImageOptimization(image("image/jpeg"), { maxSize: 2048 }).quality, 0.92);
  assert.equal(optimize.planImageOptimization(image("image/avif"), { maxSize: 2048 }).type, "image/png");
  // A WebP that is small enough stays as it is
  assert.equal(optimize.planImageOptimization(image("image/webp", { width: 100, height: 100 }), { maxSize: 2048, webp: true }), null);
  assert.equal(optimize.planImageOptimization(image("image/webp"), { maxSize: 2048, webp: true }).type, "image/webp");
  assert.equal(optimize.hasOptimizationOptions({ maxSize: 0, webp: false }), false);
  assert.equal(optimize.hasOptimizationOptions({ maxSize: 4096 }), true);
});

test("format labels and file extensions follow the output type", () => {
  assert.equal(optimize.formatLabelForType("image/webp"), "WebP");
  assert.equal(optimize.formatLabelForType("image/avif"), "AVIF");
  assert.equal(optimize.replaceFileExtension("map.png", "image/webp"), "map.webp");
  assert.equal(optimize.replaceFileExtension("photo", "image/jpeg"), "photo.jpg");
  assert.equal(optimize.replaceFileExtension("", "image/png"), "image.png");
});

test("describeOptimizationPlan tells whether a plan scales, converts or both", () => {
  const plan = (type, scaled, width = 2048, height = 1024) => ({ width, height, scaled, type });
  assert.deepEqual(optimize.describeOptimizationPlan(plan("image/webp", true), "image/png"), {
    scaled: true, converted: true, width: 2048, height: 1024, format: "WebP", ifSmaller: false
  });
  assert.deepEqual(optimize.describeOptimizationPlan(plan("image/png", true), "image/png"), {
    scaled: true, converted: false, width: 2048, height: 1024, format: "PNG", ifSmaller: false
  });
  // A conversion alone is only kept when the file gets smaller
  assert.equal(optimize.describeOptimizationPlan(plan("image/webp", false, 300, 200), "image/jpeg").ifSmaller, true);
  assert.equal(optimize.describeOptimizationPlan(null, "image/png"), null);
  assert.equal(optimize.describeOptimizationPlan(plan("image/png", false), "image/png"), null);

  assert.equal(optimize.optimizationLabelVariant({ scaled: true, converted: true }), "ScaleFormat");
  assert.equal(optimize.optimizationLabelVariant({ scaled: true, converted: false }), "Scale");
  assert.equal(optimize.optimizationLabelVariant({ scaled: false, converted: true }), "Format");
  assert.equal(optimize.optimizationLabelVariant(), "Format");
});

test("summarizeOptimizationPlans counts the changed images of a batch and collects their formats", () => {
  const scaled = { plan: { width: 2048, height: 1024, scaled: true, type: "image/png" }, type: "image/png" };
  const webp = { plan: { width: 300, height: 200, scaled: false, type: "image/webp" }, type: "image/png" };
  const avif = { plan: { width: 2048, height: 1024, scaled: true, type: "image/png" }, type: "image/avif" };
  const gif = { plan: null, type: "image/gif" };

  assert.equal(optimize.summarizeOptimizationPlans([gif]), null);
  assert.equal(optimize.summarizeOptimizationPlans(), null);
  assert.deepEqual(optimize.summarizeOptimizationPlans([scaled, gif]), {
    count: 1, total: 2, scaled: true, converted: false, format: "", ifSmaller: false
  });
  assert.deepEqual(optimize.summarizeOptimizationPlans([webp, webp, gif]), {
    count: 2, total: 3, scaled: false, converted: true, format: "WebP", ifSmaller: true
  });
  assert.deepEqual(optimize.summarizeOptimizationPlans([scaled, webp, avif]), {
    count: 3, total: 3, scaled: true, converted: true, format: "WebP, PNG", ifSmaller: false
  });
});

test("resolveOptimizationOptions keeps the settings unless the import opts out", () => {
  const options = { maxSize: 2048, webp: true, quality: 80 };
  assert.equal(optimize.resolveOptimizationOptions(options), options);
  assert.equal(optimize.resolveOptimizationOptions(options, true), options);
  assert.equal(optimize.resolveOptimizationOptions(options, undefined), options);
  const off = optimize.resolveOptimizationOptions(options, false);
  assert.deepEqual(off, { maxSize: 0, webp: false, quality: 80 });
  assert.equal(optimize.hasOptimizationOptions(off), false);
  // The settings object itself stays untouched
  assert.deepEqual(options, { maxSize: 2048, webp: true, quality: 80 });
});

test("optimizeImageFile re-encodes through a canvas and keeps the original when that does not help", async () => {
  const drawn = [];
  let outputType = "image/webp";
  let outputBytes = "w";
  const originalBitmap = globalThis.createImageBitmap;
  const originalCanvas = globalThis.OffscreenCanvas;
  const originalWarn = console.warn;
  globalThis.createImageBitmap = async () => ({ closed: false, close() { this.closed = true; } });
  globalThis.OffscreenCanvas = class {
    constructor(width, height) {
      this.width = width;
      this.height = height;
    }
    getContext() {
      return { drawImage: (_bitmap, x, y, width, height) => drawn.push({ x, y, width, height }) };
    }
    async convertToBlob({ type, quality }) {
      drawn.push({ type, quality });
      return new Blob([outputBytes], { type: outputType });
    }
  };

  try {
    const file = new File(["a large png"], "map.png", { type: "image/png" });
    const converted = await optimize.optimizeImageFile(file, { width: 4000, height: 2000 }, { maxSize: 2048, webp: true, quality: 90 });
    assert.equal(converted.changed, true);
    assert.equal(converted.file.name, "map.webp");
    assert.equal(converted.file.type, "image/webp");
    assert.deepEqual([converted.width, converted.height], [2048, 1024]);
    assert.deepEqual(drawn, [{ x: 0, y: 0, width: 2048, height: 1024 }, { type: "image/webp", quality: 0.9 }]);

    // A browser without a WebP encoder answers with PNG, the name follows
    outputType = "image/png";
    const fallback = await optimize.optimizeImageFile(file, { width: 4000, height: 2000 }, { maxSize: 2048, webp: true });
    assert.equal(fallback.file.name, "map.png");

    // Converting without shrinking is skipped when the result is not smaller
    outputType = "image/webp";
    outputBytes = "a much larger webp file";
    const kept = await optimize.optimizeImageFile(file, { width: 1000, height: 500 }, { webp: true });
    assert.equal(kept.changed, false);
    assert.equal(kept.file, file);

    const gif = new File(["gif"], "anim.gif", { type: "image/gif" });
    assert.equal((await optimize.optimizeImageFile(gif, { width: 4000, height: 2000 }, { maxSize: 2048, webp: true })).file, gif);
    assert.equal((await optimize.optimizeImageFile(file, { width: 4000, height: 2000 }, {})).file, file);

    console.warn = () => {};
    globalThis.createImageBitmap = async () => {
      throw new Error("cannot decode");
    };
    const failed = await optimize.optimizeImageFile(file, { width: 4000, height: 2000 }, { maxSize: 2048 });
    assert.equal(failed.changed, false);
    assert.equal(failed.file, file);
    assert.equal(await optimize.getImageOptimizationPlan(null, { width: 1, height: 1 }, { webp: true }), null);
  } finally {
    globalThis.createImageBitmap = originalBitmap;
    globalThis.OffscreenCanvas = originalCanvas;
    console.warn = originalWarn;
  }
});
