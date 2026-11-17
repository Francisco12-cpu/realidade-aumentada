# Caçador de Sinal — versão jogável para a feira de ciências (desenho)

Data: 2026-11-16 · Estado: aguardando aprovação do Francisco

## 1. Para que serve

Na feira de ciências vêm visitantes de outras escolas. O visitante coloca o
óculos VR (celular dentro de um óculos de papelão/plástico), joga **um jogo
curto** em que anda pela escola em 3D consertando a rede, tira o óculos e
depois reconhece a escola de verdade enquanto visita as outras apresentações.
O tema (rede, sinal, fios) liga o jogo ao curso técnico de informática.

O modelo 3D da escola **ainda não existe**. O jogo tem que ficar pronto e
divertido com um mapa provisório, e receber o modelo depois sem reescrever nada.

## 2. Objetivos

1. Visitante que nunca usou VR aprende em ~10 segundos e termina em ~3 minutos.
2. Sem atraso perceptível: a visão acompanha a cabeça de forma fluida
   (alvo: 60 quadros/s na visão; mínimo aceitável 45).
3. Funciona **com óculos** (tela dividida com correção de lente) e **sem
   óculos** (celular na mão, tela inteira), com os mesmos controles.
4. Tudo o que o jogador precisa ver (mira, tempo, seta, avisos, tutorial)
   aparece dentro do mundo 3D, nos dois modos.
5. Trocar o mapa provisório pelo modelo da escola = colocar um arquivo `.glb`
   e editar um arquivo de dados.
6. O operador (aluno no estande) reinicia para o próximo visitante com um toque.

## 3. O que NÃO vamos fazer

- Calibração por visitante (gestos, alcance, profundidade, mão esquerda/direita).
- Os 5 gestos antigos (pistolinha, palma, punho…). Fica só a **pinça**.
- Andar com passos reais, multijogador, placar online.
- Suporte a iPhone no modo óculos (o Safari não tem o modo VR do navegador).
  No iPhone funciona só o modo sem óculos.

## 4. O que faria o projeto fracassar mesmo "funcionando"

- Visitante precisar de explicação longa ou de calibração.
- Enjoo: visão que treme, atrasa ou se move sozinha (por isso só teleporte,
  nunca andar deslizando).
- Depender da internet da feira ou da luz do lugar para o jogo ser jogável.
- Jogador ficar perdido sem saber onde ir.

## 5. Restrições

- Celular Android com Chrome (o do Francisco). Página servida por HTTPS
  (GitHub Pages do repositório) — câmera e sensores exigem HTTPS.
- Sem etapa de compilação: HTML + CSS + módulos JavaScript, three.js 0.160.
- Quem escreve o código é um modelo menos capaz, revisado a cada etapa.
  Logo: arquivos pequenos, uma responsabilidade por arquivo, lógica difícil
  especificada no plano, e teste claro por etapa.
- O Francisco está sem o óculos no momento: tudo precisa ser testável com o
  celular na mão e no PC (mouse).

## 6. Caminhos considerados

| Caminho | Como é | Problema |
|---|---|---|
| A. Manter os 5 gestos e a calibração | Como hoje | Lento para ensinar, exige calibrar cada visitante, depende de luz |
| B. Só o olhar (sem mãos) | Mira com a cabeça, segura o olhar para agir | Perde a parte mais chamativa (as mãos) |
| **C. Olhar e clicar (escolhido)** | Mira com a cabeça; clique = pinça, toque na tela ou segurar o olhar | — |

Escolhido pelo Francisco: **C**. A pinça dá o efeito "uau", o toque serve para
testar sem óculos, e segurar o olhar garante que o jogo funciona mesmo que a
câmera falhe na feira.

## 7. Como vai funcionar

### 7.1 Controles: um ponteiro, três jeitos de clicar

- **Ponteiro** = raio que sai do centro da visão. Uma mira (anel) aparece
  onde o raio bate.
- **Clique** = qualquer um:
  1. **Pinça** (polegar encosta no indicador) com qualquer mão na frente da
     câmera traseira. A posição da mão não importa, só o gesto.
  2. **Toque** em qualquer lugar da tela (no modo óculos: o botão do óculos,
     que também é um toque).
  3. **Segurar o olhar** parado sobre algo clicável; a mira enche como um
     relógio e clica sozinha.
- O que é clicável:
  - **Chão** → teleporta para lá (até 5 m, sem atravessar parede).
  - **Caixa de sinal** (até 3 m) → abre o painel de fios.
  - **Ponta de fio** no painel → pega o fio (ele passa a seguir a mira).
  - **Encaixe** no painel → liga o fio que está pego; cor errada devolve o fio.
- A mão continua aparecendo como esqueleto 3D (uma mão só é rastreada).
  A ponta dos dedos brilha quando a pinça é reconhecida.

### 7.2 Imagem no óculos

Etapa 0 do plano é um **teste de 5 minutos no celular do Francisco** que
decide o caminho:

- **Se o modo VR do Chrome (WebXR) funcionar com a câmera ligada ao mesmo
  tempo:** usar WebXR. Ele já faz a correção de lente, lê o perfil do óculos
  pelo QR code e reduz o atraso da cabeça. É o modo da imagem de referência.
- **Se o WebXR não existir no aparelho, ou a câmera parar dentro dele:**
  fazer a tela dividida própria com correção de lente (cada olho é desenhado
  numa textura e esticado por uma malha curva), com ajustes de distância
  entre olhos e força da lente.

Sem óculos: tela inteira, visão guiada pelo giroscópio (código atual, mantido).
No PC: arrastar o mouse gira, clique do mouse = clique.

### 7.3 Informação dentro do mundo (substitui o HUD em HTML durante o jogo)

Presos à visão do jogador, sempre legíveis nos dois modos:
- mira no centro;
- faixa baixa com **tempo** e **contador** (ex.: `2:41  📡 2/5`);
- **seta 3D** apontando a caixa mais próxima + distância;
- **avisos curtos** (ex.: "Fio ligado!") que somem em 2 s;
- telas de tutorial e de fim de jogo como painéis 3D clicáveis.

Além disso, a caixa mais próxima ainda não consertada tem um **feixe de luz**
vertical para ser achada de longe.

O HTML fica só para a tela inicial (antes de entrar) e para o painel do
operador/depuração.

### 7.4 O jogo

1. **Tela inicial (HTML):** "A rede da escola caiu!" + dois botões grandes:
   *Jogar sem óculos* e *Jogar com óculos*. O toque pede as permissões.
2. **Tutorial dentro do mundo (~20 s):** três passos, cada um com um aviso 3D
   e só avança quando o jogador faz: (a) olhar para o chão e clicar para
   andar; (b) clicar na caixa de treino; (c) ligar um fio.
3. **Partida:** 180 s, 5 caixas, 3 fios cada. Seta + feixe guiam.
4. **Fim:** painel 3D com resultado (caixas, tempo) e "Jogar de novo".
   Sem ação por 20 s, volta sozinho ao tutorial para o próximo visitante.
5. **Som** gerado por código (sem arquivos): clique, teleporte, fio ligado,
   erro, caixa consertada, vitória, aviso dos últimos 30 s.

### 7.5 Velocidade

- Rastrear **uma** mão, em quadros alternados; o desenho nunca espera a mão.
- Sem calibração → menos código rodando por quadro.
- Qualidade automática: se a média de tempo por quadro subir, baixa a
  resolução de desenho em degraus; se sobrar folga, sobe de novo.
- Materiais simples, sem sombras em tempo real, sem antisserrilhado.
- HUD 3D: texturas redesenhadas só quando o texto muda.

### 7.6 Mapa e modelo da escola

- Um arquivo `js/mapa.js` descreve tudo: ponto inicial, limites, **blocos de
  colisão** (caixas), **posições das caixas de sinal** e, opcionalmente, o
  modelo (`modelo: { url, escala, posicao, rotacaoY }`).
- Sem modelo: os blocos de colisão são desenhados coloridos (mapa provisório:
  o mapa de blocos atual, com 5 caixas de partida e 1 de treino).
- Com modelo: o `.glb` é desenhado e os blocos de colisão ficam invisíveis.
- **Modo editor** (no painel de depuração): mostra os blocos como arame por
  cima do modelo e exibe a posição atual do jogador para copiar, o que
  permite alinhar colisão e caixas ao modelo sem adivinhar números.
- Limites para o modelo (para não travar no celular): arquivo `.glb`, até
  ~100 mil triângulos, até ~15 MB, texturas de no máximo 1024 px.

### 7.7 Internet da feira

three.js, o carregador de modelos, o MediaPipe e o modelo das mãos passam a
ficar **dentro do repositório** (pasta `vendor/`), em vez de vir de outros
sites. Última etapa (opcional): guardar tudo no celular para abrir sem
internet.

### 7.8 Organização do código

O `index.html` atual (2.469 linhas) é dividido em arquivos pequenos:
`index.html`, `css/style.css`, e em `js/` (nomes em inglês, como os que o
código atual já usa): `config`, `filters`, `map`, `scene`, `orientation`,
`hands`, `pointer`, `teleport`, `interaction`, `hud3d`, `audio`, `display`
(óculos/normal), `debug`, `main`, e as regras puras em `js/logic/`.

A lógica que dá para testar sem navegador (pinça com folga, relógio do
olhar, validação do teleporte, regras dos fios, estados do jogo) fica em
funções puras com testes automáticos (`node --test`).

## 8. Decisões tomadas por quem desenhou (Claude) — o Francisco pode mudar

- Partida de 180 s com 5 caixas de 3 fios.
- Segurar o olhar: 1,0 s para objetos, 1,5 s para o chão (evita teleporte sem querer).
- Teleporte máximo de 5 m, com escurecimento rápido da tela.
- Painel de fios a ~1,2 m do jogador (0,55 m, como hoje, cansa os olhos no óculos).
- Rastrear uma mão só; não distinguir esquerda/direita.
- Feixe de luz na caixa mais próxima.
- Nomes de arquivos e de código em inglês, comentários e textos de tela em
  português, como no código atual.
- Bibliotecas copiadas para `vendor/`.
- A calibração antiga e os botões de gesto são removidos (ficam no histórico do git).

## 9. Deixado para quem for construir

- Aparência exata do mapa provisório, cores, textos dos avisos, timbres dos sons.
- Valores finos de suavização e de folga da pinça (o plano dá os iniciais).

## 10. Em aberto

- Resultado do teste da etapa 0 (WebXR com câmera) — decide a seção 7.2.
- Formato e tamanho do modelo da escola quando existir.
