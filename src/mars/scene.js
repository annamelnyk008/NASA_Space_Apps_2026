// mars/scene.js — построение сцены подробного Марса (buildMars)
import { THREE } from '../core/three.js';
import { createMarsMaterials } from './materials.js';
import { detailedMoonGeometry } from '../solar/geometry.js';

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

  // Размеры (в радиусах Марса) ~на треть меньше прежних, пропорции осей — как у настоящих лун:
  // Фобос 13,0 × 11,4 × 9,1 км, Деймос 7,8 × 6,0 × 5,1 км (в реальном масштабе они были бы невидимы)
  const moonDefs = [
    // Stickney на карте Фобоса: центр ≈ долгота −55°, широта +2°
    { name: 'Phobos', r: 0.053, orbit: 1.75, speed: 0.45, tilt: 0.22, color: 0xcdbfb2, sc: [1.14, 1, 0.8], seed: 3, stickney: true, stickneyDir: [0.57, 0.04, -0.82], stickneyR: 0.4, stickneyDepth: 0.035, craters: 0, tex: 'assets/moons-phobos.jpg' },
    { name: 'Deimos', r: 0.033, orbit: 2.45, speed: 0.14, tilt: -0.3, color: 0xe0d2c2, sc: [1.3, 1, 0.85], seed: 9, craters: 0, tex: 'assets/moons-deimos.jpg' }
  ];
  const marsMoons = [];
  moonDefs.forEach(function (d) {
    const tiltG = new THREE.Object3D();
    tiltG.rotation.x = d.tilt;
    marsRoot.add(tiltG);
    const pivot = new THREE.Object3D();
    pivot.rotation.y = d.seed;
    tiltG.add(pivot);
    // карта (Mars – Phobos / Deimos) наложена едва заметно (с малым контрастом, без рельефа); форма — low-poly, грани видны; пока она грузится — просто серо-бежевый цвет
    const mat = new THREE.MeshStandardMaterial({ color: d.color, roughness: 1, metalness: 0, flatShading: true });
    const m = new THREE.Mesh(
      detailedMoonGeometry(d.seed, { color: d.color, stickney: d.stickney, stickneyDir: d.stickneyDir, stickneyR: d.stickneyR, stickneyDepth: d.stickneyDepth, craters: d.craters, smooth: 0.8, detail: 4, jitter: 0.13, flat: true }),
      mat
    );
    if (d.tex) {
      new THREE.TextureLoader().load(d.tex, function (t) {
        t.wrapS = THREE.RepeatWrapping;
        t.anisotropy = 4;
        mat.map = t;
        mat.color.setHex(d.color);
        mat.needsUpdate = true;
      });
    }
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
