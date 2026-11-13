/** Создаёт основной WebGL renderer, сцену и камеру приложения. */
export function createRenderer({ THREE, stage, tag, fallback, fov }) {
  let renderer;

  try {
    if (!THREE) throw new Error('three.js не загрузился');
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (error) {
    fallback.hidden = false;
    tag.hidden = true;
    return null;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, 1, 1, 4000);

  return { renderer, scene, camera };
}
