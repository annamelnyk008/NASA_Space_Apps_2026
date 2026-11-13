
varying vec2 vP;
void main(){ vP = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }
