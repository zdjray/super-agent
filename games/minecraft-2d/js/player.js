/* 方块世界 2D — 玩家物理与碰撞 */
(function () {
  'use strict';

  const MC2D = window.MC2D;
  const { clamp } = MC2D.math;

  const WIDTH = 0.68;
  const HEIGHT = 1.85;
  const GRAVITY = 30;
  const MAX_FALL = 28;
  const WALK_SPEED = 5.4;
  const SPRINT_SPEED = 7.8;
  const JUMP_SPEED = -10.2;
  const FLY_SPEED = 8.5;

  class Player {
    constructor(world, x, y) {
      this.world = world;
      this.x = x;
      this.y = y;
      this.w = WIDTH;
      this.h = HEIGHT;
      this.vx = 0;
      this.vy = 0;
      this.facing = 1;
      this.onGround = false;
      this.inWater = false;
      this.headInWater = false;
      this.flying = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.jumpHeld = false;
      this.walkPhase = 0;
      this.walkAmount = 0;
      this.speed = 0;
      this.spawn = { x, y };
    }

    get centerX() { return this.x + this.w / 2; }
    get centerY() { return this.y + this.h / 2; }

    containsTile(tx, ty) {
      return tx + 1 > this.x && tx < this.x + this.w && ty + 1 > this.y && ty < this.y + this.h;
    }

    collides(px, py) {
      const x0 = Math.floor(px + 0.001);
      const x1 = Math.floor(px + this.w - 0.001);
      const y0 = Math.floor(py + 0.001);
      const y1 = Math.floor(py + this.h - 0.001);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (this.world.isSolid(x, y)) return true;
        }
      }
      return false;
    }

    moveAxis(dx, dy) {
      const isX = dx !== 0;
      let remain = isX ? dx : dy;
      const stepSize = 0.18;
      while (Math.abs(remain) > 1e-7) {
        const step = Math.abs(remain) > stepSize ? Math.sign(remain) * stepSize : remain;
        if (isX) {
          this.x += step;
          if (this.collides(this.x, this.y)) {
            this.x -= step;
            this.vx = 0;
            break;
          }
        } else {
          this.y += step;
          if (this.collides(this.x, this.y)) {
            this.y -= step;
            if (step > 0) {
              this.onGround = true;
            }
            this.vy = 0;
            break;
          }
        }
        remain -= step;
      }
    }

    update(dt, input) {
      const world = this.world;
      const wasOnGround = this.onGround;
      this.onGround = false;
      this.justJumped = false;

      // 是否在水中
      this.inWater = world.isWater(Math.floor(this.centerX), Math.floor(this.centerY)) ||
        world.isWater(Math.floor(this.centerX), Math.floor(this.y + this.h - 0.15));
      this.headInWater = world.isWater(Math.floor(this.centerX), Math.floor(this.y + 0.3));

      // 输入方向
      let dir = 0;
      if (input.left) dir -= 1;
      if (input.right) dir += 1;
      if (dir !== 0) this.facing = dir;
      if (input.jumpPressed) this.jumpBuffer = 0.12;
      else this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
      this.jumpHeld = input.jump;

      if (this.flying) {
        const speed = FLY_SPEED * (input.sprint ? 1.6 : 1);
        this.vx = approach(this.vx, dir * speed, 50 * dt);
        let vy = 0;
        if (input.jump) vy -= speed;
        if (input.down) vy += speed;
        this.vy = approach(this.vy, vy, 50 * dt);
        this.moveAxis(this.vx * dt, 0);
        this.moveAxis(0, this.vy * dt);
      } else if (this.inWater) {
        const speed = 3.2;
        this.vx = approach(this.vx, dir * speed, 18 * dt);
        this.vy += 8 * dt;
        this.vy = Math.min(this.vy, 4.2);
        if (input.jump) this.vy -= 22 * dt;
        if (this.headInWater && input.jump) this.vy -= 10 * dt;
        this.vy = clamp(this.vy, -5.5, 4.2);
        this.moveAxis(this.vx * dt, 0);
        this.moveAxis(0, this.vy * dt);
        // 靠近水面按跳跃可以跳出来
        if (this.onGround && input.jumpPressed && !this.headInWater) {
          this.vy = JUMP_SPEED * 0.85;
          this.justJumped = true;
        }
      } else {
        const speed = input.sprint ? SPRINT_SPEED : WALK_SPEED;
        this.vx = approach(this.vx, dir * speed, (this.onGround || wasOnGround ? 46 : 20) * dt);
        if (dir === 0) {
          const friction = this.onGround || wasOnGround ? 34 : 5;
          this.vx = approach(this.vx, 0, friction * dt);
        }

        this.vy += GRAVITY * dt;
        this.vy = Math.min(this.vy, MAX_FALL);

        // 土狼时间 + 跳跃缓冲
        if (wasOnGround) this.coyote = 0.09;
        else this.coyote = Math.max(0, this.coyote - dt);

        if (this.jumpBuffer > 0 && (this.coyote > 0 || wasOnGround)) {
          this.vy = JUMP_SPEED;
          this.jumpBuffer = 0;
          this.coyote = 0;
          this.justJumped = true;
        }
        if (!input.jump && this.vy < -4) this.vy = -4;

        this.moveAxis(this.vx * dt, 0);
        this.moveAxis(0, this.vy * dt);
      }

      // 世界边界
      this.x = clamp(this.x, 0.02, world.cols - this.w - 0.02);
      this.y = clamp(this.y, 0, world.rows - this.h - 0.02);

      if (this.onGround) {
        this.coyote = 0.09;
      }

      // 行走动画
      this.speed = Math.abs(this.vx);
      if (this.onGround && this.speed > 0.4) {
        this.walkPhase += dt * (4 + this.speed * 0.9);
      } else {
        this.walkPhase += dt * 1.4;
      }
      const targetAmount = this.onGround ? clamp(this.speed / WALK_SPEED, 0, 1) : 0;
      this.walkAmount += (targetAmount - this.walkAmount) * Math.min(1, dt * 10);
    }

    toggleFly() {
      this.flying = !this.flying;
      this.vy = 0;
    }

    teleport(x, y) {
      this.x = x;
      this.y = y;
      this.vx = 0;
      this.vy = 0;
      this.onGround = false;
    }

    serialize() {
      return { x: this.x, y: this.y, flying: this.flying, facing: this.facing };
    }

    restore(data) {
      if (!data) return;
      if (Number.isFinite(data.x) && Number.isFinite(data.y)) {
        this.x = data.x;
        this.y = data.y;
      }
      this.flying = !!data.flying;
      if (data.facing === -1 || data.facing === 1) this.facing = data.facing;
      this.vx = 0;
      this.vy = 0;
    }
  }

  function approach(value, target, amount) {
    if (value < target) return Math.min(target, value + amount);
    if (value > target) return Math.max(target, value - amount);
    return value;
  }

  MC2D.Player = Player;
  MC2D.PLAYER_CONST = { WIDTH, HEIGHT };
})();
