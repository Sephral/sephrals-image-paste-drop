// Synthetic battle maps for the grid detection tests: terrain with noise, rooms and round things, an optional printed grid.

const SQRT3 = Math.sqrt(3);

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth value noise, a few octaves
function noiseField(width, height, rand, {base=48, octaves=4}={}) {
  const field = new Float32Array(width * height);
  let amplitude = 1;
  let total = 0;
  for ( let o = 0; o < octaves; o++ ) {
    const cell = Math.max(2, base / (2 ** o));
    const gw = Math.ceil(width / cell) + 2;
    const gh = Math.ceil(height / cell) + 2;
    const grid = Float32Array.from({length: gw * gh}, () => rand());
    for ( let y = 0; y < height; y++ ) {
      const gy = y / cell;
      const y0 = Math.floor(gy);
      const fy = gy - y0;
      const sy = fy * fy * (3 - (2 * fy));
      for ( let x = 0; x < width; x++ ) {
        const gx = x / cell;
        const x0 = Math.floor(gx);
        const fx = gx - x0;
        const sx = fx * fx * (3 - (2 * fx));
        const a = grid[(y0 * gw) + x0];
        const b = grid[(y0 * gw) + x0 + 1];
        const c = grid[((y0 + 1) * gw) + x0];
        const d = grid[((y0 + 1) * gw) + x0 + 1];
        field[(y * width) + x] += amplitude * ((a + ((b - a) * sx)) + ((((c + ((d - c) * sx))) - (a + ((b - a) * sx))) * sy));
      }
    }
    total += amplitude;
    amplitude *= 0.5;
  }
  for ( let i = 0; i < field.length; i++ ) field[i] = (field[i] / total) * 255;
  return field;
}

// Terrain as a gray image: noise, walls of rooms, round trees and rocks. No grid.
function terrain(width, height, {seed=1, rooms=6, round=40, grain=0.08, flatTone=false}={}) {
  const rand = random(seed);
  const gray = flatTone ? new Float32Array(width * height).fill(120) : noiseField(width, height, rand);
  for ( let i = 0; i < gray.length; i++ ) gray[i] = (gray[i] * 0.45) + 70 + ((rand() - 0.5) * 255 * grain);
  for ( let r = 0; r < rooms; r++ ) {
    const w = 120 + (rand() * width * 0.25);
    const h = 100 + (rand() * height * 0.25);
    const x0 = rand() * (width - w);
    const y0 = rand() * (height - h);
    const wall = 5 + (rand() * 8);
    const shade = 30 + (rand() * 40);
    for ( let y = Math.floor(y0); y < y0 + h; y++ ) {
      for ( let x = Math.floor(x0); x < x0 + w; x++ ) {
        const edge = Math.min(x - x0, x0 + w - x, y - y0, y0 + h - y);
        if ( edge < wall ) gray[(y * width) + x] = shade;
        else gray[(y * width) + x] += 22;
      }
    }
  }
  for ( let r = 0; r < round; r++ ) {
    const cx = rand() * width;
    const cy = rand() * height;
    const radius = 8 + (rand() * 30);
    const shade = 20 + (rand() * 200);
    for ( let y = Math.max(0, Math.floor(cy - radius)); y < Math.min(height, cy + radius); y++ ) {
      for ( let x = Math.max(0, Math.floor(cx - radius)); x < Math.min(width, cx + radius); x++ ) {
        if ( Math.hypot(x - cx, y - cy) < radius ) gray[(y * width) + x] = shade + ((x + y) % 7);
      }
    }
  }
  return {data: gray, width, height};
}

// Distance of a point to the nearest hexagon outline (lines with this half width get drawn)
function hexEdgeDistance(kind, size, x, y) {
  const apothem = size / 2;
  // Nearest center by testing the lattice cell neighbors
  let best = Infinity;
  const base = kind === "hexPointy"
    ? {ax: size, ay: 0, bx: size / 2, by: size * SQRT3 / 2}
    : {ax: size * SQRT3 / 2, ay: size / 2, bx: 0, by: size};
  const det = (base.ax * base.by) - (base.ay * base.bx);
  const u0 = Math.floor(((x * base.by) - (y * base.bx)) / det);
  const v0 = Math.floor(((base.ax * y) - (base.ay * x)) / det);
  const normals = kind === "hexPointy"
    ? [[1, 0], [0.5, SQRT3 / 2], [-0.5, SQRT3 / 2]]
    : [[0, 1], [SQRT3 / 2, 0.5], [SQRT3 / 2, -0.5]];
  for ( let du = -1; du <= 2; du++ ) {
    for ( let dv = -1; dv <= 2; dv++ ) {
      const cx = ((u0 + du) * base.ax) + ((v0 + dv) * base.bx);
      const cy = ((u0 + du) * base.ay) + ((v0 + dv) * base.by);
      const px = x - cx;
      const py = y - cy;
      let far = 0;
      for ( const [nx, ny] of normals ) far = Math.max(far, Math.abs((px * nx) + (py * ny)));
      if ( far <= apothem * 1.0001 ) best = Math.min(best, apothem - far);
    }
  }
  return best;
}

// Prints a grid into a gray image. `x` and `y` are a corner of a square or the center of a hexagon.
function printGrid(map, {kind="square", size=50, x=0, y=0, lineWidth=2, alpha=0.4, tone=0, margin=0}={}) {
  const {data, width, height} = map;
  for ( let py = margin; py < height - margin; py++ ) {
    for ( let px = margin; px < width - margin; px++ ) {
      let distance;
      if ( kind === "square" ) {
        const dx = (((px - x) % size) + size) % size;
        const dy = (((py - y) % size) + size) % size;
        distance = Math.min(dx, size - dx, dy, size - dy);
      } else {
        distance = hexEdgeDistance(kind, size, px - x, py - y);
      }
      if ( distance < lineWidth / 2 ) {
        const i = (py * width) + px;
        data[i] = (data[i] * (1 - alpha)) + (tone * alpha);
      } else if ( distance < (lineWidth / 2) + 1 ) {
        const i = (py * width) + px;
        const fraction = ((lineWidth / 2) + 1 - distance);
        data[i] = (data[i] * (1 - (alpha * fraction))) + (tone * alpha * fraction);
      }
    }
  }
  return map;
}

export {random, terrain, printGrid, noiseField, hexEdgeDistance};
