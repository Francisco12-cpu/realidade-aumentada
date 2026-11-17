// Classificação de gestos por regras sobre os 21 pontos da mão.
// Usa os landmarks "world" (3D em metros), que não dependem da distância
// nem da rotação da mão na imagem.
//
// Gestos: neutral (mão relaxada), gun (pistolinha), open (palma aberta),
//         fist (punho fechado), pinch (pinça).
import { CONFIG } from './config.js';

export const GESTURES = ['neutral', 'gun', 'open', 'fist', 'pinch'];
export const GESTURE_LABELS = {
  none: '—', neutral: 'normal', gun: 'pistolinha', open: 'palma aberta', fist: 'punho', pinch: 'pinça',
};

const FINGERS = [ // indicador, médio, anelar, mínimo: [mcp, pip, dip, tip]
  [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20],
];

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }

// Retidão de um dedo: 1 = totalmente reto, ~0.3 = totalmente dobrado.
function straightness(w, [a, b, c, d]) {
  const len = dist(w[a], w[b]) + dist(w[b], w[c]) + dist(w[c], w[d]);
  return dist(w[a], w[d]) / Math.max(len, 1e-6);
}

export function computeFeatures(w) {
  const palm = Math.max(dist(w[0], w[9]), 1e-4);
  return {
    straight: FINGERS.map((f) => straightness(w, f)),
    thumbOut: dist(w[4], w[5]) / palm,   // ponta do polegar longe da base do indicador
    pinch: dist(w[4], w[8]) / palm,      // ponta do polegar até ponta do indicador
  };
}

// Retorna { gesture, conf } — conf 0..1 = quão "longe" dos limiares.
export function classify(f, thr) {
  const ext = f.straight.map((s, i) => s > thr.ext[i]);
  const margin = (v, t) => Math.min(1, Math.abs(v - t) / 0.15);
  const allCurled = !ext[0] && !ext[1] && !ext[2] && !ext[3];
  const allExt = ext[0] && ext[1] && ext[2] && ext[3];

  // Pinça: polegar e indicador juntos, indicador NÃO dobrado como num punho
  if (f.pinch < thr.pinch && f.straight[0] > thr.fistIndex) {
    return { gesture: 'pinch', conf: Math.min(margin(f.pinch, thr.pinch), margin(f.straight[0], thr.fistIndex)) };
  }
  if (allCurled && f.straight[0] < thr.fistIndex + 0.08) {
    const c = Math.min(...f.straight.map((s, i) => margin(s, thr.ext[i])));
    return { gesture: 'fist', conf: c };
  }
  if (ext[0] && !ext[1] && !ext[2] && !ext[3] && f.thumbOut > thr.thumbOut) {
    const c = Math.min(margin(f.straight[0], thr.ext[0]), margin(f.straight[1], thr.ext[1]), margin(f.thumbOut, thr.thumbOut));
    return { gesture: 'gun', conf: c };
  }
  if (allExt && f.thumbOut > thr.thumbOut * 0.85 && f.pinch > thr.pinch * 1.6) {
    const c = Math.min(...f.straight.map((s, i) => margin(s, thr.ext[i])));
    return { gesture: 'open', conf: c };
  }
  return { gesture: 'neutral', conf: 0.5 };
}

// Atualiza o gesto de uma mão com "debounce": um gesto novo só vale depois de
// aparecer em STABLE_FRAMES detecções seguidas.
export function updateHandGesture(hand, thr, nowMs, override = null) {
  hand.prevGesture = hand.gesture;
  if (override) {
    hand.gesture = override; hand.gestureConf = 1; hand.candidate = override; hand.candidateCount = 99;
    return;
  }
  if (!hand.visible || !hand.wlm) {
    hand.features = null;
    if (hand.gesture !== 'none') { hand.gesture = 'none'; hand.gestureSince = nowMs; }
    hand.candidate = 'none'; hand.candidateCount = 0;
    return;
  }
  if (!hand.present) return; // mão em tolerância: mantém o último gesto
  hand.features = computeFeatures(hand.wlm);
  const { gesture, conf } = classify(hand.features, thr);
  if (gesture === hand.candidate) hand.candidateCount++;
  else { hand.candidate = gesture; hand.candidateCount = 1; }
  if (hand.candidate !== hand.gesture && hand.candidateCount >= CONFIG.GESTURE.STABLE_FRAMES) {
    hand.gesture = hand.candidate;
    hand.gestureSince = nowMs;
  }
  hand.gestureConf = gesture === hand.gesture ? conf : 0;
}

// ---- Calibração: calcula limiares a partir das médias de cada pose ----
export function averageFeatures(list) {
  if (!list.length) return null;
  const acc = { straight: [0, 0, 0, 0], thumbOut: 0, pinch: 0 };
  for (const f of list) {
    for (let i = 0; i < 4; i++) acc.straight[i] += f.straight[i];
    acc.thumbOut += f.thumbOut;
    acc.pinch += f.pinch;
  }
  const n = list.length;
  return { straight: acc.straight.map((s) => s / n), thumbOut: acc.thumbOut / n, pinch: acc.pinch / n };
}

// poses: { neutral, gun, open, fist, pinch } -> médias (podem faltar)
export function thresholdsFromPoses(poses, base) {
  const thr = JSON.parse(JSON.stringify(base));
  const { open, fist, gun, pinch, neutral } = poses;
  const mid = (a, b, k = 0.5) => a + (b - a) * k;
  if (open && fist) {
    for (let i = 0; i < 4; i++) {
      if (open.straight[i] - fist.straight[i] > 0.12) thr.ext[i] = mid(fist.straight[i], open.straight[i]);
    }
    if (pinch && pinch.straight[0] - fist.straight[0] > 0.08) thr.fistIndex = mid(fist.straight[0], pinch.straight[0]);
    else thr.fistIndex = Math.min(thr.ext[0] - 0.08, mid(fist.straight[0], open.straight[0], 0.35));
  }
  if (gun && fist && gun.thumbOut - fist.thumbOut > 0.1) thr.thumbOut = mid(fist.thumbOut, gun.thumbOut);
  if (pinch) {
    const others = [neutral, open, gun].filter(Boolean).map((p) => p.pinch);
    const ref = others.length ? Math.min(...others) : pinch.pinch + 0.6;
    if (ref - pinch.pinch > 0.08) thr.pinch = mid(pinch.pinch, ref, 0.45);
  }
  return thr;
}
