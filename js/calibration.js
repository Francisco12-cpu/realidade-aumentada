// Calibração + tutorial (tela inicial).
// Protótipo de teste: os textos são longos de propósito.
import { CONFIG } from './config.js';
import { computeFeatures, classify, averageFeatures, thresholdsFromPoses, GESTURE_LABELS } from './gestures.js';
import { defaultVrSettings, saveVrSettings } from './vr.js';
import { rankingTable, clearToday } from './ranking.js';

// ---------------------------------------------------------------------
// Armazenamento (localStorage, sempre com try/catch)
// ---------------------------------------------------------------------
export function defaultCalib() {
  return {
    version: 1,
    done: false,
    flipHandedness: CONFIG.HANDS.FLIP_HANDEDNESS,
    locomotion: 'left',
    thresholds: JSON.parse(JSON.stringify(CONFIG.GESTURE.DEFAULT_THRESHOLDS)),
    reach: null,
    depth: { rawNear: CONFIG.HANDS.RAW_NEAR, rawFar: CONFIG.HANDS.RAW_FAR },
    poses: {},
  };
}

export function loadCalib() {
  try {
    const s = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (!s) return null;
    const c = JSON.parse(s);
    if (!c || c.version !== 1) return null;
    const d = defaultCalib();
    return { ...d, ...c, thresholds: { ...d.thresholds, ...c.thresholds }, depth: { ...d.depth, ...c.depth } };
  } catch (e) { console.warn('Falha ao ler calibração', e); return null; }
}

export function saveCalib(c) {
  try { localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(c)); return true; } catch (e) { console.warn('Falha ao salvar calibração', e); return false; }
}

export function clearCalib() {
  try { localStorage.removeItem(CONFIG.STORAGE_KEY); } catch (e) { /* ignore */ }
}

// ---------------------------------------------------------------------
// Interface do overlay
// ---------------------------------------------------------------------
const POSES = [
  { id: 'neutral', name: 'Mão normal', how: 'Deixe a mão relaxada, meio aberta, do jeito que ela fica quando você não está fazendo nada. Esse é o estado "neutro": não faz nada no jogo.' },
  { id: 'gun', name: 'Pistolinha', how: 'Estique o INDICADOR para frente e o POLEGAR para cima. Dobre o médio, o anelar e o mínimo. Esse gesto MIRA o teleporte.' },
  { id: 'open', name: 'Palma aberta', how: 'Abra a mão toda, dedos esticados e separados, palma virada para frente. Depois da pistolinha, isso CONFIRMA o teleporte.' },
  { id: 'fist', name: 'Punho fechado', how: 'Feche a mão com força, todos os dedos dobrados, polegar por cima. Serve para PEGAR/SEGURAR.' },
  { id: 'pinch', name: 'Pinça', how: 'Encoste a ponta do POLEGAR na ponta do INDICADOR (como se fosse pegar um grão de arroz). Os outros dedos podem ficar soltos. Serve para PEGAR FIO e ARRASTAR.' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class CalibrationFlow {
  constructor(app) {
    this.app = app;
    this.el = document.getElementById('overlay');
    this.liveTimer = null;
    this.samplesPoses = {};
  }

  _show(title, html, buttons = [], { compact = false } = {}) {
    this._stopLive();
    this.el.hidden = false;
    this.el.classList.toggle('compact', compact);
    // folha embaixo -> depuração/prévia vão para cima (e vice-versa)
    document.body.classList.toggle('sheet-bottom', !compact);
    this.el.innerHTML = `<div class="sheet"><h2>${title}</h2><div class="body">${html}</div><div class="live" id="live"></div><div class="btns"></div></div>`;
    const box = this.el.querySelector('.btns');
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.textContent = b.label;
      if (b.cls) btn.className = b.cls;
      btn.addEventListener('click', (e) => { e.stopPropagation(); b.onClick(btn); });
      box.appendChild(btn);
    }
  }

  _live(fn, ms = 120) {
    this._stopLive();
    const live = this.el.querySelector('#live');
    const tick = () => { if (live) live.innerHTML = fn(); };
    tick();
    this.liveTimer = setInterval(tick, ms);
  }

  _stopLive() { if (this.liveTimer) { clearInterval(this.liveTimer); this.liveTimer = null; } }

  hide() { this._stopLive(); this.el.hidden = true; this.el.innerHTML = ''; document.body.classList.remove('sheet-bottom'); }

  // Mão "ativa" para gravação: a única presente, ou a de maior confiança.
  _activeHand() {
    const hs = this.app.hands.hands.filter((h) => h.present);
    if (!hs.length) return null;
    return hs.sort((a, b) => b.score - a.score)[0];
  }

  _handStatus() {
    const hs = this.app.hands.hands.filter((h) => h.visible);
    if (!this.app.hands.landmarker) return '<span class="bad">Modelo das mãos não carregado.</span>';
    if (!hs.length) return '<span class="bad">Nenhuma mão detectada</span> — coloque a mão na frente da câmera traseira.';
    return hs.map((h) => `Mão <b>${h.side === 'left' ? 'esquerda' : 'direita'}</b>: ${GESTURE_LABELS[h.gesture]}`).join(' · ');
  }

  // Grava amostras enquanto houver mão, por durationMs (com contagem regressiva).
  async _record(btn, durationMs, onSample, countdown = 2) {
    if (btn) btn.disabled = true;
    const live = this.el.querySelector('#live');
    this._stopLive();
    for (let i = countdown; i > 0; i--) { if (live) live.innerHTML = `Prepare… <b>${i}</b>`; await sleep(700); }
    const t0 = performance.now();
    let last = null, n = 0;
    await new Promise((resolve) => {
      const step = () => {
        const now = performance.now();
        const res = this.app.hands.lastResult;
        if (res !== last) {
          last = res;
          const h = this._activeHand();
          if (h) { onSample(h, res); n++; }
        }
        const left = Math.max(0, durationMs - (now - t0));
        if (live) live.innerHTML = `Gravando… ${(left / 1000).toFixed(1)}s — amostras: <b>${n}</b>`;
        if (now - t0 < durationMs) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    });
    if (btn) btn.disabled = false;
    return n;
  }

  // ------------------------------------------------------------------
  // Passos
  // ------------------------------------------------------------------
  welcome() {
    const saved = loadCalib();
    // ?auto no link: tela inicial só com o botão grande (bom para a feira)
    let auto = false;
    try { auto = new URLSearchParams(location.search).has('auto') && !this._full; } catch (e) { /* */ }
    const pad = !!this.app.options.controle;
    const headset = { label: pad ? '▶ Jogar no óculos (🎮 controle)' : '▶ Jogar no óculos (✋ mãos)', cls: 'primary big', onClick: () => this.app.playInHeadset() };
    // v25: escolha do modo, sempre no topo
    const modeHtml = `<div class="modes">
        <button class="mode ${pad ? '' : 'on'}" data-mode="maos">✋ Mãos<br><span class="small">câmera do celular</span></button>
        <button class="mode ${pad ? 'on' : ''}" data-mode="controle">🎮 Controle<br><span class="small">Xbox (Bluetooth)</span></button>
      </div>
      ${pad ? `<p class="small">No óculos: <b>analógico esquerdo</b> anda, <b>analógico direito</b> gira, <b>olhe</b> para mirar, <b>RT</b> atira, <b>X</b> soco, <b>Y</b> recentra, <b>A</b> começa. Não precisa de câmera nem de calibrar.</p>
        <p class="small" id="pad-status"></p>` : ''}`;
    if (auto) {
      this._show(`🧟 Escola Zumbi <span class="small">${CONFIG.VERSION}</span>`, `${modeHtml}
        <p>Toque no botão, <b>coloque o celular no óculos</b> e olhe para frente. O jogo começa sozinho em ${CONFIG.LOBBY.COUNTDOWN_S} s (ou ${pad ? 'aperte <b>A</b>' : 'mostre a <b>✋ mão aberta</b>'}).</p>
        ${saved ? '<p class="ok">✔ Usando a calibração salva.</p>' : '<p class="small">Sem calibração salva: usa o padrão.</p>'}
        <p class="small" id="map-status">${this.app.mapText}</p>`, [
        headset,
        { label: 'Mais opções', onClick: () => { this._full = true; this.welcome(); } },
      ]);
      this._wireModes();
      return;
    }
    const html = `${modeHtml}
      <p><b>Protótipo de teste</b> do jogo <i>Escola Zumbi</i>.</p>
      <p>A escola foi tomada por <b>zumbis</b>! Ande pela escola e elimine todos antes do tempo acabar. Sem tocar no celular: <b>🎯 olhe para o zumbi = mira</b> (ponto no meio da visão), <b>👉 pistolinha da mão DIREITA = atira</b> sozinho a cada recarga (barra) e <b>✋ palma aberta da mão ESQUERDA = anda</b> para onde você olha. <b>👊 Soco rápido</b> de perto também vale.</p>
      <p>Para o primeiro teste, <b>segure o celular na frente dos olhos</b> com uma mão, com a câmera traseira apontando para frente. A outra mão fica na frente da câmera.</p>
      <p>O jogo vai pedir permissão para a <b>câmera</b> e para os <b>sensores de movimento</b>. Depois vem a calibração (uns 3 minutos) e um mini-tutorial.</p>
      ${saved ? '<p class="ok">✔ Calibração salva: toque em <b>▶ Jogar no óculos</b>, ponha o celular no óculos e pronto. Começa sozinho em ' + CONFIG.LOBBY.COUNTDOWN_S + ' s (ou mostre a ✋ mão aberta). No jogo, <b>as duas mãos abertas</b> recentram a visão.</p>' : '<p class="small">Dica: calibre uma vez; depois é só um toque para jogar no óculos.</p>'}
      ${this._optionsHtml()}
      <p class="small" id="map-status">${this.app.mapText}</p>
      <p class="small" id="offline"></p>
      <p class="small">Dica: o botão 🐞 mostra o painel de depuração (FPS, gestos, prévia da câmera).</p>`;
    const btns = [headset];
    if (pad) {
      // modo controle: não precisa de câmera nem de calibração
    } else if (saved) {
      btns.push({ label: 'Usar calibração salva → tutorial (sem óculos)', onClick: () => this._startWithSaved(saved, 'tutorial') });
      btns.push({ label: 'Ir direto para a partida', onClick: () => this._startWithSaved(saved, 'game') });
      btns.push({ label: 'Recalibrar', onClick: () => this._startFresh() });
    } else {
      btns.push({ label: 'Calibrar (uma vez só)', cls: 'primary', onClick: () => this._startFresh() });
    }
    btns.push({ label: 'Sem câmera (só botões)', onClick: () => this._startNoCamera() });
    btns.push({ label: '🏆 Ranking do dia', onClick: () => this.showRanking(() => this.welcome()) });
    btns.push({ label: '📋 Perfil (passar para outro celular)', onClick: () => this.showProfile(() => this.welcome()) });
    btns.push({ label: '❓ Ajuda do óculos', onClick: () => this.showHelp(() => this.welcome()) });
    this._show(`🧟 Escola Zumbi — teste <span class="small">${CONFIG.VERSION}</span>`, html, btns);
    this._wireOptions(() => this.welcome());
    this._wireModes();
    this._checkOffline();
  }

  // v25: botões ✋ Mãos / 🎮 Controle e o aviso de controle conectado
  _wireModes() {
    for (const b of this.el.querySelectorAll('[data-mode]')) {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.app.setOption('controle', b.dataset.mode === 'controle');
        this.welcome();
      });
    }
    const st = this.el.querySelector('#pad-status');
    if (!st) return;
    const tick = () => {
      if (!st.isConnected) { clearInterval(this._padT); return; }
      const p = this.app.pad;
      p.poll();
      st.innerHTML = p.connected ? `<span class="ok">✔ Controle conectado: ${p.name.replace(/\(.*\)/, '').trim() || 'controle'}</span>`
        : '<span class="bad">Controle não encontrado.</span> Ligue o controle no Bluetooth do celular e <b>aperte qualquer botão</b> dele.';
    };
    clearInterval(this._padT);
    tick();
    this._padT = setInterval(tick, 500);
  }

  // Tela entre um visitante e outro (calibração e permissões continuam valendo).
  nextPlayer() {
    const feira = this.app.options.feira;
    const html = `
      <p><b>Próximo jogador!</b> Elimine os zumbis da escola. <b>🎯 Olhe</b> para o zumbi, faça a <b>👉 pistolinha</b> para atirar e mostre a <b>✋ palma aberta</b> para andar.</p>
      <p>${feira ? `Partida de <b>${Math.round(CONFIG.FEIRA.GAME_TIME_S / 60)} min</b> com <b>${CONFIG.ZOMBIES.FEIRA_COUNT} zumbis</b>.` : ''}
      A mão fica <b>vermelha</b> quando a arma está pronta e <b>cinza</b> enquanto recarrega. A setinha no alto mostra o zumbi mais perto.</p>
      ${this._optionsHtml()}
      <p class="small" id="map-status">${this.app.mapText}</p>
      <p class="small" id="offline"></p>`;
    const ready = this.app.devicesReady;
    const go = (next) => {
      if (ready) { this.app.orientation.recenter(); if (next === 'tutorial') this.app.startTutorial(); else this.app.startGame(); return; }
      const saved = loadCalib();
      if (saved) this._startWithSaved(saved, next); else this._startFresh();
    };
    this._show('👤 Próximo jogador', html, [
      { label: '▶ Jogar no óculos', cls: 'primary big', onClick: () => this.app.playInHeadset() },
      { label: 'Tutorial rápido →', onClick: () => go('tutorial') },
      { label: 'Direto para a partida', onClick: () => go('game') },
      { label: '🏆 Ranking do dia', onClick: () => this.showRanking(() => this.nextPlayer()) },
      { label: 'Recalibrar (mão diferente)', onClick: () => this.app.recalibrate() },
      { label: 'Tela inicial', onClick: () => this.welcome() },
    ]);
    this._wireOptions(() => this.nextPlayer());
    this._checkOffline();
  }

  // Ranking do dia (só deste celular). Apagar pede dois toques, sem janela de confirmação.
  showRanking(back) {
    const feira = this.app.options.feira;
    let armed = false;
    this._show(`🏆 Ranking de hoje${feira ? ' (modo feira)' : ''}`, `
      <div id="rank-table">${rankingTable(feira)}</div>
      <p class="small">Pontos: 100 por zumbi eliminado + 2 por segundo que sobrou (quando elimina todos). Fica guardado só neste celular.</p>`, [
      { label: '← Voltar', cls: 'primary', onClick: back },
      { label: '🗑 Apagar ranking de hoje', onClick: (btn) => {
        if (!armed) { armed = true; btn.textContent = 'Toque de novo para apagar'; setTimeout(() => { armed = false; btn.textContent = '🗑 Apagar ranking de hoje'; }, 3000); return; }
        clearToday(feira);
        this.showRanking(back);
      } },
    ]);
  }

  // Perfil = calibração + ajustes do óculos + opções, num código só (copiar/colar).
  showProfile(back) {
    const data = {};
    for (const k of CONFIG.PROFILE_KEYS) { try { const v = localStorage.getItem(k); if (v) data[k] = JSON.parse(v); } catch (e) { /* */ } }
    const code = Object.keys(data).length ? btoa(unescape(encodeURIComponent(JSON.stringify(data)))) : '';
    this._show('📋 Perfil deste celular', `
      <p>O perfil guarda a <b>calibração das mãos</b>, os <b>ajustes do óculos</b> e as <b>opções</b>. Tudo já fica salvo neste celular sozinho.</p>
      <p>Para usar em outro celular: copie o código, mande (WhatsApp, por exemplo) e cole lá.</p>
      <textarea id="prof-code" rows="3" readonly>${code || '(nada salvo ainda: calibre primeiro)'}</textarea>
      <p>Colar um perfil:</p>
      <textarea id="prof-in" rows="3" placeholder="cole o código aqui"></textarea>
      <p class="small" id="prof-msg"></p>`, [
      { label: '← Voltar', cls: 'primary', onClick: back },
      { label: '📋 Copiar código', onClick: async () => {
        const msg = this.el.querySelector('#prof-msg');
        try { await navigator.clipboard.writeText(code); msg.textContent = 'Copiado!'; } catch (e) { this.el.querySelector('#prof-code').select(); msg.textContent = 'Selecionei o código: copie com o dedo.'; }
      } },
      { label: '📥 Usar o perfil colado', onClick: () => {
        const msg = this.el.querySelector('#prof-msg');
        try {
          const d = JSON.parse(decodeURIComponent(escape(atob(this.el.querySelector('#prof-in').value.trim()))));
          let n = 0;
          for (const k of CONFIG.PROFILE_KEYS) if (d[k]) { localStorage.setItem(k, JSON.stringify(d[k])); n++; }
          if (!n) throw new Error('vazio');
          msg.innerHTML = '<span class="ok">Perfil salvo! Recarregando…</span>';
          setTimeout(() => location.reload(), 800);
        } catch (e) { msg.innerHTML = '<span class="bad">Código inválido.</span>'; }
      } },
    ]);
  }

  // Botões liga/desliga das opções (som, vibração, vinheta, modo feira).
  _optionsHtml() {
    const o = this.app.options;
    const opt = (key, on, off) => `<button class="opt ${o[key] ? 'on' : ''}" data-opt="${key}">${o[key] ? on : off}</button>`;
    return `<div class="opts">
      ${opt('feira', '🎪 Modo feira: ligado', '🎪 Modo feira: desligado')}
      ${opt('sound', '🔊 Som', '🔇 Sem som')}
      ${opt('vibrate', '📳 Vibração', '📴 Sem vibração')}
      ${opt('vignette', '🌑 Escurecer bordas ao andar', '⚪ Bordas normais ao andar')}
      ${opt('tutorial', '🎓 Tutorial antes da partida', '⏩ Direto para a partida')}
      ${opt('parado', '🧍 Só atirar (os zumbis vêm até você)', '🚶 Andar pela escola')}
    </div>
    <p class="small">Modo feira: partida de ${Math.round(CONFIG.FEIRA.GAME_TIME_S / 60)} min, ${CONFIG.ZOMBIES.FEIRA_COUNT} zumbis, tutorial curto e volta sozinho para o próximo jogador.</p>`;
  }

  _wireOptions(redraw) {
    for (const b of this.el.querySelectorAll('[data-opt]')) {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const k = b.dataset.opt;
        this.app.setOption(k, !this.app.options[k]);
        if (k === 'sound' && this.app.options.sound) { this.app.sfx.unlock(); setTimeout(() => this.app.sfx.wire(true), 50); }
        if (k === 'vibrate' && this.app.options.vibrate) this.app.sfx.vibrate(60);
        redraw();
      });
    }
  }

  // Mostra se o jogo inteiro (com o modelo das mãos) já está guardado para usar sem internet.
  async _checkOffline() {
    const el = this.el.querySelector('#offline');
    if (!el) return;
    if (!('caches' in window) || !navigator.serviceWorker || !navigator.serviceWorker.controller) {
      if (location.hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(location.hostname)) el.textContent = '💻 Rodando pelo servidor do PC.';
      else el.textContent = '📶 Na primeira vez precisa de internet. Abra o jogo de novo para ele ficar guardado.';
      return;
    }
    try {
      const keys = await caches.keys();
      let ok = false;
      for (const k of keys) {
        const c = await caches.open(k);
        if (await c.match('https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', { ignoreVary: true })) { ok = true; break; }
      }
      el.innerHTML = ok ? '<span class="ok">✔ Jogo guardado: funciona sem internet.</span>' : '📶 Guardando o jogo para usar sem internet… (deixe a internet ligada mais um pouco)';
    } catch (e) { el.textContent = ''; }
  }

  async _init(withCamera = true) {
    this._show('Preparando…', '<p>Pedindo permissões e carregando o rastreamento das mãos. Isso pode levar alguns segundos na primeira vez.</p>', []);
    const live = this.el.querySelector('#live');
    const ok = await this.app.initDevices((msg) => { if (live) live.innerHTML = msg; }, withCamera);
    return ok;
  }

  _showInitError(retry) {
    this._show('Não deu para iniciar', `
      <p class="bad">${this.app.lastError}</p>
      <p>Confira: o link precisa ser <b>https://</b>, a permissão da câmera precisa ser aceita (cadeado na barra de endereço → Permissões) e a internet precisa estar funcionando para baixar o MediaPipe.</p>`, [
      { label: 'Tentar de novo', cls: 'primary', onClick: retry },
      { label: 'Continuar só com botões', onClick: () => { this.app.orientation.recenter(); this.app.startTutorial(); } },
    ]);
  }

  async _startWithSaved(saved, next) {
    Object.assign(this.app.calib, saved);
    if (!(await this._init(true))) { this._showInitError(() => this._startWithSaved(saved, next)); return; }
    this.app.orientation.recenter();
    if (next === 'tutorial') this.app.startTutorial(); else this.app.startGame();
  }

  async _startNoCamera() {
    await this._init(false);
    this.app.orientation.recenter();
    this.app.startTutorial();
  }

  async _startFresh() {
    Object.assign(this.app.calib, defaultCalib());
    this.app.state = 'calibration';
    if (!(await this._init(true))) { this._showInitError(() => this._startFresh()); return; }
    this.app.setDebug(true);
    this.stepRecenter();
  }

  stepRecenter() {
    const o = this.app.orientation;
    this._show('1. Direção da visão', `
      <p>Segure o celular em pé, na frente dos olhos, e olhe para frente (para onde você quer que seja a "frente" do jogo).</p>
      <p>Depois toque em <b>Recentrar</b>. Gire o corpo devagar: o mundo 3D deve girar junto.</p>
      <p class="small">Você pode recentrar a qualquer momento pelo botão ⟲ na tela.</p>`, [
      { label: 'Recentrar', cls: 'primary', onClick: () => { o.recenter(); this.app.toast('Direção recentrada'); } },
      { label: 'Próximo →', onClick: () => this.stepHandedness() },
    ]);
    this._live(() => `Sensor: <b>${o.source}</b> · ${o.hasData ? '<span class="ok">recebendo dados</span>' : '<span class="bad">sem dados (no PC, arraste a tela)</span>'}`);
  }

  stepHandedness() {
    const calib = this.app.calib;
    this._show('2. Qual é a mão esquerda?', `
      <p>A câmera traseira não espelha a imagem, então às vezes o sistema confunde esquerda e direita. Vamos conferir.</p>
      <p>Mostre <b>só a sua mão ESQUERDA</b> para a câmera (palma ou costas, tanto faz) e toque em <b>Gravar</b>. Se você segura o celular com a esquerda, troque de mão por um instante.</p>`, [
      {
        label: 'Gravar (mão esquerda)', cls: 'primary', onClick: async (btn) => {
          let left = 0, right = 0;
          await this._record(btn, 1500, (h, res) => {
            const handed = res.handedness || res.handednesses || [];
            for (const cat of handed) { if (cat[0] && cat[0].categoryName === 'Left') left++; else right++; }
          });
          if (left + right < 5) { this.app.toast('Poucas amostras — tente de novo com a mão bem visível'); return; }
          // Se o MediaPipe chamou a mão esquerda real de "Left", não precisa inverter.
          calib.flipHandedness = !(left > right);
          this.app.toast(`Rótulo do MediaPipe: ${left > right ? 'Left' : 'Right'} → inverter = ${calib.flipHandedness ? 'sim' : 'não'}`);
          this.stepLocomotion();
        },
      },
      { label: 'Pular (padrão)', onClick: () => this.stepLocomotion() },
    ]);
    this._live(() => this._handStatus());
  }

  stepLocomotion() {
    const calib = this.app.calib;
    const set = (side) => { calib.locomotion = side; this.stepPose(0); };
    this._show('3. Mão de locomoção', `
      <p>No jogo, qualquer mão pode <b>andar</b> (palma aberta) ou <b>atirar</b>. No jogo, a mão escolhida aqui fica <b>azul e anda</b>; a outra fica <b>vermelha e atira</b>. A escolha aqui só define a mão principal da calibração.</p>
      <p>Qual mão você quer usar para <b>andar</b>?</p>
      <p class="small">Teste com o celular na mão: use a mão livre para tudo — dá para trocar depois recalibrando.</p>`, [
      { label: 'Esquerda anda (padrão)', cls: calib.locomotion === 'left' ? 'primary' : '', onClick: () => set('left') },
      { label: 'Direita anda', cls: calib.locomotion === 'right' ? 'primary' : '', onClick: () => set('right') },
    ]);
    this._live(() => this._handStatus());
  }

  stepPose(i) {
    if (i >= POSES.length) { this._applyPoses(); this.stepReach(); return; }
    const pose = POSES[i];
    this._show(`4. Gestos (${i + 1}/${POSES.length}): ${pose.name}`, `
      <p>${pose.how}</p>
      <p>Faça a pose com a mão livre, bem na frente da câmera, e toque em <b>Gravar</b>. Depois de 2 segundos ele grava por 1,5 s — mantenha a pose e mexa a mão um pouquinho.</p>`, [
      {
        label: 'Gravar', cls: 'primary', onClick: async (btn) => {
          const list = [];
          const n = await this._record(btn, 1500, (h) => { if (h.wlm) list.push(computeFeatures(h.wlm)); });
          if (n < 5) { this.app.toast('Poucas amostras — a mão precisa estar visível'); return; }
          this.samplesPoses[pose.id] = averageFeatures(list);
          this.stepPose(i + 1);
        },
      },
      { label: 'Pular', onClick: () => this.stepPose(i + 1) },
      ...(i > 0 ? [{ label: '← Voltar', onClick: () => this.stepPose(i - 1) }] : []),
    ]);
    this._live(() => {
      const h = this._activeHand();
      if (!h || !h.wlm) return this._handStatus();
      const f = computeFeatures(h.wlm);
      const g = classify(f, this.app.calib.thresholds).gesture;
      return `Reconhecido agora (limiares atuais): <b>${GESTURE_LABELS[g]}</b><br><span class="small">dedos ${f.straight.map((s) => s.toFixed(2)).join(' ')} · polegar ${f.thumbOut.toFixed(2)} · pinça ${f.pinch.toFixed(2)}</span>`;
    });
  }

  _applyPoses() {
    const calib = this.app.calib;
    calib.poses = this.samplesPoses;
    calib.thresholds = thresholdsFromPoses(this.samplesPoses, CONFIG.GESTURE.DEFAULT_THRESHOLDS);
  }

  stepReach() {
    const calib = this.app.calib;
    this._show('5. Alcance da mão', `
      <p>Agora vamos ver até onde sua mão chega na imagem da câmera.</p>
      <p>Toque em <b>Gravar alcance</b> e, durante 5 segundos, mova a mão livre devagar por toda a área: <b>canto de cima, de baixo, esquerda e direita</b>, sem esticar até sair da imagem.</p>
      <p class="small">Isso faz a mão virtual cobrir a tela toda mesmo que seu braço não alcance a borda da câmera.</p>`, [
      {
        label: 'Gravar alcance', cls: 'primary', onClick: async (btn) => {
          const us = [], vs = [];
          await this._record(btn, 5000, (h) => { us.push(h.uv.x); vs.push(h.uv.y); }, 1);
          if (us.length < 20) { this.app.toast('Poucas amostras — tente de novo'); return; }
          us.sort((a, b) => a - b); vs.sort((a, b) => a - b);
          const q = (arr, p) => arr[Math.floor((arr.length - 1) * p)];
          const r = { uMin: q(us, 0.03), uMax: q(us, 0.97), vMin: q(vs, 0.03), vMax: q(vs, 0.97) };
          if (r.uMax - r.uMin < 0.25 || r.vMax - r.vMin < 0.25) { this.app.toast('Movimento pequeno demais — cubra mais área'); return; }
          calib.reach = r;
          this.stepDepth();
        },
      },
      { label: 'Pular (usar imagem inteira)', onClick: () => { calib.reach = null; this.stepDepth(); } },
    ]);
    this._live(() => this._handStatus());
  }

  stepDepth() {
    const calib = this.app.calib;
    const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
    let near = null, far = null;
    const finish = () => {
      if (near && far && far > near * 1.25) {
        calib.depth = { rawNear: near, rawFar: far };
        this.app.toast('Profundidade calibrada');
      } else if (near && far) {
        this.app.toast('Diferença perto/longe pequena — usando valores padrão');
      }
      this.stepDone();
    };
    this._show('6. Perto e longe', `
      <p>O jogo estima a distância da mão pelo tamanho dela na imagem.</p>
      <p>1) Mão <b>PERTO</b>: braço encolhido, mão a uns 20 cm do celular → <b>Gravar perto</b>.</p>
      <p>2) Mão <b>LONGE</b>: braço esticado → <b>Gravar longe</b>.</p>`, [
      {
        label: 'Gravar perto', cls: 'primary', onClick: async (btn) => {
          const a = []; await this._record(btn, 1500, (h) => a.push(h.rawDepth));
          if (a.length >= 5) { near = median(a); btn.textContent = `Perto ✔ (${near.toFixed(2)})`; }
        },
      },
      {
        label: 'Gravar longe', cls: 'primary', onClick: async (btn) => {
          const a = []; await this._record(btn, 1500, (h) => a.push(h.rawDepth));
          if (a.length >= 5) { far = median(a); btn.textContent = `Longe ✔ (${far.toFixed(2)})`; }
        },
      },
      { label: 'Concluir →', onClick: finish },
    ]);
    this._live(() => {
      const h = this._activeHand();
      return h ? `Estimativa bruta agora: <b>${h.rawDepth.toFixed(2)}</b> (aumenta quando a mão se afasta)` : this._handStatus();
    });
  }

  stepDone() {
    const calib = this.app.calib;
    calib.done = true;
    const saved = saveCalib(calib);
    const t = calib.thresholds;
    this._show('Calibração pronta!', `
      <p>${saved ? 'Calibração <b>salva</b> neste aparelho.' : '<span class="bad">Não foi possível salvar</span> (navegador bloqueou o armazenamento) — vale só nesta sessão.'}</p>
      <p class="small">Mão de locomoção: <b>${calib.locomotion === 'left' ? 'esquerda' : 'direita'}</b> · inverter rótulos: ${calib.flipHandedness ? 'sim' : 'não'}<br>
      Limiares — dedos: ${t.ext.map((x) => x.toFixed(2)).join(' ')} · polegar: ${t.thumbOut.toFixed(2)} · pinça: ${t.pinch.toFixed(2)} · punho: ${t.fistIndex.toFixed(2)}<br>
      Alcance: ${calib.reach ? 'calibrado' : 'imagem inteira'} · profundidade: ${calib.depth.rawNear.toFixed(2)} → ${calib.depth.rawFar.toFixed(2)}</p>
      <p>Agora um mini-tutorial guiado.</p>`, [
      { label: 'Ir para o tutorial →', cls: 'primary', onClick: () => { this.app.setDebug(false); this.app.startTutorial(); } },
      { label: 'Refazer gestos', onClick: () => this.stepPose(0) },
    ]);
  }

  // ------------------------------------------------------------------
  // Ajuda do óculos
  // ------------------------------------------------------------------
  showHelp(back) {
    const app = this.app;
    if (app.stereo) app.setStereo(false);
    const prevState = app.state;
    const close = back || (() => { if (prevState === 'tutorial') app._refreshTutorial(); else this.hide(); });
    this._show('❓ Como usar no óculos', `
      <ol class="steps">
        <li><b>Abra a tampa da frente do óculos</b> (ou tire). A câmera traseira precisa <b>enxergar suas mãos</b>. Com a tampa fechada as mãos não funcionam, aí só os botões.</li>
        <li>Faça a <b>calibração e o tutorial fora do óculos</b> primeiro, segurando o celular na frente dos olhos.</li>
        <li>Toque em <b>👓 Óculos</b>. Se o celular tiver o <b>modo VR do Chrome</b>, ele abre e, na primeira vez, pede para <b>escanear o QR Code do seu óculos</b> (fica no óculos ou na caixa) — isso acerta as lentes sozinho. Sem QR, pode pular. Se não tiver esse modo, abre o modo próprio do jogo (tela cheia, deitada, dividida em duas).</li>
        <li>Encaixe o celular com a <b>linha do meio</b> (entre as duas imagens) bem no <b>centro do óculos</b>, na altura do nariz.</li>
        <li>Mexa nos <b>dois controles de cima do óculos</b> (os da sua foto):
          um aproxima/afasta as lentes — mexa até as <b>duas imagens virarem uma só</b>;
          o outro muda o foco — mexa até ficar <b>nítido</b>.</li>
        <li>Se ainda aparecer dobrado, torto ou com bordas curvas, use <b>🔧 Ajustar</b>: aparece uma grade com um anel vermelho para você acertar no jogo.</li>
        <li>Já no óculos, olhe para frente e toque na tela por fora → <b>⟲</b> (recentrar). No modo VR do Chrome, use o botão de voltar / ✕ da tela para sair.</li>
        <li><b>Para andar</b>: olhe para onde quer ir e <b>mostre a palma aberta</b> para a câmera — feche a mão para parar. Ou <b>segure o botão do óculos</b>.</li>
      </ol>
      <p class="small">Dicas: brilho da tela no máximo. Se o celular esquentar e o FPS cair, o jogo baixa a resolução sozinho. Para sair do modo óculos, toque na tela e use <b>👓 Óculos</b> de novo.</p>`, [
      { label: '👓 Entrar no modo óculos', cls: 'primary', onClick: () => { close(); app.toggleVR(); } },
      { label: '🔧 Ajustar óculos', onClick: () => this.showVrAdjust() },
      { label: 'Fechar', onClick: close },
    ]);
  }

  // ------------------------------------------------------------------
  // Ajuste do óculos (lentes, curvatura, campo de visão)
  // ------------------------------------------------------------------
  showVrAdjust() {
    const app = this.app, v = app.vrSettings;
    if (!app.stereo) app.setStereo(true);
    document.body.classList.add('vr-adjust');
    app.testPattern.visible = true;
    const prevState = app.state;
    const sliders = [
      { key: 'lensOffset', name: 'Distância entre as imagens', min: -0.3, max: 0.3, step: 0.005, fmt: (x) => `${(x * 100).toFixed(0)}` },
      { key: 'lensY', name: 'Altura das imagens', min: -0.3, max: 0.3, step: 0.005, fmt: (x) => `${(x * 100).toFixed(0)}` },
      { key: 'k1', name: 'Curvatura da lente', min: 0, max: 0.8, step: 0.01, fmt: (x) => x.toFixed(2) },
      { key: 'zoom', name: 'Ampliação', min: 0.55, max: 1.2, step: 0.01, invert: true, fmt: (x) => `${(1 / x).toFixed(2)}×` },
      { key: 'fov', name: 'Campo de visão', min: 60, max: 115, step: 1, fmt: (x) => `${x}°` },
      { key: 'ipd', name: 'Profundidade 3D (olhos)', min: 0.03, max: 0.09, step: 0.001, fmt: (x) => `${(x * 1000).toFixed(0)} mm` },
    ];
    const html = `
      <p class="small">Olhe pelo óculos: acerte até o <b>anel vermelho</b> virar um só e as <b>linhas da grade</b> ficarem retas. Ajuste um pouco, tire o celular, olhe de novo.</p>
      <div class="sliders">${sliders.map((sl) => {
        const val = sl.invert ? sl.max + sl.min - v[sl.key] : v[sl.key];
        return `<label class="slider"><span>${sl.name}</span><b id="sv-${sl.key}">${sl.fmt(v[sl.key])}</b>
          <input type="range" data-key="${sl.key}" min="${sl.min}" max="${sl.max}" step="${sl.step}" value="${val}"></label>`;
      }).join('')}</div>
      <label class="small"><input type="checkbox" id="sv-distortion" ${v.distortion ? 'checked' : ''}> Corrigir curvatura da lente</label><br>
      <label class="small"><input type="checkbox" id="sv-engine" ${v.engine !== 'proprio' ? 'checked' : ''}> Usar o modo VR do Chrome (QR Code do óculos) quando existir${app.xrSupported ? '' : ' — <i>não disponível neste aparelho</i>'}</label>
      <p class="small">Estes ajustes valem para o <b>modo próprio</b>. No modo VR do Chrome as lentes são acertadas pelo QR Code (ícone de engrenagem na tela do VR).</p>`;
    const done = () => {
      saveVrSettings(v);
      document.body.classList.remove('vr-adjust');
      app.testPattern.visible = false;
      if (prevState === 'tutorial') app._refreshTutorial(); else this.hide();
      app.toast('Ajustes do óculos salvos');
    };
    this._show('🔧 Ajustar óculos', html, [
      { label: '✔ Pronto', cls: 'primary', onClick: done },
      { label: 'Testar sem o painel', onClick: () => { saveVrSettings(v); document.body.classList.remove('vr-adjust'); app.showVrUi(6000); } },
      { label: 'Padrão', onClick: () => { Object.assign(v, defaultVrSettings()); saveVrSettings(v); this.showVrAdjust(); } },
    ]);
    this.el.querySelectorAll('input[type=range]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const sl = sliders.find((x) => x.key === inp.dataset.key);
        let x = parseFloat(inp.value);
        if (sl.invert) x = sl.max + sl.min - x;
        v[sl.key] = x;
        if (sl.key === 'k1') v.k2 = x * 0.45;
        this.el.querySelector(`#sv-${sl.key}`).textContent = sl.fmt(x);
        if (sl.key === 'fov') app.resize();
        saveVrSettings(v);
      });
    });
    this.el.querySelector('#sv-distortion').addEventListener('change', (e) => { v.distortion = e.target.checked; saveVrSettings(v); });
    this.el.querySelector('#sv-engine').addEventListener('change', (e) => { v.engine = e.target.checked ? 'auto' : 'proprio'; saveVrSettings(v); });
  }

  // ------------------------------------------------------------------
  // Tutorial
  // ------------------------------------------------------------------
  showTutorial(progress) {
    const loco = this.app.calib.locomotion === 'left' ? 'esquerda' : 'direita';
    const inter = this.app.calib.locomotion === 'left' ? 'direita' : 'esquerda';
    const steps = [
      this.app.locoMode === 'palma'
        ? { done: progress.teleport, name: 'Andar', how: 'Olhe para onde quer ir e <b>mostre a palma aberta</b> para a câmera (qualquer mão): você anda. <b>Feche ou abaixe a mão</b> para parar. No óculos, <b>segurar o botão do óculos</b> também anda. Botão: 🏃 Andar.' }
        : this.app.locoMode === 'correr'
        ? { done: progress.teleport, name: 'Correr', how: 'Olhe para onde quer ir e <b>balance as mãos</b> na frente da câmera, como se estivesse correndo (ou <b>corra parado</b>). Quanto mais rápido, mais rápido você anda. Botão: 🏃 Correr.' }
        : { done: progress.teleport, name: 'Teleporte', how: `Mão ${loco}: <b>pistolinha</b> cobrindo o lugar do chão para onde quer ir, depois <b>abra a palma</b>. Botões: 🎯 Mirar + 🚀 Ir.` },
      { done: progress.touch, name: 'Tocar a caixa', how: `Chegue na caixa preta do pedestal cinza e encoste a <b>ponta do indicador</b> da mão ${inter}. Botão: 👆 Tocar.` },
      { done: progress.wire, name: 'Conectar o fio', how: 'No painel: <b>pinça</b> na bolinha colorida, arraste até o anel da mesma cor e solte. Também dá para arrastar com o dedo na tela.' },
    ];
    const current = steps.find((s) => !s.done);
    const chips = steps.map((s) => `<span class="chip ${s.done ? 'done' : s === current ? 'cur' : ''}">${s.done ? '✔' : '○'} ${s.name}</span>`).join('');
    this._show('Tutorial', `
      <div class="chips">${chips}</div>
      <p>${current ? current.how : '<b>Tudo certo!</b> Você já sabe andar, abrir caixas e conectar fios.'}</p>`, [
      { label: current ? 'Pular → partida' : 'Começar partida!', cls: current ? '' : 'primary', onClick: () => this.app.startGame() },
    ], { compact: true });
  }
}
