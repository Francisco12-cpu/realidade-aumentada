// Susto do braço (v28): um braço de zumbi passa MUITO rápido bem na frente
// da visão, atravessando as bordas da lente (entra de fora e sai do outro
// lado), com som alto e grave. Depois a visão fica escura por um tempo.
// Preso à câmera: funciona na tela, no óculos próprio e no VR do Chrome.
import * as THREE from 'three';
import { CONFIG } from './config.js';

export function makeArm() {
  const skin = new THREE.MeshLambertMaterial({ color: 0x8a9f78, depthTest: false });
  const dark = new THREE.MeshLambertMaterial({ color: 0x5f6e52, depthTest: false });
  const blood = new THREE.MeshBasicMaterial({ color: 0x5a0606, depthTest: false });
  const nail = new THREE.MeshLambertMaterial({ color: 0x2b2a22, depthTest: false });
  const arm = new THREE.Group();
  // antebraço (vem de fora da tela, comprido) e manga rasgada
  const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.5, 10), skin);
  fore.rotation.z = Math.PI / 2; fore.position.x = -0.3; arm.add(fore);
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.16, 8), new THREE.MeshLambertMaterial({ color: 0x3b2f2a, depthTest: false }));
  sleeve.rotation.z = Math.PI / 2; sleeve.position.x = -0.52; arm.add(sleeve);
  const cut = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.012, 0.05), blood); cut.position.set(-0.28, 0.03, 0.02); arm.add(cut);
  // mão aberta com garras
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.03, 0.085), dark); palm.position.x = 0.0; arm.add(palm);
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Group();
    f.position.set(0.045, 0, -0.033 + i * 0.022);
    f.rotation.y = (i - 1.5) * 0.12;
    const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.014, 0.014), skin); s1.position.x = 0.025; f.add(s1);
    const s2 = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.012, 0.012), skin); s2.position.x = 0.062; s2.rotation.z = -0.5; f.add(s2);
    const claw = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.025, 5), nail); claw.rotation.z = -Math.PI / 2 - 0.6; claw.position.set(0.085, -0.012, 0); f.add(claw);
    arm.add(f);
  }
  const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.014, 0.016), skin); thumb.position.set(0.02, 0, 0.05); thumb.rotation.y = -0.7; arm.add(thumb);
  arm.traverse((o) => { o.renderOrder = 48; o.frustumCulled = false; });
  return arm;
}

export class ArmSwipe {
  constructor(camera) {
    this.arm = makeArm();
    this.arm.visible = false;
    camera.add(this.arm);
    this.t = -1;
    // tela escura depois do susto (avermelhada)
    this.dim = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ color: 0x0c0000, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    this.dim.position.z = -0.104; this.dim.renderOrder = 43; this.dim.frustumCulled = false; this.dim.visible = false;
    camera.add(this.dim);
    this.dimK = 0;
    this._a = new THREE.Vector3(); this._b = new THREE.Vector3();
  }

  get active() { return this.t >= 0; }

  // começa um golpe: dir = +1 (esquerda→direita) ou -1
  start(dir = Math.random() < 0.5 ? 1 : -1) {
    const S = CONFIG.SWIPE;
    this.dir = dir;
    this.t = 0;
    // entra por uma borda (fora da visão) e sai pela outra, em diagonal
    const up = Math.random() < 0.5 ? 1 : -1;
    this._a.set(-dir * 0.62, up * (0.16 + Math.random() * 0.1), -0.36);
    this._b.set(dir * 0.62, -up * (0.12 + Math.random() * 0.12), -0.3);
    this.roll = up * 0.5;
    this.arm.visible = true;
    this.dur = S.DUR_MS / 1000;
  }

  update(dt) {
    const S = CONFIG.SWIPE;
    if (this.t >= 0) {
      this.t += dt;
      const k = Math.min(1, this.t / this.dur);
      const e = k * k * (3 - 2 * k); // acelera e freia (golpe)
      this.arm.position.lerpVectors(this._a, this._b, e);
      // o braço aponta para onde vai (garras na frente) e gira um pouco
      this.arm.rotation.set(0.25, this.dir > 0 ? 0 : Math.PI, this.roll * (1 - 2 * e) * this.dir);
      if (k >= 1) {
        this.t = -1;
        this.arm.visible = false;
        this.dimK = 1; // escurece a visão
      }
    }
    if (this.dimK > 0) {
      this.dimK = Math.max(0, this.dimK - dt / S.DIM_S);
      // fica bem escuro no começo e clareia devagar
      this.dim.material.opacity = S.DIM_MAX * Math.pow(this.dimK, 0.6);
    }
    this.dim.visible = this.dimK > 0.01;
  }

  reset() { this.t = -1; this.arm.visible = false; this.dimK = 0; this.dim.visible = false; }
}
