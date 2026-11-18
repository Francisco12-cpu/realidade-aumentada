// Mapa da escola de verdade: carrega o modelo 3D original (models/escola.glb)
// e monta, a partir dos próprios triângulos dele, uma grade de colisão:
//  - chão: superfícies quase horizontais até CHAO_MAX de altura (calçada,
//    piso, degraus). Mesas e balcões viram "chão alto" e bloqueiam pelo degrau.
//  - parede: superfícies inclinadas/verticais, guardadas por faixa de altura
//    (assim uma verga em cima da porta não bloqueia a passagem).
//  - coberto: tem laje/telhado em cima (usado para escolher pontos dentro das salas).
// Os pontos de sinal (caixas) são escolhidos sozinhos: lugares alcançáveis a pé,
// encostados em parede, bem espalhados, agrupados em áreas.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CONFIG } from './config.js';

const M = CONFIG.MAP;
const BAND = 0.15;          // altura de cada faixa da parede (m)
const NB = 32;              // faixas (32 bits)

export function loadSchoolModel(onProgress) {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    const urls = M.URLS.slice();
    const tryNext = () => {
      const url = urls.shift();
      if (!url) { reject(new Error('modelo da escola não encontrado')); return; }
      loader.load(url, (g) => resolve(g.scene), (e) => {
        if (e.total) onProgress && onProgress(e.loaded / e.total);
      }, () => tryNext());
    };
    tryNext();
  });
}

const tick = () => new Promise((r) => setTimeout(r, 0));

export class CollisionGrid {
  // root: modelo já na posição final (matrixWorld atualizada)
  static async build(root, onProgress) {
    const g = new CollisionGrid();
    const box = new THREE.Box3().setFromObject(root);
    const C = M.CELL;
    g.cell = C;
    g.x0 = box.min.x - 1; g.z0 = box.min.z - 1;
    g.W = Math.ceil((box.max.x - box.min.x + 2) / C);
    g.H = Math.ceil((box.max.z - box.min.z + 2) / C);
    g.Y0 = box.min.y - 0.2;
    const N = g.W * g.H;
    g.floor = new Float32Array(N).fill(-Infinity);
    g.wall = new Uint32Array(N);
    g.wallY0 = new Float32Array(N).fill(Infinity); // faixa 0 da parede começa no chão da célula
    g.covered = new Uint8Array(N);

    const meshes = [];
    root.traverse((o) => { if (o.isMesh && o.geometry && o.geometry.attributes.position) meshes.push(o); });
    let total = 0;
    for (const m of meshes) total += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;

    // 1ª passada: chão e "coberto"; 2ª passada: paredes (precisa do chão de cada célula)
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3();
    const walls = [];
    let done = 0;
    for (const m of meshes) {
      const pos = m.geometry.attributes.position, idx = m.geometry.index;
      const mw = m.matrixWorld;
      const cnt = idx ? idx.count : pos.count;
      const wp = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        a.fromBufferAttribute(pos, i).applyMatrix4(mw);
        wp[i * 3] = a.x; wp[i * 3 + 1] = a.y; wp[i * 3 + 2] = a.z;
      }
      for (let t = 0; t < cnt; t += 3) {
        const i0 = idx ? idx.getX(t) : t, i1 = idx ? idx.getX(t + 1) : t + 1, i2 = idx ? idx.getX(t + 2) : t + 2;
        a.fromArray(wp, i0 * 3); b.fromArray(wp, i1 * 3); c.fromArray(wp, i2 * 3);
        n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a));
        const len = n.length();
        if (len < 1e-9) continue;
        const ny = Math.abs(n.y) / len;
        const minY = Math.min(a.y, b.y, c.y), maxY = Math.max(a.y, b.y, c.y);
        if (ny > 0.75) {
          if (maxY <= M.CHAO_MAX) g._raster(a, b, c, C * 0.7, (k, y) => { if (y > g.floor[k]) g.floor[k] = y; });
          else if (minY > 2.0) g._raster(a, b, c, C, (k) => { g.covered[k] = 1; });
        }
        if (ny < 0.75 && minY < M.CHAO_MAX + 2.2) walls.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      }
      done += cnt / 3;
      onProgress && onProgress(0.5 * done / total);
      await tick();
    }
    // paredes: faixas de altura relativas ao chão da célula
    const nw = walls.length / 9;
    for (let w = 0; w < nw; w++) {
      a.fromArray(walls, w * 9); b.fromArray(walls, w * 9 + 3); c.fromArray(walls, w * 9 + 6);
      g._raster(a, b, c, C * 0.45, (k, y) => {
        const f = g.floor[k] === -Infinity ? 0 : g.floor[k];
        const band = Math.floor((y - f) / BAND);
        if (band >= 0 && band < NB) g.wall[k] |= (1 << band);
      });
      if ((w & 8191) === 0) { onProgress && onProgress(0.5 + 0.5 * w / nw); await tick(); }
    }
    // máscara das faixas que bloqueiam (joelho até a cabeça)
    let mask = 0;
    for (let i = 0; i < NB; i++) {
      const y0 = i * BAND, y1 = y0 + BAND;
      if (y1 > M.PAREDE_DE && y0 < M.PAREDE_ATE) mask |= (1 << i);
    }
    g.mask = mask >>> 0;
    g.refY = 0;
    onProgress && onProgress(1);
    return g;
  }

  // Amostra pontos no triângulo (espaçamento ~step) e chama fn(célula, y).
  _raster(a, b, c, step, fn) {
    const lab = a.distanceTo(b), lac = a.distanceTo(c), lbc = b.distanceTo(c);
    const nu = Math.max(1, Math.ceil(Math.max(lab, lac, lbc) / step));
    for (let i = 0; i <= nu; i++) {
      for (let j = 0; j <= nu - i; j++) {
        const u = i / nu, v = j / nu, w = 1 - u - v;
        const x = a.x * w + b.x * u + c.x * v;
        const y = a.y * w + b.y * u + c.y * v;
        const z = a.z * w + b.z * u + c.z * v;
        const k = this.key(x, z);
        if (k >= 0) fn(k, y);
      }
    }
  }

  key(x, z) {
    const i = Math.floor((x - this.x0) / this.cell), j = Math.floor((z - this.z0) / this.cell);
    if (i < 0 || j < 0 || i >= this.W || j >= this.H) return -1;
    return j * this.W + i;
  }

  floorAt(x, z) {
    const k = this.key(x, z);
    return k < 0 || this.floor[k] === -Infinity ? null : this.floor[k];
  }

  // célula onde dá para ficar em pé vindo da altura fromY
  _cellOk(k, fromY) {
    if (k < 0) return false;
    const f = this.floor[k];
    if (f === -Infinity || Math.abs(f - fromY) > M.DEGRAU) return false;
    return (this.wall[k] & this.mask) === 0;
  }

  isFree(x, z, r, fromY = this.refY) {
    const C = this.cell, n = Math.ceil(r / C);
    const ci = Math.floor((x - this.x0) / C), cj = Math.floor((z - this.z0) / C);
    for (let dj = -n; dj <= n; dj++) {
      for (let di = -n; di <= n; di++) {
        const i = ci + di, j = cj + dj;
        // só as células que encostam no círculo do jogador
        const cx = this.x0 + (i + 0.5) * C, cz = this.z0 + (j + 0.5) * C;
        if (Math.hypot(cx - x, cz - z) > r + C * 0.5) continue;
        if (i < 0 || j < 0 || i >= this.W || j >= this.H) return false;
        if (!this._cellOk(j * this.W + i, fromY)) return false;
      }
    }
    return true;
  }

  // primeiro ponto onde o segmento a->b bate em parede ou entra no chão
  segmentHit(a, b) {
    const len = a.distanceTo(b);
    const steps = Math.max(1, Math.ceil(len / 0.1));
    const p = new THREE.Vector3();
    for (let s = 1; s <= steps; s++) {
      p.lerpVectors(a, b, s / steps);
      const k = this.key(p.x, p.z);
      if (k < 0) return { point: p.clone() };
      const f = this.floor[k] === -Infinity ? 0 : this.floor[k];
      const band = Math.floor((p.y - f) / BAND);
      if (p.y < f - 0.05) return { point: p.clone() };
      if (band >= 0 && band < NB && (this.wall[k] & (1 << band))) return { point: p.clone() };
    }
    return null;
  }

  // Células alcançáveis a pé a partir de (x, z): busca em largura.
  reachable(x, z, r) {
    const N = this.W * this.H;
    const seen = new Uint8Array(N);
    const fy = new Float32Array(N);
    const start = this.key(x, z);
    if (start < 0) return seen;
    const q = new Int32Array(N);
    let h = 0, t = 0;
    q[t++] = start; seen[start] = 1; fy[start] = this.floor[start] === -Infinity ? 0 : this.floor[start];
    while (h < t) {
      const k = q[h++];
      const i = k % this.W, j = (k / this.W) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= this.W || nj >= this.H) continue;
        const nk = nj * this.W + ni;
        if (seen[nk]) continue;
        const cx = this.x0 + (ni + 0.5) * this.cell, cz = this.z0 + (nj + 0.5) * this.cell;
        if (!this.isFree(cx, cz, r, fy[k])) continue;
        seen[nk] = 1; fy[nk] = this.floor[nk]; q[t++] = nk;
      }
    }
    return seen;
  }

  // perto de parede (distância em células)?
  nearWall(k, dist) {
    const i = k % this.W, j = (k / this.W) | 0;
    for (let dj = -dist; dj <= dist; dj++) {
      for (let di = -dist; di <= dist; di++) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= this.W || nj >= this.H) continue;
        if (this.wall[nj * this.W + ni] & this.mask) return true;
      }
    }
    return false;
  }
}

// Escolhe os pontos de sinal: alcançáveis, encostados em parede, de preferência
// cobertos (dentro das salas/corredores), espalhados. Agrupa em AREAS áreas,
// cada uma com alguns lugares (a partida sorteia um lugar por área).
export function autoTargets(grid, spawn, boxHalf) {
  const seen = grid.reachable(spawn.x, spawn.z, M.RAIO_JOGADOR);
  const cand = [];
  const C = grid.cell;
  for (let k = 0; k < seen.length; k++) {
    if (!seen[k]) continue;
    const i = k % grid.W, j = (k / grid.W) | 0;
    if ((i + j) % 2) continue; // metade das células já basta
    const x = grid.x0 + (i + 0.5) * C, z = grid.z0 + (j + 0.5) * C;
    if (Math.hypot(x - spawn.x, z - spawn.z) < M.LONGE_DO_INICIO) continue;
    if (!grid.nearWall(k, 3)) continue;
    // a caixa precisa caber: livre num raio pequeno
    if (!grid.isFree(x, z, 0.3, grid.floor[k])) continue;
    cand.push({ x, z, y: grid.floor[k], covered: grid.covered[k] });
  }
  // prefere lugares cobertos (dentro); se tiver poucos, usa todos
  const inside = cand.filter((p) => p.covered);
  const pool = inside.length > 60 ? inside : cand;
  // espalha: escolhe o mais longe dos já escolhidos (farthest point)
  const spots = [];
  if (pool.length) {
    let best = pool[Math.floor(pool.length / 2)];
    spots.push(best);
    const dmin = new Float32Array(pool.length).fill(Infinity);
    while (spots.length < M.AREAS * M.LUGARES_POR_AREA) {
      let bi = -1, bd = -1;
      for (let p = 0; p < pool.length; p++) {
        const d = Math.hypot(pool[p].x - best.x, pool[p].z - best.z);
        if (d < dmin[p]) dmin[p] = d;
        if (dmin[p] > bd) { bd = dmin[p]; bi = p; }
      }
      if (bi < 0 || bd < M.DIST_MIN) break;
      best = pool[bi];
      spots.push(best);
    }
  }
  // agrupa em áreas: k-means simples (começa pelos primeiros, que já estão espalhados)
  const K = Math.min(M.AREAS, spots.length);
  let centers = spots.slice(0, K).map((p) => ({ x: p.x, z: p.z }));
  let groups = [];
  for (let it = 0; it < 12; it++) {
    groups = centers.map(() => []);
    for (const p of spots) {
      let bi = 0, bd = Infinity;
      centers.forEach((c, ci) => { const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < bd) { bd = d; bi = ci; } });
      groups[bi].push(p);
    }
    centers = groups.map((g, gi) => (g.length ? { x: g.reduce((s, p) => s + p.x, 0) / g.length, z: g.reduce((s, p) => s + p.z, 0) / g.length } : centers[gi]));
  }
  // áreas em ordem de distância do início (área 1 = mais perto)
  const areas = groups.filter((g) => g.length).map((g, gi) => ({ g, d: Math.hypot(centers[gi].x - spawn.x, centers[gi].z - spawn.z) }))
    .sort((p, q) => p.d - q.d);
  return areas.map(({ g }, ai) => ({
    id: `area-${ai + 1}`,
    name: `área ${ai + 1}`,
    spots: g.map((p) => ({ pos: [p.x, p.y + boxHalf, p.z], normal: [0, 1, 0] })),
  }));
}
