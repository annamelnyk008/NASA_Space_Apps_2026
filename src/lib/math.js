// Математика общего назначения: шум, интерполяция, углы, ГПСЧ.

// ---- Шум и процедурные текстуры ---------------------------------------
function hash3(x, y, z) {
  var h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function sm(t) { return t * t * (3 - 2 * t); }
export function vnoise(x, y, z) {
  var xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  var xf = sm(x - xi), yf = sm(y - yi), zf = sm(z - zi);
  var c000 = hash3(xi, yi, zi), c100 = hash3(xi + 1, yi, zi);
  var c010 = hash3(xi, yi + 1, zi), c110 = hash3(xi + 1, yi + 1, zi);
  var c001 = hash3(xi, yi, zi + 1), c101 = hash3(xi + 1, yi, zi + 1);
  var c011 = hash3(xi, yi + 1, zi + 1), c111 = hash3(xi + 1, yi + 1, zi + 1);
  var x00 = c000 + (c100 - c000) * xf, x10 = c010 + (c110 - c010) * xf;
  var x01 = c001 + (c101 - c001) * xf, x11 = c011 + (c111 - c011) * xf;
  var y0 = x00 + (x10 - x00) * yf, y1 = x01 + (x11 - x01) * yf;
  return y0 + (y1 - y0) * zf;
}
export function fb(x, y, z, oct) {
  var a = 0.5, s = 0, f = 1;
  for (var i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f, z * f); f *= 2; a *= 0.5; }
  return s / (1 - Math.pow(0.5, oct));
}
export function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
export function sstep(e0, e1, x) { var t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); }
export function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function angDiff(a, b) {
  var d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function wrap180(a) { a = (a + 180) % 360; if (a < 0) a += 360; return a - 180; }
