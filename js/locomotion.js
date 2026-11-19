// Locomoção: o jogador anda para onde está OLHANDO.
//  Modo 'palma' (padrão, mais simples): palma aberta = anda; fechou/abaixou = para.
//    Também anda com o botão do óculos (WebXR), o botão 🏃 ou a tecla W.
//  Modo 'correr': balançar as mãos na frente da câmera ou correr parado
//    (sensor de movimento); quanto mais forte, mais rápido.
// Paredes bloqueiam (o jogador desliza nelas).
import * as THREE from 'three';
import { CONFIG } from './config.js';

const R = CONFIG.RUN;

export class Runner {
  constructor(rig, eye, camera, world, hooks = {}) {
    this.rig = rig;
    this.eye = eye;           // grupo da altura dos olhos (balanço do passo)
    this.camera = camera;
    this.world = world;
    this.hooks = hooks;
    this.speed = 0;           // m/s atual (suavizada)
    this.handEnergy = 0;      // 0..1
    this.jogEnergy = 0;       // 0..1
    this.source = '—';
    this.distance = 0;        // metros percorridos (tutorial)
    this.bobPhase = 0;
    this.enabled = true;
    this.useSwing = false;    // modo 'correr' (balanço/corrida parada)
    this.maxSpeed = R.WALK_SPEED;
    this.manualSource = 'botão';
    this.dir = null;          // v18: direção de andar (mão azul); null = para onde olha
    // histórico de movimento das mãos para detectar "vai e volta"
    this._hist = { left: [], right: [] };
    this._prev = { left: null, right: null };
    // sensor de movimento (corrida parada)
    this._acc = [];           // [{t, v}] aceleração vertical (sem gravidade)
    this._g = new THREE.Vector3(0, 9.8, 0);
    this._onMotion = this._onMotion.bind(this);
    this._v = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
  }

  startSensors() {
    if (this._sensorOn) return;
    this._sensorOn = true;
    window.addEventListener('devicemotion', this._onMotion);
  }

  _onMotion(e) {
    const g = e.accelerationIncludingGravity;
    if (!g || g.x === null) return;
    // gravidade estimada por média lenta; vertical = projeção na direção da gravidade
    this._g.x += (g.x - this._g.x) * 0.05;
    this._g.y += (g.y - this._g.y) * 0.05;
    this._g.z += (g.z - this._g.z) * 0.05;
    const gl = this._g.length() || 9.8;
    const vert = (g.x * this._g.x + g.y * this._g.y + g.z * this._g.z) / gl - gl;
    const t = performance.now();
    this._acc.push({ t, v: vert });
    while (this._acc.length && t - this._acc[0].t > 1200) this._acc.shift();
  }

  // Energia da corrida parada: precisa de "quiques" (subida/descida) repetidos.
  _jog(now) {
    const a = this._acc;
    if (a.length < 10) return 0;
    let sum = 0, n = 0, flips = 0, lastSign = 0;
    for (const s of a) {
      if (now - s.t > R.JOG_WINDOW_MS) continue;
      sum += s.v * s.v; n++;
      if (Math.abs(s.v) > R.JOG_FLIP_ACC) {
        const sg = Math.sign(s.v);
        if (lastSign && sg !== lastSign) flips++;
        lastSign = sg;
      }
    }
    if (!n) return 0;
    const rms = Math.sqrt(sum / n);
    if (flips < R.JOG_MIN_FLIPS) return 0;
    return THREE.MathUtils.clamp((rms - R.JOG_START) / (R.JOG_FULL - R.JOG_START), 0, 1);
  }

  // Energia do balanço das mãos: velocidade da palma com vai-e-volta.
  _handsEnergy(hands, now, dt) {
    let best = 0;
    for (const h of hands) {
      const hist = this._hist[h.side];
      if (!h.visible || h.gesture === 'pinch' || h.gesture === 'fist') { hist.length = 0; this._prev[h.side] = null; continue; }
      const p = h.camPts[9];
      const prev = this._prev[h.side];
      if (prev && dt > 0) {
        const vx = (p.x - prev.x) / dt, vy = (p.y - prev.y) / dt;
        hist.push({ t: now, vx, vy });
      }
      this._prev[h.side] = p.clone();
      while (hist.length && now - hist[0].t > R.SWING_WINDOW_MS) hist.shift();
      if (hist.length < 6) continue;
      // eixo dominante (horizontal ou vertical) e número de inversões
      let sx = 0, sy = 0;
      for (const s of hist) { sx += Math.abs(s.vx); sy += Math.abs(s.vy); }
      const key = sx > sy ? 'vx' : 'vy';
      let flips = 0, last = 0, speed = 0;
      for (const s of hist) {
        const v = s[key];
        speed += Math.abs(v);
        if (Math.abs(v) > R.SWING_FLIP_SPEED) {
          const sg = Math.sign(v);
          if (last && sg !== last) flips++;
          last = sg;
        }
      }
      speed /= hist.length;
      if (flips < R.SWING_MIN_FLIPS) continue;
      best = Math.max(best, THREE.MathUtils.clamp((speed - R.SWING_START) / (R.SWING_FULL - R.SWING_START), 0, 1));
    }
    return best;
  }

  // manualRun: botão "Correr" / tecla W (0..1)
  update(nowMs, dt, hands, manualRun, blocked) {
    const k = 1 - Math.exp(-dt * R.ENERGY_SMOOTH);
    const swing = this.useSwing && R.USE_HANDS ? this._handsEnergy(hands, nowMs, dt) : 0;
    const jog = this.useSwing && R.USE_JOG ? this._jog(nowMs) : 0;
    this.handEnergy += (swing - this.handEnergy) * k;
    this.jogEnergy += (jog - this.jogEnergy) * k;
    let e = Math.max(this.handEnergy, this.jogEnergy, manualRun || 0);
    this.source = e < 0.02 ? '—' : manualRun >= e ? this.manualSource : this.handEnergy >= this.jogEnergy ? 'balanço das mãos' : 'corrida parada';
    if (!this.enabled || blocked) e = 0;

    const target = e * this.maxSpeed;
    const rate = target > this.speed ? R.ACCEL : R.DECEL;
    this.speed += Math.sign(target - this.speed) * Math.min(Math.abs(target - this.speed), rate * dt);

    if (this.speed > 0.01) {
      if (this.dir) this._fwd.copy(this.dir); else this.camera.getWorldDirection(this._fwd);
      this._fwd.y = 0;
      if (this._fwd.lengthSq() < 1e-6) return;
      this._fwd.normalize();
      // v32: a direção muda suave (a cabeça treme um pouco: o andar não treme junto)
      if (!this._sf || this.speed < 0.05) this._sf = this._fwd.clone();
      else this._sf.lerp(this._fwd, 1 - Math.exp(-dt * R.TURN_SMOOTH)).normalize();
      this._fwd.copy(this._sf);
      const step = this.speed * dt;
      const pos = this.rig.position;
      const r = CONFIG.TELEPORT.PLAYER_RADIUS;
      const nx = pos.x + this._fwd.x * step, nz = pos.z + this._fwd.z * step;
      // desliza na parede: tenta X e Z separadamente
      const free = (x, z) => this.world.isFree(x, z, r) && !this._hitsTarget(x, z);
      const ox = pos.x, oz = pos.z;
      if (free(nx, nz)) { pos.x = nx; pos.z = nz; } else if (free(nx, pos.z)) pos.x = nx; else if (free(pos.x, nz)) pos.z = nz;
      const moved = Math.hypot(pos.x - ox, pos.z - oz);
      this.distance += moved;
      if (moved > 0) this.hooks.onMove && this.hooks.onMove(this.distance);
      // balanço do passo (mais rápido = passos mais rápidos)
      this.bobPhase += dt * (5 + this.speed * 3.2);
    }
    const amp = R.BOB * Math.min(1, this.speed / R.MAX_SPEED);
    this.eye.position.y = CONFIG.EYE_HEIGHT + Math.abs(Math.sin(this.bobPhase)) * amp;
    document.body.classList.toggle('running', this.speed > R.MAX_SPEED * 0.55);
  }

  _hitsTarget(x, z) {
    for (const t of this.world.targets) {
      if (t.center.y < 1.2 && Math.hypot(t.center.x - x, t.center.z - z) < 0.45) return true;
    }
    return false;
  }

  stop() {
    this.speed = 0;
    this.handEnergy = 0;
    this.jogEnergy = 0;
    this.eye.position.y = CONFIG.EYE_HEIGHT;
    document.body.classList.remove('running');
  }
}
