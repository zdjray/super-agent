/* 方块世界 2D — 世界生成、方块存取与天光 */
(function () {
  'use strict';

  const MC2D = window.MC2D;
  const BLOCKS = MC2D.BLOCKS;
  const { fbm1, fbm2, hash2 } = MC2D.noise;

  const COLS = 640;
  const ROWS = 120;
  const SEA_LEVEL = 58;
  const BEDROCK_TOP = ROWS - 2;
  const BIOMES = {
    plains: { id: 0, name: '平原', treeChance: 0.028, decorChance: 0.2 },
    forest: { id: 1, name: '森林', treeChance: 0.13, decorChance: 0.16 },
    desert: { id: 2, name: '沙漠', treeChance: 0.045, decorChance: 0.12 },
    snow: { id: 3, name: '雪原', treeChance: 0.06, decorChance: 0.1 }
  };

  class World {
    constructor(seed) {
      this.seed = seed >>> 0;
      this.cols = COLS;
      this.rows = ROWS;
      this.seaLevel = SEA_LEVEL;
      this.tiles = new Uint8Array(COLS * ROWS);
      this.sky = new Uint8Array(COLS * ROWS);
      this.heights = new Int16Array(COLS);
      this.biomes = new Uint16Array(COLS);
      this.edits = new Map();
      this.generate();
    }

    idx(x, y) { return y * COLS + x; }

    inBounds(x, y) { return x >= 0 && x < COLS && y >= 0 && y < ROWS; }

    get(x, y) {
      if (y < 0) return 0;
      if (x < 0 || x >= COLS || y >= ROWS) return 9;
      return this.tiles[y * COLS + x];
    }

    set(x, y, id, record = true) {
      if (!this.inBounds(x, y)) return false;
      this.tiles[y * COLS + x] = id;
      if (record) this.edits.set(x + ',' + y, id);
      this.skyDirty = true;
      return true;
    }

    isSolid(x, y) {
      if (x < 0 || x >= COLS || y >= ROWS) return true;
      if (y < 0) return false;
      return BLOCKS[this.tiles[y * COLS + x]].solid;
    }

    isWater(x, y) {
      return this.get(x, y) === 8;
    }

    isOpaque(x, y) {
      if (!this.inBounds(x, y)) return y >= ROWS;
      return BLOCKS[this.tiles[y * COLS + x]].opaque;
    }

    /** 0 = clear sky, 15 = full daylight. */
    skyLightAt(x, y) {
      if (!this.inBounds(x, y)) return y < 0 ? 15 : 0;
      return this.sky[y * COLS + x];
    }

    heightAt(x) {
      if (x < 0 || x >= COLS) return ROWS - 4;
      return this.heights[x];
    }

    biomeAt(x) {
      if (x < 0 || x >= COLS) return BIOMES.plains;
      return BIOMES[this.biomeKey(x)];
    }

    /* ---------------- generation ---------------- */

    generate() {
      const seed = this.seed;
      const sHeight = seed ^ 0x1b873593;
      const sDetail = seed ^ 0xcc9e2d51;
      const sTemp = seed ^ 0x85ebca6b;
      const sMoist = seed ^ 0xc2b2ae35;
      const sCave = seed ^ 0x27d4eb2f;
      const sTunnel = seed ^ 0x165667b1;
      const rng = new MC2D.RNG(seed ^ 0x9e3779b9);

      // 1. 地表高度与生物群系
      for (let x = 0; x < COLS; x++) {
        const warp = fbm1(x * 0.0024 + 11.3, seed ^ 0x7f4a7c15, 3);
        const cont = fbm1(x * 0.0075 + 3.1 + warp * 4, sHeight, 5);
        const detail = fbm1(x * 0.058, sDetail, 3);
        let h = Math.floor(43 + cont * 21 + detail * 3.2);

        const temp = fbm1(x * 0.0042 + 50, sTemp, 4);
        const moist = fbm1(x * 0.0058 + 200, sMoist, 3);
        let biome;
        if (temp < 0.3) biome = 'snow';
        else if (temp > 0.64 && moist < 0.46) biome = 'desert';
        else if (moist > 0.54) biome = 'forest';
        else biome = 'plains';
        if (biome === 'snow') h -= 4;
        if (biome === 'desert') h += 2;

        this.heights[x] = h;
        this.biomes[x] = BIOMES[biome].id;
      }

      // 2. 地形填充
      for (let x = 0; x < COLS; x++) {
        const h = this.heights[x];
        const biome = this.biomeKey(x);
        const beach = h >= SEA_LEVEL - 2;
        const surface = beach ? 7 : biome === 'desert' ? 7 : biome === 'snow' ? 18 : 1;

        for (let y = 0; y < h; y++) this.tiles[y * COLS + x] = 0;

        if (h >= 0 && h < ROWS) this.tiles[h * COLS + x] = surface;

        const dirtDepth = 3 + (hash2(x, 3, seed) > 0.6 ? 2 : 0);
        for (let d = 1; d <= dirtDepth && h + d < ROWS; d++) {
          let id;
          if (beach || biome === 'desert') id = d <= 2 ? 7 : 25;
          else id = 2;
          this.tiles[(h + d) * COLS + x] = id;
        }

        for (let y = h + dirtDepth + 1; y < BEDROCK_TOP; y++) {
          this.tiles[y * COLS + x] = 3;
        }

        // 海/湖
        for (let y = SEA_LEVEL; y < h && y < ROWS; y++) {
          if (this.tiles[y * COLS + x] === 0) this.tiles[y * COLS + x] = 8;
        }
      }

      // 3. 洞穴
      for (let x = 0; x < COLS; x++) {
        const h = this.heights[x];
        for (let y = h + 5; y < BEDROCK_TOP; y++) {
          const i = y * COLS + x;
          if (this.tiles[i] !== 3 && this.tiles[i] !== 25) continue;
          const cave = fbm2(x * 0.032, y * 0.042, sCave, 4);
          if (cave > 0.635) {
            this.tiles[i] = 0;
            continue;
          }
          const tunnel = Math.abs(fbm2(x * 0.018 + 7, y * 0.05, sTunnel, 3) - 0.5);
          if (tunnel < 0.026) this.tiles[i] = 0;
        }
      }

      // 4. 矿脉
      this.placeVeins(rng, 10, 330, 3, 8, 5, 55);
      this.placeVeins(rng, 11, 260, 2, 6, 14, 72);
      this.placeVeins(rng, 12, 110, 2, 5, 30, 86);
      this.placeVeins(rng, 13, 60, 2, 4, 46, 96);
      this.placeVeins(rng, 23, 34, 2, 5, 40, 90);

      // 5. 基岩
      for (let x = 0; x < COLS; x++) {
        this.tiles[(ROWS - 1) * COLS + x] = 9;
        this.tiles[(ROWS - 2) * COLS + x] = 9;
        if (hash2(x, 9, seed) > 0.35) this.tiles[(ROWS - 3) * COLS + x] = 9;
      }

      // 6. 树木与装饰
      this.plantFlora(rng);

      this.computeSky();
    }

    biomeKey(x) {
      const id = this.biomes[x];
      return id === 0 ? 'plains' : id === 1 ? 'forest' : id === 2 ? 'desert' : 'snow';
    }

    placeVeins(rng, blockId, attempts, minSize, maxSize, minDepth, maxDepth) {
      for (let i = 0; i < attempts; i++) {
        const x = rng.int(COLS);
        const h = this.heights[x];
        const y = h + minDepth + rng.int(Math.max(1, maxDepth - minDepth));
        if (y < 3 || y >= BEDROCK_TOP) continue;
        let cx = x;
        let cy = y;
        const size = minSize + rng.int(maxSize - minSize + 1);
        for (let s = 0; s < size; s++) {
          if (this.inBounds(cx, cy) && this.tiles[cy * COLS + cx] === 3) {
            this.tiles[cy * COLS + cx] = blockId;
          }
          const dir = rng.int(4);
          if (dir === 0) cx++;
          else if (dir === 1) cx--;
          else if (dir === 2) cy++;
          else cy--;
          cx = Math.max(1, Math.min(COLS - 2, cx));
          cy = Math.max(1, Math.min(BEDROCK_TOP - 1, cy));
        }
      }
    }

    plantFlora(rng) {
      const seed = this.seed;
      let lastTree = -99;
      for (let x = 3; x < COLS - 4; x++) {
        const h = this.heights[x];
        if (h < 1 || h >= SEA_LEVEL - 1 || h >= BEDROCK_TOP - 12) continue;
        const biome = this.biomeKey(x);
        const surface = this.tiles[h * COLS + x];
        if (surface !== 1 && surface !== 7 && surface !== 18) continue;
        if (this.tiles[(h - 1) * COLS + x] !== 0) continue;

        const chance = hash2(x, 21, seed);
        if (biome === 'desert') {
          if (chance < BIOMES.desert.treeChance && x - lastTree > 5) {
            this.plantCactus(x, h, rng);
            lastTree = x;
          }
        } else if (surface === 1 || surface === 18) {
          const density = BIOMES[biome].treeChance;
          if (chance < density && x - lastTree > 4) {
            this.plantTree(x, h, biome, rng);
            lastTree = x;
          }
        }

        // 地面小装饰
        if (this.tiles[(h - 1) * COLS + x] === 0 && hash2(x, 33, seed) < BIOMES[biome].decorChance) {
          const r = hash2(x, 44, seed);
          if (biome === 'desert') {
            this.tiles[(h - 1) * COLS + x] = r < 0.5 ? 22 : 19;
          } else if (biome === 'snow') {
            if (r < 0.5) this.tiles[(h - 1) * COLS + x] = 22;
          } else if (r < 0.12) {
            this.tiles[(h - 1) * COLS + x] = 21;
          } else if (r < 0.62) {
            this.tiles[(h - 1) * COLS + x] = 20;
          }
        }
      }
    }

    plantTree(x, h, biome, rng) {
      const snowy = biome === 'snow';
      const height = snowy ? 6 + rng.int(3) : 4 + rng.int(3);
      const topY = h - height;
      if (topY < 3) return;

      for (let y = h - 1; y >= topY; y--) {
        if (this.inBounds(x, y)) this.tiles[y * COLS + x] = 5;
      }

      const layers = snowy
        ? [{ dy: -3, r: 1 }, { dy: -2, r: 1 }, { dy: -1, r: 2 }, { dy: 0, r: 1 }, { dy: 1, r: 1 }]
        : [{ dy: -3, r: 1 }, { dy: -2, r: 2 }, { dy: -1, r: 2 }, { dy: 0, r: 2 }, { dy: 1, r: 1 }];
      for (const layer of layers) {
        for (let dx = -layer.r; dx <= layer.r; dx++) {
          const corner = Math.abs(dx) === layer.r && (layer.dy <= -3 || layer.dy >= 1);
          if (corner) continue;
          const lx = x + dx;
          const ly = topY + layer.dy;
          if (!this.inBounds(lx, ly)) continue;
          const current = this.tiles[ly * COLS + lx];
          if (current === 0) this.tiles[ly * COLS + lx] = 6;
        }
      }
    }

    plantCactus(x, h, rng) {
      const height = 1 + rng.int(3);
      for (let y = h - 1; y >= h - height; y--) {
        if (y >= 0 && this.tiles[y * COLS + x] === 0) this.tiles[y * COLS + x] = 19;
      }
    }

    /* ---------------- lighting ---------------- */

    computeSky() {
      const sky = this.sky;
      sky.fill(0);
      const queue = [];
      for (let x = 0; x < COLS; x++) {
        let level = 15;
        for (let y = 0; y < ROWS; y++) {
          const i = y * COLS + x;
          const def = BLOCKS[this.tiles[i]];
          if (def.opaque) {
            level = 0;
          } else {
            if (def.skyAtten) level = Math.max(0, level - def.skyAtten);
            sky[i] = level;
            if (level > 1) queue.push(i);
          }
        }
      }

      // 横向扩散，让洞口和屋檐下有渐变的天光
      let head = 0;
      while (head < queue.length) {
        const i = queue[head++];
        const level = sky[i];
        if (level <= 1) continue;
        const x = i % COLS;
        const y = (i / COLS) | 0;
        if (x > 0) this.spreadSky(i - 1, level - 1, queue);
        if (x < COLS - 1) this.spreadSky(i + 1, level - 1, queue);
        if (y > 0) this.spreadSky(i - COLS, level - 1, queue);
        if (y < ROWS - 1) this.spreadSky(i + COLS, level - 1, queue);
      }
      this.skyDirty = false;
    }

    spreadSky(i, level, queue) {
      const def = BLOCKS[this.tiles[i]];
      if (def.opaque) {
        if (level > this.sky[i]) this.sky[i] = level;
        return;
      }
      if (def.skyAtten) level = Math.max(0, level - def.skyAtten);
      if (level > this.sky[i]) {
        this.sky[i] = level;
        if (level > 1) queue.push(i);
      }
    }

    /** 局部方块光源，返回以 (ox, oy) 起、w×h 的灯光明暗图。 */
    computeBlockLight(ox, oy, w, h) {
      const light = new Uint8Array(w * h);
      const queue = [];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const wx = ox + x;
          const wy = oy + y;
          if (!this.inBounds(wx, wy)) continue;
          const def = BLOCKS[this.tiles[wy * COLS + wx]];
          if (def.light) {
            const i = y * w + x;
            light[i] = def.light;
            queue.push(i);
          }
        }
      }
      let head = 0;
      while (head < queue.length) {
        const i = queue[head++];
        const level = light[i];
        if (level <= 1) continue;
        const x = i % w;
        const y = (i / w) | 0;
        const neighbors = [
          x > 0 ? i - 1 : -1,
          x < w - 1 ? i + 1 : -1,
          y > 0 ? i - w : -1,
          y < h - 1 ? i + w : -1
        ];
        for (const ni of neighbors) {
          if (ni < 0) continue;
          const def = BLOCKS[this.get(ox + (ni % w), oy + ((ni / w) | 0))];
          const drop = def.opaque ? 2 : 1;
          const next = level - drop;
          if (next > light[ni]) {
            light[ni] = next;
            if (next > 1) queue.push(ni);
          }
        }
      }
      return light;
    }

    /* ---------------- player helpers ---------------- */

    findSpawn() {
      const start = Math.floor(COLS * 0.32);
      let fallback = null;
      let grassSpot = null;
      for (let radius = 0; radius < 280; radius++) {
        for (const dir of [1, -1]) {
          const x = start + radius * dir;
          if (x < 4 || x >= COLS - 4) continue;
          const h = this.heights[x];
          if (h >= SEA_LEVEL - 2 || h >= BEDROCK_TOP - 10) continue;
          const surface = this.tiles[h * COLS + x];
          if (surface !== 1 && surface !== 18 && surface !== 7) continue;
          if (this.tiles[(h - 1) * COLS + x] !== 0 || this.tiles[(h - 2) * COLS + x] !== 0) continue;
          const spot = { x: x + 0.15, y: h - 1.9 };
          if (!fallback) fallback = spot;
          if (surface === 1 && !grassSpot) grassSpot = spot;
          // 让开场画面里就有一棵树，避免对着空草地发呆
          if (surface === 1 && this.hasTreeNear(x, h)) return spot;
        }
      }
      return grassSpot || fallback || { x: COLS / 2, y: 20 };
    }

    hasTreeNear(x, h) {
      for (let dx = -7; dx <= 7; dx++) {
        const tx = x + dx;
        if (tx < 1 || tx >= COLS - 1) continue;
        const surface = this.heights[tx];
        for (let dy = 1; dy <= 5; dy++) {
          if (this.tiles[(surface - dy) * COLS + tx] === 5) return true;
        }
      }
      return false;
    }

    /* ---------------- save ---------------- */

    exportEdits() {
      const out = [];
      for (const [key, id] of this.edits) out.push([key, id]);
      return out;
    }

    applyEdits(list) {
      if (!Array.isArray(list)) return;
      for (const entry of list) {
        if (!Array.isArray(entry) || entry.length !== 2) continue;
        const [key, id] = entry;
        const [xs, ys] = String(key).split(',');
        const x = parseInt(xs, 10);
        const y = parseInt(ys, 10);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        if (!this.inBounds(x, y)) continue;
        if (!BLOCKS[id]) continue;
        this.tiles[y * COLS + x] = id;
        this.edits.set(key, id);
      }
      this.computeSky();
    }
  }

  MC2D.World = World;
  MC2D.WORLD_CONST = { COLS, ROWS, SEA_LEVEL, BIOMES };
})();
