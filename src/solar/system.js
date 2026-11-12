// Система: освещение, Солнце, планеты, пояс астероидов и звёзды.
import { SUN_R } from '../config.js';
import { NOISE_GLSL } from '../shaders/index.js';
import { rockGeometry } from './geometry.js';
import {
  cloudTex, earthTex, jupiterTex, marsTex, mercuryTex, neptuneTex,
  radialTex, ringTex, saturnTex, uranusTex, venusTex
} from './textures.js';

/**
 * Создаёт объекты Солнечной системы и добавляет их в переданную сцену.
 * Возвращает объекты, которые нужны другим режимам и главному циклу.
 */
export function createSolarSystem({ THREE, scene, renderer }) {
    function glowSprite(map, diameter) {
      var s = new THREE.Sprite(new THREE.SpriteMaterial({
        map: map, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
      }));
      s.scale.set(diameter, diameter, 1);
      return s;
    }
    var HALO_K = 1.55;
    function haloSprite(rgb, r) {
      var f = 1 / HALO_K, peak = 0.38;
      var map = radialTex([
        [0, 'rgba(' + rgb + ',' + peak + ')'],
        [f, 'rgba(' + rgb + ',' + peak + ')'],
        [f + (1 - f) * 0.28, 'rgba(' + rgb + ',' + (peak * 0.38) + ')'],
        [1, 'rgba(' + rgb + ',0)']
      ]);
      return glowSprite(map, 2 * r * HALO_K);
    }

    // ---- Освещение ---------------------------------------------------------
    scene.add(new THREE.AmbientLight(0x8fa4e8, 0.55));
    var sunLight = new THREE.PointLight(0xfff0cf, 1.7, 0, 0);
    scene.add(sunLight);
    var fill = new THREE.DirectionalLight(0xcfdcff, 0.65);
    scene.add(fill);

    // ---- Солнце ------------------------------------------------------------

    var sunMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: [
        'varying vec3 vPos; varying vec3 vNormal; varying vec3 vView;',
        'void main(){',
        '  vPos = position;',
        '  vNormal = normalize(normalMatrix * normal);',
        '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
        '  vView = -mv.xyz;',
        '  gl_Position = projectionMatrix * mv;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform float uTime;',
        'varying vec3 vPos; varying vec3 vNormal; varying vec3 vView;',
        NOISE_GLSL,
        'void main(){',
        '  vec3 p = normalize(vPos) * 1.8;',
        '  float t = uTime;',
        '  vec3 warp = vec3(',
        '    snoise(p*1.3 + vec3(0.0, t*0.10, 0.0)),',
        '    snoise(p*1.3 + vec3(5.2, 1.3, t*0.10)),',
        '    snoise(p*1.3 + vec3(t*0.10, 9.1, 3.3)));',
        '  vec3 q = p + warp * 0.45;',
        '  float n = 0.55 * snoise(q*1.4 + vec3(t*0.12, 0.0, t*0.08));',
        '  n += 0.30 * snoise(q*2.9 - vec3(0.0, t*0.18, t*0.10));',
        '  n += 0.18 * snoise(q*6.0 + vec3(t*0.25, t*0.10, 0.0));',
        '  float h = clamp(n * 0.5 + 0.5, 0.0, 1.0);',
        '  vec3 deep = vec3(0.78, 0.12, 0.02);',
        '  vec3 mid  = vec3(1.00, 0.50, 0.06);',
        '  vec3 hot  = vec3(1.00, 0.86, 0.38);',
        '  vec3 col = mix(deep, mid, smoothstep(0.25, 0.55, h));',
        '  col = mix(col, hot, smoothstep(0.55, 0.85, h));',
        '  float rim = pow(1.0 - clamp(dot(normalize(vNormal), normalize(vView)), 0.0, 1.0), 2.2);',
        '  col = mix(col, vec3(1.0, 0.45, 0.08), rim * 0.55);',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n')
    });
    var sun = new THREE.Mesh(new THREE.SphereGeometry(SUN_R, 64, 48), sunMat);
    scene.add(sun);

    var sunGlowA = glowSprite(radialTex([
      [0, 'rgba(255,170,60,0.85)'],
      [0.42, 'rgba(255,170,60,0.75)'],
      [0.55, 'rgba(255,140,40,0.30)'],
      [0.75, 'rgba(255,110,30,0.08)'],
      [1, 'rgba(255,100,20,0)']
    ]), SUN_R * 2 * 2.4);
    var sunGlowB = glowSprite(radialTex([
      [0, 'rgba(255,120,50,0.22)'],
      [0.5, 'rgba(255,100,40,0.08)'],
      [1, 'rgba(255,90,30,0)']
    ]), SUN_R * 2 * 4);
    scene.add(sunGlowB);
    scene.add(sunGlowA);

    // ---- Орбиты ------------------------------------------------------------
    function orbitLine(R) {
      var pts = [];
      for (var i = 0; i < 256; i++) {
        var a = (i / 256) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R));
      }
      return new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0xdce6ff, transparent: true, opacity: 0.3 })
      );
    }

    // ---- Планеты -----------------------------------------------------------
    // x = R·cos(a), z = −R·sin(a): тот же порядок и для астероидов
    var DEFS = [
      { name: 'Mercury', r: 1.2, orbit: 11.5, speed: 0.030,  spin: 0.20, a0: -0.5,  tilt: 0.03, glow: '196,190,182', tex: mercuryTex },
      { name: 'Venus',   r: 2.0, orbit: 16,   speed: 0.022,  spin: 0.10, a0: 0.9,   tilt: 0.05, glow: '255,214,140', tex: venusTex },
      { name: 'Earth',   r: 2.1, orbit: 21,   speed: 0.017,  spin: 0.45, a0: -2.0,  tilt: 0.41, glow: '120,180,255', tex: earthTex, extra: 'earth' },
      { name: 'Mars',    r: 1.7, orbit: 25.5, speed: 0.014,  spin: 0.40, a0: -0.75, tilt: 0.44, glow: '255,128,84',  tex: marsTex },
      { name: 'Jupiter', r: 4.8, orbit: 43,   speed: 0.009,  spin: 0.07, a0: -2.6,  tilt: 0.05, glow: '240,196,148', tex: jupiterTex, rot0: 0.36 },
      { name: 'Saturn',  r: 3.9, orbit: 54.5, speed: 0.0065, spin: 0.25, a0: -0.35, tilt: 0.47, glow: '244,220,150', tex: saturnTex, extra: 'saturn' },
      { name: 'Uranus',  r: 2.8, orbit: 65,   speed: 0.0045, spin: 0.22, a0: 2.5,   tilt: 1.2,  glow: '150,230,236', tex: uranusTex },
      { name: 'Neptune', r: 2.7, orbit: 74,   speed: 0.0035, spin: 0.22, a0: 0.6,   tilt: 0.5,  glow: '110,150,255', tex: neptuneTex }
    ];

    var planets = DEFS.map(function (def) {
      var pivot = new THREE.Object3D();
      pivot.rotation.y = def.a0;
      scene.add(pivot);
      var holder = new THREE.Object3D();
      holder.position.x = def.orbit;
      pivot.add(holder);
      var tiltG = new THREE.Object3D();
      tiltG.rotation.z = def.tilt;
      holder.add(tiltG);

      var mesh = new THREE.Mesh(
        new THREE.SphereGeometry(def.r, 48, 32),
        new THREE.MeshLambertMaterial({ map: def.tex() })
      );
      mesh.rotation.y = def.rot0 || 0;
      tiltG.add(mesh);
      holder.add(haloSprite(def.glow, def.r));
      scene.add(orbitLine(def.orbit));

      var item = { def: def, pivot: pivot, holder: holder, mesh: mesh, angle: def.a0, clouds: null };

      if (def.extra === 'earth') {
        var clouds = new THREE.Mesh(
          new THREE.SphereGeometry(def.r * 1.025, 48, 32),
          new THREE.MeshLambertMaterial({ map: cloudTex(), transparent: true, depthWrite: false })
        );
        tiltG.add(clouds);
        item.clouds = clouds;
      }
      if (def.extra === 'saturn') {
        var inner = def.r * 1.35, outer = def.r * 2.25;
        var rg = new THREE.RingGeometry(inner, outer, 128, 1);
        var pos = rg.attributes.position, uv = rg.attributes.uv, v3 = new THREE.Vector3();
        for (var i = 0; i < pos.count; i++) {
          v3.fromBufferAttribute(pos, i);
          uv.setXY(i, (v3.length() - inner) / (outer - inner), 0.5);
        }
        var ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({
          map: ringTex(), transparent: true, side: THREE.DoubleSide, depthWrite: false
        }));
        ring.rotation.x = -Math.PI / 2;
        tiltG.add(ring);
      }
      return item;
    });

    var mars = planets.filter(function (p) { return p.def.name === 'Mars'; })[0];

    // ---- Пояс астероидов ---------------------------------------------------

    var ROCK_VARIANTS = 3, ROCKS_EACH = 220;
    var rockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, flatShading: true });
    var belts = [];
    var dummy = new THREE.Object3D();
    var tmpColor = new THREE.Color();
    for (var vI = 0; vI < ROCK_VARIANTS; vI++) {
      var im = new THREE.InstancedMesh(rockGeometry(11 + vI * 7), rockMat, ROCKS_EACH);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      var data = [];
      for (var i = 0; i < ROCKS_EACH; i++) {
        var r = 30 + (Math.random() + Math.random()) * 2.75;
        var size = 0.16 + Math.pow(Math.random(), 2.2) * 0.5;
        data.push({
          r: r,
          a0: Math.random() * Math.PI * 2,
          w: (0.075 + Math.random() * 0.05) * Math.pow(33 / r, 1.5),
          y: (Math.random() + Math.random() - 1) * 1.6,
          sx: size * (0.8 + Math.random() * 0.5),
          sy: size * (0.8 + Math.random() * 0.5),
          sz: size * (0.8 + Math.random() * 0.5),
          rx: Math.random() * 6.28, ry: Math.random() * 6.28, rz: Math.random() * 6.28,
          tx: (Math.random() - 0.5) * 1.2, ty: (Math.random() - 0.5) * 1.2
        });
        tmpColor.setHSL(0.06 + Math.random() * 0.04, 0.08 + Math.random() * 0.17, 0.38 + Math.random() * 0.22);
        im.setColorAt(i, tmpColor);
      }
      im.instanceColor.needsUpdate = true;
      scene.add(im);
      belts.push({ mesh: im, data: data });
    }

    function updateBelts(t) {
      for (var b = 0; b < belts.length; b++) {
        var m = belts[b].mesh, d = belts[b].data;
        for (var i = 0; i < d.length; i++) {
          var o = d[i], a = o.a0 + o.w * t;
          dummy.position.set(Math.cos(a) * o.r, o.y, -Math.sin(a) * o.r);
          dummy.rotation.set(o.rx + o.tx * t, o.ry + o.ty * t, o.rz);
          dummy.scale.set(o.sx, o.sy, o.sz);
          dummy.updateMatrix();
          m.setMatrixAt(i, dummy.matrix);
        }
        m.instanceMatrix.needsUpdate = true;
      }
    }

    // ---- Звёзды ------------------------------------------------------------
    var STARS = 1900;
    var sPos = new Float32Array(STARS * 3), sSize = new Float32Array(STARS), sPhase = new Float32Array(STARS);
    var sSpeed = new Float32Array(STARS), sAmp = new Float32Array(STARS), sCol = new Float32Array(STARS * 3);
    var palette = [[1, 1, 1], [0.8, 0.88, 1], [1, 0.92, 0.8], [1, 0.82, 0.72]];
    for (var s = 0; s < STARS; s++) {
      var u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, q = Math.sqrt(1 - u * u);
      var R = 1100 + Math.random() * 200;
      sPos[s * 3] = R * q * Math.cos(th);
      sPos[s * 3 + 1] = R * u;
      sPos[s * 3 + 2] = R * q * Math.sin(th);
      sSize[s] = 1.0 + Math.pow(Math.random(), 3) * 2.6;
      sPhase[s] = Math.random() * Math.PI * 2;
      sSpeed[s] = 0.5 + Math.random() * 1.6;
      sAmp[s] = Math.random() < 0.45 ? 0.25 + Math.random() * 0.6 : 0.04;
      var pc = palette[Math.random() < 0.6 ? (Math.random() < 0.5 ? 0 : 1) : (Math.random() < 0.5 ? 2 : 3)];
      var br = 0.5 + Math.random() * 0.5;
      sCol[s * 3] = pc[0] * br; sCol[s * 3 + 1] = pc[1] * br; sCol[s * 3 + 2] = pc[2] * br;
    }
    var starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    starGeo.setAttribute('aSize', new THREE.BufferAttribute(sSize, 1));
    starGeo.setAttribute('aPhase', new THREE.BufferAttribute(sPhase, 1));
    starGeo.setAttribute('aSpeed', new THREE.BufferAttribute(sSpeed, 1));
    starGeo.setAttribute('aAmp', new THREE.BufferAttribute(sAmp, 1));
    starGeo.setAttribute('aColor', new THREE.BufferAttribute(sCol, 3));
    var starMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPR: { value: renderer.getPixelRatio() } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: [
        'attribute float aSize; attribute float aPhase; attribute float aSpeed; attribute float aAmp; attribute vec3 aColor;',
        'uniform float uTime; uniform float uPR;',
        'varying vec3 vColor; varying float vBright;',
        'void main(){',
        '  float tw = sin(uTime * aSpeed + aPhase);',
        '  float env = smoothstep(0.15, 0.85, 0.5 + 0.5 * sin(uTime * 0.11 * aSpeed + aPhase * 3.0));',
        '  vBright = 1.0 - aAmp * env * (0.5 - 0.5 * tw);',
        '  float shift = aAmp * env * 0.5 * sin(uTime * aSpeed * 0.7 + aPhase * 1.7);',
        '  vColor = aColor * vec3(1.0 + shift, 1.0, 1.0 - shift);',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '  gl_PointSize = aSize * uPR;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'varying vec3 vColor; varying float vBright;',
        'void main(){',
        '  float d = length(gl_PointCoord - 0.5);',
        '  float a = smoothstep(0.5, 0.1, d);',
        '  gl_FragColor = vec4(vColor * vBright, a);',
        '}'
      ].join('\n')
    });
    var stars = new THREE.Points(starGeo, starMat);
    stars.frustumCulled = false;
    scene.add(stars);

  return {
    sun, sunMat, sunLight, fill,
    planets, mars,
    belts, stars, starGeo, starMat,
    updateBelts
  };
}
