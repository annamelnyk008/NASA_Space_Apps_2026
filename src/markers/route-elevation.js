// markers/route-elevation.js — источник высот для маршрутов.
// 1) подробные тайлы высот (data/heightField.js → tiles/height/...), если они доступны;
// 2) раскраска высот MOLA из Mars Trek (как в Layout → Elevation), высота — по цвету;
// 3) иначе — встроенная глобальная карта высот assets/mars-height.png (2048×1024 ≈ 10 км/px, 16 бит в R/G:
//    км = (R·256 + G)/65535·31 − 9), она есть в проекте всегда и не требует сети.

const EMBED_URL = 'assets/mars-height.png';

let embedded = null;       // Promise<{w, h, d}|null>
function loadEmbedded() {
  if (!embedded) embedded = new Promise(function (resolve) {
    const im = new Image();
    im.onload = function () {
      try {
        const c = document.createElement('canvas');
        c.width = im.width; c.height = im.height;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(im, 0, 0);
        resolve({ w: c.width, h: c.height, d: g.getImageData(0, 0, c.width, c.height).data });
      } catch (e) { resolve(null); }
    };
    im.onerror = function () { resolve(null); };
    im.src = EMBED_URL;
  });
  return embedded;
}

function sampleEmbedded(img, z, tileSize, gx0, gy0, w, h) {
  const Wz = Math.pow(2, z + 1) * tileSize, Hz = Wz / 2, e = new Float32Array(w * h);
  const at = function (ix, iy) {
    ix = ((ix % img.w) + img.w) % img.w;
    iy = Math.max(0, Math.min(img.h - 1, iy));
    const o = (iy * img.w + ix) * 4;
    return (img.d[o] * 256 + img.d[o + 1]) / 65535 * 31 - 9;
  };
  for (let y = 0; y < h; y++) {
    const lat = 90 - (gy0 + y + 0.5) / Hz * 180;
    const fy = (0.5 - lat / 180) * img.h - 0.5, y0 = Math.floor(fy), ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const lon = (gx0 + x + 0.5) / Wz * 360 - 180;
      const fx = (lon / 360 + 0.5) * img.w - 0.5, x0 = Math.floor(fx), tx = fx - x0;
      const a = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx, b = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
      e[y * w + x] = a * (1 - ty) + b * ty;
    }
  }
  return e;
}

function complete(r) { return !!(r && r.e && r.ok > 0 && (r.n == null || r.ok >= r.n)); }   // все тайлы загрузились (дыры = ложные обрывы)

/**
 * Порядок источников: 1) подробные тайлы высот; 2) раскраска высот MOLA из Mars Trek (тот же слой, что Layout → Elevation),
 * высота восстанавливается по цвету; 3) встроенная глобальная карта assets/mars-height.png.
 * @param {function} heightField  data/heightField.js (z, gx0, gy0, w, h, layer) → Promise<{e, ok, n, f}>
 * @param {number} tileSize       data/tiles.js → TS
 * @returns {function} (z, gx0, gy0, w, h) → Promise<{e, ok, srcKm, source}>   srcKm — реальный шаг исходных данных, км
 */
export function createElevationSource(heightField, tileSize) {
  function tryLayer(layer, z, gx0, gy0, w, h) {
    return Promise.resolve().then(function () { return heightField(z, gx0, gy0, w, h, layer); })
      .catch(function () { return null; })
      .then(function (r) {
        if (!complete(r)) return null;
        const cellKm = 360 / (Math.pow(2, z + 1) * tileSize) * Math.PI / 180 * 3389.5;
        r.srcKm = cellKm * (r.f || 1); r.source = layer;
        return r;
      });
  }
  return function (z, gx0, gy0, w, h) {
    return tryLayer('height', z, gx0, gy0, w, h).then(function (r) {
      return r || tryLayer('elevColor', z, gx0, gy0, w, h);
    }).then(function (r) {
      if (r) return r;
      if (typeof console !== 'undefined') console.warn('[routes] tile elevation unavailable, using the built-in height map');
      return loadEmbedded().then(function (img) {
        if (!img) {
          if (typeof console !== 'undefined') console.warn('[routes] could not read ' + EMBED_URL);
          return { e: new Float32Array(w * h), ok: 0 };
        }
        return { e: sampleEmbedded(img, z, tileSize, gx0, gy0, w, h), ok: 1, source: 'embedded', srcKm: 360 / img.w * Math.PI / 180 * 3389.5 };
      });
    });
  };
}
