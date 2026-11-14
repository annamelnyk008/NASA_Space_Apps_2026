// markers/flags.js — флажки на карте Марса.
//  • «посещённый» флажок ставится автоматически, когда игрок побывал на поверхности (surface);
//  • домашний флажок (розовый) — это бывший Home, теперь точечный: одна точка вместо сектора 1°.
// Клик по флажку открывает карточку: координаты, высота, температура, местное время,
// ближайшее известное место, расстояние до дома. Из карточки можно сделать точку домом,
// снова приземлиться или удалить флажок.
// Стили встроены (см. STYLE ниже), HTML-разметка создаётся из JS — index.html менять не нужно.

import { THREE } from '../core/three.js';
import { D2R } from '../config.js';
import { fmtClock, fmtLonLatPrecise, fmtSigned } from '../lib/format.js';
import { wrap180 } from '../lib/math.js';
import { PLACES } from './places.js';

const KEY = 'marsFlags1';
const MAX_FLAGS = 60;
const SAME_DEG = 0.05;      // посещения ближе этого считаются одной точкой
const R_MARS_KM = 3389.5;
const NEAR_KM = 1500;       // дальше — «ближайшее место» не показываем

const STYLE = `
.mf-root{position:fixed;inset:0;z-index:30;pointer-events:none;overflow:hidden}
.mf-root[hidden]{display:none}
.mf{position:absolute;left:0;top:0;width:0;height:0;will-change:transform;--c:#ffb347}
.mf.home{--c:#ff40d0}
.mf-btn{position:absolute;left:-5px;top:-31px;width:30px;height:32px;padding:0;border:0;background:none;
  cursor:pointer;pointer-events:auto;-webkit-tap-highlight-color:transparent}
.mf-btn svg{display:block;width:30px;height:32px;overflow:visible;filter:drop-shadow(0 1px 2px rgba(0,0,0,.65));
  transform-origin:5px 31px;transition:transform .15s}
.mf-btn:hover svg,.mf.sel .mf-btn svg{transform:scale(1.18)}
.mf.sel .mf-btn svg{filter:drop-shadow(0 0 6px var(--c)) drop-shadow(0 1px 2px rgba(0,0,0,.65))}
.mf-btn:focus-visible{outline:2px solid var(--c);outline-offset:2px;border-radius:4px}
.mf-card{position:absolute;left:0;top:0;width:236px;box-sizing:border-box;padding:12px 14px 12px;
  color:#f4ece6;font:12px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;pointer-events:auto;
  background:rgba(20,13,11,.92);border:1px solid rgba(255,255,255,.14);border-radius:10px;
  box-shadow:0 8px 28px rgba(0,0,0,.5);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);--c:#ffb347}
.mf-card.home{--c:#ff40d0}
.mf-card[hidden]{display:none}
.mf-head{display:flex;align-items:flex-start;gap:8px;margin-bottom:8px}
.mf-dot{flex:none;width:9px;height:9px;margin-top:4px;border-radius:50%;background:var(--c);box-shadow:0 0 8px var(--c)}
.mf-ttl{flex:1;min-width:0;font-size:13.5px;font-weight:600;letter-spacing:.01em}
.mf-sub{display:block;margin-top:1px;font-size:11px;font-weight:400;color:rgba(244,236,230,.6)}
.mf-x{flex:none;margin:-4px -6px 0 0;width:24px;height:24px;border:0;border-radius:6px;background:none;
  color:rgba(244,236,230,.6);font-size:16px;line-height:1;cursor:pointer}
.mf-x:hover{background:rgba(255,255,255,.1);color:#fff}
.mf-rows{display:grid;grid-template-columns:auto 1fr;gap:3px 12px;margin:0}
.mf-rows dt{color:rgba(244,236,230,.55)}
.mf-rows dd{margin:0;text-align:right;font-variant-numeric:tabular-nums}
.mf-rows .off{display:none}
.mf-act{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.mf-act button{flex:1 1 auto;padding:6px 9px;border-radius:7px;border:1px solid rgba(255,255,255,.18);
  background:rgba(255,255,255,.06);color:inherit;font:inherit;cursor:pointer}
.mf-act button:hover{background:rgba(255,255,255,.14)}
.mf-act button.pri{border-color:var(--c);color:var(--c)}
.mf-act button[hidden]{display:none}
`;

function haversineKm(lon1, lat1, lon2, lat2) {
  const p1 = lat1 * D2R;
  const p2 = lat2 * D2R;
  const dp = p2 - p1;
  const dl = (lon2 - lon1) * D2R;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R_MARS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

function nearestPlace(lon, lat) {
  let best = null;
  for (let i = 0; i < PLACES.length; i++) {
    const p = PLACES[i];
    const d = haversineKm(lon, lat, p.lon, p.lat);
    if (!best || d < best.d) best = { name: p.name, d };
  }
  return best && best.d <= NEAR_KM ? best : null;
}

function fmtDist(km) {
  return km < 10 ? km.toFixed(1) + ' km' : Math.round(km).toLocaleString('en-US') + ' km';
}

function fmtDate(t) {
  try {
    return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (e) {
    return '';
  }
}

function flagSvg() {
  return (
    '<svg viewBox="0 0 30 32" aria-hidden="true">' +
    '<line x1="5" y1="3" x2="5" y2="31" stroke="#f4ece6" stroke-width="2" stroke-linecap="round"/>' +
    '<path d="M5.8 4 L26 9.2 L5.8 16 Z" fill="var(--c)" stroke="rgba(0,0,0,.35)" stroke-width=".8" stroke-linejoin="round"/>' +
    '<circle cx="5" cy="31" r="2.2" fill="var(--c)" stroke="rgba(0,0,0,.45)" stroke-width=".8"/>' +
    '</svg>'
  );
}

/**
 * @param {object} deps
 * @param {function} deps.getMode
 * @param {function} deps.getMarsCam
 * @param {function} deps.getMarsSpin
 * @param {function} deps.getFlatOn
 * @param {function} deps.getFl
 * @param {function} deps.getSunInfo
 * @param {function} deps.siteHeightKm      (lon, lat) → км | null
 * @param {function} deps.getHomeApi        → результат createHome
 * @param {function} deps.dropExplorer      (lon, lat)
 * @param {function} deps.getTransitioning
 * @param {HTMLCanvasElement} deps.canvas   canvas рендерера — клик по нему закрывает карточку
 * @param {function} [deps.onDirty]
 */
export function createFlags(deps) {
  const {
    getMode,
    getMarsCam,
    getMarsSpin,
    getFlatOn,
    getFl,
    getSunInfo,
    siteHeightKm,
    getHomeApi,
    dropExplorer,
    getTransitioning,
    canvas,
    onDirty
  } = deps;

  // ---- состояние ----
  let visits = []; // { id, lon, lat, t, n }
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (Array.isArray(raw)) {
      visits = raw
        .filter((f) => f && isFinite(f.lon) && isFinite(f.lat))
        .map((f) => ({
          id: String(f.id || Math.random().toString(36).slice(2)),
          lon: +f.lon,
          lat: +f.lat,
          t: +f.t || Date.now(),
          n: Math.max(1, +f.n || 1)
        }));
    }
  } catch (e) { /* ignore */ }

  function saveVisits() {
    try {
      localStorage.setItem(KEY, JSON.stringify(visits));
    } catch (e) { /* ignore */ }
  }

  // ---- DOM ----
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.className = 'mf-root';
  root.hidden = true;
  document.body.appendChild(root);

  const card = document.createElement('div');
  card.className = 'mf-card';
  card.hidden = true;
  card.setAttribute('role', 'dialog');
  card.innerHTML =
    '<div class="mf-head"><i class="mf-dot"></i>' +
    '<div class="mf-ttl"><span class="mf-name"></span><span class="mf-sub"></span></div>' +
    '<button type="button" class="mf-x" aria-label="Close">×</button></div>' +
    '<dl class="mf-rows">' +
    '<dt>Coordinates</dt><dd data-r="coord"></dd>' +
    '<dt>Elevation</dt><dd data-r="elev"></dd>' +
    '<dt>Temperature now</dt><dd data-r="temp"></dd>' +
    '<dt>Local solar time</dt><dd data-r="time"></dd>' +
    '<dt>From home</dt><dd data-r="home"></dd>' +
    '<dt>Visits</dt><dd data-r="visit"></dd>' +
    '</dl>' +
    '<div class="mf-act">' +
    '<button type="button" data-a="home" class="pri"></button>' +
    '<button type="button" data-a="land">Land here</button>' +
    '<button type="button" data-a="del">Remove flag</button>' +
    '</div>';
  root.appendChild(card);

  const q = (s) => card.querySelector(s);
  const elName = q('.mf-name');
  const elSub = q('.mf-sub');
  const rowEls = {};
  card.querySelectorAll('[data-r]').forEach((dd) => {
    rowEls[dd.getAttribute('data-r')] = { dd, dt: dd.previousElementSibling };
  });
  const btnHomeAct = q('[data-a="home"]');
  const btnLand = q('[data-a="land"]');
  const btnDel = q('[data-a="del"]');

  // элементы флажков: key → { key, kind, id, lon, lat, el, vis }
  const items = new Map();
  let sig = '';
  let selKey = null;
  let cardT = 0;
  let rootShown = false;

  // ---- синхронизация набора флажков ----
  function desired() {
    const homeApi = getHomeApi();
    const home = homeApi ? homeApi.getHome() : null;
    const list = [];
    for (let i = 0; i < visits.length; i++) {
      const v = visits[i];
      // посещённая точка, совпавшая с домом, рисуется одним (домашним) флажком
      if (home && Math.abs(wrap180(v.lon - home.lon)) <= SAME_DEG && Math.abs(v.lat - home.lat) <= SAME_DEG) continue;
      list.push({ key: 'v:' + v.id, kind: 'visit', id: v.id, lon: v.lon, lat: v.lat });
    }
    if (home) list.push({ key: 'home', kind: 'home', id: 'home', lon: home.lon, lat: home.lat });
    return list;
  }

  function makeEl(it) {
    const el = document.createElement('div');
    el.className = 'mf ' + (it.kind === 'home' ? 'home' : 'visit');
    el.style.visibility = 'hidden';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mf-btn';
    b.setAttribute('aria-label', it.kind === 'home' ? 'Home flag' : 'Visited place flag');
    b.innerHTML = flagSvg();
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      select(selKey === it.key ? null : it.key);
    });
    el.appendChild(b);
    root.appendChild(el);
    return el;
  }

  function refresh() {
    const list = desired();
    const s = list.map((i) => i.key + '@' + i.lon + ',' + i.lat).join('|');
    if (s === sig) return;
    sig = s;
    const keep = new Set();
    list.forEach((d) => {
      keep.add(d.key);
      let it = items.get(d.key);
      if (!it) {
        it = { key: d.key, kind: d.kind, id: d.id, el: null, vis: null };
        it.el = makeEl(it);
        items.set(d.key, it);
      }
      it.lon = d.lon;
      it.lat = d.lat;
    });
    items.forEach((it, key) => {
      if (!keep.has(key)) {
        it.el.remove();
        items.delete(key);
      }
    });
    if (selKey && !items.has(selKey)) select(null);
    else if (selKey) fillCard();
    if (onDirty) onDirty();
  }

  // ---- карточка ----
  function visitNear(lon, lat) {
    for (let i = 0; i < visits.length; i++) {
      const v = visits[i];
      if (Math.abs(wrap180(v.lon - lon)) <= SAME_DEG && Math.abs(v.lat - lat) <= SAME_DEG) return v;
    }
    return null;
  }

  function setRow(name, text) {
    const r = rowEls[name];
    const on = text !== null && text !== '';
    r.dd.classList.toggle('off', !on);
    r.dt.classList.toggle('off', !on);
    if (on) r.dd.textContent = text;
  }

  function fillCard() {
    const it = selKey ? items.get(selKey) : null;
    if (!it) return;
    const homeApi = getHomeApi();
    const isHome = it.kind === 'home';
    card.classList.toggle('home', isHome);
    const v = visitNear(it.lon, it.lat);
    const np = nearestPlace(it.lon, it.lat);
    elName.textContent = isHome ? 'Home flag' : 'Visited place';
    elSub.textContent = np ? (np.d < 40 ? 'At ' : '≈ ' + fmtDist(np.d) + ' from ') + np.name : 'Uncharted terrain';

    setRow('coord', fmtLonLatPrecise(it.lon, it.lat, 3));
    const h = siteHeightKm(it.lon, it.lat);
    setRow('elev', h === null ? '…' : fmtSigned(h, 2) + ' km');
    setRow('temp', homeApi ? '≈ ' + fmtSigned(homeApi.pointTemp(it.lon, it.lat), 0) + ' °C' : null);
    const si = getSunInfo();
    if (si) {
      let ltst = (12 + (it.lon - si.lonE) / 15) % 24;
      if (ltst < 0) ltst += 24;
      setRow('time', fmtClock(ltst) + (ltst > 6 && ltst < 18 ? ' · day' : ' · night'));
    } else setRow('time', null);

    const home = homeApi ? homeApi.getHome() : null;
    setRow('home', home && !isHome ? fmtDist(haversineKm(it.lon, it.lat, home.lon, home.lat)) : null);
    setRow('visit', v ? (v.n > 1 ? v.n + '× · last ' : '') + fmtDate(v.t) : isHome ? 'not visited yet' : null);

    btnHomeAct.textContent = isHome ? 'Remove home' : 'Make home';
    btnDel.hidden = isHome; // домашний флажок снимается кнопкой «Remove home»
    btnLand.hidden = false;
  }

  function select(key) {
    selKey = key && items.has(key) ? key : null;
    items.forEach((it) => it.el.classList.toggle('sel', it.key === selKey));
    card.hidden = !selKey;
    cardT = 0;
    if (selKey) fillCard();
    if (onDirty) onDirty();
  }

  card.querySelector('.mf-x').addEventListener('click', () => select(null));
  canvas.addEventListener('click', function () {
    if (selKey) select(null);
  });
  // Esc сначала закрывает карточку (capture — раньше обработчика «назад» в input.js)
  window.addEventListener(
    'keydown',
    function (e) {
      if (e.key === 'Escape' && selKey && getMode() === 'mars') {
        e.stopPropagation();
        select(null);
      }
    },
    true
  );

  btnHomeAct.addEventListener('click', function () {
    const it = selKey ? items.get(selKey) : null;
    const homeApi = getHomeApi();
    if (!it || !homeApi) return;
    if (it.kind === 'home') {
      homeApi.clearHome();
      select(null);
    } else {
      const lon = it.lon;
      const lat = it.lat;
      select(null);
      homeApi.setHome(lon, lat); // → onHomeChange → refresh(): флажок станет домашним
    }
  });

  btnLand.addEventListener('click', function () {
    const it = selKey ? items.get(selKey) : null;
    if (!it || getTransitioning() || getMode() !== 'mars') return;
    const lon = it.lon;
    const lat = it.lat;
    select(null);
    dropExplorer(lon, lat);
  });

  btnDel.addEventListener('click', function () {
    const it = selKey ? items.get(selKey) : null;
    if (!it || it.kind !== 'visit') return;
    visits = visits.filter((v) => v.id !== it.id);
    saveVisits();
    select(null);
    refresh();
  });

  // ---- посещения ----
  /** Вызывается, когда игрок побывал на поверхности в точке (градусы, восток +). */
  function addVisit(lonDeg, latDeg) {
    const lon = Math.round(wrap180(lonDeg) * 1000) / 1000;
    const lat = Math.round(latDeg * 1000) / 1000;
    const same = visitNear(lon, lat);
    if (same) {
      same.n++;
      same.t = Date.now();
    } else {
      visits.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        lon,
        lat,
        t: Date.now(),
        n: 1
      });
      if (visits.length > MAX_FLAGS) visits.shift();
    }
    saveVisits();
    sig = ''; // принудительно пересобрать
    refresh();
  }

  // ---- проекция на экран (каждый кадр) ----
  const V = new THREE.Vector3();
  const C = new THREE.Vector3();

  function project(lon, lat, out) {
    const marsCam = getMarsCam();
    if (!marsCam) return false;
    let facing = true;
    if (getFlatOn()) {
      const fl = getFl();
      let px = lon / 90;
      const c0 = fl.lon / 90;
      while (px - c0 > 2) px -= 4;
      while (px - c0 < -2) px += 4;
      V.set(px, lat / 90, 0);
    } else {
      const lo = lon * D2R;
      const la = lat * D2R;
      V.set(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo));
      getMarsSpin().localToWorld(V);
      C.copy(marsCam.position).sub(V);
      facing = V.dot(C) > 0;
    }
    if (!facing) return false;
    V.project(marsCam);
    if (V.z > 1) return false;
    out.x = (V.x * 0.5 + 0.5) * window.innerWidth;
    out.y = (-V.y * 0.5 + 0.5) * window.innerHeight;
    return true;
  }

  const P = { x: 0, y: 0 };

  function showRoot(on) {
    if (on === rootShown) return;
    rootShown = on;
    root.hidden = !on;
  }

  function update(dt) {
    if (getMode() !== 'mars') {
      hide();
      return;
    }
    showRoot(true);
    refresh();
    const W = window.innerWidth;
    const H = window.innerHeight;
    let selVisible = false;
    items.forEach((it) => {
      const ok = project(it.lon, it.lat, P) && P.x > -40 && P.x < W + 40 && P.y > -40 && P.y < H + 80;
      if (ok !== it.vis) {
        it.vis = ok;
        it.el.style.visibility = ok ? 'visible' : 'hidden';
      }
      if (!ok) return;
      it.el.style.transform = 'translate3d(' + P.x.toFixed(1) + 'px,' + P.y.toFixed(1) + 'px,0)';
      if (it.key === selKey) {
        selVisible = true;
        placeCard(P.x, P.y, W, H);
      }
    });
    card.style.visibility = selKey && selVisible ? 'visible' : 'hidden';
    if (selKey) {
      cardT -= dt || 0.016;
      if (cardT <= 0) {
        cardT = 1; // температура и время меняются — освежаем раз в секунду
        fillCard();
      }
    }
  }

  function placeCard(x, y, W, H) {
    const cw = card.offsetWidth || 236;
    const ch = card.offsetHeight || 230;
    const left = x + 26 + cw > W - 8 ? x - cw - 22 : x + 26;
    const top = Math.max(8, Math.min(H - 8 - ch, y - ch * 0.5 - 18));
    card.style.transform = 'translate3d(' + left.toFixed(1) + 'px,' + top.toFixed(1) + 'px,0)';
  }

  function hide() {
    if (selKey) select(null);
    showRoot(false);
  }

  return {
    addVisit,
    refresh,
    update,
    hide,
    select,
    getVisits: () => visits.slice()
  };
}
