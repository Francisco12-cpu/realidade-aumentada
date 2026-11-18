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
    this._armed = false;
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

    // v18: barra de recarga em cima da mão vermelha (presa à câmera)
    this.bar = new THREE.Group();
    const bm = (c) => new THREE.MeshBasicMaterial({ color: c, depthTest: false, depthWrite: false, transparent: true });
    this.barBg = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), bm(0x111111));
    this.barBg.material.opacity = 0.7;
    this.barFill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), bm(0x5be37d));
    this.barFill.geometry.translate(0.5, 0, 0);
    this.barBg.renderOrder = 45; this.barFill.renderOrder = 46;
    this.bar.add(this.barBg, this.barFill);
    this.bar.visible = false;
    camera.add(this.bar);
    this.pistol = false;
    this._pistolSince = 0;
    this._pistolSeen = -1e9;
  }

  // v18: pistolinha pelos ângulos 3D da mão: indicador esticado (longe do
  // pulso) e médio dobrado (perto do pulso). Vale também o gesto 'gun'.
  _isPistol(h, thr) {
    if (!h || !h.visible || !h.wlm) return false;
    if (h.gesture === 'gun') return true;
    const r = this._reach(h);
    if (!r) return false;
    const f = h.features;
    const idxStraight = !f || f.straight[0] > thr.ext[0] - 0.12;
    return r.index > G.PISTOL_INDEX && r.middle < G.PISTOL_MIDDLE && r.index - r.middle > 0.35 && idxStraight;
  }

  // Modo 'auto' (v18): só a mão VERMELHA (papel 'gun') mira. Pistolinha
  // segurada = atira sozinho; recarrega RELOAD_MS (barra) e atira de novo.
  _updateAuto(now, hands, thr, fresh, manualFire, findHit) {
    const cur = hands.find((h) => h.role === 'gun' && h.visible) || null;
    this.side = cur ? cur.side : null;
    // pistolinha com tolerância (se "piscar" por um instante, continua)
    let pistolNow = false;
    if (cur && cur.present) pistolNow = this._isPistol(cur, thr);
    if (pistolNow) {
      this._pistolSeen = now;
      if (!this.pistol) { this.pistol = true; this._pistolSince = now; this.hooks.onReady && this.hooks.onReady(); }
    } else if (this.pistol && (!cur || now - this._pistolSeen > G.GRACE_MS)) this.pistol = false;
    const reloadK = Math.min(1, (now - this.lastShot) / G.RELOAD_MS);
    this.state = !cur ? 'off' : reloadK < 1 ? 'reload' : 'ready';
    this.aiming = !!cur;
    if (cur) {
      const P = cur.worldPts;
      this.camera.getWorldPosition(this._o);
      // v20: mira para onde o DEDO aponta (com um pouco da direção olho→mão)
      if (this.aimFn) this.aimFn(cur, this._d);
      else { this._k.copy(P[5]).add(P[9]).multiplyScalar(0.5); this._d.subVectors(this._k, this._o).normalize(); }
      this._sd.lerp(this._d, G.AIM_SMOOTH).normalize();
      if (this._sd.lengthSq() < 0.5) this._sd.copy(this._d);
      this._tip.copy(P[8]);
      // o raio sai da ponta do dedo (o tiro vai para onde o laser mostra)
      this._o.copy(P[8]);
      this._hist = this._hist || [];
      this._hist.push({ t: now, d: this._sd.clone() });
      while (this._hist.length > 2 && now - this._hist[1].t > G.AIM_LAG_MS) this._hist.shift();
      if (this.pistol && reloadK >= 1 && now - this._pistolSince >= G.PISTOL_HOLD_MS) this._fire(now, cur, findHit);
    } else if (manualFire !== undefined) {
      this.camera.getWorldPosition(this._o);
      this.camera.getWorldDirection(this._sd);
      this._tip.copy(this._o).addScaledVector(this._sd, 0.4);
      this._tip.y -= 0.15;
    }
    if (manualFire && now - this.lastShot >= G.RELOAD_MS) this._fire(now, null, findHit);
    this._drawAim(now, findHit, !!(cur && this.pistol));
    // barra: em cima da mão vermelha
    this.bar.visible = !!cur;
    if (cur) {
      const P = cur.camPts;
      let top = P[0];
      for (const p of P) if (p.y > top.y) top = p;
      const k = Math.min(1, (now - this.lastShot) / G.RELOAD_MS);
      const w = 0.07, hgt = 0.009;
      this.bar.position.set(P[9].x, top.y + 0.03, P[9].z);
      this.barBg.scale.set(w + 0.004, hgt + 0.004, 1);
      this.barFill.position.x = -w / 2;
      this.barFill.scale.set(Math.max(0.001, w * k), hgt, 1);
      this.barFill.material.color.setHex(k < 1 ? 0xffb020 : this.pistol ? 0xff3030 : 0x5be37d);
    }
  }

  _drawAim(now, findHit, hot) {
    const show = this.aiming;
    this.laser.visible = show;
    this.dot.visible = show;
    if (show) {
      const hit = findHit(this._o, this._sd, false);
      const dist = hit ? hit.dist : G.RANGE;
      const end = this._k.copy(this._o).addScaledVector(this._sd, dist);
      const col = hot ? 0xff2a2a : 0xff8a8a;
      this.laserMat.color.setHex(col);
      this.laserMat.opacity = hot ? 0.85 : 0.35;
      this.dotMat.color.setHex(hit && hit.zombie ? 0xffee00 : col);
      const a = this.laser.geometry.attributes.position;
      a.setXYZ(0, this._tip.x, this._tip.y, this._tip.z);
      a.setXYZ(1, end.x, end.y, end.z);
      a.needsUpdate = true;
      this.dot.position.copy(end);
      this.dot.scale.setScalar(0.012 * Math.max(1, dist) + 0.01);
    }
    const fx = now < this._fxUntil;
    this.flash.visible = fx && now < this._fxUntil - 60;
    this.tracer.visible = fx;
    if (fx) this.tracer.material.opacity = (this._fxUntil - now) / 110;
  }

  get ready() { return this.state === 'ready'; }
  reloadLeft(now) { return Math.max(0, G.RELOAD_MS - (now - this.lastShot)); }

  // v16 (modo 'punho'): o quanto a mão está fechada, pelas pontas do indicador
  // e do médio até o pulso (em "palmos"). Aberta ~1,9 · fechada ~1,0.
  // Funciona de qualquer ângulo, inclusive com a mão apontando para frente
  // (de costas para a câmera), onde a pistolinha e o polegar falhavam.
  _reach(h) {
    const w = h.wlm;
    if (!w) return null;
    const d = (a, b) => Math.hypot(w[a].x - w[b].x, w[a].y - w[b].y, w[a].z - w[b].z);
    const palm = Math.max(d(0, 9), 1e-4);
    return { index: d(8, 0) / palm, middle: d(12, 0) / palm };
  }

  // Pistolinha pelo formato da mão (independe do polegar, que é o gatilho).
  _shape(h, thr) {
    const f = h.features;
    if (!h.visible || !f) return false;
    if (G.MODE === 'punho') return h.gesture !== 'open' && !this._isOpen(h);
    const k = G.SHAPE_SLACK;
    // indicador esticado e médio dobrado (anelar e mínimo não importam)
    return f.straight[0] > thr.ext[0] - k && f.straight[1] < thr.ext[1] + k * 0.5 && f.straight[0] - f.straight[1] > 0.12;
  }

  isGunHand(h, thr) { return this._shape(h, thr); }

  // mão aberta (todos os dedos longe do pulso) = é a mão de andar, não a arma
  _isOpen(h) {
    const r = this._reach(h);
    return !!r && r.index > G.OPEN_REACH && r.middle > G.OPEN_REACH;
  }

  // Cor da mão: vermelho = pronta · cinza = recarregando · null = normal
  tintFor(side, now) {
    if (side !== this.side || this.state === 'off') return null;
    return this.state === 'reload' ? 0x8a8f96 : 0xd4202a;
  }

  // hands: lista de mãos · fresh: houve detecção nova neste quadro
  // manualFire: botão/tecla de tiro · targets(): lista de alvos para a mira
  update(now, hands, thr, fresh, manualFire, findHit) {
    if (G.MODE === 'auto') return this._updateAuto(now, hands, thr, fresh, manualFire, findHit);
    // escolhe a mão da arma: a que está em pistolinha (prefere a mesma de antes)
    let hand = null;
    for (const h of hands) if (this._shape(h, thr) && (!hand || h.side === this.side)) hand = h;
    if (hand) { this.side = hand.side; this._lostAt = now; } else if (now - this._lostAt > G.GRACE_MS) { this.side = null; }
    const cur = this.side ? hands.find((h) => h.side === this.side && h.visible) : null;

    // Estados: 'reload' (cinza, só RELOAD_MS depois do tiro) -> 'ready' (vermelha).
    // O tiro sai quando o polegar DESCE depois de ter subido (armed): assim
    // segurar o polegar abaixado não fica atirando sem parar.
    if (!this.side || !cur) {
      this.state = 'off';
      this._armed = false;
    } else {
      if (this.state === 'off') { this.state = 'ready'; this._armed = false; }
      if (this.state === 'reload' && now - this.lastShot >= G.RELOAD_MS) {
        this.state = 'ready';
        this.hooks.onReady && this.hooks.onReady();
      }
      if (G.MODE === 'punho' && fresh && cur.present) {
        // fechar a mão = tiro; abrir um pouco (apontar) = engatilha de novo
        const r = this._reach(cur);
        if (r) {
          const k = Math.max(r.index, r.middle);
          if (k > G.ARM_REACH) this._armed = true;
          else if (k < G.FIRE_REACH && this._armed && this.state === 'ready') this._fire(now, cur, findHit, true);
        }
      } else if (fresh && cur.features) {
        const t = cur.features.thumbOut;
        if (t > thr.thumbOut * G.THUMB_UP_K) this._armed = true;
        else if (t < thr.thumbOut * G.THUMB_DOWN_K && this._armed && this.state === 'ready' && hand) this._fire(now, cur, findHit);
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
      // guarda a mira de um instante atrás: ao fechar a mão ela mexe um pouco
      this._hist = this._hist || [];
      this._hist.push({ t: now, d: this._sd.clone() });
      while (this._hist.length > 2 && now - this._hist[1].t > G.AIM_LAG_MS) this._hist.shift();
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

  _fire(now, hand, findHit, lagged = G.MODE === 'auto' && !!hand) {
    if (lagged && this._hist && this._hist.length) this._sd.copy(this._hist[0].d);
    this.lastShot = now;
    this.state = 'reload';
    this._armed = false;
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
    this._hist = [];
    this.bar.visible = false;
    this.pistol = false;
  }
}
