// Locomoção por teleporte: pistolinha = mirar (parábola + marcador),
// palma aberta logo depois = ir. Com limites de distância e espera
// entre saltos, para parecer "andar" e não "voar".
//
// Movimento: no modo 'dash' o jogador desliza rápido até o alvo (com as
// bordas da tela escurecendo para não enjoar); no modo 'fade' a tela pisca.
import * as THREE from 'three';
import { CONFIG } from './config.js';

const T = CONFIG.TELEPORT;
const N_DOTS = 36;

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export class Teleport {
  constructor(scene, rig, camera, world, hooks = {}) {
    this.rig = rig;
    this.camera = camera;
    this.world = world;
    this.hooks = hooks;

    // pontos da parábola (simulação) — desenhados como bolinhas que "correm"
    this.arc = Array.from({ length: T.MAX_STEPS + 2 }, () => new THREE.Vector3());
    this.arcLen = [];
    this.arcN = 0;
    this.dotMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
    this.dots = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), this.dotMat, N_DOTS);
    this.dots.frustumCulled = false;
    this.dots.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.dots.visible = false;
    scene.add(this.dots);

    // marcador no chão
    this.marker = new THREE.Group();
    this.markerMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.24, 0.3, 40), this.markerMat);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.07, 20), this.markerMat);
    this.pulse = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.33, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, transparent: true }));
    // pilar de luz fraco: ajuda a ver o alvo de longe
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.25, side: THREE.DoubleSide }));
    this.beam.position.y = 0.6;
    for (const m of [ring, dot, this.pulse]) m.rotation.x = -Math.PI / 2;
    this.marker.add(ring, dot, this.pulse, this.beam);
    this.marker.visible = false;
    scene.add(this.marker);

    // círculo de alcance máximo em volta do jogador
    this.range = new THREE.Mesh(
      new THREE.RingGeometry(T.MAX_DIST - 0.04, T.MAX_DIST, 72),
      new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.3, side: THREE.DoubleSide }),
    );
    this.range.rotation.x = -Math.PI / 2;
    this.range.visible = false;
    scene.add(this.range);

    this.aiming = false;
    this.valid = false;
    this.reason = '';
    this.target = new THREE.Vector3();
    this.lastValid = new THREE.Vector3();
    this.lastAimTime = -1e9;
    this.lastJump = -1e9;
    this.jumps = 0;
    this.dash = null;
    this._lastGesture = 'none';
    this._wasAiming = false;
    this._lastT = performance.now();
    this._o = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this._so = new THREE.Vector3(); // origem suavizada
    this._sd = new THREE.Vector3(); // direção suavizada
    this._v = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._n = new THREE.Vector3();
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
  }

  cooldownLeft(nowMs) { return Math.max(0, T.COOLDOWN_S - (nowMs - this.lastJump) / 1000); }
  get moving() { return !!this.dash; }

  // Simula a parábola a partir de origin/dir (mundo). Preenche o arco e o alvo.
  compute(origin, dir, nowMs) {
    const d = this._v.copy(dir).normalize();
    d.y += T.UP_BIAS;
    d.normalize();
    const vel = d.multiplyScalar(T.SPEED);
    const p = this._p.copy(origin);
    let n = 0;
    const push = (q) => { this.arc[n++].copy(q); };
    push(p);
    let landed = false;
    this.valid = false;
    this.reason = 'sem chão';
    for (let i = 0; i < T.MAX_STEPS; i++) {
      const next = this._n.copy(p).addScaledVector(vel, T.STEP_DT);
      vel.y -= T.GRAVITY * T.STEP_DT;
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
    this.arcN = n;
    // comprimento acumulado (para espaçar as bolinhas por igual)
    this.arcLen.length = n;
    this.arcLen[0] = 0;
    for (let i = 1; i < n; i++) this.arcLen[i] = this.arcLen[i - 1] + this.arc[i].distanceTo(this.arc[i - 1]);
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
    if (this.cooldownLeft(nowMs) > 0) { this.reason = 'aguarde'; return; }
    this.valid = true;
    this.reason = 'ok';
  }

  // locoHand: mão de locomoção. manualAim: botão/teclado "Mirar" ativo.
  update(nowMs, locoHand, manualAim) {
    const dt = Math.min(0.1, (nowMs - this._lastT) / 1000);
    this._lastT = nowMs;
    this._animateDash(nowMs);

    let aiming = false;
    if (this.dash) {
      aiming = false;
    } else if (manualAim) {
      this.camera.getWorldPosition(this._o);
      this.camera.getWorldDirection(this._d);
      this._o.y -= 0.35;
      this._o.addScaledVector(this._d, 0.2);
      aiming = true;
    } else if (locoHand && locoHand.visible && locoHand.gesture === 'gun') {
      const P = locoHand.worldPts;
      this._o.copy(P[8]);
      // direção = dedo indicador (base→ponta) misturado com pulso→ponta: treme menos
      this._a.subVectors(P[8], P[5]).normalize();
      this._b.subVectors(P[8], P[0]).normalize();
      this._d.copy(this._a).multiplyScalar(1 - T.AIM_WRIST_BLEND).addScaledVector(this._b, T.AIM_WRIST_BLEND);
      aiming = this._d.lengthSq() > 1e-8;
    }

    if (aiming) {
      this._d.normalize();
      if (!this._wasAiming) { this._so.copy(this._o); this._sd.copy(this._d); }
      const k = 1 - Math.exp(-dt * T.AIM_SMOOTH);
      this._so.lerp(this._o, k);
      this._sd.lerp(this._d, k).normalize();
      this.compute(this._so, this._sd, nowMs);
      if (this.valid) { this.lastAimTime = nowMs; this.lastValid.copy(this.target); }
    }
    this._wasAiming = aiming;
    this.aiming = aiming;

    const recent = nowMs - this.lastAimTime < T.CONFIRM_WINDOW_S * 1000;
    const showMarker = !this.dash && (aiming || recent);
    this.dots.visible = aiming;
    this.range.visible = aiming;
    this.marker.visible = showMarker;
    if (aiming) {
      this.range.position.set(this.rig.position.x, 0.015, this.rig.position.z);
      this._drawDots(nowMs);
    }
    if (showMarker) {
      const ok = aiming ? this.valid : true;
      const c = ok ? 0x00e5ff : this.reason === 'aguarde' ? 0x999999 : 0xff3355;
      const tgt = aiming ? this.target : this.lastValid;
      this.marker.position.set(tgt.x, 0.02, tgt.z);
      this.markerMat.color.setHex(c);
      this.dotMat.color.setHex(c);
      this.beam.material.color.setHex(c);
      this.beam.visible = ok;
      // anel que pulsa (ou que cresce durante a espera entre saltos)
      const cd = this.cooldownLeft(nowMs);
      const ph = cd > 0 ? 1 - cd / T.COOLDOWN_S : (nowMs / 900) % 1;
      this.pulse.scale.setScalar(1 + ph * 0.8);
      this.pulse.material.opacity = cd > 0 ? 0.6 : 0.7 * (1 - ph);
    }

    // Confirmação por gesto: palma aberta logo depois da pistolinha
    if (locoHand) {
      const g = locoHand.gesture;
      if (g === 'open' && this._lastGesture !== 'open' && recent) this.tryJump(nowMs);
      this._lastGesture = g;
    }
  }

  _drawDots(nowMs) {
    const n = this.arcN;
    const total = n > 1 ? this.arcLen[n - 1] : 0;
    const spacing = Math.max(total / N_DOTS, 0.12);
    const offset = ((nowMs / 1000) * 1.2) % spacing; // bolinhas correm em direção ao alvo
    let seg = 1;
    for (let k = 0; k < N_DOTS; k++) {
      const s = offset + k * spacing;
      if (total <= 0 || s > total) { this._m.makeScale(0, 0, 0); this.dots.setMatrixAt(k, this._m); continue; }
      while (seg < n - 1 && this.arcLen[seg] < s) seg++;
      const l0 = this.arcLen[seg - 1], l1 = this.arcLen[seg];
      const t = l1 > l0 ? (s - l0) / (l1 - l0) : 0;
      this._p.lerpVectors(this.arc[seg - 1], this.arc[seg], t);
      const r = 0.012 + 0.018 * (s / total); // perto da mão: menores
      this._m.compose(this._p, this._q, this._s.set(r, r, r));
      this.dots.setMatrixAt(k, this._m);
    }
    this.dots.instanceMatrix.needsUpdate = true;
  }

  // Também usado pelo botão "Ir".
  tryJump(nowMs) {
    if (this.dash) return false;
    const recent = nowMs - this.lastAimTime < T.CONFIRM_WINDOW_S * 1000;
    if (!recent) { this.hooks.onFail && this.hooks.onFail('mire primeiro (pistolinha)'); return false; }
    if (this.cooldownLeft(nowMs) > 0) { this.hooks.onFail && this.hooks.onFail('espere um pouco'); return false; }
    const dest = this.lastValid.clone();
    this.lastJump = nowMs;
    this.lastAimTime = -1e9;
    this.jumps++;
    if (T.MODE === 'fade') {
      const fade = document.getElementById('fade');
      fade.style.opacity = '1';
      setTimeout(() => {
        this.rig.position.set(dest.x, 0, dest.z);
        fade.style.opacity = '0';
        this.hooks.onTeleport && this.hooks.onTeleport(dest);
      }, T.FADE_MS);
    } else {
      const dist = Math.hypot(dest.x - this.rig.position.x, dest.z - this.rig.position.z);
      this.dash = { from: this.rig.position.clone(), to: dest, t0: nowMs, ms: T.DASH_MS_BASE + T.DASH_MS_PER_M * dist };
      document.body.classList.add('dashing');
    }
    return true;
  }

  _animateDash(nowMs) {
    const D = this.dash;
    if (!D) return;
    const t = Math.min(1, (nowMs - D.t0) / D.ms);
    const e = easeInOut(t);
    this.rig.position.lerpVectors(D.from, D.to, e);
    // pequeno "balanço" de passo, para sentir que andou
    this.rig.position.y = Math.sin(t * Math.PI) * T.DASH_BOB;
    if (t >= 1) {
      this.rig.position.set(D.to.x, 0, D.to.z);
      this.dash = null;
      document.body.classList.remove('dashing');
      this.hooks.onTeleport && this.hooks.onTeleport(D.to);
    }
  }

  hide() {
    this.dots.visible = false;
    this.marker.visible = false;
    this.range.visible = false;
    this.aiming = false;
  }

  // Cancela movimento em andamento (reiniciar partida etc.)
  cancel() {
    if (this.dash) { this.rig.position.set(this.dash.to.x, 0, this.dash.to.z); this.dash = null; }
    document.body.classList.remove('dashing');
    this.hide();
  }
}
