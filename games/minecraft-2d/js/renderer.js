/* 方块世界 2D — Canvas 渲染器 */
(function () {
  'use strict';

  const MC2D = window.MC2D;
  const { clamp, lerp, smoothRange } = MC2D.math;
  const { hash2 } = MC2D.noise;
  const BLOCKS = MC2D.BLOCKS;

  const TILE = 32;
  const DAY_LENGTH = 300;

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.lightCanvas = document.createElement('canvas');
      this.lightCtx = this.lightCanvas.getContext('2d');
      this.tile = TILE;
      this.dayLength = DAY_LENGTH;
      this.time = 0;
      this.camera = { x: 0, y: 0 };
      this.viewW = 0;
      this.viewH = 0;
      this.dpr = 1;
      this.world = null;
      this.shake = 0;
      this.fps = 60;
      this.cracks = buildCracks();
      this.stars = buildStars();
      this.clouds = buildClouds();
      this.caveBg = buildCaveTexture();
      this.resize();
    }

    setWorld(world) {
      this.world = world;
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.dpr = dpr;
      this.viewW = window.innerWidth;
      this.viewH = window.innerHeight;
      this.canvas.width = Math.max(1, Math.round(this.viewW * dpr));
      this.canvas.height = Math.max(1, Math.round(this.viewH * dpr));
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.ctx.imageSmoothingEnabled = false;

      this.lightCanvas.width = this.canvas.width;
      this.lightCanvas.height = this.canvas.height;
      this.lightCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.lightCtx.imageSmoothingEnabled = false;
    }

    updateCamera(dt, player, snap) {
      const targetX = player.centerX * this.tile - this.viewW / 2;
      const targetY = player.centerY * this.tile - this.viewH / 2 + 26;
      if (snap) {
        this.camera.x = targetX;
        this.camera.y = targetY;
      } else {
        const k = 1 - Math.exp(-dt * 9);
        this.camera.x = lerp(this.camera.x, targetX, k);
        this.camera.y = lerp(this.camera.y, targetY, k);
      }
      this.clampCamera();
    }

    clampCamera() {
      if (!this.world) return;
      const worldW = this.world.cols * this.tile;
      const worldH = this.world.rows * this.tile;
      const maxX = Math.max(0, worldW - this.viewW);
      const maxY = Math.max(0, worldH - this.viewH);
      this.camera.x = clamp(this.camera.x, 0, maxX);
      this.camera.y = clamp(this.camera.y, 0, maxY);
    }

    screenToWorld(sx, sy) {
      return {
        x: (sx + this.camera.x) / this.tile,
        y: (sy + this.camera.y) / this.tile
      };
    }

    /** 当前时间对应的太阳高度、白昼强度与日落强度。 */
    solar() {
      const t = ((this.time / this.dayLength) % 1 + 1) % 1;
      const arc = t * Math.PI * 2;
      const sunAlt = Math.sin(arc);
      const daylight = smoothRange(-0.18, 0.32, sunAlt);
      const dusk = clamp(1 - Math.abs(sunAlt) / 0.38, 0, 1) * smoothRange(-0.35, -0.02, sunAlt);
      return { t, arc, sunAlt, daylight, dusk, night: 1 - daylight };
    }

    render(game) {
      const ctx = this.ctx;
      const { viewW, viewH } = this;
      this.time = game.time;
      this.world = game.world;
      const solar = this.solar();

      const shakeX = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
      const shakeY = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
      const camX = Math.round(this.camera.x + shakeX);
      const camY = Math.round(this.camera.y + shakeY);

      ctx.clearRect(0, 0, viewW, viewH);
      this.drawSky(ctx, solar, camX, camY);
      this.drawClouds(ctx, solar, camX, camY);
      this.drawHills(ctx, solar, camX, camY);
      this.drawTiles(ctx, camX, camY, solar, game);
      this.drawParticles(ctx, camX, camY, game.particles);
      this.drawPlayer(ctx, game.player, camX, camY, solar);
      this.drawMining(ctx, game, camX, camY);
      this.drawLighting(ctx, game, solar, camX, camY);
      this.drawSelection(ctx, game, camX, camY);
      this.drawOverlays(ctx, game);

      if (this.shake > 0.1) this.shake *= 0.86;
      else this.shake = 0;
    }

    /* ---------------- sky & background ---------------- */

    drawSky(ctx, solar, camX, camY) {
      const { viewW, viewH } = this;
      const dayTop = [86, 156, 236];
      const dayBottom = [198, 231, 255];
      const nightTop = [7, 11, 26];
      const nightBottom = [20, 30, 56];
      const duskTop = [63, 54, 104];
      const duskBottom = [255, 148, 82];

      let top = mix(nightTop, dayTop, solar.daylight);
      let bottom = mix(nightBottom, dayBottom, solar.daylight);
      top = mix(top, duskTop, solar.dusk * 0.72);
      bottom = mix(bottom, duskBottom, solar.dusk * 0.8);

      const grad = ctx.createLinearGradient(0, 0, 0, viewH);
      grad.addColorStop(0, rgb(top));
      grad.addColorStop(0.62, rgb(bottom));
      grad.addColorStop(1, rgb(mix(bottom, [46, 62, 44], 0.28)));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, viewW, viewH);

      // 星星
      if (solar.night > 0.05) {
        ctx.save();
        ctx.globalAlpha = solar.night * 0.9;
        for (const star of this.stars) {
          const twinkle = 0.55 + 0.45 * Math.sin(this.time * 1.7 + star.phase);
          ctx.globalAlpha = solar.night * 0.9 * twinkle;
          ctx.fillStyle = star.warm ? '#ffe7b8' : '#eaf2ff';
          const sx = (star.x * viewW - camX * 0.01 + viewW) % viewW;
          const sy = star.y * viewH * 0.62 - camY * 0.01;
          ctx.fillRect(sx, sy, star.size, star.size);
        }
        ctx.restore();
      }

      this.drawSunMoon(ctx, solar, camX, camY);
    }

    drawSunMoon(ctx, solar, camX, camY) {
      const { viewW, viewH } = this;
      const horizon = viewH * 0.74 - (camY - this.camera.y) * 0.02;
      const t = solar.t;

      let body = null;
      if (t < 0.5) {
        const prog = t / 0.5;
        const alt = Math.sin(prog * Math.PI);
        body = {
          x: viewW * (0.08 + 0.84 * prog),
          y: horizon - alt * viewH * 0.62,
          sun: true,
          alt
        };
      } else {
        const prog = (t - 0.5) / 0.5;
        const alt = Math.sin(prog * Math.PI);
        body = {
          x: viewW * (0.08 + 0.84 * prog),
          y: horizon - alt * viewH * 0.62,
          sun: false,
          alt
        };
      }

      ctx.save();
      const radius = body.sun ? 30 : 24;
      const glow = ctx.createRadialGradient(body.x, body.y, radius * 0.4, body.x, body.y, radius * 4);
      if (body.sun) {
        glow.addColorStop(0, 'rgba(255, 236, 158, 0.5)');
        glow.addColorStop(0.4, 'rgba(255, 190, 90, 0.16)');
        glow.addColorStop(1, 'rgba(255, 170, 60, 0)');
      } else {
        glow.addColorStop(0, 'rgba(200, 224, 255, 0.32)');
        glow.addColorStop(0.5, 'rgba(140, 175, 255, 0.1)');
        glow.addColorStop(1, 'rgba(120, 160, 255, 0)');
      }
      ctx.fillStyle = glow;
      ctx.fillRect(body.x - radius * 4, body.y - radius * 4, radius * 8, radius * 8);

      if (body.sun) {
        const low = 1 - body.alt;
        ctx.fillStyle = `rgb(${255}, ${Math.round(236 - low * 40)}, ${Math.round(170 - low * 60)})`;
        ctx.fillRect(Math.round(body.x - radius / 2), Math.round(body.y - radius / 2), radius, radius);
        ctx.fillStyle = 'rgba(255, 255, 235, 0.75)';
        ctx.fillRect(Math.round(body.x - radius / 2 + 5), Math.round(body.y - radius / 2 + 5), radius - 10, radius - 10);
      } else {
        ctx.fillStyle = 'rgba(226, 235, 250, 0.95)';
        ctx.fillRect(Math.round(body.x - radius / 2), Math.round(body.y - radius / 2), radius, radius);
        ctx.fillStyle = 'rgba(170, 185, 210, 0.65)';
        ctx.fillRect(Math.round(body.x - 5), Math.round(body.y - 6), 6, 6);
        ctx.fillRect(Math.round(body.x + 3), Math.round(body.y + 2), 4, 4);
        ctx.fillRect(Math.round(body.x - 2), Math.round(body.y + 7), 3, 3);
      }
      ctx.restore();
    }

    drawClouds(ctx, solar, camX, camY) {
      const { viewW, viewH } = this;
      const brightness = 0.35 + solar.daylight * 0.65;
      const base = Math.round(235 * brightness + 30);
      ctx.save();
      ctx.globalAlpha = 0.16 + solar.daylight * 0.42;
      for (const cloud of this.clouds) {
        const speed = this.time * cloud.speed;
        const total = viewW + 600;
        let x = (cloud.x * total - camX * 0.06 - speed) % total;
        if (x < -300) x += total;
        const y = cloud.y * viewH * 0.42 - camY * 0.02 + Math.sin(this.time * 0.15 + cloud.phase) * 4;
        ctx.fillStyle = `rgb(${base}, ${base + 4}, ${base + 10})`;
        ctx.fillRect(Math.round(x), Math.round(y), cloud.w, cloud.h);
        ctx.fillRect(Math.round(x + cloud.w * 0.18), Math.round(y - cloud.h * 0.6), cloud.w * 0.55, cloud.h * 0.7);
        ctx.fillRect(Math.round(x + cloud.w * 0.5), Math.round(y - cloud.h * 0.25), cloud.w * 0.4, cloud.h * 0.4);
      }
      ctx.restore();
    }

    drawHills(ctx, solar, camX, camY) {
      const { viewW, viewH } = this;
      const night = solar.night;
      const layers = [
        { base: 0.64, amp: 34, freq: 0.0022, parallax: 0.06, color: mix([108, 148, 128], [22, 30, 48], night), seed: 1.7, alpha: 0.85 },
        { base: 0.71, amp: 46, freq: 0.0034, parallax: 0.14, color: mix([73, 118, 83], [15, 23, 38], night), seed: 4.2, alpha: 0.9 },
        { base: 0.79, amp: 34, freq: 0.0051, parallax: 0.24, color: mix([47, 84, 55], [10, 17, 28], night), seed: 9.1, alpha: 0.92 }
      ];
      for (const layer of layers) {
        const baseY = viewH * layer.base - camY * 0.03;
        ctx.save();
        ctx.globalAlpha = layer.alpha;
        ctx.fillStyle = rgb(layer.color);
        ctx.beginPath();
        ctx.moveTo(0, viewH);
        for (let sx = 0; sx <= viewW + 8; sx += 8) {
          const wx = (sx + camX * layer.parallax) * layer.freq;
          const y = baseY + Math.sin(wx + layer.seed) * layer.amp + Math.sin(wx * 2.6 + layer.seed * 1.7) * layer.amp * 0.4;
          ctx.lineTo(sx, y);
        }
        ctx.lineTo(viewW, viewH);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    /* ---------------- world ---------------- */

    drawTiles(ctx, camX, camY, solar, game) {
      const world = game.world;
      const ts = this.tile;
      const x0 = Math.max(0, Math.floor(camX / ts) - 1);
      const y0 = Math.max(0, Math.floor(camY / ts) - 1);
      const x1 = Math.min(world.cols - 1, Math.ceil((camX + this.viewW) / ts) + 1);
      const y1 = Math.min(world.rows - 1, Math.ceil((camY + this.viewH) / ts) + 1);
      const seed = world.seed;

      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const id = world.tiles[y * world.cols + x];
          const px = x * ts - camX;
          const py = y * ts - camY;
          if (id === 0) {
            if (y >= world.heights[x]) {
              ctx.drawImage(this.caveBg, px, py, ts, ts);
            }
            continue;
          }
          const def = BLOCKS[id];
          const variants = def.variants;
          const tex = variants.length > 1 ? variants[(hash2(x, y, seed) * variants.length) | 0] : variants[0];

          if (id === 8) {
            ctx.globalAlpha = 0.86;
            ctx.drawImage(tex, px, py, ts, ts);
            ctx.globalAlpha = 1;
            const above = y > 0 ? world.tiles[(y - 1) * world.cols + x] : 0;
            if (above !== 8) {
              const bob = Math.sin(this.time * 2.2 + x * 0.9) * 1.5;
              ctx.fillStyle = 'rgba(170, 225, 255, 0.38)';
              ctx.fillRect(px, Math.round(py + bob), ts, 2);
              ctx.fillStyle = 'rgba(120, 190, 245, 0.18)';
              ctx.fillRect(px, Math.round(py + 3 + bob), ts, 3);
            }
            continue;
          }
          ctx.drawImage(tex, px, py, ts, ts);
        }
      }

      // 火把的火焰跳动光晕在光照阶段统一绘制
    }

    drawParticles(ctx, camX, camY, particles) {
      if (!particles) return;
      for (const p of particles) {
        const alpha = clamp(p.life / p.maxLife, 0, 1);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        const s = Math.max(1, Math.round(p.size));
        ctx.fillRect(Math.round(p.x * this.tile - camX), Math.round(p.y * this.tile - camY), s, s);
      }
      ctx.globalAlpha = 1;
    }

    drawPlayer(ctx, player, camX, camY, solar) {
      const ts = this.tile;
      const w = player.w * ts;
      const h = player.h * ts;
      const sx = Math.round(player.x * ts - camX);
      const sy = Math.round(player.y * ts - camY);

      // 影子
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = '#000';
      const onGround = player.onGround && !player.flying;
      const shadowY = sy + h + 1;
      ctx.beginPath();
      ctx.ellipse(sx + w / 2, shadowY, (w / 2) * (onGround ? 1 : 0.7), 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      const swing = Math.sin(player.walkPhase) * (player.walkAmount || 0) * 5;
      const inAir = !player.onGround && !player.inWater && !player.flying;
      const bob = player.onGround ? Math.sin(player.walkPhase * 2) * 0.5 * (player.walkAmount || 0) : 0;

      ctx.save();
      ctx.translate(Math.round(sx + w / 2), Math.round(sy + h + bob));
      if (player.facing < 0) ctx.scale(-1, 1);

      const legTop = -Math.round(h * 0.28);
      const legH = Math.round(h * 0.27);
      const torsoH = Math.round(h * 0.39);
      const torsoTop = legTop - torsoH;
      const headH = Math.round(h * 0.33);
      const headTop = torsoTop - headH + 3;
      const headW = Math.round(w * 0.94);
      const torsoW = Math.round(w * 0.72);
      const skin = '#d9a066';
      const skinShadow = '#c58a52';
      const shirt = '#2f9c8f';
      const shirtDark = '#247a70';
      const pants = '#3d4f8c';
      const pantsDark = '#2f3d6e';
      const hair = '#3a2818';
      const shoe = '#6c6c6c';

      // 腿
      const legW = Math.round(w * 0.3);
      const legSwing = inAir ? 2 : swing * 0.7;
      drawLimb(ctx, -Math.round(w * 0.34) + legSwing, legTop, legW, legH, pants, pantsDark, shoe);
      drawLimb(ctx, Math.round(w * 0.04) - legSwing, legTop, legW, legH, pants, pantsDark, shoe);

      // 身体
      ctx.fillStyle = shirt;
      ctx.fillRect(-Math.round(torsoW / 2), torsoTop, torsoW, torsoH);
      ctx.fillStyle = shirtDark;
      ctx.fillRect(-Math.round(torsoW / 2), torsoTop + torsoH - 2, torsoW, 2);
      ctx.fillRect(Math.round(torsoW / 2) - 2, torsoTop, 2, torsoH);

      // 手臂
      const armW = Math.round(w * 0.26);
      const armH = Math.round(torsoH * 0.95);
      const armTop = torsoTop + 2;
      const armSwing = inAir ? -3 : swing * 0.9;
      drawLimb(ctx, -Math.round(torsoW / 2) - armW + 2 - armSwing, armTop, armW, armH, shirt, shirtDark, skin);
      drawLimb(ctx, Math.round(torsoW / 2) - 2 + armSwing, armTop, armW, armH, shirtDark, shirtDark, skin);

      // 头
      const hx = -Math.round(headW / 2);
      ctx.fillStyle = skin;
      ctx.fillRect(hx, headTop, headW, headH);
      ctx.fillStyle = skinShadow;
      ctx.fillRect(hx + headW - 2, headTop, 2, headH);
      ctx.fillStyle = hair;
      ctx.fillRect(hx, headTop, headW, Math.round(headH * 0.34));
      ctx.fillRect(hx, headTop, 2, headH);
      // 眼睛与嘴
      const eyeY = headTop + Math.round(headH * 0.48);
      ctx.fillStyle = '#f4f1e8';
      ctx.fillRect(hx + Math.round(headW * 0.32), eyeY, 4, 3);
      ctx.fillRect(hx + Math.round(headW * 0.68), eyeY, 4, 3);
      ctx.fillStyle = '#293241';
      ctx.fillRect(hx + Math.round(headW * 0.32) + 2, eyeY + 1, 2, 2);
      ctx.fillRect(hx + Math.round(headW * 0.68) + 2, eyeY + 1, 2, 2);
      ctx.fillStyle = skinShadow;
      ctx.fillRect(hx + Math.round(headW * 0.3), eyeY + 8, Math.round(headW * 0.42), 2);

      // 手上的方块 / 火把
      if (player.heldBlock) {
        const held = BLOCKS[player.heldBlock];
        if (held) {
          const hs = Math.round(ts * 0.55);
          const hx2 = Math.round(torsoW / 2) + 3;
          const hy2 = armTop + armH - hs + 4;
          ctx.globalAlpha = 0.95;
          ctx.drawImage(held.variants[0], hx2, hy2, hs, hs);
          ctx.globalAlpha = 1;
        }
      }

      ctx.restore();
    }

    drawMining(ctx, game, camX, camY) {
      const mining = game.mining;
      if (!mining || mining.progress <= 0) return;
      const stage = Math.min(9, Math.floor(mining.progress * 10));
      const tex = this.cracks[stage];
      if (!tex) return;
      const ts = this.tile;
      const px = mining.x * ts - camX;
      const py = mining.y * ts - camY;
      ctx.globalAlpha = 0.72;
      ctx.drawImage(tex, px, py, ts, ts);
      ctx.globalAlpha = 1;
    }

    drawSelection(ctx, game, camX, camY) {
      const target = game.hovered;
      if (!target || game.paused) return;
      const ts = this.tile;
      const px = target.x * ts - camX;
      const py = target.y * ts - camY;
      const inReach = game.hoveredInReach;
      ctx.save();
      ctx.lineWidth = 2;
      ctx.strokeStyle = inReach ? 'rgba(255, 255, 255, 0.85)' : 'rgba(255, 96, 96, 0.8)';
      ctx.strokeRect(px + 1, py + 1, ts - 2, ts - 2);
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.strokeRect(px + 3.5, py + 3.5, ts - 7, ts - 7);
      ctx.restore();
    }

    /* ---------------- lighting ---------------- */

    drawLighting(ctx, game, solar, camX, camY) {
      const world = game.world;
      const ts = this.tile;
      const { viewW, viewH } = this;
      const lctx = this.lightCtx;
      lctx.clearRect(0, 0, viewW, viewH);

      const x0 = Math.max(0, Math.floor(camX / ts) - 1);
      const y0 = Math.max(0, Math.floor(camY / ts) - 1);
      const x1 = Math.min(world.cols - 1, Math.ceil((camX + viewW) / ts) + 1);
      const y1 = Math.min(world.rows - 1, Math.ceil((camY + viewH) / ts) + 1);

      // 视野外扩一圈，保证边缘火光正确
      const margin = 12;
      const lx = Math.max(0, x0 - margin);
      const ly = Math.max(0, y0 - margin);
      const lw = Math.min(world.cols - 1, x1 + margin) - lx + 1;
      const lh = Math.min(world.rows - 1, y1 + margin) - ly + 1;
      const blockLight = world.computeBlockLight(lx, ly, lw, lh);

      const skyScale = 0.16 + solar.daylight * 0.84;
      const ambient = 0.52 + solar.night * 0.18;

      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = y * world.cols + x;
          const sky = world.sky[i] * skyScale;
          const bl = blockLight[(y - ly) * lw + (x - lx)] || 0;
          const level = Math.max(sky, bl);
          const alpha = ambient * Math.pow(1 - Math.min(1, level / 15), 1.45);
          if (alpha < 0.008) continue;
          lctx.fillStyle = `rgba(4, 7, 17, ${alpha.toFixed(3)})`;
          lctx.fillRect(x * ts - camX, y * ts - camY, ts + 1, ts + 1);
        }
      }

      // 玩家附近保留一点可见度
      const px = game.player.centerX * ts - camX;
      const py = game.player.centerY * ts - camY;
      const radius = 150;
      const cut = lctx.createRadialGradient(px, py, 10, px, py, radius);
      cut.addColorStop(0, 'rgba(0,0,0,0.55)');
      cut.addColorStop(0.55, 'rgba(0,0,0,0.22)');
      cut.addColorStop(1, 'rgba(0,0,0,0)');
      lctx.save();
      lctx.globalCompositeOperation = 'destination-out';
      lctx.fillStyle = cut;
      lctx.fillRect(px - radius, py - radius, radius * 2, radius * 2);
      lctx.restore();

      ctx.drawImage(this.lightCanvas, 0, 0, viewW, viewH);

      // 暖色火光
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const def = BLOCKS[world.tiles[y * world.cols + x]];
          if (!def.light || def.light < 10) continue;
          const cx = (x + 0.5) * ts - camX;
          const cy = (y + 0.5) * ts - camY;
          const flicker = 0.9 + Math.sin(this.time * 8 + x * 1.7) * 0.1;
          const r = ts * 4.2 * flicker;
          const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
          glow.addColorStop(0, 'rgba(255, 176, 72, 0.22)');
          glow.addColorStop(0.45, 'rgba(255, 150, 48, 0.09)');
          glow.addColorStop(1, 'rgba(255, 140, 40, 0)');
          ctx.fillStyle = glow;
          ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

          if (world.tiles[y * world.cols + x] === 16) {
            const flame = 0.7 + Math.sin(this.time * 11 + x * 3) * 0.3;
            ctx.fillStyle = `rgba(255, 214, 120, ${0.5 * flame})`;
            ctx.fillRect(cx - 2, cy - 10, 4, 6);
          }
        }
      }
      ctx.restore();
    }

    drawOverlays(ctx, game) {
      const { viewW, viewH } = this;
      if (game.player.headInWater) {
        const grad = ctx.createLinearGradient(0, 0, 0, viewH);
        grad.addColorStop(0, 'rgba(18, 74, 150, 0.3)');
        grad.addColorStop(1, 'rgba(8, 38, 92, 0.42)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, viewW, viewH);
      }

      const vignette = ctx.createRadialGradient(
        viewW / 2, viewH / 2, Math.min(viewW, viewH) * 0.35,
        viewW / 2, viewH / 2, Math.max(viewW, viewH) * 0.72
      );
      vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
      vignette.addColorStop(1, 'rgba(0, 0, 0, 0.28)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, viewW, viewH);
    }
  }

  /* ---------------- helpers ---------------- */

  function drawLimb(ctx, x, y, w, h, main, shade, bottom) {
    ctx.fillStyle = main;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = shade;
    ctx.fillRect(x + w - Math.max(1, Math.round(w * 0.22)), y, Math.max(1, Math.round(w * 0.22)), h);
    if (bottom) {
      ctx.fillStyle = bottom;
      ctx.fillRect(x, y + h - Math.max(2, Math.round(h * 0.16)), w, Math.max(2, Math.round(h * 0.16)));
    }
  }

  function mix(a, b, t) {
    return [
      Math.round(a[0] + (b[0] - a[0]) * t),
      Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t)
    ];
  }

  function rgb(c) {
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  }

  function buildCracks() {
    const result = [];
    const rng = new MC2D.RNG(0x51ce77);
    const lines = [];
    for (let i = 0; i < 18; i++) {
      lines.push({
        x: 2 + rng.int(12),
        y: 2 + rng.int(12),
        dx: rng.int(3) - 1,
        dy: rng.int(3) - 1,
        len: 2 + rng.int(4)
      });
    }
    for (let stage = 0; stage < 10; stage++) {
      const c = document.createElement('canvas');
      c.width = 16;
      c.height = 16;
      const ctx = c.getContext('2d');
      const count = Math.floor(((stage + 1) / 10) * lines.length);
      ctx.strokeStyle = 'rgba(20, 16, 12, 0.85)';
      ctx.lineWidth = 1;
      for (let i = 0; i < count; i++) {
        const l = lines[i];
        ctx.beginPath();
        ctx.moveTo(l.x, l.y);
        ctx.lineTo(l.x + l.dx * l.len, l.y + l.dy * l.len);
        ctx.stroke();
      }
      result.push(c);
    }
    return result;
  }

  function buildStars() {
    const rng = new MC2D.RNG(0x57a25);
    const stars = [];
    for (let i = 0; i < 170; i++) {
      stars.push({
        x: rng.next(),
        y: rng.next() * 0.8,
        size: rng.chance(0.15) ? 2 : 1,
        phase: rng.next() * Math.PI * 2,
        warm: rng.chance(0.25)
      });
    }
    return stars;
  }

  function buildCaveTexture() {
    const c = document.createElement('canvas');
    c.width = 16;
    c.height = 16;
    const ctx = c.getContext('2d');
    const rng = new MC2D.RNG(0xcafe01);
    ctx.fillStyle = '#241f19';
    ctx.fillRect(0, 0, 16, 16);
    const colors = ['#2b251e', '#1a1612', '#312a22', '#15110e', '#28221b'];
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = rng.pick(colors);
      ctx.fillRect(rng.int(16), rng.int(16), 1 + rng.int(2), 1 + rng.int(2));
    }
    return c;
  }

  function buildClouds() {
    const rng = new MC2D.RNG(0xc10d);
    const clouds = [];
    for (let i = 0; i < 14; i++) {
      clouds.push({
        x: rng.next(),
        y: 0.12 + rng.next() * 0.35,
        w: 50 + rng.int(120),
        h: 14 + rng.int(20),
        speed: 3 + rng.next() * 8,
        phase: rng.next() * 10
      });
    }
    return clouds;
  }

  MC2D.Renderer = Renderer;
  MC2D.RENDER_CONST = { TILE, DAY_LENGTH };
})();
