// markers/marks.js — метки на карте Марса и режим «Mark».
//  • «User marks»: кнопка «Add mark» в панели Markers включает режим добавления; клик по планете/карте
//    открывает форму (название, заметка, категория: дом / еда / вода / опасность / информация),
//    «Save» ставит метку. Вид пина зависит от категории. Esc или повторное нажатие — отмена.
//  • Метка «visit» создаётся сама, когда игрок побывал на поверхности (surface); список таких меток —
//    «Landing history» над кнопкой Explorer (createLandingHistory).
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

const HINT_ARMED = 'Add mark: click anywhere on the planet to place it · fill in the form · Esc to cancel';
const NOTE_MAX = 200;

// Категории пользовательских меток: цвет пина (CSS: .cat-<id>) и значок внутри пина
const CATS = {
  info:   { label: 'Info' },
  home:   { label: 'Home' },
  food:   { label: 'Food' },
  water:  { label: 'Water' },
  danger: { label: 'Danger' }
};
const CAT_IDS = Object.keys(CATS);
const catOf = (c) => (CATS[c] ? c : 'info');

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
    if (p.moon) continue;                       // луны не лежат на поверхности
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

// Форма пина зависит от категории (viewBox 24×34, острие/основание — внизу по центру). Минимализм: у каждой категории
// просто своя залитая фигура с белым контуром, ничего внутри:
//   info — классическая капля-пин с точкой; home — домик; danger — треугольник; food — листик; water — капля.
const SHAPES = {
  info: 'M12 1C5.9 1 1 5.8 1 11.8 1 20 12 33 12 33s11-13 11-21.2C23 5.8 18.1 1 12 1z',
  home: 'M12 9 22.6 18.6H19.6V32H4.4V18.6H1.4Z',
  danger: 'M12 8.5 23.2 31.5H0.8Z',
  food: 'M12 32C2.5 28.5 3 14 20.5 5.5 22.5 18.5 20.5 29 12 32Z',
  water: 'M12 5C12 5 3.5 15.5 3.5 23.5a8.5 8.5 0 0 0 17 0C20.5 15.5 12 5 12 5Z'
};

// внутренний значок есть только у классического пина (точка) — у остальных категорий внутри ничего нет
function glyph(cat) {
  const g = document.createElementNS(SVG_NS, 'g');
  if (!cat || cat === 'info' || cat === 'visit') {
    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('cx', '12');
    dot.setAttribute('cy', '11.8');
    dot.setAttribute('r', '4.3');
    dot.setAttribute('fill', 'var(--pin-in)');
    g.appendChild(dot);
  }
  return g;
}

// тот же силуэт для info, что у .lp-pin в index.html, но цвета берутся из --pin / --pin-in
function pinSvg(cat) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 34');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', SHAPES[cat] || SHAPES.info);
  path.setAttribute('fill', 'var(--pin)');
  path.setAttribute('stroke', '#fff');
  path.setAttribute('stroke-width', '1.6');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  svg.appendChild(glyph(cat || 'info'));
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
        name: typeof m.name === 'string' ? m.name.slice(0, 32) : '',
        cat: catOf(m.cat),
        note: typeof m.note === 'string' ? m.note.slice(0, NOTE_MAX) : ''
      }));
  } catch (e) { /* ignore */ }

  let armed = false;
  let showVisits = false;   // пины посадок видны только пока открыта «Landing history»
  let draft = null;     // { lon, lat, cat } — метка, которую пользователь ещё заполняет
  let selKey = null;
  let sig = null;
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
    '<div class="mk-ttl"><input class="mk-name" type="text" maxlength="32" spellcheck="false" aria-label="Mark name" placeholder="Name" title="Click to rename">' +
    '<p class="mk-sub"></p></div>' +
    '<button type="button" class="mk-x" aria-label="Close">&times;</button></div>' +
    '<div class="mk-edit">' +
    '<div class="mk-cats" role="radiogroup" aria-label="Category"></div>' +
    '<label class="mk-lab">Description<textarea class="mk-note" maxlength="' + NOTE_MAX + '" rows="2" spellcheck="false" placeholder="Add a description…" aria-label="Description"></textarea></label>' +
    '</div>' +
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

  // форма новой метки
  const form = document.createElement('div');
  form.className = 'mk-card mk-form';
  form.hidden = true;
  form.setAttribute('role', 'dialog');
  form.setAttribute('aria-label', 'New mark');
  form.innerHTML =
    '<div class="mk-head"><i class="mk-dot"></i>' +
    '<div class="mk-ttl"><p class="mk-sub mk-new">New mark</p></div>' +
    '<button type="button" class="mk-x" aria-label="Cancel">&times;</button></div>' +
    '<div class="mk-edit">' +
    '<label class="mk-lab">Name<input class="mk-name mk-field" type="text" maxlength="32" spellcheck="false" aria-label="Mark name" placeholder="Mark 1"></label>' +
    '<div class="mk-lab">Category</div><div class="mk-cats" role="radiogroup" aria-label="Category"></div>' +
    '<label class="mk-lab">Description<textarea class="mk-note" maxlength="' + NOTE_MAX + '" rows="3" spellcheck="false" placeholder="Add a description…" aria-label="Description"></textarea></label>' +
    '</div>' +
    '<div class="mk-btns"><button type="button" class="chip lp-go" data-a="save">Save</button>' +
    '<button type="button" class="chip" data-a="cancel">Cancel</button></div>';
  root.appendChild(form);
  const fName = form.querySelector('.mk-name');
  const fSub = form.querySelector('.mk-sub');
  const fCats = form.querySelector('.mk-cats');
  const fNote = form.querySelector('.mk-note');

  function buildCats(host, onPick) {
    CAT_IDS.forEach((id) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mk-cat cat-' + id;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', 'false');
      b.setAttribute('data-cat', id);
      b.title = CATS[id].label;
      b.appendChild(pinSvg(id));
      const t = document.createElement('span');
      t.textContent = CATS[id].label;
      b.appendChild(t);
      b.addEventListener('click', () => onPick(id));
      host.appendChild(b);
    });
  }
  function markCats(host, cat) {
    host.querySelectorAll('.mk-cat').forEach((b) => {
      b.setAttribute('aria-checked', String(b.getAttribute('data-cat') === cat));
    });
  }

  const q = (s) => card.querySelector(s);
  const elName = q('.mk-name');
  const elSub = q('.mk-sub');
  const rowEls = {};
  card.querySelectorAll('[data-r]').forEach((dd) => {
    rowEls[dd.getAttribute('data-r')] = { dd, dt: dd.previousElementSibling };
  });
  const elEdit = q('.mk-edit');
  const elCats = q('.mk-cats');
  const elNote = q('.mk-note');
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
      if (m.kind === 'visit' && !showVisits) continue;
      // метка, совпавшая с домом, рисуется одним (домашним) пином
      if (home && Math.abs(wrap180(m.lon - home.lon)) <= SAME_DEG && Math.abs(m.lat - home.lat) <= SAME_DEG) continue;
      list.push({ key: 'm:' + m.id, kind: m.kind, cat: m.kind === 'visit' ? 'visit' : m.cat, id: m.id, lon: m.lon, lat: m.lat });
    }
    if (home) list.push({ key: 'home', kind: 'home', cat: 'home', id: 'home', lon: home.lon, lat: home.lat });
    if (draft) list.push({ key: 'draft', kind: 'mark', cat: draft.cat, id: 'draft', lon: draft.lon, lat: draft.lat, draft: true });
    return list;
  }

  function makeEl(it) {
    const el = document.createElement('div');
    el.className = 'mk ' + it.kind + ' cat-' + it.cat + (it.draft ? ' draft' : '');
    el.style.visibility = 'hidden';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mk-btn';
    b.setAttribute('aria-label', it.kind === 'home' ? 'Home mark' : 'Mark');
    b.appendChild(pinSvg(it.cat));
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      if (it.draft) return;
      select(selKey === it.key ? null : it.key);
    });
    el.appendChild(b);
    root.appendChild(el);
    return el;
  }

  function refresh() {
    const list = desired();
    const s = list.map((i) => i.key + '@' + i.lon + ',' + i.lat + ':' + i.cat).join('|');
    if (s === sig) return;
    sig = s;
    const keep = new Set();
    list.forEach((d) => {
      keep.add(d.key);
      let it = items.get(d.key);
      if (!it) {
        it = { key: d.key, kind: d.kind, cat: d.cat, draft: !!d.draft, id: d.id, el: null, vis: null };
        it.el = makeEl(it);
        items.set(d.key, it);
      } else if (it.cat !== d.cat) {
        // категория сменилась — перерисовываем значок и класс
        it.cat = d.cat;
        it.el.className = 'mk ' + it.kind + ' cat-' + it.cat + (it.draft ? ' draft' : '') + (it.key === selKey ? ' sel' : '');
        const btn = it.el.querySelector('.mk-btn');
        btn.textContent = '';
        btn.appendChild(pinSvg(it.cat));
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
    CAT_IDS.forEach((c) => card.classList.remove('cat-' + c));
    card.classList.remove('visit', 'home');
    if (isHome) card.classList.add('home');
    else if (it.kind === 'visit') card.classList.add('visit');
    else card.classList.add('cat-' + (m ? m.cat : 'info'));
    const editable = !!m && m.kind === 'mark' && !isHome;
    elEdit.hidden = !editable;
    if (editable) {
      markCats(elCats, m.cat);
      if (document.activeElement !== elNote) elNote.value = m.note || '';
    }

    if (document.activeElement !== elName) elName.value = isHome ? 'Home' : markName(m || {});
    elName.readOnly = isHome;
    const np = nearestPlace(it.lon, it.lat);
    const nearTxt = np ? (np.d < 40 ? 'At ' : '≈ ' + fmtDist(np.d) + ' from ') + np.name : 'Uncharted terrain';
    elSub.textContent = editable ? CATS[m.cat].label + ' · ' + nearTxt : nearTxt;

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

    btnHomeAct.hidden = !isHome;   // «Make home» убран у пользовательских меток; у самого домашнего пина остаётся кнопка снятия
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
    m.name = elName.value.trim().slice(0, 32) || defaultName(m);   // пустое имя → стандартное «Mark N»
    save();
    fillCard();
    emit();
  });
  elName.addEventListener('blur', function () {
    if (selKey) fillCard();
  });

  buildCats(elCats, function (cat) {
    const it = selKey ? items.get(selKey) : null;
    const m = it ? marks.find((x) => x.id === it.id) : null;
    if (!m || m.kind !== 'mark') return;
    m.cat = cat;
    save();
    sig = null;
    refresh();
    fillCard();
  });
  elNote.addEventListener('keydown', function (e) {
    e.stopPropagation();
    if (e.key === 'Escape') { elNote.blur(); select(null); }
  });
  elNote.addEventListener('change', function () {
    const it = selKey ? items.get(selKey) : null;
    const m = it ? marks.find((x) => x.id === it.id) : null;
    if (!m) return;
    m.note = elNote.value.trim().slice(0, NOTE_MAX);
    save();
    emit();
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
      sig = null;
      refresh();
      return;
    }
    marks = marks.filter((m) => m.id !== it.id);
    save();
    select(null);
    sig = null;
    refresh();
  });

  // ---- режим Mark ----
  function setArmed(on) {
    on = !!on;
    if (on === armed) return;
    armed = on;
    if (btnMark) btnMark.setAttribute('aria-pressed', String(on));
    if (on && getPegArmed()) setPegArmed(false);
    if (marsHint) marsHint.textContent = on ? HINT_ARMED : getMarsHintText();
    const marsMat = getMarsMat();
    if (marsMat) marsMat.uniforms.uGrid.value = (on || getGridOn()) ? 1 : 0;
    if (getMode() === 'mars') canvas.style.cursor = on ? 'crosshair' : 'grab';
    if (!on && draft) cancelDraft();
    if (onDirty) onDirty();
    emit();
  }

  if (btnMark) btnMark.addEventListener('click', function () {
    if (getMode() === 'mars' && !getTransitioning()) setArmed(!armed);
  });

  // ---- форма новой метки ----
  let formCat = 'info';
  function setFormCat(c) {
    formCat = catOf(c);
    markCats(fCats, formCat);
    CAT_IDS.forEach((id) => form.classList.remove('cat-' + id));
    form.classList.add('cat-' + formCat);
    if (draft) {
      draft.cat = formCat;
      refresh();
    }
  }
  buildCats(fCats, setFormCat);

  // клик по любому другому элементу интерфейса (кроме формы и самого пина) — отмена неподтверждённой метки
  document.addEventListener('pointerdown', function (e) {
    if (!draft || form.contains(e.target) || e.target === canvas) return;
    const t = e.target.closest ? e.target.closest('.mk.draft, .mk-add') : null;
    if (t) return;
    setArmed(false);
  }, true);

  function startDraft(lon, lat) {
    const first = !draft;
    draft = { lon: round3(wrap180(lon)), lat: round3(Math.max(-89.9, Math.min(89.9, lat))), cat: first ? 'info' : draft.cat };
    if (first) {
      fName.value = '';
      fNote.value = '';
      fName.placeholder = defaultName({ kind: 'mark' });
      form.hidden = false;
      setFormCat('info');
    }
    sig = null;
    refresh();
    if (first) setTimeout(() => { try { fName.focus(); } catch (e) { /* ignore */ } }, 0);
    if (onDirty) onDirty();
  }
  function cancelDraft() {
    if (!draft) return;
    draft = null;
    form.hidden = true;
    sig = null;
    refresh();
    if (onDirty) onDirty();
  }
  function saveDraft() {
    if (!draft) return;
    const d = draft;
    const m = addMark(d.lon, d.lat, { name: fName.value.trim() || fName.placeholder, note: fNote.value.trim(), cat: d.cat });
    draft = null;
    form.hidden = true;
    setArmed(false);
    sig = null;
    refresh();
    if (m) select('m:' + m.id);
  }
  form.querySelector('[data-a="save"]').addEventListener('click', saveDraft);
  form.querySelector('[data-a="cancel"]').addEventListener('click', () => setArmed(false));
  form.querySelector('.mk-x').addEventListener('click', () => setArmed(false));
  [fName, fNote].forEach((el) => el.addEventListener('keydown', function (e) {
    e.stopPropagation();
    if (e.key === 'Escape') setArmed(false);
    else if (e.key === 'Enter' && el === fName) saveDraft();
  }));

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
    // форма уже открыта, а пользователь кликнул по карте — метка не подтверждена, убираем её
    if (draft) {
      setArmed(false);
      return;
    }
    const hit = pickMars(e.clientX, e.clientY);
    if (hit) startDraft(hit.lon, hit.lat);
  });

  // ---- добавление ----
  function round3(v) {
    return Math.round(v * 1000) / 1000;
  }

  /** Поставить свою метку (градусы, восток +). Возвращает метку. */
  function addMark(lonDeg, latDeg, opts) {
    opts = opts || {};
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
      name: '',
      cat: catOf(opts.cat),
      note: typeof opts.note === 'string' ? opts.note.slice(0, NOTE_MAX) : ''
    };
    m.name = (opts.name || '').slice(0, 32) || defaultName(m);
    marks.push(m);
    if (marks.length > MAX_MARKS) marks.shift();
    save();
    sig = null;
    refresh();
    return m;
  }

  /** Удалить метку по id (из списка/истории, без перезагрузки). */
  function removeMark(id) {
    const before = marks.length;
    marks = marks.filter((m) => m.id !== id);
    if (marks.length === before) return false;
    save();
    if (selKey === 'm:' + id) select(null);
    sig = null;
    refresh();
    return true;
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
        name: 'Landing site',
        cat: 'info',
        note: ''
      });
      if (marks.length > MAX_MARKS) marks.shift();
    }
    save();
    sig = null;
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

  function placeCard(x, y, W, H, el) {
    el = el || card;
    const cw = el.offsetWidth || 244;
    const ch = el.offsetHeight || 250;
    const left = x + 26 + cw > W - 8 ? x - cw - 22 : x + 26;
    const top = Math.max(8, Math.min(H - 8 - ch, y - ch * 0.5 - 18));
    el.style.transform = 'translate3d(' + left.toFixed(1) + 'px,' + top.toFixed(1) + 'px,0)';
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
    let formVisible = false;
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
        placeCard(P.x, P.y, W, H, card);
      }
      if (it.key === 'draft') {
        formVisible = true;
        placeCard(P.x, P.y, W, H, form);
      }
    });
    form.style.visibility = draft && formVisible ? 'visible' : 'hidden';
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
    removeMark,
    setVisitsVisible: (on) => {
      on = !!on;
      if (on === showVisits) return;
      showVisits = on;
      root.classList.toggle('show-visits', on);   // подстраховка в CSS: без класса пины посадок скрыты
      sig = null;
      refresh();
    },
    refresh,
    update,
    hide,
    select,
    setArmed,
    getArmed: () => armed,
    getCats: () => CATS,
    getMarks: () => marks.slice(),
    onChange: (f) => { listeners.push(f); },
    focusMark: (id) => {
      const k = 'm:' + id;
      if (items.has(k)) select(k);
    }
  };
}

// ---- раздел «User marks» панели Markers (по образцу places.js) ----
/**
 * Кнопка «Add mark» + список пользовательских меток (и дом, если назначен).
 * @param {object} deps
 * @param {HTMLElement} deps.list        <ul id="mark-list">
 * @param {object} deps.marksApi         результат createMarks
 * @param {function} deps.getHomeApi
 * @param {function} deps.getMode
 * @param {function} deps.getTransitioning
 * @param {function} deps.clearPressed
 * @param {function} deps.flyTo          (lon, lat, dist)
 */
export function createMarksSection({ list, marksApi, getHomeApi, getMode, getTransitioning, clearPressed, flyTo }) {
  if (!list || !marksApi) return null;
  const cats = marksApi.getCats();

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
    if (id) li.appendChild(delBtn(id, label));
    return li;
  }

  function delBtn(id, label) {
    const d = document.createElement('button');
    d.type = 'button';
    d.className = 'mk-del';
    d.setAttribute('data-del', id);
    d.setAttribute('aria-label', 'Delete ' + label);
    d.title = 'Delete';
    d.textContent = '×';
    return d;
  }

  const addLi = document.createElement('li');
  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'mk-add';
  addBtn.setAttribute('aria-pressed', 'false');
  addBtn.innerHTML = '<span class="mk-plus" aria-hidden="true">+</span><span class="mk-add-t">Add mark</span>';
  addLi.appendChild(addBtn);
  const listHost = document.createElement('ul');
  listHost.className = 'mk-items';

  let lastSig = '';
  function render() {
    const armed = marksApi.getArmed();
    addBtn.setAttribute('aria-pressed', String(armed));
    addBtn.querySelector('.mk-add-t').textContent = armed ? 'Click on the planet… (Esc to cancel)' : 'Add mark';
    const homeApi = getHomeApi();
    const home = homeApi ? homeApi.getHome() : null;
    const ms = marksApi.getMarks().filter((m) => m.kind === 'mark');
    const sig = JSON.stringify([home, ms.map((m) => [m.id, m.name, m.cat, m.lon, m.lat])]);
    if (sig === lastSig) return;
    lastSig = sig;
    listHost.textContent = '';
    if (home) listHost.appendChild(row('Home', fmtLonLatPrecise(home.lon, home.lat), 'home', home.lon, home.lat, ''));
    ms.slice().reverse().forEach((m) => {
      listHost.appendChild(row(m.name || 'Mark', cats[m.cat].label + ' · ' + fmtLonLatPrecise(m.lon, m.lat), 'cat-' + m.cat, m.lon, m.lat, m.id));
    });
    if (!listHost.firstChild) {
      const li = document.createElement('li');
      li.className = 'mk-empty';
      li.textContent = 'No marks yet — press “Add mark”, then click a spot on the planet';
      listHost.appendChild(li);
    }
  }

  list.textContent = '';
  list.appendChild(addLi);
  const itemsLi = document.createElement('li');
  itemsLi.appendChild(listHost);
  list.appendChild(itemsLi);

  addBtn.addEventListener('click', function () {
    if (getMode() !== 'mars' || getTransitioning()) return;
    marksApi.setArmed(!marksApi.getArmed());
  });

  listHost.addEventListener('click', function (e) {
    const b = e.target.closest ? e.target.closest('button') : null;
    if (!b) return;
    if (b.classList.contains('mk-del')) {
      marksApi.removeMark(b.getAttribute('data-del'));
      return;
    }
    if (getTransitioning()) return;
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

// ---- «Landing history»: кнопка над Explorer, пока он включён ----
/**
 * @param {object} deps
 * @param {HTMLElement} deps.wrap     контейнер .lh-wrap (скрыт, пока Explorer не активен)
 * @param {HTMLElement} deps.btn      кнопка «Landing history»
 * @param {HTMLElement} deps.pop      выпадающий список
 * @param {HTMLElement} deps.pegBtn   кнопка Explorer (#btn-peg)
 */
export function createLandingHistory({ wrap, btn, pop, pegBtn, marksApi, getTransitioning, flyTo, clearPressed }) {
  if (!wrap || !btn || !pop || !pegBtn || !marksApi) return null;

  function open(on) {
    pop.hidden = !on;
    marksApi.setVisitsVisible(on);   // пины посадок — только пока список открыт
    btn.setAttribute('aria-expanded', String(on));
    btn.setAttribute('aria-pressed', String(on));
    if (on) render();
  }

  function render() {
    const vs = marksApi.getMarks().filter((m) => m.kind === 'visit').sort((a, b) => b.t - a.t);
    pop.textContent = '';
    const head = document.createElement('p');
    head.className = 'lh-title';
    head.textContent = 'Landing history';
    pop.appendChild(head);
    if (!vs.length) {
      const e = document.createElement('p');
      e.className = 'lh-empty';
      e.textContent = 'No landings yet — drop the Explorer on the planet and press “Land here”.';
      pop.appendChild(e);
      return;
    }
    const ul = document.createElement('ul');
    ul.className = 'lh-list';
    vs.forEach((m, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'lh-item';
      b.setAttribute('data-id', m.id);
      b.setAttribute('data-lon', m.lon);
      b.setAttribute('data-lat', m.lat);
      const t = document.createElement('span');
      t.className = 'lh-name';
      t.textContent = (m.name || 'Landing site') + (vs.length > 1 ? ' #' + (vs.length - i) : '');
      const sm = document.createElement('small');
      sm.textContent = fmtLonLatPrecise(m.lon, m.lat) + ' · ' + (m.n > 1 ? m.n + '× · ' : '') + fmtDate(m.t);
      b.appendChild(t);
      b.appendChild(sm);
      li.appendChild(b);
      const d = document.createElement('button');
      d.type = 'button';
      d.className = 'mk-del';
      d.setAttribute('data-del', m.id);
      d.setAttribute('aria-label', 'Delete ' + t.textContent);
      d.title = 'Delete';
      d.textContent = '×';
      li.appendChild(d);
      ul.appendChild(li);
    });
    pop.appendChild(ul);
  }

  function sync() {
    const on = pegBtn.getAttribute('aria-pressed') === 'true';
    wrap.hidden = !on;
    if (!on) open(false);
  }

  btn.addEventListener('click', () => open(pop.hidden));
  pop.addEventListener('click', function (e) {
    const del = e.target.closest ? e.target.closest('.mk-del') : null;
    if (del) {
      marksApi.removeMark(del.getAttribute('data-del')); // список перерисуется через onChange
      return;
    }
    const b = e.target.closest ? e.target.closest('.lh-item') : null;
    if (!b || getTransitioning()) return;
    clearPressed();
    flyTo(parseFloat(b.getAttribute('data-lon')), parseFloat(b.getAttribute('data-lat')), 1.6);
    marksApi.focusMark(b.getAttribute('data-id'));
  });
  // кнопка работает как переключатель: пока она нажата, виден список и пины посадок; клик в другом месте их не прячет
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !pop.hidden) {
      e.stopPropagation();
      open(false);
    }
  }, true);
  marksApi.onChange(() => { if (!pop.hidden) render(); });
  new MutationObserver(sync).observe(pegBtn, { attributes: true, attributeFilter: ['aria-pressed'] });
  sync();
  return { id: 'landing-history' };
}
