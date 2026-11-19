# Escola Zumbi: estado do projeto (v26, 19/11/2026)

Protótipo de realidade virtual para a feira de ciências. O jogador anda pela **escola de verdade** (Centro Educa Mais José Mariano Muniz) e elimina zumbis **sem tocar no celular**: as mãos aparecem no jogo pela câmera traseira.

- **Jogar:** https://francisco12-cpu.github.io/realidade-aumentada/
- **Código:** https://github.com/Francisco12-cpu/realidade-aumentada (branch `main`)
- **Pasta no PC:** `Desktop\escolar 3d\cacador-de-sinal`

---

## Como se joga

| Gesto | O que faz |
|---|---|
| 🎯 **olhar** | a **mira é o ponto no meio da visão** (fica amarela em cima de um zumbi) |
| 👉 **pistolinha da mão DIREITA** (indicador esticado, médio dobrado) | a mão fica **vermelha** e **atira sozinha** para onde você olha; a **barra embaixo da mira** enche em 0,8 s e atira de novo enquanto a pistolinha continuar |
| ✋ **palma bem aberta da mão ESQUERDA** (segurada 0,25 s) | a mão fica **azul** e você **anda para onde olha**; abaixar ou fechar a mão = para |
| 👊 **soco ou tapa rápido** (a mão anda 15 cm em 0,2 s, **ou some no borrão do movimento**, ou volta longe de onde sumiu) com um zumbi a até 1,25 m, na direção da mão | **golpe**: estrela de pancada, som, vibração e o zumbi é empurrado para trás. São **10 socos** para derrubar (3 no zumbi de treino). A mão parada não bate: depois de um golpe ela precisa parar antes do próximo |

> Desde a v21 a mira é a **cabeça**. A câmera de trás vê a mão por trás, e a direção do dedo saía errada. A cor da mão mostra o que ela está fazendo, e não o lado. A mira pelo dedo (v20) continua em `GUN.AIM: 'dedo'`. Desde a v22, uma **camada de esquerda/direita** junta o rótulo do MediaPipe (média de ~1 s), o lado da imagem e a continuidade. Só a direita atira e só a esquerda anda (`ROLES.STRICT_SIDES`; troca com "Direita anda" na calibração). A cor fraca mostra o lado, e a cor forte, o gesto.

> Desde a v16 o gatilho é **fechar a mão**. Na pistolinha antiga a mão aponta para frente, para longe da câmera: o indicador e o polegar ficavam escondidos e o tiro falhava. O modo antigo continua em `GUN.MODE: 'polegar'`.

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
- **Modo 🎮 Controle (v25):** na tela inicial, escolha **✋ Mãos** ou **🎮 Controle**. O controle é de Xbox, ligado pelo Bluetooth do celular. Continua no óculos de VR e não usa a câmera nem a calibração.

| Controle | O que faz |
|---|---|
| analógico esquerdo | anda (frente = para onde você olha; também de lado e para trás) |
| virar o rosto | olha e mira (desde a v26 o controle **não gira** a visão no óculos) |
| olhar | mira (ponto no meio da visão) |
| RT (ou LT) | atira; segurando, atira a cada recarga |
| X (ou B) | soco no zumbi da frente (10 para derrubar) |
| Y | recentra a visão |
| A / Start | começa, e joga de novo no fim |

  O controle vibra ao levar mordida, ao acertar e ao dar soco. No modo mãos, um controle ligado também funciona.
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
| v26 | #24 | Terror: som 3D dos zumbis (fone), música baixa, coração, zumbis que circulam e pegam por trás, jumpscare, tiro não atravessa parede, controle não gira a visão no óculos |
| v25 | #23 | Modo 🎮 Controle (Xbox): escolha Mãos ou Controle na tela inicial; analógico anda/gira, RT atira, X soco, Y recentra, A começa; vibração |
| v24 | #22 | Mundo em volta (céu com nuvens que acompanha o jogador, chão, ruas, calçadas, prédios, carros batidos, postes, árvores, fogo, fumaça), blocos além da neblina não são desenhados; pistola 3D na mão, contorno nas mãos, seta quando a mão sai da câmera, mão fantasma no tutorial, modo "só atirar", foveação no VR do Chrome, zumbis longe animam menos |
| v23 | #21 | Conserto: mãos não detectadas de novo. O vídeo da câmera fica atrás do jogo (o navegador não pausa mais), e se ele parar mesmo assim a imagem vem direto da câmera (ImageCapture). O painel 🐞 mostra de onde vem a imagem |
| v22 | #20 | Camada esquerda/direita (rótulo + lado + continuidade); só a direita atira e só a esquerda anda; palma tem que estar bem aberta e segurada para andar; soco conta mesmo quando a mão some no borrão |
| v21 | #19 | Mira com a cabeça (ponto no meio da visão), pistolinha de qualquer mão atira sozinha com a barra embaixo da mira, palma aberta anda para onde olha, cor da mão = o que ela faz |
| v20 | #18 | Mão não troca mais de cor nem aparece dobrada; azul só anda apontando (ou palma); tiro vai para onde o dedo aponta; socos medidos pelo movimento da mão (não precisa alcançar o zumbi) |
| v19 | #17 | Socos e tapas: encostar a mão no zumbi com velocidade = golpe (10 para derrubar), efeito de pancada, empurrão; mão parada encostada não dá dano |
| v18 | #16 | Mão azul anda para onde aponta, mão vermelha atira sozinha com a pistolinha, barra de recarga em cima da mão (0,8 s) |
| v17 | #15 | Conserto: na v16 a câmera ligava sozinha ao abrir, e o Chrome do Android pausava o vídeo escondido (a mão nunca aparecia). Agora só o detector carrega ao abrir; a câmera liga no toque, e um vigia dá play de novo se o vídeo parar |
| v16 | #14 | Atirar fechando a mão (✊); mão virtual no mesmo ângulo e distância da mão de verdade (`HANDS.MAP_MODE: 'real'`), menos tremida e some menos; óculos vai direto para o modo próprio quando o VR do Chrome não existe (tela cheia volta a funcionar); câmera liga sozinha ao abrir se já foi liberada |
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

## Terror (v26)

- **Som 3D:** use fone de ouvido. Cada zumbi geme e arrasta os pés **do lugar onde está** (HRTF), então dá para ouvir se ele vem pela esquerda, pela direita ou **por trás**. O coração bate quando um zumbi está a menos de 5 m.
- **Música:** fundo de terror baixinho (zumbido grave, vento, sininhos). Liga e desliga na opção 🎵 da tela inicial.
- **Zumbis que vêm por trás:** 35% dos zumbis, quando você está olhando para eles de perto, circulam em volta até ficar atrás e só então mordem. Todo zumbi fora da sua visão anda 30% mais rápido.
- **Susto (jumpscare):** o primeiro vem aos 40 s da partida e os outros a cada ~65 s, no máximo 3. Um zumbi pálido nasce atrás de você, a 2,5–4 m, corre mais que você e grita alto quando chega perto ou quando você vira e vê. A tela pisca, a câmera treme e o controle vibra.
- **Tiro não atravessa parede:** a mira confere a grade da escola na linha da mira e na linha até o zumbi. Na hora do tiro, confere também os triângulos de verdade da escola. Folhas e vidros não seguram o tiro.

## O mundo em volta (v24, `js/cenario.js`)

- É todo feito por código, sem arquivos: céu com nuvens (esfera que acompanha o jogador; antes o céu ficava parado no começo do mapa e sumia no meio da escola), chão de terra e grama, ruas com faixa e calçadas em volta da escola, duas fileiras de prédios com janelas (acesas, escuras e quebradas), carros batidos, postes, árvores, barris pegando fogo e colunas de fumaça ao longe.
- São 12 peças, uns 10 mil triângulos e 36 sprites. Fica fora da escola, então a colisão não muda.
- Os prédios usam uma neblina própria, mais distante (`CENARIO.HAZE_NEAR/FAR`), para aparecer a silhueta da cidade. Os blocos da escola além da neblina normal não são desenhados (`MAP.CHUNK_CULL`).
- As cores do céu e da neblina ficam em `CENARIO.SKY_*` e `MAP.FOG_COLOR`.

## Onde ajustar (tudo em `js/config.js`)

| O que | Onde |
|---|---|
| Quantidade de zumbis, ondas, velocidade, visão, mordida | `ZOMBIES` (`COUNT`, `START_COUNT`, `FIRST_WAVE_S`, `WAVE_EVERY_S`, `WAVE_SIZE`, `SPEED_MIN/MAX`, `SIGHT`, `ATTACK_S`, `HP`) |
| Socos e tapas | `MELEE` (`PUNCHES`, `MIN_DIST`, `REARM_DIST`, `WINDOW_MS`, `RANGE`, `ANGLE_DEG`, `COOLDOWN_MS`, `KNOCK_SPEED`, `STAGGER_S`) |
| Papéis e cores das mãos | `ROLES` (`ON`, `WALK_COLOR`, `GUN_COLOR`, `WALK_GRACE_MS`, `FINGER_BLEND`, `CENTER_SLACK`) · mira: `GUN.FINGER_BLEND`, `GUN.AIM_SMOOTH` · mão dobrada: `HANDS.DUP_DIST`, `HANDS.GHOST_DIST` |
| Pistolinha automática | `GUN.MODE: 'auto'`, `PISTOL_INDEX`, `PISTOL_MIDDLE`, `PISTOL_HOLD_MS`, `RELOAD_MS` (recarga) |
| Gatilho da arma (mão fechada) | `GUN.FIRE_REACH` (atira), `GUN.ARM_REACH` (engatilha), `GUN.OPEN_REACH` (mão aberta = anda). Modo antigo: `GUN.MODE: 'polegar'` com `THUMB_DOWN_K`/`THUMB_UP_K` |
| Posição da mão no óculos | `HANDS.MAP_MODE`, `HANDS.CAM_FOV_LONG` (ângulo da câmera, 64°), `REAL_NEAR`/`REAL_FAR` |
| Folga no formato da pistolinha | `GUN.SHAPE_SLACK` |
| Tempo cinza depois do tiro | `GUN.RELOAD_MS` |
| Vidas do jogador / andar | `PLAYER.HP`, `PLAYER.PALM_FINGERS`, `PLAYER.WALK_GRACE_MS`, `PLAYER.NO_WALK_AFTER_GUN_MS` |
| Sensibilidade da detecção de mãos | `HANDS.MIN_DETECTION_CONF` etc. (0,4) |
| Resolução / FPS | `QUALITY` (`PIXEL_RATIO` 0,85, ajuste automático pelo FPS) |
| Onde o jogador começa | `MAP.SPAWN` e `MAP.SPAWN_YAW` |
| Começar no óculos (contagem, mão aberta) | `LOBBY` (`COUNTDOWN_S`, `HOLD_MS`, `RECENTER_HOLD_MS`) |
| Distância em que os detalhes somem | `MAP.DETAIL_DIST` |
| Mundo em volta | `CENARIO` (ruas, prédios, carros, fogo, fumaça, céu) · `MAP.VIEW_FAR`, `MAP.FOG_COLOR`, `MAP.CHUNK_CULL` |
| Pistola 3D, seta da mão, foveação, zumbi longe | `GUN.SHOW_MODEL`, `HANDS.EDGE_MARGIN`, `QUALITY.XR_FOVEATION`, `ZOMBIES.ANIM_FAR` |
| Terror (por trás, susto, som 3D) | `ZOMBIES.FLANK_*`, `BEHIND_BOOST`, `SCARE_*`, `SOUND_DIST` · `AUDIO.MUSIC_VOL`, `ZOMBIE_VOL`, `REF_DIST`, `ROLLOFF`, `HEART_DIST` · `GUN.MESH_CHECK` |
| Controle (folga, giro) | `PAD` (`DEADZONE`, `TURN_SPEED`, `SNAP_DEG`, `LOOK_PITCH`) |
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
js/cenario.js       mundo em volta da escola (céu, ruas, prédios, carros, fogo, fumaça)
js/demo.js          mão fantasma do tutorial
js/gamepad.js       controle de videogame (Xbox)
js/melee.js         socos e tapas: mão encostando no zumbi com velocidade
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
- [ ] Do plano de melhoria, ainda faltam: texturas KTX2 de 2048 px perto do jogador, sombra "pintada" (bake de luz) no Blender, pré-cálculo de quais salas se enxergam, calibração mais curta.
- [ ] Ideias: sons de passos dos zumbis, tipos diferentes de zumbi (rápido, forte), placar com zumbis por onda.
