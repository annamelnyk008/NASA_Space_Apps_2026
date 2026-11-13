// Регрессионные «золотые» значения: сняты с исходного (до разбиения) кода.
// Запуск: npm test   (встроенный node:test, без зависимостей; модули с three здесь не импортируются)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const G = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url), 'utf8'));
globalThis.location = { hostname: 'localhost' };          // data/tiles.js выбирает прокси '/trek' на localhost

const math = await import('../src/lib/math.js');
const view = await import('../src/lib/view.js');
const fmt = await import('../src/lib/format.js');
const ramps = await import('../src/data/colorRamps.js');
const solar = await import('../src/data/marsSolar.js');
const tiles = await import('../src/data/tiles.js');
const config = await import('../src/config.js');

// числа сравниваем с относительной погрешностью 1e-9 (разные платформы), всё остальное — строго
function near(a, b, path = '') {
  if (typeof a === 'number' && typeof b === 'number') {
    const tol = 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
    assert.ok(Math.abs(a - b) <= tol, `${path}: ${a} != ${b}`);
  } else if (a && b && typeof a === 'object') {
    assert.deepEqual(Object.keys(a), Object.keys(b), path);
    for (const k of Object.keys(a)) near(a[k], b[k], `${path}.${k}`);
  } else assert.equal(a, b, path);
}
const table = { HUE_TAB: ramps.HUE_TAB, SAT_TAB: ramps.SAT_TAB, ELEV_RAMP: ramps.ELEV_RAMP, TEMP_RAMP: ramps.TEMP_RAMP };

const fns = { ...math, ...view, ...fmt, ...solar };
for (const name of ['vnoise','fb','clamp01','sstep','mix','angDiff','wrap180','faceAngles','clampDist','clampFov','lonText','pad2','fmtLonLat','fmtClock','marsSolar']) {
  test(name, () => { for (const c of G.cases[name]) near(fns[name](...c.args), c.out, `${name}(${c.args})`); });
}
test('sunFor (фиксированное Date.now)', (t) => {
  t.mock.method(Date, 'now', () => G.fixedNow);
  for (const c of G.cases.sunFor) near(solar.sunFor(...c.args), c.out, `sunFor(${c.args})`);
});
test('rng: последовательности по seed', () => {
  for (const c of G.cases.rng) { const g = math.rng(c.seed); c.out.forEach((v, i) => near(g(), v, `seed ${c.seed} #${i}`)); }
});
test('interpTab', () => { for (const c of G.cases.interpTab) near(ramps.interpTab(table[c.table], c.x), c.out, `${c.table}(${c.x})`); });
test('rampFrom', () => { for (const c of G.cases.rampFrom) near(ramps.rampFrom(table[c.table], c.h), c.out, `${c.table}(${c.h})`); });
test('tileUrl по слоям Layout', () => {
  for (const c of G.cases.tileUrl) { tiles.overlay.id = c.ov; assert.equal(tiles.tileUrl(c.kind, c.z, c.row, c.col), c.out, `${c.ov}/${c.kind}`); }
  tiles.overlay.id = 'elev';
});
test('TILES и константы', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(tiles.TILES)), G.TILES);
  assert.equal(tiles.TS, G.TS);
  assert.equal(config.D2R, G.D2R); assert.equal(config.MIN_DIST, G.MIN_DIST); assert.equal(config.MAX_DIST, G.MAX_DIST);
  assert.equal(ramps.K_LO, G.K_LO); assert.equal(ramps.K_HI, G.K_HI);
});
