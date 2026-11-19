// Service worker do Caçador de Sinal.
// Objetivo: o link normal sempre abrir a versão MAIS NOVA do jogo, e o jogo
// abrir SEM INTERNET depois da primeira visita (útil na feira).
//  - Na instalação já baixa TUDO: arquivos do site + Three.js + MediaPipe
//    (wasm) + modelo das mãos. Não precisa jogar uma partida inteira antes.
//  - Arquivos do site (html/js/css): sempre pergunta ao servidor se mudou
//    (rápido: se não mudou, o servidor responde "igual" e usa o guardado).
//  - Bibliotecas da internet: têm versão fixa no endereço, então usa o
//    guardado (carrega mais rápido).
//  - Sem internet: usa a última versão guardada.
const CACHE = 'cacador-sinal-v1';
const CDN = /(^|\.)cdn\.jsdelivr\.net$|(^|\.)storage\.googleapis\.com$/;

const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const LIBS = [
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',
  'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js',
  'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js',
  'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/SkeletonUtils.js',
  `${MP}/vision_bundle.mjs`,
  `${MP}/vision_bundle.cjs`,
  `${MP}/wasm/vision_wasm_internal.js`,
  `${MP}/wasm/vision_wasm_internal.wasm`,
  `${MP}/wasm/vision_wasm_nosimd_internal.js`,
  `${MP}/wasm/vision_wasm_nosimd_internal.wasm`,
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
];
// arquivos do site (no dist/ só existe o index.html: os outros falham e são ignorados)
const SITE = [
  './', 'index.html', 'css/style.css', 'models/escola.glb', '../models/escola.glb',
  'sons/grito-cara.mp3', 'sons/grito-longe.mp3', '../sons/grito-cara.mp3', '../sons/grito-longe.mp3',
  'js/main.js', 'js/config.js', 'js/options.js', 'js/audio.js', 'js/handhint.js', 'js/ranking.js', 'js/mapa.js', 'js/scene.js', 'js/zombies.js', 'js/gun.js', 'js/coach.js', 'js/orientation.js',
  'js/hands.js', 'js/filters.js', 'js/gestures.js', 'js/teleport.js', 'js/locomotion.js',
  'js/interaction.js', 'js/calibration.js', 'js/debug.js', 'js/vr.js', 'js/lobby.js', 'js/melee.js', 'js/cenario.js', 'js/demo.js', 'js/gamepad.js', 'js/swipe.js', 'js/jumpscare.js', 'js/borda.js', 'js/zumbimodelo.js', 'models/zumbi.glb', '../models/zumbi.glb',
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(precache());
});
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// Baixa um por um: se um falhar (sem internet, arquivo que não existe), os outros continuam.
async function precache() {
  const cache = await caches.open(CACHE);
  await Promise.all([
    ...LIBS.map(async (u) => {
      try {
        if (await cache.match(u, { ignoreVary: true })) return;
        const res = await fetch(u, { mode: 'cors' });
        if (res.ok) await cache.put(u, res);
      } catch (err) { /* tenta de novo quando o jogo pedir */ }
    }),
    ...SITE.map(async (path) => {
      try {
        const url = new URL(path, self.registration.scope);
        const res = await fetch(url.href, { cache: 'no-cache' });
        if (res.ok) await cache.put(stripSearch(url), res);
      } catch (err) { /* */ }
    }),
  ]);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  if (!same && !CDN.test(url.hostname)) return;
  e.respondWith(same ? networkFirst(req, url) : cacheFirst(req));
});

async function networkFirst(req, url) {
  const cache = await caches.open(CACHE);
  try {
    // 'no-cache' = sempre confere com o servidor (ignora a cópia de 10 min do navegador)
    const fresh = await fetch(url.href, { cache: 'no-cache', credentials: 'same-origin' });
    if (fresh.ok) cache.put(stripSearch(url), fresh.clone());
    return fresh;
  } catch (err) {
    const hit = await cache.match(stripSearch(url));
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  // ignora modo/credenciais: o que foi guardado na instalação serve para qualquer pedido
  const hit = await cache.match(req.url, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req.url, res.clone());
  return res;
}

// "?v=6" e afins não criam cópias separadas
function stripSearch(url) { return url.origin + url.pathname; }
