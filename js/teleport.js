// Locomoção por teleporte: pistolinha = mirar (curva + marcador),
// palma aberta logo depois = ir.
//
// Mira (modo 'olhar', padrão): o alvo é o ponto do chão na direção
// OLHO -> MÃO. Basta "cobrir" com a mão o lugar para onde quer ir. Isso usa
// a posição da mão na tela (estável), e não a direção do dedo (que treme). Com limites de distância e espera
// entre saltos, para parecer "andar" e não "voar".
//
// Movimento: no modo 'dash' o jogador desliza rápido até o alvo (com as
// bordas da tela escurecendo para não enjoar); no modo 'fade' a tela pisca.
import * as THREE from 'three';
import { CONFIG } from './config.js';

const T = CONFIG.TELEPORT;
const N_DOTS = 30;
const ARC_N = 32;

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

export class Teleport {
  constructor(scene, rig, camera, world, hooks = {}) {
    this.rig = rig;
    this.camera = camera;
    this.world = world;
    this.hooks = hooks;

    // pontos da parábola (simulação) — desenhados como bolinhas que "correm"
    this.arc = Array.from({ length: ARC_N }, () => new THREE.Vector3());
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
    this._sd = new THREE.Vector3(); // direção da mira suavizada
    this._st = new THREE.Vector3(); // alvo suavizado
    this._vis = new THREE.Vector3(); // de onde a curva sai (ponta do dedo)
    this.lastGunTime = -1e9;
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

  // Alvo = onde o raio (origin, dir) encontra o chão, limitado ao alcance.
  // Depois desenha uma curva da mão até o alvo.
  aimFromRay(origin, dir, visOrigin, nowMs, smoothK) {
    const pos = this.rig.position;
    let hx = dir.x, hz = dir.z;
    const hl = Math.hypot(hx, hz);
    if (hl < 1e-4) { // olhando reto para baixo: usa a direção da cabeça
      this.camera.getWorldDirection(this._v);
      hx = this._v.x; hz = this._v.z;
    }
    const hn = Math.hypot(hx, hz) || 1;
    hx /= hn; hz /= hn;
    // distância horizontal até o chão (raio para cima ou reto = alcance máximo)
    let dist = dir.y < -1e-3 ? (origin.y * hl) / -dir.y : Infinity;
    dist = Math.min(dist, T.MAX_DIST);
    this._p.set(pos.x + hx * dist, 0, pos.z + hz * dist);
    if (smoothK >= 1) this._st.copy(this._p); else this._st.lerp(this._p, smoothK);
    this.target.copy(this._st);
    this.target.y = 0;
    this.valid = false;
    this._validateGround(nowMs);
    this._buildArc(visOrigin, this.target);
  }

  _buildArc(a, b) {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    // ponto de controle acima do meio do caminho
    this._n.set((a.x + b.x) / 2, Math.max(a.y, b.y) + 0.15 + 0.12 * d, (a.z + b.z) / 2);
    for (let i = 0; i < ARC_N; i++) {
      const t = i / (ARC_N - 1), u = 1 - t;
      this.arc[i].set(
        u * u * a.x + 2 * u * t * this._n.x + t * t * b.x,
        u * u * a.y + 2 * u * t * this._n.y + t * t * b.y,
        u * u * a.z + 2 * u * t * this._n.z + t * t * b.z,
      );
    }
    this.arcN = ARC_N;
    this.arcLen.length = ARC_N;
    this.arcLen[0] = 0;
    for (let i = 1; i < ARC_N; i++) this.arcLen[i] = this.arcLen[i - 1] + this.arc[i].distanceTo(this.arc[i - 1]);
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
    // alvo dentro de um bloco: recua pelo caminho até o primeiro ponto livre
    if (!this.world.isFree(this.target.x, this.target.z, T.PLAYER_RADIUS) && dist > 0) {
      const ux = (this.target.x - pos.x) / dist, uz = (this.target.z - pos.z) / dist;
      let d = dist;
      while (d > T.MIN_DIST && !this.world.isFree(pos.x + ux * d, pos.z + uz * d, T.PLAYER_RADIUS)) d -= 0.1;
      this.target.x = pos.x + ux * d;
      this.target.z = pos.z + uz * d;
      dist = d;
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

    // pistolinha liga a mira; ela continua por um instante se o gesto
    // "piscar" (ex.: virar 'normal' por 1–2 quadros), evitando que suma
    const g = locoHand && locoHand.visible ? locoHand.gesture : 'none';
    if (g === 'gun') this.lastGunTime = nowMs;
    const handAim = locoHand && locoHand.visible && g !== 'open' && nowMs - this.lastGunTime < T.AIM_GRACE_MS;

    let aiming = false;
    if (this.dash) {
      aiming = false;
    } else if (manualAim) {
      this.camera.getWorldPosition(this._o);
      this.camera.getWorldDirection(this._d);
      this._vis.copy(this._o).addScaledVector(this._d, 0.3);
      this._vis.y -= 0.3;
      aiming = true;
    } else if (handAim) {
      const P = locoHand.worldPts;
      this._vis.copy(P[8]);
      if (T.AIM_MODE === 'dedo') {
        this._o.copy(P[8]);
        this._a.subVectors(P[8], P[5]).normalize();
        this._b.subVectors(P[8], P[0]).normalize();
        this._d.copy(this._a).multiplyScalar(1 - T.AIM_WRIST_BLEND).addScaledVector(this._b, T.AIM_WRIST_BLEND);
      } else {
        // olho -> nós dos dedos (pontos mais estáveis da mão na pistolinha)
        this.camera.getWorldPosition(this._o);
        this._a.copy(P[5]).add(P[9]).multiplyScalar(0.5);
        this._d.subVectors(this._a, this._o);
      }
      aiming = this._d.lengthSq() > 1e-8;
    }

    if (aiming) {
      this._d.normalize();
      const first = !this._wasAiming;
      if (first) this._sd.copy(this._d);
      this._sd.lerp(this._d, 1 - Math.exp(-dt * T.AIM_SMOOTH)).normalize();
      this.aimFromRay(this._o, this._sd, this._vis, nowMs, first ? 1 : 1 - Math.exp(-dt * T.TARGET_SMOOTH));
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
