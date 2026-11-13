import { THREE } from '../core/three.js';
import { GEO_SIZES, MAX_GEO } from '../config.js';

export function createGeo({ getMarsMat, getMarsSpin, getDist, onLodChange }) {
  const geoMeshes = [null, null, null];
  let geoCur = -1;

  function makeGeoMesh(i) {
    const marsMat = getMarsMat();
    const marsSpin = getMarsSpin();
    if (geoMeshes[i] || !marsMat || !marsSpin) return;
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, GEO_SIZES[i][0], GEO_SIZES[i][1]), marsMat);
    m.frustumCulled = false;
    m.visible = false;
    marsSpin.add(m);
    geoMeshes[i] = m;
  }

  function updateGeoLod() {
    const d = getDist();
    let w = geoCur < 0 ? 0 : geoCur;
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
    for (let i = 0; i < geoMeshes.length; i++) if (geoMeshes[i]) geoMeshes[i].visible = (i === w);
    if (onLodChange) onLodChange();
  }

  return {
    geoMeshes, makeGeoMesh, updateGeoLod,
    get geoCur() { return geoCur; }
  };
}