// surface/scene.js — buildSurface, makeSurfMat, eachSM
import { THREE } from '../core/three.js';
import { HEAVY } from '../app/device.js';
import { SURF_FRAG, SURF_SHOW_FRAG, SURF_VERT } from '../shaders/index.js';

/**
 * @param {object} deps
 * @param {object} deps.getMarsMat
 */
export function createSurfaceScene(deps) {
  const { getMarsMat } = deps;

  let surfScene = null;
  let surfCam = null;
  let surfMat = null;
  let panoMat = null;
  let showMat = null;
  let panoScene = null;
  let showScene = null;

  function makeSurfMat(pano) {
    const d = pano
      ? { PANO: 1, STEPS: HEAVY ? 120 : 72, SHADOW_STEPS: HEAVY ? 16 : 8 }
      : { STEPS: HEAVY ? 70 : 52, SHADOW_STEPS: HEAVY ? 8 : 5 };
    const marsMat = getMarsMat();
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
        uPx: { value: pano ? 2 * Math.PI / (HEAVY ? 4096 : 2048) : 0.001 },
        uFog: { value: 1 },   // панорама всегда с uFog = 1; живой вид меняет его при зуме (surface/controller.js)
        uStar: { value: new THREE.Matrix3() }
      },
      vertexShader: SURF_VERT,
      fragmentShader: SURF_FRAG,
      defines: d,
      depthTest: false,
      depthWrite: false
    });
  }

  function eachSM(f) {
    if (surfMat) f(surfMat);
    if (panoMat) f(panoMat);
  }

  function buildSurface() {
    surfMat = makeSurfMat(false);
    panoMat = makeSurfMat(true);
    showMat = new THREE.ShaderMaterial({
      uniforms: {
        uPano: { value: null },
        uView: { value: new THREE.Vector2(0, 0) },
        uScr: { value: new THREE.Vector2(0.7, 1.6) }
      },
      vertexShader: SURF_VERT,
      fragmentShader: SURF_SHOW_FRAG,
      depthTest: false,
      depthWrite: false
    });
    surfCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    function sceneOf(m) {
      const sc = new THREE.Scene();
      const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
      q.frustumCulled = false;
      sc.add(q);
      return sc;
    }
    surfScene = sceneOf(surfMat);
    panoScene = sceneOf(panoMat);
    showScene = sceneOf(showMat);
  }

  return {
    buildSurface,
    makeSurfMat,
    eachSM,
    getSurfScene: () => surfScene,
    getSurfCam: () => surfCam,
    getSurfMat: () => surfMat,
    getPanoMat: () => panoMat,
    getShowMat: () => showMat,
    getPanoScene: () => panoScene,
    getShowScene: () => showScene,
    isBuilt: () => !!surfScene
  };
}
