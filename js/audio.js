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
      } catch (e) { this.ctx = null; return; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  get on() { return this.options.sound && this.ctx && this.ctx.state === 'running'; }

  // nota simples com envelope (ataque curto, queda exponencial)
  _tone(freq, dur, { type = 'sine', gain = 0.5, at = 0, slide = 0 } = {}) {
    if (!this.on) return;
    const c = this.ctx, t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  _noise(dur, { gain = 0.3, at = 0, freq = 2000 } = {}) {
    if (!this.on) return;
    const c = this.ctx, t = c.currentTime + at;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(this.master);
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
