# Caçador de Sinal — protótipo VR (versão de teste)

Protótipo para a feira de ciências. A ideia é **testar as mecânicas**, não fazer o jogo final:

- a visão gira junto com o celular;
- as mãos aparecem no jogo (rastreadas pela câmera traseira);
- gestos;
- teleporte;
- tocar caixas e arrastar fios.

O mapa é só um monte de blocos coloridos, e as **caixas pretas** são os pontos de sinal.

Tudo é HTML/JS puro, com **Three.js** e **MediaPipe Hand Landmarker** carregados por CDN. Não tem etapa de build.

## Como abrir

1. No GitHub, abra **Settings → Pages** e escolha *Deploy from a branch*, branch `main`, pasta `/ (root)`.
2. Depois de 1–2 minutos o jogo fica em:
   **https://francisco12-cpu.github.io/realidade-aumentada/**
3. Abra o link no **Chrome do Infinix** e aceite as permissões de **câmera** e de **sensores de movimento**.

**Sempre a versão mais nova:** o `sw.js` (service worker) faz o link normal conferir com o GitHub a cada abertura e baixar o que mudou. Não precisa de aba anônima nem de `?v=`. A versão aparece na tela inicial, ao lado do título.

**Sem internet na feira:** na primeira vez que o link abre com internet, o `sw.js` já baixa **tudo** (jogo, Three.js, MediaPipe e o modelo das mãos). Depois disso o jogo abre e rastreia as mãos sem internet. A tela inicial avisa quando está pronto: *"✔ Jogo guardado: funciona sem internet"*.

**Atalho: arquivo único.** O arquivo `dist/index.html` tem o jogo inteiro (CSS e JS embutidos). Ele é **gerado sozinho** por uma GitHub Action (`.github/workflows/arquivo-unico.yml`) a cada mudança no código da `main`, então nunca fica desatualizado. Para gerar à mão: `python3 tools/build-single.py`.

## Modo feira

Ligue o botão **🎪 Modo feira** na tela inicial (fica salvo no celular), ou abra o link com `?feira` no final.

- Partida de **3 minutos** com **4 caixas** (sala vermelha, cantina, quadra e biblioteca).
- O tutorial começa do lado do pedestal: só tocar a caixa e ligar o fio.
- No fim da partida aparece **👤 Próximo jogador**, e depois de 25 s o jogo volta sozinho para essa tela. A calibração e as permissões continuam valendo.
- Os números ficam em `CONFIG.FEIRA` (`js/config.js`).

## Placar, sorteio e dificuldade

- **Placar e ranking do dia:** no fim da partida aparecem os pontos (100 por caixa consertada + 2 por segundo que sobrou, quando conserta todas) e a posição no dia. O jogador pode digitar o nome. O botão **🏆 Ranking do dia** mostra o top 10, que fica guardado só no celular (modo feira e modo normal têm rankings separados). Para apagar, toque duas vezes em *Apagar ranking de hoje*.
- **Caixas sorteadas:** a cada partida, a caixa de cada lugar é sorteada entre 4 posições: no chão, em cima de mesas e estantes, na parede ou no teto. Os lugares ficam em `TARGET_DEFS` (`js/scene.js`). Para desligar: `INTERACTION.RANDOM_SPOTS = false`.
- **Dificuldade crescente:** a 1ª e a 2ª caixa têm 3 fios, a 3ª e a 4ª têm 4, e as últimas têm 5, com cores repetidas (qualquer anel da mesma cor serve). No modo feira: 3, 3, 4, 5. Ajuste em `INTERACTION.WIRE_LEVELS` e `FEIRA.WIRE_LEVELS`.
- **Aviso de mão:** se o jogo não vê nenhuma mão por 3 s, aparece *"✋ Mostre a mão para a câmera de trás"*. Se a imagem da câmera está escura, aparece *"💡 Pouca luz ou câmera tapada"*. No óculos, o aviso vai para o painel 3D. Ajuste em `HAND_HINT`.

## Som, vibração e conforto

- **Som** gerado no código (sem arquivos): bipe do detector, que acelera e fica mais agudo perto da caixa; sons de caixa aberta, fio certo/errado, caixa consertada, vitória e derrota; alarme quando falta 1 minuto e contagem nos últimos 10 s. Botão 🔊 para ligar/desligar.
- **Vibração** ao abrir a caixa, pegar e encaixar o fio, e ao consertar.
- **Faíscas:** a menos de 5 m de uma caixa quebrada, ela solta faíscas, brilha e o LED pisca mais rápido.
- **Escurecer bordas ao andar** (vinheta): diminui o enjoo. Funciona na tela normal, no óculos e no modo VR do Chrome. Dá para desligar na tela inicial.

> Câmera e sensores só funcionam em **HTTPS**, e o GitHub Pages já usa HTTPS.
> No PC dá para testar com `python3 -m http.server` e abrir `http://localhost:8000`, porque o localhost também é aceito.

## Usar sem o GitHub (servidor no PC com Windows)

1. Dê dois cliques em **`INICIAR-SERVIDOR.bat`**.
   - Se não tiver Python, ele oferece instalar (precisa de internet só nessa hora).
   - Na primeira vez ele guarda as bibliotecas em `servidor/cache/`. Depois disso funciona **sem internet**.
2. Abre uma página com um **QR Code**: aponte o celular para ele, ou digite o endereço `https://IP-DO-PC:8443`.
   - O celular precisa estar no **mesmo Wi-Fi** do PC (ou o PC conectado no roteador do celular).
   - Vai aparecer "Sua conexão não é particular": toque em **Avançado → Continuar**. O certificado é deste PC, e o HTTPS é obrigatório para a câmera e os sensores.
   - Se o Windows perguntar sobre o firewall, clique em **Permitir** (redes privadas).
3. No próprio PC o jogo fica em `http://localhost:8000`.
4. Para desligar, feche a janela preta.

O **certificado HTTPS** (`servidor/cert.pem` e `key.pem`) é criado **em cada PC** na primeira vez, com o `openssl` que vem com o Git para Windows ou, se não tiver, com o módulo Python `cryptography` (instala sozinho se tiver internet). Esses arquivos não vão para o GitHub.

O servidor (`servidor/servidor.py`) só usa a biblioteca padrão do Python. Também funciona em Linux e Mac: `python3 servidor/servidor.py`.

## Fluxo

1. **Tela inicial.** Você pode começar do zero, usar a calibração salva ou entrar sem câmera, só com os botões.
2. **Calibração.** São estes passos:
   - recentrar a visão;
   - conferir qual é a mão esquerda (a câmera traseira inverte o rótulo do MediaPipe);
   - escolher a mão de locomoção;
   - gravar as 5 poses;
   - medir o alcance (cantos da imagem);
   - medir a profundidade (mão perto e longe).

   Tudo fica salvo no `localStorage`. O botão ⚙ refaz a calibração.
3. **Tutorial.** Você precisa dar 1 teleporte, tocar a caixa do pedestal cinza e conectar 1 fio.
4. **Partida** de 6 minutos com 6 caixas espalhadas pela "escola de blocos": sala vermelha, laboratório (na parede), sala verde, **teto da cantina**, quadra e biblioteca. A partida termina em vitória (consertou todas) ou derrota (o tempo acabou).

## Gestos

| Gesto | Mão | Efeito |
|---|---|---|
| Mão relaxada | qualquer | nada |
| **Palma aberta** (qualquer mão) / segurar o **botão do óculos** | qualquer | anda para onde você está olhando; fechou ou abaixou a mão, para (padrão) |
| **Balançar as mãos** ou **correr parado** | qualquer | (modo `'correr'`) anda mais rápido quanto mais forte o balanço |
| **Pistolinha** (indicador + polegar esticados) | locomoção (modo teleporte) | mira o teleporte: o alvo é o ponto do chão que a mão "cobre" na sua visão |
| **Palma aberta** logo depois da pistolinha | locomoção (modo teleporte) | teleporta |
| **Ponta do indicador** encostando na caixa | interação | abre a caixa |
| **Pinça** (polegar + indicador) ou **punho** sobre a bolinha | qualquer | pega o fio, arrasta e solta no anel da mesma cor |

O **detector de sinal** é uma seta com uma barra, presa às costas da mão de interação. A cor vai de vermelho (longe) a verde (perto). A pílula no topo da tela também mostra a direção e a distância da caixa mais próxima.

Por padrão a **esquerda** anda e a **direita** interage. Dá para trocar na calibração.

## Botões e teclado (para depurar)

| Botão | Tecla (PC) | Função |
|---|---|---|
| ⟲ | R | recentrar |
| 🏃 Andar (segurar) | W | anda para onde está olhando |
| 🎯 Mirar / 🚀 Ir | segurar Q / soltar Q | (modo teleporte) mirar com o olhar / teleportar |
| 👆 Tocar | E | abre a caixa mais próxima (até 3 m) |
| 🤏 Pinça / ✊ Pegar (segurar) | F / G | pega o fio que estiver sob a mira do centro |
| arrastar o dedo/mouse no painel | — | arrasta os fios |
| arrastar na tela (só sem sensor) | — | gira a visão |
| — | WASD | anda devagar (só depuração) |
| 👓 Óculos | — | modo óculos: usa o **modo VR do Chrome (WebXR)**, que acerta as lentes pelo QR Code do óculos; sem WebXR, usa o modo próprio (tela dividida com correção da lente) |
| 🔧 Ajustar | — | ajusta o óculos (distância e altura das imagens, curvatura, ampliação, campo de visão) |
| ❓ | — | passo a passo para montar e ajustar o óculos |
| 🐞 | B | painel de depuração (FPS, mãos, gesto, confiança, prévia da câmera) |

O **FPS** fica sempre no canto superior esquerdo. O painel 🐞 mostra também:

- o tempo e a taxa de detecção das mãos;
- o rótulo bruto do MediaPipe;
- as medidas dos dedos;
- o estado do teleporte e a distância até a caixa.

## O que testar (critérios)

- [ ] Abrir o link no Infinix, aceitar as permissões e passar pela calibração.
- [ ] Girar o celular e ver o mundo girar junto, sem atraso perceptível.
- [ ] Ver as duas mãos no mundo, como luvas sólidas (pulseira azul = esquerda, laranja = direita; a ponta dos dedos muda de cor com o gesto).
- [ ] A pistolinha mostra a parábola (bolinhas), o círculo de alcance e o alvo; a palma aberta faz o jogador deslizar até lá, respeitando o máximo de 4 m e a espera de 0,9 s.
- [ ] O detector aponta para a caixa preta mais próxima.
- [ ] Tocar a caixa abre o painel; a pinça arrasta e conecta os fios; a caixa fica verde.
- [ ] O cronômetro termina a partida com vitória ou derrota.
- [ ] O FPS aparece na tela.

## Ajustes

Todos os números de ajuste ficam em **`js/config.js`**, por exemplo:

- `TELEPORT.MAX_DIST` e `TELEPORT.COOLDOWN_S`: alcance e espera do teleporte;
- `GAME_TIME_S`: duração da partida;
- `INTERACTION.TOUCH_DIST`: distância para o toque contar;
- `HANDS.VIRTUAL_NEAR` e `HANDS.VIRTUAL_FAR`: até onde a mão virtual alcança;
- `FILTER.*`, `FILTER_ANCHOR.*`, `FILTER_DEPTH.*` e `HANDS.FOLLOW_RATE`: suavização da mão (forma dos dedos, posição, profundidade e deslize entre detecções);
- `LOCOMOTION`: `'palma'` (padrão), `'correr'` ou `'teleporte'`; `RUN.WALK_SPEED`: velocidade do andar; `RUN.*`: velocidade, sensibilidade do balanço das mãos e da corrida parada;
- `TELEPORT.AIM_MODE`: `'olhar'` (olho→mão, padrão, mais estável) ou `'dedo'` (para onde o dedo aponta);
- `TELEPORT.MODE`: `'dash'` (desliza rápido até o alvo) ou `'fade'` (pisca a tela); `TELEPORT.AIM_SMOOTH`: suavização da mira;
- `GESTURE.STABLE_FRAMES`: quantos quadros seguidos um gesto precisa para valer;
- `HANDS.DETECT_EVERY_N_FRAMES = 2`: detecta as mãos em quadros alternados, o que dá mais FPS se o celular sofrer.

## Estrutura

```
index.html          página + import map (Three.js / MediaPipe via CDN)
css/style.css
teste-xr.html       página de teste do WebXR + câmera (veio da branch feira-vr)
docs/               desenho e plano da versão da feira
.github/workflows/  Action que gera o dist/index.html sozinho
INICIAR-SERVIDOR.bat liga o servidor local no Windows (PC + celular, sem GitHub)
servidor/           servidor HTTPS local, página com QR Code, certificado e cache das bibliotecas
sw.js               service worker: link sempre na versão mais nova + funciona sem internet
js/config.js        todos os números ajustáveis
js/options.js       opções do jogador (som, vibração, vinheta, modo feira)
js/audio.js         sons (Web Audio) e vibração
js/ranking.js       placar e ranking do dia (localStorage)
js/handhint.js      aviso "mostre a mão" / "pouca luz"
js/main.js          loop, estados do jogo (calibração → tutorial → partida → fim), HUD
js/scene.js         mapa de blocos e caixas pretas
js/orientation.js   rotação do celular → câmera (RelativeOrientationSensor / deviceorientation)
js/hands.js         MediaPipe, esquerda/direita estável, profundidade, suavização, esqueleto 3D
js/filters.js       filtro One Euro
js/gestures.js      classificação dos gestos e limiares a partir da calibração
js/teleport.js      parábola, limites, teleporte
js/interaction.js   tocar caixa, painel, fios, pinça, detector de sinal
js/calibration.js   calibração + tutorial + localStorage
js/debug.js         painel de depuração, botões e teclado
```

## Limitações conhecidas

- **Profundidade da mão** é estimada pelo tamanho da mão na imagem. Por isso a interação com os fios usa a **posição na tela** (mais confiável), e só o toque na caixa usa a distância 3D.
- O MediaPipe roda numa thread separada (Web Worker), para não travar a tela. Se o worker falhar, ele volta sozinho para a thread principal. A resolução se ajusta pelo FPS (`QUALITY.*`).
- A posição da cabeça não é rastreada, só a rotação. Para alcançar caixas no chão, olhe para baixo e estique o braço. A mão virtual alcança até cerca de 0,85 m à frente.
- No modo óculos, a câmera traseira precisa ficar descoberta (tampa da frente do óculos aberta), senão as mãos não são vistas.
- No modo óculos, os botões ficam escondidos: toque na tela (por fora) para mostrá-los. As informações (tempo, caixas, sinal) aparecem num painel 3D.

## Fora do escopo agora

- Modelo 3D da escola.
- Um minigame por sala.
- Multiplayer e controles externos.
