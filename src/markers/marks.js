// markers/marks.js — метки на карте Марса и режим «Mark».
//  • Режим Mark (кнопка #btn-mark): пока он включён, клик по планете/карте ставит метку в любом месте;
//    повторное нажатие кнопки или Esc выходят из режима.
//  • Метка «visit» создаётся сама, когда игрок побывал на поверхности (surface).
//  • Домашняя точка (mars/home.js) тоже рисуется пином — розовым; её можно назначить из карточки любой метки.
// Клик по пину открывает карточку: название (можно переименовать), координаты, высота, температура,
// местное время, ближайшее известное место, расстояние до дома. Из карточки: сделать домом,
// приземлиться, удалить. Разметка создаётся здесь, стили — styles/markers/marks.css.

import { THREE } from '../core/three.js';
import { D2R } from '../config.js';
import { fmtClock, fmtLonLatPrecise, fmtSigned } from '../lib/format.js';
import { wrap180 } from '../lib/math.js';
import { PLACES } from './places.js';

const KEY = 'marsMarks1';
const OLD_KEY = 'marsFlags1';   // прежний формат (только посещения) — подхватываем один раз
const MAX_MARKS = 200;
const SAME_DEG = 0.05;          // метки ближе этого считаются одной точкой
const R_MARS_KM = 3389.5;
const NEAR_KM = 1500;           // дальше — «ближайшее место» не показываем
const DRAG_PX = 6;

const HINT_ARMED = 'Mark mode: click anywhere to drop a mark · click a mark for details · press Mark or Esc to finish';

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

const SVG_NS = 'http://www.w3.org/2000/svg';

// тот же силуэт, что у .lp-pin в index.html, но цвета берутся из --pin / --pin-in
function pinSvg() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 34');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M12 1C5.9 1 1 5.8 1 11.8 1 20 12 33 12 33s11-13 11-21.2C23 5.8 18.1 1 12 1z');
  path.setAttribute('fill', 'var(--pin)');
  path.setAttribute('stroke', '#fff');
  path.setAttribute('stroke-width', '1.6');
  const dot = document.createElementNS(SVG_NS, 'circle');
  dot.setAttribute('cx', '12');
  dot.setAttribute('cy', '11.8');
  dot.setAttribute('r', '4.3');
  dot.setAttribute('fill', 'var(--pin-in)');
  svg.appendChild(path);
  svg.appendChild(dot);
  return svg;
}

/**
 * @param {object} deps
 */
export function createMarks(deps) {
  const {
    btnMark,
    marsHint,
    getMarsHintText,
    getMode,
    getTransitioning,
    getMarsMat,
    getGridOn,
    getMarsCam,
    getMarsSpin,
    getFlatOn,
    getFl,
    getSunInfo,
    siteHeightKm,
    getHomeApi,
    pickMars,
    dropExplorer,
    renderer,
    getPegArmed,
    setPegArmed,
    onDirty
  } = deps;

  const canvas = renderer.domElement;

  // ---- состояние ----
  // { id, kind: 'mark' | 'visit', lon, lat, t, n (число визитов), name }
  let marks = [];
  try {
    let raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!Array.isArray(raw)) {
      const old = JSON.parse(localStorage.getItem(OLD_KEY) || '[]');
      raw = Array.isArray(old) ? old.map((f) => Object.assign({}, f, { kind: 'visit' })) : [];
    }
    marks = raw
      .filter((m) => m && isFinite(m.lon) && isFinite(m.lat))
      .map((m) => ({
        id: String(m.id || Math.random().toString(36).slice(2)),
        kind: m.kind === 'visit' ? 'visit' : 'mark',
        lon: +m.lon,
        lat: +m.lat,
        t: +m.t || Date.now(),
        n: Math.max(0, +m.n || 0),
        name: typeof m.name === 'string' ? m.name.slice(0, 32) : ''
      }));
  } catch (e) { /* ignore */ }

  let armed = false;
  let selKey = null;
  let sig = '';
  let cardT = 0;
  let rootShown = false;
  const listeners = [];
  const items = new Map(); // key → { key, kind, id, lon, lat, el, vis }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(marks));
    } catch (e) { /* ignore */ }
  }
  function emit() {
    listeners.forEach((f) => f());
  }
  function defaultName(m) {
    if (m.kind === 'visit') return 'Landing site';
    let max = 0;
    marks.forEach((x) => {
      const r = /^Mark (\d+)$/.exec(x.name);
      if (r) max = Math.max(max, +r[1]);
    });
    return 'Mark ' + (max + 1);
  }
  const markName = (m) => m.name || (m.kind === 'visit' ? 'Landing site' : 'Mark');

  // ---- DOM ----
  const root = document.createElement('div');
  root.className = 'mk-root';
  root.hidden = true;
  document.body.appendChild(root);

  const card = document.createElement('div');
  card.className = 'mk-card';
  card.hidden = true;
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'Mark details');
  card.innerHTML =
    '<div class="mk-head"><i class="mk-dot"></i>' +
    '<div class="mk-ttl"><input class="mk-name" type="text" maxlength="32" spellcheck="false" aria-label="Mark name">' +
    '<p class="mk-sub"></p></div>' +
    '<button type="button" class="mk-x" aria-label="Close">&times;</button></div>' +
    '<dl class="mk-rows">' +
    '<dt>Coordinates</dt><dd data-r="coord"></dd>' +
    '<dt>Elevation</dt><dd data-r="elev"></dd>' +
    '<dt>Temperature now</dt><dd data-r="temp"></dd>' +
    '<dt>Local solar time</dt><dd data-r="time"></dd>' +
    '<dt>From home</dt><dd data-r="home"></dd>' +
    '<dt>Visits</dt><dd data-r="visit"></dd>' +
    '<dt>Placed</dt><dd data-r="placed"></dd>' +
    '</dl>' +
    '<div class="mk-btns">' +
    '<button type="button" class="chip lp-go" data-a="land">Land here</button>' +
    '<button type="button" class="chip mk-home-btn" data-a="home" aria-pressed="false">Home</button>' +
    '<button type="button" class="chip" data-a="del">Delete</button>' +
    '</div>';
  root.appendChild(card);

  const q = (s) => card.querySelector(s);
  const elName = q('.mk-name');
  const elSub = q('.mk-sub');
  const rowEls = {};
  card.querySelectorAll('[data-r]').forEach((dd) => {
    rowEls[dd.getAttribute('data-r')] = { dd, dt: dd.previousElementSibling };
  });
  const btnLand = q('[data-a="land"]');
  const btnHomeAct = q('[data-a="home"]');
  const btnDel = q('[data-a="del"]');

  // ---- набор пинов ----
  function desired() {
    const homeApi = getHomeApi();
    const home = homeApi ? homeApi.getHome() : null;
    const list = [];
    for (let i = 0; i < marks.length; i++) {
      const m = marks[i];
      // метка, совпавшая с домом, рисуется одним (домашним) пином
      if (home && Math.abs(wrap180(m.lon - home.lon)) <= SAME_DEG && Math.abs(m.lat - home.lat) <= SAME_DEG) continue;
      list.push({ key: 'm:' + m.id, kind: m.kind, id: m.id, lon: m.lon, lat: m.lat });
    }
    if (home) list.push({ key: 'home', kind: 'home', id: 'home', lon: home.lon, lat: home.lat });
    return list;
  }

  function makeEl(it) {
    const el = document.createElement('div');
    el.className = 'mk ' + it.kind;
    el.style.visibility = 'hidden';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mk-btn';
    b.setAttribute('aria-label', it.kind === 'home' ? 'Home mark' : 'Mark');
    b.appendChild(pinSvg());
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
    emit();
  }

  // ---- карточка ----
  function markNear(lon, lat) {
    for (let i = 0; i < marks.length; i++) {
      const m = marks[i];
      if (Math.abs(wrap180(m.lon - lon)) <= SAME_DEG && Math.abs(m.lat - lat) <= SAME_DEG) return m;
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
    const m = markNear(it.lon, it.lat);
    card.classList.remove('visit', 'home');
    if (isHome) card.classList.add('home');
    else if (it.kind === 'visit') card.classList.add('visit');

    if (document.activeElement !== elName) elName.value = isHome ? 'Home' : markName(m || {});
    elName.readOnly = isHome;
    const np = nearestPlace(it.lon, it.lat);
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
    const n = m ? m.n : 0;
    setRow('visit', n > 0 ? (n > 1 ? n + '× · last ' : '') + fmtDate(m.t) : isHome ? 'not visited yet' : null);
    setRow('placed', m && n === 0 ? fmtDate(m.t) : null);

    btnHomeAct.setAttribute('aria-pressed', String(isHome));
    btnHomeAct.classList.toggle('mu-home', isHome);
    btnHomeAct.textContent = isHome ? 'Home ✓' : 'Make home';
    btnDel.hidden = false;
  }

  function select(key) {
    selKey = key && items.has(key) ? key : null;
    items.forEach((it) => it.el.classList.toggle('sel', it.key === selKey));
    card.hidden = !selKey;
    cardT = 0;
    if (selKey) fillCard();
    if (onDirty) onDirty();
  }

  q('.mk-x').addEventListener('click', () => select(null));

  // переименование: Enter/потеря фокуса сохраняют, Esc откатывает и закрывает
  elName.addEventListener('keydown', function (e) {
    e.stopPropagation(); // чтобы «+», «g» и т.п. не управляли картой, пока печатаем
    if (e.key === 'Enter') elName.blur();
    else if (e.key === 'Escape') {
      elName.value = '';
      elName.blur();
      select(null);
    }
  });
  elName.addEventListener('change', function () {
    const it = selKey ? items.get(selKey) : null;
    if (!it || it.kind === 'home') return;
    const m = marks.find((x) => x.id === it.id);
    if (!m) return;
    m.name = elName.value.trim().slice(0, 32);
    save();
    fillCard();
    emit();
  });
  elName.addEventListener('blur', function () {
    if (selKey) fillCard();
  });

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
      homeApi.setHome(lon, lat); // → onHomeChange → refresh(): пин станет домашним
    }
  });

  btnLand.addEventListener('click', function () {
    const it = selKey ? items.get(selKey) : null;
    if (!it || getTransitioning() || getMode() !== 'mars') return;
    const lon = it.lon;
    const lat = it.lat;
    select(null);
    setArmed(false);
    dropExplorer(lon, lat);
  });

  btnDel.addEventListener('click', function () {
    const it = selKey ? items.get(selKey) : null;
    if (!it) return;
    if (it.kind === 'home') {
      // домашний пин: убираем и сам дом, и метку под ним, иначе после «Delete» пин остался бы на месте
      const lon = it.lon;
      const lat = it.lat;
      marks = marks.filter(
        (m) => !(Math.abs(wrap180(m.lon - lon)) <= SAME_DEG && Math.abs(m.lat - lat) <= SAME_DEG)
      );
      save();
      select(null);
      const homeApi = getHomeApi();
      if (homeApi) homeApi.clearHome(); // → onHomeChange → refresh()
      sig = '';
      refresh();
      return;
    }
    marks = marks.filter((m) => m.id !== it.id);
    save();
    select(null);
    sig = '';
    refresh();
  });

  // ---- режим Mark ----
  function setArmed(on) {
    on = !!on;
    if (on === armed) return;
    armed = on;
    btnMark.setAttribute('aria-pressed', String(on));
    if (on && getPegArmed()) setPegArmed(false);
    if (marsHint) marsHint.textContent = on ? HINT_ARMED : getMarsHintText();
    const marsMat = getMarsMat();
    if (marsMat) marsMat.uniforms.uGrid.value = (on || getGridOn()) ? 1 : 0;
    if (getMode() === 'mars') canvas.style.cursor = on ? 'crosshair' : 'grab';
    if (onDirty) onDirty();
  }

  btnMark.addEventListener('click', function () {
    if (getMode() === 'mars' && !getTransitioning()) setArmed(!armed);
  });

  // Esc: сначала закрываем карточку, потом выходим из режима (capture — раньше обработчика «назад» в input.js)
  window.addEventListener(
    'keydown',
    function (e) {
      if (e.key !== 'Escape' || getMode() !== 'mars') return;
      if (selKey) {
        e.stopPropagation();
        select(null);
      } else if (armed) {
        e.stopPropagation();
        setArmed(false);
      }
    },
    true
  );

  const down = { x: 0, y: 0 };
  canvas.addEventListener('pointerdown', function (e) {
    down.x = e.clientX;
    down.y = e.clientY;
  });
  canvas.addEventListener('click', function (e) {
    if (getMode() !== 'mars') return;
    if (selKey) select(null);
    if (!armed || getTransitioning()) return;
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > DRAG_PX) return;
    const hit = pickMars(e.clientX, e.clientY);
    if (hit) addMark(hit.lon, hit.lat);
  });

  // ---- добавление ----
  function round3(v) {
    return Math.round(v * 1000) / 1000;
  }

  /** Поставить свою метку (градусы, восток +). Возвращает метку. */
  function addMark(lonDeg, latDeg) {
    const lon = round3(wrap180(lonDeg));
    const lat = round3(Math.max(-89.9, Math.min(89.9, latDeg)));
    const same = markNear(lon, lat);
    if (same) return same;
    const m = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      kind: 'mark',
      lon,
      lat,
      t: Date.now(),
      n: 0,
      name: ''
    };
    m.name = defaultName(m);
    marks.push(m);
    if (marks.length > MAX_MARKS) marks.shift();
    save();
    sig = '';
    refresh();
    return m;
  }

  /** Вызывается, когда игрок побывал на поверхности в точке (градусы, восток +). */
  function addVisit(lonDeg, latDeg) {
    const lon = round3(wrap180(lonDeg));
    const lat = round3(latDeg);
    const same = markNear(lon, lat);
    if (same) {
      same.n++;
      same.t = Date.now();
    } else {
      marks.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        kind: 'visit',
        lon,
        lat,
        t: Date.now(),
        n: 1,
        name: 'Landing site'
      });
      if (marks.length > MAX_MARKS) marks.shift();
    }
    save();
    sig = '';
    refresh();
  }

  // ---- проекция на экран (каждый кадр) ----
  const V = new THREE.Vector3();
  const C = new THREE.Vector3();
  const P = { x: 0, y: 0 };

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

  function showRoot(on) {
    if (on === rootShown) return;
    rootShown = on;
    root.hidden = !on;
  }

  function placeCard(x, y, W, H) {
    const cw = card.offsetWidth || 244;
    const ch = card.offsetHeight || 250;
    const left = x + 26 + cw > W - 8 ? x - cw - 22 : x + 26;
    const top = Math.max(8, Math.min(H - 8 - ch, y - ch * 0.5 - 18));
    card.style.transform = 'translate3d(' + left.toFixed(1) + 'px,' + top.toFixed(1) + 'px,0)';
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

  function hide() {
    if (selKey) select(null);
    if (armed) setArmed(false);
    showRoot(false);
  }

  return {
    addMark,
    addVisit,
    refresh,
    update,
    hide,
    select,
    setArmed,
    getArmed: () => armed,
    getMarks: () => marks.slice(),
    onChange: (f) => { listeners.push(f); },
    focusMark: (id) => {
      const k = 'm:' + id;
      if (items.has(k)) select(k);
    }
  };
}

// ---- раздел «My marks» панели Markers (по образцу places.js) ----
/**
 * @param {object} deps
 * @param {HTMLElement} deps.list        <ul id="mark-list">
 * @param {object} deps.marksApi         результат createMarks
 * @param {function} deps.getHomeApi
 * @param {function} deps.getTransitioning
 * @param {function} deps.clearPressed
 * @param {function} deps.flyTo          (lon, lat, dist)
 */
export function createMarksSection({ list, marksApi, getHomeApi, getTransitioning, clearPressed, flyTo }) {
  if (!list || !marksApi) return null;

  function row(label, note, cls, lon, lat, id) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'poi ' + cls;
    b.setAttribute('aria-pressed', 'false');
    b.setAttribute('data-lon', lon);
    b.setAttribute('data-lat', lat);
    if (id) b.setAttribute('data-id', id);
    const dot = document.createElement('i');
    const tx = document.createElement('span');
    tx.textContent = label;
    const sm = document.createElement('small');
    sm.textContent = note;
    tx.appendChild(sm);
    b.appendChild(dot);
    b.appendChild(tx);
    li.appendChild(b);
    return li;
  }

  let lastSig = '';
  function render() {
    const homeApi = getHomeApi();
    const home = homeApi ? homeApi.getHome() : null;
    const ms = marksApi.getMarks();
    const sig = JSON.stringify([home, ms.map((m) => [m.id, m.name, m.lon, m.lat])]);
    if (sig === lastSig) return;
    lastSig = sig;
    list.textContent = '';
    if (home) list.appendChild(row('Home', fmtLonLatPrecise(home.lon, home.lat), 'home', home.lon, home.lat, ''));
    ms.slice().reverse().forEach((m) => {
      list.appendChild(row(m.name || (m.kind === 'visit' ? 'Landing site' : 'Mark'), fmtLonLatPrecise(m.lon, m.lat), m.kind, m.lon, m.lat, m.id));
    });
    if (!list.firstChild) {
      const li = document.createElement('li');
      li.className = 'mk-empty';
      li.textContent = 'No marks yet — press Mark on the map and click anywhere';
      list.appendChild(li);
    }
  }

  list.addEventListener('click', function (e) {
    const b = e.target.closest ? e.target.closest('button') : null;
    if (!b || getTransitioning()) return;
    clearPressed();
    const lon = parseFloat(b.getAttribute('data-lon'));
    const lat = parseFloat(b.getAttribute('data-lat'));
    flyTo(lon, lat, 1.6);
    const id = b.getAttribute('data-id');
    if (id) marksApi.focusMark(id);
  });

  marksApi.onChange(render);
  render();
  return { id: 'marks', list };
}