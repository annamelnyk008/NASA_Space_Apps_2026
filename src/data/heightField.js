// Декодирование тайлов высот и построение полей высот/слоёв.
import { HUE_TAB, SAT_TAB, interpTab } from './colorRamps.js';
import { TILES, TS, loadTileImg, tileUrl } from './tiles.js';

// тайл → Float32Array высот (км), размер tsz×tsz; null, если браузер не дал прочитать пиксели (нет CORS)
//   decode 'clrshade' — цветная раскраска MOLA (оттенок → км);  'dem16' — 16-бит PNG: км = (R*256+G)/65535*31 − 9
function decodeHeightTile(im, tsz, mode) {
  var cv = document.createElement('canvas'); cv.width = tsz; cv.height = tsz;
  var g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(im, 0, 0, tsz, tsz);
  var id;
  try { id = g.getImageData(0, 0, tsz, tsz); } catch (e) { return null; }
  var d = id.data, n = tsz * tsz, e = new Float32Array(n), i, k;
  if (mode === 'dem16') {
    for (i = 0, k = 0; i < n; i++, k += 4) e[i] = (d[k] * 256 + d[k + 1]) / 65535 * 31 - 9;
    return e;
  }
  for (i = 0, k = 0; i < n; i++, k += 4) {
    var r = d[k] / 255, gg = d[k + 1] / 255, b = d[k + 2] / 255;
    var mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), df = mx - mn, hue = 0;
    if (df > 1e-6) {
      if (mx === r) hue = ((gg - b) / df) % 6; else if (mx === gg) hue = 2 + (b - r) / df; else hue = 4 + (r - gg) / df;
      hue *= 60; if (hue < 0) hue += 360;
    }
    var sat = mx > 1e-6 ? df / mx : 0;
    e[i] = (hue >= 36 && hue <= 300 && sat >= 0.33) ? interpTab(HUE_TAB, hue) : interpTab(SAT_TAB, sat);
  }
  return e;
}
// собирает прямоугольник [sx0,sx0+sw)×[sy0,sy0+sh) уровня zh слоя высот (тайлы своего размера) в Float32Array
function layerField(zh, sx0, sy0, sw, sh, layer) {
  layer = layer || 'height';
  var cfg = TILES[layer], T = cfg.tileSize || TS, out = new Float32Array(sw * sh), ok = 0;
  var cols = Math.pow(2, zh + 1), rows = Math.pow(2, zh);
  var c0 = Math.floor(sx0 / T), c1 = Math.floor((sx0 + sw - 1) / T);
  var r0 = Math.max(0, Math.floor(sy0 / T)), r1 = Math.min(rows - 1, Math.floor((sy0 + sh - 1) / T));
  var jobs = [];
  for (var r = r0; r <= r1; r++) for (var c = c0; c <= c1; c++) (function (r, c) {
    var cw = ((c % cols) + cols) % cols;
    jobs.push(loadTileImg(tileUrl(layer, zh, r, cw)).then(function (im) {
      if (!im) return;
      var te = decodeHeightTile(im, T, cfg.decode); if (!te) return;
      ok++;
      var ox = c * T - sx0, oy = r * T - sy0;
      for (var y = Math.max(0, -oy); y < Math.min(T, sh - oy); y++) for (var x = Math.max(0, -ox); x < Math.min(T, sw - ox); x++) out[(oy + y) * sw + ox + x] = te[y * T + x];
    }));
  })(r, c);
  return Promise.all(jobs).then(function () { return { e: out, ok: ok, n: jobs.length }; });
}
// поле высот (км) прямоугольника [gx0,gx0+w)×[gy0,gy0+h) в сетке уровня z (ширина 2^(z+1)·TS px).
// Берётся ближайший по детализации уровень слоя, дальше — билинейное пересэмплирование ПО КМ (не по R/G-кодировке).
// layer: 'height' (локальная пирамида 16 бит) или 'elevColor' (раскраска MOLA ClrShade из Mars Trek — высота восстанавливается по цвету)
export function heightField(z, gx0, gy0, w, h, layer) {
  layer = layer || 'height';
  var cfg = TILES[layer], T = cfg.tileSize || TS;
  var Wz = Math.pow(2, z + 1) * TS, zh = 0;
  while (zh < (cfg.zMax || TILES.zMax) && Math.pow(2, zh + 1) * T < Wz) zh++;
  var Wh = Math.pow(2, zh + 1) * T, Hh = Wh / 2, g = Wh / Wz;
  var sx0 = Math.max(0, Math.floor(gx0 * g) - 1), sy0 = Math.max(0, Math.floor(gy0 * g) - 1);
  var sx1 = Math.min(Wh, Math.ceil((gx0 + w) * g) + 2), sy1 = Math.min(Hh, Math.ceil((gy0 + h) * g) + 2);
  var sw = Math.max(2, sx1 - sx0), sh = Math.max(2, sy1 - sy0);
  return layerField(zh, sx0, sy0, sw, sh, layer).then(function (src) {
    var out = new Float32Array(w * h);
    for (var y = 0; y < h; y++) {
      var fy = Math.max(sy0, Math.min(sy0 + sh - 1.001, (gy0 + y + 0.5) * g - 0.5)) - sy0;
      var y0 = Math.min(sh - 2, Math.floor(fy)), ty = fy - y0;
      for (var x = 0; x < w; x++) {
        var fx = Math.max(sx0, Math.min(sx0 + sw - 1.001, (gx0 + x + 0.5) * g - 0.5)) - sx0;
        var x0 = Math.min(sw - 2, Math.floor(fx)), tx = fx - x0, i0 = y0 * sw + x0;
        out[y * w + x] = (src.e[i0] * (1 - tx) + src.e[i0 + 1] * tx) * (1 - ty) + (src.e[i0 + sw] * (1 - tx) + src.e[i0 + sw + 1] * tx) * ty;
      }
    }
    return { e: out, ok: src.ok, n: src.n, f: Math.max(1, 1 / g) };
  });
}
// гауссово размытие поля (сепарабельное), σ в пикселях
export function blurField(e, w, h, sigma) {
  var R = Math.ceil(sigma * 3), ker = new Float32Array(2 * R + 1), sum = 0, i, x, y, k;
  for (i = -R; i <= R; i++) { ker[i + R] = Math.exp(-i * i / (2 * sigma * sigma)); sum += ker[i + R]; }
  for (i = 0; i < ker.length; i++) ker[i] /= sum;
  var t = new Float32Array(e.length), o = new Float32Array(e.length), acc;
  for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
    acc = 0; for (k = -R; k <= R; k++) acc += e[y * w + Math.max(0, Math.min(w - 1, x + k))] * ker[k + R];
    t[y * w + x] = acc;
  }
  for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
    acc = 0; for (k = -R; k <= R; k++) acc += t[Math.max(0, Math.min(h - 1, y + k)) * w + x] * ker[k + R];
    o[y * w + x] = acc;
  }
  return o;
}
