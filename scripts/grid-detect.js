// Finds the grid printed on a battle map. Pure functions on a gray image, no Foundry and no canvas.
//
// Idea: a printed grid is made of long straight lines that repeat. The map is first reduced to the places where such
// lines run: the average of the line response along six directions (0, 30, 60, 90, 120 and 150 degrees) is high on a
// printed line and low on terrain, trees and rooms, even when the terrain is full of detail. The points of those lines
// are then folded into one cell of a candidate grid (square, hexagons with a pointy top or hexagons with a flat top).
// When the cell size is right, the lines of every cell land on top of each other and the folded picture is sharp.
// When it is wrong, or the map has no grid, the points spread evenly. A cell outline fitted into the folded picture
// then gives the position of the grid.

const SQRT3 = Math.sqrt(3);
const KINDS = Object.freeze({SQUARE: "square", POINTY: "hexPointy", FLAT: "hexFlat"});
const KIND_LIST = Object.freeze([KINDS.SQUARE, KINDS.POINTY, KINDS.FLAT]);

// Directions of the lines of each kind of grid, in degrees (y points down)
const KIND_DIRECTIONS = Object.freeze({
  [KINDS.SQUARE]: [0, 90],
  [KINDS.POINTY]: [90, 30, 150],
  [KINDS.FLAT]: [0, 60, 120]
});
// At least this many cells across the shorter side, a grid with fewer is no grid worth fitting
const MIN_CELLS = 5;
// Width of a printed line in pixels that the position fit blurs over
const LINE_BLUR = 1.5;
// Foundry's smallest grid in pixels of the original image
const MIN_CELL_SIZE = 20;
// Length of the line response in pixels
const LINE_LENGTH = 13;
// Share of the places with the strongest line response that take part
const KEEP_SHARE = 0.15;
// Smallest cell the search looks at, in pixels of the analysed image
const SMALLEST_CELL = 7;
// Cell sizes that are tried at most as often as this per kind after the scan
const PEAKS_PER_KIND = 3;
// Candidates that are looked at closely
const MAX_CANDIDATES = 3;
// The wide scan over all cell sizes uses this many points at most
const SCAN_POINTS = 30000;
// At least this share of the image must hold line points, else the picture is plain
const MIN_COVERAGE = 0.5;
// The refinement of a size and the check of the multiples use this many points at most
const REFINE_POINTS = 60000;
// A grid is found when the outline fitted into the folded picture is this much stronger than the average of the picture ...
const MIN_CONTRAST = 1.9;
// ... and the folded picture is this much sharper than chance (1 is chance) ...
const MIN_SHARPNESS = 16;
// ... and the best cell size stands out of the scan like this ...
const MIN_PROMINENCE = 5;
// ... or, for a faint grid with too few points for a sharp picture, when its outline stands out of all positions like this
const MIN_SIGNIFICANCE = 7;
// Sizes tried around the sharpest one, as multiples of it
const SIZE_LADDER = Object.freeze([1 / 6, 1 / 5, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 1, 3 / 2, 2, 3, 4, 5, 6, 7, 8]);
const LADDER_BINS = 40;
// The smallest size whose outline is at least this share as strong as the best one counts
const LADDER_SHARE = 0.7;

// How far each pixel lies from the average of its surroundings, clipped at the strongest 1.5 percent. A printed line,
// dark or light, peaks right on its middle, where the edge strength has a dip between the two sides of the line.
function ridgeImage({gray, width, height}, radius=3, {signed=false}={}) {
  const size = (2 * radius) + 1;
  const horizontal = new Float32Array(gray.length);
  for ( let y = 0; y < height; y++ ) {
    const row = y * width;
    let sum = 0;
    for ( let x = 0; x < width; x++ ) {
      sum += gray[row + x];
      if ( x >= size ) sum -= gray[row + x - size];
      if ( x >= size - 1 ) horizontal[row + x - radius] = sum / size;
    }
  }
  const average = new Float32Array(gray.length);
  for ( let x = 0; x < width; x++ ) {
    let sum = 0;
    for ( let y = 0; y < height; y++ ) {
      sum += horizontal[(y * width) + x];
      if ( y >= size ) sum -= horizontal[((y - size) * width) + x];
      if ( y >= size - 1 ) average[((y - radius) * width) + x] = sum / size;
    }
  }
  const ridge = new Float32Array(gray.length);
  let max = 0;
  for ( let i = 0; i < gray.length; i++ ) {
    ridge[i] = signed ? gray[i] - average[i] : Math.abs(gray[i] - average[i]);
    if ( Math.abs(ridge[i]) > max ) max = Math.abs(ridge[i]);
  }
  if ( !(max > 0) ) return ridge;
  const bins = 256;
  const histogram = new Uint32Array(bins);
  for ( let i = 0; i < ridge.length; i++ ) histogram[Math.min(bins - 1, Math.floor((Math.abs(ridge[i]) / max) * bins))]++;
  let cut = max;
  let sum = 0;
  for ( let k = 0; k < bins; k++ ) {
    sum += histogram[k];
    if ( sum >= ridge.length * 0.985 ) { cut = ((k + 1) / bins) * max; break; }
  }
  for ( let i = 0; i < ridge.length; i++ ) ridge[i] = Math.max(-cut, Math.min(cut, ridge[i]));
  return ridge;
}

// Average of the (signed) ridge image along a line through every pixel, for each of the given directions. Samples
// between pixels are interpolated, a line of a pixel's width that runs at 30 degrees would be missed by a staircase.
function lineResponses(ridge, width, height, directions, length=LINE_LENGTH) {
  const half = Math.floor(length / 2);
  const margin = half + 2;
  const responses = new Map();
  for ( const degrees of directions ) {
    const angle = (degrees * Math.PI) / 180;
    const taps = [];
    for ( let t = -half; t <= half; t++ ) {
      const dx = t * Math.cos(angle);
      const dy = t * Math.sin(angle);
      const ix = Math.floor(dx);
      const iy = Math.floor(dy);
      const fx = dx - ix;
      const fy = dy - iy;
      const base = (iy * width) + ix;
      taps.push([base, (1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy]);
    }
    const aligned = taps.every(tap => (tap[2] < 1e-9) && (tap[3] < 1e-9) && (tap[4] < 1e-9));
    const response = new Float32Array(width * height);
    for ( let y = margin; y < height - margin; y++ ) {
      for ( let x = margin; x < width - margin; x++ ) {
        const index = (y * width) + x;
        let sum = 0;
        if ( aligned ) {
          for ( let k = 0; k < taps.length; k++ ) sum += ridge[index + taps[k][0]];
        } else {
          for ( let k = 0; k < taps.length; k++ ) {
            const tap = taps[k];
            const at = index + tap[0];
            sum += (ridge[at] * tap[1]) + (ridge[at + 1] * tap[2]) + (ridge[at + width] * tap[3]) + (ridge[at + width + 1] * tap[4]);
          }
        }
        response[index] = Math.abs(sum) / taps.length;
      }
    }
    responses.set(degrees, response);
  }
  return {responses, width, height, margin};
}

// The points of a kind of grid: the places where a line of one of its directions runs, weighted by how much stronger
// the line response is than that of the terrain around
function pointsForKind(lines, kind, keep=KEEP_SHARE) {
  const {responses, width, height, margin} = lines;
  const directions = KIND_DIRECTIONS[kind].map(degrees => responses.get(degrees)).filter(Boolean);
  const count = width * height;
  const best = new Float32Array(count);
  for ( const response of directions ) {
    for ( let i = 0; i < count; i++ ) if ( response[i] > best[i] ) best[i] = response[i];
  }
  // Percentiles from a histogram of the values inside the margin
  let max = 0;
  for ( let y = margin; y < height - margin; y++ ) {
    for ( let x = margin; x < width - margin; x++ ) {
      const value = best[(y * width) + x];
      if ( value > max ) max = value;
    }
  }
  if ( !(max > 0) ) return {xs: new Float32Array(0), ys: new Float32Array(0), ws: new Float32Array(0), count: 0, sumSq: 0};
  const bins = 512;
  const histogram = new Uint32Array(bins);
  let inside = 0;
  for ( let y = margin; y < height - margin; y++ ) {
    for ( let x = margin; x < width - margin; x++ ) {
      histogram[Math.min(bins - 1, Math.floor((best[(y * width) + x] / max) * bins))]++;
      inside++;
    }
  }
  const percentile = share => {
    let sum = 0;
    for ( let b = 0; b < bins; b++ ) {
      sum += histogram[b];
      if ( sum >= inside * share ) return ((b + 1) / bins) * max;
    }
    return max;
  };
  const floor = percentile(1 - keep);
  const baseline = percentile(0.5);
  const xs = [];
  const ys = [];
  const ws = [];
  let sumSq = 0;
  let jitter = 12345;
  for ( let y = margin; y < height - margin; y++ ) {
    for ( let x = margin; x < width - margin; x++ ) {
      const value = best[(y * width) + x];
      if ( value < floor ) continue;
      const weight = value - baseline;
      if ( !(weight > 0) ) continue;
      // Jitter inside the pixel, so small cell sizes do not line up with the pixel raster
      jitter = ((jitter * 1664525) + 1013904223) >>> 0;
      xs.push(x + ((jitter & 0xFFFF) / 65536));
      jitter = ((jitter * 1664525) + 1013904223) >>> 0;
      ys.push(y + ((jitter & 0xFFFF) / 65536));
      ws.push(weight);
      sumSq += weight * weight;
    }
  }
  return {xs: Float32Array.from(xs), ys: Float32Array.from(ys), ws: Float32Array.from(ws), count: ws.length, sumSq};
}

// Lattice basis of a grid kind with cell size S: the distance between the centers of neighboring cells
function latticeOf(kind, size) {
  if ( kind === KINDS.POINTY ) return {ax: size, ay: 0, bx: size / 2, by: size * SQRT3 / 2};
  if ( kind === KINDS.FLAT ) return {ax: size * SQRT3 / 2, ay: size / 2, bx: 0, by: size};
  return {ax: size, ay: 0, bx: 0, by: size};
}

// Maps a point to the fractional position inside the lattice cell: u along the first, v along the second vector
function foldPoint(kind, size, x, y) {
  if ( kind === KINDS.POINTY ) {
    const v = y / (size * SQRT3 / 2);
    return [(x - (v * size / 2)) / size, v];
  }
  if ( kind === KINDS.FLAT ) {
    const u = x / (size * SQRT3 / 2);
    return [u, (y - (u * size / 2)) / size];
  }
  return [x / size, y / size];
}

// Folded edge picture: the strength of all edge points summed per bin of the lattice cell
function foldHistogram(points, kind, size, bins, buffer=null) {
  const histogram = buffer ?? new Float64Array(bins * bins);
  histogram.fill(0);
  const {xs, ys, ws, count} = points;
  if ( kind === KINDS.POINTY ) {
    const inverseY = 1 / (size * SQRT3 / 2);
    const inverseX = 1 / size;
    const half = size / 2;
    for ( let i = 0; i < count; i++ ) {
      const v = ys[i] * inverseY;
      let u = (xs[i] - (v * half)) * inverseX;
      u -= Math.floor(u);
      const fv = v - Math.floor(v);
      histogram[(Math.min(bins - 1, Math.floor(fv * bins)) * bins) + Math.min(bins - 1, Math.floor(u * bins))] += ws[i];
    }
  } else if ( kind === KINDS.FLAT ) {
    const inverseX = 1 / (size * SQRT3 / 2);
    const inverseY = 1 / size;
    const half = size / 2;
    for ( let i = 0; i < count; i++ ) {
      const u = xs[i] * inverseX;
      let v = (ys[i] - (u * half)) * inverseY;
      v -= Math.floor(v);
      const fu = u - Math.floor(u);
      histogram[(Math.min(bins - 1, Math.floor(v * bins)) * bins) + Math.min(bins - 1, Math.floor(fu * bins))] += ws[i];
    }
  } else {
    const inverse = 1 / size;
    for ( let i = 0; i < count; i++ ) {
      const u = xs[i] * inverse;
      const v = ys[i] * inverse;
      const fu = u - Math.floor(u);
      const fv = v - Math.floor(v);
      histogram[(Math.min(bins - 1, Math.floor(fv * bins)) * bins) + Math.min(bins - 1, Math.floor(fu * bins))] += ws[i];
    }
  }
  return histogram;
}

// How much sharper the folded picture is than chance. About 1 for an even spread, a lot more for a grid.
function sharpness(histogram, sumSq) {
  if ( !(sumSq > 0) ) return 0;
  let total = 0;
  for ( let i = 0; i < histogram.length; i++ ) total += histogram[i];
  const mean = total / histogram.length;
  let spread = 0;
  for ( let i = 0; i < histogram.length; i++ ) spread += (histogram[i] - mean) ** 2;
  return spread / sumSq;
}

function binsForSize(size, max=40, min=8) {
  return Math.max(min, Math.min(max, Math.round(size / 1.2)));
}

// Sizes from min to max with a relative step. The step keeps the drift over the whole image below `drift` pixels.
function sizeSteps(min, max, extent, drift) {
  const sizes = [];
  const step = Math.max(drift / extent, 0.00005);
  for ( let size = min; size <= max; size *= (1 + step) ) sizes.push(size);
  return sizes;
}

function scanKind(points, kind, sizes, extent) {
  const result = [];
  let buffer = null;
  let bins = 0;
  for ( const size of sizes ) {
    const wanted = binsForSize(size);
    if ( wanted !== bins ) { bins = wanted; buffer = new Float64Array(bins * bins); }
    const histogram = foldHistogram(points, kind, size, bins, buffer);
    result.push({size, q: sharpness(histogram, points.sumSq)});
  }
  return result;
}

function bestOf(scan) {
  let best = null;
  for ( const entry of scan ) if ( !best || (entry.q > best.q) ) best = entry;
  return best;
}

// Sharpest cell size around a guess: a scan over the whole range, then a finer scan around its best
function refineSize(points, kind, guess, extent, {spread=0.04, drift=1}={}) {
  const first = scanKind(points, kind, sizeSteps(guess * (1 - spread), guess * (1 + spread), extent, drift));
  let best = bestOf(first);
  if ( !best ) return {size: guess, q: 0};
  const reach = Math.max(best.size * (drift * 2.5 / extent), 1e-6);
  const second = scanKind(points, kind, sizeSteps(best.size - reach, best.size + reach, extent, 0.1));
  best = bestOf(second) ?? best;
  const scan = second.length ? second : first;
  // Parabola through the best and its neighbors for a size between the steps
  const index = scan.indexOf(best);
  if ( (index > 0) && (index < scan.length - 1) ) {
    const a = scan[index - 1].q;
    const b = best.q;
    const c = scan[index + 1].q;
    const denominator = a - (2 * b) + c;
    if ( denominator < 0 ) {
      const shift = 0.5 * (a - c) / denominator;
      if ( Math.abs(shift) <= 1 ) return {size: best.size + (shift * (scan[index + 1].size - scan[index].size)), q: b};
    }
  }
  return {size: best.size, q: best.q};
}

// Points of the outline of one grid cell relative to its center. A square has no center, its outline is a corner.
function outlineOf(kind, size, density) {
  const points = [];
  if ( kind === KINDS.SQUARE ) {
    for ( let t = 0; t < size; t += density ) {
      points.push([t, 0], [0, t]);
    }
    return points;
  }
  const radius = size / SQRT3;
  const first = kind === KINDS.POINTY ? 30 : 0;
  const corners = [];
  for ( let k = 0; k < 6; k++ ) {
    const angle = ((first + (60 * k)) * Math.PI) / 180;
    corners.push([radius * Math.cos(angle), radius * Math.sin(angle)]);
  }
  for ( let k = 0; k < 6; k++ ) {
    const [x0, y0] = corners[k];
    const [x1, y1] = corners[(k + 1) % 6];
    const length = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(2, Math.round(length / density));
    for ( let s = 0; s < steps; s++ ) points.push([x0 + (((x1 - x0) * s) / steps), y0 + (((y1 - y0) * s) / steps)]);
  }
  return points;
}

// Bins for the position fit: about 0.7 pixels each
function fitBinsFor(size) {
  return Math.max(24, Math.min(120, Math.round(size / 0.7)));
}

// A printed line shows as two edges next to each other. A blur of about the line width merges them into one peak.
function blurCircular(histogram, bins, radius) {
  let current = histogram;
  for ( let pass = 0; pass < 2; pass++ ) {
    const next = new Float64Array(current.length);
    for ( let row = 0; row < bins; row++ ) {
      for ( let column = 0; column < bins; column++ ) {
        let sum = 0;
        for ( let d = -radius; d <= radius; d++ ) {
          sum += pass === 0
            ? current[(row * bins) + ((((column + d) % bins) + bins) % bins)]
            : current[((((row + d) % bins) + bins) % bins) * bins + column];
        }
        next[(row * bins) + column] = sum / ((2 * radius) + 1);
      }
    }
    current = next;
  }
  return current;
}

// Average edge strength under the outlines of all cells of a grid placed with its reference point at (x, y)
function outlineStrength(edges, width, height, kind, size, x, y, spacing, pattern, cap=Infinity, collect=null) {
  const lattice = latticeOf(kind, size);
  const det = (lattice.ax * lattice.by) - (lattice.ay * lattice.bx);
  // Index range of cells that can touch the image
  const reach = size * 1.2;
  const corners = [[-reach, -reach], [width + reach, -reach], [-reach, height + reach], [width + reach, height + reach]];
  let iMin = Infinity; let iMax = -Infinity; let jMin = Infinity; let jMax = -Infinity;
  for ( const [cx, cy] of corners ) {
    const i = (((cx - x) * lattice.by) - ((cy - y) * lattice.bx)) / det;
    const j = (((cy - y) * lattice.ax) - ((cx - x) * lattice.ay)) / det;
    iMin = Math.min(iMin, i); iMax = Math.max(iMax, i); jMin = Math.min(jMin, j); jMax = Math.max(jMax, j);
  }
  let sum = 0;
  let count = 0;
  for ( let j = Math.floor(jMin); j <= Math.ceil(jMax); j++ ) {
    for ( let i = Math.floor(iMin); i <= Math.ceil(iMax); i++ ) {
      const ox = x + (i * lattice.ax) + (j * lattice.bx);
      const oy = y + (i * lattice.ay) + (j * lattice.by);
      for ( const [dx, dy] of pattern ) {
        const px = ox + dx;
        const py = oy + dy;
        if ( (px < 1) || (py < 1) || (px >= width - 2) || (py >= height - 2) ) continue;
        const x0 = Math.floor(px);
        const y0 = Math.floor(py);
        const fx = px - x0;
        const fy = py - y0;
        const k = (y0 * width) + x0;
        const value = (edges[k] * (1 - fx) * (1 - fy)) + (edges[k + 1] * fx * (1 - fy)) + (edges[k + width] * (1 - fx) * fy) + (edges[k + width + 1] * fx * fy);
        if ( collect ) collect.push(value);
        sum += Math.min(value, cap);
        count++;
      }
    }
  }
  return count ? sum / count : 0;
}

// Moves a grid position to where the outlines of all cells lie on the strongest edges of the image itself
function refinePosition(image, kind, size, start) {
  const edges = image.ridge;
  const spacing = Math.max(1.5, size / 16);
  const pattern = outlineOf(kind, size, spacing);
  // Strong content on the map must not pull the grid: a sample counts at most 1.5 times the typical line response
  const samples = [];
  outlineStrength(edges, image.width, image.height, kind, size, start.x - 0.5, start.y - 0.5, spacing, pattern, Infinity, samples);
  samples.sort((a, b) => a - b);
  const cap = samples.length ? Math.max(1e-6, samples[Math.floor(samples.length * 0.6)] * 1.5) : Infinity;
  let best = {x: start.x, y: start.y, score: -1};
  for ( const [radius, step] of [[Math.min(4, Math.max(2.5, size / 20)), 1], [1.1, 0.2]] ) {
    const center = {x: best.score < 0 ? start.x - 0.5 : best.x, y: best.score < 0 ? start.y - 0.5 : best.y};
    best = {x: center.x, y: center.y, score: -1};
    for ( let dy = -radius; dy <= radius + 1e-9; dy += step ) {
      for ( let dx = -radius; dx <= radius + 1e-9; dx += step ) {
        const score = outlineStrength(edges, image.width, image.height, kind, size, center.x + dx, center.y + dy, spacing, pattern, cap);
        if ( score > best.score ) best = {x: center.x + dx, y: center.y + dy, score};
      }
    }
  }
  // Back to coordinates where a pixel covers [x, x + 1)
  return {x: best.x + 0.5, y: best.y + 0.5, score: best.score};
}

// Position of the grid in the folded picture: the offset of a cell outline that covers the strongest edges.
// Returns the reference point (a corner for squares, the center of one cell for hexagons) in pixels of the image.
function fitOutline(points, kind, size, bins=fitBinsFor(size)) {
  const histogram = blurCircular(foldHistogram(points, kind, size, bins), bins, Math.max(1, Math.round(LINE_BLUR / (size / bins))));
  let total = 0;
  for ( let i = 0; i < histogram.length; i++ ) total += histogram[i];
  const mean = total / histogram.length;
  const outline = outlineOf(kind, size, Math.max(1, size / (bins * 0.9)));
  // The outline in bins relative to its origin
  const offsets = outline.map(([x, y]) => {
    const [u, v] = foldPoint(kind, size, x, y);
    return [Math.round(u * bins), Math.round(v * bins)];
  });
  const scores = new Float64Array(bins * bins);
  let best = {score: -1, i: 0, j: 0};
  for ( let j = 0; j < bins; j++ ) {
    for ( let i = 0; i < bins; i++ ) {
      let sum = 0;
      for ( const [du, dv] of offsets ) {
        const column = (((i + du) % bins) + bins) % bins;
        const row = (((j + dv) % bins) + bins) % bins;
        sum += histogram[(row * bins) + column];
      }
      const score = sum / offsets.length;
      scores[(j * bins) + i] = score;
      if ( score > best.score ) best = {score, i, j};
    }
  }
  // Parabola in both directions for a position between the bins
  const at = (i, j) => scores[((((j % bins) + bins) % bins) * bins) + (((i % bins) + bins) % bins)];
  const peak = (a, b, c) => {
    const denominator = a - (2 * b) + c;
    return denominator < 0 ? Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / denominator)) : 0;
  };
  // How far the best position stands out of all positions, in standard deviations
  let scoreSum = 0;
  for ( let i = 0; i < scores.length; i++ ) scoreSum += scores[i];
  const scoreMean = scoreSum / scores.length;
  let scoreSpread = 0;
  for ( let i = 0; i < scores.length; i++ ) scoreSpread += (scores[i] - scoreMean) ** 2;
  const significance = scoreSpread > 0 ? (best.score - scoreMean) / Math.sqrt(scoreSpread / scores.length) : 0;
  const fineI = best.i + peak(at(best.i - 1, best.j), best.score, at(best.i + 1, best.j));
  const fineJ = best.j + peak(at(best.i, best.j - 1), best.score, at(best.i, best.j + 1));
  const lattice = latticeOf(kind, size);
  const u = (fineI + 0.5) / bins;
  const v = (fineJ + 0.5) / bins;
  const ou = u;
  const ov = v;
  return {
    x: (lattice.ax * ou) + (lattice.bx * ov),
    y: (lattice.ay * ou) + (lattice.by * ov),
    contrast: mean > 0 ? best.score / mean : 0,
    significance
  };
}

// Every n-th point, for the wide scan over all cell sizes
function subsample(points, limit) {
  if ( points.count <= limit ) return points;
  const stride = Math.ceil(points.count / limit);
  const xs = [];
  const ys = [];
  const ws = [];
  let sumSq = 0;
  for ( let i = 0; i < points.count; i += stride ) {
    xs.push(points.xs[i]);
    ys.push(points.ys[i]);
    ws.push(points.ws[i]);
    sumSq += points.ws[i] * points.ws[i];
  }
  return {xs: Float32Array.from(xs), ys: Float32Array.from(ys), ws: Float32Array.from(ws), count: ws.length, sumSq};
}

// Share of the 8 x 8 tiles of the image that hold at least a few points. A grid runs over the whole map, a caption or a
// logo on a plain background is a small area and no grid.
function coverage(points, width, height, tiles=8, minimum=20) {
  const counts = new Uint32Array(tiles * tiles);
  for ( let i = 0; i < points.count; i++ ) {
    const column = Math.min(tiles - 1, Math.floor((points.xs[i] / width) * tiles));
    const row = Math.min(tiles - 1, Math.floor((points.ys[i] / height) * tiles));
    counts[(row * tiles) + column]++;
  }
  let covered = 0;
  for ( const count of counts ) if ( count >= minimum ) covered++;
  return covered / counts.length;
}

// The line points of an image for all kinds: ridge image, line responses and one point set per kind
function prepareImage({data, width, height}, kinds=KIND_LIST) {
  const gray = data;
  const image = {gray, width, height};
  image.ridge = ridgeImage(image);
  // Printed lines have one polarity, terrain has both: the signed average along a line keeps the line and cancels terrain
  const signed = ridgeImage(image, 3, {signed: true});
  const directions = [...new Set(kinds.flatMap(kind => KIND_DIRECTIONS[kind]))];
  const lines = lineResponses(signed, width, height, directions);
  image.points = Object.fromEntries(kinds.map(kind => [kind, pointsForKind(lines, kind)]));
  return image;
}

// Local maxima of a scan, best first, at least 4 percent apart in size
function scanPeaks(scan, limit=PEAKS_PER_KIND) {
  const peaks = [];
  for ( let i = 1; i < scan.length - 1; i++ ) {
    if ( (scan[i].q >= scan[i - 1].q) && (scan[i].q >= scan[i + 1].q) ) peaks.push(scan[i]);
  }
  peaks.sort((a, b) => b.q - a.q);
  const kept = [];
  for ( const peak of peaks ) {
    if ( kept.every(other => Math.abs(Math.log(peak.size / other.size)) > 0.04) ) kept.push(peak);
    if ( kept.length >= limit ) break;
  }
  return kept;
}

// The grid printed on a gray image, or {found: false, reason}.
// Result sizes and positions are in pixels of the given image. `size` is the distance between the centers of
// neighboring cells (the grid size of Foundry), `x` and `y` a corner (square) or the center of a cell (hexagons).
function detectGrid({data, width, height}, {minCells=MIN_CELLS, minSize=MIN_CELL_SIZE, scale=1, kinds=KIND_LIST}={}) {
  if ( !data || !(width > 0) || !(height > 0) ) return {found: false, reason: "empty"};
  if ( Math.min(width, height) < 80 ) return {found: false, reason: "small"};

  const image = prepareImage({data, width, height}, kinds);
  // A plain picture with a caption has points in one corner only
  const spread = kinds.filter(kind => (image.points[kind].count >= 200) && (coverage(image.points[kind], width, height) >= MIN_COVERAGE));
  if ( !spread.length ) return {found: false, reason: "flat"};
  const extent = Math.max(width, height);
  const smallest = Math.max(SMALLEST_CELL, minSize * scale);
  const largest = Math.min(width, height) / minCells;
  if ( !(largest > smallest) ) return {found: false, reason: "small"};
  const sizes = sizeSteps(smallest, largest, extent, 2);

  // Scan every kind and keep the sharpest cell sizes of each
  const candidates = [];
  for ( const kind of spread ) {
    const points = image.points[kind];
    const scan = scanKind(subsample(points, SCAN_POINTS), kind, sizes);
    const sorted = scan.map(entry => entry.q).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] || 1e-9;
    for ( const peak of scanPeaks(scan) ) {
      candidates.push({kind, size: peak.size, q: peak.q, prominence: peak.q / median, quick: fitOutline(points, kind, peak.size, 32).contrast});
    }
  }
  if ( !candidates.length ) return {found: false, reason: "flat"};
  // The quick outline contrast puts the candidates in order, the best ones are looked at closely
  candidates.sort((a, b) => b.quick - a.quick);

  const analyse = candidate => {
    const {kind} = candidate;
    const points = image.points[kind];
    const sample = subsample(points, REFINE_POINTS);
    const lead = refineSize(sample, kind, candidate.size, extent, {spread: 0.02});

    // The sharpest size may be a multiple of the real one (every second line looks as sharp) or a fraction of it (a cell
    // with lines in the middle that are not there). An outline fitted to the real size, or to a multiple of it, lies on
    // strong lines all around, one fitted to a fraction does not. The smallest size that holds up is the real one.
    // The strength counts above the average (a contrast of 1 is nothing), so a map with much going on still tells.
    const ladder = [];
    for ( const ratio of SIZE_LADDER ) {
      const size = lead.size * ratio;
      if ( (size < 6) || ((Math.min(width, height) / size) < (minCells * 0.9)) ) continue;
      ladder.push({size, excess: fitOutline(sample, kind, size, LADDER_BINS).contrast - 1});
    }
    const strongest = Math.max(...ladder.map(entry => entry.excess));
    const chosen = ladder.filter(entry => entry.excess >= (strongest * LADDER_SHARE)).sort((x, y) => x.size - y.size)[0] ?? {size: lead.size};
    const refined = (Math.abs(chosen.size - lead.size) < 1e-9) ? lead : refineSize(sample, kind, chosen.size, extent, {spread: 0.02});
    return {kind, refined, fit: fitOutline(points, kind, refined.size), prominence: candidate.prominence};
  };
  let winner = null;
  for ( const candidate of candidates.slice(0, MAX_CANDIDATES) ) {
    const analysed = analyse(candidate);
    if ( !winner || (analysed.fit.contrast > winner.fit.contrast) ) winner = analysed;
    // A clear outline needs no second opinion
    if ( winner.fit.contrast >= 3 ) break;
  }
  const {kind, refined, fit, prominence} = winner;
  const finalSize = refined.size;
  const found = (fit.contrast >= MIN_CONTRAST)
    && (((refined.q >= MIN_SHARPNESS) && (prominence >= MIN_PROMINENCE)) || (fit.significance >= MIN_SIGNIFICANCE));
  // The exact position is only worth the time when a grid was found
  if ( found ) {
    const placed = refinePosition(image, kind, refined.size, fit);
    fit.x = placed.x;
    fit.y = placed.y;
  }
  const cells = {across: width / finalSize, down: height / finalSize};
  const metrics = {sharpness: refined.q, contrast: fit.contrast, significance: fit.significance, prominence};
  if ( !found ) return {found: false, reason: "noGrid", kind, size: finalSize, ...metrics};
  if ( Math.min(cells.across, cells.down) < minCells * 0.9 ) return {found: false, reason: "fewCells", kind, size: finalSize, ...metrics};
  if ( (finalSize / scale) < minSize * 0.95 ) return {found: false, reason: "tooSmall", kind, size: finalSize, ...metrics};
  return {found: true, kind, size: finalSize, x: fit.x, y: fit.y, ...metrics};
}

// Position (and a slightly corrected size) of a grid of known kind and approximate size, for a size measured by hand.
// `contrast` tells whether a grid lies there at all, below the limit the drawn position is the better guess.
function locateGrid({data, width, height}, kind, size, {fixSize=true}={}) {
  const image = prepareImage({data, width, height}, [kind]);
  const points = image.points[kind];
  if ( (points.count < 200) || (coverage(points, width, height) < MIN_COVERAGE) ) return {found: false, reason: "flat"};
  const extent = Math.max(width, height);
  const refined = fixSize
    ? refineSize(points, kind, size, extent, {spread: 0.03})
    : {size, q: sharpness(foldHistogram(points, kind, size, binsForSize(size)), points.sumSq)};
  const fit = fitOutline(points, kind, refined.size);
  const placed = refinePosition(image, kind, refined.size, fit);
  const found = (fit.contrast >= MIN_CONTRAST) && (refined.q >= MIN_SHARPNESS);
  return {found, kind, size: refined.size, x: placed.x, y: placed.y, sharpness: refined.q, contrast: fit.contrast};
}

// Reference point of a result as the position of the first grid line or cell center inside the first cell
function normalizeOffset(kind, size, x, y) {
  const lattice = latticeOf(kind, size);
  const [u, v] = foldPoint(kind, size, x, y);
  const fu = u - Math.floor(u);
  const fv = v - Math.floor(v);
  return {x: (lattice.ax * fu) + (lattice.bx * fv), y: (lattice.ay * fu) + (lattice.by * fv)};
}

const __test__ = {
  ridgeImage,
  lineResponses,
  pointsForKind,
  coverage,
  prepareImage,
  scanPeaks,
  latticeOf,
  foldPoint,
  foldHistogram,
  sharpness,
  outlineOf,
  fitOutline,
  refinePosition,
  refineSize,
  sizeSteps,
  scanKind,
  normalizeOffset,
  MIN_SHARPNESS,
  MIN_CONTRAST,
  MIN_PROMINENCE
};

export {KINDS, MIN_CELLS, MIN_CELL_SIZE, detectGrid, locateGrid, normalizeOffset, latticeOf, foldPoint, __test__};
