// sim/sim-ui.js — экран симуляции: сценарии (день/ночь, луны, марсотрясение, пылевая буря); ползунок — сила 0–10 или время суток
import { stormParams, quakeParams, sunAt, dayTemp, dayLabel, fmtTime, SCENARIOS } from './sim-model.js';

const fmt = (x, d) => x.toFixed(d === undefined ? 0 : d);

function stormInfo(v) {
  const p = stormParams(v);
  const sun = p.directPct >= 1 ? fmt(p.directPct) + '%' : p.directPct >= 0.01 ? fmt(p.directPct, 2) + '%' : '< 0.01%';
  return {
    title: 'Dust storm',
    label: p.label,
    stats: [
      ['Dust opacity (τ)', fmt(p.tau, 1)],
      ['Wind gusts', fmt(p.wind) + ' m/s'],
      ['Feels like on Earth', '≈ ' + fmt(p.earthEq, 1) + ' m/s breeze'],
      ['Direct sunlight at ground', sun]
    ],
    note: 'Mars air is about 60 times thinner than Earth’s, so even fast gusts push gently and will not knock you over, and the wind sounds like a low, muffled rumble. The real dangers are fine dust that clogs equipment and the loss of sunlight for solar panels. Global storms like the one in 2018 can last for weeks.'
  };
}

function dayInfo(v) {
  const tod = v / 4;
  return {
    title: 'Day and night',
    label: dayLabel(tod),
    stats: [
      ['Local solar time', fmtTime(tod)],
      ['Air temperature', '≈ ' + fmt(dayTemp(tod)) + ' °C'],
      ['Length of a sol', '24 h 39 min']
    ],
    note: 'Drag the slider through one Martian day. Fine dust scatters light differently than Earth’s air: the sky stays butterscotch, but around the low Sun it glows blue, so Martian sunsets are blue. With so little air to hold heat, temperatures swing by roughly 80 °C between the afternoon and the hour before dawn (typical of an equatorial site such as Gale Crater; values are approximate). The midday Sun is drawn lower than the real one so it stays in view.'
  };
}

function moonsInfo(v) {
  const tod = v / 4;
  return {
    title: 'Phobos and Deimos',
    label: sunAt(tod).el > -0.03 ? 'Daytime: Phobos crosses the Sun' : 'Night: both moons in the sky',
    stats: [
      ['Local solar time', fmtTime(tod)],
      ['Phobos', '≈ 0.2° wide, about half the Sun'],
      ['Deimos', 'a bright star-like point']
    ],
    note: 'Phobos orbits in 7 h 39 min, faster than Mars turns, so it rises in the west and sets in the east, crossing the sky in a few hours. When it passes in front of the Sun it only blocks part of the disc (a partial eclipse); rovers have photographed these transits. Deimos is so small it never shows a disc, just a bright point, roughly like Venus seen from Earth. Sizes are enlarged and the transit is slowed here so you can watch it.'
  };
}

function quakeInfo(v) {
  const p = quakeParams(v);
  const felt = v === 0 ? '—' : v <= 3 ? 'Barely noticeable' : v <= 6 ? 'Clearly felt' : v <= 9 ? 'Strong shaking' : 'Strongest shaking';
  return {
    title: 'Marsquake',
    label: p.label,
    stats: [
      ['Magnitude', v === 0 ? '—' : 'M ' + p.mag.toFixed(1)],
      ['Shaking', felt],
      ['InSight record', '> 1,300 quakes, largest ≈ M 4.7']
    ],
    note: 'NASA’s InSight lander listened to Mars from 2018 to 2022. Most quakes were small (about M 2–3), caused by the crust slowly cracking as the planet cools; a few came from under Cerberus Fossae. Thin air carries almost no sound, so you would feel the ground move rather than hear it; the low rumble here is an artistic rendering. Real events repeat far less often than this simulation shows.'
  };
}

export function createSimUI(o) {
  const { openBtn, scene, backBtn, sim, audio } = o;
  const soundBtn = scene.querySelector('#sim-sound');
  const modeBtns = Array.prototype.slice.call(scene.querySelectorAll('.sim-mode'));
  const slider = scene.querySelector('#sim-level');
  const out = scene.querySelector('#sim-val');
  const ends = scene.querySelectorAll('.sim-end');
  const title = scene.querySelector('#sim-title');
  const label = scene.querySelector('#sim-label');
  const stats = scene.querySelector('#sim-stats');
  const note = scene.querySelector('#sim-note');

  function sync(s) {
    modeBtns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-mode') === s.scenario)); });
    const cfg = s.scenario ? SCENARIOS[s.scenario] : SCENARIOS.storm;
    slider.max = String(cfg.max);
    slider.setAttribute('aria-label', cfg.time ? 'Time of day, 0 to 24 hours' : 'Strength, 0 to 10');
    ends[0].textContent = cfg.time ? '00:00' : '0';
    ends[1].textContent = cfg.time ? '24:00' : '10';
    slider.disabled = !s.scenario;
    slider.value = String(s.value);
    out.textContent = cfg.time ? fmtTime(s.value / 4) : String(s.value);
    if (!s.scenario) {
      title.textContent = 'Choose a simulation';
      label.textContent = 'A flat patch of Martian ground under a normal daytime sky. Pick a scenario above, then set its strength.';
      stats.innerHTML = ''; note.textContent = '';
      return;
    }
    const info = { storm: stormInfo, quake: quakeInfo, day: dayInfo, moons: moonsInfo }[s.scenario](s.value);
    title.textContent = info.title;
    label.textContent = info.label;
    stats.innerHTML = '';
    info.stats.forEach(function (r) {
      const d = document.createElement('div');
      const a = document.createElement('dt'); a.textContent = r[0];
      const b = document.createElement('dd'); b.textContent = r[1];
      d.appendChild(a); d.appendChild(b); stats.appendChild(d);
    });
    note.textContent = info.note;
  }
  sim.onChange(sync);
  sync(sim.get());

  let isOpen = false;
  function open() {
    if (isOpen) return;
    isOpen = true;
    scene.hidden = false;
    document.body.classList.add('sim-on');
    sim.start();
    if (audio) audio.start();
  }
  function close() {
    if (!isOpen) return;
    isOpen = false;
    scene.hidden = true;
    document.body.classList.remove('sim-on');
    openBtn.setAttribute('aria-pressed', 'false');
    openBtn.blur();
    sim.stop();
    if (audio) audio.stop();
  }
  openBtn.addEventListener('click', open);
  backBtn.addEventListener('click', close);
  window.addEventListener('keydown', function (e) {
    if (isOpen && e.key === 'Escape') { e.stopImmediatePropagation(); close(); }
  }, true);
  modeBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      const m = b.getAttribute('data-mode');
      sim.setScenario(sim.get().scenario === m ? null : m);
    });
  });
  function syncSound() {
    if (!soundBtn || !audio) return;
    const on = audio.isEnabled();
    soundBtn.setAttribute('aria-pressed', String(on));
    soundBtn.textContent = on ? 'Sound: on' : 'Sound: off';
  }
  if (soundBtn) {
    if (!audio) soundBtn.hidden = true;
    soundBtn.addEventListener('click', function () { audio.setEnabled(!audio.isEnabled()); syncSound(); });
    syncSound();
  }
  slider.addEventListener('input', function () { sim.setValue(parseInt(slider.value, 10)); });
  return { open, close, isOpen: () => isOpen };
}
