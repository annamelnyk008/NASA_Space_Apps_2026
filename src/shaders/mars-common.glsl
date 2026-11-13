
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
