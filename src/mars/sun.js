import { D2R } from '../config.js';
import { marsSolar } from '../data/marsSolar.js';
import { THREE } from '../core/three.js';

export function createMarsSun() {
  const info = { lonE: 0, lat: 0, Ls: 0, mtc: 0 };
  const dir = new THREE.Vector3(1, 0, 0);
  function update(nowMs = Date.now()) {
    Object.assign(info, marsSolar(nowMs));
    const la = info.lat * D2R, lo = info.lonE * D2R;
    dir.set(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo));
  }
  update();
  return { update, info, dir };
}
