// Rotação do celular -> rotação da câmera 3D.
// Usa RelativeOrientationSensor (Chrome Android, menor latência) e cai para
// DeviceOrientationEvent se não estiver disponível. No PC, arrastar o mouse gira.
import * as THREE from 'three';

const Q_WORLD = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const DEG = Math.PI / 180;

export class OrientationController {
  constructor(camera) {
    this.camera = camera;
    this.source = 'nenhum';
    this.deviceQ = new THREE.Quaternion();
    this.offset = new THREE.Quaternion();
    this.hasData = false;
    this.eventCount = 0;
    this.manualYaw = 0;
    this.manualPitch = 0;
    this._euler = new THREE.Euler();
    this._q0 = new THREE.Quaternion();
    this._fwd = new THREE.Vector3();
    this._onDO = this._onDeviceOrientation.bind(this);
  }

  // Precisa ser chamado a partir de um toque do usuário (iOS exige).
  async requestPermission() {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r !== 'granted') return false;
      }
    } catch (e) { console.warn('Permissão de orientação:', e); return false; }
    return true;
  }

  async start(mode = 'auto') {
    this.stop();
    if (mode !== 'event' && 'RelativeOrientationSensor' in window) {
      const ok = await this._startSensor();
      if (ok) return this.source;
    }
    window.addEventListener('deviceorientation', this._onDO);
    this.source = 'deviceorientation';
    return this.source;
  }

  stop() {
    window.removeEventListener('deviceorientation', this._onDO);
    if (this.sensor) { try { this.sensor.stop(); } catch (e) { /* ignore */ } this.sensor = null; }
    this.hasData = false;
  }

  _startSensor() {
    return new Promise((resolve) => {
      let done = false;
      const finish = (ok) => { if (!done) { done = true; resolve(ok); } };
      try {
        const s = new RelativeOrientationSensor({ frequency: 60, referenceFrame: 'screen' });
        s.addEventListener('reading', () => {
          if (!s.quaternion) return;
          const [x, y, z, w] = s.quaternion;
          // Sensor: quaternion do aparelho em relação à Terra (Z para cima).
          // Three.js: Y para cima -> gira -90° em X.
          this.deviceQ.set(x, y, z, w).premultiply(Q_WORLD);
          this.hasData = true;
          this.eventCount++;
          finish(true);
        });
        s.addEventListener('error', (e) => { console.warn('Sensor falhou:', e.error); try { s.stop(); } catch (_) { /* */ } finish(false); });
        s.start();
        this.sensor = s;
        this.source = 'RelativeOrientationSensor';
        setTimeout(() => { if (!this.hasData) { try { s.stop(); } catch (_) { /* */ } this.sensor = null; finish(false); } }, 1200);
      } catch (e) {
        console.warn('Sensor indisponível:', e);
        finish(false);
      }
    });
  }

  _onDeviceOrientation(e) {
    if (e.alpha === null && e.beta === null && e.gamma === null) return; // PC sem sensor
    const alpha = (e.alpha || 0) * DEG;
    const beta = (e.beta || 0) * DEG;
    const gamma = (e.gamma || 0) * DEG;
    const orient = ((screen.orientation && screen.orientation.angle) || window.orientation || 0) * DEG;
    // Fórmula clássica (antigo DeviceOrientationControls do three.js)
    this._euler.set(beta, alpha, -gamma, 'YXZ');
    this.deviceQ.setFromEuler(this._euler);
    this.deviceQ.multiply(this._q0.set(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)));
    this.deviceQ.multiply(this._q0.setFromAxisAngle(Z_AXIS, -orient));
    this.hasData = true;
    this.eventCount++;
  }

  // Faz a direção atual virar "frente" (-Z do mundo / do jogador).
  recenter() {
    if (this.hasData) {
      this._fwd.set(0, 0, -1).applyQuaternion(this.deviceQ);
      const yaw = Math.atan2(-this._fwd.x, -this._fwd.z);
      this.offset.setFromAxisAngle(Y_AXIS, -yaw);
    } else {
      this.manualYaw = 0;
      this.manualPitch = 0;
    }
  }

  // Arrastar com mouse/dedo (só quando não há sensor)
  addManual(dx, dy) {
    this.manualYaw -= dx * 0.005;
    this.manualPitch = THREE.MathUtils.clamp(this.manualPitch - dy * 0.005, -1.45, 1.45);
  }

  update() {
    if (this.hasData) {
      this.camera.quaternion.multiplyQuaternions(this.offset, this.deviceQ);
    } else {
      this._euler.set(this.manualPitch, this.manualYaw, 0, 'YXZ');
      this.camera.quaternion.setFromEuler(this._euler);
    }
  }
}
