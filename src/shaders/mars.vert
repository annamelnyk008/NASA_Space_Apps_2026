
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
