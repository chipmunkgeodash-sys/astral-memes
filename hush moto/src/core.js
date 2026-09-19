// core.js — math helpers, deterministic noise, spatial hashing, small utilities.

export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => t * t * (3 - 2 * t);
export const sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);

/** Frame-rate independent exponential smoothing. rate = how fast (per second). */
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

/** Move `a` toward `b` by at most `maxDelta`. */
export function approach(a, b, maxDelta) {
  const d = b - a;
  if (Math.abs(d) <= maxDelta) return b;
  return a + Math.sign(d) * maxDelta;
}

/** Shortest signed angular difference b - a, wrapped to [-PI, PI]. */
export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function wrapAngle(a) {
  a = a % TAU;
  if (a > Math.PI) a -= TAU;
  if (a < -Math.PI) a += TAU;
  return a;
}

/** Mulberry32 — small, fast, deterministic PRNG. */
export function makeRng(seed = 1337) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Value noise (2D), tileable-ish, cheap. Used for terrain and dirt variation.
// ---------------------------------------------------------------------------
function hash2(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function valueNoise2(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = smoothstep(fx), uy = smoothstep(fy);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}

export function fbm2(x, y, octaves = 4, seed = 0, lacunarity = 2.0, gain = 0.5) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2(x * freq, y * freq, seed + i * 17);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

// ---------------------------------------------------------------------------
// 2D spatial hash for broad-phase queries over static or dynamic items.
// ---------------------------------------------------------------------------
export class SpatialHash {
  constructor(cellSize = 24) {
    this.cell = cellSize;
    this.map = new Map();
  }
  _key(cx, cz) {
    return cx * 73856093 ^ cz * 19349663;
  }
  clear() {
    this.map.clear();
  }
  insertAABB(minX, minZ, maxX, maxZ, item) {
    const c = this.cell;
    const x0 = Math.floor(minX / c), x1 = Math.floor(maxX / c);
    const z0 = Math.floor(minZ / c), z1 = Math.floor(maxZ / c);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const k = this._key(cx, cz);
        let arr = this.map.get(k);
        if (!arr) this.map.set(k, (arr = []));
        arr.push(item);
      }
    }
  }
  /** Collect unique items whose cells overlap the query box into `out`. */
  query(minX, minZ, maxX, maxZ, out, stamp) {
    const c = this.cell;
    const x0 = Math.floor(minX / c), x1 = Math.floor(maxX / c);
    const z0 = Math.floor(minZ / c), z1 = Math.floor(maxZ / c);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const arr = this.map.get(this._key(cx, cz));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const it = arr[i];
          if (it._stamp === stamp) continue;
          it._stamp = stamp;
          out.push(it);
        }
      }
    }
    return out;
  }
  queryPoint(x, z, out, stamp) {
    return this.query(x, z, x, z, out, stamp);
  }
}

/** Rotate (x,z) by -yaw into local space of an object facing `yaw`. */
export function worldToLocalXZ(dx, dz, yaw, out) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  out.x = dx * c - dz * s;
  out.z = dx * s + dz * c;
  return out;
}

/** Closest point on segment AB to P, in XZ. Returns t in [0,1]. */
export function closestTOnSegment(ax, az, bx, bz, px, pz) {
  const abx = bx - ax, abz = bz - az;
  const len2 = abx * abx + abz * abz;
  if (len2 < 1e-9) return 0;
  return clamp(((px - ax) * abx + (pz - az) * abz) / len2, 0, 1);
}

/** Simple moving-average smoother for jitter-free readouts. */
export class Smoother {
  constructor(size = 8) {
    this.buf = new Float32Array(size);
    this.i = 0;
    this.n = 0;
  }
  push(v) {
    this.buf[this.i] = v;
    this.i = (this.i + 1) % this.buf.length;
    if (this.n < this.buf.length) this.n++;
    return this.value;
  }
  get value() {
    let s = 0;
    for (let i = 0; i < this.n; i++) s += this.buf[i];
    return this.n ? s / this.n : 0;
  }
}

export const KMH = 3.6;

// ---------------------------------------------------------------------------
// Safe persistence — localStorage can throw on file:// origins / private mode.
// ---------------------------------------------------------------------------
let _memStore = null;
function store() {
  if (_memStore) return _memStore;
  try {
    const k = '__hm_probe__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    _memStore = window.localStorage;
  } catch {
    const m = new Map();
    _memStore = {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k),
    };
  }
  return _memStore;
}

export const storage = {
  get(key, fallback = null) {
    try { const v = store().getItem(key); return v === null ? fallback : v; }
    catch { return fallback; }
  },
  set(key, value) { try { store().setItem(key, String(value)); } catch { /* ignore */ } },
  num(key, fallback) { const v = Number(this.get(key, NaN)); return Number.isFinite(v) ? v : fallback; },
  bool(key, fallback) { const v = this.get(key, null); return v === null ? fallback : v === '1'; },
};
