// markers/places.js — раздел «Places of interest» панели Markers.
// Разметка раздела: index.html (#poi-list), стили: public/styles/markers/places.css.

// lon/lat в градусах, dist — расстояние камеры в радиусах Марса
export const PLACES = [
  { name: 'Olympus Mons', note: 'Largest volcano in the Solar System', lon: -134, lat: 18.6, dist: 1.9 },
  { name: 'Valles Marineris', note: 'Canyon system ~4,000 km long', lon: -59, lat: -12, dist: 2.6 },
  { name: 'Hellas Basin', note: 'Deepest impact basin on Mars', lon: 70, lat: -42, dist: 2.7 },
  { name: 'Tharsis Montes', note: 'Arsia, Pavonis and Ascraeus', lon: -112, lat: 1, dist: 2.2 },
  { name: 'Elysium Mons', note: 'Volcanic province', lon: 147, lat: 25, dist: 2.0 },
  { name: 'Gale Crater', note: 'Curiosity rover', lon: 137.4, lat: -5.4, dist: 1.5 },
  { name: 'Jezero Crater', note: 'Perseverance rover', lon: 77.5, lat: 18.4, dist: 1.5 },
  { name: 'Utopia Planitia', note: 'Vast northern plain', lon: 118, lat: 47, dist: 2.4 },
  { name: 'Argyre Basin', note: 'Impact basin in the south', lon: -43, lat: -50, dist: 2.4 },
  { name: 'North pole', note: 'Polar ice cap', lon: 0, lat: 80, dist: 2.8 }
];

/**
 * @param {object} deps
 * @param {HTMLElement} deps.list        <ul id="poi-list">
 * @param {function} deps.getTransitioning
 * @param {function} deps.clearPressed
 * @param {function} deps.flyTo          (lon, lat, dist)
 */
export function createPlacesSection({ list, getTransitioning, clearPressed, flyTo }) {
  if (!list) return null;

  PLACES.forEach(function (p) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'poi';
    b.setAttribute('aria-pressed', 'false');
    b.setAttribute('data-lon', p.lon);
    b.setAttribute('data-lat', p.lat);
    b.setAttribute('data-dist', p.dist);
    const dot = document.createElement('i');
    const tx = document.createElement('span');
    tx.textContent = p.name;
    const sm = document.createElement('small');
    sm.textContent = p.note;
    tx.appendChild(sm);
    b.appendChild(dot);
    b.appendChild(tx);
    li.appendChild(b);
    list.appendChild(li);
  });

  list.addEventListener('click', function (e) {
    const b = e.target.closest ? e.target.closest('button') : null;
    if (!b || getTransitioning()) return;
    clearPressed();
    b.setAttribute('aria-pressed', 'true');
    flyTo(
      parseFloat(b.getAttribute('data-lon')),
      parseFloat(b.getAttribute('data-lat')),
      parseFloat(b.getAttribute('data-dist'))
    );
  });

  return { id: 'places', list };
}
