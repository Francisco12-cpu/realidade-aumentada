// Mapa de teste: blocos coloridos + chão branco + caixas pretas (pontos de sinal).
// Nada da escola ainda — o objetivo é só ter referências visuais e obstáculos.
import * as THREE from 'three';
import { CONFIG } from './config.js';

const BOX_SIZE = 0.45;

// [xMin, xMax, zMin, zMax, yMin, yMax, cor]
const BLOCKS = [
  // Corredor central: parede vermelha (esq.) e azul (dir.)
  [-6.0, -5.0, -12, 3, 0, 3, 0xe74c3c],
  [5.0, 6.0, -12, 3, 0, 3, 0x3498db],
  // Mesa verde no meio do corredor
  [-1.5, 1.5, -3.0, -1.8, 0, 1.1, 0x2ecc71],
  // Pedestal do tutorial
  [-0.35, 0.35, 4.15, 4.85, 0, 0.78, 0x95a5a6],
  // Sala roxa (porta virada para o corredor)
  [-15, -14.4, -8, 2, 0, 3, 0x9b59b6],
  [-15, -8, -8.6, -8, 0, 3, 0x9b59b6],
  [-15, -8, 2, 2.6, 0, 3, 0x9b59b6],
  [-8.6, -8, -8, -4.5, 0, 3, 0x9b59b6],
  [-8.6, -8, -1.5, 2, 0, 3, 0x9b59b6],
  // Cobertura laranja (pilares + teto baixo)
  [7.8, 8.1, -14.2, -13.9, 0, 2.5, 0xe67e22],
  [11.9, 12.2, -14.2, -13.9, 0, 2.5, 0xe67e22],
  [7.8, 8.1, -10.1, -9.8, 0, 2.5, 0xe67e22],
  [11.9, 12.2, -10.1, -9.8, 0, 2.5, 0xe67e22],
  [7.8, 12.2, -14.2, -9.8, 2.5, 2.7, 0xe67e22],
  // Blocos soltos para referência
  [8, 10, 2, 4, 0, 1.6, 0xf1c40f],
  [-10, -8.5, 8, 9.5, 0, 2.2, 0x1abc9c],
  [2, 3, -16, -15, 0, 4, 0xe84393],
  [-4, -2, 12, 13, 0, 1.0, 0x34495e],
];

// Pontos de sinal. normal = face exposta (por onde a caixa "abre").
export const TARGET_DEFS = [
  { id: 'tutorial', tutorial: true, pos: [0, 0.78 + BOX_SIZE / 2, 4.5], normal: [0, 1, 0], wires: 1 },
  { id: 'chao-1', pos: [-3, BOX_SIZE / 2, -6], normal: [0, 1, 0] },
  { id: 'parede-vermelha', pos: [-5 + BOX_SIZE / 2, 1.4, -1], normal: [1, 0, 0] },
  { id: 'teto', pos: [10, 2.5 - BOX_SIZE / 2, -12], normal: [0, -1, 0] },
  { id: 'sala-roxa', pos: [-12, BOX_SIZE / 2, -3], normal: [0, 1, 0] },
  { id: 'parede-azul-alta', pos: [5 - BOX_SIZE / 2, 1.9, -9], normal: [-1, 0, 0] },
  { id: 'atras', pos: [3, BOX_SIZE / 2, 11], normal: [0, 1, 0] },
];

const tmpRay = new THREE.Ray();
const tmpV = new THREE.Vector3();

export function buildWorld(scene) {
  scene.background = new THREE.Color(0xcfe3f2);
  scene.fog = new THREE.Fog(0xcfe3f2, 18, 45);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(6, 12, 4);
  scene.add(sun);

  // Chão branco + "estradas" cinza-claro + grade suave (ajuda a sentir o movimento)
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const roadMat = new THREE.MeshLambertMaterial({ color: 0xe4e4e4 });
  for (const [w, d, x, z] of [[3.6, 32, 0, -2], [24, 3, -4, 7], [20, 3, 2, -12]]) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(w, d), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(x, 0.005, z);
    scene.add(road);
  }
  const grid = new THREE.GridHelper(40, 40, 0xbbbbbb, 0xdddddd);
  grid.position.y = 0.01;
  scene.add(grid);

  const blocks = [];
  const geo = new THREE.BoxGeometry(1, 1, 1);
  for (const [x0, x1, z0, z1, y0, y1, color] of BLOCKS) {
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
    mesh.scale.set(x1 - x0, y1 - y0, z1 - z0);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    scene.add(mesh);
    blocks.push({ mesh, box: new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)) });
  }

  const world = {
    blocks,
    targets: [],
    spawn: new THREE.Vector3(0, 0, 8),
    bounds: 19.5,

    // Primeiro bloco atingido pelo segmento a->b (ou null).
    segmentHit(a, b) {
      const len = a.distanceTo(b);
      if (len < 1e-6) return null;
      tmpRay.origin.copy(a);
      tmpRay.direction.subVectors(b, a).divideScalar(len);
      let best = null;
      let bestD = len;
      for (const bl of blocks) {
        const p = tmpRay.intersectBox(bl.box, tmpV);
        if (!p) continue;
        const d = p.distanceTo(a);
        if (d <= bestD) { bestD = d; best = { point: p.clone(), block: bl }; }
      }
      return best;
    },

    // Ponto do chão livre de blocos (com raio do jogador)?
    isFree(x, z, r) {
      if (Math.abs(x) > this.bounds || Math.abs(z) > this.bounds) return false;
      for (const bl of blocks) {
        const b = bl.box;
        if (b.min.y > CONFIG.EYE_HEIGHT + 0.2) continue; // teto alto não bloqueia
        if (x > b.min.x - r && x < b.max.x + r && z > b.min.z - r && z < b.max.z + r) return false;
      }
      return true;
    },
  };

  for (const def of TARGET_DEFS) world.targets.push(createTarget(scene, def));
  return world;
}

function createTarget(scene, def) {
  const group = new THREE.Group();
  group.position.fromArray(def.pos);
  scene.add(group);

  const normal = new THREE.Vector3().fromArray(def.normal);
  const black = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(BOX_SIZE, BOX_SIZE, BOX_SIZE), black);
  group.add(body);

  // Tampa: placa fina na face exposta
  const lid = new THREE.Mesh(new THREE.BoxGeometry(BOX_SIZE * 1.04, 0.04, BOX_SIZE * 1.04), new THREE.MeshLambertMaterial({ color: 0x222222 }));
  lid.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
  const lidClosed = normal.clone().multiplyScalar(BOX_SIZE / 2 + 0.02);
  lid.position.copy(lidClosed);
  group.add(lid);

  // LED piscando (ajuda a achar a caixa)
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
  led.position.copy(normal).multiplyScalar(BOX_SIZE / 2 + 0.05);
  // desloca o LED para um canto da face
  const side = Math.abs(normal.y) > 0.5 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  led.position.addScaledVector(side, BOX_SIZE * 0.32);
  group.add(led);

  // "Sinal" dentro da caixa
  const signal = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 1), new THREE.MeshBasicMaterial({ color: 0xff4444, wireframe: true }));
  signal.visible = false;
  group.add(signal);

  const center = new THREE.Vector3().fromArray(def.pos);
  const half = BOX_SIZE / 2;
  return {
    id: def.id,
    tutorial: !!def.tutorial,
    wires: def.wires || CONFIG.INTERACTION.WIRES_PER_BOX,
    group, body, lid, led, signal, normal, lidClosed,
    center,
    aabb: new THREE.Box3(center.clone().subScalar(half), center.clone().addScalar(half)),
    state: 'closed', // closed | open | fixed
    openT: 0,
  };
}

// Atualiza animações das caixas (tampa abrindo, LED piscando, sinal girando).
export function animateTargets(targets, dt, timeSec) {
  for (const t of targets) {
    const goal = t.state === 'closed' ? 0 : 1;
    t.openT += Math.sign(goal - t.openT) * Math.min(Math.abs(goal - t.openT), dt * 3);
    const k = t.state === 'fixed' ? 0.25 : t.openT; // consertada: tampa quase fechada
    t.lid.position.copy(t.lidClosed).addScaledVector(t.normal, k * 0.22);
    t.signal.visible = t.openT > 0.05;
    t.signal.position.copy(t.normal).multiplyScalar(0.1 + 0.25 * t.openT);
    t.signal.rotation.y += dt * 2;
    t.signal.rotation.x += dt * 1.3;
    if (t.state === 'fixed') {
      t.led.material.color.setHex(0x22ff55);
      t.signal.material.color.setHex(0x22ff55);
      t.body.material.color.setHex(0x1e8f3a);
    } else {
      t.led.visible = Math.sin(timeSec * 8) > -0.2;
      t.led.material.color.setHex(0xff2222);
      t.signal.material.color.setHex(0xff4444);
      t.body.material.color.setHex(0x111111);
    }
    if (t.state === 'fixed') t.led.visible = true;
  }
}
