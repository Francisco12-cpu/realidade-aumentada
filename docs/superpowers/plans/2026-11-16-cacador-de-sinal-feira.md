# Caçador de Sinal — versão da feira: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o protótipo em um jogo VR de ~3 minutos, sem calibração, controlado por "olhar e clicar", que funciona com e sem óculos e aceita o modelo 3D da escola depois.

**Architecture:** O `index.html` único é dividido em módulos ES em `js/`. Toda regra difícil (pinça, olhar parado, colisão, teleporte, fios, estados, qualidade) vira função pura em `js/logic/` com teste em Node. Os módulos com three.js só ligam essas regras ao desenho. O mapa é um arquivo de dados (`js/map.js`).

**Tech Stack:** HTML + CSS + módulos JavaScript sem compilação · three.js 0.160.0 · MediaPipe tasks-vision 0.10.14 · testes com `node --test` (Node 24) · GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-11-16-cacador-de-sinal-feira-design.md` — leia antes de qualquer tarefa.

## Como trabalhar (ciclo escreve → revisa)

1. Quem implementa faz **uma tarefa por vez**, na ordem, e para no fim dela.
2. Ao parar, relata: arquivos mudados, saída de `npm test`, e o resultado de cada item de "Verificação" da tarefa.
3. O revisor (Claude) confere o diff contra "Critérios de aceite". Só depois vem a próxima tarefa.
4. Commit local no fim de cada tarefa. **`git push` só quando o Francisco pedir** (é o push que publica no celular).
5. Não mude nada fora dos arquivos listados na tarefa. Se a tarefa parecer impossível como escrita, pare e pergunte — não improvise.
6. Os números de linha citados são do `index.html` original (commit `19e7c07`).

## Global Constraints

- Navegador alvo: Chrome no Android. Precisa de HTTPS (ou `localhost`).
- Sem etapa de compilação, sem framework, sem dependência npm. Bibliotecas só em `vendor/`.
- three.js **0.160.0**; MediaPipe tasks-vision **0.10.14**.
- `js/logic/*.js` não importam `three` nem tocam em `document`/`window` (rodam no Node).
- Movimento do jogador: **só teleporte**. Nunca deslizar a câmera (enjoo).
- Nenhuma calibração por visitante. Único gesto: pinça.
- Nada cria objetos (`new THREE.Vector3`, arrays, strings) dentro do laço de quadro quando dá para reutilizar um campo `this._v`.
- Texturas de texto só são redesenhadas quando o texto muda.
- Identificadores em inglês, comentários e textos de tela em português (padrão do código atual).
- Valores fixados pelo desenho: partida **180 s**, **5** caixas, **3** fios; olhar parado **1000 ms** (objetos) e **1500 ms** (chão); teleporte máx. **5 m**; painel de fios a **1,2 m**; volta sozinho após **20 s** parado no fim.

## Review Focus

Situações que o desenho implica e que mais provavelmente quebram na feira. Cada uma tem teste/verificação na tarefa dona:

1. **Câmera negada ou MediaPipe não carrega** → o jogo inteiro continua jogável por toque e por olhar parado, com um aviso curto. (Tarefa 5)
2. **Mão entra/sai da imagem ou fica no limite da pinça** → nenhum clique fantasma nem rajada de cliques. (Tarefa 2)
3. **Olhar para o céu, parede, fora do mapa, ou dentro de um bloco** → sem teleporte, sem erro, mira neutra/vermelha. (Tarefas 3 e 5)
4. **Sair do modo óculos no meio da partida, girar o celular, sair da tela cheia** → imagem se ajusta, partida continua, nada congela. (Tarefa 9)
5. **Aba em segundo plano / tela apagou no meio da partida** → o relógio não salta, o bloqueio de tela é pedido de novo, um único clique por quadro mesmo com duas fontes. (Tarefas 4 e 8)

## Mapa de arquivos (estado final)

```
index.html              tela inicial, canvas, painel do operador
css/style.css
js/config.js            CONFIG (todos os números de ajuste)
js/filters.js           filtro One Euro (existente)
js/map.js               dados do mapa: spawn, blocos, caixas, modelo
js/scene.js             constrói o mundo 3D a partir de map.js
js/orientation.js       giroscópio → câmera (existente)
js/hands.js             câmera + MediaPipe, uma mão, esqueleto 3D
js/pointer.js           raio do olhar → o que está sob a mira; mira 3D
js/teleport.js          marcador + salto
js/interaction.js       caixas, painel de fios, feixe de luz
js/hud3d.js             textos, seta, avisos, painéis e fade dentro do mundo
js/audio.js             sons sintetizados
js/display.js           modo óculos (WebXR ou tela dividida própria)
js/debug.js             painel do operador/depuração, modo editor
js/main.js              laço principal e ligação entre os módulos
js/logic/pinch.js       pinça com folga
js/logic/dwell.js       relógio do olhar parado
js/logic/collide.js     raio×caixas, chão livre
js/logic/teleportRules.js
js/logic/wireGame.js    regras dos fios
js/logic/gameState.js   estados e relógio da partida
js/logic/quality.js     qualidade automática
tests/*.test.mjs        um arquivo por módulo de js/logic
tools/split.mjs         corta o index.html original (usado uma vez)
tools/server.mjs        servidor local
vendor/three/… vendor/mediapipe/…
teste-xr.html           página de teste da Tarefa 0
```

Removidos ao longo do plano: `js/gestures.js`, `js/calibration.js`.

---

### Task 0: Teste do modo VR do Chrome com a câmera ligada (decide a Tarefa 9)

**Files:**
- Create: `teste-xr.html` (página única, independente do jogo; usa three e MediaPipe pelos mesmos endereços de CDN do `index.html` original, linhas 133-134 e 658-660)

**Interfaces:**
- Produces: quatro respostas do celular do Francisco, anotadas no topo deste plano em "Resultado da Tarefa 0".

- [ ] **Step 1: Escrever `teste-xr.html`**

A página tem: um `<canvas>`, um `<video playsinline muted autoplay>` de 2×2 px, um `<pre id="log">` e dois botões: **1. Preparar câmera** e **2. Entrar em VR**.

Comportamento exato:
- Cena three.js: fundo azul-claro, chão, 6 cubos coloridos em volta da origem, e um plano de texto (CanvasTexture 512×256) fixo a 2 m na frente, redesenhado 2×/s.
- Botão 1: `getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: 640, height: 480 } })`, toca o vídeo, carrega `HandLandmarker` (`numHands: 1`, `runningMode: 'VIDEO'`, delegate `'GPU'` com queda para `'CPU'`). Escreve no log o que deu certo.
- Botão 2 (o `requestSession` precisa ser a **primeira** chamada dentro do clique, sem `await` antes):
  ```js
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local');
  const session = await navigator.xr.requestSession('immersive-vr');
  await renderer.xr.setSession(session);
  ```
- No laço (`renderer.setAnimationLoop`): a cada quadro em que `video.currentTime` mudou, conta 1 "quadro de câmera" e chama `landmarker.detectForVideo(video, performance.now())`; se vier ao menos uma mão, marca `maoVista = true`. Conta quadros desenhados.
- O plano de texto mostra, por segundo: `FPS`, `câmera/s`, `mão: sim/não`.
- Em `session` evento `end`: escreve no `#log` as médias medidas **durante a sessão**.
- Antes de tudo, escreve no log: `navigator.xr` existe? `isSessionSupported('immersive-vr')`?

Formato final do log (exatamente estas 4 linhas, para o Francisco copiar):
```
1 VR suportado: sim|não
2 Sessão VR abriu: sim|não (erro: …)
3 Câmera dentro do VR: N quadros/s
4 Mão vista dentro do VR: sim|não · FPS médio: N
```

- [ ] **Step 2: Verificar no PC**

Abrir a página por um servidor local (`npx --yes serve .` ou equivalente). Esperado: sem erro no console; linha 1 aparece (no PC normalmente `não`); botão 1 liga a webcam.

- [ ] **Step 3: Commit, e pedir ao Francisco push + teste no celular**

```bash
git add teste-xr.html && git commit -m "teste: página de teste WebXR + câmera"
```
Roteiro para o Francisco: abrir `…/teste-xr.html` no Chrome do celular → botão 1 → aceitar câmera → botão 2 → olhar em volta 10 s com a mão na frente da câmera → tocar no X → copiar as 4 linhas.

- [ ] **Step 4: Anotar o resultado e escolher a variante**

- Linhas 1 e 2 `sim`, linha 3 ≥ 10 e linha 4 `sim` → **Variante A (WebXR)** na Tarefa 9.
- Qualquer outro resultado → **Variante B (tela dividida própria)** na Tarefa 9.

**Critérios de aceite:** as 4 linhas aparecem mesmo quando algo falha (erros capturados com `try/catch` e escritos no log); nenhum arquivo do jogo foi tocado.

**Resultado da Tarefa 0:** _(preencher)_

---

### Task 1: Dividir em módulos, trazer as bibliotecas para `vendor/`, servidor e testes

Mudança só de organização: **o jogo tem que se comportar exatamente como antes.**

**Files:**
- Create: `tools/split.mjs`, `tools/server.mjs`, `package.json`, `css/style.css`, `js/*.js` (11 arquivos), `vendor/…`, `tests/smoke.test.mjs`
- Modify: `index.html` (fica só com HTML + importmap + `<script type="module" src="js/main.js">`)

**Interfaces:**
- Produces: os módulos abaixo, com estes `export`/`import` exatos.

| Arquivo | Exporta | Importa |
|---|---|---|
| `config.js` | `CONFIG, WIRE_COLORS, WIRE_NAMES` | — |
| `filters.js` | `OneEuro, OneEuro3` | — |
| `scene.js` | `BOX_SIZE, buildWorld, animateTargets` | `three`, `CONFIG` |
| `orientation.js` | `OrientationController` | `three` |
| `hands.js` | `BONES, Hand, HandTracker, HandView` | `three`, `CONFIG`, `OneEuro3` |
| `gestures.js` | `GESTURES, GESTURE_LABELS, computeFeatures, classify, updateHandGesture, averageFeatures, thresholdsFromPoses` | `CONFIG` |
| `teleport.js` | `Teleport` | `three`, `CONFIG` |
| `interaction.js` | `Interaction` | `three`, `CONFIG, WIRE_COLORS` |
| `calibration.js` | `defaultCalib, loadCalib, saveCalib, clearCalib, CalibrationFlow` | `CONFIG`, de `gestures.js`: `GESTURE_LABELS, computeFeatures, classify, averageFeatures, thresholdsFromPoses` |
| `debug.js` | `DebugUI` | `BONES` (hands), `GESTURE_LABELS` |
| `main.js` | — | todos os acima |

- [ ] **Step 1: `tools/split.mjs`** — lê `index.html`; pega o texto entre `<script type="module">` e `</script>`; corta nas linhas que casam `/^\/\/ ===== js\/(.+\.js) =====$/`; grava cada pedaço **sem alterar** em `js/<nome>`; grava o conteúdo de `<style>` em `css/style.css`. A linha `import * as THREE from 'three';` (antes do primeiro marcador) é descartada. Rodar: `node tools/split.mjs` → imprime os 11 nomes e o número de linhas de cada um.

- [ ] **Step 2: Acrescentar `import`/`export`** em cada arquivo conforme a tabela. Só linhas de import no topo e a palavra `export` na frente das declarações; nenhuma outra edição. `import * as THREE from 'three';` em quem usa `THREE`.

- [ ] **Step 3: Baixar as bibliotecas** (com `curl -L -o`):

| De | Para |
|---|---|
| `https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js` | `vendor/three/three.module.js` |
| `https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js` | `vendor/three/loaders/GLTFLoader.js` |
| `https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js` | `vendor/three/utils/BufferGeometryUtils.js` |
| `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs` | `vendor/mediapipe/vision_bundle.mjs` |
| `…/tasks-vision@0.10.14/wasm/vision_wasm_internal.js` e `.wasm`, `vision_wasm_nosimd_internal.js` e `.wasm` | `vendor/mediapipe/wasm/` |
| `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task` | `vendor/mediapipe/hand_landmarker.task` |

Em `hands.js`: `WASM_URL = new URL('../vendor/mediapipe/wasm', import.meta.url).href` e `MODEL_URL = new URL('../vendor/mediapipe/hand_landmarker.task', import.meta.url).href`.

- [ ] **Step 4: `index.html`** — remover `<style>` e o script embutido; `<link rel="stylesheet" href="css/style.css">`; importmap:
```json
{ "imports": { "three": "./vendor/three/three.module.js",
               "@mediapipe/tasks-vision": "./vendor/mediapipe/vision_bundle.mjs" } }
```

- [ ] **Step 5: `tools/server.mjs`** — servidor estático com `node:http` na porta 8080, servindo a raiz do repositório, com tipos: `.html` text/html, `.js`/`.mjs` text/javascript, `.css` text/css, `.wasm` application/wasm, `.json` application/json, `.glb` model/gltf-binary, resto application/octet-stream. Caminhos com `..` → 403.

- [ ] **Step 6: `package.json`**
```json
{ "private": true, "type": "module",
  "scripts": { "dev": "node tools/server.mjs", "test": "node --test tests/" } }
```
`tests/smoke.test.mjs`: importa `../js/config.js` e `../js/filters.js`; afirma `CONFIG.GAME_TIME_S === 360` e que `new OneEuro(1.2, 0.8, 1).filter(5, 0) === 5`.

- [ ] **Step 7: Verificação**
- `npm test` → 2 testes passam.
- `npm run dev`, abrir `http://localhost:8080`: console sem erros e sem pedidos de rede para `cdn.jsdelivr.net` nem `storage.googleapis.com` (aba Rede).
- "Sem câmera (só botões)" → tutorial aparece; `Q` mira e teleporta; `E` abre a caixa; arrastar o fio com o mouse conserta.

- [ ] **Step 8: Commit** — `refactor: dividir em módulos e trazer bibliotecas para vendor/`

**Critérios de aceite:** diff de cada `js/*.js` contra o trecho original = só linhas de import/export e as duas URLs; `index.html` sem JavaScript embutido.

---

### Task 2: Lógica de entrada — pinça e olhar parado

**Files:**
- Create: `js/logic/pinch.js`, `js/logic/dwell.js`, `tests/pinch.test.mjs`, `tests/dwell.test.mjs`

**Interfaces — Produces:**
```js
// pinch.js
export function pinchRatio(w)            // w: 21 pontos {x,y,z} → número (polegar-indicador ÷ palma)
export class PinchDetector {
  constructor({ on = 0.30, off = 0.45, stableFrames = 2, lostFrames = 3 } = {})
  down                                   // boolean
  update(ratio)                          // ratio: número ou null (mão não vista) → { down, pressed, released }
}
// dwell.js
export class DwellTimer {
  update(key, durationMs, nowMs)         // key: string|null → { progress: 0..1, fired: boolean }
  consume()                              // outro tipo de clique aconteceu: não dispara de novo neste alvo
}
export class FloorAnchor {
  constructor(radius = 0.35)
  key(x, z)                              // → 'floor#N' (N muda quando o ponto se afasta mais que radius da âncora)
  reset()
}
```

- [ ] **Step 1: Testes da pinça** (`tests/pinch.test.mjs`)
```js
const seq = (d, arr) => arr.map((r) => d.update(r));
test('precisa de 2 quadros seguidos para apertar', () => {
  const d = new PinchDetector();
  assert.equal(d.update(0.25).pressed, false);
  const r = d.update(0.25);
  assert.deepEqual(r, { down: true, pressed: true, released: false });
});
test('folga: 0.40 mantém apertado, 0.50 duas vezes solta', () => {
  const d = new PinchDetector(); seq(d, [0.25, 0.25]);
  assert.equal(d.update(0.40).down, true);
  d.update(0.50);
  assert.deepEqual(d.update(0.50), { down: false, pressed: false, released: true });
});
test('ruído no limite não aperta', () => {
  const d = new PinchDetector();
  for (const r of seq(d, [0.29, 0.31, 0.29, 0.31, 0.29, 0.31])) assert.equal(r.down, false);
});
test('mão sumiu por 3 quadros solta; 2 quadros não', () => {
  const d = new PinchDetector(); seq(d, [0.25, 0.25]);
  assert.equal(seq(d, [null, null]).at(-1).down, true);
  assert.equal(d.update(null).released, true);
});
test('mão sumida nunca aperta', () => {
  const d = new PinchDetector();
  for (const r of seq(d, [null, null, null, null])) assert.equal(r.pressed, false);
});
test('pressed só vale por um quadro', () => {
  const d = new PinchDetector(); seq(d, [0.25, 0.25]);
  assert.equal(d.update(0.25).pressed, false);
});
test('pinchRatio: pontas juntas = 0', () => {
  const w = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  w[9] = { x: 0, y: 0.1, z: 0 };
  assert.equal(pinchRatio(w), 0);
  w[8] = { x: 0.05, y: 0, z: 0 };
  assert.ok(Math.abs(pinchRatio(w) - 0.5) < 1e-9);
});
```

- [ ] **Step 2: Rodar** `npm test` → falha ("Cannot find module").

- [ ] **Step 3: Implementar `pinch.js`** — algoritmo exato:
```js
export function pinchRatio(w) {
  const d = (a, b) => Math.hypot(w[a].x - w[b].x, w[a].y - w[b].y, w[a].z - w[b].z);
  return d(4, 8) / Math.max(d(0, 9), 1e-4);
}
// dentro de PinchDetector
update(ratio) {
  let want = this.down;
  if (ratio == null) { this._lost++; if (this._lost >= this.lostFrames) want = false; }
  else { this._lost = 0; want = this.down ? ratio < this.off : ratio < this.on; }
  this._count = want !== this.down ? this._count + 1 : 0;
  let pressed = false, released = false;
  if (want !== this.down && (ratio == null || this._count >= this.stableFrames)) {
    this.down = want; this._count = 0; pressed = want; released = !want;
  }
  return { down: this.down, pressed, released };
}
```

- [ ] **Step 4: Testes do olhar parado** (`tests/dwell.test.mjs`)
```js
test('enche e dispara uma vez', () => {
  const t = new DwellTimer();
  assert.deepEqual(t.update('a', 1000, 0), { progress: 0, fired: false });
  assert.equal(t.update('a', 1000, 500).progress, 0.5);
  assert.deepEqual(t.update('a', 1000, 1000), { progress: 1, fired: true });
  assert.deepEqual(t.update('a', 1000, 5000), { progress: 0, fired: false });
});
test('trocar de alvo recomeça', () => {
  const t = new DwellTimer(); t.update('a', 1000, 0); t.update('b', 1000, 900);
  assert.equal(t.update('b', 1000, 1000).fired, false);
  assert.equal(t.update('b', 1000, 1900).fired, true);
});
test('key null zera; voltar ao mesmo alvo recomeça do zero', () => {
  const t = new DwellTimer(); t.update('a', 1000, 0); t.update(null, 0, 500);
  assert.equal(t.update('a', 1000, 1000).progress, 0);
});
test('consume impede o disparo no alvo atual', () => {
  const t = new DwellTimer(); t.update('a', 1000, 0); t.consume();
  assert.equal(t.update('a', 1000, 2000).fired, false);
});
test('FloorAnchor: tremor pequeno mantém a chave, passo grande troca', () => {
  const f = new FloorAnchor(0.35);
  const k = f.key(0, 0);
  assert.equal(f.key(0.2, 0.2), k);
  assert.notEqual(f.key(1, 0), k);
  f.reset(); assert.notEqual(f.key(1, 0), f.key(5, 5));
});
```

- [ ] **Step 5: Implementar `dwell.js`** — regras: `key == null` ou `durationMs <= 0` → esquece o alvo, retorna `{0,false}`; chave nova → guarda `nowMs` como início e limpa "já disparou"; se já disparou → `{0,false}`; `progress = min(1, (now-início)/duração)`; ao chegar em 1 marca "já disparou" e retorna `fired: true`. `FloorAnchor.key`: sem âncora ou distância > `radius` → nova âncora no ponto e `N++`.

- [ ] **Step 6: Rodar** `npm test` → todos passam. **Commit** — `feat: lógica de pinça e de olhar parado`

**Critérios de aceite:** nenhum import nos dois módulos; os testes acima sem alteração.

---

### Task 3: Mapa como dados, colisão e regras de teleporte

**Files:**
- Create: `js/map.js`, `js/logic/collide.js`, `js/logic/teleportRules.js`, `tests/collide.test.mjs`, `tests/teleportRules.test.mjs`
- Modify: `js/scene.js`, `js/config.js`, `js/main.js`

**Interfaces — Produces:**
```js
// map.js
export const MAP = {
  spawn: [0, 8],            // x, z
  spawnYaw: 0,              // radianos
  bounds: 19.5,
  model: null,              // ou { url, scale, position: [x,y,z], rotationY }
  blocks: [ /* [xMin,xMax,zMin,zMax,yMin,yMax,cor] */ ],
  targets: [ /* { id, pos:[x,y,z], normal:[x,y,z], tutorial?, wires? } */ ],
};
// collide.js  (caixa = { min:[x,y,z], max:[x,y,z] })
export function blocksToBoxes(blocks)                       // formato do mapa → caixas
export function segmentHitBoxes(a, b, boxes)                // a,b: [x,y,z] → { t, index } de menor t em [0,1], ou null
export function isFree(x, z, r, boxes, bounds, eyeHeight)   // boolean
export function rayGround(o, d)                             // o,d: [x,y,z] → [x,0,z] ou null se d[1] >= -0.01
// teleportRules.js
export function resolveTeleport({ from, aim, boxes, bounds, targets, nowMs, lastJumpMs, cfg })
  // from, aim: [x,z]; targets: [[x,y,z]]; cfg = CONFIG.TELEPORT + EYE_HEIGHT
  // → { ok, x, z, reason }  reason ∈ 'ok'|'perto'|'bloqueado'|'caixa'|'parede'|'aguarde'
// scene.js: world passa a ter
world.boxes            // caixas de colisão (blocksToBoxes)
world.blockMeshes      // malhas dos blocos (para esconder quando houver modelo)
// main.js: hierarquia nova
app.rig (Group em x,0,z) > app.head (Group em y = EYE_HEIGHT) > app.camera (posição 0,0,0)
```

- [ ] **Step 1: `js/map.js`** — mover `BLOCKS` e `TARGET_DEFS` de `scene.js` para `MAP.blocks`/`MAP.targets` com estas mudanças: remover o alvo `teto`; `parede-azul-alta` passa a `pos: [5 - 0.225, 1.4, -9]`. Resultado: 1 alvo de tutorial + **5** de partida.

- [ ] **Step 2: Testes de colisão**
```js
const box = [{ min: [-1, 0, -1], max: [1, 2, 1] }];
test('segmento atravessa a caixa: t da entrada', () => {
  const h = segmentHitBoxes([-3, 1, 0], [3, 1, 0], box);
  assert.equal(h.index, 0); assert.ok(Math.abs(h.t - 1 / 3) < 1e-9);
});
test('segmento passa por cima / para antes: null', () => {
  assert.equal(segmentHitBoxes([-3, 3, 0], [3, 3, 0], box), null);
  assert.equal(segmentHitBoxes([-3, 1, 0], [-2, 1, 0], box), null);
});
test('paralelo a um eixo, fora da faixa: null; começando dentro: t = 0', () => {
  assert.equal(segmentHitBoxes([-3, 1, 5], [3, 1, 5], box), null);
  assert.equal(segmentHitBoxes([0, 1, 0], [3, 1, 0], box).t, 0);
});
test('escolhe a caixa mais próxima', () => {
  const two = [{ min: [4, 0, -1], max: [5, 2, 1] }, ...box];
  assert.equal(segmentHitBoxes([-3, 1, 0], [6, 1, 0], two).index, 1);
});
test('isFree: dentro, encostado pelo raio, fora dos limites, teto alto não bloqueia', () => {
  assert.equal(isFree(0, 0, 0.3, box, 19.5, 1.6), false);
  assert.equal(isFree(1.2, 0, 0.3, box, 19.5, 1.6), false);
  assert.equal(isFree(1.4, 0, 0.3, box, 19.5, 1.6), true);
  assert.equal(isFree(25, 0, 0.3, box, 19.5, 1.6), false);
  assert.equal(isFree(0, 0, 0.3, [{ min: [-1, 2.5, -1], max: [1, 2.7, 1] }], 19.5, 1.6), true);
});
test('rayGround: para baixo acerta, horizontal/para cima não', () => {
  assert.deepEqual(rayGround([0, 1.6, 0], [0, -1.6, -3.2]), [0, 0, -3.2]);
  assert.equal(rayGround([0, 1.6, 0], [0, 0, -1]), null);
  assert.equal(rayGround([0, 1.6, 0], [0, 1, -1]), null);
});
```

- [ ] **Step 3: Implementar `collide.js`** — `segmentHitBoxes` pelo método das fatias:
```js
export function segmentHitBoxes(a, b, boxes) {
  let best = null;
  for (let i = 0; i < boxes.length; i++) {
    let t0 = 0, t1 = 1, ok = true;
    for (let k = 0; k < 3 && ok; k++) {
      const d = b[k] - a[k], lo = boxes[i].min[k], hi = boxes[i].max[k];
      if (Math.abs(d) < 1e-9) { if (a[k] < lo || a[k] > hi) ok = false; continue; }
      let u = (lo - a[k]) / d, v = (hi - a[k]) / d;
      if (u > v) { const s = u; u = v; v = s; }
      if (u > t0) t0 = u;
      if (v < t1) t1 = v;
      if (t0 > t1) ok = false;
    }
    if (ok && (!best || t0 < best.t)) best = { t: t0, index: i };
  }
  return best;
}
```
`isFree`: falso se `|x|` ou `|z|` > `bounds`; para cada caixa com `min[1] <= eyeHeight + 0.2`, falso se `x` está em `(min.x - r, max.x + r)` e `z` em `(min.z - r, max.z + r)`. `rayGround`: `t = -o[1]/d[1]`, ponto `[o[0]+d[0]*t, 0, o[2]+d[2]*t]`.

- [ ] **Step 4: Testes do teleporte** — `cfg = { MAX_DIST: 5, MIN_DIST: 0.6, COOLDOWN_S: 0.4, PLAYER_RADIUS: 0.3, EYE_HEIGHT: 1.6 }`, `base = { from: [0, 0], boxes: [], bounds: 19.5, targets: [], nowMs: 10000, lastJumpMs: 0, cfg }`:
```js
test('ok simples', () => assert.deepEqual(resolveTeleport({ ...base, aim: [0, -3] }), { ok: true, x: 0, z: -3, reason: 'ok' }));
test('longe demais encurta para 5 m e continua ok', () => {
  const r = resolveTeleport({ ...base, aim: [0, -12] });
  assert.equal(r.ok, true); assert.ok(Math.abs(r.z + 5) < 1e-9);
});
test('perto demais', () => assert.equal(resolveTeleport({ ...base, aim: [0, -0.3] }).reason, 'perto'));
test('dentro de bloco', () => assert.equal(resolveTeleport({ ...base, aim: [0, -3], boxes: [{ min: [-1, 0, -4], max: [1, 3, -2] }] }).reason, 'bloqueado'));
test('fora do mapa', () => assert.equal(resolveTeleport({ ...base, from: [0, -18], aim: [0, -21] }).reason, 'bloqueado'));
test('em cima de caixa de sinal baixa', () => assert.equal(resolveTeleport({ ...base, aim: [0, -3], targets: [[0.2, 0.2, -3]] }).reason, 'caixa'));
test('caixa alta na parede não bloqueia', () => assert.equal(resolveTeleport({ ...base, aim: [0, -3], targets: [[0.2, 1.4, -3]] }).ok, true));
test('parede no caminho', () => assert.equal(resolveTeleport({ ...base, aim: [0, -4], boxes: [{ min: [-2, 0, -2.2], max: [2, 3, -2] }] }).reason, 'parede'));
test('espera entre saltos', () => assert.equal(resolveTeleport({ ...base, aim: [0, -3], lastJumpMs: 9800 }).reason, 'aguarde'));
test('alvo encurtado é o que é validado', () => assert.equal(resolveTeleport({ ...base, aim: [0, -12], boxes: [{ min: [-1, 0, -5.5], max: [1, 3, -4.5] }] }).reason, 'bloqueado'));
```

- [ ] **Step 5: Implementar `resolveTeleport`** — regras nesta ordem, a primeira que falhar define `reason` (sempre devolvendo `x, z` já encurtados): (1) encurtar para `MAX_DIST`; (2) distância < `MIN_DIST` → `perto`; (3) `!isFree(x, z, PLAYER_RADIUS, …)` → `bloqueado`; (4) algum alvo com `y < 1.2` a menos de 0,5 m no plano → `caixa`; (5) `segmentHitBoxes([from.x, 0.4, from.z], [x, 0.4, z], boxes)` → `parede`; (6) `nowMs - lastJumpMs < COOLDOWN_S*1000` → `aguarde`; senão `ok`.

- [ ] **Step 6: Ligar em `scene.js`, `config.js`, `main.js`**
- `config.js`: `TELEPORT.MAX_DIST = 5.0`, `TELEPORT.COOLDOWN_S = 0.4`; `GAME_TIME_S = 180`; atualizar `tests/smoke.test.mjs` para 180.
- `scene.js`: ler de `MAP`; `world.boxes = blocksToBoxes(MAP.blocks)`; `world.blockMeshes`; `world.segmentHit` e `world.isFree` continuam existindo, mas chamam `collide.js` (a assinatura antiga com `Vector3` é mantida para o `teleport.js` atual; `segmentHit` devolve `{ point: Vector3 }` ou null).
- `main.js`: criar `head` conforme a hierarquia acima; `camera.position` fica `(0,0,0)`; `rig.rotation.y = MAP.spawnYaw`.

- [ ] **Step 7: Verificação** — `npm test` passa. No navegador: mesma visão de antes (altura dos olhos igual), 5 caixas no contador da partida, teleporte por `Q` funciona e não atravessa a parede vermelha.

- [ ] **Step 8: Commit** — `feat: mapa em dados, colisão e regras de teleporte testadas`

**Critérios de aceite:** `scene.js` sem números de mapa; `collide.js`/`teleportRules.js` sem import de `three`.

---

### Task 4: Lógica do jogo — fios, estados e qualidade

**Files:**
- Create: `js/logic/wireGame.js`, `js/logic/gameState.js`, `js/logic/quality.js`, e um teste para cada em `tests/`

**Interfaces — Produces:**
```js
// wireGame.js
export class WireGame {
  constructor(n, rng = Math.random)      // n fios (1..4)
  plugs      // [{ color, connected }]  color = 0..n-1, na ordem
  sockets    // [{ color, used }]       ordem embaralhada; se n > 1 nunca igual à dos plugs
  held       // índice do plug na mão, ou null
  clickPlug(i)     // → 'picked' | 'ignored'
  clickSocket(k)   // → 'connected' | 'wrong' | 'ignored'
  clickElsewhere() // → 'dropped' | 'ignored'
  get done()       // todos conectados
}
// gameState.js
export class GameState {
  constructor({ matchSeconds = 180, idleResetSeconds = 20, startDelaySeconds = 2, totalBoxes })
  state          // 'menu' | 'tutorial' | 'playing' | 'ended'
  tutorialStep   // 0 andar · 1 abrir caixa · 2 ligar fio · 3 completo
  timeLeft, fixed, won
  start()                      // menu → tutorial (passo 0)
  tutorialEvent(name)          // 'teleport' | 'open' | 'fixed' → true se avançou
  beginMatch()                 // tutorial|ended → playing (zera fixed, timeLeft)
  boxFixed()                   // em playing: fixed++; se fixed === totalBoxes → ended, won = true
  tick(dtSeconds, hadClick)    // → lista de eventos: 'matchStart' | 'warn30' | 'timeout' | 'win' | 'idleReset'
  toMenu()
}
// quality.js
export class QualityController {
  constructor({ levels = [1.5, 1.25, 1.0, 0.75], start = 1, slowMs = 21, okMs = 17.5,
                windowFrames = 90, upAfterFrames = 600, maxUps = 2 } = {})
  level                        // número atual (levels[i])
  frame(dtMs)                  // → novo nível quando muda, senão null
}
```

- [ ] **Step 1: Testes dos fios**
```js
const rngSeq = (...v) => { let i = 0; return () => v[i++ % v.length]; };
test('encaixes nunca na mesma ordem dos plugs', () => {
  for (let s = 0; s < 50; s++) {
    const g = new WireGame(3, rngSeq(s / 50, (s * 7 % 50) / 50, 0.999));
    assert.ok(g.sockets.some((k, i) => k.color !== i));
    assert.deepEqual(g.sockets.map((k) => k.color).sort(), [0, 1, 2]);
  }
});
test('um fio: joga normalmente', () => {
  const g = new WireGame(1);
  assert.equal(g.clickPlug(0), 'picked'); assert.equal(g.clickSocket(0), 'connected'); assert.equal(g.done, true);
});
test('cor errada devolve o fio e não gasta o encaixe', () => {
  const g = new WireGame(3); const wrong = g.sockets.findIndex((k) => k.color !== 0);
  g.clickPlug(0);
  assert.equal(g.clickSocket(wrong), 'wrong'); assert.equal(g.held, null);
  assert.equal(g.sockets[wrong].used, false); assert.equal(g.plugs[0].connected, false);
});
test('sem fio na mão, encaixe é ignorado; plug conectado é ignorado; encaixe usado é ignorado', () => {
  const g = new WireGame(2); const k0 = g.sockets.findIndex((k) => k.color === 0);
  assert.equal(g.clickSocket(k0), 'ignored');
  g.clickPlug(0); g.clickSocket(k0);
  assert.equal(g.clickPlug(0), 'ignored');
  g.clickPlug(1); assert.equal(g.clickSocket(k0), 'ignored'); assert.equal(g.held, 1);
});
test('pegar outro fio troca o que está na mão; clicar fora solta', () => {
  const g = new WireGame(3); g.clickPlug(0); g.clickPlug(2);
  assert.equal(g.held, 2); assert.equal(g.clickElsewhere(), 'dropped'); assert.equal(g.clickElsewhere(), 'ignored');
});
```

- [ ] **Step 2: Implementar `wireGame.js`** — embaralhar com Fisher–Yates usando `rng`; se `n > 1` e a ordem ficou idêntica à dos plugs, girar uma posição (`push(shift())`).

- [ ] **Step 3: Testes dos estados**
```js
const mk = () => new GameState({ totalBoxes: 5 });
test('tutorial só avança com o evento do passo atual', () => {
  const g = mk(); g.start();
  assert.equal(g.tutorialEvent('open'), false);
  assert.equal(g.tutorialEvent('teleport'), true);
  assert.equal(g.tutorialEvent('open'), true);
  assert.equal(g.tutorialEvent('fixed'), true); assert.equal(g.tutorialStep, 3);
});
test('2 s depois do tutorial completo a partida começa', () => {
  const g = mk(); g.start(); ['teleport', 'open', 'fixed'].forEach((e) => g.tutorialEvent(e));
  assert.deepEqual(g.tick(1.9, false), []);
  assert.deepEqual(g.tick(0.2, false), ['matchStart']);
  assert.equal(g.state, 'playing'); assert.equal(g.timeLeft, 180);
});
test('aviso dos 30 s uma vez só; tempo esgotado encerra', () => {
  const g = mk(); g.start(); g.beginMatch();
  assert.deepEqual(g.tick(150.5, false), ['warn30']);
  assert.deepEqual(g.tick(1, false), []);
  assert.deepEqual(g.tick(60, false), ['timeout']);
  assert.equal(g.state, 'ended'); assert.equal(g.won, false); assert.equal(g.timeLeft, 0);
});
test('consertar as 5 vence; consertar fora da partida não conta', () => {
  const g = mk(); g.boxFixed(); assert.equal(g.fixed, 0);
  g.start(); g.beginMatch(); for (let i = 0; i < 5; i++) g.boxFixed();
  assert.equal(g.state, 'ended'); assert.equal(g.won, true);
  assert.deepEqual(g.tick(0.1, false), ['win']);
});
test('fim: 20 s sem clique volta ao tutorial; clique zera a contagem', () => {
  const g = mk(); g.start(); g.beginMatch(); g.tick(200, false);
  g.tick(15, false); g.tick(1, true);
  assert.deepEqual(g.tick(15, false), []);
  assert.deepEqual(g.tick(6, false), ['idleReset']);
  assert.equal(g.state, 'tutorial'); assert.equal(g.tutorialStep, 0);
});
test('menu não conta tempo', () => { const g = mk(); assert.deepEqual(g.tick(999, false), []); assert.equal(g.state, 'menu'); });
```
(Review Focus 5: o chamador limita `dt` a 0,1 s; ver Tarefa 8.)

- [ ] **Step 4: Implementar `gameState.js`** — o evento `'win'` sai no primeiro `tick` depois da vitória (uma vez); `'timeout'` sai no `tick` em que o tempo zera.

- [ ] **Step 5: Testes da qualidade**
```js
const feed = (q, ms, n) => { let last = null; for (let i = 0; i < n; i++) { const r = q.frame(ms); if (r !== null) last = r; } return last; };
test('lento por uma janela desce um nível', () => { const q = new QualityController(); assert.equal(feed(q, 30, 90), 1.0); });
test('continua lento: desce até o mínimo e para', () => { const q = new QualityController(); feed(q, 30, 900); assert.equal(q.level, 0.75); });
test('rápido por 600 quadros sobe, no máximo 2 vezes', () => {
  const q = new QualityController({ start: 3 }); feed(q, 16.7, 5000); assert.equal(q.level, 1.25);
});
test('quadro isolado lento não muda nada', () => { const q = new QualityController(); feed(q, 16.7, 80); assert.equal(q.frame(200), null); assert.equal(feed(q, 16.7, 80), null); });
```

- [ ] **Step 6: Implementar `quality.js`** — média de `dtMs` a cada `windowFrames`; média > `slowMs` → desce um nível e zera o contador de "quadros bons"; média ≤ `okMs` → soma `windowFrames` aos "quadros bons", e ao passar de `upAfterFrames` sobe um nível (se ainda houver "subidas" disponíveis) e zera; valores de `dtMs` acima de 100 entram como 100.

- [ ] **Step 7:** `npm test` → tudo passa. **Commit** — `feat: lógica dos fios, estados da partida e qualidade automática`

---

### Task 5: Olhar e clicar — ponteiro, mira, uma mão, teleporte pelo olhar

A partir daqui some o sistema antigo de gestos e calibração.

**Files:**
- Create: `js/pointer.js`
- Rewrite: `js/teleport.js`
- Modify: `js/hands.js`, `js/config.js`, `js/main.js`, `js/debug.js`, `index.html`, `css/style.css`
- Delete: `js/gestures.js`, `js/calibration.js`

**Interfaces:**
- Consumes: `PinchDetector, pinchRatio` (T2); `DwellTimer, FloorAnchor` (T2); `rayGround, segmentHitBoxes` e `resolveTeleport` (T3).
- Produces:
```js
// config.js (novos)
CONFIG.POINTER = { SNAP_DEG: 5, DWELL_ITEM_MS: 1000, DWELL_FLOOR_MS: 1500, MAX_RAY: 30, RETICLE_SIZE: 0.02 }
CONFIG.INTERACTION.OPEN_DIST = 3.0
CONFIG.HANDS.NUM_HANDS = 1; CONFIG.HANDS.DETECT_EVERY_N_FRAMES = 2
CONFIG.PINCH = { ON: 0.30, OFF: 0.45, STABLE_FRAMES: 2, LOST_FRAMES: 3 }
// hands.js
tracker.hand                    // a única Hand
tracker.pinchDown               // boolean
tracker.consumePinchPressed()   // true uma vez por aperto
// pointer.js
export class Pointer {
  constructor(scene, camera, world)
  items                         // Set de { object, key, onClick }  (object: Object3D clicável)
  blocker                       // { object, halfW, halfH } | null — plano de um painel aberto: olhar dentro dele não cai no chão
  hit                           // { kind, key, point: Vector3, dist, item?, target? }
                                // kind ∈ 'item' | 'box' | 'floor' | 'wall' | 'ui' | 'none'
  update()                      // recalcula hit (uma vez por quadro)
  setReticle(state, progress)   // state ∈ 'neutral' | 'ok' | 'bad'; progress 0..1
}
// teleport.js
export class Teleport {
  constructor(scene, rig, world, hooks)   // hooks: { onTeleport(), fade(ms) }
  preview(hit, nowMs)           // mostra o marcador; devolve { ok, reason }
  tryJump(nowMs)                // usa o último preview ok → boolean
  hide(); lastJump; jumps
}
// main.js
app.click()                     // enfileira um clique (qualquer fonte)
app.onClick(hit)                // despacha: item → item.onClick(); box → abrir; floor → teleport.tryJump
```

- [ ] **Step 1: `hands.js` — uma mão só**
- `numHands: 1`. Remover `left/right`, `_assign`, `_cost`, `flipHandedness` e o parâmetro `calib`; fica `this.hand = new Hand()`.
- `mapUV`: manter só o ramo "imagem cobrindo a tela". `depthFromRaw`: usar `CONFIG.HANDS.RAW_NEAR/RAW_FAR`.
- Em `update()`, **somente quando houve detecção nova** (`fresh`): `ratio = hand.present ? pinchRatio(hand.wlm) : null`; `evt = this.pinch.update(ratio)`; `if (evt.pressed) this._pressed = true`.
- `HandView`: uma instância, cor ciano `0x00e5ff`; as pontas 4 e 8 ficam amarelas `0xffe600` enquanto `pinchDown`.
- Se `startCamera()` ou `loadModel()` falhar, `main.js` mostra o aviso "Sem câmera: use toque ou segure o olhar" e segue (Review Focus 1).

- [ ] **Step 2: `pointer.js` — o que está sob a mira**

Em `update()`, com `o` = posição da câmera no mundo e `d` = direção do olhar (campos reutilizados):
```
1. ITENS: para cada item visível, ang = ângulo entre d e (posItem - o).
   Candidato = menor ang, se ang <= SNAP_DEG.  → kind 'item', key = item.key
2. Se não houve item e há blocker: interseção do raio com o plano do blocker;
   se cair dentro de (±halfW, ±halfH) em coordenadas locais → kind 'ui', key = null. Fim.
3. MUNDO (só se 1 e 2 não deram nada):
   parede  = segmentHitBoxes(o, o + d*MAX_RAY, world.boxes)      → distância tP
   caixa   = alvo elegível (interaction.eligible) cujo AABB expandido em 0.15 m
             o raio cruza, com distância <= OPEN_DIST             → distância tC
   chão    = rayGround(o, d), se distância <= MAX_RAY             → distância tG
   Vence o de menor distância:
     caixa → kind 'box',  key = 'box:' + id
     chão  → kind 'floor', key = floorAnchor.key(x, z)
     parede→ kind 'wall', key = null
   Nada → kind 'none', key = null, point = o + d*3.
```
Para o item 3-caixa use `segmentHitBoxes` com uma lista temporária pré-montada de caixas expandidas (montada quando a lista de alvos muda, não a cada quadro). `pointer.eligible` é uma função atribuída pelo `main.js`.

Mira: um `Mesh` de `RingGeometry(0.7, 1, 32)` + um `CircleGeometry(0.6, 24)` interno, ambos `MeshBasicMaterial` com `depthTest: false`, `renderOrder: 999`. A cada quadro: posição = `hit.point`, orientação = quaternion da câmera, escala = `hit.dist * RETICLE_SIZE`. Cores: `neutral` branco 60% opaco, `ok` ciano `0x00e5ff`, `bad` vermelho `0xff3355`. O círculo interno tem escala = `progress` (0 = invisível).

- [ ] **Step 3: `teleport.js` novo** — sem parábola. `preview(hit, nowMs)`: se `hit.kind !== 'floor'` esconde o marcador e devolve `{ ok: false }`; senão chama `resolveTeleport` (com `targets` = centros das caixas, `from` = posição do rig) e põe o marcador (anel existente, linhas 1102-1111 do original) em `x, z` — ciano se ok, vermelho se não, cinza se `aguarde`. `tryJump`: se o último preview foi ok → `hooks.fade(CONFIG.TELEPORT.FADE_MS)`, move o rig, `lastJump = nowMs`, `jumps++`, `hooks.onTeleport()`. Por enquanto `hooks.fade` usa o `#fade` do HTML (como hoje).

- [ ] **Step 4: `main.js` — cliques e laço**

Fontes de clique (todas chamam `this.click()`, que só faz `this._clickQueued = true`):
- toque/mouse: `pointerup` no canvas com deslocamento total < 10 px desde o `pointerdown`;
- pinça: `hands.consumePinchPressed()`;
- olhar parado: `dwell.update(key, ms, now).fired`;
- tecla `P` (PC).

Ordem no laço (substitui os passos 2–4 de `_loop`, linhas 2344-2367):
```
orientation.update(); rig.updateMatrixWorld(true)
hands.update(now, camera); handView.update()
pointer.update(); const hit = pointer.hit
tp = teleport.preview(hit, now)
dwellMs = hit.kind === 'item' || hit.kind === 'box' ? DWELL_ITEM_MS
        : hit.kind === 'floor' && tp.ok ? DWELL_FLOOR_MS : 0
dw = dwell.update(dwellMs ? hit.key : null, dwellMs, now)
if (hands.consumePinchPressed()) click()
if (dw.fired) click()
pointer.setReticle(hit.kind === 'item' || hit.kind === 'box' || (hit.kind === 'floor' && tp.ok) ? 'ok'
                   : hit.kind === 'floor' ? 'bad' : 'neutral', dw.progress)
if (_clickQueued) { _clickQueued = false; dwell.consume(); onClick(hit) }   // no máximo 1 clique por quadro
```
`onClick(hit)`: `item` → `hit.item.onClick()`; `box` → `interaction.openNearest()` (temporário até a Tarefa 6); `floor` → `teleport.tryJump(now)` e, se saltou, `floorAnchor.reset()`; outros → nada.

- [ ] **Step 5: Remover o sistema antigo**
- Apagar `js/gestures.js` e `js/calibration.js` e seus imports.
- `index.html`: remover os botões `btn-aim`, `btn-teleport`, `btn-touch`, `btn-pinch`, `btn-fist`, `btn-calib`. Ficam `btn-recenter`, `btn-stereo`, `btn-full`, `btn-debug`.
- `debug.js`: remover o que dependia de gestos/duas mãos; o painel mostra FPS, detecções/s, `pinça: razão 0.00 · apertada sim/não`, `mira: kind · dist`, teleporte (`reason`), posição.
- Tela inicial temporária (HTML, no `#overlay`): título + botão **Começar** → pede sensores, tenta câmera, e entra direto em `playing` (o tutorial volta na Tarefa 8). Tecla `Q`/`E`/`F`/`G` deixam de existir; `WASD`, `R`, `B` continuam.
- `interaction.js`: `checkTouch` e o detector na mão deixam de ser chamados; o painel antigo ainda é arrastável com o dedo/mouse (será trocado na Tarefa 6).

- [ ] **Step 6: Verificação (PC, `npm run dev`)**
1. Console sem erros; `npm test` passa.
2. Arrastar o mouse gira; a mira anda pelo chão; ciano em chão livre, vermelho dentro/atrás de bloco; ao olhar para o céu fica branca a 3 m (Review Focus 3).
3. Clique no chão → teleporta até 5 m. Clique numa parede → nada.
4. Deixar a mira parada no chão 1,5 s → o círculo enche e teleporta **uma vez**; continuar olhando para o mesmo ponto novo → enche de novo.
5. Com webcam: pinça → teleporta uma vez por pinça; mão entrando/saindo da imagem não gera clique (Review Focus 2).
6. Negar a câmera → aviso aparece e os itens 2–4 funcionam (Review Focus 1).
7. Olhar para uma caixa a menos de 3 m → mira ciano; clique → painel abre.

- [ ] **Step 7: Commit** — `feat: controle por olhar e clicar; remove gestos e calibração`

**Critérios de aceite:** nenhuma referência a `gesture`, `calib`, `locoSide`, `interSide` no código; `Pointer.update` não cria objetos por quadro; um clique por quadro no máximo.

---

### Task 6: Caixas e painel de fios por clique; feixe de luz

**Files:**
- Rewrite: `js/interaction.js`
- Modify: `js/main.js`, `js/config.js`, `js/scene.js`

**Interfaces:**
- Consumes: `WireGame` (T4); `Pointer.items`, `Pointer.blocker` (T5).
- Produces:
```js
CONFIG.INTERACTION = { OPEN_DIST: 3.0, PANEL_DIST: 1.2, PANEL_W: 0.9, PANEL_H: 0.6,
                       PLUG_R: 0.045, PANEL_CLOSE_DIST: 3.5, WIRES_PER_BOX: 3 }
export class Interaction {
  constructor(scene, camera, world, pointer, hooks)  // hooks: { onOpen(t), onWire(result), onFixed(t) }
  mode                    // 'tutorial' | 'game'
  eligible(t)             // boolean
  nearest                 // { target, dist } | null (atualizado em update)
  openTarget(t); closePanel(); reset()
  update(nowMs)           // fio na mão segue a mira; fecha se longe; atualiza feixe e nearest
}
```

- [ ] **Step 1: Painel** — construído em `openTarget(t)`:
- Posição: `PANEL_DIST` à frente da câmera, na direção horizontal do olhar, com o centro 0,15 m abaixo da altura dos olhos; virado para a câmera. Fixo no mundo.
- Fundo `PANEL_W × PANEL_H` (cor `0x101820`, 88% opaco) + moldura ciano; `depthTest: false` em tudo (como hoje, linhas 1441-1445).
- Plugs à esquerda (`x = -PANEL_W*0.30`), encaixes à direita (`x = +PANEL_W*0.30`), linhas igualmente espaçadas em `±PANEL_H*0.30`. Plug = esfera de raio `PLUG_R` na cor do fio; encaixe = anel (`RingGeometry(PLUG_R, PLUG_R*1.5)`) na cor.
- Cada plug e cada encaixe entra em `pointer.items` com `key: 'plug:i'` / `'socket:k'` e `onClick` chamando `game.clickPlug(i)` / `game.clickSocket(k)`. `pointer.blocker` = o fundo. Ao fechar: remover os itens e o blocker, e liberar as geometrias.
- Em tela estreita (retrato) o painel encolhe: `escala = min(1, larguraVisível * 0.9 / PANEL_W)`, com `larguraVisível = 2 * PANEL_DIST * tan(fovVertical/2) * camera.aspect` (regra já usada na linha 1400).

- [ ] **Step 2: Reações aos resultados do `WireGame`**
- `picked`: a ponta do fio `i` passa a seguir o ponto onde o raio do olhar cruza o plano do painel (limitado ao retângulo), 0,03 m à frente do painel; o plug ganha um halo branco.
- `connected`: a ponta vai para o encaixe e fica; `hooks.onWire('connected')`; se `game.done` → `t.state = 'fixed'`, `hooks.onFixed(t)`, fecha o painel após 900 ms.
- `wrong`: o encaixe pisca (escala 1,6 → 1 em 0,3 s), a ponta volta para casa; `hooks.onWire('wrong')`.
- `dropped`: a ponta volta para casa.
- Clique com `hit.kind === 'ui'` → `game.clickElsewhere()` (ligado no `onClick` do `main.js`).

- [ ] **Step 3: Abrir caixa** — `main.js onClick`: `hit.kind === 'box'` → `interaction.openTarget(hit.target)`. `pointer.eligible = (t) => interaction.eligible(t)`. Já aberta para a mesma caixa → ignora. Jogador a mais de `PANEL_CLOSE_DIST` do painel → fecha (o fio na mão é solto).

- [ ] **Step 4: Feixe de luz** — um único cilindro (raio 0,08 m, altura 6 m, `MeshBasicMaterial` ciano, `transparent`, `opacity: 0.35`, `depthWrite: false`) reposicionado sobre `nearest.target` em `update()`; invisível se não houver alvo elegível ou se o painel dessa caixa estiver aberto.

- [ ] **Step 5: Verificação (PC)**
1. Olhar para a caixa do pedestal e clicar → painel a ~1,2 m, legível.
2. Clicar num plug → o fio segue a mira. Clicar no encaixe de outra cor → pisca e o fio volta. Clicar no certo → liga.
3. Só com olhar parado (sem clicar): pegar e ligar os 3 fios funciona.
4. Com o painel aberto, olhar para o fundo do painel não mostra marcador de teleporte; olhar para o chão fora dele e clicar teleporta.
5. Afastar-se > 3,5 m fecha o painel sem erro no console.
6. O feixe aparece na caixa mais próxima e muda quando ela é consertada.

- [ ] **Step 6: Commit** — `feat: painel de fios por clique e feixe de luz`

**Critérios de aceite:** `interaction.js` não contém regra de fio (tudo via `WireGame`); nenhum código de arrastar por ponteiro de tela restou; itens sempre removidos de `pointer.items` ao fechar.

---

### Task 7: Informação dentro do mundo (`hud3d.js`)

**Files:**
- Create: `js/hud3d.js`
- Modify: `js/main.js`, `js/teleport.js` (fade), `index.html`, `css/style.css`

**Interfaces — Produces:**
```js
export class Hud3D {
  constructor(scene, camera, pointer)
  setStatus(text)                 // faixa baixa, ex.: '2:41   📡 2/5'  ('' esconde)
  toast(text, ms = 2000)          // aviso curto acima do centro
  setArrow(worldPos, dist)        // seta para a caixa mais próxima; worldPos null esconde
  fade(ms)                        // tela preta que some em ms
  showPanel({ title, lines, buttons })   // buttons: [{ label, onClick }] ; painel fixo no mundo a 2 m
  hidePanel()
  resize()                        // reajusta a escala em tela estreita
  update(dt, nowMs)
}
```

- [ ] **Step 1: Placa de texto** — função interna `textPlane(widthM, heightM, pxW, pxH)` → `{ mesh, draw(fn) }`: `CanvasTexture` + `MeshBasicMaterial({ transparent: true, depthTest: false })`, `renderOrder: 998`. `draw(fn)` limpa o canvas, chama `fn(ctx, pxW, pxH)` e marca `texture.needsUpdate = true`. Fonte: `bold 44px system-ui, sans-serif`, texto branco sobre retângulo arredondado `rgba(11,17,24,0.8)`.

- [ ] **Step 2: Elementos presos à câmera** (filhos de um `Group` filho da câmera; coordenadas locais em metros):

| Elemento | Posição | Tamanho | Textura |
|---|---|---|---|
| status | `(0, -0.30, -1.2)` | 0,50 × 0,09 | 512×96 |
| toast | `(0, 0.24, -1.2)` | 0,80 × 0,12 | 1024×160 |
| seta + distância | `(0, -0.42, -1.2)` | cone 0,05 + placa 0,16 × 0,06 | 256×96 |
| fade | `(0, 0, -0.2)` | plano 2 × 2 preto | — |

- `setStatus`/`toast`/distância só redesenham se o texto mudou (distância arredondada a 0,5 m).
- Seta: cone que aponta, no espaço local da câmera, para a direção de `worldPos` (usar `lookAt` do ponto convertido com `worldToLocal`).
- Fade: `opacity` de 1 a 0 linear em `ms`; invisível quando 0.
- `resize()`: `escala = min(1, 2 * 1.2 * tan(fovV/2) * camera.aspect * 0.9 / 0.8)` aplicada ao grupo (em retrato o campo horizontal é estreito). No modo óculos a escala é 1.

- [ ] **Step 3: Painel de mensagem** (`showPanel`) — placa 1,2 × 0,8 m (1024×682 px) fixa no mundo, 2 m à frente na direção horizontal do olhar, centro na altura dos olhos; título + linhas; cada botão é uma placa 0,5 × 0,14 m abaixo do texto, registrada em `pointer.items` (`key: 'btn:' + índice`). `pointer.blocker` = a placa. `hidePanel()` desfaz tudo.

- [ ] **Step 4: Ligar** — `app.toast()` passa a chamar `hud.toast()`; `teleport` usa `hud.fade`; a seta recebe `interaction.nearest`; o status mostra tempo e contador. Remover de `index.html`/CSS: `#hud`, `#hud-top`, `#timer`, `#count`, `#compass`, `#crosshair`, `#toast`, `#fade`; remover `_updateHud`.

- [ ] **Step 5: Verificação (PC)**
1. Janela em formato paisagem e em formato retrato (estreita): status, aviso e seta inteiros dentro da tela.
2. O tempo muda a cada segundo sem queda de FPS (painel 🐞).
3. Teleporte escurece e clareia.
4. Botão 👓 (tela dividida antiga): status, mira e avisos aparecem nos **dois** olhos.
5. No console: `__app.hud.showPanel({ title: 'Teste', lines: ['linha'], buttons: [{ label: 'OK', onClick: () => __app.hud.hidePanel() }] })` → olhar para o botão 1 s fecha o painel.

- [ ] **Step 6: Commit** — `feat: HUD dentro do mundo 3D`

**Critérios de aceite:** nenhum `needsUpdate = true` de textura dentro do laço sem checagem de mudança; nenhum elemento de HUD do jogo restou no HTML.

---

### Task 8: Fluxo do jogo e som

**Files:**
- Create: `js/audio.js`
- Modify: `js/main.js`, `js/debug.js`, `index.html`, `css/style.css`

**Interfaces:**
- Consumes: `GameState` (T4), `Hud3D` (T7), `Interaction` (T6).
- Produces:
```js
// audio.js
export class Sfx { unlock(); play(name) }   // name ∈ 'click'|'teleport'|'connect'|'wrong'|'fixed'|'win'|'lose'|'warn'
```

- [ ] **Step 1: `audio.js`** — um `AudioContext` criado em `unlock()` (chamado no primeiro toque do usuário). Cada som = 1 a 3 notas de `OscillatorNode` com envelope de ganho (ataque 5 ms, queda exponencial), duração total ≤ 0,5 s, volume máximo 0,25. `play` antes de `unlock` não faz nada e não dá erro. Timbres: a critério de quem implementa; `wrong` deve soar grave e `connect` agudo.

- [ ] **Step 2: Tela inicial (HTML, `#menu`)** — título "A rede da escola caiu!", uma linha "Olhe e clique para andar. Religue os 5 pontos de sinal." e:
1. botão **Preparar** → `sfx.unlock()`, permissão dos sensores, tenta a câmera e o modelo das mãos (mostra o progresso em uma linha), pede `wakeLock`;
2. depois de preparado aparecem **Jogar sem óculos** e **Jogar com óculos** (o segundo, por enquanto, só liga a tela dividida antiga; a Tarefa 9 troca).
Ao jogar: esconde `#menu`, `orientation.recenter()`, `gameState.start()`.

- [ ] **Step 3: Tutorial dentro do mundo** — texto do passo atual em `hud.toast(texto, 999999)` (fica até trocar):

| Passo | Texto | Avança com |
|---|---|---|
| 0 | `Olhe para o chão e clique (toque, pinça ou segure o olhar)` | `tutorialEvent('teleport')` no `onTeleport` |
| 1 | `Vá até a caixa preta e clique nela` | `tutorialEvent('open')` no `onOpen` |
| 2 | `Clique num fio e depois no encaixe da mesma cor` | `tutorialEvent('fixed')` no `onFixed` |
| 3 | `Pronto! Valendo!` | automático (evento `matchStart`) |

`interaction.mode` = `'tutorial'` nos passos 0–3 e `'game'` na partida.

- [ ] **Step 4: Partida e fim** — a cada quadro: `events = gameState.tick(dt, houveCliqueNesteQuadro)` com `dt` já limitado a 0,1 s (linha 2334 do original já limita `dtMs` a 100). Reações:

| Evento | O que acontece |
|---|---|
| `matchStart` | `interaction.reset()`, modo `game`, rig volta ao spawn, `hud.fade(300)`, toast `Valendo! Siga a seta.` |
| `warn30` | `sfx.play('warn')`, toast `30 segundos!` |
| `win` / `timeout` | `sfx.play('win'/'lose')`, fecha painel de fios, `hud.showPanel` com título `Rede restaurada!` ou `O tempo acabou`, linhas `Caixas: N/5` e `Tempo: m:ss`, botão `Jogar de novo` → `gameState.beginMatch()` + reações de `matchStart` |
| `idleReset` | `hud.hidePanel()`, `interaction.reset()`, modo `tutorial`, rig no spawn, passo 0 |

Status do HUD: na partida `m:ss   📡 N/5`; no tutorial `Treino`. Sons: `click` em todo clique que fez algo, `teleport`, `connect`, `wrong`, `fixed`.

- [ ] **Step 5: Painel do operador** (botões pequenos no HTML, visíveis fora do modo óculos): `⟲` recentrar · `⏭` pular tutorial (`beginMatch`) · `↺` reiniciar (`toMenu` + mostra `#menu`) · `🐞` depuração.

- [ ] **Step 6: Tela apagada / aba em segundo plano** (Review Focus 5) — em `document.visibilitychange` ao voltar a ficar visível: pedir `wakeLock` de novo e fazer `this._last = performance.now()`.

- [ ] **Step 7: Verificação (PC)**
1. Fluxo completo: Preparar → Jogar sem óculos → 3 passos do tutorial → partida → consertar 5 → painel de vitória → `Jogar de novo`.
2. Console: `__app.gameState.timeLeft = 32` → aviso dos 30 s uma vez; `= 1` → painel "O tempo acabou".
3. No painel de fim, não tocar em nada por 20 s → volta ao tutorial passo 0.
4. Trocar de aba por 30 s durante a partida e voltar → o relógio perdeu no máximo ~0,1 s.
5. Sons tocam; nenhum erro se `Jogar` for alcançado sem áudio.

- [ ] **Step 8: Commit** — `feat: fluxo completo (menu, tutorial, partida, fim) e sons`

**Critérios de aceite:** `main.js` não guarda estado de partida próprio (tudo em `GameState`); textos exatamente como nas tabelas.

---

### Task 9: Modo óculos

Executar **só a variante escolhida na Tarefa 0**.

**Files:**
- Create: `js/display.js`
- Modify: `js/main.js`, `js/config.js`, `js/debug.js`, `index.html`

**Interfaces — Produces (iguais nas duas variantes):**
```js
export class Display {
  constructor(renderer, scene, camera, hooks)   // hooks: { onClick(), onExit() }
  mode                       // 'mono' | 'glasses'
  async enterGlasses()       // chamar direto do clique do botão
  exitGlasses()
  render()                   // desenha o quadro no modo atual
  resize()
}
```
`main.js`: `_render()` vira `display.render()`; **Jogar com óculos** chama `display.enterGlasses()`; quando `mode === 'glasses'` os botões do operador ficam escondidos.

#### Variante A — WebXR

- [ ] **A1: Entrar** — dentro do clique, sem `await` antes:
```js
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local');
const session = await navigator.xr.requestSession('immersive-vr');
session.addEventListener('select', () => hooks.onClick());
session.addEventListener('end', () => { this.mode = 'mono'; hooks.onExit(); });
await renderer.xr.setSession(session);
this.mode = 'glasses';
```
Se `requestSession` rejeitar: toast `Modo óculos indisponível` e continuar em `mono`.
- [ ] **A2: Orientação** — enquanto `renderer.xr.isPresenting`, `main.js` **não** chama `orientation.update()` (o WebXR move a câmera). A altura vem do `head` (y = 1,6), por isso o espaço é `'local'`.
- [ ] **A3: Render** — `display.render()` = `renderer.render(scene, camera)` nos dois modos (o three divide os olhos sozinho). Remover `StereoCamera` e o `_render` antigo. `hud.resize()` usa escala 1 em `glasses`.
- [ ] **A4: Sair** (Review Focus 4) — `onExit`: `renderer.xr.enabled` continua true; chamar `app.resize()` e `orientation.recenter()`; a partida continua de onde estava; os botões do operador voltam.
- [ ] **A5: Verificação no celular (Francisco, após push)** — entrar com óculos: imagem com correção de lente como na referência; girar a cabeça sem atraso; tocar na tela teleporta; pinça funciona; status e mira visíveis nos dois olhos; tocar no X volta ao modo normal com a partida em andamento.

#### Variante B — tela dividida própria com correção de lente

- [ ] **B1: Parâmetros** — `CONFIG.GLASSES = { FOV: 90, IPD: 0.064, LENS_K: 0.25, LENS_SEP: 0.5, GRID: 24, SCALE: 1.0 }`, salvos em `localStorage` (`cacador-sinal-oculos-v1`). `LENS_SEP` = posição horizontal do centro de cada lente como fração da largura de meio-ecrã (0,5 = centro de cada metade).
- [ ] **B2: Desenho em dois passos**
1. Renderizar os dois olhos lado a lado num `WebGLRenderTarget` de `(w*SCALE) × (h*SCALE)` com `StereoCamera` (`eyeSep = IPD`, câmera com `fov = FOV` e `aspect = (w/2)/h`), como o `_render` atual faz na tela (linhas 2439-2451).
2. Desenhar na tela, com câmera ortográfica `(-1, 1, 1, -1)`, duas malhas (uma por olho) de `GRID × GRID` quadrados com `MeshBasicMaterial({ map: alvo.texture })`.

Malha de cada olho (`eye` = 0 esquerdo, 1 direito), para cada vértice da grade com `u, v ∈ [0, 1]`:
```js
// coordenada centrada no centro da lente, em unidades onde a meia-altura = 1
const a = (w / 2) / h;                       // proporção de um olho
const cx = (u - 0.5) * 2 * a, cy = (v - 0.5) * 2;
const r2 = cx * cx + cy * cy;
const f = 1 / (1 + LENS_K * r2 + LENS_K * r2 * r2);   // puxa as bordas para dentro (barril)
const px = cx * f / a, py = cy * f;          // de volta para [-1, 1] dentro do olho
// posição na tela: cada olho ocupa metade da largura; centro da lente em LENS_SEP
const centerX = eye === 0 ? -1 + LENS_SEP : 1 - LENS_SEP;   // em NDC da tela inteira
position = [centerX + px * 0.5, py, 0];
uv = [(eye + u) / 2, v];                     // metade esquerda/direita da textura
```
Recriar as malhas só quando `w`, `h` ou um parâmetro mudar. Fundo preto; uma linha vertical fina branca no centro (guia de encaixe).
- [ ] **B3: Entrar/sair** — `enterGlasses()`: `document.documentElement.requestFullscreen()` e depois `screen.orientation.lock('landscape')` (ignorar erro); `mode = 'glasses'`. Clique = toque na tela (já existe). Sair: botão `✕` pequeno no canto (único HTML visível) ou evento `fullscreenchange` sem tela cheia → `mode = 'mono'`, `resize()` (Review Focus 4).
- [ ] **B4: Ajustes** — no painel 🐞, três controles deslizantes: `Força da lente` (0–0,6 → `LENS_K`), `Distância entre lentes` (0,35–0,65 → `LENS_SEP`), `Campo de visão` (70–110 → `FOV`). Mudança aplicada na hora e salva.
- [ ] **B5: Verificação** — PC: linhas retas do mapa aparecem abauladas para fora nas bordas de cada olho, bordas pretas arredondadas, HUD nos dois olhos, FPS ≥ 55. Celular (Francisco): dentro do óculos as linhas ficam retas depois de ajustar `Força da lente`; sair da tela cheia volta ao modo normal sem congelar.

- [ ] **Commit** — `feat: modo óculos (variante A|B)`

**Critérios de aceite:** existe um único caminho de render (`display.render()`); a partida sobrevive a entrar e sair do modo óculos.

---

### Task 10: Velocidade

**Files:**
- Modify: `js/main.js`, `js/display.js`, `js/hands.js`, `js/debug.js`

**Interfaces — Consumes:** `QualityController` (T4).

- [ ] **Step 1: Qualidade automática** — `quality.frame(dtMs)` a cada quadro; quando devolver um nível: modo `mono` → `renderer.setPixelRatio(nível)` + `app.resize()`; Variante B em `glasses` → refazer o alvo de render com `SCALE = nível / 1.5`; Variante A em `glasses` → não fazer nada (o WebXR controla). Nível inicial: índice 1 (1,25).
- [ ] **Step 2: Mão não atrasa o desenho** — manter a detecção em quadros alternados (`DETECT_EVERY_N_FRAMES = 2`); se a média de `detectMs` passar de 25 ms por 2 s, subir para 3 e avisar no painel 🐞; nunca chamar `detectForVideo` duas vezes no mesmo quadro.
- [ ] **Step 3: Painel 🐞** — mostrar: FPS, ms por quadro, nível de qualidade, detecções/s, `detectMs`, `renderer.info.render.calls` e `.triangles`.
- [ ] **Step 4: Verificação** — PC: no painel, simular lentidão com `__app.quality.frame(40)` 90 vezes no console → resolução cai um degrau visivelmente. Celular (Francisco): anotar FPS no modo normal e no modo óculos, com e sem a mão na frente. **Meta: ≥ 45 FPS com a mão sendo rastreada.** Se não atingir, relatar os números ao revisor antes de mudar qualquer coisa.
- [ ] **Step 5: Commit** — `perf: qualidade automática e detecção de mão limitada`

---

### Task 11: Modelo da escola e modo editor

**Files:**
- Modify: `js/scene.js`, `js/debug.js`, `js/main.js`, `index.html` (importmap)
- Create: `modelos/LEIA-ME.md`

**Interfaces:**
- Consumes: `MAP.model` (T3), `world.blockMeshes` (T3).
- Produces: `world.loadModel()` → `Promise<boolean>`.

- [ ] **Step 1: Carregar** — importmap ganha `"three/addons/": "./vendor/three/"`; `import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'`. Se `MAP.model` não for null: carregar `url`; aplicar `scale`, `position`, `rotationY`; `scene.add`; esconder `world.blockMeshes` e o chão/grade provisórios; depois de `updateMatrixWorld(true)`, marcar `matrixAutoUpdate = false` em todas as malhas do modelo. Falha no carregamento → toast `Modelo da escola não carregou` e o mapa de blocos continua visível (o jogo segue jogável).
- [ ] **Step 2: Modo editor** (botão `✏` no painel 🐞): mostra os blocos de colisão como arame vermelho por cima do modelo e as caixas de sinal com um marcador; o painel exibe a posição e direção do jogador (`x, z, yaw` com 2 casas) e um botão **Copiar posição** (área de transferência, no formato `[x, z]`); no PC, `WASD` atravessa paredes enquanto o editor está ligado.
- [ ] **Step 3: `modelos/LEIA-ME.md`** — passo a passo para o Francisco: exportar em `.glb`; limites (≤ 100 mil triângulos, ≤ 15 MB, texturas ≤ 1024 px); salvar em `modelos/escola.glb`; preencher `MAP.model`; ligar o editor, andar pela escola e usar **Copiar posição** para preencher `spawn`, `blocks` (paredes) e `targets` (caixas) em `js/map.js`.
- [ ] **Step 4: Verificação** — baixar o modelo de exemplo `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Box/glTF-Binary/Box.glb` para `modelos/teste.glb` e apontar `MAP.model` para ele: o cubo aparece, os blocos somem, a colisão continua valendo, o editor mostra os arames. Apontar para um arquivo que não existe: aviso aparece e os blocos continuam visíveis. Ao terminar, voltar `MAP.model` para `null` e apagar `modelos/teste.glb`.
- [ ] **Step 5: Commit** — `feat: suporte ao modelo da escola e modo editor`

---

### Task 12 (opcional): Abrir sem internet

**Files:**
- Create: `sw.js`
- Modify: `js/main.js` (registro)

- [ ] **Step 1:** `sw.js` com cache nomeado `cacador-v1`: no `install`, guardar `index.html`, `css/style.css`, todos os `js/**`, `vendor/**` e, se existir, o `.glb`; no `fetch`, responder do cache e, em paralelo, atualizar o cache pela rede (só pedidos GET da mesma origem). Mudou algum arquivo → aumentar o número do nome do cache e apagar os antigos no `activate`.
- [ ] **Step 2:** Verificação — abrir uma vez com internet; no DevTools marcar "Offline" e recarregar: o jogo abre e a mão é rastreada.
- [ ] **Step 3:** Commit — `feat: funciona sem internet depois da primeira abertura`

---

## Depois do plano

- Teste final com o óculos de verdade e 2 ou 3 pessoas que nunca jogaram; anotar onde travam.
- Quando o modelo da escola existir: seguir `modelos/LEIA-ME.md`.
