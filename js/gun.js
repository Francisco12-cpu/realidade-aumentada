// Arma de mão: pistolinha = mira · abaixar o polegar = BANG.
//
//  👉 pistolinha (indicador esticado, polegar para cima): a arma está engatilhada
//     e a mão fica VERMELHA (pronta para atirar).
//  👍⬇ abaixar o polegar (como o cão de um revólver): atira.
//  Depois do tiro a mão fica CINZA enquanto recarrega; levante o polegar de
//  novo para engatilhar. Quando a mão volta a ficar vermelha, pode atirar.
//
// A mira vai do OLHO até os nós dos dedos (pontos estáveis da mão): basta
// "cobrir" o zumbi com a mão. Há uma pequena ajuda de mira (ângulo).
import * as THREE from 'three';
import { CONFIG } from './config.js';

const G = CONFIG.GUN;

export class Gun {
  constructor(scene, camera, world, hooks = {}) {
    this.camera = camera;
    this.world = world;
    this.hooks = hooks;
    this.state = 'off';      // off · cocking · ready · reload
    this.side = null;        // mão que está segurando a arma
    this.lastShot = -1e9;
    this.shots = 0;
    this.aiming = false;
    this._upFrames = 0;
    this._lostAt = -1e9;
    this._o = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this._sd = new THREE.Vector3();
    this._tip = new THREE.Vector3();
    this._k = new THREE.Vector3();

    // laser fino saindo do dedo + ponto vermelho onde a mira bate
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.laserMat = new THREE.LineBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.7, depthWrite: false });
    this.laser = new THREE.Line(lg, this.laserMat);
    this.laser.frustumCulled = false;
    this.laser.visible = false;
    scene.add(this.laser);
    this.dotMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a, depthTest: false, transparent: true });
    this.dot = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), this.dotMat);
    this.dot.renderOrder = 30;
    this.dot.visible = false;
    scene.add(this.dot);
    // clarão do tiro (na ponta do dedo) e risco da bala
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, depthWrite: false }));
    this.flash.visible = false;
    scene.add(this.flash);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    this.tracer = new THREE.Line(tg, new THREE.LineBasicMaterial({ color: 0xfff1a8, transparent: true, depthWrite: false }));
    this.tracer.frustumCulled = false;
    this.tracer.visible = false;
    scene.add(this.tracer);
    this._fxUntil = 0;
  }

  get ready() { return this.state === 'ready'; }
  reloadLeft(now) { return Math.max(0, G.RELOAD_MS - (now - this.lastShot)); }

  // Pistolinha pelo formato da mão (independe do polegar, que é o gatilho).
  _shape(h, thr) {
    const f = h.features;
    if (!h.visible || !f) return false;
    return f.straight[0] > thr.ext[0] - 0.04 && f.straight[1] < thr.ext[1] && f.straight[2] < thr.ext[2] + 0.04;
  }

  // Cor da mão: vermelho = pronta · cinza = recarregando · null = normal
  tintFor(side, now) {
    if (side !== this.side || this.state === 'off') return null;
    return this.state === 'ready' ? 0xd4202a : 0x8a8f96;
  }

  // hands: lista de mãos · fresh: houve detecção nova neste quadro
  // manualFire: botão/tecla de tiro · targets(): lista de alvos para a mira
  update(now, hands, thr, fresh, manualFire, findHit) {
    // escolhe a mão da arma: a que está em pistolinha (prefere a mesma de antes)
    let hand = null;
    for (const h of hands) if (this._shape(h, thr) && (!hand || h.side === this.side)) hand = h;
    if (hand) { this.side = hand.side; this._lostAt = now; } else if (now - this._lostAt > G.GRACE_MS) { this.side = null; }
    const cur = this.side ? hands.find((h) => h.side === this.side && h.visible) : null;

    if (!this.side || !cur) {
      this.state = 'off';
      this._upFrames = 0;
    } else if (fresh && cur.features) {
      const t = cur.features.thumbOut;
      const up = t > thr.thumbOut * G.THUMB_UP_K;
      const down = t < thr.thumbOut * G.THUMB_DOWN_K;
      const reloaded = now - this.lastShot >= G.RELOAD_MS;
      if (this.state === 'off') this.state = up ? 'cocking' : 'reload';
      if (up) this._upFrames++; else this._upFrames = 0;
      if (this.state === 'ready' && down && hand) this._fire(now, cur, findHit);
      else if ((this.state === 'cocking' || this.state === 'reload') && reloaded && this._upFrames >= G.COCK_FRAMES) {
        this.state = 'ready';
        this.hooks.onReady && this.hooks.onReady();
      }
    }

    // mira
    this.aiming = !!(cur && this.state !== 'off');
    if (this.aiming) {
      const P = cur.worldPts;
      this.camera.getWorldPosition(this._o);
      this._k.copy(P[5]).add(P[9]).multiplyScalar(0.5);
      this._d.subVectors(this._k, this._o).normalize();
      this._sd.lerp(this._d, 0.5).normalize();
      if (this._sd.lengthSq() < 0.5) this._sd.copy(this._d);
      this._tip.copy(P[8]);
    } else if (manualFire !== undefined) {
      // sem mão: mira no centro da visão (botão 🔫 / tecla espaço)
      this.camera.getWorldPosition(this._o);
      this.camera.getWorldDirection(this._sd);
      this._tip.copy(this._o).addScaledVector(this._sd, 0.4);
      this._tip.y -= 0.15;
    }
    if (manualFire && now - this.lastShot >= G.RELOAD_MS) this._fire(now, null, findHit);

    // laser e ponto
    const show = this.aiming;
    this.laser.visible = show;
    this.dot.visible = show;
    if (show) {
      const hit = findHit(this._o, this._sd, false);
      const dist = hit ? hit.dist : G.RANGE;
      const end = this._k.copy(this._o).addScaledVector(this._sd, dist);
      const col = this.state === 'ready' ? 0xff2a2a : 0x9aa0a6;
      this.laserMat.color.setHex(col);
      this.dotMat.color.setHex(hit && hit.zombie ? 0xffee00 : col);
      const a = this.laser.geometry.attributes.position;
      a.setXYZ(0, this._tip.x, this._tip.y, this._tip.z);
      a.setXYZ(1, end.x, end.y, end.z);
      a.needsUpdate = true;
      this.dot.position.copy(end);
      this.dot.scale.setScalar(0.012 * Math.max(1, dist) + 0.01);
    }
    // efeitos do tiro somem rápido
    const fx = now < this._fxUntil;
    this.flash.visible = fx && now < this._fxUntil - 60;
    this.tracer.visible = fx;
    if (fx) this.tracer.material.opacity = (this._fxUntil - now) / 110;
  }

  _fire(now, hand, findHit) {
    this.lastShot = now;
    this.state = 'reload';
    this._upFrames = 0;
    this.shots++;
    const hit = findHit(this._o, this._sd, true);
    const dist = hit ? hit.dist : G.RANGE;
    const end = new THREE.Vector3().copy(this._o).addScaledVector(this._sd, dist);
    this.flash.position.copy(this._tip);
    this.flash.scale.setScalar(0.035);
    const a = this.tracer.geometry.attributes.position;
    a.setXYZ(0, this._tip.x, this._tip.y, this._tip.z);
    a.setXYZ(1, end.x, end.y, end.z);
    a.needsUpdate = true;
    this._fxUntil = now + 110;
    this.hooks.onShot && this.hooks.onShot(hit, end);
  }

  hide() {
    this.laser.visible = this.dot.visible = this.flash.visible = this.tracer.visible = false;
    this.state = 'off';
    this.side = null;
  }
}
