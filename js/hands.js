// Rastreamento das mãos com MediaPipe Hand Landmarker (câmera traseira).
// - Atribui cada detecção à mão ESQUERDA ou DIREITA com estabilização
//   (rótulo do MediaPipe + continuidade de posição), para não trocar quando
//   a mão some por alguns quadros.
// - Recria a mão no espaço da câmera 3D (esqueleto de esferas e linhas),
//   usando a posição na imagem + estimativa de profundidade pelo tamanho.
// - Suaviza com filtro One Euro.
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { OneEuro3 } from './filters.js';

const MP_VERSION = '0.10.14';
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

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
    this.filters = Array.from({ length: 21 }, () => new OneEuro3(CONFIG.FILTER));
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
    if (this.landmarker && v.readyState >= 2 && v.currentTime !== this.lastVideoTime &&
        this.frame % H.DETECT_EVERY_N_FRAMES === 0) {
      this.lastVideoTime = v.currentTime;
      const ts = Math.max(nowMs, this.lastTs + 1);
      this.lastTs = ts;
      const t0 = performance.now();
      let res = null;
      try { res = this.landmarker.detectForVideo(v, ts); } catch (e) { console.warn(e); }
      const ms = performance.now() - t0;
      this.detectMs = this.detectMs * 0.85 + ms * 0.15;
      if (res) { this._process(res, nowMs, camera); this.lastResult = res; fresh = true; }
      this._detCount++;
      if (nowMs - this._detT0 > 1000) {
        this.detectFps = (this._detCount * 1000) / (nowMs - this._detT0);
        this._detCount = 0;
        this._detT0 = nowMs;
      }
    }

    for (const h of this.hands) {
      h.visible = nowMs - h.lastSeen < H.LOST_GRACE_MS;
      if (!h.visible) { h.present = false; continue; }
      for (let i = 0; i < 21; i++) h.worldPts[i].copy(h.camPts[i]).applyMatrix4(camera.matrixWorld);
    }
    return fresh;
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

    const assigned = this._assign(dets, nowMs);
    for (const h of this.hands) h.present = false;
    for (const [hand, det] of assigned) this._applyDetection(hand, det, nowMs, camera);
  }

  _cost(det, hand, nowMs) {
    const labelCost = hand.side === 'left' ? 1 - det.pLeft : det.pLeft;
    let c = labelCost * H.LABEL_WEIGHT;
    if (nowMs - hand.lastSeen < H.TRACK_MEMORY_MS) {
      c += Math.hypot(det.c.x - hand.lastC.x, det.c.y - hand.lastC.y) * H.POS_WEIGHT;
    } else {
      c += 0.25 * H.POS_WEIGHT * 0.5; // sem memória: só o rótulo decide
    }
    return c;
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

    if (nowMs - hand.lastSeen > H.LOST_GRACE_MS) hand.filters.forEach((f) => f.reset());
    hand.lastSeen = nowMs;
    hand.present = true;
    hand.lastC = det.c;
    hand.uv = det.c;
    hand.lm = lm;
    hand.wlm = wlm;
    hand.rawLabel = det.label;
    hand.score = det.score;

    const ndc = this.mapUV(lm[9].x, lm[9].y, camera);
    const d = this.depthFromRaw(hand.rawDepth);
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const tanH = tanV * camera.aspect;
    const ax = ndc.x * d * tanH, ay = ndc.y * d * tanV, az = -d;
    const s = H.HAND_SCALE;
    const tSec = nowMs / 1000;
    for (let i = 0; i < 21; i++) {
      this._p.set(
        ax + (wlm[i].x - wlm[9].x) * s,
        ay - (wlm[i].y - wlm[9].y) * s,
        az - (wlm[i].z - wlm[9].z) * s,
      );
      hand.filters[i].filter(this._p, tSec);
      hand.camPts[i].copy(this._p);
    }
  }
}

// ---------------------------------------------------------------------
// Visual: esqueleto de esferas + linhas, preso à câmera.
// ---------------------------------------------------------------------
const GESTURE_COLORS = {
  none: 0x888888, neutral: 0xffffff, gun: 0xff9f1a, open: 0x2ecc40, fist: 0xff3b3b, pinch: 0xffe600,
};

export class HandView {
  constructor(camera, hand) {
    this.hand = hand;
    this.group = new THREE.Group();
    camera.add(this.group);
    const base = hand.side === 'left' ? 0x3d8bff : 0xff7a1a;
    const jointMat = new THREE.MeshBasicMaterial({ color: base });
    const geo = new THREE.SphereGeometry(0.008, 8, 6);
    const tipGeo = new THREE.SphereGeometry(0.012, 10, 8);
    this.joints = [];
    for (let i = 0; i < 21; i++) {
      const isTip = i === 4 || i === 8;
      const mesh = new THREE.Mesh(isTip ? tipGeo : geo, isTip ? new THREE.MeshBasicMaterial({ color: 0xffffff }) : jointMat);
      this.group.add(mesh);
      this.joints.push(mesh);
    }
    this.palm = new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.group.add(this.palm);
    this.linePos = new Float32Array(BONES.length * 6);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(this.linePos, 3));
    this.lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: base }));
    this.lines.frustumCulled = false;
    this.group.add(this.lines);
    this.group.visible = false;
  }

  update() {
    const h = this.hand;
    this.group.visible = h.visible;
    if (!h.visible) return;
    for (let i = 0; i < 21; i++) this.joints[i].position.copy(h.camPts[i]);
    this.palm.position.copy(h.camPts[0]);
    this.palm.material.color.setHex(GESTURE_COLORS[h.gesture] || 0xffffff);
    let k = 0;
    for (const [a, b] of BONES) {
      const pa = h.camPts[a], pb = h.camPts[b];
      this.linePos[k++] = pa.x; this.linePos[k++] = pa.y; this.linePos[k++] = pa.z;
      this.linePos[k++] = pb.x; this.linePos[k++] = pb.y; this.linePos[k++] = pb.z;
    }
    this.lines.geometry.attributes.position.needsUpdate = true;
  }
}
