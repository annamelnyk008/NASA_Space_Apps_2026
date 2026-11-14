// Константы сцены, камеры, сеток и окон детализации.

// ---- Настройки сцены ---------------------------------------------------
export var TILT_DEG = 14;      // на сколько камера приподнята над плоскостью орбит (взгляд вниз)
export var FOV = 36;
export var FIT_RADIUS = 78;    // какой радиус системы должен поместиться по ширине экрана
export var SUN_R = 6.5;

export var MIN_DIST = 1.06, MAX_DIST = 9;
export var EXAG = 1.0;                        // реальный масштаб рельефа (без преувеличения)
export var H_LO = -8.2, H_HI = 21.2;          // диапазон высот MOLA, км
export var D2R = Math.PI / 180;

export var GEO_SIZES = [[160, 80], [480, 240], [1024, 512]];
export var MAX_GEO = 1;

// ---- Окно детализации: 1024×1024 px глубокого уровня z вокруг точки обзора ----
export var DET_WIN = 1024, DET_PAD = 64, DET_TOT = DET_WIN + 2 * DET_PAD;   // = DET_N, DET_P, DET_T в шейдере

export var PANO_MIN_FOV = 38;      // при сильном приближении — живая трассировка
export var SURF_FOG_MIN_FOV = 18;     // угол зума, на котором туман достигает максимума (= нижняя граница clampFov)
export var SURF_FOG_ZOOM = 1.4;       // прибавка к густоте дымки при максимальном приближении (1 + 1.4 = ×2.4)
export var SURF_FOG_RATE = 5;         // скорость сглаживания тумана, 1/с (больше — быстрее)

export var FLAT_D0 = 1.05, FLAT_K = 4.0, FLAT_S_MIN = 0.04;
