  // ---- Анимация ----------------------------------------------------------
  var marsAcc = 0;
  var clock = new THREE.Clock();
  var time = 0;
  function frame() {
    requestAnimationFrame(frame);
    var dt = Math.min(clock.getDelta(), 0.05);
    time += dt;
    starMat.uniforms.uTime.value = time;

    if (mode === 'mars') {
      marsAcc += dt;
      var busy = renderDirty || mv.dragging || mv.fly || Math.abs(mv.dist - mv.tDist) > 0.002 ||
        Math.abs(mv.vSpin) > 0.01 || Math.abs(mv.vPitch) > 0.01 || transitioning;
      if (!busy && marsAcc < 0.034) return;   // в покое — 30 кадров/с
      updateMars(marsAcc);
      marsAcc = 0;
      renderDirty = false;
      renderer.render(marsScene, marsCam);
      return;
    }
    if (mode === 'surface') {
      var sr = updateSurface(dt);
      if (sr === 1) renderer.render(surfScene, surfCam);
      else if (sr === 2) renderer.render(showScene, surfCam);
      return;
    }

    sunMat.uniforms.uTime.value = time;
    sun.rotation.y += dt * 0.02;

    for (var i = 0; i < planets.length; i++) {
      var p = planets[i];
      p.angle += p.def.speed * dt;
      p.pivot.rotation.y = p.angle;
      p.mesh.rotation.y += p.def.spin * dt;
      if (p.clouds) p.clouds.rotation.y += p.def.spin * 1.25 * dt;
    }
    updateBelts(time);
    renderer.render(scene, camera);
    placeTag();
  }
  frame();
