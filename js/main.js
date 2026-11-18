// Escola Zumbi (antigo Caçador de Sinal) — protótipo. Loop principal e estados do jogo.
// Estados: boot -> calibration -> tutorial -> playing -> ended
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { buildWorld, loadSchool, updateDetails } from './scene.js';
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
import { Gun } from './gun.js';
import { Horde } from './zombies.js';
import { Coach } from './coach.js';
import { Lobby } from './lobby.js';
import { Melee } from './melee.js';
import { DemoHand } from './demo.js';

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
    this.camera = new THREE.PerspectiveCamera(CONFIG.CAMERA_FOV, 1, 0.03, CONFIG.MAP.VIEW_FAR || 60);
    // rig (posição no chão) -> eye (altura dos olhos / recentrar no WebXR) -> câmera
    this.rig = new THREE.Group();
    this.eye = new THREE.Group();
    this.eye.position.y = CONFIG.EYE_HEIGHT;
    this.rig.add(this.eye);
    this.eye.add(this.camera);
    this.scene.add(this.rig);
    // a pistolinha agora é a arma: o teleporte (que usava a pistolinha) vira 'palma'
    this.locoMode = CONFIG.LOCOMOTION === 'teleporte' ? 'palma' : CONFIG.LOCOMOTION;
    document.body.classList.add(`mode-${this.locoMode}`);
    this.xrSupported = undefined; // undefined = ainda não sabe · true/false depois da pergunta ao Chrome
    this.xrActive = false;
    this.renderer.xr.enabled = true;
    this.renderer.xr.setReferenceSpaceType('local');
    if (navigator.xr && navigator.xr.isSessionSupported) {
      navigator.xr.isSessionSupported('immersive-vr').then((ok) => { this.xrSupported = ok; }).catch(() => { this.xrSupported = false; });
    } else {
      this.xrSupported = false;
    }
    this.vrSettings = loadVrSettings();
    this.vr = new VRView(this.renderer, this.vrSettings);
    this.hud3d = new HUD3D(this.camera);
    this.testPattern = makeTestPattern();
    this.camera.add(this.testPattern);
    this.vignette = makeVignette();
    this.camera.add(this.vignette);
    this.vignetteK = 0;
    this.hurtFx = makeHurt();
    this.camera.add(this.hurtFx);
    this.hurtK = 0;

    this.world = buildWorld(this.scene);
    this._clearTargets();
    this.rig.position.copy(this.world.spawn);
    this.floorY = this.rig.position.y;
    // a escola de verdade carrega em segundo plano; até lá vale o mapa de blocos
    this.mapDone = !CONFIG.MAP.USE_SCHOOL;
    this.mapText = this.mapDone ? '' : 'Carregando a escola…';
    this.mapPromise = this.mapDone ? Promise.resolve() : this._loadSchool();
    this.orientation = new OrientationController(this.camera);
    this.hands = new HandTracker(this.calib);
    this.handViews = [new HandView(this.camera, this.hands.left), new HandView(this.camera, this.hands.right)];

    this.tutorial = { walk: false, aim: false, shoot: false };
    this.teleport = new Teleport(this.scene, this.rig, this.camera, this.world, {
      onTeleport: () => {},
      onFail: (msg) => this.toast(`Teleporte: ${msg}`),
    });
    this.runner = new Runner(this.rig, this.eye, this.camera, this.world, {
      onMove: (d) => { if (this.state === 'tutorial' && !this.tutorial.walk && d > 2) { this.tutorial.walk = true; this.sfx.wire(true); } },
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
    this.gun = new Gun(this.scene, this.camera, this.world, {
      onShot: (hit) => this._onShot(hit),
      onReady: () => { this.sfx.cock(); if (this.state === 'tutorial' && !this.tutorial.aim) { this.tutorial.aim = true; this.sfx.wire(true); } },
    });
    this.horde = new Horde(this.scene, this.world, {
      onHit: () => this._onBite(),
      onGroan: (d) => this.sfx.groan(d),
      onWave: (n) => { if (this.state === 'playing') { this.toast(`🧟 Chegaram mais ${n} zumbis!`); this.sfx.alarm(); } },
    });
    this.coach = new Coach(this.camera);
    this.lobby = new Lobby(this.camera);
    this.melee = new Melee();
    this.demo = new DemoHand(this.camera);
    // v24: seta na borda da visão quando a mão sai da câmera
    this.edgeArrow = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.03, 3), new THREE.MeshBasicMaterial({ color: 0xffd36b, depthTest: false, transparent: true }));
    this.edgeArrow.renderOrder = 53;
    this.edgeArrow.visible = false;
    this.camera.add(this.edgeArrow);
    this._edgeUntil = 0;
    this.hp = CONFIG.PLAYER.HP;
    this.lastPalm = -1e9;
    this._fx = [];
    this._hv = new THREE.Vector3();
    this._eyeP = new THREE.Vector3();
    this._camW = new THREE.Vector3();
    this._walkDir = new THREE.Vector3(0, 0, -1);
    this._dirB = new THREE.Vector3();
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
    this._preloadP = this._preloadDevices();
    window.__app = this; // para depuração no console / testes
    registerServiceWorker();
  }

  locoSide() { return this.calib.locomotion; }
  interSide() { return this.calib.locomotion === 'left' ? 'right' : 'left'; }

  // ---------------------------------------------------------------
  // Permissões / dispositivos
  // ---------------------------------------------------------------
  async initDevices(onStatus, withCamera = true) {
    // ainda dentro do toque (antes de qualquer await): liga a câmera / dá play
    let camP = null;
    if (withCamera) {
      if (this.hands.stream) this.hands.video.play().catch(() => {});
      else camP = this.hands.startCamera();
      if (camP) camP.catch(() => {});
    }
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
    // a pré-carga (abriu o jogo com a câmera já liberada) pode estar no meio
    if (withCamera && this._preloadP) { onStatus('Ligando câmera e mãos…'); await this._preloadP; }
    if (!withCamera || this.hands.landmarker) { this.devicesReady = true; return true; }
    try {
      onStatus('Pedindo acesso à câmera traseira…');
      if (camP) await camP;
      else if (!this.hands.stream) await this.hands.startCamera();
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

  // Com calibração salva, carrega o detector de mãos logo ao abrir (é o que
  // mais demora). A CÂMERA só liga no toque: no Android, um vídeo que começa
  // sem toque e fica escondido é pausado pelo Chrome, e aí a mão nunca
  // aparece (bug da v16).
  async _preloadDevices() {
    try {
      if (!loadCalib() || this.hands.landmarker) return;
      await this.hands.loadModel(() => {});
    } catch (e) { /* sem problema: carrega no toque */ }
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

  // Carrega o modelo da escola e troca o mapa. Nunca rejeita: se der errado,
  // o jogo continua no mapa de blocos.
  async _loadSchool() {
    const setText = (t) => {
      this.mapText = t;
      const el = document.getElementById('map-status');
      if (el) el.innerHTML = t;
    };
    try {
      const aniso = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
      await loadSchool(this.world, this.scene, (msg, f) => setText(`🏫 ${msg}… ${Math.round(f * 100)}%`), aniso);
      this.rig.rotation.y = CONFIG.MAP.SPAWN_YAW;
      this._clearTargets();
      if (this.state === 'boot' || this.state === 'calibration') { this.rig.position.copy(this.world.spawn); this.floorY = this.world.spawn.y; }
      this.applyOptions();
      setText('<span class="ok">🏫 Escola carregada.</span>');
    } catch (e) {
      console.warn('Escola não carregou, usando o mapa de blocos', e);
      setText(`<span class="bad">🏫 A escola não carregou (${e.message || e}). Usando o mapa de blocos.</span>`);
    }
    this.mapDone = true;
  }

  // Se a escola ainda está carregando, mostra o progresso e chama again() no fim.
  _waitMap(again) {
    if (this.mapDone) return false;
    this.calibration._show('Carregando a escola…', `<p>Na primeira vez o modelo 3D da escola (7 MB) demora um pouco para baixar. Depois ele fica guardado no celular.</p><p id="map-status">${this.mapText}</p>`, []);
    this.mapPromise.then(again);
    return true;
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
    const feiraIds = this.world.feiraTargets || CONFIG.FEIRA.TARGETS;
    for (const t of this.world.targets) t.off = feira && !t.tutorial && !feiraIds.includes(t.id);
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
    this.gun.hide();
    this.horde.clear();
    this.hp = CONFIG.PLAYER.HP;
    this.hurtK = 0;
    this._tutDoneAt = 0;
    this.rig.position.copy(this.world.spawn);
    this.floorY = this.world.spawn.y;
    this.recenter();
  }

  startTutorial() {
    if (this._waitMap(() => this.startTutorial())) return;
    this.calibration.hide();
    this.lobby.close();
    this.state = 'tutorial';
    this._resetWorld();
    this.tutorial = { walk: !!this.options.parado, aim: false, shoot: false }; // só atirar: sem passo de andar
    // zumbi de treino na frente do início (parado, 1 tiro)
    const yaw = this.rig.rotation.y;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const S = this.world.spawn;
    let pos = null;
    for (let d = CONFIG.ZOMBIES.DUMMY_DIST; d > 2 && !pos; d -= 0.5) {
      for (const off of [0, 0.6, -0.6, 1.2, -1.2]) {
        const x = S.x + fx * d - fz * off, z = S.z + fz * d + fx * off;
        const y = this.world.floorAt(x, z);
        if (y != null && this.world.isFree(x, z, 0.35, y)) { pos = new THREE.Vector3(x, y, z); break; }
      }
    }
    if (!pos) pos = new THREE.Vector3(S.x + fx * 4, S.y, S.z + fz * 4);
    this.horde.spawnDummy(pos, Math.atan2(S.x - pos.x, S.z - pos.z));
    document.body.classList.remove('playing');
    document.body.classList.add('tutorial');
    this.toast('Tutorial: siga a dica no canto da tela');
  }

  _refreshTutorial() {}

  // Mão aberta para andar: o gesto 'palma' ou, com folga, 3 dos 4 dedos esticados.
  _isPalm(h) {
    if (!h.visible) return false;
    if (h.gesture === 'open' || this.gun._isOpen(h)) return true; // dedos longe do pulso (3D) também vale
    const f = h.features;
    if (!f || h.gesture === 'fist' || h.gesture === 'pinch') return false;
    const thr = this.calib.thresholds;
    const n = f.straight.filter((s, i) => s > thr.ext[i] - 0.05).length;
    return n >= CONFIG.PLAYER.PALM_FINGERS && f.straight[1] > thr.ext[1] - 0.05;
  }

  // v22: palma BEM aberta para andar: o gesto 'palma' OU os 4 dedos esticados
  // E indicador e médio longe do pulso (as duas coisas). Mão fechada ou meio
  // fechada não anda mais.
  _isOpenPalm(h) {
    if (!h.visible || !h.features) return false;
    if (h.gesture === 'fist' || h.gesture === 'pinch' || h.gesture === 'gun') return false;
    const f = h.features, thr = this.calib.thresholds;
    const n = f.straight.filter((s, i) => s > thr.ext[i] - 0.03).length;
    const r = this.gun._reach(h);
    const far = !!r && r.index > CONFIG.PLAYER.PALM_REACH && r.middle > CONFIG.PLAYER.PALM_REACH;
    return far && (h.gesture === 'open' || n >= 4);
  }

  // Tira as caixas do jogo antigo (o jogo agora é de zumbis).
  _clearTargets() {
    for (const t of this.world.targets) this.scene.remove(t.group);
    this.world.targets = [];
    this.world._reach = null;
    this.world._zcand = null;
  }

  // Passos do tutorial: todos feitos -> a partida começa sozinha em 3 s.
  _tutorialStep(now) {
    const t = this.tutorial;
    if (t.walk && t.aim && t.shoot && !this._tutDoneAt) {
      this._tutDoneAt = now;
      this.sfx.fixed();
      this.toast('Tutorial completo! A partida começa em 3 s…');
    }
    if (this._tutDoneAt && now - this._tutDoneAt > 3000) this.startGame();
  }

  startGame() {
    if (this._waitMap(() => this.startGame())) return;
    this.calibration.hide();
    this.lobby.close();
    this.state = 'playing';
    this._resetWorld();
    const n = this.options.feira ? CONFIG.ZOMBIES.FEIRA_COUNT : CONFIG.ZOMBIES.COUNT;
    this.horde.spawnHorde(n, this.world.spawn);
    // v24: modo "só atirar": você fica parado e todos os zumbis já vêm atrás de você
    if (this.options.parado) this.horde.alertAll(this.world.spawn, 9999);
    this.timeLeft = this.gameTime();
    this._alarmDone = false;
    this._lastTick = 0;
    this._loseReason = '';
    this.gameStart = performance.now();
    document.body.classList.remove('tutorial');
    document.body.classList.add('playing');
    this.toast(`🧟 ${this.horde.total} zumbis vão aparecer. Elimine todos!`);
  }

  // Raio da mira: zumbi mais perto ou parede (o que vier primeiro).
  _findHit(o, d) {
    const R = CONFIG.GUN.RANGE;
    const zh = this.horde.rayHit(o, d, R);
    const end = this._hv.copy(o).addScaledVector(d, zh ? zh.dist : R);
    const wall = this.world.segmentHit(o, end);
    if (wall && wall.point) {
      const wd = wall.point.distanceTo(o);
      if (!zh || wd < zh.dist - 0.05) return { dist: wd, point: wall.point, wall: true };
    }
    return zh;
  }

  _onShot(hit) {
    this.sfx.shot();
    if (this.state === 'tutorial') this.tutorial.aim = true; // atirou (mão ou botão): já sabe mirar
    this.horde.alertAll(this.rig.position, CONFIG.ZOMBIES.SHOT_ALERT);
    if (!hit) return;
    if (hit.zombie) {
      const z = hit.zombie;
      const kill = this.horde.damage(z, hit.part);
      this.sfx.zombieHit(kill);
      this._puff(hit.point, 0x8a0d0d, kill ? 0.35 : 0.22);
      if (!kill) return;
      if (z.dummy) {
        if (this.state === 'tutorial') { this.tutorial.shoot = true; this.toast(hit.part === 'head' ? '💥 Na cabeça! Isso aí!' : '🧟 Acertou!'); }
        return;
      }
      const left = this.horde.alive;
      this.toast(`${hit.part === 'head' ? '💥 Na cabeça!' : '🧟 Abatido!'} Faltam ${left}`);
      if (this.state === 'playing' && left === 0) this.endGame(true);
    } else {
      this._puff(hit.point, 0xbdb6a6, 0.15);
    }
  }

  // Mordida de zumbi
  _onBite() {
    if (this.state !== 'playing') return;
    this.hp--;
    this.hurtK = 1;
    this.sfx.hurt();
    this.toast(this.hp > 0 ? `🩸 Mordida! ${'❤'.repeat(this.hp)}` : '🩸 Os zumbis te pegaram!');
    if (this.hp <= 0) { this._loseReason = 'bitten'; this.endGame(false); }
  }

  // nuvenzinha (sangue ou poeira) onde o tiro bateu
  _puff(p, color, size) {
    if (!this._puffGeo) this._puffGeo = new THREE.SphereGeometry(1, 8, 6);
    const m = new THREE.Mesh(this._puffGeo, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }));
    m.position.copy(p);
    m.scale.setScalar(size * 0.3);
    this.scene.add(m);
    this._fx.push({ m, t: 0, size });
  }

  _updateFx(dt) {
    for (let i = this._fx.length - 1; i >= 0; i--) {
      const f = this._fx[i];
      f.t += dt;
      const k = f.t / 0.35;
      f.m.scale.setScalar(f.size * (0.3 + k));
      f.m.material.opacity = Math.max(0, 1 - k);
      if (k >= 1) { this.scene.remove(f.m); f.m.material.dispose(); this._fx.splice(i, 1); }
    }
    this.hurtK = Math.max(0, this.hurtK - dt * 1.6);
    this.hurtFx.visible = this.hurtK > 0.01;
    this.hurtFx.material.opacity = this.hurtK * 0.55;
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
    this.gun.hide();
    document.body.classList.remove('playing');
    const all = { length: this.horde.total };
    const fixed = this.horde.killed;
    const used = Math.min((performance.now() - this.gameStart) / 1000, this.gameTime());
    setTimeout(() => (win ? this.sfx.win() : this.sfx.lose()), 350);
    const c = this.calibration;
    const feira = this.options.feira;
    const { rec, place } = addResult({ fixed, total: all.length, used, timeLeft: this.timeLeft, win, feira });
    const bitten = this._loseReason === 'bitten';
    c._show(win ? '🎉 Escola salva!' : bitten ? '🧟 Os zumbis te pegaram' : '⏰ O tempo acabou', `
      <p>${win ? 'Você eliminou todos os zumbis da escola.' : bitten ? 'Você levou mordidas demais. Fique de olho nos lados!' : 'Ainda sobraram zumbis na escola.'}</p>
      <p class="score"><b>${rec.points}</b> pontos · zumbis <b>${fixed}/${all.length}</b> · tempo <b>${fmtTime(used)}</b>
      ${place ? `<br>${place === 1 ? '🏆 <b>Melhor do dia!</b>' : `Você ficou em <b>${place}º</b> hoje.`}` : ''}</p>
      <div class="name-row"><input id="rank-name" maxlength="${CONFIG.RANKING.NAME_MAX}" placeholder="Seu nome" autocomplete="off" enterkeyhint="done"><button id="rank-save">Salvar nome</button></div>
      <div id="rank-table">${rankingTable(feira, rec.id)}</div>
      ${feira ? '<p class="small" id="auto-return"></p>' : ''}`, [
      { label: '👤 Próximo jogador', cls: feira ? 'primary' : '', onClick: () => this.nextPlayer() },
      { label: '🔁 Jogar de novo', cls: feira ? '' : 'primary', onClick: () => this.startGame() },
      { label: 'Tutorial', onClick: () => this.startTutorial() },
      { label: 'Recalibrar', onClick: () => this.recalibrate() },
    ]);
    // no óculos: resultado na lente e mão aberta = jogar de novo
    if (this.inHeadset()) {
      this.lobby.open({
        title: win ? '🎉 Escola salva!' : bitten ? '🧟 Te pegaram!' : '⏰ Acabou o tempo',
        lines: [`${rec.points} pontos · zumbis ${fixed}/${all.length}`, '✋ mão aberta = jogar de novo'],
        holdMs: CONFIG.LOBBY.HOLD_MS * 1.3,
        armMs: 2500,
        onGo: () => { clearInterval(this._autoT); this.recenter(); this.startGame(); },
      });
    }
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
    document.body.classList.remove('playing', 'tutorial');
    // no óculos: fica no óculos e espera o próximo jogador mostrar a mão aberta
    if (this.inHeadset() && this.devicesReady) {
      this.calibration.nextPlayer();
      this._openLobby(false);
      return;
    }
    this.state = 'next';
    this._resetWorld();
    this.calibration.nextPlayer();
  }

  // ---------------------------------------------------------------
  // v14: jogar no óculos com UM toque (usa a calibração salva).
  // Entra no óculos já no toque (o navegador exige), liga câmera e mãos
  // por trás e mostra o saguão na lente: contagem para pôr no rosto,
  // ou mão aberta parada para começar na hora.
  // ---------------------------------------------------------------
  inHeadset() { return this.stereo || this.xrActive; }

  playInHeadset() {
    if (!this.inHeadset()) this.toggleVR(); // 1ª coisa do toque
    const saved = loadCalib();
    Object.assign(this.calib, saved || defaultCalib());
    this.calibration.hide();
    this._openLobby(true);
    this.lobby.setStatus('Ligando a câmera…');
    this.initDevices((m) => this.lobby.setStatus(String(m).replace(/<[^>]+>/g, '')), true).then((ok) => {
      if (ok) { this.lobby.setStatus(saved ? 'Calibração salva carregada' : 'Sem calibração: usando o padrão'); return; }
      this.lobby.setStatus('A câmera não abriu: tire o óculos');
      setTimeout(() => {
        this.lobby.close();
        this.exitHeadset();
        this.calibration._showInitError(() => this.playInHeadset());
      }, 2500);
    });
  }

  exitHeadset() {
    if (this.xrActive) this.renderer.xr.getSession().end();
    else if (this.stereo) this.setStereo(false);
  }

  // countdown: true = "coloque no rosto" com contagem; false = espera a mão aberta
  _openLobby(countdown, title) {
    this.state = 'lobby';
    this._resetWorld();
    document.body.classList.remove('playing', 'tutorial');
    const tut = this.options.tutorial !== false;
    const L = CONFIG.LOBBY;
    this.lobby.open({
      title: title || (countdown ? '👓 Coloque o óculos no rosto' : '👤 Próximo jogador'),
      lines: countdown
        ? ['Olhe para frente.', `Começa sozinho, ou ✋ mão aberta = já`]
        : ['Olhe para frente e mostre', '✋ a mão aberta para começar'],
      countdownS: countdown ? L.COUNTDOWN_S : 0,
      holdMs: L.HOLD_MS,
      armMs: countdown ? 0 : 1000,
      onGo: () => { this.recenter(); if (tut) this.startTutorial(); else this.startGame(); },
    });
  }

  _lobbyReady() { return this.devicesReady && this.mapDone; }

  _lobbyStatus() {
    if (!this.mapDone) return this.mapText.replace(/<[^>]+>/g, '');
    return null;
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
    // modo VR do Chrome só se ele disse que funciona (ou ainda não respondeu);
    // senão vai direto para o modo próprio, ainda dentro do toque, para a
    // tela cheia funcionar (o navegador só deixa com um toque)
    if (navigator.xr && this.vrSettings.engine !== 'proprio' && this.xrSupported !== false) this.startXR();
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
      // v24: lente mais leve nas bordas (o centro fica nítido): mais FPS
      try { if (this.renderer.xr.setFoveation) this.renderer.xr.setFoveation(CONFIG.QUALITY.XR_FOVEATION); } catch (e) { /* */ }
      await this.renderer.xr.setSession(session);
      this.xrActive = true;
      document.body.classList.add('xr');
      this.hud3d.show(true);
      this.hud3d.toast('Modo VR do Chrome');
      setTimeout(() => this.recenter(), 800);
    }).catch((e) => {
      console.warn('WebXR falhou, usando o modo próprio', e);
      this.xrSupported = false; // na próxima vez vai direto para o modo próprio
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
      this.hud3d.toast(document.fullscreenElement ? 'Modo óculos — toque na tela para opções' : 'Toque na tela para tela cheia');
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
    const H = CONFIG.HANDS, hs = this.hands.maxSide || H.WORKER_MAX_SIDE;
    if (q.low >= 2 && pr > Q.MIN_PIXEL_RATIO) { pr = Math.max(Q.MIN_PIXEL_RATIO, pr - 0.15); q.low = 0; }
    // já na resolução mínima e ainda lento: a imagem das mãos também diminui
    else if (q.low >= 3 && hs > H.WORKER_MIN_SIDE) { this.hands.maxSide = Math.max(H.WORKER_MIN_SIDE, hs - 64); q.low = 0; }
    if (q.high >= 6 && hs < H.WORKER_MAX_SIDE) { this.hands.maxSide = Math.min(H.WORKER_MAX_SIDE, hs + 64); q.high = 0; }
    else if (q.high >= 6 && pr < max) { pr = Math.min(max, pr + 0.1); q.high = 0; }
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
      // vídeo da câmera parado (o navegador pausou): o toque religa
      if (this.hands.stream && this.hands.video.paused) this.hands.video.play().catch(() => {});
      if (this.stereo && !document.body.classList.contains('vr-adjust')) {
        // sem tela cheia (o navegador recusou): o toque na tela tenta de novo
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen({ navigationUI: 'hide' })
            .then(() => (screen.orientation && screen.orientation.lock ? screen.orientation.lock('landscape') : null))
            .then(() => this.resize()).catch(() => {});
        }
        this.showVrUi();
        return;
      }
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
    const up = (e) => {
      const p = this.mouse.get(e.pointerId);
      if (!p) return;
      p.down = false;
      // toque rápido na tela (sem arrastar) = atirar no centro
      if ((this.state === 'playing' || this.state === 'tutorial') && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 12) this.debug.input.fire = true;
    };
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
    this._followFloor(dt);
    this.rig.updateMatrixWorld(true);

    // 2) mãos + gestos
    const fresh = this.hands.update(now, this.camera);
    for (const h of this.hands.hands) {
      if (fresh || !h.visible) updateHandGesture(h, this.calib.thresholds, now);
    }
    const active = this.state === 'tutorial' || this.state === 'playing';
    const loco = this.hands.get(this.locoSide());
    const inter = this.hands.get(this.interSide());

    // 3) locomoção. v18: mão AZUL anda para onde aponta; mão VERMELHA é a arma
    const headAim = CONFIG.GUN.AIM === 'cabeca';
    if (CONFIG.ROLES.ON && !headAim) this._assignRoles();
    if (active && headAim) {
      // v21: ✋ palma aberta (qualquer mão que não esteja na pistolinha) = anda para onde olha
      let manual = 0;
      this.runner.manualSource = 'botão';
      if (input.run || input.move.f > 0) manual = 1;
      if (this.xrSelect) { manual = 1; this.runner.manualSource = 'botão do óculos'; }
      const thr = this.calib.thresholds;
      // v22: só a mão de ANDAR (esquerda, ou a escolhida na calibração) anda,
      // e só com a palma bem aberta segurada um instante (não anda sem querer)
      const walkSide = this.locoSide();
      const strict = CONFIG.ROLES.STRICT_SIDES;
      this.gun.onlySide = strict ? this.interSide() : null;
      const palm = !this.options.parado && this.hands.hands.find((h) => (!strict || h.side === walkSide) && this._isOpenPalm(h)
        && !this.gun._isPistol(h, thr) && !(this.gun.pistol && h.side === this.gun.side));
      if (palm) { if (!this._palmSince) this._palmSince = now; if (now - this._palmSince >= CONFIG.PLAYER.PALM_START_MS) this.lastPalm = now; }
      else this._palmSince = 0;
      if (now - this.lastPalm < CONFIG.PLAYER.WALK_STOP_MS) { manual = 1; this.runner.manualSource = 'palma aberta'; }
      this.runner.dir = null;
      this.runner.useSwing = false;
      this.runner.maxSpeed = CONFIG.RUN.WALK_SPEED;
      this.runner.update(now, dt, this.hands.hands, manual, false);
      this.teleport.hide();
    } else if (active && CONFIG.ROLES.ON) {
      let manual = 0;
      this.runner.manualSource = 'botão';
      if (input.run || input.move.f > 0) manual = 1;
      if (this.xrSelect) { manual = 1; this.runner.manualSource = 'botão do óculos'; }
      const w = this.hands.hands.find((h) => h.role === 'walk' && h.visible);
      // v20: a mão azul só anda fazendo um gesto: 👉 apontar = anda para onde o
      // dedo aponta · ✋ palma aberta = anda para onde você olha. Outro jeito = parada.
      const pointing = w && this._isPointing(w), palm = w && !pointing && this._isPalm(w);
      if (pointing || palm) {
        if (pointing) this._fingerDir(w, this._hv, CONFIG.ROLES.FINGER_BLEND);
        else this.camera.getWorldDirection(this._hv);
        this._hv.y = 0;
        if (this._hv.lengthSq() > 1e-6) {
          this._hv.normalize();
          if (now - this.lastPalm > CONFIG.ROLES.WALK_GRACE_MS) this._walkDir.copy(this._hv);
          else this._walkDir.lerp(this._hv, 0.25).normalize();
          this.lastPalm = now;
        }
      }
      const handWalk = now - this.lastPalm < CONFIG.ROLES.WALK_GRACE_MS;
      if (handWalk) { manual = 1; this.runner.manualSource = 'mão azul'; }
      this.runner.dir = handWalk ? this._walkDir : null;
      this.runner.useSwing = false;
      this.runner.maxSpeed = CONFIG.RUN.WALK_SPEED;
      this.runner.update(now, dt, this.hands.hands, manual, false);
      this.teleport.hide();
    } else if (active && this.locoMode !== 'teleporte') {
      let manual = 0;
      this.runner.manualSource = 'botão';
      if (input.run || input.move.f > 0) manual = 1;
      if (this.xrSelect) { manual = 1; this.runner.manualSource = 'botão do óculos'; }
      // mão aberta (a que não está com a arma) = anda; continua um instante se a palma "piscar"
      // não anda sem querer ao mirar: a mão que fez pistolinha há pouco não conta
      if (this.gun.side) { this._gunSide = this.gun.side; this._gunAt = now; }
      const recentGun = now - (this._gunAt || -1e9) < CONFIG.PLAYER.NO_WALK_AFTER_GUN_MS;
      const palm = this.hands.hands.find((h) => this._isPalm(h) && !(recentGun && h.side === this._gunSide) && !this.gun.isGunHand(h, this.calib.thresholds));
      if (palm) { this.lastPalm = now; this._palmSide = palm.side; }
      if (this.gun.side && this._palmSide === this.gun.side) this.lastPalm = -1e9; // virou arma: para na hora
      if (this.locoMode === 'palma' && now - this.lastPalm < CONFIG.PLAYER.WALK_GRACE_MS) { manual = 1; this.runner.manualSource = 'palma aberta'; }
      this.runner.useSwing = this.locoMode === 'correr';
      this.runner.maxSpeed = this.locoMode === 'correr' ? CONFIG.RUN.MAX_SPEED : CONFIG.RUN.WALK_SPEED;
      this.runner.update(now, dt, this.hands.hands, manual, false);
      this.teleport.hide();
    } else if (active) {
      this.teleport.update(now, loco, input.aim || input.keyAim);
    } else {
      this.teleport.hide();
      if (this.runner.speed) this.runner.stop();
    }

    // 4) arma e zumbis
    if (active) {
      const fire = !!input.fire;
      input.fire = false;
      this.gun.aimFn = (h, out) => this._fingerDir(h, out, CONFIG.GUN.FINGER_BLEND);
      this.gun.update(now, this.hands.hands, this.calib.thresholds, fresh, fire, (o, d) => this._findHit(o, d));
      this.horde.update(dt, this.rig.position);
      if (CONFIG.MELEE.ON) this._updateMelee(now, dt);
      this._collectPointers();
      if (this.state === 'tutorial') this._tutorialStep(now);
    } else {
      this.gun.hide();
    }
    // saguão do óculos (antes da partida / no fim): mão aberta parada = começar
    if (this.lobby.active) {
      const palm = this.hands.hands.some((h) => this._isPalm(h));
      const st = this._lobbyStatus();
      if (st) this.lobby.setStatus(st);
      this.lobby.update(now, palm || !!input.fire, this._lobbyReady());
      input.fire = false;
    }
    // durante o jogo: as DUAS mãos abertas paradas = recentrar a visão
    if (active) this._recenterGesture(now);
    this._updateEdgeArrow(now, active);
    // mão fantasma do tutorial mostrando o gesto do passo atual
    const tt = this.tutorial;
    const step = this.state === 'tutorial' && !this._tutDoneAt ? (!tt.walk && !this.options.parado ? 'walk' : !tt.shoot ? 'aim' : null) : null;
    this.demo.update(dt, step);
    for (const v of this.handViews) {
      if (CONFIG.GUN.AIM === 'cabeca') {
        // a cor mostra o que a mão está fazendo: vermelha = pistolinha, azul = palma (andando)
        const h = v.hand, thr = this.calib.thresholds;
        const gunNow = this.gun.pistol && h.side === this.gun.side;
        const walking = this.runner.speed > 0.2 && (!CONFIG.ROLES.STRICT_SIDES || h.side === this.locoSide()) && this._isOpenPalm(h);
        // v22: cor fraca pelo lado (vermelho = mão da arma, azul = mão de andar), forte quando faz o gesto
        const sideCol = !CONFIG.ROLES.STRICT_SIDES ? null : h.side === this.locoSide() ? CONFIG.ROLES.WALK_DIM : CONFIG.ROLES.GUN_DIM;
        v.tint = gunNow ? (this.gun.state === 'reload' ? 0x8e1b1b : CONFIG.ROLES.GUN_COLOR)
          : walking ? CONFIG.ROLES.WALK_COLOR : sideCol;
      } else if (CONFIG.ROLES.ON) {
        const r = v.hand.role;
        v.tint = r === 'walk' ? CONFIG.ROLES.WALK_COLOR : r === 'gun' ? (this.gun.state === 'reload' ? 0x8e1b1b : CONFIG.ROLES.GUN_COLOR) : null;
      } else v.tint = this.gun.tintFor(v.hand.side, now);
      v.update();
    }
    this._updateFx(dt);

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
    this._updateCoach(active);

    // 6) render (detalhes longe da escola somem; confere 5× por segundo)
    if (now - (this._detT || 0) > 200) { this._detT = now; updateDetails(this.world, this.rig.position); }
    if (this.world.cenario) this.world.cenario.update(dt, this.camera.getWorldPosition(this._camW));
    this._render();
    this.debug.frame(now, dtMs);
    this._adaptQuality(now);
  }

  // Na escola o chão tem degraus e rampas: o jogador acompanha a altura do piso.
  _followFloor(dt) {
    if (!this.world.school) return;
    const p = this.rig.position;
    const f = this.world.floorAt(p.x, p.z);
    if (f != null) {
      this.world.grid.refY = f;
      const dy = f - this.floorY;
      this.floorY += Math.abs(dy) > 0.6 ? dy : dy * Math.min(1, dt * 12);
    }
    p.y = this.floorY;
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

  // v18: quem é quem. Com as duas mãos, a da esquerda (na imagem) anda e a da
  // direita atira (ou o contrário, se a calibração escolheu a direita para
  // andar). Com uma mão só, ela ganha o papel pelo lado em que apareceu e
  // fica com ele enquanto não sumir.
  _assignRoles() {
    // v20: o lado da visão decide (com folga no meio para não ficar trocando):
    // mão do lado esquerdo = AZUL (anda), do lado direito = VERMELHA (atira)
    const walkLeft = this.calib.locomotion !== 'right';
    const vis = this.hands.hands.filter((h) => h.visible);
    for (const h of this.hands.hands) if (!h.visible) h.role = null;
    const roleOf = (left) => (left === walkLeft ? 'walk' : 'gun');
    const x = (h) => h.camPts[9].x / Math.max(0.15, -h.camPts[9].z); // ângulo (tangente) na visão
    if (vis.length === 2) {
      const [a, b] = x(vis[0]) <= x(vis[1]) ? vis : [vis[1], vis[0]];
      a.role = roleOf(true);
      b.role = roleOf(false);
    } else if (vis.length === 1) {
      const h = vis[0], hx = x(h), M = CONFIG.ROLES.CENTER_SLACK;
      if (hx < -M) h.role = roleOf(true);
      else if (hx > M) h.role = roleOf(false);
      else if (!h.role) h.role = this._lastRole || roleOf(hx < 0);
      this._lastRole = h.role;
    }
  }

  // mão da arma / de andar: indicador esticado e médio dobrado (pistolinha / apontar)
  _isPointing(h) { return this.gun._isPistol(h, this.calib.thresholds); }

  // direção para onde o indicador aponta (no mundo), misturada com a direção
  // do olho até a mão (a ponta do dedo sozinha treme). Retorna em out.
  _fingerDir(h, out, blend) {
    const P = h.worldPts;
    out.subVectors(P[8], P[5]);
    const L = out.length();
    this.camera.getWorldPosition(this._eyeP);
    this._dirB.copy(P[5]).add(P[9]).multiplyScalar(0.5).sub(this._eyeP).normalize();
    if (L < 1e-4) return out.copy(this._dirB);
    out.divideScalar(L).multiplyScalar(blend).addScaledVector(this._dirB, 1 - blend).normalize();
    return out;
  }

  // v19: soco/tapa (lógica em melee.js); aqui só os efeitos e o placar
  _updateMelee(now, dt) {
    for (const e of this.melee.update(now, dt, this.hands.hands, this.horde, this.rig.position, this.camera)) {
      const z = e.zombie;
      this.sfx.punch(e.kill);
      this._pow(e.point, e.kill);
      if (!e.kill) { this.toast(`👊 ${z.punches}/${e.need}`); continue; }
      if (z.dummy) {
        if (this.state === 'tutorial') { this.tutorial.shoot = true; this.tutorial.aim = true; this.toast('👊 Nocaute no zumbi de treino!'); }
        continue;
      }
      const left = this.horde.alive;
      this.toast(`👊 Nocaute! Faltam ${left}`);
      if (this.state === 'playing' && left === 0) this.endGame(true);
    }
  }

  // efeito do soco: estrela de pancada (anel + clarão) que cresce e some
  _pow(p, big) {
    if (!this._powGeo) { this._powGeo = new THREE.RingGeometry(0.6, 1, 20); this._powStar = new THREE.SphereGeometry(1, 8, 6); }
    const ring = new THREE.Mesh(this._powGeo, new THREE.MeshBasicMaterial({ color: big ? 0xffd000 : 0xffffff, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    ring.position.copy(p);
    ring.lookAt(this.camera.getWorldPosition(this._eyeP));
    ring.renderOrder = 35;
    this.scene.add(ring);
    this._fx.push({ m: ring, t: 0, size: big ? 0.35 : 0.2 });
    this._puff(p, big ? 0xffb000 : 0xfff2b0, big ? 0.3 : 0.16);
  }

  // mão fechada (para a mão azul: fechar = parar de andar)
  _isFistLike(h) {
    if (h.gesture === 'fist') return true;
    const r = this.gun._reach(h);
    return !!r && Math.max(r.index, r.middle) < CONFIG.GUN.FIRE_REACH;
  }

  // seta amarela na borda da visão, para o lado por onde a mão saiu da câmera
  _updateEdgeArrow(now, active) {
    const H = CONFIG.HANDS;
    for (const h of this.hands.hands) {
      const was = h._wasVis; h._wasVis = h.visible;
      if (!active || !was || h.visible) continue;
      const c = h.lastC, dx = c.x - 0.5, dy = -(c.y - 0.5);
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 0.5 - H.EDGE_MARGIN) continue; // sumiu no meio: não é borda
      const a = Math.atan2(dy, dx);
      this.edgeArrow.position.set(Math.cos(a) * 0.13, Math.sin(a) * 0.08, -0.5);
      this.edgeArrow.rotation.set(0, 0, a - Math.PI / 2);
      this._edgeUntil = now + 1600;
    }
    const on = active && now < this._edgeUntil;
    this.edgeArrow.visible = on && Math.floor(now / 200) % 2 === 0;
  }

  _recenterGesture(now) {
    const both = this.hands.hands.every((h) => this._isPalm(h));
    if (!both) { this._bothPalmAt = 0; this._recentered = false; return; }
    if (!this._bothPalmAt) this._bothPalmAt = now;
    if (!this._recentered && now - this._bothPalmAt > CONFIG.LOBBY.RECENTER_HOLD_MS) {
      this._recentered = true;
      this.recenter();
      this.toast('⟲ Visão recentrada');
    }
  }

  _debugWalk(dt, move) {
    const fwd = this.camera.getWorldDirection(this._v);
    fwd.y = 0; fwd.normalize();
    const nx = this.rig.position.x + (fwd.x * move.f - fwd.z * move.r) * 2 * dt;
    const nz = this.rig.position.z + (fwd.z * move.f + fwd.x * move.r) * 2 * dt;
    if (this.world.isFree(nx, nz, 0.25)) { this.rig.position.x = nx; this.rig.position.z = nz; }
  }

  _updateHud(active) {
    const hud = document.getElementById('hud');
    hud.classList.toggle('active', active);
    if (!active) { if (this.stereo || this.xrActive) this.hud3d.update({ timer: this.state === 'ended' ? 'fim' : '' }); return; }
    const info = {};
    const tl = document.getElementById('timer');
    const hearts = '❤'.repeat(Math.max(0, this.hp));
    if (this.state === 'playing') {
      tl.textContent = info.timer = fmtTime(this.timeLeft);
      tl.classList.toggle('urgent', this.timeLeft < 30);
      document.getElementById('count').textContent = info.count = `🧟 ${this.horde.alive} ${hearts}`;
    } else {
      tl.textContent = info.timer = 'tutorial';
      document.getElementById('count').textContent = info.count = '';
    }
    // bússola: zumbi vivo mais perto
    let near = null;
    for (const z of this.horde.list) {
      if (z.dead || (z.dummy && this.state === 'playing')) continue;
      const d = z.m.root.position.distanceTo(this.rig.position);
      if (!near || d < near.dist) near = { z, dist: d };
    }
    const comp = document.getElementById('compass');
    if (!near) { comp.hidden = true; } else {
      comp.hidden = false;
      const zp = near.z.m.root.position;
      const local = this.camera.worldToLocal(this._v.set(zp.x, zp.y + 1.2, zp.z));
      const ang = Math.atan2(local.x, -local.z);
      document.getElementById('compass-arrow').style.transform = `rotate(${ang}rad)`;
      document.getElementById('compass-text').textContent = `🧟 ${near.dist.toFixed(0)} m`;
      info.dist = `${near.dist.toFixed(0)} m`; info.arrowAngle = ang; info.up = false;
    }
    if (this.locoMode !== 'teleporte' && this.runner.speed > 0.2) info.count = `${info.count || ''} 🏃`;
    if (this.stereo || this.xrActive) this.hud3d.update(info);
    const input = this.debug.input;
    document.getElementById('crosshair').classList.toggle('on', input.pinch || input.fist || input.aim);
  }

  _updateCoach(active) {
    const tut = this.state === 'tutorial';
    const t = this.tutorial;
    const cur = tut ? (!t.walk ? 'walk' : !t.aim ? 'aim' : !t.shoot ? 'shoot' : null) : null;
    const notes = {
      walk: 'Mão <b>ESQUERDA</b> (azul): <b>palma bem aberta ✋</b>, dedos esticados, por um instante = anda para onde <b>olha</b>. Feche ou abaixe = para.',
      aim: 'A <b>mira é o ponto no meio da visão</b>: olhe para o zumbi (a mira fica amarela). Mão <b>DIREITA</b> (vermelha): faça a <b>pistolinha 👉</b>.',
      shoot: 'Olhando para o zumbi, segure a <b>pistolinha 👉</b>: atira sozinho; a <b>barra</b> embaixo da mira mostra a recarga. De perto, <b>socos</b> 👊 também valem.',
    };
    const g = this.gun.state;
    this.coach.update({
      show: active,
      stereo: this.stereo || this.xrActive,
      title: tut ? (cur ? 'Tutorial' : 'Pronto! Começando…') : '',
      cur,
      done: tut ? { ...t } : {},
      active: { walk: this.runner.speed > 0.2, aim: this.gun.aiming, shoot: performance.now() - this.gun.lastShot < 350 },
      gun: g === 'ready' ? 'ready' : g === 'off' ? 'off' : 'reload',
      note: tut && cur ? notes[cur] : '',
    });
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

// Tela vermelha ao levar mordida (presa à câmera: funciona no óculos também).
function makeHurt() {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ color: 0xb00000, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
  m.position.z = -0.11;
  m.renderOrder = 41;
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
