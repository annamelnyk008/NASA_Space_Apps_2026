
uniform sampler2D uColor;   // цвет: мозаика NASA (тот же уровень, что в общем виде)
uniform vec2 uSeed;      // сдвиг процедурных деталей (км)
uniform vec3 uSun;       // направление на Солнце в локальных осях E,N,Up
uniform vec2 uView;      // курс (от севера по часовой), наклон
uniform vec2 uScr;       // tan(половины верт. FOV), aspect
uniform float uPx;       // радиан на пиксель
uniform float uFog;      // множитель густоты дымки: 1 — как в панораме, растёт при приближении (зуме)
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

  // Горизонт: пыльная светящаяся полоса, обесцвеченная и чуть светлее неба выше (как на снимках марсоходов),
  // плюс тёплое рассеяние вперёд в сторону Солнца. Ту же функцию использует дымка рельефа (fogC),
  // поэтому небо и дальний рельеф сходятся в один цвет без шва.
  float hb = exp(-h * 16.0);
  float lumS = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(lumS) * 1.06, 0.28 * hb * day);
  col += vec3(0.20, 0.13, 0.085) * hb * day * 0.30;
  float mie = pow(max(dot(az, saz), 0.0), 6.0);
  col += vec3(0.55, 0.36, 0.20) * mie * hb * day * (0.10 + 0.50 * lowSun) * vis;
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
  // Лучи вдоль горизонта часто упираются в лимит STEPS (особенно в живом виде) задолго до tMax. Раньше поверхность
  // «рисовалась» там, где луч остановился (несколько км), с недостаточной дымкой: получалась розовая полоса
  // с резкой линией у горизонта. Теперь такая поверхность ставится на дальность tMax, где дымка сплошная.
  if(!hit && rd.z < 0.025){ hit = true; t = tMax; tPrev = tMax; }
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
    float fk = max(uFog, 0.2);   // при зуме туман густеет плавно (uFog сглажен на CPU), на границе с панорамой uFog = 1
    float fogA = 1.0 - exp(-(0.025 * min(t, 20.0) + 0.010 * max(t - 20.0, 0.0)) * fk);   // дымка ближе: далёкие неровности не видны
    fogA = max(fogA, smoothstep(80.0 / fk, 230.0 / fk, t));
    float fogL = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, vec3(fogL), 0.40 * fogA);   // воздушная перспектива: даль теряет насыщенность и контраст
    col = mix(col, fogC, fogA);
  } else {
    col = skyRad(rd);
    // у самого горизонта небо плавно приводится к цвету дымки, чтобы не было шва с дальней поверхностью
    col = mix(col, skyRad(normalize(vec3(rd.xy, 0.04))), 1.0 - smoothstep(0.025, 0.09, rd.z));
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
