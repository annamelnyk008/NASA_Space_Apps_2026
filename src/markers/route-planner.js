// markers/route-planner.js — построение маршрута по карте высот (без DOM, без three.js).
// Сетка высот: { e: Float32Array км, w, h, lon0, lat0, dLon, dLat } — lon0 — западный край, lat0 — северный край (градусы),
// центр ячейки (x, y): lon = lon0 + (x + 0.5)·dLon, lat = lat0 − (y + 0.5)·dLat.

export const R_KM = 3389.5;
const D2R = Math.PI / 180;

// Режимы: g0 — «комфортный» уклон (доля), при котором путь становится вдвое дороже; чем меньше, тем сильнее обход холмов
// k — «цена» километра набора высоты в километрах пути (на грубой сетке уклоны сглажены, поэтому считаем и сам перепад)
// detour — максимально допустимая длина пути относительно прямой (поиск идёт только внутри этого эллипса)
export const MODES = {
  gentle:   { label: 'Gentle',   g0: 0.015, k: 60, detour: 1.8 },
  balanced: { label: 'Balanced', g0: 0.04,  k: 20, detour: 1.3 },
  shortest: { label: 'Shortest', g0: Infinity, k: 0, detour: 1.2 }
};
const PEN_CAP = 8;        // штраф за уклон не больше ×9: на крутых склонах (вулканы) обход всё равно не окупается
const G_MAX = 0.45;       // ≈ 24°: круче — почти непроходимо (штраф ×20)

// ---------- геометрия ----------
export function greatCircleKm(lon1, lat1, lon2, lat2) {
  const p1 = lat1 * D2R, p2 = lat2 * D2R, dl = (lon2 - lon1) * D2R;
  const s1 = Math.sin((p2 - p1) / 2), s2 = Math.sin(dl / 2);
  const a = s1 * s1 + Math.cos(p1) * Math.cos(p2) * s2 * s2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

// ---------- какой кусок карты высот нужен ----------
// ts — размер тайла (px), сетка уровня z имеет ширину 2^(z+1)·ts px на 360°
export function gridSpec(a, b, ts, opts) {
  const maxCells = (opts && opts.maxCells) || 520;
  const zMax = (opts && opts.zMax != null) ? opts.zMax : 5;
  const latMid = (a.lat + b.lat) / 2;
  const cosM = Math.max(0.2, Math.cos(latMid * D2R));
  const lonSpan = Math.abs(a.lon - b.lon), latSpan = Math.abs(a.lat - b.lat);
  const span = Math.max(lonSpan * cosM, latSpan);
  const pad = Math.max(span * 0.4, 2.5);                 // поле для обхода препятствий
  const padLon = Math.min(60, pad / cosM);
  // lon может быть «развёрнутой» (за ±180): сетка тогда пересекает линию смены дат, loadGrid склеит её из двух кусков
  let lonMin = Math.min(a.lon, b.lon) - padLon, lonMax = Math.max(a.lon, b.lon) + padLon;
  if (lonMax - lonMin > 360) { const c = (lonMin + lonMax) / 2; lonMin = c - 180; lonMax = c + 180; }
  const latMin = Math.max(-89, Math.min(a.lat, b.lat) - pad), latMax = Math.min(89, Math.max(a.lat, b.lat) + pad);
  let z = 0;
  for (let k = 0; k <= zMax; k++) {
    const ppd = Math.pow(2, k + 1) * ts / 360;
    if ((lonMax - lonMin) * ppd <= maxCells && (latMax - latMin) * ppd <= maxCells) z = k; else break;
  }
  const ppd = Math.pow(2, z + 1) * ts / 360;
  const gx0 = Math.floor((lonMin + 180) * ppd), gx1 = Math.ceil((lonMax + 180) * ppd);
  const gy0 = Math.floor((90 - latMax) * ppd), gy1 = Math.ceil((90 - latMin) * ppd);
  return { z: z, Wz: Math.round(ppd * 360), gx0: gx0, gy0: gy0, w: Math.max(4, gx1 - gx0), h: Math.max(4, gy1 - gy0), ppd: ppd,
           lon0: gx0 / ppd - 180, lat0: 90 - gy0 / ppd, dLon: 1 / ppd, dLat: 1 / ppd };
}

// heightField(z, gx0, gy0, w, h) → Promise<{e, ok}>  (см. data/heightField.js)
export function loadGrid(spec, heightField) {
  const e = new Float32Array(spec.w * spec.h);
  let ok = 0, srcKm = 0, source = '', cur = spec.gx0, outX = 0, remaining = spec.w;
  function next() {
    if (remaining <= 0) return Promise.resolve();
    const start = ((cur % spec.Wz) + spec.Wz) % spec.Wz, len = Math.min(remaining, spec.Wz - start), ox = outX;
    return heightField(spec.z, start, spec.gy0, len, spec.h).then(function (r) {
      for (let y = 0; y < spec.h; y++) for (let x = 0; x < len; x++) e[y * spec.w + ox + x] = r.e[y * len + x];
      ok += r.ok || 0;
      if (r.srcKm) srcKm = Math.max(srcKm, r.srcKm);
      if (r.source) source = r.source;
      cur += len; outX += len; remaining -= len;
      return next();
    });
  }
  return next().then(function () {
    return { e: e, w: spec.w, h: spec.h, lon0: spec.lon0, lat0: spec.lat0, dLon: spec.dLon, dLat: spec.dLat, z: spec.z, ok: ok, srcKm: srcKm, source: source };
  });
}

// второй конец «разворачивается» так, чтобы путь шёл кратчайшим путём (через линию смены дат, если так ближе)
export function unwrapEnd(a, b) {
  const d = ((((b.lon - a.lon) % 360) + 540) % 360) - 180;
  return { lon: a.lon + d, lat: b.lat };
}
function wrapLon(lon) { return ((((lon + 180) % 360) + 360) % 360) - 180; }

// лёгкое сглаживание 3×3 (убирает шум в 1 пиксель)
function smoothGrid(e, w, h) {
  const o = new Float32Array(e.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, k = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = Math.min(w - 1, Math.max(0, x + dx)), yy = Math.min(h - 1, Math.max(0, y + dy));
      const wt = (dx ? 1 : 2) * (dy ? 1 : 2);
      s += e[yy * w + xx] * wt; k += wt;
    }
    o[y * w + x] = s / k;
  }
  return o;
}

function sampleGrid(g, e, lon, lat) {
  const fx = Math.max(0, Math.min(g.w - 1.001, (lon - g.lon0) / g.dLon - 0.5));
  const fy = Math.max(0, Math.min(g.h - 1.001, (g.lat0 - lat) / g.dLat - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, i = y0 * g.w + x0;
  return (e[i] * (1 - tx) + e[i + 1] * tx) * (1 - ty) + (e[i + g.w] * (1 - tx) + e[i + g.w + 1] * tx) * ty;
}

// ---------- двоичная куча ----------
function Heap() { this.k = []; this.v = []; }
Heap.prototype.push = function (key, val) {
  const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
  while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
  k[i] = key; v[i] = val;
};
Heap.prototype.pop = function () {
  const k = this.k, v = this.v, top = v[0], lk = k.pop(), lv = v.pop(), n = k.length;
  if (n > 0) {
    let i = 0;
    for (;;) {
      let c = 2 * i + 1; if (c >= n) break;
      if (c + 1 < n && k[c + 1] < k[c]) c++;
      if (k[c] >= lk) break;
      k[i] = k[c]; v[i] = v[c]; i = c;
    }
    k[i] = lk; v[i] = lv;
  }
  return top;
};
Heap.prototype.size = function () { return this.k.length; };

const NEI = [];
(function () {
  const d = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
             [2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]];
  d.forEach(function (p) { NEI.push(p); });
})();

// ---------- поиск пути (A*) ----------
function findCells(g, e, ia, ib, g0, kClimb, detour) {
  const w = g.w, h = g.h, n = w * h;
  const cosRow = new Float32Array(h);
  for (let y = 0; y < h; y++) cosRow[y] = Math.cos((g.lat0 - (y + 0.5) * g.dLat) * D2R);
  const kmLon = g.dLon * D2R * R_KM, kmLat = g.dLat * D2R * R_KM;
  const gs = new Float32Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
  const ax = ia % w, ay = (ia / w) | 0, bx = ib % w, by = (ib / w) | 0;
  const lonB = g.lon0 + (bx + 0.5) * g.dLon, latB = g.lat0 - (by + 0.5) * g.dLat;
  const hc = new Float32Array(n).fill(-1);
  function heur(x, y) {
    const i = y * w + x;
    if (hc[i] < 0) hc[i] = 0.97 * greatCircleKm(g.lon0 + (x + 0.5) * g.dLon, g.lat0 - (y + 0.5) * g.dLat, lonB, latB);
    return hc[i];
  }
  const lonA = g.lon0 + (ax + 0.5) * g.dLon, latA = g.lat0 - (ay + 0.5) * g.dLat;
  const direct = greatCircleKm(lonA, latA, lonB, latB);
  const limit = direct * detour + 4 * R_KM * g.dLat * D2R;          // + запас в несколько ячеек
  const dA = new Float32Array(n).fill(-1);
  function outside(x, y) {                                          // вне эллипса допустимого обхода
    if (!isFinite(limit)) return false;
    const i = y * w + x;
    if (dA[i] < 0) dA[i] = greatCircleKm(g.lon0 + (x + 0.5) * g.dLon, g.lat0 - (y + 0.5) * g.dLat, lonA, latA);
    return dA[i] + heur(x, y) / 0.97 > limit;
  }
  const open = new Heap();
  gs[ia] = 0; open.push(heur(ax, ay), ia);
  while (open.size()) {
    const cur = open.pop();
    if (done[cur]) continue;
    done[cur] = 1;
    if (cur === ib) break;
    const cx = cur % w, cy = (cur / w) | 0, ch = e[cur];
    for (let k = 0; k < NEI.length; k++) {
      const nx = cx + NEI[k][0], ny = cy + NEI[k][1];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (done[ni] || (ni !== ib && outside(nx, ny))) continue;
      const dx = NEI[k][0] * kmLon * (cosRow[cy] + cosRow[ny]) * 0.5, dy = NEI[k][1] * kmLat;
      const d = Math.sqrt(dx * dx + dy * dy);
      const grade = Math.abs(e[ni] - ch) / d;
      let cost = d;
      if (g0 !== Infinity) {
        const q = grade / g0;
        cost = d * (1 + Math.min(q * q, PEN_CAP));
        if (grade > G_MAX) cost *= 2;
        const dh = e[ni] - ch;
        cost += kClimb * (dh > 0 ? dh : -0.15 * dh);     // подъём дороже спуска
      }
      const ng = gs[cur] + cost;
      if (ng < gs[ni]) { gs[ni] = ng; prev[ni] = cur; open.push(ng + heur(nx, ny), ni); }
    }
  }
  if (!done[ib]) return null;
  const path = [];
  for (let c = ib; c !== -1; c = prev[c]) path.push(c);
  return path.reverse();
}

// ---------- сглаживание и ресемплинг ----------
function chaikin(pts, iters) {
  let p = pts;
  for (let it = 0; it < iters; it++) {
    if (p.length < 3) break;
    const q = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      q.push({ lon: 0.75 * a.lon + 0.25 * b.lon, lat: 0.75 * a.lat + 0.25 * b.lat });
      q.push({ lon: 0.25 * a.lon + 0.75 * b.lon, lat: 0.25 * a.lat + 0.75 * b.lat });
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  return p;
}

function resample(pts, stepKm) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + greatCircleKm(pts[i - 1].lon, pts[i - 1].lat, pts[i].lon, pts[i].lat));
  const total = cum[cum.length - 1];
  if (total < 1e-6) return { pts: [{ lon: pts[0].lon, lat: pts[0].lat, d: 0 }, { lon: pts[pts.length - 1].lon, lat: pts[pts.length - 1].lat, d: 0 }], total: 0 };
  const n = Math.max(2, Math.ceil(total / stepKm) + 1), out = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = total * i / (n - 1);
    while (j < pts.length - 2 && cum[j + 1] < t) j++;
    const seg = cum[j + 1] - cum[j], f = seg > 0 ? (t - cum[j]) / seg : 0;
    out.push({ lon: pts[j].lon + (pts[j + 1].lon - pts[j].lon) * f, lat: pts[j].lat + (pts[j + 1].lat - pts[j].lat) * f, d: t });
  }
  return { pts: out, total: total };
}

// ---------- статистика ----------
export function profileStats(pts, cellKm) {
  const n = pts.length, z = pts.map(function (p) { return p.h; });
  const total = pts[n - 1].d;
  const thr = 10; let anchor = z[0], up = 0, down = 0;
  for (let i = 1; i < n; i++) {
    if (z[i] - anchor >= thr) { up += z[i] - anchor; anchor = z[i]; }
    else if (anchor - z[i] >= thr) { down += anchor - z[i]; anchor = z[i]; }
  }
  // уклон считаем на базе ≈ одной ячейки данных, иначе шум пикселя даёт ложные крутые участки
  const stepKm = n > 1 ? total / (n - 1) : 1;
  const k = Math.max(1, Math.round(cellKm / Math.max(stepKm, 1e-6)));
  let maxG = 0, sumAbs = 0, sumLen = 0;
  for (let i = 0; i + k < n; i += k) {
    const dd = (pts[i + k].d - pts[i].d) * 1000, dz = Math.abs(z[i + k] - z[i]);
    if (dd <= 0) continue;
    maxG = Math.max(maxG, dz / dd); sumAbs += dz; sumLen += dd;
  }
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < n; i++) { if (z[i] < mn) mn = z[i]; if (z[i] > mx) mx = z[i]; }
  return {
    lengthKm: total, ascentM: up, descentM: down,
    maxSlopeDeg: Math.atan(maxG) / D2R,
    avgSlopeDeg: sumLen > 0 ? Math.atan(sumAbs / sumLen) / D2R : 0,
    startM: z[0], endM: z[n - 1], minM: mn, maxM: mx
  };
}

// Сложность — по плотности набора высоты (м на км пути) и максимальному уклону
export function difficulty(st) {
  const density = st.lengthKm > 0 ? st.ascentM / st.lengthKm : 0;
  if (density >= 8 || st.maxSlopeDeg >= 15) return 'challenging';
  if (density >= 3 || st.maxSlopeDeg >= 8) return 'moderate';
  return 'easy';
}

/**
 * @param {object} grid    сетка высот (км)
 * @param {{lon,lat}} a    старт
 * @param {{lon,lat}} b    финиш
 * @param {{mode?: string, flat?: boolean}} [opts]
 * @returns {{points, stats, direct, cellKm, flat, mode} | null}
 */
export function planRoute(grid, a, b, opts) {
  opts = opts || {};
  const mode = MODES[opts.mode] ? opts.mode : 'balanced';
  const g = grid;
  const e = smoothGrid(g.e, g.w, g.h);
  const cellKm = Math.max(g.dLat * D2R * R_KM, g.srcKm || 0);   // реальная детальность данных, не размер ячейки сетки
  const cellOf = function (p) {
    const x = Math.max(0, Math.min(g.w - 1, Math.round((p.lon - g.lon0) / g.dLon - 0.5)));
    const y = Math.max(0, Math.min(g.h - 1, Math.round((g.lat0 - p.lat) / g.dLat - 0.5)));
    return y * g.w + x;
  };
  const ia = cellOf(a), ib = cellOf(b);
  let raw;
  if (ia === ib) raw = [{ lon: a.lon, lat: a.lat }, { lon: b.lon, lat: b.lat }];
  else {
    let cells = findCells(g, e, ia, ib, MODES[mode].g0, MODES[mode].k, MODES[mode].detour);
    if (!cells) cells = findCells(g, e, ia, ib, MODES[mode].g0, MODES[mode].k, Infinity);   // запасной вариант без ограничения
    if (!cells) return null;
    raw = cells.map(function (c) { return { lon: g.lon0 + ((c % g.w) + 0.5) * g.dLon, lat: g.lat0 - (((c / g.w) | 0) + 0.5) * g.dLat }; });
    raw[0] = { lon: a.lon, lat: a.lat };
    raw[raw.length - 1] = { lon: b.lon, lat: b.lat };
  }
  const stepKm = Math.max(cellKm * 0.5, 0.05);
  const rs = resample(chaikin(raw, 2), stepKm);
  rs.pts.forEach(function (p) { p.h = sampleGrid(g, e, p.lon, p.lat) * 1000; });
  const line0 = [{ lon: a.lon, lat: a.lat }, { lon: b.lon, lat: b.lat }];
  const line = resample(line0, stepKm);
  line.pts.forEach(function (p) { p.h = sampleGrid(g, e, p.lon, p.lat) * 1000; });
  rs.pts.forEach(function (p) { p.lon = wrapLon(p.lon); });
  return {
    points: rs.pts, stats: profileStats(rs.pts, cellKm), direct: profileStats(line.pts, cellKm),
    cellKm: cellKm, flat: !!opts.flat, mode: mode, source: g.source || ''
  };
}
