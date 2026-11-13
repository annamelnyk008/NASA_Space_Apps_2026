
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
vec3 mod289(vec3 x){return x - floor(x * (1.0/289.0)) * 289.0;}
vec4 mod289(vec4 x){return x - floor(x * (1.0/289.0)) * 289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
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
