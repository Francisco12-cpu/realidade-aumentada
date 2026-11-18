// Opções do jogador (som, vibração, vinheta, modo feira), salvas no aparelho.
import { CONFIG } from './config.js';

const DEFAULTS = { sound: true, vibrate: true, vignette: true, feira: false, tutorial: true };

export function loadOptions() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(CONFIG.OPTIONS_KEY) || '{}') || {}; } catch (e) { /* sem armazenamento */ }
  const o = { ...DEFAULTS, ...saved };
  // ?feira no link liga o modo feira (?feira=0 desliga)
  try {
    const q = new URLSearchParams(location.search);
    if (q.has('feira')) o.feira = q.get('feira') !== '0';
  } catch (e) { /* */ }
  return o;
}

export function saveOptions(o) {
  try { localStorage.setItem(CONFIG.OPTIONS_KEY, JSON.stringify(o)); } catch (e) { /* */ }
}
