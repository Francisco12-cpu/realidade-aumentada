// Placar e ranking do dia, guardados só neste celular (localStorage).
// Pontos = 100 por zumbi eliminado + 2 por segundo que sobrou (só se eliminou todos).
import { CONFIG } from './config.js';

const KEY = 'cacador-sinal-ranking-v1';

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function loadAll() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') || []; } catch (e) { return []; }
}

function saveAll(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(-300))); return true; } catch (e) { return false; }
}

export function score(fixed, win, timeLeft) {
  return fixed * 100 + (win ? Math.max(0, Math.ceil(timeLeft)) * 2 : 0);
}

// Guarda uma partida e devolve o registro (com id) e a posição no ranking do dia.
export function addResult({ fixed, total, used, timeLeft, win, feira }) {
  const list = loadAll();
  const date = today();
  const n = list.filter((r) => r.date === date && r.feira === feira).length + 1;
  const rec = {
    id: `${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    name: `Jogador ${n}`,
    fixed, total, used: Math.round(used), win, feira, date,
    points: score(fixed, win, timeLeft),
  };
  list.push(rec);
  saveAll(list);
  return { rec, place: topToday(feira, 1000).findIndex((r) => r.id === rec.id) + 1 };
}

export function rename(id, name) {
  const list = loadAll();
  const r = list.find((x) => x.id === id);
  if (!r) return;
  r.name = String(name).trim().slice(0, CONFIG.RANKING.NAME_MAX) || r.name;
  saveAll(list);
}

// Melhores do dia: mais pontos, depois menos tempo.
export function topToday(feira, n = CONFIG.RANKING.SIZE) {
  const date = today();
  return loadAll()
    .filter((r) => r.date === date && r.feira === feira)
    .sort((a, b) => b.points - a.points || a.used - b.used)
    .slice(0, n);
}

export function clearToday(feira) {
  const date = today();
  saveAll(loadAll().filter((r) => !(r.date === date && r.feira === feira)));
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function fmt(s) { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

export function rankingTable(feira, highlightId = null) {
  const top = topToday(feira);
  if (!top.length) return '<p class="small">Ninguém jogou hoje ainda. Seja o primeiro!</p>';
  const rows = top.map((r, i) => `<tr class="${r.id === highlightId ? 'me' : ''}">
      <td>${['🥇', '🥈', '🥉'][i] || i + 1}</td><td>${esc(r.name)}</td><td>${r.points}</td>
      <td>${r.fixed}/${r.total}</td><td>${fmt(r.used)}</td></tr>`).join('');
  return `<table class="rank"><thead><tr><th></th><th>Nome</th><th>Pontos</th><th>🧟</th><th>Tempo</th></tr></thead><tbody>${rows}</tbody></table>`;
}
