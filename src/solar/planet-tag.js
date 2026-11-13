
import { SUN_R } from '../config.js';
import { clamp01 } from '../lib/math.js';

/** Создаёт обновление экранной подписи Discover над Марсом. */
export function createPlanetTagUpdater({
  THREE,
  mars,
  renderer,
  camera,
  tag
}) {
  const planetWorld = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const sunProjected = new THREE.Vector3();

  return function updatePlanetTag() {
    const rect = renderer.domElement.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    if (!width || !height) return;

    mars.holder.getWorldPosition(planetWorld);
    const marsZ = planetWorld.z;

    projected.copy(planetWorld).project(camera);

    const marsX = rect.left + (projected.x * 0.5 + 0.5) * width;
    const marsY = rect.top + (-projected.y * 0.5 + 0.5) * height;

    projected.set(
      planetWorld.x,
      planetWorld.y + mars.def.r * 1.45 + 0.3,
      planetWorld.z
    ).project(camera);

    const tagX = rect.left + (projected.x * 0.5 + 0.5) * width;
    const tagY = rect.top + (-projected.y * 0.5 + 0.5) * height;

    tag.style.transform =
      `translate3d(${tagX.toFixed(1)}px, ${tagY.toFixed(1)}px, 0) translate(-50%, -100%)`;

    const centerX = rect.left + width / 2;
    const centerY = rect.top + height / 2;

    sunProjected.set(SUN_R, 0, 0).project(camera);

    const sunX = rect.left + (sunProjected.x * 0.5 + 0.5) * width;
    const sunPx = Math.abs(sunX - centerX);

    const distance = Math.hypot(
      marsX - centerX,
      marsY - centerY
    );

    const opacity = marsZ < 0
      ? clamp01((distance - sunPx * 0.85) / (sunPx * 0.35))
      : 1;

    tag.style.opacity = opacity.toFixed(2);
    tag.style.pointerEvents = opacity > 0.5 ? 'auto' : 'none';
  };
}

