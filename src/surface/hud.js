// surface/hud.js — surfHud, surfCompass
import { D2R } from '../config.js';
import { fmtClock, fmtLonLat } from '../lib/format.js';

/**
 * @param {object} deps
 */
export function createSurfHud(deps) {
  const {
    getSurf,
    homeText,
    surfHomeEl,
    surfLocEl,
    surfSunEl,
    surfPhaseEl,
    surfTimeEl,
    surfSubEl,
    cpCard,
    cpRead
  } = deps;

  const cpNames = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

  function surfHud() {
    const surf = getSurf();
    const ss = surf.ss;
    if (!ss) return;
    const htx = homeText();
    surfHomeEl.hidden = !htx;
    surfHomeEl.textContent = htx;
    const lonDeg = surf.lon / D2R;
    const latDeg = surf.lat / D2R;
    let ltst = (12 + (lonDeg - ss.lonE) / 15) % 24;
    if (ltst < 0) ltst += 24;
    const alt = Math.asin(Math.max(-1, Math.min(1, surf.sU))) / D2R;
    let az = Math.atan2(surf.sE, surf.sN) / D2R;
    if (az < 0) az += 360;
    const morning = ltst < 12;
    let phase;
    if (alt > 6) phase = morning ? 'Morning' : 'Afternoon';
    else if (alt > 0) phase = morning ? 'Sunrise' : 'Sunset';
    else if (alt > -6) phase = morning ? 'Dawn' : 'Dusk';
    else if (alt > -18) phase = morning ? 'Pre-dawn twilight' : 'Evening twilight';
    else phase = 'Night';
    surfPhaseEl.textContent = phase;
    surfTimeEl.textContent = fmtClock(ltst);
    const sinD = Math.sin(ss.lat * D2R);
    const cosD = Math.cos(ss.lat * D2R);
    const sinP = Math.sin(surf.lat);
    const cosP = Math.cos(surf.lat);
    const cH = (Math.sin(-0.27 * D2R) - sinP * sinD) / Math.max(1e-6, cosP * cosD);
    let rs;
    if (cH > 1) rs = 'Polar night: the Sun does not rise today';
    else if (cH < -1) rs = 'Polar day: the Sun does not set today';
    else {
      const H0 = Math.acos(cH) / D2R / 15;
      rs = 'Sunrise ' + fmtClock(12 - H0) + ' · Sunset ' + fmtClock(12 + H0);
    }
    surfSubEl.textContent = 'Local solar time (Mars hours) · ' + rs;
    surfLocEl.textContent =
      fmtLonLat(lonDeg, latDeg) +
      (surf.siteKm === null
        ? ''
        : ' · elevation ' + (surf.siteKm < 0 ? '−' : '') + Math.abs(surf.siteKm).toFixed(1) + ' km');
    surfSunEl.textContent =
      'Sun ' +
      (alt >= 0 ? '+' : '−') +
      Math.abs(alt).toFixed(1) +
      '° · azimuth ' +
      az.toFixed(0) +
      '° · Ls ' +
      ss.Ls.toFixed(0) +
      '°';
  }

  function surfCompass() {
    const surf = getSurf();
    let yd = (surf.yaw / D2R) % 360;
    if (yd < 0) yd += 360;
    cpCard.setAttribute('transform', 'rotate(' + (-yd).toFixed(1) + ' 100 100)');
    cpRead.textContent = cpNames[Math.round(yd / 45) % 8] + ' ' + Math.round(yd) + '°';
  }

  return { surfHud, surfCompass };
}
