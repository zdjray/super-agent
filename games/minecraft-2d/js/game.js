/* 方块世界 2D — 主循环与玩法 */
(function () {
  'use strict';

  const MC2D = window.MC2D;
  const BLOCKS = MC2D.BLOCKS;
  const DAY_LENGTH = MC2D.RENDER_CONST.DAY_LENGTH;
  const SAVE_KEY = 'mc2d.save.v1';
  const DEFAULT_HOTBAR = [1, 3, 4, 5, 14, 15, 16, 23, 17];
  const REACH = 6.2;
  const REPLACEABLE = new Set([0, 8, 20, 21, 22]);

  class Game {
    constructor() {
      this.canvas = document.getElementById('game');
      this.world = null;
      this.player = null;
      this.renderer = new MC2D.Renderer(this.canvas);
      this.audio = new MC2D.GameAudio();
      this.ui = new MC2D.UI(this);
      this.started = false;
      this.paused = true;
      this.inventoryFromPause = false;
      this.time = DAY_LENGTH * 0.18;
      this.hotbar = DEFAULT_HOTBAR.slice();
      this.selected = 0;
      this.muted = false;
      this.dirty = false;
      this.autoSaveTimer = 0;
      this.stepTimer = 0;
      this.placeCooldown = 0;
      this.mineSoundTimer = 0;
      this.hashTime = 0;
      this.last = 0;
      this.mouse = { x: -1, y: -1, inside: false, down: [false, false, false] };
      this.hovered = null;
      this.hoveredInReach = false;
      this.mining = null;
      this.wasInWater = false;
      this.particles = [];
      this.rng = new MC2D.RNG((Math.random() * 0xffffffff) >>> 0);
      this.input = {
        left: false,
        right: false,
        up: false,
        down: false,
        jump: false,
        jumpPressed: false,
        sprint: false
      };
      this.loop = this.loop.bind(this);
      this.bindEvents();
      window.MC2D.game = this;
      this.boot();
    }

    /* ---------------- boot & world lifecycle ---------------- */

    boot() {
      setTimeout(() => {
        const save = this.readSave();
        const urlSeed = this.seedFromUrl();
        const seed = urlSeed !== null ? urlSeed : save ? save.seed : undefined;
        this.buildWorld(seed, urlSeed === null ? save : null);

        const hasSave = !!(save && urlSeed === null && save.seed === this.world.seed);
        const startBtn = document.getElementById('start-btn');
        if (hasSave) startBtn.textContent = '继续游戏';
        this.ui.setWorld(this.world);
        this.ui.setHotbar(this.hotbar, this.selected);
        this.ui.setMuted(this.muted);
        this.audio.setMuted(this.muted);
        this.renderer.setWorld(this.world);
        this.renderer.time = this.time;
        this.renderer.updateCamera(0, this.player, true);
        this.ui.hideLoading();

        this.last = performance.now();
        requestAnimationFrame(this.loop);
        window.__mc2d_ready = true;
      }, 40);
    }

    buildWorld(seed, save) {
      const world = new MC2D.World(seed === undefined ? this.randomSeed() : seed);
      if (save && save.seed === world.seed && Array.isArray(save.edits)) {
        world.applyEdits(save.edits);
      }
      const spawn = world.findSpawn();
      const player = new MC2D.Player(world, spawn.x, spawn.y);

      this.hotbar = DEFAULT_HOTBAR.slice();
      this.selected = 0;
      this.time = DAY_LENGTH * 0.18;
      this.muted = false;
      this.dirty = false;

      if (save && save.seed === world.seed) {
        if (player.restore) player.restore(save.player);
        if (!this.validPlayerPosition(world, player)) {
          player.teleport(spawn.x, spawn.y);
        }
        if (Number.isFinite(save.time)) this.time = save.time;
        if (Array.isArray(save.hotbar) && save.hotbar.length === 9) {
          const clean = save.hotbar.map((id) => (BLOCKS[id] && BLOCKS[id].placeable ? id : 1));
          this.hotbar = clean;
        }
        if (Number.isInteger(save.selected) && save.selected >= 0 && save.selected < 9) {
          this.selected = save.selected;
        }
        this.muted = !!save.muted;
      }

      this.world = world;
      this.player = player;
      if (this.renderer) this.renderer.setWorld(world);
    }

    validPlayerPosition(world, player) {
      if (!Number.isFinite(player.x) || !Number.isFinite(player.y)) return false;
      if (player.x < 0 || player.x > world.cols - 1 || player.y < 0 || player.y > world.rows - 1) return false;
      return !player.collides(player.x, player.y);
    }

    randomSeed() {
      return 10000000 + Math.floor(Math.random() * 89999999);
    }

    seedFromUrl() {
      const value = new URLSearchParams(window.location.search).get('seed');
      if (value === null || value === '') return null;
      const num = Number(value);
      return Number.isFinite(num) ? Math.abs(Math.floor(num)) >>> 0 : null;
    }

    readSave() {
      try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data || data.v !== 1 || !Number.isFinite(data.seed)) return null;
        return data;
      } catch (err) {
        return null;
      }
    }

    /* ---------------- flow ---------------- */

    start() {
      if (this.started) return;
      this.started = true;
      this.paused = false;
      this.ui.hideStart();
      this.ui.clearFocus();
      this.audio.init();
      this.audio.setMuted(this.muted);
      this.ui.showHud(true);
      this.ui.toast('左键挖掘 · 右键放置 · E 打开背包', 3200);
      this.save(true);
    }

    pause() {
      if (!this.started || this.paused) return;
      this.paused = true;
      this.clearActions();
      this.ui.showPause();
      this.audio.play('click');
      this.save(true);
    }

    resume() {
      if (!this.started) return;
      this.ui.hidePause();
      this.ui.hideInventory();
      this.paused = false;
      this.ui.clearFocus();
      this.audio.init();
    }

    openInventory() {
      if (!this.started || !this.paused) return;
      this.inventoryFromPause = !document.getElementById('pause-screen').classList.contains('hidden');
      this.ui.hidePause();
      this.ui.showInventory();
      this.audio.play('open');
    }

    closeInventory() {
      this.ui.hideInventory();
      this.ui.clearFocus();
      this.audio.play('click');
      if (this.inventoryFromPause) {
        this.ui.showPause();
      } else {
        this.ui.hidePause();
        this.paused = false;
        this.ui.clearFocus();
      }
      this.inventoryFromPause = false;
    }

    toggleMute() {
      this.muted = !this.muted;
      this.audio.init();
      this.audio.setMuted(this.muted);
      this.ui.setMuted(this.muted);
      this.ui.toast(this.muted ? '声音已关闭' : '声音已开启', 1200);
      this.dirty = true;
    }

    resetWorld() {
      const seed = this.randomSeed();
      this.rebuildWorld(seed);
      this.clearSave();
      this.paused = false;
      this.started = true;
      this.ui.hideStart();
      this.ui.hidePause();
      this.ui.hideInventory();
      this.ui.showHud(true);
      this.ui.toast('世界已重新生成', 1800);
      this.save(true);
    }

    reseed() {
      if (this.started) return;
      const seed = this.randomSeed();
      this.rebuildWorld(seed);
      this.clearSave();
      this.paused = true;
      this.ui.setWorld(this.world);
      document.getElementById('start-btn').textContent = '开始游戏';
      this.ui.toast('已生成新的世界', 1500);
    }

    rebuildWorld(seed) {
      const world = new MC2D.World(seed);
      const spawn = world.findSpawn();
      this.world = world;
      this.player = new MC2D.Player(world, spawn.x, spawn.y);
      this.time = DAY_LENGTH * 0.18;
      this.mining = null;
      this.hovered = null;
      this.particles.length = 0;
      this.wasInWater = false;
      this.renderer.setWorld(world);
      this.renderer.time = this.time;
      this.renderer.updateCamera(0, this.player, true);
      this.ui.setWorld(world);
      this.ui.setHotbar(this.hotbar, this.selected);
    }

    clearActions() {
      this.input.left = false;
      this.input.right = false;
      this.input.up = false;
      this.input.down = false;
      this.input.jump = false;
      this.input.jumpPressed = false;
      this.input.sprint = false;
      this.mouse.down[0] = false;
      this.mouse.down[2] = false;
      this.mining = null;
    }

    /* ---------------- persistence ---------------- */

    markDirty() {
      this.dirty = true;
    }

    save(silent) {
      if (!this.started || !this.world) return;
      try {
        const data = {
          v: 1,
          seed: this.world.seed,
          edits: this.world.exportEdits(),
          player: this.player.serialize(),
          time: this.time,
          hotbar: this.hotbar,
          selected: this.selected,
          muted: this.muted,
          savedAt: Date.now()
        };
        localStorage.setItem(SAVE_KEY, JSON.stringify(data));
        this.dirty = false;
        if (!silent) this.ui.toast('世界已保存');
      } catch (err) {
        if (!silent) this.ui.toast('保存失败：浏览器存储空间不足');
      }
    }

    clearSave() {
      try {
        localStorage.removeItem(SAVE_KEY);
      } catch (err) {
        /* ignore */
      }
      this.dirty = false;
    }

    /* ---------------- events ---------------- */

    bindEvents() {
      window.addEventListener('resize', () => {
        this.renderer.resize();
        if (this.player) this.renderer.updateCamera(0, this.player, true);
      });

      window.addEventListener('keydown', (e) => this.onKeyDown(e));
      window.addEventListener('keyup', (e) => this.onKeyUp(e));

      this.canvas.addEventListener('mousemove', (e) => {
        this.mouse.x = e.clientX;
        this.mouse.y = e.clientY;
        this.mouse.inside = true;
      });
      this.canvas.addEventListener('mouseleave', () => {
        this.mouse.inside = false;
      });
      this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
      window.addEventListener('mouseup', (e) => this.onMouseUp(e));
      this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      window.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });

      window.addEventListener('blur', () => this.clearActions());
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.save(true);
      });
      window.addEventListener('pagehide', () => this.save(true));
    }

    onKeyDown(e) {
      const code = e.code;
      if (code === 'Escape') {
        e.preventDefault();
        if (!document.getElementById('inventory-screen').classList.contains('hidden')) {
          this.closeInventory();
        } else if (!document.getElementById('pause-screen').classList.contains('hidden')) {
          this.resume();
        } else if (this.started) {
          this.pause();
        }
        return;
      }

      if (code === 'KeyE') {
        e.preventDefault();
        if (!this.started) return;
        if (!document.getElementById('inventory-screen').classList.contains('hidden')) {
          this.closeInventory();
        } else if (this.paused) {
          this.openInventory();
        } else {
          this.paused = true;
          this.clearActions();
          this.inventoryFromPause = false;
          this.ui.showInventory();
          this.audio.play('open');
        }
        return;
      }

      if (code === 'KeyM') {
        this.toggleMute();
        return;
      }

      if (this.ui.overlayOpen() || !this.started) return;

      if (code === 'KeyF') {
        this.player.toggleFly();
        this.ui.toast(this.player.flying ? '飞行模式：开' : '飞行模式：关', 1200);
        return;
      }

      if (code.startsWith('Digit')) {
        const n = parseInt(code.slice(5), 10);
        if (n >= 1 && n <= 9) this.setSelected(n - 1);
        return;
      }

      let handled = true;
      switch (code) {
        case 'KeyA':
        case 'ArrowLeft': this.input.left = true; break;
        case 'KeyD':
        case 'ArrowRight': this.input.right = true; break;
        case 'KeyW':
        case 'ArrowUp':
          this.input.up = true;
          this.input.jump = true;
          if (!e.repeat) this.input.jumpPressed = true;
          break;
        case 'Space':
          this.input.jump = true;
          if (!e.repeat) this.input.jumpPressed = true;
          break;
        case 'KeyS':
        case 'ArrowDown': this.input.down = true; break;
        case 'ShiftLeft':
        case 'ShiftRight': this.input.sprint = true; break;
        default: handled = false;
      }
      if (handled) e.preventDefault();
    }

    onKeyUp(e) {
      switch (e.code) {
        case 'KeyA':
        case 'ArrowLeft': this.input.left = false; break;
        case 'KeyD':
        case 'ArrowRight': this.input.right = false; break;
        case 'KeyW':
        case 'ArrowUp': this.input.up = false; this.input.jump = false; break;
        case 'Space': this.input.jump = false; break;
        case 'KeyS':
        case 'ArrowDown': this.input.down = false; break;
        case 'ShiftLeft':
        case 'ShiftRight': this.input.sprint = false; break;
        default: break;
      }
    }

    onMouseDown(e) {
      if (!this.started || this.paused) return;
      this.audio.init();
      if (e.button === 0) {
        this.mouse.down[0] = true;
        this.beginMining();
      } else if (e.button === 2) {
        this.mouse.down[2] = true;
        this.placeCooldown = 0;
        this.tryPlace();
      }
    }

    onMouseUp(e) {
      if (e.button === 0) {
        this.mouse.down[0] = false;
        this.mining = null;
      } else if (e.button === 2) {
        this.mouse.down[2] = false;
      }
    }

    onWheel(e) {
      if (!this.started || this.ui.overlayOpen()) return;
      e.preventDefault();
      const dir = e.deltaY > 0 ? 1 : -1;
      this.setSelected((this.selected + dir + 9) % 9);
    }

    /* ---------------- hotbar ---------------- */

    setSelected(index) {
      if (!Number.isInteger(index) || index < 0 || index > 8) return;
      this.selected = index;
      this.ui.setSelected(index);
      this.ui.setHotbar(this.hotbar, index);
      this.audio.play('click');
      this.dirty = true;
    }

    assignBlock(id) {
      const def = BLOCKS[id];
      if (!def || !def.placeable) return;
      this.hotbar[this.selected] = id;
      this.player.heldBlock = id;
      this.ui.setHotbar(this.hotbar, this.selected);
      this.ui.showBlockName(def.name);
      this.ui.toast(`${def.name} 已放入快捷栏 ${this.selected + 1}`, 1400);
      this.audio.play('click');
      this.dirty = true;
    }

    /* ---------------- interaction ---------------- */

    inReach(tx, ty) {
      if (!this.player) return false;
      const dx = tx + 0.5 - this.player.centerX;
      const dy = ty + 0.5 - this.player.centerY;
      return dx * dx + dy * dy <= REACH * REACH;
    }

    updateHovered() {
      this.hovered = null;
      this.hoveredInReach = false;
      if (!this.started || this.paused || !this.mouse.inside || !this.world) return;
      const pos = this.renderer.screenToWorld(this.mouse.x, this.mouse.y);
      const tx = Math.floor(pos.x);
      const ty = Math.floor(pos.y);
      if (!this.world.inBounds(tx, ty)) return;
      this.hovered = { x: tx, y: ty };
      this.hoveredInReach = this.inReach(tx, ty);
    }

    beginMining() {
      const target = this.hovered;
      if (!target || !this.hoveredInReach) return;
      const id = this.world.get(target.x, target.y);
      const def = BLOCKS[id];
      if (id === 0) return;
      if (!Number.isFinite(def.hardness)) {
        this.mining = null;
        return;
      }
      this.player.facing = target.x + 0.5 > this.player.centerX ? 1 : -1;
      this.mining = { x: target.x, y: target.y, progress: 0, def, id };
      this.mineSoundTimer = 0;
    }

    updateMining(dt) {
      if (!this.mouse.down[0]) {
        this.mining = null;
        return;
      }
      if (!this.mining) {
        // 按住左键拖动时，自动接着挖下一块
        const t = this.hovered;
        if (t && this.hoveredInReach) {
          const id = this.world.get(t.x, t.y);
          const def = BLOCKS[id];
          if (id !== 0 && Number.isFinite(def.hardness)) {
            this.player.facing = t.x + 0.5 > this.player.centerX ? 1 : -1;
            this.mining = { x: t.x, y: t.y, progress: 0, def, id };
            this.mineSoundTimer = 0;
          }
        }
        return;
      }
      if (!this.hovered || this.hovered.x !== this.mining.x || this.hovered.y !== this.mining.y || !this.hoveredInReach) {
        this.mining = null;
        return;
      }
      const def = this.mining.def;
      this.mining.progress += dt / def.hardness;
      this.mineSoundTimer -= dt;
      if (this.mineSoundTimer <= 0) {
        this.mineSoundTimer = Math.max(0.12, def.hardness * 0.28);
        this.audio.play('step', this.rng.int(3));
        this.spawnMiningParticles(this.mining.x, this.mining.y, def, 1);
      }
      if (this.mining.progress >= 1) {
        this.breakBlock(this.mining.x, this.mining.y);
        this.mining = null;
      }
    }

    breakBlock(x, y) {
      const id = this.world.get(x, y);
      const def = BLOCKS[id];
      if (id === 0 || !Number.isFinite(def.hardness)) return;
      this.world.set(x, y, 0);
      this.spawnBreakParticles(x, y, def);
      this.audio.play('break', def.hardness);
      this.renderer.shake = 1.8;
      this.markDirty();
    }

    updatePlacing(dt) {
      this.placeCooldown -= dt;
      if (this.mouse.down[2] && this.placeCooldown <= 0) {
        this.tryPlace();
      }
    }

    tryPlace() {
      const target = this.hovered;
      if (!target) return;
      const id = this.hotbar[this.selected];
      const def = BLOCKS[id];
      if (!def || !def.placeable) return;

      let x = target.x;
      let y = target.y;
      let current = this.world.get(x, y);

      if (!REPLACEABLE.has(current)) {
        const above = this.world.get(x, y - 1);
        if (BLOCKS[current].solid && REPLACEABLE.has(above)) {
          y -= 1;
        } else {
          return;
        }
      }

      if (!this.world.inBounds(x, y) || !this.inReach(x, y)) return;
      if (def.solid && this.player.containsTile(x, y)) {
        this.ui.toast('这里放不下', 800);
        return;
      }

      this.world.set(x, y, id);
      this.world.computeSky();
      this.placeCooldown = 0.14;
      this.audio.play('place');
      this.spawnPlaceParticles(x, y, def);
      this.markDirty();
      this.renderer.shake = 0.6;

      // 连续放置时，光标停留在下方地面就自动往上叠
      if (this.hovered && BLOCKS[this.world.get(this.hovered.x, this.hovered.y)].solid) {
        const aboveY = this.hovered.y - 1;
        if (REPLACEABLE.has(this.world.get(this.hovered.x, aboveY))) {
          this.hovered.y = aboveY;
        }
      }
    }

    spawnBreakParticles(x, y, def) {
      const count = 12 + this.rng.int(6);
      for (let i = 0; i < count; i++) {
        this.particles.push({
          x: x + this.rng.next(),
          y: y + this.rng.next(),
          vx: (this.rng.next() - 0.5) * 7,
          vy: -this.rng.next() * 5,
          size: 3 + this.rng.int(3),
          color: def.color,
          life: 0.5 + this.rng.next() * 0.45,
          maxLife: 0.95,
          gravity: 16
        });
      }
    }

    spawnMiningParticles(x, y, def, count) {
      for (let i = 0; i < count; i++) {
        this.particles.push({
          x: x + 0.2 + this.rng.next() * 0.6,
          y: y + 0.2 + this.rng.next() * 0.6,
          vx: (this.rng.next() - 0.5) * 2,
          vy: -this.rng.next() * 2.5,
          size: 1 + this.rng.int(2),
          color: def.color,
          life: 0.25 + this.rng.next() * 0.25,
          maxLife: 0.5,
          gravity: 12
        });
      }
    }

    spawnPlaceParticles(x, y, def) {
      for (let i = 0; i < 6; i++) {
        this.particles.push({
          x: x + this.rng.next(),
          y: y + 1,
          vx: (this.rng.next() - 0.5) * 3,
          vy: -this.rng.next() * 3,
          size: 1 + this.rng.int(2),
          color: def.color,
          life: 0.3 + this.rng.next() * 0.3,
          maxLife: 0.6,
          gravity: 14
        });
      }
    }

    updateParticles(dt) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life -= dt;
        if (p.life <= 0) {
          this.particles.splice(i, 1);
          continue;
        }
        p.vy += p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.vy > 0 && this.world.isSolid(Math.floor(p.x), Math.floor(p.y))) {
          p.y -= p.vy * dt;
          p.vy = 0;
          p.vx *= 0.6;
        }
      }
      if (this.particles.length > 260) this.particles.splice(0, this.particles.length - 260);
    }

    /* ---------------- update loop ---------------- */

    loop(now) {
      requestAnimationFrame(this.loop);
      const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
      this.last = now;

      if (!this.paused) {
        this.update(dt);
        this.renderer.updateCamera(dt, this.player, false);
      }

      if (this.world && this.player) this.renderer.render(this);
    }

    update(dt) {
      this.time += dt;
      this.player.heldBlock = this.hotbar[this.selected];
      this.player.update(dt, this.input);
      this.input.jumpPressed = false;

      this.updateHovered();
      this.updateMining(dt);
      this.updatePlacing(dt);
      this.updateParticles(dt);

      if (this.world.skyDirty) this.world.computeSky();

      // 水花
      if (this.player.inWater && !this.wasInWater) {
        this.audio.play('splash');
        this.renderer.shake = 1.2;
      }
      this.wasInWater = this.player.inWater;

      // 脚步声
      if (this.player.onGround && this.player.speed > 1.2) {
        this.stepTimer -= dt;
        if (this.stepTimer <= 0) {
          this.stepTimer = this.player.speed > 7 ? 0.26 : 0.34;
          this.audio.play('step', this.rng.int(3));
        }
      } else {
        this.stepTimer = 0;
      }

      this.updateHud(dt);

      this.autoSaveTimer += dt;
      if (this.autoSaveTimer > 15) {
        this.autoSaveTimer = 0;
        if (this.dirty) this.save(true);
      }
    }

    updateHud(dt) {
      this.hashTime += dt;
      if (this.hashTime < 0.2) return;
      this.hashTime = 0;
      const t = ((this.time / DAY_LENGTH) % 1 + 1) % 1;
      const day = Math.floor(this.time / DAY_LENGTH) + 1;
      let phase = '白天';
      if (t < 0.08) phase = '清晨';
      else if (t < 0.4) phase = '白天';
      else if (t < 0.5) phase = '黄昏';
      else if (t < 0.9) phase = '夜晚';
      else phase = '黎明';
      const biome = this.world.biomeAt(Math.floor(this.player.centerX)).name;
      this.ui.updateInfo({
        day,
        phase,
        x: Math.round(this.player.centerX),
        y: Math.round(this.player.y + this.player.h),
        biome
      });

      if (this.hovered) {
        const id = this.world.get(this.hovered.x, this.hovered.y);
        if (id !== 0) this.ui.showBlockName(BLOCKS[id].name);
        else {
          const held = BLOCKS[this.hotbar[this.selected]];
          this.ui.showBlockName(held ? held.name : '');
        }
      } else {
        const held = BLOCKS[this.hotbar[this.selected]];
        this.ui.showBlockName(held ? held.name : '');
      }
    }
  }

  // 等 DOM 就绪后启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new Game());
  } else {
    new Game();
  }
})();
