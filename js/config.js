// =====================================================================
// Caçador de Sinal — configuração central.
// Todos os valores "de ajuste" do protótipo ficam aqui, para facilitar
// testes no celular sem caçar números espalhados pelo código.
// =====================================================================

export const CONFIG = {
  // ---- Jogador / câmera ----
  EYE_HEIGHT: 1.6,          // altura dos olhos (m)
  CAMERA_FOV: 70,           // FOV vertical da câmera 3D (graus)

  // ---- Partida ----
  GAME_TIME_S: 360,         // duração da partida (6 min)

  // ---- Locomoção ----
  VERSION: 'v6',
  // 'palma' = palma aberta anda para onde olha (mais simples) · 'correr' = balançar as mãos / correr parado · 'teleporte'
  LOCOMOTION: 'palma',

  // ---- Corrida ----
  RUN: {
    WALK_SPEED: 2.0,        // m/s no modo 'palma' (andar rápido)
    MAX_SPEED: 3.2,         // m/s no modo 'correr' com balanço máximo
    ACCEL: 6,               // m/s² para ganhar velocidade
    DECEL: 8,               // m/s² para parar
    ENERGY_SMOOTH: 6,       // suavização da intensidade (1/s)
    BOB: 0.045,             // balanço do passo (m)
    USE_HANDS: true,        // balançar as mãos na frente da câmera
    USE_JOG: true,          // correr parado (sensor de movimento do celular)
    SWING_WINDOW_MS: 900,   // janela para medir o balanço
    SWING_FLIP_SPEED: 0.25, // velocidade mínima (m/s) para contar ida/volta
    SWING_MIN_FLIPS: 2,     // idas e voltas necessárias na janela (evita andar ao esticar a mão)
    SWING_START: 0.3,       // velocidade média da mão (m/s) para começar a andar
    SWING_FULL: 1.1,        // velocidade média da mão para correr no máximo
    JOG_WINDOW_MS: 900,
    JOG_FLIP_ACC: 1.2,      // m/s² mínimo de cada "quique"
    JOG_MIN_FLIPS: 3,
    JOG_START: 1.2,         // aceleração (RMS, m/s²) para começar a andar
    JOG_FULL: 4.0,          // para correr no máximo
  },

  // ---- Teleporte ----
  TELEPORT: {
    MAX_DIST: 4.0,          // distância máxima por salto (m, no plano do chão)
    MIN_DIST: 0.6,          // saltos menores que isso são ignorados
    COOLDOWN_S: 0.9,        // espera mínima entre saltos
    CONFIRM_WINDOW_S: 0.9,  // tempo para abrir a palma depois da pistolinha
    PLAYER_RADIUS: 0.3,     // não pousar a menos disso de um bloco
    FADE_MS: 160,
    MODE: 'dash',           // 'dash' = desliza rápido até o alvo · 'fade' = pisca a tela
    DASH_MS_BASE: 120,      // duração do deslize = base + por metro
    DASH_MS_PER_M: 45,      //   (4 m ≈ 0,3 s)
    DASH_BOB: 0.035,        // balanço vertical do "passo" (m)
    AIM_MODE: 'olhar',      // 'olhar' = alvo na direção olho→mão (estável) · 'dedo' = para onde o dedo aponta
    AIM_SMOOTH: 12,         // suavização da direção da mira (maior = responde mais rápido, treme mais)
    TARGET_SMOOTH: 10,      // suavização do marcador no chão
    AIM_GRACE_MS: 350,      // a mira continua esse tempo se a pistolinha "piscar"
    AIM_WRIST_BLEND: 0.4,   // (modo 'dedo') 0 = só o dedo indicador; 1 = só pulso→ponta
  },

  // ---- Mãos (MediaPipe) ----
  HANDS: {
    NUM_HANDS: 2,
    VIDEO_W: 640,
    VIDEO_H: 480,
    USE_WORKER: true,           // detecção numa thread separada (muito mais FPS)
    WORKER_MAX_SIDE: 480,       // reduz a imagem enviada ao worker (px do lado maior)
    MAX_DETECT_HZ: 30,          // detecções por segundo, no máximo
    DETECT_EVERY_N_FRAMES: 1,   // (modo normal) 2 = detecta em quadros alternados
    MIN_DETECTION_CONF: 0.5,
    MIN_PRESENCE_CONF: 0.5,
    MIN_TRACKING_CONF: 0.5,
    // MediaPipe supõe imagem espelhada (selfie). Na câmera traseira o rótulo
    // vem invertido, então por padrão invertemos. A calibração confirma.
    FLIP_HANDEDNESS: true,
    LOST_GRACE_MS: 220,         // segura a mão na tela por esse tempo se sumir
    TRACK_MEMORY_MS: 600,       // memória de posição p/ não trocar esquerda/direita
    LABEL_WEIGHT: 1.0,          // peso do rótulo do MediaPipe na atribuição
    POS_WEIGHT: 4.0,            // peso da continuidade de posição
    // Profundidade virtual (distância da mão à câmera no mundo 3D, em m)
    VIRTUAL_NEAR: 0.28,
    VIRTUAL_FAR: 0.85,
    // Estimativa bruta padrão (sem calibrar) para mão perto/longe
    RAW_NEAR: 0.25,
    RAW_FAR: 0.70,
    HAND_SCALE: 1.0,            // escala da mão virtual
    FOLLOW_RATE: 22,            // velocidade com que a mão desliza até a última detecção (1/s)
    REACH_MARGIN: 0.92,         // alcance calibrado ocupa 92% da tela
  },

  // ---- Filtros One Euro (suavização) ----
  // MIN_CUTOFF menor = mais suave parado (mais atraso); BETA maior = menos atraso rápido
  FILTER: {          // forma dos dedos (relativa ao centro da mão, em metros)
    MIN_CUTOFF: 2.0,
    BETA: 1.0,
    D_CUTOFF: 1.0,
  },
  FILTER_ANCHOR: {   // posição da mão na tela (-1..1)
    MIN_CUTOFF: 1.0,
    BETA: 1.5,
    D_CUTOFF: 1.0,
  },
  FILTER_DEPTH: {    // profundidade estimada (a medida mais tremida)
    MIN_CUTOFF: 0.5,
    BETA: 0.4,
    D_CUTOFF: 1.0,
  },

  // ---- Gestos ----
  GESTURE: {
    STABLE_FRAMES: 3,       // quadros seguidos para aceitar um gesto novo
    // Limiares padrão (a calibração substitui)
    DEFAULT_THRESHOLDS: {
      ext: [0.72, 0.72, 0.72, 0.72], // retidão p/ considerar dedo esticado (indicador..mínimo)
      thumbOut: 0.62,               // polegar afastado do indicador
      pinch: 0.32,                  // distância polegar-indicador (relativa à palma)
      fistIndex: 0.55,              // indicador abaixo disso = dobrado de punho
    },
  },

  // ---- Interação ----
  INTERACTION: {
    TOUCH_DIST: 0.30,       // ponta do indicador até a superfície da caixa (m)
    FALLBACK_TOUCH_DIST: 3.0, // botão "Tocar": abre caixa até essa distância
    WIRES_PER_BOX: 3,
    PANEL_DIST: 0.55,       // painel aparece a essa distância da câmera
    PANEL_DROP: 0.15,       // inclina o painel um pouco abaixo do olhar (rad)
    GRAB_SCREEN_PX: 75,     // raio (px na tela) para pegar um fio
    SNAP_SCREEN_PX: 80,     // raio (px na tela) para encaixar um fio
    PANEL_CLOSE_DIST: 2.5,  // se afastar mais que isso fecha o painel
  },

  // ---- Detector ----
  DETECTOR: {
    NEAR: 1.5,   // verde quando mais perto que isso
    FAR: 15,     // vermelho a partir disso
  },

  // ---- Qualidade / FPS ----
  QUALITY: {
    PIXEL_RATIO: 1.0,       // resolução máxima (1 = um pixel por pixel CSS; celular fica bem mais leve)
    MIN_PIXEL_RATIO: 0.55,  // nunca abaixo disso
    AUTO: true,             // baixa a resolução se o FPS cair, sobe se sobrar
    LOW_FPS: 40,
    HIGH_FPS: 56,
  },

  STORAGE_KEY: 'cacador-sinal-calib-v1',
};

export const WIRE_COLORS = [0xff3b3b, 0x2ecc40, 0x2f7bff, 0xffd400];
export const WIRE_NAMES = ['vermelho', 'verde', 'azul', 'amarelo'];
