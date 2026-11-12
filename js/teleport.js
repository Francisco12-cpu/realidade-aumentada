// Locomoção por teleporte: pistolinha = mirar (parábola + marcador),
// palma aberta logo depois = teleportar. Com limites de distância e espera
// entre saltos, para parecer "andar" e não "voar".
import * as THREE from 'three';
import { CONFIG } from './config.js';

const T = CONFIG.TELEPORT;

export class Teleport {
  constructor(scene, rig, camera, world, hooks = {}) {
    this.rig = rig;
    this.camera = camera;
    this.world = world;
    this.hooks = hooks;

    this.positions = new Float32Array((T.MAX_STEPS + 2) * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x00e5ff }));
    this.line.frustumCulled = false;
    this.line.visible = false;
    scene.add(this.line);

    this.marker = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 32), new THREE.MeshBasicMaterial({ color: 0x00e5ff, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.08, 16), ring.material);
    dot.rotation.x = -Math.PI / 2;
    this.marker.add(ring, dot);
    this.marker.position.y = 0.02;
    this.marker.visible = false;
    scene.add(this.marker);
    this.markerMat = ring.material;

    this.aiming = false;
    this.valid = false;
    this.reason = '';
    this.target = new THREE.Vector3();
    this.lastValid = new THREE.Vector3();
    this.lastAimTime = -1e9;
    this.lastJump = -1e9;
    this.jumps = 0;
    this._lastGesture = 'none';
    this._o = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._n = new THREE.Vector3();
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
  }

  cooldownLeft(nowMs) { return Math.max(0, T.COOLDOWN_S - (nowMs - this.lastJump) / 1000); }

  // Simula a parábola a partir de origin/dir (mundo). Preenche a linha e o alvo.
  compute(origin, dir, nowMs) {
    const d = this._d.copy(dir).normalize();
    d.y += T.UP_BIAS;
    d.normalize();
    const v = this._v.copy(d).multiplyScalar(T.SPEED);
    const p = this._p.copy(origin);
    let n = 0;
    const push = (q) => { this.positions[n * 3] = q.x; this.positions[n * 3 + 1] = q.y; this.positions[n * 3 + 2] = q.z; n++; };
    push(p);
    let landed = false;
    this.valid = false;
    this.reason = 'sem chão';
    for (let i = 0; i < T.MAX_STEPS; i++) {
      const next = this._n.copy(p).addScaledVector(v, T.STEP_DT);
      v.y -= T.GRAVITY * T.STEP_DT;
      const hit = this.world.segmentHit(p, next);
      if (hit && (next.y > 0 || hit.point.y > 0.001)) {
        push(hit.point);
        this.target.copy(hit.point);
        this.reason = 'bloco no caminho';
        landed = true;
        break;
      }
      if (next.y <= 0) {
        const k = p.y / Math.max(1e-6, p.y - next.y);
        next.lerpVectors(p, next, k);
        next.y = 0;
        push(next);
        this.target.copy(next);
        this._validateGround(nowMs);
        landed = true;
        break;
      }
      push(next);
      p.copy(next);
    }
    if (!landed) this.target.copy(p);
    this.line.geometry.setDrawRange(0, n);
    this.line.geometry.attributes.position.needsUpdate = true;
  }

  _validateGround(nowMs) {
    const pos = this.rig.position;
    const dx = this.target.x - pos.x, dz = this.target.z - pos.z;
    let dist = Math.hypot(dx, dz);
    if (dist > T.MAX_DIST) { // limita: o salto vai só até MAX_DIST
      this.target.x = pos.x + (dx / dist) * T.MAX_DIST;
      this.target.z = pos.z + (dz / dist) * T.MAX_DIST;
      dist = T.MAX_DIST;
    }
    if (dist < T.MIN_DIST) { this.reason = 'perto demais'; return; }
    if (!this.world.isFree(this.target.x, this.target.z, T.PLAYER_RADIUS)) { this.reason = 'dentro de bloco'; return; }
    for (const t of this.world.targets) {
      if (t.center.y < 1.2 && Math.hypot(t.center.x - this.target.x, t.center.z - this.target.z) < 0.5) { this.reason = 'em cima da caixa'; return; }
    }
    // caminho reto até o alvo (na altura do joelho) não pode atravessar blocos
    this._a.set(pos.x, 0.4, pos.z);
    this._b.set(this.target.x, 0.4, this.target.z);
    if (this.world.segmentHit(this._a, this._b)) { this.reason = 'atravessa parede'; return; }
    if (this.cooldownLeft(nowMs) > 0) { this.reason = 'aguarde'; this.valid = false; return; }
    this.valid = true;
    this.reason = 'ok';
  }

  // locoHand: mão de locomoção. manualAim: botão/teclado "Mirar" ativo.
  update(nowMs, locoHand, manualAim) {
    let aiming = false;
    if (manualAim) {
      this.camera.getWorldPosition(this._o);
      this.camera.getWorldDirection(this._d);
      this._o.y -= 0.35;
      this._o.addScaledVector(this._d, 0.2);
      aiming = true;
    } else if (locoHand && locoHand.visible && locoHand.gesture === 'gun') {
      this._o.copy(locoHand.worldPts[8]);
      this._d.subVectors(locoHand.worldPts[8], locoHand.worldPts[5]);
      aiming = this._d.lengthSq() > 1e-8;
    }
    this.aiming = aiming;
    if (aiming) {
      this.compute(this._o, this._d, nowMs);
      if (this.valid) { this.lastAimTime = nowMs; this.lastValid.copy(this.target); }
    }
    const recent = nowMs - this.lastAimTime < T.CONFIRM_WINDOW_S * 1000;
    this.line.visible = aiming;
    this.marker.visible = aiming || recent;
    if (this.marker.visible) {
      this.marker.position.set(aiming ? this.target.x : this.lastValid.x, 0.02, aiming ? this.target.z : this.lastValid.z);
      const ok = aiming ? this.valid : true;
      const c = ok ? 0x00e5ff : this.reason === 'aguarde' ? 0x999999 : 0xff3355;
      this.markerMat.color.setHex(c);
      this.line.material.color.setHex(c);
    }

    // Confirmação por gesto: palma aberta logo depois da pistolinha
    if (locoHand) {
      const g = locoHand.gesture;
      if (g === 'open' && this._lastGesture !== 'open' && recent) this.tryJump(nowMs);
      this._lastGesture = g;
    }
  }

  // Também usado pelo botão "Teleportar".
  tryJump(nowMs) {
    const recent = nowMs - this.lastAimTime < T.CONFIRM_WINDOW_S * 1000;
    if (!recent) { this.hooks.onFail && this.hooks.onFail('mire primeiro (pistolinha)'); return false; }
    if (this.cooldownLeft(nowMs) > 0) { this.hooks.onFail && this.hooks.onFail('espere um pouco'); return false; }
    const dest = this.lastValid.clone();
    this.lastJump = nowMs;
    this.lastAimTime = -1e9;
    this.jumps++;
    const fade = document.getElementById('fade');
    fade.style.opacity = '1';
    setTimeout(() => {
      this.rig.position.set(dest.x, 0, dest.z);
      fade.style.opacity = '0';
      this.hooks.onTeleport && this.hooks.onTeleport(dest);
    }, T.FADE_MS);
    return true;
  }

  hide() { this.line.visible = false; this.marker.visible = false; this.aiming = false; }
}
