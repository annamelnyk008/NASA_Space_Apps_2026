// Процедурные текстуры планет, колец и свечения (canvas).
import * as THREE from 'three';
import { fb, mix, sstep, vnoise } from '../lib/math.js';

// Эквидистантная текстура по сфере; fn получает направление точки и возвращает [r,g,b(,a)]
function makeTex(w, h, fn, post) {
  var c = document.createElement('canvas');
  c.width = w; c.height = h;
  var ctx = c.getContext('2d');
  var img = ctx.createImageData(w, h);
  var d = img.data;
  for (var y = 0; y < h; y++) {
    var lat = (0.5 - (y + 0.5) / h) * Math.PI;
    var cl = Math.cos(lat), sl = Math.sin(lat);
    for (var x = 0; x < w; x++) {
      var lon = ((x + 0.5) / w) * Math.PI * 2;
      var col = fn(cl * Math.cos(lon), sl, cl * Math.sin(lon));
      var i = (y * w + x) * 4;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2];
      d[i + 3] = col.length > 3 ? col[3] : 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  if (post) post(ctx, w, h);
  return new THREE.CanvasTexture(c);
}

var TW = 512, TH = 256;

export function mercuryTex() {
  return makeTex(TW, TH, function (x, y, z) {
    var n = fb(x * 3, y * 3, z * 3 + 1.3, 5);
    var c = vnoise(x * 10 + 5, y * 10, z * 10);
    var k = 0.58 + 0.4 * (n - 0.5);
    if (c < 0.17) k *= 0.7; else if (c > 0.88) k *= 1.12;
    return [k * 190, k * 174, k * 158];
  });
}
export function venusTex() {
  return makeTex(TW, TH, function (x, y, z) {
    var w = fb(x * 2, y * 4, z * 2 + 3, 4);
    var t = Math.sin(y * 5 + w * 6) * 0.5 + 0.5;
    var c = mix([214, 172, 98], [242, 216, 152], t);
    return mix(c, [190, 140, 80], sstep(0.6, 0.85, fb(x * 5, y * 9, z * 5, 3)) * 0.35);
  });
}
export function earthTex() {
  return makeTex(TW, TH, function (x, y, z) {
    var n = fb(x * 1.7 + 3.1, y * 1.7 + 1.2, z * 1.7 + 7.7, 5);
    var ice = Math.abs(y) + (fb(x * 4, y * 4, z * 4, 3) - 0.5) * 0.12;
    if (ice > 0.88) return [238, 244, 250];
    var sea = 0.54;
    if (n < sea) return mix([14, 52, 138], [40, 122, 200], sstep(0.32, sea, n));
    var e = (n - sea) / (1 - sea);
    var c = mix([62, 148, 68], [128, 150, 74], sstep(0.15, 0.55, e));
    c = mix(c, [150, 122, 88], sstep(0.55, 0.9, e));
    var des = 1 - Math.abs(Math.abs(y) - 0.33) / 0.2;
    if (des > 0) c = mix(c, [200, 174, 106], Math.min(des, 1) * 0.65 * fb(x * 4, y * 4, z * 4, 2));
    if (e < 0.05) c = mix([218, 204, 148], c, e / 0.05);
    return c;
  });
}
export function cloudTex() {
  return makeTex(TW, TH, function (x, y, z) {
    var a = sstep(0.55, 0.74, fb(x * 2.6, y * 3.4, z * 2.6 + 9, 5));
    return [255, 255, 255, Math.round(a * 235)];
  });
}
export function marsTex() {
  return makeTex(TW, TH, function (x, y, z) {
    var n = fb(x * 2.4 + 2, y * 2.4, z * 2.4, 5);
    var c = mix([190, 92, 52], [150, 66, 38], sstep(0.4, 0.7, n));
    c = mix(c, [214, 130, 82], sstep(0.62, 0.85, fb(x * 5, y * 5, z * 5 + 4, 3)) * 0.5);
    if (Math.abs(y) + (fb(x * 5, y * 5, z * 5, 3) - 0.5) * 0.1 > 0.94) return [240, 232, 226];
    return c;
  });
}
export function jupiterTex() {
  return makeTex(1024, 512, function (x, y, z) {
    var w = fb(x * 2.2 + 1, y * 9, z * 2.2, 4);
    var t = Math.sin(y * 16 + (w - 0.5) * 3.4) * 0.5 + 0.5;
    var t2 = fb(x * 1.2, y * 22, z * 1.2, 3);
    var c = mix([158, 100, 64], [214, 160, 108], sstep(0.2, 0.7, t));
    c = mix(c, [240, 222, 190], sstep(0.65, 0.95, t) * 0.9);
    return mix(c, [190, 120, 78], sstep(0.55, 0.8, t2) * 0.35);
  }, function (ctx, w, h) {
    // Большое красное пятно: на u = 0.25 (лицом к камере при старте), широта -22°
    var cx = w * 0.25, cy = h * 0.5 + h * (22 / 180);
    var rx = w * 0.075, ry = h * 0.05;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(rx, ry);
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, 'rgba(176,58,34,1)');
    g.addColorStop(0.55, 'rgba(196,84,52,1)');
    g.addColorStop(0.82, 'rgba(224,150,108,0.95)');
    g.addColorStop(1, 'rgba(224,150,108,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  });
}
export function saturnTex() {
  return makeTex(TW, TH, function (x, y, z) {
    var w = fb(x * 1.5, y * 6, z * 1.5, 3);
    var t = Math.sin(y * 20 + (w - 0.5) * 2.4) * 0.5 + 0.5;
    return mix([206, 172, 108], [240, 218, 160], t);
  });
}
export function uranusTex() {
  return makeTex(TW, TH, function (x, y, z) {
    var t = Math.sin(y * 9 + fb(x * 2, y * 3, z * 2, 3) * 2) * 0.5 + 0.5;
    return mix([132, 208, 222], [168, 232, 236], t);
  });
}
export function neptuneTex() {
  return makeTex(TW, TH, function (x, y, z) {
    var w = fb(x * 2, y * 6, z * 2, 4);
    var t = Math.sin(y * 12 + (w - 0.5) * 3) * 0.5 + 0.5;
    return mix([40, 76, 214], [70, 118, 238], t);
  }, function (ctx, w, h) {
    ctx.save();
    ctx.translate(w * 0.3, h * 0.6);
    ctx.scale(w * 0.06, h * 0.04);
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, 'rgba(16,34,130,0.95)');
    g.addColorStop(1, 'rgba(16,34,130,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  });
}
export function ringTex() {
  var w = 512, h = 4;
  var c = document.createElement('canvas');
  c.width = w; c.height = h;
  var ctx = c.getContext('2d');
  var img = ctx.createImageData(w, h);
  for (var x = 0; x < w; x++) {
    var t = x / (w - 1);
    var a, col;
    if (t < 0.08) { a = 0; col = [150, 135, 115]; }
    else if (t < 0.22) { a = 0.3; col = [150, 135, 115]; }
    else if (t < 0.55) { a = 0.94; col = [228, 207, 170]; }
    else if (t < 0.61) { a = 0.05; col = [200, 180, 150]; }
    else if (t < 0.86) { a = 0.78; col = [204, 184, 152]; }
    else if (t < 0.885) { a = 0.08; col = [200, 180, 150]; }
    else if (t < 0.97) { a = 0.5; col = [190, 172, 144]; }
    else { a = 0; col = [190, 172, 144]; }
    var stripe = 0.82 + 0.18 * Math.sin(t * 190 + Math.sin(t * 41) * 3);
    var edge = Math.min(sstep(0.0, 0.03, t), 1 - sstep(0.97, 1.0, t));
    for (var y = 0; y < h; y++) {
      var i = (y * w + x) * 4;
      img.data[i] = col[0] * stripe;
      img.data[i + 1] = col[1] * stripe;
      img.data[i + 2] = col[2] * stripe;
      img.data[i + 3] = Math.round(255 * a * stripe * (edge > 0 ? 1 : 0));
    }
  }
  ctx.putImageData(img, 0, 0);
  return new THREE.CanvasTexture(c);
}

// ---- Свечение (спрайты) -----------------------------------------------
export function radialTex(stops) {
  var c = document.createElement('canvas');
  c.width = c.height = 256;
  var g = c.getContext('2d');
  var gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  stops.forEach(function (s) { gr.addColorStop(s[0], s[1]); });
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}
