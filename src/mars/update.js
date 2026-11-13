// mars/update.js — покадровая логика подробного Марса (updateMars)
import { THREE } from '../core/three.js';
import { D2R } from '../config.js';
import { angDiff } from '../lib/math.js';

/**
 * Обновляет вид, Солнце, луны, LOD и UI-таймер Марса.
 * @param {number} dt
 * @param {object} ctx — общий контекст (mv, mars*, tex, geo, labels, sun*, uiTimer, perf, renderer, resize, updateReadout, updateTiles)
 */
export function updateMars(dt, ctx) {
  const {
    mv,
    marsSpin,
    marsRoot,
    marsCam,
    marsMat,
    marsAtmoMat,
    marsLight,
    marsMoons,
    marsSun,
    sunObj,
    sunInfo,
    sunWorld,
    tmpQ,
    tex,
    geo,
    labels,
    uiTimerRef,
    perf,
    renderer,
    resize,
    updateReadout,
    updateTiles
  } = ctx;

  mv.dist += (mv.tDist - mv.dist) * (1 - Math.exp(-dt * 5));
  if (mv.fly) {
    const kf = 1 - Math.exp(-dt * 4);
    const ds = angDiff(mv.tSpin, mv.spin);
    const dp = mv.tPitch - mv.pitch;
    mv.spin += ds * kf;
    mv.pitch += dp * kf;
    if (Math.abs(ds) < 0.002 && Math.abs(dp) < 0.002) mv.fly = false;
  } else if (!mv.dragging) {
    if (mv.auto) mv.spin += dt * 0.02;
    mv.spin += mv.vSpin * dt;
    mv.pitch = Math.max(-1.45, Math.min(1.45, mv.pitch + mv.vPitch * dt));
    const decay = Math.exp(-dt * 3);
    mv.vSpin *= decay;
    mv.vPitch *= decay;
  }
  marsSpin.rotation.y = mv.spin;
  marsRoot.rotation.x = mv.pitch;
  marsCam.position.set(0, 0, mv.dist);
  marsRoot.updateMatrixWorld(true);

  // реальное Солнце
  marsSun.update();
  marsMat.uniforms.uSunObj.value.copy(sunObj);
  const lagLon = (sunInfo.lonE + 18) * D2R;
  const lagLat = sunInfo.lat * D2R;
  marsMat.uniforms.uSunLagObj.value.set(
    Math.cos(lagLat) * Math.cos(lagLon),
    Math.sin(lagLat),
    -Math.cos(lagLat) * Math.sin(lagLon)
  );
  const rAU = 1.5237 * (1 - 0.0934 * 0.0934) / (1 + 0.0934 * Math.cos((sunInfo.Ls - 251) * D2R));
  marsMat.uniforms.uFlux.value = 1361 / (rAU * rAU);
  marsSpin.getWorldQuaternion(tmpQ);
  sunWorld.copy(sunObj).applyQuaternion(tmpQ);
  marsAtmoMat.uniforms.uSun.value.copy(sunWorld);
  marsLight.position.copy(sunWorld).multiplyScalar(10);

  for (let i = 0; i < marsMoons.length; i++) {
    const m = marsMoons[i];
    m.angle += m.def.speed * dt;
    m.pivot.rotation.y = m.angle;
    m.mesh.rotation.y += dt * 0.2;
  }

  // уровни детализации

  if (mv.dist > 4.0) tex.requestLevel(0).then(tex.applyTexLevel);
  if (mv.dist < 5.5) tex.requestLevel(1).then(tex.applyTexLevel);
  if (mv.dist < 4.2) tex.requestLevel(2).then(tex.applyTexLevel);
  tex.applyTexLevel();
  geo.updateGeoLod();

  labels.updateLabels();
  labels.updateMoonLabels();

  uiTimerRef.v -= dt;
  if (uiTimerRef.v <= 0) {
    uiTimerRef.v = 0.5;
    updateReadout();
    updateTiles();
  }

  // адаптивное разрешение
  if (perf.warm > 0) {
    perf.warm--;
    return;
  }
  perf.t += dt;
  perf.n++;
  if (perf.n >= 60) {
    const avg = perf.t / perf.n;
    perf.t = 0;
    perf.n = 0;
    const pr = renderer.getPixelRatio();
    if (avg > 0.034 && pr > 0.85) {
      renderer.setPixelRatio(Math.max(0.75, pr - 0.25));
      resize();
    }
  }
}
