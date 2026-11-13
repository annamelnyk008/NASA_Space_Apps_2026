// Legacy runtime: режимы Mars и Surface пока сохраняют общее замыкание. Независимые подсистемы вынесены в core/, solar/, data/, lib/ и shaders/.
import { THREE } from '../core/three.js';
import { wait, waitFor } from '../lib/async.js';
import { renderFact } from '../mars/facts.js';
import { HEAVY } from '../app/device.js';
import { createMarsSun } from '../mars/sun.js';
import { createLegend, makeRampTexture } from '../mars/legend.js';
import { D2R, DET_PAD, DET_TOT, DET_WIN, EXAG, FIT_RADIUS, FLAT_D0, FLAT_K, FLAT_S_MIN, FOV, GEO_SIZES, H_HI, H_LO, MAX_GEO, PANO_MIN_FOV, TILT_DEG } from '../config.js';
import { ELEV_RAMP, K_HI, K_LO, TEMP_RAMP, rampFrom } from '../data/colorRamps.js';
import { marsSolar, sunFor } from '../data/marsSolar.js';
import { PH_HEIGHT, buildMosaic, canvasTex } from '../data/mosaic.js';
import { SPACE_FACTS } from '../data/spaceFacts.js';
import { TILES, TS, overlay } from '../data/tiles.js';
import { fmtClock, fmtLonLat, lonText, pad2 } from '../lib/format.js';
import { angDiff, clamp01, wrap180 } from '../lib/math.js';
import { clampDist, clampFov, faceAngles } from '../lib/view.js';
import { MARS_ATMO_FRAG, MARS_ATMO_VERT, MARS_FLAT_VERT, MARS_FRAG, MARS_VERT, SURF_FRAG, SURF_SHOW_FRAG, SURF_VERT } from '../shaders/index.js';
import { moonGeometry } from '../solar/geometry.js';
import { createSolarSystem } from '../solar/system.js';
import { createRenderer } from '../core/renderer.js';
import { createViewportController } from '../core/viewport.js';
import { createPlanetTagUpdater } from '../solar/planet-tag.js';


(function () {
  'use strict';


  var stage = document.getElementById('stage');
  var tag = document.getElementById('mars-tag');
  var fallback = document.getElementById('fallback');

  var rendererBundle = createRenderer({
    THREE: THREE,
    stage: stage,
    tag: tag,
    fallback: fallback,
    fov: FOV
  });
  if (!rendererBundle) return;

  var renderer = rendererBundle.renderer;
  var scene = rendererBundle.scene;
  var camera = rendererBundle.camera;


  // ---- Система: Солнце, планеты, астероиды и звёзды ----------------------
  var solarSystem = createSolarSystem({ THREE, scene, renderer });
  var sun = solarSystem.sun;
  var sunMat = solarSystem.sunMat;
  var fill = solarSystem.fill;
  var planets = solarSystem.planets;
  var mars = solarSystem.mars;
  var starGeo = solarSystem.starGeo;
  var starMat = solarSystem.starMat;
  var updateBelts = solarSystem.updateBelts;

  // ---- Камера и размер ---------------------------------------------------
  var marsCam = null;          // камера подробного Марса (создаётся при первом открытии)
  var renderDirty = true;
  var viewport = createViewportController({
    THREE: THREE,
    renderer: renderer,
    camera: camera,
    fillLight: fill,
    starMaterial: starMat,
    fov: FOV,
    fitRadius: FIT_RADIUS,
    tiltDeg: TILT_DEG,
    onDirty: function () { renderDirty = true; }
  });
  var resize = viewport.resize;

  // ---- Подпись Discover над Марсом --------------------------------------
  var placeTag = createPlanetTagUpdater({
  THREE: THREE,
  mars: mars,
  renderer: renderer,
  camera: camera,
  tag: tag
  });

  // ======================================================================
  //  ПОДРОБНЫЙ МАРС: реальные карты, смещение геометрии, LOD, реальное Солнце
  // ======================================================================
  var BASE_PR = renderer.getPixelRatio();

  var mode = 'system';                   // 'system' | 'mars'
  var transitioning = false;
  var marsScene = null, marsRoot = null, marsSpin = null, marsMat = null;
  var marsAtmoMat = null, marsLight = null;
  var marsMoons = [];
  var geoMeshes = [null, null, null], geoCur = -1;
  var viewMode = 0, gridOn = false;
  var perf = { t: 0, n: 0, warm: 40 };
  var mv = {
    spin: 0, pitch: 0, dist: 12, tSpin: 0, tPitch: 0, tDist: 5, fit: 5,
    fly: false, auto: true, dragging: false, vSpin: 0, vPitch: 0, userZoomed: false
  };
  const marsSun = createMarsSun();
  const sunInfo = marsSun.info;
  const sunObj  = marsSun.dir;
  var sunWorld = new THREE.Vector3(1, 0, 0); 
  var tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpW = new THREE.Vector3(), tmpC = new THREE.Vector3();
  var uiTimer = 0;

  var veil = document.getElementById('veil');
  var factEl = document.getElementById('ld-fact');
  function showFact() { renderFact(factEl); }
  var marsUI = document.getElementById('mars-ui');
  var marsBack = document.getElementById('mars-back');
  var marsNav = document.getElementById('mars-nav');
  var btnLayout = document.getElementById('btn-layout');
  var layoutPop = document.getElementById('layout-pop');
  var btnGrid = document.getElementById('btn-grid');
  var sectorEl = document.getElementById('mars-sector');
  var btnZoomIn = document.getElementById('zoom-in');
  var btnZoomOut = document.getElementById('zoom-out');
  var legendEl = document.getElementById('legend');
  var legendBar = document.getElementById('legend-bar');
  var legendTicks = document.getElementById('legend-ticks');
  var legend = createLegend({ root: legendEl, bar: legendBar, ticks: legendTicks });
  var sunEl = document.getElementById('mars-sun');
  var lodEl = document.getElementById('mars-lod');
  var labelsEl = document.getElementById('mars-labels');


  function updateSun() { marsSun.update(); }
  updateSun();


  // ---- Глобальные карты: уровни z = 0, 1, 2 (2 тайла → 8 → 32), собираются в одну текстуру ----
  // Вся планета = LOD 1 (zoom 1: 2 ряда × 4 колонки = 8 тайлов). Каждое «+» — следующий LOD:
  // LOD 2 = 4×8 (zoom 2), LOD 3 = 8×16 (zoom 3), дальше окно из тайлов zoom 4, 5, 6, 7…
  // zoom z → 2^z рядов × 2^(z+1) колонок.
  // ---- Высоты: вшиты прямо в этот файл (2048×1024, 16 бит в PNG: R = старший байт, G = младший; км = (R*256+G)/65535*31 − 9) ----
  // Крупный рельеф всего Марса (≈10 км/px, по MOLA 463 м); мелкие детали даёт только текстура цвета. Отдельных файлов и LOD для высот нет.
  var H_EMBED_SRC = 'assets/mars-height.png';
  var H_W = 2048, H_H = 1024, heightP = null;
  function getHeightTex() {
    if (!heightP) heightP = new Promise(function (resolve) {
      var im = new Image();
      function finish(t) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; resolve(t); }
      im.onload = function () { finish(new THREE.Texture(im)); };
      im.onerror = function () { var c = document.createElement('canvas'); c.width = c.height = 2; var g = c.getContext('2d'); g.fillStyle = PH_HEIGHT; g.fillRect(0, 0, 2, 2); finish(new THREE.CanvasTexture(c)); };
      im.src = H_EMBED_SRC;
    });
    return heightP;
  }
  var LEVELS = [1, 2, 3].map(function (z) {
    return { name: 'LOD ' + z + ' (' + Math.pow(2, z) + '×' + Math.pow(2, z + 1) + ')', z: z, w: Math.pow(2, z + 1) * TS, h: Math.pow(2, z) * TS };
  });
  var MAX_LEVEL = HEAVY ? 2 : 1;
  var texLv = LEVELS.map(function () { return { state: 0, color: null, height: null, ev: {}, promise: null }; });
  var texCur = -1;

  function requestLevel(i) {
    if (i > MAX_LEVEL) return Promise.resolve(false);
    var L = texLv[i];
    if (L.state === 2) return Promise.resolve(true);
    if (L.state === 1 || L.state === 3) return L.promise || Promise.resolve(false);
    L.state = 1;
    var maxA = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    var z = LEVELS[i].z, w = LEVELS[i].w, h = LEVELS[i].h;
    L.promise = Promise.all([buildMosaic('color', z, 0, 0, w, h), getHeightTex()]).then(function (r) {
      L.color = canvasTex(r[0], false, true, maxA);
      L.height = r[1];
      L.state = 2;
      return true;
    });
    return L.promise;
  }

  var TILE_MAX = HEAVY ? 5 : 2;
  var tiles = {};          // key -> { state, h, c, t, z, ox, oy, cx, cy, promise }
  var tileCur = null, tileWant = null;
  function tileLoadWin(z, lonDeg, latDeg) {
    var Wz = Math.pow(2, z + 1) * TS, Hz = Math.pow(2, z) * TS;
    var cx = (lonDeg + 180) / 360 * Wz, cy = (90 - latDeg) / 180 * Hz;
    // окно центрируется на наблюдателе, шаг сетки 256 px (чтобы не перезагружать при малых сдвигах)
    var ox = Math.max(0, Math.min(Wz - DET_WIN, Math.round((cx - DET_WIN / 2) / 256) * 256));
    var oy = Math.max(0, Math.min(Hz - DET_WIN, Math.round((cy - DET_WIN / 2) / 256) * 256));
    var key = z + '_' + ox + '_' + oy, T = tiles[key];
    if (T) { T.t = performance.now(); return T; }
    T = tiles[key] = { state: 1, h: null, c: null, t: performance.now(), z: z, ox: ox, oy: oy, cx: cx, cy: cy, key: key, Wz: Wz, Hz: Hz };
    var maxA = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
    var gx0 = ox - DET_PAD, gy0 = oy - DET_PAD;
    T.promise = Promise.all([buildMosaic('color', z, gx0, gy0, DET_TOT, DET_TOT)]).then(function (r) {
      T.c = canvasTex(r[0], false, false, maxA);
      T.h = null;
      T.ev = {};
      T.state = 2;
      var keys = Object.keys(tiles).filter(function (k) { return tiles[k].state === 2 && tiles[k] !== tileCur; });
      if (keys.length > TILE_MAX) {
        keys.sort(function (a, b) { return tiles[a].t - tiles[b].t; });
        while (keys.length > TILE_MAX) {
          var o = tiles[keys.shift()];
          if (o.h) o.h.dispose(); if (o.c) o.c.dispose(); for (var kk in o.ev) if (o.ev[kk].tex) o.ev[kk].tex.dispose();
          delete tiles[o.key];
        }
      }
      return true;
    });
    return T;
  }
  function applyDetail(T) {
    tileCur = T || null;
    function setOn(u) {
      if (T) {
        u.uDetC.value = T.c;
        // прямоугольник окна в UV (v отсчитывается снизу вверх)
        u.uDetRect.value.set(T.ox / T.Wz, 1 - (T.oy + DET_WIN) / T.Hz, DET_WIN / T.Wz, DET_WIN / T.Hz);
        u.uDetOn.value = 1;
      } else { u.uDetOn.value = 0; }
    }
    setOn(marsMat.uniforms);
    if (typeof eachSM === 'function') { try { eachSM(function (m) { setOn(m.uniforms); }); } catch (e) {} }
    updateLodText();
    syncElev();
    renderDirty = true;
  }
  // lonDeg/latDeg — точка, на которую смотрим; z — нужный уровень тайлов
  function tileUpdate(lonDeg, latDeg, wantIt, z) {
    if (!wantIt) { if (tileCur) applyDetail(null); return Promise.resolve(false); }
    z = Math.max(0, Math.min(TILES.zMax, z === undefined ? 3 : z));
    var Wz = Math.pow(2, z + 1) * TS, Hz = Math.pow(2, z) * TS;
    var cx = (lonDeg + 180) / 360 * Wz, cy = (90 - latDeg) / 180 * Hz;
    // текущее окно ещё годится: тот же уровень, точка в пределах центральной половины
    if (tileCur && tileCur.z === z && Math.abs(cx - (tileCur.ox + DET_WIN / 2)) < 300 && Math.abs(cy - (tileCur.oy + DET_WIN / 2)) < 300) {
      tileCur.t = performance.now(); return Promise.resolve(true);
    }
    var T = tileLoadWin(z, lonDeg, latDeg);
    if (tileWant === T.key && T.state === 1) return T.promise;
    tileWant = T.key;
    return T.promise.then(function () {
      if (tileWant !== T.key) return false;
      applyDetail(T);
      return true;
    });
  }
  function desiredLevel(d) {
    var want = d > 4.3 ? 0 : (d > 2.9 ? 1 : 2);
    return Math.min(want, MAX_LEVEL);
  }
  function applyTexLevel() {
    var want = desiredLevel(mv.dist), use = -1;
    for (var i = want; i >= 0; i--) { if (texLv[i].state === 2) { use = i; break; } }
    if (use < 0 || use === texCur) return;
    texCur = use;
    var u = marsMat.uniforms;
    u.uColor.value = texLv[use].color;
    u.uHeight.value = texLv[use].height;
    u.uRes.value.set(H_W, H_H);
    updateLodText();
    syncElev();
  }
  // ---- слой Layout (Elevation / Roughness / Dust …): строится лениво, только для активного режима ----
  function dropOtherOv(map, keep) {
    for (var k in map) if (k !== keep) { if (map[k].tex) map[k].tex.dispose(); delete map[k]; }
  }
  var ovFixed = {};   // слои без LOD: id → { tex, ok }
  function ensureLevelElev(i) {
    var L = texLv[i], id = overlay.id;
    if (L.ev[id]) return L.ev[id].p;
    dropOtherOv(L.ev, id);
    var rec = L.ev[id] = { tex: null, ok: false };
    var maxA = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    rec.p = buildMosaic('elev', LEVELS[i].z, 0, 0, LEVELS[i].w, LEVELS[i].h).then(function (cv) {
      rec.tex = canvasTex(cv, false, true, maxA); rec.ok = cv._ok > 0; return rec;
    });
    return rec.p;
  }
  function ensureWinElev(T) {
    var id = overlay.id;
    if (T.ev[id]) return T.ev[id].p;
    dropOtherOv(T.ev, id);
    var rec = T.ev[id] = { tex: null, ok: false };
    var maxA = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
    rec.p = buildMosaic('elev', T.z, T.ox - DET_PAD, T.oy - DET_PAD, DET_TOT, DET_TOT).then(function (cv) {
      rec.tex = canvasTex(cv, false, false, maxA); rec.ok = cv._ok > 0; return rec;
    });
    return rec.p;
  }
  function syncElev() {
    if (!marsMat || !(viewMode === 1 || viewMode >= 3)) return;
    var u = marsMat.uniforms, id = overlay.id;
    if (id !== 'elev') {
      // Roughness / Dust / Plagioclase / Glass / Thermal inertia: один фиксированный уровень (zoom 1: 2 ряда × 4 колонки = 8 тайлов), без LOD и окна детализации
      var fr = ovFixed[id];
      u.uDetEOn.value = 0;
      if (fr && fr.tex) { u.uElev.value = fr.tex; u.uElevOn.value = fr.ok ? 1 : 0; }
      else {
        u.uElevOn.value = 0;
        if (!fr) {
          dropOtherOv(ovFixed, id);
          fr = ovFixed[id] = { tex: null, ok: false };
          var zf = 1, maxF = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
          fr.p = buildMosaic('elev', zf, 0, 0, Math.pow(2, zf + 1) * TS, Math.pow(2, zf) * TS).then(function (cv) {
            fr.tex = canvasTex(cv, false, true, maxF); fr.ok = cv._ok > 0;
            if (id === overlay.id) { syncElev(); renderDirty = true; }
          });
        }
      }
      renderDirty = true;
      return;
    }
    var i = texCur;
    if (i >= 0) {
      var rec = texLv[i].ev[id];
      if (rec && rec.tex) { u.uElev.value = rec.tex; u.uElevOn.value = rec.ok ? 1 : 0; }
      else { u.uElevOn.value = 0; ensureLevelElev(i).then(function () { if (id === overlay.id) { syncElev(); renderDirty = true; } }); }
    }
    var T = tileCur;
    if (T && T.z < TILES.zSurface - 1) {
      var wr = T.ev[id];
      if (wr && wr.tex) { u.uDetE.value = wr.tex; u.uDetEOn.value = wr.ok ? 1 : 0; }
      else { u.uDetEOn.value = 0; ensureWinElev(T).then(function () { if (id === overlay.id && tileCur === T) { syncElev(); renderDirty = true; } }); }
    } else { u.uDetEOn.value = 0; }
    renderDirty = true;
  }

  function makeGeoMesh(i) {
    if (geoMeshes[i] || !marsMat) return;
    var m = new THREE.Mesh(new THREE.SphereGeometry(1, GEO_SIZES[i][0], GEO_SIZES[i][1]), marsMat);
    m.frustumCulled = false;
    m.visible = false;
    marsSpin.add(m);
    geoMeshes[i] = m;
  }
  function updateGeoLod() {
    var d = mv.dist, w = geoCur < 0 ? 0 : geoCur;
    if (geoCur < 0) { w = d > 4.6 ? 0 : (d > 2.5 ? 1 : 2); }
    else {
      if (w === 0 && d < 4.4) w = 1;
      if (w >= 1 && d > 4.8) w = 0;
      if (w <= 1 && d < 2.35) w = 2;
      if (w === 2 && d > 2.65) w = 1;
    }
    w = Math.min(w, MAX_GEO);
    while (w > 0 && !geoMeshes[w]) w--;
    if (w === geoCur) return;
    geoCur = w;
    for (var i = 0; i < geoMeshes.length; i++) if (geoMeshes[i]) geoMeshes[i].visible = (i === w);
    updateLodText();
  }
  function updateLodText() {
    if (!lodEl) return;
    var lv = texCur >= 0 ? LEVELS[texCur].name : '…';
    var g = geoCur >= 0 ? GEO_SIZES[geoCur][0] + '×' + GEO_SIZES[geoCur][1] : '…';
    lodEl.textContent = 'Detail level ' + (Math.max(texCur, 0) + 1) + ' · ' + lv + ' maps' + (tileCur ? ' + zoom ' + tileCur.z : '') + ' · mesh ' + g;
  }

  // ---- Сцена Марса ---------------------------------------------------------
  function buildMars() {
    marsScene = new THREE.Scene();
    marsCam = new THREE.PerspectiveCamera(30, 1, 0.02, 4000);
    marsRoot = new THREE.Object3D();
    marsScene.add(marsRoot);
    marsSpin = new THREE.Object3D();
    marsRoot.add(marsSpin);

    var phColor = new THREE.DataTexture(new Uint8Array([170, 92, 64, 255]), 1, 1, THREE.RGBAFormat);
    phColor.needsUpdate = true;
    var phHeight = new THREE.DataTexture(new Uint8Array([74, 209, 0, 255]), 1, 1, THREE.RGBAFormat);
    phHeight.magFilter = THREE.NearestFilter; phHeight.minFilter = THREE.NearestFilter; phHeight.generateMipmaps = false;
    phHeight.needsUpdate = true;

    marsMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: phColor },
        uHeight: { value: phHeight },
        uDetH: { value: phHeight },
        uDetC: { value: phColor },
        uElev: { value: phColor },
        uDetE: { value: phColor },
        uElevOn: { value: 0 },
        uDetEOn: { value: 0 },
        uDetHOn: { value: 0 },
        uDetRect: { value: new THREE.Vector4(0, 0, 1, 1) },
        uDetOn: { value: 0 },
        uRamp:  { value: makeRampTexture({ THREE }) },
        uRampT: { value: makeRampTexture({ THREE, tab: TEMP_RAMP, lo: K_LO, hi: K_HI }) },
        uSunLagObj: { value: new THREE.Vector3(1, 0, 0) },
        uFlux: { value: 586 },
        uRes: { value: new THREE.Vector2(2048, 1024) },
        uExag: { value: EXAG },
        uSunObj: { value: sunObj.clone() },
        uMode: { value: 0 },
        uGrid: { value: 0 },
        uCell: { value: new THREE.Vector4(0, 0, 0, 0) },
        uHome: { value: new THREE.Vector4(0, 0, 0, 0) }
      },
      vertexShader: MARS_VERT,
      fragmentShader: MARS_FRAG,
      defines: { SHADOW_STEPS: HEAVY ? 6 : 0, CRATER_LAYERS: 2 },
      extensions: { derivatives: true }
    });
    makeGeoMesh(0);

    marsAtmoMat = new THREE.ShaderMaterial({
      uniforms: { uSun: { value: new THREE.Vector3(1, 0, 0) } },
      vertexShader: MARS_ATMO_VERT,
      fragmentShader: MARS_ATMO_FRAG,
      side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    marsRoot.add(new THREE.Mesh(new THREE.SphereGeometry(1.1, 64, 48), marsAtmoMat));

    var moonDefs = [
      { name: 'Phobos', r: 0.075, orbit: 1.75, speed: 0.45, tilt: 0.22, color: 0x6d6058, sc: [1.35, 1, 1.1], seed: 3 },
      { name: 'Deimos', r: 0.05, orbit: 2.45, speed: 0.14, tilt: -0.3, color: 0x8c7f72, sc: [1.1, 1, 0.95], seed: 9 }
    ];
    moonDefs.forEach(function (d) {
      var tiltG = new THREE.Object3D();
      tiltG.rotation.x = d.tilt;
      marsRoot.add(tiltG);
      var pivot = new THREE.Object3D();
      pivot.rotation.y = d.seed;
      tiltG.add(pivot);
      var m = new THREE.Mesh(
        moonGeometry(d.seed),
        new THREE.MeshStandardMaterial({ color: d.color, roughness: 1, metalness: 0, flatShading: true })
      );
      m.scale.set(d.r * d.sc[0], d.r * d.sc[1], d.r * d.sc[2]);
      m.position.x = d.orbit;
      pivot.add(m);
      marsMoons.push({ def: d, pivot: pivot, mesh: m, angle: d.seed });
      var mel = document.createElement('div');
      mel.className = 'glabel moon';
      mel.textContent = d.name;
      labelsEl.appendChild(mel);
      moonLabels.push({ el: mel, mesh: m });
    });

    marsScene.add(new THREE.AmbientLight(0x445577, 0.18));
    marsLight = new THREE.DirectionalLight(0xfff0dc, 2.4);
    marsScene.add(marsLight);

    var st = new THREE.Points(starGeo, starMat);
    st.frustumCulled = false;
    marsScene.add(st);

    buildLabels();

    viewport.setMarsResizeHandler(function (w, h) {
      marsCam.aspect = w / h;
      marsCam.updateProjectionMatrix();
      var half = THREE.MathUtils.degToRad(marsCam.fov / 2);
      var halfH = Math.atan(Math.tan(half) * marsCam.aspect);
      var ang = Math.min(half, halfH) * 0.8;
      mv.fit = 1 / Math.sin(ang);
      if (!mv.userZoomed && mode === 'mars') mv.tDist = mv.fit;
    });
  }

  // ---- Подписи сетки -------------------------------------------------------
  var gLabels = [];
  function buildLabels() {
    var lon, defs = [];
    for (lon = -150; lon <= 180; lon += 30) defs.push({ kind: 'lon', lon: lon, lat: 0, text: lonText(lon) });
    [-60, -30, 30, 60].forEach(function (lat) {
      defs.push({ kind: 'lat', lon: 0, lat: lat, text: Math.abs(lat) + '°' + (lat > 0 ? 'N' : 'S') });
    });
    defs.forEach(function (d) {
      var el = document.createElement('div');
      el.className = 'glabel ' + d.kind;
      el.textContent = d.text;
      labelsEl.appendChild(el);
      d.el = el;
      gLabels.push(d);
    });
  }
  var moonLabels = [];
  var moonW = new THREE.Vector3(), moonCam = new THREE.Vector3();
  function updateMoonLabels() {
    var w = window.innerWidth, h = window.innerHeight;
    marsCam.updateMatrixWorld(true);
    for (var i = 0; i < moonLabels.length; i++) {
      var L = moonLabels[i];
      L.mesh.getWorldPosition(moonW);
      moonCam.copy(marsCam.position);
      // закрыт ли спутник диском Марса: расстояние от центра до отрезка камера—спутник
      var dx = moonW.x - moonCam.x, dy = moonW.y - moonCam.y, dz = moonW.z - moonCam.z;
      var len2 = dx * dx + dy * dy + dz * dz;
      var tt = Math.max(0, Math.min(1, -(moonCam.x * dx + moonCam.y * dy + moonCam.z * dz) / len2));
      var px = moonCam.x + dx * tt, py = moonCam.y + dy * tt, pz = moonCam.z + dz * tt;
      var occluded = tt > 0.001 && tt < 0.999 && (px * px + py * py + pz * pz) < 1.0;
      moonW.project(marsCam);
      var x = (moonW.x * 0.5 + 0.5) * w, y = (-moonW.y * 0.5 + 0.5) * h;
      var vis = !occluded && moonW.z < 1 && x > 0 && x < w && y > 0 && y < h;
      L.el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
      L.el.style.opacity = vis ? '1' : '0';
    }
  }
  function updateLabels() {
    updateMoonLabels();
    if (!gridOn) return;
    var w = window.innerWidth, h = window.innerHeight;
    marsCam.updateMatrixWorld(true);
    marsSpin.getWorldQuaternion(tmpQ);
    tmpV.set(0, 0, 1).applyQuaternion(tmpQ.clone().invert());
    var lonC = Math.atan2(-tmpV.z, tmpV.x) / D2R;
    var latLon = Math.round(lonC / 30) * 30;
    for (var i = 0; i < gLabels.length; i++) {
      var d = gLabels[i];
      var lo = (d.kind === 'lat' ? latLon : d.lon) * D2R, la = d.lat * D2R;
      tmpW.set(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo));
      tmpW.multiplyScalar(1.0).applyMatrix4(marsSpin.matrixWorld);
      tmpC.copy(tmpW).normalize();
      var toCam = tmpV.copy(marsCam.position).sub(tmpW).normalize();
      var facing = tmpC.dot(toCam);
      var op = clamp01((facing - 0.18) / 0.25);
      if (op <= 0.01) { d.el.style.opacity = '0'; continue; }
      tmpW.project(marsCam);
      var x = (tmpW.x * 0.5 + 0.5) * w, y = (-tmpW.y * 0.5 + 0.5) * h;
      d.el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
      d.el.style.opacity = op.toFixed(2);
    }
  }

  function clearPressed() {
    var bs = marsNav.querySelectorAll('button');
    for (var i = 0; i < bs.length; i++) bs[i].setAttribute('aria-pressed', 'false');
  }
  function flyTo(lonDeg, latDeg, dist) {
    var f = faceAngles(lonDeg, latDeg);
    mv.tSpin = f.spin;
    mv.tPitch = Math.max(-1.45, Math.min(1.45, f.pitch));
    mv.tDist = clampDist(dist);
    mv.fly = true; mv.auto = false; mv.userZoomed = true;
    mv.vSpin = 0; mv.vPitch = 0;
  }
  function startView() {
    var lon = sunInfo.lonE - 40;
    return faceAngles(lon > 180 ? lon - 360 : (lon < -180 ? lon + 360 : lon), 12);
  }
  function resetMarsView(initial) {
    var f = startView();
    mv.spin = f.spin; mv.pitch = f.pitch;
    mv.dist = initial ? 12 : mv.dist;
    mv.tDist = mv.fit;
    mv.fly = false; mv.auto = true; mv.dragging = false;
    mv.vSpin = 0; mv.vPitch = 0; mv.userZoomed = false;
    perf.t = 0; perf.n = 0; perf.warm = 40;
  }
  function zoomBy(factor) {
    mv.userZoomed = true; mv.auto = false; mv.fly = false;
    mv.tDist = clampDist(mv.tDist * factor);
  }
  function setViewMode(m) {
    viewMode = m;
    var OV_IDS = ['rough', 'dust', 'plag', 'glass', 'tin'];
    overlay.id = m >= 3 ? OV_IDS[m - 3] : 'elev';
    if (marsMat) marsMat.uniforms.uMode.value = m >= 3 ? 3 : m;
    legendEl.hidden = (m === 0 || m >= 3);
    if (m > 0 && m < 3) legend.setMode(m);
    syncElev();
    var opts = layoutPop.querySelectorAll('.opt');
    for (var i = 0; i < opts.length; i++) {
      opts[i].setAttribute('aria-checked', String(parseInt(opts[i].getAttribute('data-mode'), 10) === m));
    }
  }
  function setGrid(on) {
    gridOn = on;
    if (marsMat) marsMat.uniforms.uGrid.value = (on || homeArmed) ? 1 : 0;
    btnGrid.setAttribute('aria-pressed', String(on));
    if (marsMat && marsSpin) { marsSpin.getWorldQuaternion(tmpQ); tmpV.set(0, 0, 1).applyQuaternion(tmpQ.clone().invert()); updateSector(Math.atan2(-tmpV.z, tmpV.x) / D2R, Math.asin(Math.max(-1, Math.min(1, tmpV.y))) / D2R); renderDirty = true; }
    if (!on) for (var i = 0; i < gLabels.length; i++) gLabels[i].el.style.opacity = '0';
  }
  function updateTiles() {
    if (mv.dist > (tileCur ? 3.4 : 2.9) || texLv[MAX_LEVEL].state !== 2) { tileUpdate(0, 0, false); tileWant = null; return; }
    marsSpin.getWorldQuaternion(tmpQ);
    tmpV.set(0, 0, 1).applyQuaternion(tmpQ.clone().invert());
    var zp = Math.min(TILES.zPlanetMax, TILES.zMax, 4 + (mv.dist < 1.8) + (mv.dist < 1.4) + (mv.dist < 1.2));
    tileUpdate(Math.atan2(-tmpV.z, tmpV.x) / D2R, Math.asin(Math.max(-1, Math.min(1, tmpV.y))) / D2R, true, zp);
  }
  function updateSector(lonC, latC) {
    if (!gridOn) { sectorEl.textContent = ''; marsMat.uniforms.uCell.value.set(0, 0, 0, 0); return; }
    var l0 = Math.max(-180, Math.min(150, Math.floor(lonC / 30) * 30));
    var a0 = Math.max(-90, Math.min(60, Math.floor(latC / 30) * 30));
    var c = marsMat.uniforms.uCell.value;
    if (c.x !== l0 || c.z !== a0) { c.set(l0, l0 + 30, a0, a0 + 30); renderDirty = true; }
    var lm = l0 + 15, lt = (12 + (lm - sunInfo.lonE) / 15) % 24;
    if (lt < 0) lt += 24;
    var hh = Math.floor(lt), mm = Math.floor((lt - hh) * 60);
    sectorEl.textContent = 'Grid sector ' + lonText(l0) + ' – ' + lonText(l0 + 30) + ' · ' +
      Math.abs(a0) + '°' + (a0 < 0 ? 'S' : 'N') + ' – ' + Math.abs(a0 + 30) + '°' + (a0 + 30 < 0 ? 'S' : (a0 + 30 === 0 ? '' : 'N')) +
      ' · solar time at its centre ' + pad2(hh) + ':' + pad2(mm);
  }
  function updateReadout() {
    marsSpin.getWorldQuaternion(tmpQ);
    tmpV.set(0, 0, 1).applyQuaternion(tmpQ.clone().invert());
    var lonC = Math.atan2(-tmpV.z, tmpV.x) / D2R;
    var ltst = (12 + (lonC - sunInfo.lonE) / 15) % 24;
    if (ltst < 0) ltst += 24;
    var hh = Math.floor(ltst), mm = Math.floor((ltst - hh) * 60);
    var day = (ltst > 6 && ltst < 18) ? 'day' : 'night';
    updateHome();
    updateSector(lonC, Math.asin(Math.max(-1, Math.min(1, tmpV.y))) / D2R);
    sunEl.textContent = 'Sun over ' + fmtLonLat(sunInfo.lonE, sunInfo.lat) + ' · Ls ' + sunInfo.Ls.toFixed(0) +
      '° · solar time at view centre ' + pad2(hh) + ':' + pad2(mm) + ' (' + day + ')';
  }

  function updateMars(dt) {
    mv.dist += (mv.tDist - mv.dist) * (1 - Math.exp(-dt * 5));
    if (mv.fly) {
      var kf = 1 - Math.exp(-dt * 4);
      var ds = angDiff(mv.tSpin, mv.spin), dp = mv.tPitch - mv.pitch;
      mv.spin += ds * kf;
      mv.pitch += dp * kf;
      if (Math.abs(ds) < 0.002 && Math.abs(dp) < 0.002) mv.fly = false;
    } else if (!mv.dragging) {
      if (mv.auto) mv.spin += dt * 0.02;
      mv.spin += mv.vSpin * dt;
      mv.pitch = Math.max(-1.45, Math.min(1.45, mv.pitch + mv.vPitch * dt));
      var decay = Math.exp(-dt * 3);
      mv.vSpin *= decay; mv.vPitch *= decay;
    }
    marsSpin.rotation.y = mv.spin;
    marsRoot.rotation.x = mv.pitch;
    marsCam.position.set(0, 0, mv.dist);
    marsRoot.updateMatrixWorld(true);

    // реальное Солнце: пересчёт по текущему времени
    updateSun();
    marsMat.uniforms.uSunObj.value.copy(sunObj);
    var lagLon = (sunInfo.lonE + 18) * D2R, lagLat = sunInfo.lat * D2R;   // тепловая инерция ≈ 1.2 марсианских часа
    marsMat.uniforms.uSunLagObj.value.set(Math.cos(lagLat) * Math.cos(lagLon), Math.sin(lagLat), -Math.cos(lagLat) * Math.sin(lagLon));
    var rAU = 1.5237 * (1 - 0.0934 * 0.0934) / (1 + 0.0934 * Math.cos((sunInfo.Ls - 251) * D2R));
    marsMat.uniforms.uFlux.value = 1361 / (rAU * rAU);
    marsSpin.getWorldQuaternion(tmpQ);
    sunWorld.copy(sunObj).applyQuaternion(tmpQ);
    marsAtmoMat.uniforms.uSun.value.copy(sunWorld);
    marsLight.position.copy(sunWorld).multiplyScalar(10);

    for (var i = 0; i < marsMoons.length; i++) {
      var m = marsMoons[i];
      m.angle += m.def.speed * dt;
      m.pivot.rotation.y = m.angle;
      m.mesh.rotation.y += dt * 0.2;
    }

    // уровни детализации
    if (mv.dist < 5.5) requestLevel(1).then(applyTexLevel);
    if (mv.dist < 4.2) requestLevel(2).then(applyTexLevel);
    applyTexLevel();
    updateGeoLod();

    updateLabels();
    uiTimer -= dt;
    if (uiTimer <= 0) { uiTimer = 0.5; updateReadout(); updateTiles(); }

    // адаптивное разрешение рендера
    if (perf.warm > 0) { perf.warm--; return; }
    perf.t += dt; perf.n++;
    if (perf.n >= 60) {
      var avg = perf.t / perf.n;
      perf.t = 0; perf.n = 0;
      var pr = renderer.getPixelRatio();
      if (avg > 0.034 && pr > 0.85) {
        renderer.setPixelRatio(Math.max(0.75, pr - 0.25));
        resize();
      }
    }
  }

  function openMars() {
    if (transitioning || mode === 'mars') return;
    transitioning = true;
    veil.classList.add('on');
    wait(480).then(function () {
      if (!marsScene) buildMars();
      return Promise.race([requestLevel(0), wait(8000).then(function () { return false; })]);
    }).then(function () {
      mode = 'mars';
      tag.hidden = true;
      marsUI.hidden = false;
      clearPressed();
      setViewMode(viewMode);
      setGrid(gridOn);
      renderer.setPixelRatio(Math.min(BASE_PR, 1.25));
      resize();
      updateSun();
      resetMarsView(true);
      texCur = -1;
      applyTexLevel();
      updateGeoLod();
      updateReadout();
      renderer.compile(marsScene, marsCam);
      renderer.domElement.style.cursor = 'grab';
      // фоновая подгрузка более подробных уровней и сеток
      requestLevel(1).then(applyTexLevel);
      setTimeout(function () { makeGeoMesh(1); updateGeoLod(); }, 500);
      return wait(80);
    }).then(function () {
      veil.classList.remove('on');
      marsBack.focus({ preventScroll: true });
      return wait(480);
    }).then(function () { transitioning = false; });
  }

  function closeMars() {
    if (transitioning || mode !== 'mars') return;
    if (pegArmed) setArmed(false);
    if (homeArmed) setHomeArmed(false);
    transitioning = true;
    veil.classList.add('on');
    wait(480).then(function () {
      mode = 'system';
      marsUI.hidden = true;
      layoutPop.hidden = true;
      btnLayout.setAttribute('aria-expanded', 'false');
      tag.hidden = false;
      renderer.setPixelRatio(BASE_PR);
      resize();
      renderer.domElement.style.cursor = '';
      return wait(60);
    }).then(function () {
      veil.classList.remove('on');
      return wait(480);
    }).then(function () { transitioning = false; });
  }

  // ---- Ввод ----------------------------------------------------------------
  var cv = renderer.domElement;
  var ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function hitsMars(e) {
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    var hits = ray.intersectObjects([sun, mars.mesh]);
    return hits.length > 0 && hits[0].object === mars.mesh;
  }

  var ptrs = {}, lastPinch = 0, lastMoveT = 0;
  function nPtrs() { return Object.keys(ptrs).length; }
  function pinchDist() {
    var ks = Object.keys(ptrs);
    if (ks.length < 2) return 0;
    var a = ptrs[ks[0]], b = ptrs[ks[1]];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  tag.addEventListener('click', openMars);
  marsBack.addEventListener('click', closeMars);
  cv.addEventListener('click', function (e) {
    if (mode === 'system' && !transitioning && hitsMars(e)) openMars();
  });

  cv.addEventListener('pointerdown', function (e) {
    if (mode !== 'mars') return;
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    mv.dragging = true; mv.auto = false; mv.fly = false; mv.vSpin = 0; mv.vPitch = 0;
    clearPressed();
    layoutPop.hidden = true;
    btnLayout.setAttribute('aria-expanded', 'false');
    lastMoveT = e.timeStamp;
    if (nPtrs() === 2) lastPinch = pinchDist();
    cv.style.cursor = 'grabbing';
  });
  cv.addEventListener('pointermove', function (e) {
    if (mode === 'system') {
      cv.style.cursor = hitsMars(e) ? 'pointer' : '';
      return;
    }
    var p = ptrs[e.pointerId];
    if (!p) return;
    var dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (nPtrs() === 1) {
      var k = Math.max(0.0006, 2 * Math.tan(0.2618) * (mv.dist - 1) / window.innerHeight);
      mv.spin += dx * k;
      mv.pitch = Math.max(-1.45, Math.min(1.45, mv.pitch + dy * k));
      var dtm = Math.max(8, e.timeStamp - lastMoveT);
      mv.vSpin = 0.6 * (dx * k / dtm * 1000) + 0.4 * mv.vSpin;
      mv.vPitch = 0.6 * (dy * k / dtm * 1000) + 0.4 * mv.vPitch;
      lastMoveT = e.timeStamp;
    } else if (nPtrs() === 2) {
      var d = pinchDist();
      if (lastPinch > 0 && d > 0) {
        mv.dist = mv.tDist = clampDist(mv.dist * lastPinch / d);
        mv.userZoomed = true;
      }
      lastPinch = d;
    }
  });
  function endPointer(e) {
    if (!ptrs[e.pointerId]) return;
    delete ptrs[e.pointerId];
    if (nPtrs() === 0) {
      mv.dragging = false;
      if (e.timeStamp - lastMoveT > 90) { mv.vSpin = 0; mv.vPitch = 0; }
      if (mode === 'mars') cv.style.cursor = 'grab';
    }
    lastPinch = 0;
  }
  cv.addEventListener('pointerup', endPointer);
  cv.addEventListener('pointercancel', endPointer);
  cv.addEventListener('wheel', function (e) {
    if (mode !== 'mars') return;
    e.preventDefault();
    var dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    mv.userZoomed = true; mv.auto = false;
    mv.tDist = clampDist(mv.tDist * Math.exp(dy * 0.0012));
  }, { passive: false });

  marsNav.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b) return;
    clearPressed();
    if (b.getAttribute('data-reset')) {
      var f = startView();
      mv.tSpin = f.spin; mv.tPitch = f.pitch; mv.tDist = mv.fit;
      mv.fly = true; mv.auto = true; mv.userZoomed = false;
    } else {
      b.setAttribute('aria-pressed', 'true');
      flyTo(parseFloat(b.getAttribute('data-lon')), parseFloat(b.getAttribute('data-lat')), parseFloat(b.getAttribute('data-dist')));
    }
  });

  // кнопки зума (удержание = непрерывный зум)
  function holdZoom(btn, factor) {
    var timer = 0;
    function stop() { if (timer) { clearInterval(timer); timer = 0; } }
    btn.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      zoomBy(factor);
      stop();
      timer = setInterval(function () { zoomBy(factor > 1 ? 1.06 : 0.94); }, 70);
    });
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointerleave', stop);
    btn.addEventListener('pointercancel', stop);
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); zoomBy(factor); }
    });
  }
  holdZoom(btnZoomIn, 0.8);
  holdZoom(btnZoomOut, 1.25);

  btnLayout.addEventListener('click', function () {
    var open = layoutPop.hidden;
    layoutPop.hidden = !open;
    btnLayout.setAttribute('aria-expanded', String(open));
  });
  layoutPop.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b) return;
    setViewMode(parseInt(b.getAttribute('data-mode'), 10));
    layoutPop.hidden = true;
    btnLayout.setAttribute('aria-expanded', 'false');
  });
  btnGrid.addEventListener('click', function () { setGrid(!gridOn); });

  window.addEventListener('keydown', function (e) {
    if (mode !== 'mars') return;
    if (e.key === 'Escape') {
      if (pegArmed) return;
      if (!layoutPop.hidden) { layoutPop.hidden = true; btnLayout.setAttribute('aria-expanded', 'false'); }
      else closeMars();
    } else if (e.key === '+' || e.key === '=') zoomBy(0.85);
    else if (e.key === '-' || e.key === '_') zoomBy(1.18);
    else if (e.key === 'g' || e.key === 'G') setGrid(!gridOn);
  });


  // ---- Режим «Исследователь»: вид от первого лица на поверхности ----------
  var surfScene = null, surfCam = null, surfMat = null;
  var surf = {
    lon: 0, lat: 0, yaw: 0, pitch: 0.07, fov: 70, tOff: 0, play: false, tex: -1,
    siteKm: null, uiT: 0, panoReady: false, panoCur: -1, job: null, building: false, hold: false, pmode: -1, panoAge: 0, panoSwap: false, panoTex: -1, basePR: 0, sE: 0, sN: 0, sU: 1, ss: null, perfT: 0, perfN: 0, perfWarm: 30
  };
  var surfUIEl = document.getElementById('surf-ui');
  var surfBack = document.getElementById('surf-back');
  var surfLocEl = document.getElementById('surf-loc');
  var surfSunEl = document.getElementById('surf-sun');
  var surfPhaseEl = document.getElementById('surf-phase');
  var surfTimeEl = document.getElementById('surf-time');
  var surfSubEl = document.getElementById('surf-sub');
  var surfZin = document.getElementById('surf-zin');
  var surfZout = document.getElementById('surf-zout');
  var cpCard = document.getElementById('cp-card');
  var cpRead = document.getElementById('cp-read');
  var pegBtn = document.getElementById('btn-peg');
  var pegGhost = document.getElementById('peg-ghost');
  var marsHint = marsUI.querySelector('.mu-hint');
  var marsHintText = marsHint ? marsHint.textContent : '';

  var panoMat = null, showMat = null, panoScene = null, showScene = null;
  var panoRT = [null, null];
  var PANO_W = HEAVY ? 4096 : 2048, PANO_H = PANO_W / 2, PANO_STRIPS = 32;
  function makeSurfMat(pano) {
    var d = pano ? { PANO: 1, STEPS: HEAVY ? 120 : 72, SHADOW_STEPS: HEAVY ? 16 : 8 }
                 : { STEPS: HEAVY ? 70 : 52, SHADOW_STEPS: HEAVY ? 8 : 5 };
    return new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: marsMat.uniforms.uColor.value },
        uHeight: { value: marsMat.uniforms.uHeight.value },
        uDetH: { value: marsMat.uniforms.uDetH.value },
        uDetC: { value: marsMat.uniforms.uDetC.value },
        uDetRect: { value: marsMat.uniforms.uDetRect.value.clone() },
        uDetOn: { value: 0 },
        uDetHOn: { value: 0 },
        uRes: { value: new THREE.Vector2(2048, 1024) },
        uExag: { value: 1 },
        uObsLL: { value: new THREE.Vector2(0, 0) },
        uP0: { value: new THREE.Vector4(0, 0, 0, 0) },
        uD0: { value: new THREE.Vector4(0, 0, 0, 0) },
        uSeed: { value: new THREE.Vector2(0, 0) },
        uSun: { value: new THREE.Vector3(1, 0, 0.5) },
        uView: { value: new THREE.Vector2(0, 0) },
        uScr: { value: new THREE.Vector2(0.7, 1.6) },
        uPx: { value: pano ? 2 * Math.PI / PANO_W : 0.001 },
        uStar: { value: new THREE.Matrix3() }
      },
      vertexShader: SURF_VERT,
      fragmentShader: SURF_FRAG,
      defines: d,
      depthTest: false, depthWrite: false
    });
  }
  function eachSM(f) { f(surfMat); f(panoMat); }
  function buildSurface() {
    surfMat = makeSurfMat(false);
    panoMat = makeSurfMat(true);
    showMat = new THREE.ShaderMaterial({
      uniforms: { uPano: { value: null }, uView: { value: new THREE.Vector2(0, 0) }, uScr: { value: new THREE.Vector2(0.7, 1.6) } },
      vertexShader: SURF_VERT, fragmentShader: SURF_SHOW_FRAG, depthTest: false, depthWrite: false
    });
    surfCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    function sceneOf(m) {
      var sc = new THREE.Scene();
      var q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
      q.frustumCulled = false;
      sc.add(q);
      return sc;
    }
    surfScene = sceneOf(surfMat);
    panoScene = sceneOf(panoMat);
    showScene = sceneOf(showMat);
  }
  function makePanoRT() {
    var rt = new THREE.WebGLRenderTarget(PANO_W, PANO_H, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType, depthBuffer: false, stencilBuffer: false, generateMipmaps: false
    });
    rt.texture.wrapS = THREE.RepeatWrapping;
    rt.texture.wrapT = THREE.ClampToEdgeWrapping;
    return rt;
  }
  // панорама рисуется полосами (по несколько на кадр) и потом просто показывается
  function panoStart() {
    surfSun();
    var idx = surf.panoCur === 0 ? 1 : 0;
    if (!panoRT[idx]) panoRT[idx] = makePanoRT();
    surf.job = { idx: idx, row: 0, tex: surf.tex };
  }
  function panoStep(n) {
    var j = surf.job;
    if (!j) return;
    var rt = panoRT[j.idx], rows = PANO_H / PANO_STRIPS;
    for (var k = 0; k < n && j.row < PANO_STRIPS; k++, j.row++) {
      rt.scissorTest = true;
      rt.scissor.set(0, j.row * rows, PANO_W, rows);
      rt.viewport.set(0, 0, PANO_W, PANO_H);
      renderer.setRenderTarget(rt);
      renderer.render(panoScene, surfCam);
    }
    renderer.setRenderTarget(null);
    if (j.row >= PANO_STRIPS) {
      surf.panoCur = j.idx;
      showMat.uniforms.uPano.value = rt.texture;
      surf.panoTex = j.tex;
      surf.panoAge = 0;
      surf.panoSwap = true;
      surf.panoReady = true;
      surf.job = null;
    }
  }

  // высота рельефа в точке (км) по 1K-карте высот, для подписи
  var hCan = null;
  function siteHeightKm(lonDeg, latDeg) {
    try {
      var L = texLv[0];
      if (!L.height || !L.height.image) return null;
      if (!hCan) {
        var img = L.height.image;
        var c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        var g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        hCan = { w: c.width, h: c.height, d: g.getImageData(0, 0, c.width, c.height).data };
      }
      var x = (lonDeg / 360 + 0.5) * hCan.w - 0.5, y = (0.5 - latDeg / 180) * hCan.h - 0.5;
      var x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
      function at(ix, iy) {
        ix = ((ix % hCan.w) + hCan.w) % hCan.w;
        iy = Math.max(0, Math.min(hCan.h - 1, iy));
        var o = (iy * hCan.w + ix) * 4;
        return (hCan.d[o] * 256 + hCan.d[o + 1]) / 65535 * 31 - 9;
      }
      var a = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
      var b = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
      return a * (1 - fy) + b * fy;
    } catch (err) { return null; }
  }

  // ---- Выбор точки на шаре ---------------------------------------------------
  var invM = new THREE.Matrix4(), pkO = new THREE.Vector3(), pkD = new THREE.Vector3();
  function pickMars(cx, cy) {
    if (!marsCam || mode !== 'mars') return null;
    if (flatOn) return pickFlat(cx, cy);
    marsRoot.updateMatrixWorld(true);
    marsCam.updateMatrixWorld(true);
    ndc.set((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, marsCam);
    invM.copy(marsSpin.matrixWorld).invert();
    pkO.copy(ray.ray.origin).applyMatrix4(invM);
    pkD.copy(ray.ray.direction).transformDirection(invM);
    var b = pkO.dot(pkD), c = pkO.dot(pkO) - 1.0, disc = b * b - c;
    if (disc < 0) return null;
    var t = -b - Math.sqrt(disc);
    if (t < 0) return null;
    var px = pkO.x + pkD.x * t, py = pkO.y + pkD.y * t, pz = pkO.z + pkD.z * t;
    return { lon: Math.atan2(-pz, px) / D2R, lat: Math.asin(Math.max(-1, Math.min(1, py))) / D2R };
  }

  function surfSun() {
    var S = sunFor(surf.lon, surf.lat, surf.tOff);
    surf.ss = S.ss; surf.sE = S.sE; surf.sN = S.sN; surf.sU = S.sU;
    var c0 = S.c0, c1 = S.c1, c2 = S.c2;
    var u0 = surf.lon / (2 * Math.PI) + 0.5, v0 = surf.lat / Math.PI + 0.5;
    eachSM(function (m) {
      m.uniforms.uStar.value.set(c0[0], c1[0], c2[0], c0[1], c1[1], c2[1], c0[2], c1[2], c2[2]);
      m.uniforms.uSun.value.set(surf.sE, surf.sN, surf.sU);
      // точное (double) положение наблюдателя в текселях: целая и дробная части отдельно (float32 в шейдере даёт ступени ~1 м)
      var rs = m.uniforms.uRes.value;
      var bx = u0 * rs.x, by = v0 * rs.y;
      m.uniforms.uP0.value.set(Math.floor(bx), Math.floor(by), bx - Math.floor(bx), by - Math.floor(by));
    });
  }

  // Высоты: сглаженная копия карты модели (1024×512, ≈20 км/px) — почти голый шарик без артефактов; цвет — мозаика NASA из общего вида.
  var surfHeight = null, surfHeightP = null;
  function loadSurfHeight() {
    if (!surfHeightP) surfHeightP = new Promise(function (resolve) {
      var im = new Image();
      im.onload = function () {
        var t = new THREE.Texture(im);
        t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
        t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
        resolve({ tex: t, w: im.width, h: im.height });
      };
      im.onerror = function () { resolve(null); };
      im.src = 'assets/mars-height-surface.png';
    });
    return surfHeightP;
  }
  function applySurfTex() {
    var use = -1;
    for (var i = MAX_LEVEL; i >= 0; i--) { if (texLv[i].state === 2) { use = i; break; } }
    if (use < 0) return;
    var key = use + (surfHeight ? 100 : 0);
    if (key === surf.tex) return;
    surf.tex = key;
    var H = surfHeight || { tex: texLv[use].height, w: H_W, h: H_H };   // нет сглаженной карты — берём обычную
    eachSM(function (m) {
      m.uniforms.uColor.value = texLv[use].color;
      m.uniforms.uHeight.value = H.tex;
      m.uniforms.uRes.value.set(H.w, H.h);
    });
  }

  function surfHud() {
    var ss = surf.ss; if (!ss) return;
    var htx = homeText(); surfHomeEl.hidden = !htx; surfHomeEl.textContent = htx;
    var lonDeg = surf.lon / D2R, latDeg = surf.lat / D2R;
    var ltst = (12 + (lonDeg - ss.lonE) / 15) % 24; if (ltst < 0) ltst += 24;
    var alt = Math.asin(Math.max(-1, Math.min(1, surf.sU))) / D2R;
    var az = Math.atan2(surf.sE, surf.sN) / D2R; if (az < 0) az += 360;
    var morning = ltst < 12, phase;
    if (alt > 6) phase = morning ? 'Morning' : 'Afternoon';
    else if (alt > 0) phase = morning ? 'Sunrise' : 'Sunset';
    else if (alt > -6) phase = morning ? 'Dawn' : 'Dusk';
    else if (alt > -18) phase = morning ? 'Pre-dawn twilight' : 'Evening twilight';
    else phase = 'Night';
    surfPhaseEl.textContent = phase;
    surfTimeEl.textContent = fmtClock(ltst);
    var sinD = Math.sin(ss.lat * D2R), cosD = Math.cos(ss.lat * D2R);
    var sinP = Math.sin(surf.lat), cosP = Math.cos(surf.lat);
    var cH = (Math.sin(-0.27 * D2R) - sinP * sinD) / Math.max(1e-6, cosP * cosD);
    var rs;
    if (cH > 1) rs = 'Polar night: the Sun does not rise today';
    else if (cH < -1) rs = 'Polar day: the Sun does not set today';
    else {
      var H0 = Math.acos(cH) / D2R / 15;
      rs = 'Sunrise ' + fmtClock(12 - H0) + ' · Sunset ' + fmtClock(12 + H0);
    }
    surfSubEl.textContent = 'Local solar time (Mars hours) · ' + rs;
    surfLocEl.textContent = fmtLonLat(lonDeg, latDeg) + (surf.siteKm === null ? '' : ' · elevation ' + (surf.siteKm < 0 ? '−' : '') + Math.abs(surf.siteKm).toFixed(1) + ' km');
    surfSunEl.textContent = 'Sun ' + (alt >= 0 ? '+' : '−') + Math.abs(alt).toFixed(1) + '° · azimuth ' + az.toFixed(0) + '° · Ls ' + ss.Ls.toFixed(0) + '°';
  }
  var cpNames = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  function surfCompass() {
    var yd = (surf.yaw / D2R) % 360; if (yd < 0) yd += 360;
    cpCard.setAttribute('transform', 'rotate(' + (-yd).toFixed(1) + ' 100 100)');
    cpRead.textContent = cpNames[Math.round(yd / 45) % 8] + ' ' + Math.round(yd) + '°';
  }

  var sLast = { yaw: 0, pitch: 0, fov: 0, tex: -2 }, sIdle = 0, sStill = 0, sLow = false;
  function surfBasePR() { return surf.basePR || (HEAVY ? Math.min(BASE_PR, 0.85) : 0.6); }
  // 0 — ничего не рисовать, 1 — живая трассировка, 2 — показ готовой панорамы
  function updateSurface(dt) {
    applySurfTex();
    if (surf.job) panoStep(surf.building ? (HEAVY ? 4 : 2) : 2);
    if (surf.hold) return 0;
    if (!surf.job) {
      surf.panoAge += dt;
      if (surf.panoReady && (surf.panoAge > 25 || surf.tex !== surf.panoTex)) panoStart();
    }
    surf.uiT -= dt;
    if (surf.uiT <= 0) { surf.uiT = 0.4; if (surf.ss) surfHud(); }

    var changed = renderDirty || surf.panoSwap || surf.yaw !== sLast.yaw || surf.pitch !== sLast.pitch || surf.fov !== sLast.fov;
    if (changed) surfCompass();
    var usePano = surf.panoReady && surf.fov >= PANO_MIN_FOV;
    var pm = usePano ? 1 : 0;
    if (pm !== surf.pmode) {
      surf.pmode = pm; sLow = false; sStill = 0;
      renderer.setPixelRatio(pm ? Math.min(BASE_PR, 1.5) : surfBasePR());
      resize();
      changed = true;
    }
    var th = Math.tan(surf.fov * D2R / 2);
    var size = renderer.domElement;
    var asp = size.width / Math.max(1, size.height);

    if (usePano) {
      if (!changed) return 0;
      renderDirty = false; surf.panoSwap = false;
      sLast.yaw = surf.yaw; sLast.pitch = surf.pitch; sLast.fov = surf.fov;
      showMat.uniforms.uView.value.set(surf.yaw, surf.pitch);
      showMat.uniforms.uScr.value.set(th, asp);
      return 2;
    }

    // живая трассировка (приближение или пока панорама не готова)
    var moving = changed && !renderDirty;
    if (moving) { sStill = 0; } else { sStill += dt; }
    var base = surfBasePR();
    if (moving && !sLow) { sLow = true; renderer.setPixelRatio(Math.max(0.4, base * 0.6)); resize(); }
    else if (!moving && sLow && sStill > 0.25) { sLow = false; renderer.setPixelRatio(base); resize(); }
    sIdle += dt;
    if (!changed && sIdle < 2.0) return 0;
    sIdle = 0;
    renderDirty = false; surf.panoSwap = false;
    sLast.yaw = surf.yaw; sLast.pitch = surf.pitch; sLast.fov = surf.fov;
    surfSun();
    var u = surfMat.uniforms;
    u.uView.value.set(surf.yaw, surf.pitch);
    u.uScr.value.set(th, asp);
    u.uPx.value = 2 * th / Math.max(1, size.height);
    if (surf.perfWarm > 0) { surf.perfWarm--; return 1; }
    if (moving) {
      surf.perfT += dt; surf.perfN++;
      if (surf.perfN >= 30) {
        var avg = surf.perfT / surf.perfN;
        surf.perfT = 0; surf.perfN = 0;
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
      var t0 = Date.now();
      (function poll() { if (fn() || Date.now() - t0 > max) res(); else setTimeout(poll, 60); })();
    });
  }

  function dropExplorer(lonDeg, latDeg) {
    if (transitioning || mode !== 'mars') return;
    transitioning = true;
    setArmed(false);
    showFact();
    veil.classList.add('load', 'on');
    wait(480).then(function () {
      if (!surfScene) buildSurface();
      surf.lon = lonDeg * D2R;
      surf.lat = Math.max(-1.52, Math.min(1.52, latDeg * D2R));
      surf.siteKm = siteHeightKm(lonDeg, latDeg);
      var cl = Math.max(0.05, Math.cos(surf.lat));
      eachSM(function (m) {
        m.uniforms.uObsLL.value.set(surf.lon, surf.lat);
        m.uniforms.uSeed.value.set((surf.lon * 3389.5 * cl) % 200, (surf.lat * 3389.5) % 200);
      });
      surf.tOff = 0; surf.fov = 70; surf.pitch = 0.07;
      surf.tex = -1; surf.panoReady = false; surf.panoCur = -1; surf.job = null; surf.building = true;
      surf.hold = true; surf.pmode = -1; surf.panoAge = 0; surf.panoSwap = false; surf.basePR = 0;
      sLow = false; sStill = 0; sIdle = 0;
      mode = 'surface';
      marsUI.hidden = true;
      layoutPop.hidden = true;
      btnLayout.setAttribute('aria-expanded', 'false');
      surfUIEl.hidden = false;
      renderer.setPixelRatio(Math.min(BASE_PR, 1.5));
      resize();
      renderer.domElement.style.cursor = 'grab';
      return Promise.race([Promise.all([requestLevel(1), loadSurfHeight().then(function (h) { surfHeight = h; })]), wait(8000)]);
    }).then(function () {
      applySurfTex();
      tileWant = null;
      tileUpdate(0, 0, false);   // окно детализации в режиме человечка не используется
      return true;
    }).then(function () {
      surfSun();
      var alt =Math.asin(Math.max(-1, Math.min(1, surf.sU)));
      var az = Math.atan2(surf.sE, surf.sN);
      surf.yaw = alt < 0.45 ? az : az + Math.PI;
      surf.perfT = 0; surf.perfN = 0; surf.perfWarm = 30;
      surfHud();
      renderer.compile(panoScene, surfCam);
      renderer.compile(showScene, surfCam);
      renderer.compile(surfScene, surfCam);
      panoStart();
      return waitFor(function () { return surf.panoReady; }, 25000);
    }).then(function () {
      surf.building = false;
      surf.hold = false;
      renderDirty = true;
      return wait(120);
    }).then(function () {
      veil.classList.remove('on');
      surfBack.focus({ preventScroll: true });
      return wait(480);
    }).then(function () { veil.classList.remove('load'); transitioning = false; });
  }

  function closeSurface() {
    if (transitioning || mode !== 'surface') return;
    transitioning = true;
    veil.classList.add('on');
    var lonDeg = surf.lon / D2R, latDeg = surf.lat / D2R;
    wait(480).then(function () {
      mode = 'mars';
      surfUIEl.hidden = true;
      marsUI.hidden = false;
      surf.job = null; surf.panoReady = false; surf.hold = false;
      for (var pi = 0; pi < 2; pi++) { if (panoRT[pi]) { panoRT[pi].dispose(); panoRT[pi] = null; } }
      clearPressed();
      renderer.setPixelRatio(Math.min(BASE_PR, 1.25));
      resize();
      texCur = -1;
      applyTexLevel();
      updateGeoLod();
      flyTo(lonDeg, latDeg, 2.3);
      renderer.domElement.style.cursor = 'grab';
      return wait(100);
    }).then(function () {
      veil.classList.remove('on');
      marsBack.focus({ preventScroll: true });
      return wait(480);
    }).then(function () { transitioning = false; });
  }


  // ---- Домашний сектор: выбор, отметка и сводка -----------------------------------
  var btnHome = document.getElementById('btn-home');
  var homeEl = document.getElementById('mars-home'), surfHomeEl = document.getElementById('surf-home');
  var home = null, homeArmed = false, homeHCache = null;
  try { var hs = JSON.parse(localStorage.getItem('marsHome2') || 'null'); if (hs && isFinite(hs.lon) && isFinite(hs.lat)) home = { lon: hs.lon, lat: hs.lat }; } catch (e) { /* ignore */ }
  function homeTemp() {
    var lon = (home.lon + 0.5) * D2R, lat = (home.lat + 0.5) * D2R;
    var sl = Math.sin(lat), cl = Math.cos(lat);
    var Nn = [cl * Math.cos(lon), sl, -cl * Math.sin(lon)];
    var lagLon = (sunInfo.lonE + 18) * D2R, lagLat = sunInfo.lat * D2R;
    var Ll = [Math.cos(lagLat) * Math.cos(lagLon), Math.sin(lagLat), -Math.cos(lagLat) * Math.sin(lagLon)];
    var flux = marsMat ? marsMat.uniforms.uFlux.value : 586;
    var cz = Math.max(Nn[0] * Ll[0] + Nn[1] * Ll[1] + Nn[2] * Ll[2], 0);
    var sinD = Ll[1], cosD = Math.sqrt(Math.max(1 - sinD * sinD, 1e-4));
    var cH = Math.max(-1, Math.min(1, -(sl / Math.max(cl, 0.02)) * (sinD / cosD)));
    var H0 = Math.acos(cH);
    var Q = Math.max(flux / Math.PI * (H0 * sl * sinD + cl * cosD * Math.sin(H0)), 0);
    var kk = (1 - 0.24) / (0.98 * 5.67e-8);
    var Tn = 0.8 * Math.pow(Q * kk, 0.25), Te = Math.pow(cz * flux * kk, 0.25);
    var T = Math.pow(Math.pow(Tn, 4) + 0.93 * Math.pow(Te, 4), 0.25);
    return Math.max(148, Math.min(318, T)) - 273.15;
  }
  function homeElev() {
    if (homeHCache && homeHCache.key === home.lon + ',' + home.lat) return homeHCache.v;
    var sum = 0, n = 0;
    for (var j = 0; j < 3; j++) for (var i = 0; i < 3; i++) {
      var h = siteHeightKm(home.lon + (i + 0.5) / 3, home.lat + (j + 0.5) / 3);
      if (h === null) return null;
      sum += h; n++;
    }
    homeHCache = { key: home.lon + ',' + home.lat, v: sum / n };
    return homeHCache.v;
  }
  function homeText() {
    if (!home) return '';
    var e = homeElev(), t = homeTemp();
    function sg(v, d) { return (v < 0 ? '−' : v > 0 ? '+' : '') + Math.abs(v).toFixed(d); }
    var la0 = home.lat, la1 = home.lat + 1;
    return 'Home sector ' + lonText(home.lon) + ' – ' + lonText(home.lon + 1) + ' · ' +
      Math.abs(la0) + '°' + (la0 < 0 ? 'S' : la0 > 0 ? 'N' : '') + ' – ' + Math.abs(la1) + '°' + (la1 < 0 ? 'S' : la1 > 0 ? 'N' : '') +
      ' · elevation ≈ ' + (e === null ? '…' : sg(e, 1) + ' km') + ' · temperature ≈ ' + sg(t, 0) + ' °C';
  }
  function updateHome() {
    var tx = homeText();
    homeEl.hidden = !tx; homeEl.textContent = tx;
    surfHomeEl.hidden = !tx; surfHomeEl.textContent = tx;
    if (marsMat) marsMat.uniforms.uHome.value.set(home ? home.lon : 0, home ? home.lon + 1 : 0, home ? home.lat : 0, home ? home.lat + 1 : 0);
    renderDirty = true;
  }
  function setHomeArmed(on) {
    homeArmed = on;
    btnHome.setAttribute('aria-pressed', String(on));
    if (on && typeof pegArmed !== 'undefined' && pegArmed) setArmed(false);
    if (marsHint) marsHint.textContent = on ? 'Click a spot to mark your home area (~60 km) · click it again to clear' : marsHintText;
    if (marsMat) marsMat.uniforms.uGrid.value = (on || gridOn) ? 1 : 0;
    if (mode === 'mars') renderer.domElement.style.cursor = on ? 'crosshair' : 'grab';
    renderDirty = true;
  }
  btnHome.addEventListener('click', function () { if (mode === 'mars' && !transitioning) setHomeArmed(!homeArmed); });
  var homeDown = { x: 0, y: 0 };
  cv.addEventListener('pointerdown', function (e) { homeDown.x = e.clientX; homeDown.y = e.clientY; });
  cv.addEventListener('click', function (e) {
    if (mode !== 'mars' || !homeArmed || transitioning) return;
    if (Math.hypot(e.clientX - homeDown.x, e.clientY - homeDown.y) > 6) return;
    var hit = pickMars(e.clientX, e.clientY);
    if (!hit) return;
    var l0 = Math.max(-180, Math.min(179, Math.floor(hit.lon))), a0 = Math.max(-90, Math.min(89, Math.floor(hit.lat)));
    if (home && home.lon === l0 && home.lat === a0) home = null; else home = { lon: l0, lat: a0 };
    try { if (home) localStorage.setItem('marsHome2', JSON.stringify(home)); else localStorage.removeItem('marsHome2'); } catch (err) { /* ignore */ }
    setHomeArmed(false);
    updateHome();
  });

  // ---- «Человечек»: перетащить на планету или нажать и выбрать точку ---------
  var pegDrag = null, pegArmed = false;
  function setArmed(on) {
    pegArmed = on;
    if (on && homeArmed) setHomeArmed(false);
    pegBtn.setAttribute('aria-pressed', String(on));
    if (marsHint) marsHint.textContent = on ? 'Click a spot to drop a pin, then press “Land here” · click elsewhere to move the pin' : marsHintText;
    if (!on) clearPin();
    if (mode === 'mars') renderer.domElement.style.cursor = on ? 'crosshair' : 'grab';
  }
  function pegEnd() {
    pegDrag = null;
    pegGhost.hidden = true;
    pegGhost.classList.remove('over');
  }
  pegBtn.addEventListener('pointerdown', function (e) {
    if (mode !== 'mars' || transitioning) return;
    e.preventDefault();
    pegDrag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false };
    try { pegBtn.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });
  pegBtn.addEventListener('pointermove', function (e) {
    if (!pegDrag || e.pointerId !== pegDrag.id) return;
    if (!pegDrag.moved && Math.hypot(e.clientX - pegDrag.x0, e.clientY - pegDrag.y0) > 8) {
      pegDrag.moved = true;
      pegGhost.hidden = false;
      setArmed(false);
    }
    if (pegDrag.moved) {
      pegGhost.style.transform = 'translate(' + (e.clientX - 14) + 'px,' + (e.clientY - 38) + 'px)';
      pegGhost.classList.toggle('over', !!pickMars(e.clientX, e.clientY));
    }
  });
  pegBtn.addEventListener('pointerup', function (e) {
    if (!pegDrag || e.pointerId !== pegDrag.id) return;
    var d = pegDrag;
    pegEnd();
    if (d.moved) {
      var hit = pickMars(e.clientX, e.clientY);
      if (hit) { setArmed(true); placePin(hit.lon, hit.lat); }
    } else {
      setArmed(!pegArmed);
    }
  });
  pegBtn.addEventListener('pointercancel', pegEnd);
  pegBtn.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setArmed(!pegArmed); }
  });
  cv.addEventListener('click', function (e) {
    if (mode !== 'mars' || !pegArmed || transitioning) return;
    if (Math.hypot(e.clientX - homeDown.x, e.clientY - homeDown.y) > 6) return;   // это было вращение шара, а не клик
    var hit = pickMars(e.clientX, e.clientY);
    if (hit) placePin(hit.lon, hit.lat);
  });

  // ---- Выбор точки посадки: красная метка + кнопка «Land here» + окно предпросмотра ----
  var landPin = null, lpToken = 0, lpRT = null;
  var lpEl = document.getElementById('land-pin'), lpCard = lpEl.querySelector('.lp-card');
  var lpView = document.getElementById('lp-view'), lpTitle = document.getElementById('lp-title'), lpSub = document.getElementById('lp-sub');
  var lpGo = document.getElementById('lp-go'), lpCancel = document.getElementById('lp-cancel');
  var lpCtx = lpView.getContext('2d');
  var lpV = new THREE.Vector3(), lpC = new THREE.Vector3();
  function clearPin() { landPin = null; lpToken++; lpEl.hidden = true; }
  function placePin(lonDeg, latDeg) {
    landPin = { lon: lonDeg, lat: latDeg };
    lpEl.hidden = false;
    lpTitle.textContent = fmtLonLat(lonDeg, latDeg);
    var h = siteHeightKm(lonDeg, latDeg);
    lpSub.textContent = h === null ? '' : 'elevation ' + (h < 0 ? '−' : '') + Math.abs(h).toFixed(1) + ' km';
    lpView.classList.add('wait');
    updateLandPin();
    var tk = ++lpToken;
    Promise.race([Promise.all([requestLevel(1), loadSurfHeight()]), wait(8000)]).then(function (r) {
      if (r && r[1]) surfHeight = r[1];
      if (tk !== lpToken || !landPin || mode !== 'mars') return;
      return wait(30);
    }).then(function () {
      if (tk !== lpToken || !landPin || mode !== 'mars') return;
      try { drawPreview(landPin.lon, landPin.lat); lpView.classList.remove('wait'); } catch (err) { /* предпросмотр необязателен */ }
    });
  }
  // маленький кадр «что увидим при посадке»: тот же шейдер поверхности, один раз, в маленькую текстуру
  function drawPreview(lonDeg, latDeg) {
    if (!surfScene) buildSurface();
    var use = -1;
    for (var i = MAX_LEVEL; i >= 0; i--) { if (texLv[i].state === 2) { use = i; break; } }
    if (use < 0) return;
    var H = surfHeight || { tex: texLv[use].height, w: H_W, h: H_H };
    var lon = lonDeg * D2R, lat = Math.max(-1.52, Math.min(1.52, latDeg * D2R)), cl = Math.max(0.05, Math.cos(lat));
    var S = sunFor(lon, lat, 0);
    var alt = Math.asin(Math.max(-1, Math.min(1, S.sU))), az = Math.atan2(S.sE, S.sN);
    var W = lpView.width, Ht = lpView.height, th = Math.tan(35 * D2R);
    var u = surfMat.uniforms;
    u.uColor.value = texLv[use].color; u.uHeight.value = H.tex; u.uRes.value.set(H.w, H.h);
    u.uObsLL.value.set(lon, lat);
    u.uSeed.value.set((lon * 3389.5 * cl) % 200, (lat * 3389.5) % 200);
    var bx = (lon / (2 * Math.PI) + 0.5) * H.w, by = (lat / Math.PI + 0.5) * H.h;
    u.uP0.value.set(Math.floor(bx), Math.floor(by), bx - Math.floor(bx), by - Math.floor(by));
    u.uSun.value.set(S.sE, S.sN, S.sU);
    u.uStar.value.set(S.c0[0], S.c1[0], S.c2[0], S.c0[1], S.c1[1], S.c2[1], S.c0[2], S.c1[2], S.c2[2]);
    u.uView.value.set(alt < 0.45 ? az : az + Math.PI, 0.07);
    u.uScr.value.set(th, W / Ht);
    u.uPx.value = 2 * th / Ht;
    if (!lpRT) lpRT = new THREE.WebGLRenderTarget(W, Ht, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, type: THREE.UnsignedByteType, depthBuffer: false, stencilBuffer: false });
    renderer.setRenderTarget(lpRT);
    renderer.render(surfScene, surfCam);
    renderer.setRenderTarget(null);
    var buf = new Uint8Array(W * Ht * 4);
    renderer.readRenderTargetPixels(lpRT, 0, 0, W, Ht, buf);
    var img = lpCtx.createImageData(W, Ht);
    for (var y = 0; y < Ht; y++) img.data.set(buf.subarray((Ht - 1 - y) * W * 4, (Ht - y) * W * 4), y * W * 4);
    lpCtx.putImageData(img, 0, 0);
    surf.tex = -1;   // материалы поверхности перенастроены предпросмотром — при посадке привяжем заново
    renderDirty = true;
  }
  // метка «прикреплена» к точке шара: пересчитываем экранное положение каждый кадр
  function updateLandPin() {
    if (!landPin || mode !== 'mars' || !marsCam) return;
    var facing = true;
    if (flatOn) {
      var px = landPin.lon / 90, c0 = fl.lon / 90;   // ближайшая к центру копия карты
      while (px - c0 > 2) px -= 4;
      while (px - c0 < -2) px += 4;
      lpV.set(px, landPin.lat / 90, 0);
    } else {
      var lo = landPin.lon * D2R, la = landPin.lat * D2R;
      lpV.set(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo));
      marsSpin.localToWorld(lpV);
      lpC.copy(marsCam.position).sub(lpV);
      facing = lpV.dot(lpC) > 0;
    }
    lpEl.style.visibility = facing ? 'visible' : 'hidden';
    if (!facing) return;
    lpV.project(marsCam);
    var x = (lpV.x * 0.5 + 0.5) * window.innerWidth, y = (-lpV.y * 0.5 + 0.5) * window.innerHeight;
    lpEl.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
    var cw = lpCard.offsetWidth || 210, ch = lpCard.offsetHeight || 190;
    var left = (x + 24 + cw > window.innerWidth - 8) ? -(cw + 24) : 24;
    var top = Math.max(8 - y, Math.min(window.innerHeight - 8 - ch - y, -ch * 0.5 - 18));
    lpCard.style.left = left + 'px';
    lpCard.style.top = top + 'px';
  }
  lpGo.addEventListener('click', function () {
    if (!landPin || transitioning || mode !== 'mars') return;
    dropExplorer(landPin.lon, landPin.lat);
  });
  lpCancel.addEventListener('click', clearPin);

  // ---- Управление в режиме поверхности --------------------------------------
  var sptr = {}, sPinch = 0;
  function sCount() { return Object.keys(sptr).length; }
  function sPinchDist() {
    var k = Object.keys(sptr);
    if (k.length < 2) return 0;
    return Math.hypot(sptr[k[0]].x - sptr[k[1]].x, sptr[k[0]].y - sptr[k[1]].y);
  }
  cv.addEventListener('pointerdown', function (e) {
    if (mode !== 'surface') return;
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    sptr[e.pointerId] = { x: e.clientX, y: e.clientY };
    if (sCount() === 2) sPinch = sPinchDist();
    cv.style.cursor = 'grabbing';
  });
  cv.addEventListener('pointermove', function (e) {
    if (mode !== 'surface') return;
    var p = sptr[e.pointerId];
    if (!p) return;
    var dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (sCount() === 1) {
      var k = surf.fov * D2R / window.innerHeight;
      surf.yaw -= dx * k;
      surf.pitch = Math.max(-0.9, Math.min(1.5, surf.pitch + dy * k));
    } else if (sCount() === 2) {
      var d = sPinchDist();
      if (sPinch > 0 && d > 0) surf.fov = clampFov(surf.fov * sPinch / d);
      sPinch = d;
    }
  });
  function sEnd(e) {
    if (!sptr[e.pointerId]) return;
    delete sptr[e.pointerId];
    sPinch = 0;
    if (sCount() === 0 && mode === 'surface') cv.style.cursor = 'grab';
  }
  cv.addEventListener('pointerup', sEnd);
  cv.addEventListener('pointercancel', sEnd);
  cv.addEventListener('wheel', function (e) {
    if (mode !== 'surface') return;
    e.preventDefault();
    var dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    surf.fov = clampFov(surf.fov * Math.exp(dy * 0.001));
  }, { passive: false });

  function holdFov(btn, factor) {
    var timer = 0;
    function stop() { if (timer) { clearInterval(timer); timer = 0; } }
    btn.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      surf.fov = clampFov(surf.fov * factor);
      stop();
      timer = setInterval(function () { surf.fov = clampFov(surf.fov * (factor < 1 ? 0.97 : 1.03)); }, 60);
    });
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointerleave', stop);
    btn.addEventListener('pointercancel', stop);
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); surf.fov = clampFov(surf.fov * factor); }
    });
  }
  holdFov(surfZin, 0.85);
  holdFov(surfZout, 1.18);

  surfBack.addEventListener('click', closeSurface);
  window.addEventListener('keydown', function (e) {
    if (mode === 'mars' && e.key === 'Escape' && pegArmed) { setArmed(false); return; }
    if (mode !== 'surface') return;
    var step = surf.fov * D2R * 0.08;
    if (e.key === 'Escape') closeSurface();
    else if (e.key === 'ArrowLeft') surf.yaw -= step;
    else if (e.key === 'ArrowRight') surf.yaw += step;
    else if (e.key === 'ArrowUp') surf.pitch = Math.min(1.5, surf.pitch + step);
    else if (e.key === 'ArrowDown') surf.pitch = Math.max(-0.9, surf.pitch - step);
    else if (e.key === '+' || e.key === '=') surf.fov = clampFov(surf.fov * 0.9);
    else if (e.key === '-' || e.key === '_') surf.fov = clampFov(surf.fov * 1.1);
  });


  // ---- Плоский вид: развёртка Марса (equirectangular) вместо шара ----------------
  // Те же текстуры, те же LOD (уровни и окно детализации), те же режимы Layout, сетка, домашний сектор и «человечек».
  // Масштаб карты привязан к mv.dist (как у шара), поэтому уровни детализации выбираются той же логикой:
  //   mv.dist = FLAT_D0 + FLAT_K · s,  где s — половина высоты видимой части карты в единицах «вся карта по высоте = 2».
  var flatOn = false, flatScene = null, flatMat = null, flatFly = null;
  var fl = { lon: 0, lat: 0 };                   // центр карты, градусы
  var btnView = document.getElementById('btn-view');
  var flatPan = {};


  function flatFit() { return Math.max(1, 2 / (window.innerWidth / window.innerHeight)); }   // s, при котором видна вся карта
  function flatS() { return Math.max(FLAT_S_MIN, Math.min(flatFit(), (mv.dist - FLAT_D0) / FLAT_K)); }
  function flatClampLat() {
    var maxLat = Math.max(0, 90 * (1 - flatS()));
    fl.lat = Math.max(-maxLat, Math.min(maxLat, fl.lat));
  }

  function buildFlat() {
    flatScene = new THREE.Scene();
    flatMat = new THREE.ShaderMaterial({
      uniforms: marsMat.uniforms,                  // общие uniform'ы: текстуры, окно детализации, режим слоя, Солнце, сетка
      vertexShader: MARS_FLAT_VERT,
      fragmentShader: MARS_FRAG,
      defines: { SHADOW_STEPS: 0, CRATER_LAYERS: 2, FLAT: 1 },
      extensions: { derivatives: true }
    });
    var geo = new THREE.PlaneGeometry(4, 2, 1, 1);   // 4 × 2 единицы: x = lon/90, y = lat/90
    for (var i = -1; i <= 1; i++) {                  // три копии, чтобы карта замыкалась по долготе
      var m = new THREE.Mesh(geo, flatMat);
      m.position.x = i * 4;
      m.frustumCulled = false;
      flatScene.add(m);
    }
  }

  function setFlat(on) {
    if (on === flatOn || transitioning || mode !== 'mars') return;
    if (on) {
      if (!flatScene) buildFlat();
      marsSpin.getWorldQuaternion(tmpQ);
      tmpV.set(0, 0, 1).applyQuaternion(tmpQ.clone().invert());
      fl.lon = Math.atan2(-tmpV.z, tmpV.x) / D2R;
      fl.lat = Math.asin(Math.max(-1, Math.min(1, tmpV.y))) / D2R;
      flatOn = true;
      mv.auto = false; mv.fly = false; mv.userZoomed = true; flatFly = null;
      labelsEl.style.visibility = 'hidden';        // подписи сетки привязаны к шару
      marsHintText = 'Drag to pan · scroll or pinch to zoom · Explorer and Home work on the map too';
      renderer.compile(flatScene, marsCam);
    } else {
      flatOn = false;
      flatFly = null;
      labelsEl.style.visibility = '';
      marsHintText = marsHintInitial;
    }
    if (marsHint && !pegArmed && !homeArmed) marsHint.textContent = marsHintText;
    btnView.setAttribute('aria-checked', String(flatOn));
    renderDirty = true;
  }
  var marsHintInitial = marsHintText;
  btnView.addEventListener('click', function () { setFlat(!flatOn); });

  // перед updateMars: центр и масштаб карты → mv (по ним updateMars выбирает уровни и окно детализации)
  function prepFlat(dt) {
    mv.auto = false; mv.vSpin = 0; mv.vPitch = 0;
    var lo = FLAT_D0 + FLAT_K * FLAT_S_MIN, hi = FLAT_D0 + FLAT_K * flatFit();
    mv.tDist = Math.max(lo, Math.min(hi, mv.tDist));
    mv.dist = Math.max(lo, Math.min(hi, mv.dist));
    if (mv.fly) {                                  // flyTo() из чипов, «Whole planet» и возврата с поверхности
      flatFly = { lon: wrap180(-mv.tSpin / D2R - 90), lat: mv.tPitch / D2R };
      mv.fly = false;
    }
    if (flatFly) {
      var k = 1 - Math.exp(-dt * 4), dl = wrap180(flatFly.lon - fl.lon), da = flatFly.lat - fl.lat;
      fl.lon = wrap180(fl.lon + dl * k);
      fl.lat += da * k;
      if (Math.abs(dl) < 0.05 && Math.abs(da) < 0.05) flatFly = null;
      renderDirty = true;
    }
    flatClampLat();
    var f = faceAngles(fl.lon, fl.lat);
    mv.spin = f.spin; mv.pitch = f.pitch;
  }
  // после updateMars: камера смотрит прямо на плоскость
  function updateFlat() {
    var s = flatS(), zc = s / Math.tan(15 * D2R);   // fov камеры Марса = 30°
    marsCam.position.set(fl.lon / 90, fl.lat / 90, zc);
    marsCam.quaternion.set(0, 0, 0, 1);
    marsCam.updateMatrixWorld(true);
  }
  // экранная точка → долгота/широта на карте
  function pickFlat(cx, cy) {
    var s = flatS(), visH = 2 * s, asp = window.innerWidth / window.innerHeight;
    var x = fl.lon / 90 + ((cx / window.innerWidth) * 2 - 1) * visH * asp / 2;
    var y = fl.lat / 90 - ((cy / window.innerHeight) * 2 - 1) * visH / 2;
    var lat = y * 90;
    if (Math.abs(lat) > 90) return null;
    return { lon: wrap180(x * 90), lat: lat };
  }

  // перетаскивание карты
  cv.addEventListener('pointerdown', function (e) {
    if (mode !== 'mars' || !flatOn) return;
    flatPan[e.pointerId] = { x: e.clientX, y: e.clientY };
    flatFly = null;
  });
  cv.addEventListener('pointermove', function (e) {
    var p = flatPan[e.pointerId];
    if (!p || mode !== 'mars' || !flatOn) return;
    var dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (Object.keys(flatPan).length !== 1) return;   // щипок — это масштаб
    var u = 2 * flatS() / window.innerHeight * 90;     // градусов на пиксель
    fl.lon = wrap180(fl.lon - dx * u);
    fl.lat += dy * u;
    flatClampLat();
    renderDirty = true;
  });
  function flatPanEnd(e) { delete flatPan[e.pointerId]; }
  cv.addEventListener('pointerup', flatPanEnd);
  cv.addEventListener('pointercancel', flatPanEnd);

  // ---- Анимация ----------------------------------------------------------
  var marsAcc = 0;
  var clock = new THREE.Clock();
  var time = 0;
  function frame() {
    requestAnimationFrame(frame);
    var dt = Math.min(clock.getDelta(), 0.05);
    time += dt;
    starMat.uniforms.uTime.value = time;

    if (mode === 'mars') {
      marsAcc += dt;
      var busy = renderDirty || mv.dragging || mv.fly || Math.abs(mv.dist - mv.tDist) > 0.002 ||
        Math.abs(mv.vSpin) > 0.01 || Math.abs(mv.vPitch) > 0.01 || transitioning;
      if (!busy && marsAcc < 0.034) return;   // в покое — 30 кадров/с
      if (flatOn) prepFlat(marsAcc);
      updateMars(marsAcc);
      if (flatOn) updateFlat();
      marsAcc = 0;
      renderDirty = false;
      renderer.render(flatOn ? flatScene : marsScene, marsCam);
      updateLandPin();
      return;
    }
    if (mode === 'surface') {
      var sr = updateSurface(dt);
      if (sr === 1) renderer.render(surfScene, surfCam);
      else if (sr === 2) renderer.render(showScene, surfCam);
      return;
    }

    sunMat.uniforms.uTime.value = time;
    sun.rotation.y += dt * 0.02;

    for (var i = 0; i < planets.length; i++) {
      var p = planets[i];
      p.angle += p.def.speed * dt;
      p.pivot.rotation.y = p.angle;
      p.mesh.rotation.y += p.def.spin * dt;
      if (p.clouds) p.clouds.rotation.y += p.def.spin * 1.25 * dt;
    }
    updateBelts(time);
    renderer.render(scene, camera);
    placeTag();
  }
  frame();
})();
