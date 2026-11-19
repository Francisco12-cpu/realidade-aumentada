// Susto estilo FNAF (v29): o zumbi que veio correndo PULA NA SUA CARA e fica
// colado na tela um tempo, tremendo, de boca aberta e braços levantados,
// gritando. Depois some e a visão fica escura.
// O rosto é uma cópia do zumbi presa à câmera (funciona no óculos e no VR do Chrome).
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { makeZombie } from './zombies.js';
import { playAnim } from './zumbimodelo.js';

export class Jumpscare {
  constructor(camera) {
    this.camera = camera;
    this.t = -1;
    this.m = null;
  }

  get active() { return this.t >= 0; }

  // monta o rosto (uma vez) com materiais próprios (não mexe nos zumbis do jogo)
  _build() {
    if (this.factory) return this._buildModel();
    const m = makeZombie();
    const mats = [];
    m.root.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      if (o.material.emissive) mats.push(o.material);
      o.renderOrder = 49;
      o.frustumCulled = false;
    });
    m.mats = mats; // (as cópias: piscam vermelho sem mexer nos zumbis do jogo)
    m.root.scale.setScalar(1);
    m.mouth = m.head.children.find((c) => c.position.y < 0.1 && c.position.z > 0.1) || null;
    this.camera.add(m.root);
    this.m = m;
  }

  // com o modelo 3D: o rosto é o modelo de verdade, atacando, com a cabeça no meio da visão
  _buildModel() {
    const m = this.factory();
    m.root.scale.setScalar(1);
    m.root.traverse((o) => { if (o.isMesh) o.renderOrder = 49; });
    // altura da cabeça (osso "head" se tiver; senão ~92% da altura)
    m.root.updateMatrixWorld(true);
    const hp = new THREE.Vector3();
    if (m.headBone) m.headBone.getWorldPosition(hp); else hp.set(0, CONFIG.ZOMBIES.MODEL_HEIGHT * 0.92, 0.1);
    m.headY = hp.y; m.headZ = hp.z;
    playAnim(m, m.actions.attack ? 'attack' : 'walk', 0);
    if (m.actions.attack) m.actions.attack.setLoop(THREE.LoopRepeat, Infinity);
    this.camera.add(m.root);
    this.m = m;
  }

  start(onEnd) {
    if (!this.m) this._build();
    if (this.m._hp) this.m._hp = null; // recomeça centralizando
    this.onEnd = onEnd;
    this.t = 0;
    this.m.root.visible = true;
  }

  update(dt) {
    if (this.t < 0) return;
    const R = CONFIG.RUSH;
    this.t += dt;
    const m = this.m, t = this.t;
    // 1) pulo: vem de ~1,6 m até colar na cara em LUNGE_S
    const k = Math.min(1, t / R.LUNGE_S);
    const e = 1 - Math.pow(1 - k, 3);
    const z = THREE.MathUtils.lerp(-1.6, R.FACE_DIST, e);
    // 2) tremendo forte (e cada vez menos no fim)
    const hold = Math.max(0, t - R.LUNGE_S);
    const shake = (k < 1 ? 0.5 : 1) * (1 - Math.min(1, hold / R.HOLD_S) * 0.5);
    const j = () => (Math.random() - 0.5) * 0.035 * shake;
    // a cabeça do zumbi fica bem no meio da visão
    if (m.gltf) {
      m.root.rotation.set(j() * 3, j() * 3, j() * 4);
      m.mixer.update(dt * 1.6);
      // segue a cabeça a cada quadro (a animação mexe ela): fica sempre no meio da visão
      if (!m._hp) { m._hp = new THREE.Vector3(); m.root.position.set(0, -m.headY, z - m.headZ); }
      m.root.updateMatrixWorld(true);
      if (m.headBone) { m.headBone.getWorldPosition(m._hp); this.camera.worldToLocal(m._hp); }
      else m._hp.set(m.root.position.x, m.root.position.y + m.headY, m.root.position.z + m.headZ);
      m.root.position.x += (j() - m._hp.x);
      m.root.position.y += (j() - m._hp.y);
      m.root.position.z += (z + j() - m._hp.z);
      for (const mat of m.mats) mat.emissive.setHex(Math.sin(t * 30) > 0 ? 0x551111 : 0x220000);
      if (hold >= R.HOLD_S) { this.t = -1; m.root.visible = false; const fn = this.onEnd; this.onEnd = null; if (fn) fn(); }
      return;
    }
    m.root.position.set(j(), -1.66 + j(), z - 0.12 + j());
    m.root.rotation.set(j() * 3, j() * 3, j() * 4);
    // braços para cima (agarrando), boca bem aberta, cabeça sacudindo
    m.armL.rotation.set(-2.5 + j() * 6, 0, -0.5);
    m.armR.rotation.set(-2.5 + j() * 6, 0, 0.5);
    m.neck.rotation.set(0.1 + j() * 4, j() * 5, j() * 6);
    if (m.mouth) m.mouth.scale.set(1.3, 3.5 + Math.sin(t * 40) * 1.2, 1);
    for (const mat of m.mats) mat.emissive && mat.emissive.setHex(Math.sin(t * 30) > 0 ? 0x551111 : 0x220000);
    if (hold >= R.HOLD_S) {
      this.t = -1;
      m.root.visible = false;
      const fn = this.onEnd; this.onEnd = null;
      if (fn) fn();
    }
  }

  reset() { this.t = -1; this.onEnd = null; if (this.m) this.m.root.visible = false; }
}
