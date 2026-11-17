// Painel de depuração + botões na tela (alternativa a cada gesto) + teclado.
import { GESTURE_LABELS } from './gestures.js';
import { BONES } from './hands.js';

export class DebugUI {
  constructor(app) {
    this.app = app;
    this.panel = document.getElementById('debug');
    this.stats = document.getElementById('debug-stats');
    this.preview = document.getElementById('preview');
    this.canvas = document.getElementById('cam2d');
    this.ctx = this.canvas.getContext('2d');
    this.enabled = false;
    this._t = 0;
    this._frames = 0;
    this._fpsT0 = performance.now();
    this.fps = 0;
    this.frameMs = 0;

    // Estado das entradas alternativas (lido pelo main.js)
    this.input = { aim: false, run: false, pinch: false, fist: false, keyAim: false, move: { f: 0, r: 0 } };
    this._wireButtons();
    this._wireKeyboard();
  }

  setEnabled(on) {
    this.enabled = on;
    this.panel.hidden = !on;
    this.preview.classList.toggle('offscreen', !on);
    document.getElementById('btn-debug').classList.toggle('on', on);
  }

  _btn(id, fn) {
    const el = document.getElementById(id);
    el.addEventListener('click', (e) => { e.stopPropagation(); fn(el); });
    return el;
  }

  _hold(id, key) {
    const el = document.getElementById(id);
    const on = (e) => { e.preventDefault(); e.stopPropagation(); this.input[key] = true; el.classList.add('on'); };
    const off = (e) => { e.preventDefault(); e.stopPropagation(); this.input[key] = false; el.classList.remove('on'); };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('pointerleave', off);
  }

  _wireButtons() {
    const app = this.app;
    this._btn('btn-recenter', () => { app.recenter(); app.toast('Direção recentrada'); });
    this._btn('btn-aim', (el) => { this.input.aim = !this.input.aim; el.classList.toggle('on', this.input.aim); });
    this._btn('btn-teleport', () => {
      app.teleport.tryJump(performance.now());
      this.input.aim = false;
      document.getElementById('btn-aim').classList.remove('on');
    });
    this._btn('btn-touch', () => { if (!app.interaction.openNearest()) app.toast('Nenhuma caixa perto (chegue a menos de 3 m)'); });
    this._hold('btn-run', 'run');
    this._hold('btn-pinch', 'pinch');
    this._hold('btn-fist', 'fist');
    this._btn('btn-stereo', () => app.toggleVR());
    this._btn('btn-vradjust', () => app.calibration.showVrAdjust());
    this._btn('btn-help', () => app.calibration.showHelp());
    this._btn('btn-full', () => {
      try {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
      } catch (e) { /* ignore */ }
    });
    this._btn('btn-debug', () => this.setEnabled(!this.enabled));
    this._btn('btn-calib', () => app.recalibrate());
  }

  _wireKeyboard() {
    // PC: Q segura = mirar, solta = teleportar · E = tocar · F segura = pinça
    // G segura = punho · R = recentrar · WASD = andar devagar (debug) · B = debug
    const app = this.app;
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === 'q') this.input.keyAim = true;
      if (k === 'e') app.interaction.openNearest();
      if (k === 'f') this.input.pinch = true;
      if (k === 'g') this.input.fist = true;
      if (k === 'r') app.recenter();
      if (k === 'b') this.setEnabled(!this.enabled);
      if (k === 'w') this.input.move.f = 1;
      if (k === 's') this.input.move.f = -1;
      if (k === 'd') this.input.move.r = 1;
      if (k === 'a') this.input.move.r = -1;
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'q') { this.input.keyAim = false; app.teleport.tryJump(performance.now()); }
      if (k === 'f') this.input.pinch = false;
      if (k === 'g') this.input.fist = false;
      if (k === 'w' || k === 's') this.input.move.f = 0;
      if (k === 'a' || k === 'd') this.input.move.r = 0;
    });
  }

  // Chamado todo quadro
  frame(nowMs, dtMs) {
    this._frames++;
    this.frameMs = this.frameMs * 0.9 + dtMs * 0.1;
    if (nowMs - this._fpsT0 >= 500) {
      this.fps = (this._frames * 1000) / (nowMs - this._fpsT0);
      this._frames = 0;
      this._fpsT0 = nowMs;
      document.getElementById('fps').textContent = `${this.fps.toFixed(0)} FPS`;
    }
    if (!this.enabled) return;
    this._drawPreview();
    if (nowMs - this._t < 200) return;
    this._t = nowMs;
    this._writeStats();
  }

  _writeStats() {
    const a = this.app, h = a.hands, o = a.orientation, tp = a.teleport;
    const hand = (x) => {
      if (!x.visible) return `<div><b>${x.side === 'left' ? 'Esquerda' : 'Direita'}</b>: <span class="bad">não vista</span></div>`;
      const f = x.features;
      return `<div><b>${x.side === 'left' ? 'Esquerda' : 'Direita'}</b>${a.locoSide() === x.side ? ' (anda)' : ' (interage)'}: ` +
        `<span class="ok">${GESTURE_LABELS[x.gesture]}</span> conf ${(x.gestureConf * 100).toFixed(0)}% · ` +
        `MP "${x.rawLabel}" ${(x.score * 100).toFixed(0)}% · prof ${x.rawDepth.toFixed(2)}` +
        (f ? `<br><span class="small">dedos ${f.straight.map((s) => s.toFixed(2)).join(' ')} · pol ${f.thumbOut.toFixed(2)} · pin ${f.pinch.toFixed(2)}</span>` : '') + '</div>';
    };
    const p = a.rig.position;
    this.stats.innerHTML =
      `<div><b>${this.fps.toFixed(0)} FPS</b> (${this.frameMs.toFixed(1)} ms) · mãos ${h.detectFps.toFixed(0)}/s, ${h.detectMs.toFixed(1)} ms ${h.delegate}</div>` +
      `<div>Sensor: ${o.source} ${o.hasData ? '✔' : '✖'} (${o.eventCount}) · estado: ${a.state}</div>` +
      hand(h.left) + hand(h.right) +
      (a.locoMode === 'correr' ? `<div>Corrida: ${a.runner.speed.toFixed(1)} m/s · mãos ${(a.runner.handEnergy * 100).toFixed(0)}% · corrida parada ${(a.runner.jogEnergy * 100).toFixed(0)}% · ${a.runner.source}</div>` : '') +
      `<div>Teleporte: ${tp.aiming ? 'mirando' : '—'} ${tp.reason} · espera ${tp.cooldownLeft(performance.now()).toFixed(1)}s · saltos ${tp.jumps}</div>` +
      `<div>Toque: ${isFinite(a.interaction.lastTouchDist) ? a.interaction.lastTouchDist.toFixed(2) + ' m' : '—'} · pos ${p.x.toFixed(1)}, ${p.z.toFixed(1)}</div>`;
  }

  _drawPreview() {
    const v = this.app.hands.video;
    const c = this.canvas;
    const w = v.videoWidth || 640, hgt = v.videoHeight || 480;
    if (c.width !== w || c.height !== hgt) { c.width = w; c.height = hgt; }
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, hgt);
    const res = this.app.hands.lastResult;
    if (!res || !res.landmarks) return;
    ctx.lineWidth = 3;
    for (const hand of this.app.hands.hands) {
      if (!hand.present || !hand.lm) continue;
      ctx.strokeStyle = hand.side === 'left' ? '#3d8bff' : '#ff7a1a';
      ctx.beginPath();
      for (const [a, b] of BONES) {
        ctx.moveTo(hand.lm[a].x * w, hand.lm[a].y * hgt);
        ctx.lineTo(hand.lm[b].x * w, hand.lm[b].y * hgt);
      }
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = '28px sans-serif';
      ctx.fillText(`${hand.side === 'left' ? 'E' : 'D'} ${GESTURE_LABELS[hand.gesture]}`, hand.lm[0].x * w, hand.lm[0].y * hgt + 30);
    }
  }
}
