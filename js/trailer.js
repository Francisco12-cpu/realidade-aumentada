// Trailer automático (v31): monta o jogo de verdade (escola, cenário,
// zumbis, mãos, sons) e "filma" uma sequência de cenas com câmera de
// cinema, câmera lenta nos socos e títulos. Grava sozinho um vídeo .webm
// (1920×1080) com o som, para baixar. Abre em trailer.html.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { buildWorld, loadSchool, updateDetails } from './scene.js';
import { Horde, makeZombie } from './zombies.js';
import { HandView } from './hands.js';
import { pose } from './demo.js';
import { Sfx } from './audio.js';
import { Jumpscare } from './jumpscare.js';
import { loadZombieModel, makeModelZombie } from './zumbimodelo.js';

// ---------------- números "aleatórios" fixos (o trailer sai sempre igual) ----------------
let seed = 12345;
Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

const W = 1920, H = 1080, FPS = 60;
const status = (t) => { document.getElementById('status').textContent = t; };

// ---------------- cena ----------------
const canvas = document.getElementById('gl');
// (globalThis.__TRAILER_RENDERER__ = tela de mentira, só para os testes automáticos)
const renderer = globalThis.__TRAILER_RENDERER__ || new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: false });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, W / H, 0.03, CONFIG.MAP.VIEW_FAR);
scene.add(camera);
const world = buildWorld(scene);
const sfx = new Sfx({ sound: true, vibrate: false, music: true });
const hooks = {
  onGroanAt: (z) => sfx.groanAt(new THREE.Vector3().copy(z.m.root.position).setY(z.m.root.position.y + 1.6), z.alert),
  onStep: (z) => sfx.stepAt(new THREE.Vector3().copy(z.m.root.position)),
  onHit: () => {}, onRunnerHit: () => {}, onScream: () => {},
};
const horde = new Horde(scene, world, hooks);
const jump = new Jumpscare(camera);

// mãos em 1ª pessoa (pistolinha na direita, soco na esquerda)
const GUN = pose([1, 0.08, 0.05, 0.05], 1), FIST = pose([0.05, 0.03, 0.03, 0.03], 0.3), OPEN = pose([1, 1, 1, 1]);
function makeHand(side, color) {
  const h = { side, visible: false, present: false, gesture: 'neutral', camPts: Array.from({ length: 21 }, () => new THREE.Vector3()) };
  const v = new HandView(camera, h);
  v.tint = color;
  return { h, v };
}
const right = makeHand('right', CONFIG.ROLES.GUN_COLOR), left = makeHand('left', CONFIG.ROLES.WALK_COLOR);
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3();
function placeHand(H, P, at, pitch, yaw, roll, mirror = false) {
  _q.setFromEuler(_e.set(pitch, yaw, roll));
  H.h.visible = true;
  for (let i = 0; i < 21; i++) {
    _p.copy(P[i]); if (mirror) _p.x = -_p.x;
    H.h.camPts[i].copy(_p).multiplyScalar(0.95).applyQuaternion(_q).add(at);
  }
}
function hideHands() { right.h.visible = false; left.h.visible = false; }

// pistola na mão direita + clarão e risco do tiro
const pistol = new THREE.Group();
{
  const dark = new THREE.MeshLambertMaterial({ color: 0x2a2d31 }), grip = new THREE.MeshLambertMaterial({ color: 0x4a3a2c });
  const bx = (w, h, d, x, y, z, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); pistol.add(o); };
  bx(0.03, 0.035, 0.17, 0, 0.012, -0.05, dark); bx(0.026, 0.07, 0.035, 0, -0.035, 0.01, grip);
  bx(0.012, 0.012, 0.01, 0, 0.012, -0.137, new THREE.MeshBasicMaterial({ color: 0xff7a1a }));
}
pistol.visible = false; camera.add(pistol);
const flash = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, depthWrite: false }));
flash.visible = false; camera.add(flash);
const tracerGeo = new THREE.BufferGeometry(); tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
const tracer = new THREE.Line(tracerGeo, new THREE.LineBasicMaterial({ color: 0xfff1a8, transparent: true }));
tracer.frustumCulled = false; tracer.visible = false; scene.add(tracer);
let fxT = 0;

// jogador visto de fora (cena "por trás"): boneco com cores de aluno
function makePlayerAvatar() {
  const m = makeZombie();
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a77e }), shirt = new THREE.MeshLambertMaterial({ color: 0x2a4f9a }), pants = new THREE.MeshLambertMaterial({ color: 0x23262e });
  const black = new THREE.MeshBasicMaterial({ color: 0x111111 });
  m.root.traverse((o) => {
    if (!o.isMesh) return;
    const c = o.material.color ? o.material.color.getHex() : 0;
    if (o.material === m.mats[0]) o.material = skin; else if (o.material === m.mats[1]) o.material = shirt; else if (o.material === m.mats[2]) o.material = pants; else o.material = black;
  });
  // óculos de VR na cara
  const vr = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.1), new THREE.MeshLambertMaterial({ color: 0xeeeeee }));
  vr.position.set(0, 0.17, 0.15); m.head.add(vr);
  m.armL.rotation.x = -1.2; m.armR.rotation.x = -1.4;
  scene.add(m.root);
  m.root.visible = false;
  return m;
}
const avatar = makePlayerAvatar();

// ---------------- títulos (presos à câmera) ----------------
function makeTitle() {
  const c = document.createElement('canvas'); c.width = 1920; c.height = 1080;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  mesh.renderOrder = 90; mesh.frustumCulled = false;
  camera.add(mesh);
  return { c, g: c.getContext('2d'), tex, mesh, key: '' };
}
const title = makeTitle();
const black = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
black.renderOrder = 89; black.frustumCulled = false; camera.add(black);
function fitOverlays() {
  // planos que cobrem a tela inteira, a 0,2 m da câmera
  const d = 0.2, h = 2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), w = h * camera.aspect;
  for (const m of [title.mesh, black]) { m.position.set(0, 0, -d); m.scale.set(w, h, 1); }
}
function drawTitle(big, small, a, caption) {
  const key = `${big}|${small}|${a.toFixed(2)}|${caption}`;
  if (key === title.key) return;
  title.key = key;
  const g = title.g; g.clearRect(0, 0, 1920, 1080);
  if (a > 0 && big) {
    g.globalAlpha = a; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(120,0,0,0.9)'; g.shadowBlur = 40;
    g.fillStyle = '#e8e0d0'; g.font = 'bold 170px Impact, "Arial Black", sans-serif';
    g.fillText(big, 960, 470);
    g.shadowBlur = 0;
    if (small) { g.fillStyle = '#c9b9a0'; g.font = '48px system-ui, sans-serif'; String(small).split('\n').forEach((l, i) => g.fillText(l, 960, 610 + i * 64)); }
    g.globalAlpha = 1;
  }
  if (caption) {
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 54px system-ui, sans-serif';
    const tw = g.measureText(caption).width + 80;
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(960 - tw / 2, 900, tw, 92);
    g.fillStyle = '#fff'; g.fillText(caption, 960, 948);
  }
  title.tex.needsUpdate = true;
}

// ---------------- roteiro ----------------
let S0, F, Rt, center; // início, frente, direita, centro da escola
const P = (d, side = 0, y = 0) => new THREE.Vector3(S0.x + F.x * d + Rt.x * side, S0.y + y, S0.z + F.z * d + Rt.z * side);
const eye = (d, side = 0) => P(d, side, CONFIG.EYE_HEIGHT);

// lugar livre perto de um ponto (para pôr zumbis)
function freeNear(p) {
  for (let r = 0; r < 3; r += 0.25) for (let a = 0; a < 6.28; a += 0.8) {
    const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r, y = world.floorAt(x, z);
    if (y != null && Math.abs(y - S0.y) < 0.5 && world.isFree(x, z, 0.3, y)) return new THREE.Vector3(x, y, z);
  }
  return p.clone();
}
function addZ(d, side, alert, speed = null) {
  const q = freeNear(P(d, side));
  const z = horde._add(q.x, q.y, q.z, { yaw: Math.atan2(S0.x - q.x, S0.z - q.z) });
  z.alert = alert; z.flank = false; if (speed) z.speed = speed;
  return z;
}
const player = new THREE.Vector3(), facing = new THREE.Vector3();
let timeScale = 1;

function shoot(z) {
  const p = z.m.root.position;
  const head = new THREE.Vector3(p.x, p.y + 1.72 * z.m.scale, p.z);
  const muzzle = new THREE.Vector3(0, 0.012, -0.145).applyMatrix4(pistol.matrixWorld);
  flash.position.set(0.13, -0.1, -0.45); flash.scale.setScalar(0.035); flash.visible = true;
  const a = tracerGeo.attributes.position; a.setXYZ(0, muzzle.x, muzzle.y, muzzle.z); a.setXYZ(1, head.x, head.y, head.z); a.needsUpdate = true;
  tracer.visible = true; fxT = 0.11;
  sfx.shot();
  horde.damage(z, 'head');
  sfx.zombieHit(true);
}
function punch(z) {
  const d = new THREE.Vector3(z.m.root.position.x - player.x, 0, z.m.root.position.z - player.z).normalize();
  const kill = horde.punch(z, d);
  sfx.punch(kill);
  return kill;
}

// cada cena: [início, fim, função(t local 0..dur, dt)]
const shots = [];
let zs = [];
function buildScript() {
  const camLook = (from, to) => { camera.position.copy(from); camera.lookAt(to); };
  shots.length = 0;
  // 1) drone por cima da escola, descendo; título
  shots.push({ a: 0, b: 6, start() {
      horde.clear(); hideHands(); camera.fov = 55; for (let i = 0; i < 5; i++) addZ(14 + i * 3, (i % 2 ? 1 : -1) * 1.5, false);
      // lá de cima: neblina bem longe (senão a escola some)
      scene.fog.near = 70; scene.fog.far = 260;
    },
    run(t) {
      const ang = 0.6 + t * 0.09, r = 75 - t * 4, y = 46 - t * 3.5;
      camLook(new THREE.Vector3(center.x + Math.cos(ang) * r, center.y + y, center.z + Math.sin(ang) * r), center);
      const a = THREE.MathUtils.clamp((t - 1.2) / 1.2, 0, 1) * (1 - THREE.MathUtils.clamp((t - 5.2) / 0.8, 0, 1));
      drawTitle('ESCOLA ZUMBI', 'um jogo de realidade virtual', a, '');
    } });
  // 2) corredor: câmera andando devagar, zumbis vagando lá na frente
  shots.push({ a: 6, b: 11, start() { camera.fov = 62; scene.fog.near = CONFIG.MAP.FOG_NEAR; scene.fog.far = CONFIG.MAP.FOG_FAR; },
    run(t) {
      const e = eye(0.5 + t * 0.9); e.y += Math.sin(t * 5) * 0.015;
      camLook(e, eye(12 + t, Math.sin(t * 0.3) * 0.5));
      player.copy(P(0.5 + t * 0.9));
      drawTitle('', '', 0, 'A escola foi tomada.');
    } });
  // 3) 1ª pessoa: tiros na cabeça
  shots.push({ a: 11, b: 19, start() { horde.clear(); zs = [addZ(13, -1, true, 0.9), addZ(15, 1.2, true, 1.0), addZ(18, 0, true, 0.8), addZ(20, -1.5, true, 1.1)]; this.next = 0; this.times = [1.6, 2.8, 4.2, 5.6]; },
    run(t) {
      const base = eye(5);
      player.copy(P(5));
      // vira suave para o zumbi da vez (mira com a cabeça)
      const tgt = zs.find((z) => !z.dead) || zs[zs.length - 1];
      const tp = tgt.m.root.position, look = new THREE.Vector3(tp.x, tp.y + 1.55, tp.z);
      this.look = this.look ? this.look.lerp(look, 0.08) : look.clone();
      camLook(base, this.look);
      placeHand(right, GUN, new THREE.Vector3(0.13, -0.15, -0.42), -1.15, 0.15, 0);
      pistol.visible = true; pistol.position.set(0.13, -0.1, -0.36); pistol.rotation.set(0.05, 0, 0);
      if (this.next < this.times.length && t >= this.times[this.next]) { const z = zs.find((q) => !q.dead); if (z) shoot(z); this.next++; }
      drawTitle('', '', 0, 'Mire com a cabeça. Atire com a mão. 👉');
    } });
  // 4) soco em câmera lenta
  shots.push({ a: 19, b: 25, start() { horde.clear(); pistol.visible = false; right.h.visible = false; this.z = addZ(7.6, 0, true, 1.3); this.p = 0; },
    run(t) {
      const z = this.z;
      player.copy(P(5));
      const zp = z.m.root.position;
      camLook(eye(5), new THREE.Vector3(zp.x, zp.y + 1.45, zp.z));
      // soco: a mão vai para frente rápido e volta
      const hits = [1.9, 3.6];
      let k = 0;
      for (const h of hits) { const u = (t - h + 0.25) / 0.5; if (u > 0 && u < 1) k = Math.sin(u * Math.PI); }
      placeHand(left, k > 0.1 ? FIST : OPEN, new THREE.Vector3(-0.12 + k * 0.06, -0.16 + k * 0.08, -0.36 - k * 0.22), -0.9 - k * 0.5, -0.2, 0.2, true);
      if (this.p < hits.length && t >= hits[this.p]) { punch(z); this.p++; }
      // câmera lenta perto da pancada
      const nearHit = hits.some((h) => Math.abs(t - h) < 0.35);
      timeScale = nearHit ? 0.3 : 1;
      drawTitle('', '', 0, 'Soque. 👊');
    } });
  // 5) visto de fora: o zumbi vem por trás
  shots.push({ a: 25, b: 31, start() { horde.clear(); hideHands(); timeScale = 1; avatar.root.visible = true; this.z = addZ(-6, 1.5, true, 1.0); this.hb = 0; },
    run(t) {
      const ap = P(6);
      avatar.root.position.copy(ap);
      avatar.root.rotation.y = Math.atan2(F.x, F.z);
      player.copy(ap);
      // câmera alta, de lado, mostrando o jogador olhando para frente e o zumbi chegando por trás
      const cpos = P(6 - 1 - t * 0.3, -4.5, 3.4);
      camLook(cpos, P(4.5, 0, 1.0));
      if (t > this.hb) { this.hb = t + 0.6; sfx.heartbeat(0.9); }
      drawTitle('', '', 0, 'Use fone: eles vêm por trás. 🎧');
    } });
  // 6) 1ª pessoa: o zumbi corre gritando e pula na cara
  shots.push({ a: 31, b: 37.5, start() { horde.clear(); avatar.root.visible = false; this.z = null; this.done = false; },
    run(t) {
      player.copy(P(3));
      camLook(eye(3), eye(20));
      if (!this.z && t > 0.6) {
        // igual ao jogo: nasce longe, na frente, com visão livre até a câmera
        this.z = horde.spawnRunner(player, F);
        if (this.z) { const q = this.z.m.root.position; sfx.screamFar(new THREE.Vector3(q.x, q.y + 1.6, q.z)); }
      }
      if (this.z && !this.done && this.z.dead) {
        this.done = true;
        sfx.jumpscare();
        jump.start(() => {});
      }
      drawTitle('', '', 0, this.z && !this.done ? '' : '');
      black.material.opacity = THREE.MathUtils.clamp((t - 5.6) / 0.4, 0, 1);
    } });
  // 7) cartela final
  shots.push({ a: 37.5, b: 45, start() { horde.clear(); jump.reset(); black.material.opacity = 1; },
    run(t) {
      const a = THREE.MathUtils.clamp((t - 0.5) / 1.0, 0, 1) * (1 - THREE.MathUtils.clamp((t - 6.6) / 0.6, 0, 1));
      drawTitle('ESCOLA ZUMBI', 'Jogue no celular · óculos VR · mãos ou controle\nfrancisco12-cpu.github.io/realidade-aumentada', a, '');
      if (!this.g && t > 2.2) { this.g = true; sfx.groanAt(new THREE.Vector3().copy(camera.position).add(new THREE.Vector3(1.5, 0, 0.5)), true); }
    } });
}
const TOTAL = 45;
globalThis.__trailer = { horde, player, world, get t() { return t; } }; // (para os testes automáticos)

// ---------------- execução ----------------
let t = 0, cur = -1, running = false, recorder = null, chunks = [], last = 0;
function frame(now) {
  if (!running) return;
  const real = THREE.MathUtils.clamp((now - last) / 1000, 0, 0.05) || 1 / FPS;
  last = now;
  t += real;
  const i = shots.findIndex((s) => t >= s.a && t < s.b);
  if (i < 0) { finish(); return; }
  if (i !== cur) { cur = i; black.material.opacity = 0; drawTitle('', '', 0, ''); shots[i].start(); horde._flowT = -99; }
  const s = shots[i];
  s.run(t - s.a, real);
  const sim = real * timeScale;
  camera.getWorldDirection(facing); facing.y = 0; facing.normalize();
  horde.update(sim, player, facing);
  updateDetails(world, camera.position);
  if (world.cenario) world.cenario.update(sim, camera.position);
  jump.update(real);
  right.v.update(); left.v.update();
  if (fxT > 0) { fxT -= real; } flash.visible = tracer.visible = fxT > 0;
  camera.updateProjectionMatrix(); fitOverlays();
  sfx.listener(camera.position, camera.getWorldDirection(new THREE.Vector3()), new THREE.Vector3(0, 1, 0));
  renderer.render(scene, camera);
  document.getElementById('time').textContent = `${t.toFixed(1)} / ${TOTAL} s`;
  requestAnimationFrame(frame);
}

function begin(record) {
  seed = 12345; t = 0; cur = -1; timeScale = 1;
  sfx.unlock(); sfx.music(true);
  buildScript();
  if (record) {
    const stream = canvas.captureStream(FPS);
    // som do jogo junto no vídeo
    if (sfx.ctx) {
      const dest = sfx.ctx.createMediaStreamDestination();
      sfx.master.connect(dest); if (sfx.musicBus) sfx.musicBus.connect(dest);
      for (const tr of dest.stream.getAudioTracks()) stream.addTrack(tr);
    }
    const type = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
    recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 16e6 });
    chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const a = document.getElementById('download');
      a.href = URL.createObjectURL(blob); a.download = 'trailer-escola-zumbi.webm';
      a.hidden = false; a.textContent = `⬇ Baixar o trailer (${(blob.size / 1e6).toFixed(1)} MB)`;
      status('Pronto! Baixe o vídeo e me mande o caminho do arquivo para eu deixar em MP4 para o YouTube/Reels.');
    };
    recorder.start(1000);
    status('Gravando… não troque de aba até terminar (45 s).');
  } else status('Assistindo (sem gravar).');
  running = true; last = performance.now();
  requestAnimationFrame(frame);
}

function finish() {
  running = false;
  sfx.music(false);
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  else status('Fim. Aperte ⏺ Gravar para baixar o vídeo.');
  recorder = null;
}

async function init() {
  status('Carregando a escola…');
  // no trailer, desenha a escola inteira (o drone vê tudo) e os detalhes de longe
  CONFIG.MAP.CHUNK_CULL = false;
  CONFIG.MAP.DETAIL_DIST = 200;
  try {
    const asset = await loadZombieModel();
    if (asset) { horde.factory = () => makeModelZombie(asset); jump.factory = () => makeModelZombie(asset); }
  } catch (e) { /* boneco feito por código */ }
  await loadSchool(world, scene, (msg, f) => status(`🏫 ${msg}… ${Math.round(f * 100)}%`), 4);
  for (const t of world.targets) scene.remove(t.group);
  world.targets = [];
  S0 = world.spawn.clone();
  const yaw = CONFIG.MAP.SPAWN_YAW;
  F = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  Rt = new THREE.Vector3(-F.z, 0, F.x);
  const g = world.grid;
  center = new THREE.Vector3(g.x0 + g.W * g.cell / 2, S0.y, g.z0 + g.H * g.cell / 2);
  camera.position.copy(eye(0)); camera.lookAt(eye(10));
  renderer.render(scene, camera);
  status('Pronto. ▶ Assistir ou ⏺ Gravar (o vídeo baixa no fim).');
  document.getElementById('play').disabled = false;
  document.getElementById('rec').disabled = false;
}

document.getElementById('play').addEventListener('click', () => { if (!running) begin(false); });
document.getElementById('rec').addEventListener('click', () => { if (!running) begin(true); });
init().catch((e) => { console.error(e); status('Erro: ' + e.message); });
