import { ELEV_RAMP, TEMP_RAMP, K_HI, K_LO, rampFrom } from '../data/colorRamps.js';
import { H_HI, H_LO } from '../config.js';

export const LEGEND_TICKS = {
  elev: [-8, -4, 0, 4, 8, 12, 16, 20],
  tempC: [-120, -90, -60, -30, 0, 30],
};

export function makeRampTexture({ THREE, tab = ELEV_RAMP, lo = H_LO, hi = H_HI }) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 1;
  const g = c.getContext('2d');
  const img = g.createImageData(256, 1);
  for (let i = 0; i < 256; i++) {
    const col = rampFrom(tab, lo + (hi - lo) * i / 255);
    img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1]; img.data[i * 4 + 2] = col[2]; img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function createLegend({ root, bar, ticks }) {
  const titleEl = root.querySelector('.legend-title');
  function setMode(m) {
    const isTemp = m === 2;
    const tab = isTemp ? TEMP_RAMP : ELEV_RAMP;
    const lo = isTemp ? K_LO : H_LO, hi = isTemp ? K_HI : H_HI;
    const stops = tab.map(st => `rgb(${st[1].join(',')}) ${(((st[0] - lo) / (hi - lo)) * 100).toFixed(1)}%`);
    bar.style.background = `linear-gradient(90deg,${stops.join(',')})`;
    ticks.innerHTML = '';
    (isTemp ? LEGEND_TICKS.tempC : LEGEND_TICKS.elev).forEach(v => {
      const x = isTemp ? v + 273.15 : v;
      const el = document.createElement('span');
      el.className = 'legend-tick';
      el.style.left = `${(((x - lo) / (hi - lo)) * 100).toFixed(2)}%`;
      el.textContent = (v < 0 ? '−' : v > 0 ? '+' : '') + Math.abs(v);
      ticks.appendChild(el);
    });
    titleEl.textContent = isTemp ? 'Surface temperature, °C (modelled, live)' : 'Elevation above the Mars datum, km';
  }
  setMode(1);
  return { setMode };
}
