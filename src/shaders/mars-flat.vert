
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
