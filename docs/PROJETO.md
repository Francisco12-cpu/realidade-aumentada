# Escola Zumbi: estado do projeto (v15, 18/11/2026)

Protótipo de realidade virtual para a feira de ciências. O jogador anda pela **escola de verdade** (Centro Educa Mais José Mariano Muniz) e elimina zumbis **sem tocar no celular**: as mãos aparecem no jogo pela câmera traseira.

- **Jogar:** https://francisco12-cpu.github.io/realidade-aumentada/
- **Código:** https://github.com/Francisco12-cpu/realidade-aumentada (branch `main`)
- **Pasta no PC:** `Desktop\escolar 3d\cacador-de-sinal`

---

## Como se joga

| Gesto | O que faz |
|---|---|
| ✋ **mão aberta** (4 dedos esticados) | anda para onde você está olhando; abaixe a mão para parar |
| 👉 **pistolinha** (indicador esticado, médio dobrado) | aparece o laser; mão **vermelha** = pronta |
| 👍⬇ **abaixar o polegar** | **atira**; a mão fica **cinza** por 0,45 s e volta a ficar vermelha sozinha |

- **Jogar no óculos com um toque (v14):** depois de calibrar uma vez, toque em **▶ Jogar no óculos** e ponha o celular no óculos. Na lente aparece uma contagem de 10 s; o jogo recentra sozinho e começa. Com a **✋ mão aberta parada 1,5 s**, começa na hora.
  - No fim da partida, a **mão aberta** joga de novo, sem tirar o óculos. No modo feira, o jogo volta sozinho para o "próximo jogador", que também começa com a mão aberta.
  - Durante o jogo, **as duas mãos abertas paradas** por 1,5 s recentram a visão.
  - O link com **`?auto`** abre a tela inicial só com o botão grande.
  - **📋 Perfil:** a calibração, os ajustes do óculos e as opções viram um código para copiar e colar em outro celular.
  - A opção **🎓 Tutorial antes da partida** pode ser desligada para ir direto para a partida.
- **Começo:** você começa **na porta** (portão do muro oeste), olhando para dentro da escola.
- **Tutorial:** um zumbi de treino fica parado na frente. A dica no canto da tela mostra os passos: andar, mirar e atirar. Quando os três estão feitos, a partida começa sozinha em 3 s.
- **Partida:**
  - São **24 zumbis**, 14 no modo feira.
  - No começo, 6 já estão espalhados longe da porta (a mais de 25 m).
  - Depois chegam em **ondas** de 4 a cada 15 s, a primeira depois de 20 s. Eles nascem escondidos a 15–35 m e vêm atrás de você.
  - Os zumbis enxergam até 13 m, ouvem até 5 m e escutam tiros até 20 m. Eles perseguem pelo caminho a pé: contornam paredes e passam pelas portas.
  - Você tem **5 vidas**; cada mordida tira uma.
  - **Tiro na cabeça** mata na hora; no corpo são 2 tiros. Tem uma ajuda de mira de 4°.
  - Tempo: 5 min (3 min no modo feira). Pontos: 100 por zumbi + 2 por segundo que sobrou, se você eliminar todos.
- **Sem câmera (PC):**
  - **W** anda.
  - **Espaço**, o botão **🔫 Atirar** ou um toque rápido na tela atiram no centro.

---

## Versões publicadas

| Versão | PR | O que mudou |
|---|---|---|
| v8 | #7 | Lista de melhorias 1–4, 6, 7, 12–16 |
| v9 | #8 | Placar e ranking do dia, caixas sorteadas, fios crescentes, aviso de mão |
| v10 | #9 | Mapa = escola de verdade (modelo 3D original, colisão automática) |
| v11 | #10 | **Apocalipse zumbi**: arma de mão, zumbis, andar com a palma, dica no canto, escola leve (10 MB) |
| v12 | #11 | Mais FPS (103 mil triângulos, 7 MB, materiais simples), mãos mais fáceis, mão cinza por menos tempo, zumbis à vista |
| v13 | #12 | 24 zumbis em ondas (demoram mais para aparecer); não anda mais sem querer ao mirar |
| v14+v15 | #14 | Jogar no óculos com um toque (contagem, mão aberta para começar ou jogar de novo, recentrar com as duas mãos, perfil copiar/colar, `?auto`). Mais FPS: escola em blocos de 24 m, detalhes longe somem, imagem das mãos menor se o FPS cair |

---

## O modelo da escola

- **No jogo:** `models/escola.glb` (7,6 MB, 103 mil triângulos, 282 peças em blocos de 24 m, texturas WEBP de até 1024 px).
  - Peças `s_<bloco>_<material>` são estrutura (paredes, chão, telhado); `d_<bloco>_<material>` são detalhes (carros, pessoas, plantas, móveis, < 6 m) que somem além de `MAP.DETAIL_DIST` (28 m).
  - Com os blocos, o celular só desenha o que está na frente: em média 21 mil triângulos por olhada (antes eram 58 mil). A colisão ficou idêntica à da v12 (comparada célula por célula).
- **Original:** está no `audir.rar` (fora do GitHub) e também no histórico do git, no commit `ead9eee` (17 MB, 205 mil triângulos).
- **Como a versão leve foi feita (Blender 5.3, sem janela):**
  - objetos **pequenos** (< 6 m) e com muito detalhe (> 400 triângulos) ficaram com 30% dos triângulos: carros, pessoas e plantas;
  - paredes, pilares, chão e telhado ficaram **iguais**, porque a colisão do jogo é calculada deles;
  - (v15) cada objeto vai para o bloco de 24 m do seu centro; objetos maiores que o bloco (chão, telhado) são repartidos face a face, sem cortar nada. Em cada bloco, as peças são juntadas por material, e as texturas foram reduzidas.
- **No código do jogo:** os materiais viram Lambert (mais barato) e as folhas usam recorte em vez de transparência.
- **Cuidados ao mexer no modelo:**
  - Os nomes de material não servem para escolher peças: o material "Sumele_Shoe" (sapato dos bonecos) também é usado no chão da escola.
  - Juntar faces planas ("Planar") estraga a colisão. Pilares e paredes sumiram da grade quando isso foi testado.

---

## Onde ajustar (tudo em `js/config.js`)

| O que | Onde |
|---|---|
| Quantidade de zumbis, ondas, velocidade, visão, mordida | `ZOMBIES` (`COUNT`, `START_COUNT`, `FIRST_WAVE_S`, `WAVE_EVERY_S`, `WAVE_SIZE`, `SPEED_MIN/MAX`, `SIGHT`, `ATTACK_S`, `HP`) |
| Gatilho da arma (sensibilidade do polegar) | `GUN.THUMB_DOWN_K` (atira) e `GUN.THUMB_UP_K` (engatilha) |
| Folga no formato da pistolinha | `GUN.SHAPE_SLACK` |
| Tempo cinza depois do tiro | `GUN.RELOAD_MS` |
| Vidas do jogador / andar | `PLAYER.HP`, `PLAYER.PALM_FINGERS`, `PLAYER.WALK_GRACE_MS`, `PLAYER.NO_WALK_AFTER_GUN_MS` |
| Sensibilidade da detecção de mãos | `HANDS.MIN_DETECTION_CONF` etc. (0,4) |
| Resolução / FPS | `QUALITY` (`PIXEL_RATIO` 0,85, ajuste automático pelo FPS) |
| Onde o jogador começa | `MAP.SPAWN` e `MAP.SPAWN_YAW` |
| Começar no óculos (contagem, mão aberta) | `LOBBY` (`COUNTDOWN_S`, `HOLD_MS`, `RECENTER_HOLD_MS`) |
| Distância em que os detalhes somem | `MAP.DETAIL_DIST` |
| Tempo da partida | `GAME_TIME_S` (5 min) e `FEIRA.GAME_TIME_S` (3 min) |

Depois de mudar o código, **mude também `VERSION`** no `config.js`: é o número que aparece na tela inicial e mostra que o celular pegou a versão nova.

---

## Arquivos principais

```
index.html          página do jogo
js/config.js        todos os números de ajuste
js/main.js          loop do jogo, estados (tutorial, partida, fim), HUD, tiro, mordida
js/zombies.js       zumbis: boneco, ondas, perseguição pelo caminho, ataque, tiro
js/gun.js           arma de mão: pistolinha, gatilho do polegar, recarga, laser
js/lobby.js         saguão na lente: contagem, mão aberta para começar e jogar de novo
js/coach.js         dica dos gestos no canto da tela (e painel 3D no óculos)
js/mapa.js          carrega a escola e monta a grade de colisão (chão/paredes)
js/scene.js         mapa de blocos (reserva) e troca para a escola
js/hands.js         rastreamento das mãos (MediaPipe) e desenho das mãos
js/gestures.js      reconhecimento de gestos
js/locomotion.js    andar
js/calibration.js   telas: início, calibração, ranking, ajuda
js/interaction.js   (jogo antigo das caixas e fios: desligado)
models/escola.glb   escola 3D (versão leve)
sw.js               guarda o jogo para abrir sem internet
dist/index.html     jogo inteiro num arquivo só (gerado sozinho pelo GitHub)
```

---

## Como publicar uma mudança

1. Criar uma branch, fazer a mudança e subir a `VERSION`.
2. Rodar `python tools/build-single.py`, que gera o `dist/index.html`. O GitHub também gera sozinho.
3. Abrir um PR para a `main`. Depois do merge, o site atualiza em 1–2 minutos.

---

## Pendências e ideias

- [ ] **Testar a v13 no celular:**
  - o tempo até os zumbis aparecerem;
  - se 24 zumbis está na medida;
  - se o jogo ainda anda sozinho ao mirar;
  - o FPS.
- [ ] Ajustar o gatilho do polegar se o tiro sair sem querer ou falhar (`GUN.THUMB_DOWN_K`).
- [ ] Zumbis que estão a mais de 45 m só vagam: não atravessam a escola inteira atrás do jogador.
- [ ] Os testes automáticos no navegador sem janela travam neste PC (Chrome/Edge). Os testes foram feitos no Node, com scripts que ficaram só na pasta temporária, e no celular.
- [ ] Branches antigas no GitHub (`escola-3d`, `feira-vr`) podem ser apagadas quando você quiser.
- [ ] Ideias: sons de passos dos zumbis, tipos diferentes de zumbi (rápido, forte), placar com zumbis por onda.
