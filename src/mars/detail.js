// mars/detail.js — «Detailed view»: высокодетальная 3D-модель участка Марса над поверхностью
import { THREE } from '../core/three.js';
import { D2R } from '../config.js';
import { faceAngles } from '../lib/view.js';
import GALE_B64 from '../data/models/gale-crater.txt?raw';
import { DETAIL_MODELS, modelNear, kmToLonLat, buildPatch, orbitOffset } from './detail-geo.js';

const R_KM = 3389.5;
const DEBUG_COLOR = null;   // яркая окраска модели для отладки; null — вернуть цвета планеты
const DATA = { gale: GALE_B64 };   // встроено в бандл — работает и с file://

export function createDetail(deps) {
  const {
    getMode, getTransitioning, getFlatOn,
    getMarsCam, getMarsSpin, getMarsRoot, getMarsMat, getMarsAtmoMat,
    mv, tex, siteHeightKm, cv, exitBtn, veil, kickerEl, showFact, setFlat, onEnter, onExit, markDirty
  } = deps;

  let marsCam = null, marsSpin = null, marsRoot = null, marsMat = null, marsAtmoMat = null;
  function sync() {
    marsCam = getMarsCam(); marsSpin = getMarsSpin(); marsRoot = getMarsRoot();
    marsMat = getMarsMat(); marsAtmoMat = getMarsAtmoMat();
  }
  let wasFlat = false;
  let active = false;
  let busy = false;
  let model = null;
  let mesh = null;
  const cache = {};
  const st = { az: 0, el: 0.6, D: 0.14, tx: 0, ty: 0 };   // цель в км внутри модели
  let savedNear = 0.02;
  let savedMv = null;
  const ptrs = {};
  let lastPinch = 0;

  function toast(msg) {
    const el = document.getElementById('detail-msg');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    setTimeout(function () { el.hidden = true; }, 6000);
  }

  // Экран загрузки — тот же #veil, что и при посадке (с фактом и полосой)
  let kickerPrev = null;
  function fade(on, loader) {
    if (!veil) return Promise.resolve();
    if (on) {
      if (loader) {
        if (kickerEl) { kickerPrev = kickerEl.textContent; kickerEl.textContent = 'Loading detailed view'; }
        if (showFact) showFact();
        veil.classList.add('load');
      }
      veil.classList.add('on');
      return new Promise(function (r) { setTimeout(r, 480); });
    }
    veil.classList.remove('on');
    return new Promise(function (r) { setTimeout(r, 480); }).then(function () {
      veil.classList.remove('load');
      if (kickerEl && kickerPrev !== null) { kickerEl.textContent = kickerPrev; kickerPrev = null; }
    });
  }

  function loadHeights(m) {
    if (cache[m.id]) return Promise.resolve(cache[m.id]);
    return Promise.resolve(DATA[m.id]).then(function (txt) {
      if (!txt) throw new Error('no model data for ' + m.id);
      const bin = atob(txt.trim());
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const u = new Uint16Array(bytes.buffer);
      cache[m.id] = u;
      return u;
    });
  }

  function makeColorSampler(m) {
    try {
      let L = null;
      for (let i = tex.MAX_LEVEL; i >= 0; i--) if (tex.texLv[i].state === 2) { L = tex.texLv[i]; break; }
      if (!L || !L.color || !L.color.image) return null;
      const img = L.color.image;
      const W = img.width, H = img.height;
      const ext = (Math.max(m.extentKm, m.extentYKm || 0) / R_KM / D2R) * 0.75;
      const x0 = Math.max(0, Math.floor(((m.lon - ext * 1.6) / 360 + 0.5) * W));
      const x1 = Math.min(W, Math.ceil(((m.lon + ext * 1.6) / 360 + 0.5) * W));
      const y0 = Math.max(0, Math.floor((0.5 - (m.lat + ext) / 180) * H));
      const y1 = Math.min(H, Math.ceil((0.5 - (m.lat - ext) / 180) * H));
      const c = document.createElement('canvas');
      c.width = x1 - x0; c.height = y1 - y0;
      const g = c.getContext('2d');
      g.drawImage(img, x0, y0, c.width, c.height, 0, 0, c.width, c.height);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let sr = 0, sg = 0, sb = 0;
      const nPx = c.width * c.height;
      for (let i = 0; i < nPx; i++) { sr += d[i * 4]; sg += d[i * 4 + 1]; sb += d[i * 4 + 2]; }
      const fn = function (lon, lat) {
        // билинейная выборка — без «кубиков» при приближении
        const fx = Math.max(0, Math.min(c.width - 1.001, ((lon / 360 + 0.5) * W) - x0 - 0.5));
        const fy = Math.max(0, Math.min(c.height - 1.001, ((0.5 - lat / 180) * H) - y0 - 0.5));
        const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
        const out = [0, 0, 0];
        for (let k = 0; k < 3; k++) {
          const g = (xx, yy) => d[(yy * c.width + xx) * 4 + k] / 255;
          out[k] = (g(ix, iy) * (1 - tx) + g(ix + 1, iy) * tx) * (1 - ty) + (g(ix, iy + 1) * (1 - tx) + g(ix + 1, iy + 1) * tx) * ty;
        }
        return out;
      };
      fn.avg = [sr / nPx / 255, sg / nPx / 255, sb / nPx / 255];
      return fn;
    } catch (e) { return null; }
  }

  function featherMap() {
    const S = 128;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const im = g.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const e = Math.min(x, S - 1 - x, y, S - 1 - y) / (S * 0.12);
        const w = Math.max(0, Math.min(1, e));
        const v = Math.round(255 * w * w * (3 - 2 * w));
        const o = (y * S + x) * 4;
        im.data[o] = im.data[o + 1] = im.data[o + 2] = v; im.data[o + 3] = 255;
      }
    }
    g.putImageData(im, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  }

  // процедурная «текстура» планеты в детальном виде: просто цвет окружения с едва заметным шумом
  function makeFlatTexture(avg) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    const im = g.createImageData(256, 128);
    for (let i = 0; i < 256 * 128; i++) {
      const n = 0.97 + 0.06 * Math.random();
      im.data[i * 4] = Math.min(255, avg[0] * 255 * n);
      im.data[i * 4 + 1] = Math.min(255, avg[1] * 255 * n);
      im.data[i * 4 + 2] = Math.min(255, avg[2] * 255 * n);
      im.data[i * 4 + 3] = 255;
    }
    g.putImageData(im, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  }

  let flatTex = null;
  let baseColor = [0.62, 0.38, 0.26];

  function buildMesh(m, u16) {
    const sampler = makeColorSampler(m);
    if (sampler && sampler.avg) baseColor = sampler.avg;
    const patch = buildPatch(m, u16, {
      flatBase: DEBUG_COLOR ? null : baseColor,
      lift: (m.liftKm || 6) / R_KM,
      zScale: m.zScale || 1,
      exag: (marsMat.uniforms.uExag && marsMat.uniforms.uExag.value) || 1,
      planetKm: siteHeightKm,
      colorAt: sampler,
      debugColor: DEBUG_COLOR,
      step: 1
    });
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(patch.pos, 3));
    geom.setAttribute('uv', new THREE.BufferAttribute(patch.uv, 2));
    geom.setAttribute('color', new THREE.BufferAttribute(patch.col, 3));
    geom.setIndex(new THREE.BufferAttribute(patch.index, 1));
    geom.computeVertexNormals();
    geom.computeBoundingSphere();
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 1, metalness: 0,
      emissive: DEBUG_COLOR ? 0x1f9a3a : ((m.tex && m.tex.emissive) || 0x000000), emissiveIntensity: DEBUG_COLOR ? 0.6 : 0.7,
      alphaMap: featherMap(), transparent: true, depthWrite: true
    });
    const me = new THREE.Mesh(geom, mat);
    me.frustumCulled = false;
    me.renderOrder = 2;
    return me;
  }

  function enter(m, lon, lat) {
    if (active || busy || getMode() !== 'mars' || getTransitioning()) return Promise.resolve(false);
    sync();
    wasFlat = !!getFlatOn();
    busy = true;
    return Promise.all([
      loadHeights(m),
      Promise.race([tex.requestLevel(tex.MAX_LEVEL), new Promise(function (r) { setTimeout(r, 5000); })]),
      fade(true, true)
    ]).then(function (r) {
      if (wasFlat && setFlat) setFlat(false);
      mesh = buildMesh(m, r[0]);
      marsSpin.add(mesh);
      model = m;
      // камера наводится на центр самой 3D-модели, расстояние — чтобы она целиком влезала в кадр
      st.tx = 0; st.ty = 0;
      st.az = 0; st.el = 0.9; st.D = 0.2 * Math.max(m.extentKm, m.extentYKm || 0) / 600;
      st.Dmax = st.D * 1.45;   // отдаляться можно лишь немного
      savedMv = { spin: mv.spin, pitch: mv.pitch, dist: mv.dist, tDist: mv.tDist, auto: mv.auto, userZoomed: mv.userZoomed };
      savedNear = marsCam.near;
      marsCam.near = 0.002;
      marsCam.updateProjectionMatrix();
      active = true;
      flatTex = makeFlatTexture(baseColor);
      postUpdate();
      if (marsAtmoMat) marsAtmoMat.visible = false;
      mv.auto = false; mv.fly = false; mv.vSpin = 0; mv.vPitch = 0; mv.dragging = false;
      if (onEnter) onEnter(m, lon, lat);
      if (exitBtn) exitBtn.hidden = false;
      document.body.classList.add('detail-on');
      busy = false;
      if (markDirty) markDirty();
      return fade(false).then(function () { return true; });
    }).catch(function (err) {
      if (typeof console !== 'undefined') console.error('Detailed view failed:', err);
      if (mesh && marsSpin) { marsSpin.remove(mesh); mesh = null; }
      if (marsAtmoMat) marsAtmoMat.visible = true;
      if (wasFlat && setFlat && !getFlatOn()) setFlat(true);
      toast('Detailed view could not load: ' + (err && err.message ? err.message : err));
      busy = false;
      return fade(false).then(function () { return false; });
    });
  }

  /** После обычного обновления кадра: планета рисуется процедурным цветом, детальные тайлы не подгружаются. */
  function postUpdate() {
    if (!active || !flatTex || !marsMat) return;
    const u = marsMat.uniforms;
    if (!u.uColor) return;
    if (u.uColor.value !== flatTex) u.uColor.value = flatTex;
    if (u.uDetOn) u.uDetOn.value = 0;
  }

  function exit() {
    if (!active || busy) return Promise.resolve();
    busy = true;
    return fade(true).then(function () {
      active = false;
      if (mesh) {
        marsSpin.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
        if (mesh.material.alphaMap) mesh.material.alphaMap.dispose();
        mesh = null;
      }
      if (marsAtmoMat) marsAtmoMat.visible = true;
      if (flatTex) { flatTex.dispose(); flatTex = null; }
      tex.state.texCur = -1;   // вернуть настоящую текстуру Марса
      marsCam.near = savedNear;
      marsCam.up.set(0, 1, 0);
      marsCam.quaternion.identity();
      marsCam.updateProjectionMatrix();
      if (savedMv) {
        mv.spin = savedMv.spin; mv.pitch = savedMv.pitch;
        mv.dist = savedMv.dist; mv.tDist = savedMv.tDist;
        mv.auto = false; mv.userZoomed = true;
      }
      if (exitBtn) exitBtn.hidden = true;
      document.body.classList.remove('detail-on');
      if (wasFlat && setFlat) {
        marsSpin.rotation.y = mv.spin; marsRoot.rotation.x = mv.pitch;
        marsRoot.updateMatrixWorld(true);
        setFlat(true);
      }
      if (onExit) onExit();
      busy = false;
      if (markDirty) markDirty();
      return fade(false);
    });
  }

  /** Вызывается из updateMars после стандартной установки вида. */
  function applyCamera() {
    if (!active || !model) return;
    const ll = kmToLonLat(model, st.tx, st.ty);
    const f = faceAngles(ll.lon, ll.lat);
    mv.spin = f.spin; mv.pitch = Math.max(-1.45, Math.min(1.45, f.pitch));
    mv.dist = mv.tDist = 1.06;
    marsSpin.rotation.y = mv.spin;
    marsRoot.rotation.x = mv.pitch;
    marsRoot.updateMatrixWorld(true);
    // цель в мировых координатах
    const hKm = siteHeightKm(ll.lon, ll.lat);
    const r = 1 + ((hKm === null ? 0 : hKm) / R_KM);
    const la = ll.lat * D2R, lo = ll.lon * D2R;
    const P = new THREE.Vector3(r * Math.cos(la) * Math.cos(lo), r * Math.sin(la), -r * Math.cos(la) * Math.sin(lo));
    marsSpin.localToWorld(P);
    const up = P.clone().normalize();
    // локальный базис в мировых координатах
    const eastL = new THREE.Vector3(-Math.sin(lo), 0, -Math.cos(lo));
    const northL = new THREE.Vector3(-Math.sin(la) * Math.cos(lo), Math.cos(la), Math.sin(la) * Math.sin(lo));
    const q = marsSpin.getWorldQuaternion(new THREE.Quaternion());
    const east = eastL.applyQuaternion(q), north = northL.applyQuaternion(q);
    const o = orbitOffset(st.az, st.el, st.D);
    const cp = P.clone().addScaledVector(east, o.x).addScaledVector(north, o.y).addScaledVector(up, o.z);
    marsCam.position.copy(cp);
    marsCam.up.copy(up);
    marsCam.lookAt(P);
    marsCam.updateMatrixWorld(true);
  }

  function clampSt() {
    st.el = Math.max(0.6, Math.min(1.2, st.el));   // наклон камеры ограничен
    st.D = Math.max(0.012, Math.min(st.Dmax || 0.7, st.D));
    const limX = model ? model.extentKm * 0.42 : 200;
    const limY = model ? (model.extentYKm || model.extentKm) * 0.42 : 200;
    st.tx = Math.max(-limX, Math.min(limX, st.tx));
    st.ty = Math.max(-limY, Math.min(limY, st.ty));
  }

  // ---- ввод: перехватываем раньше основного обработчика ----
  function swallow(e) { e.stopImmediatePropagation(); }
  function onDown(e) {
    if (!active || e.target !== cv) return;
    swallow(e);
    try { cv.setPointerCapture(e.pointerId); } catch (x) { /* */ }
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY, b: e.button };
    if (Object.keys(ptrs).length === 2) {
      const k = Object.keys(ptrs);
      lastPinch = Math.hypot(ptrs[k[0]].x - ptrs[k[1]].x, ptrs[k[0]].y - ptrs[k[1]].y);
    }
    cv.style.cursor = 'grabbing';
  }
  function onMove(e) {
    if (!active) return;
    const p = ptrs[e.pointerId];
    if (!p) return;
    swallow(e);
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    const keys = Object.keys(ptrs);
    if (keys.length >= 2) {
      const a = ptrs[keys[0]], b = ptrs[keys[1]];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (lastPinch > 0 && d > 0) st.D *= lastPinch / d;
      lastPinch = d;
    } else if (e.shiftKey || p.b === 2) {
      const s = st.D * 900;
      st.tx -= (dx * Math.cos(st.az) - dy * Math.sin(st.az)) * s / innerHeight * 0.9;
      st.ty += (dy * Math.cos(st.az) + dx * Math.sin(st.az)) * s / innerHeight * 0.9;
    } else {
      st.az -= dx * 0.006;
      st.el += dy * 0.005;
    }
    clampSt();
  }
  function onUp(e) {
    if (!active) return;
    if (ptrs[e.pointerId]) { swallow(e); delete ptrs[e.pointerId]; }
    if (Object.keys(ptrs).length < 2) lastPinch = 0;
    if (!Object.keys(ptrs).length) cv.style.cursor = '';
  }
  function onWheel(e) {
    if (!active || e.target !== cv) return;
    swallow(e); e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    st.D *= Math.exp(dy * 0.0012);
    clampSt();
  }
  function onClick(e) {
    if (!active) return;
    if (e.target === cv) swallow(e);
    const t = e.target.closest ? e.target.closest('#zoom-in,#zoom-out') : null;
    if (t) { swallow(e); st.D *= t.id === 'zoom-in' ? 0.8 : 1.25; clampSt(); }
  }
  function onKey(e) {
    if (!active) return;
    if (e.key === 'Escape') { swallow(e); exit(); return; }
    if (e.key === '+' || e.key === '=') { swallow(e); st.D *= 0.85; clampSt(); }
    else if (e.key === '-' || e.key === '_') { swallow(e); st.D *= 1.18; clampSt(); }
  }
  window.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('pointercancel', onUp, true);
  window.addEventListener('wheel', onWheel, { capture: true, passive: false });
  window.addEventListener('click', onClick, true);
  window.addEventListener('keydown', onKey, true);
  if (exitBtn) exitBtn.addEventListener('click', function () { exit(); });

  return { enter, exit, applyCamera, postUpdate, isActive: () => active, models: DETAIL_MODELS, near: (lon, lat) => modelNear(lon, lat) };
}
