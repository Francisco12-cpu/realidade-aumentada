// Saguão do óculos (v14): painel 3D preso à visão, para começar a jogar
// SEM tirar o celular do rosto.
//  - contagem "coloque o óculos no rosto" (10 s) e depois começa sozinho;
//  - ✋ mão aberta parada ~1,5 s começa na hora (anel enchendo);
//  - no fim da partida mostra os pontos e "mão aberta = jogar de novo".
// Funciona na tela normal, no modo óculos próprio e no WebXR.
import * as THREE from 'three';

export class Lobby {
  constructor(camera) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 320;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.25), mat);
    this.mesh.position.set(0, -0.02, -0.6);
    this.mesh.renderOrder = 55;
    this.mesh.visible = false;
    camera.add(this.mesh);
    this.active = false;
    this._key = '';
  }

  // opts: { title, lines:[...], countdownS (0 = sem contagem), holdMs, onGo }
  open(opts) {
    this.opts = { holdMs: 1500, countdownS: 0, lines: [], ...opts };
    this.active = true;
    this.t0 = performance.now();
    this.holdStart = 0;
    this.status = '';
    this.mesh.visible = true;
    this._key = '';
  }

  close() { this.active = false; this.mesh.visible = false; }

  // v25: botão A/Start do controle = começar na hora (respeita o tempo de espera)
  press(now, ready = true) {
    if (!this.active || !ready) return;
    if (this.opts.armMs && now - this.t0 < this.opts.armMs) return;
    this._go();
  }

  setStatus(s) { this.status = s; }

  // palm: tem mão aberta agora? ready: câmera/mãos prontas (contagem só anda pronta)
  update(now, palm, ready = true) {
    if (!this.active) return;
    const o = this.opts;
    if (!ready) { this.t0 = now; this.holdStart = 0; }
    let left = 0;
    if (o.countdownS) {
      left = Math.max(0, o.countdownS - (now - this.t0) / 1000);
      if (ready && left <= 0) { this._go(); return; }
    }
    let hold = 0;
    if (o.armMs && now - this.t0 < o.armMs) palm = false; // não começa sem querer logo ao abrir
    if (ready && palm) {
      if (!this.holdStart) this.holdStart = now;
      hold = Math.min(1, (now - this.holdStart) / o.holdMs);
      if (hold >= 1) { this._go(); return; }
    } else this.holdStart = 0;
    this._draw(o, Math.ceil(left), hold, ready);
  }

  _go() {
    const fn = this.opts.onGo;
    this.close();
    if (fn) fn();
  }

  _draw(o, left, hold, ready) {
    const key = `${left}|${Math.round(hold * 30)}|${ready}|${this.status}`;
    if (key === this._key) return;
    this._key = key;
    const c = this.ctx, W = this.canvas.width, H = this.canvas.height;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(10,6,6,0.78)';
    lobbyRect(c, 4, 4, W - 8, H - 8, 28); c.fill();
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#ffd36b'; c.font = 'bold 36px system-ui, sans-serif';
    c.fillText(o.title || '', W / 2, 44, W - 40);
    c.fillStyle = '#ffffff'; c.font = '26px system-ui, sans-serif';
    let y = 92;
    for (const l of o.lines) { c.fillText(l, W / 2, y, W - 40); y += 36; }
    // anel: contagem no meio, enche com a mão aberta
    const cx = W / 2, cy = H - 78, R = 46;
    c.lineWidth = 10;
    c.strokeStyle = 'rgba(255,255,255,0.18)';
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke();
    if (hold > 0) {
      c.strokeStyle = '#5be37d';
      c.beginPath(); c.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + hold * Math.PI * 2); c.stroke();
    }
    c.fillStyle = '#ffffff'; c.font = 'bold 40px system-ui, sans-serif';
    c.fillText(!ready ? '…' : o.countdownS ? String(left) : '✋', cx, cy + 2);
    if (this.status) {
      c.font = '20px system-ui, sans-serif'; c.fillStyle = '#b8c4cf';
      c.fillText(this.status, W / 2, H - 16, W - 30);
    }
    this.tex.needsUpdate = true;
  }
}

function lobbyRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
