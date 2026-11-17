// Caçador de Sinal — protótipo. Loop principal e estados do jogo.
// Estados: boot -> calibration -> tutorial -> playing -> ended
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { buildWorld, animateTargets } from './scene.js';
import { OrientationController } from './orientation.js';
import { HandTracker, HandView } from './hands.js';
import { updateHandGesture } from './gestures.js';
import { Teleport } from './teleport.js';
import { Interaction } from './interaction.js';
import { CalibrationFlow, defaultCalib, loadCalib } from './calibration.js';
import { DebugUI } from './debug.js';

class App {
  constructor() {
    this.calib = loadCalib() || defaultCalib();
    this.state = 'boot';
    this.stereo = false;
    this.devicesReady = false;
    this.lastError = '';

    const canvas = document.getElementById('gl');
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CONFIG.CAMERA_FOV, 1, 0.03, 80);
    this.camera.position.y = CONFIG.EYE_HEIGHT;
    this.rig = new THREE.Group();
    this.rig.add(this.camera);
    this.scene.add(this.rig);
    this.stereoCam = new THREE.StereoCamera();
    this.stereoCam.eyeSep = CONFIG.STEREO_IPD;

    this.world = buildWorld(this.scene);
    this.rig.position.copy(this.world.spawn);
    this.orientation = new OrientationController(this.camera);
    this.hands = new HandTracker(this.calib);
    this.handViews = [new HandView(this.camera, this.hands.left), new HandView(this.camera, this.hands.right)];

    this.tutorial = { teleport: false, touch: false, wire: false };
    this.teleport = new Teleport(this.scene, this.rig, this.camera, this.world, {
      onTeleport: () => { if (this.state === 'tutorial' && !this.tutorial.teleport) { this.tutorial.teleport = true; this._refreshTutorial(); } },
      onFail: (msg) => this.toast(`Teleporte: ${msg}`),
    });
    this.interaction = new Interaction(this.scene, this.camera, this.world, {
      onOpen: () => {
        this.toast('Caixa aberta! Conecte os fios.');
        if (this.state === 'tutorial' && !this.tutorial.touch) { this.tutorial.touch = true; this._refreshTutorial(); }
      },
      onWire: (ok, why) => this.toast(ok ? 'Fio conectado ✔' : `Não encaixou (${why})`),
      onFixed: () => this._onFixed(),
    });
    this.debug = new DebugUI(this);
    this.calibration = new CalibrationFlow(this);

    this.mouse = new Map();      // ponteiros de toque/mouse na tela
    this.prevDown = new Map();   // id -> estava pegando no quadro anterior
    this.timeLeft = CONFIG.GAME_TIME_S;
    this._v = new THREE.Vector3();
    this._wireCanvasPointers();
    window.addEventListener('resize', () => this.resize());
    this.resize();

    this._last = performance.now();
    this.renderer.setAnimationLoop(() => this._loop());
    this.calibration.welcome();
    window.__app = this; // para depuração no console / testes
  }

  locoSide() { return this.calib.locomotion; }
  interSide() { return this.calib.locomotion === 'left' ? 'right' : 'left'; }

  // ---------------------------------------------------------------
  // Permissões / dispositivos
  // ---------------------------------------------------------------
  async initDevices(onStatus, withCamera = true) {
    if (!this.sensorsReady) {
      onStatus('Pedindo acesso aos sensores de movimento…');
      const perm = await this.orientation.requestPermission();
      const src = await this.orientation.start('auto');
      onStatus(`Sensores: ${perm ? src : 'permissão negada'}`);
      try { if (navigator.wakeLock) this.wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* opcional */ }
      this.sensorsReady = true;
    }
    if (!withCamera || this.hands.landmarker) { this.devicesReady = true; return true; }
    try {
      onStatus('Pedindo acesso à câmera traseira…');
      if (!this.hands.stream) await this.hands.startCamera();
    } catch (e) {
      this.lastError = `Câmera: ${e.message || e.name}`;
      onStatus(`<span class="bad">${this.lastError}</span>`);
      return false;
    }
    try {
      await this.hands.loadModel((m) => onStatus(m));
    } catch (e) {
      this.lastError = `MediaPipe: ${e.message || e}`;
      onStatus(`<span class="bad">${this.lastError}</span>`);
      return false;
    }
    onStatus(`Pronto (${this.hands.delegate}).`);
    this.devicesReady = true;
    return true;
  }

  // ---------------------------------------------------------------
  // Fluxo do jogo
  // ---------------------------------------------------------------
  _resetWorld() {
    this.interaction.reset();
    this.teleport.cancel();
    this.teleport.lastJump = -1e9;
    this.teleport.jumps = 0;
    this.rig.position.copy(this.world.spawn);
    this.orientation.recenter();
  }

  startTutorial() {
    this.state = 'tutorial';
    this._resetWorld();
    this.interaction.mode = 'tutorial';
    this.tutorial = { teleport: false, touch: false, wire: false };
    this._refreshTutorial();
    document.body.classList.remove('playing');
  }

  _refreshTutorial() { if (this.state === 'tutorial') this.calibration.showTutorial(this.tutorial); }

  startGame() {
    this.calibration.hide();
    this.state = 'playing';
    this._resetWorld();
    this.interaction.mode = 'game';
    this.timeLeft = CONFIG.GAME_TIME_S;
    this.gameStart = performance.now();
    document.body.classList.add('playing');
    this.toast('Valendo! Siga o detector de sinal.');
  }

  _gameTargets() { return this.world.targets.filter((t) => !t.tutorial); }

  _onFixed() {
    if (this.state === 'tutorial') {
      this.tutorial.wire = true;
      this._refreshTutorial();
      this.toast('Caixa consertada! Tutorial completo.');
      return;
    }
    const all = this._gameTargets();
    const fixed = all.filter((t) => t.state === 'fixed').length;
    this.toast(`Sinal restaurado! ${fixed}/${all.length}`);
    if (fixed === all.length) this.endGame(true);
  }

  endGame(win) {
    if (this.state !== 'playing') return;
    this.state = 'ended';
    this.teleport.cancel();
    this.interaction.closePanel();
    document.body.classList.remove('playing');
    const all = this._gameTargets();
    const fixed = all.filter((t) => t.state === 'fixed').length;
    const used = (performance.now() - this.gameStart) / 1000;
    const c = this.calibration;
    c._show(win ? '🎉 Rede restaurada!' : '⏰ O tempo acabou', `
      <p>${win ? 'Você consertou todos os pontos de sinal.' : 'A rede caiu antes de você consertar tudo.'}</p>
      <p>Caixas consertadas: <b>${fixed}/${all.length}</b><br>Tempo: <b>${fmtTime(Math.min(used, CONFIG.GAME_TIME_S))}</b><br>Teleportes: <b>${this.teleport.jumps}</b></p>`, [
      { label: 'Jogar de novo', cls: 'primary', onClick: () => this.startGame() },
      { label: 'Tutorial', onClick: () => this.startTutorial() },
      { label: 'Recalibrar', onClick: () => this.recalibrate() },
    ]);
  }

  recalibrate() {
    document.body.classList.remove('playing');
    Object.assign(this.calib, defaultCalib());
    this.state = 'calibration';
    this.interaction.closePanel();
    this.teleport.hide();
    if (this.devicesReady && this.hands.landmarker) { this.setDebug(true); this.calibration.stepRecenter(); } else this.calibration.welcome();
  }

  setDebug(on) { this.debug.setEnabled(on); }

  toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => el.classList.remove('show'), 2200);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = this.stereo ? w / 2 / h : w / h;
    this.camera.updateProjectionMatrix();
  }

  // Mouse/toque na tela: arrasta fios do painel; sem sensor, gira a visão.
  _wireCanvasPointers() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      this.mouse.set(e.pointerId, { id: `m${e.pointerId}`, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, down: true, lx: e.clientX, ly: e.clientY });
    });
    c.addEventListener('pointermove', (e) => {
      const p = this.mouse.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.lx, dy = e.clientY - p.ly;
      p.lx = e.clientX; p.ly = e.clientY; p.x = e.clientX; p.y = e.clientY;
      if (!this.interaction.grabs.has(p.id) && !this.orientation.hasData) this.orientation.addManual(dx, dy);
    });
    const up = (e) => { const p = this.mouse.get(e.pointerId); if (p) p.down = false; };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
  }

  // ---------------------------------------------------------------
  // Loop
  // ---------------------------------------------------------------
  _loop() {
    const now = performance.now();
    const dtMs = Math.min(100, now - this._last);
    this._last = now;
    const dt = dtMs / 1000;
    const input = this.debug.input;

    // 1) cabeça
    this.orientation.update();
    if (input.move.f || input.move.r) this._debugWalk(dt, input.move);
    this.rig.updateMatrixWorld(true);

    // 2) mãos + gestos
    const fresh = this.hands.update(now, this.camera);
    for (const h of this.hands.hands) {
      if (fresh || !h.visible) updateHandGesture(h, this.calib.thresholds, now);
    }
    for (const v of this.handViews) v.update();

    const active = this.state === 'tutorial' || this.state === 'playing';
    const loco = this.hands.get(this.locoSide());
    const inter = this.hands.get(this.interSide());

    // 3) teleporte
    if (active) this.teleport.update(now, loco, input.aim || input.keyAim);
    else this.teleport.hide();

    // 4) interação: tocar, painel, detector
    if (active) {
      if (inter.visible && inter.present) this.interaction.checkTouch(inter.worldPts[8]);
      this.interaction.updatePanel(this._collectPointers(), window.innerWidth, window.innerHeight, now);
      this.interaction.updateDetector(inter);
    } else {
      this.interaction.detector.group.visible = false;
    }
    animateTargets(this.world.targets, dt, now / 1000);

    // 5) tempo
    if (this.state === 'playing') {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) { this.timeLeft = 0; this.endGame(false); }
    }
    this._updateHud(active);

    // 6) render
    this._render();
    this.debug.frame(now, dtMs);
  }

  _collectPointers() {
    const list = [];
    const w = window.innerWidth, h = window.innerHeight;
    for (const hand of this.hands.hands) {
      if (!hand.visible) continue;
      this._v.copy(hand.worldPts[4]).lerp(hand.worldPts[8], 0.5).project(this.camera);
      if (this._v.z > 1) continue;
      list.push({ id: `hand-${hand.side}`, x: (this._v.x * 0.5 + 0.5) * w, y: (-this._v.y * 0.5 + 0.5) * h, down: hand.gesture === 'pinch' || hand.gesture === 'fist' });
    }
    const input = this.debug.input;
    if (input.pinch || input.fist) list.push({ id: 'cross', x: w / 2, y: h / 2, down: true });
    for (const [pid, p] of this.mouse) {
      list.push({ id: p.id, x: p.x, y: p.y, sx: p.sx, sy: p.sy, down: p.down });
      if (!p.down) this.mouse.delete(pid);
    }
    for (const p of list) p.wasDown = this.prevDown.get(p.id) || false;
    this.prevDown.clear();
    for (const p of list) this.prevDown.set(p.id, p.down);
    return list;
  }

  _debugWalk(dt, move) {
    const fwd = this.camera.getWorldDirection(this._v);
    fwd.y = 0; fwd.normalize();
    const nx = this.rig.position.x + (fwd.x * move.f - fwd.z * move.r) * 2 * dt;
    const nz = this.rig.position.z + (fwd.z * move.f + fwd.x * move.r) * 2 * dt;
    if (this.world.isFree(nx, nz, 0.25)) this.rig.position.set(nx, 0, nz);
  }

  _updateHud(active) {
    const hud = document.getElementById('hud');
    hud.classList.toggle('active', active);
    if (!active) return;
    const tl = document.getElementById('timer');
    if (this.state === 'playing') {
      tl.textContent = fmtTime(this.timeLeft);
      tl.classList.toggle('urgent', this.timeLeft < 30);
      const all = this._gameTargets();
      document.getElementById('count').textContent = `📡 ${all.filter((t) => t.state === 'fixed').length}/${all.length}`;
    } else {
      tl.textContent = 'tutorial';
      document.getElementById('count').textContent = '';
    }
    // bússola do detector (ajuda quando a mão de interação não está visível)
    const near = this.interaction.nearest;
    const comp = document.getElementById('compass');
    if (!near) { comp.hidden = true; } else {
      comp.hidden = false;
      const local = this.camera.worldToLocal(this._v.copy(near.target.center));
      const ang = Math.atan2(local.x, -local.z);
      document.getElementById('compass-arrow').style.transform = `rotate(${ang}rad)`;
      const up = local.y > 0.6 && near.dist < 5 ? ' ↑ olhe para cima' : '';
      document.getElementById('compass-text').textContent = `${near.dist.toFixed(1)} m${up}`;
    }
    const input = this.debug.input;
    document.getElementById('crosshair').classList.toggle('on', input.pinch || input.fist || input.aim);
  }

  _render() {
    const r = this.renderer;
    if (!this.stereo) { r.setScissorTest(false); r.render(this.scene, this.camera); return; }
    const size = r.getSize(new THREE.Vector2());
    this.camera.updateMatrixWorld();
    this.stereoCam.update(this.camera);
    r.setScissorTest(true);
    r.setScissor(0, 0, size.x / 2, size.y); r.setViewport(0, 0, size.x / 2, size.y);
    r.render(this.scene, this.stereoCam.cameraL);
    r.setScissor(size.x / 2, 0, size.x / 2, size.y); r.setViewport(size.x / 2, 0, size.x / 2, size.y);
    r.render(this.scene, this.stereoCam.cameraR);
    r.setScissorTest(false);
  }
}

function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

try {
  new App();
} catch (e) {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<div class="fatal">Erro ao iniciar: ${e.message}</div>`);
}
