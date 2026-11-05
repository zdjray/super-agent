/* 方块世界 2D — 方块定义与程序化像素贴图 */
(function () {
  'use strict';

  const MC2D = window.MC2D;
  const SIZE = 16;

  /* ---------- 贴图绘制小工具 ---------- */

  function makeCanvas() {
    const c = document.createElement('canvas');
    c.width = SIZE;
    c.height = SIZE;
    return c;
  }

  function px(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }

  function fill(ctx, color) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, SIZE, SIZE);
  }

  function speckle(ctx, rng, colors, count, maxSize) {
    const max = maxSize || 2;
    for (let i = 0; i < count; i++) {
      const s = 1 + rng.int(max);
      px(ctx, rng.int(SIZE), rng.int(SIZE), s, s, rng.pick(colors));
    }
  }

  function shadeLine(ctx, x, y, w, color) {
    px(ctx, x, y, w, 1, color);
  }

  /* ---------- 各类方块贴图 ---------- */

  function paintGrass(ctx, rng) {
    fill(ctx, '#795635');
    speckle(ctx, rng, ['#6b4a2c', '#825d3a', '#5f4026', '#8d6742', '#55381f'], 90, 2);

    const greens = ['#5c9b3a', '#6cae46', '#4e8a30', '#78bd50', '#568f35'];
    const deep = '#3c6d26';
    for (let x = 0; x < SIZE; x++) {
      const depth = 4 + (rng.chance(0.42) ? 1 : 0) + (rng.chance(0.14) ? 1 : 0);
      for (let y = 0; y < depth; y++) px(ctx, x, y, 1, 1, rng.pick(greens));
      px(ctx, x, depth, 1, 1, deep);
      if (rng.chance(0.3)) px(ctx, x, depth + 1, 1, 1, '#4c7f2f');
      if (rng.chance(0.22)) px(ctx, x, 0, 1, 1, '#8bd35f');
      if (rng.chance(0.1)) px(ctx, x, depth + 2, 1, 1, '#5b9138');
    }
    // 几根翘起的草叶
    for (let i = 0; i < 5; i++) {
      const x = rng.int(SIZE);
      px(ctx, x, 2, 1, 2, '#8bd35f');
    }
  }

  function paintDirt(ctx, rng) {
    fill(ctx, '#71502f');
    speckle(ctx, rng, ['#7e5b38', '#5e4026', '#88643f', '#51351d', '#6a482a'], 120, 2);
    for (let i = 0; i < 4; i++) px(ctx, rng.int(14), rng.int(14), 2, 1, '#8f8b7d');
  }

  function paintStone(ctx, rng) {
    fill(ctx, '#7e7f80');
    speckle(ctx, rng, ['#8c8d8e', '#707172', '#959697', '#676869', '#878889'], 120, 2);
    // 细小的裂纹
    for (let i = 0; i < 3; i++) {
      let x = rng.int(12) + 2;
      let y = rng.int(12) + 2;
      for (let s = 0; s < 4; s++) {
        px(ctx, x, y, 1, 1, '#5e5f60');
        x += rng.chance(0.5) ? 1 : 0;
        y += rng.chance(0.7) ? 1 : -1;
      }
    }
    speckle(ctx, rng, ['#9a9b9c'], 8, 1);
  }

  function paintCobble(ctx, rng) {
    fill(ctx, '#55575a');
    const stone = ['#85878a', '#7b7d80', '#8f9194', '#737578'];
    const light = '#9b9da0';
    const dark = '#66686b';
    for (let row = 0; row < 4; row++) {
      const offset = row % 2 ? -2 : 0;
      for (let col = 0; col < 5; col++) {
        const x = col * 4 + offset + rng.int(2);
        const y = row * 4 + rng.int(2);
        const w = 3 + rng.int(3);
        const h = 3 + rng.int(2);
        px(ctx, x, y, w, h, rng.pick(stone));
        px(ctx, x, y, w, 1, light);
        px(ctx, x, y, 1, h, light);
        px(ctx, x, y + h - 1, w, 1, dark);
      }
    }
    speckle(ctx, rng, ['#5f6164', '#a0a2a5'], 14, 1);
  }

  function paintLog(ctx, rng) {
    fill(ctx, '#6a4b29');
    const barks = ['#543a1f', '#7b5a32', '#4a321a', '#835f35'];
    for (let x = 0; x < SIZE; x += 3) {
      px(ctx, x, 0, 1, SIZE, rng.pick(barks));
      px(ctx, x + 1, 0, 1, SIZE, rng.chance(0.5) ? '#5f4224' : '#74542d');
    }
    for (let i = 0; i < 5; i++) {
      const x = rng.int(14);
      const y = rng.int(12);
      px(ctx, x, y, 2, 1, '#49301a');
      px(ctx, x, y + 1, 1, 1, '#8a6639');
    }
    px(ctx, 0, 0, 1, SIZE, '#4a321a');
    px(ctx, 15, 0, 1, SIZE, '#4a321a');
  }

  function paintLeaves(ctx, rng) {
    ctx.clearRect(0, 0, SIZE, SIZE);
    const greens = ['#3f7a2b', '#4a8a32', '#336a23', '#56983b', '#2d5f1f', '#63a746'];
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (rng.chance(0.1)) continue;
        let color = rng.pick(greens);
        if (y > 12 && rng.chance(0.55)) color = '#2f6121';
        if (y < 3 && rng.chance(0.4)) color = '#6cb04d';
        px(ctx, x, y, 1, 1, color);
      }
    }
    // 几处透光的小洞
    for (let i = 0; i < 9; i++) {
      ctx.clearRect(rng.int(13) + 1, rng.int(13) + 1, 1 + rng.int(2), 1 + rng.int(2));
    }
  }

  function paintSand(ctx, rng) {
    fill(ctx, '#dfd19b');
    speckle(ctx, rng, ['#e9dcac', '#d3c288', '#f0e4b8', '#c9b77a', '#dacb92'], 130, 2);
    for (let i = 0; i < 3; i++) px(ctx, rng.int(14), rng.int(14), 2, 1, '#b8a56a');
  }

  function paintWater(ctx, rng) {
    ctx.clearRect(0, 0, SIZE, SIZE);
    fill(ctx, 'rgba(44, 102, 196, 0.78)');
    for (let i = 0; i < 7; i++) {
      const y = rng.int(SIZE);
      px(ctx, rng.int(10), y, 3 + rng.int(5), 1, 'rgba(126, 190, 255, 0.28)');
    }
    for (let i = 0; i < 5; i++) {
      px(ctx, rng.int(14), 8 + rng.int(8), 2 + rng.int(4), 1, 'rgba(24, 66, 148, 0.3)');
    }
  }

  function paintBedrock(ctx, rng) {
    fill(ctx, '#3b3c3e');
    const colors = ['#565759', '#2a2b2d', '#4d4e50', '#6c6d6f', '#232426'];
    for (let i = 0; i < 34; i++) {
      const w = 2 + rng.int(3);
      const h = 2 + rng.int(3);
      px(ctx, rng.int(SIZE - 1), rng.int(SIZE - 1), w, h, rng.pick(colors));
    }
    speckle(ctx, rng, ['#7b7c7e', '#1f2022'], 18, 1);
  }

  function paintOre(ctx, rng, color, glow) {
    paintStone(ctx, rng);
    for (let i = 0; i < 4; i++) {
      const x = 2 + rng.int(11);
      const y = 2 + rng.int(11);
      px(ctx, x, y, 2, 2, color);
      px(ctx, x, y, 1, 1, glow);
      px(ctx, x + 1, y + 1, 1, 1, '#3f4144');
      if (rng.chance(0.7)) px(ctx, x + 1, y, 1, 1, glow);
    }
  }

  function paintPlanks(ctx, rng) {
    fill(ctx, '#b48a50');
    speckle(ctx, rng, ['#c0965a', '#a87f46', '#ba9157', '#9f7741'], 70, 1);
    const seams = '#8a6535';
    for (let y = 3; y < SIZE; y += 4) {
      shadeLine(ctx, 0, y, SIZE, seams);
      shadeLine(ctx, 0, y + 1, SIZE, '#c79d61');
      const seamX = (y * 5 + 3) % SIZE;
      px(ctx, seamX, y - 3, 1, 3, seams);
    }
    for (let i = 0; i < 4; i++) {
      px(ctx, rng.int(14), rng.int(14), 2, 1, '#96703c');
    }
  }

  function paintGlass(ctx, rng) {
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = 'rgba(176, 226, 255, 0.1)';
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.strokeStyle = 'rgba(214, 242, 255, 0.82)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, SIZE - 1, SIZE - 1);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    for (let i = 0; i < 5; i++) ctx.fillRect(3 + i, 11 - i, 1, 1);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
    ctx.fillRect(2, 2, 4, 1);
    ctx.fillRect(2, 3, 1, 3);
    px(ctx, 14, 14, 1, 1, 'rgba(255, 255, 255, 0.5)');
  }

  function paintTorch(ctx) {
    ctx.clearRect(0, 0, SIZE, SIZE);
    px(ctx, 7, 7, 2, 9, '#7c5330');
    px(ctx, 7, 7, 1, 9, '#96663a');
    px(ctx, 8, 7, 1, 9, '#5c3d21');
    px(ctx, 7, 15, 2, 1, '#4d3219');
    // 火焰
    px(ctx, 7, 2, 2, 5, '#ff9a2e');
    px(ctx, 8, 3, 2, 3, '#ffb84d');
    px(ctx, 7, 3, 1, 2, '#ffdf6b');
    px(ctx, 8, 4, 1, 2, '#fff3b0');
    px(ctx, 6, 4, 1, 2, 'rgba(255, 154, 46, 0.55)');
    px(ctx, 9, 5, 1, 2, 'rgba(255, 184, 77, 0.5)');
  }

  function paintCraftingTable(ctx, rng) {
    paintPlanks(ctx, rng);
    px(ctx, 0, 0, SIZE, 5, '#6e4c2a');
    px(ctx, 0, 0, SIZE, 1, '#8a6338');
    px(ctx, 0, 4, SIZE, 1, '#523720');
    for (let x = 1; x < 15; x += 3) px(ctx, x, 1, 1, 3, '#4e351e');
    for (let y = 1; y < 4; y += 2) px(ctx, 1, y, 13, 1, '#4e351e');
    // 桌面上零散的钉子与刻痕
    px(ctx, 2, 9, 3, 1, '#e0c27a');
    px(ctx, 11, 7, 1, 3, '#886232');
    px(ctx, 6, 12, 4, 1, '#97713e');
  }

  function paintSnow(ctx, rng) {
    fill(ctx, '#eef5ff');
    speckle(ctx, rng, ['#dce8f7', '#ffffff', '#d3e0f0', '#e6effa'], 100, 2);
    for (let i = 0; i < 5; i++) px(ctx, rng.int(14), rng.int(14), 2, 1, '#c8d8ea');
    px(ctx, 0, 0, SIZE, 1, '#ffffff');
  }

  function paintCactus(ctx, rng) {
    fill(ctx, '#3f7a2e');
    for (let x = 0; x < SIZE; x += 4) {
      px(ctx, x, 0, 1, SIZE, '#356927');
      px(ctx, x + 1, 0, 1, SIZE, '#4f9140');
    }
    px(ctx, 6, 0, 1, SIZE, '#5aa048');
    for (let i = 0; i < 10; i++) {
      const x = rng.chance(0.5) ? 1 : 13;
      px(ctx, x, rng.int(15), 1, 1, '#d9e8b0');
    }
    px(ctx, 0, 0, 1, SIZE, '#2c5a21');
    px(ctx, 15, 0, 1, SIZE, '#2c5a21');
  }

  function paintTallGrass(ctx, rng) {
    ctx.clearRect(0, 0, SIZE, SIZE);
    const colors = ['#4f9134', '#5da33e', '#3f7a2b', '#6db34a'];
    for (let i = 0; i < 7; i++) {
      const x = 1 + i * 2 + rng.int(2);
      const h = 5 + rng.int(9);
      const color = rng.pick(colors);
      for (let y = 0; y < h; y++) {
        const lean = y > h * 0.6 ? (rng.chance(0.5) ? 1 : 0) : 0;
        px(ctx, x + lean, SIZE - 1 - y, 1, 1, color);
      }
    }
    px(ctx, 2, 15, 12, 1, '#3c6d26');
  }

  function paintFlower(ctx) {
    ctx.clearRect(0, 0, SIZE, SIZE);
    px(ctx, 7, 9, 2, 7, '#4a8a32');
    px(ctx, 5, 11, 2, 1, '#5da33e');
    px(ctx, 9, 10, 2, 1, '#5da33e');
    // 花瓣
    px(ctx, 6, 4, 5, 4, '#d84c4c');
    px(ctx, 7, 3, 3, 6, '#d84c4c');
    px(ctx, 5, 5, 7, 2, '#c94040');
    px(ctx, 8, 6, 2, 2, '#f4d45c');
    px(ctx, 6, 3, 2, 1, '#ff8a8a');
    px(ctx, 3, 13, 2, 1, '#5da33e');
  }

  function paintDeadBush(ctx, rng) {
    ctx.clearRect(0, 0, SIZE, SIZE);
    const c1 = '#7a5a33';
    const c2 = '#5c421f';
    px(ctx, 7, 8, 2, 8, c1);
    for (let i = 0; i < 5; i++) {
      let x = 8;
      let y = 9 + rng.int(5);
      const dx = rng.chance(0.5) ? 1 : -1;
      for (let s = 0; s < 4; s++) {
        x += dx;
        y -= rng.chance(0.7) ? 1 : 0;
        if (x < 0 || x > 15 || y < 0) break;
        px(ctx, x, y, 1, 1, rng.chance(0.5) ? c1 : c2);
      }
    }
    for (let i = 0; i < 4; i++) px(ctx, 5 + rng.int(6), 12 + rng.int(4), 1, 1, c2);
  }

  function paintGlowstone(ctx, rng) {
    fill(ctx, '#b98b3a');
    speckle(ctx, rng, ['#d8ad4a', '#e8c85a', '#a6792c', '#f7e08a'], 70, 2);
    for (let i = 0; i < 8; i++) {
      const x = 2 + rng.int(11);
      const y = 2 + rng.int(11);
      px(ctx, x, y, 2, 2, '#ffe98f');
      px(ctx, x, y, 1, 1, '#fffbd0');
      px(ctx, x + 1, y + 1, 1, 1, '#c99a3c');
    }
  }

  function paintBrick(ctx, rng) {
    fill(ctx, '#c7b7a2');
    const reds = ['#9c443c', '#a94e45', '#8d3b34', '#b25a50'];
    for (let row = 0; row < 4; row++) {
      const y = row * 4;
      const offset = row % 2 ? -4 : 0;
      for (let col = 0; col < 3; col++) {
        const x = col * 8 + offset;
        px(ctx, x + 1, y + 1, 7, 3, rng.pick(reds));
        px(ctx, x + 1, y + 1, 7, 1, 'rgba(255, 255, 255, 0.18)');
        px(ctx, x + 1, y + 3, 7, 1, 'rgba(0, 0, 0, 0.16)');
      }
    }
    speckle(ctx, rng, ['#b9a78f', '#d3c4b0'], 18, 1);
  }

  function paintSandstone(ctx, rng) {
    fill(ctx, '#ddcf99');
    speckle(ctx, rng, ['#e6d9a7', '#d2c288', '#e9ddae'], 80, 2);
    for (let y = 4; y < SIZE; y += 5) {
      shadeLine(ctx, 0, y, SIZE, '#c3b279');
      shadeLine(ctx, 0, y + 1, SIZE, '#eee2b6');
    }
    for (let i = 0; i < 5; i++) px(ctx, rng.int(14), rng.int(14), 2, 1, '#b7a46c');
  }

  function paintBookshelf(ctx, rng) {
    paintPlanks(ctx, rng);
    px(ctx, 0, 0, SIZE, 2, '#6d4c2b');
    px(ctx, 0, 7, SIZE, 2, '#6d4c2b');
    px(ctx, 0, 14, SIZE, 2, '#6d4c2b');
    const books = ['#c4544c', '#4c74c4', '#4ca36c', '#c4a44c', '#8a5cbf', '#c47a3c'];
    const drawShelf = (top, bottom) => {
      let x = 1;
      while (x < 14) {
        const w = 1 + rng.int(2);
        const color = rng.pick(books);
        const h = bottom - top - rng.int(2);
        px(ctx, x, bottom - h, w, h, color);
        px(ctx, x, bottom - h, w, 1, 'rgba(255, 255, 255, 0.25)');
        x += w + 1;
      }
    };
    drawShelf(2, 7);
    drawShelf(9, 14);
    px(ctx, 0, 0, 1, SIZE, '#5a3f22');
    px(ctx, 15, 0, 1, SIZE, '#5a3f22');
  }

  /* ---------- 方块表 ---------- */

  const DEFS = [
    { id: 0, key: 'air', name: '空气', solid: false, opaque: false, placeable: false, hardness: 0, color: '#000' },
    { id: 1, key: 'grass', name: '草方块', solid: true, opaque: true, hardness: 0.3, color: '#5c9b3a', paint: paintGrass },
    { id: 2, key: 'dirt', name: '泥土', solid: true, opaque: true, hardness: 0.3, color: '#71502f', paint: paintDirt },
    { id: 3, key: 'stone', name: '石头', solid: true, opaque: true, hardness: 0.85, color: '#7e7f80', paint: paintStone },
    { id: 4, key: 'cobblestone', name: '圆石', solid: true, opaque: true, hardness: 1.0, color: '#7d7f82', paint: paintCobble },
    { id: 5, key: 'log', name: '橡木原木', solid: true, opaque: true, hardness: 0.6, color: '#6a4b29', paint: paintLog },
    { id: 6, key: 'leaves', name: '树叶', solid: true, opaque: false, skyAtten: 1, hardness: 0.15, color: '#3f7a2b', paint: paintLeaves },
    { id: 7, key: 'sand', name: '沙子', solid: true, opaque: true, hardness: 0.3, color: '#dfd19b', paint: paintSand },
    { id: 8, key: 'water', name: '水', solid: false, opaque: false, skyAtten: 1, liquid: true, placeable: false, hardness: Infinity, color: '#2c66c4', paint: paintWater },
    { id: 9, key: 'bedrock', name: '基岩', solid: true, opaque: true, placeable: false, hardness: Infinity, color: '#3b3c3e', paint: paintBedrock },
    { id: 10, key: 'coal_ore', name: '煤矿石', solid: true, opaque: true, hardness: 1.2, color: '#4a4a4a', paint: (c, r) => paintOre(c, r, '#303030', '#5a5a5a') },
    { id: 11, key: 'iron_ore', name: '铁矿石', solid: true, opaque: true, hardness: 1.5, color: '#c9a184', paint: (c, r) => paintOre(c, r, '#c9a184', '#edcdb2') },
    { id: 12, key: 'gold_ore', name: '金矿石', solid: true, opaque: true, hardness: 1.8, color: '#f0c93c', paint: (c, r) => paintOre(c, r, '#e0b32f', '#ffe27a') },
    { id: 13, key: 'diamond_ore', name: '钻石矿石', solid: true, opaque: true, hardness: 2.4, color: '#57d9dd', paint: (c, r) => paintOre(c, r, '#4cc9cd', '#a8f7f9') },
    { id: 14, key: 'planks', name: '木板', solid: true, opaque: true, hardness: 0.5, color: '#b48a50', paint: paintPlanks },
    { id: 15, key: 'glass', name: '玻璃', solid: true, opaque: false, skyAtten: 0, hardness: 0.2, color: '#bfe9ff', paint: paintGlass },
    { id: 16, key: 'torch', name: '火把', solid: false, opaque: false, skyAtten: 0, light: 12, hardness: 0.05, color: '#ffb84d', paint: paintTorch },
    { id: 17, key: 'crafting_table', name: '工作台', solid: true, opaque: true, hardness: 0.6, color: '#6e4c2a', paint: paintCraftingTable },
    { id: 18, key: 'snow', name: '雪块', solid: true, opaque: true, hardness: 0.25, color: '#eef5ff', paint: paintSnow },
    { id: 19, key: 'cactus', name: '仙人掌', solid: true, opaque: true, hardness: 0.35, color: '#3f7a2e', paint: paintCactus },
    { id: 20, key: 'tall_grass', name: '草丛', solid: false, opaque: false, skyAtten: 0, hardness: 0.05, color: '#5da33e', paint: paintTallGrass },
    { id: 21, key: 'flower', name: '红花', solid: false, opaque: false, skyAtten: 0, hardness: 0.05, color: '#d84c4c', paint: paintFlower },
    { id: 22, key: 'dead_bush', name: '枯灌木', solid: false, opaque: false, skyAtten: 0, hardness: 0.05, color: '#7a5a33', paint: paintDeadBush },
    { id: 23, key: 'glowstone', name: '荧石', solid: true, opaque: true, light: 14, hardness: 0.45, color: '#e8c85a', paint: paintGlowstone },
    { id: 24, key: 'brick', name: '砖块', solid: true, opaque: true, hardness: 1.1, color: '#9c443c', paint: paintBrick },
    { id: 25, key: 'sandstone', name: '砂岩', solid: true, opaque: true, hardness: 0.55, color: '#ddcf99', paint: paintSandstone },
    { id: 26, key: 'bookshelf', name: '书架', solid: true, opaque: true, hardness: 0.5, color: '#8a5c3c', paint: paintBookshelf }
  ];

  const VARIANTS = new Set([1, 2, 3, 4, 5, 7, 14, 18, 24, 25]);

  const BLOCKS = [];
  const BY_KEY = {};
  const PLACEABLE = [];

  function build() {
    for (const def of DEFS) {
      def.variants = [];
      const count = VARIANTS.has(def.id) ? 3 : 1;
      for (let v = 0; v < count; v++) {
        const c = makeCanvas();
        const ctx = c.getContext('2d');
        if (def.paint) {
          const rng = new MC2D.RNG((0x9e3779b9 ^ (def.id * 7919) ^ (v * 104729)) >>> 0);
          def.paint(ctx, rng);
        }
        def.variants.push(c);
      }
      def.icon = def.variants[0].toDataURL();
      def.placeable = def.placeable !== false && def.id !== 0;
      BLOCKS[def.id] = def;
      BY_KEY[def.key] = def;
      if (def.placeable) PLACEABLE.push(def.id);
    }
  }

  build();

  MC2D.BLOCKS = BLOCKS;
  MC2D.BLOCK_BY_KEY = BY_KEY;
  MC2D.PLACEABLE = PLACEABLE;
  MC2D.TEX_SIZE = SIZE;
})();
