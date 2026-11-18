// Mapa de teste: blocos coloridos + chão branco + caixas pretas (pontos de sinal).
// Nada da escola ainda — o objetivo é só ter referências visuais e obstáculos.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { loadSchoolModel, CollisionGrid, autoTargets } from './mapa.js';

const BOX_SIZE = 0.45;

// Mapa "escola de blocos" (ainda sem o modelo real da escola).
// Norte (−Z): prédio com 3 salas e portas · centro: pátio com mastro ·
// oeste: quadra · leste: cantina coberta · sudeste: biblioteca · sul: entrada.
// [xMin, xMax, zMin, zMax, yMin, yMax, cor]
const WALL = 3;
const BLOCKS = [
  // --- Prédio das salas (portas viradas para o pátio) ---
  [-15.3, 15.3, -15.3, -15, 0, WALL, 0xd8d2c4],       // fundo
  [-15.3, -15, -15, -8, 0, WALL, 0xd8d2c4],           // lateral oeste
  [15, 15.3, -15, -8, 0, WALL, 0xd8d2c4],             // lateral leste
  [-15, -11, -8.3, -8, 0, WALL, 0xe74c3c],            // frente (vermelho) | porta x −11..−9
  [-9, -5.15, -8.3, -8, 0, WALL, 0xe74c3c],
  [-4.85, -1, -8.3, -8, 0, WALL, 0x3498db],           // frente (azul = laboratório) | porta x −1..1
  [1, 4.85, -8.3, -8, 0, WALL, 0x3498db],
  [5.15, 9, -8.3, -8, 0, WALL, 0x2ecc71],             // frente (verde) | porta x 9..11
  [11, 15, -8.3, -8, 0, WALL, 0x2ecc71],
  [-5.15, -4.85, -15, -8, 0, WALL, 0xbdb6a6],         // divisórias
  [4.85, 5.15, -15, -8, 0, WALL, 0xbdb6a6],
  // móveis das salas
  [-13, -11, -12.5, -11.8, 0, 0.75, 0x8e6e53],        // mesa (sala vermelha)
  [-3.5, 3.5, -13.6, -13, 0, 0.9, 0xecf0f1],          // bancada do laboratório
  [-3, -2.2, -11, -10.2, 0, 0.75, 0x8e6e53],
  [2.2, 3, -11, -10.2, 0, 0.75, 0x8e6e53],
  [7, 9, -12.5, -11.8, 0, 0.75, 0x8e6e53],            // mesa (sala verde)
  // --- Pátio ---
  [-0.08, 0.08, -3.08, -2.92, 0, 5, 0xbdc3c7],        // mastro
  [-3.8, -2.2, -3.2, -2.8, 0, 0.45, 0x8e6e53],        // bancos
  [2.2, 3.8, -3.2, -2.8, 0, 0.45, 0x8e6e53],
  [-0.35, 0.35, 6.15, 6.85, 0, 0.78, 0x95a5a6],       // pedestal do tutorial
  // --- Quadra (oeste): traves ---
  [-17.1, -16.95, -1.3, -1.15, 0, 2, 0xffffff],
  [-17.1, -16.95, 1.15, 1.3, 0, 2, 0xffffff],
  [-17.1, -16.95, -1.3, 1.3, 2, 2.12, 0xffffff],
  [-8.15, -8, -1.3, -1.15, 0, 2, 0xffffff],
  [-8.15, -8, 1.15, 1.3, 0, 2, 0xffffff],
  [-8.15, -8, -1.3, 1.3, 2, 2.12, 0xffffff],
  // --- Cantina coberta (leste) ---
  [8, 8.3, -4.3, -4, 0, 2.5, 0xe67e22],
  [13.7, 14, -4.3, -4, 0, 2.5, 0xe67e22],
  [8, 8.3, 2, 2.3, 0, 2.5, 0xe67e22],
  [13.7, 14, 2, 2.3, 0, 2.5, 0xe67e22],
  [8, 14, -4.3, 2.3, 2.5, 2.7, 0xe67e22],              // teto
  [9.2, 10.8, -2.6, -1.8, 0, 0.75, 0xf5cba7],          // mesas
  [11.4, 13, -2.6, -1.8, 0, 0.75, 0xf5cba7],
  [9.2, 10.8, 0.2, 1, 0, 0.75, 0xf5cba7],
  [8.3, 8.9, -3.8, 1.8, 0, 1.1, 0x7f8c8d],             // balcão
  // --- Biblioteca (sudeste), porta no lado oeste z 8..10 ---
  [8, 15.3, 5.7, 6, 0, WALL, 0x9b59b6],
  [8, 15.3, 12, 12.3, 0, WALL, 0x9b59b6],
  [15, 15.3, 6, 12, 0, WALL, 0x9b59b6],
  [8, 8.3, 6, 8, 0, WALL, 0x9b59b6],
  [8, 8.3, 10, 12, 0, WALL, 0x9b59b6],
  [10, 14.5, 6.3, 6.8, 0, 2, 0x6c3483],               // estantes
  [10, 14.5, 11.2, 11.7, 0, 2, 0x6c3483],
  // --- Muro da entrada (sul) ---
  [-15, -3, 15, 15.4, 0, 1.4, 0xf1c40f],
  [3, 15, 15, 15.4, 0, 1.4, 0xf1c40f],
];

// Árvores (tronco com colisão + copa só visual): [x, z]
const TREES = [[-5, 9], [5, 9], [-6.5, 3], [-11, 11], [-15, 8], [4.5, 13], [16.5, -4]];

// Pontos de sinal: um por lugar da escola. A cada partida a caixa de cada
// lugar é sorteada entre os "spots" (o primeiro é o lugar padrão).
// normal = face exposta (por onde a caixa "abre").
const BH = BOX_SIZE / 2;
const UP = [0, 1, 0];
export const TARGET_DEFS = [
  { id: 'tutorial', name: 'pedestal', tutorial: true, wires: 1, spots: [{ pos: [0, 0.78 + BH, 6.5], normal: UP }] },
  { id: 'sala-vermelha', name: 'sala vermelha', spots: [
    { pos: [-12, BH, -10], normal: UP },
    { pos: [-12, 0.75 + BH, -12.15], normal: UP },          // em cima da mesa
    { pos: [-9, 1.3, -15 + BH], normal: [0, 0, 1] },         // na parede do fundo
    { pos: [-6.4, BH, -13.8], normal: UP },                 // canto
  ] },
  { id: 'laboratorio', name: 'laboratório', spots: [
    { pos: [-4.85 + BH, 1.4, -10.5], normal: [1, 0, 0] },   // parede oeste
    { pos: [4.85 - BH, 1.4, -12], normal: [-1, 0, 0] },     // parede leste
    { pos: [1.5, 0.9 + BH, -13.3], normal: UP },            // em cima da bancada
    { pos: [-2.6, 0.75 + BH, -10.6], normal: UP },          // em cima da mesinha
  ] },
  { id: 'sala-verde', name: 'sala verde', spots: [
    { pos: [13, BH, -13.5], normal: UP },
    { pos: [8, 0.75 + BH, -12.15], normal: UP },            // em cima da mesa
    { pos: [15 - BH, 1.2, -11], normal: [-1, 0, 0] },       // parede leste
    { pos: [6.3, BH, -14.2], normal: UP },
  ] },
  { id: 'cantina', name: 'cantina', spots: [
    { pos: [11, 2.5 - BH, -0.5], normal: [0, -1, 0] },      // no teto
    { pos: [9.5, 2.5 - BH, 1.4], normal: [0, -1, 0] },      // no teto, perto da coluna
    { pos: [8.6, 1.1 + BH, -1], normal: UP },               // em cima do balcão
    { pos: [12.2, 0.75 + BH, -2.2], normal: UP },           // em cima da mesa
  ] },
  { id: 'quadra', name: 'quadra', spots: [
    { pos: [-15.8, BH, 4], normal: UP },
    { pos: [-9, BH, -4], normal: UP },
    { pos: [-12.55, BH, 0], normal: UP },                   // no círculo do meio
    { pos: [-16.4, BH, 0], normal: UP },                    // embaixo da trave
  ] },
  { id: 'biblioteca', name: 'biblioteca', spots: [
    { pos: [12.5, BH, 9], normal: UP },
    { pos: [12, 2 + BH, 6.55], normal: UP },                // em cima da estante
    { pos: [15 - BH, 1.2, 9], normal: [-1, 0, 0] },         // parede do fundo
    { pos: [14, BH, 10.6], normal: UP },
  ] },
];

// Materiais mais baratos para o celular: Lambert (sem reflexo PBR) e folhas
// com recorte (alphaTest) em vez de transparência (que é cara e precisa ordenar).
function simplifyMaterials(root) {
  const cache = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.updateMatrix();
    o.matrixAutoUpdate = false;
    const old = o.material;
    if (cache.has(old)) { o.material = cache.get(old); return; }
    const leaf = old.transparent && old.map;
    const m = new THREE.MeshLambertMaterial({
      color: old.color, map: old.map || null, side: old.side,
      transparent: old.transparent && !leaf, opacity: old.opacity,
      alphaTest: leaf ? 0.5 : old.alphaTest || 0,
      depthWrite: leaf ? true : old.depthWrite,
    });
    m.name = old.name;
    cache.set(old, m);
    old.dispose();
    o.material = m;
  });
}

// Troca o mapa de blocos pela escola de verdade (modelo 3D original).
// onStatus(texto, fração 0..1). Se falhar, o mapa de blocos continua.
export async function loadSchool(world, scene, onStatus = () => {}) {
  const model = await loadSchoolModel((f) => onStatus('Baixando a escola', f * 0.7));
  onStatus('Montando a escola', 0.7);
  simplifyMaterials(model);
  model.name = 'escola';
  scene.add(model);
  model.updateMatrixWorld(true);
  const grid = await CollisionGrid.build(model, (f) => onStatus('Calculando paredes e chão', 0.7 + f * 0.28));
  const S = CONFIG.MAP;
  const spawn = new THREE.Vector3(S.SPAWN[0], 0, S.SPAWN[2]);
  spawn.y = grid.floorAt(spawn.x, spawn.z) ?? 0;
  // pontos de sinal escolhidos sozinhos + caixa do tutorial na frente do início
  const defs = autoTargets(grid, spawn, BH);
  const tut = tutorialSpot(grid, spawn);
  defs.unshift({ id: 'tutorial', name: 'início', tutorial: true, wires: 1, spots: [{ pos: [tut.x, tut.y + BH, tut.z], normal: [0, 1, 0] }] });

  scene.remove(world.deco);
  world.deco.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  world.blocks.length = 0;
  world.school = true;
  world.model = model;
  world.grid = grid;
  world.spawn = spawn;
  world.targetDefs = defs;
  // modo feira: o tutorial começa a 1,1 m da caixa (sem passo de andar)
  const yaw = S.SPAWN_YAW;
  world.tutorialSpawn = new THREE.Vector3(tut.x + Math.sin(yaw) * 1.1, tut.y, tut.z + Math.cos(yaw) * 1.1);
  world.feiraTargets = defs.filter((d) => !d.tutorial).slice(0, CONFIG.FEIRA.TARGETS.length).map((d) => d.id);
  world.isFree = (x, z, r, fromY) => grid.isFree(x, z, r, fromY);
  world.segmentHit = (a, b) => grid.segmentHit(a, b);
  world.floorAt = (x, z) => grid.floorAt(x, z);
  scene.fog = new THREE.Fog(0xcfe2f2, S.FOG_NEAR, S.FOG_FAR);
  placeTargets(world, scene, false);
  onStatus('Escola pronta', 1);
  return world;
}

// Lugar da caixa do tutorial: chão livre a ~2,5 m na frente do início.
function tutorialSpot(grid, spawn) {
  const yaw = CONFIG.MAP.SPAWN_YAW;
  for (let d = 2.5; d > 0.8; d -= 0.25) {
    for (const off of [0, 0.4, -0.4, 0.8, -0.8]) {
      const x = spawn.x - Math.sin(yaw + off) * d, z = spawn.z - Math.cos(yaw + off) * d;
      const f = grid.floorAt(x, z);
      if (f != null && Math.abs(f - spawn.y) < 0.3 && grid.isFree(x, z, 0.3, f)) return { x, y: f, z };
    }
  }
  return { x: spawn.x, y: spawn.y, z: spawn.z - 2 };
}

// Cria (ou recria) as caixas. random = sorteia um spot por lugar.
export function placeTargets(world, scene, random = false) {
  for (const t of world.targets) {
    scene.remove(t.group);
    t.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
  world.targets = (world.targetDefs || TARGET_DEFS).map((def) => {
    const spot = random ? def.spots[Math.floor(Math.random() * def.spots.length)] : def.spots[0];
    return createTarget(scene, { ...def, pos: spot.pos, normal: spot.normal });
  });
}

const tmpRay = new THREE.Ray();
const tmpV = new THREE.Vector3();

export function buildWorld(scene) {
  scene.background = new THREE.Color(0xbfd8ee);
  scene.fog = new THREE.Fog(0xcfe2f2, 16, 48);

  scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x9a8f80, 1.05));
  const sun = new THREE.DirectionalLight(0xfff3e0, 1.35);
  sun.position.set(6, 12, 4);
  scene.add(sun);

  // Céu: esfera com degradê (azul em cima, claro no horizonte)
  const sky = new THREE.Mesh(new THREE.SphereGeometry(60, 24, 12), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x5d9fe0) }, horizon: { value: new THREE.Color(0xdcebf7) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 horizon; varying vec3 vP; void main(){ float h = clamp(vP.y, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(h, 0.6)), 1.0); }',
  }));
  sky.renderOrder = -1;
  scene.add(sky);
  scene.userData.sky = sky;

  // tudo do mapa de blocos fica neste grupo (sai quando a escola de verdade carrega)
  const deco = new THREE.Group();
  deco.name = 'mapa-de-blocos';
  scene.add(deco);

  // Chão: piso claro com rejunte e leve variação (textura gerada no código)
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshLambertMaterial({ map: makeFloorTexture(40) }),
  );
  ground.rotation.x = -Math.PI / 2;
  deco.add(ground);
  // caminhos (cinza-claro) ligando as áreas
  const roadMat = new THREE.MeshLambertMaterial({ color: 0xd9dcdf });
  for (const [w, d, x, z] of [[3, 23, 0, 3.5], [34, 2.4, 0, -6.2], [6, 2.4, 6, 1], [2.4, 6, -5.6, 1]]) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(w, d), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(x, 0.004, z);
    deco.add(road);
  }
  // quadra: piso verde com linhas brancas
  const court = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 10), new THREE.MeshLambertMaterial({ color: 0x3f9b5b }));
  court.rotation.x = -Math.PI / 2;
  court.position.set(-12.55, 0.006, 0);
  deco.add(court);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const [w, d, x, z] of [[9.2, 0.08, -12.55, 4.8], [9.2, 0.08, -12.55, -4.8], [0.08, 9.6, -17.15, 0], [0.08, 9.6, -7.95, 0], [0.08, 9.6, -12.55, 0]]) {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineMat);
    l.rotation.x = -Math.PI / 2;
    l.position.set(x, 0.008, z);
    deco.add(l);
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.23, 40), lineMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(-12.55, 0.008, 0);
  deco.add(ring);
  // bandeira no mastro
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7), new THREE.MeshLambertMaterial({ color: 0x00a3ad, side: THREE.DoubleSide }));
  flag.position.set(0.63, 4.55, -3);
  deco.add(flag);
  scene.userData.flag = flag;

  const shadowTex = getShadowTexture();
  const addShadow = (cx, cz, w, d, opacity = 0.55) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(cx, 0.008, cz);
    deco.add(m);
  };

  const blocks = [];
  const geo = new THREE.BoxGeometry(1, 1, 1);
  for (const [x0, x1, z0, z1, y0, y1, color] of BLOCKS) {
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
    mesh.scale.set(x1 - x0, y1 - y0, z1 - z0);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    deco.add(mesh);
    blocks.push({ mesh, box: new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)) });
    // sombra de contato: escurece o chão em volta da base do bloco
    if (y0 === 0) addShadow((x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) + 0.9, (z1 - z0) + 0.9);
    else if (y0 > 2) addShadow((x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) + 0.4, (z1 - z0) + 0.4, 0.35); // teto
  }

  // árvores: tronco (bloco com colisão) + copa (só visual)
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3e8e41 });
  const leafGeo = new THREE.IcosahedronGeometry(1.1, 1);
  for (const [x, z] of TREES) {
    const trunk = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x7b5233 }));
    trunk.scale.set(0.3, 1.8, 0.3);
    trunk.position.set(x, 0.9, z);
    deco.add(trunk);
    blocks.push({ mesh: trunk, box: new THREE.Box3(new THREE.Vector3(x - 0.15, 0, z - 0.15), new THREE.Vector3(x + 0.15, 1.8, z + 0.15)) });
    const crown = new THREE.Mesh(leafGeo, leafMat);
    crown.position.set(x, 2.5, z);
    crown.scale.set(1, 0.9, 1);
    deco.add(crown);
    addShadow(x, z, 2.4, 2.4, 0.45);
  }

  const world = {
    blocks,
    deco,
    targets: [],
    spawn: new THREE.Vector3(0, 0, 10),
    bounds: 19.5,
    school: false,
    floorAt() { return 0; },

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

  placeTargets(world, scene, false);
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

  // Faíscas (aparecem quando o jogador chega perto de uma caixa quebrada)
  const S = CONFIG.SPARKS;
  const sparkPos = new Float32Array(S.COUNT * 3);
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkMat = new THREE.PointsMaterial({ color: 0xffd54a, size: 0.05, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  sparks.visible = false;
  group.add(sparks);
  const sparkData = [];
  for (let i = 0; i < S.COUNT; i++) sparkData.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: -Math.random() });
  // Brilho em volta (anel que pulsa virado para fora da face exposta)
  const glow = new THREE.Mesh(new THREE.RingGeometry(BOX_SIZE * 0.62, BOX_SIZE * 0.8, 32),
    new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  glow.position.copy(normal).multiplyScalar(BOX_SIZE / 2 + 0.03);
  glow.visible = false;
  group.add(glow);

  // sombra no chão (só para caixa no chão): vai junto com a caixa quando ela é sorteada
  if (def.normal[1] > 0.5) {
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(BOX_SIZE + 0.5, BOX_SIZE + 0.5),
      new THREE.MeshBasicMaterial({ map: getShadowTexture(), transparent: true, opacity: 0.6, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.008 - BOX_SIZE / 2; // no apoio (chão, mesa, estante)
    group.add(sh);
  }

  const center = new THREE.Vector3().fromArray(def.pos);
  const half = BOX_SIZE / 2;
  return {
    id: def.id,
    name: def.name || def.id,
    tutorial: !!def.tutorial,
    wires: def.wires || CONFIG.INTERACTION.WIRES_PER_BOX,
    group, body, lid, led, signal, normal, lidClosed,
    sparks, sparkData, glow, near: 0,
    center,
    aabb: new THREE.Box3(center.clone().subScalar(half), center.clone().addScalar(half)),
    state: 'closed', // closed | open | fixed
    openT: 0,
  };
}

// Atualiza animações das caixas (tampa abrindo, LED piscando, sinal girando,
// faíscas quando o jogador está perto). isHot(t) diz se a caixa vale agora.
export function animateTargets(targets, dt, timeSec, playerPos = null, isHot = null) {
  for (const t of targets) {
    t.group.visible = !t.off;
    if (t.off) continue;
    // 0 = longe, 1 = colado na caixa
    let near = 0;
    if (playerPos && t.state !== 'fixed' && (!isHot || isHot(t))) {
      tmpV.set(playerPos.x, t.center.y, playerPos.z);
      near = Math.max(0, 1 - tmpV.distanceTo(t.center) / CONFIG.SPARKS.DIST);
    }
    t.near += (near - t.near) * Math.min(1, dt * 4);
    animateSparks(t, dt, timeSec);
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
    else if (t.near > 0.05) {
      // perto: LED pisca mais rápido e cresce
      t.led.visible = Math.sin(timeSec * (8 + 16 * t.near)) > -0.4;
      t.led.scale.setScalar(1 + t.near * 0.8);
    } else t.led.scale.setScalar(1);
  }
}

function animateSparks(t, dt, timeSec) {
  const k = t.near;
  const on = k > 0.02;
  t.glow.visible = on;
  t.sparks.visible = on || t.sparks.material.opacity > 0.02;
  if (on) {
    const pulse = 0.5 + 0.5 * Math.sin(timeSec * (5 + 6 * k));
    t.glow.material.opacity = k * (0.25 + 0.45 * pulse);
    t.glow.scale.setScalar(1 + 0.15 * pulse * k);
  }
  t.sparks.material.opacity += ((on ? 0.6 + 0.4 * k : 0) - t.sparks.material.opacity) * Math.min(1, dt * 6);
  if (!t.sparks.visible) return;
  const arr = t.sparks.geometry.attributes.position.array;
  const half = BOX_SIZE / 2;
  t.sparkData.forEach((s, i) => {
    s.life -= dt * 1.6;
    if (s.life <= 0) {
      if (!on || Math.random() > 0.25 + 0.75 * k) { s.p.set(0, -999, 0); s.life = Math.random() * 0.4; }
      else {
        // nasce num ponto da face exposta e sai voando para fora
        s.p.copy(t.normal).multiplyScalar(half + 0.02);
        s.p.x += (Math.random() - 0.5) * BOX_SIZE * (1 - Math.abs(t.normal.x));
        s.p.y += (Math.random() - 0.5) * BOX_SIZE * (1 - Math.abs(t.normal.y));
        s.p.z += (Math.random() - 0.5) * BOX_SIZE * (1 - Math.abs(t.normal.z));
        s.v.copy(t.normal).multiplyScalar(0.6 + Math.random() * 0.8);
        s.v.x += (Math.random() - 0.5) * 1.4; s.v.y += Math.random() * 1.2; s.v.z += (Math.random() - 0.5) * 1.4;
        s.life = 0.35 + Math.random() * 0.45;
      }
    } else {
      s.v.y -= 3.5 * dt; // gravidade
      s.p.addScaledVector(s.v, dt);
    }
    arr[i * 3] = s.p.x; arr[i * 3 + 1] = s.p.y; arr[i * 3 + 2] = s.p.z;
  });
  t.sparks.geometry.attributes.position.needsUpdate = true;
}

// Piso claro em placas de 1 m, com rejunte e leve variação de tom.
function makeFloorTexture(tiles) {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const N = 4; // 4x4 placas por imagem
  const t = S / N;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const v = 238 + Math.floor(Math.random() * 12);
      g.fillStyle = `rgb(${v},${v},${v - 3})`;
      g.fillRect(i * t, j * t, t, t);
      for (let k = 0; k < 60; k++) { // pontinhos (textura de concreto)
        const w = Math.random() * 10 - 5;
        g.fillStyle = `rgba(${120 + w * 8},${120 + w * 8},${120 + w * 8},0.06)`;
        g.fillRect(i * t + Math.random() * t, j * t + Math.random() * t, 2, 2);
      }
    }
  }
  g.strokeStyle = 'rgba(150,150,150,0.55)';
  g.lineWidth = 2;
  for (let i = 0; i <= N; i++) {
    g.beginPath(); g.moveTo(i * t, 0); g.lineTo(i * t, S); g.stroke();
    g.beginPath(); g.moveTo(0, i * t); g.lineTo(S, i * t); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(tiles / N, tiles / N);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let shadowTexCache = null;
function getShadowTexture() { return shadowTexCache || (shadowTexCache = makeShadowTexture()); }

// Sombra suave (centro escuro, bordas transparentes).
function makeShadowTexture() {
  const S = 128, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(S / 2, S / 2, S * 0.18, S / 2, S / 2, S * 0.5);
  grd.addColorStop(0, 'rgba(0,0,0,0.55)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}
