
varying vec3 vN;
varying vec3 vV;
void main(){
  vN = normalize(normalMatrix * normal);
  vec4 mvp = modelViewMatrix * vec4(position, 1.0);
  vV = normalize(-mvp.xyz);
  gl_Position = projectionMatrix * mvp;
}
