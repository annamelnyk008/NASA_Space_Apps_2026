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
  function syncElev() {
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

