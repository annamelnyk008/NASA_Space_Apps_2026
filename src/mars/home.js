// mars/home.js — домашняя точка. Раньше это был сектор 1°×1° (~60 км), теперь — точная точка lon/lat;
// подсветка в шейдере сжата до маленького пятна вокруг неё.
// Назначается из карточки метки (markers/marks.js: «Make home»); сам пин и карточку рисует marks.js.
import { D2R } from '../config.js';
import { fmtLonLatPrecise, fmtSigned } from '../lib/format.js';
import { wrap180 } from '../lib/math.js';

const HOME_BOX = 0.06;      // полуразмер подсветки в шейдере, °

/**
 * @param {object} deps
 */
export function createHome(deps) {
  const {
    getMarsMat,
    siteHeightKm,
    getSunInfo,
    homeEl,
    surfHomeEl,
    onHomeChange // optional callback: renderDirty, перерисовка пинов и т.п.
  } = deps;

  let home = null;

  // новый формат — точка; старый ('marsHome2') — сектор 1°, берём его центр
  try {
    const h3 = JSON.parse(localStorage.getItem('marsHome3') || 'null');
    if (h3 && isFinite(h3.lon) && isFinite(h3.lat)) {
      home = { lon: h3.lon, lat: h3.lat };
    } else {
      const h2 = JSON.parse(localStorage.getItem('marsHome2') || 'null');
      if (h2 && isFinite(h2.lon) && isFinite(h2.lat)) home = { lon: h2.lon + 0.5, lat: h2.lat + 0.5 };
    }
  } catch (e) { /* ignore */ }

  // ---- физика точки (используется и флажками) ----

  /** Примерная температура поверхности в точке сейчас, °C */
  function pointTemp(lonDeg, latDeg) {
    const lon = lonDeg * D2R;
    const lat = latDeg * D2R;
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

  /** Высота точки, км (null — карта высот ещё не загружена) */
  function pointElev(lonDeg, latDeg) {
    return siteHeightKm(lonDeg, latDeg);
  }

  const homeTemp = () => (home ? pointTemp(home.lon, home.lat) : 0);
  const homeElev = () => (home ? pointElev(home.lon, home.lat) : null);

  function homeText() {
    if (!home) return '';
    const e = homeElev();
    return (
      'Home ' +
      fmtLonLatPrecise(home.lon, home.lat) +
      ' · elevation ≈ ' +
      (e === null ? '…' : fmtSigned(e, 1) + ' km') +
      ' · temperature ≈ ' +
      fmtSigned(homeTemp(), 0) +
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
        home ? home.lon - HOME_BOX : 0,
        home ? home.lon + HOME_BOX : 0,
        home ? home.lat - HOME_BOX : 0,
        home ? home.lat + HOME_BOX : 0
      );
    }
    if (onHomeChange) onHomeChange();
  }

  function saveHome() {
    try {
      if (home) localStorage.setItem('marsHome3', JSON.stringify(home));
      else localStorage.removeItem('marsHome3');
      localStorage.removeItem('marsHome2'); // старый секторный формат больше не нужен
    } catch (err) { /* ignore */ }
  }

  /** Назначить домашнюю точку (градусы, восток +). */
  function setHome(lonDeg, latDeg) {
    home = {
      lon: Math.round(wrap180(lonDeg) * 100) / 100,
      lat: Math.round(Math.max(-89.9, Math.min(89.9, latDeg)) * 100) / 100
    };
    saveHome();
    updateHome();
  }

  function clearHome() {
    if (!home) return;
    home = null;
    saveHome();
    updateHome();
  }

  function isHome(lonDeg, latDeg, tolDeg) {
    if (!home) return false;
    const tol = tolDeg === undefined ? 0.02 : tolDeg;
    return Math.abs(wrap180(lonDeg - home.lon)) <= tol && Math.abs(latDeg - home.lat) <= tol;
  }

  function getHome() {
    return home;
  }

  return {
    homeTemp,
    homeElev,
    homeText,
    pointTemp,
    pointElev,
    updateHome,
    setHome,
    clearHome,
    isHome,
    getHome
  };
}
