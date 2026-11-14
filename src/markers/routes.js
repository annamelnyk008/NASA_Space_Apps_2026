// markers/routes.js — раздел «Routes» панели Markers: маршрут между двумя точками с учётом карты высот.
// Алгоритм: markers/route-planner.js; разметка: index.html (#route-body); стили: public/styles/markers/routes.css;
// отрисовка линии и точек A/B на планете: src/shaders/markers-routes.glsl (uniform uRt*).
import { PLACES } from './places.js';
import { gridSpec, loadGrid, planRoute, difficulty, greatCircleKm, unwrapEnd } from './route-planner.js';

const D2R = Math.PI / 180;
const SVGNS = 'http://www.w3.org/2000/svg';
const SOURCES = { height: 'detailed MOLA tiles', elevColor: 'NASA Mars Trek MOLA colour layer', embedded: 'built-in global height map' };

// ---------- форматирование ----------
function nf(v, d) { return v.toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
function fmtKm(v) { return nf(v, v >= 100 ? 0 : 1) + ' km'; }
function fmtM(v) { const r = Math.round(v); return (r < 0 ? '−' : '') + nf(Math.abs(r)) + ' m'; }
function fmtDeg(v) { return nf(v, 1) + '°'; }
function fmtCoord(p) {
  return Math.abs(p.lat).toFixed(2) + '°' + (p.lat >= 0 ? 'N' : 'S') + ' ' + Math.abs(p.lon).toFixed(2) + '°' + (p.lon >= 0 ? 'E' : 'W');
}

// «Olympus Mons», «18.4, 77.5» или «18.4°N 77.5°E»
export function parsePoint(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  const low = t.toLowerCase();
  let pl = PLACES.filter(function (p) { return p.name.toLowerCase() === low; })[0];
  if (!pl) {
    const m = PLACES.filter(function (p) { return p.name.toLowerCase().indexOf(low) === 0; });
    if (m.length === 1) pl = m[0];
  }
  if (pl) return { lon: pl.lon, lat: pl.lat, label: pl.name };
  const re = /([+-]?\d+(?:[.,]\d+)?)\s*°?\s*([NSEWnsew])?/g, found = [];
  let m;
  while ((m = re.exec(t)) !== null) found.push({ v: parseFloat(m[1].replace(',', '.')), c: (m[2] || '').toUpperCase() });
  if (found.length !== 2) return null;
  let lat, lon;
  if (found[0].c && found[1].c) {
    found.forEach(function (f) {
      if (f.c === 'N' || f.c === 'S') lat = f.c === 'S' ? -Math.abs(f.v) : f.v; else lon = f.c === 'W' ? -Math.abs(f.v) : f.v;
    });
  } else { lat = found[0].v; lon = found[1].v; }
  if (lat == null || lon == null || !isFinite(lat) || !isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lon: lon, lat: lat, label: fmtCoord({ lon: lon, lat: lat }) };
}

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function svg(tag, attrs) {
  const n = document.createElementNS(SVGNS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  return n;
}

// ---------- профиль высот ----------
function buildProfile(route) {
  const pts = route.points, W = 300, H = 124, L = 40, R = 8, T = 12, B = 22;
  const total = pts[pts.length - 1].d || 1;
  let mn = route.stats.minM, mx = route.stats.maxM;
  if (mx - mn < 50) { const c = (mx + mn) / 2; mn = c - 25; mx = c + 25; }
  const pad = (mx - mn) * 0.08; mn -= pad; mx += pad;
  const X = function (d) { return L + (d / total) * (W - L - R); };
  const Y = function (h) { return T + (1 - (h - mn) / (mx - mn)) * (H - T - B); };
  const root = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'rt-profile', role: 'img', 'aria-label': 'Elevation profile of the route' });
  let line = '';
  pts.forEach(function (p, i) { line += (i ? 'L' : 'M') + X(p.d).toFixed(1) + ' ' + Y(p.h).toFixed(1); });
  root.appendChild(svg('path', { d: line + 'L' + X(total).toFixed(1) + ' ' + (H - B) + 'L' + L + ' ' + (H - B) + 'Z', class: 'rt-area' }));
  root.appendChild(svg('path', { d: line, class: 'rt-line' }));
  const lab = function (x, y, anchor, txt) { const t = svg('text', { x: x, y: y, 'text-anchor': anchor, class: 'rt-axis' }); t.textContent = txt; root.appendChild(t); return t; };
  lab(L - 4, T + 4, 'end', fmtM(route.stats.maxM));
  lab(L - 4, H - B, 'end', fmtM(route.stats.minM));
  lab(L, H - 6, 'start', '0');
  lab(W - R, H - 6, 'end', fmtKm(total));
  root.appendChild(svg('circle', { cx: X(0), cy: Y(pts[0].h), r: 4, class: 'rt-dot-a' }));
  root.appendChild(svg('circle', { cx: X(total), cy: Y(pts[pts.length - 1].h), r: 4, class: 'rt-dot-b' }));
  // подсказка при наведении
  const guide = svg('line', { x1: 0, x2: 0, y1: T, y2: H - B, class: 'rt-guide', visibility: 'hidden' });
  const mark = svg('circle', { r: 3.5, class: 'rt-hover', visibility: 'hidden' });
  const tip = svg('text', { x: L + 4, y: T + 10, class: 'rt-tip' });
  root.appendChild(guide); root.appendChild(mark); root.appendChild(tip);
  function move(ev) {
    const r = root.getBoundingClientRect(), x = ((ev.clientX - r.left) / r.width) * W;
    const d = Math.max(0, Math.min(total, ((x - L) / (W - L - R)) * total));
    let lo = 0, hi = pts.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid].d < d) lo = mid; else hi = mid; }
    const p = pts[hi];
    guide.setAttribute('x1', X(p.d)); guide.setAttribute('x2', X(p.d)); guide.setAttribute('visibility', 'visible');
    mark.setAttribute('cx', X(p.d)); mark.setAttribute('cy', Y(p.h)); mark.setAttribute('visibility', 'visible');
    tip.textContent = fmtKm(p.d) + ' · ' + fmtM(p.h);
    tip.setAttribute('text-anchor', X(p.d) > W / 2 ? 'start' : 'end');
    tip.setAttribute('x', X(p.d) > W / 2 ? L + 4 : W - R - 4);
  }
  root.addEventListener('pointermove', move);
  root.addEventListener('pointerleave', function () { guide.setAttribute('visibility', 'hidden'); mark.setAttribute('visibility', 'hidden'); tip.textContent = ''; });
  return root;
}

/**
 * @param {object} deps
 * @param {HTMLElement} deps.host            <div id="route-body">
 * @param {function} deps.getTransitioning
 * @param {function} deps.pickMars           (clientX, clientY) → {lon, lat} | null
 * @param {function} deps.flyTo              (lon, lat, dist)
 * @param {function} deps.getMarsMat         материал планеты (uniform-ы маршрута)
 * @param {function} deps.markDirty
 * @param {function} deps.heightField        data/heightField.js
 * @param {number}   deps.tileSize           data/tiles.js → TS
 */
export function createRoutesSection({ host, getTransitioning, pickMars, flyTo, getMarsMat, markDirty, heightField, tileSize }) {
  if (!host) return null;

  const state = { a: null, b: null, mode: 'balanced', route: null, armed: null, seq: 0 };   // один режим: balanced

  // ---------- разметка ----------
  const form = el('div', 'rt-form');
  const inputs = {}, pins = {};
  function endpointRow(key, letter, placeholder) {
    const row = el('div', 'rt-row');
    row.appendChild(el('span', 'rt-badge rt-badge-' + key, letter));
    const inp = el('input', 'rt-input');
    inp.type = 'text'; inp.placeholder = placeholder; inp.setAttribute('list', 'rt-places');
    inp.setAttribute('autocomplete', 'off'); inp.setAttribute('spellcheck', 'false');
    inp.setAttribute('aria-label', key === 'a' ? 'Start point' : 'End point');
    const pin = el('button', 'rt-pin');
    pin.type = 'button'; pin.title = 'Pick on the map';
    pin.setAttribute('aria-label', key === 'a' ? 'Pick the start on the map' : 'Pick the end on the map');
    pin.setAttribute('aria-pressed', 'false');
    pin.innerHTML = '<svg viewBox="0 0 24 32" width="14" height="18" fill="currentColor" aria-hidden="true"><path d="M12 1C6 1 1.5 5.6 1.5 11.4 1.5 19 12 31 12 31s10.5-12 10.5-19.6C22.5 5.6 18 1 12 1zm0 15a4.6 4.6 0 1 1 0-9.2 4.6 4.6 0 0 1 0 9.2z"/></svg>';
    row.appendChild(inp); row.appendChild(pin);
    inputs[key] = inp; pins[key] = pin;
    return row;
  }
  const rows = el('div', 'rt-rows');
  rows.appendChild(endpointRow('a', 'A', 'Start: place or lat, lon'));
  rows.appendChild(endpointRow('b', 'B', 'End: place or lat, lon'));
  const swap = el('button', 'rt-swap');
  swap.type = 'button'; swap.title = 'Swap start and end'; swap.setAttribute('aria-label', 'Swap start and end');
  swap.innerHTML = '<svg viewBox="0 0 16 18" width="14" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 15V3M2 6l3-3 3 3M11 3v12M8 12l3 3 3-3"/></svg>';
  rows.appendChild(swap);
  form.appendChild(rows);
  const list = el('datalist'); list.id = 'rt-places';
  PLACES.forEach(function (p) { const o = el('option'); o.value = p.name; list.appendChild(o); });
  form.appendChild(list);

  const actions = el('div', 'rt-actions');
  const go = el('button', 'rt-go', 'Find route'); go.type = 'button';
  const clear = el('button', 'rt-clear', 'Clear'); clear.type = 'button';
  actions.appendChild(go); actions.appendChild(clear);
  form.appendChild(actions);

  const msg = el('p', 'rt-msg'); msg.setAttribute('role', 'status');
  const result = el('div', 'rt-result'); result.hidden = true;
  host.appendChild(form); host.appendChild(msg); host.appendChild(result);

  function say(text, kind) { msg.textContent = text || ''; msg.className = 'rt-msg' + (kind ? ' rt-' + kind : ''); msg.hidden = !text; }
  say('');

  // ---------- GPU: точки и линия на планете ----------
  function toVec(v, lon, lat) {
    const l = lon * D2R, p = lat * D2R;
    v.set(Math.cos(p) * Math.cos(l), Math.sin(p), Math.cos(p) * Math.sin(l));
  }
  function applyGpu() {
    const mat = getMarsMat && getMarsMat();
    if (!mat) return;
    const u = mat.uniforms;
    let n = 0;
    if (state.a) toVec(u.uRtA.value, state.a.lon, state.a.lat);
    if (state.b) toVec(u.uRtB.value, state.b.lon, state.b.lat);
    if (state.route) {
      const pts = state.route.points; n = Math.min(64, pts.length);
      let cx = 0, cy = 0, cz = 0;
      for (let i = 0; i < n; i++) {
        const p = pts[Math.round(i * (pts.length - 1) / (n - 1))];
        toVec(u.uRt.value[i], p.lon, p.lat);
        cx += u.uRt.value[i].x; cy += u.uRt.value[i].y; cz += u.uRt.value[i].z;
      }
      const len = Math.sqrt(cx * cx + cy * cy + cz * cz) || 1; cx /= len; cy /= len; cz /= len;
      let minDot = 1;
      for (let i = 0; i < n; i++) { const v = u.uRt.value[i]; minDot = Math.min(minDot, v.x * cx + v.y * cy + v.z * cz); }
      const ang = Math.min(3.0, Math.acos(Math.max(-1, Math.min(1, minDot))) + 0.1);
      u.uRtBound.value.set(cx, cy, cz, Math.cos(ang));
    }
    u.uRtInfo.value.set(state.a ? 1 : 0, state.b ? 1 : 0, n, 0);
    if (markDirty) markDirty();
  }

  // ---------- результат ----------
  function statRow(dl, k, v) { dl.appendChild(el('dt', null, k)); dl.appendChild(el('dd', null, v)); }
  function renderResult(r) {
    result.textContent = '';
    const s = r.stats, d = r.direct, diff = difficulty(s);
    const head = el('div', 'rt-head');
    head.appendChild(el('span', 'rt-len', fmtKm(s.lengthKm)));
    if (!r.flat) head.appendChild(el('span', 'rt-diff rt-diff-' + diff, diff));
    result.appendChild(head);
    const direct = d.lengthKm;
    const detour = direct > 0 ? (s.lengthKm / direct - 1) * 100 : 0;
    result.appendChild(el('p', 'rt-sub', 'Straight-line distance ' + fmtKm(direct) +
      (detour >= 0.5 ? ' (+' + nf(detour, 0) + '%)' : '')));
    if (r.flat) {
      result.appendChild(el('p', 'rt-note rt-warn', 'No elevation data could be read (Mars Trek tiles and assets/mars-height.png are unavailable), so the route is the shortest path and slopes are unknown.'));
      return;
    }
    const dl = el('dl', 'rt-stats');
    statRow(dl, 'Total ascent', fmtM(s.ascentM));
    statRow(dl, 'Total descent', fmtM(s.descentM));
    statRow(dl, 'Max slope', fmtDeg(s.maxSlopeDeg));
    statRow(dl, 'Average slope', fmtDeg(s.avgSlopeDeg));
    statRow(dl, 'Start elevation', fmtM(s.startM));
    statRow(dl, 'End elevation', fmtM(s.endM));
    statRow(dl, 'Highest point', fmtM(s.maxM));
    statRow(dl, 'Lowest point', fmtM(s.minM));
    result.appendChild(dl);
    result.appendChild(buildProfile(r));
    if (d.ascentM > s.ascentM * 1.15 + 20) {
      result.appendChild(el('p', 'rt-note', 'A straight line would climb ' + fmtM(d.ascentM) + ' with slopes up to ' + fmtDeg(d.maxSlopeDeg) + '. This route climbs ' +
        nf((1 - s.ascentM / Math.max(d.ascentM, 1)) * 100, 0) + '% less.'));
    }
    result.appendChild(el('p', 'rt-note rt-small', 'Elevation: ' + (SOURCES[r.source] || 'height map') + ', ≈ ' + nf(r.cellKm, 1) + ' km per pixel, so slopes are averaged over that distance. Elevations are above the Mars datum.'));
  }

  function clearRoute() {
    state.route = null; result.hidden = true; result.textContent = '';
    applyGpu();
  }

  // ---------- расчёт ----------
  function compute() {
    if (!state.a || !state.b) { say('Set both the start (A) and the end (B).', 'warn'); return Promise.resolve(); }
    if (greatCircleKm(state.a.lon, state.a.lat, state.b.lon, state.b.lat) < 0.5) { clearRoute(); say('The start and the end are the same place.', 'warn'); return Promise.resolve(); }
    const token = ++state.seq;
    go.disabled = true; go.textContent = 'Working…';
    say('Loading elevation data…');
    const a = state.a, b = unwrapEnd(state.a, state.b);
    let flat = false;
    return loadGrid(gridSpec(a, b, tileSize), heightField).catch(function (err) {
      if (typeof console !== 'undefined') console.error('[routes] elevation load failed', err);
      return null;
    }).then(function (grid) {
      if (token !== state.seq) return null;
      if (!grid) { clearRoute(); say('Could not load the elevation data.', 'warn'); return null; }
      flat = !grid.ok;
      say('Planning the route\u2026');
      return new Promise(function (res) { setTimeout(function () { res(grid); }, 0); });
    }).then(function (grid) {
      if (!grid || token !== state.seq) return;
      try {
        const r = planRoute(grid, a, b, { mode: state.mode, flat: flat });
        if (!r) { clearRoute(); say('No route found between these points.', 'warn'); return; }
        state.route = r;
        renderResult(r); result.hidden = false;
        say('');
        applyGpu();
        focusRoute(r);
      } catch (err) {
        if (typeof console !== 'undefined') console.error('[routes] planning failed', err);
        clearRoute(); say('Could not build the route: ' + (err && err.message ? err.message : err), 'warn');
      }
    }).then(function () {
      if (token === state.seq) { go.disabled = false; go.textContent = 'Find route'; }
    });
  }

  function focusRoute(r) {
    if (getTransitioning && getTransitioning()) return;
    const pts = r.points;
    let x = 0, y = 0, z = 0;
    pts.forEach(function (p) { const l = p.lon * D2R, f = p.lat * D2R; x += Math.cos(f) * Math.cos(l); y += Math.sin(f); z += Math.cos(f) * Math.sin(l); });
    const len = Math.sqrt(x * x + y * y + z * z) || 1; x /= len; y /= len; z /= len;
    let minDot = 1;
    pts.forEach(function (p) { const l = p.lon * D2R, f = p.lat * D2R; minDot = Math.min(minDot, Math.cos(f) * Math.cos(l) * x + Math.sin(f) * y + Math.cos(f) * Math.sin(l) * z); });
    const span = Math.acos(Math.max(-1, Math.min(1, minDot)));
    flyTo(Math.atan2(z, x) / D2R, Math.asin(Math.max(-1, Math.min(1, y))) / D2R, Math.max(1.5, Math.min(3.4, 1.45 + span * 3.0)));
  }

  // ---------- точки ----------
  function setPoint(key, p, label) {
    state[key] = p ? { lon: p.lon, lat: p.lat } : null;
    if (p) inputs[key].value = label || p.label || fmtCoord(p);
    inputs[key].removeAttribute('aria-invalid');
    clearRoute();
  }

  function readInput(key) {
    const text = inputs[key].value;
    if (!text.trim()) { state[key] = null; inputs[key].removeAttribute('aria-invalid'); clearRoute(); return false; }
    const p = parsePoint(text);
    if (!p) {
      state[key] = null; inputs[key].setAttribute('aria-invalid', 'true'); clearRoute();
      say('Couldn’t understand “' + text.trim() + '”. Use a place name or “lat, lon”, e.g. 18.4, 77.5.', 'warn');
      return false;
    }
    if (state[key] && state[key].lon === p.lon && state[key].lat === p.lat) return true;
    setPoint(key, p);
    if (p.label && p.label !== text) inputs[key].value = p.label;
    say('');
    return true;
  }

  // Изменение точки только сбрасывает старый маршрут; новый строится по кнопке «Find route» (или Enter в поле)
  function afterEdit() {
    applyGpu();
    if (state.a && state.b && !state.route) say('Press \u201CFind route\u201D to plan the route.');
  }

  ['a', 'b'].forEach(function (k) {
    inputs[k].addEventListener('change', function () { if (readInput(k)) afterEdit(); });
    inputs[k].addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); if (readInput(k)) { if (state.a && state.b) compute(); } }
    });
    pins[k].addEventListener('click', function () { arm(state.armed === k ? null : k); });
  });

  swap.addEventListener('click', function () {
    const a = state.a, b = state.b, ta = inputs.a.value, tb = inputs.b.value;
    state.a = b; state.b = a; inputs.a.value = tb; inputs.b.value = ta;
    clearRoute(); say('');
    afterEdit();
  });

  go.addEventListener('click', function () { readInput('a'); readInput('b'); if (state.a && state.b) compute(); else if (!msg.textContent) say('Set both the start (A) and the end (B).', 'warn'); });
  clear.addEventListener('click', function () {
    state.seq++; arm(null);
    state.a = null; state.b = null; inputs.a.value = ''; inputs.b.value = '';
    inputs.a.removeAttribute('aria-invalid'); inputs.b.removeAttribute('aria-invalid');
    go.disabled = false; go.textContent = 'Find route';
    clearRoute(); say('');
  });

  // ---------- выбор точки кликом по карте ----------
  function arm(key) {
    state.armed = key;
    ['a', 'b'].forEach(function (k) { pins[k].setAttribute('aria-pressed', k === key ? 'true' : 'false'); });
    document.body.classList.toggle('rt-picking', !!key);
    if (key) say('Click on the planet to set the ' + (key === 'a' ? 'start (A)' : 'end (B)') + '. Esc to cancel.');
    else if (msg.textContent.indexOf('Click on the planet') === 0) say('');
  }
  let down = null;
  window.addEventListener('pointerdown', function (e) { down = { x: e.clientX, y: e.clientY }; }, true);
  window.addEventListener('pointerup', function (e) {
    if (!state.armed || !down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > 6 || (getTransitioning && getTransitioning())) return;
    if (e.target && e.target.closest && e.target.closest('button, input, select, aside, .place-info, .mu-tools, .zoom, .pop')) return;
    const p = pickMars(e.clientX, e.clientY);
    if (!p) return;
    const key = state.armed;
    arm(null);
    setPoint(key, p, fmtCoord(p));
    say('');
    afterEdit();
  }, true);
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state.armed) arm(null); });

  return { id: 'routes', host, state, compute, clear: function () { clear.click(); } };
}
