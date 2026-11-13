// mars/home.js — домашний сектор
import { D2R } from '../config.js';
import { lonText } from '../lib/format.js';

/**
 * @param {object} deps
 */
export function createHome(deps) {
  const {
    getMarsMat,
    siteHeightKm,
    getSunInfo,
    btnHome,
    homeEl,
    surfHomeEl,
    marsHint,
    getMarsHintText,
    setMarsHintText,
    getMode,
    getTransitioning,
    renderer,
    getGridOn,
    setArmed,
    getPegArmed,
    pickMars,
    onHomeChange // optional callback for renderDirty etc.
  } = deps;

  let home = null;
  let homeArmed = false;
  let homeHCache = null;

  try {
    const hs = JSON.parse(localStorage.getItem('marsHome2') || 'null');
    if (hs && isFinite(hs.lon) && isFinite(hs.lat)) home = { lon: hs.lon, lat: hs.lat };
  } catch (e) { /* ignore */ }

  function homeTemp() {
    if (!home) return 0;
    const lon = (home.lon + 0.5) * D2R;
    const lat = (home.lat + 0.5) * D2R;
    const sl = Math.sin(lat);
    const cl = Math.cos(lat);
    const Nn = [cl * Math.cos(lon), sl, -cl * Math.sin(lon)];
    const sunInfo = getSunInfo();
    const lagLon = (sunInfo.lonE + 18) * D2R;
    const lagLat = sunInfo.lat * D2R;
    const Ll = [
      Math.cos(lagLat) * Math.cos(lagLon),
      Math.sin(lagLat),
      -Math.cos(lagLat) * Math.sin(lagLon)
    ];
    const marsMat = getMarsMat();
    const flux = marsMat ? marsMat.uniforms.uFlux.value : 586;
    const cz = Math.max(Nn[0] * Ll[0] + Nn[1] * Ll[1] + Nn[2] * Ll[2], 0);
    const sinD = Ll[1];
    const cosD = Math.sqrt(Math.max(1 - sinD * sinD, 1e-4));
    const cH = Math.max(-1, Math.min(1, -(sl / Math.max(cl, 0.02)) * (sinD / cosD)));
    const H0 = Math.acos(cH);
    const Q = Math.max(flux / Math.PI * (H0 * sl * sinD + cl * cosD * Math.sin(H0)), 0);
    const kk = (1 - 0.24) / (0.98 * 5.67e-8);
    const Tn = 0.8 * Math.pow(Q * kk, 0.25);
    const Te = Math.pow(cz * flux * kk, 0.25);
    const T = Math.pow(Math.pow(Tn, 4) + 0.93 * Math.pow(Te, 4), 0.25);
    return Math.max(148, Math.min(318, T)) - 273.15;
  }

  function homeElev() {
    if (!home) return null;
    if (homeHCache && homeHCache.key === home.lon + ',' + home.lat) return homeHCache.v;
    let sum = 0;
    let n = 0;
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 3; i++) {
        const h = siteHeightKm(home.lon + (i + 0.5) / 3, home.lat + (j + 0.5) / 3);
        if (h === null) return null;
        sum += h;
        n++;
      }
    }
    homeHCache = { key: home.lon + ',' + home.lat, v: sum / n };
    return homeHCache.v;
  }

  function homeText() {
    if (!home) return '';
    const e = homeElev();
    const t = homeTemp();
    function sg(v, d) {
      return (v < 0 ? '−' : v > 0 ? '+' : '') + Math.abs(v).toFixed(d);
    }
    const la0 = home.lat;
    const la1 = home.lat + 1;
    return (
      'Home sector ' +
      lonText(home.lon) +
      ' – ' +
      lonText(home.lon + 1) +
      ' · ' +
      Math.abs(la0) +
      '°' +
      (la0 < 0 ? 'S' : la0 > 0 ? 'N' : '') +
      ' – ' +
      Math.abs(la1) +
      '°' +
      (la1 < 0 ? 'S' : la1 > 0 ? 'N' : '') +
      ' · elevation ≈ ' +
      (e === null ? '…' : sg(e, 1) + ' km') +
      ' · temperature ≈ ' +
      sg(t, 0) +
      ' °C'
    );
  }

  function updateHome() {
    const tx = homeText();
    homeEl.hidden = !tx;
    homeEl.textContent = tx;
    if (surfHomeEl) {
      surfHomeEl.hidden = !tx;
      surfHomeEl.textContent = tx;
    }
    const marsMat = getMarsMat();
    if (marsMat) {
      marsMat.uniforms.uHome.value.set(
        home ? home.lon : 0,
        home ? home.lon + 1 : 0,
        home ? home.lat : 0,
        home ? home.lat + 1 : 0
      );
    }
    if (onHomeChange) onHomeChange();
  }

  function setHomeArmed(on) {
    homeArmed = on;
    btnHome.setAttribute('aria-pressed', String(on));
    if (on && getPegArmed()) setArmed(false);
    if (marsHint) {
      marsHint.textContent = on
        ? 'Click a spot to mark your home area (~60 km) · click it again to clear'
        : getMarsHintText();
    }
    const marsMat = getMarsMat();
    if (marsMat) marsMat.uniforms.uGrid.value = (on || getGridOn()) ? 1 : 0;
    if (getMode() === 'mars') renderer.domElement.style.cursor = on ? 'crosshair' : 'grab';
    if (onHomeChange) onHomeChange();
  }

  function getHome() {
    return home;
  }
  function getHomeArmed() {
    return homeArmed;
  }

  // listeners
  btnHome.addEventListener('click', function () {
    if (getMode() === 'mars' && !getTransitioning()) setHomeArmed(!homeArmed);
  });

  const homeDown = { x: 0, y: 0 };
  const cv = renderer.domElement;
  cv.addEventListener('pointerdown', function (e) {
    homeDown.x = e.clientX;
    homeDown.y = e.clientY;
  });
  cv.addEventListener('click', function (e) {
    if (getMode() !== 'mars' || !homeArmed || getTransitioning()) return;
    if (Math.hypot(e.clientX - homeDown.x, e.clientY - homeDown.y) > 6) return;
    const hit = pickMars(e.clientX, e.clientY);
    if (!hit) return;
    const l0 = Math.max(-180, Math.min(179, Math.floor(hit.lon)));
    const a0 = Math.max(-90, Math.min(89, Math.floor(hit.lat)));
    if (home && home.lon === l0 && home.lat === a0) home = null;
    else home = { lon: l0, lat: a0 };
    try {
      if (home) localStorage.setItem('marsHome2', JSON.stringify(home));
      else localStorage.removeItem('marsHome2');
    } catch (err) { /* ignore */ }
    setHomeArmed(false);
    updateHome();
  });

  return {
    homeTemp,
    homeElev,
    homeText,
    updateHome,
    setHomeArmed,
    getHome,
    getHomeArmed
  };
}
