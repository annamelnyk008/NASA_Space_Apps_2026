// app/input.js — pointer / wheel / keydown for mars + surface + flat
import { THREE } from '../core/three.js';
import { clampDist, clampFov } from '../lib/view.js';
import { D2R } from '../config.js';

/**
 * Registers all DOM input handlers. Call once after all modules are created.
 * @param {object} ctx
 */
export function setupInput(ctx) {
  const {
    renderer,
    getMode,
    getTransitioning,
    camera, // system camera for hitsMars
    sun,
    mars, // solarSystem.mars
    mv,
    openMars,
    closeMars,
    closeSurface,
    setArmed,
    getPegArmed,
    setGrid,
    getGridOn,
    zoomBy,
    flyTo,
    startView,
    clearPressed,
    setViewMode,
    layoutPop,
    btnLayout,
    marsNav,
    btnZoomIn,
    btnZoomOut,
    holdZoom,
    btnGrid,
    getSurf,
    getFlatOn,
    flatView, // createFlatView result
    setRenderDirty
  } = ctx;

  const cv = renderer.domElement;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function hitsMars(e) {
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects([sun, mars.mesh]);
    return hits.length > 0 && hits[0].object === mars.mesh;
  }

  // --- system / open ---
  const tag = document.getElementById('mars-tag');
  const marsBack = document.getElementById('mars-back');
  if (tag) tag.addEventListener('click', openMars);
  if (marsBack) marsBack.addEventListener('click', closeMars);
  cv.addEventListener('click', function (e) {
    if (getMode() === 'system' && !getTransitioning() && hitsMars(e)) openMars();
  });

  // --- mars drag / pinch / wheel ---
  const ptrs = {};
  let lastPinch = 0;
  let lastMoveT = 0;
  function nPtrs() {
    return Object.keys(ptrs).length;
  }
  function pinchDist() {
    const ks = Object.keys(ptrs);
    if (ks.length < 2) return 0;
    const a = ptrs[ks[0]];
    const b = ptrs[ks[1]];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  cv.addEventListener('pointerdown', function (e) {
    if (getMode() !== 'mars') return;
    try {
      cv.setPointerCapture(e.pointerId);
    } catch (err) { /* ignore */ }
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    mv.dragging = true;
    mv.auto = false;
    mv.fly = false;
    mv.vSpin = 0;
    mv.vPitch = 0;
    clearPressed();
    layoutPop.hidden = true;
    btnLayout.setAttribute('aria-expanded', 'false');
    lastMoveT = e.timeStamp;
    if (nPtrs() === 2) lastPinch = pinchDist();
    cv.style.cursor = 'grabbing';

    // flat pan
    if (getFlatOn()) flatView.onFlatPointerDown(e);
  });

  cv.addEventListener('pointermove', function (e) {
    if (getMode() === 'system') {
      cv.style.cursor = hitsMars(e) ? 'pointer' : '';
      return;
    }
    if (getMode() === 'mars') {
      const p = ptrs[e.pointerId];
      if (!p) {
        if (getFlatOn()) flatView.onFlatPointerMove(e);
        return;
      }
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (getFlatOn()) {
        flatView.onFlatPointerMove(e);
        return;
      }
      if (nPtrs() === 1) {
        const k = Math.max(0.0006, (2 * Math.tan(0.2618) * (mv.dist - 1)) / window.innerHeight);
        mv.spin += dx * k;
        mv.pitch = Math.max(-1.45, Math.min(1.45, mv.pitch + dy * k));
        const dtm = Math.max(8, e.timeStamp - lastMoveT);
        mv.vSpin = 0.6 * ((dx * k) / dtm * 1000) + 0.4 * mv.vSpin;
        mv.vPitch = 0.6 * ((dy * k) / dtm * 1000) + 0.4 * mv.vPitch;
        lastMoveT = e.timeStamp;
      } else if (nPtrs() === 2) {
        const d = pinchDist();
        if (lastPinch > 0 && d > 0) {
          mv.dist = mv.tDist = clampDist(mv.dist * lastPinch / d);
          mv.userZoomed = true;
        }
        lastPinch = d;
      }
    }
  });

  function endPointer(e) {
    if (ptrs[e.pointerId]) {
      delete ptrs[e.pointerId];
      if (nPtrs() === 0) {
        mv.dragging = false;
        if (e.timeStamp - lastMoveT > 90) {
          mv.vSpin = 0;
          mv.vPitch = 0;
        }
        if (getMode() === 'mars') cv.style.cursor = 'grab';
      }
      lastPinch = 0;
    }
    if (getFlatOn()) flatView.onFlatPointerEnd(e);
  }
  cv.addEventListener('pointerup', endPointer);
  cv.addEventListener('pointercancel', endPointer);

  cv.addEventListener(
    'wheel',
    function (e) {
      if (getMode() !== 'mars') return;
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      mv.userZoomed = true;
      mv.auto = false;
      mv.tDist = clampDist(mv.tDist * Math.exp(dy * 0.0012));
    },
    { passive: false }
  );

  // mars nav chips
  if (marsNav) {
    marsNav.addEventListener('click', function (e) {
      const b = e.target.closest ? e.target.closest('button') : null;
      if (!b) return;
      clearPressed();
      if (b.getAttribute('data-reset')) {
        const f = startView();
        mv.tSpin = f.spin;
        mv.tPitch = f.pitch;
        mv.tDist = mv.fit;
        mv.fly = true;
        mv.auto = true;
        mv.userZoomed = false;
      } else {
        b.setAttribute('aria-pressed', 'true');
        flyTo(
          parseFloat(b.getAttribute('data-lon')),
          parseFloat(b.getAttribute('data-lat')),
          parseFloat(b.getAttribute('data-dist'))
        );
      }
    });
  }

  if (btnZoomIn && btnZoomOut && holdZoom) {
    holdZoom(btnZoomIn, 0.8);
    holdZoom(btnZoomOut, 1.25);
  }

  if (btnLayout) {
    btnLayout.addEventListener('click', function () {
      const open = layoutPop.hidden;
      layoutPop.hidden = !open;
      btnLayout.setAttribute('aria-expanded', String(open));
    });
  }
  if (layoutPop) {
    layoutPop.addEventListener('click', function (e) {
      const b = e.target.closest ? e.target.closest('button') : null;
      if (!b) return;
      setViewMode(parseInt(b.getAttribute('data-mode'), 10));
      layoutPop.hidden = true;
      btnLayout.setAttribute('aria-expanded', 'false');
    });
  }
  if (btnGrid) {
    btnGrid.addEventListener('click', function () {
      setGrid(!getGridOn());
    });
  }

  // --- surface input ---
  const sptr = {};
  let sPinch = 0;
  function sCount() {
    return Object.keys(sptr).length;
  }
  function sPinchDist() {
    const k = Object.keys(sptr);
    if (k.length < 2) return 0;
    return Math.hypot(sptr[k[0]].x - sptr[k[1]].x, sptr[k[0]].y - sptr[k[1]].y);
  }

  cv.addEventListener('pointerdown', function (e) {
    if (getMode() !== 'surface') return;
    try {
      cv.setPointerCapture(e.pointerId);
    } catch (err) { /* ignore */ }
    sptr[e.pointerId] = { x: e.clientX, y: e.clientY };
    if (sCount() === 2) sPinch = sPinchDist();
    cv.style.cursor = 'grabbing';
  });
  cv.addEventListener('pointermove', function (e) {
    if (getMode() !== 'surface') return;
    const p = sptr[e.pointerId];
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    const surf = getSurf();
    if (sCount() === 1) {
      const k = (surf.fov * D2R) / window.innerHeight;
      surf.yaw -= dx * k;
      surf.pitch = Math.max(-0.9, Math.min(1.5, surf.pitch + dy * k));
    } else if (sCount() === 2) {
      const d = sPinchDist();
      if (sPinch > 0 && d > 0) surf.fov = clampFov(surf.fov * sPinch / d);
      sPinch = d;
    }
  });
  function sEnd(e) {
    if (!sptr[e.pointerId]) return;
    delete sptr[e.pointerId];
    sPinch = 0;
    if (sCount() === 0 && getMode() === 'surface') cv.style.cursor = 'grab';
  }
  cv.addEventListener('pointerup', sEnd);
  cv.addEventListener('pointercancel', sEnd);
  cv.addEventListener(
    'wheel',
    function (e) {
      if (getMode() !== 'surface') return;
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const surf = getSurf();
      surf.fov = clampFov(surf.fov * Math.exp(dy * 0.001));
    },
    { passive: false }
  );

  const surfZin = document.getElementById('surf-zin');
  const surfZout = document.getElementById('surf-zout');
  function holdFov(btn, factor) {
    if (!btn) return;
    let timer = 0;
    function stop() {
      if (timer) {
        clearInterval(timer);
        timer = 0;
      }
    }
    btn.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      const surf = getSurf();
      surf.fov = clampFov(surf.fov * factor);
      stop();
      timer = setInterval(function () {
        const s = getSurf();
        s.fov = clampFov(s.fov * (factor < 1 ? 0.97 : 1.03));
      }, 60);
    });
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointerleave', stop);
    btn.addEventListener('pointercancel', stop);
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const surf = getSurf();
        surf.fov = clampFov(surf.fov * factor);
      }
    });
  }
  holdFov(surfZin, 0.85);
  holdFov(surfZout, 1.18);

  const surfBack = document.getElementById('surf-back');
  if (surfBack) surfBack.addEventListener('click', closeSurface);

  // --- keyboard ---
  window.addEventListener('keydown', function (e) {
    const mode = getMode();
    if (mode === 'mars') {
      if (e.key === 'Escape') {
        if (getPegArmed()) {
          setArmed(false);
          return;
        }
        if (!layoutPop.hidden) {
          layoutPop.hidden = true;
          btnLayout.setAttribute('aria-expanded', 'false');
        } else closeMars();
      } else if (e.key === '+' || e.key === '=') zoomBy(0.85);
      else if (e.key === '-' || e.key === '_') zoomBy(1.18);
      else if (e.key === 'g' || e.key === 'G') setGrid(!getGridOn());
      return;
    }
    if (mode === 'surface') {
      const surf = getSurf();
      const step = surf.fov * D2R * 0.08;
      if (e.key === 'Escape') closeSurface();
      else if (e.key === 'ArrowLeft') surf.yaw -= step;
      else if (e.key === 'ArrowRight') surf.yaw += step;
      else if (e.key === 'ArrowUp') surf.pitch = Math.min(1.5, surf.pitch + step);
      else if (e.key === 'ArrowDown') surf.pitch = Math.max(-0.9, surf.pitch - step);
      else if (e.key === '+' || e.key === '=') surf.fov = clampFov(surf.fov * 0.9);
      else if (e.key === '-' || e.key === '_') surf.fov = clampFov(surf.fov * 1.1);
    }
  });
}

