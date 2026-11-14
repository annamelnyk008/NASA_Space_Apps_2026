// markers-routes.glsl — маршрут и точки A/B (панель Markers → Routes). Работает и на шаре, и на плоской карте.
// uRtInfo = (есть A, есть B, число точек маршрута, 0);  uRt — точки маршрута (единичные векторы);
// uRtBound = (центр xyz, cos углового радиуса) — быстрый отсев пикселей вдали от маршрута.
uniform vec3 uRtA;
uniform vec3 uRtB;
uniform vec4 uRtInfo;
uniform vec4 uRtBound;
uniform vec3 uRt[64];

float rtSegDist(vec3 p, vec3 a, vec3 b) {
  vec3 ab = b - a;
  float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-12), 0.0, 1.0);
  return length(p - (a + ab * t));
}

vec3 rtPin(vec3 col, vec3 d, vec3 c, float px, vec3 tint) {
  float dist = length(d - c);
  float r = 8.5 * px;
  float body = 1.0 - smoothstep(r - px, r, dist);
  float rim = 1.0 - smoothstep(r + 1.6 * px, r + 2.6 * px, dist);
  col = mix(col, vec3(1.0), rim * 0.95);
  return mix(col, tint, body);
}

vec3 routeOverlay(vec3 col, vec2 uv) {
  if (uRtInfo.x < 0.5 && uRtInfo.y < 0.5 && uRtInfo.z < 1.5) return col;
  float lon = (uv.x - 0.5) * 6.2831853;
  float lat = (uv.y - 0.5) * 3.1415927;
  vec3 d = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
  float px = max(length(dFdx(d)), length(dFdy(d)));      // размер пикселя (изотропно)
  px = max(px, 1e-7);
  if (uRtInfo.z > 1.5 && dot(d, uRtBound.xyz) > uRtBound.w) {
    float best = 1e9;
    for (int i = 0; i < 63; i++) {
      if (float(i) >= uRtInfo.z - 1.0) break;
      best = min(best, rtSegDist(d, uRt[i], uRt[i + 1]));
    }
    float casing = 1.0 - smoothstep(3.6 * px, 4.8 * px, best);
    float core = 1.0 - smoothstep(2.2 * px, 3.4 * px, best);
    col = mix(col, vec3(1.0), casing * 0.92);
    col = mix(col, vec3(0.16, 0.48, 1.0), core);
  }
  if (uRtInfo.x > 0.5) col = rtPin(col, d, uRtA, px, vec3(0.10, 0.72, 0.36));
  if (uRtInfo.y > 0.5) col = rtPin(col, d, uRtB, px, vec3(0.96, 0.24, 0.20));
  return col;
}
