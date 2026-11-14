// markers/vehicles.js — раздел «Vehicles» панели Markers: марсоходы NASA и ESA с галочками.
// Отмеченные марсоходы рисуются на планете пином с названием (пины ведёт marks.js через setVehicles).
// Координаты приблизительные: места посадки / последние известные положения (восток +, север +).

export const VEHICLES = [
  { id: 'curiosity', name: 'Curiosity', agency: 'nasa', lon: 137.44, lat: -4.59, note: 'Gale Crater · active' },
  { id: 'perseverance', name: 'Perseverance', agency: 'nasa', lon: 77.4, lat: 18.43, note: 'Jezero Crater · active' },
  { id: 'opportunity', name: 'Opportunity', agency: 'nasa', lon: -5.53, lat: -2.27, note: 'Endeavour Crater · ended 2018' },
  { id: 'spirit', name: 'Spirit', agency: 'nasa', lon: 175.47, lat: -14.57, note: 'Gusev Crater · ended 2010' },
  { id: 'sojourner', name: 'Sojourner', agency: 'nasa', lon: -33.22, lat: 19.13, note: 'Ares Vallis · 1997' },
  { id: 'rosalind', name: 'Rosalind Franklin', agency: 'esa', lon: -24.3, lat: 18.2, note: 'Oxia Planum · planned (ESA)' }
];

const KEY = 'marsVehicles1';

export function createVehiclesSection({ list, marksApi, flyTo, getTransitioning, clearPressed }) {
  if (!list || !marksApi) return null;
  let on = {};
  try { on = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { on = {}; }

  function push() {
    marksApi.setVehicles(VEHICLES.filter((v) => on[v.id]));
    try { localStorage.setItem(KEY, JSON.stringify(on)); } catch (e) { /* ignore */ }
  }

  list.textContent = '';
  VEHICLES.forEach((v) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'poi veh-' + v.agency;
    b.setAttribute('aria-pressed', 'false');
    const dot = document.createElement('i');
    const tx = document.createElement('span');
    tx.textContent = v.name;
    const sm = document.createElement('small');
    sm.textContent = v.note;
    tx.appendChild(sm);
    b.appendChild(dot);
    b.appendChild(tx);
    b.addEventListener('click', function () {
      if (getTransitioning && getTransitioning()) return;
      if (clearPressed) clearPressed();
      flyTo(v.lon, v.lat, 1.5);
    });
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'mk-vis';
    cb.checked = !!on[v.id];
    cb.title = 'Show ' + v.name + ' on the planet';
    cb.setAttribute('aria-label', 'Show ' + v.name + ' on the planet');
    cb.addEventListener('change', function () { on[v.id] = cb.checked; push(); });
    li.appendChild(b);
    li.appendChild(cb);
    list.appendChild(li);
  });
  list.classList.add('veh-items');
  push();
  return { id: 'vehicles', list };
}
