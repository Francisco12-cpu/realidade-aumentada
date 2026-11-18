// Soco / tapa (v20). Golpe = a mão faz um movimento RÁPIDO (soco para frente,
// tapa de lado, de cima...) com um zumbi perto, na direção da mão.
// Mede quanto a mão (posição SEM filtro) andou nos últimos ~0,2 s: mais de
// MIN_DIST = golpe (a mão desenhada é suavizada e quase não se mexe num soco).
// Encostar e deixar parada não bate: depois de um golpe a mão precisa
// parar (andar menos de REARM_DIST) antes do próximo. MELEE.PUNCHES golpes derrubam.
import * as THREE from 'three';
import { CONFIG } from './config.js';

export class Melee {
  constructor() {
    this._dir = new THREE.Vector3();
    this._hw = new THREE.Vector3();
    this._eye = new THREE.Vector3();
  }

  // hands · horde · player (posição do rig) · camera
  // Retorna os golpes deste quadro: [{ zombie, kill, point, need }]
  update(now, dt, hands, horde, player, camera) {
    const M = CONFIG.MELEE;
    const out = [];
    camera.getWorldPosition(this._eye);
    for (const h of hands) {
      const st = h._melee || (h._melee = { hist: [], speed: 0, armed: true, last: -1e9, lastT: 0, prevP: null, prevT: 0, vanishDone: false });
      if (!h.rawPos || (!h.visible && now - (h.rawT || 0) > M.GAP_MS)) { st.hist.length = 0; st.speed = 0; st.armed = true; st.prevP = null; continue; }
      let jump = 0;
      if (h.rawT !== st.lastT) {
        // v22: a mão sumiu um instante no movimento rápido e voltou longe = golpe
        if (st.prevP && h.rawT - st.prevT > M.WINDOW_MS && h.rawT - st.prevT < M.GAP_MS) jump = st.prevP.distanceTo(h.rawPos);
        st.prevP = (st.prevP || new THREE.Vector3()).copy(h.rawPos); st.prevT = h.rawT;
        st.vanishDone = false;
        st.lastT = h.rawT;
        st.hist.push({ t: h.rawT, p: h.rawPos.clone() });
        while (st.hist.length && h.rawT - st.hist[0].t > M.WINDOW_MS) st.hist.shift();
        // quanto a mão andou nos últimos WINDOW_MS (o tremido não passa de
        // poucos centímetros; um soco ou tapa passa de MIN_DIST)
        st.speed = 0;
        for (const a of st.hist) if (h.rawT - a.t <= M.WINDOW_MS) st.speed = Math.max(st.speed, a.p.distanceTo(h.rawPos));
      }
      if (jump > st.speed) st.speed = jump;
      // v22: a mão vinha se mexendo e SUMIU (borrão do movimento) = golpe
      const lost = now - h.rawT;
      let vanish = false;
      if (!st.vanishDone && lost > M.VANISH_MS && lost < M.GAP_MS && st.moving > M.VANISH_MOVE) { vanish = true; st.vanishDone = true; }
      if (h.rawT === st.lastT && lost < 50) st.moving = st.speed;
      if (st.speed < M.REARM_DIST && lost < 50) st.armed = true;
      if (!st.armed || (st.speed < M.MIN_DIST && !vanish) || now - st.last < M.COOLDOWN_MS) continue;
      // zumbi perto e na direção da mão
      this._hw.copy(h.worldPts[9]).sub(this._eye); this._hw.y = 0;
      if (this._hw.lengthSq() < 1e-6) continue;
      this._hw.normalize();
      let best = null, bd = Infinity;
      for (const z of horde.list) {
        if (z.dead) continue;
        const zp = z.m.root.position;
        this._dir.set(zp.x - player.x, 0, zp.z - player.z);
        const d = this._dir.length();
        if (d > M.RANGE || d < 1e-3 || Math.abs(zp.y - player.y) > 1) continue;
        this._dir.divideScalar(d);
        const ang = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(this._dir.dot(this._hw), -1, 1)));
        if (ang > M.ANGLE_DEG) continue;
        if (d < bd) { bd = d; best = z; }
      }
      if (!best) continue;
      st.armed = false;
      st.last = now;
      const zp = best.m.root.position;
      this._dir.set(zp.x - player.x, 0, zp.z - player.z).normalize();
      const kill = horde.punch(best, this._dir);
      const point = new THREE.Vector3(zp.x - this._dir.x * 0.28, zp.y + 1.25 * best.m.scale, zp.z - this._dir.z * 0.28);
      out.push({ zombie: best, kill, point, need: best.dummy ? M.DUMMY_PUNCHES : M.PUNCHES });
    }
    return out;
  }
}
