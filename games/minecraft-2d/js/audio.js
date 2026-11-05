/* 方块世界 2D — 轻量 WebAudio 音效 */
(function () {
  'use strict';

  const MC2D = window.MC2D;

  class GameAudio {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.noiseBuffer = null;
      this.muted = false;
    }

    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.32;
        this.master.connect(this.ctx.destination);
        this.noiseBuffer = this.makeNoise(0.4);
      } catch (err) {
        this.ctx = null;
      }
    }

    makeNoise(seconds) {
      const rate = this.ctx.sampleRate;
      const buffer = this.ctx.createBuffer(1, Math.floor(rate * seconds), rate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      return buffer;
    }

    setMuted(muted) {
      this.muted = muted;
      if (this.master) this.master.gain.value = muted ? 0 : 0.32;
    }

    toggleMute() {
      this.setMuted(!this.muted);
      return this.muted;
    }

    play(name, variant) {
      if (!this.ctx || this.muted) return;
      try {
        switch (name) {
          case 'step': this.step(variant || 0); break;
          case 'jump': this.jump(); break;
          case 'break': this.breakBlock(variant || 0); break;
          case 'place': this.place(); break;
          case 'click': this.click(); break;
          case 'splash': this.splash(); break;
          case 'open': this.open(); break;
          default: break;
        }
      } catch (err) {
        /* 音频失败不应影响游戏 */
      }
    }

    envelope(gainNode, peak, attack, decay) {
      const t = this.ctx.currentTime;
      gainNode.gain.setValueAtTime(0.0001, t);
      gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    }

    noise(duration, peak, filterType, frequency, q) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.value = frequency;
      if (q) filter.Q.value = q;
      const gain = this.ctx.createGain();
      this.envelope(gain, peak, 0.005, duration);
      src.connect(filter).connect(gain).connect(this.master);
      const t = this.ctx.currentTime;
      src.start(t);
      src.stop(t + duration + 0.02);
    }

    tone(freq, endFreq, duration, peak, type, delay) {
      const t = this.ctx.currentTime + (delay || 0);
      const osc = this.ctx.createOscillator();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + duration);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(peak, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      osc.connect(gain).connect(this.master);
      osc.start(t);
      osc.stop(t + duration + 0.02);
    }

    step(variant) {
      this.noise(0.06, 0.055, 'lowpass', 480 + variant * 90, 0.7);
    }

    jump() {
      this.tone(280, 460, 0.12, 0.045, 'triangle');
    }

    breakBlock(hardness) {
      const pitch = Math.max(0, Math.min(1, 1 - (hardness || 0.5)));
      this.noise(0.16, 0.12, 'lowpass', 700 + pitch * 900, 0.8);
      this.tone(150 + pitch * 90, 80, 0.12, 0.06, 'square');
    }

    place() {
      this.tone(190, 120, 0.07, 0.07, 'square');
      this.noise(0.05, 0.05, 'lowpass', 800, 0.6);
    }

    click() {
      this.tone(660, 520, 0.045, 0.035, 'sine');
    }

    splash() {
      this.noise(0.3, 0.09, 'bandpass', 1100, 0.8);
    }

    open() {
      this.tone(420, 620, 0.08, 0.035, 'triangle');
    }
  }

  MC2D.GameAudio = GameAudio;
})();
