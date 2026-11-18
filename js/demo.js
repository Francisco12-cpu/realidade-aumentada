// Mão fantasma do tutorial (v24): uma mão transparente no canto da visão
// mostrando o gesto do passo atual (✋ palma aberta para andar, 👉 pistolinha
// para atirar). Usa o mesmo desenho das mãos do jogador (HandView).
import * as THREE from 'three';
import { HandView } from './hands.js';

// pontos da mão no espaço da câmera: pulso na origem, dedos para cima (+y),
// dobrando para longe de quem olha (-z). open[i] = 0 (dobrado) .. 1 (esticado)
function pose(open, thumbOut = 1) {
  const P = Array.from({ length: 21 }, () => new THREE.Vector3());
  const mcpX = [0.025, 0.008, -0.009, -0.025]; // mão direita vista por trás: polegar à esquerda
  const L = [[0.04, 0.025, 0.022], [0.045, 0.028, 0.024], [0.042, 0.026, 0.022], [0.034, 0.02, 0.018]];
  for (let f = 0; f < 4; f++) {
    const b = 5 + f * 4;
    P[b].set(-mcpX[f], 0.085 - Math.abs(f - 1.5) * 0.004, 0);
    let y = P[b].y, z = 0, ang = 0;
    for (let k = 0; k < 3; k++) {
      ang += (1 - open[f]) * 1.45;
      y += Math.cos(ang) * L[f][k]; z -= Math.sin(ang) * L[f][k];
      P[b + k + 1].set(P[b].x, y, z);
    }
  }
  // polegar
  const tx = 0.035 + 0.03 * thumbOut;
  P[1].set(0.02, 0.02, -0.005); P[2].set(0.04, 0.04, -0.01); P[3].set(tx, 0.06, -0.015); P[4].set(tx + 0.008, 0.08 - 0.02 * (1 - thumbOut), -0.02);
  return P;
}

const OPEN = pose([1, 1, 1, 1]);
const GUN = pose([1, 0.08, 0.05, 0.05], 1);
const RELAX = pose([0.6, 0.55, 0.5, 0.5], 0.6);

export class DemoHand {
  constructor(camera) {
    this.hand = { side: 'right', visible: false, present: false, gesture: 'neutral', camPts: Array.from({ length: 21 }, () => new THREE.Vector3()) };
    this.view = new HandView(camera, this.hand);
    for (const m of [this.view.glove, this.view.jointMat, this.view.tipMat, this.view.palmMat]) { m.transparent = true; m.opacity = 0.5; m.depthTest = false; }
    this.view.group.renderOrder = 52;
    this.view.group.traverse((o) => { o.renderOrder = 52; });
    this.t = 0;
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
  }

  // step: 'walk' | 'aim' | 'shoot' | null
  update(dt, step) {
    const h = this.hand;
    h.visible = !!step;
    if (!step) { this.view.update(); return; }
    this.t += dt;
    const t = this.t;
    let src, tint, pitch = -0.25, yaw = 0;
    if (step === 'walk') {
      // relaxada -> abre a palma e segura (repete)
      const k = Math.min(1, Math.max(0, Math.sin(t * 1.6) * 1.5 + 0.5));
      src = (i) => this._p.lerpVectors(RELAX[i], OPEN[i], k);
      tint = k > 0.8 ? 0x2f7bff : null;
    } else {
      // faz a pistolinha apontando para frente; "coice" de tiro a cada 0,8 s
      const k = Math.min(1, Math.max(0, Math.sin(t * 1.2) * 1.5 + 0.6));
      src = (i) => this._p.lerpVectors(RELAX[i], GUN[i], k);
      pitch = -1.1 + (k > 0.9 ? Math.max(0, 0.25 - ((t % 0.8) * 0.9)) : 0);
      yaw = 0.15;
      tint = k > 0.8 ? 0xe02424 : null;
    }
    this._q.setFromEuler(this._e.set(pitch, yaw, 0));
    // cantinho de baixo à direita da visão
    for (let i = 0; i < 21; i++) h.camPts[i].copy(src(i)).multiplyScalar(0.9).applyQuaternion(this._q).add(this._p.set(0.13, -0.13, -0.42));
    this.view.tint = tint;
    this.view.update();
  }
}
