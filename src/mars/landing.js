// mars/landing.js — pin + preview + Land here
import { THREE } from '../core/three.js';
import { D2R } from '../config.js';
import { fmtLonLat } from '../lib/format.js';
import { wait } from '../lib/async.js';
import { sunFor } from '../data/marsSolar.js';

/**
 * @param {object} deps
 */
export function createLanding(deps) {
  const {
    getMode,
    getTransitioning,
    getMarsCam,
    getMarsSpin,
    getFlatOn,
    getFl,
    renderer,
    tex,
    siteHeightKm,
    loadSurfHeight,
    buildSurfaceIfNeeded,
    getSurfMat,
    getSurfCam,
    getSurfScene,
    setSurfTexDirty, // () => { surf.tex = -1 }
    dropExplorer,
    getDetailModel,
    onDetail,
    onDirty
  } = deps;

  let landPin = null;
  let lpToken = 0;
  let lpRT = null;
  let surfHeight = null;

  const lpEl = document.getElementById('land-pin');
  const lpCard = lpEl.querySelector('.lp-card');
  const lpView = document.getElementById('lp-view');
  const lpTitle = document.getElementById('lp-title');
  const lpSub = document.getElementById('lp-sub');
  const lpGo = document.getElementById('lp-go');
  const lpCancel = document.getElementById('lp-cancel');
  const lpDetail = document.getElementById('lp-detail');
  let lpModel = null;
  if (lpDetail) {
    lpDetail.addEventListener('click', function () {
      if (landPin && lpModel && onDetail) onDetail(lpModel, landPin.lon, landPin.lat);
    });
  }
  const lpCtx = lpView.getContext('2d');
  const lpV = new THREE.Vector3();
  const lpC = new THREE.Vector3();

  function clearPin() {
    landPin = null;
    lpToken++;
    lpEl.hidden = true;
  }

  function placePin(lonDeg, latDeg) {
    landPin = { lon: lonDeg, lat: latDeg };
    lpEl.hidden = false;
    lpTitle.textContent = fmtLonLat(lonDeg, latDeg);
    const h = siteHeightKm(lonDeg, latDeg);
    lpModel = !getDetailModel ? null : getDetailModel(lonDeg, latDeg);
    if (lpDetail) {
      lpDetail.hidden = !lpModel;
      if (lpModel) lpDetail.title = 'Explore a high-detail 3D model of ' + lpModel.name;
    }
    lpSub.textContent = h === null ? '' : 'elevation ' + (h < 0 ? '−' : '') + Math.abs(h).toFixed(1) + ' km';
    lpView.classList.add('wait');
    updateLandPin();
    const tk = ++lpToken;
    Promise.race([
      Promise.all([tex.requestLevel(1), loadSurfHeight()]),
      wait(8000)
    ]).then(function (r) {
      if (r && r[1]) surfHeight = r[1];
      if (tk !== lpToken || !landPin || getMode() !== 'mars') return;
      return wait(30);
    }).then(function () {
      if (tk !== lpToken || !landPin || getMode() !== 'mars') return;
      try {
        drawPreview(landPin.lon, landPin.lat);
        lpView.classList.remove('wait');
      } catch (err) { /* preview optional */ }
    });
  }

  function drawPreview(lonDeg, latDeg) {
    buildSurfaceIfNeeded();
    let use = -1;
    for (let i = tex.MAX_LEVEL; i >= 0; i--) {
      if (tex.texLv[i].state === 2) {
        use = i;
        break;
      }
    }
    if (use < 0) return;
    const H = surfHeight || { tex: tex.texLv[use].height, w: tex.H_W, h: tex.H_H };
    const lon = lonDeg * D2R;
    const lat = Math.max(-1.52, Math.min(1.52, latDeg * D2R));
    const cl = Math.max(0.05, Math.cos(lat));
    const S = sunFor(lon, lat, 0);
    const alt = Math.asin(Math.max(-1, Math.min(1, S.sU)));
    const az = Math.atan2(S.sE, S.sN);
    const W = lpView.width;
    const Ht = lpView.height;
    const th = Math.tan(35 * D2R);
    const surfMat = getSurfMat();
    const u = surfMat.uniforms;
    u.uColor.value = tex.texLv[use].color;
    u.uHeight.value = H.tex;
    u.uRes.value.set(H.w, H.h);
    u.uObsLL.value.set(lon, lat);
    u.uSeed.value.set((lon * 3389.5 * cl) % 200, (lat * 3389.5) % 200);
    const bx = (lon / (2 * Math.PI) + 0.5) * H.w;
    const by = (lat / Math.PI + 0.5) * H.h;
    u.uP0.value.set(Math.floor(bx), Math.floor(by), bx - Math.floor(bx), by - Math.floor(by));
    u.uSun.value.set(S.sE, S.sN, S.sU);
    u.uStar.value.set(
      S.c0[0], S.c1[0], S.c2[0],
      S.c0[1], S.c1[1], S.c2[1],
      S.c0[2], S.c1[2], S.c2[2]
    );
    u.uView.value.set(alt < 0.45 ? az : az + Math.PI, 0.07);
    u.uScr.value.set(th, W / Ht);
    u.uPx.value = 2 * th / Ht;
    if (!lpRT) {
      lpRT = new THREE.WebGLRenderTarget(W, Ht, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        depthBuffer: false,
        stencilBuffer: false
      });
    }
    const surfScene = getSurfScene();
    const surfCam = getSurfCam();
    renderer.setRenderTarget(lpRT);
    renderer.render(surfScene, surfCam);
    renderer.setRenderTarget(null);
    const buf = new Uint8Array(W * Ht * 4);
    renderer.readRenderTargetPixels(lpRT, 0, 0, W, Ht, buf);
    const img = lpCtx.createImageData(W, Ht);
    for (let y = 0; y < Ht; y++) {
      img.data.set(buf.subarray((Ht - 1 - y) * W * 4, (Ht - y) * W * 4), y * W * 4);
    }
    lpCtx.putImageData(img, 0, 0);
    setSurfTexDirty();
    if (onDirty) onDirty();
  }

  function updateLandPin() {
    if (!landPin || getMode() !== 'mars') return;
    const marsCam = getMarsCam();
    if (!marsCam) return;
    let facing = true;
    if (getFlatOn()) {
      const fl = getFl();
      let px = landPin.lon / 90;
      const c0 = fl.lon / 90;
      while (px - c0 > 2) px -= 4;
      while (px - c0 < -2) px += 4;
      lpV.set(px, landPin.lat / 90, 0);
    } else {
      const lo = landPin.lon * D2R;
      const la = landPin.lat * D2R;
      lpV.set(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo));
      getMarsSpin().localToWorld(lpV);
      lpC.copy(marsCam.position).sub(lpV);
      facing = lpV.dot(lpC) > 0;
    }
    lpEl.style.visibility = facing ? 'visible' : 'hidden';
    if (!facing) return;
    lpV.project(marsCam);
    const x = (lpV.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-lpV.y * 0.5 + 0.5) * window.innerHeight;
    lpEl.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
    const cw = lpCard.offsetWidth || 210;
    const ch = lpCard.offsetHeight || 190;
    const left = x + 24 + cw > window.innerWidth - 8 ? -(cw + 24) : 24;
    const top = Math.max(8 - y, Math.min(window.innerHeight - 8 - ch - y, -ch * 0.5 - 18));
    lpCard.style.left = left + 'px';
    lpCard.style.top = top + 'px';
  }

  lpGo.addEventListener('click', function () {
    if (!landPin || getTransitioning() || getMode() !== 'mars') return;
    dropExplorer(landPin.lon, landPin.lat);
  });
  lpCancel.addEventListener('click', clearPin);

  return {
    placePin,
    clearPin,
    drawPreview,
    updateLandPin,
    getLandPin: () => landPin,
    setSurfHeight: (h) => { surfHeight = h; },
    getSurfHeight: () => surfHeight
  };
}
