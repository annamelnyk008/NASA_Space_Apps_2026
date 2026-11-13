/** Управляет размером renderer и основной камеры при изменении окна. */
export function createViewportController({
  THREE,
  renderer,
  camera,
  fillLight,
  starMaterial,
  fov,
  fitRadius,
  tiltDeg,
  onDirty
}) {
  let onMarsResize = null;

  function resize() {
    onDirty();

    const width = window.innerWidth;
    const height = window.innerHeight;

    renderer.setSize(width, height, true);
    camera.aspect = width / height;

    const halfHeight = Math.tan(THREE.MathUtils.degToRad(fov) / 2) * camera.aspect;
    const distance = fitRadius / halfHeight;
    const tilt = THREE.MathUtils.degToRad(tiltDeg);

    camera.position.set(0, Math.sin(tilt) * distance, Math.cos(tilt) * distance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);

    fillLight.position.copy(camera.position);
    starMaterial.uniforms.uPR.value = renderer.getPixelRatio();

    if (onMarsResize) onMarsResize(width, height);
  }

  window.addEventListener('resize', resize);
  resize();

  return {
    resize,
    setMarsResizeHandler(handler) {
      onMarsResize = handler;
    }
  };
}
