// Modelo 3D de zumbi (v31): se existir models/zumbi.glb (com esqueleto e
// animações), os zumbis do jogo usam ele; senão continua o boneco feito por
// código. As animações são achadas pelo nome (andar/correr/atacar/morrer...).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { CONFIG } from './config.js';

// nomes de animação mais comuns (Mixamo, Quaternius, Unity...)
const CLIP_NAMES = {
  idle: /idle|stand|breath/i,
  walk: /walk|shamble|move/i,
  run: /run|sprint|chase|jog/i,
  attack: /attack|bite|punch|claw|swing|hit(?!.?react)/i,
  hit: /hit.?react|react|hurt|damage|stagger/i,
  death: /death|die|dead|dying|fall/i,
};

export async function loadZombieModel(onStatus = () => {}) {
  const Z = CONFIG.ZOMBIES;
  if (!Z.MODEL_URLS || !Z.MODEL_URLS.length) return null;
  const loader = new GLTFLoader();
  for (const url of Z.MODEL_URLS) {
    try {
      const g = await new Promise((ok, no) => loader.load(url, ok, undefined, no));
      const scene = g.scene;
      let skinned = false;
      scene.traverse((o) => { if (o.isSkinnedMesh) skinned = true; });
      const box = new THREE.Box3().setFromObject(scene);
      const h = box.max.y - box.min.y;
      if (!(h > 0.01)) continue;
      const clips = {};
      for (const [k, re] of Object.entries(CLIP_NAMES)) {
        const c = g.animations.find((a) => re.test(a.name) && !(k === 'walk' && CLIP_NAMES.run.test(a.name)));
        if (c) clips[k] = c;
      }
      if (!clips.walk && g.animations.length) clips.walk = g.animations[0];
      onStatus(`🧟 Modelo de zumbi carregado (${g.animations.length} animações)`);
      return { scene, clips, norm: Z.MODEL_HEIGHT / h, minY: box.min.y, skinned, names: g.animations.map((a) => a.name) };
    } catch (e) { /* tenta o próximo endereço; sem arquivo = boneco feito por código */ }
  }
  return null;
}

// Cria um zumbi a partir do modelo, no mesmo formato do boneco feito por
// código (root, mats, scale), mais o mixer de animação.
export function makeModelZombie(asset) {
  const Z = CONFIG.ZOMBIES;
  const root = new THREE.Group();
  const body = new THREE.Group(); // tudo que cai/inclina
  root.add(body);
  const model = SkeletonUtils.clone(asset.scene);
  model.scale.setScalar(asset.norm);
  model.position.y = -asset.minY * asset.norm;
  model.rotation.y = Z.MODEL_ROT_Y || 0;
  body.add(model);
  const mats = [];
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false; // (a malha animada sai da caixa original)
    o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
    for (const m of [].concat(o.material)) if (m.emissive) mats.push(m);
  });
  let head = null;
  model.traverse((o) => { if (!head && o.isBone && /head/i.test(o.name)) head = o; });
  const s = 0.92 + Math.random() * 0.16;
  root.scale.setScalar(s);
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const [k, c] of Object.entries(asset.clips)) actions[k] = mixer.clipAction(c);
  if (actions.attack) { actions.attack.setLoop(THREE.LoopOnce, 1); actions.attack.clampWhenFinished = false; }
  if (actions.death) { actions.death.setLoop(THREE.LoopOnce, 1); actions.death.clampWhenFinished = true; }
  if (actions.hit) { actions.hit.setLoop(THREE.LoopOnce, 1); }
  const m = { root, body, model, mats, scale: s, gltf: true, mixer, actions, cur: null, headBone: head };
  playAnim(m, actions.idle ? 'idle' : 'walk');
  // começa a animação num ponto sorteado (os zumbis não andam todos iguais)
  mixer.update(Math.random() * 2);
  return m;
}

// troca de animação com transição suave
export function playAnim(m, name, fade = 0.25) {
  const a = m.actions[name] || (name === 'run' ? m.actions.walk : null) || (name === 'idle' ? m.actions.walk : null);
  if (!a || m.cur === a) return a;
  a.reset().setEffectiveWeight(1).fadeIn(fade).play();
  if (m.cur) m.cur.fadeOut(fade);
  m.cur = a;
  return a;
}

// ação "por cima" (ataque, levar golpe), volta para a de antes sozinha
export function playOnce(m, name) {
  const a = m.actions[name];
  if (!a) return false;
  const back = m.cur;
  a.reset().setEffectiveWeight(1).fadeIn(0.08).play();
  if (back && back !== a) back.fadeOut(0.08);
  m.cur = a;
  const done = (e) => {
    if (e.action !== a) return;
    m.mixer.removeEventListener('finished', done);
    if (m.cur === a && !m.dead) { a.fadeOut(0.15); m.cur = null; playAnim(m, m.wantLoop || 'walk', 0.15); }
  };
  m.mixer.addEventListener('finished', done);
  return true;
}
