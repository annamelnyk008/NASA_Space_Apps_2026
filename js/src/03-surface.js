  // ---- Вид с поверхности: трассировка рельефа, небо Марса, Солнце, звёзды ----
  var SURF_VERT = `
varying vec2 vP;
void main(){ vP = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
  var SURF_BODY = `
uniform sampler2D uColor;
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

// кратеры: ячейка cell км, вероятность prob, глубина = depthK * радиус
float cra(vec2 p, float cell, float prob, float depthK, float w){
  if(w <= 0.002) return 0.0;
  vec2 g = p / cell, id = floor(g), f = g - id;
  float h = 0.0;
  for(int j = -1; j <= 1; j++){
    for(int i = -1; i <= 1; i++){
      vec2 o = vec2(float(i), float(j));
      vec3 r = h32(id + o + 11.7);
      if(r.x > prob) continue;
      vec3 r2 = h32(id + o + 53.1);
      vec2 cen = o + 0.22 + 0.56 * r2.xy;
      float u = r.x / prob;
      float rad = mix(0.10, 0.46, u * u);
      float d = length(f - cen) / rad;
      if(d > 2.2) continue;
      float rk = rad * cell;
      float depth = depthK * rk * (0.6 + 0.4 * r2.z);
      float bowl = d < 1.0 ? -depth * (1.0 - d * d) : 0.0;
      float e = (d - 1.0) / 0.30;
      float rim = 0.20 * depth * exp(-e * e);
      h += bowl + rim;
    }
  }
  return h * w;
}
// камни: ячейка cell км, максимальный радиус maxR км
float rocks(vec2 p, float cell, float maxR, float w){
  if(w <= 0.002) return 0.0;
  vec2 g = p / cell, id = floor(g), f = g - id;
  float h = 0.0;
  for(int j = -1; j <= 1; j++){
    for(int i = -1; i <= 1; i++){
      vec2 o = vec2(float(i), float(j));
      vec3 r = h32(id + o + 91.3);
      if(r.x > 0.5) continue;
      vec2 cen = o + 0.2 + 0.6 * r.yz;
      float rr = maxR * (0.25 + 0.75 * r.z * r.z);
      float dd = length((f - cen) * cell);
      if(dd < rr){
        float q = dd / rr;
        h = max(h, rr * (0.55 + 0.35 * r.y) * sqrt(1.0 - q * q));
      }
    }
  }
  return h * w;
}

vec2 toUV(vec2 q){
  float lat = uObsLL.y + q.y / R_KM;
  float lon = uObsLL.x + q.x / (R_KM * max(cos(uObsLL.y), 0.05));
  return vec2(lon / TWO_PI + 0.5, lat / PI + 0.5);
}

// высота поверхности (км) над касательной плоскостью наблюдателя; t — расстояние от камеры
float gnd(vec2 q, float t){
  gCub = 1.0 - smoothstep(25.0, 80.0, t);
  float h = hKmS(q) - gH0;
  vec2 p = q + uSeed;
  h += 0.030 * fbm2(p * 0.5);                  // пологие холмы
  h += cra(p, 4.0, 0.30, 0.34, 1.0);           // только огромные кратеры
  return h - dot(q, q) / (2.0 * R_KM);
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
  float tMax = 700.0;
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
    float ee = max(0.002, t * 0.006);   // широкий шаг нормалей: гладкое затенение   // шире шаг для нормалей: сглаженное затенение, как модификатор smooth
    float h0 = gnd(q, t);
    float hx = gnd(q + vec2(ee, 0.0), t);
    float hy = gnd(q + vec2(0.0, ee), t);
    vec3 N = normalize(vec3(-(hx - h0) / ee, -(hy - h0) / ee, 1.0));
    // мелкая шероховатость реголита вблизи
    float nearK = 0.0;   // без мелкой шероховатости: вся детализация — в текстуре цвета
    if(nearK > 0.0){
      vec2 pp = (q + uSeed) * 900.0;
      float bx = n2(pp + vec2(0.7, 0.0)) - n2(pp - vec2(0.7, 0.0));
      float by = n2(pp + vec2(0.0, 0.7)) - n2(pp - vec2(0.0, 0.7));
      N = normalize(N + vec3(-bx, -by, 0.0) * 0.55 * nearK);
    }

    // цвет: карта Viking + процедурные вариации
    vec2 uv = toUV(q);
    vec3 alb = pow(colAt(uColor, uv), vec3(2.2));
    float lum = dot(alb, vec3(0.3, 0.59, 0.11));
    alb = mix(alb, vec3(lum) * vec3(1.30, 0.98, 0.72), 0.45) * 1.1;
    vec2 sp2 = q + uSeed;
    float v1 = fbm2(sp2 * 1.6), v2 = fbm2(sp2 * 22.0), v3 = n2(sp2 * 700.0);
    alb *= 1.0 + 0.55 * v1 + 0.30 * v2 * (1.0 - smoothstep(0.5, 6.0, t));
    float dark = smoothstep(0.02, 0.2, v1 + 0.22 * fbm2(sp2 * 0.25));
    alb = mix(alb, alb * vec3(0.62, 0.60, 0.64), (1.0 - dark) * 0.7);
    float rk = 0.0;   // камней нет
    float onRock = smoothstep(0.00002, 0.0002, rk) * nearK;
    alb = mix(alb, vec3(0.085, 0.072, 0.068) * (0.7 + 0.8 * v3), onRock * 0.85);
    alb *= 1.0 - 0.28 * nearK * (v3 - 0.5);

    // тени рельефа в направлении Солнца
    float sh = 1.0;
    if(e > 0.0 && dot(N, uSun) > 0.0){
      float dist = 0.0016;
      for(int i = 0; i < SHADOW_STEPS; i++){
        vec3 sp3 = P + uSun * dist + vec3(0.0, 0.0, 0.0003);
        float g2 = sp3.z - gnd(sp3.xy, t + dist * 3.0);
        sh = min(sh, clamp(g2 * 22.0 / dist, 0.0, 1.0));
        dist *= 1.38;
      }
    }
    float ndl = max(dot(N, uSun), 0.0);
    float m = 1.0 / (max(e, 0.0) + 0.08);
    vec3 Tg = exp(-0.5 * m * vec3(0.80, 1.0, 1.25));
    float sunVis = smoothstep(-0.015, 0.03, e);
    vec3 Esun = vec3(1.0, 0.93, 0.82) * 3.2 * Tg * sunVis * ndl * sh;
    float day = pow(smoothstep(-0.22, 0.35, e), 2.5);
    float tw = smoothstep(-0.36, 0.0, e) * (1.0 - smoothstep(0.0, 0.14, e));
    vec3 Esky = vec3(0.62, 0.45, 0.34) * 0.75 * day * (0.55 + 0.45 * N.z);
    Esky += vec3(0.30, 0.16, 0.14) * tw * 0.17 * (0.6 + 0.4 * N.z);
    Esky += vec3(0.0055, 0.0060, 0.0090);
    col = alb * (Esun + Esky);

    // дымка запылённой атмосферы
    vec3 fogDir = normalize(vec3(rd.xy, 0.05));
    vec3 fogC = skyRad(fogDir);
    float fogA = 1.0 - exp(-(0.040 * min(t, 20.0) + 0.0020 * max(t - 20.0, 0.0)));   // вблизи густо, вдали горы (Олимп) остаются видны
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
        uDetOn: { value: marsMat.uniforms.uDetOn.value },
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
  function surfSun() {
    var ss = marsSolar(Date.now() + surf.tOff);
    surf.ss = ss;
    var la = ss.lat * D2R, lo = ss.lonE * D2R;
    var Lx = Math.cos(la) * Math.cos(lo), Ly = Math.sin(la), Lz = -Math.cos(la) * Math.sin(lo);
    var sl = Math.sin(surf.lat), cl = Math.cos(surf.lat), so = Math.sin(surf.lon), co = Math.cos(surf.lon);
    var E = [-so, 0, -co], Nr = [-sl * co, cl, sl * so], Nn = [cl * co, sl, -cl * so];
    surf.sE = Lx * E[0] + Ly * E[1] + Lz * E[2];
    surf.sN = Lx * Nr[0] + Ly * Nr[1] + Lz * Nr[2];
    surf.sU = Lx * Nn[0] + Ly * Nn[1] + Lz * Nn[2];
    // небесная система: Солнце на долготе 0 (звёзды неподвижны, планета вращается)
    var cs = Math.cos(lo), sn = Math.sin(lo);
    function rot(v) { return [v[0] * cs - v[2] * sn, v[1], v[2] * cs + v[0] * sn]; }
    var c0 = rot(E), c1 = rot(Nr), c2 = rot(Nn);
    var mu = marsMat.uniforms;
    var u0 = surf.lon / (2 * Math.PI) + 0.5, v0 = surf.lat / Math.PI + 0.5;
    eachSM(function (m) {
      m.uniforms.uStar.value.set(c0[0], c1[0], c2[0], c0[1], c1[1], c2[1], c0[2], c1[2], c2[2]);
      m.uniforms.uSun.value.set(surf.sE, surf.sN, surf.sU);
      // точное (double) положение наблюдателя в текселях: целая и дробная части отдельно (float32 в шейдере даёт ступени ~1 м)
      m.uniforms.uDetRect.value.copy(mu.uDetRect.value);
      m.uniforms.uDetOn.value = mu.uDetOn.value;
      var rs = m.uniforms.uRes.value, dr = m.uniforms.uDetRect.value;
      var bx = u0 * rs.x, by = v0 * rs.y;
      m.uniforms.uP0.value.set(Math.floor(bx), Math.floor(by), bx - Math.floor(bx), by - Math.floor(by));
      var dx = (u0 - dr.x) / dr.z * 1024, dy = (v0 - dr.y) / dr.w * 1024;
      m.uniforms.uD0.value.set(Math.floor(dx), Math.floor(dy), dx - Math.floor(dx), dy - Math.floor(dy));
    });
  }

  function applySurfTex() {
    var use = -1;
    for (var i = MAX_LEVEL; i >= 0; i--) { if (texLv[i].state === 2) { use = i; break; } }
    if (use < 0 || use === surf.tex) return;
    surf.tex = use;
    eachSM(function (m) {
      m.uniforms.uColor.value = texLv[use].color;
      m.uniforms.uHeight.value = texLv[use].height;
      m.uniforms.uRes.value.set(H_W, H_H);
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
      return Promise.race([requestLevel(1), wait(5000)]);
    }).then(function () {
      applySurfTex();
      tileWant = null;
      tileUpdate(0, 0, false);   // в режиме человечка окно детализации не используется
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
    if (marsHint) marsHint.textContent = on ? 'Click a spot on the planet to land there' : marsHintText;
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
      if (hit) dropExplorer(hit.lon, hit.lat);
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
    var hit = pickMars(e.clientX, e.clientY);
    if (hit) dropExplorer(hit.lon, hit.lat);
  });

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


