import { THREE } from '../core/three.js';
import { D2R } from '../config.js';
import { clamp01 } from '../lib/math.js';
import { lonText } from '../lib/format.js';

export function createLabels({ labelsEl, getMarsCam, getMarsSpin, isGridOn, places, isFlat, getFl }) {
  const gLabels = [];
  const moonLabels = [];
  const moonW = new THREE.Vector3(), moonCam = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const tmpV = new THREE.Vector3(), tmpW = new THREE.Vector3(), tmpC = new THREE.Vector3();

  function buildGridLabels() {
    const defs = [];
    for (let lon = -150; lon <= 180; lon += 30) defs.push({ kind: 'lon', lon, lat: 0, text: lonText(lon) });
    [-60, -30, 30, 60].forEach(lat => {
      defs.push({ kind: 'lat', lon: 0, lat, text: Math.abs(lat) + '°' + (lat > 0 ? 'N' : 'S') });
    });
    defs.forEach(d => {
      const el = document.createElement('div');
      el.className = 'glabel ' + d.kind;
      el.textContent = d.text;
      labelsEl.appendChild(el);
      d.el = el;
      gLabels.push(d);
    });
  }

  function addMoonLabel(name, mesh) {
    const el = document.createElement('div');
    el.className = 'glabel moon';
    el.textContent = name;
    labelsEl.appendChild(el);
    moonLabels.push({ el, mesh });
  }

  function updateMoonLabels() {
    const marsCam = getMarsCam();
    if (!marsCam) return;
    const w = window.innerWidth, h = window.innerHeight;
    marsCam.updateMatrixWorld(true);
    for (let i = 0; i < moonLabels.length; i++) {
      const L = moonLabels[i];
      L.mesh.getWorldPosition(moonW);
      moonCam.copy(marsCam.position);
      const dx = moonW.x - moonCam.x, dy = moonW.y - moonCam.y, dz = moonW.z - moonCam.z;
      const len2 = dx * dx + dy * dy + dz * dz;
      const tt = Math.max(0, Math.min(1, -(moonCam.x * dx + moonCam.y * dy + moonCam.z * dz) / len2));
      const px = moonCam.x + dx * tt, py = moonCam.y + dy * tt, pz = moonCam.z + dz * tt;
      const occluded = tt > 0.001 && tt < 0.999 && (px * px + py * py + pz * pz) < 1.0;
      moonW.project(marsCam);
      const x = (moonW.x * 0.5 + 0.5) * w, y = (-moonW.y * 0.5 + 0.5) * h;
      const vis = !occluded && moonW.z < 1 && x > 0 && x < w && y > 0 && y < h;
      L.el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
      L.el.style.opacity = vis ? '1' : '0';
    }
  }

  // подписи «Мест интереса» прямо на Марсе (ползунок Labels)
  const placeLabels = [];
  // отдельный контейнер: основной (#mars-labels) прячется в режиме карты, а эти подписи нужны и там
  const placeHost = document.createElement('div');
  placeHost.className = 'place-labels';
  if (labelsEl.parentNode) labelsEl.parentNode.insertBefore(placeHost, labelsEl.nextSibling);
  let placesOn = false;
  (places || []).forEach(function (p) {
    const el = document.createElement('div');
    el.className = 'glabel place';
    const sp = document.createElement('span');
    sp.textContent = p.name;
    el.appendChild(sp);
    placeHost.appendChild(el);
    placeLabels.push({ el, lon: p.lon, lat: p.lat });
  });
  function setPlaceLabels(on) {
    placesOn = !!on;
    if (!placesOn) for (let i = 0; i < placeLabels.length; i++) placeLabels[i].el.style.opacity = '0';
  }
  function updatePlaceLabels() {
    if (!placesOn || !placeLabels.length) return;
    if (isFlat && isFlat() && getFl) {
      const fl = getFl();
      const cam = getMarsCam();
      if (!cam) return;
      const w = window.innerWidth, h = window.innerHeight;
      cam.updateMatrixWorld(true);
      for (let i = 0; i < placeLabels.length; i++) {
        const d = placeLabels[i];
        let px = d.lon / 90;
        const c0 = fl.lon / 90;
        while (px - c0 > 2) px -= 4;
        while (px - c0 < -2) px += 4;
        tmpW.set(px, d.lat / 90, 0).project(cam);
        const x = (tmpW.x * 0.5 + 0.5) * w, y = (-tmpW.y * 0.5 + 0.5) * h;
        const vis = x > -40 && x < w + 40 && y > -20 && y < h + 20;
        d.el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
        d.el.style.opacity = vis ? '1' : '0';
      }
      return;
    }
    const marsCam = getMarsCam();
    const marsSpin = getMarsSpin();
    if (!marsCam || !marsSpin) return;
    const w = window.innerWidth, h = window.innerHeight;
    marsCam.updateMatrixWorld(true);
    for (let i = 0; i < placeLabels.length; i++) {
      const d = placeLabels[i];
      const lo = d.lon * D2R, la = d.lat * D2R;
      tmpW.set(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo));
      tmpW.applyMatrix4(marsSpin.matrixWorld);
      tmpC.copy(tmpW).normalize();
      const toCam = tmpV.copy(marsCam.position).sub(tmpW).normalize();
      const op = clamp01((tmpC.dot(toCam) - 0.1) / 0.2);
      if (op <= 0.01) { d.el.style.opacity = '0'; continue; }
      tmpW.project(marsCam);
      const x = (tmpW.x * 0.5 + 0.5) * w, y = (-tmpW.y * 0.5 + 0.5) * h;
      const vis = tmpW.z < 1 && x > -40 && x < w + 40 && y > -20 && y < h + 20;
      d.el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
      d.el.style.opacity = vis ? op.toFixed(2) : '0';
    }
  }

  function updateLabels() {
    updateMoonLabels();
    updatePlaceLabels();
    if (!isGridOn()) return;
    const marsCam = getMarsCam();
    const marsSpin = getMarsSpin();
    if (!marsCam || !marsSpin) return;
    const w = window.innerWidth, h = window.innerHeight;
    marsCam.updateMatrixWorld(true);
    marsSpin.getWorldQuaternion(tmpQ);
    tmpV.set(0, 0, 1).applyQuaternion(tmpQ.clone().invert());
    const lonC = Math.atan2(-tmpV.z, tmpV.x) / D2R;
    const latLon = Math.round(lonC / 30) * 30;
    for (let i = 0; i < gLabels.length; i++) {
      const d = gLabels[i];
      const lo = (d.kind === 'lat' ? latLon : d.lon) * D2R, la = d.lat * D2R;
      tmpW.set(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo));
      tmpW.multiplyScalar(1.0).applyMatrix4(marsSpin.matrixWorld);
      tmpC.copy(tmpW).normalize();
      const toCam = tmpV.copy(marsCam.position).sub(tmpW).normalize();
      const facing = tmpC.dot(toCam);
      const op = clamp01((facing - 0.18) / 0.25);
      if (op <= 0.01) { d.el.style.opacity = '0'; continue; }
      tmpW.project(marsCam);
      const x = (tmpW.x * 0.5 + 0.5) * w, y = (-tmpW.y * 0.5 + 0.5) * h;
      d.el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
      d.el.style.opacity = op.toFixed(2);
    }
  }

  function hideGridLabels() {
    for (let i = 0; i < gLabels.length; i++) gLabels[i].el.style.opacity = '0';
  }

  return { updatePlaceLabels, setPlaceLabels, buildGridLabels, addMoonLabel, updateLabels, updateMoonLabels, hideGridLabels, gLabels, moonLabels };
}