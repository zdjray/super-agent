/* 方块世界 2D — DOM 界面 */
(function () {
  'use strict';

  const MC2D = window.MC2D;
  const BLOCKS = MC2D.BLOCKS;

  class UI {
    constructor(game) {
      this.game = game;
      this.selected = 0;
      this.hotbar = [];
      this.toastTimer = null;
      this.resetArmed = false;
      this.resetTimer = null;
      this.reseedArmed = false;
      this.reseedTimer = null;
      this.lastBlockName = null;
      this.els = {
        hud: document.getElementById('hud'),
        hotbar: document.getElementById('hotbar'),
        blockName: document.getElementById('block-name'),
        toast: document.getElementById('toast'),
        start: document.getElementById('start-screen'),
        pause: document.getElementById('pause-screen'),
        inventory: document.getElementById('inventory-screen'),
        inventoryGrid: document.getElementById('inventory-grid'),
        inventorySlotLabel: document.getElementById('inventory-slot-label'),
        startSeed: document.getElementById('start-seed'),
        pauseSeed: document.getElementById('pause-seed'),
        day: document.getElementById('hud-day'),
        phase: document.getElementById('hud-phase'),
        coords: document.getElementById('hud-coords'),
        biome: document.getElementById('hud-biome'),
        sound: document.getElementById('btn-sound'),
        sound2: document.getElementById('sound-btn2'),
        pauseBtn: document.getElementById('btn-pause'),
        loading: document.getElementById('loading'),
        resetBtn: document.getElementById('reset-btn')
      };
      this.buildHotbar();
      this.buildInventory();
      this.bind();
    }

    bind() {
      const g = this.game;
      const on = (id, fn, ev) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(ev || 'click', fn);
      };

      on('start-btn', () => g.start());
      on('reseed-btn', () => this.handleReseed());
      on('btn-pause', () => g.pause());
      on('resume-btn', () => g.resume());
      on('inventory-btn', () => g.openInventory());
      on('inventory-close', () => g.closeInventory());
      on('btn-sound', () => g.toggleMute());
      on('sound-btn2', () => g.toggleMute());
      on('save-btn', () => g.save(false));
      on('reset-btn', () => this.handleReset());
      on('pause-screen', (e) => {
        if (e.target === this.els.pause) g.resume();
      }, 'click');
      on('inventory-screen', (e) => {
        if (e.target === this.els.inventory) g.closeInventory();
      }, 'click');

      // 快捷栏点击选中
      this.els.hotbar.addEventListener('click', (e) => {
        const slot = e.target.closest('.hotbar-slot');
        if (!slot) return;
        g.setSelected(parseInt(slot.dataset.slot, 10));
      });

      // 背包格子点击
      this.els.inventoryGrid.addEventListener('click', (e) => {
        const cell = e.target.closest('.inv-cell');
        if (!cell) return;
        g.assignBlock(parseInt(cell.dataset.block, 10));
      });

      document.getElementById('start-btn').focus();
    }

    buildHotbar() {
      this.els.hotbar.innerHTML = '';
      for (let i = 0; i < 9; i++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'hotbar-slot';
        btn.dataset.slot = String(i);
        btn.setAttribute('aria-label', `快捷栏 ${i + 1}`);
        btn.innerHTML = `<span class="slot-key">${i + 1}</span><img alt="" draggable="false">`;
        this.els.hotbar.appendChild(btn);
      }
      this.slotEls = Array.from(this.els.hotbar.children);
    }

    buildInventory() {
      this.els.inventoryGrid.innerHTML = '';
      for (const id of MC2D.PLACEABLE) {
        const def = BLOCKS[id];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'inv-cell';
        btn.dataset.block = String(id);
        btn.title = def.name;
        btn.innerHTML = `<img src="${def.icon}" alt="" draggable="false"><span>${def.name}</span>`;
        this.els.inventoryGrid.appendChild(btn);
      }
    }

    setWorld(world) {
      this.els.startSeed.textContent = String(world.seed);
      this.els.pauseSeed.textContent = String(world.seed);
    }

    setHotbar(hotbar, selected) {
      this.hotbar = hotbar;
      this.selected = selected;
      hotbar.forEach((id, i) => {
        const slot = this.slotEls[i];
        if (!slot) return;
        const img = slot.querySelector('img');
        const def = BLOCKS[id];
        if (def) {
          img.src = def.icon;
          img.alt = def.name;
        } else {
          img.removeAttribute('src');
          img.alt = '';
        }
        slot.classList.toggle('selected', i === selected);
      });
      this.els.inventorySlotLabel.textContent = `当前槽位 ${selected + 1}`;
    }

    setSelected(selected) {
      this.selected = selected;
      this.slotEls.forEach((slot, i) => slot.classList.toggle('selected', i === selected));
      this.els.inventorySlotLabel.textContent = `当前槽位 ${selected + 1}`;
      const def = BLOCKS[this.hotbar[selected]];
      if (def) this.showBlockName(def.name);
    }

    showBlockName(text) {
      if (this.lastBlockName === text) return;
      this.lastBlockName = text;
      this.els.blockName.textContent = text || '';
      this.els.blockName.classList.toggle('visible', !!text);
    }

    updateInfo({ day, phase, x, y, biome }) {
      this.els.day.textContent = `第 ${day} 天`;
      this.els.phase.textContent = phase;
      this.els.coords.textContent = `X ${x} · Y ${y}`;
      this.els.biome.textContent = biome;
    }

    setMuted(muted) {
      this.els.sound.textContent = muted ? '🔇' : '🔊';
      this.els.sound.classList.toggle('muted', muted);
      this.els.sound2.textContent = muted ? '声音：关' : '声音：开';
    }

    showHud(visible) {
      this.els.hud.classList.toggle('hidden', !visible);
    }

    hideStart() {
      this.els.start.classList.add('hidden');
      this.showHud(true);
    }

    showStart() {
      this.els.start.classList.remove('hidden');
      this.showHud(false);
    }

    showPause() {
      this.els.pause.classList.remove('hidden');
      this.resetArmed = false;
      this.els.resetBtn.textContent = '重新生成世界';
      document.getElementById('resume-btn').focus();
    }

    hidePause() {
      this.els.pause.classList.add('hidden');
    }

    showInventory() {
      this.els.inventory.classList.remove('hidden');
    }

    hideInventory() {
      this.els.inventory.classList.add('hidden');
    }

    clearFocus() {
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    }

    overlayOpen() {
      return !this.els.start.classList.contains('hidden') ||
        !this.els.pause.classList.contains('hidden') ||
        !this.els.inventory.classList.contains('hidden');
    }

    handleReseed() {
      const btn = document.getElementById('reseed-btn');
      if (!this.reseedArmed) {
        this.reseedArmed = true;
        btn.textContent = '再点一次确认';
        clearTimeout(this.reseedTimer);
        this.reseedTimer = setTimeout(() => {
          this.reseedArmed = false;
          btn.textContent = '换一个世界';
        }, 3500);
        return;
      }
      this.reseedArmed = false;
      clearTimeout(this.reseedTimer);
      btn.textContent = '换一个世界';
      this.game.reseed();
    }

    handleReset() {
      if (!this.resetArmed) {
        this.resetArmed = true;
        this.els.resetBtn.textContent = '再点一次确认重置';
        clearTimeout(this.resetTimer);
        this.resetTimer = setTimeout(() => {
          this.resetArmed = false;
          this.els.resetBtn.textContent = '重新生成世界';
        }, 3500);
        return;
      }
      this.resetArmed = false;
      clearTimeout(this.resetTimer);
      this.els.resetBtn.textContent = '重新生成世界';
      this.game.resetWorld();
    }

    toast(message, duration = 1900) {
      const el = this.els.toast;
      el.textContent = message;
      el.classList.add('show');
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => el.classList.remove('show'), duration);
    }

    hideLoading() {
      this.els.loading.classList.add('done');
      setTimeout(() => this.els.loading.classList.add('hidden'), 360);
    }
  }

  MC2D.UI = UI;
})();
