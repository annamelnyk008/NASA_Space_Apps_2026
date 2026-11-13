import { THREE } from '../core/three.js';
import { HEAVY } from '../app/device.js';
import { TS } from '../data/tiles.js';
import { PH_HEIGHT, buildMosaic, canvasTex } from '../data/mosaic.js';

const H_EMBED_SRC = 'assets/mars-height.png';
const H_W = 2048, H_H = 1024;

export function createTextures({ renderer, getMarsMat, getDist, onLodChange, onSyncElev }) {
  let heightP = null;
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
  var state = { texCur: -1 };

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

  function desiredLevel(d) {
    var want = d > 4.3 ? 0 : (d > 2.9 ? 1 : 2);
    return Math.min(want, MAX_LEVEL);
  }

  function applyTexLevel() {
    var want = desiredLevel(getDist()), use = -1;
    for (var i = want; i >= 0; i--) { if (texLv[i].state === 2) { use = i; break; } }
    if (use < 0 || use === state.texCur) return;
    state.texCur = use;
    var marsMat = getMarsMat();
    if (!marsMat) return;
    var u = marsMat.uniforms;
    u.uColor.value = texLv[use].color;
    u.uHeight.value = texLv[use].height;
    u.uRes.value.set(H_W, H_H);
    onLodChange();
    onSyncElev();
  }

  return { LEVELS, MAX_LEVEL, texLv, state, requestLevel, applyTexLevel, getHeightTex, H_W, H_H };
}