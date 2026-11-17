// Service worker do Caçador de Sinal.
// Objetivo: o link normal sempre abrir a versão MAIS NOVA do jogo.
//  - Arquivos do site (html/js/css): sempre pergunta ao servidor se mudou
//    (rápido: se não mudou, o servidor responde "igual" e usa o guardado).
//  - Bibliotecas da internet (Three.js, MediaPipe, modelo das mãos): têm
//    versão fixa no endereço, então usa o guardado (carrega mais rápido).
//  - Sem internet: usa a última versão guardada (o jogo ainda abre na feira).
const CACHE = 'cacador-sinal-v1';
const CDN = /(^|\.)cdn\.jsdelivr\.net$|(^|\.)storage\.googleapis\.com$/;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

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
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

// "?v=6" e afins não criam cópias separadas
function stripSearch(url) { return url.origin + url.pathname; }
