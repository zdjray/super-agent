/* 方块世界 2D — 确定性随机与噪声 */
(function () {
  'use strict';

  const MC2D = (window.MC2D = window.MC2D || {});

  /** Fast seeded PRNG. Returns floats in [0, 1). */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class RNG {
    constructor(seed) {
      this.seed = seed >>> 0;
      this._next = mulberry32(this.seed);
    }
    next() { return this._next(); }
    int(n) { return Math.floor(this._next() * n); }
    range(min, max) { return min + this._next() * (max - min); }
    pick(list) { return list[Math.floor(this._next() * list.length)]; }
    chance(p) { return this._next() < p; }
    fork() { return new RNG((this._next() * 0xffffffff) >>> 0); }
  }

  /** Deterministic hash of a grid position, in [0, 1). */
  function hash2(x, y, seed) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function smoothstep(t) { return t * t * (3 - 2 * t); }

  function valueNoise1(x, seed) {
    const x0 = Math.floor(x);
    const fx = smoothstep(x - x0);
    const a = hash2(x0, 0, seed);
    const b = hash2(x0 + 1, 0, seed);
    return a + (b - a) * fx;
  }

  function valueNoise2(x, y, seed) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smoothstep(x - x0);
    const fy = smoothstep(y - y0);
    const a = hash2(x0, y0, seed);
    const b = hash2(x0 + 1, y0, seed);
    const c = hash2(x0, y0 + 1, seed);
    const d = hash2(x0 + 1, y0 + 1, seed);
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  }

  function fbm1(x, seed, octaves = 4, lacunarity = 2, gain = 0.5) {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += valueNoise1(x * freq, seed + i * 1013) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  function fbm2(x, y, seed, octaves = 4, lacunarity = 2, gain = 0.5) {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += valueNoise2(x * freq, y * freq, seed + i * 1013) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function smoothRange(edge0, edge1, v) {
    const t = clamp((v - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  }

  MC2D.RNG = RNG;
  MC2D.noise = { hash2, valueNoise1, valueNoise2, fbm1, fbm2 };
  MC2D.math = { clamp, lerp, smoothRange, smoothstep };
})();
