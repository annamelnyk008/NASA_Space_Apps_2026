// markers-places.glsl — обводка выбранного «места интереса» (панель Markers).
// uPlace = (lon, lat [рад], радиус [рад], активно 0/1). Работает и на шаре, и на плоской карте.
uniform vec4 uPlace;

vec3 placeHighlight(vec3 col, vec2 uv) {
  if (uPlace.w < 0.5) return col;
  float lon = (uv.x - 0.5) * 6.2831853;
  float lat = (uv.y - 0.5) * 3.1415927;
  vec3 d = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
  vec3 c = vec3(cos(uPlace.y) * cos(uPlace.x), sin(uPlace.y), cos(uPlace.y) * sin(uPlace.x));
  float ang = 2.0 * asin(clamp(length(d - c) * 0.5, 0.0, 1.0));
  float fw = max(length(vec2(dFdx(ang), dFdy(ang))), 1e-6);   // угол одного пикселя (изотропно)
  float r = max(uPlace.z, 18.0 * fw);           // не меньше ~18 px при любом масштабе
  float ring = 1.0 - smoothstep(2.0 * fw, 4.0 * fw, abs(ang - r));
  float fill = (1.0 - smoothstep(r - fw, r + fw, ang)) * 0.22;
  float halo = step(r, ang) * exp(-(ang - r) / (7.0 * fw)) * 0.45;
  vec3 hot = vec3(1.0, 0.42, 0.23);
  col = mix(col, hot, clamp(fill + halo, 0.0, 1.0));
  return mix(col, vec3(1.0, 0.93, 0.85), ring * 0.95);
}
