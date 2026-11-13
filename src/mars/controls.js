// mars/controls.js — view modes, fly, zoom, grid, tiles, readout
import { D2R, GEO_SIZES } from '../config.js';
import { clampDist, faceAngles } from '../lib/view.js';
import { lonText, pad2, fmtLonLat } from '../lib/format.js';
import { TILES, overlay } from '../data/tiles.js';

/**
 * @param {object} deps
 */
export function createMarsControls(deps) {
  const {
    mv,
    getMarsMat,
    getMarsSpin,
    tmpQ,
    tmpV,
    getSunInfo,
    legend,
    legendEl,
    elev,
    layoutPop,
    btnGrid,
    sectorEl,
    sunEl,
    lodEl,
    tex,
    tiles,
    geo,
    labels,
    homeArmedRef, // { v: boolean } or getter
    updateHome,
    onDirty
  } = deps;

  let viewMode = 0;
  let gridOn = false;

  function clearPressed() {
    // кнопки быстрого перехода внизу и список мест в панели Markers
    const bs = document.querySelectorAll('#mars-nav button, #poi-list button');
    for (let i = 0; i < bs.length; i++) bs[i].setAttribute('aria-pressed', 'false');
  }

  function flyTo(lonDeg, latDeg, dist) {
    const f = faceAngles(lonDeg, latDeg);
    mv.tSpin = f.spin;
    mv.tPitch = Math.max(-1.45, Math.min(1.45, f.pitch));
    mv.tDist = clampDist(dist);
    mv.fly = true;
    mv.auto = false;
    mv.userZoomed = true;
    mv.vSpin = 0;
    mv.vPitch = 0;
  }

  function startView() {
    const sunInfo = getSunInfo();
    let lon = sunInfo.lonE - 40;
    return faceAngles(lon > 180 ? lon - 360 : lon < -180 ? lon + 360 : lon, 12);
  }

  function resetMarsView(initial) {
    const f = startView();
    mv.spin = f.spin;
    mv.pitch = f.pitch;
    mv.dist = initial ? 12 : mv.dist;
    mv.tDist = mv.fit;
    mv.fly = false;
    mv.auto = true;
    mv.dragging = false;
    mv.vSpin = 0;
    mv.vPitch = 0;
    mv.userZoomed = false;
  }

  function zoomBy(factor) {
    mv.userZoomed = true;
    mv.auto = false;
    mv.fly = false;
    mv.tDist = clampDist(mv.tDist * factor);
  }

  function setViewMode(m) {
    viewMode = m;
    const OV_IDS = ['rough', 'dust', 'plag', 'glass', 'tin'];
    overlay.id = m >= 3 ? OV_IDS[m - 3] : 'elev';
    const marsMat = getMarsMat();
    if (marsMat) marsMat.uniforms.uMode.value = m >= 3 ? 3 : m;
    legendEl.hidden = m === 0 || m >= 3;
    if (m > 0 && m < 3) legend.setMode(m);
    elev.resetBlank();
    elev.syncElev();
    const opts = layoutPop.querySelectorAll('.opt');
    for (let i = 0; i < opts.length; i++) {
      opts[i].setAttribute('aria-checked', String(parseInt(opts[i].getAttribute('data-mode'), 10) === m));
    }
  }

  function setGrid(on) {
    gridOn = on;
    const marsMat = getMarsMat();
    const homeArmed = typeof homeArmedRef === 'function' ? homeArmedRef() : homeArmedRef?.v;
    if (marsMat) marsMat.uniforms.uGrid.value = on || homeArmed ? 1 : 0;
    btnGrid.setAttribute('aria-pressed', String(on));
    if (marsMat && getMarsSpin()) {
      getMarsSpin().getWorldQuaternion(tmpQ);
      tmpV.set(0, 0, 1).applyQuaternion(tmpQ.clone().invert());
      updateSector(
        Math.atan2(-tmpV.z, tmpV.x) / D2R,
        Math.asin(Math.max(-1, Math.min(1, tmpV.y))) / D2R
      );
      if (onDirty) onDirty();
    }
    if (!on) labels.hideGridLabels();
  }

  function updateTiles() {
    if (mv.dist > (tiles.state.tileCur ? 3.4 : 2.9) || tex.texLv[tex.MAX_LEVEL].state !== 2) {
      tiles.tileUpdate(0, 0, false);
      tiles.state.tileWant = null;
      return;
    }
    getMarsSpin().getWorldQuaternion(tmpQ);
    tmpV.set(0, 0, 1).applyQuaternion(tmpQ.clone().invert());
    const zp = Math.min(
      TILES.zPlanetMax,
      TILES.zMax,
      4 + (mv.dist < 1.8) + (mv.dist < 1.4) + (mv.dist < 1.2)
    );
    tiles.tileUpdate(
      Math.atan2(-tmpV.z, tmpV.x) / D2R,
      Math.asin(Math.max(-1, Math.min(1, tmpV.y))) / D2R,
      true,
      zp
    );
  }

  function updateSector(lonC, latC) {
    const marsMat = getMarsMat();
    if (!gridOn) {
      sectorEl.textContent = '';
      if (marsMat) marsMat.uniforms.uCell.value.set(0, 0, 0, 0);
      return;
    }
    const l0 = Math.max(-180, Math.min(150, Math.floor(lonC / 30) * 30));
    const a0 = Math.max(-90, Math.min(60, Math.floor(latC / 30) * 30));
    const c = marsMat.uniforms.uCell.value;
    if (c.x !== l0 || c.z !== a0) {
      c.set(l0, l0 + 30, a0, a0 + 30);
      if (onDirty) onDirty();
    }
    const sunInfo = getSunInfo();
    const lm = l0 + 15;
    let lt = (12 + (lm - sunInfo.lonE) / 15) % 24;
    if (lt < 0) lt += 24;
    const hh = Math.floor(lt);
    const mm = Math.floor((lt - hh) * 60);
    sectorEl.textContent =
      'Grid sector ' +
      lonText(l0) +
      ' – ' +
      lonText(l0 + 30) +
      ' · ' +
      Math.abs(a0) +
      '°' +
      (a0 < 0 ? 'S' : 'N') +
      ' – ' +
      Math.abs(a0 + 30) +
      '°' +
      (a0 + 30 < 0 ? 'S' : a0 + 30 === 0 ? '' : 'N') +
      ' · solar time at its centre ' +
      pad2(hh) +
      ':' +
      pad2(mm);
  }

  function updateReadout() {
    getMarsSpin().getWorldQuaternion(tmpQ);
    tmpV.set(0, 0, 1).applyQuaternion(tmpQ.clone().invert());
    const lonC = Math.atan2(-tmpV.z, tmpV.x) / D2R;
    const sunInfo = getSunInfo();
    let ltst = (12 + (lonC - sunInfo.lonE) / 15) % 24;
    if (ltst < 0) ltst += 24;
    const hh = Math.floor(ltst);
    const mm = Math.floor((ltst - hh) * 60);
    const day = ltst > 6 && ltst < 18 ? 'day' : 'night';
    updateHome();
    updateSector(lonC, Math.asin(Math.max(-1, Math.min(1, tmpV.y))) / D2R);
    sunEl.textContent =
      'Sun over ' +
      fmtLonLat(sunInfo.lonE, sunInfo.lat) +
      ' · Ls ' +
      sunInfo.Ls.toFixed(0) +
      '° · solar time at view centre ' +
      pad2(hh) +
      ':' +
      pad2(mm) +
      ' (' +
      day +
      ')';
  }

  function updateLodText() {
    if (!lodEl) return;
    const lv = tex.state.texCur >= 0 ? tex.LEVELS[tex.state.texCur].name : '…';
    const g = geo.geoCur >= 0 ? GEO_SIZES[geo.geoCur][0] + '×' + GEO_SIZES[geo.geoCur][1] : '…';
    lodEl.textContent =
      'Detail level ' +
      (Math.max(tex.state.texCur, 0) + 1) +
      ' · ' +
      lv +
      ' maps' +
      (tiles.state.tileCur ? ' + zoom ' + tiles.state.tileCur.z : '') +
      ' · mesh ' +
      g;
  }

  function holdZoom(btn, factor) {
    let timer = 0;
    function stop() {
      if (timer) {
        clearInterval(timer);
        timer = 0;
      }
    }
    btn.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      zoomBy(factor);
      stop();
      timer = setInterval(function () {
        zoomBy(factor > 1 ? 1.06 : 0.94);
      }, 70);
    });
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointerleave', stop);
    btn.addEventListener('pointercancel', stop);
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        zoomBy(factor);
      }
    });
  }

  return {
    clearPressed,
    flyTo,
    startView,
    resetMarsView,
    zoomBy,
    setViewMode,
    setGrid,
    updateTiles,
    updateSector,
    updateReadout,
    updateLodText,
    holdZoom,
    getViewMode: () => viewMode,
    getGridOn: () => gridOn,
    setViewModeValue: (m) => { viewMode = m; },
    setGridOnValue: (g) => { gridOn = g; }
  };
}
