// Zumbis: bonecos feitos no código (sem arquivos), espalhados pela escola.
//  - parados balançando até verem/ouvirem o jogador (ou ouvirem um tiro);
//  - depois perseguem pelo caminho a pé (busca em largura na grade da escola);
//  - de perto, atacam (o jogador perde vida);
//  - tiro na cabeça mata na hora; no corpo precisa de ZOMBIES.HP tiros.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { playAnim, playOnce } from './zumbimodelo.js';

const Z = CONFIG.ZOMBIES;
const STEP = CONFIG.MAP.DEGRAU;
const SKINS = [0x7d9a6a, 0x8aa36f, 0x6f8c62, 0x9aa27a, 0x7c8f74];
const SHIRTS = [0x3b4f7a, 0x7a2f2f, 0xd8d8d0, 0x4c6b3c, 0x5a4a6e, 0x8a7a5a, 0x2f2f2f];
const PANTS = [0x2c3445, 0x3a3a3a, 0x4a3b2a, 0x1f2a3a];

const box = (w, h, d, y = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, y, 0); return g; };
const GEO = {
  leg: box(0.17, 0.9, 0.19, -0.45),
  torso: box(0.5, 0.62, 0.28, 0.31),
  head: box(0.27, 0.3, 0.27, 0.15),
  arm: box(0.13, 0.62, 0.13, -0.31),
  eye: box(0.06, 0.035, 0.02),
  mouth: box(0.12, 0.04, 0.02),
};
const EYE = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
const DARK = new THREE.MeshBasicMaterial({ color: 0x1a0d0d });
const BLOOD = new THREE.MeshBasicMaterial({ color: 0x7a0a0a });
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export function makeZombie() {
  const skin = new THREE.MeshLambertMaterial({ color: pick(SKINS) });
  const shirt = new THREE.MeshLambertMaterial({ color: pick(SHIRTS) });
  const pants = new THREE.MeshLambertMaterial({ color: pick(PANTS) });
  const root = new THREE.Group();
  const body = new THREE.Group(); // tudo que inclina/cai
  root.add(body);
  const hips = new THREE.Group(); hips.position.y = 0.92; body.add(hips);
  const legL = new THREE.Mesh(GEO.leg, pants); legL.position.x = -0.12;
  const legR = new THREE.Mesh(GEO.leg, pants); legR.position.x = 0.12;
  hips.add(legL, legR);
  const torso = new THREE.Mesh(GEO.torso, shirt); torso.rotation.x = 0.18; hips.add(torso);
  const neck = new THREE.Group(); neck.position.set(0, 0.6, 0.06); torso.add(neck);
  const head = new THREE.Mesh(GEO.head, skin); neck.add(head);
  const eL = new THREE.Mesh(GEO.eye, EYE); eL.position.set(-0.065, 0.19, 0.14);
  const eR = new THREE.Mesh(GEO.eye, EYE); eR.position.set(0.065, 0.19, 0.14);
  const mouth = new THREE.Mesh(GEO.mouth, DARK); mouth.position.set(0, 0.07, 0.14);
  head.add(eL, eR, mouth);
  const stain = new THREE.Mesh(box(0.16, 0.14, 0.02), BLOOD); stain.position.set(0.1, 0.35, 0.145); torso.add(stain);
  const armL = new THREE.Group(); armL.position.set(-0.32, 0.55, 0); torso.add(armL);
  const armR = new THREE.Group(); armR.position.set(0.32, 0.55, 0); torso.add(armR);
  armL.add(new THREE.Mesh(GEO.arm, skin)); armR.add(new THREE.Mesh(GEO.arm, skin));
  const s = 0.92 + Math.random() * 0.16;
  root.scale.setScalar(s);
  return { root, body, hips, legL, legR, torso, neck, head, armL, armR, mats: [skin, shirt, pants], scale: s };
}

export class Horde {
  constructor(scene, world, hooks = {}) {
    this.scene = scene;
    this.world = world;
    this.hooks = hooks;
    this.factory = null; // v31: se tiver o modelo 3D (models/zumbi.glb), cria a partir dele
    this.list = [];
    this.planned = 0;
    this.pending = 0;
    this.waveT = 0;
    this.waves = 0;
    this.flow = null;
    this._flowT = 0;
    this._groanT = 0;
    this._v = new THREE.Vector3();
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
  }

  // vivos = na escola + os que ainda vão chegar nas próximas ondas
  // (o zumbi do susto que vem correndo é "extra": não conta no placar)
  get alive() { return this.list.filter((z) => !z.dead && !z.dummy && !z.extra).length + this.pending; }
  get killed() { return this.list.filter((z) => z.dead && !z.dummy && !z.extra).length; }
  get total() { return this.planned; }

  clear() {
    for (const z of this.list) {
      this.scene.remove(z.m.root);
      for (const m of z.m.mats) m.dispose();
    }
    this.list = [];
    this.flow = null;
    this._flowAt = null;
    this.planned = 0;
    this.pending = 0;
    this.waveT = 0;
    this.waves = 0;
  }

  _add(x, y, z, opts = {}) {
    const m = this.factory ? this.factory() : makeZombie();
    m.root.position.set(x, y, z);
    m.root.rotation.y = opts.yaw ?? Math.random() * Math.PI * 2;
    this.scene.add(m.root);
    if (opts.scream && !m.gltf && m.mats[0]) m.mats[0].color.setHex(0xb8c7a8); // pele mais pálida
    const zb = {
      m, hp: opts.hp ?? Z.HP, dead: false, deadT: 0, dummy: !!opts.dummy,
      alert: false, speed: Z.SPEED_MIN + Math.random() * (Z.SPEED_MAX - Z.SPEED_MIN),
      phase: Math.random() * 10, attackT: 0, hitT: 0, losT: Math.random() * 0.3, los: false,
      wander: 0, wanderYaw: Math.random() * 6.28, moving: 0,
      punches: 0, knock: null, animN: 0, animAcc: 0,
      flank: !opts.dummy && Math.random() < Z.FLANK_P, // v26: tenta pegar por trás
      groanT: 1 + Math.random() * 4, stepT: Math.random() * 0.5,
      scream: !!opts.scream, screamed: false,
      extra: !!opts.extra, runner: !!opts.runner, born: 0,
    };
    this.list.push(zb);
    return zb;
  }

  // Partida: `count` zumbis no total. Alguns já estão espalhados pela escola
  // (longe da porta); o resto chega em ondas, de tempos em tempos,
  // nascendo escondidos a 15–35 m do jogador e já vindo atrás dele.
  spawnHorde(count, start) {
    this.planned = count;
    const first = Math.min(count, Z.START_COUNT);
    const pts = this._pick(this._cands(start), first, (p) => Math.hypot(p.x - start.x, p.z - start.z) >= Z.MIN_DIST_START);
    for (const p of pts) this._add(p.x, p.y, p.z);
    this.pending = count - pts.length;
    this.waveT = Z.FIRST_WAVE_S;
    this.waves = 0;
    return count;
  }

  _wave(player) {
    const n = Math.min(this.pending, Z.WAVE_SIZE);
    const eye = new THREE.Vector3(player.x, player.y + 1.5, player.z), to = new THREE.Vector3();
    const ok = (p, far) => {
      const d = Math.hypot(p.x - player.x, p.z - player.z);
      if (d < Z.WAVE_MIN_DIST || d > (far ? 80 : Z.WAVE_MAX_DIST)) return false;
      to.set(p.x, p.y + 1.5, p.z);
      return !!this.world.segmentHit(eye, to); // nasce escondido (parede no meio)
    };
    const c = this._cands(this.world.spawn);
    let pts = this._pick(c, n, (p) => ok(p, false));
    if (pts.length < n) pts = pts.concat(this._pick(c, n - pts.length, (p) => ok(p, true)));
    for (const p of pts) this._add(p.x, p.y, p.z).alert = true;
    this.pending -= pts.length;
    if (pts.length) { this.waves++; this.hooks.onWave && this.hooks.onWave(pts.length, this.pending); }
  }

  // Zumbi de treino (tutorial): parado, 1 tiro, não ataca.
  spawnDummy(pos, yawToPlayer) {
    return this._add(pos.x, pos.y, pos.z, { dummy: true, hp: 1, yaw: yawToPlayer });
  }

  // Lugares possíveis (alcançáveis a pé, dentro do muro). Calculado uma vez.
  _cands(start) {
    const w = this.world;
    if (w._zcand) return w._zcand;
    const cand = [];
    if (w.grid) {
      const g = w.grid;
      if (!w._reach) w._reach = g.reachable(start.x, start.z, 0.3);
      const seen = w._reach;
      for (let k = 0; k < seen.length; k += 3) {
        if (!seen[k]) continue;
        const i = k % g.W, j = (k / g.W) | 0;
        const x = g.x0 + (i + 0.5) * g.cell, z = g.z0 + (j + 0.5) * g.cell;
        const A = Z.AREA;
        if (A && (x < A[0] || x > A[1] || z < A[2] || z > A[3])) continue;
        if (!g.isFree(x, z, 0.35, g.floor[k])) continue;
        cand.push({ x, y: g.floor[k], z });
      }
    } else {
      const B = w.bounds || 19;
      for (let n = 0; n < 4000; n++) {
        const x = (Math.random() * 2 - 1) * B, z = (Math.random() * 2 - 1) * B;
        if (w.isFree(x, z, 0.4)) cand.push({ x, y: 0, z });
      }
    }
    w._zcand = cand;
    return cand;
  }

  // Sorteia até `count` lugares que passam no teste, afastados entre si e dos zumbis vivos.
  _pick(cand, count, test) {
    const out = [];
    const live = this.list.filter((z) => !z.dead).map((z) => z.m.root.position);
    const order = Array.from({ length: cand.length }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    for (let d = Z.SPREAD; d >= 2 && out.length < count; d *= 0.7) {
      let tries = 0;
      for (const i of order) {
        if (out.length >= count || ++tries > 4000) break;
        const p = cand[i];
        if (out.includes(p)) continue;
        if (!out.every((q) => Math.hypot(q.x - p.x, q.z - p.z) >= d)) continue;
        if (!live.every((q) => Math.hypot(q.x - p.x, q.z - p.z) >= 3)) continue;
        if (test(p)) out.push(p);
      }
    }
    return out;
  }

  // Tiro: todos perto escutam e vêm.
  alertAll(pos, radius) {
    for (const z of this.list) if (!z.dead && !z.dummy && z.m.root.position.distanceTo(pos) < radius) z.alert = true;
  }

  // Raio (o, d) contra os zumbis vivos. Retorna { zombie, part, dist, point } ou null.
  // Ajuda de mira: aceita até ASSIST_DEG de erro do centro do corpo.
  rayHit(o, d, range) {
    let best = null;
    const test = (z, cy, r, part) => {
      const c = this._a.copy(z.m.root.position); c.y += cy * z.m.scale;
      const oc = this._b.subVectors(c, o);
      const t = oc.dot(d);
      if (t < 0 || t > range) return;
      const d2 = oc.lengthSq() - t * t;
      if (d2 > r * r) return;
      const dist = t - Math.sqrt(r * r - d2);
      if (!best || dist < best.dist) best = { zombie: z, part, dist };
    };
    for (const z of this.list) {
      if (z.dead) continue;
      test(z, 1.72, 0.2, 'head');
      test(z, 1.2, 0.33, 'body');
      test(z, 0.5, 0.26, 'body');
    }
    if (!best) {
      // ajuda de mira
      const cos = Math.cos(THREE.MathUtils.degToRad(Z.ASSIST_DEG));
      for (const z of this.list) {
        if (z.dead) continue;
        const c = this._a.copy(z.m.root.position); c.y += 1.15 * z.m.scale;
        const oc = this._b.subVectors(c, o);
        const L = oc.length();
        if (L > range || L < 0.1) continue;
        if (oc.dot(d) / L < cos) continue;
        if (!best || L < best.dist) best = { zombie: z, part: 'body', dist: L - 0.3 };
      }
    }
    if (best) best.point = new THREE.Vector3().copy(o).addScaledVector(d, best.dist);
    return best;
  }

  // v19: o ponto p (mão, em metros) encosta em algum zumbi vivo?
  // Corpo = cápsula em pé (cintura até o pescoço) + cabeça. Retorna o zumbi ou null.
  touch(p, r = 0.04) {
    for (const z of this.list) {
      if (z.dead) continue;
      const q = z.m.root.position, s = z.m.scale;
      const dy = p.y - q.y;
      // cabeça
      if (Math.hypot(p.x - q.x, dy - 1.72 * s, p.z - q.z) < 0.2 * s + r) return { zombie: z, part: 'head' };
      // tronco e pernas
      if (dy > 0.2 * s && dy < 1.55 * s && Math.hypot(p.x - q.x, p.z - q.z) < 0.3 * s + r) return { zombie: z, part: 'body' };
    }
    return null;
  }

  // v19: soco/tapa. Precisa de MELEE.PUNCHES golpes para derrubar. Empurra o
  // zumbi para trás e atrasa a mordida dele um pouco. Retorna true se matou.
  punch(z, dir) {
    if (z.dead) return false;
    const M = CONFIG.MELEE;
    z.punches++;
    z.hitT = 0.15;
    z.alert = true;
    z.attackT = Math.max(z.attackT, M.STAGGER_S);
    if (dir) z.knock = { x: dir.x * M.KNOCK_SPEED, z: dir.z * M.KNOCK_SPEED };
    if (z.punches >= (z.dummy ? M.DUMMY_PUNCHES : M.PUNCHES)) {
      z.dead = true;
      z.deadT = 0;
      z.fallDir = Math.random() < 0.5 ? 1 : -1;
      return true;
    }
    return false;
  }

  // dano: retorna true se matou
  damage(z, part) {
    if (z.dead) return false;
    z.hp -= part === 'head' ? 99 : 1;
    z.hitT = 0.18;
    z.alert = true;
    if (z.hp <= 0) {
      z.dead = true;
      z.deadT = 0;
      z.fallDir = Math.random() < 0.5 ? 1 : -1;
      return true;
    }
    return false;
  }

  // Mapa de distâncias até o jogador (janela em volta dele): os zumbis descem
  // por ele, então contornam paredes e passam pelas portas.
  _buildFlow(p) {
    const g = this.world.grid;
    if (!g) { this.flow = null; return; }
    // células onde o corpo do zumbi cabe (folga das paredes); calculado uma vez
    if (!g._zok) {
      g._zok = new Uint8Array(g.W * g.H);
      for (let k = 0; k < g._zok.length; k++) {
        if (g.floor[k] === -Infinity) continue;
        const x = g.x0 + ((k % g.W) + 0.5) * g.cell, z = g.z0 + (((k / g.W) | 0) + 0.5) * g.cell;
        g._zok[k] = g.isFree(x, z, Z.RADIUS, g.floor[k]) ? 1 : 0;
      }
    }
    const R = Math.round(Z.FLOW_RADIUS / g.cell), S = 2 * R + 1;
    const ci = Math.floor((p.x - g.x0) / g.cell), cj = Math.floor((p.z - g.z0) / g.cell);
    const dist = this.flow && this.flow.S === S ? this.flow.dist : new Int16Array(S * S);
    const fy = this.flow && this.flow.S === S ? this.flow.fy : new Float32Array(S * S);
    const q = this.flow && this.flow.S === S ? this.flow.q : new Int32Array(S * S);
    dist.fill(-1);
    const k0 = g.key(p.x, p.z);
    if (k0 < 0) { this.flow = null; return; }
    let h = 0, t = 0;
    const L0 = R * S + R;
    dist[L0] = 0; fy[L0] = g.floor[k0] === -Infinity ? p.y : g.floor[k0]; q[t++] = L0;
    while (h < t) {
      const l = q[h++];
      const li = l % S, lj = (l / S) | 0;
      for (let n = 0; n < 4; n++) {
        const ni = li + (n === 0 ? 1 : n === 1 ? -1 : 0), nj = lj + (n === 2 ? 1 : n === 3 ? -1 : 0);
        if (ni < 0 || nj < 0 || ni >= S || nj >= S) continue;
        const nl = nj * S + ni;
        if (dist[nl] >= 0) continue;
        const gi = ci - R + ni, gj = cj - R + nj;
        if (gi < 0 || gj < 0 || gi >= g.W || gj >= g.H) continue;
        const gk = gj * g.W + gi;
        if (!g._zok[gk] || Math.abs(g.floor[gk] - fy[l]) > STEP) continue;
        dist[nl] = dist[l] + 1; fy[nl] = g.floor[gk]; q[t++] = nl;
      }
    }
    this.flow = { S, R, ci, cj, dist, fy, q };
  }

  // direção (dx, dz) para descer o mapa de distâncias, ou null
  _flowDir(x, z) {
    const F = this.flow, g = this.world.grid;
    if (!F) return null;
    const li = Math.floor((x - g.x0) / g.cell) - F.ci + F.R, lj = Math.floor((z - g.z0) / g.cell) - F.cj + F.R;
    if (li < 1 || lj < 1 || li >= F.S - 1 || lj >= F.S - 1) return null;
    let here = F.dist[lj * F.S + li];
    // célula do zumbi fora do mapa (encostado na parede): procura vizinho válido
    if (here < 0) here = 32767;
    let bd = here, bx = 0, bz = 0;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const v = F.dist[(lj + dj) * F.S + li + di];
        if (v < 0) continue;
        const c = v + (di && dj ? 0.4 : 0);
        if (c < bd) { bd = c; bx = di; bz = dj; }
      }
    }
    if (!bx && !bz) return null;
    const l = Math.hypot(bx, bz);
    return { x: bx / l, z: bz / l };
  }

  _free(x, z, y) {
    const w = this.world;
    return w.grid ? w.grid.isFree(x, z, Z.RADIUS, y) : w.isFree(x, z, Z.RADIUS);
  }

  _los(zp, player) {
    this._a.set(zp.x, zp.y + 1.4, zp.z);
    this._b.set(player.x, player.y + 1.4, player.z);
    return !this.world.segmentHit(this._a, this._b);
  }

  // v26: susto. Um zumbi rápido nasce ATRÁS do jogador (fora da visão), a
  // 2,5–4 m, e corre para pegar. Conta no total da partida.
  spawnScreamer(player, facing) {
    const back = new THREE.Vector3(-facing.x, 0, -facing.z).normalize();
    for (let d = Z.SCARE_SPAWN_MAX; d >= Z.SCARE_SPAWN_MIN; d -= 0.25) {
      for (const off of [0, 0.35, -0.35, 0.7, -0.7]) {
        const ca = Math.cos(off), sa = Math.sin(off);
        const x = player.x + (back.x * ca - back.z * sa) * d, zz = player.z + (back.x * sa + back.z * ca) * d;
        const y = this.world.floorAt(x, zz);
        if (y == null || Math.abs(y - player.y) > 0.5 || !this._free(x, zz, y)) continue;
        // precisa dar para chegar até o jogador (sem parede no meio)
        this._a.set(x, y + 1.2, zz); this._b.set(player.x, player.y + 1.2, player.z);
        if (this.world.segmentHit(this._a, this._b)) continue;
        const z = this._add(x, y, zz, { scream: true, yaw: Math.atan2(player.x - x, player.z - zz) });
        z.alert = true; z.speed = Z.SCARE_SPEED; z.flank = false;
        this.planned++;
        return z;
      }
    }
    return null;
  }

  // v27: susto de verdade: o zumbi APARECE NA SUA FRENTE, bem perto, gritando.
  // Procura lugar livre na frente (e um pouco para os lados), sem parede no meio.
  spawnFrontScare(player, facing) {
    const f = new THREE.Vector3(facing.x, 0, facing.z).normalize();
    for (const dd of [Z.SCARE_FRONT_DIST, Z.SCARE_FRONT_DIST + 0.4, Z.SCARE_FRONT_DIST + 0.9]) {
      for (const off of [0, 0.3, -0.3, 0.6, -0.6]) {
        const ca = Math.cos(off), sa = Math.sin(off);
        const x = player.x + (f.x * ca - f.z * sa) * dd, zz = player.z + (f.x * sa + f.z * ca) * dd;
        const y = this.world.floorAt(x, zz);
        if (y == null || Math.abs(y - player.y) > 0.5 || !this._free(x, zz, y)) continue;
        this._a.set(player.x, player.y + 1.4, player.z); this._b.set(x, y + 1.4, zz);
        if (this.world.segmentHit(this._a, this._b)) continue;
        const z = this._add(x, y, zz, { scream: true, yaw: Math.atan2(player.x - x, player.z - zz) });
        z.alert = true; z.speed = Z.SCARE_SPEED; z.flank = false;
        z.screamed = true;               // já grita ao aparecer
        z.attackT = Z.SCARE_BITE_S;      // dá um tempinho para reagir
        z.swing = 0.35;                  // já vem com os braços
        this.planned++;
        return z;
      }
    }
    return null;
  }

  // v29: susto estilo FNAF. Um zumbi aparece LONGE, na sua frente (dá para
  // ver: sem parede no meio), grita e vem correndo. Se chegar, pula na cara.
  spawnRunner(player, facing) {
    const R = CONFIG.RUSH;
    const f = new THREE.Vector3(facing.x, 0, facing.z).normalize();
    for (let d = R.MAX_DIST; d >= R.MIN_DIST; d -= 1.5) {
      for (const off of [0, 0.2, -0.2, 0.4, -0.4]) {
        const ca = Math.cos(off), sa = Math.sin(off);
        const x = player.x + (f.x * ca - f.z * sa) * d, zz = player.z + (f.x * sa + f.z * ca) * d;
        const y = this.world.floorAt(x, zz);
        if (y == null || Math.abs(y - player.y) > 0.6 || !this._free(x, zz, y)) continue;
        this._a.set(player.x, player.y + 1.5, player.z); this._b.set(x, y + 1.5, zz);
        if (this.world.segmentHit(this._a, this._b)) continue;
        const z = this._add(x, y, zz, { extra: true, runner: true, yaw: Math.atan2(player.x - x, player.z - zz) });
        z.alert = true; z.speed = R.SPEED; z.flank = false; z.groanT = 0.4;
        return z;
      }
    }
    return null;
  }

  update(dt, player, facing = null) {
    // ondas
    if (this.pending > 0) {
      this.waveT -= dt;
      if (this.waveT <= 0) { this._wave(player); this.waveT = Z.WAVE_EVERY_S; }
    }
    let chasing = 0;
    for (const z of this.list) if (!z.dead && z.alert) chasing++;
    // v27: quem está dando a volta agora (no máximo FLANK_MAX)
    this._flankers = 0;
    this._flanker = this.list.find((z) => z._flankNow && !z.dead) || null;
    if (this._flanker) this._flankers = 1;
    for (const z of this.list) z._flankNow = false;
    this._flowT -= dt;
    // recalcula o caminho só se o jogador saiu do lugar (ou de tempos em tempos)
    if (chasing && this._flowT <= 0) {
      const moved = !this._flowAt || Math.hypot(player.x - this._flowAt.x, player.z - this._flowAt.z) > 0.5;
      if (moved || this._flowT < -3) { this._buildFlow(player); this._flowAt = { x: player.x, z: player.z }; this._flowT = Z.FLOW_EVERY_S; }
    }

    let nearest = Infinity;
    for (const z of this.list) {
      const r = z.m.root, p = r.position;
      if (z.dead) { this._animDeath(z, dt); continue; }
      const dx = player.x - p.x, dz = player.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (!z.dummy) nearest = Math.min(nearest, dist);
      // percepção (linha de visão de vez em quando: é cara)
      z.losT -= dt;
      if (z.losT <= 0) { z.losT = 0.3; z.los = dist < Z.SIGHT && this._los(p, player); }
      if (!z.dummy && !z.alert && (dist < Z.HEAR || z.los)) { z.alert = true; this.hooks.onAlert && this.hooks.onAlert(z, dist); }

      // empurrão do soco: desliza para trás e para (sem atravessar parede)
      if (z.knock) {
        const nx = p.x + z.knock.x * dt, nz = p.z + z.knock.z * dt;
        if (this._free(nx, nz, p.y)) { p.x = nx; p.z = nz; }
        const k = Math.exp(-dt * 9);
        z.knock.x *= k; z.knock.z *= k;
        if (Math.hypot(z.knock.x, z.knock.z) < 0.05) z.knock = null;
      }
      let mx = 0, mz = 0, sp = 0;
      if (z.dummy) {
        // treino: só se vira para o jogador
      } else if (z.alert) {
        if (dist > Z.ATTACK_DIST * 0.85) {
          let dir = null;
          if (!(z.los && dist < 8)) dir = this._flowDir(p.x, p.z);
          if (dir) { mx = dir.x; mz = dir.z; sp = z.speed; } else if (z.los || !this.world.grid) { mx = dx / dist; mz = dz / dist; sp = z.speed; } else {
            // longe demais para o caminho calculado: vaga devagar em vez de travar na parede
            z.wander -= dt;
            if (z.wander <= 0) { z.wander = 2 + Math.random() * 3; z.wanderYaw = Math.atan2(dx, dz) + (Math.random() - 0.5) * 2; }
            mx = Math.sin(z.wanderYaw); mz = Math.cos(z.wanderYaw); sp = Z.WANDER_SPEED * 2;
          }
        }
        // v26: os que vêm "por trás": vendo o jogador de perto, dão a volta para
        // chegar pelas costas dele; e todo zumbi fora da visão anda mais rápido
        if (facing && !z.dummy) {
          const inView = dist > 0.01 && (-dx * facing.x - dz * facing.z) / dist > Math.cos(THREE.MathUtils.degToRad(Z.VIEW_HALF_DEG));
          z.behind = !inView;
          // "front": 1 = bem na sua frente · -1 = bem atrás. Enquanto não está
          // atrás, ele circula em volta (espiral), e só ataca pelas costas.
          const front = dist > 0.01 ? (-dx * facing.x - dz * facing.z) / dist : 1;
          // só FLANK_MAX zumbis dão a volta ao mesmo tempo (o mais perto ganha a vez)
          if (z.flank && z.los && dist < Z.FLANK_DIST && dist > 0.9 && front > -0.6 && (z === this._flanker || this._flankers < Z.FLANK_MAX)) {
            if (z !== this._flanker) { this._flankers++; }
            z._flankNow = true;
            const rx = -dx / dist, rz = -dz / dist;            // do jogador até o zumbi
            let tx = -rz, tz = rx;                             // tangente: escolhe a que leva para trás
            if (tx * facing.x + tz * facing.z > 0) { tx = -tx; tz = -tz; }
            const k = THREE.MathUtils.clamp((dist - Z.FLANK_R) / 3, -0.6, 1); // longe: aproxima · perto: só circula
            const ax = tx - rx * k, az = tz - rz * k, al = Math.hypot(ax, az);
            if (al > 1e-3 && this._free(p.x + ax / al * 0.3, p.z + az / al * 0.3, p.y)) { mx = ax / al; mz = az / al; sp = z.speed * 1.15; }
          }
          if (!inView && sp > 0) sp *= Z.BEHIND_BOOST;
        }
        // susto: grita quando chega perto (ou quando o jogador vira e vê)
        if (z.scream && !z.screamed && (dist < Z.SCARE_DIST || (!z.behind && dist < 4.5))) { z.screamed = true; this.hooks.onScream && this.hooks.onScream(z); }
        // v29: o corredor não morde: chegando perto, pula na sua cara (susto)
        if (z.runner) {
          z.born += dt;
          if (dist < CONFIG.RUSH.HIT_DIST || z.born > CONFIG.RUSH.TIMEOUT_S) {
            z.dead = true; z.deadT = 99; r.visible = false;
            if (dist < CONFIG.RUSH.HIT_DIST * 1.5) this.hooks.onRunnerHit && this.hooks.onRunnerHit(z);
            continue;
          }
        }
        // ataque
        z.attackT -= dt;
        if (dist < Z.ATTACK_DIST && Math.abs(player.y - p.y) < 1 && z.attackT <= 0) {
          z.attackT = Z.ATTACK_S;
          z.swing = 0.35;
          this.hooks.onHit && this.hooks.onHit(z);
        }
      } else {
        // vagando devagar
        z.wander -= dt;
        if (z.wander <= 0) { z.wander = 2 + Math.random() * 4; z.wanderYaw = Math.random() * 6.28; z.wanderGo = Math.random() < 0.5; }
        if (z.wanderGo) { mx = Math.sin(z.wanderYaw); mz = Math.cos(z.wanderYaw); sp = Z.WANDER_SPEED; }
      }
      // separação entre zumbis
      for (const o of this.list) {
        if (o === z || o.dead) continue;
        const ox = p.x - o.m.root.position.x, oz = p.z - o.m.root.position.z;
        const d = Math.hypot(ox, oz);
        if (d > 0.01 && d < 0.65) { mx += (ox / d) * 0.6; mz += (oz / d) * 0.6; }
      }
      const ml = Math.hypot(mx, mz);
      let moved = 0;
      if (sp > 0 && ml > 1e-3) {
        const step = (sp * dt) / ml;
        const nx = p.x + mx * step, nz = p.z + mz * step;
        const ox = p.x, oz = p.z;
        if (this._free(nx, nz, p.y)) { p.x = nx; p.z = nz; } else if (this._free(nx, p.z, p.y)) p.x = nx; else if (this._free(p.x, nz, p.y)) p.z = nz;
        else z.wander = 0;
        moved = Math.hypot(p.x - ox, p.z - oz) / dt;
        const f = this.world.floorAt(p.x, p.z);
        if (f != null) p.y += (f - p.y) * Math.min(1, dt * 10);
      }
      z.moving += (moved - z.moving) * Math.min(1, dt * 6);
      // v26: sons de cada zumbi (gemido e passos), saindo do lugar dele
      if (!z.dummy && dist < Z.SOUND_DIST) {
        z.groanT -= dt;
        if (z.groanT <= 0) { z.groanT = z.runner ? 0.7 : (z.alert ? 1.8 : 3.5) + Math.random() * 3; this.hooks.onGroanAt && this.hooks.onGroanAt(z, dist); }
        if (moved > 0.15) { z.stepT -= dt * (0.8 + moved); if (z.stepT <= 0) { z.stepT = 0.55; this.hooks.onStep && this.hooks.onStep(z, dist); } }
      }
      // vira para onde anda (ou para o jogador quando perto/parado)
      const face = z.alert || z.dummy || moved < 0.05 ? Math.atan2(dx, dz) : Math.atan2(mx, mz);
      if (z.alert || z.dummy || moved > 0.05) {
        let da = face - r.rotation.y;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        r.rotation.y += da * Math.min(1, dt * 5);
      }
      // v24: zumbi longe anima 1 quadro sim, 2 não (ninguém vê o detalhe de longe)
      if (dist > Z.ANIM_FAR) {
        z.animAcc = (z.animAcc || 0) + dt;
        if (++z.animN % 3 === 0 || !z.animN) { this._animWalk(z, z.animAcc); z.animAcc = 0; }
      } else { if (z.animAcc) { this._animWalk(z, z.animAcc); z.animAcc = 0; } else this._animWalk(z, dt); }
    }
    // gemidos
    this._groanT -= dt;
    if (nearest < Z.GROAN_DIST && this._groanT <= 0) {
      this._groanT = 1.2 + Math.random() * 2.2;
      this.hooks.onGroan && this.hooks.onGroan(nearest);
    }
    this.nearest = nearest;
  }

  // v31: zumbi do modelo 3D: escolhe a animação pelo que ele está fazendo
  _animModel(z, dt) {
    const m = z.m;
    if (z.swing > 0 && !z._swung) { z._swung = true; playOnce(m, 'attack'); }
    if (z.swing <= 0) z._swung = false;
    if (z.swing > 0) z.swing -= dt;
    if (z.hitT > 0 && !z._hitAnim && m.actions.hit && !z._swung) { z._hitAnim = true; playOnce(m, 'hit'); }
    if (z.hitT <= 0) z._hitAnim = false;
    m.wantLoop = z.moving > CONFIG.ZOMBIES.RUN_ANIM_SPEED ? 'run' : z.moving > 0.08 ? 'walk' : 'idle';
    const once = m.cur && (m.cur === m.actions.attack || m.cur === m.actions.hit);
    if (!once) playAnim(m, m.wantLoop);
    if (m.cur && (m.cur === m.actions.walk || m.cur === m.actions.run)) m.cur.timeScale = THREE.MathUtils.clamp(z.moving / (m.cur === m.actions.run ? 3 : 0.8), 0.6, 1.8);
    m.mixer.update(dt);
    if (z.hitT > 0) z.hitT -= dt;
    const fl = z.hitT > 0;
    for (const mat of m.mats) mat.emissive.setHex(fl ? 0x993333 : 0x000000);
  }

  _animWalk(z, dt) {
    if (z.m.gltf) { this._animModel(z, dt); return; }
    const m = z.m;
    const k = Math.min(1, z.moving / 0.6);
    z.phase += dt * (2.5 + z.moving * 5);
    const s = Math.sin(z.phase);
    m.legL.rotation.x = s * 0.55 * k;
    m.legR.rotation.x = -s * 0.55 * k;
    m.hips.position.y = 0.92 + Math.abs(Math.cos(z.phase)) * 0.04 * k;
    m.body.rotation.z = Math.sin(z.phase * 0.5) * 0.06 + 0.04;
    m.neck.rotation.z = Math.sin(z.phase * 0.7 + 1) * 0.25;
    m.neck.rotation.x = 0.15 + Math.sin(z.phase * 0.3) * 0.1;
    // braços esticados para frente (o clássico), com ataque
    let sw = 0;
    if (z.swing > 0) { z.swing -= dt; sw = Math.sin((1 - z.swing / 0.35) * Math.PI) * 0.9; }
    m.armL.rotation.x = -1.35 + Math.sin(z.phase + 0.5) * 0.15 + sw;
    m.armR.rotation.x = -1.4 + Math.sin(z.phase + 2.1) * 0.15 + sw;
    // pisca branco ao levar tiro
    if (z.hitT > 0) z.hitT -= dt;
    const fl = z.hitT > 0;
    for (const mat of m.mats) mat.emissive.setHex(fl ? 0x993333 : 0x000000);
  }

  _animDeath(z, dt) {
    const m = z.m;
    z.deadT += dt;
    const t = Math.min(1, z.deadT / 0.6);
    if (m.gltf && m.actions.death) {
      // modelo 3D com animação de morte: toca ela
      if (!m.dead) { m.dead = true; playAnim(m, 'death', 0.1); }
      m.mixer.update(dt);
    } else {
      if (m.gltf && !m.dead) { m.dead = true; if (m.cur) m.cur.fadeOut(0.1); }
      if (m.gltf) m.mixer.update(dt);
      m.body.rotation.x = -t * t * 1.5 * z.fallDir;
      m.body.position.y = Math.sin(t * Math.PI) * 0.1;
    }
    for (const mat of m.mats) mat.emissive.setHex(0x000000);
    if (z.deadT > Z.CORPSE_S) {
      m.root.position.y -= dt * 0.4; // afunda no chão e some
      if (z.deadT > Z.CORPSE_S + 1.5) m.root.visible = false;
    }
  }
}
