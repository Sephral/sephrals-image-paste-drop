// Token frames drawn in code: metal rings, studs, gems, runes, wood, stone, laurel and plain rings. Nothing here is
// an image or a copied asset, every pixel comes from a height map (bevels, studs, grooves) that is lit from the upper
// left, plus a few noise functions. The helpers are pure and work on RGBA data (Uint8ClampedArray).
//
// A frame style has a shape (round or square), a height function in units of the ring thickness T (t runs from 0 at
// the outer edge to 1 at the inner edge, u is the way along the ring) and a colour function. The chosen colour is the
// accent: the enamel band of the metal rings, the gems, the glowing runes, the painted stripe on wood and stone, the
// leaves of the laurel and the whole flat ring.

const FRAME_STYLES = Object.freeze({
  NONE: "none",
  FLAT: "flat",
  FLAT_SQUARE: "flatSquare",
  RING: "ring",
  GOLD: "gold",
  SILVER: "silver",
  BRONZE: "bronze",
  IRON: "iron",
  STUDDED: "studded",
  GEMS: "gems",
  RUNES: "runes",
  WOOD: "wood",
  STONE: "stone",
  LAUREL: "laurel",
  ORNATE_SQUARE: "ornateSquare"
});

// Values the first version of the frame saved
const LEGACY_FRAME_STYLES = Object.freeze({round: FRAME_STYLES.FLAT, square: FRAME_STYLES.FLAT_SQUARE});

const FRAME_STYLE_LIST = Object.freeze(Object.values(FRAME_STYLES));

const TAU = Math.PI * 2;
const LIGHT = (() => {
  const x = -0.5;
  const y = -0.62;
  const z = 0.6;
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
})();
const HALF_VECTOR = (() => {
  const x = LIGHT[0];
  const y = LIGHT[1];
  const z = LIGHT[2] + 1;
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
})();
const SLOPE_STRENGTH = 1.25;
const GRADIENT_STEP = 0.02;

const clamp01 = value => (value < 0 ? 0 : (value > 1 ? 1 : value));
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - (2 * t));
};
const lerp = (a, b, t) => a + ((b - a) * t);
const gauss = (x, width) => Math.exp(-((x / width) ** 2));

function normalizeFrameStyle(value) {
  const style = LEGACY_FRAME_STYLES[value] ?? value;
  return FRAME_STYLE_LIST.includes(style) ? style : FRAME_STYLES.NONE;
}

// ------------------------------------------------------------------------------------------------ noise

// A number from 0 to 1 for two whole numbers, always the same
function hash2(ix, iy) {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iy | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - (2 * fx));
  const sy = fy * fy * (3 - (2 * fy));
  const top = lerp(hash2(ix, iy), hash2(ix + 1, iy), sx);
  const bottom = lerp(hash2(ix, iy + 1), hash2(ix + 1, iy + 1), sx);
  return lerp(top, bottom, sy);
}

function fractalNoise(x, y) {
  return ((valueNoise(x, y) * 0.55) + (valueNoise(x * 2.1, y * 2.1) * 0.3) + (valueNoise(x * 4.3, y * 4.3) * 0.15));
}

// ------------------------------------------------------------------------------------------------ geometry

// Where a pixel sits in a ring: edge = distance inward from the outer edge in pixels (below 0 is outside the shape),
// n = outward direction, ang = angle seen from the center, s = the way along the ring in pixels, which grows clockwise
function frameGeometry(shape, x, y, width, height, thickness, out={}) {
  const px = x + 0.5;
  const py = y + 0.5;
  const cx = width / 2;
  const cy = height / 2;
  out.ang = Math.atan2(py - cy, px - cx);
  if ( shape === "round" ) {
    const radius = Math.min(width, height) / 2;
    const dx = px - cx;
    const dy = py - cy;
    const distance = Math.hypot(dx, dy);
    out.edge = radius - distance;
    if ( distance > 1e-6 ) {
      out.nx = dx / distance;
      out.ny = dy / distance;
    } else {
      out.nx = 0;
      out.ny = -1;
    }
    const middle = Math.max(1, radius - (thickness / 2));
    out.s = (out.ang + Math.PI) * middle;
    out.perimeter = TAU * middle;
    return out;
  }
  const ex = Math.min(px, width - px);
  const ey = Math.min(py, height - py);
  out.edge = Math.min(ex, ey);
  out.perimeter = 2 * (width + height);
  if ( ey <= ex ) {
    out.nx = 0;
    if ( py < cy ) {
      out.ny = -1;
      out.s = px;
    } else {
      out.ny = 1;
      out.s = width + height + (width - px);
    }
  } else {
    out.ny = 0;
    if ( px < cx ) {
      out.nx = -1;
      out.s = (2 * width) + height + (height - py);
    } else {
      out.nx = 1;
      out.s = width + py;
    }
  }
  return out;
}

// The index of the repeat a position falls in and the offset from its center, for `count` repeats along a ring
function repeatCell(s, perimeter, count) {
  const size = perimeter / count;
  const scaled = s / size;
  const cell = Math.floor(scaled);
  return {cell: ((cell % count) + count) % count, offset: (scaled - cell - 0.5) * size};
}

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = (dx * dx) + (dy * dy);
  const t = lengthSquared > 0 ? clamp01((((px - x1) * dx) + ((py - y1) * dy)) / lengthSquared) : 0;
  return Math.hypot(px - (x1 + (t * dx)), py - (y1 + (t * dy)));
}

// ------------------------------------------------------------------------------------------------ colors

const hexRamp = list => list.map(hex => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]);
const RAMPS = Object.freeze({
  gold: hexRamp(["#4a3008", "#8f6616", "#d4a73a", "#f3d57a", "#fff6c9"]),
  silver: hexRamp(["#3b4149", "#7d8792", "#c3cad2", "#eef1f4", "#ffffff"]),
  bronze: hexRamp(["#2f1809", "#6e3f1c", "#b0713a", "#e0a468", "#f8d4a6"]),
  iron: hexRamp(["#121418", "#2c3138", "#555e69", "#8d97a3", "#cdd5de"]),
  rune: hexRamp(["#101216", "#23272e", "#3d444e", "#6a7480", "#a5afbb"]),
  wood: hexRamp(["#2c1a0c", "#573820", "#855a31", "#b58450", "#d9b27a"]),
  stone: hexRamp(["#3a3a39", "#63625e", "#8d8b84", "#b4b1a7", "#d8d5ca"])
});

function rampColor(ramp, m, out) {
  const position = clamp01(m) * (ramp.length - 1);
  const index = Math.min(ramp.length - 2, Math.floor(position));
  const fraction = position - index;
  const a = ramp[index];
  const b = ramp[index + 1];
  out[0] = lerp(a[0], b[0], fraction);
  out[1] = lerp(a[1], b[1], fraction);
  out[2] = lerp(a[2], b[2], fraction);
}

// The accent lit like a glossy paint: dark in the shade, bright with a white glint
function paintColor(accent, lam, sp, out, gloss=0.5) {
  const light = Math.max(0.25, 0.55 + (0.5 * (lam - 1)) + 0.2);
  out[0] = Math.min(255, (accent[0] * light) + (255 * sp * gloss));
  out[1] = Math.min(255, (accent[1] * light) + (255 * sp * gloss));
  out[2] = Math.min(255, (accent[2] * light) + (255 * sp * gloss));
}

function mix(out, color, weight) {
  out[0] = lerp(out[0], color[0], weight);
  out[1] = lerp(out[1], color[1], weight);
  out[2] = lerp(out[2], color[2], weight);
}

// ------------------------------------------------------------------------------------------------ styles
// height(t, s, k): the height of the surface in units of T. color(...) writes the color and returns the opacity.
// k holds what is the same for the whole picture: thickness T, ring length, accent color and repeat counts.

const sheen = ang => 0.5 + (0.5 * Math.cos((2 * ang) - 1.8));

// The profile of the metal rings: rim, raised band with a groove, enamel inlay, inner lip
function metalProfile(t) {
  return (0.3 * smooth(0, 0.17, t)) - (0.2 * smooth(0.56, 0.64, t)) + (0.2 * smooth(0.84, 0.92, t))
    - (0.3 * smooth(0.965, 1, t)) - (0.045 * gauss(t - 0.4, 0.028));
}

const enamelWeight = t => smooth(0.58, 0.63, t) * (1 - smooth(0.86, 0.9, t));

function metalColor(ramp, t, lam, sp, ang, k, out) {
  const m = 0.5 + (0.46 * (lam - 1)) + (0.2 * (sheen(ang) - 0.5)) + (0.55 * sp);
  rampColor(ramp, m, out);
  const enamel = enamelWeight(t);
  if ( enamel > 0 ) {
    const paint = [0, 0, 0];
    paintColor(k.accent, lam, sp, paint, 0.6);
    // a little depth: darker toward the metal on both sides
    const depth = 0.8 + (0.2 * Math.sin(Math.PI * clamp01((t - 0.64) / 0.24)));
    mix(out, [paint[0] * depth, paint[1] * depth, paint[2] * depth], enamel);
  }
  return 1;
}

function dome(distance, radius, peak) {
  if ( distance >= radius ) return 0;
  const q = distance / radius;
  return peak * Math.sqrt(1 - (q * q));
}

// The glyphs of the runic ring: strokes in a box from -1 to 1
const RUNE_GLYPHS = Object.freeze([
  [[0, -1, 0, 1], [0, -0.6, 0.8, -1], [0, -0.05, 0.8, -0.45]],
  [[-0.6, -1, -0.6, 1], [-0.6, -1, 0.6, -0.5], [0.6, -0.5, 0.6, 1]],
  [[-0.5, -1, -0.5, 1], [-0.5, -0.5, 0.6, 0], [0.6, 0, -0.5, 0.5]],
  [[-0.5, -1, -0.5, 1], [-0.5, -1, 0.6, -0.5], [-0.5, -0.2, 0.6, 0.3]],
  [[-0.5, -1, -0.5, 1], [-0.5, -1, 0.5, -0.5], [0.5, -0.5, -0.5, 0], [-0.5, 0, 0.6, 1]],
  [[0.5, -0.8, -0.5, 0], [-0.5, 0, 0.5, 0.8]],
  [[-0.6, -1, 0.6, 1], [0.6, -1, -0.6, 1]],
  [[-0.5, -1, -0.5, 1], [-0.5, -1, 0.5, -0.5], [0.5, -0.5, -0.5, 0]],
  [[-0.5, -1, -0.5, 1], [0.5, -1, 0.5, 1], [-0.5, -0.3, 0.5, 0.3]],
  [[0, -1, 0, 1], [0, 0, -0.7, -0.8], [0, 0, 0.7, -0.8]],
  [[0, -1, 0, 1], [0, -1, -0.6, -0.4], [0, -1, 0.6, -0.4]],
  [[0, -1, -0.7, 0], [0, -1, 0.7, 0], [-0.7, 0, 0, 1], [0.7, 0, 0, 1]]
].map(glyph => glyph.map(([x1, y1, x2, y2]) => [x1 * 0.19, y1 * 0.3, x2 * 0.19, y2 * 0.3])));

function runeDistance(t, s, k) {
  const {cell, offset} = repeatCell(s, k.perimeter, k.runeCount);
  const glyph = RUNE_GLYPHS[((cell * 5) + 3) % RUNE_GLYPHS.length];
  const px = offset / k.T;
  const py = t - 0.5;
  let best = 9;
  for ( const [x1, y1, x2, y2] of glyph ) best = Math.min(best, distanceToSegment(px, py, x1, y1, x2, y2));
  return best;
}

const lineWidth = k => Math.max(0.045, 0.7 / k.T);

function runeEngrave(t, s, k) {
  const width = lineWidth(k);
  const glyph = 1 - smooth(width * 0.55, width, runeDistance(t, s, k));
  const lines = Math.max(gauss(t - 0.11, 0.022), gauss(t - 0.89, 0.022)) * 0.7;
  return Math.max(glyph, lines);
}

// Planks of the wooden ring and blocks of the stone ring: the position across a joint, in units of T
function jointDistance(s, perimeter, count, T) {
  const size = perimeter / count;
  const scaled = s / size;
  const fraction = scaled - Math.floor(scaled);
  return Math.min(fraction, 1 - fraction) * size / T;
}

function cellIndex(s, perimeter, count) {
  return ((Math.floor(s / (perimeter / count)) % count) + count) % count;
}

// Laurel: two branches that rise from the bottom and meet at the top, leaves alternate inside and outside.
// Returns the leaf that covers the position best: how deep inside (0 to 1), where along it, how far off the middle.
const LEAF_ANGLE = 0.5;
const LEAF_HALF_LENGTH = 0.8;
const LEAF_HALF_WIDTH = 0.3;
const LEAF_SPACING = 1.0;

function leafAt(t, s, k) {
  const ang = (s / k.middle) - Math.PI;
  // the way up the branch from the bottom, in pixels, and which branch
  let along = ang > (Math.PI / 2) ? ang - (Math.PI / 2) : (ang < (-Math.PI / 2) ? ang + ((3 * Math.PI) / 2) : (Math.PI / 2) - ang);
  along *= k.middle;
  const spacing = LEAF_SPACING * k.T;
  const base = Math.floor(along / spacing);
  const cos = Math.cos(LEAF_ANGLE);
  const sin = Math.sin(LEAF_ANGLE);
  let best = null;
  for ( let index = base - 3; index <= base + 3; index += 1 ) {
    if ( index < 0 ) continue;
    const outer = (index % 2) === 0;
    const sign = outer ? -1 : 1;
    const dp = along - ((index + 0.5) * spacing);
    const dq = (t - (0.5 + (outer ? -0.19 : 0.19))) * k.T;
    const longitudinal = (dp * cos) + (dq * sign * sin);
    const crosswise = (-dp * sign * sin) + (dq * cos);
    const a = longitudinal / (LEAF_HALF_LENGTH * k.T);
    const b = crosswise / (LEAF_HALF_WIDTH * k.T);
    const e = Math.hypot(a, b);
    if ( e < 1.15 && (!best || e < best.e) ) best = {e, crosswise: Math.abs(b), index};
  }
  return best;
}

// The tool kit of every style. `shadow` darkens the picture next to the inner edge.
const STYLE_DEFS = {
  [FRAME_STYLES.FLAT]: {shape: "round", shadow: 0, flat: true},
  [FRAME_STYLES.FLAT_SQUARE]: {shape: "square", shadow: 0, flat: true},
  [FRAME_STYLES.RING]: {
    shape: "round",
    shadow: 0.38,
    height: t => (0.14 * smooth(0, 0.3, t)) - (0.14 * smooth(0.7, 1, t)),
    color(t, s, lam, sp, ang, k, out) {
      const edge = 1 - smooth(0.05, 0.16, t);
      const inner = smooth(0.86, 0.96, t);
      const base = 0.88 + (0.35 * (lam - 1));
      out[0] = Math.min(255, (k.accent[0] * base) + (255 * sp * 0.25));
      out[1] = Math.min(255, (k.accent[1] * base) + (255 * sp * 0.25));
      out[2] = Math.min(255, (k.accent[2] * base) + (255 * sp * 0.25));
      mix(out, [k.accent[0] * 0.3, k.accent[1] * 0.3, k.accent[2] * 0.3], edge * 0.85);
      mix(out, [255, 255, 255], inner * 0.3);
      return 1;
    }
  }
};

for ( const [style, ramp] of [[FRAME_STYLES.GOLD, "gold"], [FRAME_STYLES.SILVER, "silver"], [FRAME_STYLES.BRONZE, "bronze"], [FRAME_STYLES.IRON, "iron"]] ) {
  STYLE_DEFS[style] = {
    shape: "round",
    shadow: 0.5,
    height: metalProfile,
    color: (t, s, lam, sp, ang, k, out) => metalColor(RAMPS[ramp], t, lam, sp, ang, k, out)
  };
}

STYLE_DEFS[FRAME_STYLES.STUDDED] = {
  shape: "round",
  shadow: 0.5,
  // steel with a recessed enamel inlay and rows of round brass studs
  height(t, s, k) {
    const {offset} = repeatCell(s, k.perimeter, k.studCount);
    const stud = dome(Math.hypot(offset / k.T, t - 0.27), 0.2, 0.24);
    const outer = (0.26 * smooth(0, 0.1, t)) - (0.045 * gauss(t - 0.5, 0.025));
    const inner = (-0.2 * smooth(0.56, 0.62, t)) + (0.18 * smooth(0.84, 0.9, t)) - (0.24 * smooth(0.965, 1, t));
    return outer + inner + (stud * (1 - smooth(0.4, 0.45, t)));
  },
  color(t, s, lam, sp, ang, k, out) {
    const {offset} = repeatCell(s, k.perimeter, k.studCount);
    metalColor(RAMPS.silver, t, lam, sp, ang, k, out);
    const stud = 1 - smooth(0.185, 0.215, Math.hypot(offset / k.T, t - 0.27));
    if ( stud > 0 ) {
      const brass = [0, 0, 0];
      rampColor(RAMPS.gold, 0.5 + (0.46 * (lam - 1)) + (0.6 * sp), brass);
      mix(out, brass, stud);
    }
    return 1;
  }
};

STYLE_DEFS[FRAME_STYLES.GEMS] = {
  shape: "round",
  shadow: 0.5,
  height(t, s, k) {
    const ds = gemOffset(s, k);
    const distance = Math.hypot(ds / k.T, t - 0.5);
    const bezel = dome(distance, 0.5, 0.1) * 0.6;
    const gem = dome(distance, 0.4, 0.36);
    return metalProfile(t) + bezel + gem;
  },
  color(t, s, lam, sp, ang, k, out) {
    const ds = gemOffset(s, k);
    const lx = ds / k.T;
    const ly = t - 0.5;
    const distance = Math.hypot(lx, ly);
    metalColor(RAMPS.gold, t, lam, sp, ang, {accent: [0, 0, 0]}, out);
    // a gold band has no enamel here, the metal shows
    if ( enamelWeight(t) > 0 ) rampColor(RAMPS.gold, 0.5 + (0.46 * (lam - 1)) + (0.55 * sp), out);
    if ( distance < 0.4 ) {
      const facets = 8;
      const sector = Math.floor(((Math.atan2(ly, lx) + Math.PI) / TAU) * facets);
      const facing = Math.cos((((sector + 0.5) / facets) * TAU) - Math.PI - Math.atan2(LIGHT[1], LIGHT[0]));
      const depth = 1 - (distance / 0.4);
      const bright = 0.5 + (0.55 * facing * 0.6) + (0.35 * depth);
      const gem = [
        Math.min(255, (k.accent[0] * bright) + (255 * sp * 0.9)),
        Math.min(255, (k.accent[1] * bright) + (255 * sp * 0.9)),
        Math.min(255, (k.accent[2] * bright) + (255 * sp * 0.9))
      ];
      const spot = gauss(Math.hypot(lx + 0.1, ly + 0.11), 0.07);
      mix(gem, [255, 255, 255], spot * 0.85);
      mix(out, gem, 1 - smooth(0.37, 0.4, distance));
    }
    return 1;
  }
};

function gemOffset(s, k) {
  const quarter = k.perimeter / 4;
  // the gems sit at left, top, right and bottom, the start of s is the left
  const scaled = (s / quarter) + 0;
  const nearest = Math.round(scaled);
  return (scaled - nearest) * quarter;
}

STYLE_DEFS[FRAME_STYLES.RUNES] = {
  shape: "round",
  shadow: 0.5,
  height(t, s, k) {
    const base = (0.24 * smooth(0, 0.18, t)) - (0.26 * smooth(0.8, 1, t));
    return base - (0.07 * runeEngrave(t, s, k));
  },
  color(t, s, lam, sp, ang, k, out) {
    const m = 0.5 + (0.5 * (lam - 1)) + (0.3 * sp) + (0.2 * (fractalNoise(s / k.T * 1.5, t * 2.5) - 0.5));
    rampColor(RAMPS.rune, m, out);
    const engrave = runeEngrave(t, s, k);
    const distance = runeDistance(t, s, k);
    const glow = [Math.min(255, (k.accent[0] * 1.1) + 40), Math.min(255, (k.accent[1] * 1.1) + 40), Math.min(255, (k.accent[2] * 1.1) + 40)];
    mix(out, [k.accent[0] * 0.55, k.accent[1] * 0.55, k.accent[2] * 0.55], gauss(distance, 0.1) * 0.55);
    mix(out, glow, engrave);
    return 1;
  }
};

function plankHeight(t) {
  return (0.2 * smooth(0, 0.2, t)) - (0.2 * smooth(0.8, 1, t));
}

STYLE_DEFS[FRAME_STYLES.WOOD] = {
  shape: "round",
  shadow: 0.45,
  height(t, s, k) {
    const joint = jointDistance(s, k.perimeter, k.plankCount, k.T);
    return plankHeight(t) - (0.07 * gauss(joint, 0.03)) + nailHeight(t, s, k);
  },
  color(t, s, lam, sp, ang, k, out) {
    const u = s / k.T;
    const plank = hash2(cellIndex(s, k.perimeter, k.plankCount), 7);
    const grain = 0.5 + (0.5 * Math.sin(((t * 11) + (3.4 * valueNoise(u * 0.32, t * 2.6))) * Math.PI));
    const fine = valueNoise(u * 3.5, t * 38);
    const m = 0.3 + (0.32 * grain) + (0.38 * (lam - 1)) + (0.16 * (plank - 0.5)) + (0.1 * fine) + (0.35 * sp);
    rampColor(RAMPS.wood, m, out);
    const joint = jointDistance(s, k.perimeter, k.plankCount, k.T);
    mix(out, [24, 14, 7], gauss(joint, 0.035) * 0.8);
    paintStripe(t, lam, sp, k, out);
    const nail = nailMask(t, s, k);
    if ( nail > 0 ) {
      const iron = [0, 0, 0];
      rampColor(RAMPS.iron, 0.4 + (0.5 * (lam - 1)) + (0.7 * sp), iron);
      mix(out, iron, nail);
    }
    return 1;
  }
};

// Nails next to the joints of the planks
function nailOffsets(t, s, k) {
  const size = k.perimeter / k.plankCount;
  const scaled = (s / size) + 0.5;
  const fraction = scaled - Math.floor(scaled);
  // distance across the joint in T, at the two rows
  const across = (fraction - 0.5) * size / k.T;
  return {across, rowOne: t - 0.26, rowTwo: t - 0.74};
}

function nailHeight(t, s, k) {
  if ( !k.nails ) return 0;
  const {across, rowOne, rowTwo} = nailOffsets(t, s, k);
  const side = across < 0 ? 0.2 : -0.2;
  const a = dome(Math.hypot(across - side, rowOne), 0.1, 0.1);
  const b = dome(Math.hypot(across - side, rowTwo), 0.1, 0.1);
  return Math.max(a, b);
}

function nailMask(t, s, k) {
  if ( !k.nails ) return 0;
  const {across, rowOne, rowTwo} = nailOffsets(t, s, k);
  const side = across < 0 ? 0.2 : -0.2;
  const distance = Math.min(Math.hypot(across - side, rowOne), Math.hypot(across - side, rowTwo));
  return 1 - smooth(0.085, 0.1, distance);
}

// The stripe of the accent colour painted on the inside of wood and stone
function paintStripe(t, lam, sp, k, out) {
  const weight = smooth(0.83, 0.86, t) * (1 - smooth(0.93, 0.96, t));
  if ( weight <= 0 ) return;
  const paint = [0, 0, 0];
  paintColor(k.accent, lam, sp, paint, 0.4);
  mix(out, paint, weight);
}

STYLE_DEFS[FRAME_STYLES.STONE] = {
  shape: "round",
  shadow: 0.45,
  height(t, s, k) {
    const joint = jointDistance(s, k.perimeter, k.blockCount, k.T);
    const block = hash2(cellIndex(s, k.perimeter, k.blockCount), 3);
    const rough = 0.05 * fractalNoise(s / k.T * 2.2, t * 3.4);
    return plankHeight(t) + (0.04 * block) - (0.1 * smooth(0, 0.06, 0.06 - joint)) - (0.08 * gauss(joint, 0.04)) + rough;
  },
  color(t, s, lam, sp, ang, k, out) {
    const u = s / k.T;
    const block = hash2(cellIndex(s, k.perimeter, k.blockCount), 3);
    const m = 0.2 + (0.34 * fractalNoise(u * 1.4, (t * 2.6) + (block * 9))) + (0.4 * (lam - 1)) + (0.2 * (block - 0.5)) + (0.2 * sp) + 0.18;
    rampColor(RAMPS.stone, m, out);
    const joint = jointDistance(s, k.perimeter, k.blockCount, k.T);
    mix(out, [22, 22, 21], gauss(joint, 0.045) * 0.85);
    paintStripe(t, lam, sp, k, out);
    return 1;
  }
};

STYLE_DEFS[FRAME_STYLES.LAUREL] = {
  shape: "round",
  shadow: 0.3,
  // the gaps between the leaves are see-through, the picture ends at the inner edge
  clearBand: true,
  height(t, s, k) {
    const leaf = leafAt(t, s, k);
    const stem = dome(Math.abs(t - 0.5), 0.045, 0.06);
    if ( !leaf || leaf.e >= 1 ) return stem;
    const q = leaf.e;
    return Math.max(stem, (0.3 * Math.sqrt(1 - (q * q))) - (0.03 * gauss(leaf.crosswise, 0.06)));
  },
  color(t, s, lam, sp, ang, k, out) {
    const leaf = leafAt(t, s, k);
    const stemAmount = 1 - smooth(0.035, 0.05, Math.abs(t - 0.5));
    const cover = leaf ? clamp01((1 - leaf.e) * LEAF_HALF_WIDTH * k.T * 0.9 + 0.5) : 0;
    paintColor(k.accent, lam, sp, out, 0.45);
    if ( leaf ) {
      // the midrib is lighter
      const rib = 1 - smooth(0.04, 0.1, leaf.crosswise);
      mix(out, [255, 255, 255], rib * 0.28);
      // each leaf a little different
      const tone = 0.88 + (0.24 * hash2(leaf.index, 11));
      out[0] *= tone;
      out[1] *= tone;
      out[2] *= tone;
    }
    if ( cover < 1 && stemAmount > 0 && !leaf ) {
      out[0] *= 0.55;
      out[1] *= 0.55;
      out[2] *= 0.55;
    }
    return Math.max(cover, stemAmount);
  }
};

STYLE_DEFS[FRAME_STYLES.ORNATE_SQUARE] = {
  shape: "square",
  shadow: 0.5,
  height(t, s, k) {
    const gem = cornerGem(t, s, k);
    return metalProfile(t) + (dome(gem, 0.5, 0.1) * 0.6) + dome(gem, 0.36, 0.32);
  },
  color(t, s, lam, sp, ang, k, out) {
    metalColor(RAMPS.gold, t, lam, sp, ang, {accent: [0, 0, 0]}, out);
    if ( enamelWeight(t) > 0 ) rampColor(RAMPS.gold, 0.5 + (0.46 * (lam - 1)) + (0.55 * sp), out);
    const gem = cornerGem(t, s, k);
    if ( gem < 0.36 ) {
      const depth = 1 - (gem / 0.36);
      const bright = 0.5 + (0.5 * depth) + (0.2 * (lam - 1));
      const color = [
        Math.min(255, (k.accent[0] * bright) + (255 * sp * 0.9)),
        Math.min(255, (k.accent[1] * bright) + (255 * sp * 0.9)),
        Math.min(255, (k.accent[2] * bright) + (255 * sp * 0.9))
      ];
      mix(color, [255, 255, 255], gauss(gem - 0.06, 0.07) * 0.2);
      mix(out, color, 1 - smooth(0.33, 0.36, gem));
    }
    return 1;
  }
};

// Distance to the nearest corner gem, in T. The corners are at s = 0, width, width + height and 2 width + height; a
// gem sits half a thickness in from both edges (see frameGeometry for how s runs round a corner).
function cornerGem(t, s, k) {
  let best = 9;
  for ( const corner of k.corners ) {
    let offset = s - corner;
    if ( offset > k.perimeter / 2 ) offset -= k.perimeter;
    if ( offset < -k.perimeter / 2 ) offset += k.perimeter;
    const centre = offset < 0 ? -0.5 : 0.5;
    best = Math.min(best, Math.hypot((offset / k.T) - centre, t - 0.5));
  }
  return best;
}

// ------------------------------------------------------------------------------------------------ drawing

function frameShape(style) {
  return STYLE_DEFS[normalizeFrameStyle(style)]?.shape ?? "round";
}

// What is the same for the whole picture
function frameContext(def, width, height, T, accent) {
  const radius = Math.min(width, height) / 2;
  const middle = Math.max(1, radius - (T / 2));
  const perimeter = def.shape === "round" ? TAU * middle : 2 * (width + height);
  return {
    T,
    accent,
    perimeter,
    middle,
    studCount: Math.max(10, Math.round(perimeter / (T * 0.95))),
    runeCount: Math.max(8, Math.min(48, Math.round(perimeter / (T * 1.35)))),
    plankCount: Math.max(6, Math.round(perimeter / (T * 5))),
    blockCount: Math.max(6, Math.round(perimeter / (T * 3.6))),
    nails: T >= 6,
    corners: [0, width, width + height, (2 * width) + height]
  };
}

// Paints the ring into the picture in place. Round frames also make everything outside the circle transparent.
// `thickness` is in pixels, `accent` an [r, g, b] list.
function drawFrame(data, width, height, style, thickness, accent) {
  const def = STYLE_DEFS[normalizeFrameStyle(style)];
  if ( !def ) return false;
  const T = Math.max(1, thickness);
  const k = frameContext(def, width, height, T, accent);
  const geo = {};
  const rgb = [0, 0, 0];
  const shadowReach = T * 0.7;
  const useHeight = Boolean(def.height);
  for ( let y = 0; y < height; y += 1 ) {
    for ( let x = 0; x < width; x += 1 ) {
      frameGeometry(def.shape, x, y, width, height, T, geo);
      const edge = geo.edge;
      const offset = ((y * width) + x) * 4;
      const shape = clamp01(edge + 0.5);
      if ( shape <= 0 ) {
        data[offset + 3] = 0;
        continue;
      }
      const ring = clamp01(T - edge + 0.5);
      const imageAlpha = (data[offset + 3] / 255) * shape * (def.clearBand ? 1 - ring : 1);
      // the picture next to the inner edge sits in the shadow of the ring
      let shade = 1;
      if ( def.shadow && (ring < 1) && (edge < T + shadowReach) ) {
        const falloff = 1 - clamp01((edge - T) / shadowReach);
        shade = 1 - (def.shadow * falloff * falloff);
      }
      let ringAlpha = 0;
      if ( ring > 0 ) {
        if ( def.flat ) {
          rgb[0] = accent[0];
          rgb[1] = accent[1];
          rgb[2] = accent[2];
          ringAlpha = ring;
        } else {
          const t = clamp01(edge / T);
          let lam = 1;
          let sp = 0;
          if ( useHeight ) {
            const s = geo.s;
            const out = -(def.height(t + GRADIENT_STEP, s, k) - def.height(t - GRADIENT_STEP, s, k)) / (2 * GRADIENT_STEP);
            const along = (def.height(t, s + (GRADIENT_STEP * T), k) - def.height(t, s - (GRADIENT_STEP * T), k)) / (2 * GRADIENT_STEP);
            const gx = (out * geo.nx) - (along * geo.ny);
            const gy = (out * geo.ny) + (along * geo.nx);
            const nx = -gx * SLOPE_STRENGTH;
            const ny = -gy * SLOPE_STRENGTH;
            const length = Math.sqrt((nx * nx) + (ny * ny) + 1);
            const dotLight = ((nx * LIGHT[0]) + (ny * LIGHT[1]) + LIGHT[2]) / length;
            lam = Math.max(0, dotLight) / LIGHT[2];
            const dotHalf = ((nx * HALF_VECTOR[0]) + (ny * HALF_VECTOR[1]) + HALF_VECTOR[2]) / length;
            sp = dotHalf > 0 ? dotHalf ** 48 : 0;
          }
          const opacity = def.color(t, geo.s, lam, sp, geo.ang, k, rgb);
          ringAlpha = ring * opacity;
        }
      }
      const weight = imageAlpha * (1 - ringAlpha);
      const alpha = ringAlpha + weight;
      if ( alpha <= 0 ) {
        data[offset + 3] = 0;
        continue;
      }
      for ( let channel = 0; channel < 3; channel += 1 ) {
        const ringValue = Math.max(0, Math.min(255, rgb[channel]));
        data[offset + channel] = Math.round(((ringValue * ringAlpha) + (data[offset + channel] * shade * weight)) / alpha);
      }
      data[offset + 3] = Math.round(alpha * 255);
    }
  }
  return true;
}

export {
  FRAME_STYLES,
  FRAME_STYLE_LIST,
  LEGACY_FRAME_STYLES,
  normalizeFrameStyle,
  frameShape,
  frameGeometry,
  repeatCell,
  hash2,
  valueNoise,
  distanceToSegment,
  drawFrame
};
