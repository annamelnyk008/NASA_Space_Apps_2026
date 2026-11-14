import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry, groundPoint, smoothstep, stormParams, quakeParams, sunAt, dayTemp, fmtTime, SCENARIOS } from '../src/sim/sim-model.js';

test('mulberry is deterministic and in [0,1)', () => {
  const a = mulberry(5), b = mulberry(5);
  for (let i = 0; i < 20; i++) { const v = a(); assert.equal(v, b()); assert.ok(v >= 0 && v < 1); }
});

test('groundPoint: farther points are closer to the horizon and smaller', () => {
  const far = groundPoint(1000, 800, 400, 0.5, 0.1), near = groundPoint(1000, 800, 400, 0.5, 0.9);
  assert.ok(far.y < near.y && far.y > 400 && near.y <= 800);
  assert.ok(far.s < near.s);
  assert.equal(groundPoint(1000, 800, 400, 0, 0.5).x, 500);
});

test('stormParams: stronger level means more dust, wind and less sunlight', () => {
  for (let v = 0; v < 10; v++) {
    const a = stormParams(v), b = stormParams(v + 1);
    assert.ok(b.tau > a.tau && b.wind > a.wind && b.directPct < a.directPct && b.earthEq > a.earthEq);
  }
  const top = stormParams(10);
  assert.ok(top.tau > 10 && top.wind > 25 && top.wind < 30);
  assert.ok(top.earthEq < 4.5);                      // thin air: ~27 m/s feels like a light breeze on Earth
  assert.match(top.label, /Global/);
  assert.equal(stormParams(-3).tau, stormParams(0).tau);
});

test('quakeParams: none at 0, magnitude and shaking grow, top matches the InSight record', () => {
  assert.equal(quakeParams(0).mag, 0);
  for (let v = 1; v < 10; v++) assert.ok(quakeParams(v + 1).mag > quakeParams(v).mag && quakeParams(v + 1).amp > quakeParams(v).amp);
  assert.ok(Math.abs(quakeParams(10).mag - 4.7) < 0.05);
});

test('sun and temperature over a sol: sets at ~18h, rises at ~6h, coldest before dawn, warmest after noon', () => {
  assert.ok(Math.abs(sunAt(18).el) < 1e-9 && Math.abs(sunAt(6).el) < 1e-9);
  assert.ok(sunAt(12).el > 0.3 && sunAt(0).el < -0.3);
  assert.ok(sunAt(8).az < sunAt(16).az);                   // Солнце идёт слева направо
  const t = []; for (let h = 0; h < 24; h += 0.25) t.push([h, dayTemp(h)]);
  const hi = t.reduce((a, b) => b[1] > a[1] ? b : a), lo = t.reduce((a, b) => b[1] < a[1] ? b : a);
  assert.ok(hi[0] >= 13 && hi[0] <= 15 && lo[0] >= 4 && lo[0] <= 6);
  assert.ok(hi[1] - lo[1] > 70 && hi[1] < 0);
  assert.equal(fmtTime(14.5), '14:30'); assert.equal(fmtTime(24), '00:00');
  assert.ok(SCENARIOS.day.time && SCENARIOS.moons.time && !SCENARIOS.quake.time);
});

test('smoothstep clamps', () => { assert.equal(smoothstep(0, 1, -1), 0); assert.equal(smoothstep(0, 1, 2), 1); });

import { project3, stepBallistic, visibilityM, G_MARS, CAM_H } from '../src/sim/sim-model.js';
import { hash2, vnoise, fbm, rockCell } from '../src/sim/noise.js';
import { SOUND_SPEED } from '../src/sim/sim-audio.js';

test('project3: horizon, ground points and scale', () => {
  const o = {};
  project3(800, 1000, 400, 0, CAM_H, 100, o);              // на уровне глаз — ровно на горизонте
  assert.equal(o.y, 400); assert.equal(o.x, 500);
  project3(800, 1000, 400, 0, 0, 100, o);                  // земля под горизонтом
  assert.ok(o.y > 400); assert.equal(o.s, 8);
  const a = project3(800, 1000, 400, 5, 0, 50, {}), b = project3(800, 1000, 400, 5, 0, 200, {});
  assert.ok(a.y > b.y && a.s > b.s);
});

test('stepBallistic: parabola with Mars gravity lands at v²·sin2θ/g', () => {
  const v = 30, th = Math.PI / 4;
  const p = { x: 0, y: 0.0001, z: 0, vx: v * Math.cos(th), vy: v * Math.sin(th), vz: 0 };
  let t = 0, landed = false;
  while (!landed && t < 30) { landed = stepBallistic(p, 0.001, 0, 1); t += 0.001; }
  assert.ok(landed);
  const range = v * v * Math.sin(2 * th) / G_MARS;
  assert.ok(Math.abs(p.x - range) / range < 0.01);
});

test('visibility falls with dust', () => {
  assert.ok(visibilityM(10) < visibilityM(1));
});

test('noise is deterministic, in range and tileable in x', () => {
  assert.equal(hash2(3, 4, 5), hash2(3, 4, 5));
  for (let i = 0; i < 100; i++) { const v = fbm(i * 0.37, i * 0.11, 4, 3); assert.ok(v >= 0 && v <= 1); }
  assert.ok(Math.abs(vnoise(0.4, 2.2, 9, 8) - vnoise(8.4, 2.2, 9, 8)) < 1e-9);
  const o = { h: 0, tone: 0 };
  let found = 0;
  for (let i = 0; i < 400; i++) { rockCell(i * 0.13, i * 0.07, 1, 0.5, 5, o); if (o.h > 0) { found++; assert.ok(o.h < 0.3); } }
  assert.ok(found > 10);
});

test('sound on Mars is slower than on Earth', () => { assert.ok(SOUND_SPEED < 343); });
