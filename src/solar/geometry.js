// Процедурные геометрии астероидов и спутников Марса.
import * as THREE from 'three';
import { rng } from '../lib/math.js';

export function rockGeometry(seed) {
  var g = new THREE.IcosahedronGeometry(1, 1);
  var pos = g.attributes.position, map = {}, rnd = rng(seed);
  for (var i = 0; i < pos.count; i++) {
    var x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    var k = x.toFixed(3) + ',' + y.toFixed(3) + ',' + z.toFixed(3);
    if (map[k] === undefined) map[k] = 0.72 + rnd() * 0.5;
    var s = map[k];
    pos.setXYZ(i, x * s, y * s, z * s);
  }
  g.computeVertexNormals();
  return g;
}

export function moonGeometry(seed) {
  var g = new THREE.IcosahedronGeometry(1, 2);
  var pos = g.attributes.position, map = {}, rnd = rng(seed);
  for (var i = 0; i < pos.count; i++) {
    var x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    var k = x.toFixed(3) + ',' + y.toFixed(3) + ',' + z.toFixed(3);
    if (map[k] === undefined) map[k] = 0.88 + rnd() * 0.22;
    var s = map[k];
    pos.setXYZ(i, x * s, y * s, z * s);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Детальная геометрия спутника Марса: «картофельная» форма из нескольких низкочастотных вмятин, кратеры
 * (чаша + вал) разного размера, у Фобоса — крупный кратер Стикни и борозды. Нормали сглажены,
 * а светлота (вершинные цвета) зависит от кратеров, так что поверхность читается даже издали.
 * Форма — единичная сфера; реальные пропорции задаются масштабом меша.
 * @param {number} seed
 * @param {{ color?: number, stickney?: boolean, grooves?: boolean, craters?: number }} [opts]
 */
export function detailedMoonGeometry(seed, opts) {
  opts = opts || {};
  var base = new THREE.Color(opts.color !== undefined ? opts.color : 0x777777);
  var rnd = rng(seed * 7 + 1);
  function rdir() {
    var z = rnd() * 2 - 1, a = rnd() * 6.2831853, r = Math.sqrt(1 - z * z);
    return [r * Math.cos(a), z, r * Math.sin(a)];
  }

  // широкие неровности формы
  var bumps = [];
  for (var b = 0; b < 12; b++) bumps.push({ d: rdir(), w: 0.5 + rnd() * 0.7, a: (rnd() - 0.5) * (opts.smooth !== undefined ? opts.smooth : 1) * 0.11 });

  // кратеры: { d, r (угловой радиус, рад), depth }
  var craters = [];
  if (opts.stickney) craters.push({ d: opts.stickneyDir || [1, 0.06, 0.02], r: opts.stickneyR || 0.46, depth: opts.stickneyDepth || 0.2, big: true });
  var n = opts.craters !== undefined ? opts.craters : 46;
  for (var c = 0; c < n; c++) {
    var rr = 0.05 + Math.pow(rnd(), 1.9) * 0.27;
    craters.push({ d: rdir(), r: rr, depth: rr * (0.45 + rnd() * 0.3) });
  }
  craters.forEach(function (cr) {
    var l = Math.hypot(cr.d[0], cr.d[1], cr.d[2]);
    cr.d = [cr.d[0] / l, cr.d[1] / l, cr.d[2] / l];
  });

  // направление борозд Фобоса (плоскость, перпендикулярная gn)
  var gn = [0.18, 0.93, 0.31], gl = Math.hypot(gn[0], gn[1], gn[2]);
  gn = [gn[0] / gl, gn[1] / gl, gn[2] / gl];

  var g = new THREE.IcosahedronGeometry(1, opts.detail !== undefined ? opts.detail : 18);
  var pos = g.attributes.position;
  var count = pos.count;
  var col = new Float32Array(count * 3);
  var uvs = new Float32Array(count * 2);
  var cache = {};
  var jr = rng(seed * 13 + 5);

  function sample(x, y, z) {
    var k = x.toFixed(4) + ',' + y.toFixed(4) + ',' + z.toFixed(4);
    if (cache[k]) return cache[k];
    var h = 0, shade = 1, i, dd, ang, t;
    for (i = 0; i < bumps.length; i++) {
      var bm = bumps[i];
      dd = Math.acos(Math.max(-1, Math.min(1, x * bm.d[0] + y * bm.d[1] + z * bm.d[2])));
      h += bm.a * Math.exp(-(dd / bm.w) * (dd / bm.w));
    }
    for (i = 0; i < craters.length; i++) {
      var cr = craters[i];
      ang = Math.acos(Math.max(-1, Math.min(1, x * cr.d[0] + y * cr.d[1] + z * cr.d[2])));
      t = ang / cr.r;
      if (t < 1.6) {
        if (t < 1) {
          var bowl = 1 - t * t;
          h -= cr.depth * bowl;
          shade -= 0.3 * bowl * (cr.big ? 0.6 : 1);
        }
        var rimT = (t - 1.04) / 0.22;
        h += cr.depth * 0.32 * Math.exp(-rimT * rimT);
        shade += 0.1 * Math.exp(-rimT * rimT);
      }
    }
    if (opts.grooves) {
      var p = x * gn[0] + y * gn[1] + z * gn[2];
      var band = 1 - Math.abs(Math.sin(p * 38)) * 2.4;
      if (band > 0) {
        var mask = Math.max(0, 1 - Math.abs(x - 0.1) * 0.7);   // борозды — вокруг Стикни, а не по всему телу
        h -= 0.014 * band * band * mask;
        shade -= 0.07 * band * mask;
      }
    }
    // мелкозернистая «шероховатость» без отдельных вершин: сумма трёх синусоид по положению
    var grain = Math.sin(x * 61 + y * 17) * Math.sin(y * 53 + z * 29) * Math.sin(z * 71 + x * 23);
    var gs = opts.smooth !== undefined ? opts.smooth : 1;
    h += grain * 0.006 * gs;
    shade += grain * 0.05 * gs;
    if (opts.jitter) h += (jr() - 0.5) * opts.jitter;   // «ломаный» low-poly силуэт: у каждой уникальной вершины свой радиус
    return (cache[k] = [1 + h, Math.max(0.45, Math.min(1.25, shade))]);
  }

  for (var v = 0; v < count; v++) {
    var x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
    var s = sample(x, y, z);
    // UV для карты в равнопромежуточной проекции: долгота = atan2(z, x), центр карты — долгота 0
    uvs[v * 2] = Math.atan2(z, x) / 6.2831853 + 0.5;
    uvs[v * 2 + 1] = Math.asin(Math.max(-1, Math.min(1, y))) / Math.PI + 0.5;
    pos.setXYZ(v, x * s[0], y * s[0], z * s[0]);
    col[v * 3] = base.r * s[1];
    col[v * 3 + 1] = base.g * s[1];
    col[v * 3 + 2] = base.b * s[1];
  }
  // шов карты: у треугольников, пересекающих долготу ±180°, поднимаем «малые» u на 1 (текстура с RepeatWrapping)
  for (var tI = 0; tI < count; tI += 3) {
    var u0 = uvs[tI * 2], u1 = uvs[(tI + 1) * 2], u2 = uvs[(tI + 2) * 2];
    if (Math.max(u0, u1, u2) - Math.min(u0, u1, u2) > 0.5) {
      if (u0 < 0.5) uvs[tI * 2] += 1;
      if (u1 < 0.5) uvs[(tI + 1) * 2] += 1;
      if (u2 < 0.5) uvs[(tI + 2) * 2] += 1;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));

  // сглаженные нормали: усредняем по совпадающим вершинам
  g.computeVertexNormals();
  if (opts.flat) return g;   // low-poly: нормали граней (вместе с flatShading у материала)
  var nr = g.attributes.normal, acc = {}, keys = new Array(count);
  for (var i2 = 0; i2 < count; i2++) {
    var kk = Math.round(pos.getX(i2) * 2000) + ',' + Math.round(pos.getY(i2) * 2000) + ',' + Math.round(pos.getZ(i2) * 2000);
    keys[i2] = kk;
    var a = acc[kk] || (acc[kk] = [0, 0, 0]);
    a[0] += nr.getX(i2); a[1] += nr.getY(i2); a[2] += nr.getZ(i2);
  }
  for (var i3 = 0; i3 < count; i3++) {
    var q = acc[keys[i3]], ln = Math.hypot(q[0], q[1], q[2]) || 1;
    nr.setXYZ(i3, q[0] / ln, q[1] / ln, q[2] / ln);
  }
  nr.needsUpdate = true;
  return g;
}
