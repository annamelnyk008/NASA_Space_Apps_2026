// Сборка мозаик из тайлов в текстуры.
import * as THREE from 'three';
import { blurField, heightField } from './heightField.js';
import { TILES, TS, cfgOf, loadTileImg, tileUrl } from './tiles.js';

// канвас высот в кодировке R/G, которую читает шейдер
function heightMosaic(z, gx0, gy0, w, h) {
  return heightField(z, gx0, gy0, w, h).then(function (r) {
    var e = r.e;
    // шумоподавление: убирает ступеньки раскраски (σ в «родных» пикселях слоя × растяжение)
    if (r.ok > 0) e = blurField(e, w, h, Math.max(0.6, (TILES.height.smooth !== undefined ? TILES.height.smooth : (TILES.heightSmooth || 2.0)) * r.f));
    var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    var g = cv.getContext('2d'), id = g.createImageData(w, h), d = id.data, n = w * h;
    for (var i = 0, k = 0; i < n; i++, k += 4) {
      var v = r.ok > 0 ? Math.round((Math.max(-9, Math.min(22, e[i])) + 9) / 31 * 65535) : 19027;
      d[k] = v >> 8; d[k + 1] = v & 255; d[k + 2] = 0; d[k + 3] = 255;
    }
    g.putImageData(id, 0, 0);
    cv._ok = r.ok;
    return cv;
  });
}
export var PH_COLOR = 'rgb(158,92,62)', PH_HEIGHT = 'rgb(74,83,0)';   // высота 0 км в кодировке (R*256+G)/65535*31−9
// Собирает прямоугольник пикселей [gx0, gx0+w) × [gy0, gy0+h) уровня z из тайлов в один canvas.
export function buildMosaic(kind, z, gx0, gy0, w, h) {
  if (kind === 'height' && TILES.height.decode) return heightMosaic(z, gx0, gy0, w, h);
  var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  var g = cv.getContext('2d');
  // если у слоя нет такого глубокого уровня — берём его максимальный и растягиваем
  var zl = Math.min(z, cfgOf(kind).zMax || TILES.zMax);
  if (z > zl) {
    var f = Math.pow(2, z - zl);
    var sx0 = Math.floor(gx0 / f), sy0 = Math.floor(gy0 / f);
    var sw = Math.ceil((gx0 + w) / f) - sx0 + 1, sh = Math.ceil((gy0 + h) / f) - sy0 + 1;
    g.fillStyle = kind === 'height' ? PH_HEIGHT : PH_COLOR;
    g.fillRect(0, 0, w, h);
    return buildMosaic(kind, zl, sx0, sy0, sw, sh).then(function (src) {
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(src, 0, 0, sw, sh, sx0 * f - gx0, sy0 * f - gy0, sw * f, sh * f);
      cv._ok = src._ok;
      return cv;
    });
  }
  g.fillStyle = kind === 'height' ? PH_HEIGHT : PH_COLOR;
  g.fillRect(0, 0, w, h);
  cv._ok = 0;
  var cols = Math.pow(2, z + 1), rows = Math.pow(2, z);
  var c0 = Math.floor(gx0 / TS), c1 = Math.floor((gx0 + w - 1) / TS);
  var r0 = Math.max(0, Math.floor(gy0 / TS)), r1 = Math.min(rows - 1, Math.floor((gy0 + h - 1) / TS));
  var jobs = [];
  for (var r = r0; r <= r1; r++) {
    for (var c = c0; c <= c1; c++) {
      (function (r, c) {
        var cw = ((c % cols) + cols) % cols;               // долгота замыкается по кругу
        jobs.push(loadTileImg(tileUrl(kind, z, r, cw)).then(function (im) {
          if (!im) return;
          if (kind === 'elev') cv._ok++;
          var src = im;
          g.drawImage(src, 0, 0, src.width, src.height, c * TS - gx0, r * TS - gy0, TS, TS);
        }));
      })(r, c);
    }
  }
  return Promise.all(jobs).then(function () { return cv; });
}
export function canvasTex(cv, isHeight, wrapRepeat, aniso) {
  var t = new THREE.CanvasTexture(cv);
  t.wrapS = wrapRepeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  if (isHeight) { t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; }
  else { t.anisotropy = aniso; }
  t.needsUpdate = true;
  return t;
}
