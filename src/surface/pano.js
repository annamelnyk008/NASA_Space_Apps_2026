// surface/pano.js — makePanoRT, panoStart, panoStep
import { THREE } from '../core/three.js';
import { HEAVY } from '../app/device.js';

const PANO_W = HEAVY ? 4096 : 2048;
const PANO_H = PANO_W / 2;
const PANO_STRIPS = 32;

/**
 * @param {object} deps
 */
export function createPano(deps) {
  const {
    getSurf,
    getRenderer,
    getPanoScene,
    getSurfCam,
    getShowMat,
    surfSun
  } = deps;

  const panoRT = [null, null];

  function makePanoRT() {
    const rt = new THREE.WebGLRenderTarget(PANO_W, PANO_H, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false
    });
    rt.texture.wrapS = THREE.RepeatWrapping;
    rt.texture.wrapT = THREE.ClampToEdgeWrapping;
    return rt;
  }

  function panoStart() {
    surfSun();
    const surf = getSurf();
    const idx = surf.panoCur === 0 ? 1 : 0;
    if (!panoRT[idx]) panoRT[idx] = makePanoRT();
    surf.job = { idx, row: 0, tex: surf.tex };
  }

  function panoStep(n) {
    const surf = getSurf();
    const j = surf.job;
    if (!j) return;
    const rt = panoRT[j.idx];
    const rows = PANO_H / PANO_STRIPS;
    const renderer = getRenderer();
    const panoScene = getPanoScene();
    const surfCam = getSurfCam();
    for (let k = 0; k < n && j.row < PANO_STRIPS; k++, j.row++) {
      rt.scissorTest = true;
      rt.scissor.set(0, j.row * rows, PANO_W, rows);
      rt.viewport.set(0, 0, PANO_W, PANO_H);
      renderer.setRenderTarget(rt);
      renderer.render(panoScene, surfCam);
    }
    renderer.setRenderTarget(null);
    if (j.row >= PANO_STRIPS) {
      surf.panoCur = j.idx;
      getShowMat().uniforms.uPano.value = rt.texture;
      surf.panoTex = j.tex;
      surf.panoAge = 0;
      surf.panoSwap = true;
      surf.panoReady = true;
      surf.job = null;
    }
  }

  function disposePanoRT() {
    for (let pi = 0; pi < 2; pi++) {
      if (panoRT[pi]) {
        panoRT[pi].dispose();
        panoRT[pi] = null;
      }
    }
  }

  return {
    makePanoRT,
    panoStart,
    panoStep,
    disposePanoRT,
    PANO_W,
    PANO_H,
    PANO_STRIPS
  };
}
