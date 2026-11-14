// Interação com as caixas pretas:
//  1) tocar a caixa com a ponta do indicador (mão de interação) -> abre
//  2) aparece um painel com fios na frente do jogador
//  3) pinça (ou punho) num fio, arrastar até o encaixe da mesma cor, soltar
//  4) todos conectados -> caixa consertada
// Também: detector de sinal preso à mão de interação.
import * as THREE from 'three';
import { CONFIG, WIRE_COLORS } from './config.js';

const I = CONFIG.INTERACTION;
const PANEL_W = 0.46, PANEL_H = 0.34;

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export class Interaction {
  constructor(scene, camera, world, hooks = {}) {
    this.scene = scene;
    this.camera = camera;
    this.world = world;
    this.hooks = hooks;
    this.mode = 'tutorial';
    this.panel = null;         // { target, group, plugs[], sockets[] }
    this.grabs = new Map();    // pointerId -> plug
    this.hover = null;
    this.lastTouchDist = Infinity;
    this._v = new THREE.Vector3();
    this._w = new THREE.Vector3();
    this._ray = new THREE.Raycaster();
    this._plane = new THREE.Plane();
    this._ndc = new THREE.Vector2();
    this._buildDetector();
  }

  // ------------------------------------------------------------------
  // Detector de sinal (seta + barra) preso à mão de interação
  // ------------------------------------------------------------------
  _buildDetector() {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xff3333 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.05, 8), mat);
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = 0.025;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.035, 12), mat);
    head.rotation.x = Math.PI / 2;
    head.position.z = 0.065;
    const arrow = new THREE.Group();
    arrow.add(shaft, head);
    g.add(arrow);
    const barBg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.008, 0.004), new THREE.MeshBasicMaterial({ color: 0x222222 }));
    barBg.position.y = -0.03;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.01, 0.006), mat);
    bar.position.y = -0.03;
    g.add(barBg, bar);
    g.visible = false;
    this.scene.add(g);
    this.detector = { group: g, arrow, bar, barBg, mat };
  }

  // mode 'tutorial': só a caixa do tutorial; 'game': só as da partida
  eligible(t) {
    return t.state !== 'fixed' && (this.mode === 'tutorial' ? t.tutorial : !t.tutorial);
  }

  nearestTarget(fromPos) {
    let best = null, bestD = Infinity;
    for (const t of this.world.targets) {
      if (!this.eligible(t)) continue;
      const d = t.center.distanceTo(fromPos);
      if (d < bestD) { bestD = d; best = t; }
    }
    return best ? { target: best, dist: bestD } : null;
  }

  updateDetector(hand) {
    const det = this.detector;
    this.camera.getWorldPosition(this._v);
    const near = this.nearestTarget(this._v);
    this.nearest = near;
    if (!near || !hand || !hand.visible) { det.group.visible = false; return; }
    det.group.visible = true;
    // acima das costas da mão (entre pulso e base do dedo médio)
    det.group.position.copy(hand.worldPts[0]).lerp(hand.worldPts[9], 0.5);
    det.group.position.y += 0.05;
    det.group.quaternion.copy(this.camera.getWorldQuaternion(new THREE.Quaternion()));
    // seta aponta para a caixa (em coordenadas locais do grupo)
    this._w.copy(near.target.center);
    det.group.worldToLocal(this._w);
    det.arrow.lookAt(this._w);
    const D = CONFIG.DETECTOR;
    const k = THREE.MathUtils.clamp((near.dist - D.NEAR) / (D.FAR - D.NEAR), 0, 1); // 0 perto, 1 longe
    det.mat.color.setHSL((1 - k) * 0.33, 1, 0.5);
    const strength = 1 - k;
    det.bar.scale.x = Math.max(0.05, strength);
    det.bar.position.x = -0.035 * (1 - det.bar.scale.x);
  }

  // ------------------------------------------------------------------
  // Tocar / abrir caixa
  // ------------------------------------------------------------------
  // tip: ponta do indicador (mundo) da mão de interação
  checkTouch(tip) {
    this.lastTouchDist = Infinity;
    if (!tip) return;
    for (const t of this.world.targets) {
      if (!this.eligible(t)) continue;
      const d = t.aabb.distanceToPoint(tip);
      if (d < this.lastTouchDist) this.lastTouchDist = d;
      if (d < I.TOUCH_DIST && (!this.panel || this.panel.target !== t)) this.openTarget(t);
    }
  }

  // Botão "Tocar": abre a caixa mais próxima no alcance.
  openNearest() {
    this.camera.getWorldPosition(this._v);
    const near = this.nearestTarget(this._v);
    if (near && near.dist < I.FALLBACK_TOUCH_DIST) { this.openTarget(near.target); return true; }
    return false;
  }

  openTarget(t) {
    if (this.panel && this.panel.target === t) return;
    this.closePanel();
    if (t.state === 'closed') t.state = 'open';
    this._buildPanel(t);
    this.hooks.onOpen && this.hooks.onOpen(t);
  }

  _buildPanel(target) {
    const n = target.wires;
    const group = new THREE.Group();
    // posição: na frente do jogador, olhando para ele
    // na direção do olhar, com inclinação limitada (nem no chão, nem no teto)
    const cam = this.camera.getWorldPosition(new THREE.Vector3());
    const fwd = this.camera.getWorldDirection(new THREE.Vector3());
    const pitch = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(fwd.y, -1, 1)) - I.PANEL_DROP, -0.6, 0.35);
    const yaw = Math.atan2(fwd.x, fwd.z);
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    group.position.copy(cam).addScaledVector(dir, I.PANEL_DIST);
    group.lookAt(cam);
    // em retrato a tela é estreita: encolhe o painel para caber em ~85% da largura visível
    const visW = 2 * I.PANEL_DIST * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * this.camera.aspect;
    group.scale.setScalar(Math.min(1, (visW * 0.85) / PANEL_W));
    group.renderOrder = 10;
    this.scene.add(group);

    const bg = new THREE.Mesh(new THREE.PlaneGeometry(PANEL_W, PANEL_H), new THREE.MeshBasicMaterial({ color: 0x101820, transparent: true, opacity: 0.88, side: THREE.DoubleSide }));
    group.add(bg);
    const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(PANEL_W, PANEL_H)), new THREE.LineBasicMaterial({ color: 0x00e5ff }));
    group.add(frame);

    const colors = WIRE_COLORS.slice(0, n).map((c, i) => ({ c, i }));
    const socketOrder = shuffle(colors.slice());
    if (n > 1 && socketOrder.every((s, k) => s.i === k)) socketOrder.push(socketOrder.shift()); // nunca alinhado
    const rowY = (k) => (n === 1 ? 0 : PANEL_H * 0.32 - (k * PANEL_H * 0.64) / (n - 1));

    const plugs = [], sockets = [];
    const plugGeo = new THREE.SphereGeometry(0.02, 14, 10);
    colors.forEach(({ c, i }, k) => {
      const anchor = new THREE.Vector3(-PANEL_W / 2 + 0.02, rowY(k), 0.005);
      const home = new THREE.Vector3(-PANEL_W * 0.27, rowY(k), 0.02);
      const mesh = new THREE.Mesh(plugGeo, new THREE.MeshBasicMaterial({ color: c }));
      mesh.position.copy(home);
      group.add(mesh);
      const lp = new Float32Array(6);
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.BufferAttribute(lp, 3));
      const wire = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: c }));
      wire.frustumCulled = false;
      group.add(wire);
      const halo = new THREE.Mesh(new THREE.RingGeometry(0.026, 0.033, 20), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      halo.visible = false;
      mesh.add(halo);
      plugs.push({ color: i, mesh, anchor, home, wire, lp, halo, connected: false });
    });
    socketOrder.forEach(({ c, i }, k) => {
      const pos = new THREE.Vector3(PANEL_W * 0.32, rowY(k), 0.01);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.022, 0.032, 20), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
      ring.position.copy(pos);
      group.add(ring);
      sockets.push({ color: i, mesh: ring, pos, flash: 0 });
    });
    // painel sempre visível por cima dos blocos (não some dentro de paredes)
    group.traverse((o) => {
      if (o.material) { o.material.depthTest = false; o.material.transparent = true; }
      o.renderOrder = o === bg ? 10 : 11;
    });
    this.panel = { target, group, plugs, sockets, doneAt: 0 };
    this._updateWires();
  }

  closePanel() {
    if (!this.panel) return;
    this.scene.remove(this.panel.group);
    this.panel.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.panel = null;
    this.grabs.clear();
  }

  _updateWires() {
    for (const p of this.panel.plugs) {
      p.lp.set([p.anchor.x, p.anchor.y, p.anchor.z, p.mesh.position.x, p.mesh.position.y, p.mesh.position.z]);
      p.wire.geometry.attributes.position.needsUpdate = true;
    }
  }

  // Projeta ponto local do painel para pixels da tela
  _toScreen(localPos, out, w, h) {
    this._v.copy(localPos);
    this.panel.group.localToWorld(this._v);
    this._v.project(this.camera);
    out.x = (this._v.x * 0.5 + 0.5) * w;
    out.y = (-this._v.y * 0.5 + 0.5) * h;
    out.behind = this._v.z > 1;
    return out;
  }

  // Ponto da tela -> ponto local no plano do painel
  _screenToPanel(sx, sy, w, h, out) {
    this._ndc.set((sx / w) * 2 - 1, -(sy / h) * 2 + 1);
    this._ray.setFromCamera(this._ndc, this.camera);
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(this.panel.group.quaternion);
    this._plane.setFromNormalAndCoplanarPoint(n, this.panel.group.position);
    if (!this._ray.ray.intersectPlane(this._plane, out)) return null;
    this.panel.group.worldToLocal(out);
    out.x = THREE.MathUtils.clamp(out.x, -PANEL_W / 2, PANEL_W / 2);
    out.y = THREE.MathUtils.clamp(out.y, -PANEL_H / 2, PANEL_H / 2);
    out.z = 0.03;
    return out;
  }

  // pointers: [{ id, x, y (px), down (pegando?) }]
  updatePanel(pointers, w, h, nowMs) {
    const P = this.panel;
    if (!P) return;
    // longe demais -> fecha
    const cam = this.camera.getWorldPosition(new THREE.Vector3());
    if (cam.distanceTo(P.group.position) > I.PANEL_CLOSE_DIST) { this.closePanel(); return; }
    if (P.doneAt) {
      if (nowMs - P.doneAt > 900) this.closePanel();
      return;
    }

    const s = { x: 0, y: 0 };
    const activeIds = new Set();
    this.hover = null;
    for (const ptr of pointers) {
      activeIds.add(ptr.id);
      const grabbed = this.grabs.get(ptr.id);
      if (ptr.down && !grabbed && !ptr.wasDown) {
        // começo de pegada: fio livre mais próximo na tela
        let best = null, bestD = I.GRAB_SCREEN_PX;
        for (const p of P.plugs) {
          if (p.connected || [...this.grabs.values()].includes(p)) continue;
          this._toScreen(p.mesh.position, s, w, h);
          // usa o ponto onde o toque começou (o dedo pode ter andado antes deste quadro)
          const d = Math.hypot(s.x - (ptr.sx ?? ptr.x), s.y - (ptr.sy ?? ptr.y));
          if (d < bestD) { bestD = d; best = p; }
        }
        if (best) {
          this.grabs.set(ptr.id, best);
          const lp = this._screenToPanel(ptr.x, ptr.y, w, h, new THREE.Vector3());
          if (lp) best.mesh.position.copy(lp);
        }
      } else if (ptr.down && grabbed) {
        const lp = this._screenToPanel(ptr.x, ptr.y, w, h, new THREE.Vector3());
        if (lp) grabbed.mesh.position.copy(lp);
      } else if (!ptr.down && grabbed) {
        // leva o fio até onde o dedo soltou (pode ter movido no mesmo quadro)
        const lp = this._screenToPanel(ptr.x, ptr.y, w, h, new THREE.Vector3());
        if (lp) grabbed.mesh.position.copy(lp);
        this._release(ptr.id, grabbed, w, h);
      }
      if (!ptr.down) {
        for (const p of P.plugs) {
          if (p.connected) continue;
          this._toScreen(p.mesh.position, s, w, h);
          if (Math.hypot(s.x - ptr.x, s.y - ptr.y) < I.GRAB_SCREEN_PX) this.hover = p;
        }
      }
    }
    // ponteiros que sumiram soltam o fio
    for (const [id, plug] of [...this.grabs]) if (!activeIds.has(id)) this._release(id, plug, w, h);

    for (const p of P.plugs) p.halo.visible = p === this.hover || [...this.grabs.values()].includes(p);
    for (const sk of P.sockets) {
      sk.flash = Math.max(0, sk.flash - 0.05);
      sk.mesh.scale.setScalar(1 + sk.flash * 0.6);
    }
    this._updateWires();
  }

  _release(id, plug, w, h) {
    this.grabs.delete(id);
    const P = this.panel;
    const s = { x: 0, y: 0 }, ps = { x: 0, y: 0 };
    this._toScreen(plug.mesh.position, ps, w, h);
    let best = null, bestD = I.SNAP_SCREEN_PX;
    for (const sk of P.sockets) {
      this._toScreen(sk.pos, s, w, h);
      const d = Math.hypot(s.x - ps.x, s.y - ps.y);
      if (d < bestD) { bestD = d; best = sk; }
    }
    if (best && best.color === plug.color && !P.sockets.some((o) => o === best && o.used)) {
      plug.connected = true;
      best.used = true;
      plug.mesh.position.copy(best.pos).setZ(0.02);
      this.hooks.onWire && this.hooks.onWire(true);
      if (P.plugs.every((p) => p.connected)) this._finish();
    } else {
      if (best) best.flash = 1;
      plug.mesh.position.copy(plug.home);
      this.hooks.onWire && this.hooks.onWire(false, best ? 'cor errada' : 'longe do encaixe');
    }
  }

  _finish() {
    const t = this.panel.target;
    t.state = 'fixed';
    this.panel.doneAt = performance.now();
    this.hooks.onFixed && this.hooks.onFixed(t);
  }

  reset() {
    this.closePanel();
    for (const t of this.world.targets) { t.state = 'closed'; t.openT = 0; }
  }
}
