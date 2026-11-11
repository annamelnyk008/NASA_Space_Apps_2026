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

