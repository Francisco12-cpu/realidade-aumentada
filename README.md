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

**Atalho: arquivo único.** O arquivo `dist/index.html` tem o jogo inteiro (CSS e JS embutidos). Para publicar sem mexer em pastas, envie só ele pelo site do GitHub como `index.html` na raiz da `main` (**Add file → Upload files**). Para gerar de novo depois de mudar o código: `python3 tools/build-single.py`.

> Câmera e sensores só funcionam em **HTTPS**, e o GitHub Pages já usa HTTPS.
> No PC dá para testar com `python3 -m http.server` e abrir `http://localhost:8000`, porque o localhost também é aceito.

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
4. **Partida** de 6 minutos com 6 caixas, incluindo uma no **teto** (debaixo da cobertura laranja), duas em paredes e uma atrás do ponto de partida. A partida termina em vitória (consertou todas) ou derrota (o tempo acabou).

## Gestos

| Gesto | Mão | Efeito |
|---|---|---|
| Mão relaxada | qualquer | nada |
| **Pistolinha** (indicador + polegar esticados) | locomoção | mira o teleporte (parábola + marcador) |
| **Palma aberta** logo depois da pistolinha | locomoção | teleporta |
| **Ponta do indicador** encostando na caixa | interação | abre a caixa |
| **Pinça** (polegar + indicador) ou **punho** sobre a bolinha | qualquer | pega o fio, arrasta e solta no anel da mesma cor |

O **detector de sinal** é uma seta com uma barra, presa às costas da mão de interação. A cor vai de vermelho (longe) a verde (perto). A pílula no topo da tela também mostra a direção e a distância da caixa mais próxima.

Por padrão a **esquerda** anda e a **direita** interage. Dá para trocar na calibração.

## Botões e teclado (para depurar)

| Botão | Tecla (PC) | Função |
|---|---|---|
| ⟲ | R | recentrar |
| 🎯 Mirar / 🚀 Ir | segurar Q / soltar Q | mirar com o olhar / teleportar |
| 👆 Tocar | E | abre a caixa mais próxima (até 3 m) |
| 🤏 Pinça / ✊ Pegar (segurar) | F / G | pega o fio que estiver sob a mira do centro |
| arrastar o dedo/mouse no painel | — | arrasta os fios |
| arrastar na tela (só sem sensor) | — | gira a visão |
| — | WASD | anda devagar (só depuração) |
| 👓 | — | tela dividida (estéreo) para o óculos |
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
- `TELEPORT.MODE`: `'dash'` (desliza rápido até o alvo) ou `'fade'` (pisca a tela); `TELEPORT.AIM_SMOOTH`: suavização da mira;
- `GESTURE.STABLE_FRAMES`: quantos quadros seguidos um gesto precisa para valer;
- `HANDS.DETECT_EVERY_N_FRAMES = 2`: detecta as mãos em quadros alternados, o que dá mais FPS se o celular sofrer.

## Estrutura

```
index.html          página + import map (Three.js / MediaPipe via CDN)
css/style.css
js/config.js        todos os números ajustáveis
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
- O MediaPipe roda na thread principal. Num Android intermediário, cada detecção pode custar de 20 a 40 ms. Se o FPS cair muito, use `DETECT_EVERY_N_FRAMES = 2`.
- A posição da cabeça não é rastreada, só a rotação. Para alcançar caixas no chão, olhe para baixo e estique o braço. A mão virtual alcança até cerca de 0,85 m à frente.
- O modo 👓 estéreo é básico: não tem correção de lente e a interface fica escondida.

## Fora do escopo agora

- Modelo 3D da escola.
- Um minigame por sala.
- Multiplayer e controles externos.
