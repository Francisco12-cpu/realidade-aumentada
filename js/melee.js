// Soco / tapa (v19). Cada mão (azul ou vermelha, aberta ou fechada) bate no
// zumbi quando ENCOSTA nele chegando com velocidade (golpe). Depois precisa se
// afastar um pouco (RELEASE_DIST) antes de bater de novo: encostar e deixar a
// mão parada lá não dá dano infinito. São MELEE.PUNCHES golpes para derrubar.
import * as THREE from 'three';
import { CONFIG } from './config.js';

const PTS = [8, 12, 16, 5, 9, 13, 17, 0]; // pontas, nós dos dedos e pulso

export class Melee {
  constructor() {
    this._dir = new THREE.Vector3();
  }

  // hands: mãos do rastreador · horde: zumbis · player: posição do jogador
  // Retorna a lista de golpes deste quadro: [{ zombie, kill, point, need }]
  update(now, dt, hands, horde, player) {
    const M = CONFIG.MELEE;
    const out = [];
    for (const h of hands) {
      const st = h._melee || (h._melee = { prev: new THREE.Vector3(), speed: 0, inside: null, last: -1e9, has: false });
      if (!h.visible) { st.has = false; st.inside = null; st.speed = 0; continue; }
      // velocidade da mão em relação à cabeça (andar com a mão parada não conta)
      const c = h.camPts[9];
      if (st.has && dt > 0) {
        const v = c.distanceTo(st.prev) / dt;
        st.speed += (v - st.speed) * Math.min(1, dt * 20);
      }
      st.prev.copy(c); st.has = true;
      if (st.inside) {
        // ainda colada no mesmo zumbi? só solta quando a mão se afastar
        const z = st.inside;
        let near = false;
        if (!z.dead) for (const i of PTS) { const t = horde.touch(h.worldPts[i], 0.04 + M.RELEASE_DIST); if (t && t.zombie === z) { near = true; break; } }
        if (!near) st.inside = null;
        continue;
      }
      let hit = null, at = null;
      for (const i of PTS) { hit = horde.touch(h.worldPts[i]); if (hit) { at = h.worldPts[i]; break; } }
      if (!hit) continue;
      st.inside = hit.zombie;
      if (st.speed < M.MIN_SPEED || now - st.last < M.COOLDOWN_MS) continue; // só encostou: não conta
      st.last = now;
      const z = hit.zombie, zp = z.m.root.position;
      this._dir.set(zp.x - player.x, 0, zp.z - player.z);
      if (this._dir.lengthSq() > 1e-6) this._dir.normalize();
      const kill = horde.punch(z, this._dir);
      out.push({ zombie: z, kill, point: at.clone(), need: z.dummy ? M.DUMMY_PUNCHES : M.PUNCHES });
    }
    return out;
  }
}
