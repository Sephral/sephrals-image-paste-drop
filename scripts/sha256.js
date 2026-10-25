// SHA-256 for pages without crypto.subtle. Browsers only offer it in secure contexts (HTTPS, localhost), Foundry served
// over plain HTTP from another address has none. The digest is the same, so a file gets the same name on every client.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);
const INITIAL = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

// One 64 byte block
function compress(hash, w, bytes, offset) {
  for ( let i = 0; i < 16; i++ ) {
    const j = offset + (i * 4);
    w[i] = (bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3];
  }
  for ( let i = 16; i < 64; i++ ) {
    const x = w[i - 15];
    const y = w[i - 2];
    const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
    const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
    w[i] = w[i - 16] + s0 + w[i - 7] + s1;
  }
  let a = hash[0];
  let b = hash[1];
  let c = hash[2];
  let d = hash[3];
  let e = hash[4];
  let f = hash[5];
  let g = hash[6];
  let h = hash[7];
  for ( let i = 0; i < 64; i++ ) {
    const sum1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const t1 = (h + sum1 + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
    const sum0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const t2 = (sum0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
    h = g;
    g = f;
    f = e;
    e = (d + t1) | 0;
    d = c;
    c = b;
    b = a;
    a = (t1 + t2) | 0;
  }
  hash[0] += a;
  hash[1] += b;
  hash[2] += c;
  hash[3] += d;
  hash[4] += e;
  hash[5] += f;
  hash[6] += g;
  hash[7] += h;
}

// Hex digest of an ArrayBuffer or byte array
function sha256Hex(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const hash = Uint32Array.from(INITIAL);
  const w = new Uint32Array(64);
  const full = bytes.length - (bytes.length % 64);
  for ( let offset = 0; offset < full; offset += 64 ) compress(hash, w, bytes, offset);

  // The last bytes, a 1 bit, zeros and the length in bits fill one or two more blocks
  const rest = bytes.length - full;
  const tail = new Uint8Array(rest < 56 ? 64 : 128);
  tail.set(bytes.subarray(full));
  tail[rest] = 0x80;
  const bits = bytes.length * 8;
  const view = new DataView(tail.buffer);
  view.setUint32(tail.length - 8, Math.floor(bits / 0x100000000));
  view.setUint32(tail.length - 4, bits >>> 0);
  for ( let offset = 0; offset < tail.length; offset += 64 ) compress(hash, w, tail, offset);

  return Array.from(hash, word => word.toString(16).padStart(8, "0")).join("");
}

export {sha256Hex};
