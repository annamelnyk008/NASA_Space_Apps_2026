// Тесты планировщика маршрутов на синтетической местности.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planRoute, gridSpec, greatCircleKm, MODES } from '../src/markers/route-planner.js';

function makeGrid(fn, w = 240, h = 160, d = 0.05) {
  const g = { w, h, lon0: -6, lat0: 4, dLon: d, dLat: d, e: new Float32Array(w * h) };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    g.e[y * w + x] = fn(g.lon0 + (x + 0.5) * d, g.lat0 - (y + 0.5) * d);
  }
  return g;
}
const A = { lon: -4.5, lat: 0 }, B = { lon: 4.5, lat: 0 };
const direct = greatCircleKm(A.lon, A.lat, B.lon, B.lat);

test('плоская местность: маршрут почти прямой', () => {
  const r = planRoute(makeGrid(() => 0), A, B);
  assert.ok(r.stats.lengthKm >= direct * 0.999 && r.stats.lengthKm < direct * 1.03, String(r.stats.lengthKm / direct));
  assert.equal(r.stats.ascentM, 0);
  assert.equal(r.points[0].lon, A.lon);
  assert.equal(r.points[r.points.length - 1].lat, B.lat);
});

test('гора на пути: balanced обходит и сильно снижает набор высоты', () => {
  const mount = (lon, lat) => 6 * Math.exp(-(lon * lon + lat * lat) / (2 * 1.0 * 1.0));   // 6 км, σ=1°
  const g = makeGrid(mount);
  const bal = planRoute(g, A, B, { mode: 'balanced' });
  const sh = planRoute(g, A, B, { mode: 'shortest' });
  assert.ok(sh.stats.lengthKm < direct * 1.03);
  assert.ok(bal.stats.lengthKm > sh.stats.lengthKm);                 // обход длиннее
  assert.ok(bal.stats.lengthKm < direct * 1.6);                      // но не «огромный крюк»
  assert.ok(bal.stats.ascentM < sh.stats.ascentM * 0.5, `${bal.stats.ascentM} vs ${sh.stats.ascentM}`);
  assert.ok(bal.stats.maxSlopeDeg < sh.stats.maxSlopeDeg);
  assert.ok(Math.max(...bal.points.map(p => Math.abs(p.lat))) > 0.8);   // действительно ушёл в сторону
  assert.ok(bal.direct.ascentM > bal.stats.ascentM);                 // прямая линия хуже
});

test('gentle не короче balanced', () => {
  const g = makeGrid((lon, lat) => 3 * Math.exp(-(lon * lon + lat * lat) / 2));
  const bal = planRoute(g, A, B, { mode: 'balanced' }), gen = planRoute(g, A, B, { mode: 'gentle' });
  assert.ok(gen.stats.lengthKm >= bal.stats.lengthKm - 1e-6);
  assert.ok(gen.stats.ascentM <= bal.stats.ascentM + 1e-6);
});

test('хребет с одним проходом: маршрут идёт через проход', () => {
  const ridge = (lon, lat) => {
    const wall = 5 * Math.exp(-(lon * lon) / (2 * 0.25 * 0.25));
    const gap = Math.exp(-((lat - 2) * (lat - 2)) / (2 * 0.4 * 0.4));         // проход на lat=2
    return wall * (1 - 0.95 * gap);
  };
  const r = planRoute(makeGrid(ridge), A, B, { mode: 'balanced' });
  const crossing = r.points.reduce((best, p) => Math.abs(p.lon) < Math.abs(best.lon) ? p : best, r.points[0]);
  assert.ok(Math.abs(crossing.lat - 2) < 0.6, `пересёк хребет на lat=${crossing.lat}`);
  assert.ok(r.stats.maxM < 1500);
});

test('одна и та же ячейка: вырожденный маршрут', () => {
  const r = planRoute(makeGrid(() => 1), { lon: 0, lat: 0 }, { lon: 0.01, lat: 0.01 });
  assert.ok(r.stats.lengthKm < 3);
});

test('gridSpec: сетка накрывает обе точки и не превышает лимит ячеек', () => {
  const s = gridSpec({ lon: -134, lat: 18.6 }, { lon: -59, lat: -12 }, 256);
  assert.ok(s.w <= 400 && s.h <= 400, `${s.w}x${s.h}`);
  for (const p of [{ lon: -134, lat: 18.6 }, { lon: -59, lat: -12 }]) {
    assert.ok(p.lon > s.lon0 && p.lon < s.lon0 + s.w * s.dLon);
    assert.ok(p.lat < s.lat0 && p.lat > s.lat0 - s.h * s.dLat);
  }
  const near = gridSpec({ lon: 77, lat: 18 }, { lon: 78, lat: 18.5 }, 256);
  assert.ok(near.z > s.z);                                             // ближе — подробнее
  assert.deepEqual(Object.keys(MODES), ['gentle', 'balanced', 'shortest']);
});

test('старт на высоком плато: нет огромного обхода', () => {
  // плато 10 км вокруг старта с крутым краем, ровная равнина вокруг; финиш на равнине
  const plateau = (lon, lat) => {
    const r = Math.hypot(lon + 4.5, lat);
    return 10 / (1 + Math.exp((r - 1.2) / 0.12));
  };
  for (const mode of ['gentle', 'balanced', 'shortest']) {
    const r = planRoute(makeGrid(plateau), A, B, { mode });
    assert.ok(r.stats.lengthKm < direct * MODES[mode].detour + 60, `${mode}: ${r.stats.lengthKm} vs прямая ${direct}`);
  }
});

test('любой режим не длиннее заданного обхода', () => {
  const rugged = (lon, lat) => 4 * Math.sin(lon * 1.3) * Math.cos(lat * 1.1) + 6 * Math.exp(-((lon + 1) ** 2 + lat ** 2) / 3);
  for (const mode of Object.keys(MODES)) {
    const r = planRoute(makeGrid(rugged), A, B, { mode });
    assert.ok(r.stats.lengthKm <= direct * MODES[mode].detour + 60, `${mode}: ${r.stats.lengthKm / direct}`);
  }
});

test('очень далёкие точки на всём шаре: длина в пределах допустимого обхода', () => {
  const g = { w: 360, h: 180, lon0: -180, lat0: 90, dLon: 1, dLat: 1, e: new Float32Array(360 * 180) };
  for (let y = 0; y < 180; y++) for (let x = 0; x < 360; x++) {
    const lon = -180 + x + 0.5, lat = 90 - y - 0.5;
    // высокий пояс вдоль экватора (как Фарсида + холмы) мешает идти напрямую
    g.e[y * 360 + x] = 8 * Math.exp(-(lat * lat) / (2 * 14 * 14)) * (0.6 + 0.4 * Math.sin(lon / 20)) + 2 * Math.sin(lon / 7) * Math.cos(lat / 9);
  }
  const P = { lon: -150, lat: -5 }, Q = { lon: 20, lat: -10 };
  const dd = greatCircleKm(P.lon, P.lat, Q.lon, Q.lat);
  const r = planRoute(g, P, Q, { mode: 'balanced' });
  assert.ok(r.stats.lengthKm <= dd * MODES.balanced.detour + 100, `${r.stats.lengthKm / dd}`);
  assert.ok(Math.max(...r.points.map(p => Math.abs(p.lat))) < 60, 'не уходит к полюсу');
});

test('через линию смены дат: развёрнутая долгота, сетка склеивается из двух кусков', async () => {
  const { loadGrid, unwrapEnd } = await import('../src/markers/route-planner.js');
  const P = { lon: 170, lat: 0 }, Q0 = { lon: -170, lat: 5 };
  const Q = unwrapEnd(P, Q0);
  assert.equal(Q.lon, 190);
  const s = gridSpec(P, Q, 256);
  assert.ok(s.gx0 + s.w > s.Wz, 'сетка выходит за правый край карты');
  const calls = [];
  const hf = (z, gx0, gy0, w, h) => { calls.push([gx0, w]); const e = new Float32Array(w * h).fill(gx0 + 1); return Promise.resolve({ e, ok: 1 }); };
  const g = await loadGrid(s, hf);
  assert.equal(calls.length, 2);                                       // два куска
  assert.equal(calls[1][0], 0);                                        // второй начинается с левого края карты
  assert.equal(calls[0][1] + calls[1][1], s.w);
  const r = planRoute({ ...g, e: new Float32Array(g.w * g.h) }, P, Q, { mode: 'balanced' });
  const direct2 = greatCircleKm(170, 0, -170, 5);
  assert.ok(r.stats.lengthKm < direct2 * 1.3, String(r.stats.lengthKm / direct2));
  assert.ok(r.points.every(p => p.lon >= -180 && p.lon < 180));
  assert.ok(r.points.some(p => p.lon < -100) && r.points.some(p => p.lon > 100));
});

test('источник высот: тайлы → цветной слой Trek (по цвету) → встроенная карта', async () => {
  const { createElevationSource } = await import('../src/markers/route-elevation.js');
  const calls = [];
  const full = (layer, ok, n) => (z, gx0, gy0, w, h, l) => { calls.push(l); return Promise.resolve({ e: new Float32Array(w * h).fill(1), ok: l === layer ? ok : 0, n: l === layer ? n : 1, f: 1 }); };
  let src = createElevationSource(full('height', 4, 4), 256);
  let r = await src(3, 100, 100, 8, 8);
  assert.equal(r.source, 'height');
  calls.length = 0;
  src = createElevationSource(full('elevColor', 6, 6), 256);
  r = await src(3, 100, 100, 8, 8);
  assert.deepEqual(calls, ['height', 'elevColor']);
  assert.equal(r.source, 'elevColor');
  assert.ok(r.srcKm > 0);
  // часть тайлов не загрузилась (дыры = ложные обрывы) — слой не принимается
  calls.length = 0;
  src = createElevationSource(full('elevColor', 3, 6), 256);
  globalThis.Image = class { set src(v) { setTimeout(() => this.onerror && this.onerror(), 0); } };
  r = await src(3, 100, 100, 8, 8);
  assert.deepEqual(calls, ['height', 'elevColor']);
  assert.equal(r.ok, 0);                                               // и встроенной карты нет (в Node) — честный отказ
});
