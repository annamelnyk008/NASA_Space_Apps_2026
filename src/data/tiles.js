// Источники тайлов Mars Trek, построение URL и загрузка картинок тайлов.

// ---- Уровни детализации: текстуры и сетка --------------------------------
// ============================ ТАЙЛОВАЯ СИСТЕМА ТЕКСТУР ============================
// Файлов с текстурами в проекте нет: всё берётся из тайловой пирамиды по URL-шаблону.
// Если тайл не найден — на его месте заглушка (однотонный цвет / плоская высота 0 км), ошибок нет.
//
// Схема тайлов — как в WMTS (GoogleCRS84Quad / equirectangular, lon −180…180, lat 90…−90):
//   zoom 0  : 2 тайла по горизонтали × 1 по вертикали   (весь Марс = 2 тайла)
//   zoom z  : 2^(z+1) колонок × 2^z рядов;  row 0 — северный ряд, col 0 — западный (−180°)
//   каждый тайл — квадрат tileSize × tileSize px
//
// ЧТО ПОДСТАВИТЬ: два шаблона URL. Допустимые заменители:
//   {z} или {TileMatrix}   — номер уровня        {row} или {TileRow} — ряд      {col} или {TileCol} — колонка
//   {Style} и {TileMatrixSet} подставляются из полей style / matrixSet (если нужен WMTS Mars Trek).
// Примеры:
//   свои файлы:  'tiles/color/{z}/{row}/{col}.jpg'
//   Mars Trek :  TREK + '/<ИмяСлоя>/1.0.0/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.png'
//     (для Trek: style='default', matrixSet='default028mm', сверьте с WMTSCapabilities.xml слоя;
//      сервер должен отдавать заголовок Access-Control-Allow-Origin, иначе браузер не даст
//      использовать картинки как текстуры; а внутри Claude-артефакта внешние картинки блокируются —
//      размещайте html на своём хостинге).
// Mars Trek не отдаёт заголовок CORS, поэтому браузер блокирует его тайлы при прямой загрузке.
// На localhost запросы идут через прокси '/trek' (см. vite.config.js), на другом хосте — напрямую на NASA: там нужны CORS-заголовки NASA либо свой прокси на '/trek'.
var TREK = (location.hostname === 'localhost' || location.hostname === '127.0.0.1') ? '/trek' : 'https://trek.nasa.gov/tiles/Mars/EQ';
export var TILES = {
  // [ТЕКСТУРА: ЦВЕТ] RGB-тайлы (JPG/PNG), например мозаика Viking MDIM 2.1
  // Mars Trek, мозаика Viking MDIM 2.1 (цветная, 232 м/px). Zoom 0 = 2 тайла: .../default028mm/0/0/0.jpg и .../0/0/1.jpg
  color:  { url: TREK + '/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.jpg',
            style: 'default', matrixSet: 'default028mm', zMax: 8 },
  // [ТЕКСТУРА: ВЫСОТЫ] Локальная пирамида тайлов высот, собранная из Mars_MGS_MOLA_ClrShade_merge_global_463m (папка tiles/height).
  //   тайлы 1024×1024 px, 16 бит в PNG: R = старший байт, G = младший;  км = (R*256+G)/65535*31 − 9
  //   zoom 0 = 2×1 тайла (2048×1024 px), zoom 1 = 4×2, 2 = 8×4, 3 = 16×8 (16384×8192 px ≈ 1.3 км/px). Грузятся только видимые тайлы.
  //   Чтобы вернуться к цветной раскраске Mars Trek, поставьте url из закомментированной строки ниже и decode: 'clrshade', tileSize: 256, zMax: 7, smooth: 2.0.
  //   url: TREK + '/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.jpg'
  height: { url: 'tiles/height/{z}/{row}/{col}.png', style: 'default', matrixSet: 'default028mm', decode: 'dem16', tileSize: 1024, zMax: 3, smooth: 0.7 },
  // Цвет для Layout → Elevation (раскраска высот MOLA ClrShade, Mars Trek)
  elevColor: { url: TREK + '/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.jpg', style: 'default', matrixSet: 'default028mm', zMax: 7 },
  tileSize: 256,    // px одного тайла цвета (Mars Trek default028mm = 256)
  zMax: 8,          // самый глубокий уровень среди слоёв; у каждого слоя свой zMax (проверьте в WMTSCapabilities.xml)
  zSurface: 8,      // уровень в режиме «человечек» — максимум из доступного (слой с меньшим zMax растягивается)
  zPlanetMax: 7,    // максимум для вида планеты с орбиты
  // Слои для Layout (Mars Trek, PNG-тайлы 256 px). zMax — самый глубокий уровень на сервере (сверьте в WMTSCapabilities.xml)
  overlays: {
    rough: { url: TREK + '/mola_roughness/1.0.0/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.png',      style: 'default', matrixSet: 'default028mm', zMax: 1 },  // Roughness
    dust:  { url: TREK + '/TES_Dust/1.0.0/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.png',             style: 'default', matrixSet: 'default028mm', zMax: 1 },  // Global Dust
    plag:  { url: TREK + '/TES_Plagioclase/1.0.0/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.png',       style: 'default', matrixSet: 'default028mm', zMax: 1 },  // Plagioclase Abundance
    glass: { url: TREK + '/TES_Glass_Clay/1.0.0/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.png',         style: 'default', matrixSet: 'default028mm', zMax: 1 },  // Sheet Silicates / High-Si Glass
    tin:   { url: TREK + '/TES_Thermal_Inertia/1.0.0/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.png',   style: 'default', matrixSet: 'default028mm', zMax: 1 }   // Thermal Inertia
  }
};
export var TS = TILES.tileSize;
export var overlay = { id: 'elev' };   // активный слой Layout: 'elev' (раскраска высот MOLA) или ключ из TILES.overlays
export function cfgOf(kind) { return kind === 'elev' ? (overlay.id === 'elev' ? TILES.elevColor : TILES.overlays[overlay.id]) : TILES[kind]; }
export function tileUrl(kind, z, row, col) {
  var c = cfgOf(kind);
  return c.url.replace(/\{(z|TileMatrix)\}/g, z).replace(/\{(row|TileRow)\}/g, row).replace(/\{(col|TileCol)\}/g, col)
    .replace(/\{Style\}/g, c.style || '').replace(/\{TileMatrixSet\}/g, c.matrixSet || '');
}
// ---- загрузка картинок тайлов (кэш + CORS) ----
var imgCache = {}, imgOrder = [];
export function loadTileImg(url) {
  if (imgCache[url]) return imgCache[url];
  var p = new Promise(function (resolve) {
    var im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = function () { resolve(im); };
    im.onerror = function () { resolve(null); };
    im.src = url;
  });
  imgCache[url] = p; imgOrder.push(url);
  if (imgOrder.length > 160) { delete imgCache[imgOrder.shift()]; }
  return p;
}
