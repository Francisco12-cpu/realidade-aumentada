// Rastreamento das mãos com MediaPipe Hand Landmarker (câmera traseira).
// - Atribui cada detecção à mão ESQUERDA ou DIREITA com estabilização
//   (rótulo do MediaPipe + continuidade de posição), para não trocar quando
//   a mão some por alguns quadros.
// - Recria a mão no espaço da câmera 3D (esqueleto de esferas e linhas),
//   usando a posição na imagem + estimativa de profundidade pelo tamanho.
// - Suaviza com filtro One Euro.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { OneEuro, OneEuro3 } from './filters.js';

const MP_VERSION = '0.10.14';
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const BUNDLE_CJS = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/vision_bundle.cjs`;

// Worker (thread separada): a detecção das mãos não trava mais o desenho da tela.
// Criado a partir de um Blob para funcionar também na versão em arquivo único.
const WORKER_SRC = `
let lm = null;
function opts(m, delegate) {
  return { baseOptions: { modelAssetPath: m.modelUrl, delegate }, runningMode: 'VIDEO', numHands: m.numHands,
    minHandDetectionConfidence: m.c1, minHandPresenceConfidence: m.c2, minTrackingConfidence: m.c3 };
}
self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'init') {
    try {
      self.exports = {};
      importScripts(m.bundleUrl);
      const v = self.exports;
      const fs = await v.FilesetResolver.forVisionTasks(m.wasmUrl);
      let delegate = 'GPU';
      try { lm = await v.HandLandmarker.createFromOptions(fs, opts(m, 'GPU')); }
      catch (err) { delegate = 'CPU'; lm = await v.HandLandmarker.createFromOptions(fs, opts(m, 'CPU')); }
      postMessage({ type: 'ready', delegate });
    } catch (err) { postMessage({ type: 'error', message: String((err && err.message) || err) }); }
  } else if (m.type === 'frame') {
    let res = null;
    const t0 = performance.now();
    try { res = lm.detectForVideo(m.bitmap, m.ts); } catch (err) { /* quadro perdido */ }
    try { m.bitmap.close(); } catch (err) { /* */ }
    postMessage({ type: 'result', ms: performance.now() - t0, res: res && {
      landmarks: res.landmarks, worldLandmarks: res.worldLandmarks, handedness: res.handedness || res.handednesses } });
  }
};`;

export const BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

const H = CONFIG.HANDS;

class Hand {
  constructor(side) {
    this.side = side;            // 'left' | 'right' (mão real do jogador)
    this.visible = false;        // mostrar na tela (inclui tempo de tolerância)
    this.present = false;        // detectada no último quadro processado
    this.lastSeen = -1e9;        // ms
    this.lastC = { x: 0.5, y: 0.5 };
    this.lm = null;              // landmarks normalizados da imagem
    this.wlm = null;             // landmarks "world" (metros, centrados na mão)
    this.rawLabel = '';
    this.score = 0;
    this.rawDepth = 0;
    this.uv = { x: 0.5, y: 0.5 };
    this.camPts = Array.from({ length: 21 }, () => new THREE.Vector3());
    this.worldPts = Array.from({ length: 21 }, () => new THREE.Vector3());
    this.targetPts = Array.from({ length: 21 }, () => new THREE.Vector3()); // última detecção (filtrada)
    this.filters = Array.from({ length: 21 }, () => new OneEuro3(CONFIG.FILTER)); // forma dos dedos
    this.anchorFilter = new OneEuro3(CONFIG.FILTER_ANCHOR);  // posição da mão na tela
    this.depthFilter = new OneEuro(CONFIG.FILTER_DEPTH.MIN_CUTOFF, CONFIG.FILTER_DEPTH.BETA, CONFIG.FILTER_DEPTH.D_CUTOFF);
    this.rawDepthF = 0;
    this.snap = true;            // próxima atualização copia direto (sem deslizar)
    // preenchido por gestures.js
    this.features = null;
    this.gesture = 'none';
    this.gestureConf = 0;
    this.gestureSince = 0;
    this.candidate = 'none';
    this.candidateCount = 0;
    this.prevGesture = 'none';
  }
}

export class HandTracker {
  constructor(calib) {
    this.calib = calib;
    this.video = document.getElementById('cam');
    this.landmarker = null;
    this.delegate = '';
    this.stream = null;
    this.lastVideoTime = -1;
    this.lastTs = 0;
    this.frame = 0;
    this.detectMs = 0;
    this.detectFps = 0;
    this._detCount = 0;
    this._detT0 = performance.now();
    this.lastResult = null;
    this.left = new Hand('left');
    this.right = new Hand('right');
    this.hands = [this.left, this.right];
    this._p = new THREE.Vector3();
  }

  get(side) { return side === 'left' ? this.left : this.right; }

  async startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Este navegador não dá acesso à câmera (precisa de HTTPS).');
    }
    const video = { facingMode: { ideal: 'environment' }, width: { ideal: H.VIDEO_W }, height: { ideal: H.VIDEO_H }, frameRate: { ideal: 30 } };
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video });
    this.video.srcObject = this.stream;
    this.video.muted = true;
    this.video.setAttribute('playsinline', '');
    await this.video.play();
  }

  async loadModel(onStatus = () => {}) {
    if (H.USE_WORKER && typeof Worker !== 'undefined' && typeof createImageBitmap === 'function') {
      try { await this._initWorker(onStatus); return; } catch (e) {
        console.warn('Worker falhou, usando a thread principal', e);
        onStatus('Modo rápido indisponível, usando o modo normal…');
        if (this.worker) { this.worker.terminate(); this.worker = null; }
      }
    }
    await this._initMainThread(onStatus);
  }

  _initWorker(onStatus) {
    onStatus('Carregando modelo das mãos (modo rápido)…');
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
      const w = new Worker(url);
      this.worker = w;
      const timer = setTimeout(() => reject(new Error('tempo esgotado')), 45000);
      w.onerror = (e) => { clearTimeout(timer); reject(new Error(e.message || 'erro no worker')); };
      w.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'ready') {
          clearTimeout(timer);
          this.delegate = `${m.delegate} worker`;
          this.landmarker = 'worker';
          w.onmessage = (ev) => this._onWorkerMessage(ev.data);
          resolve();
        } else if (m.type === 'error') { clearTimeout(timer); reject(new Error(m.message)); }
      };
      // endereços completos: o worker nasce de um Blob e não entende caminhos relativos
      // (o servidor local troca a CDN por /cdn/...)
      const abs = (u) => new URL(u, location.href).href;
      w.postMessage({ type: 'init', bundleUrl: abs(BUNDLE_CJS), wasmUrl: abs(WASM_URL), modelUrl: abs(MODEL_URL), numHands: H.NUM_HANDS,
        c1: H.MIN_DETECTION_CONF, c2: H.MIN_PRESENCE_CONF, c3: H.MIN_TRACKING_CONF });
    });
  }

  _onWorkerMessage(m) {
    if (m.type === 'result') { this._busy = false; if (m.res) this._workerResult = m; }
  }

  async _initMainThread(onStatus) {
    onStatus('Baixando MediaPipe…');
    const vision = await import('@mediapipe/tasks-vision');
    const fileset = await vision.FilesetResolver.forVisionTasks(WASM_URL);
    const opts = (delegate) => ({
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO',
      numHands: H.NUM_HANDS,
      minHandDetectionConfidence: H.MIN_DETECTION_CONF,
      minHandPresenceConfidence: H.MIN_PRESENCE_CONF,
      minTrackingConfidence: H.MIN_TRACKING_CONF,
    });
    onStatus('Carregando modelo das mãos (GPU)…');
    try {
      this.landmarker = await vision.HandLandmarker.createFromOptions(fileset, opts('GPU'));
      this.delegate = 'GPU';
    } catch (e) {
      console.warn('GPU falhou, usando CPU', e);
      onStatus('GPU indisponível, carregando em CPU…');
      this.landmarker = await vision.HandLandmarker.createFromOptions(fileset, opts('CPU'));
      this.delegate = 'CPU';
    }
  }

  // Chamar todo quadro, depois de atualizar a câmera 3D.
  // Retorna true se houve uma detecção nova neste quadro.
  update(nowMs, camera) {
    this.frame++;
    let fresh = this._pendingFresh || false;
    this._pendingFresh = false;
    const v = this.video;
    const minGap = 1000 / H.MAX_DETECT_HZ;
    // vigia: se o navegador pausou o vídeo da câmera, dá play de novo
    if (this.stream && v.paused && nowMs - (this._replayT || 0) > 1000) {
      this._replayT = nowMs;
      v.play().catch(() => {});
    }
    if (this.worker && this.landmarker) {
      // ---- modo rápido: manda o quadro para o worker e segue desenhando ----
      if (this._busy && nowMs - this._lastSend > 4000) this._busy = false; // quadro perdido
      if (!this._busy && v.readyState >= 2 && v.currentTime !== this.lastVideoTime && nowMs - (this._lastSend || 0) >= minGap) {
        this._busy = true;
        this._lastSend = nowMs;
        this.lastVideoTime = v.currentTime;
        const ts = Math.max(nowMs, this.lastTs + 1);
        this.lastTs = ts;
        const vw = v.videoWidth, vh = v.videoHeight;
        const sc = Math.min(1, (this.maxSide || H.WORKER_MAX_SIDE) / Math.max(vw, vh));
        createImageBitmap(v, { resizeWidth: Math.round(vw * sc), resizeHeight: Math.round(vh * sc), resizeQuality: 'low' })
          .then((bmp) => this.worker.postMessage({ type: 'frame', bitmap: bmp, ts }, [bmp]))
          .catch(() => { this._busy = false; });
      }
      if (this._workerResult) {
        const m = this._workerResult;
        this._workerResult = null;
        this.detectMs = this.detectMs * 0.85 + m.ms * 0.15;
        this._process(m.res, nowMs, camera);
        this.lastResult = m.res;
        fresh = true;
        this._countDetection(nowMs);
      }
    } else if (this.landmarker && v.readyState >= 2 && v.currentTime !== this.lastVideoTime &&
        this.frame % H.DETECT_EVERY_N_FRAMES === 0 && nowMs - (this._lastSend || 0) >= minGap) {
      this._lastSend = nowMs;
      this.lastVideoTime = v.currentTime;
      const ts = Math.max(nowMs, this.lastTs + 1);
      this.lastTs = ts;
      const t0 = performance.now();
      let res = null;
      try { res = this.landmarker.detectForVideo(v, ts); } catch (e) { console.warn(e); }
      const ms = performance.now() - t0;
      this.detectMs = this.detectMs * 0.85 + ms * 0.15;
      if (res) { this._process(res, nowMs, camera); this.lastResult = res; fresh = true; }
      this._countDetection(nowMs);
    }

    // A detecção chega a 15–30/s e a tela roda a ~60: os pontos exibidos
    // deslizam até o alvo a cada quadro, para a mão não andar "aos pulos".
    const dt = Math.min(0.1, Math.max(0, (nowMs - (this._lastUpdate || nowMs)) / 1000));
    this._lastUpdate = nowMs;
    const k = 1 - Math.exp(-dt * H.FOLLOW_RATE);
    for (const h of this.hands) {
      h.visible = nowMs - h.lastSeen < H.LOST_GRACE_MS;
      if (!h.visible) { h.present = false; h.snap = true; continue; }
      for (let i = 0; i < 21; i++) {
        if (h.snap) h.camPts[i].copy(h.targetPts[i]); else h.camPts[i].lerp(h.targetPts[i], k);
        h.worldPts[i].copy(h.camPts[i]).applyMatrix4(camera.matrixWorld);
      }
      h.snap = false;
    }
    return fresh;
  }

  _countDetection(nowMs) {
    this._detCount++;
    if (nowMs - this._detT0 > 1000) {
      this.detectFps = (this._detCount * 1000) / (nowMs - this._detT0);
      this._detCount = 0;
      this._detT0 = nowMs;
    }
  }

  // Injeta um resultado "falso" (usado pelos testes automáticos).
  injectResult(res, nowMs, camera) {
    this._process(res, nowMs, camera);
    this.lastResult = res;
    this._pendingFresh = true;
  }

  _process(res, nowMs, camera) {
    const handed = res.handedness || res.handednesses || [];
    const dets = (res.landmarks || []).map((lm, i) => {
      const cat = handed[i] && handed[i][0];
      const label = cat ? cat.categoryName : 'Left';
      const score = cat ? cat.score : 0.5;
      let isLeft = label === 'Left';
      if (this.calib.flipHandedness) isLeft = !isLeft;
      return { lm, wlm: res.worldLandmarks[i], label, score, pLeft: isLeft ? score : 1 - score, c: { x: lm[9].x, y: lm[9].y } };
    });

    // v20: a MESMA mão detectada duas vezes (uma em cima da outra) vira uma só
    if (dets.length === 2 && Math.hypot(dets[0].c.x - dets[1].c.x, dets[0].c.y - dets[1].c.y) < H.DUP_DIST) {
      dets.splice(dets[0].score >= dets[1].score ? 1 : 0, 1);
    }
    let assigned = this._assign(dets, nowMs);
    // uma mão só, e o rótulo diz há um tempo que ela é a outra: troca
    if (assigned.length === 1 && this._checkSide(assigned[0][0], assigned[0][1])) {
      const [h, d] = assigned[0];
      const o = h.side === 'left' ? this.right : this.left;
      h.lastSeen = -1e9; o.agree = 0.5;
      assigned = [[o, d]];
    }
    for (const h of this.hands) h.present = false;
    for (const [hand, det] of assigned) this._applyDetection(hand, det, nowMs, camera);
    // v20: a mão "pulou" de esquerda para direita: a cópia parada no lugar
    // antigo some na hora (antes ficava meio segundo e virava outra mão)
    for (const h of this.hands) {
      if (h.present || nowMs - h.lastSeen > H.LOST_GRACE_MS) continue;
      for (const [o] of assigned) {
        if (o !== h && Math.hypot(o.lastC.x - h.lastC.x, o.lastC.y - h.lastC.y) < H.GHOST_DIST) { h.lastSeen = -1e9; break; }
      }
    }
  }

  // v22: camada esquerda/direita. Junta 3 pistas:
  //  1) o rótulo do MediaPipe (Left/Right, com a inversão da calibração);
  //  2) o LADO da imagem (a câmera de trás não espelha: mão esquerda
  //     costuma aparecer do lado esquerdo);
  //  3) a continuidade (a mão que estava ali há pouco é a mesma).
  _cost(det, hand, nowMs) {
    const labelCost = hand.side === 'left' ? 1 - det.pLeft : det.pLeft;
    const sideCost = hand.side === 'left' ? det.c.x : 1 - det.c.x; // 0 = bem do lado certo
    let c = labelCost * H.LABEL_WEIGHT + sideCost * H.SIDE_WEIGHT;
    if (nowMs - hand.lastSeen < H.TRACK_MEMORY_MS) {
      c += Math.hypot(det.c.x - hand.lastC.x, det.c.y - hand.lastC.y) * H.POS_WEIGHT;
    } else {
      c += 0.25 * H.POS_WEIGHT * 0.5; // sem memória: rótulo + lado decidem
    }
    return c;
  }

  // v22: se o rótulo do MediaPipe insiste (média de ~1 s) que esta mão é a
  // outra, e a outra não está na tela, a mão é "trocada" de lado.
  _checkSide(hand, det) {
    const agree = hand.side === 'left' ? det.pLeft : 1 - det.pLeft;
    hand.agree = hand.agree == null ? agree : hand.agree + (agree - hand.agree) * H.SIDE_AVG;
    const other = hand.side === 'left' ? this.right : this.left;
    if (hand.agree < H.SWAP_BELOW && !other.visible) { hand.agree = 0.5; return true; }
    return false;
  }

  _assign(dets, nowMs) {
    const L = this.left, R = this.right;
    if (dets.length === 0) return [];
    if (dets.length === 1) {
      const d = dets[0];
      return [[this._cost(d, L, nowMs) <= this._cost(d, R, nowMs) ? L : R, d]];
    }
    const [a, b] = dets;
    const ab = this._cost(a, L, nowMs) + this._cost(b, R, nowMs);
    const ba = this._cost(a, R, nowMs) + this._cost(b, L, nowMs);
    return ab <= ba ? [[L, a], [R, b]] : [[R, a], [L, b]];
  }

  // Converte posição na imagem (0..1) em coordenadas normalizadas da tela (-1..1)
  mapUV(u, v, camera) {
    const reach = this.calib.reach;
    if (reach && reach.uMax - reach.uMin > 0.1 && reach.vMax - reach.vMin > 0.1) {
      const m = H.REACH_MARGIN;
      return {
        x: (((u - reach.uMin) / (reach.uMax - reach.uMin)) * 2 - 1) * m,
        y: -(((v - reach.vMin) / (reach.vMax - reach.vMin)) * 2 - 1) * m,
      };
    }
    // Sem calibração de alcance: imagem "cobrindo" a tela (como object-fit: cover)
    const vw = this.video.videoWidth || H.VIDEO_W;
    const vh = this.video.videoHeight || H.VIDEO_H;
    const va = vw / vh;
    const sa = camera.aspect;
    if (va > sa) {
      const vis = sa / va;
      return { x: (u - 0.5) / (vis / 2), y: -(v - 0.5) / 0.5 };
    }
    const vis = va / sa;
    return { x: (u - 0.5) / 0.5, y: -(v - 0.5) / (vis / 2) };
  }

  depthFromRaw(raw) {
    const { rawNear, rawFar } = this.calib.depth;
    let t = (raw - rawNear) / Math.max(1e-3, rawFar - rawNear);
    t = THREE.MathUtils.clamp(t, -0.3, 1.3);
    return Math.max(0.15, THREE.MathUtils.lerp(H.VIRTUAL_NEAR, H.VIRTUAL_FAR, t));
  }

  _applyDetection(hand, det, nowMs, camera) {
    const { lm, wlm } = det;
    const vw = this.video.videoWidth || H.VIDEO_W;
    const vh = this.video.videoHeight || H.VIDEO_H;
    const m = Math.max(vw, vh);
    const d2 = (a, b) => Math.hypot((lm[a].x - lm[b].x) * vw / m, (lm[a].y - lm[b].y) * vh / m);
    const d3 = (a, b) => Math.hypot(wlm[a].x - wlm[b].x, wlm[a].y - wlm[b].y, wlm[a].z - wlm[b].z);
    const img = d2(0, 5) + d2(0, 17) + d2(5, 17) + d2(0, 9);
    const real = d3(0, 5) + d3(0, 17) + d3(5, 17) + d3(0, 9);
    hand.rawDepth = real / Math.max(img, 1e-4);

    if (nowMs - hand.lastSeen > H.LOST_GRACE_MS) {
      hand.filters.forEach((f) => f.reset());
      hand.anchorFilter.reset();
      hand.depthFilter.reset();
      hand.snap = true;
    }
    hand.lastSeen = nowMs;
    hand.present = true;
    hand.lastC = det.c;
    hand.uv = det.c;
    hand.lm = lm;
    hand.wlm = wlm;
    hand.rawLabel = det.label;
    hand.score = det.score;

    const tSec = nowMs / 1000;
    // 1) posição na tela e profundidade: filtros separados (a profundidade é o mais tremido)
    hand.rawDepthF = hand.depthFilter.filter(hand.rawDepth, tSec);
    let ax, ay, az;
    if (H.MAP_MODE === 'real') {
      // v16: a mão virtual fica no MESMO ângulo da mão de verdade (ângulo de
      // visão da câmera do celular), e a distância vem do tamanho real da mão
      // na imagem. No óculos ela aparece onde a sua mão está.
      const tanL = Math.tan(THREE.MathUtils.degToRad(H.CAM_FOV_LONG) / 2);
      this._p.set((lm[9].x - 0.5) * 2 * tanL * (vw / m), -(lm[9].y - 0.5) * 2 * tanL * (vh / m), 0);
      hand.anchorFilter.filter(this._p, tSec);
      const d = THREE.MathUtils.clamp(hand.rawDepthF / (2 * tanL), H.REAL_NEAR, H.REAL_FAR);
      // posição SEM filtro (para medir a velocidade do soco)
      const dr = THREE.MathUtils.clamp(hand.rawDepth / (2 * tanL), H.REAL_NEAR, 1.2);
      hand.rawPos = hand.rawPos || new THREE.Vector3();
      hand.rawPos.set((lm[9].x - 0.5) * 2 * tanL * (vw / m) * dr, -(lm[9].y - 0.5) * 2 * tanL * (vh / m) * dr, -dr);
      hand.rawT = nowMs;
      ax = this._p.x * d; ay = this._p.y * d; az = -d;
    } else {
      const ndc = this.mapUV(lm[9].x, lm[9].y, camera);
      this._p.set(ndc.x, ndc.y, 0);
      hand.anchorFilter.filter(this._p, tSec);
      const d = this.depthFromRaw(hand.rawDepthF);
      const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      const tanH = tanV * camera.aspect;
      ax = this._p.x * d * tanH; ay = this._p.y * d * tanV; az = -d;
    }
    // 2) forma da mão (dedos) relativa ao centro, com filtro mais leve
    const s = H.HAND_SCALE;
    for (let i = 0; i < 21; i++) {
      this._p.set(
        (wlm[i].x - wlm[9].x) * s,
        -(wlm[i].y - wlm[9].y) * s,
        -(wlm[i].z - wlm[9].z) * s,
      );
      hand.filters[i].filter(this._p, tSec);
      hand.targetPts[i].set(ax + this._p.x, ay + this._p.y, az + this._p.z);
    }
  }
}

// ---------------------------------------------------------------------
// Visual: "luva" sólida — dedos em cilindros afinando até a ponta,
// articulações, palma preenchida e pontas que acendem com o gesto.
// Usa InstancedMesh (poucas chamadas de desenho = leve no celular).
// ---------------------------------------------------------------------
const GESTURE_COLORS = {
  none: 0x6a7a88, neutral: 0x7fe9ff, gun: 0xff9f1a, open: 0x3ddc84, fist: 0xff4d5e, pinch: 0xffe14d,
};
const TIPS = [4, 8, 12, 16, 20];

// raio (m) em cada ponto da mão: dedos afinam do nó até a ponta
const JOINT_R = [
  0.016,                         // pulso
  0.0125, 0.0115, 0.0102, 0.0092, // polegar
  0.0115, 0.0098, 0.0088, 0.0080, // indicador
  0.0118, 0.0100, 0.0090, 0.0082, // médio
  0.0112, 0.0095, 0.0086, 0.0078, // anelar
  0.0102, 0.0085, 0.0077, 0.0070, // mínimo
];

const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _sc = new THREE.Vector3();
const _m = new THREE.Matrix4();

export class HandView {
  constructor(camera, hand) {
    this.hand = hand;
    this.group = new THREE.Group();
    camera.add(this.group);

    const accent = hand.side === 'left' ? 0x3d8bff : 0xff7a1a; // azul = esquerda, laranja = direita
    const glove = new THREE.MeshLambertMaterial({ color: 0x2b3440 });
    this.glove = glove;
    this.jointMat = new THREE.MeshLambertMaterial({ color: 0x3a4654 });
    this.tint = null; // cor da mão inteira (arma: vermelho = pronta, cinza = recarregando)
    this.joints = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), this.jointMat, 21);
    // cilindro com Y de 0 a 1, um pouco mais fino no topo (ponta do dedo)
    const cyl = new THREE.CylinderGeometry(0.88, 1, 1, 10, 1, true);
    cyl.translate(0, 0.5, 0);
    this.bones = new THREE.InstancedMesh(cyl, glove, BONES.length);
    this.tipMat = new THREE.MeshBasicMaterial({ color: GESTURE_COLORS.neutral });
    this.tips = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), this.tipMat, TIPS.length);
    for (const im of [this.joints, this.bones, this.tips]) {
      im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(im);
    }

    // palma: leque de triângulos entre pulso e bases dos dedos
    this.palmIdx = [0, 1, 5, 9, 13, 17];
    this.palmPos = new Float32Array((this.palmIdx.length + 1) * 3);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(this.palmPos, 3));
    const idx = [];
    for (let i = 1; i < this.palmIdx.length; i++) idx.push(0, i, i + 1);
    idx.push(0, this.palmIdx.length, 1);
    pg.setIndex(idx);
    this.palmMat = new THREE.MeshLambertMaterial({ color: 0x2b3440, side: THREE.DoubleSide });
    this.palm = new THREE.Mesh(pg, this.palmMat);
    this.palm.frustumCulled = false;
    this.group.add(this.palm);

    // pulseira colorida (identifica esquerda/direita)
    this.band = new THREE.Mesh(new THREE.TorusGeometry(1, 0.22, 8, 20), new THREE.MeshBasicMaterial({ color: accent }));
    this.group.add(this.band);
    this.group.visible = false;
  }

  update() {
    const h = this.hand;
    this.group.visible = h.visible;
    this.band.visible = !CONFIG.ROLES.ON; // com papéis, a cor da mão inteira já diz quem é quem
    if (!h.visible) return;
    const P = h.camPts;

    for (let i = 0; i < 21; i++) {
      const r = JOINT_R[i] * 1.08;
      _m.compose(P[i], _q.identity(), _sc.set(r, r, r));
      this.joints.setMatrixAt(i, _m);
    }
    BONES.forEach(([a, b], k) => {
      _dir.subVectors(P[b], P[a]);
      const len = _dir.length();
      if (len < 1e-5) { _m.makeScale(0, 0, 0); this.bones.setMatrixAt(k, _m); return; }
      _q.setFromUnitVectors(_up, _dir.divideScalar(len));
      const r = JOINT_R[b];
      _m.compose(P[a], _q, _sc.set(r, len, r));
      this.bones.setMatrixAt(k, _m);
    });
    TIPS.forEach((i, k) => {
      const r = JOINT_R[i] * (i === 4 || i === 8 ? 1.2 : 1.0);
      _m.compose(P[i], _q.identity(), _sc.set(r, r, r));
      this.tips.setMatrixAt(k, _m);
    });
    this.joints.instanceMatrix.needsUpdate = true;
    this.bones.instanceMatrix.needsUpdate = true;
    this.tips.instanceMatrix.needsUpdate = true;
    this.tipMat.color.setHex(this.tint ?? (GESTURE_COLORS[h.gesture] || GESTURE_COLORS.neutral));
    if (this.tint !== this._tint) {
      this._tint = this.tint;
      const t = this.tint;
      this.glove.color.setHex(t ?? 0x2b3440);
      this.palmMat.color.setHex(t ?? 0x2b3440);
      this.jointMat.color.setHex(t != null ? new THREE.Color(t).multiplyScalar(1.2).getHex() : 0x3a4654);
      this.glove.emissive.setHex(t != null ? new THREE.Color(t).multiplyScalar(0.35).getHex() : 0);
      this.palmMat.emissive.copy(this.glove.emissive);
    }

    // palma
    _mid.set(0, 0, 0);
    this.palmIdx.forEach((i) => _mid.add(P[i]));
    _mid.multiplyScalar(1 / this.palmIdx.length);
    this.palmPos.set([_mid.x, _mid.y, _mid.z], 0);
    this.palmIdx.forEach((i, k) => this.palmPos.set([P[i].x, P[i].y, P[i].z], (k + 1) * 3));
    this.palm.geometry.attributes.position.needsUpdate = true;
    this.palm.geometry.computeVertexNormals();

    // pulseira: no pulso, de frente para o antebraço
    _dir.subVectors(P[9], P[0]).normalize();
    this.band.position.copy(P[0]).addScaledVector(_dir, -0.012);
    this.band.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _dir);
    this.band.scale.setScalar(0.02);
  }
}
