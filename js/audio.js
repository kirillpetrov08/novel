/* ============================================================
   ЗВУК — спокойная фоновая атмосфера без единого аудиофайла:
   мягкие аккорды-пэды синтезируются WebAudio на лету.
   Размер приложения не растёт, сеть не нужна.
   Включается только после жеста пользователя (политика браузеров).
   ============================================================ */

const Ambient = {
  ctx: null, master: null, timer: null, started: false, chordIdx: 0,
  // тёплая прогрессия: Cmaj7 – Am7 – Fmaj7 – G (частоты, Гц)
  CHORDS: [
    [261.63, 329.63, 392.00, 493.88],
    [220.00, 261.63, 329.63, 392.00],
    [174.61, 220.00, 261.63, 329.63],
    [196.00, 246.94, 293.66, 392.00],
  ],
  CHORD_SEC: 7,

  enabled() { return !!(Store.data && Store.data.settings && Store.data.settings.music); },

  start() {
    if (this.started || !this.enabled()) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      const g = this.ctx.createGain();
      g.gain.value = 0;
      g.connect(this.ctx.destination);
      g.gain.linearRampToValueAtTime(0.055, this.ctx.currentTime + 2.5); // очень тихо
      this.master = g;
      this.started = true;
      this._chord();
      this.timer = setInterval(() => this._chord(), this.CHORD_SEC * 1000);
    } catch (e) { /* нет звука — не падаем */ }
  },

  _chord() {
    if (!this.ctx || !this.master) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const t = this.ctx.currentTime;
    const dur = this.CHORD_SEC + 2.5;
    const notes = this.CHORDS[this.chordIdx++ % this.CHORDS.length];
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 750; lp.Q.value = 0.4;
    lp.connect(this.master);
    notes.forEach((f, i) => {
      [0, 4].forEach(detune => { // лёгкий хор из двух осцилляторов
        const o = this.ctx.createOscillator();
        o.type = i === 0 ? 'sine' : 'triangle';
        o.frequency.value = f; o.detune.value = detune;
        const og = this.ctx.createGain();
        og.gain.setValueAtTime(0, t);
        og.gain.linearRampToValueAtTime(i === 0 ? 0.20 : 0.11, t + 2.8);
        og.gain.setValueAtTime(i === 0 ? 0.20 : 0.11, t + dur - 3.2);
        og.gain.linearRampToValueAtTime(0, t + dur);
        o.connect(og); og.connect(lp);
        o.start(t); o.stop(t + dur + 0.1);
      });
    });
    // Фильтр аккорда отключаем после затухания, иначе узлы копятся часами.
    setTimeout(() => { try { lp.disconnect(); } catch (e) {} }, (dur + 0.5) * 1000);
  },

  stop() {
    if (!this.started) return;
    this.started = false;
    clearInterval(this.timer); this.timer = null;
    const ctx = this.ctx, master = this.master;
    this.ctx = null; this.master = null;
    try {
      if (master && ctx) master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);
      setTimeout(() => { try { ctx && ctx.close(); } catch (e) {} }, 800);
    } catch (e) {}
  },

  /* Единая точка: привести звук в соответствие с настройкой. */
  sync() { if (this.enabled()) this.start(); else this.stop(); },
};
