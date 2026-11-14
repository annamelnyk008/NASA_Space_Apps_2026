// mars/detail-geo.js — чистая геометрия Detailed view (без THREE, тестируется в node)
import { D2R } from '../config.js';

const R_KM = 3389.5;
const H_MIN = -6, H_RANGE = 14;   // км: u16 -> [-6, 8]

/** Реестр моделей. Новые места добавляются сюда. */
export const DETAIL_MODELS = [
  {
    id: 'gale',
    name: 'Gale Crater',
    lon: 137.4, lat: -5.4,
    extentKm: 200, extentYKm: 265.7,   // сторона по X и по Y
    nx: 513, ny: 513,
    nearKm: 320,
    liftKm: 10,
    zScale: 1.4
  }
];

export function greatCircleKm(lon1, lat1, lon2, lat2) {
  const a1 = lat1 * D2R, a2 = lat2 * D2R;
  const dl = (lon2 - lon1) * D2R;
  const c = Math.sin(a1) * Math.sin(a2) + Math.cos(a1) * Math.cos(a2) * Math.cos(dl);
  return Math.acos(Math.max(-1, Math.min(1, c))) * R_KM;
}

export function modelNear(lon, lat, models) {
  let best = null, bd = Infinity;
  (models || DETAIL_MODELS).forEach(function (m) {
    const d = greatCircleKm(lon, lat, m.nearLon !== undefined ? m.nearLon : m.lon, m.nearLat !== undefined ? m.nearLat : m.lat);
    if (d <= m.nearKm && d < bd) { best = m; bd = d; }
  });
  return best;
}

/** Локальный (км) → lon/lat. x — на восток, y — на север. */
export function kmToLonLat(m, x, y) {
  const lat = m.lat + (y / R_KM) / D2R;
  const lon = m.lon + (x / (R_KM * Math.cos(lat * D2R))) / D2R;
  return { lon, lat };
}

// параметры «текстуры» по умолчанию (подобраны под Gale Crater); модель может переопределить через m.tex
const DEFAULT_TEX = { lo: [0.34, 0.19, 0.13], span: [0.46, 0.34, 0.24], mix: 0.5, aoMin: 0.55, slopeK: 0.55, slopeMax: 0.4, gain: 0.82, emissive: 0x000000 };

function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/**
 * Строит буферы патча. Чистая функция (без THREE) — тестируется отдельно.
 * Модель: сетка nx×ny, extentKm по X (восток), extentYKm по Y (север; по умолчанию = extentKm).
 * @param {object} m модель
 * @param {Uint16Array} u16 nx*ny, строка 0 = север
 * @param {{lift:number, exag:number, planetKm?:Function, colorAt?:Function, step?:number, debugColor?:number[]}} o
 */
export function buildPatch(m, u16, o) {
  const nx = m.nx || m.n, ny = m.ny || m.n, step = o.step || 1;
  const EX = m.extentKm, EY = m.extentYKm || m.extentKm;
  const hMin = m.hMin !== undefined ? m.hMin : H_MIN, hRange = m.hRange !== undefined ? m.hRange : H_RANGE;
  const nnx = Math.floor((nx - 1) / step) + 1, nny = Math.floor((ny - 1) / step) + 1;
  const pos = new Float32Array(nnx * nny * 3);
  const uv = new Float32Array(nnx * nny * 2);
  const col = new Float32Array(nnx * nny * 3);
  const hk = new Float32Array(nx * ny);
  for (let i = 0; i < nx * ny; i++) hk[i] = hMin + (u16[i] / 65535) * hRange;

  let hLow = Infinity, hHigh = -Infinity;
  for (let i = 0; i < nx * ny; i++) { if (hk[i] < hLow) hLow = hk[i]; if (hk[i] > hHigh) hHigh = hk[i]; }
  const zs = o.zScale || 1;

  // сглаженная копия для «кривизны» (запечённое затенение впадин)
  const blur = new Float32Array(nx * ny);
  const R = Math.max(2, Math.round(Math.min(nx, ny) / 64));
  const tmp = new Float32Array(nx * ny);
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      let s = 0, c = 0;
      for (let k = -R; k <= R; k++) { const xx = x + k; if (xx >= 0 && xx < nx) { s += hk[y * nx + xx]; c++; } }
      tmp[y * nx + x] = s / c;
    }
  }
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      let s = 0, c = 0;
      for (let k = -R; k <= R; k++) { const yy = y + k; if (yy >= 0 && yy < ny) { s += tmp[yy * nx + x]; c++; } }
      blur[y * nx + x] = s / c;
    }
  }

  // планета на грубой сетке для плавного «слияния» у краёв
  const G = 25;
  const pg = new Float32Array(G * G);
  const pOk = new Uint8Array(G * G);
  if (o.planetKm) {
    for (let j = 0; j < G; j++) {
      for (let i = 0; i < G; i++) {
        const ll = kmToLonLat(m, (i / (G - 1) - 0.5) * EX, (0.5 - j / (G - 1)) * EY);
        const v = o.planetKm(ll.lon, ll.lat);
        if (v !== null && v !== undefined && isFinite(v)) { pg[j * G + i] = v; pOk[j * G + i] = 1; }
      }
    }
  }
  function planetAt(fx, fy) {
    const gx = fx * (G - 1), gy = fy * (G - 1);
    const i0 = Math.min(G - 2, Math.floor(gx)), j0 = Math.min(G - 2, Math.floor(gy));
    const tx = gx - i0, ty = gy - j0;
    const a = j0 * G + i0;
    if (!(pOk[a] && pOk[a + 1] && pOk[a + G] && pOk[a + G + 1])) return null;
    return (pg[a] * (1 - tx) + pg[a + 1] * tx) * (1 - ty) + (pg[a + G] * (1 - tx) + pg[a + G + 1] * tx) * ty;
  }

  const FEATHER = 0.16;           // доля стороны, где модель сливается с планетой
  let p = 0, q = 0;
  for (let j = 0; j < nny; j++) {
    for (let i = 0; i < nnx; i++) {
      const gx = Math.min(nx - 1, i * step), gy = Math.min(ny - 1, j * step);
      const fx = gx / (nx - 1), fy = gy / (ny - 1);
      const idx = gy * nx + gx;
      const ll = kmToLonLat(m, (fx - 0.5) * EX, (0.5 - fy) * EY);
      const e = Math.min(fx, 1 - fx, fy, 1 - fy) / FEATHER;
      const w = Math.max(0, Math.min(1, e));
      const ws = w * w * (3 - 2 * w);
      let h = hLow + (hk[idx] - hLow) * zs;   // вертикальный масштаб рельефа от самой низкой точки
      const pk = planetAt(fx, fy);
      if (pk !== null) h = pk + (h - pk) * ws;
      const r = 1 + (o.exag * h) / R_KM + o.lift * ws;
      const la = ll.lat * D2R, lo = ll.lon * D2R;
      pos[p] = r * Math.cos(la) * Math.cos(lo);
      pos[p + 1] = r * Math.sin(la);
      pos[p + 2] = -r * Math.cos(la) * Math.sin(lo);
      p += 3;
      uv[q++] = fx; uv[q++] = 1 - fy;

      // цвет: текстура планеты (или палитра) × затенение рельефа
      const sampled = !o.debugColor && !o.flatBase && o.colorAt ? o.colorAt(ll.lon, ll.lat) : null;
      let c = o.debugColor || sampled;
      const t = Math.max(0, Math.min(1, (hk[idx] - hMin - 1.5) / 10));
      if (!c) c = [0.42 + 0.3 * t, 0.2 + 0.2 * t, 0.12 + 0.14 * t];
      const curv = hk[idx] - blur[idx];
      let ao = Math.max(0.55, Math.min(1.25, 1 + curv * 0.35));
      if (!o.debugColor) {
        // «текстура»: цвет планеты + палитра по высоте, тёмные крутые склоны и мелкое зерно
        const xm = Math.max(0, gx - 1), xp = Math.min(nx - 1, gx + 1), ym = Math.max(0, gy - 1), yp = Math.min(ny - 1, gy + 1);
        const sx = (hk[gy * nx + xp] - hk[gy * nx + xm]) / ((xp - xm) * EX / (nx - 1));
        const sy = (hk[yp * nx + gx] - hk[ym * nx + gx]) / ((yp - ym) * EY / (ny - 1));
        const slope = Math.hypot(sx, sy);
        const tt = Math.max(0, Math.min(1, (hk[idx] - hLow) / Math.max(1, hHigh - hLow)));
        const T = Object.assign({}, DEFAULT_TEX, m.tex || {});
        const pal = [T.lo[0] + T.span[0] * tt, T.lo[1] + T.span[1] * tt, T.lo[2] + T.span[2] * tt];
        if (o.flatBase) {
          // цвет окружения = процедурный цвет планеты; рельеф лишь слегка тонирует его
          const mid = [T.lo[0] + T.span[0] * 0.5, T.lo[1] + T.span[1] * 0.5, T.lo[2] + T.span[2] * 0.5];
          c = [o.flatBase[0] * pal[0] / mid[0], o.flatBase[1] * pal[1] / mid[1], o.flatBase[2] * pal[2] / mid[2]];
        } else c = sampled
          ? [sampled[0] * T.mix + pal[0] * (1 - T.mix), sampled[1] * T.mix + pal[1] * (1 - T.mix), sampled[2] * T.mix + pal[2] * (1 - T.mix)]
          : pal;
        const grain = 0.94 + 0.12 * hash2(gx, gy);
        ao = Math.max(T.aoMin, ao);
        ao *= (1 - Math.min(T.slopeMax, slope * T.slopeK)) * grain * T.gain;
      }
      const o3 = (j * nnx + i) * 3;
      col[o3] = Math.min(1, c[0] * ao);
      col[o3 + 1] = Math.min(1, c[1] * ao);
      col[o3 + 2] = Math.min(1, c[2] * ao);
    }
  }
  const index = new Uint32Array((nnx - 1) * (nny - 1) * 6);
  let t = 0;
  for (let j = 0; j < nny - 1; j++) {
    for (let i = 0; i < nnx - 1; i++) {
      const a = j * nnx + i, b = a + 1, c = a + nnx, d = c + 1;
      index[t++] = a; index[t++] = c; index[t++] = b;
      index[t++] = b; index[t++] = c; index[t++] = d;
    }
  }
  return { nn: nnx, nnx, nny, pos, uv, col, index };
}

/** Соскальзывание/ориентация камеры: чистая функция, тестируется. */
export function orbitOffset(az, el, D) {
  const ce = Math.cos(el), se = Math.sin(el);
  // камера «южнее» цели при az=0, смотрит на север
  return { x: -Math.sin(az) * ce * D, y: -Math.cos(az) * ce * D, z: se * D };
}

