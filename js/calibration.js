// Calibração + tutorial (tela inicial).
// Protótipo de teste: os textos são longos de propósito.
import { CONFIG } from './config.js';
import { computeFeatures, classify, averageFeatures, thresholdsFromPoses, GESTURE_LABELS } from './gestures.js';

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
    const html = `
      <p><b>Protótipo de teste</b> das mecânicas do jogo <i>Caçador de Sinal</i>.</p>
      <p>A rede está falhando! Ache as <b>caixas pretas</b> (pontos de sinal), toque nelas com a mão e conecte os fios antes do tempo acabar.</p>
      <p>Para o primeiro teste, <b>segure o celular na frente dos olhos</b> com uma mão, com a câmera traseira apontando para frente. A outra mão fica na frente da câmera.</p>
      <p>O jogo vai pedir permissão para a <b>câmera</b> e para os <b>sensores de movimento</b>. Depois vem a calibração (uns 3 minutos) e um mini-tutorial.</p>
      ${saved ? '<p class="ok">✔ Existe uma calibração salva neste aparelho.</p>' : ''}
      <p class="small">Dica: o botão 🐞 mostra o painel de depuração (FPS, gestos, prévia da câmera).</p>`;
    const btns = [];
    if (saved) {
      btns.push({ label: 'Usar calibração salva → tutorial', cls: 'primary', onClick: () => this._startWithSaved(saved, 'tutorial') });
      btns.push({ label: 'Ir direto para a partida', onClick: () => this._startWithSaved(saved, 'game') });
      btns.push({ label: 'Recalibrar', onClick: () => this._startFresh() });
    } else {
      btns.push({ label: 'Começar', cls: 'primary', onClick: () => this._startFresh() });
    }
    btns.push({ label: 'Sem câmera (só botões)', onClick: () => this._startNoCamera() });
    this._show('Caçador de Sinal — teste', html, btns);
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
      <p>Uma mão serve para <b>andar</b> (teleporte com pistolinha + palma aberta) e a outra para <b>interagir</b> (tocar caixas, detector de sinal, pinça nos fios).</p>
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
  // Tutorial
  // ------------------------------------------------------------------
  showTutorial(progress) {
    const loco = this.app.calib.locomotion === 'left' ? 'esquerda' : 'direita';
    const inter = this.app.calib.locomotion === 'left' ? 'direita' : 'esquerda';
    const steps = [
      { done: progress.teleport, name: 'Teleporte', how: `Mão ${loco}: <b>pistolinha</b> apontando para o chão (aparece uma curva), depois <b>abra a palma</b>. Botões: 🎯 Mirar + 🚀 Ir.` },
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
