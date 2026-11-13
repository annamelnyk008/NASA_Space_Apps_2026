// mars/transitions.js — openMars / closeMars
import { wait } from '../lib/async.js';

/**
 * @param {object} ctx — общий runtime-контекст
 */
export function createMarsTransitions(ctx) {
  const {
    getMode,
    setMode,
    getTransitioning,
    setTransitioning,
    veil,
    kickerEl,
    showFact,
    tag,
    marsUI,
    layoutPop,
    btnLayout,
    renderer,
    BASE_PR,
    resize,
    buildMarsIfNeeded,
    tex,
    geo,
    clearPressed,
    setViewMode,
    setGrid,
    getViewMode,
    getGridOn,
    updateSun,
    resetMarsView,
    updateReadout,
    marsBack,
    setArmed,
    setHomeArmed,
    pegArmed,
    homeArmed
  } = ctx;

  function openMars() {
    if (getTransitioning() || getMode() === 'mars') return;
    setTransitioning(true);
    // экран загрузки с подписью «Loading Mars», пока собирается сцена и грузится карта
    const kickerPrev = kickerEl ? kickerEl.textContent : '';
    if (kickerEl) kickerEl.textContent = 'Loading Mars';
    if (showFact) showFact();
    veil.classList.add('load', 'on');
    wait(480).then(function () {
      buildMarsIfNeeded();
      return Promise.race([tex.requestLevel(0), wait(8000).then(function () { return false; })]);
    }).then(function () {
      setMode('mars');
      tag.hidden = true;
      marsUI.hidden = false;
      clearPressed();
      setViewMode(getViewMode());
      setGrid(getGridOn());
      renderer.setPixelRatio(Math.min(BASE_PR, 1.25));
      resize();
      updateSun();
      resetMarsView(true);
      tex.state.texCur = -1;
      tex.applyTexLevel();
      geo.updateGeoLod();
      updateReadout();
      renderer.compile(ctx.getMarsScene(), ctx.getMarsCam());
      renderer.domElement.style.cursor = 'grab';
      tex.requestLevel(1).then(tex.applyTexLevel);
      setTimeout(function () { geo.makeGeoMesh(1); geo.updateGeoLod(); }, 500);
      return wait(80);
    }).then(function () {
      veil.classList.remove('on');
      marsBack.focus({ preventScroll: true });
      return wait(480);
    }).then(function () {
      veil.classList.remove('load');
      if (kickerEl) kickerEl.textContent = kickerPrev;
      setTransitioning(false);
    });
  }

  function closeMars() {
    if (getTransitioning() || getMode() !== 'mars') return;
    if (pegArmed()) setArmed(false);
    if (homeArmed()) setHomeArmed(false);
    setTransitioning(true);
    veil.classList.add('on');
    wait(480).then(function () {
      setMode('system');
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
    }).then(function () { setTransitioning(false); });
  }

  return { openMars, closeMars };
}
