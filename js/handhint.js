// Aviso quando o jogo não vê a mão: "mostre a mão" ou "pouca luz".
// Mede o brilho da câmera numa imagem pequenininha (32x24), duas vezes por segundo.
import { CONFIG } from './config.js';

const HH = CONFIG.HAND_HINT;

export class HandHint {
  constructor(app) {
    this.app = app;
    this.el = document.getElementById('hand-hint');
    this.canvas = document.createElement('canvas');
    this.canvas.width = 32;
    this.canvas.height = 24;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.brightness = null;   // 0..255 (média da imagem)
    this.lastSeen = performance.now();
    this.lastMeasure = 0;
    this.shown = '';
    this.lastHudToast = 0;
  }

  _measure() {
    const v = this.app.hands.video;
    if (!v || !v.videoWidth || v.readyState < 2) return;
    try {
      this.ctx.drawImage(v, 0, 0, 32, 24);
      const d = this.ctx.getImageData(0, 0, 32, 24).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      this.brightness = sum / (d.length / 4);
    } catch (e) { this.brightness = null; }
  }

  // Chamar todo quadro. active = tutorial ou partida.
  update(now, active) {
    const app = this.app;
    const tracking = !!(app.hands.landmarker && app.hands.stream);
    if (app.hands.hands.some((h) => h.visible)) this.lastSeen = now;
    if (!active || !tracking) { this._set(''); this.lastSeen = now; return; }
    if (now - this.lastMeasure > 500) { this.lastMeasure = now; this._measure(); }
    let msg = '';
    const lost = now - this.lastSeen;
    if (lost > 1500 && this.brightness != null && this.brightness < HH.DARK) {
      msg = '💡 Pouca luz ou câmera tapada: vá para um lugar mais claro e deixe a câmera de trás livre.';
    } else if (lost > HH.NO_HAND_MS) {
      msg = app.stereo || app.xrActive
        ? '✋ Mostre a mão na frente do celular (a tampa da câmera do óculos precisa estar aberta)'
        : '✋ Mostre a mão para a câmera de trás do celular';
    }
    this._set(msg);
    // no óculos o aviso em HTML não aparece: manda para o painel 3D de vez em quando
    if (msg && (app.stereo || app.xrActive) && now - this.lastHudToast > 3000) {
      this.lastHudToast = now;
      app.hud3d.toast(msg.replace(/\(.*\)/, '').trim());
    }
  }

  _set(msg) {
    if (msg === this.shown || !this.el) return;
    this.shown = msg;
    this.el.textContent = msg;
    this.el.classList.toggle('show', !!msg);
  }
}
