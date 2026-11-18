// Dica no cantinho da tela: mostra os gestos o tempo todo, sem atrapalhar.
//   ✋ mão aberta = andar · 👉 pistolinha = mirar · 👍⬇ abaixar o polegar = atirar
// No tutorial, marca o passo atual; na partida, acende o gesto que está sendo feito.
// Aparece no canto (HTML) e, no óculos, num painel pequeno preso à visão (3D).
import * as THREE from 'three';

export const COACH_STEPS = [
  { id: 'walk', icon: '✋', text: 'Esquerda aberta = anda' },
  { id: 'aim', icon: '🎯', text: 'Olhe para o zumbi = mira' },
  { id: 'shoot', icon: '👉', text: 'Direita pistolinha = atira' },
];

export class Coach {
  constructor(camera) {
    this.el = document.getElementById('coach');
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 300;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.0996), mat);
    this.mesh.position.set(-0.13, -0.085, -0.6);
    this.mesh.renderOrder = 51;
    this.mesh.visible = false;
    camera.add(this.mesh);
    this._key = '';
    this.visible = false;
  }

  // st: { show, stereo, title, cur, done:{walk,aim,shoot}, active:{walk,aim,shoot}, gun:'off'|'ready'|'reload', note }
  update(st) {
    this.visible = !!st.show;
    this.el.hidden = !st.show;
    this.mesh.visible = !!(st.show && st.stereo);
    if (!st.show) return;
    const key = JSON.stringify(st);
    if (key === this._key) return;
    this._key = key;
    // HTML (tela normal)
    const rows = COACH_STEPS.map((s) => {
      const cls = [st.done[s.id] ? 'done' : '', st.cur === s.id ? 'cur' : '', st.active[s.id] ? 'act' : ''].join(' ');
      return `<div class="row ${cls}"><span class="ic">${s.icon}</span><span>${s.text}</span>${st.done[s.id] ? '<span class="ok">✔</span>' : ''}</div>`;
    }).join('');
    const gun = st.gun === 'ready' ? '<span class="gun ready">● arma pronta</span>' : st.gun === 'reload' ? '<span class="gun reload">● recarregando… (barra)</span>' : '';
    this.el.innerHTML = `${st.title ? `<div class="title">${st.title}</div>` : ''}${rows}${gun}${st.note ? `<div class="note">${st.note}</div>` : ''}`;
    if (st.stereo) this._draw(st);
  }

  _draw(st) {
    const c = this.ctx, W = this.canvas.width, H = this.canvas.height;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(10,6,6,0.66)';
    rr(c, 4, 4, W - 8, H - 8, 26); c.fill();
    c.textBaseline = 'middle';
    let y = 36;
    if (st.title) {
      c.fillStyle = '#ffd36b'; c.font = 'bold 30px system-ui, sans-serif'; c.textAlign = 'left';
      c.fillText(st.title, 22, y, W - 44); y += 46;
    }
    for (const s of COACH_STEPS) {
      const on = st.active[s.id], cur = st.cur === s.id;
      if (cur || on) { c.fillStyle = cur ? 'rgba(255,60,60,0.35)' : 'rgba(80,220,120,0.3)'; rr(c, 12, y - 26, W - 24, 52, 14); c.fill(); }
      c.font = '34px system-ui, sans-serif'; c.textAlign = 'left';
      c.fillStyle = '#fff';
      c.fillText(s.icon, 22, y);
      c.font = `${cur ? 'bold ' : ''}30px system-ui, sans-serif`;
      c.fillStyle = st.done[s.id] ? '#8fe3a8' : '#ffffff';
      c.fillText(s.text + (st.done[s.id] ? ' ✔' : ''), 98, y, W - 120);
      y += 58;
    }
    if (st.gun === 'ready' || st.gun === 'reload') {
      c.font = 'bold 28px system-ui, sans-serif';
      c.fillStyle = st.gun === 'ready' ? '#ff4040' : '#b0b4ba';
      c.fillText(st.gun === 'ready' ? '● pronta' : '● recarregando', 22, Math.min(y, H - 26));
    }
    this.tex.needsUpdate = true;
  }
}

function rr(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
