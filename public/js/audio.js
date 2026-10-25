// Procedural "acoustic" audio: Karplus-Strong plucked strings + soft pad + gentle SFX.
// No audio files needed — everything is synthesised with WebAudio.

const NOTE = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class SoundBoard {
  constructor() {
    this.ctx = null;
    this.cache = new Map();
    this.musicOn = false;
    this.enabled = true;
  }

  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 0.8; this.master.connect(ctx.destination);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0.0;
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 0.9;
    // soft room reverb
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.6, 2.2);
    const wet = ctx.createGain(); wet.gain.value = 0.35;
    this.reverb.connect(wet); wet.connect(this.master);
    this.musicBus.connect(this.master); this.musicBus.connect(this.reverb);
    this.sfxBus.connect(this.master); this.sfxBus.connect(this.reverb);
    this.noiseBuf = this.makeNoise(1.0);
  }

  impulse(sec, decay) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }
  makeNoise(sec) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // Karplus-Strong plucked string rendered once per note & brightness, then cached.
  pluckBuffer(midi, bright = 0.5) {
    const key = midi + ':' + bright;
    if (this.cache.has(key)) return this.cache.get(key);
    const ctx = this.ctx, sr = ctx.sampleRate;
    const len = Math.floor(sr * 2.4);
    const buf = ctx.createBuffer(1, len, sr);
    const out = buf.getChannelData(0);
    const period = Math.max(2, Math.round(sr / NOTE(midi)));
    const line = new Float32Array(period);
    // pluck excitation: lowpassed noise for a soft nylon-string feel
    let prev = 0;
    for (let i = 0; i < period; i++) { const n = Math.random() * 2 - 1; prev = prev + (n - prev) * (0.35 + bright * 0.5); line[i] = prev; }
    const damp = 0.996 - (midi > 72 ? (midi - 72) * 0.0009 : 0);
    let idx = 0;
    for (let i = 0; i < len; i++) {
      const nxt = (idx + 1) % period;
      const v = (line[idx] + line[nxt]) * 0.5 * damp;
      out[i] = line[idx];
      line[idx] = v;
      idx = nxt;
    }
    // gentle fade at the end + normalise so every note has a similar loudness
    for (let i = len - 2000; i < len; i++) out[i] *= (len - i) / 2000;
    let pk = 0;
    for (let i = 0; i < 4000; i++) pk = Math.max(pk, Math.abs(out[i]));
    if (pk > 0) { const g = 0.9 / pk; for (let i = 0; i < len; i++) out[i] *= g; }
    this.cache.set(key, buf);
    return buf;
  }

  pluck(midi, when = 0, gain = 0.3, bus = this.sfxBus, bright = 0.5, pan = 0) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.pluckBuffer(midi, bright);
    const g = ctx.createGain(); g.gain.value = gain;
    let node = g;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); node = p; }
    src.connect(g); node.connect(bus);
    src.start(ctx.currentTime + when);
  }

  noise(when, dur, freq, q, gain, type = 'bandpass', bus = this.sfxBus) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    const t = ctx.currentTime + when;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f); f.connect(g); g.connect(bus);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
  }

  tone(when, freq, dur, gain, type = 'sine', bus = this.sfxBus, attack = 0.005) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain(); const t = ctx.currentTime + when;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.05);
  }

  sfx(name) {
    if (!this.ctx || !this.enabled) return;
    const P = (m, w, g, b) => this.pluck(m, w, g, this.sfxBus, b);
    switch (name) {
      case 'grab': this.noise(0, 0.12, 2600, 1.2, 0.18); P(79, 0, 0.12, 0.7); break;
      case 'place': this.tone(0, 320, 0.12, 0.25); P(84, 0.02, 0.16, 0.6); P(88, 0.09, 0.12, 0.6); break;
      case 'drop': this.tone(0, 220, 0.15, 0.18); break;
      case 'snip': this.noise(0, 0.05, 6000, 2, 0.35, 'highpass'); this.noise(0.07, 0.05, 7000, 2, 0.3, 'highpass'); this.tone(0.07, 2400, 0.25, 0.05, 'triangle'); break;
      case 'wrap': for (let i = 0; i < 7; i++) this.noise(i * 0.045 + Math.random() * 0.02, 0.06, 1800 + Math.random() * 2500, 0.8, 0.22); P(76, 0.3, 0.14, 0.5); break;
      case 'ribbon': [72, 76, 79, 84].forEach((m, i) => P(m, i * 0.07, 0.18, 0.6)); break;
      case 'crown': [67, 71, 74, 79].forEach((m, i) => P(m, i * 0.06, 0.16, 0.6)); break;
      case 'bell': [1, 2.76, 5.4, 8.93].forEach((h, i) => this.tone(0, 880 * h, 2.2 / (i + 1), 0.12 / (i + 1))); this.tone(0.35, 1175, 1.6, 0.06); break;
      case 'door': this.tone(0, 1318, 1.2, 0.08); this.tone(0.18, 1046, 1.4, 0.08); break;
      case 'sparkle': [84, 88, 91, 96, 100].forEach((m, i) => P(m, i * 0.05, 0.1, 0.9)); break;
      case 'pop': this.tone(0, 600, 0.08, 0.2); this.tone(0.02, 900, 0.1, 0.12); break;
      case 'hearts': [72, 76, 79, 83, 84].forEach((m, i) => P(m, i * 0.11, 0.2, 0.6)); break;
      case 'sad': [69, 67, 64].forEach((m, i) => P(m, i * 0.18, 0.2, 0.3)); break;
      case 'fanfare': [60, 64, 67, 72, 76, 79, 84].forEach((m, i) => P(m, i * 0.09, 0.22, 0.6)); [72, 76, 79].forEach(m => P(m, 0.75, 0.18, 0.5)); break;
      case 'tick': this.tone(0, 1500, 0.04, 0.06, 'triangle'); break;
      case 'shoo': this.noise(0, 0.3, 900, 0.6, 0.3); P(86, 0.05, 0.12, 0.6); break;
      case 'uh': this.tone(0, 300, 0.25, 0.12, 'triangle'); this.tone(0.12, 240, 0.3, 0.1, 'triangle'); break;
      case 'click': this.tone(0, 900, 0.05, 0.12, 'triangle'); break;
      case 'water': for (let i = 0; i < 5; i++) this.tone(i * 0.04, 500 + Math.random() * 600, 0.08, 0.08); break;
      case 'pluck': this.noise(0, 0.1, 1200, 1, 0.25); this.tone(0.02, 500, 0.08, 0.12); break;
    }
  }

  // A buzzing bee voice with stereo position. Returns {setPan(x), stop()}.
  bee() {
    if (!this.ctx || !this.enabled) return { setPan() {}, setGain() {}, stop() {} };
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 190;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 7; const lg = ctx.createGain(); lg.gain.value = 18;
    lfo.connect(lg); lg.connect(o.frequency);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
    const g = ctx.createGain(); g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.3);
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    o.connect(f); f.connect(g);
    if (p) { g.connect(p); p.connect(this.sfxBus); } else g.connect(this.sfxBus);
    o.start(); lfo.start();
    return {
      setPan: (x) => { if (p) p.pan.setTargetAtTime(Math.max(-1, Math.min(1, x)), ctx.currentTime, 0.05); },
      setGain: (v) => g.gain.setTargetAtTime(0.05 * v, ctx.currentTime, 0.05),
      stop: () => { g.gain.setTargetAtTime(0, ctx.currentTime, 0.08); setTimeout(() => { o.stop(); lfo.stop(); }, 400); },
    };
  }

  // ---------------------------------------------------------------- music
  // Gentle fingerpicked guitar in D major, 6/8 feel, with a warm pad and an occasional melody.
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.musicBus.gain.setTargetAtTime(0.9, this.ctx.currentTime, 1.2);
    const prog = [
      { bass: 50, chord: [62, 66, 69, 73] }, // Dmaj7
      { bass: 47, chord: [62, 66, 69, 71] }, // Bm7
      { bass: 43, chord: [62, 67, 71, 74] }, // Gmaj7
      { bass: 45, chord: [61, 64, 69, 73] }, // A6/9-ish
      { bass: 50, chord: [62, 66, 69, 74] }, // D
      { bass: 54, chord: [61, 66, 69, 73] }, // F#m7
      { bass: 43, chord: [62, 66, 71, 74] }, // G6
      { bass: 45, chord: [62, 64, 67, 73] }, // A7sus
    ];
    const pent = [74, 76, 78, 81, 83, 86];
    const beat = 60 / 76 / 2; // eighth notes
    let step = 0;
    let next = this.ctx.currentTime + 0.2;
    let lastMel = 78;
    const tick = () => {
      if (!this.musicOn) return;
      const now = this.ctx.currentTime;
      while (next < now + 0.6) {
        const bar = Math.floor(step / 6) % prog.length;
        const pos = step % 6;
        const c = prog[bar];
        const w = next - now;
        const human = (Math.random() - 0.5) * 0.012;
        const pattern = [c.bass, c.chord[1], c.chord[2], c.chord[3], c.chord[2], c.chord[1]];
        this.pluck(pattern[pos], w + human, pos === 0 ? 0.45 : 0.24, this.musicBus, pos === 0 ? 0.25 : 0.4, pos % 2 ? 0.25 : -0.2);
        if (pos === 0) {
          this.pad(c.chord, w, beat * 6);
          if (bar % 2 === 0) this.pluck(c.chord[0], w + 0.02, 0.16, this.musicBus, 0.3);
        }
        // sparse melody
        if ((pos === 0 || pos === 3) && Math.random() < 0.42) {
          const choices = pent.filter(m => Math.abs(m - lastMel) <= 5);
          lastMel = choices[Math.floor(Math.random() * choices.length)] || 78;
          this.pluck(lastMel, w + beat * (Math.random() < 0.5 ? 0 : 1), 0.22, this.musicBus, 0.65, 0.1);
        }
        next += beat;
        step++;
      }
      this.musicTimer = setTimeout(tick, 120);
    };
    tick();
  }
  pad(chord, when, dur) {
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    for (const m of chord.slice(0, 3)) {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = NOTE(m - 12); o.detune.value = (Math.random() - 0.5) * 8;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.03, t + dur * 0.4); g.gain.linearRampToValueAtTime(0, t + dur * 1.05);
      o.connect(f); f.connect(g); g.connect(this.musicBus);
      o.start(t); o.stop(t + dur * 1.1);
    }
  }
  stopMusic() {
    if (!this.ctx) return;
    this.musicOn = false;
    clearTimeout(this.musicTimer);
    this.musicBus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.6);
  }
  setMusicVolume(v) { if (this.ctx) this.musicBus.gain.setTargetAtTime(v * 0.9, this.ctx.currentTime, 0.5); }
}
