import { THREE } from './core/three.js';
import { FOV, FIT_RADIUS, TILT_DEG } from './config.js';
import { HEAVY } from './app/device.js';
import { createRenderer } from './core/renderer.js';
import { createSolarSystem } from './solar/system.js';
import { createViewportController } from './core/viewport.js';
import { createPlanetTagUpdater } from './solar/planet-tag.js';
import { MARS_FRAG } from './shaders/index.js';

import { createMarsSun } from './mars/sun.js';
import { createLegend } from './mars/legend.js';
import { createLabels } from './mars/labels.js';
import { createGeo } from './mars/geo.js';
import { createTextures } from './mars/textures.js';
import { createTiles } from './mars/tiles.js';
import { createElev } from './mars/elev.js';
import { buildMars } from './mars/scene.js';
import { updateMars } from './mars/update.js';
import { createMarsControls } from './mars/controls.js';
import { createMarsTransitions } from './mars/transitions.js';
import { createHome } from './mars/home.js';
import { createLanding } from './mars/landing.js';
import { createPeg } from './mars/peg.js';
import { createPick } from './mars/pick.js';
import { renderFact } from './mars/facts.js';
import { createMarkers } from './markers/panel.js';
import { createPlacesSection } from './markers/places.js';

import { createSurfaceScene } from './surface/scene.js';
import { createPano } from './surface/pano.js';
import { createSurfHud } from './surface/hud.js';
import { createSurfaceController } from './surface/controller.js';

import { createFlatView } from './flat/view.js';
import { setupInput } from './app/input.js';

(function () {
  'use strict';

  // ---- 1. Renderer + system + viewport ----
  const stage = document.getElementById('stage');
  const tag = document.getElementById('mars-tag');
  const fallback = document.getElementById('fallback');

  const rendererBundle = createRenderer({ THREE, stage, tag, fallback, fov: FOV });
  if (!rendererBundle) return;
  const { renderer, scene, camera } = rendererBundle;

  const solarSystem = createSolarSystem({ THREE, scene, renderer });
  const { sun, sunMat, fill, planets, mars, starGeo, starMat, updateBelts } = solarSystem;

  // ---- 2. Общее состояние (единственное место с мутабельным mode) ----
  const state = {
    mode: 'system',
    transitioning: false,
    renderDirty: true,
    uiTimer: { v: 0 }
  };
  const markDirty = () => { state.renderDirty = true; };

  const viewport = createViewportController({
    THREE, renderer, camera, fillLight: fill, starMaterial: starMat,
    fov: FOV, fitRadius: FIT_RADIUS, tiltDeg: TILT_DEG, onDirty: markDirty
  });
  const resize = viewport.resize;

  const placeTag = createPlanetTagUpdater({ THREE, mars, renderer, camera, tag });

  // ---- 3. DOM-рефы Марса ----
  // случайный факт «Did you know?» на экране загрузки (функция ниже использует ui.factEl)
  const showFact = () => { if (ui.factEl) renderFact(ui.factEl); };
  const ui = {
    marsUI: document.getElementById('mars-ui'),
    marsBack: document.getElementById('mars-back'),
    marsNav: document.getElementById('mars-nav'),
    // левая панель Markers и надпись Loading
    sideToggle: document.getElementById('side-toggle'),
    sidePanel: document.getElementById('side-panel'),
    poiList: document.getElementById('poi-list'),
    ovLoadingEl: document.getElementById('ov-loading'),
    btnLayout: document.getElementById('btn-layout'),
    layoutPop: document.getElementById('layout-pop'),
    btnGrid: document.getElementById('btn-grid'),
    sectorEl: document.getElementById('mars-sector'),
    btnZoomIn: document.getElementById('zoom-in'),
    btnZoomOut: document.getElementById('zoom-out'),
    legendEl: document.getElementById('legend'),
    legendBar: document.getElementById('legend-bar'),
    legendTicks: document.getElementById('legend-ticks'),
    sunEl: document.getElementById('mars-sun'),
    lodEl: document.getElementById('mars-lod'),
    labelsEl: document.getElementById('mars-labels'),
    veil: document.getElementById('veil'),
    kickerEl: document.querySelector('#veil .ld-kicker'),
    factEl: document.getElementById('ld-fact'),
    // surface
    surfUIEl: document.getElementById('surf-ui'),
    surfBack: document.getElementById('surf-back'),
    surfLocEl: document.getElementById('surf-loc'),
    surfSunEl: document.getElementById('surf-sun'),
    surfPhaseEl: document.getElementById('surf-phase'),
    surfTimeEl: document.getElementById('surf-time'),
    surfSubEl: document.getElementById('surf-sub'),
    surfZin: document.getElementById('surf-zin'),
    surfZout: document.getElementById('surf-zout'),
    cpCard: document.getElementById('cp-card'),
    cpRead: document.getElementById('cp-read'),
    btnPeg: document.getElementById('btn-peg'),
    pegGhost: document.getElementById('peg-ghost'),
    marsHint: null, // заполним ниже
    // home
    btnHome: document.getElementById('btn-home'),
    homeEl: document.getElementById('mars-home'),
    surfHomeEl: document.getElementById('surf-home'),
    // flat
    btnView: document.getElementById('btn-view')
  };
  ui.marsHint = ui.marsUI.querySelector('.mu-hint');

  // marsHintText — общее значение, модули читают/пишут через get/set
  let marsHintText = ui.marsHint ? ui.marsHint.textContent : '';
  const marsHintInitial = marsHintText;   // подсказка по умолчанию — к ней возвращаемся с плоской карты
  const getMarsHintText = () => marsHintText;
  const setMarsHintText = (t) => { marsHintText = t; };

  // ---- 4. Базовые подсистемы Марса ----
  const BASE_PR = renderer.getPixelRatio();
  const marsSun = createMarsSun();
  const sunInfo = marsSun.info;
  const sunObj = marsSun.dir;
  const sunWorld = new THREE.Vector3(1, 0, 0);
  const tmpQ = new THREE.Quaternion();
  const tmpV = new THREE.Vector3();

  // Изменяемое состояние вида (mv) — единый объект, передаётся всем модулям
  const mv = {
    spin: 0, pitch: 0, dist: 12, tSpin: 0, tPitch: 0, tDist: 5, fit: 5,
    fly: false, auto: true, dragging: false, vSpin: 0, vPitch: 0, userZoomed: false
  };
  const perf = { t: 0, n: 0, warm: 40 };

  const legend = createLegend({ root: ui.legendEl, bar: ui.legendBar, ticks: ui.legendTicks });

  // ---- 5. Марс: gео/лейблы/текстуры/тайлы/слои ----
  const labels = createLabels({
    labelsEl: ui.labelsEl,
    getMarsCam: () => marsCam,
    getMarsSpin: () => marsSpin,
    isGridOn: () => controls ? controls.getGridOn() : false
  });

  const geo = createGeo({
    getMarsMat: () => marsMat,
    getMarsSpin: () => marsSpin,
    getDist: () => mv.dist,
    onLodChange: () => { if (controls) controls.updateLodText(); markDirty(); }
  });

  const tex = createTextures({
    renderer,
    getMarsMat: () => marsMat,
    getDist: () => mv.dist,
    onLodChange: () => { if (controls) controls.updateLodText(); },
    onSyncElev: () => elev.syncElev()
  });

  const tiles = createTiles({
    renderer,
    HEAVY,
    getMarsMat: () => marsMat,
    getEachSM: () => surfaceScene ? surfaceScene.eachSM : null,
    onLodChange: () => { if (controls) controls.updateLodText(); },
    onSyncElev: () => elev.syncElev(),
    onDirty: markDirty
  });

  const elev = createElev({
    renderer,
    getMarsMat: () => marsMat,
    getViewMode: () => controls ? controls.getViewMode() : 0,
    getTexCur: () => tex.state.texCur,
    getTileCur: () => tiles.state.tileCur,
    getTexLv: () => tex.texLv,
    getLevels: () => tex.LEVELS,
    onDirty: markDirty,
    onBlank: (blank) => { if (ui.ovLoadingEl) ui.ovLoadingEl.hidden = !blank; }
  });

  // ---- 6. Марс: сцена ----
  // marsScene — объект, который buildMars вернёт. Поля marsCam/marsMat/... доступны после сборки.
  let marsScene = null;           // THREE.Scene
  let marsCam = null;
  let marsRoot = null;
  let marsSpin = null;
  let marsMat = null;
  let marsAtmoMat = null;
  let marsLight = null;
  let marsMoons = [];

  function buildMarsIfNeeded() {
    if (marsScene) return;
    const rig = buildMars({
      geo, labels, viewport, starGeo, starMat, sunObj, mv,
      getMode: () => state.mode
    });
    marsScene = rig.marsScene;
    marsCam = rig.marsCam;
    marsRoot = rig.marsRoot;
    marsSpin = rig.marsSpin;
    marsMat = rig.marsMat;
    marsAtmoMat = rig.marsAtmoMat;
    marsLight = rig.marsLight;
    marsMoons = rig.marsMoons;

    geo.makeGeoMesh(0);
  }

  // ---- 7. Марс: pick (нужен home/landing/peg) ----
  let flatView = null;            // создаётся ниже

  const pick = createPick({
    getTex: () => tex,
    getMarsCam: () => marsCam,
    getMarsRoot: () => marsRoot,
    getMarsSpin: () => marsSpin,
    getMode: () => state.mode,
    getFlatOn: () => flatView ? flatView.getFlatOn() : false,
    pickFlat: (cx, cy) => flatView.pickFlat(cx, cy)
  });

  // ---- 8. Марс: controls ----
  const controls = createMarsControls({
    mv,
    getMarsMat: () => marsMat,
    getMarsSpin: () => marsSpin,
    tmpQ, tmpV,
    getSunInfo: () => sunInfo,
    legend,
    legendEl: ui.legendEl,
    elev,
    layoutPop: ui.layoutPop,
    btnGrid: ui.btnGrid,
    sectorEl: ui.sectorEl,
    sunEl: ui.sunEl,
    lodEl: ui.lodEl,
    tex, tiles, geo, labels,
    homeArmedRef: () => (home ? home.getHomeArmed() : false),
    updateHome: () => { if (home) home.updateHome(); },
    onDirty: markDirty
  });

  // ---- 8b. Левая панель Markers (Places of interest) ----
  createMarkers({
    toggle: ui.sideToggle,
    panel: ui.sidePanel,
    sections: [
      createPlacesSection({
        list: ui.poiList,
        getTransitioning: () => state.transitioning,
        clearPressed: () => controls.clearPressed(),
        flyTo: (lon, lat, dist) => controls.flyTo(lon, lat, dist)
      })
    ]
  });

  // ---- 9. Марс: home / peg / landing ----
  let peg = null;                 // нужен до home (getPegArmed)
  let home = null;                // нужен до controls.homeArmedRef — сделан ленивым

  home = createHome({
    getMarsMat: () => marsMat,
    siteHeightKm: (lon, lat) => pick.siteHeightKm(lon, lat),
    getSunInfo: () => sunInfo,
    btnHome: ui.btnHome,
    homeEl: ui.homeEl,
    surfHomeEl: ui.surfHomeEl,
    marsHint: ui.marsHint,
    getMarsHintText,
    setMarsHintText,
    getMode: () => state.mode,
    getTransitioning: () => state.transitioning,
    renderer,
    getGridOn: () => controls.getGridOn(),
    setArmed: (on) => { if (peg) peg.setArmed(on); },
    getPegArmed: () => (peg ? peg.getPegArmed() : false),
    pickMars: (cx, cy) => pick.pickMars(cx, cy),
    onHomeChange: markDirty
  });

  // surfaceController нужен landing и transitions; создаётся ниже
  let surfaceController = null;
  let landing = null;

  peg = createPeg({
    pegBtn: ui.btnPeg,
    pegGhost: ui.pegGhost,
    marsHint: ui.marsHint,
    getMarsHintText,
    getMode: () => state.mode,
    getTransitioning: () => state.transitioning,
    renderer,
    setHomeArmed: (on) => home.setHomeArmed(on),
    getHomeArmed: () => home.getHomeArmed(),
    pickMars: (cx, cy) => pick.pickMars(cx, cy),
    placePin: (lon, lat) => landing.placePin(lon, lat),
    clearPin: () => landing.clearPin()
  });

  // ---- 10. Surface: scene / pano / hud / controller ----
  const surfaceScene = createSurfaceScene({ getMarsMat: () => marsMat });

  let pano = null;                // нужен surfController; surfSun берётся из controller через геттер
  const surfHudApi = createSurfHud({
    getSurf: () => surfaceController.getSurf(),
    homeText: () => home.homeText(),
    surfHomeEl: ui.surfHomeEl,
    surfLocEl: ui.surfLocEl,
    surfSunEl: ui.surfSunEl,
    surfPhaseEl: ui.surfPhaseEl,
    surfTimeEl: ui.surfTimeEl,
    surfSubEl: ui.surfSubEl,
    cpCard: ui.cpCard,
    cpRead: ui.cpRead
  });

  pano = createPano({
    getSurf: () => surfaceController.getSurf(),
    getRenderer: () => renderer,
    getPanoScene: () => surfaceScene.getPanoScene(),
    getSurfCam: () => surfaceScene.getSurfCam(),
    getShowMat: () => surfaceScene.getShowMat(),
    surfSun: () => surfaceController.surfSun()
  });

  surfaceController = createSurfaceController({
    getMode: () => state.mode,
    setMode: (m) => { state.mode = m; },
    getTransitioning: () => state.transitioning,
    setTransitioning: (v) => { state.transitioning = v; },
    veil: ui.veil,
    marsUI: ui.marsUI,
    layoutPop: ui.layoutPop,
    btnLayout: ui.btnLayout,
    surfUIEl: ui.surfUIEl,
    surfBack: ui.surfBack,
    renderer, BASE_PR, resize,
    tex, tiles, geo,
    clearPressed: () => controls.clearPressed(),
    flyTo: (lon, lat, dist) => controls.flyTo(lon, lat, dist),
    showFact: showFact,
    setArmed: (on) => peg.setArmed(on),
    siteHeightKm: (lon, lat) => pick.siteHeightKm(lon, lat),
    surfaceScene,
    pano,
    surfHudApi,
    marsBack: ui.marsBack,
    getRenderDirty: () => state.renderDirty,
    setRenderDirty: (v) => { state.renderDirty = v; }
  });

  // ---- 11. Landing (после surfaceController — нужен dropExplorer) ----
  landing = createLanding({
    getMode: () => state.mode,
    getTransitioning: () => state.transitioning,
    getMarsCam: () => marsCam,
    getMarsSpin: () => marsSpin,
    getFlatOn: () => flatView ? flatView.getFlatOn() : false,
    getFl: () => flatView ? flatView.getFl() : { lon: 0, lat: 0 },
    renderer, tex,
    siteHeightKm: (lon, lat) => pick.siteHeightKm(lon, lat),
    loadSurfHeight: () => surfaceController.loadSurfHeight(),
    buildSurfaceIfNeeded: () => { if (!surfaceScene.isBuilt()) surfaceScene.buildSurface(); },
    getSurfMat: () => surfaceScene.getSurfMat(),
    getSurfCam: () => surfaceScene.getSurfCam(),
    getSurfScene: () => surfaceScene.getSurfScene(),
    setSurfTexDirty: () => surfaceController.setSurfTexDirty(),
    dropExplorer: (lon, lat) => surfaceController.dropExplorer(lon, lat),
    onDirty: markDirty
  });

  // ---- 12. Марс: transitions ----
  const transitions = createMarsTransitions({
    getMode: () => state.mode,
    setMode: (m) => { state.mode = m; },
    getTransitioning: () => state.transitioning,
    setTransitioning: (v) => { state.transitioning = v; },
    veil: ui.veil,
    kickerEl: ui.kickerEl,
    showFact,
    tag,
    marsUI: ui.marsUI,
    layoutPop: ui.layoutPop,
    btnLayout: ui.btnLayout,
    renderer, BASE_PR, resize,
    buildMarsIfNeeded,
    tex, geo,
    clearPressed: () => controls.clearPressed(),
    setViewMode: (m) => controls.setViewMode(m),
    setGrid: (on) => controls.setGrid(on),
    getViewMode: () => controls.getViewMode(),
    getGridOn: () => controls.getGridOn(),
    updateSun: () => marsSun.update(),
    resetMarsView: (init) => controls.resetMarsView(init),
    updateReadout: () => controls.updateReadout(),
    marsBack: ui.marsBack,
    setArmed: (on) => peg.setArmed(on),
    setHomeArmed: (on) => home.setHomeArmed(on),
    pegArmed: () => peg.getPegArmed(),
    homeArmed: () => home.getHomeArmed(),

    getMarsScene: () => marsScene,
    getMarsCam: () => marsCam,
    getMarsRoot: () => marsRoot,
    getMarsSpin: () => marsSpin,
    getMarsMat: () => marsMat,
    getMarsAtmoMat: () => marsAtmoMat,
    getMarsLight: () => marsLight,
    getMarsMoons: () => marsMoons
  });

  // ---- 13. Марс: update ctx (передаётся каждый кадр в updateMars) ----
  const updateCtx = {
    mv,
    get marsSpin() { return marsSpin; },
    get marsRoot() { return marsRoot; },
    get marsCam() { return marsCam; },
    get marsMat() { return marsMat; },
    get marsAtmoMat() { return marsAtmoMat; },
    get marsLight() { return marsLight; },
    get marsMoons() { return marsMoons; },
    marsSun, sunObj, sunInfo, sunWorld, tmpQ,
    tex, geo, labels,
    uiTimerRef: state.uiTimer,
    perf, renderer, resize,
    updateReadout: () => controls.updateReadout(),
    updateTiles: () => controls.updateTiles()
  };

  // ---- 14. Flat view ----
  flatView = createFlatView({
    getMarsMat: () => marsMat,
    getMarsSpin: () => marsSpin,
    tmpQ, tmpV, mv,
    getMode: () => state.mode,
    getTransitioning: () => state.transitioning,
    labelsEl: ui.labelsEl,
    marsHint: ui.marsHint,
    getMarsHintText,
    setMarsHintText,
    marsHintInitial,
    getPegArmed: () => peg.getPegArmed(),
    getHomeArmed: () => home.getHomeArmed(),
    btnView: ui.btnView,
    renderer,
    getMarsCam: () => marsCam,
    onDirty: markDirty,
    MARS_FRAG
  });

  // ---- 15. Input ----
  setupInput({
    renderer,
    getMode: () => state.mode,
    getTransitioning: () => state.transitioning,
    camera, sun, mars, mv,
    openMars: () => transitions.openMars(),
    closeMars: () => transitions.closeMars(),
    closeSurface: () => surfaceController.closeSurface(),
    setArmed: (on) => peg.setArmed(on),
    getPegArmed: () => peg.getPegArmed(),
    setGrid: (on) => controls.setGrid(on),
    getGridOn: () => controls.getGridOn(),
    zoomBy: (f) => controls.zoomBy(f),
    flyTo: (lon, lat, dist) => controls.flyTo(lon, lat, dist),
    startView: () => controls.startView(),
    clearPressed: () => controls.clearPressed(),
    setViewMode: (m) => controls.setViewMode(m),
    layoutPop: ui.layoutPop,
    btnLayout: ui.btnLayout,
    marsNav: ui.marsNav,
    btnZoomIn: ui.btnZoomIn,
    btnZoomOut: ui.btnZoomOut,
    holdZoom: (btn, f) => controls.holdZoom(btn, f),
    btnGrid: ui.btnGrid,
    getSurf: () => surfaceController.getSurf(),
    getFlatOn: () => flatView.getFlatOn(),
    flatView
  });

  // ---- 16. RAF ----
  const clock = new THREE.Clock();
  let time = 0;

  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    time += dt;
    starMat.uniforms.uTime.value = time;

    if (state.mode === 'mars') {
      const flatOn = flatView.getFlatOn();
      if (flatOn) flatView.prepFlat(dt);
      updateMars(dt, updateCtx);
      if (flatOn) flatView.updateFlat();
      state.renderDirty = false;
      renderer.render(flatOn ? flatView.getFlatScene() : marsScene, marsCam);
      landing.updateLandPin();
      return;
    }

    if (state.mode === 'surface') {
      const sr = surfaceController.updateSurface(dt);
      if (sr === 1) renderer.render(surfaceScene.getSurfScene(), surfaceScene.getSurfCam());
      else if (sr === 2) renderer.render(surfaceScene.getShowScene(), surfaceScene.getSurfCam());
      return;
    }

    // system
    sunMat.uniforms.uTime.value = time;
    sun.rotation.y += dt * 0.02;
    for (let i = 0; i < planets.length; i++) {
      const p = planets[i];
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