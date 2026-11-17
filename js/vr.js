// Modo óculos (VR de celular): tela dividida com correção da curvatura da
// lente, ajustes salvos no aparelho e um painel 3D com as informações do
// jogo (no óculos não dá para ver o HUD da tela).
import * as THREE from 'three';
import { CONFIG } from './config.js';

const VR_KEY = 'cacador-sinal-vr-v1';

export function defaultVrSettings() {
  return {
    fov: 90,          // campo de visão vertical de cada olho (graus)
    ipd: 0.064,       // distância entre os olhos no mundo 3D (m)
    lensOffset: 0,    // afasta (+) ou aproxima (−) o centro das imagens (fração da metade da tela)
    lensY: 0,         // sobe (+) ou desce (−) as imagens
    k1: 0.28,         // curvatura da lente
    k2: 0.12,
    zoom: 0.82,       // tamanho da imagem dentro da lente
    distortion: true, // corrigir curvatura
  };
}

export function loadVrSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(VR_KEY) || 'null');
    return { ...defaultVrSettings(), ...(s || {}) };
  } catch (e) { return defaultVrSettings(); }
}

export function saveVrSettings(s) {
  try { localStorage.setItem(VR_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
}

// Pré-distorção "barril" para compensar a lente (que distorce em almofada).
const DISTORT_FRAG = `
uniform sampler2D tex;
uniform vec2 center;
uniform float k1, k2, zoom, aspect, enabled;
varying vec2 vUv;
void main() {
  vec2 p = vUv - center;
  p.x *= aspect;
  float r2 = dot(p, p);
  float f = enabled > 0.5 ? (1.0 + k1 * r2 + k2 * r2 * r2) : 1.0;
  vec2 q = p * f * zoom;
  q.x /= aspect;
  vec2 uv = q + vec2(0.5);
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  gl_FragColor = texture2D(tex, uv);
}`;

export class VRView {
  constructor(renderer, settings) {
    this.renderer = renderer;
    this.settings = settings;
    this.stereo = new THREE.StereoCamera();
    this.rt = new THREE.WebGLRenderTarget(16, 16, { depthBuffer: true });
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tex: { value: this.rt.texture }, center: { value: new THREE.Vector2(0.5, 0.5) },
        k1: { value: 0 }, k2: { value: 0 }, zoom: { value: 1 }, aspect: { value: 1 }, enabled: { value: 1 },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: DISTORT_FRAG,
      depthTest: false,
      depthWrite: false,
    });
    this.quadScene = new THREE.Scene();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    quad.frustumCulled = false;
    this.quadScene.add(quad);
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this._size = new THREE.Vector2();
  }

  // Ajusta a câmera para um olho (metade da tela).
  applyCamera(camera, w, h) {
    camera.fov = this.settings.fov;
    camera.aspect = w / 2 / h;
    camera.updateProjectionMatrix();
  }

  render(scene, camera) {
    const r = this.renderer;
    const s = this.settings;
    r.getDrawingBufferSize(this._size);
    const W = this._size.x, Hh = this._size.y;
    const ew = Math.floor(W / 2);
    if (this.rt.width !== ew || this.rt.height !== Hh) this.rt.setSize(ew, Hh);

    this.stereo.eyeSep = s.ipd;
    camera.updateMatrixWorld();
    this.stereo.update(camera);
    const u = this.mat.uniforms;
    u.k1.value = s.k1; u.k2.value = s.k2; u.zoom.value = s.zoom;
    u.aspect.value = ew / Hh; u.enabled.value = s.distortion ? 1 : 0;

    const pr = r.getPixelRatio();
    const eyes = [[this.stereo.cameraL, 0, +1], [this.stereo.cameraR, ew, -1]];
    for (const [cam, x, dir] of eyes) {
      r.setRenderTarget(this.rt);
      r.setScissorTest(false);
      r.clear();
      r.render(scene, cam);
      r.setRenderTarget(null);
      // centro da lente: dir=+1 (olho esquerdo) desloca para a direita com lensOffset>0
      u.center.value.set(0.5 - dir * s.lensOffset * 0.5, 0.5 - s.lensY * 0.5);
      r.setScissorTest(true);
      r.setScissor(x / pr, 0, ew / pr, Hh / pr);
      r.setViewport(x / pr, 0, ew / pr, Hh / pr);
      r.render(this.quadScene, this.quadCam);
    }
    r.setScissorTest(false);
  }

  dispose() { this.rt.dispose(); }
}

// ---------------------------------------------------------------------
// Painel 3D (aparece só no modo óculos): tempo, caixas, sinal e mensagens.
// ---------------------------------------------------------------------
export class HUD3D {
  constructor(camera) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 160;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.1375), mat);
    this.mesh.position.set(0, 0.13, -0.6);
    this.mesh.renderOrder = 50;
    this.mesh.visible = false;
    camera.add(this.mesh);
    this._key = '';
    this.message = '';
    this.messageUntil = 0;
  }

  show(on) { this.mesh.visible = on; }

  toast(msg) { this.message = msg; this.messageUntil = performance.now() + 2500; }

  // info: { timer, count, dist, arrowAngle, up }
  update(info) {
    if (!this.mesh.visible) return;
    const now = performance.now();
    const msg = now < this.messageUntil ? this.message : '';
    const key = `${info.timer}|${info.count}|${info.dist}|${Math.round((info.arrowAngle || 0) * 20)}|${info.up}|${msg}`;
    if (key === this._key) return;
    this._key = key;
    const c = this.ctx, W = this.canvas.width, H = this.canvas.height;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(8,14,20,0.72)';
    roundRect(c, 4, 4, W - 8, 74, 30);
    c.fill();
    c.fillStyle = '#ffffff';
    c.font = 'bold 40px system-ui, sans-serif';
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    c.fillText(info.timer || '', 26, 42);
    c.textAlign = 'center';
    c.fillText(info.count || '', W * 0.47, 42);
    if (info.dist) {
      c.save();
      c.translate(W - 160, 42);
      c.rotate(info.arrowAngle || 0);
      c.fillStyle = '#00e5ff';
      c.beginPath(); c.moveTo(0, -20); c.lineTo(14, 14); c.lineTo(0, 6); c.lineTo(-14, 14); c.closePath(); c.fill();
      c.restore();
      c.textAlign = 'left';
      c.fillStyle = '#ffffff';
      c.font = 'bold 32px system-ui, sans-serif';
      c.fillText(info.dist + (info.up ? ' ↑' : ''), W - 128, 42);
    }
    if (msg) {
      c.font = '28px system-ui, sans-serif';
      c.fillStyle = 'rgba(8,14,20,0.72)';
      const tw = Math.min(W - 8, c.measureText(msg).width + 40);
      roundRect(c, (W - tw) / 2, 90, tw, 56, 24);
      c.fill();
      c.fillStyle = '#ffffff';
      c.textAlign = 'center';
      c.fillText(msg, W / 2, 118, W - 30);
    }
    this.tex.needsUpdate = true;
  }
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

// Alvo de teste (cruz + quadriculado) para ajustar o óculos.
export function makeTestPattern() {
  const g = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color: 0x00e5ff, depthTest: false });
  const pts = [];
  const N = 8, S = 0.15;
  for (let i = -N; i <= N; i++) {
    pts.push(new THREE.Vector3(i * S, -N * S, 0), new THREE.Vector3(i * S, N * S, 0));
    pts.push(new THREE.Vector3(-N * S, i * S, 0), new THREE.Vector3(N * S, i * S, 0));
  }
  const grid = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), mat);
  grid.renderOrder = 60;
  const cross = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.08, 32), new THREE.MeshBasicMaterial({ color: 0xff3355, depthTest: false }));
  cross.renderOrder = 61;
  g.add(grid, cross);
  g.position.set(0, 0.45, -2); // um pouco acima do centro: o painel de ajuste fica embaixo
  g.visible = false;
  return g;
}

