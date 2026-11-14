// markers/places.js — раздел «Places of interest» панели Markers.
// Разметка: index.html (#poi-list, #place-info), стили: public/styles/markers/places.css,
// обводка на планете: src/shaders/markers-places.glsl (uniform uPlace).

// lon/lat в градусах, dist — расстояние камеры в радиусах Марса, ring — радиус обводки в градусах дуги
export const PLACES = [
  { name: 'Olympus Mons', lon: -134, lat: 18.6, dist: 1.9, ring: 3.2,
    facts: [['Type', 'Shield volcano'], ['Height', '~22 km'], ['Width', '~600 km'], ['Summit caldera', '~80 km wide']],
    info: ['The tallest known volcano in the Solar System, nearly three times the height of Mount Everest. It is so wide that standing on its flank you could not see the edge: the slope is only about 5 degrees.',
      'It formed from runny lava that built up layer on layer over billions of years. A cliff up to 8 km high rings much of its base, and the summit holds a complex of overlapping collapse craters.'] },
  { name: 'Valles Marineris', lon: -59, lat: -12, dist: 2.6, ring: 5.5,
    facts: [['Type', 'Canyon system'], ['Length', '~4,000 km'], ['Width', 'up to 200 km'], ['Depth', 'up to 7 km']],
    info: ['The largest canyon system in the Solar System. It would stretch across the whole of the United States, and it is about ten times longer than the Grand Canyon.',
      'It was named after the Mariner 9 spacecraft, which first photographed it in 1971\u201372. Most of it opened up as the crust cracked and pulled apart during the rise of the neighbouring Tharsis region, and was later widened by landslides and erosion.'] },
  { name: 'Hellas Basin', lon: 70, lat: -42, dist: 2.7, ring: 6.5,
    facts: [['Type', 'Impact basin'], ['Diameter', '~2,300 km'], ['Depth', '~7 km'], ['Age', 'over 3.9 billion years']],
    info: ['One of the largest well-preserved impact basins in the Solar System, left by a giant collision very early in the history of Mars.',
      'Its floor is the lowest part of the planet, so the air pressure there is the highest on Mars. Clouds, fog and winter frost are often seen inside the basin, and it is a favourite place for dust storms to start.'] },
  { name: 'Tharsis Montes', lon: -112, lat: 1, dist: 2.2, ring: 5.0,
    facts: [['Type', 'Three shield volcanoes'], ['Peaks', 'Arsia, Pavonis, Ascraeus'], ['Height', '14\u201318 km'], ['Spacing', 'in a line, SW to NE']],
    info: ['Three giant volcanoes lined up along the crest of the Tharsis bulge, a huge uplifted region of the Martian crust. Together with Olympus Mons nearby they make up the highest terrain on the planet.',
      'Clouds often gather around their summits in the Martian afternoon, and each volcano is crowned by a large caldera.'] },
  { name: 'Elysium Mons', lon: 147, lat: 25, dist: 2.0, ring: 3.0,
    facts: [['Type', 'Volcano'], ['Height', '~12\u201314 km'], ['Region', 'Elysium volcanic province'], ['Neighbours', 'Hecates and Albor Tholus']],
    info: ['The largest volcano of the Elysium province, the second big volcanic region on Mars after Tharsis. Its steeper sides and smaller size set it apart from the huge shield volcanoes of Tharsis.',
      'Around it lie channels and plains shaped by lava and, probably, by water released from underground, which makes the area interesting for studying the planet\u2019s volcanic and climate history.'] },
  { name: 'Gale Crater', lon: 137.4, lat: -5.4, dist: 1.5, ring: 1.6,
    facts: [['Type', 'Impact crater'], ['Diameter', '154 km'], ['Central peak', 'Mount Sharp, ~5 km'], ['Rover', 'Curiosity, 2012']],
    info: ['A crater with a mountain of layered rock rising from its centre, called Mount Sharp (Aeolis Mons). The layers record a long history of changing environments on early Mars.',
      'NASA\u2019s Curiosity rover landed on the crater floor in August 2012 and has been climbing the foothills ever since. It found clay minerals and organic molecules, and showed that this place once had lakes of fresh water.'] },
  { name: 'Jezero Crater', lon: 77.5, lat: 18.4, dist: 1.5, ring: 1.2,
    facts: [['Type', 'Impact crater'], ['Diameter', '~45 km'], ['Feature', 'Ancient river delta'], ['Rover', 'Perseverance, 2021']],
    info: ['Billions of years ago this crater held a lake fed by a river. The fan-shaped delta at its western edge is one of the best places on Mars to look for traces of past life.',
      'NASA\u2019s Perseverance rover landed here in February 2021. It collects rock samples to be returned to Earth, and it carried the small helicopter Ingenuity, the first aircraft to fly on another planet.'] },
  { name: 'Utopia Planitia', lon: 118, lat: 47, dist: 2.4, ring: 7.0,
    facts: [['Type', 'Plain in an impact basin'], ['Basin size', '~3,300 km'], ['Landers', 'Viking 2 (1976), Zhurong (2021)'], ['Hemisphere', 'North']],
    info: ['A vast, smooth plain in the northern lowlands that fills the largest recognised impact basin on Mars.',
      'Viking 2 landed here in 1976 and photographed frost on the ground in winter. In 2021 the Chinese rover Zhurong explored the southern part of the plain. Radar shows large amounts of buried ice below the surface.'] },
  { name: 'Argyre Basin', lon: -43, lat: -50, dist: 2.4, ring: 4.5,
    facts: [['Type', 'Impact basin'], ['Diameter', '~1,800 km'], ['Depth', '~5 km'], ['Hemisphere', 'South']],
    info: ['A huge impact basin ringed by rugged mountains thrown up by the collision. Its floor is bright and often covered with frost in the cold season.',
      'Long channels that run into the basin suggest water once flowed here, and it may have held a lake in the distant past.'] },
  { name: 'North pole', lon: 0, lat: 80, dist: 2.8, ring: 8.0,
    facts: [['Type', 'Polar ice cap'], ['Width', '~1,000 km'], ['Ice thickness', 'up to ~2\u20133 km'], ['Name', 'Planum Boreum']],
    info: ['A permanent cap of water ice with spiral troughs and layered deposits that record changes in the Martian climate.',
      'In winter it is covered by an extra layer of frozen carbon dioxide that can be a metre thick, and it shrinks again in spring. NASA\u2019s Phoenix lander touched down on the nearby plains in 2008 and confirmed water ice just below the soil.'] },
  // Луны: не лежат на поверхности, поэтому без обводки; камера поворачивается к текущему положению луны (getMoonDirection)
  { name: 'Phobos', moon: 'Phobos', dist: 3.6, coords: 'Inner moon \u00B7 orbits 9,376 km from the centre of Mars',
    facts: [['Type', 'Moon of Mars'], ['Size', '27 \u00D7 22 \u00D7 18 km'], ['Orbit', 'every 7 h 39 min'], ['Discovered', '1877, Asaph Hall']],
    info: ['A dark, potato-shaped lump of rock, possibly a captured asteroid or debris from an ancient impact. Its huge crater Stickney is about 9 km wide, a third of the moon\u2019s size.',
      'Phobos orbits so close and so fast that it circles Mars about three times a day. From the surface it would rise in the west and set in the east. It is slowly spiralling inwards and in tens of millions of years it will break apart or hit Mars.',
      'For explorers it is interesting as a possible waypoint: gravity there is tiny, and Japan\u2019s MMX mission plans to bring samples of Phobos back to Earth.'] },
  { name: 'Deimos', moon: 'Deimos', dist: 4.6, coords: 'Outer moon \u00B7 orbits 23,460 km from the centre of Mars',
    facts: [['Type', 'Moon of Mars'], ['Size', '15 \u00D7 12 \u00D7 11 km'], ['Orbit', 'every 30 h 18 min'], ['Discovered', '1877, Asaph Hall']],
    info: ['A small, smooth-looking moon. Dust and loose rock have filled in many of its craters, so it looks softer than Phobos. It was found only six days after Phobos.',
      'Deimos moves slowly across the Martian sky, taking about 2.7 days between rising and setting, and from the surface it would look like a bright star rather than a disc.',
      'The names mean Fear (Phobos) and Terror or Dread (Deimos), the sons of the Greek god of war.'] }
];

function fmtCoord(v, pos, neg) {
  return Math.abs(v).toFixed(1).replace(/\.0$/, '') + '\u00B0 ' + (v >= 0 ? pos : neg);
}

/**
 * @param {object} deps
 * @param {HTMLElement} deps.list         <ul id="poi-list">
 * @param {HTMLElement} deps.info         <div id="place-info">
 * @param {function} deps.getTransitioning
 * @param {function} deps.flyTo           (lon, lat, dist)
 * @param {function} deps.setHighlight    (place | null) — обводка на планете
 * @param {function} deps.getMoonDirection (name) → {lon, lat} | null — где сейчас луна над планетой
 * @param {function} deps.saveView        запомнить вид камеры перед первым переходом
 * @param {function} deps.restoreView     вернуться к запомненному виду
 */
export function createPlacesSection({ list, info, getTransitioning, flyTo, setHighlight, saveView, restoreView, getMoonDirection }) {
  if (!list) return null;

  const buttons = [];
  let current = null;

  PLACES.forEach(function (p, idx) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'poi';
    b.setAttribute('aria-pressed', 'false');
    b.setAttribute('data-idx', idx);
    const dot = document.createElement('i');
    const tx = document.createElement('span');
    tx.textContent = p.name;
    b.appendChild(dot);
    b.appendChild(tx);
    li.appendChild(b);
    list.appendChild(li);
    buttons.push(b);
  });

  const el = info ? {
    title: info.querySelector('.pi-title'),
    coords: info.querySelector('.pi-coords'),
    text: info.querySelector('.pi-text'),
    facts: info.querySelector('.pi-facts'),
    body: info.querySelector('.pi-body'),
    close: info.querySelector('.pi-close')
  } : null;

  function deselect(back) {
    current = null;
    if (back === true && restoreView) restoreView();
    buttons.forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
    if (info) info.hidden = true;
    if (setHighlight) setHighlight(null);
  }

  function select(idx) {
    const p = PLACES[idx];
    if (current === null && saveView) saveView();   // исходная точка — до первого перехода
    current = idx;
    buttons.forEach(function (x, i) { x.setAttribute('aria-pressed', i === idx ? 'true' : 'false'); });
    if (el) {
      el.title.textContent = p.name;
      el.coords.textContent = p.coords || (fmtCoord(p.lat, 'N', 'S') + ', ' + fmtCoord(p.lon, 'E', 'W'));
      el.text.textContent = '';
      p.info.forEach(function (t) {
        const para = document.createElement('p');
        para.textContent = t;
        el.text.appendChild(para);
      });
      el.facts.textContent = '';
      p.facts.forEach(function (f) {
        const dt = document.createElement('dt');
        dt.textContent = f[0];
        const dd = document.createElement('dd');
        dd.textContent = f[1];
        el.facts.appendChild(dt);
        el.facts.appendChild(dd);
      });
      el.body.scrollTop = 0;
      info.hidden = false;
    }
    if (setHighlight) setHighlight(p.moon ? null : p);
    if (p.moon) {
      const d = getMoonDirection && getMoonDirection(p.moon);
      if (d) flyTo(d.lon, d.lat, p.dist);
    } else flyTo(p.lon, p.lat, p.dist);
  }

  list.addEventListener('click', function (e) {
    const b = e.target.closest ? e.target.closest('button') : null;
    if (!b || getTransitioning()) return;
    const idx = parseInt(b.getAttribute('data-idx'), 10);
    if (idx === current) { deselect(true); return; }   // повторный клик: снять выделение и вернуться
    select(idx);
  });

  if (el && el.close) el.close.addEventListener('click', function () { deselect(false); });

  return { id: 'places', list, deselect, getCurrent: function () { return current; } };
}
