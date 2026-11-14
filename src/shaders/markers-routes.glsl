// markers-routes.glsl — маршрут и точки A/B (панель Markers → Routes). Работает и на шаре, и на плоской карте.
// uRtInfo = (есть A, есть B, число точек маршрута, 0);  uRt — точки маршрута (единичные векторы);
// uRtBound = (центр xyz, cos углового радиуса) — быстрый отсев пикселей вдали от маршрута.
uniform vec3 uRtA;
uniform vec3 uRtB;
uniform vec4 uRtInfo;
uniform vec4 uRtBound;
uniform vec3 uRt[64];

// вектор от ближайшей точки отрезка ab к p
vec3 rtSegVec(vec3 p, vec3 a, vec3 b) {
  vec3 ab = b - a;
  float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-12), 0.0, 1.0);
  return p - (a + ab * t);
}

// Расстояние в ПИКСЕЛЯХ ЭКРАНА от пикселя до объекта: dv — вектор от ближайшей точки объекта к пикселю (на сфере).
// Скорость изменения расстояния на экране берётся вдоль самого dv, поэтому линия и точки остаются одной
// толщины в пикселях и не растягиваются у края шара, где поверхность идёт под скользящим углом.
float rtPixDist(vec3 dv, vec3 d) {
  float dist = length(dv);
  if (dist < 1e-9) return 0.0;
  vec3 g = dv / dist;
  float k = length(vec2(dot(dFdx(d), g), dot(dFdy(d), g)));   // изменение расстояния за пиксель
  return dist / max(k, 1e-9);
}

vec3 rtPin(vec3 col, vec3 d, vec3 c, vec3 tint) {
  float dist = rtPixDist(d - c, d);
  float r = 8.5;
  float body = 1.0 - smoothstep(r - 1.0, r, dist);
  float rim = 1.0 - smoothstep(r + 1.6, r + 2.6, dist);
  col = mix(col, vec3(1.0), rim * 0.95);
  return mix(col, tint, body);
}

vec3 routeOverlay(vec3 col, vec2 uv) {
  if (uRtInfo.x < 0.5 && uRtInfo.y < 0.5 && uRtInfo.z < 1.5) return col;
  float lon = (uv.x - 0.5) * 6.2831853;
  float lat = (uv.y - 0.5) * 3.1415927;
  vec3 d = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
  if (uRtInfo.z > 1.5 && dot(d, uRtBound.xyz) > uRtBound.w) {
    float best = 1e9;
    vec3 bestV = vec3(0.0);
    for (int i = 0; i < 63; i++) {
      if (float(i) >= uRtInfo.z - 1.0) break;
      vec3 v = rtSegVec(d, uRt[i], uRt[i + 1]);
      float l = dot(v, v);
      if (l < best) { best = l; bestV = v; }
    }
    float pd = rtPixDist(bestV, d);
    float casing = 1.0 - smoothstep(3.6, 4.8, pd);
    float core = 1.0 - smoothstep(2.2, 3.4, pd);
    col = mix(col, vec3(1.0), casing * 0.92);
    col = mix(col, vec3(0.16, 0.48, 1.0), core);
  }
  if (uRtInfo.x > 0.5) col = rtPin(col, d, uRtA, vec3(0.10, 0.72, 0.36));
  if (uRtInfo.y > 0.5) col = rtPin(col, d, uRtB, vec3(0.96, 0.24, 0.20));
  return col;
}
