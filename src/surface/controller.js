// surface/controller.js — dropExplorer, closeSurface, updateSurface, surfSun, applySurfTex, loadSurfHeight
import { THREE } from '../core/three.js';
import { D2R, PANO_MIN_FOV } from '../config.js';
import { HEAVY } from '../app/device.js';
import { wait } from '../lib/async.js';
import { sunFor } from '../data/marsSolar.js';
import { clampFov } from '../lib/view.js';

/**
 * @param {object} deps
 */
export function createSurfaceController(deps) {
  const {
    getMode,
    setMode,
    getTransitioning,
    setTransitioning,
    veil,
    marsUI,
    layoutPop,
    btnLayout,
    surfUIEl,
    surfBack,
    renderer,
    BASE_PR,
    resize,
    tex,
    tiles,
    geo,
    clearPressed,
    flyTo,
    showFact,
    setArmed,
    siteHeightKm,
    surfaceScene, // createSurfaceScene result
    pano,         // createPano result
    surfHudApi,   // createSurfHud result
    marsBack,
    getRenderDirty,
    setRenderDirty,
    onDirty
  } = deps;

  const surf = {
    lon: 0,
    lat: 0,
    yaw: 0,
    pitch: 0.07,
    fov: 70,
    tOff: 0,
    play: false,
    tex: -1,
    siteKm: null,
    uiT: 0,
    panoReady: false,
    panoCur: -1,
    job: null,
    building: false,
    hold: false,
    pmode: -1,
    panoAge: 0,
    panoSwap: false,
    panoTex: -1,
    basePR: 0,
    sE: 0,
    sN: 0,
    sU: 1,
    ss: null,
    perfT: 0,
    perfN: 0,
    perfWarm: 30
  };

  let surfHeight = null;
  let surfHeightP = null;

  const sLast = { yaw: 0, pitch: 0, fov: 0, tex: -2 };
  let sIdle = 0;
  let sStill = 0;
  let sLow = false;

  function getSurf() {
    return surf;
  }

  function loadSurfHeight() {
    if (!surfHeightP) {
      surfHeightP = new Promise(function (resolve) {
        const im = new Image();
        im.onload = function () {
          const t = new THREE.Texture(im);
          t.wrapS = THREE.RepeatWrapping;
          t.wrapT = THREE.ClampToEdgeWrapping;
          t.minFilter = THREE.NearestFilter;
          t.magFilter = THREE.NearestFilter;
          t.generateMipmaps = false;
          t.needsUpdate = true;
          resolve({ tex: t, w: im.width, h: im.height });
        };
        im.onerror = function () {
          resolve(null);
        };
        im.src = 'assets/mars-height-surface.png';
      });
    }
    return surfHeightP;
  }

  function applySurfTex() {
    let use = -1;
    for (let i = tex.MAX_LEVEL; i >= 0; i--) {
      if (tex.texLv[i].state === 2) {
        use = i;
        break;
      }
    }
    if (use < 0) return;
    const key = use + (surfHeight ? 100 : 0);
    if (key === surf.tex) return;
    surf.tex = key;
    const H = surfHeight || { tex: tex.texLv[use].height, w: tex.H_W, h: tex.H_H };
    surfaceScene.eachSM(function (m) {
      m.uniforms.uColor.value = tex.texLv[use].color;
      m.uniforms.uHeight.value = H.tex;
      m.uniforms.uRes.value.set(H.w, H.h);
    });
  }

  function surfSun() {
    const S = sunFor(surf.lon, surf.lat, surf.tOff);
    surf.ss = S.ss;
    surf.sE = S.sE;
    surf.sN = S.sN;
    surf.sU = S.sU;
    const c0 = S.c0;
    const c1 = S.c1;
    const c2 = S.c2;
    const u0 = surf.lon / (2 * Math.PI) + 0.5;
    const v0 = surf.lat / Math.PI + 0.5;
    surfaceScene.eachSM(function (m) {
      m.uniforms.uStar.value.set(
        c0[0], c1[0], c2[0],
        c0[1], c1[1], c2[1],
        c0[2], c1[2], c2[2]
      );
      m.uniforms.uSun.value.set(surf.sE, surf.sN, surf.sU);
      const rs = m.uniforms.uRes.value;
      const bx = u0 * rs.x;
      const by = v0 * rs.y;
      m.uniforms.uP0.value.set(
        Math.floor(bx),
        Math.floor(by),
        bx - Math.floor(bx),
        by - Math.floor(by)
      );
    });
  }

  function surfBasePR() {
    return surf.basePR || (HEAVY ? Math.min(BASE_PR, 0.85) : 0.6);
  }

  // 0 — ничего, 1 — live ray, 2 — pano show
  function updateSurface(dt) {
    applySurfTex();
    if (surf.job) pano.panoStep(surf.building ? (HEAVY ? 4 : 2) : 2);
    if (surf.hold) return 0;
    if (!surf.job) {
      surf.panoAge += dt;
      if (surf.panoReady && (surf.panoAge > 25 || surf.tex !== surf.panoTex)) pano.panoStart();
    }
    surf.uiT -= dt;
    if (surf.uiT <= 0) {
      surf.uiT = 0.4;
      if (surf.ss) surfHudApi.surfHud();
    }

    const renderDirty = getRenderDirty();
    const changed =
      renderDirty ||
      surf.panoSwap ||
      surf.yaw !== sLast.yaw ||
      surf.pitch !== sLast.pitch ||
      surf.fov !== sLast.fov;
    if (changed) surfHudApi.surfCompass();
    const usePano = surf.panoReady && surf.fov >= PANO_MIN_FOV;
    const pm = usePano ? 1 : 0;
    if (pm !== surf.pmode) {
      surf.pmode = pm;
      sLow = false;
      sStill = 0;
      renderer.setPixelRatio(pm ? Math.min(BASE_PR, 1.5) : surfBasePR());
      resize();
    }
    const th = Math.tan((surf.fov * D2R) / 2);
    const size = renderer.domElement;
    const asp = size.width / Math.max(1, size.height);

    if (usePano) {
      if (!changed) return 0;
      setRenderDirty(false);
      surf.panoSwap = false;
      sLast.yaw = surf.yaw;
      sLast.pitch = surf.pitch;
      sLast.fov = surf.fov;
      const showMat = surfaceScene.getShowMat();
      showMat.uniforms.uView.value.set(surf.yaw, surf.pitch);
      showMat.uniforms.uScr.value.set(th, asp);
      return 2;
    }

    const moving = changed && !renderDirty;
    if (moving) sStill = 0;
    else sStill += dt;
    const base = surfBasePR();
    if (moving && !sLow) {
      sLow = true;
      renderer.setPixelRatio(Math.max(0.4, base * 0.6));
      resize();
    } else if (!moving && sLow && sStill > 0.25) {
      sLow = false;
      renderer.setPixelRatio(base);
      resize();
    }
    sIdle += dt;
    if (!changed && sIdle < 2.0) return 0;
    sIdle = 0;
    setRenderDirty(false);
    surf.panoSwap = false;
    sLast.yaw = surf.yaw;
    sLast.pitch = surf.pitch;
    sLast.fov = surf.fov;
    surfSun();
    const u = surfaceScene.getSurfMat().uniforms;
    u.uView.value.set(surf.yaw, surf.pitch);
    u.uScr.value.set(th, asp);
    u.uPx.value = (2 * th) / Math.max(1, size.height);
    if (surf.perfWarm > 0) {
      surf.perfWarm--;
      return 1;
    }
    if (moving) {
      surf.perfT += dt;
      surf.perfN++;
      if (surf.perfN >= 30) {
        const avg = surf.perfT / surf.perfN;
        surf.perfT = 0;
        surf.perfN = 0;
        if (avg > 0.034 && base > 0.4) {
          surf.basePR = Math.max(0.4, base - 0.1);
          renderer.setPixelRatio(Math.max(0.35, surf.basePR * 0.6));
          resize();
        }
      }
    }
    return 1;
  }

  function waitFor(fn, max) {
    return new Promise(function (res) {
      const t0 = Date.now();
      (function poll() {
        if (fn() || Date.now() - t0 > max) res();
        else setTimeout(poll, 60);
      })();
    });
  }

  function dropExplorer(lonDeg, latDeg) {
    if (getTransitioning() || getMode() !== 'mars') return;
    setTransitioning(true);
    setArmed(false);
    showFact();
    veil.classList.add('load', 'on');
    wait(480)
      .then(function () {
        if (!surfaceScene.isBuilt()) surfaceScene.buildSurface();
        surf.lon = lonDeg * D2R;
        surf.lat = Math.max(-1.52, Math.min(1.52, latDeg * D2R));
        surf.siteKm = siteHeightKm(lonDeg, latDeg);
        const cl = Math.max(0.05, Math.cos(surf.lat));
        surfaceScene.eachSM(function (m) {
          m.uniforms.uObsLL.value.set(surf.lon, surf.lat);
          m.uniforms.uSeed.value.set(
            (surf.lon * 3389.5 * cl) % 200,
            (surf.lat * 3389.5) % 200
          );
        });
        surf.tOff = 0;
        surf.fov = 70;
        surf.pitch = 0.07;
        surf.tex = -1;
        surf.panoReady = false;
        surf.panoCur = -1;
        surf.job = null;
        surf.building = true;
        surf.hold = true;
        surf.pmode = -1;
        surf.panoAge = 0;
        surf.panoSwap = false;
        surf.basePR = 0;
        sLow = false;
        sStill = 0;
        sIdle = 0;
        setMode('surface');
        marsUI.hidden = true;
        layoutPop.hidden = true;
        btnLayout.setAttribute('aria-expanded', 'false');
        surfUIEl.hidden = false;
        renderer.setPixelRatio(Math.min(BASE_PR, 1.5));
        resize();
        renderer.domElement.style.cursor = 'grab';
        return Promise.race([
          Promise.all([
            tex.requestLevel(1),
            loadSurfHeight().then(function (h) {
              surfHeight = h;
            })
          ]),
          wait(8000)
        ]);
      })
      .then(function () {
        applySurfTex();
        tiles.state.tileWant = null;
        tiles.tileUpdate(0, 0, false);
        return true;
      })
      .then(function () {
        surfSun();
        const alt = Math.asin(Math.max(-1, Math.min(1, surf.sU)));
        const az = Math.atan2(surf.sE, surf.sN);
        surf.yaw = alt < 0.45 ? az : az + Math.PI;
        surf.perfT = 0;
        surf.perfN = 0;
        surf.perfWarm = 30;
        surfHudApi.surfHud();
        renderer.compile(surfaceScene.getPanoScene(), surfaceScene.getSurfCam());
        renderer.compile(surfaceScene.getShowScene(), surfaceScene.getSurfCam());
        renderer.compile(surfaceScene.getSurfScene(), surfaceScene.getSurfCam());
        pano.panoStart();
        return waitFor(function () {
          return surf.panoReady;
        }, 25000);
      })
      .then(function () {
        surf.building = false;
        surf.hold = false;
        setRenderDirty(true);
        return wait(120);
      })
      .then(function () {
        veil.classList.remove('on');
        surfBack.focus({ preventScroll: true });
        return wait(480);
      })
      .then(function () {
        veil.classList.remove('load');
        setTransitioning(false);
      });
  }

  function closeSurface() {
    if (getTransitioning() || getMode() !== 'surface') return;
    setTransitioning(true);
    veil.classList.add('on');
    const lonDeg = surf.lon / D2R;
    const latDeg = surf.lat / D2R;
    wait(480)
      .then(function () {
        setMode('mars');
        surfUIEl.hidden = true;
        marsUI.hidden = false;
        surf.job = null;
        surf.panoReady = false;
        surf.hold = false;
        pano.disposePanoRT();
        clearPressed();
        renderer.setPixelRatio(Math.min(BASE_PR, 1.25));
        resize();
        tex.state.texCur = -1;
        tex.applyTexLevel();
        geo.updateGeoLod();
        flyTo(lonDeg, latDeg, 2.3);
        renderer.domElement.style.cursor = 'grab';
        return wait(100);
      })
      .then(function () {
        veil.classList.remove('on');
        marsBack.focus({ preventScroll: true });
        return wait(480);
      })
      .then(function () {
        setTransitioning(false);
      });
  }

  return {
    getSurf,
    loadSurfHeight,
    applySurfTex,
    surfSun,
    updateSurface,
    dropExplorer,
    closeSurface,
    setSurfTexDirty: () => {
      surf.tex = -1;
    },
    getSurfHeight: () => surfHeight,
    setSurfHeight: (h) => {
      surfHeight = h;
    }
  };
}
