// Susto da borda preta do óculos (v31). A borda escura da lente é um lugar
// que o jogador "esquece": a escuridão avança devagar para dentro, mãos com
// garras saem do preto agarrando para dentro da visão e, no susto grande, o
// rosto do zumbi rompe a escuridão e pula na sua cara.
//  big = true: mãos + rosto (susto grande) · false: só as mãos (susto pequeno)
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { makeArm } from './swipe.js';

// escuridão que fecha a partir da borda (pelo ângulo do centro da visão)
function makeDark() {
  const D = 0.11;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false,
    uniforms: { strength: { value: 0 }, inner: { value: 0.8 }, outer: { value: 1.2 }, t: { value: 0 } },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float strength, inner, outer, t; varying vec2 vP;
      void main(){
        float r = length(vP) / ${D.toFixed(3)};
        float ang = atan(vP.y, vP.x);
        // borda "viva": a escuridão ondula (parece algo se mexendo no preto)
        float wob = 0.06 * sin(ang * 7.0 + t * 3.0) + 0.04 * sin(ang * 13.0 - t * 5.0);
        float a = smoothstep(inner + wob, outer + wob, r) * strength;
        gl_FragColor = vec4(0.0, 0.0, 0.0, a);
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(D * 10, D * 10), mat);
  m.position.z = -D;
  m.renderOrder = 47;
  m.frustumCulled = false;
  m.visible = false;
  return m;
}

export class BorderScare {
  constructor(camera) {
    this.dark = makeDark();
    camera.add(this.dark);
    this.arms = [makeArm(), makeArm()];
    for (const a of this.arms) { a.visible = false; camera.add(a); }
    this.t = -1;
    this._p = new THREE.Vector3();
  }

  get active() { return this.t >= 0; }

  // onFace: chamado quando o rosto deve pular (susto grande); onEnd: no fim
  start(big, { onFace, onEnd, onHands } = {}) {
    this.big = big;
    this.t = 0;
    this.onFace = onFace; this.onEnd = onEnd; this.onHands = onHands;
    this._faceDone = false; this._handsDone = false;
    // lados por onde as mãos saem: esquerda, direita, de cima (uma ou duas mãos)
    const sides = ['left', 'right', 'top'].sort(() => Math.random() - 0.5);
    this.sides = big ? sides.slice(0, 2) : sides.slice(0, 1);
    this.dark.visible = true;
  }

  // posição da mão saindo da borda: k = 0 (escondida no preto) .. 1 (para dentro)
  _place(arm, side, k, t, i) {
    const B = CONFIG.BORDA;
    const out = 0.62, inn = 0.62 - B.HAND_REACH * k;
    const claw = Math.sin(t * 9 + i * 2) * 0.12 * k; // garras arranhando
    const z = -0.42;
    if (side === 'left') { arm.position.set(-inn, -0.05 + Math.sin(t * 2 + i) * 0.03, z); arm.rotation.set(0.3, 0, claw - 0.15); }
    else if (side === 'right') { arm.position.set(inn, -0.02 + Math.sin(t * 2.3 + i) * 0.03, z); arm.rotation.set(0.3, Math.PI, claw - 0.15); }
    else { arm.position.set(Math.sin(t * 1.7 + i) * 0.05, out * 0.72 - B.HAND_REACH * 0.7 * k, z); arm.rotation.set(0.3, 0, -Math.PI / 2 + claw); }
    arm.visible = k > 0.02;
  }

  update(dt) {
    if (this.t < 0) return;
    const B = CONFIG.BORDA;
    this.t += dt;
    const t = this.t, u = this.dark.material.uniforms;
    u.t.value = t;
    // 1) a escuridão fecha devagar (com uma "respiração")
    const close = Math.min(1, t / B.CLOSE_S);
    const breathe = 0.04 * Math.sin(t * 5);
    const end = this.big ? B.CLOSE_S + B.HANDS_S : B.CLOSE_S + B.HANDS_S + B.RETREAT_S;
    let release = 0;
    if (t > end) release = Math.min(1, (t - end) / B.RELEASE_S);
    u.strength.value = Math.min(1, close * 1.2) * (1 - release);
    u.inner.value = THREE.MathUtils.lerp(0.95, B.INNER_MIN, close) + breathe + release * 0.5;
    u.outer.value = u.inner.value + 0.35;
    // 2) mãos saindo do preto (e voltando no susto pequeno)
    const h0 = B.CLOSE_S * 0.5;
    let k = THREE.MathUtils.clamp((t - h0) / B.HANDS_S, 0, 1);
    if (!this.big && t > B.CLOSE_S + B.HANDS_S) k = 1 - Math.min(1, (t - B.CLOSE_S - B.HANDS_S) / B.RETREAT_S);
    if (this.big && t > B.CLOSE_S + B.HANDS_S) k = 1; // seguram até o rosto pular
    k = k * k * (3 - 2 * k);
    if (k > 0.05 && !this._handsDone) { this._handsDone = true; this.onHands && this.onHands(this.sides[0]); }
    this.arms.forEach((a, i) => { if (i < this.sides.length) this._place(a, this.sides[i], k, t, i); else a.visible = false; });
    // 3) susto grande: o rosto rompe a escuridão
    if (this.big && !this._faceDone && t > B.CLOSE_S + B.HANDS_S) {
      this._faceDone = true;
      for (const a of this.arms) a.visible = false;
      this.onFace && this.onFace();
    }
    if (release >= 1) this._finish();
  }

  _finish() {
    this.t = -1;
    this.dark.visible = false;
    for (const a of this.arms) a.visible = false;
    const fn = this.onEnd; this.onEnd = null;
    if (fn) fn();
  }

  reset() { this.t = -1; this.dark.visible = false; for (const a of this.arms) a.visible = false; this.onEnd = null; }
}
