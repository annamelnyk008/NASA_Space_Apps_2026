
uniform sampler2D uPano;
uniform vec2 uView;
uniform vec2 uScr;
varying vec2 vP;
void main(){
  float cy = cos(uView.x), sy = sin(uView.x), cp = cos(uView.y), sp = sin(uView.y);
  vec3 fw = vec3(sy * cp, cy * cp, sp);
  vec3 rt = vec3(cy, -sy, 0.0);
  vec3 up = vec3(-sy * sp, -cy * sp, cp);
  vec3 rd = normalize(fw + vP.x * uScr.y * uScr.x * rt + vP.y * uScr.x * up);
  float az = atan(rd.x, rd.y);
  if(az < 0.0) az += 6.28318530718;
  float el = asin(clamp(rd.z, -1.0, 1.0));
  gl_FragColor = texture2D(uPano, vec2(az / 6.28318530718, el / 3.14159265359 + 0.5));
}
