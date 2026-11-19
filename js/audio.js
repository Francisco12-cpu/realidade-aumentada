// Sons e vibração, todos gerados no código (Web Audio): nenhum arquivo para baixar.
//  - bipe do detector: mais rápido e mais agudo quanto mais perto da caixa
//  - caixa aberta, fio certo/errado, caixa consertada, vitória, derrota
//  - alarme no último minuto e contagem nos últimos 10 s
import { CONFIG } from './config.js';

const A = CONFIG.AUDIO;

export class Sfx {
  constructor(options) {
    this.options = options;   // { sound, vibrate } (objeto compartilhado)
    this.ctx = null;
    this.master = null;
    this.nextBeep = 0;
    // o navegador só libera o som depois de um toque: destrava no primeiro
    const unlock = () => this.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = A.VOLUME;
        this.master.connect(this.ctx.destination);
        // v26: música baixa num canal separado
        this.musicBus = this.ctx.createGain();
        this.musicBus.gain.value = 0;
        this.musicBus.connect(this.ctx.destination);
      } catch (e) { this.ctx = null; return; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  get on() { return this.options.sound && this.ctx && this.ctx.state === 'running'; }

  // nota simples com envelope (ataque curto, queda exponencial)
  _tone(freq, dur, { type = 'sine', gain = 0.5, at = 0, slide = 0, dest = null } = {}) {
    if (!this.on) return;
    const c = this.ctx, t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest || this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  _noise(dur, { gain = 0.3, at = 0, freq = 2000, q = 0.8, dest = null } = {}) {
    if (!this.on) return;
    const c = this.ctx, t = c.currentTime + at;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(dest || this.master);
    src.start(t);
  }

  vibrate(pattern) {
    if (!this.options.vibrate || !navigator.vibrate) return;
    try { navigator.vibrate(pattern); } catch (e) { /* */ }
  }

  // ---------------- eventos do jogo ----------------
  open() {
    this._noise(0.12, { gain: 0.25, freq: 900 });
    this._tone(330, 0.12, { type: 'square', gain: 0.12, at: 0.03 });
    this._tone(660, 0.16, { type: 'square', gain: 0.1, at: 0.1 });
    this.vibrate(40);
  }

  grab() { this._tone(520, 0.06, { type: 'triangle', gain: 0.2 }); this.vibrate(15); }

  wire(ok) {
    if (ok) {
      this._tone(880, 0.09, { type: 'triangle', gain: 0.35 });
      this._tone(1320, 0.14, { type: 'triangle', gain: 0.3, at: 0.07 });
      this.vibrate(35);
    } else {
      this._tone(180, 0.22, { type: 'sawtooth', gain: 0.2, slide: -60 });
      this.vibrate([60, 40, 60]);
    }
  }

  fixed() {
    [523, 659, 784, 1047].forEach((f, i) => this._tone(f, 0.18, { type: 'triangle', gain: 0.32, at: i * 0.09 }));
    this._noise(0.4, { gain: 0.12, at: 0.3, freq: 5000 });
    this.vibrate([80, 50, 120]);
  }

  win() {
    const notes = [523, 659, 784, 1047, 784, 1047, 1319];
    notes.forEach((f, i) => this._tone(f, 0.22, { type: 'square', gain: 0.14, at: i * 0.13 }));
    this.vibrate([100, 60, 100, 60, 250]);
  }

  lose() {
    [392, 330, 262, 196].forEach((f, i) => this._tone(f, 0.35, { type: 'sawtooth', gain: 0.14, at: i * 0.28, slide: -20 }));
    this.vibrate([300, 100, 300]);
  }

  alarm() {
    for (let i = 0; i < 3; i++) this._tone(990, 0.16, { type: 'square', gain: 0.18, at: i * 0.24, slide: -300 });
    this.vibrate([150, 90, 150, 90, 150]);
  }

  tick(last) { this._tone(last ? 1400 : 1000, 0.07, { type: 'square', gain: 0.14 }); }

  // Bipe do detector: chame todo quadro com a distância até a caixa mais próxima.
  detector(dist, nowS) {
    if (!this.on || dist == null || dist > A.BEEP_MAX_DIST) return;
    if (nowS < this.nextBeep) return;
    const k = Math.min(1, Math.max(0, (dist - CONFIG.DETECTOR.NEAR) / (A.BEEP_MAX_DIST - CONFIG.DETECTOR.NEAR))); // 0 perto, 1 longe
    const interval = A.BEEP_NEAR_S + (A.BEEP_FAR_S - A.BEEP_NEAR_S) * k * k;
    this.nextBeep = nowS + interval;
    this._tone(1500 - 700 * k, 0.05, { type: 'sine', gain: 0.22 - 0.1 * k });
  }

  // ---------------- zumbis ----------------
  shot() {
    this._noise(0.16, { gain: 0.55, freq: 1400 });
    this._noise(0.32, { gain: 0.28, freq: 300, at: 0.01 });
    this._tone(140, 0.14, { type: 'square', gain: 0.25, slide: -90 });
    this.vibrate(30);
  }

  cock() { this._tone(1900, 0.03, { type: 'square', gain: 0.12 }); this._tone(1200, 0.03, { type: 'square', gain: 0.1, at: 0.05 }); }

  zombieHit(kill) {
    this._noise(0.1, { gain: 0.35, freq: 600 });
    if (kill) {
      this._tone(220, 0.5, { type: 'sawtooth', gain: 0.2, slide: -150, at: 0.05 });
      this._tone(160, 0.6, { type: 'sawtooth', gain: 0.12, slide: -100, at: 0.12 });
    } else this._tone(300, 0.18, { type: 'sawtooth', gain: 0.16, slide: -120 });
  }

  // v19: soco/tapa (pancada seca, mais forte no golpe final)
  punch(kill) {
    this._noise(0.07, { gain: 0.6, freq: 900 });
    this._tone(110, 0.12, { type: 'sine', gain: 0.5, slide: -60 });
    if (kill) this._tone(200, 0.45, { type: 'sawtooth', gain: 0.18, slide: -140, at: 0.06 });
    this.vibrate(kill ? [40, 30, 60] : 35);
  }

  // ---------------- v26: som 3D (fone de ouvido) ----------------
  // Cada som de zumbi sai do lugar onde ele está (HRTF): com fone, dá para
  // saber se ele vem pela esquerda, pela direita ou por TRÁS.
  _at(pos) {
    const c = this.ctx, p = c.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = A.REF_DIST;
    p.maxDistance = 60;
    p.rolloffFactor = A.ROLLOFF;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
    p.connect(this.master);
    return p;
  }

  // posição e direção da cabeça (chamar todo quadro)
  listener(pos, fwd, up) {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    if (L.positionX) {
      const t = this.ctx.currentTime;
      L.positionX.setValueAtTime(pos.x, t); L.positionY.setValueAtTime(pos.y, t); L.positionZ.setValueAtTime(pos.z, t);
      L.forwardX.setValueAtTime(fwd.x, t); L.forwardY.setValueAtTime(fwd.y, t); L.forwardZ.setValueAtTime(fwd.z, t);
      L.upX.setValueAtTime(up.x, t); L.upY.setValueAtTime(up.y, t); L.upZ.setValueAtTime(up.z, t);
    } else {
      L.setPosition(pos.x, pos.y, pos.z);
      L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    }
  }

  // v27: VOZ de zumbi: rosnado com "gorgolejo" (tremido rápido), passando por
  // formantes de garganta, e um chiado AGUDO de respiração. O agudo é o que o
  // ouvido usa para saber a direção (som grave sozinho quase não tem direção).
  groanAt(pos, angry = false) {
    if (!this.on) return;
    const c = this.ctx, t = c.currentTime, g = A.ZOMBIE_VOL;
    const dest = this._at(pos);
    const dur = (angry ? 1.0 : 1.5) + Math.random() * 0.8;
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.9 * g, t + 0.12);
    env.gain.setValueAtTime(0.9 * g, t + dur * 0.6);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    env.connect(dest);
    // garganta: dente de serra com vibrato, tremido (gorgolejo) e formantes
    const o = c.createOscillator(); o.type = 'sawtooth';
    const f0 = (angry ? 120 : 85) + Math.random() * 40;
    o.frequency.setValueAtTime(f0 * 1.2, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.75, t + dur);
    const vib = c.createOscillator(); vib.frequency.value = 5 + Math.random() * 3; const vg = c.createGain(); vg.gain.value = f0 * 0.08; vib.connect(vg).connect(o.frequency);
    const trem = c.createGain(); trem.gain.value = 0.6;
    const am = c.createOscillator(); am.frequency.value = 16 + Math.random() * 14; const ag = c.createGain(); ag.gain.value = 0.4; am.connect(ag).connect(trem.gain);
    o.connect(trem);
    for (const [ff, q, gg] of [[550, 5, 1], [1150, 7, 0.7], [2600, 9, 0.45]]) {
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = ff * (0.9 + Math.random() * 0.2); bp.Q.value = q;
      const fg = c.createGain(); fg.gain.value = gg * 2.2; trem.connect(bp).connect(fg).connect(env);
    }
    // respiração rouca (agudo: dá a direção)
    this._noise(dur * 0.9, { gain: 0.45 * g, freq: 3200 + Math.random() * 1500, q: 1.1, dest: env });
    for (const n of [o, vib, am]) { n.start(t); n.stop(t + dur + 0.05); }
  }

  // passo arrastado (com raspado agudo do pé no chão: também dá a direção)
  stepAt(pos) {
    if (!this.on) return;
    const dest = this._at(pos);
    this._noise(0.1, { gain: 0.6 * A.ZOMBIE_VOL, freq: 170 + Math.random() * 90, q: 1.2, dest });
    this._noise(0.22, { gain: 0.3 * A.ZOMBIE_VOL, freq: 2600 + Math.random() * 1200, q: 1.5, at: 0.03, dest });
    this._tone(58, 0.08, { type: 'sine', gain: 0.3 * A.ZOMBIE_VOL, dest });
  }

  // v28: susto do braço: "vuuush" que passa de um lado para o outro do fone
  // (acompanha o braço) + rugido GRAVE e pancada funda. Bem alto.
  swipe(dir = 1) {
    if (!this.on) return;
    const c = this.ctx, t = c.currentTime;
    const pan = c.createStereoPanner ? c.createStereoPanner() : null;
    const out = c.createGain(); out.gain.value = 1;
    if (pan) {
      pan.pan.setValueAtTime(-dir, t);
      pan.pan.linearRampToValueAtTime(dir, t + 0.3);
      out.connect(pan).connect(this.master);
    } else out.connect(this.master);
    // vento do golpe: ruído com filtro que sobe rápido
    const n = Math.floor(c.sampleRate * 0.5), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / n);
    const src = c.createBufferSource(); src.buffer = buf;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(250, t); bp.frequency.exponentialRampToValueAtTime(2800, t + 0.22); bp.frequency.exponentialRampToValueAtTime(600, t + 0.45);
    const wg = c.createGain(); wg.gain.value = 1.6 * A.SCARE_VOL;
    src.connect(bp).connect(wg).connect(out); src.start(t);
    // rugido grave e pancada funda (no meio, nos dois ouvidos)
    this._tone(62, 0.9, { type: 'sawtooth', gain: 0.9 * A.SCARE_VOL, slide: -24, at: 0.05 });
    this._tone(41, 1.1, { type: 'square', gain: 0.5 * A.SCARE_VOL, slide: -12, at: 0.06 });
    this._tone(34, 0.5, { type: 'sine', gain: 1.2 * A.SCARE_VOL, slide: -14, at: 0.12 });
    this._noise(0.35, { gain: 0.9 * A.SCARE_VOL, freq: 140, q: 0.7, at: 0.12 });
    this.vibrate([180, 40, 120]);
  }

  // v27: apagão (zumbido elétrico que cai) antes do susto
  blackout() {
    if (!this.on) return;
    this._tone(120, 0.4, { type: 'square', gain: 0.25, slide: -80 });
    this._noise(0.15, { gain: 0.4, freq: 5000, q: 2 });
    this.musicBus && this.musicBus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    this._duck = -1; // depois do apagão, a música volta sozinha
  }

  // v27: a música abaixa quando um zumbi está perto (os zumbis ficam em primeiro plano)
  duck(nearest) {
    if (!this.ctx || !this._mus || !this.musicBus) return;
    const on = this.options.sound && this.options.music !== false;
    const k = !on ? 0 : nearest < 4 ? 0.25 : nearest < 10 ? 0.6 : 1;
    const target = A.MUSIC_VOL * k;
    if (Math.abs(target - (this._duck ?? -1)) < 1e-4) return;
    this._duck = target;
    this.musicBus.gain.setTargetAtTime(target, this.ctx.currentTime, 0.6);
  }

  // v27: grito distante vindo de algum lugar (3D)
  distantScream(pos) {
    if (!this.on) return;
    const dest = this._at(pos);
    this._tone(700 + Math.random() * 300, 1.4, { type: 'sawtooth', gain: 0.35, slide: 500, dest });
    this._noise(1.2, { gain: 0.4, freq: 2200, q: 1, dest });
  }

  // grito do susto (jumpscare): bem alto, de onde ele está e também "na cara"
  screamAt(pos) {
    if (!this.on) return;
    const dest = this._at(pos);
    this._noise(1.3, { gain: 1.6, freq: 2400, q: 0.6, dest });
    this._noise(1.0, { gain: 1.0, freq: 4500, q: 0.8, dest });
    this._tone(520, 1.1, { type: 'sawtooth', gain: 0.8, slide: 1100, dest });
    this._tone(780, 1.0, { type: 'square', gain: 0.45, slide: 900, at: 0.05, dest });
    this._tone(1300, 0.7, { type: 'sawtooth', gain: 0.3, slide: -400, at: 0.1, dest });
    this._noise(0.6, { gain: 0.9, freq: 900 });
    this._tone(55, 0.9, { type: 'sine', gain: 1.0, slide: -25 });
    this.vibrate([250, 60, 250]);
  }

  // coração batendo (zumbi perto)
  heartbeat(k = 1) {
    if (!this.on) return;
    this._tone(52, 0.13, { type: 'sine', gain: 0.55 * k });
    this._tone(48, 0.16, { type: 'sine', gain: 0.45 * k, at: 0.2 });
  }

  // música de fundo de terror (baixinha): zumbido grave, vento e sininhos
  music(on) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    if (on && !this._mus) {
      const out = c.createGain(); out.gain.value = 1; out.connect(this.musicBus);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; lp.Q.value = 4; lp.connect(out);
      const o1 = c.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 55;
      const o2 = c.createOscillator(); o2.type = 'triangle'; o2.frequency.value = 55 * 1.5 + 0.7;
      const o3 = c.createOscillator(); o3.type = 'sine'; o3.frequency.value = 55 * 1.059;
      for (const o of [o1, o2, o3]) { o.connect(lp); o.start(); }
      const lfo = c.createOscillator(); lfo.frequency.value = 0.07; const lg = c.createGain(); lg.gain.value = 120; lfo.connect(lg).connect(lp.frequency); lfo.start();
      // vento: ruído em loop, filtrado, subindo e descendo
      const n = c.sampleRate * 3, buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.7;
      const wg = c.createGain(); wg.gain.value = 0.25;
      const lfo2 = c.createOscillator(); lfo2.frequency.value = 0.11; const lg2 = c.createGain(); lg2.gain.value = 0.18; lfo2.connect(lg2).connect(wg.gain); lfo2.start();
      src.connect(bp).connect(wg).connect(out); src.start();
      this._mus = { nodes: [o1, o2, o3, lfo, lfo2, src], out };
      // sininho dissonante de vez em quando (e às vezes um grito longe)
      this._musT = setInterval(() => {
        if (!this.on || !this._mus) return;
        if (Math.random() < 0.35 && this.onDistant) { this.onDistant(); return; }
        const f = [622, 740, 831, 1108][Math.floor(Math.random() * 4)];
        const g = c.createGain(); g.connect(this.musicBus);
        const o = c.createOscillator(); o.frequency.value = f; o.connect(g);
        const tt = c.currentTime; g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.25, tt + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, tt + 3.5);
        o.start(tt); o.stop(tt + 3.6);
      }, 9000);
    }
    const vol = on && this.options.sound && this.options.music !== false ? A.MUSIC_VOL : 0;
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setTargetAtTime(vol, t, 0.8);
  }

  // gemido: mais alto quanto mais perto
  groan(dist) {
    const k = Math.max(0.15, 1 - dist / 10);
    const f = 85 + Math.random() * 40;
    this._tone(f, 0.9, { type: 'sawtooth', gain: 0.16 * k, slide: -25 });
    this._tone(f * 1.5, 0.7, { type: 'triangle', gain: 0.08 * k, slide: -30, at: 0.08 });
  }

  hurt() {
    this._noise(0.25, { gain: 0.45, freq: 250 });
    this._tone(110, 0.3, { type: 'square', gain: 0.22, slide: -40 });
    this.vibrate([120, 40, 120]);
  }

  resetDetector() { this.nextBeep = 0; }
}
