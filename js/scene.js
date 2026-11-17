// Mapa de teste: blocos coloridos + chão branco + caixas pretas (pontos de sinal).
// Nada da escola ainda — o objetivo é só ter referências visuais e obstáculos.
import * as THREE from 'three';
import { CONFIG } from './config.js';

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

// Pontos de sinal. normal = face exposta (por onde a caixa "abre").
export const TARGET_DEFS = [
  { id: 'tutorial', tutorial: true, pos: [0, 0.78 + BOX_SIZE / 2, 6.5], normal: [0, 1, 0], wires: 1 },
  { id: 'sala-vermelha', pos: [-12, BOX_SIZE / 2, -10], normal: [0, 1, 0] },
  { id: 'laboratorio-parede', pos: [-4.85 + BOX_SIZE / 2, 1.4, -10.5], normal: [1, 0, 0] },
  { id: 'sala-verde', pos: [13, BOX_SIZE / 2, -13.5], normal: [0, 1, 0] },
  { id: 'cantina-teto', pos: [11, 2.5 - BOX_SIZE / 2, -0.5], normal: [0, -1, 0] },
  { id: 'quadra', pos: [-15.8, BOX_SIZE / 2, 4], normal: [0, 1, 0] },
  { id: 'biblioteca', pos: [12.5, BOX_SIZE / 2, 9], normal: [0, 1, 0] },
];

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

  // Chão: piso claro com rejunte e leve variação (textura gerada no código)
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshLambertMaterial({ map: makeFloorTexture(40) }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  // caminhos (cinza-claro) ligando as áreas
  const roadMat = new THREE.MeshLambertMaterial({ color: 0xd9dcdf });
  for (const [w, d, x, z] of [[3, 23, 0, 3.5], [34, 2.4, 0, -6.2], [6, 2.4, 6, 1], [2.4, 6, -5.6, 1]]) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(w, d), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(x, 0.004, z);
    scene.add(road);
  }
  // quadra: piso verde com linhas brancas
  const court = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 10), new THREE.MeshLambertMaterial({ color: 0x3f9b5b }));
  court.rotation.x = -Math.PI / 2;
  court.position.set(-12.55, 0.006, 0);
  scene.add(court);
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const [w, d, x, z] of [[9.2, 0.08, -12.55, 4.8], [9.2, 0.08, -12.55, -4.8], [0.08, 9.6, -17.15, 0], [0.08, 9.6, -7.95, 0], [0.08, 9.6, -12.55, 0]]) {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineMat);
    l.rotation.x = -Math.PI / 2;
    l.position.set(x, 0.008, z);
    scene.add(l);
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.23, 40), lineMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(-12.55, 0.008, 0);
  scene.add(ring);
  // bandeira no mastro
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7), new THREE.MeshLambertMaterial({ color: 0x00a3ad, side: THREE.DoubleSide }));
  flag.position.set(0.63, 4.55, -3);
  scene.add(flag);
  scene.userData.flag = flag;

  const shadowTex = makeShadowTexture();
  const addShadow = (cx, cz, w, d, opacity = 0.55) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(cx, 0.008, cz);
    scene.add(m);
  };

  const blocks = [];
  const geo = new THREE.BoxGeometry(1, 1, 1);
  for (const [x0, x1, z0, z1, y0, y1, color] of BLOCKS) {
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
    mesh.scale.set(x1 - x0, y1 - y0, z1 - z0);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    scene.add(mesh);
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
    scene.add(trunk);
    blocks.push({ mesh: trunk, box: new THREE.Box3(new THREE.Vector3(x - 0.15, 0, z - 0.15), new THREE.Vector3(x + 0.15, 1.8, z + 0.15)) });
    const crown = new THREE.Mesh(leafGeo, leafMat);
    crown.position.set(x, 2.5, z);
    crown.scale.set(1, 0.9, 1);
    scene.add(crown);
    addShadow(x, z, 2.4, 2.4, 0.45);
  }

  const world = {
    blocks,
    targets: [],
    spawn: new THREE.Vector3(0, 0, 10),
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

  for (const def of TARGET_DEFS) {
    world.targets.push(createTarget(scene, def));
    if (def.pos[1] < 0.5) addShadow(def.pos[0], def.pos[2], BOX_SIZE + 0.5, BOX_SIZE + 0.5, 0.6);
  }
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
