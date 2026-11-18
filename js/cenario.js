// Cenário em volta da escola (v24), todo feito por código (sem arquivos):
//  céu com nuvens que acompanha o jogador · chão de terra e grama · ruas com
//  faixa e calçadas · prédios com janelas (alguns acesos, outros quebrados) ·
//  carros batidos, postes, árvores, barris pegando fogo e fumaça ao longe.
// Tudo junto em poucas peças (poucos desenhos = leve no celular). Fica FORA
// da escola, então não muda a colisão.
import * as THREE from 'three';
import { CONFIG } from './config.js';

const C = () => CONFIG.CENARIO;

// gerador de números "aleatórios" fixo (o cenário é sempre o mesmo)
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, g: c.getContext('2d') };
}

function tex(c, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// pontinhos de ruído por cima de uma cor (terra, asfalto, concreto)
function speckle(g, w, h, base, n, colors, r, size = 2) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[Math.floor(r() * colors.length)];
    g.globalAlpha = 0.25 + r() * 0.5;
    const s = size * (0.5 + r());
    g.fillRect(r() * w, r() * h, s, s);
  }
  g.globalAlpha = 1;
}

// ---------------- texturas ----------------
function groundTex() {
  const r = rng(11), { c, g } = canvas(512, 512);
  speckle(g, 512, 512, '#6f6a4a', 9000, ['#5d6b3a', '#7d7550', '#57513a', '#8a8060', '#4c5a33'], r, 3);
  // manchas de terra
  for (let i = 0; i < 26; i++) {
    const x = r() * 512, y = r() * 512, rad = 20 + r() * 60;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, 'rgba(120,100,70,0.55)'); gr.addColorStop(1, 'rgba(120,100,70,0)');
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  return tex(c);
}

function asphaltTex() {
  const r = rng(22), { c, g } = canvas(256, 512);
  speckle(g, 256, 512, '#3a3b3e', 6000, ['#2c2d30', '#47484c', '#333438', '#55565a'], r, 2);
  // rachaduras
  g.strokeStyle = 'rgba(20,20,22,0.7)'; g.lineWidth = 1.5;
  for (let i = 0; i < 10; i++) {
    let x = r() * 256, y = r() * 512; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 30; y += (r() - 0.5) * 30; g.lineTo(x, y); }
    g.stroke();
  }
  // faixa tracejada no meio e linhas das bordas
  g.fillStyle = '#d8c25a';
  for (let y = 0; y < 512; y += 128) g.fillRect(122, y + 10, 12, 70);
  g.fillStyle = '#cfcfc8'; g.fillRect(8, 0, 6, 512); g.fillRect(242, 0, 6, 512);
  return tex(c);
}

function concreteTex() {
  const r = rng(33), { c, g } = canvas(256, 256);
  speckle(g, 256, 256, '#8d8a84', 4000, ['#7c7973', '#9d9a94', '#85827c'], r, 2);
  g.strokeStyle = 'rgba(60,58,55,0.6)'; g.lineWidth = 2;
  for (let i = 0; i <= 256; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
  return tex(c);
}

// fachada: grade de janelas (escuras, algumas acesas, algumas quebradas)
function facadeTex() {
  const r = rng(44), { c, g } = canvas(256, 256);
  speckle(g, 256, 256, '#bdb6aa', 3000, ['#aaa396', '#c9c2b6', '#9e978a'], r, 2);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const px = 14 + x * 64, py = 12 + y * 64;
    const k = r();
    g.fillStyle = k < 0.12 ? '#f2c66b' : k < 0.2 ? '#151515' : '#2c3640';
    g.fillRect(px, py, 36, 42);
    if (k >= 0.12 && k < 0.2) { // quebrada: cacos
      g.strokeStyle = '#6d7a86'; g.beginPath(); g.moveTo(px, py); g.lineTo(px + 20, py + 26); g.lineTo(px + 36, py + 8); g.stroke();
    } else if (k >= 0.2) { g.fillStyle = 'rgba(160,190,210,0.25)'; g.fillRect(px + 2, py + 2, 12, 38); }
    g.fillStyle = '#8b857a'; g.fillRect(px - 3, py + 42, 42, 5); // peitoril
  }
  // canto de cima à esquerda: cor lisa do telhado (UV 0..0.04)
  g.fillStyle = '#4a4744'; g.fillRect(0, 0, 10, 10);
  return tex(c);
}

function skyTex() {
  const r = rng(55), W = 1024, H = 512, { c, g } = canvas(W, H);
  const gr = g.createLinearGradient(0, 0, 0, H / 2);
  const S = C();
  gr.addColorStop(0, S.SKY_TOP); gr.addColorStop(0.75, S.SKY_MID); gr.addColorStop(1, S.SKY_HORIZON);
  g.fillStyle = gr; g.fillRect(0, 0, W, H / 2);
  g.fillStyle = S.SKY_HORIZON; g.fillRect(0, H / 2, W, H / 2);
  // nuvens: muitas manchas suaves, mais perto do horizonte
  for (let i = 0; i < 260; i++) {
    const y = Math.pow(r(), 0.7) * H * 0.47, x = r() * W, rad = 18 + r() * 70 * (1 - y / H);
    const a = 0.05 + r() * 0.12;
    for (const off of [0, -W, W]) { // repete nas bordas (sem emenda)
      const cg = g.createRadialGradient(x + off, y, 0, x + off, y, rad);
      cg.addColorStop(0, `rgba(235,226,212,${a})`); cg.addColorStop(1, 'rgba(235,226,212,0)');
      g.fillStyle = cg; g.fillRect(x + off - rad, y - rad, rad * 2, rad * 2);
    }
  }
  const t = tex(c, false);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function smokeTex() {
  const { c, g } = canvas(128, 128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(70,66,62,0.85)'); gr.addColorStop(0.5, 'rgba(70,66,62,0.4)'); gr.addColorStop(1, 'rgba(70,66,62,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return tex(c, false);
}

function fireTex() {
  const { c, g } = canvas(64, 64);
  const gr = g.createRadialGradient(32, 40, 0, 32, 36, 32);
  gr.addColorStop(0, 'rgba(255,240,170,1)'); gr.addColorStop(0.35, 'rgba(255,150,40,0.9)'); gr.addColorStop(1, 'rgba(200,40,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return tex(c, false);
}

// ---------------- materiais ----------------
// "Neblina de longe": os prédios usam uma neblina própria, bem mais distante
// que a da escola, para aparecerem no horizonte (silhueta da cidade).
function hazeMaterial(params, near, far) {
  const m = new THREE.MeshLambertMaterial(params);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.cenNear = { value: near };
    sh.uniforms.cenFar = { value: far };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <fog_pars_fragment>', THREE.ShaderChunk.fog_pars_fragment.replace(/fogNear/g, 'cenNear').replace(/fogFar/g, 'cenFar'))
      .replace('#include <fog_fragment>', THREE.ShaderChunk.fog_fragment.replace(/fogNear/g, 'cenNear').replace(/fogFar/g, 'cenFar'));
  };
  m.customProgramCacheKey = () => `haze-${near}-${far}`;
  return m;
}

// ---------------- geometria juntada ----------------
// Junta várias caixas/cilindros (cada um com sua matriz e cor) numa peça só.
class Merger {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; }
  add(geo, matrix, color, uvMode = null) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(matrix);
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    const c = new THREE.Color(color);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      this.pos.push(x, y, z);
      const nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i);
      this.nor.push(nx, ny, nz);
      if (uvMode) {
        // fachada: janelas repetem pelo tamanho do prédio; telhado = cor lisa
        if (Math.abs(ny) > 0.5) this.uv.push(0.02, 0.98);
        else this.uv.push((Math.abs(nx) > 0.5 ? z : x) / uvMode.w, y / uvMode.h);
      } else this.uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0);
      this.col.push(c.r, c.g, c.b);
    }
    g.dispose();
  }
  mesh(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, material);
    m.matrixAutoUpdate = false;
    return m;
  }
  get count() { return this.pos.length / 3; }
}

const M4 = (x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
const CONE = new THREE.ConeGeometry(0.5, 1, 8);

// ---------------- montagem ----------------
// box: Box3 da escola · y0: altura do chão
export function buildCenario(scene, box, y0 = 0) {
  const S = C();
  const r = rng(77);
  const group = new THREE.Group();
  group.name = 'cenario';
  const x0 = box.min.x - S.MARGIN, x1 = box.max.x + S.MARGIN;
  const z0 = box.min.z - S.MARGIN, z1 = box.max.z + S.MARGIN;
  const RW = S.ROAD_W, SW = S.SIDEWALK_W;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;

  // chão grande (terra e grama), um pouco abaixo do piso da escola
  const gt = groundTex(); gt.repeat.set(S.GROUND_SIZE / 14, S.GROUND_SIZE / 14);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(S.GROUND_SIZE, S.GROUND_SIZE), new THREE.MeshLambertMaterial({ map: gt }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(cx, y0 - 0.08, cz);
  group.add(ground);

  // ruas em volta (anel) + calçadas
  const at = asphaltTex();
  const roadMat = new THREE.MeshLambertMaterial({ map: at });
  const ct = concreteTex();
  const walkMat = new THREE.MeshLambertMaterial({ map: ct });
  const strip = (mat, ax, az, bx, bz, w, y, texLen) => {
    const len = Math.hypot(bx - ax, bz - az);
    const geo = new THREE.PlaneGeometry(w, len);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i) * len / texLen);
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = -Math.atan2(bx - ax, bz - az) + Math.PI;
    m.position.set((ax + bx) / 2, y, (az + bz) / 2);
    m.updateMatrix(); m.matrixAutoUpdate = false;
    group.add(m);
  };
  const ro = SW + RW / 2; // centro da rua a partir da borda da escola
  strip(roadMat, x0 - ro, z0 - ro - RW / 2, x0 - ro, z1 + ro + RW / 2, RW, y0 - 0.05, 16);
  strip(roadMat, x1 + ro, z0 - ro - RW / 2, x1 + ro, z1 + ro + RW / 2, RW, y0 - 0.05, 16);
  strip(roadMat, x0 - ro + RW / 2, z0 - ro, x1 + ro - RW / 2, z0 - ro, RW, y0 - 0.049, 16);
  strip(roadMat, x0 - ro + RW / 2, z1 + ro, x1 + ro - RW / 2, z1 + ro, RW, y0 - 0.049, 16);
  const so = SW / 2;
  strip(walkMat, x0 - so, z0 - SW, x0 - so, z1 + SW, SW, y0 - 0.04, 4);
  strip(walkMat, x1 + so, z0 - SW, x1 + so, z1 + SW, SW, y0 - 0.04, 4);
  strip(walkMat, x0, z0 - so, x1, z0 - so, SW, y0 - 0.039, 4);
  strip(walkMat, x0, z1 + so, x1, z1 + so, SW, y0 - 0.039, 4);

  // prédios: anel depois da rua (do outro lado), alturas variadas
  const ft = facadeTex();
  const bMat = hazeMaterial({ map: ft, vertexColors: true }, S.HAZE_NEAR, S.HAZE_FAR);
  const bm = new Merger();
  const inner = SW + RW + S.BUILD_GAP; // do muro da escola até a frente dos prédios
  const wallColors = [0xd8cfc0, 0xc9b9a3, 0xb8c0c4, 0xd6c3a5, 0xa9a49c, 0xc7a891, 0xe0d8cc];
  const row = (ax, az, bx, bz, nx, nz) => {
    // ao longo do segmento a->b; (nx, nz) = para fora (longe da escola)
    const len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len;
    for (let rowK = 0; rowK < S.BUILD_ROWS; rowK++) {
      let t = -10 + r() * 6;
      const back = rowK * 22;
      while (t < len + 10) {
        const w = 8 + r() * 12, d = 9 + r() * 8;
        const h = (rowK ? 14 : 6) + r() * (rowK ? 30 : 18);
        const off = inner + back + d / 2 + r() * 3;
        const px = ax + dx * (t + w / 2) + nx * off, pz = az + dz * (t + w / 2) + nz * off;
        const ry = Math.atan2(dx, dz) + Math.PI / 2;
        bm.add(BOX, M4(px, y0 + h / 2, pz, ry, w, h, d), wallColors[Math.floor(r() * wallColors.length)], { w: 4, h: 3.2 });
        t += w + 1.5 + r() * 4;
      }
    }
  };
  row(x0, z0, x1, z0, 0, -1);
  row(x1, z1, x0, z1, 0, 1);
  row(x0, z1, x0, z0, -1, 0);
  row(x1, z0, x1, z1, 1, 0);
  const buildings = bm.mesh(bMat);
  group.add(buildings);

  // ruas: carros batidos/abandonados, postes, árvores na calçada
  const pm = new Merger();
  const carColors = [0x8b1e1e, 0x1f3f73, 0xd9d6cf, 0x2b2b2b, 0x6b6f2a, 0x3d5c4a, 0x9a6a2a, 0x3a3a3a];
  const car = (x, z, ry, tilt, burnt) => {
    const col = burnt ? 0x1c1a18 : carColors[Math.floor(r() * carColors.length)];
    const base = new THREE.Matrix4().compose(new THREE.Vector3(x, y0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, ry, tilt * 0.6)), new THREE.Vector3(1, 1, 1));
    const part = (m) => new THREE.Matrix4().multiplyMatrices(base, m);
    pm.add(BOX, part(M4(0, 0.55, 0, 0, 1.8, 0.6, 4.2)), col);
    pm.add(BOX, part(M4(0, 1.05, -0.2, 0, 1.6, 0.5, 2.2)), burnt ? 0x111111 : 0x2a3540);
    for (const [wx, wz] of [[-0.85, 1.3], [0.85, 1.3], [-0.85, -1.3], [0.85, -1.3]]) pm.add(CYL, part(M4(wx, 0.33, wz, 0, 0.66, 0.25, 0.66, 0, Math.PI / 2)), 0x151515);
  };
  const roadPts = [];
  const edges = [
    [x0 - ro, z0 - ro, x0 - ro, z1 + ro], [x1 + ro, z0 - ro, x1 + ro, z1 + ro],
    [x0 - ro, z0 - ro, x1 + ro, z0 - ro], [x0 - ro, z1 + ro, x1 + ro, z1 + ro],
  ];
  for (const [ax, az, bx, bz] of edges) {
    const len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len;
    const ry = Math.atan2(dx, dz);
    for (let t = 6 + r() * 10; t < len - 6; t += S.CAR_EVERY * (0.6 + r() * 0.9)) {
      const side = (r() < 0.5 ? -1 : 1) * RW * 0.22;
      const x = ax + dx * t - dz * side, z = az + dz * t + dx * side;
      const crashed = r() < 0.45;
      car(x, z, ry + (crashed ? (r() - 0.5) * 1.6 : (r() < 0.5 ? 0 : Math.PI)), crashed && r() < 0.3 ? 0.25 : 0, r() < 0.2);
      roadPts.push([x, z]);
    }
    // postes e árvores na calçada do outro lado da rua (perto dos prédios)
    const nx = (bz - az) / len, nz = -(bx - ax) / len; // um dos lados
    for (let t = 4; t < len - 4; t += S.POLE_EVERY) {
      const outSign = Math.sign((ax + dx * t + nx * 5 - cx) * nx + (az + dz * t + nz * 5 - cz) * nz) || 1;
      const off = RW / 2 + 1;
      const px = ax + dx * t + nx * off * outSign, pz = az + dz * t + nz * off * outSign;
      pm.add(BOX, M4(px, y0 + 3.5, pz, 0, 0.15, 7, 0.15), 0x55585c);
      pm.add(BOX, M4(px - nx * outSign * 0.7, y0 + 7, pz - nz * outSign * 0.7, ry, 0.15, 0.12, 1.6), 0x55585c);
      if (r() < 0.6) {
        const tx = px + dx * S.POLE_EVERY / 2, tz = pz + dz * S.POLE_EVERY / 2, th = 3 + r() * 2.5;
        pm.add(CYL, M4(tx, y0 + th / 2, tz, 0, 0.35, th, 0.35), 0x5a4330);
        pm.add(CONE, M4(tx, y0 + th + 1.4, tz, r() * 6, 3 + r(), 3.6 + r() * 1.5, 3 + r()), r() < 0.3 ? 0x6b5a33 : 0x3f5a2e);
      }
    }
  }
  // barris (fogo em cima)
  const fires = [];
  for (let i = 0; i < S.FIRES; i++) {
    const p = roadPts[Math.floor(r() * roadPts.length)] || [x0 - ro, z0];
    const fx = p[0] + 2.5, fz = p[1] + 1.5;
    pm.add(CYL, M4(fx, y0 + 0.45, fz, 0, 0.6, 0.9, 0.6), 0x4a3a2c);
    fires.push(new THREE.Vector3(fx, y0 + 1.25, fz));
  }
  const props = pm.mesh(new THREE.MeshLambertMaterial({ vertexColors: true }));
  group.add(props);

  // fogo dos barris: sprites que piscam
  const fireMat = new THREE.SpriteMaterial({ map: fireTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const fireSprites = fires.map((p) => { const s = new THREE.Sprite(fireMat); s.position.copy(p); s.scale.set(1.2, 1.6, 1); group.add(s); return s; });

  // fumaça subindo ao longe (colunas de sprites que sobem e somem)
  const smokeMat = new THREE.SpriteMaterial({ map: smokeTex(), transparent: true, depthWrite: false, fog: false, opacity: 0.6 });
  const smoke = [];
  for (let k = 0; k < S.SMOKES; k++) {
    const ang = r() * Math.PI * 2, dist = Math.max(x1 - x0, z1 - z0) * 0.5 + 40 + r() * 60;
    const base = new THREE.Vector3(cx + Math.cos(ang) * dist, y0 + 10, cz + Math.sin(ang) * dist);
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(smokeMat.clone());
      s.userData = { base, t: i / 6, drift: (r() - 0.5) * 8 };
      group.add(s);
      smoke.push(s);
    }
  }

  // céu: esfera grande que acompanha o jogador
  const sky = new THREE.Mesh(new THREE.SphereGeometry(S.SKY_R, 32, 16), new THREE.MeshBasicMaterial({ map: skyTex(), side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  group.add(sky);

  scene.add(group);

  let t0 = 0;
  return {
    group, sky, buildings, props,
    // chamar todo quadro (p = posição da câmera)
    update(dt, p) {
      sky.position.copy(p);
      t0 += dt;
      for (let i = 0; i < fireSprites.length; i++) {
        const k = 0.85 + Math.sin(t0 * 13 + i * 2.1) * 0.1 + Math.sin(t0 * 7.3 + i) * 0.08;
        fireSprites[i].scale.set(1.1 * k, 1.6 * k, 1);
      }
      for (const s of smoke) {
        const u = s.userData;
        u.t = (u.t + dt * 0.035) % 1;
        const k = u.t;
        s.position.set(u.base.x + u.drift * k, u.base.y + k * 45, u.base.z + u.drift * k * 0.5);
        const sc = 8 + k * 26;
        s.scale.set(sc, sc, 1);
        s.material.opacity = 0.55 * Math.sin(Math.PI * k);
      }
    },
  };
}
