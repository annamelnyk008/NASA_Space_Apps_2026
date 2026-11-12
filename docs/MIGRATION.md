# Миграция на Vite — фаза 1

## Что в архиве

Распаковывается **в корень вашего репозитория** (поверх проекта).

| Файл | Что это |
|---|---|
| `package.json` | Vite `^5.4`, three **0.128.0** (та же r128, что была в `index.html` с CDN) |
| `vite.config.js` | `base: './'` и прокси `/trek` → `trek.nasa.gov/tiles/Mars/EQ` (замена `server.py`) |
| `index.html` | Ваш файл без изменений, кроме двух тегов `<script>`: CDN-three и `js/app.js` заменены на `src/main.js` |
| `src/main.js` | Точка входа |
| `src/core/three-global.js` | Временный мост `window.THREE = THREE` для старого кода |
| `src/legacy/app.js` | Бывший `app.js`: **вся логика без изменений**, кроме того, что 10 блоков GLSL заменены на импорты |
| `src/shaders/*` | Вынесенные шейдеры (импорт через `?raw`) |

Проверено при сборке: все 11 шейдерных строк (`NOISE_GLSL`, `MARS_COMMON`, `MARS_VERT`, `MARS_FRAG`,
`MARS_ATMO_*`, `SURF_*`, `MARS_FLAT_VERT`), собранные из `.glsl`-файлов, **совпадают с оригиналом посимвольно**.
Не редактируйте шейдеры в `legacy/app.js`: теперь они живут только в `src/shaders/`.

## Шаги запуска

```bash
git tag pre-migration                       # точка возврата
git rm -r js build-js.sh build-js.bat       # старые src/ и бандл отстали от app.js (нет flat-режима и Land Pin), источник правды теперь src/legacy/app.js
mkdir -p public
git mv assets styles public/                # относительные пути assets/..., styles/... остаются рабочими
git mv tiles public/                        # если есть локальная пирамида тайлов высот (tiles/height/{z}/{row}/{col}.png)
npm install                                 # создаст package-lock.json — закоммитьте его
npm run dev
```

## Обязательная ручная проверка (на 5 минут)

1. Загрузка: видна солнечная система, метка Discover у Марса.
2. Система → Mars → назад.
3. Mars: слои Layout (Natural, Elevation, Temperature, …), кнопка Globe/Map (flat).
4. Explorer / Land Pin → вид с поверхности → Back to Mars.
5. В консоли нет ошибок 404 на `/trek/...`, `assets/...`, `tiles/height/...`.

Если что-то ломается, сначала проверьте, что `public/assets`, `public/styles` и `public/tiles` на месте.

## Чего я не мог проверить

- Не запускал `npm install`, `vite dev` и `vite build` (в моей среде нет сети), и страницу в браузере тоже не открывал.
  Проверены только синтаксис, совпадение шейдеров и структура `index.html`.
- Не видел `styles/*.css`. Они отдаются из `public/` как есть, как и раньше. В Vite-конвейер (импорт в JS) их можно перенести позже,
  когда проверите, нет ли в них `url(...)` на `assets/`.
- Не знаю, откуда у вас брался `/trek` на localhost (в комментарии к `TREK` упомянут `server.py`, в дереве его нет).
  Прокси в `vite.config.js` делает то же самое. Вне localhost код ходит напрямую в NASA, как и раньше.
- В `index.html` в `<head>` есть блок стилей (`color-scheme: light`, `padding-top: env(safe-area-inset-top)`, `background:#fff`)
  и `<title>` стоит в `<body>`. Похоже на автоматически добавленную обёртку. Я оставил как есть: проверьте, что это ваш код.

## Карта `src/legacy/app.js` (2662 строк) → будущие модули

| Строки | Содержимое | Куда выносить (фаза 2–4) |
|---|---|---|
| 43–343 | `hash3`, `vnoise`, процедурные текстуры планет | `data/proceduralTextures.js` (чистые функции) |
| 344–578 | Планеты, Солнце, астероиды, звёзды, `resize`, `placeTag` | `modes/system/` |
| 579–698 | Общее состояние Mars (`mv`, `mode`, DOM-ссылки), легенда | `core/state.js`, `core/dom.js`, `ui/legend.js` |
| 699–775 | `marsSolar`, `updateSun` и шейдер-строки Mars | `data/marsSolar.js` |
| 776–1215 | `TILES`, загрузка тайлов, `heightField`, мозаики, LOD | `data/tiles.js`, `data/heightField.js` |
| 1216–1611 | `buildMars`, подписи, `flyTo`, `updateMars`, `openMars`/`closeMars` | `modes/mars/` |
| 1612–1760 | Ввод для глобуса (pointer, pinch, hold-zoom) | `modes/mars/input.js` |
| 1761–2189 | Surface: панорама, солнце/время, `dropExplorer`, `closeSurface` | `modes/surface/` |
| 2190–2317 | Home, Pegman | `ui/home.js`, `ui/pegman.js` |
| 2318–2410 | Land Pin (превью посадки) | `ui/landPin.js` |
| 2411–2494 | Ввод для Surface | `modes/surface/input.js` |
| 2495–2615 | Плоская карта (flat) | `modes/mars/flat.js` |
| 2616–2662 | `frame()`, главный цикл | `core/loop.js` |

## Дальше (после того как фаза 1 заработает у всей команды)

2. **Чистые функции и данные** (`marsSolar`, `rampFrom`, `interpTab`, шум, текстуры планет, `TILES`, `heightField`) → модули с `export`. Побочных эффектов нет, риск минимальный.
3. **Состояние:** `mv`, `surf` и флаги (`mode`, `renderDirty`, `transitioning`) → `core/state.js`.
4. **Режимы** с интерфейсом `enter / exit / update / render`; `frame()` превращается в диспетчер.
5. Подключить ESLint (`import/no-cycle`), заменить Tailwind CDN (нужен только `#mars-tag`) на несколько строк в `mars-tag.css`.

Правило на всё время миграции: **один коммит — одно перемещение — ручная проверка по списку выше.**
