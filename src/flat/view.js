// flat/view.js — equirectangular map view
import { THREE } from '../core/three.js';
import { D2R, FLAT_D0, FLAT_K, FLAT_S_MIN } from '../config.js';
import { MARS_FLAT_VERT } from '../shaders/index.js';
// Note: MARS_FRAG must be available; in original it was used as MARS_FRAG from shaders
import { wrap180 } from '../lib/math.js';
import { faceAngles } from '../lib/view.js';

/**
 * Assumes MARS_FRAG is imported by the caller or available via shaders/index.
 * For this module we expect deps.marsFragShader string.
 */
export function createFlatView(deps) {
  const {
    getMarsMat,
    getMarsSpin,
    tmpQ,
    tmpV,
    mv,
    getMode,
    getTransitioning,
    labelsEl,
    marsHint,
    getMarsHintText,
    setMarsHintText,
    btnView,
    renderer,
    getMarsCam,
    onDirty,
    MARS_FRAG
  } = deps;

  let flatOn = false;
  let flatScene = null;
  let flatMat = null;
  let flatFly = null;
  const fl = { lon: 0, lat: 0 };
  const flatPan = {};

  function flatFit() {
    return Math.max(1, 2 / (window.innerWidth / window.innerHeight));
  }
  function flatS() {
    return Math.max(FLAT_S_MIN, Math.min(flatFit(), (mv.dist - FLAT_D0) / FLAT_K));
  }
  function flatClampLat() {
    const maxLat = Math.max(0, 90 * (1 - flatS()));
    fl.lat = Math.max(-maxLat, Math.min(maxLat, fl.lat));
  }

  function buildFlat() {
    flatScene = new THREE.Scene();
    flatMat = new THREE.ShaderMaterial({
      uniforms: getMarsMat().uniforms,
      vertexShader: MARS_FLAT_VERT,
      fragmentShader: MARS_FRAG,
      defines: { SHADOW_STEPS: 0, CRATER_LAYERS: 2, FLAT: 1 },
      extensions: { derivatives: true }
    });
    const geo = new THREE.PlaneGeometry(4, 2, 1, 1);
    for (let i = -1; i <= 1; i++) {
      const m = new THREE.Mesh(geo, flatMat);
      m.position.x = i * 4;
      m.frustumCulled = false;
      flatScene.add(m);
    }
  }

  function setFlat(on) {
    if (on === flatOn || getTransitioning() || getMode() !== 'mars') return;
    if (on) {
      if (!flatScene) buildFlat();
      getMarsSpin().getWorldQuaternion(tmpQ);
      tmpV.set(0, 0, 1).applyQuaternion(tmpQ.clone().invert());
      fl.lon = Math.atan2(-tmpV.z, tmpV.x) / D2R;
      fl.lat = Math.asin(Math.max(-1, Math.min(1, tmpV.y))) / D2R;
      flatOn = true;
      mv.auto = false;
      mv.fly = false;
      mv.userZoomed = true;
      flatFly = null;
      labelsEl.style.visibility = 'hidden';
      setMarsHintText('Drag to pan · scroll or pinch to zoom · Explorer and Mark work on the map too');
      renderer.compile(flatScene, getMarsCam());
    } else {
      flatOn = false;
      flatFly = null;
      labelsEl.style.visibility = '';
      setMarsHintText(deps.marsHintInitial);
    }
    if (marsHint && !deps.getPegArmed() && !deps.getHomeArmed()) {
      marsHint.textContent = getMarsHintText();
    }
    btnView.setAttribute('aria-checked', String(flatOn));
    if (onDirty) onDirty();
  }

  function prepFlat(dt) {
    mv.auto = false;
    mv.vSpin = 0;
    mv.vPitch = 0;
    const lo = FLAT_D0 + FLAT_K * FLAT_S_MIN;
    const hi = FLAT_D0 + FLAT_K * flatFit();
    mv.tDist = Math.max(lo, Math.min(hi, mv.tDist));
    mv.dist = Math.max(lo, Math.min(hi, mv.dist));
    if (mv.fly) {
      flatFly = { lon: wrap180(-mv.tSpin / D2R - 90), lat: mv.tPitch / D2R };
      mv.fly = false;
    }
    if (flatFly) {
      const k = 1 - Math.exp(-dt * 4);
      const dl = wrap180(flatFly.lon - fl.lon);
      const da = flatFly.lat - fl.lat;
      fl.lon = wrap180(fl.lon + dl * k);
      fl.lat += da * k;
      if (Math.abs(dl) < 0.05 && Math.abs(da) < 0.05) flatFly = null;
      if (onDirty) onDirty();
    }
    flatClampLat();
    const f = faceAngles(fl.lon, fl.lat);
    mv.spin = f.spin;
    mv.pitch = f.pitch;
  }

  function updateFlat() {
    const s = flatS();
    const zc = s / Math.tan(15 * D2R);
    const marsCam = getMarsCam();
    marsCam.position.set(fl.lon / 90, fl.lat / 90, zc);
    marsCam.quaternion.set(0, 0, 0, 1);
    marsCam.updateMatrixWorld(true);
  }

  function pickFlat(cx, cy) {
    const s = flatS();
    const visH = 2 * s;
    const asp = window.innerWidth / window.innerHeight;
    const x = fl.lon / 90 + ((cx / window.innerWidth) * 2 - 1) * (visH * asp) / 2;
    const y = fl.lat / 90 - ((cy / window.innerHeight) * 2 - 1) * visH / 2;
    const lat = y * 90;
    if (Math.abs(lat) > 90) return null;
    return { lon: wrap180(x * 90), lat };
  }

  // pan listeners are registered by input module; we expose helpers
  function onFlatPointerDown(e) {
    if (getMode() !== 'mars' || !flatOn) return;
    flatPan[e.pointerId] = { x: e.clientX, y: e.clientY };
    flatFly = null;
  }
  function onFlatPointerMove(e) {
    const p = flatPan[e.pointerId];
    if (!p || getMode() !== 'mars' || !flatOn) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (Object.keys(flatPan).length !== 1) return;
    const u = (2 * flatS() / window.innerHeight) * 90;
    fl.lon = wrap180(fl.lon - dx * u);
    fl.lat += dy * u;
    flatClampLat();
    if (onDirty) onDirty();
  }
  function onFlatPointerEnd(e) {
    delete flatPan[e.pointerId];
  }

  btnView.addEventListener('click', function () {
    setFlat(!flatOn);
  });

  return {
    buildFlat,
    setFlat,
    prepFlat,
    updateFlat,
    pickFlat,
    flatS,
    flatFit,
    flatClampLat,
    getFlatOn: () => flatOn,
    getFl: () => fl,
    getFlatScene: () => flatScene,
    onFlatPointerDown,
    onFlatPointerMove,
    onFlatPointerEnd
  };
}
