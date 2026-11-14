import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildPatch, modelNear, orbitOffset, DETAIL_MODELS, kmToLonLat } from '../src/mars/detail-geo.js';

const m = DETAIL_MODELS[0];
test('registry: only Gale Crater', () => {
  assert.equal(DETAIL_MODELS.length, 1);
  assert.equal(m.id, 'gale');
  assert.equal(modelNear(-59, -12), null);
});

test('kmToLonLat centre', () => {
  const c = kmToLonLat(m, 0, 0);
  assert.ok(Math.abs(c.lon - m.lon) < 1e-9 && Math.abs(c.lat - m.lat) < 1e-9);
});

test('orbitOffset', () => {
  const o = orbitOffset(0, 0.5, 1);
  assert.ok(o.y < 0 && o.z > 0 && Math.abs(Math.hypot(o.x, o.y, o.z) - 1) < 1e-9);
});

test('gale: near, grid size, rectangular patch', () => {
  assert.equal(modelNear(137.4, -5.4).id, 'gale');
  assert.equal(modelNear(137.0, -4.0).id, 'gale');
  const g = DETAIL_MODELS.find((x) => x.id === 'gale');
  const d = new Uint16Array(Buffer.from(fs.readFileSync(new URL('../src/data/models/gale-crater.txt', import.meta.url), 'utf8'), 'base64').buffer.slice(0));
  assert.equal(d.length, g.nx * g.ny);
  const p = buildPatch(g, d, { lift: 6 / 3389.5, exag: 1, planetKm: () => -2, step: 16 });
  assert.equal(p.nnx, Math.floor((g.nx - 1) / 16) + 1);
  for (let i = 0; i < p.pos.length; i++) assert.ok(isFinite(p.pos[i]));
  for (let i = 0; i < p.index.length; i++) assert.ok(p.index[i] < p.nnx * p.nny);
});
