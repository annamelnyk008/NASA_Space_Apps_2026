// mars/pick.js — siteHeightKm + pickMars
import { THREE } from '../core/three.js';
import { D2R } from '../config.js';

/**
 * @param {object} deps
 */
export function createPick(deps) {
  const {
    getTex,
    getMarsCam,
    getMarsRoot,
    getMarsSpin,
    getMode,
    getFlatOn,
    pickFlat
  } = deps;

  let hCan = null;
  const invM = new THREE.Matrix4();
  const pkO = new THREE.Vector3();
  const pkD = new THREE.Vector3();
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function siteHeightKm(lonDeg, latDeg) {
    try {
      const tex = getTex();
      const L = tex.texLv[0];
      if (!L.height || !L.height.image) return null;
      if (!hCan) {
        const img = L.height.image;
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        hCan = { w: c.width, h: c.height, d: g.getImageData(0, 0, c.width, c.height).data };
      }
      const x = (lonDeg / 360 + 0.5) * hCan.w - 0.5;
      const y = (0.5 - latDeg / 180) * hCan.h - 0.5;
      const x0 = Math.floor(x);
      const y0 = Math.floor(y);
      const fx = x - x0;
      const fy = y - y0;
      function at(ix, iy) {
        ix = ((ix % hCan.w) + hCan.w) % hCan.w;
        iy = Math.max(0, Math.min(hCan.h - 1, iy));
        const o = (iy * hCan.w + ix) * 4;
        return (hCan.d[o] * 256 + hCan.d[o + 1]) / 65535 * 31 - 9;
      }
      const a = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
      const b = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
      return a * (1 - fy) + b * fy;
    } catch (err) {
      return null;
    }
  }

  function pickMars(cx, cy) {
    const marsCam = getMarsCam();
    if (!marsCam || getMode() !== 'mars') return null;
    if (getFlatOn()) return pickFlat(cx, cy);

    const marsRoot = getMarsRoot();
    const marsSpin = getMarsSpin();
    marsRoot.updateMatrixWorld(true);
    marsCam.updateMatrixWorld(true);
    ndc.set((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, marsCam);
    invM.copy(marsSpin.matrixWorld).invert();
    pkO.copy(ray.ray.origin).applyMatrix4(invM);
    pkD.copy(ray.ray.direction).transformDirection(invM);
    const b = pkO.dot(pkD);
    const c = pkO.dot(pkO) - 1.0;
    const disc = b * b - c;
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc);
    if (t < 0) return null;
    const px = pkO.x + pkD.x * t;
    const py = pkO.y + pkD.y * t;
    const pz = pkO.z + pkD.z * t;
    return {
      lon: Math.atan2(-pz, px) / D2R,
      lat: Math.asin(Math.max(-1, Math.min(1, py))) / D2R
    };
  }

  return { siteHeightKm, pickMars };
}
