// Controle de videogame (v25): Xbox (Bluetooth/USB) ou qualquer controle no
// padrão "standard" do navegador. Modo para quem não tem câmera boa: perde um
// pouco da imersão, mas é mais fácil e não depende do rastreamento das mãos.
//
//  analógico esquerdo = andar (frente/trás/lados, para onde você olha)
//  analógico direito  = girar (e olhar para cima/baixo fora do óculos)
//  RT (ou A no jogo)  = atirar (segurar = atira a cada recarga)
//  X = soco · Y = recentrar · LB/RB = giro rápido de 45° · A/Start = começar
import { CONFIG } from './config.js';

// botões do mapeamento "standard"
const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11 };

// folga do meio + curva: perto do meio anda devagar e preciso, no fim corre (v32)
const dz = (v, d) => { if (Math.abs(v) < d) return 0; const k = (Math.abs(v) - d) / (1 - d); return Math.sign(v) * Math.pow(k, 1.5); };

export class Pad {
  constructor() {
    this.connected = false;
    this.name = '';
    this.state = { move: { x: 0, y: 0 }, look: { x: 0, y: 0 }, fire: false, punch: false };
    this._prev = [];
    this.gp = null;
    window.addEventListener('gamepadconnected', (e) => { this.name = e.gamepad.id; this.onConnect && this.onConnect(e.gamepad); });
    window.addEventListener('gamepaddisconnected', () => { this.onDisconnect && this.onDisconnect(); });
  }

  _get() {
    if (!navigator.getGamepads) return null;
    let best = null;
    for (const g of navigator.getGamepads() || []) {
      if (!g || !g.connected) continue;
      if (g.mapping === 'standard') return g;
      best = best || g;
    }
    return best;
  }

  // Chamar uma vez por quadro. Retorna o estado (com "pressed" = acabou de apertar).
  poll() {
    const g = this._get();
    const s = this.state;
    this.gp = g;
    this.connected = !!g;
    const P = CONFIG.PAD;
    const pressedNow = [];
    if (!g) {
      s.move.x = s.move.y = s.look.x = s.look.y = 0;
      s.fire = s.punch = false; s.pressed = {};
      this._prev = [];
      return s;
    }
    this.name = g.id;
    const ax = g.axes || [];
    s.move.x = dz(ax[0] || 0, P.DEADZONE);
    s.move.y = dz(ax[1] || 0, P.DEADZONE);
    s.look.x = dz(ax[2] || 0, P.DEADZONE);
    s.look.y = dz(ax[3] || 0, P.DEADZONE);
    const btn = (i) => { const b = g.buttons[i]; return !!b && (b.pressed || b.value > 0.5); };
    for (let i = 0; i < g.buttons.length; i++) pressedNow[i] = btn(i) && !this._prev[i];
    this._prev = g.buttons.map((b, i) => btn(i));
    s.fire = btn(B.RT) || btn(B.LT);
    s.punch = btn(B.X) || btn(B.B);
    s.pressed = {
      a: !!pressedNow[B.A], start: !!pressedNow[B.START], y: !!pressedNow[B.Y],
      x: !!pressedNow[B.X] || !!pressedNow[B.B], lb: !!pressedNow[B.LB], rb: !!pressedNow[B.RB],
      any: pressedNow.some(Boolean),
    };
    return s;
  }

  // vibração (se o controle tiver)
  rumble(ms = 120, strong = 0.6, weak = 0.4) {
    const g = this.gp;
    const a = g && g.vibrationActuator;
    if (!a || !a.playEffect) return;
    try { a.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: weak }); } catch (e) { /* */ }
  }
}
