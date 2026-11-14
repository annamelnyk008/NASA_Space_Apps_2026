// sim/noise.js — детерминированный шум для процедурной поверхности (чистые функции)
export function hash2(x, y, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** value noise 0..1; period px — период по x в узлах решётки (для бесшовной текстуры), 0 — без периода */
export function vnoise(x, y, s, px) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const wr = px ? function (i) { return ((i % px) + px) % px; } : function (i) { return i; };
  const a = hash2(wr(x0), y0, s), b = hash2(wr(x0 + 1), y0, s), c = hash2(wr(x0), y0 + 1, s), d = hash2(wr(x0 + 1), y0 + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x, y, oct, s, px) {
  let amp = 0.5, f = 1, sum = 0, n = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(x * f, y * f, s + i * 17, px ? px * f : 0);
    n += amp; amp *= 0.5; f *= 2;
  }
  return sum / n;
}

/**
 * Поле камней на одной решётке: камень целиком лежит внутри своей ячейки (центр в средней трети, радиус ≤ 0.3 ячейки),
 * поэтому достаточно проверить одну ячейку. Возвращает высоту выпуклости (в долях ячейки·масштаб) и «тон».
 */
export function rockCell(x, z, scale, p, seed, out) {
  const cx = Math.floor(x / scale), cz = Math.floor(z / scale);
  out.h = 0; out.tone = 0.5;
  if (hash2(cx, cz, seed) >= p) return out;
  const ox = (0.35 + 0.3 * hash2(cx, cz, seed + 1)) * scale;
  const oz = (0.35 + 0.3 * hash2(cx, cz, seed + 2)) * scale;
  const r = (0.12 + 0.18 * hash2(cx, cz, seed + 3)) * scale;
  const dx = x - cx * scale - ox, dz = z - cz * scale - oz;
  const d2 = (dx * dx + dz * dz * 1.4) / (r * r);
  if (d2 >= 1) return out;
  out.h = Math.sqrt(1 - d2) * r * 0.75;
  out.tone = hash2(cx, cz, seed + 4);
  return out;
}
