// mars/scene.js — построение сцены подробного Марса (buildMars)
import { THREE } from '../core/three.js';
import { createMarsMaterials } from './materials.js';
import { moonGeometry } from '../solar/geometry.js';

/**
 * Создаёт сцену подробного Марса: корень, спин, материалы, атмосфера, луны, свет, звёзды.
 * @param {object} deps
 * @param {object} deps.geo - результат createGeo()
 * @param {object} deps.labels - результат createLabels()
 * @param {object} deps.viewport - createViewportController()
 * @param {object} deps.starGeo
 * @param {object} deps.starMat
 * @param {object} deps.sunObj - направление Солнца (Vector3)
 * @param {object} deps.mv - состояние вида { dist, tDist, fit, userZoomed, ... }
 * @param {function} deps.getMode - () => current mode
 * @returns {{ marsScene, marsCam, marsRoot, marsSpin, marsMat, marsAtmoMat, marsLight, marsMoons }}
 */
export function buildMars(deps) {
  const {
    geo,
    labels,
    viewport,
    starGeo,
    starMat,
    sunObj,
    mv,
    getMode
  } = deps;

  const marsScene = new THREE.Scene();
  const marsCam = new THREE.PerspectiveCamera(30, 1, 0.02, 4000);
  const marsRoot = new THREE.Object3D();
  marsScene.add(marsRoot);
  const marsSpin = new THREE.Object3D();
  marsRoot.add(marsSpin);

  const mats = createMarsMaterials({ sunObj });
  const marsMat = mats.marsMat;
  const marsAtmoMat = mats.atmoMat;
  geo.makeGeoMesh(0);
  marsRoot.add(new THREE.Mesh(new THREE.SphereGeometry(1.1, 64, 48), marsAtmoMat));

  const moonDefs = [
    { name: 'Phobos', r: 0.075, orbit: 1.75, speed: 0.45, tilt: 0.22, color: 0x6d6058, sc: [1.35, 1, 1.1], seed: 3 },
    { name: 'Deimos', r: 0.05, orbit: 2.45, speed: 0.14, tilt: -0.3, color: 0x8c7f72, sc: [1.1, 1, 0.95], seed: 9 }
  ];
  const marsMoons = [];
  moonDefs.forEach(function (d) {
    const tiltG = new THREE.Object3D();
    tiltG.rotation.x = d.tilt;
    marsRoot.add(tiltG);
    const pivot = new THREE.Object3D();
    pivot.rotation.y = d.seed;
    tiltG.add(pivot);
    const m = new THREE.Mesh(
      moonGeometry(d.seed),
      new THREE.MeshStandardMaterial({ color: d.color, roughness: 1, metalness: 0, flatShading: true })
    );
    m.scale.set(d.r * d.sc[0], d.r * d.sc[1], d.r * d.sc[2]);
    m.position.x = d.orbit;
    pivot.add(m);
    marsMoons.push({ def: d, pivot: pivot, mesh: m, angle: d.seed });
    labels.addMoonLabel(d.name, m);
  });

  marsScene.add(new THREE.AmbientLight(0x445577, 0.18));
  const marsLight = new THREE.DirectionalLight(0xfff0dc, 2.4);
  marsScene.add(marsLight);

  const st = new THREE.Points(starGeo, starMat);
  st.frustumCulled = false;
  marsScene.add(st);

  labels.buildGridLabels();

  viewport.setMarsResizeHandler(function (w, h) {
    marsCam.aspect = w / h;
    marsCam.updateProjectionMatrix();
    const half = THREE.MathUtils.degToRad(marsCam.fov / 2);
    const halfH = Math.atan(Math.tan(half) * marsCam.aspect);
    const ang = Math.min(half, halfH) * 0.8;
    mv.fit = 1 / Math.sin(ang);
    if (!mv.userZoomed && getMode() === 'mars') mv.tDist = mv.fit;
  });

  return {
    marsScene,
    marsCam,
    marsRoot,
    marsSpin,
    marsMat,
    marsAtmoMat,
    marsLight,
    marsMoons
  };
}
