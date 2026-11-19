// Zumbis desenhados juntos (v32): cada zumbi feito por código tem 9 pedaços
// (pernas, tronco, cabeça, braços, olhos, boca, mancha). Desenhar um por um
// eram ~9 desenhos por zumbi (36 zumbis ≈ 320 por quadro: o que mais pesava).
// Aqui cada TIPO de pedaço vira um desenho só para todos os zumbis
// (InstancedMesh): ~10 desenhos no total. Os zumbis continuam com o mesmo
// esqueleto de grupos (animação, queda, tiro): só o desenho muda.
// Junto: brilho vermelho em volta dos olhos e sombra suave embaixo de cada zumbi.
import * as THREE from 'three';
import { CONFIG } from './config.js';

function glowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function shadowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class ZombieInstancer {
  constructor(scene) {
    this.scene = scene;
    this.groups = new Map(); // tipo de pedaço -> { im, n, cap }
    this._c = new THREE.Color(); this._m = new THREE.Matrix4(); this._v = new THREE.Vector3();
    this._q = new THREE.Quaternion(); this._s = new THREE.Vector3();
    // sombras (um desenho)
    this.shadowCap = 0; this.shadow = null;
    this.shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    // brilho dos olhos (um desenho)
    this.glowMax = 256;
    this.glowPos = new Float32Array(this.glowMax * 3);
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.BufferAttribute(this.glowPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.glow = new THREE.Points(gg, new THREE.PointsMaterial({ map: glowTex(), color: 0xff2a14, size: CONFIG.ZOMBIES.EYE_GLOW, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.glow.frustumCulled = false;
    scene.add(this.glow);
  }

  // passa a desenhar este zumbi pelos grupos (os pedaços dele ficam escondidos)
  register(z) {
    const parts = [];
    z.m.root.traverse((o) => { if (o.isMesh) { parts.push(o); o.visible = false; } });
    z._parts = parts;
  }

  _group(mesh) {
    const basic = !!mesh.material.isMeshBasicMaterial;
    const key = mesh.geometry.uuid + (basic ? 'b' : 'l');
    let g = this.groups.get(key);
    if (!g) {
      g = { geo: mesh.geometry, basic, n: 0, cap: 0, im: null };
      this.groups.set(key, g);
    }
    return g;
  }

  _ensure(g, n) {
    if (g.cap >= n) return;
    const cap = Math.max(32, 1 << Math.ceil(Math.log2(n)));
    if (g.im) { this.scene.remove(g.im); g.im.dispose(); }
    const mat = g.basic ? new THREE.MeshBasicMaterial({ color: 0xffffff }) : new THREE.MeshLambertMaterial({ color: 0xffffff });
    g.im = new THREE.InstancedMesh(g.geo, mat, cap);
    g.im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    g.im.setColorAt(0, this._c.set(0xffffff));
    g.im.frustumCulled = false;
    g.im.count = 0;
    this.scene.add(g.im);
    g.cap = cap;
  }

  // chamar todo quadro: copia a posição de cada pedaço para o desenho junto
  sync(list) {
    for (const g of this.groups.values()) g.n = 0;
    let ns = 0, ng = 0;
    const visible = list.filter((z) => z.m.root.visible);
    // sombras de todos (feitos por código ou modelo 3D)
    if (visible.length > this.shadowCap) {
      if (this.shadow) { this.scene.remove(this.shadow); this.shadow.dispose(); }
      this.shadowCap = Math.max(32, 1 << Math.ceil(Math.log2(visible.length)));
      this.shadow = new THREE.InstancedMesh(this.shadowGeo, this.shadowMat, this.shadowCap);
      this.shadow.frustumCulled = false;
      this.scene.add(this.shadow);
    }
    // conta antes quantos pedaços de cada tipo (para não recriar no meio do quadro)
    const need = new Map();
    for (const z of visible) if (z._parts) for (const mesh of z._parts) {
      const g = mesh.userData._g || (mesh.userData._g = this._group(mesh));
      need.set(g, (need.get(g) || 0) + 1);
    }
    for (const [g, n] of need) this._ensure(g, n);
    for (const z of visible) {
      const r = z.m.root;
      r.updateMatrixWorld(true);
      // sombra no chão (some quando o corpo afunda)
      if (this.shadow && !(z.dead && z.deadT > CONFIG.ZOMBIES.CORPSE_S)) {
        const k = z.m.scale * (z.dead ? 1.35 : 0.95);
        this._m.compose(this._v.set(r.position.x, r.position.y + 0.02, r.position.z), this._q.identity(), this._s.set(k, 1, k));
        this.shadow.setMatrixAt(ns++, this._m);
      }
      if (!z._parts) continue;
      for (const mesh of z._parts) {
        const g = mesh.userData._g;
        g.im.setMatrixAt(g.n, mesh.matrixWorld);
        const mt = mesh.material;
        this._c.copy(mt.color);
        if (mt.emissive) this._c.add(mt.emissive); // pisca quando leva tiro
        g.im.setColorAt(g.n, this._c);
        g.n++;
        if (mesh.userData.eye && !z.dead && ng < this.glowMax) {
          mesh.getWorldPosition(this._v);
          this.glowPos.set([this._v.x, this._v.y, this._v.z], ng * 3); ng++;
        }
      }
    }
    for (const g of this.groups.values()) {
      if (!g.im) continue;
      g.im.count = g.n;
      g.im.instanceMatrix.needsUpdate = true;
      if (g.im.instanceColor) g.im.instanceColor.needsUpdate = true;
    }
    if (this.shadow) { this.shadow.count = ns; this.shadow.instanceMatrix.needsUpdate = true; }
    this.glow.geometry.setDrawRange(0, ng);
    this.glow.geometry.attributes.position.needsUpdate = true;
    this.glow.visible = ng > 0;
  }

  // quantos desenhos os zumbis custam agora (para o painel 🐞)
  get draws() { let n = 0; for (const g of this.groups.values()) if (g.im && g.im.count) n++; return n + (this.shadow && this.shadow.count ? 1 : 0) + (this.glow.visible ? 1 : 0); }
}
