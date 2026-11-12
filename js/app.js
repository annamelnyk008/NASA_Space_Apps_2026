(function () {
  'use strict';

  // ---- Настройки сцены ---------------------------------------------------
  var TILT_DEG = 14;      // на сколько камера приподнята над плоскостью орбит (взгляд вниз)
  var FOV = 36;
  var FIT_RADIUS = 78;    // какой радиус системы должен поместиться по ширине экрана
  var SUN_R = 6.5;

  var stage = document.getElementById('stage');
  var tag = document.getElementById('mars-tag');
  var fallback = document.getElementById('fallback');

  var renderer;
  try {
    if (!window.THREE) throw new Error('three.js не загрузился');
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (e) {
    fallback.hidden = false;
    tag.hidden = true;
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  stage.appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(FOV, 1, 1, 4000);

  // ---- Шум и процедурные текстуры ---------------------------------------
  function hash3(x, y, z) {
    var h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function sm(t) { return t * t * (3 - 2 * t); }
  function vnoise(x, y, z) {
    var xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    var xf = sm(x - xi), yf = sm(y - yi), zf = sm(z - zi);
    var c000 = hash3(xi, yi, zi), c100 = hash3(xi + 1, yi, zi);
    var c010 = hash3(xi, yi + 1, zi), c110 = hash3(xi + 1, yi + 1, zi);
    var c001 = hash3(xi, yi, zi + 1), c101 = hash3(xi + 1, yi, zi + 1);
    var c011 = hash3(xi, yi + 1, zi + 1), c111 = hash3(xi + 1, yi + 1, zi + 1);
    var x00 = c000 + (c100 - c000) * xf, x10 = c010 + (c110 - c010) * xf;
    var x01 = c001 + (c101 - c001) * xf, x11 = c011 + (c111 - c011) * xf;
    var y0 = x00 + (x10 - x00) * yf, y1 = x01 + (x11 - x01) * yf;
    return y0 + (y1 - y0) * zf;
  }
  function fb(x, y, z, oct) {
    var a = 0.5, s = 0, f = 1;
    for (var i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f, z * f); f *= 2; a *= 0.5; }
    return s / (1 - Math.pow(0.5, oct));
  }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function sstep(e0, e1, x) { var t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); }
  function mix(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }

  // Эквидистантная текстура по сфере; fn получает направление точки и возвращает [r,g,b(,a)]
  function makeTex(w, h, fn, post) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    var img = ctx.createImageData(w, h);
    var d = img.data;
    for (var y = 0; y < h; y++) {
      var lat = (0.5 - (y + 0.5) / h) * Math.PI;
      var cl = Math.cos(lat), sl = Math.sin(lat);
      for (var x = 0; x < w; x++) {
        var lon = ((x + 0.5) / w) * Math.PI * 2;
        var col = fn(cl * Math.cos(lon), sl, cl * Math.sin(lon));
        var i = (y * w + x) * 4;
        d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2];
        d[i + 3] = col.length > 3 ? col[3] : 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    if (post) post(ctx, w, h);
    return new THREE.CanvasTexture(c);
  }

  var TW = 512, TH = 256;

  function mercuryTex() {
    return makeTex(TW, TH, function (x, y, z) {
      var n = fb(x * 3, y * 3, z * 3 + 1.3, 5);
      var c = vnoise(x * 10 + 5, y * 10, z * 10);
      var k = 0.58 + 0.4 * (n - 0.5);
      if (c < 0.17) k *= 0.7; else if (c > 0.88) k *= 1.12;
      return [k * 190, k * 174, k * 158];
    });
  }
  function venusTex() {
    return makeTex(TW, TH, function (x, y, z) {
      var w = fb(x * 2, y * 4, z * 2 + 3, 4);
      var t = Math.sin(y * 5 + w * 6) * 0.5 + 0.5;
      var c = mix([214, 172, 98], [242, 216, 152], t);
      return mix(c, [190, 140, 80], sstep(0.6, 0.85, fb(x * 5, y * 9, z * 5, 3)) * 0.35);
    });
  }
  function earthTex() {
    return makeTex(TW, TH, function (x, y, z) {
      var n = fb(x * 1.7 + 3.1, y * 1.7 + 1.2, z * 1.7 + 7.7, 5);
      var ice = Math.abs(y) + (fb(x * 4, y * 4, z * 4, 3) - 0.5) * 0.12;
      if (ice > 0.88) return [238, 244, 250];
      var sea = 0.54;
      if (n < sea) return mix([14, 52, 138], [40, 122, 200], sstep(0.32, sea, n));
      var e = (n - sea) / (1 - sea);
      var c = mix([62, 148, 68], [128, 150, 74], sstep(0.15, 0.55, e));
      c = mix(c, [150, 122, 88], sstep(0.55, 0.9, e));
      var des = 1 - Math.abs(Math.abs(y) - 0.33) / 0.2;
      if (des > 0) c = mix(c, [200, 174, 106], Math.min(des, 1) * 0.65 * fb(x * 4, y * 4, z * 4, 2));
      if (e < 0.05) c = mix([218, 204, 148], c, e / 0.05);
      return c;
    });
  }
  function cloudTex() {
    return makeTex(TW, TH, function (x, y, z) {
      var a = sstep(0.55, 0.74, fb(x * 2.6, y * 3.4, z * 2.6 + 9, 5));
      return [255, 255, 255, Math.round(a * 235)];
    });
  }
  function marsTex() {
    return makeTex(TW, TH, function (x, y, z) {
      var n = fb(x * 2.4 + 2, y * 2.4, z * 2.4, 5);
      var c = mix([190, 92, 52], [150, 66, 38], sstep(0.4, 0.7, n));
      c = mix(c, [214, 130, 82], sstep(0.62, 0.85, fb(x * 5, y * 5, z * 5 + 4, 3)) * 0.5);
      if (Math.abs(y) + (fb(x * 5, y * 5, z * 5, 3) - 0.5) * 0.1 > 0.94) return [240, 232, 226];
      return c;
    });
  }
  function jupiterTex() {
    return makeTex(1024, 512, function (x, y, z) {
      var w = fb(x * 2.2 + 1, y * 9, z * 2.2, 4);
      var t = Math.sin(y * 16 + (w - 0.5) * 3.4) * 0.5 + 0.5;
      var t2 = fb(x * 1.2, y * 22, z * 1.2, 3);
      var c = mix([158, 100, 64], [214, 160, 108], sstep(0.2, 0.7, t));
      c = mix(c, [240, 222, 190], sstep(0.65, 0.95, t) * 0.9);
      return mix(c, [190, 120, 78], sstep(0.55, 0.8, t2) * 0.35);
    }, function (ctx, w, h) {
      // Большое красное пятно: на u = 0.25 (лицом к камере при старте), широта -22°
      var cx = w * 0.25, cy = h * 0.5 + h * (22 / 180);
      var rx = w * 0.075, ry = h * 0.05;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(rx, ry);
      var g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, 'rgba(176,58,34,1)');
      g.addColorStop(0.55, 'rgba(196,84,52,1)');
      g.addColorStop(0.82, 'rgba(224,150,108,0.95)');
      g.addColorStop(1, 'rgba(224,150,108,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });
  }
  function saturnTex() {
    return makeTex(TW, TH, function (x, y, z) {
      var w = fb(x * 1.5, y * 6, z * 1.5, 3);
      var t = Math.sin(y * 20 + (w - 0.5) * 2.4) * 0.5 + 0.5;
      return mix([206, 172, 108], [240, 218, 160], t);
    });
  }
  function uranusTex() {
    return makeTex(TW, TH, function (x, y, z) {
      var t = Math.sin(y * 9 + fb(x * 2, y * 3, z * 2, 3) * 2) * 0.5 + 0.5;
      return mix([132, 208, 222], [168, 232, 236], t);
    });
  }
  function neptuneTex() {
    return makeTex(TW, TH, function (x, y, z) {
      var w = fb(x * 2, y * 6, z * 2, 4);
      var t = Math.sin(y * 12 + (w - 0.5) * 3) * 0.5 + 0.5;
      return mix([40, 76, 214], [70, 118, 238], t);
    }, function (ctx, w, h) {
      ctx.save();
      ctx.translate(w * 0.3, h * 0.6);
      ctx.scale(w * 0.06, h * 0.04);
      var g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      g.addColorStop(0, 'rgba(16,34,130,0.95)');
      g.addColorStop(1, 'rgba(16,34,130,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });
  }
  function ringTex() {
    var w = 512, h = 4;
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d');
    var img = ctx.createImageData(w, h);
    for (var x = 0; x < w; x++) {
      var t = x / (w - 1);
      var a, col;
      if (t < 0.08) { a = 0; col = [150, 135, 115]; }
      else if (t < 0.22) { a = 0.3; col = [150, 135, 115]; }
      else if (t < 0.55) { a = 0.94; col = [228, 207, 170]; }
      else if (t < 0.61) { a = 0.05; col = [200, 180, 150]; }
      else if (t < 0.86) { a = 0.78; col = [204, 184, 152]; }
      else if (t < 0.885) { a = 0.08; col = [200, 180, 150]; }
      else if (t < 0.97) { a = 0.5; col = [190, 172, 144]; }
      else { a = 0; col = [190, 172, 144]; }
      var stripe = 0.82 + 0.18 * Math.sin(t * 190 + Math.sin(t * 41) * 3);
      var edge = Math.min(sstep(0.0, 0.03, t), 1 - sstep(0.97, 1.0, t));
      for (var y = 0; y < h; y++) {
        var i = (y * w + x) * 4;
        img.data[i] = col[0] * stripe;
        img.data[i + 1] = col[1] * stripe;
        img.data[i + 2] = col[2] * stripe;
        img.data[i + 3] = Math.round(255 * a * stripe * (edge > 0 ? 1 : 0));
      }
    }
    ctx.putImageData(img, 0, 0);
    return new THREE.CanvasTexture(c);
  }

  // ---- Свечение (спрайты) -----------------------------------------------
  function radialTex(stops) {
    var c = document.createElement('canvas');
    c.width = c.height = 256;
    var g = c.getContext('2d');
    var gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    stops.forEach(function (s) { gr.addColorStop(s[0], s[1]); });
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }
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
  var NOISE_GLSL = [
    'vec3 mod289(vec3 x){return x - floor(x * (1.0/289.0)) * 289.0;}',
    'vec4 mod289(vec4 x){return x - floor(x * (1.0/289.0)) * 289.0;}',
    'vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}',
    'vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}',
    'float snoise(vec3 v){',
    '  const vec2 C = vec2(1.0/6.0, 1.0/3.0);',
    '  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);',
    '  vec3 i = floor(v + dot(v, C.yyy));',
    '  vec3 x0 = v - i + dot(i, C.xxx);',
    '  vec3 g = step(x0.yzx, x0.xyz);',
    '  vec3 l = 1.0 - g;',
    '  vec3 i1 = min(g.xyz, l.zxy);',
    '  vec3 i2 = max(g.xyz, l.zxy);',
    '  vec3 x1 = x0 - i1 + C.xxx;',
    '  vec3 x2 = x0 - i2 + C.yyy;',
    '  vec3 x3 = x0 - D.yyy;',
    '  i = mod289(i);',
    '  vec4 p = permute(permute(permute(',
    '            i.z + vec4(0.0, i1.z, i2.z, 1.0))',
    '          + i.y + vec4(0.0, i1.y, i2.y, 1.0))',
    '          + i.x + vec4(0.0, i1.x, i2.x, 1.0));',
    '  float n_ = 0.142857142857;',
    '  vec3 ns = n_ * D.wyz - D.xzx;',
    '  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);',
    '  vec4 x_ = floor(j * ns.z);',
    '  vec4 y_ = floor(j - 7.0 * x_);',
    '  vec4 x = x_ * ns.x + ns.yyyy;',
    '  vec4 y = y_ * ns.x + ns.yyyy;',
    '  vec4 h = 1.0 - abs(x) - abs(y);',
    '  vec4 b0 = vec4(x.xy, y.xy);',
    '  vec4 b1 = vec4(x.zw, y.zw);',
    '  vec4 s0 = floor(b0)*2.0 + 1.0;',
    '  vec4 s1 = floor(b1)*2.0 + 1.0;',
    '  vec4 sh = -step(h, vec4(0.0));',
    '  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;',
    '  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;',
    '  vec3 p0 = vec3(a0.xy, h.x);',
    '  vec3 p1 = vec3(a0.zw, h.y);',
    '  vec3 p2 = vec3(a1.xy, h.z);',
    '  vec3 p3 = vec3(a1.zw, h.w);',
    '  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));',
    '  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;',
    '  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);',
    '  m = m * m;',
    '  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));',
    '}'
  ].join('\n');

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
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function rockGeometry(seed) {
    var g = new THREE.IcosahedronGeometry(1, 1);
    var pos = g.attributes.position, map = {}, rnd = rng(seed);
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      var k = x.toFixed(3) + ',' + y.toFixed(3) + ',' + z.toFixed(3);
      if (map[k] === undefined) map[k] = 0.72 + rnd() * 0.5;
      var s = map[k];
      pos.setXYZ(i, x * s, y * s, z * s);
    }
    g.computeVertexNormals();
    return g;
  }

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

  // ---- Камера и размер ---------------------------------------------------
  var marsCam = null;          // камера подробного Марса (создаётся при первом открытии)
  var onMarsResize = null;
  var renderDirty = true;
  function resize() {
    renderDirty = true;
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, true);
    camera.aspect = w / h;
    var halfH = Math.tan(THREE.MathUtils.degToRad(FOV) / 2) * camera.aspect;
    var dist = FIT_RADIUS / halfH;
    var tilt = THREE.MathUtils.degToRad(TILT_DEG);
    camera.position.set(0, Math.sin(tilt) * dist, Math.cos(tilt) * dist);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    fill.position.copy(camera.position);
    starMat.uniforms.uPR.value = renderer.getPixelRatio();
    if (onMarsResize) onMarsResize(w, h);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---- Подпись Discover над Марсом --------------------------------------
  var vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3();
  function placeTag() {
    var w = window.innerWidth, h = window.innerHeight;
    mars.holder.getWorldPosition(vA);
    var marsZ = vA.z;
    vB.copy(vA).project(camera);
    var mx = (vB.x * 0.5 + 0.5) * w, my = (-vB.y * 0.5 + 0.5) * h;

    vB.set(vA.x, vA.y + mars.def.r * 1.45 + 0.3, vA.z).project(camera);
    var tx = (vB.x * 0.5 + 0.5) * w, ty = (-vB.y * 0.5 + 0.5) * h;
    tag.style.transform = 'translate3d(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px,0) translate(-50%,-100%)';

    // Если Марс прячется за Солнцем, подпись плавно гаснет
    var cx = w / 2, cy = h / 2;
    vC.set(SUN_R, 0, 0).project(camera);
    var sunPx = Math.abs((vC.x * 0.5 + 0.5) * w - cx);
    var dist = Math.hypot(mx - cx, my - cy);
    var op = marsZ < 0 ? clamp01((dist - sunPx * 0.85) / (sunPx * 0.35)) : 1;
    tag.style.opacity = op.toFixed(2);
    tag.style.pointerEvents = op > 0.5 ? 'auto' : 'none';
  }

  // ======================================================================
  //  ПОДРОБНЫЙ МАРС: реальные карты, смещение геометрии, LOD, реальное Солнце
  // ======================================================================
  var HEAVY = !(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  var BASE_PR = renderer.getPixelRatio();
  var MIN_DIST = 1.06, MAX_DIST = 9;
  var EXAG = 1.0;                        // реальный масштаб рельефа (без преувеличения)
  var H_LO = -8.2, H_HI = 21.2;          // диапазон высот MOLA, км
  var D2R = Math.PI / 180;

  var mode = 'system';                   // 'system' | 'mars'
  var transitioning = false;
  var marsScene = null, marsRoot = null, marsSpin = null, marsMat = null;
  var marsAtmoMat = null, marsLight = null;
  var marsMoons = [];
  var geoMeshes = [null, null, null], geoCur = -1;
  var viewMode = 0, gridOn = false;
  var perf = { t: 0, n: 0, warm: 40 };
  var mv = {
    spin: 0, pitch: 0, dist: 12, tSpin: 0, tPitch: 0, tDist: 5, fit: 5,
    fly: false, auto: true, dragging: false, vSpin: 0, vPitch: 0, userZoomed: false
  };
  var sunInfo = { lonE: 0, lat: 0, Ls: 0, mtc: 0 };
  var sunObj = new THREE.Vector3(1, 0, 0), sunWorld = new THREE.Vector3(1, 0, 0);
  var tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpW = new THREE.Vector3(), tmpC = new THREE.Vector3();
  var uiTimer = 0;

  var veil = document.getElementById('veil');
  var SPACE_FACTS = ["A day on Mars lasts 24 h 37 min — a sol is only about 39 minutes longer than an Earth day.", "Olympus Mons on Mars is about 22 km high — nearly two and a half times taller than Everest.", "Sunsets on Mars glow blue: fine dust scatters red light away from the Sun and leaves a cool halo around it.", "A teaspoon of neutron-star material would weigh about a billion tonnes.", "Venus spins backwards, and one Venus day is longer than its year.", "There are more stars in the observable universe than grains of sand on all of Earth's beaches.", "Light from the Sun takes about 8 minutes and 20 seconds to reach Earth — and 12 or so minutes to reach Mars.", "Saturn is so light for its size that, on average, it is less dense than water.", "Footprints left on the Moon by Apollo astronauts can last for millions of years — there's no wind to erase them.", "Valles Marineris on Mars is about 4,000 km long — as wide as the whole United States.", "Jupiter's Great Red Spot is a storm wider than Earth that has been raging for at least 150 years.", "In space, two pieces of the same metal can fuse together if they touch — a vacuum-welding effect known as cold welding.", "Mars has the biggest dust storms in the Solar System; some wrap the whole planet for weeks.", "Mars' moon Phobos is slowly spiralling inward and will break apart or crash in roughly 50 million years.", "A year on Mercury is just 88 Earth days, yet one Mercury day lasts about 176.", "Neutron stars can spin hundreds of times per second.", "Mars gravity is only 38% of Earth's: a 70 kg person would feel like 27 kg.", "The Sun makes up about 99.86% of all the mass in our Solar System.", "Mars' thin atmosphere is about 95% carbon dioxide, with a surface pressure under 1% of Earth's.", "The coldest natural place known in the universe is the Boomerang Nebula, at about −272 °C.", "Mars has two tiny moons, Phobos and Deimos, that look like potatoes rather than spheres.", "The Voyager 1 probe, launched in 1977, is still sending data from interstellar space.", "Gale Crater, where the Curiosity rover works, holds a 5 km-high mountain of layered rock called Mount Sharp.", "If you could drive a car to the Sun at highway speed, the trip would take over 150 years.", "Mars rocks look red because of iron oxide — essentially rust.", "Ingenuity, the first aircraft to fly on another planet, made 72 flights on Mars.", "One million Earths could fit inside the Sun.", "Mars' north-polar region has a dune field with ice-capped layers up to 3 km thick."];
  var factEl = document.getElementById('ld-fact');
  function showFact() {
    var last = -1;
    try { last = +(localStorage.getItem('lastFact') || -1); } catch (e) {}
    var i;
    do { i = Math.floor(Math.random() * SPACE_FACTS.length); } while (i === last && SPACE_FACTS.length > 1);
    try { localStorage.setItem('lastFact', String(i)); } catch (e) {}
    factEl.textContent = SPACE_FACTS[i];
  }

  var marsUI = document.getElementById('mars-ui');
  var marsBack = document.getElementById('mars-back');
  var marsNav = document.getElementById('mars-nav');
  var poiList = document.getElementById('poi-list');
  var ovLoadingEl = document.getElementById('ov-loading');
  var btnLayout = document.getElementById('btn-layout');
  var layoutPop = document.getElementById('layout-pop');
  var btnGrid = document.getElementById('btn-grid');
  var sectorEl = document.getElementById('mars-sector');
  var btnZoomIn = document.getElementById('zoom-in');
  var btnZoomOut = document.getElementById('zoom-out');
  var legendEl = document.getElementById('legend');
  var legendBar = document.getElementById('legend-bar');
  var legendTicks = document.getElementById('legend-ticks');
  var sunEl = document.getElementById('mars-sun');
  var lodEl = document.getElementById('mars-lod');
  var labelsEl = document.getElementById('mars-labels');

  // ---- Палитра высот (км → цвет); по ней же декодирована карта высот ----
  var ELEV_RAMP = [
    [-8.2, [110, 60, 175]], [-7.3, [90, 62, 190]], [-6.3, [62, 66, 200]], [-5.3, [50, 73, 203]],
    [-4.7, [52, 100, 208]], [-4.1, [50, 150, 215]], [-3.7, [60, 205, 205]], [-3.4, [72, 214, 147]],
    [-1.4, [100, 214, 100]], [0.9, [123, 213, 80]], [2.2, [200, 215, 85]], [3.2, [232, 205, 95]],
    [4.0, [235, 178, 97]], [6.0, [230, 161, 126]], [8.5, [204, 147, 133]], [11.0, [217, 173, 163]],
    [15.0, [230, 201, 195]], [20.0, [232, 228, 226]], [21.2, [245, 245, 245]]
  ];
  var K_LO = 140, K_HI = 315;            // шкала температур, К
  var TEMP_RAMP = [
    [140, [60, 20, 110]], [165, [45, 50, 190]], [190, [40, 120, 220]], [210, [50, 190, 200]],
    [228, [90, 205, 120]], [245, [175, 215, 70]], [260, [240, 210, 60]], [275, [245, 150, 45]],
    [292, [225, 70, 40]], [315, [255, 190, 160]]
  ];
  function rampAt(h) { return rampFrom(ELEV_RAMP, h); }
  function rampFrom(R, h) {
    for (var i = 1; i < R.length; i++) {
      if (h <= R[i][0]) {
        var a = R[i - 1], b = R[i];
        var t = clamp01((h - a[0]) / (b[0] - a[0]));
        return [a[1][0] + (b[1][0] - a[1][0]) * t, a[1][1] + (b[1][1] - a[1][1]) * t, a[1][2] + (b[1][2] - a[1][2]) * t];
      }
    }
    return R[R.length - 1][1];
  }
  function makeRampTexture(tab, lo, hi) {
    tab = tab || ELEV_RAMP; lo = (lo === undefined) ? H_LO : lo; hi = (hi === undefined) ? H_HI : hi;
    var c = document.createElement('canvas');
    c.width = 256; c.height = 1;
    var g = c.getContext('2d');
    var img = g.createImageData(256, 1);
    for (var i = 0; i < 256; i++) {
      var col = rampFrom(tab, lo + (hi - lo) * i / 255);
      img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1]; img.data[i * 4 + 2] = col[2]; img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    var t = new THREE.CanvasTexture(c);
    t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = false;
    t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  }
  function buildLegend(m) {
    m = m || 1;
    var tab = m === 2 ? TEMP_RAMP : ELEV_RAMP, lo = m === 2 ? K_LO : H_LO, hi = m === 2 ? K_HI : H_HI;
    var stops = tab.map(function (st) {
      return 'rgb(' + st[1].join(',') + ') ' + (((st[0] - lo) / (hi - lo)) * 100).toFixed(1) + '%';
    });
    legendBar.style.background = 'linear-gradient(90deg,' + stops.join(',') + ')';
    legendTicks.innerHTML = '';
    var ticks = m === 2 ? [-120, -90, -60, -30, 0, 30] : [-8, -4, 0, 4, 8, 12, 16, 20];
    ticks.forEach(function (v) {
      var x = m === 2 ? v + 273.15 : v;
      var el = document.createElement('span');
      el.className = 'legend-tick';
      el.style.left = (((x - lo) / (hi - lo)) * 100).toFixed(2) + '%';
      el.textContent = (v < 0 ? '−' : v > 0 ? '+' : '') + Math.abs(v);
      legendTicks.appendChild(el);
    });
    var tt = legendEl.querySelector('.legend-title');
    if (m === 2) {
      tt.textContent = 'Surface temperature, °C (modelled, live)';
    } else {
      tt.textContent = 'Elevation above the Mars datum, km';
    }
  }
  buildLegend();

  // ---- Положение Солнца над Марсом (Allison & McEwen, Mars24) -----------
  function marsSolar(ms) {
    var jd = ms / 86400000 + 2440587.5;
    var jdtt = jd + 69.184 / 86400;
    var dj = jdtt - 2451545.0;
    var M = (19.3871 + 0.52402073 * dj) % 360;
    var afms = (270.3871 + 0.524038496 * dj) % 360;
    var A = [0.0071, 0.0057, 0.0039, 0.0037, 0.0021, 0.0020, 0.0018];
    var T = [2.2353, 2.7543, 1.1177, 15.7866, 2.1354, 2.4694, 32.8493];
    var P = [49.409, 168.173, 191.837, 21.736, 15.704, 95.528, 49.095];
    var pbs = 0;
    for (var i = 0; i < 7; i++) pbs += A[i] * Math.cos((0.985626 * dj / T[i] + P[i]) * D2R);
    var Mr = M * D2R;
    var nuM = (10.691 + 3.0e-7 * dj) * Math.sin(Mr) + 0.623 * Math.sin(2 * Mr) + 0.050 * Math.sin(3 * Mr) +
      0.005 * Math.sin(4 * Mr) + 0.0005 * Math.sin(5 * Mr) + pbs;
    var Ls = (afms + nuM) % 360; if (Ls < 0) Ls += 360;
    var Lsr = Ls * D2R;
    var eot = 2.861 * Math.sin(2 * Lsr) - 0.071 * Math.sin(4 * Lsr) + 0.002 * Math.sin(6 * Lsr) - nuM;
    var msd = (jdtt - 2451549.5) / 1.0274912517 + 44796.0 - 0.0009626;
    var mtc = (24 * msd) % 24; if (mtc < 0) mtc += 24;
    var lonW = 15 * (mtc - 12) + eot;
    var lonE = (((-lonW) % 360) + 540) % 360 - 180;
    var dec = Math.asin(0.42565 * Math.sin(Lsr)) / D2R + 0.25 * Math.sin(Lsr);
    return { lonE: lonE, lat: dec, Ls: Ls, mtc: mtc };
  }
  function updateSun() {
    sunInfo = marsSolar(Date.now());
    var la = sunInfo.lat * D2R, lo = sunInfo.lonE * D2R;
    sunObj.set(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo));
  }
  updateSun();

  // ---- Шейдеры ------------------------------------------------------------
  var MARS_COMMON = NOISE_GLSL + `
vec3 hash33(vec3 p3){
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}
const float PI = 3.14159265359;
const float TWO_PI = 6.28318530718;
const float H_MIN = -9.0;
const float H_RNG = 31.0;
const float R_KM = 3389.5;
uniform sampler2D uHeight;
uniform vec2 uRes;
uniform float uExag;
float dec16(vec4 t){ return (t.r * 255.0 * 256.0 + t.g * 255.0) / 65535.0 * H_RNG + H_MIN; }
uniform sampler2D uDetH;
uniform sampler2D uDetC;
uniform sampler2D uElev;     // тайлы Mars Trek (раскраска высот) для режима Layout → Elevation
uniform sampler2D uDetE;
uniform float uElevOn;
uniform float uDetEOn;
uniform float uDetHOn;   // 0: высоты окна не используются (высоты — только вшитая карта)
uniform vec4 uDetRect;   // u0, v0, du, dv внутренней области тайла
uniform float uDetOn;
const float DET_N = 1024.0;
const float DET_P = 64.0;
const float DET_T = 1152.0;
// положение в окне тайла: xy = координата текстуры, z = вес (1 внутри, к 0 на 16-пикс. кромке)
vec3 detCoord(vec2 uv){
  if(uDetOn < 0.5) return vec3(0.0);
  vec2 p = (uv - uDetRect.xy) / uDetRect.zw * DET_N;
  float e = max(max(-p.x, p.x - DET_N), max(-p.y, p.y - DET_N));
  float w = clamp(1.0 - e / DET_P, 0.0, 1.0);
  w = w * w * (3.0 - 2.0 * w);
  return vec3((p + DET_P) / DET_T, w);
}
#ifdef H_SMOOTH
float gCub = 0.0;   // 1 вблизи (бикубика Catmull-Rom), 0 вдали (билинейная)
vec4 crW(float f){
  float f2 = f * f, f3 = f2 * f;
  return vec4(-0.5 * f3 + f2 - 0.5 * f, 1.5 * f3 - 2.5 * f2 + 1.0, -1.5 * f3 + 2.0 * f2 + 0.5 * f, 0.5 * f3 - 0.5 * f2);
}
#endif
float detHIF(vec2 i0, vec2 f){
  vec2 a0 = clamp(i0 + 0.5, 0.5, DET_T - 0.5) / DET_T;
  vec2 a1 = clamp(i0 + 1.5, 0.5, DET_T - 0.5) / DET_T;
  float a = dec16(texture2D(uDetH, vec2(a0.x, a0.y)));
  float b = dec16(texture2D(uDetH, vec2(a1.x, a0.y)));
  float c = dec16(texture2D(uDetH, vec2(a0.x, a1.y)));
  float d = dec16(texture2D(uDetH, vec2(a1.x, a1.y)));
  float bl = mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
#ifdef H_SMOOTH
  if(gCub > 0.001){
    vec4 wx = crW(f.x), wy = crW(f.y);
    float acc = 0.0;
    for(int j = 0; j < 4; j++){
      float fy = clamp(i0.y + float(j) - 0.5, 0.5, DET_T - 0.5) / DET_T;
      float row = 0.0;
      for(int i = 0; i < 4; i++){
        float fx = clamp(i0.x + float(i) - 0.5, 0.5, DET_T - 0.5) / DET_T;
        row += dec16(texture2D(uDetH, vec2(fx, fy))) * wx[i];
      }
      acc += row * wy[j];
    }
    return mix(bl, acc, gCub);
  }
#endif
  return bl;
}
float detH(vec2 tuv){
  vec2 st = tuv * DET_T - 0.5;
  vec2 i0 = floor(st);
  return detHIF(i0, st - i0);
}
float hBase(vec2 uv);
float hKm(vec2 uv){
  float hb = hBase(uv);
  vec3 dc = detCoord(uv);
  if(dc.z <= 0.0 || uDetHOn < 0.5) return hb;
  return mix(hb, detH(dc.xy), dc.z);
}
vec3 elevAt(vec2 uv){
  vec3 cb = texture2D(uElev, uv).rgb;
  vec3 dc = detCoord(uv);
  if(dc.z <= 0.0 || uDetEOn < 0.5) return cb;
  return mix(cb, texture2D(uDetE, dc.xy).rgb, dc.z);
}
vec3 colAt(sampler2D base, vec2 uv){
  vec3 cb = texture2D(base, uv).rgb;
  vec3 dc = detCoord(uv);
  if(dc.z <= 0.0) return cb;
  return mix(cb, texture2D(uDetC, dc.xy).rgb, dc.z);
}
float hBaseIF(vec2 i0, vec2 f){
  float x0 = (i0.x + 0.5) / uRes.x;
  float x1 = (i0.x + 1.5) / uRes.x;
  float y0 = clamp(i0.y + 0.5, 0.5, uRes.y - 0.5) / uRes.y;
  float y1 = clamp(i0.y + 1.5, 0.5, uRes.y - 0.5) / uRes.y;
  float a = dec16(texture2D(uHeight, vec2(x0, y0)));
  float b = dec16(texture2D(uHeight, vec2(x1, y0)));
  float c = dec16(texture2D(uHeight, vec2(x0, y1)));
  float d = dec16(texture2D(uHeight, vec2(x1, y1)));
  float bl = mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
#ifdef H_SMOOTH
  if(gCub > 0.001){
    vec4 wx = crW(f.x), wy = crW(f.y);
    float acc = 0.0;
    for(int j = 0; j < 4; j++){
      float fy = clamp(i0.y + float(j) - 0.5, 0.5, uRes.y - 0.5) / uRes.y;
      float row = 0.0;
      for(int i = 0; i < 4; i++){
        float fx = (i0.x + float(i) - 0.5) / uRes.x;
        row += dec16(texture2D(uHeight, vec2(fx, fy))) * wx[i];
      }
      acc += row * wy[j];
    }
    return mix(bl, acc, gCub);
  }
#endif
  return bl;
}
float hBase(vec2 uv){
  vec2 st = uv * uRes - 0.5;
  vec2 i0 = floor(st);
  return hBaseIF(i0, st - i0);
}
#ifdef PREC
uniform vec4 uP0;   // наблюдатель в текселях базовой карты: (целая x, y, дробная x, y)
uniform vec4 uD0;   // то же для окна детализации (в пикселях окна без кромки)
uniform vec2 uObsLL;
// высота в точке q (км от наблюдателя) с точной адресацией: смещение считается отдельно от больших координат
float hKmS(vec2 q){
  vec2 uo = vec2(q.x / (R_KM * max(cos(uObsLL.y), 0.05) * 6.28318530718), q.y / (R_KM * 3.14159265359));
  vec2 sb = uP0.zw + uo * uRes - 0.5;
  vec2 fb = floor(sb);
  float hb = hBaseIF(uP0.xy + fb, sb - fb);
  if(uDetOn < 0.5 || uDetHOn < 0.5) return hb;
  vec2 pd = uD0.zw + uo / uDetRect.zw * DET_N;
  vec2 pp = uD0.xy + pd;
  float e = max(max(-pp.x, pp.x - DET_N), max(-pp.y, pp.y - DET_N));
  float w = clamp(1.0 - e / DET_P, 0.0, 1.0);
  if(w <= 0.0) return hb;
  w = w * w * (3.0 - 2.0 * w);
  vec2 sd = pd + (DET_P - 0.5);
  vec2 fd = floor(sd);
  return mix(hb, detHIF(uD0.xy + fd, sd - fd), w);
}
#endif
`;

  var MARS_VERT = MARS_COMMON + `
varying vec2 vUv;
varying vec3 vDir;
varying vec3 vViewPos;
varying vec3 vNormalV;
void main(){
  vUv = uv;
  vec3 dir = normalize(position);
  vDir = dir;
  float h = hKm(uv);
  float r = 1.0 + uExag * h / R_KM;
  vec4 mvp = modelViewMatrix * vec4(dir * r, 1.0);
  vViewPos = mvp.xyz;
  vNormalV = normalize(normalMatrix * dir);
  gl_Position = projectionMatrix * mvp;
}
`;

  var MARS_FRAG = `
uniform sampler2D uColor;
uniform sampler2D uRamp;
uniform sampler2D uRampT;
uniform vec3 uSunLagObj;
uniform float uFlux;
uniform vec3 uSunObj;
uniform float uMode;
uniform float uBlank;   // 1: слой Layout ещё грузится — сфера чёрная
uniform float uGrid;
uniform vec4 uHome;   // lon0, lon1, lat0, lat1 домашнего сектора
uniform vec4 uCell;   // lon0, lon1, lat0, lat1 (градусы) подсвеченного сектора
varying vec2 vUv;
varying vec3 vDir;
varying vec3 vViewPos;
varying vec3 vNormalV;
` + MARS_COMMON + `
float sq(float x){ return x * x; }

vec2 craterLayer(vec3 p, float scale, float density, float fp){
  float lod = 1.0 - smoothstep(0.10, 0.32, fp * scale);
  if(lod < 0.01) return vec2(0.0);
  vec3 q = p * scale;
  vec3 ip = floor(q);
  vec3 fq = q - ip;
  float h = 0.0;
  for(int z = -1; z <= 1; z++){
    for(int y = -1; y <= 1; y++){
      for(int x = -1; x <= 1; x++){
        vec3 g = vec3(float(x), float(y), float(z));
        vec3 id = ip + g;
        vec3 r2 = hash33(id + 17.31);
        if(r2.x > density) continue;
        vec3 r1 = hash33(id);
        vec3 cv = g + r1 - fq;
        float rad = mix(0.12, 0.46, r2.y * r2.y);
        float t = length(cv) / rad;
        if(t > 1.7) continue;
        float b = (t < 1.0) ? (1.0 - t * t) : 0.0;
        float bowl = -smoothstep(0.0, 0.7, b);
        float e = (t - 1.0) * 5.0;
        float rimv = exp(-e * e) * 0.5;
        float depth = (rad / scale) * (0.45 + 0.5 * r2.z);
        h += (bowl * 0.9 + rimv) * depth;
      }
    }
  }
  return vec2(h * lod, lod);
}

float gridLine(float x, float spacing, float fw){
  float d = abs(fract(x / spacing + 0.5) - 0.5) * spacing;
  float a = 1.0 - smoothstep(0.0, fw * 1.1, d);
  float fade = 1.0 - smoothstep(0.12 * spacing, 0.35 * spacing, fw);
  return a * fade;
}

void main(){
  float lon = (vUv.x - 0.5) * TWO_PI;
  float lat = (vUv.y - 0.5) * PI;
  float sl = sin(lat), cl = cos(lat), so = sin(lon), co = cos(lon);
  vec3 Nn = vec3(cl * co, sl, -cl * so);
  vec3 E = vec3(-so, 0.0, -co);
  vec3 Nr = vec3(-sl * co, cl, sl * so);
  vec3 L = normalize(uSunObj);

  float h0 = hKm(vUv);

  // texel step grows with pixel footprint, so distant relief does not sparkle
  float texPerPx = fwidth(vUv.x) * uRes.x;
  float kMin = 1.7 - 0.8 * detCoord(vUv).z;   // в окне 8K-тайла шаг для нормалей мельче
  float k = clamp(texPerPx * 0.8, kMin, 12.0);
  float du = k / uRes.x;
  float dv = k / uRes.y;
  float hE = hKm(vUv + vec2(du, 0.0));
  float hW = hKm(vUv - vec2(du, 0.0));
  float hN = hKm(vUv + vec2(0.0, dv));
  float hS = hKm(vUv - vec2(0.0, dv));
  float arcE = max(cl, 0.04) * TWO_PI / uRes.x * 2.0 * k;
  float arcN = PI / uRes.y * 2.0 * k;
  float sE = 0.6 * uExag * (hE - hW) / R_KM / arcE;
  float sN = 0.6 * uExag * (hN - hS) / R_KM / arcN;
  vec3 N = normalize(Nn - sE * E - sN * Nr);

  // fine procedural craters appear only when the camera is close
  float fp = length(fwidth(vDir));
  vec2 mc = vec2(0.0);   // реальные кратеры уже есть в карте высот: процедурные кольца убраны
  float rough = snoise(normalize(vDir) * 1400.0) * (1.0 - smoothstep(0.15, 0.4, fp * 1400.0));
  // дополнительная «апскейл»-детализация при сильном приближении: мелкий рельеф и зерно, привязанные к размеру пикселя
  float w1 = 1.0 - smoothstep(0.15, 0.4, fp * 3500.0);
  float w2 = 1.0 - smoothstep(0.15, 0.4, fp * 9000.0);
  float n1 = 0.0, n2 = 0.0;
  if(w1 > 0.0) n1 = snoise(normalize(vDir) * 3500.0) * w1;
  if(w2 > 0.0) n2 = snoise(normalize(vDir) * 9000.0 + 17.0) * w2;
  float micro = (mc.x * 1.1 + 0.000015 * rough + 0.000008 * n1 + 0.0000035 * n2);
  vec3 sx = dFdx(vDir);
  vec3 sy = dFdy(vDir);
  float dBx = dFdx(micro);
  float dBy = dFdy(micro);
  vec3 r1 = cross(sy, N);
  vec3 r2 = cross(N, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (dBx * r1 + dBy * r2);
  N = normalize(abs(det) * N - grad);

  // albedo
  vec3 albedo;
  if(uMode < 0.5){
    albedo = colAt(uColor, vUv) * (1.0 + 0.10 * n1 + 0.06 * n2);
  } else if(uMode < 1.5){
    float t = clamp((h0 - (-8.2)) / 29.4, 0.0, 1.0);
    albedo = texture2D(uRamp, vec2(t, 0.5)).rgb;
    // карта высот Layout → Elevation: тайлы Mars Trek (MOLA ClrShade) с пирамидой LOD, если они загружены
    if(uElevOn > 0.5) albedo = elevAt(vUv);
  } else if(uMode > 2.5){
    // слои Mars Trek (Roughness, Dust, Plagioclase, Glass/Clay, Thermal Inertia)
    albedo = (uElevOn > 0.5) ? elevAt(vUv) : colAt(uColor, vUv) * 0.7;   // слой не загрузился — показываем обычный цвет
  } else {
    // модель температуры поверхности: инсоляция с тепловой задержкой + суточное среднее
    vec3 cc = pow(colAt(uColor, vUv), vec3(2.2));
    float A = clamp(0.08 + dot(cc, vec3(0.3, 0.59, 0.11)) * 0.55, 0.08, 0.36);
    vec3 Ll = normalize(uSunLagObj);
    float cz = max(dot(Nn, Ll), 0.0);
    float sinD = Ll.y;
    float cosD = sqrt(max(1.0 - sinD * sinD, 1e-4));
    float cH = clamp(-(sl / max(cl, 0.02)) * (sinD / cosD), -1.0, 1.0);
    float H0 = acos(cH);
    float Q = max(uFlux / PI * (H0 * sl * sinD + cl * cosD * sin(H0)), 0.0);
    float kk = (1.0 - A) / (0.98 * 5.67e-8);
    float Tm = pow(Q * kk, 0.25);
    float Tn = 0.80 * Tm;
    float Te = pow(cz * uFlux * kk, 0.25);
    float T = pow(Tn * Tn * Tn * Tn + 0.93 * Te * Te * Te * Te, 0.25);
    T = clamp(T, 148.0, 318.0);
    albedo = texture2D(uRampT, vec2(clamp((T - 140.0) / 175.0, 0.0, 1.0), 0.5)).rgb;
  }
  if(uBlank > 0.5) albedo = vec3(0.0);
  albedo = pow(albedo, vec3(2.2));

  // sun: terminator from the sphere, relief shadows by marching the height map
  float geo = dot(Nn, L);
  float ndl = max(dot(N, L), 0.0);
  float term = smoothstep(-0.06, 0.18, geo);
  float shadow = 1.0;
#if SHADOW_STEPS > 0
  float sunUp = dot(L, Nn);
  vec2 hz = vec2(dot(L, E), dot(L, Nr));
  float hl = length(hz);
  if(sunUp > 0.02 && hl > 1e-4 && fp < 0.006){
    vec2 sd = hz / hl;
    float tanEl = sunUp / hl;
    float base = uExag * h0 / R_KM;
    float s = 0.0006;
    for(int i = 0; i < SHADOW_STEPS; i++){
      vec2 off = vec2(s * sd.x / (max(cl, 0.04) * TWO_PI), s * sd.y / PI);
      float hr = uExag * hKm(vUv + off) / R_KM - base;
      float d = hr - 0.5 * s * s - s * tanEl;
      shadow = min(shadow, 1.0 - smoothstep(0.0, 0.003 + 0.06 * s, d));
      s *= 1.32;
    }
  }
#endif
  float amb = (uMode < 0.5) ? 0.012 : 0.05;
  vec3 sunC = vec3(1.0, 0.93, 0.82) * 2.2;
  vec3 lit = albedo * (vec3(amb, amb * 1.1, amb * 1.6) + sunC * ndl * term * mix(0.65, 1.0, shadow));
#ifdef FLAT
  lit = albedo * (0.80 + 0.45 * ndl);   // плоская карта: ровный свет с мягким рельефом, без ночной стороны
#endif
  if(uMode > 1.5) lit = albedo * (0.62 + 0.38 * ndl) * 1.1;

  // thin atmosphere: faint warm haze on the lit limb, cool tint at sunset
  vec3 N0 = normalize(vNormalV);
  vec3 V = normalize(-vViewPos);
  float fr = pow(1.0 - clamp(dot(N0, V), 0.0, 1.0), 3.0);
  float dayAmt = clamp(geo + 0.2, 0.0, 1.0);
  lit += vec3(0.75, 0.40, 0.25) * fr * dayAmt * 0.14;
  float sunset = exp(-sq((geo - 0.03) * 7.0));
  lit += vec3(0.10, 0.18, 0.40) * sunset * fr * 0.35;

  lit = vec3(1.0) - exp(-lit * 1.25);
  lit = pow(lit, vec3(1.0 / 2.2));

  if(uGrid > 0.5){
    float lonD = (vUv.x - 0.5) * 360.0;
    float latD = (vUv.y - 0.5) * 180.0;
    float fwLon = fwidth(lonD);
    float fwLat = fwidth(latD);
    float poleF = 1.0 - smoothstep(78.0, 88.0, abs(latD));
    float g = gridLine(lonD, 30.0, fwLon) * poleF * 0.9;
    g = max(g, gridLine(latD, 30.0, fwLat) * 0.9);
    g = max(g, gridLine(lonD, 10.0, fwLon) * poleF * 0.45);
    g = max(g, gridLine(latD, 10.0, fwLat) * 0.45);
    g = max(g, gridLine(lonD, 2.0, fwLon) * poleF * 0.25);
    g = max(g, gridLine(latD, 2.0, fwLat) * 0.25);
    lit = mix(lit, vec3(0.82, 0.92, 1.0), clamp(g, 0.0, 1.0) * 0.75);
    // подсветка сектора, на который смотрим
    if(uCell.y > uCell.x){
      float inLon = step(uCell.x, lonD) * step(lonD, uCell.y);
      float inLat = step(uCell.z, latD) * step(latD, uCell.w);
      float inC = inLon * inLat;
      float dLon = min(abs(lonD - uCell.x), abs(lonD - uCell.y));
      float dLat = min(abs(latD - uCell.z), abs(latD - uCell.w));
      float eLon = (1.0 - smoothstep(0.0, 2.2 * fwLon, dLon)) * step(uCell.z - fwLat, latD) * step(latD, uCell.w + fwLat);
      float eLat = (1.0 - smoothstep(0.0, 2.2 * fwLat, dLat)) * step(uCell.x - fwLon, lonD) * step(lonD, uCell.y + fwLon);
      float edge = clamp(eLon + eLat, 0.0, 1.0);
      lit = mix(lit, vec3(1.0, 0.72, 0.50), inC * 0.13);
      lit = mix(lit, vec3(1.0, 0.62, 0.36), edge * 0.9);
    }
  }
  if(uHome.y > uHome.x){
    float lonH = (vUv.x - 0.5) * 360.0;
    float latH = (vUv.y - 0.5) * 180.0;
    float fwo = max(fwidth(lonH), 1e-5);
    float fwa = max(fwidth(latH), 1e-5);
    float inH = step(uHome.x, lonH) * step(lonH, uHome.y) * step(uHome.z, latH) * step(latH, uHome.w);
    float dxx = min(abs(lonH - uHome.x), abs(lonH - uHome.y));
    float dyy = min(abs(latH - uHome.z), abs(latH - uHome.w));
    float eo = (1.0 - smoothstep(0.0, 2.6 * fwo, dxx)) * step(uHome.z - fwa, latH) * step(latH, uHome.w + fwa);
    float ea = (1.0 - smoothstep(0.0, 2.6 * fwa, dyy)) * step(uHome.x - fwo, lonH) * step(lonH, uHome.y + fwo);
    float edgeH = clamp(eo + ea, 0.0, 1.0);
    float glow = inH * 0.6;
    float dOut = max(max(uHome.x - lonH, lonH - uHome.y) / fwo, max(uHome.z - latH, latH - uHome.w) / fwa);
    float halo = (1.0 - inH) * exp(-max(dOut, 0.0) / 5.0) * 0.55;
    vec3 pink = vec3(1.0, 0.25, 0.82);
    lit = mix(lit, pink, halo);
    lit = mix(lit, pink, inH * 0.14 + glow * 0.22);
    lit = mix(lit, pink, edgeH * 0.95);
  }
  gl_FragColor = vec4(lit, 1.0);
}
`;

  var MARS_ATMO_VERT = `
varying vec3 vN;
varying vec3 vV;
void main(){
  vN = normalize(normalMatrix * normal);
  vec4 mvp = modelViewMatrix * vec4(position, 1.0);
  vV = normalize(-mvp.xyz);
  gl_Position = projectionMatrix * mvp;
}
`;
  var MARS_ATMO_FRAG = `
uniform vec3 uSun;
varying vec3 vN;
varying vec3 vV;
void main(){
  float f = clamp(-dot(vN, vV) / 0.42, 0.0, 1.0);
  float inten = pow(f, 3.5);
  float ndl = dot(normalize(vN), normalize(uSun));
  float litAmt = smoothstep(-0.3, 0.55, ndl);
  float sunset = exp(-((ndl - 0.05) * 5.0) * ((ndl - 0.05) * 5.0));
  vec3 col = mix(vec3(0.95, 0.52, 0.30), vec3(0.40, 0.58, 1.0), sunset * 0.7);
  gl_FragColor = vec4(col, inten * litAmt * 0.55);
}
`;

  function moonGeometry(seed) {
    var g = new THREE.IcosahedronGeometry(1, 2);
    var pos = g.attributes.position, map = {}, rnd = rng(seed);
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      var k = x.toFixed(3) + ',' + y.toFixed(3) + ',' + z.toFixed(3);
      if (map[k] === undefined) map[k] = 0.88 + rnd() * 0.22;
      var s = map[k];
      pos.setXYZ(i, x * s, y * s, z * s);
    }
    g.computeVertexNormals();
    return g;
  }

  // ---- Уровни детализации: текстуры и сетка --------------------------------
  // ============================ ТАЙЛОВАЯ СИСТЕМА ТЕКСТУР ============================
  // Файлов с текстурами в проекте нет: всё берётся из тайловой пирамиды по URL-шаблону.
  // Если тайл не найден — на его месте заглушка (однотонный цвет / плоская высота 0 км), ошибок нет.
  //
  // Схема тайлов — как в WMTS (GoogleCRS84Quad / equirectangular, lon −180…180, lat 90…−90):
  //   zoom 0  : 2 тайла по горизонтали × 1 по вертикали   (весь Марс = 2 тайла)
  //   zoom z  : 2^(z+1) колонок × 2^z рядов;  row 0 — северный ряд, col 0 — западный (−180°)
  //   каждый тайл — квадрат tileSize × tileSize px
  //
  // ЧТО ПОДСТАВИТЬ: два шаблона URL. Допустимые заменители:
  //   {z} или {TileMatrix}   — номер уровня        {row} или {TileRow} — ряд      {col} или {TileCol} — колонка
  //   {Style} и {TileMatrixSet} подставляются из полей style / matrixSet (если нужен WMTS Mars Trek).
  // Примеры:
  //   свои файлы:  'tiles/color/{z}/{row}/{col}.jpg'
  //   Mars Trek :  TREK + '/<ИмяСлоя>/1.0.0/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.png'
  //     (для Trek: style='default', matrixSet='default028mm', сверьте с WMTSCapabilities.xml слоя;
  //      сервер должен отдавать заголовок Access-Control-Allow-Origin, иначе браузер не даст
  //      использовать картинки как текстуры; а внутри Claude-артефакта внешние картинки блокируются —
  //      размещайте html на своём хостинге).
  // Mars Trek не отдаёт заголовок CORS, поэтому браузер блокирует его тайлы при прямой загрузке.
  // Запустите server.py из папки с этим файлом (python3 server.py) и откройте http://localhost:8000/ — он проксирует /trek/… на trek.nasa.gov и добавляет CORS.
  var TREK = (location.hostname === 'localhost' || location.hostname === '127.0.0.1') ? '/trek' : 'https://trek.nasa.gov/tiles/Mars/EQ';
  var TILES = {
    // [ТЕКСТУРА: ЦВЕТ] RGB-тайлы (JPG/PNG), например мозаика Viking MDIM 2.1
    // Mars Trek, мозаика Viking MDIM 2.1 (цветная, 232 м/px). Zoom 0 = 2 тайла: .../default028mm/0/0/0.jpg и .../0/0/1.jpg
    color:  { url: TREK + '/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.jpg',
              style: 'default', matrixSet: 'default028mm', zMax: 8 },
    // [ТЕКСТУРА: ВЫСОТЫ] Локальная пирамида тайлов высот, собранная из Mars_MGS_MOLA_ClrShade_merge_global_463m (папка tiles/height).
    //   тайлы 1024×1024 px, 16 бит в PNG: R = старший байт, G = младший;  км = (R*256+G)/65535*31 − 9
    //   zoom 0 = 2×1 тайла (2048×1024 px), zoom 1 = 4×2, 2 = 8×4, 3 = 16×8 (16384×8192 px ≈ 1.3 км/px). Грузятся только видимые тайлы.
    //   Чтобы вернуться к цветной раскраске Mars Trek, поставьте url из закомментированной строки ниже и decode: 'clrshade', tileSize: 256, zMax: 7, smooth: 2.0.
    //   url: TREK + '/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.jpg'
    height: { url: 'tiles/height/{z}/{row}/{col}.png', style: 'default', matrixSet: 'default028mm', decode: 'dem16', tileSize: 1024, zMax: 3, smooth: 0.7 },
    // Цвет для Layout → Elevation (раскраска высот MOLA ClrShade, Mars Trek)
    elevColor: { url: TREK + '/Mars_MGS_MOLA_ClrShade_merge_global_463m/1.0.0/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.jpg', style: 'default', matrixSet: 'default028mm', zMax: 7 },
    tileSize: 256,    // px одного тайла цвета (Mars Trek default028mm = 256)
    zMax: 8,          // самый глубокий уровень среди слоёв; у каждого слоя свой zMax (проверьте в WMTSCapabilities.xml)
    zSurface: 8,      // уровень в режиме «человечек» — максимум из доступного (слой с меньшим zMax растягивается)
    zPlanetMax: 7,    // максимум для вида планеты с орбиты
    // Слои для Layout (Mars Trek, PNG-тайлы 256 px). zMax — самый глубокий уровень на сервере (сверьте в WMTSCapabilities.xml)
    overlays: {
      rough: { url: TREK + '/mola_roughness/1.0.0/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.png',      style: 'default', matrixSet: 'default028mm', zMax: 1 },  // Roughness
      dust:  { url: TREK + '/TES_Dust/1.0.0/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.png',             style: 'default', matrixSet: 'default028mm', zMax: 1 },  // Global Dust
      plag:  { url: TREK + '/TES_Plagioclase/1.0.0/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.png',       style: 'default', matrixSet: 'default028mm', zMax: 1 },  // Plagioclase Abundance
      glass: { url: TREK + '/TES_Glass_Clay/1.0.0/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.png',         style: 'default', matrixSet: 'default028mm', zMax: 1 },  // Sheet Silicates / High-Si Glass
      tin:   { url: TREK + '/TES_Thermal_Inertia/1.0.0/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.png',   style: 'default', matrixSet: 'default028mm', zMax: 1 }   // Thermal Inertia
    }
  };
  var TS = TILES.tileSize;
  var ovId = 'elev';   // активный слой Layout: 'elev' (раскраска высот MOLA) или ключ из TILES.overlays
  function cfgOf(kind) { return kind === 'elev' ? (ovId === 'elev' ? TILES.elevColor : TILES.overlays[ovId]) : TILES[kind]; }
  function tileUrl(kind, z, row, col) {
    var c = cfgOf(kind);
    return c.url.replace(/\{(z|TileMatrix)\}/g, z).replace(/\{(row|TileRow)\}/g, row).replace(/\{(col|TileCol)\}/g, col)
      .replace(/\{Style\}/g, c.style || '').replace(/\{TileMatrixSet\}/g, c.matrixSet || '');
  }
  // ---- загрузка картинок тайлов (кэш + CORS) ----
  var imgCache = {}, imgOrder = [];
  function loadTileImg(url) {
    if (imgCache[url]) return imgCache[url];
    var p = new Promise(function (resolve) {
      var im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = function () { resolve(im); };
      im.onerror = function () { resolve(null); };
      im.src = url;
    });
    imgCache[url] = p; imgOrder.push(url);
    if (imgOrder.length > 160) { delete imgCache[imgOrder.shift()]; }
    return p;
  }
  // Перевод цвета раскраски MOLA в высоту (км) и запись в 16-бит кодировку R/G, которую читает шейдер.
  var HUE_TAB = [[36, 4.0], [50, 3.2], [70, 2.2], [101, 0.9], [125, -1.4], [151, -3.4], [175, -3.7], [200, -4.1], [220, -4.7], [231, -5.3], [245, -6.3], [258, -7.3], [270, -8.2], [300, -8.2]];
  var SAT_TAB = [[0.0, 21.2], [0.05, 20.0], [0.15, 15.0], [0.25, 11.0], [0.35, 8.5], [0.45, 6.0], [0.59, 4.0], [0.9, 4.0]];
  function interpTab(tab, x) {
    if (x <= tab[0][0]) return tab[0][1];
    for (var i = 1; i < tab.length; i++) {
      if (x <= tab[i][0]) { var a = tab[i - 1], b = tab[i]; return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]); }
    }
    return tab[tab.length - 1][1];
  }
  // тайл → Float32Array высот (км), размер tsz×tsz; null, если браузер не дал прочитать пиксели (нет CORS)
  //   decode 'clrshade' — цветная раскраска MOLA (оттенок → км);  'dem16' — 16-бит PNG: км = (R*256+G)/65535*31 − 9
  function decodeHeightTile(im, tsz, mode) {
    var cv = document.createElement('canvas'); cv.width = tsz; cv.height = tsz;
    var g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(im, 0, 0, tsz, tsz);
    var id;
    try { id = g.getImageData(0, 0, tsz, tsz); } catch (e) { return null; }
    var d = id.data, n = tsz * tsz, e = new Float32Array(n), i, k;
    if (mode === 'dem16') {
      for (i = 0, k = 0; i < n; i++, k += 4) e[i] = (d[k] * 256 + d[k + 1]) / 65535 * 31 - 9;
      return e;
    }
    for (i = 0, k = 0; i < n; i++, k += 4) {
      var r = d[k] / 255, gg = d[k + 1] / 255, b = d[k + 2] / 255;
      var mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), df = mx - mn, hue = 0;
      if (df > 1e-6) {
        if (mx === r) hue = ((gg - b) / df) % 6; else if (mx === gg) hue = 2 + (b - r) / df; else hue = 4 + (r - gg) / df;
        hue *= 60; if (hue < 0) hue += 360;
      }
      var sat = mx > 1e-6 ? df / mx : 0;
      e[i] = (hue >= 36 && hue <= 300 && sat >= 0.33) ? interpTab(HUE_TAB, hue) : interpTab(SAT_TAB, sat);
    }
    return e;
  }
  // собирает прямоугольник [sx0,sx0+sw)×[sy0,sy0+sh) уровня zh слоя высот (тайлы своего размера) в Float32Array
  function layerField(zh, sx0, sy0, sw, sh) {
    var cfg = TILES.height, T = cfg.tileSize || TS, out = new Float32Array(sw * sh), ok = 0;
    var cols = Math.pow(2, zh + 1), rows = Math.pow(2, zh);
    var c0 = Math.floor(sx0 / T), c1 = Math.floor((sx0 + sw - 1) / T);
    var r0 = Math.max(0, Math.floor(sy0 / T)), r1 = Math.min(rows - 1, Math.floor((sy0 + sh - 1) / T));
    var jobs = [];
    for (var r = r0; r <= r1; r++) for (var c = c0; c <= c1; c++) (function (r, c) {
      var cw = ((c % cols) + cols) % cols;
      jobs.push(loadTileImg(tileUrl('height', zh, r, cw)).then(function (im) {
        if (!im) return;
        var te = decodeHeightTile(im, T, cfg.decode); if (!te) return;
        ok++;
        var ox = c * T - sx0, oy = r * T - sy0;
        for (var y = Math.max(0, -oy); y < Math.min(T, sh - oy); y++) for (var x = Math.max(0, -ox); x < Math.min(T, sw - ox); x++) out[(oy + y) * sw + ox + x] = te[y * T + x];
      }));
    })(r, c);
    return Promise.all(jobs).then(function () { return { e: out, ok: ok }; });
  }
  // поле высот (км) прямоугольника [gx0,gx0+w)×[gy0,gy0+h) в сетке уровня z (ширина 2^(z+1)·TS px).
  // Берётся ближайший по детализации уровень слоя, дальше — билинейное пересэмплирование ПО КМ (не по R/G-кодировке).
  function heightField(z, gx0, gy0, w, h) {
    var cfg = TILES.height, T = cfg.tileSize || TS;
    var Wz = Math.pow(2, z + 1) * TS, zh = 0;
    while (zh < (cfg.zMax || TILES.zMax) && Math.pow(2, zh + 1) * T < Wz) zh++;
    var Wh = Math.pow(2, zh + 1) * T, Hh = Wh / 2, g = Wh / Wz;
    var sx0 = Math.max(0, Math.floor(gx0 * g) - 1), sy0 = Math.max(0, Math.floor(gy0 * g) - 1);
    var sx1 = Math.min(Wh, Math.ceil((gx0 + w) * g) + 2), sy1 = Math.min(Hh, Math.ceil((gy0 + h) * g) + 2);
    var sw = Math.max(2, sx1 - sx0), sh = Math.max(2, sy1 - sy0);
    return layerField(zh, sx0, sy0, sw, sh).then(function (src) {
      var out = new Float32Array(w * h);
      for (var y = 0; y < h; y++) {
        var fy = Math.max(sy0, Math.min(sy0 + sh - 1.001, (gy0 + y + 0.5) * g - 0.5)) - sy0;
        var y0 = Math.min(sh - 2, Math.floor(fy)), ty = fy - y0;
        for (var x = 0; x < w; x++) {
          var fx = Math.max(sx0, Math.min(sx0 + sw - 1.001, (gx0 + x + 0.5) * g - 0.5)) - sx0;
          var x0 = Math.min(sw - 2, Math.floor(fx)), tx = fx - x0, i0 = y0 * sw + x0;
          out[y * w + x] = (src.e[i0] * (1 - tx) + src.e[i0 + 1] * tx) * (1 - ty) + (src.e[i0 + sw] * (1 - tx) + src.e[i0 + sw + 1] * tx) * ty;
        }
      }
      return { e: out, ok: src.ok, f: Math.max(1, 1 / g) };
    });
  }
  // гауссово размытие поля (сепарабельное), σ в пикселях
  function blurField(e, w, h, sigma) {
    var R = Math.ceil(sigma * 3), ker = new Float32Array(2 * R + 1), sum = 0, i, x, y, k;
    for (i = -R; i <= R; i++) { ker[i + R] = Math.exp(-i * i / (2 * sigma * sigma)); sum += ker[i + R]; }
    for (i = 0; i < ker.length; i++) ker[i] /= sum;
    var t = new Float32Array(e.length), o = new Float32Array(e.length), acc;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      acc = 0; for (k = -R; k <= R; k++) acc += e[y * w + Math.max(0, Math.min(w - 1, x + k))] * ker[k + R];
      t[y * w + x] = acc;
    }
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      acc = 0; for (k = -R; k <= R; k++) acc += t[Math.max(0, Math.min(h - 1, y + k)) * w + x] * ker[k + R];
      o[y * w + x] = acc;
    }
    return o;
  }
  // канвас высот в кодировке R/G, которую читает шейдер
  function heightMosaic(z, gx0, gy0, w, h) {
    return heightField(z, gx0, gy0, w, h).then(function (r) {
      var e = r.e;
      // шумоподавление: убирает ступеньки раскраски (σ в «родных» пикселях слоя × растяжение)
      if (r.ok > 0) e = blurField(e, w, h, Math.max(0.6, (TILES.height.smooth !== undefined ? TILES.height.smooth : (TILES.heightSmooth || 2.0)) * r.f));
      var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      var g = cv.getContext('2d'), id = g.createImageData(w, h), d = id.data, n = w * h;
      for (var i = 0, k = 0; i < n; i++, k += 4) {
        var v = r.ok > 0 ? Math.round((Math.max(-9, Math.min(22, e[i])) + 9) / 31 * 65535) : 19027;
        d[k] = v >> 8; d[k + 1] = v & 255; d[k + 2] = 0; d[k + 3] = 255;
      }
      g.putImageData(id, 0, 0);
      cv._ok = r.ok;
      return cv;
    });
  }
  var PH_COLOR = 'rgb(158,92,62)', PH_HEIGHT = 'rgb(74,83,0)';   // высота 0 км в кодировке (R*256+G)/65535*31−9
  // Собирает прямоугольник пикселей [gx0, gx0+w) × [gy0, gy0+h) уровня z из тайлов в один canvas.
  function buildMosaic(kind, z, gx0, gy0, w, h) {
    if (kind === 'height' && TILES.height.decode) return heightMosaic(z, gx0, gy0, w, h);
    var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    var g = cv.getContext('2d');
    // если у слоя нет такого глубокого уровня — берём его максимальный и растягиваем
    var zl = Math.min(z, cfgOf(kind).zMax || TILES.zMax);
    if (z > zl) {
      var f = Math.pow(2, z - zl);
      var sx0 = Math.floor(gx0 / f), sy0 = Math.floor(gy0 / f);
      var sw = Math.ceil((gx0 + w) / f) - sx0 + 1, sh = Math.ceil((gy0 + h) / f) - sy0 + 1;
      g.fillStyle = kind === 'height' ? PH_HEIGHT : PH_COLOR;
      g.fillRect(0, 0, w, h);
      return buildMosaic(kind, zl, sx0, sy0, sw, sh).then(function (src) {
        g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
        g.drawImage(src, 0, 0, sw, sh, sx0 * f - gx0, sy0 * f - gy0, sw * f, sh * f);
        cv._ok = src._ok;
        return cv;
      });
    }
    g.fillStyle = kind === 'height' ? PH_HEIGHT : PH_COLOR;
    g.fillRect(0, 0, w, h);
    cv._ok = 0;
    var cols = Math.pow(2, z + 1), rows = Math.pow(2, z);
    var c0 = Math.floor(gx0 / TS), c1 = Math.floor((gx0 + w - 1) / TS);
    var r0 = Math.max(0, Math.floor(gy0 / TS)), r1 = Math.min(rows - 1, Math.floor((gy0 + h - 1) / TS));
    var jobs = [];
    for (var r = r0; r <= r1; r++) {
      for (var c = c0; c <= c1; c++) {
        (function (r, c) {
          var cw = ((c % cols) + cols) % cols;               // долгота замыкается по кругу
          jobs.push(loadTileImg(tileUrl(kind, z, r, cw)).then(function (im) {
            if (!im) return;
            if (kind === 'elev') cv._ok++;
            var src = im;
            g.drawImage(src, 0, 0, src.width, src.height, c * TS - gx0, r * TS - gy0, TS, TS);
          }));
        })(r, c);
      }
    }
    return Promise.all(jobs).then(function () { return cv; });
  }
  function canvasTex(cv, isHeight, wrapRepeat, aniso) {
    var t = new THREE.CanvasTexture(cv);
    t.wrapS = wrapRepeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    if (isHeight) { t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; }
    else { t.anisotropy = aniso; }
    t.needsUpdate = true;
    return t;
  }

  // ---- Глобальные карты: уровни z = 0, 1, 2 (2 тайла → 8 → 32), собираются в одну текстуру ----
  // Вся планета = LOD 1 (zoom 1: 2 ряда × 4 колонки = 8 тайлов). Каждое «+» — следующий LOD:
  // LOD 2 = 4×8 (zoom 2), LOD 3 = 8×16 (zoom 3), дальше окно из тайлов zoom 4, 5, 6, 7…
  // zoom z → 2^z рядов × 2^(z+1) колонок.
  // ---- Высоты: вшиты прямо в этот файл (2048×1024, 16 бит в PNG: R = старший байт, G = младший; км = (R*256+G)/65535*31 − 9) ----
  // Крупный рельеф всего Марса (≈10 км/px, по MOLA 463 м); мелкие детали даёт только текстура цвета. Отдельных файлов и LOD для высот нет.
  var H_EMBED_SRC = 'assets/mars-height.png';
  var H_W = 2048, H_H = 1024, heightP = null;
  function getHeightTex() {
    if (!heightP) heightP = new Promise(function (resolve) {
      var im = new Image();
      function finish(t) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; resolve(t); }
      im.onload = function () { finish(new THREE.Texture(im)); };
      im.onerror = function () { var c = document.createElement('canvas'); c.width = c.height = 2; var g = c.getContext('2d'); g.fillStyle = PH_HEIGHT; g.fillRect(0, 0, 2, 2); finish(new THREE.CanvasTexture(c)); };
      im.src = H_EMBED_SRC;
    });
    return heightP;
  }
  var LEVELS = [1, 2, 3].map(function (z) {
    return { name: 'LOD ' + z + ' (' + Math.pow(2, z) + '×' + Math.pow(2, z + 1) + ')', z: z, w: Math.pow(2, z + 1) * TS, h: Math.pow(2, z) * TS };
  });
  var MAX_LEVEL = HEAVY ? 2 : 1;
  var texLv = LEVELS.map(function () { return { state: 0, color: null, height: null, ev: {}, promise: null }; });
  var texCur = -1;
  var GEO_SIZES = [[160, 80], [480, 240], [1024, 512]];
  var MAX_GEO = 1;

  function requestLevel(i) {
    if (i > MAX_LEVEL) return Promise.resolve(false);
    var L = texLv[i];
    if (L.state === 2) return Promise.resolve(true);
    if (L.state === 1 || L.state === 3) return L.promise || Promise.resolve(false);
    L.state = 1;
    var maxA = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    var z = LEVELS[i].z, w = LEVELS[i].w, h = LEVELS[i].h;
    L.promise = Promise.all([buildMosaic('color', z, 0, 0, w, h), getHeightTex()]).then(function (r) {
      L.color = canvasTex(r[0], false, true, maxA);
      L.height = r[1];
      L.state = 2;
      return true;
    });
    return L.promise;
  }

  // ---- Окно детализации: 1024×1024 px глубокого уровня z вокруг точки обзора ----
  var DET_WIN = 1024, DET_PAD = 64, DET_TOT = DET_WIN + 2 * DET_PAD;   // = DET_N, DET_P, DET_T в шейдере
  var TILE_MAX = HEAVY ? 5 : 2;
  var tiles = {};          // key -> { state, h, c, t, z, ox, oy, cx, cy, promise }
  var tileCur = null, tileWant = null;
  function tileLoadWin(z, lonDeg, latDeg) {
    var Wz = Math.pow(2, z + 1) * TS, Hz = Math.pow(2, z) * TS;
    var cx = (lonDeg + 180) / 360 * Wz, cy = (90 - latDeg) / 180 * Hz;
    // окно центрируется на наблюдателе, шаг сетки 256 px (чтобы не перезагружать при малых сдвигах)
    var ox = Math.max(0, Math.min(Wz - DET_WIN, Math.round((cx - DET_WIN / 2) / 256) * 256));
    var oy = Math.max(0, Math.min(Hz - DET_WIN, Math.round((cy - DET_WIN / 2) / 256) * 256));
    var key = z + '_' + ox + '_' + oy, T = tiles[key];
    if (T) { T.t = performance.now(); return T; }
    T = tiles[key] = { state: 1, h: null, c: null, t: performance.now(), z: z, ox: ox, oy: oy, cx: cx, cy: cy, key: key, Wz: Wz, Hz: Hz };
    var maxA = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
    var gx0 = ox - DET_PAD, gy0 = oy - DET_PAD;
    T.promise = Promise.all([buildMosaic('color', z, gx0, gy0, DET_TOT, DET_TOT)]).then(function (r) {
      T.c = canvasTex(r[0], false, false, maxA);
      T.h = null;
      T.ev = {};
      T.state = 2;
      var keys = Object.keys(tiles).filter(function (k) { return tiles[k].state === 2 && tiles[k] !== tileCur; });
      if (keys.length > TILE_MAX) {
        keys.sort(function (a, b) { return tiles[a].t - tiles[b].t; });
        while (keys.length > TILE_MAX) {
          var o = tiles[keys.shift()];
          if (o.h) o.h.dispose(); if (o.c) o.c.dispose(); for (var kk in o.ev) if (o.ev[kk].tex) o.ev[kk].tex.dispose();
          delete tiles[o.key];
        }
      }
      return true;
    });
    return T;
  }
  function applyDetail(T) {
    tileCur = T || null;
    function setOn(u) {
      if (T) {
        u.uDetC.value = T.c;
        // прямоугольник окна в UV (v отсчитывается снизу вверх)
        u.uDetRect.value.set(T.ox / T.Wz, 1 - (T.oy + DET_WIN) / T.Hz, DET_WIN / T.Wz, DET_WIN / T.Hz);
        u.uDetOn.value = 1;
      } else { u.uDetOn.value = 0; }
    }
    setOn(marsMat.uniforms);
    if (typeof eachSM === 'function') { try { eachSM(function (m) { setOn(m.uniforms); }); } catch (e) {} }
    updateLodText();
    syncElev();
    renderDirty = true;
  }
  // lonDeg/latDeg — точка, на которую смотрим; z — нужный уровень тайлов
  function tileUpdate(lonDeg, latDeg, wantIt, z) {
    if (!wantIt) { if (tileCur) applyDetail(null); return Promise.resolve(false); }
    z = Math.max(0, Math.min(TILES.zMax, z === undefined ? 3 : z));
    var Wz = Math.pow(2, z + 1) * TS, Hz = Math.pow(2, z) * TS;
    var cx = (lonDeg + 180) / 360 * Wz, cy = (90 - latDeg) / 180 * Hz;
    // текущее окно ещё годится: тот же уровень, точка в пределах центральной половины
    if (tileCur && tileCur.z === z && Math.abs(cx - (tileCur.ox + DET_WIN / 2)) < 300 && Math.abs(cy - (tileCur.oy + DET_WIN / 2)) < 300) {
      tileCur.t = performance.now(); return Promise.resolve(true);
    }
    var T = tileLoadWin(z, lonDeg, latDeg);
    if (tileWant === T.key && T.state === 1) return T.promise;
    tileWant = T.key;
    return T.promise.then(function () {
      if (tileWant !== T.key) return false;
      applyDetail(T);
      return true;
    });
  }
  function desiredLevel(d) {
    var want = d > 4.3 ? 0 : (d > 2.9 ? 1 : 2);
    return Math.min(want, MAX_LEVEL);
  }
  function applyTexLevel() {
    var want = desiredLevel(mv.dist), use = -1;
    for (var i = want; i >= 0; i--) { if (texLv[i].state === 2) { use = i; break; } }
    if (use < 0 || use === texCur) return;
    texCur = use;
    var u = marsMat.uniforms;
    u.uColor.value = texLv[use].color;
    u.uHeight.value = texLv[use].height;
    u.uRes.value.set(H_W, H_H);
    updateLodText();
    syncElev();
  }
  // ---- слой Layout (Elevation / Roughness / Dust …): строится лениво, только для активного режима ----
  function dropOtherOv(map, keep) {
    for (var k in map) if (k !== keep) { if (map[k].tex) map[k].tex.dispose(); delete map[k]; }
  }
  var ovFixed = {};   // слои без LOD: id → { tex, ok }
  function ensureLevelElev(i) {
    var L = texLv[i], id = ovId;
    if (L.ev[id]) return L.ev[id].p;
    dropOtherOv(L.ev, id);
    var rec = L.ev[id] = { tex: null, ok: false };
    var maxA = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    rec.p = buildMosaic('elev', LEVELS[i].z, 0, 0, LEVELS[i].w, LEVELS[i].h).then(function (cv) {
      rec.tex = canvasTex(cv, false, true, maxA); rec.ok = cv._ok > 0; return rec;
    });
    return rec.p;
  }
  function ensureWinElev(T) {
    var id = ovId;
    if (T.ev[id]) return T.ev[id].p;
    dropOtherOv(T.ev, id);
    var rec = T.ev[id] = { tex: null, ok: false };
    var maxA = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
    rec.p = buildMosaic('elev', T.z, T.ox - DET_PAD, T.oy - DET_PAD, DET_TOT, DET_TOT).then(function (cv) {
      rec.tex = canvasTex(cv, false, false, maxA); rec.ok = cv._ok > 0; return rec;
    });
    return rec.p;
  }
  // пока слой Layout (кроме цвета и температуры) не загрузился, сфера чёрная, по центру надпись Loading
  var ovReady = false, ovFail = false;
  function syncElev() { syncElevCore(); updateBlank(); }
  function updateBlank() {
    if (!marsMat) return;
    var u = marsMat.uniforms, blank = false;
    if (viewMode === 1 || viewMode >= 3) {
      if (u.uElevOn.value > 0.5) ovReady = true;
      else {
        var rec = ovId === 'elev' ? (texCur >= 0 ? texLv[texCur].ev[ovId] : null) : ovFixed[ovId];
        if (rec && rec.tex && !rec.ok) ovFail = true;   // тайлы не пришли — показываем запасной вид, а не вечный чёрный
      }
      blank = !ovReady && !ovFail;
    }
    u.uBlank.value = blank ? 1 : 0;
    ovLoadingEl.hidden = !blank;
    renderDirty = true;
  }
  function syncElevCore() {
    if (!marsMat || !(viewMode === 1 || viewMode >= 3)) return;
    var u = marsMat.uniforms, id = ovId;
    if (id !== 'elev') {
      // Roughness / Dust / Plagioclase / Glass / Thermal inertia: один фиксированный уровень (zoom 1: 2 ряда × 4 колонки = 8 тайлов), без LOD и окна детализации
      var fr = ovFixed[id];
      u.uDetEOn.value = 0;
      if (fr && fr.tex) { u.uElev.value = fr.tex; u.uElevOn.value = fr.ok ? 1 : 0; }
      else {
        u.uElevOn.value = 0;
        if (!fr) {
          dropOtherOv(ovFixed, id);
          fr = ovFixed[id] = { tex: null, ok: false };
          var zf = 1, maxF = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
          fr.p = buildMosaic('elev', zf, 0, 0, Math.pow(2, zf + 1) * TS, Math.pow(2, zf) * TS).then(function (cv) {
            fr.tex = canvasTex(cv, false, true, maxF); fr.ok = cv._ok > 0;
            if (id === ovId) { syncElev(); renderDirty = true; }
          });
        }
      }
      renderDirty = true;
      return;
    }
    var i = texCur;
    if (i >= 0) {
      var rec = texLv[i].ev[id];
      if (rec && rec.tex) { u.uElev.value = rec.tex; u.uElevOn.value = rec.ok ? 1 : 0; }
      else { u.uElevOn.value = 0; ensureLevelElev(i).then(function () { if (id === ovId) { syncElev(); renderDirty = true; } }); }
    }
    var T = tileCur;
    if (T && T.z < TILES.zSurface - 1) {
      var wr = T.ev[id];
      if (wr && wr.tex) { u.uDetE.value = wr.tex; u.uDetEOn.value = wr.ok ? 1 : 0; }
      else { u.uDetEOn.value = 0; ensureWinElev(T).then(function () { if (id === ovId && tileCur === T) { syncElev(); renderDirty = true; } }); }
    } else { u.uDetEOn.value = 0; }
    renderDirty = true;
  }

  function makeGeoMesh(i) {
    if (geoMeshes[i] || !marsMat) return;
    var m = new THREE.Mesh(new THREE.SphereGeometry(1, GEO_SIZES[i][0], GEO_SIZES[i][1]), marsMat);
    m.frustumCulled = false;
    m.visible = false;
    marsSpin.add(m);
    geoMeshes[i] = m;
  }
  function updateGeoLod() {
    var d = mv.dist, w = geoCur < 0 ? 0 : geoCur;
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
    for (var i = 0; i < geoMeshes.length; i++) if (geoMeshes[i]) geoMeshes[i].visible = (i === w);
    updateLodText();
  }
  function updateLodText() {
    if (!lodEl) return;
    var lv = texCur >= 0 ? LEVELS[texCur].name : '…';
    var g = geoCur >= 0 ? GEO_SIZES[geoCur][0] + '×' + GEO_SIZES[geoCur][1] : '…';
    lodEl.textContent = 'Detail level ' + (Math.max(texCur, 0) + 1) + ' · ' + lv + ' maps' + (tileCur ? ' + zoom ' + tileCur.z : '') + ' · mesh ' + g;
  }

  // ---- Сцена Марса ---------------------------------------------------------
  function buildMars() {
    marsScene = new THREE.Scene();
    marsCam = new THREE.PerspectiveCamera(30, 1, 0.02, 4000);
    marsRoot = new THREE.Object3D();
    marsScene.add(marsRoot);
    marsSpin = new THREE.Object3D();
    marsRoot.add(marsSpin);

    var phColor = new THREE.DataTexture(new Uint8Array([170, 92, 64, 255]), 1, 1, THREE.RGBAFormat);
    phColor.needsUpdate = true;
    var phHeight = new THREE.DataTexture(new Uint8Array([74, 209, 0, 255]), 1, 1, THREE.RGBAFormat);
    phHeight.magFilter = THREE.NearestFilter; phHeight.minFilter = THREE.NearestFilter; phHeight.generateMipmaps = false;
    phHeight.needsUpdate = true;

    marsMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: phColor },
        uHeight: { value: phHeight },
        uDetH: { value: phHeight },
        uDetC: { value: phColor },
        uElev: { value: phColor },
        uDetE: { value: phColor },
        uElevOn: { value: 0 },
        uDetEOn: { value: 0 },
        uDetHOn: { value: 0 },
        uDetRect: { value: new THREE.Vector4(0, 0, 1, 1) },
        uDetOn: { value: 0 },
        uRamp: { value: makeRampTexture() },
        uRampT: { value: makeRampTexture(TEMP_RAMP, K_LO, K_HI) },
        uSunLagObj: { value: new THREE.Vector3(1, 0, 0) },
        uFlux: { value: 586 },
        uRes: { value: new THREE.Vector2(2048, 1024) },
        uExag: { value: EXAG },
        uSunObj: { value: sunObj.clone() },
        uMode: { value: 0 },
        uBlank: { value: 0 },
        uGrid: { value: 0 },
        uCell: { value: new THREE.Vector4(0, 0, 0, 0) },
        uHome: { value: new THREE.Vector4(0, 0, 0, 0) }
      },
      vertexShader: MARS_VERT,
      fragmentShader: MARS_FRAG,
      defines: { SHADOW_STEPS: HEAVY ? 6 : 0, CRATER_LAYERS: 2 },
      extensions: { derivatives: true }
    });
    makeGeoMesh(0);

    marsAtmoMat = new THREE.ShaderMaterial({
      uniforms: { uSun: { value: new THREE.Vector3(1, 0, 0) } },
      vertexShader: MARS_ATMO_VERT,
      fragmentShader: MARS_ATMO_FRAG,
      side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    marsRoot.add(new THREE.Mesh(new THREE.SphereGeometry(1.1, 64, 48), marsAtmoMat));

    var moonDefs = [
      { name: 'Phobos', r: 0.075, orbit: 1.75, speed: 0.45, tilt: 0.22, color: 0x6d6058, sc: [1.35, 1, 1.1], seed: 3 },
      { name: 'Deimos', r: 0.05, orbit: 2.45, speed: 0.14, tilt: -0.3, color: 0x8c7f72, sc: [1.1, 1, 0.95], seed: 9 }
    ];
    moonDefs.forEach(function (d) {
      var tiltG = new THREE.Object3D();
      tiltG.rotation.x = d.tilt;
      marsRoot.add(tiltG);
      var pivot = new THREE.Object3D();
      pivot.rotation.y = d.seed;
      tiltG.add(pivot);
      var m = new THREE.Mesh(
        moonGeometry(d.seed),
        new THREE.MeshStandardMaterial({ color: d.color, roughness: 1, metalness: 0, flatShading: true })
      );
      m.scale.set(d.r * d.sc[0], d.r * d.sc[1], d.r * d.sc[2]);
      m.position.x = d.orbit;
      pivot.add(m);
      marsMoons.push({ def: d, pivot: pivot, mesh: m, angle: d.seed });
      var mel = document.createElement('div');
      mel.className = 'glabel moon';
      mel.textContent = d.name;
      labelsEl.appendChild(mel);
      moonLabels.push({ el: mel, mesh: m });
    });

    marsScene.add(new THREE.AmbientLight(0x445577, 0.18));
    marsLight = new THREE.DirectionalLight(0xfff0dc, 2.4);
    marsScene.add(marsLight);

    var st = new THREE.Points(starGeo, starMat);
    st.frustumCulled = false;
    marsScene.add(st);

    buildLabels();

    onMarsResize = function (w, h) {
      marsCam.aspect = w / h;
      marsCam.updateProjectionMatrix();
      var half = THREE.MathUtils.degToRad(marsCam.fov / 2);
      var halfH = Math.atan(Math.tan(half) * marsCam.aspect);
      var ang = Math.min(half, halfH) * 0.8;
      mv.fit = 1 / Math.sin(ang);
      if (!mv.userZoomed && mode === 'mars') mv.tDist = mv.fit;
    };
  }

  // ---- Подписи сетки -------------------------------------------------------
  var gLabels = [];
  function lonText(lon) {
    if (lon === 0) return '0°';
    if (lon === 180 || lon === -180) return '180°';
    return Math.abs(lon) + '°' + (lon > 0 ? 'E' : 'W');
  }
  function buildLabels() {
    var lon, defs = [];
    for (lon = -150; lon <= 180; lon += 30) defs.push({ kind: 'lon', lon: lon, lat: 0, text: lonText(lon) });
    [-60, -30, 30, 60].forEach(function (lat) {
      defs.push({ kind: 'lat', lon: 0, lat: lat, text: Math.abs(lat) + '°' + (lat > 0 ? 'N' : 'S') });
    });
    defs.forEach(function (d) {
      var el = document.createElement('div');
      el.className = 'glabel ' + d.kind;
      el.textContent = d.text;
      labelsEl.appendChild(el);
      d.el = el;
      gLabels.push(d);
    });
  }
  var moonLabels = [];
  var moonW = new THREE.Vector3(), moonCam = new THREE.Vector3();
  function updateMoonLabels() {
    var w = window.innerWidth, h = window.innerHeight;
    marsCam.updateMatrixWorld(true);
    for (var i = 0; i < moonLabels.length; i++) {
      var L = moonLabels[i];
      L.mesh.getWorldPosition(moonW);
      moonCam.copy(marsCam.position);
      // закрыт ли спутник диском Марса: расстояние от центра до отрезка камера—спутник
      var dx = moonW.x - moonCam.x, dy = moonW.y - moonCam.y, dz = moonW.z - moonCam.z;
      var len2 = dx * dx + dy * dy + dz * dz;
      var tt = Math.max(0, Math.min(1, -(moonCam.x * dx + moonCam.y * dy + moonCam.z * dz) / len2));
      var px = moonCam.x + dx * tt, py = moonCam.y + dy * tt, pz = moonCam.z + dz * tt;
      var occluded = tt > 0.001 && tt < 0.999 && (px * px + py * py + pz * pz) < 1.0;
      moonW.project(marsCam);
      var x = (moonW.x * 0.5 + 0.5) * w, y = (-moonW.y * 0.5 + 0.5) * h;
      var vis = !occluded && moonW.z < 1 && x > 0 && x < w && y > 0 && y < h;
      L.el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
      L.el.style.opacity = vis ? '1' : '0';
    }
  }
  function updateLabels() {
    updateMoonLabels();
    if (!gridOn) return;
    var w = window.innerWidth, h = window.innerHeight;
    marsCam.updateMatrixWorld(true);
    marsSpin.getWorldQuaternion(tmpQ);
    tmpV.set(0, 0, 1).applyQuaternion(tmpQ.clone().invert());
    var lonC = Math.atan2(-tmpV.z, tmpV.x) / D2R;
    var latLon = Math.round(lonC / 30) * 30;
    for (var i = 0; i < gLabels.length; i++) {
      var d = gLabels[i];
      var lo = (d.kind === 'lat' ? latLon : d.lon) * D2R, la = d.lat * D2R;
      tmpW.set(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo));
      tmpW.multiplyScalar(1.0).applyMatrix4(marsSpin.matrixWorld);
      tmpC.copy(tmpW).normalize();
      var toCam = tmpV.copy(marsCam.position).sub(tmpW).normalize();
      var facing = tmpC.dot(toCam);
      var op = clamp01((facing - 0.18) / 0.25);
      if (op <= 0.01) { d.el.style.opacity = '0'; continue; }
      tmpW.project(marsCam);
      var x = (tmpW.x * 0.5 + 0.5) * w, y = (-tmpW.y * 0.5 + 0.5) * h;
      d.el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
      d.el.style.opacity = op.toFixed(2);
    }
  }

  // ---- Управление видом ----------------------------------------------------
  function faceAngles(lonDeg, latDeg) {
    var lon = lonDeg * D2R, lat = latDeg * D2R;
    var x = Math.cos(lat) * Math.cos(lon), z = -Math.cos(lat) * Math.sin(lon);
    return { spin: Math.atan2(-x, z), pitch: lat };
  }
  function angDiff(a, b) {
    var d = (a - b) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }
  function clampDist(d) { return Math.max(MIN_DIST, Math.min(MAX_DIST, d)); }
  function clearPressed() {
    var bs = marsNav.querySelectorAll('button');
    for (var i = 0; i < bs.length; i++) bs[i].setAttribute('aria-pressed', 'false');
    var ps = poiList.querySelectorAll('button');
    for (var k = 0; k < ps.length; k++) ps[k].setAttribute('aria-pressed', 'false');
  }
  function flyTo(lonDeg, latDeg, dist) {
    var f = faceAngles(lonDeg, latDeg);
    mv.tSpin = f.spin;
    mv.tPitch = Math.max(-1.45, Math.min(1.45, f.pitch));
    mv.tDist = clampDist(dist);
    mv.fly = true; mv.auto = false; mv.userZoomed = true;
    mv.vSpin = 0; mv.vPitch = 0;
  }
  function startView() {
    var lon = sunInfo.lonE - 40;
    return faceAngles(lon > 180 ? lon - 360 : (lon < -180 ? lon + 360 : lon), 12);
  }
  function resetMarsView(initial) {
    var f = startView();
    mv.spin = f.spin; mv.pitch = f.pitch;
    mv.dist = initial ? 12 : mv.dist;
    mv.tDist = mv.fit;
    mv.fly = false; mv.auto = true; mv.dragging = false;
    mv.vSpin = 0; mv.vPitch = 0; mv.userZoomed = false;
    perf.t = 0; perf.n = 0; perf.warm = 40;
  }
  function zoomBy(factor) {
    mv.userZoomed = true; mv.auto = false; mv.fly = false;
    mv.tDist = clampDist(mv.tDist * factor);
  }
  function setViewMode(m) {
    viewMode = m;
    var OV_IDS = ['rough', 'dust', 'plag', 'glass', 'tin'];
    ovId = m >= 3 ? OV_IDS[m - 3] : 'elev';
    if (marsMat) marsMat.uniforms.uMode.value = m >= 3 ? 3 : m;
    ovReady = false; ovFail = false;
    legendEl.hidden = (m === 0 || m >= 3);
    if (m > 0 && m < 3) buildLegend(m);
    syncElev();
    var opts = layoutPop.querySelectorAll('.opt');
    for (var i = 0; i < opts.length; i++) {
      opts[i].setAttribute('aria-checked', String(parseInt(opts[i].getAttribute('data-mode'), 10) === m));
    }
  }
  function setGrid(on) {
    gridOn = on;
    if (marsMat) marsMat.uniforms.uGrid.value = (on || homeArmed) ? 1 : 0;
    btnGrid.setAttribute('aria-pressed', String(on));
    if (marsMat && marsSpin) { marsSpin.getWorldQuaternion(tmpQ); tmpV.set(0, 0, 1).applyQuaternion(tmpQ.clone().invert()); updateSector(Math.atan2(-tmpV.z, tmpV.x) / D2R, Math.asin(Math.max(-1, Math.min(1, tmpV.y))) / D2R); renderDirty = true; }
    if (!on) for (var i = 0; i < gLabels.length; i++) gLabels[i].el.style.opacity = '0';
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function fmtLonLat(lonE, lat) {
    var lo = Math.abs(lonE).toFixed(0) + '°' + (lonE >= 0 ? 'E' : 'W');
    var la = Math.abs(lat).toFixed(0) + '°' + (lat >= 0 ? 'N' : 'S');
    return lo + ' ' + la;
  }
  function updateTiles() {
    if (mv.dist > (tileCur ? 3.4 : 2.9) || texLv[MAX_LEVEL].state !== 2) { tileUpdate(0, 0, false); tileWant = null; return; }
    marsSpin.getWorldQuaternion(tmpQ);
    tmpV.set(0, 0, 1).applyQuaternion(tmpQ.clone().invert());
    var zp = Math.min(TILES.zPlanetMax, TILES.zMax, 4 + (mv.dist < 1.8) + (mv.dist < 1.4) + (mv.dist < 1.2));
    tileUpdate(Math.atan2(-tmpV.z, tmpV.x) / D2R, Math.asin(Math.max(-1, Math.min(1, tmpV.y))) / D2R, true, zp);
  }
  function updateSector(lonC, latC) {
    if (!gridOn) { sectorEl.textContent = ''; marsMat.uniforms.uCell.value.set(0, 0, 0, 0); return; }
    var l0 = Math.max(-180, Math.min(150, Math.floor(lonC / 30) * 30));
    var a0 = Math.max(-90, Math.min(60, Math.floor(latC / 30) * 30));
    var c = marsMat.uniforms.uCell.value;
    if (c.x !== l0 || c.z !== a0) { c.set(l0, l0 + 30, a0, a0 + 30); renderDirty = true; }
    var lm = l0 + 15, lt = (12 + (lm - sunInfo.lonE) / 15) % 24;
    if (lt < 0) lt += 24;
    var hh = Math.floor(lt), mm = Math.floor((lt - hh) * 60);
    sectorEl.textContent = 'Grid sector ' + lonText(l0) + ' – ' + lonText(l0 + 30) + ' · ' +
      Math.abs(a0) + '°' + (a0 < 0 ? 'S' : 'N') + ' – ' + Math.abs(a0 + 30) + '°' + (a0 + 30 < 0 ? 'S' : (a0 + 30 === 0 ? '' : 'N')) +
      ' · solar time at its centre ' + pad2(hh) + ':' + pad2(mm);
  }
  function updateReadout() {
    marsSpin.getWorldQuaternion(tmpQ);
    tmpV.set(0, 0, 1).applyQuaternion(tmpQ.clone().invert());
    var lonC = Math.atan2(-tmpV.z, tmpV.x) / D2R;
    var ltst = (12 + (lonC - sunInfo.lonE) / 15) % 24;
    if (ltst < 0) ltst += 24;
    var hh = Math.floor(ltst), mm = Math.floor((ltst - hh) * 60);
    var day = (ltst > 6 && ltst < 18) ? 'day' : 'night';
    updateHome();
    updateSector(lonC, Math.asin(Math.max(-1, Math.min(1, tmpV.y))) / D2R);
    sunEl.textContent = 'Sun over ' + fmtLonLat(sunInfo.lonE, sunInfo.lat) + ' · Ls ' + sunInfo.Ls.toFixed(0) +
      '° · solar time at view centre ' + pad2(hh) + ':' + pad2(mm) + ' (' + day + ')';
  }

  function updateMars(dt) {
    mv.dist += (mv.tDist - mv.dist) * (1 - Math.exp(-dt * 5));
    if (mv.fly) {
      var kf = 1 - Math.exp(-dt * 4);
      var ds = angDiff(mv.tSpin, mv.spin), dp = mv.tPitch - mv.pitch;
      mv.spin += ds * kf;
      mv.pitch += dp * kf;
      if (Math.abs(ds) < 0.002 && Math.abs(dp) < 0.002) mv.fly = false;
    } else if (!mv.dragging) {
      if (mv.auto) mv.spin += dt * 0.02;
      mv.spin += mv.vSpin * dt;
      mv.pitch = Math.max(-1.45, Math.min(1.45, mv.pitch + mv.vPitch * dt));
      var decay = Math.exp(-dt * 3);
      mv.vSpin *= decay; mv.vPitch *= decay;
    }
    marsSpin.rotation.y = mv.spin;
    marsRoot.rotation.x = mv.pitch;
    marsCam.position.set(0, 0, mv.dist);
    marsRoot.updateMatrixWorld(true);

    // реальное Солнце: пересчёт по текущему времени
    updateSun();
    marsMat.uniforms.uSunObj.value.copy(sunObj);
    var lagLon = (sunInfo.lonE + 18) * D2R, lagLat = sunInfo.lat * D2R;   // тепловая инерция ≈ 1.2 марсианских часа
    marsMat.uniforms.uSunLagObj.value.set(Math.cos(lagLat) * Math.cos(lagLon), Math.sin(lagLat), -Math.cos(lagLat) * Math.sin(lagLon));
    var rAU = 1.5237 * (1 - 0.0934 * 0.0934) / (1 + 0.0934 * Math.cos((sunInfo.Ls - 251) * D2R));
    marsMat.uniforms.uFlux.value = 1361 / (rAU * rAU);
    marsSpin.getWorldQuaternion(tmpQ);
    sunWorld.copy(sunObj).applyQuaternion(tmpQ);
    marsAtmoMat.uniforms.uSun.value.copy(sunWorld);
    marsLight.position.copy(sunWorld).multiplyScalar(10);

    for (var i = 0; i < marsMoons.length; i++) {
      var m = marsMoons[i];
      m.angle += m.def.speed * dt;
      m.pivot.rotation.y = m.angle;
      m.mesh.rotation.y += dt * 0.2;
    }

    // уровни детализации
    if (mv.dist < 5.5) requestLevel(1).then(applyTexLevel);
    if (mv.dist < 4.2) requestLevel(2).then(applyTexLevel);
    applyTexLevel();
    updateGeoLod();

    updateLabels();
    uiTimer -= dt;
    if (uiTimer <= 0) { uiTimer = 0.5; updateReadout(); updateTiles(); }

    // адаптивное разрешение рендера
    if (perf.warm > 0) { perf.warm--; return; }
    perf.t += dt; perf.n++;
    if (perf.n >= 60) {
      var avg = perf.t / perf.n;
      perf.t = 0; perf.n = 0;
      var pr = renderer.getPixelRatio();
      if (avg > 0.034 && pr > 0.85) {
        renderer.setPixelRatio(Math.max(0.75, pr - 0.25));
        resize();
      }
    }
  }

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function openMars() {
    if (transitioning || mode === 'mars') return;
    transitioning = true;
    veil.classList.add('on');
    wait(480).then(function () {
      if (!marsScene) buildMars();
      return Promise.race([requestLevel(0), wait(8000).then(function () { return false; })]);
    }).then(function () {
      mode = 'mars';
      tag.hidden = true;
      marsUI.hidden = false;
      clearPressed();
      setViewMode(viewMode);
      setGrid(gridOn);
      renderer.setPixelRatio(Math.min(BASE_PR, 1.25));
      resize();
      updateSun();
      resetMarsView(true);
      texCur = -1;
      applyTexLevel();
      updateGeoLod();
      updateReadout();
      renderer.compile(marsScene, marsCam);
      renderer.domElement.style.cursor = 'grab';
      // фоновая подгрузка более подробных уровней и сеток
      requestLevel(1).then(applyTexLevel);
      setTimeout(function () { makeGeoMesh(1); updateGeoLod(); }, 500);
      return wait(80);
    }).then(function () {
      veil.classList.remove('on');
      marsBack.focus({ preventScroll: true });
      return wait(480);
    }).then(function () { transitioning = false; });
  }

  function closeMars() {
    if (transitioning || mode !== 'mars') return;
    if (pegArmed) setArmed(false);
    if (homeArmed) setHomeArmed(false);
    transitioning = true;
    veil.classList.add('on');
    wait(480).then(function () {
      mode = 'system';
      marsUI.hidden = true;
      layoutPop.hidden = true;
      btnLayout.setAttribute('aria-expanded', 'false');
      tag.hidden = false;
      renderer.setPixelRatio(BASE_PR);
      resize();
      renderer.domElement.style.cursor = '';
      return wait(60);
    }).then(function () {
      veil.classList.remove('on');
      return wait(480);
    }).then(function () { transitioning = false; });
  }

  // ---- Ввод ----------------------------------------------------------------
  var cv = renderer.domElement;
  var ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function hitsMars(e) {
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    var hits = ray.intersectObjects([sun, mars.mesh]);
    return hits.length > 0 && hits[0].object === mars.mesh;
  }

  var ptrs = {}, lastPinch = 0, lastMoveT = 0;
  function nPtrs() { return Object.keys(ptrs).length; }
  function pinchDist() {
    var ks = Object.keys(ptrs);
    if (ks.length < 2) return 0;
    var a = ptrs[ks[0]], b = ptrs[ks[1]];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  tag.addEventListener('click', openMars);
  marsBack.addEventListener('click', closeMars);
  cv.addEventListener('click', function (e) {
    if (mode === 'system' && !transitioning && hitsMars(e)) openMars();
  });

  cv.addEventListener('pointerdown', function (e) {
    if (mode !== 'mars') return;
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    mv.dragging = true; mv.auto = false; mv.fly = false; mv.vSpin = 0; mv.vPitch = 0;
    clearPressed();
    layoutPop.hidden = true;
    btnLayout.setAttribute('aria-expanded', 'false');
    lastMoveT = e.timeStamp;
    if (nPtrs() === 2) lastPinch = pinchDist();
    cv.style.cursor = 'grabbing';
  });
  cv.addEventListener('pointermove', function (e) {
    if (mode === 'system') {
      cv.style.cursor = hitsMars(e) ? 'pointer' : '';
      return;
    }
    var p = ptrs[e.pointerId];
    if (!p) return;
    var dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (nPtrs() === 1) {
      var k = Math.max(0.0006, 2 * Math.tan(0.2618) * (mv.dist - 1) / window.innerHeight);
      mv.spin += dx * k;
      mv.pitch = Math.max(-1.45, Math.min(1.45, mv.pitch + dy * k));
      var dtm = Math.max(8, e.timeStamp - lastMoveT);
      mv.vSpin = 0.6 * (dx * k / dtm * 1000) + 0.4 * mv.vSpin;
      mv.vPitch = 0.6 * (dy * k / dtm * 1000) + 0.4 * mv.vPitch;
      lastMoveT = e.timeStamp;
    } else if (nPtrs() === 2) {
      var d = pinchDist();
      if (lastPinch > 0 && d > 0) {
        mv.dist = mv.tDist = clampDist(mv.dist * lastPinch / d);
        mv.userZoomed = true;
      }
      lastPinch = d;
    }
  });
  function endPointer(e) {
    if (!ptrs[e.pointerId]) return;
    delete ptrs[e.pointerId];
    if (nPtrs() === 0) {
      mv.dragging = false;
      if (e.timeStamp - lastMoveT > 90) { mv.vSpin = 0; mv.vPitch = 0; }
      if (mode === 'mars') cv.style.cursor = 'grab';
    }
    lastPinch = 0;
  }
  cv.addEventListener('pointerup', endPointer);
  cv.addEventListener('pointercancel', endPointer);
  cv.addEventListener('wheel', function (e) {
    if (mode !== 'mars') return;
    e.preventDefault();
    var dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    mv.userZoomed = true; mv.auto = false;
    mv.tDist = clampDist(mv.tDist * Math.exp(dy * 0.0012));
  }, { passive: false });

  marsNav.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b) return;
    clearPressed();
    if (b.getAttribute('data-reset')) {
      var f = startView();
      mv.tSpin = f.spin; mv.tPitch = f.pitch; mv.tDist = mv.fit;
      mv.fly = true; mv.auto = true; mv.userZoomed = false;
    } else {
      b.setAttribute('aria-pressed', 'true');
      flyTo(parseFloat(b.getAttribute('data-lon')), parseFloat(b.getAttribute('data-lat')), parseFloat(b.getAttribute('data-dist')));
    }
  });


  // ---- Левая панель «Markers»: выпадающие разделы, пока только «Places of interest» ----
  var POI = [
    { name: 'Olympus Mons', note: 'Largest volcano in the Solar System', lon: -134, lat: 18.6, dist: 1.9 },
    { name: 'Valles Marineris', note: 'Canyon system ~4,000 km long', lon: -59, lat: -12, dist: 2.6 },
    { name: 'Hellas Basin', note: 'Deepest impact basin on Mars', lon: 70, lat: -42, dist: 2.7 },
    { name: 'Tharsis Montes', note: 'Arsia, Pavonis and Ascraeus', lon: -112, lat: 1, dist: 2.2 },
    { name: 'Elysium Mons', note: 'Volcanic province', lon: 147, lat: 25, dist: 2.0 },
    { name: 'Gale Crater', note: 'Curiosity rover', lon: 137.4, lat: -5.4, dist: 1.5 },
    { name: 'Jezero Crater', note: 'Perseverance rover', lon: 77.5, lat: 18.4, dist: 1.5 },
    { name: 'Utopia Planitia', note: 'Vast northern plain', lon: 118, lat: 47, dist: 2.4 },
    { name: 'Argyre Basin', note: 'Impact basin in the south', lon: -43, lat: -50, dist: 2.4 },
    { name: 'North pole', note: 'Polar ice cap', lon: 0, lat: 80, dist: 2.8 }
  ];
  POI.forEach(function (p) {
    var li = document.createElement('li');
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'poi'; b.setAttribute('aria-pressed', 'false');
    b.setAttribute('data-lon', p.lon); b.setAttribute('data-lat', p.lat); b.setAttribute('data-dist', p.dist);
    var dot = document.createElement('i');
    var tx = document.createElement('span');
    tx.textContent = p.name;
    var sm = document.createElement('small');
    sm.textContent = p.note;
    tx.appendChild(sm);
    b.appendChild(dot); b.appendChild(tx);
    li.appendChild(b);
    poiList.appendChild(li);
  });
  poiList.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b || transitioning) return;
    clearPressed();
    b.setAttribute('aria-pressed', 'true');
    flyTo(parseFloat(b.getAttribute('data-lon')), parseFloat(b.getAttribute('data-lat')), parseFloat(b.getAttribute('data-dist')));
  });
  var sideToggle = document.getElementById('side-toggle');
  var sidePanel = document.getElementById('side-panel');
  sideToggle.addEventListener('click', function () {
    var open = sidePanel.hidden;
    sidePanel.hidden = !open;
    sideToggle.setAttribute('aria-expanded', String(open));
  });
  Array.prototype.forEach.call(sidePanel.querySelectorAll('.side-head'), function (h) {
    h.addEventListener('click', function () {
      var open = h.getAttribute('aria-expanded') !== 'true';
      h.setAttribute('aria-expanded', String(open));
      document.getElementById(h.getAttribute('aria-controls')).hidden = !open;
    });
  });

  // кнопки зума (удержание = непрерывный зум)
  function holdZoom(btn, factor) {
    var timer = 0;
    function stop() { if (timer) { clearInterval(timer); timer = 0; } }
    btn.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      zoomBy(factor);
      stop();
      timer = setInterval(function () { zoomBy(factor > 1 ? 1.06 : 0.94); }, 70);
    });
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointerleave', stop);
    btn.addEventListener('pointercancel', stop);
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); zoomBy(factor); }
    });
  }
  holdZoom(btnZoomIn, 0.8);
  holdZoom(btnZoomOut, 1.25);

  btnLayout.addEventListener('click', function () {
    var open = layoutPop.hidden;
    layoutPop.hidden = !open;
    btnLayout.setAttribute('aria-expanded', String(open));
  });
  layoutPop.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b) return;
    setViewMode(parseInt(b.getAttribute('data-mode'), 10));
    layoutPop.hidden = true;
    btnLayout.setAttribute('aria-expanded', 'false');
  });
  btnGrid.addEventListener('click', function () { setGrid(!gridOn); });

  window.addEventListener('keydown', function (e) {
    if (mode !== 'mars') return;
    if (e.key === 'Escape') {
      if (pegArmed) return;
      if (!layoutPop.hidden) { layoutPop.hidden = true; btnLayout.setAttribute('aria-expanded', 'false'); }
      else closeMars();
    } else if (e.key === '+' || e.key === '=') zoomBy(0.85);
    else if (e.key === '-' || e.key === '_') zoomBy(1.18);
    else if (e.key === 'g' || e.key === 'G') setGrid(!gridOn);
  });

  // ---- Вид с поверхности: трассировка рельефа, небо Марса, Солнце, звёзды ----
  var SURF_VERT = `
varying vec2 vP;
void main(){ vP = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
  var SURF_BODY = `
uniform sampler2D uColor;   // цвет: мозаика NASA (тот же уровень, что в общем виде)
uniform vec2 uSeed;      // сдвиг процедурных деталей (км)
uniform vec3 uSun;       // направление на Солнце в локальных осях E,N,Up
uniform vec2 uView;      // курс (от севера по часовой), наклон
uniform vec2 uScr;       // tan(половины верт. FOV), aspect
uniform float uPx;       // радиан на пиксель
uniform mat3 uStar;      // локальные оси -> небесная система (звёзды)
varying vec2 vP;

float gH0;

vec3 h32(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}
float n2(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = h32(i).x, b = h32(i + vec2(1.0, 0.0)).x, c = h32(i + vec2(0.0, 1.0)).x, d = h32(i + vec2(1.0, 1.0)).x;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm2(vec2 p){
  float s = 0.0, a = 0.5;
  for(int i = 0; i < 4; i++){ s += a * n2(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s - 0.469;
}

vec2 toUV(vec2 q){
  float lat = uObsLL.y + q.y / R_KM;
  float lon = uObsLL.x + q.x / (R_KM * max(cos(uObsLL.y), 0.05));
  return vec2(lon / TWO_PI + 0.5, lat / PI + 0.5);
}

// высота поверхности (км) над касательной плоскостью наблюдателя; t — расстояние от камеры.
// Только крупная форма: сглаженная карта высот той же модели Марса (почти голый шарик), без добавочных холмов, кратеров и камней и без LOD: везде одно и то же бикубическое сглаживание.
float gnd(vec2 q, float t){
  return hKmS(q) - gH0 - dot(q, q) / (2.0 * R_KM);
}

vec3 skyRad(vec3 rd){
  float e = uSun.z;
  float cg = clamp(dot(rd, uSun), -1.0, 1.0);
  float ang = acos(cg);
  float h = max(rd.z, 0.0);
  float day = pow(smoothstep(-0.22, 0.35, e), 2.5);
  vec3 zen = vec3(0.30, 0.20, 0.14);
  vec3 hor = vec3(0.74, 0.50, 0.34);
  vec3 col = mix(hor, zen, pow(h, 0.5)) * day * 0.62;
  float lowSun = 1.0 - smoothstep(0.0, 0.5, e);
  float vis = smoothstep(-0.30, -0.02, e);
  vec3 blue = vec3(0.20, 0.42, 1.0);
  col += blue * (0.55 * exp(-ang * 5.0) + 1.5 * exp(-ang * 26.0)) * vis * mix(0.35, 1.0, lowSun);
  float tw = smoothstep(-0.36, 0.0, e) * (1.0 - smoothstep(0.0, 0.14, e));
  vec2 az = normalize(rd.xy + 1e-4), saz = normalize(uSun.xy + 1e-4);
  float side = 0.5 + 0.5 * dot(az, saz);
  float hz = exp(-h * 6.5);
  col += (vec3(0.55, 0.27, 0.15) * 0.55 + vec3(0.08, 0.16, 0.50) * 0.85) * tw * hz * side * 0.9;
  return col;
}

vec3 starField(vec3 dw){
  float nightF = smoothstep(-0.14, -0.38, uSun.z);
  if(nightF <= 0.0) return vec3(0.0);
  vec3 col = vec3(0.0);
  float S = clamp(1.0 / (8.0 * uPx), 30.0, 200.0);
  vec3 p = dw * S;
  vec3 id = floor(p);
  float sg = 0.7 * uPx * S;
  vec3 r = h32(id.xy + id.z * 7.7);
  float prob = min(0.035 * (120.0 / S) * (120.0 / S), 0.6);
  if(r.x < prob){
    vec3 r2 = h32(id.yz + id.x * 3.3 + 1.7);
    vec3 pos = id + 0.5 + 0.5 * (r2 - 0.5);
    float d = length(p - pos);
    float b = pow(r.y, 5.0) * 2.2 + 0.14;
    float st = exp(-d * d / (2.0 * sg * sg)) * (0.35 / max(sg * 4.0, 0.35));
    vec3 tint = mix(vec3(1.0, 0.74, 0.55), vec3(0.65, 0.78, 1.0), r.z);
    col += tint * b * st;
  }
  // Млечный Путь
  vec3 nmw = normalize(vec3(0.35, 0.80, 0.49));
  float band = exp(-pow(dot(dw, nmw) / 0.20, 2.0));
  float cl = 0.5 + fbm2(dw.xy * 5.0 + dw.z * 3.0) * 1.8;
  col += vec3(0.50, 0.55, 0.75) * band * clamp(cl, 0.0, 1.5) * 0.35 / 0.20 * 0.20;
  return col * nightF * 0.20 * vec3(1.0);
}

// ================= ЦВЕТ ПОВЕРХНОСТИ =================
// Основа — мозаика NASA (Viking), как в общем виде. Поверх — только мелкая процедурная детализация цвета
// (пятна, песок, камешки): рельефа она не добавляет.
// плоский шум вокруг наблюдателя (λ в км); гаснет, когда детали мельче пикселя (fp — км на пиксель)
float oP(vec2 q, float lam, float fp, float sd){
  float w = 1.0 - smoothstep(0.15, 0.45, fp / lam);
  if(w <= 0.0) return 0.5;
  return 0.5 + (n2(q / lam + fract(uSeed / lam * 0.7071 + vec2(sd, sd * 1.7)) + vec2(53.0 + 11.0 * sd, 91.0 + 7.0 * sd)) - 0.5) * w;   // + целое смещение: хеш в нуле даёт 0
}
// небольшой поворот оттенка (YIQ), угол в радианах
vec3 hueRot(vec3 c, float a){
  float ca = cos(a), sa = sin(a);
  float Y = dot(c, vec3(0.299, 0.587, 0.114)), I = dot(c, vec3(0.596, -0.274, -0.322)), Q = dot(c, vec3(0.211, -0.523, 0.312));
  float I2 = I * ca - Q * sa, Q2 = I * sa + Q * ca;
  return vec3(Y + 0.956 * I2 + 0.621 * Q2, Y - 0.272 * I2 - 0.647 * Q2, Y - 1.106 * I2 + 1.703 * Q2);
}
vec3 surfAlbedo(vec2 q, float fp){
  vec3 base = texture2D(uColor, toUV(q)).rgb;
  // пятна и поля: от километров до метров (с лёгким искажением координат — получаются натуральные разводы)
  vec2 qw = q + (vec2(oP(q, 0.35, fp, 3.0), oP(q + 7.7, 0.35, fp, 5.0)) - 0.5) * 0.06;
  float m = 0.0, mw = 0.0, amp = 0.5, lam = 9.0;
  for(int i = 0; i < 9; i++){ m += amp * oP(qw, lam, fp, 7.0 * float(i)); mw += amp; amp *= 0.66; lam *= 0.45; }
  m /= mw;
  // гравий и песок: от 25 м до 1 см
  float f = 0.0, fw = 0.0; amp = 0.5; lam = 0.025;
  for(int i = 0; i < 12; i++){ f += amp * oP(qw, lam, fp, 90.0 + 7.0 * float(i)); fw += amp; amp *= 0.76; lam *= 0.5; }
  f /= fw;
  float M = clamp((m - 0.5) * 2.6 + 0.5, 0.0, 1.0);
  float F = clamp((f - 0.5) * 2.8 + 0.5, 0.0, 1.0);
  vec3 c = base;
  c = mix(c * vec3(0.96, 0.99, 1.04), c * vec3(1.04, 1.0, 0.95), M);       // тёплые и прохладные пятна
  c *= 0.80 + 0.40 * M;
  c *= 0.84 + 0.32 * F;
  // песчаная рябь: тонкие полосы по ветру (только цвет)
  float rw = (1.0 - smoothstep(0.15, 0.45, fp / 0.0016));
  float rip = sin(dot(qw, vec2(0.94, 0.34)) / 0.0016 + 6.0 * oP(q, 0.02, fp, 31.0));
  c *= 1.0 + 0.035 * rip * rw * smoothstep(0.35, 0.65, oP(q, 0.3, fp, 44.0));
  // изредка: участки с чуть другим оттенком и насыщенностью (небольшие изменения)
  float pm = smoothstep(0.60, 0.78, oP(q, 0.16, fp, 160.0)) * smoothstep(0.45, 0.62, oP(q, 1.2, fp, 170.0));
  float ang = (oP(q, 0.9, fp, 180.0) - 0.5) * 0.9;
  float sat = 1.0 + (oP(q, 0.7, fp, 190.0) - 0.5) * 0.5;
  float lum = dot(c, vec3(0.30, 0.59, 0.11));
  vec3 pc = mix(vec3(lum), hueRot(c, ang), 1.0);
  pc = mix(vec3(lum), pc, sat);
  c = mix(c, pc, pm);
  c = mix(c, vec3(dot(c, vec3(0.30, 0.59, 0.11))), 0.12);                    // естественнее: меньше насыщенности
  return pow(clamp(c, 0.0, 1.0), vec3(2.2));
}

void main(){
  gCub = 1.0;
  gH0 = hKmS(vec2(0.0));
  float eyeZ = gnd(vec2(0.0), 0.0) + 0.0017;

#ifdef PANO
  float paz = (vP.x * 0.5 + 0.5) * TWO_PI, pel = vP.y * 1.5707963;
  vec3 rd = vec3(sin(paz) * cos(pel), cos(paz) * cos(pel), sin(pel));
#else
  float cy = cos(uView.x), sy = sin(uView.x), cp = cos(uView.y), sp = sin(uView.y);
  vec3 fw = vec3(sy * cp, cy * cp, sp);
  vec3 rt = vec3(cy, -sy, 0.0);
  vec3 up = vec3(-sy * sp, -cy * sp, cp);
  vec3 rd = normalize(fw + vP.x * uScr.y * uScr.x * rt + vP.y * uScr.x * up);
#endif
  vec3 ro = vec3(0.0, 0.0, eyeZ);

  float e = uSun.z;
  float tMax = 260.0;   // дальше всё равно сплошная дымка
  float t = 0.0004, tPrev = 0.0;
  bool hit = false;
  if(rd.z > 0.0) tMax = min(tMax, (40.0 - eyeZ) / rd.z);
  for(int i = 0; i < STEPS; i++){
    vec3 p = ro + rd * t;
    float g = p.z - gnd(p.xy, t);
    if(g < 0.0){ hit = true; break; }
    tPrev = t;
    t += max(0.6 * g, (0.045 + 0.14 * smoothstep(0.1, 4.0, t)) * t + 0.0004);   // вдали шаг растёт быстрее, чтобы луч дошёл до далёких гор (Олимп)
    if(t > tMax) break;
  }
  // луч, идущий к горизонту, не успел дойти до поверхности за отведённые шаги: считаем, что поверхность там (иначе вместо рельефа рисуется плоская «плоскость» дымки)
  if(!hit && rd.z < 0.025){ hit = true; t = min(t, tMax); tPrev = t; }
  vec3 col;
  float ex1 = 1.0 - smoothstep(-0.25, 0.35, e);
  float expo = 1.0 + 5.5 * ex1 * ex1;

if(hit){
    float a = tPrev, b = t;
    for(int k = 0; k < 6; k++){
      float m = 0.5 * (a + b);
      vec3 pm = ro + rd * m;
      if(pm.z - gnd(pm.xy, m) < 0.0) b = m; else a = m;
    }
    t = 0.5 * (a + b);
    vec3 P = ro + rd * t;
    vec2 q = P.xy;

    // --- НОРМАЛИ: только крупная форма модели, широкий шаг = гладко ---
    float ee = max(0.01, t * 0.004);
    float h0 = gnd(q, t);
    float hx = gnd(q + vec2(ee, 0.0), t);
    float hy = gnd(q + vec2(0.0, ee), t);
    vec3 N = normalize(vec3(-(hx - h0) / ee, -(hy - h0) / ee, 1.0));

    // --- ЦВЕТ: процедурная текстура вместо тайлов NASA ---
    vec3 alb = surfAlbedo(q, t * uPx);


    // --- ТЕНИ РЕЛЬЕФА (Трассировка) ---
    float sh = 1.0;
    if(e > 0.0 && dot(N, uSun) > 0.0){
      float dist = 0.0020;
      for(int i = 0; i < SHADOW_STEPS; i++){
        vec3 sp3 = P + uSun * dist + vec3(0.0, 0.0, 0.0004);
        float g2 = sp3.z - gnd(sp3.xy, t + dist * 2.5);
        sh = min(sh, clamp(g2 * 14.0 / dist, 0.0, 1.0)); // мягче тени
        dist *= 1.42;
      }
    }


    // --- ОСВЕЩЕНИЕ ---
    float ndl = max(dot(N, uSun), 0.0);
    float m = 1.0 / (max(e, 0.0) + 0.10);
    vec3 Tg = exp(-0.45 * m * vec3(0.75, 0.95, 1.20));
    float sunVis = smoothstep(-0.02, 0.04, e);
    vec3 Esun = vec3(1.0, 0.94, 0.85) * 2.9 * Tg * sunVis * ndl * sh;
    float day = pow(smoothstep(-0.20, 0.32, e), 2.2);
    float tw = smoothstep(-0.34, 0.0, e) * (1.0 - smoothstep(0.0, 0.16, e));
    vec3 Esky = vec3(0.58, 0.43, 0.33) * 0.70 * day * (0.60 + 0.40 * N.z);
    Esky += vec3(0.28, 0.16, 0.14) * tw * 0.14 * (0.65 + 0.35 * N.z);
    Esky += vec3(0.006, 0.0065, 0.0095);


    // Мягкий Ambient Occlusion
    float ao = clamp(N.z * 0.9 + 0.35, 0.55, 1.0);


    // Финальный цвет
    col = alb * (Esun + Esky) * ao;


    // --- ДЫМКА ---
    vec3 fogDir = normalize(vec3(rd.xy, 0.04));
    vec3 fogC = skyRad(fogDir);
    float fogA = 1.0 - exp(-(0.025 * min(t, 20.0) + 0.010 * max(t - 20.0, 0.0)));   // дымка ближе: далёкие неровности не видны
    fogA = max(fogA, smoothstep(80.0, 230.0, t));
    col = mix(col, fogC, fogA);
  } else {
    col = skyRad(rd);
    if(rd.z < 0.0){
      col = skyRad(normalize(vec3(rd.xy, 0.05)));
    } else {
      float cg = dot(rd, uSun);
      float R = 0.00305;
      float ang = acos(clamp(cg, -1.0, 1.0));
      float m = 1.0 / (max(e, 0.0) + 0.08);
      vec3 sunC = mix(vec3(1.0, 0.96, 0.88), vec3(0.82, 0.90, 1.0), 1.0 - smoothstep(0.0, 0.5, e));
      float disc = 1.0 - smoothstep(R * 0.92, R * 1.04, ang);
      float limb = 0.55 + 0.45 * sqrt(max(1.0 - pow(ang / R, 2.0), 0.0));
      col += sunC * disc * limb * 45.0 * exp(-0.13 * m);
      col += sunC * 0.4 * exp(-ang * ang / (0.012 * 0.012)) * exp(-0.13 * m);
    }
    if(rd.z >= 0.0){
      vec3 dw = uStar * rd;
      col += starField(dw);
    }
  }
  col *= expo;
  col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);
  col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));
  col += (h32(gl_FragCoord.xy).x - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`;
  var SURF_FRAG = '#define H_SMOOTH 1\n#define PREC 1\n' + MARS_COMMON + SURF_BODY;
  var SURF_SHOW_FRAG = `
uniform sampler2D uPano;
uniform vec2 uView;
uniform vec2 uScr;
varying vec2 vP;
void main(){
  float cy = cos(uView.x), sy = sin(uView.x), cp = cos(uView.y), sp = sin(uView.y);
  vec3 fw = vec3(sy * cp, cy * cp, sp);
  vec3 rt = vec3(cy, -sy, 0.0);
  vec3 up = vec3(-sy * sp, -cy * sp, cp);
  vec3 rd = normalize(fw + vP.x * uScr.y * uScr.x * rt + vP.y * uScr.x * up);
  float az = atan(rd.x, rd.y);
  if(az < 0.0) az += 6.28318530718;
  float el = asin(clamp(rd.z, -1.0, 1.0));
  gl_FragColor = texture2D(uPano, vec2(az / 6.28318530718, el / 3.14159265359 + 0.5));
}
`;


  // ---- Режим «Исследователь»: вид от первого лица на поверхности ----------
  var MARS_HOUR_MS = 88775244 / 24;
  var surfScene = null, surfCam = null, surfMat = null;
  var surf = {
    lon: 0, lat: 0, yaw: 0, pitch: 0.07, fov: 70, tOff: 0, play: false, tex: -1,
    siteKm: null, uiT: 0, panoReady: false, panoCur: -1, job: null, building: false, hold: false, pmode: -1, panoAge: 0, panoSwap: false, panoTex: -1, basePR: 0, sE: 0, sN: 0, sU: 1, ss: null, perfT: 0, perfN: 0, perfWarm: 30
  };
  var surfUIEl = document.getElementById('surf-ui');
  var surfBack = document.getElementById('surf-back');
  var surfLocEl = document.getElementById('surf-loc');
  var surfSunEl = document.getElementById('surf-sun');
  var surfPhaseEl = document.getElementById('surf-phase');
  var surfTimeEl = document.getElementById('surf-time');
  var surfSubEl = document.getElementById('surf-sub');
  var surfZin = document.getElementById('surf-zin');
  var surfZout = document.getElementById('surf-zout');
  var cpCard = document.getElementById('cp-card');
  var cpRead = document.getElementById('cp-read');
  var pegBtn = document.getElementById('btn-peg');
  var pegGhost = document.getElementById('peg-ghost');
  var marsHint = marsUI.querySelector('.mu-hint');
  var marsHintText = marsHint ? marsHint.textContent : '';

  var panoMat = null, showMat = null, panoScene = null, showScene = null;
  var panoRT = [null, null];
  var PANO_W = HEAVY ? 4096 : 2048, PANO_H = PANO_W / 2, PANO_STRIPS = 32;
  function makeSurfMat(pano) {
    var d = pano ? { PANO: 1, STEPS: HEAVY ? 120 : 72, SHADOW_STEPS: HEAVY ? 16 : 8 }
                 : { STEPS: HEAVY ? 70 : 52, SHADOW_STEPS: HEAVY ? 8 : 5 };
    return new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: marsMat.uniforms.uColor.value },
        uHeight: { value: marsMat.uniforms.uHeight.value },
        uDetH: { value: marsMat.uniforms.uDetH.value },
        uDetC: { value: marsMat.uniforms.uDetC.value },
        uDetRect: { value: marsMat.uniforms.uDetRect.value.clone() },
        uDetOn: { value: 0 },
        uDetHOn: { value: 0 },
        uRes: { value: new THREE.Vector2(2048, 1024) },
        uExag: { value: 1 },
        uObsLL: { value: new THREE.Vector2(0, 0) },
        uP0: { value: new THREE.Vector4(0, 0, 0, 0) },
        uD0: { value: new THREE.Vector4(0, 0, 0, 0) },
        uSeed: { value: new THREE.Vector2(0, 0) },
        uSun: { value: new THREE.Vector3(1, 0, 0.5) },
        uView: { value: new THREE.Vector2(0, 0) },
        uScr: { value: new THREE.Vector2(0.7, 1.6) },
        uPx: { value: pano ? 2 * Math.PI / PANO_W : 0.001 },
        uStar: { value: new THREE.Matrix3() }
      },
      vertexShader: SURF_VERT,
      fragmentShader: SURF_FRAG,
      defines: d,
      depthTest: false, depthWrite: false
    });
  }
  function eachSM(f) { f(surfMat); f(panoMat); }
  function buildSurface() {
    surfMat = makeSurfMat(false);
    panoMat = makeSurfMat(true);
    showMat = new THREE.ShaderMaterial({
      uniforms: { uPano: { value: null }, uView: { value: new THREE.Vector2(0, 0) }, uScr: { value: new THREE.Vector2(0.7, 1.6) } },
      vertexShader: SURF_VERT, fragmentShader: SURF_SHOW_FRAG, depthTest: false, depthWrite: false
    });
    surfCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    function sceneOf(m) {
      var sc = new THREE.Scene();
      var q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
      q.frustumCulled = false;
      sc.add(q);
      return sc;
    }
    surfScene = sceneOf(surfMat);
    panoScene = sceneOf(panoMat);
    showScene = sceneOf(showMat);
  }
  function makePanoRT() {
    var rt = new THREE.WebGLRenderTarget(PANO_W, PANO_H, {
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType, depthBuffer: false, stencilBuffer: false, generateMipmaps: false
    });
    rt.texture.wrapS = THREE.RepeatWrapping;
    rt.texture.wrapT = THREE.ClampToEdgeWrapping;
    return rt;
  }
  // панорама рисуется полосами (по несколько на кадр) и потом просто показывается
  function panoStart() {
    surfSun();
    var idx = surf.panoCur === 0 ? 1 : 0;
    if (!panoRT[idx]) panoRT[idx] = makePanoRT();
    surf.job = { idx: idx, row: 0, tex: surf.tex };
  }
  function panoStep(n) {
    var j = surf.job;
    if (!j) return;
    var rt = panoRT[j.idx], rows = PANO_H / PANO_STRIPS;
    for (var k = 0; k < n && j.row < PANO_STRIPS; k++, j.row++) {
      rt.scissorTest = true;
      rt.scissor.set(0, j.row * rows, PANO_W, rows);
      rt.viewport.set(0, 0, PANO_W, PANO_H);
      renderer.setRenderTarget(rt);
      renderer.render(panoScene, surfCam);
    }
    renderer.setRenderTarget(null);
    if (j.row >= PANO_STRIPS) {
      surf.panoCur = j.idx;
      showMat.uniforms.uPano.value = rt.texture;
      surf.panoTex = j.tex;
      surf.panoAge = 0;
      surf.panoSwap = true;
      surf.panoReady = true;
      surf.job = null;
    }
  }

  // высота рельефа в точке (км) по 1K-карте высот, для подписи
  var hCan = null;
  function siteHeightKm(lonDeg, latDeg) {
    try {
      var L = texLv[0];
      if (!L.height || !L.height.image) return null;
      if (!hCan) {
        var img = L.height.image;
        var c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        var g = c.getContext('2d');
        g.drawImage(img, 0, 0);
        hCan = { w: c.width, h: c.height, d: g.getImageData(0, 0, c.width, c.height).data };
      }
      var x = (lonDeg / 360 + 0.5) * hCan.w - 0.5, y = (0.5 - latDeg / 180) * hCan.h - 0.5;
      var x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
      function at(ix, iy) {
        ix = ((ix % hCan.w) + hCan.w) % hCan.w;
        iy = Math.max(0, Math.min(hCan.h - 1, iy));
        var o = (iy * hCan.w + ix) * 4;
        return (hCan.d[o] * 256 + hCan.d[o + 1]) / 65535 * 31 - 9;
      }
      var a = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
      var b = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
      return a * (1 - fy) + b * fy;
    } catch (err) { return null; }
  }

  // ---- Выбор точки на шаре ---------------------------------------------------
  var invM = new THREE.Matrix4(), pkO = new THREE.Vector3(), pkD = new THREE.Vector3();
  function pickMars(cx, cy) {
    if (!marsCam || mode !== 'mars') return null;
    if (flatOn) return pickFlat(cx, cy);
    marsRoot.updateMatrixWorld(true);
    marsCam.updateMatrixWorld(true);
    ndc.set((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, marsCam);
    invM.copy(marsSpin.matrixWorld).invert();
    pkO.copy(ray.ray.origin).applyMatrix4(invM);
    pkD.copy(ray.ray.direction).transformDirection(invM);
    var b = pkO.dot(pkD), c = pkO.dot(pkO) - 1.0, disc = b * b - c;
    if (disc < 0) return null;
    var t = -b - Math.sqrt(disc);
    if (t < 0) return null;
    var px = pkO.x + pkD.x * t, py = pkO.y + pkD.y * t, pz = pkO.z + pkD.z * t;
    return { lon: Math.atan2(-pz, px) / D2R, lat: Math.asin(Math.max(-1, Math.min(1, py))) / D2R };
  }

  // ---- Солнце в локальных осях (восток, север, зенит) -------------------------
  // Солнце и звёзды для точки (lon, lat в радианах): направление на Солнце в осях E,N,Up и матрица звёзд
  function sunFor(lon, lat, tOff) {
    var ss = marsSolar(Date.now() + tOff);
    var la = ss.lat * D2R, lo = ss.lonE * D2R;
    var Lx = Math.cos(la) * Math.cos(lo), Ly = Math.sin(la), Lz = -Math.cos(la) * Math.sin(lo);
    var sl = Math.sin(lat), cl = Math.cos(lat), so = Math.sin(lon), co = Math.cos(lon);
    var E = [-so, 0, -co], Nr = [-sl * co, cl, sl * so], Nn = [cl * co, sl, -cl * so];
    var cs = Math.cos(lo), sn = Math.sin(lo);
    function rot(v) { return [v[0] * cs - v[2] * sn, v[1], v[2] * cs + v[0] * sn]; }   // небесная система: Солнце на долготе 0
    return {
      ss: ss,
      sE: Lx * E[0] + Ly * E[1] + Lz * E[2], sN: Lx * Nr[0] + Ly * Nr[1] + Lz * Nr[2], sU: Lx * Nn[0] + Ly * Nn[1] + Lz * Nn[2],
      c0: rot(E), c1: rot(Nr), c2: rot(Nn)
    };
  }
  function surfSun() {
    var S = sunFor(surf.lon, surf.lat, surf.tOff);
    surf.ss = S.ss; surf.sE = S.sE; surf.sN = S.sN; surf.sU = S.sU;
    var c0 = S.c0, c1 = S.c1, c2 = S.c2;
    var u0 = surf.lon / (2 * Math.PI) + 0.5, v0 = surf.lat / Math.PI + 0.5;
    eachSM(function (m) {
      m.uniforms.uStar.value.set(c0[0], c1[0], c2[0], c0[1], c1[1], c2[1], c0[2], c1[2], c2[2]);
      m.uniforms.uSun.value.set(surf.sE, surf.sN, surf.sU);
      // точное (double) положение наблюдателя в текселях: целая и дробная части отдельно (float32 в шейдере даёт ступени ~1 м)
      var rs = m.uniforms.uRes.value;
      var bx = u0 * rs.x, by = v0 * rs.y;
      m.uniforms.uP0.value.set(Math.floor(bx), Math.floor(by), bx - Math.floor(bx), by - Math.floor(by));
    });
  }

  // Высоты: сглаженная копия карты модели (1024×512, ≈20 км/px) — почти голый шарик без артефактов; цвет — мозаика NASA из общего вида.
  var surfHeight = null, surfHeightP = null;
  function loadSurfHeight() {
    if (!surfHeightP) surfHeightP = new Promise(function (resolve) {
      var im = new Image();
      im.onload = function () {
        var t = new THREE.Texture(im);
        t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
        t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
        resolve({ tex: t, w: im.width, h: im.height });
      };
      im.onerror = function () { resolve(null); };
      im.src = 'assets/mars-height-surface.png';
    });
    return surfHeightP;
  }
  function applySurfTex() {
    var use = -1;
    for (var i = MAX_LEVEL; i >= 0; i--) { if (texLv[i].state === 2) { use = i; break; } }
    if (use < 0) return;
    var key = use + (surfHeight ? 100 : 0);
    if (key === surf.tex) return;
    surf.tex = key;
    var H = surfHeight || { tex: texLv[use].height, w: H_W, h: H_H };   // нет сглаженной карты — берём обычную
    eachSM(function (m) {
      m.uniforms.uColor.value = texLv[use].color;
      m.uniforms.uHeight.value = H.tex;
      m.uniforms.uRes.value.set(H.w, H.h);
    });
  }

  function fmtClock(h) {
    h = ((h % 24) + 24) % 24;
    var hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    return pad2(hh) + ':' + pad2(mm);
  }
  function surfHud() {
    var ss = surf.ss; if (!ss) return;
    var htx = homeText(); surfHomeEl.hidden = !htx; surfHomeEl.textContent = htx;
    var lonDeg = surf.lon / D2R, latDeg = surf.lat / D2R;
    var ltst = (12 + (lonDeg - ss.lonE) / 15) % 24; if (ltst < 0) ltst += 24;
    var alt = Math.asin(Math.max(-1, Math.min(1, surf.sU))) / D2R;
    var az = Math.atan2(surf.sE, surf.sN) / D2R; if (az < 0) az += 360;
    var morning = ltst < 12, phase;
    if (alt > 6) phase = morning ? 'Morning' : 'Afternoon';
    else if (alt > 0) phase = morning ? 'Sunrise' : 'Sunset';
    else if (alt > -6) phase = morning ? 'Dawn' : 'Dusk';
    else if (alt > -18) phase = morning ? 'Pre-dawn twilight' : 'Evening twilight';
    else phase = 'Night';
    surfPhaseEl.textContent = phase;
    surfTimeEl.textContent = fmtClock(ltst);
    var sinD = Math.sin(ss.lat * D2R), cosD = Math.cos(ss.lat * D2R);
    var sinP = Math.sin(surf.lat), cosP = Math.cos(surf.lat);
    var cH = (Math.sin(-0.27 * D2R) - sinP * sinD) / Math.max(1e-6, cosP * cosD);
    var rs;
    if (cH > 1) rs = 'Polar night: the Sun does not rise today';
    else if (cH < -1) rs = 'Polar day: the Sun does not set today';
    else {
      var H0 = Math.acos(cH) / D2R / 15;
      rs = 'Sunrise ' + fmtClock(12 - H0) + ' · Sunset ' + fmtClock(12 + H0);
    }
    surfSubEl.textContent = 'Local solar time (Mars hours) · ' + rs;
    surfLocEl.textContent = fmtLonLat(lonDeg, latDeg) + (surf.siteKm === null ? '' : ' · elevation ' + (surf.siteKm < 0 ? '−' : '') + Math.abs(surf.siteKm).toFixed(1) + ' km');
    surfSunEl.textContent = 'Sun ' + (alt >= 0 ? '+' : '−') + Math.abs(alt).toFixed(1) + '° · azimuth ' + az.toFixed(0) + '° · Ls ' + ss.Ls.toFixed(0) + '°';
  }
  var cpNames = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  function surfCompass() {
    var yd = (surf.yaw / D2R) % 360; if (yd < 0) yd += 360;
    cpCard.setAttribute('transform', 'rotate(' + (-yd).toFixed(1) + ' 100 100)');
    cpRead.textContent = cpNames[Math.round(yd / 45) % 8] + ' ' + Math.round(yd) + '°';
  }

  var sLast = { yaw: 0, pitch: 0, fov: 0, tex: -2 }, sIdle = 0, sStill = 0, sLow = false;
  var PANO_MIN_FOV = 38;      // при сильном приближении — живая трассировка
  function surfBasePR() { return surf.basePR || (HEAVY ? Math.min(BASE_PR, 0.85) : 0.6); }
  // 0 — ничего не рисовать, 1 — живая трассировка, 2 — показ готовой панорамы
  function updateSurface(dt) {
    applySurfTex();
    if (surf.job) panoStep(surf.building ? (HEAVY ? 4 : 2) : 2);
    if (surf.hold) return 0;
    if (!surf.job) {
      surf.panoAge += dt;
      if (surf.panoReady && (surf.panoAge > 25 || surf.tex !== surf.panoTex)) panoStart();
    }
    surf.uiT -= dt;
    if (surf.uiT <= 0) { surf.uiT = 0.4; if (surf.ss) surfHud(); }

    var changed = renderDirty || surf.panoSwap || surf.yaw !== sLast.yaw || surf.pitch !== sLast.pitch || surf.fov !== sLast.fov;
    if (changed) surfCompass();
    var usePano = surf.panoReady && surf.fov >= PANO_MIN_FOV;
    var pm = usePano ? 1 : 0;
    if (pm !== surf.pmode) {
      surf.pmode = pm; sLow = false; sStill = 0;
      renderer.setPixelRatio(pm ? Math.min(BASE_PR, 1.5) : surfBasePR());
      resize();
      changed = true;
    }
    var th = Math.tan(surf.fov * D2R / 2);
    var size = renderer.domElement;
    var asp = size.width / Math.max(1, size.height);

    if (usePano) {
      if (!changed) return 0;
      renderDirty = false; surf.panoSwap = false;
      sLast.yaw = surf.yaw; sLast.pitch = surf.pitch; sLast.fov = surf.fov;
      showMat.uniforms.uView.value.set(surf.yaw, surf.pitch);
      showMat.uniforms.uScr.value.set(th, asp);
      return 2;
    }

    // живая трассировка (приближение или пока панорама не готова)
    var moving = changed && !renderDirty;
    if (moving) { sStill = 0; } else { sStill += dt; }
    var base = surfBasePR();
    if (moving && !sLow) { sLow = true; renderer.setPixelRatio(Math.max(0.4, base * 0.6)); resize(); }
    else if (!moving && sLow && sStill > 0.25) { sLow = false; renderer.setPixelRatio(base); resize(); }
    sIdle += dt;
    if (!changed && sIdle < 2.0) return 0;
    sIdle = 0;
    renderDirty = false; surf.panoSwap = false;
    sLast.yaw = surf.yaw; sLast.pitch = surf.pitch; sLast.fov = surf.fov;
    surfSun();
    var u = surfMat.uniforms;
    u.uView.value.set(surf.yaw, surf.pitch);
    u.uScr.value.set(th, asp);
    u.uPx.value = 2 * th / Math.max(1, size.height);
    if (surf.perfWarm > 0) { surf.perfWarm--; return 1; }
    if (moving) {
      surf.perfT += dt; surf.perfN++;
      if (surf.perfN >= 30) {
        var avg = surf.perfT / surf.perfN;
        surf.perfT = 0; surf.perfN = 0;
        if (avg > 0.034 && base > 0.4) {
          surf.basePR = Math.max(0.4, base - 0.1);
          renderer.setPixelRatio(Math.max(0.35, surf.basePR * 0.6));
          resize();
        }
      }
    }
    return 1;
  }

  function waitFor(fn, max) {
    return new Promise(function (res) {
      var t0 = Date.now();
      (function poll() { if (fn() || Date.now() - t0 > max) res(); else setTimeout(poll, 60); })();
    });
  }

  function dropExplorer(lonDeg, latDeg) {
    if (transitioning || mode !== 'mars') return;
    transitioning = true;
    setArmed(false);
    showFact();
    veil.classList.add('load', 'on');
    wait(480).then(function () {
      if (!surfScene) buildSurface();
      surf.lon = lonDeg * D2R;
      surf.lat = Math.max(-1.52, Math.min(1.52, latDeg * D2R));
      surf.siteKm = siteHeightKm(lonDeg, latDeg);
      var cl = Math.max(0.05, Math.cos(surf.lat));
      eachSM(function (m) {
        m.uniforms.uObsLL.value.set(surf.lon, surf.lat);
        m.uniforms.uSeed.value.set((surf.lon * 3389.5 * cl) % 200, (surf.lat * 3389.5) % 200);
      });
      surf.tOff = 0; surf.fov = 70; surf.pitch = 0.07;
      surf.tex = -1; surf.panoReady = false; surf.panoCur = -1; surf.job = null; surf.building = true;
      surf.hold = true; surf.pmode = -1; surf.panoAge = 0; surf.panoSwap = false; surf.basePR = 0;
      sLow = false; sStill = 0; sIdle = 0;
      mode = 'surface';
      marsUI.hidden = true;
      layoutPop.hidden = true;
      btnLayout.setAttribute('aria-expanded', 'false');
      surfUIEl.hidden = false;
      renderer.setPixelRatio(Math.min(BASE_PR, 1.5));
      resize();
      renderer.domElement.style.cursor = 'grab';
      return Promise.race([Promise.all([requestLevel(1), loadSurfHeight().then(function (h) { surfHeight = h; })]), wait(8000)]);
    }).then(function () {
      applySurfTex();
      tileWant = null;
      tileUpdate(0, 0, false);   // окно детализации в режиме человечка не используется
      return true;
    }).then(function () {
      surfSun();
      var alt =Math.asin(Math.max(-1, Math.min(1, surf.sU)));
      var az = Math.atan2(surf.sE, surf.sN);
      surf.yaw = alt < 0.45 ? az : az + Math.PI;
      surf.perfT = 0; surf.perfN = 0; surf.perfWarm = 30;
      surfHud();
      renderer.compile(panoScene, surfCam);
      renderer.compile(showScene, surfCam);
      renderer.compile(surfScene, surfCam);
      panoStart();
      return waitFor(function () { return surf.panoReady; }, 25000);
    }).then(function () {
      surf.building = false;
      surf.hold = false;
      renderDirty = true;
      return wait(120);
    }).then(function () {
      veil.classList.remove('on');
      surfBack.focus({ preventScroll: true });
      return wait(480);
    }).then(function () { veil.classList.remove('load'); transitioning = false; });
  }

  function closeSurface() {
    if (transitioning || mode !== 'surface') return;
    transitioning = true;
    veil.classList.add('on');
    var lonDeg = surf.lon / D2R, latDeg = surf.lat / D2R;
    wait(480).then(function () {
      mode = 'mars';
      surfUIEl.hidden = true;
      marsUI.hidden = false;
      surf.job = null; surf.panoReady = false; surf.hold = false;
      for (var pi = 0; pi < 2; pi++) { if (panoRT[pi]) { panoRT[pi].dispose(); panoRT[pi] = null; } }
      clearPressed();
      renderer.setPixelRatio(Math.min(BASE_PR, 1.25));
      resize();
      texCur = -1;
      applyTexLevel();
      updateGeoLod();
      flyTo(lonDeg, latDeg, 2.3);
      renderer.domElement.style.cursor = 'grab';
      return wait(100);
    }).then(function () {
      veil.classList.remove('on');
      marsBack.focus({ preventScroll: true });
      return wait(480);
    }).then(function () { transitioning = false; });
  }


  // ---- Домашний сектор: выбор, отметка и сводка -----------------------------------
  var btnHome = document.getElementById('btn-home');
  var homeEl = document.getElementById('mars-home'), surfHomeEl = document.getElementById('surf-home');
  var home = null, homeArmed = false, homeHCache = null;
  try { var hs = JSON.parse(localStorage.getItem('marsHome2') || 'null'); if (hs && isFinite(hs.lon) && isFinite(hs.lat)) home = { lon: hs.lon, lat: hs.lat }; } catch (e) { /* ignore */ }
  function homeTemp() {
    var lon = (home.lon + 0.5) * D2R, lat = (home.lat + 0.5) * D2R;
    var sl = Math.sin(lat), cl = Math.cos(lat);
    var Nn = [cl * Math.cos(lon), sl, -cl * Math.sin(lon)];
    var lagLon = (sunInfo.lonE + 18) * D2R, lagLat = sunInfo.lat * D2R;
    var Ll = [Math.cos(lagLat) * Math.cos(lagLon), Math.sin(lagLat), -Math.cos(lagLat) * Math.sin(lagLon)];
    var flux = marsMat ? marsMat.uniforms.uFlux.value : 586;
    var cz = Math.max(Nn[0] * Ll[0] + Nn[1] * Ll[1] + Nn[2] * Ll[2], 0);
    var sinD = Ll[1], cosD = Math.sqrt(Math.max(1 - sinD * sinD, 1e-4));
    var cH = Math.max(-1, Math.min(1, -(sl / Math.max(cl, 0.02)) * (sinD / cosD)));
    var H0 = Math.acos(cH);
    var Q = Math.max(flux / Math.PI * (H0 * sl * sinD + cl * cosD * Math.sin(H0)), 0);
    var kk = (1 - 0.24) / (0.98 * 5.67e-8);
    var Tn = 0.8 * Math.pow(Q * kk, 0.25), Te = Math.pow(cz * flux * kk, 0.25);
    var T = Math.pow(Math.pow(Tn, 4) + 0.93 * Math.pow(Te, 4), 0.25);
    return Math.max(148, Math.min(318, T)) - 273.15;
  }
  function homeElev() {
    if (homeHCache && homeHCache.key === home.lon + ',' + home.lat) return homeHCache.v;
    var sum = 0, n = 0;
    for (var j = 0; j < 3; j++) for (var i = 0; i < 3; i++) {
      var h = siteHeightKm(home.lon + (i + 0.5) / 3, home.lat + (j + 0.5) / 3);
      if (h === null) return null;
      sum += h; n++;
    }
    homeHCache = { key: home.lon + ',' + home.lat, v: sum / n };
    return homeHCache.v;
  }
  function homeText() {
    if (!home) return '';
    var e = homeElev(), t = homeTemp();
    function sg(v, d) { return (v < 0 ? '−' : v > 0 ? '+' : '') + Math.abs(v).toFixed(d); }
    var la0 = home.lat, la1 = home.lat + 1;
    return 'Home sector ' + lonText(home.lon) + ' – ' + lonText(home.lon + 1) + ' · ' +
      Math.abs(la0) + '°' + (la0 < 0 ? 'S' : la0 > 0 ? 'N' : '') + ' – ' + Math.abs(la1) + '°' + (la1 < 0 ? 'S' : la1 > 0 ? 'N' : '') +
      ' · elevation ≈ ' + (e === null ? '…' : sg(e, 1) + ' km') + ' · temperature ≈ ' + sg(t, 0) + ' °C';
  }
  function updateHome() {
    var tx = homeText();
    homeEl.hidden = !tx; homeEl.textContent = tx;
    surfHomeEl.hidden = !tx; surfHomeEl.textContent = tx;
    if (marsMat) marsMat.uniforms.uHome.value.set(home ? home.lon : 0, home ? home.lon + 1 : 0, home ? home.lat : 0, home ? home.lat + 1 : 0);
    renderDirty = true;
  }
  function setHomeArmed(on) {
    homeArmed = on;
    btnHome.setAttribute('aria-pressed', String(on));
    if (on && typeof pegArmed !== 'undefined' && pegArmed) setArmed(false);
    if (marsHint) marsHint.textContent = on ? 'Click a spot to mark your home area (~60 km) · click it again to clear' : marsHintText;
    if (marsMat) marsMat.uniforms.uGrid.value = (on || gridOn) ? 1 : 0;
    if (mode === 'mars') renderer.domElement.style.cursor = on ? 'crosshair' : 'grab';
    renderDirty = true;
  }
  btnHome.addEventListener('click', function () { if (mode === 'mars' && !transitioning) setHomeArmed(!homeArmed); });
  var homeDown = { x: 0, y: 0 };
  cv.addEventListener('pointerdown', function (e) { homeDown.x = e.clientX; homeDown.y = e.clientY; });
  cv.addEventListener('click', function (e) {
    if (mode !== 'mars' || !homeArmed || transitioning) return;
    if (Math.hypot(e.clientX - homeDown.x, e.clientY - homeDown.y) > 6) return;
    var hit = pickMars(e.clientX, e.clientY);
    if (!hit) return;
    var l0 = Math.max(-180, Math.min(179, Math.floor(hit.lon))), a0 = Math.max(-90, Math.min(89, Math.floor(hit.lat)));
    if (home && home.lon === l0 && home.lat === a0) home = null; else home = { lon: l0, lat: a0 };
    try { if (home) localStorage.setItem('marsHome2', JSON.stringify(home)); else localStorage.removeItem('marsHome2'); } catch (err) { /* ignore */ }
    setHomeArmed(false);
    updateHome();
  });

  // ---- «Человечек»: перетащить на планету или нажать и выбрать точку ---------
  var pegDrag = null, pegArmed = false;
  function setArmed(on) {
    pegArmed = on;
    if (on && homeArmed) setHomeArmed(false);
    pegBtn.setAttribute('aria-pressed', String(on));
    if (marsHint) marsHint.textContent = on ? 'Click a spot to drop a pin, then press “Land here” · click elsewhere to move the pin' : marsHintText;
    if (!on) clearPin();
    if (mode === 'mars') renderer.domElement.style.cursor = on ? 'crosshair' : 'grab';
  }
  function pegEnd() {
    pegDrag = null;
    pegGhost.hidden = true;
    pegGhost.classList.remove('over');
  }
  pegBtn.addEventListener('pointerdown', function (e) {
    if (mode !== 'mars' || transitioning) return;
    e.preventDefault();
    pegDrag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false };
    try { pegBtn.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });
  pegBtn.addEventListener('pointermove', function (e) {
    if (!pegDrag || e.pointerId !== pegDrag.id) return;
    if (!pegDrag.moved && Math.hypot(e.clientX - pegDrag.x0, e.clientY - pegDrag.y0) > 8) {
      pegDrag.moved = true;
      pegGhost.hidden = false;
      setArmed(false);
    }
    if (pegDrag.moved) {
      pegGhost.style.transform = 'translate(' + (e.clientX - 14) + 'px,' + (e.clientY - 38) + 'px)';
      pegGhost.classList.toggle('over', !!pickMars(e.clientX, e.clientY));
    }
  });
  pegBtn.addEventListener('pointerup', function (e) {
    if (!pegDrag || e.pointerId !== pegDrag.id) return;
    var d = pegDrag;
    pegEnd();
    if (d.moved) {
      var hit = pickMars(e.clientX, e.clientY);
      if (hit) { setArmed(true); placePin(hit.lon, hit.lat); }
    } else {
      setArmed(!pegArmed);
    }
  });
  pegBtn.addEventListener('pointercancel', pegEnd);
  pegBtn.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setArmed(!pegArmed); }
  });
  cv.addEventListener('click', function (e) {
    if (mode !== 'mars' || !pegArmed || transitioning) return;
    if (Math.hypot(e.clientX - homeDown.x, e.clientY - homeDown.y) > 6) return;   // это было вращение шара, а не клик
    var hit = pickMars(e.clientX, e.clientY);
    if (hit) placePin(hit.lon, hit.lat);
  });

  // ---- Выбор точки посадки: красная метка + кнопка «Land here» + окно предпросмотра ----
  var landPin = null, lpToken = 0, lpRT = null;
  var lpEl = document.getElementById('land-pin'), lpCard = lpEl.querySelector('.lp-card');
  var lpView = document.getElementById('lp-view'), lpTitle = document.getElementById('lp-title'), lpSub = document.getElementById('lp-sub');
  var lpGo = document.getElementById('lp-go'), lpCancel = document.getElementById('lp-cancel');
  var lpCtx = lpView.getContext('2d');
  var lpV = new THREE.Vector3(), lpC = new THREE.Vector3();
  function clearPin() { landPin = null; lpToken++; lpEl.hidden = true; }
  function placePin(lonDeg, latDeg) {
    landPin = { lon: lonDeg, lat: latDeg };
    lpEl.hidden = false;
    lpTitle.textContent = fmtLonLat(lonDeg, latDeg);
    var h = siteHeightKm(lonDeg, latDeg);
    lpSub.textContent = h === null ? '' : 'elevation ' + (h < 0 ? '−' : '') + Math.abs(h).toFixed(1) + ' km';
    lpView.classList.add('wait');
    updateLandPin();
    var tk = ++lpToken;
    Promise.race([Promise.all([requestLevel(1), loadSurfHeight()]), wait(8000)]).then(function (r) {
      if (r && r[1]) surfHeight = r[1];
      if (tk !== lpToken || !landPin || mode !== 'mars') return;
      return wait(30);
    }).then(function () {
      if (tk !== lpToken || !landPin || mode !== 'mars') return;
      try { drawPreview(landPin.lon, landPin.lat); lpView.classList.remove('wait'); } catch (err) { /* предпросмотр необязателен */ }
    });
  }
  // маленький кадр «что увидим при посадке»: тот же шейдер поверхности, один раз, в маленькую текстуру
  function drawPreview(lonDeg, latDeg) {
    if (!surfScene) buildSurface();
    var use = -1;
    for (var i = MAX_LEVEL; i >= 0; i--) { if (texLv[i].state === 2) { use = i; break; } }
    if (use < 0) return;
    var H = surfHeight || { tex: texLv[use].height, w: H_W, h: H_H };
    var lon = lonDeg * D2R, lat = Math.max(-1.52, Math.min(1.52, latDeg * D2R)), cl = Math.max(0.05, Math.cos(lat));
    var S = sunFor(lon, lat, 0);
    var alt = Math.asin(Math.max(-1, Math.min(1, S.sU))), az = Math.atan2(S.sE, S.sN);
    var W = lpView.width, Ht = lpView.height, th = Math.tan(35 * D2R);
    var u = surfMat.uniforms;
    u.uColor.value = texLv[use].color; u.uHeight.value = H.tex; u.uRes.value.set(H.w, H.h);
    u.uObsLL.value.set(lon, lat);
    u.uSeed.value.set((lon * 3389.5 * cl) % 200, (lat * 3389.5) % 200);
    var bx = (lon / (2 * Math.PI) + 0.5) * H.w, by = (lat / Math.PI + 0.5) * H.h;
    u.uP0.value.set(Math.floor(bx), Math.floor(by), bx - Math.floor(bx), by - Math.floor(by));
    u.uSun.value.set(S.sE, S.sN, S.sU);
    u.uStar.value.set(S.c0[0], S.c1[0], S.c2[0], S.c0[1], S.c1[1], S.c2[1], S.c0[2], S.c1[2], S.c2[2]);
    u.uView.value.set(alt < 0.45 ? az : az + Math.PI, 0.07);
    u.uScr.value.set(th, W / Ht);
    u.uPx.value = 2 * th / Ht;
    if (!lpRT) lpRT = new THREE.WebGLRenderTarget(W, Ht, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, type: THREE.UnsignedByteType, depthBuffer: false, stencilBuffer: false });
    renderer.setRenderTarget(lpRT);
    renderer.render(surfScene, surfCam);
    renderer.setRenderTarget(null);
    var buf = new Uint8Array(W * Ht * 4);
    renderer.readRenderTargetPixels(lpRT, 0, 0, W, Ht, buf);
    var img = lpCtx.createImageData(W, Ht);
    for (var y = 0; y < Ht; y++) img.data.set(buf.subarray((Ht - 1 - y) * W * 4, (Ht - y) * W * 4), y * W * 4);
    lpCtx.putImageData(img, 0, 0);
    surf.tex = -1;   // материалы поверхности перенастроены предпросмотром — при посадке привяжем заново
    renderDirty = true;
  }
  // метка «прикреплена» к точке шара: пересчитываем экранное положение каждый кадр
  function updateLandPin() {
    if (!landPin || mode !== 'mars' || !marsCam) return;
    var facing = true;
    if (flatOn) {
      var px = landPin.lon / 90, c0 = fl.lon / 90;   // ближайшая к центру копия карты
      while (px - c0 > 2) px -= 4;
      while (px - c0 < -2) px += 4;
      lpV.set(px, landPin.lat / 90, 0);
    } else {
      var lo = landPin.lon * D2R, la = landPin.lat * D2R;
      lpV.set(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo));
      marsSpin.localToWorld(lpV);
      lpC.copy(marsCam.position).sub(lpV);
      facing = lpV.dot(lpC) > 0;
    }
    lpEl.style.visibility = facing ? 'visible' : 'hidden';
    if (!facing) return;
    lpV.project(marsCam);
    var x = (lpV.x * 0.5 + 0.5) * window.innerWidth, y = (-lpV.y * 0.5 + 0.5) * window.innerHeight;
    lpEl.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
    var cw = lpCard.offsetWidth || 210, ch = lpCard.offsetHeight || 190;
    var left = (x + 24 + cw > window.innerWidth - 8) ? -(cw + 24) : 24;
    var top = Math.max(8 - y, Math.min(window.innerHeight - 8 - ch - y, -ch * 0.5 - 18));
    lpCard.style.left = left + 'px';
    lpCard.style.top = top + 'px';
  }
  lpGo.addEventListener('click', function () {
    if (!landPin || transitioning || mode !== 'mars') return;
    dropExplorer(landPin.lon, landPin.lat);
  });
  lpCancel.addEventListener('click', clearPin);

  // ---- Управление в режиме поверхности --------------------------------------
  var sptr = {}, sPinch = 0;
  function sCount() { return Object.keys(sptr).length; }
  function sPinchDist() {
    var k = Object.keys(sptr);
    if (k.length < 2) return 0;
    return Math.hypot(sptr[k[0]].x - sptr[k[1]].x, sptr[k[0]].y - sptr[k[1]].y);
  }
  function clampFov(f) { return Math.max(18, Math.min(100, f)); }
  cv.addEventListener('pointerdown', function (e) {
    if (mode !== 'surface') return;
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    sptr[e.pointerId] = { x: e.clientX, y: e.clientY };
    if (sCount() === 2) sPinch = sPinchDist();
    cv.style.cursor = 'grabbing';
  });
  cv.addEventListener('pointermove', function (e) {
    if (mode !== 'surface') return;
    var p = sptr[e.pointerId];
    if (!p) return;
    var dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (sCount() === 1) {
      var k = surf.fov * D2R / window.innerHeight;
      surf.yaw -= dx * k;
      surf.pitch = Math.max(-0.9, Math.min(1.5, surf.pitch + dy * k));
    } else if (sCount() === 2) {
      var d = sPinchDist();
      if (sPinch > 0 && d > 0) surf.fov = clampFov(surf.fov * sPinch / d);
      sPinch = d;
    }
  });
  function sEnd(e) {
    if (!sptr[e.pointerId]) return;
    delete sptr[e.pointerId];
    sPinch = 0;
    if (sCount() === 0 && mode === 'surface') cv.style.cursor = 'grab';
  }
  cv.addEventListener('pointerup', sEnd);
  cv.addEventListener('pointercancel', sEnd);
  cv.addEventListener('wheel', function (e) {
    if (mode !== 'surface') return;
    e.preventDefault();
    var dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    surf.fov = clampFov(surf.fov * Math.exp(dy * 0.001));
  }, { passive: false });

  function holdFov(btn, factor) {
    var timer = 0;
    function stop() { if (timer) { clearInterval(timer); timer = 0; } }
    btn.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      surf.fov = clampFov(surf.fov * factor);
      stop();
      timer = setInterval(function () { surf.fov = clampFov(surf.fov * (factor < 1 ? 0.97 : 1.03)); }, 60);
    });
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointerleave', stop);
    btn.addEventListener('pointercancel', stop);
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); surf.fov = clampFov(surf.fov * factor); }
    });
  }
  holdFov(surfZin, 0.85);
  holdFov(surfZout, 1.18);

  surfBack.addEventListener('click', closeSurface);
  window.addEventListener('keydown', function (e) {
    if (mode === 'mars' && e.key === 'Escape' && pegArmed) { setArmed(false); return; }
    if (mode !== 'surface') return;
    var step = surf.fov * D2R * 0.08;
    if (e.key === 'Escape') closeSurface();
    else if (e.key === 'ArrowLeft') surf.yaw -= step;
    else if (e.key === 'ArrowRight') surf.yaw += step;
    else if (e.key === 'ArrowUp') surf.pitch = Math.min(1.5, surf.pitch + step);
    else if (e.key === 'ArrowDown') surf.pitch = Math.max(-0.9, surf.pitch - step);
    else if (e.key === '+' || e.key === '=') surf.fov = clampFov(surf.fov * 0.9);
    else if (e.key === '-' || e.key === '_') surf.fov = clampFov(surf.fov * 1.1);
  });


  // ---- Плоский вид: развёртка Марса (equirectangular) вместо шара ----------------
  // Те же текстуры, те же LOD (уровни и окно детализации), те же режимы Layout, сетка, домашний сектор и «человечек».
  // Масштаб карты привязан к mv.dist (как у шара), поэтому уровни детализации выбираются той же логикой:
  //   mv.dist = FLAT_D0 + FLAT_K · s,  где s — половина высоты видимой части карты в единицах «вся карта по высоте = 2».
  var flatOn = false, flatScene = null, flatMat = null, flatFly = null;
  var fl = { lon: 0, lat: 0 };                   // центр карты, градусы
  var FLAT_D0 = 1.05, FLAT_K = 4.0, FLAT_S_MIN = 0.04;
  var btnView = document.getElementById('btn-view');
  var flatPan = {};

  var MARS_FLAT_VERT = `
varying vec2 vUv;
varying vec3 vDir;
varying vec3 vViewPos;
varying vec3 vNormalV;
void main(){
  vUv = uv;
  float lon = (uv.x - 0.5) * 6.28318530718;
  float lat = (uv.y - 0.5) * 3.14159265359;
  vDir = vec3(cos(lat) * cos(lon), sin(lat), -cos(lat) * sin(lon));
  vec4 mvp = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mvp.xyz;
  vNormalV = normalize(normalMatrix * vec3(0.0, 0.0, 1.0));
  gl_Position = projectionMatrix * mvp;
}
`;

  function wrap180(a) { a = (a + 180) % 360; if (a < 0) a += 360; return a - 180; }
  function flatFit() { return Math.max(1, 2 / (window.innerWidth / window.innerHeight)); }   // s, при котором видна вся карта
  function flatS() { return Math.max(FLAT_S_MIN, Math.min(flatFit(), (mv.dist - FLAT_D0) / FLAT_K)); }
  function flatClampLat() {
    var maxLat = Math.max(0, 90 * (1 - flatS()));
    fl.lat = Math.max(-maxLat, Math.min(maxLat, fl.lat));
  }

  function buildFlat() {
    flatScene = new THREE.Scene();
    flatMat = new THREE.ShaderMaterial({
      uniforms: marsMat.uniforms,                  // общие uniform'ы: текстуры, окно детализации, режим слоя, Солнце, сетка
      vertexShader: MARS_FLAT_VERT,
      fragmentShader: MARS_FRAG,
      defines: { SHADOW_STEPS: 0, CRATER_LAYERS: 2, FLAT: 1 },
      extensions: { derivatives: true }
    });
    var geo = new THREE.PlaneGeometry(4, 2, 1, 1);   // 4 × 2 единицы: x = lon/90, y = lat/90
    for (var i = -1; i <= 1; i++) {                  // три копии, чтобы карта замыкалась по долготе
      var m = new THREE.Mesh(geo, flatMat);
      m.position.x = i * 4;
      m.frustumCulled = false;
      flatScene.add(m);
    }
  }

  function setFlat(on) {
    if (on === flatOn || transitioning || mode !== 'mars') return;
    if (on) {
      if (!flatScene) buildFlat();
      marsSpin.getWorldQuaternion(tmpQ);
      tmpV.set(0, 0, 1).applyQuaternion(tmpQ.clone().invert());
      fl.lon = Math.atan2(-tmpV.z, tmpV.x) / D2R;
      fl.lat = Math.asin(Math.max(-1, Math.min(1, tmpV.y))) / D2R;
      flatOn = true;
      mv.auto = false; mv.fly = false; mv.userZoomed = true; flatFly = null;
      labelsEl.style.visibility = 'hidden';        // подписи сетки привязаны к шару
      marsHintText = 'Drag to pan · scroll or pinch to zoom · Explorer and Home work on the map too';
      renderer.compile(flatScene, marsCam);
    } else {
      flatOn = false;
      flatFly = null;
      labelsEl.style.visibility = '';
      marsHintText = marsHintInitial;
    }
    if (marsHint && !pegArmed && !homeArmed) marsHint.textContent = marsHintText;
    btnView.setAttribute('aria-checked', String(flatOn));
    renderDirty = true;
  }
  var marsHintInitial = marsHintText;
  btnView.addEventListener('click', function () { setFlat(!flatOn); });

  // перед updateMars: центр и масштаб карты → mv (по ним updateMars выбирает уровни и окно детализации)
  function prepFlat(dt) {
    mv.auto = false; mv.vSpin = 0; mv.vPitch = 0;
    var lo = FLAT_D0 + FLAT_K * FLAT_S_MIN, hi = FLAT_D0 + FLAT_K * flatFit();
    mv.tDist = Math.max(lo, Math.min(hi, mv.tDist));
    mv.dist = Math.max(lo, Math.min(hi, mv.dist));
    if (mv.fly) {                                  // flyTo() из чипов, «Whole planet» и возврата с поверхности
      flatFly = { lon: wrap180(-mv.tSpin / D2R - 90), lat: mv.tPitch / D2R };
      mv.fly = false;
    }
    if (flatFly) {
      var k = 1 - Math.exp(-dt * 4), dl = wrap180(flatFly.lon - fl.lon), da = flatFly.lat - fl.lat;
      fl.lon = wrap180(fl.lon + dl * k);
      fl.lat += da * k;
      if (Math.abs(dl) < 0.05 && Math.abs(da) < 0.05) flatFly = null;
      renderDirty = true;
    }
    flatClampLat();
    var f = faceAngles(fl.lon, fl.lat);
    mv.spin = f.spin; mv.pitch = f.pitch;
  }
  // после updateMars: камера смотрит прямо на плоскость
  function updateFlat() {
    var s = flatS(), zc = s / Math.tan(15 * D2R);   // fov камеры Марса = 30°
    marsCam.position.set(fl.lon / 90, fl.lat / 90, zc);
    marsCam.quaternion.set(0, 0, 0, 1);
    marsCam.updateMatrixWorld(true);
  }
  // экранная точка → долгота/широта на карте
  function pickFlat(cx, cy) {
    var s = flatS(), visH = 2 * s, asp = window.innerWidth / window.innerHeight;
    var x = fl.lon / 90 + ((cx / window.innerWidth) * 2 - 1) * visH * asp / 2;
    var y = fl.lat / 90 - ((cy / window.innerHeight) * 2 - 1) * visH / 2;
    var lat = y * 90;
    if (Math.abs(lat) > 90) return null;
    return { lon: wrap180(x * 90), lat: lat };
  }

  // перетаскивание карты
  cv.addEventListener('pointerdown', function (e) {
    if (mode !== 'mars' || !flatOn) return;
    flatPan[e.pointerId] = { x: e.clientX, y: e.clientY };
    flatFly = null;
  });
  cv.addEventListener('pointermove', function (e) {
    var p = flatPan[e.pointerId];
    if (!p || mode !== 'mars' || !flatOn) return;
    var dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (Object.keys(flatPan).length !== 1) return;   // щипок — это масштаб
    var u = 2 * flatS() / window.innerHeight * 90;     // градусов на пиксель
    fl.lon = wrap180(fl.lon - dx * u);
    fl.lat += dy * u;
    flatClampLat();
    renderDirty = true;
  });
  function flatPanEnd(e) { delete flatPan[e.pointerId]; }
  cv.addEventListener('pointerup', flatPanEnd);
  cv.addEventListener('pointercancel', flatPanEnd);

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
      if (flatOn) prepFlat(marsAcc);
      updateMars(marsAcc);
      if (flatOn) updateFlat();
      marsAcc = 0;
      renderDirty = false;
      renderer.render(flatOn ? flatScene : marsScene, marsCam);
      updateLandPin();
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
})();
