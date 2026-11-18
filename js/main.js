// Caçador de Sinal — protótipo. Loop principal e estados do jogo.
// Estados: boot -> calibration -> tutorial -> playing -> ended
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { buildWorld, animateTargets, placeTargets } from './scene.js';
import { OrientationController } from './orientation.js';
import { HandTracker, HandView } from './hands.js';
import { updateHandGesture } from './gestures.js';
import { Teleport } from './teleport.js';
import { Runner } from './locomotion.js';
import { Interaction } from './interaction.js';
import { CalibrationFlow, defaultCalib, loadCalib } from './calibration.js';
import { DebugUI } from './debug.js';
import { VRView, HUD3D, loadVrSettings, makeTestPattern } from './vr.js';
import { Sfx } from './audio.js';
import { loadOptions, saveOptions } from './options.js';
import { HandHint } from './handhint.js';
import { addResult, rename, rankingTable } from './ranking.js';

class App {
  constructor() {
    this.calib = loadCalib() || defaultCalib();
    this.options = loadOptions();
    this.sfx = new Sfx(this.options);
    this.state = 'boot';
    this.stereo = false;
    this.devicesReady = false;
    this.lastError = '';

    const canvas = document.getElementById('gl');
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    // resolução de render: começa em QUALITY.PIXEL_RATIO e se ajusta sozinha pelo FPS
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, CONFIG.QUALITY.PIXEL_RATIO);
    this.renderer.setPixelRatio(this.pixelRatio);
    this._q = { t0: performance.now(), frames: 0, low: 0, high: 0 };
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CONFIG.CAMERA_FOV, 1, 0.03, 80);
    // rig (posição no chão) -> eye (altura dos olhos / recentrar no WebXR) -> câmera
    this.rig = new THREE.Group();
    this.eye = new THREE.Group();
    this.eye.position.y = CONFIG.EYE_HEIGHT;
    this.rig.add(this.eye);
    this.eye.add(this.camera);
    this.scene.add(this.rig);
    this.locoMode = CONFIG.LOCOMOTION;
    document.body.classList.add(`mode-${this.locoMode}`);
    this.xrSupported = false;
    this.xrActive = false;
    this.renderer.xr.enabled = true;
    this.renderer.xr.setReferenceSpaceType('local');
    if (navigator.xr && navigator.xr.isSessionSupported) {
      navigator.xr.isSessionSupported('immersive-vr').then((ok) => { this.xrSupported = ok; }).catch(() => {});
    }
    this.vrSettings = loadVrSettings();
    this.vr = new VRView(this.renderer, this.vrSettings);
    this.hud3d = new HUD3D(this.camera);
    this.testPattern = makeTestPattern();
    this.camera.add(this.testPattern);
    this.vignette = makeVignette();
    this.camera.add(this.vignette);
    this.vignetteK = 0;

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
    this.runner = new Runner(this.rig, this.eye, this.camera, this.world, {
      onMove: (d) => { if (this.state === 'tutorial' && !this.tutorial.teleport && d > 2) { this.tutorial.teleport = true; this._refreshTutorial(); } },
    });
    this.interaction = new Interaction(this.scene, this.camera, this.world, {
      onOpen: (t) => {
        this.sfx.open();
        const n = t.panelWires || t.wires;
        this.toast(n >= 5 ? `Caixa difícil: ${n} fios, com cores repetidas!` : `Caixa aberta! Conecte ${n === 1 ? 'o fio' : `os ${n} fios`}.`);
        if (this.state === 'tutorial' && !this.tutorial.touch) { this.tutorial.touch = true; this._refreshTutorial(); }
      },
      onWire: (ok, why) => { this.sfx.wire(ok); this.toast(ok ? 'Fio conectado ✔' : `Não encaixou (${why})`); },
      onGrab: () => this.sfx.grab(),
      wireCount: (t) => this._wireCount(t),
      onFixed: () => this._onFixed(),
    });
    this.handHint = new HandHint(this);
    this.debug = new DebugUI(this);
    this.calibration = new CalibrationFlow(this);

    this.mouse = new Map();      // ponteiros de toque/mouse na tela
    this.prevDown = new Map();   // id -> estava pegando no quadro anterior
    this.timeLeft = this.gameTime();
    this._v = new THREE.Vector3();
    this.applyOptions();
    // a tela apaga quando o app sai da frente: pede de novo ao voltar
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.requestWakeLock(); });
    document.addEventListener('fullscreenchange', () => this.requestWakeLock());
    this._wireCanvasPointers();
    window.addEventListener('resize', () => this.resize());
    if (screen.orientation) screen.orientation.addEventListener('change', () => { if (this.stereo) setTimeout(() => this.recenter(), 600); });
    this.resize();

    this._last = performance.now();
    this.renderer.setAnimationLoop(() => this._loop());
    this.calibration.welcome();
    window.__app = this; // para depuração no console / testes
    registerServiceWorker();
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
      try { if (typeof DeviceMotionEvent !== 'undefined' && DeviceMotionEvent.requestPermission) await DeviceMotionEvent.requestPermission(); } catch (e) { /* */ }
      this.runner.startSensors();
      const src = await this.orientation.start('auto');
      onStatus(`Sensores: ${perm ? src : 'permissão negada'}`);
      this.sensorsReady = true;
      this.requestWakeLock();
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

  // Mantém a tela acesa. O Chrome solta a trava quando a aba sai da frente,
  // então isto é chamado de novo ao voltar (visibilitychange).
  async requestWakeLock() {
    if (!navigator.wakeLock || !this.sensorsReady || document.visibilityState !== 'visible') return;
    if (this.wakeLock && !this.wakeLock.released) return;
    try {
      this.wakeLock = await navigator.wakeLock.request('screen');
    } catch (e) { /* opcional: sem permissão ou bateria fraca */ }
  }

  // ---------------------------------------------------------------
  // Opções (som, vibração, vinheta, modo feira)
  // ---------------------------------------------------------------
  setOption(key, value) {
    this.options[key] = value;
    saveOptions(this.options);
    this.applyOptions();
  }

  applyOptions() {
    const feira = this.options.feira;
    document.body.classList.toggle('feira', feira);
    for (const t of this.world.targets) t.off = feira && !t.tutorial && !CONFIG.FEIRA.TARGETS.includes(t.id);
    const b = document.getElementById('btn-sound');
    if (b) { b.textContent = this.options.sound ? '🔊' : '🔇'; b.classList.toggle('on', this.options.sound); }
  }

  gameTime() { return this.options.feira ? CONFIG.FEIRA.GAME_TIME_S : CONFIG.GAME_TIME_S; }

  // ---------------------------------------------------------------
  // Fluxo do jogo
  // ---------------------------------------------------------------
  _resetWorld() {
    clearInterval(this._autoT);
    this.interaction.reset();
    this.teleport.cancel();
    this.runner.stop();
    this.runner.distance = 0;
    this.teleport.lastJump = -1e9;
    this.teleport.jumps = 0;
    this.rig.position.copy(this.world.spawn);
    this.recenter();
  }

  startTutorial() {
    this.state = 'tutorial';
    this._resetWorld();
    this.interaction.mode = 'tutorial';
    this.tutorial = { teleport: false, touch: false, wire: false };
    if (this.options.feira) {
      // modo feira: começa do lado do pedestal, sem o passo de andar
      this.rig.position.fromArray(CONFIG.FEIRA.TUTORIAL_SPAWN);
      this.tutorial.teleport = true;
    }
    this._refreshTutorial();
    document.body.classList.remove('playing');
  }

  _refreshTutorial() { if (this.state === 'tutorial') this.calibration.showTutorial(this.tutorial); }

  startGame() {
    this.calibration.hide();
    this.state = 'playing';
    this._resetWorld();
    // cada partida sorteia onde fica a caixa de cada lugar
    if (CONFIG.INTERACTION.RANDOM_SPOTS) { placeTargets(this.world, this.scene, true); this.applyOptions(); }
    this.interaction.mode = 'game';
    this.timeLeft = this.gameTime();
    this._alarmDone = false;
    this._lastTick = 0;
    this.gameStart = performance.now();
    document.body.classList.add('playing');
    this.toast('Valendo! Siga o detector de sinal.');
  }

  _gameTargets() { return this.world.targets.filter((t) => !t.tutorial && !t.off); }

  // Dificuldade crescente: a caixa que você abre agora tem mais fios que a anterior.
  _wireCount(t) {
    if (t.tutorial) return t.wires;
    const levels = this.options.feira ? CONFIG.FEIRA.WIRE_LEVELS : CONFIG.INTERACTION.WIRE_LEVELS;
    const fixed = this._gameTargets().filter((x) => x.state === 'fixed').length;
    return levels[Math.min(fixed, levels.length - 1)];
  }

  _onFixed() {
    this.sfx.fixed();
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
    const used = Math.min((performance.now() - this.gameStart) / 1000, this.gameTime());
    setTimeout(() => (win ? this.sfx.win() : this.sfx.lose()), 350);
    const c = this.calibration;
    const feira = this.options.feira;
    const { rec, place } = addResult({ fixed, total: all.length, used, timeLeft: this.timeLeft, win, feira });
    c._show(win ? '🎉 Rede restaurada!' : '⏰ O tempo acabou', `
      <p>${win ? 'Você consertou todos os pontos de sinal.' : 'A rede caiu antes de você consertar tudo.'}</p>
      <p class="score"><b>${rec.points}</b> pontos · caixas <b>${fixed}/${all.length}</b> · tempo <b>${fmtTime(used)}</b>
      ${place ? `<br>${place === 1 ? '🏆 <b>Melhor do dia!</b>' : `Você ficou em <b>${place}º</b> hoje.`}` : ''}</p>
      <div class="name-row"><input id="rank-name" maxlength="${CONFIG.RANKING.NAME_MAX}" placeholder="Seu nome" autocomplete="off" enterkeyhint="done"><button id="rank-save">Salvar nome</button></div>
      <div id="rank-table">${rankingTable(feira, rec.id)}</div>
      ${feira ? '<p class="small" id="auto-return"></p>' : ''}`, [
      { label: '👤 Próximo jogador', cls: feira ? 'primary' : '', onClick: () => this.nextPlayer() },
      { label: '🔁 Jogar de novo', cls: feira ? '' : 'primary', onClick: () => this.startGame() },
      { label: 'Tutorial', onClick: () => this.startTutorial() },
      { label: 'Recalibrar', onClick: () => this.recalibrate() },
    ]);
    // nome no ranking (opcional)
    const input = document.getElementById('rank-name');
    const saveName = () => {
      if (!input.value.trim()) return;
      rename(rec.id, input.value);
      document.getElementById('rank-table').innerHTML = rankingTable(feira, rec.id);
      input.blur();
      this.toast('Nome salvo no ranking');
    };
    document.getElementById('rank-save').addEventListener('click', (e) => { e.stopPropagation(); saveName(); });
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') saveName(); });
    input.addEventListener('focus', () => { clearInterval(this._autoT); const a = document.getElementById('auto-return'); if (a) a.textContent = ''; });
    if (feira) {
      // modo feira: volta sozinho para a tela do próximo jogador
      let left = CONFIG.FEIRA.AUTO_RETURN_S;
      const el = document.getElementById('auto-return');
      const tick = () => { if (el) el.textContent = `Voltando para o próximo jogador em ${left} s…`; };
      tick();
      clearInterval(this._autoT);
      this._autoT = setInterval(() => {
        left--;
        if (this.state !== 'ended') { clearInterval(this._autoT); return; }
        if (left <= 0) { clearInterval(this._autoT); this.nextPlayer(); } else tick();
      }, 1000);
    }
  }

  // Tela entre um visitante e outro: zera a partida e guarda a calibração.
  nextPlayer() {
    clearInterval(this._autoT);
    document.body.classList.remove('playing');
    if (this.xrActive) this.renderer.xr.getSession().end();
    this.state = 'next';
    this._resetWorld();
    this.calibration.nextPlayer();
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

  // ---------------------------------------------------------------
  // Modo óculos
  // ---------------------------------------------------------------
  // Entrar/sair do óculos. Usa o modo VR do Chrome (WebXR, configurado pelo
  // QR Code do óculos) quando existe; senão, o modo próprio do jogo.
  // Precisa ser chamado direto do toque no botão (o navegador exige).
  toggleVR() {
    if (this.xrActive) { this.renderer.xr.getSession().end(); return; }
    if (this.stereo) { this.setStereo(false); return; }
    // sempre tenta primeiro o modo VR do Chrome (igual ao teste-xr.html);
    // o modo próprio só entra se ele não existir ou falhar
    if (navigator.xr && this.vrSettings.engine !== 'proprio') this.startXR();
    else {
      if (!navigator.xr) this.toast('Este navegador não tem o modo VR do Chrome — usando o modo próprio');
      this.setStereo(true);
    }
  }

  startXR() {
    // requestSession é a PRIMEIRA chamada do toque (sem await antes), como no teste
    navigator.xr.requestSession('immersive-vr').then(async (session) => {
      session.addEventListener('end', () => this._onXREnd());
      // botão do óculos / dedo na tela: segurar = andar
      session.addEventListener('selectstart', () => { this.xrSelect = true; });
      session.addEventListener('selectend', () => { this.xrSelect = false; });
      await this.renderer.xr.setSession(session);
      this.xrActive = true;
      document.body.classList.add('xr');
      this.hud3d.show(true);
      this.hud3d.toast('Modo VR do Chrome');
      setTimeout(() => this.recenter(), 800);
    }).catch((e) => {
      console.warn('WebXR falhou, usando o modo próprio', e);
      this.toast(`VR do Chrome não abriu (${e.message || e.name || e}) — usando o modo próprio`);
      this.setStereo(true);
    });
  }

  _onXREnd() {
    this.xrActive = false;
    this.xrSelect = false;
    document.body.classList.remove('xr');
    this.hud3d.show(false);
    this.eye.rotation.y = 0;
    this.camera.position.set(0, 0, 0);
    this.resize();
    this.orientation.recenter();
  }

  // Recentrar: no WebXR gira o grupo dos olhos; fora dele, o sensor.
  recenter() {
    if (this.xrActive) {
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
      this.eye.rotation.y = -Math.atan2(-f.x, -f.z);
    } else {
      this.orientation.recenter();
    }
  }

  async setStereo(on) {
    this.stereo = on;
    document.body.classList.toggle('stereo', on);
    document.getElementById('btn-stereo').classList.toggle('on', on);
    this.hud3d.show(on);
    if (on) {
      try {
        if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
        if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
      } catch (e) { /* nem todo navegador deixa travar: o aviso "vire o celular" ajuda */ }
      this.showVrUi(4000);
      setTimeout(() => this.recenter(), 900);
      this.hud3d.toast('Modo óculos — toque na tela para opções');
    } else {
      try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) { /* */ }
      document.body.classList.remove('vr-ui', 'vr-adjust');
      this.testPattern.visible = false;
    }
    this.resize();
  }

  // No óculos os botões ficam escondidos; um toque na tela mostra por alguns segundos.
  showVrUi(ms = 5000) {
    document.body.classList.add('vr-ui');
    clearTimeout(this._vrUiT);
    this._vrUiT = setTimeout(() => document.body.classList.remove('vr-ui'), ms);
  }

  // Ajusta a resolução pelo FPS (mais FPS em celular fraco).
  _adaptQuality(now) {
    const q = this._q;
    q.frames++;
    const el = now - q.t0;
    if (el < 1000) return;
    const fps = (q.frames * 1000) / el;
    q.frames = 0; q.t0 = now;
    const Q = CONFIG.QUALITY;
    if (!Q.AUTO) return;
    const max = Math.min(window.devicePixelRatio || 1, Q.PIXEL_RATIO);
    if (fps < Q.LOW_FPS) { q.low++; q.high = 0; } else if (fps > Q.HIGH_FPS) { q.high++; q.low = 0; } else { q.low = 0; q.high = 0; }
    let pr = this.pixelRatio;
    if (q.low >= 2 && pr > Q.MIN_PIXEL_RATIO) { pr = Math.max(Q.MIN_PIXEL_RATIO, pr - 0.15); q.low = 0; }
    if (q.high >= 6 && pr < max) { pr = Math.min(max, pr + 0.1); q.high = 0; }
    if (pr !== this.pixelRatio) { this.pixelRatio = pr; this.renderer.setPixelRatio(pr); this.resize(); }
  }

  toast(msg) {
    this.hud3d.toast(msg);
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => el.classList.remove('show'), 2200);
  }

  resize() {
    if (this.renderer.xr.isPresenting) return;
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    if (this.stereo) this.vr.applyCamera(this.camera, w, h);
    else { this.camera.fov = CONFIG.CAMERA_FOV; this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  }

  // Mouse/toque na tela: arrasta fios do painel; sem sensor, gira a visão.
  _wireCanvasPointers() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      if (this.stereo && !document.body.classList.contains('vr-adjust')) { this.showVrUi(); return; }
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

    // 1) cabeça (no WebXR o próprio Chrome move a câmera)
    if (this.xrActive) {
      // campo de visão real do óculos, para as mãos caírem no lugar certo
      const e = this.camera.projectionMatrix.elements;
      this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(1 / e[5]));
      this.camera.aspect = e[5] / e[0];
    } else {
      this.orientation.update();
    }
    if (this.locoMode !== 'correr' && (input.move.f || input.move.r)) this._debugWalk(dt, input.move);
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

    // 3) locomoção: correr (padrão) ou teleporte
    if (active && this.locoMode !== 'teleporte') {
      let manual = 0;
      this.runner.manualSource = 'botão';
      if (input.run || input.move.f > 0) manual = 1;
      if (this.xrSelect) { manual = 1; this.runner.manualSource = 'botão do óculos'; }
      if (this.locoMode === 'palma' && this.hands.hands.some((h) => h.visible && h.gesture === 'open')) { manual = 1; this.runner.manualSource = 'palma aberta'; }
      this.runner.useSwing = this.locoMode === 'correr';
      this.runner.maxSpeed = this.locoMode === 'correr' ? CONFIG.RUN.MAX_SPEED : CONFIG.RUN.WALK_SPEED;
      const busy = this.interaction.grabs.size > 0; // arrastando fio: não anda
      this.runner.update(now, dt, this.hands.hands, manual, busy);
      this.teleport.hide();
    } else if (active) {
      this.teleport.update(now, loco, input.aim || input.keyAim);
    } else {
      this.teleport.hide();
      if (this.runner.speed) this.runner.stop();
    }

    // 4) interação: tocar, painel, detector
    if (active) {
      if (inter.visible && inter.present) this.interaction.checkTouch(inter.worldPts[8]);
      this.interaction.updatePanel(this._collectPointers(), window.innerWidth, window.innerHeight, now);
      this.interaction.updateDetector(inter);
    } else {
      this.interaction.detector.group.visible = false;
    }
    animateTargets(this.world.targets, dt, now / 1000, this.rig.position, (t) => active && this.interaction.eligible(t));
    // bipe do detector (quieto com o painel aberto)
    if (active && !this.interaction.panel && this.interaction.nearest) this.sfx.detector(this.interaction.nearest.dist, now / 1000);

    // 5) tempo
    if (this.state === 'playing') {
      this.timeLeft -= dt;
      if (!this._alarmDone && this.timeLeft <= 60 && this.gameTime() > 90) { this._alarmDone = true; this.sfx.alarm(); this.toast('⚠ Falta 1 minuto!'); }
      const sec = Math.ceil(this.timeLeft);
      if (sec <= 10 && sec > 0 && sec !== this._lastTick) { this._lastTick = sec; this.sfx.tick(sec <= 3); }
      if (this.timeLeft <= 0) { this.timeLeft = 0; this.endGame(false); }
    }
    this._updateVignette(dt);
    this.handHint.update(now, active);
    this._updateHud(active);

    // 6) render
    this._render();
    this.debug.frame(now, dtMs);
    this._adaptQuality(now);
  }

  // Vinheta de conforto: escurece as bordas da visão enquanto anda (menos enjoo).
  // Fica presa à câmera, então funciona na tela normal, no óculos e no WebXR.
  _updateVignette(dt) {
    const C = CONFIG.COMFORT;
    let goal = 0;
    if (this.options.vignette) {
      if (document.body.classList.contains('dashing')) goal = 1;
      else goal = Math.min(1, (this.runner.speed || 0) / C.VIGNETTE_SPEED);
    }
    this.vignetteK += (goal - this.vignetteK) * Math.min(1, dt * 8);
    const k = this.vignetteK * C.VIGNETTE_MAX;
    this.vignette.visible = k > 0.01;
    this.vignette.material.uniforms.strength.value = k;
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
    if (!active) { if (this.stereo || this.xrActive) this.hud3d.update({ timer: this.state === 'ended' ? 'fim' : '' }); return; }
    const info = {};
    const tl = document.getElementById('timer');
    if (this.state === 'playing') {
      tl.textContent = info.timer = fmtTime(this.timeLeft);
      tl.classList.toggle('urgent', this.timeLeft < 30);
      const all = this._gameTargets();
      document.getElementById('count').textContent = info.count = `📡 ${all.filter((t) => t.state === 'fixed').length}/${all.length}`;
    } else {
      tl.textContent = info.timer = 'tutorial';
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
      info.dist = `${near.dist.toFixed(1)} m`; info.arrowAngle = ang; info.up = !!up;
    }
    if (this.locoMode !== 'teleporte' && this.runner.speed > 0.2) info.count = `${info.count || ''} 🏃`;
    if (this.stereo || this.xrActive) this.hud3d.update(info);
    const input = this.debug.input;
    document.getElementById('crosshair').classList.toggle('on', input.pinch || input.fist || input.aim);
  }

  _render() {
    const r = this.renderer;
    if (this.xrActive || !this.stereo) { r.setScissorTest(false); r.render(this.scene, this.camera); return; }
    this.vr.render(this.scene, this.camera);
  }
}

// Service worker: faz o link normal sempre abrir a versão mais nova
// (e o jogo abrir mesmo sem internet, com a última versão baixada).
function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  if (!/\/(index\.html)?$/.test(location.pathname)) return; // só na página principal
  // servidor local por IP (certificado próprio): o navegador não aceita service worker
  if (location.protocol === 'https:' && /^\d+\.\d+\.\d+\.\d+$/.test(location.hostname)) return;
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker não registrado', e));
}

// Plano preso na frente da câmera; o shader escurece pelo ângulo a partir do
// centro da visão (independe do tamanho da tela e do campo de visão).
function makeVignette() {
  const D = 0.12;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false,
    uniforms: {
      strength: { value: 0 },
      inner: { value: Math.tan(THREE.MathUtils.degToRad(22)) },
      outer: { value: Math.tan(THREE.MathUtils.degToRad(48)) },
    },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float strength; uniform float inner; uniform float outer; varying vec2 vP;
      void main(){ float r = length(vP) / ${D.toFixed(3)}; float a = smoothstep(inner, outer, r) * strength; gl_FragColor = vec4(0.0, 0.0, 0.0, a); }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(D * 8, D * 8), mat);
  m.position.z = -D;
  m.renderOrder = 40; // por cima do mundo, por baixo do HUD 3D e do painel
  m.frustumCulled = false;
  m.visible = false;
  return m;
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
