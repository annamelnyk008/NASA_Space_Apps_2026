
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
