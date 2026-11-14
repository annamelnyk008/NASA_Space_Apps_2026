import { THREE } from '../core/three.js';
import { HEAVY } from '../app/device.js';
import { EXAG } from '../config.js';
import { TEMP_RAMP, K_LO, K_HI } from '../data/colorRamps.js';
import { MARS_VERT, MARS_FRAG, MARS_ATMO_VERT, MARS_ATMO_FRAG } from '../shaders/index.js';
import { makeRampTexture } from './legend.js';

export function createMarsMaterials({ sunObj }) {
  const phColor = new THREE.DataTexture(new Uint8Array([170, 92, 64, 255]), 1, 1, THREE.RGBAFormat);
  phColor.needsUpdate = true;
  const phHeight = new THREE.DataTexture(new Uint8Array([74, 209, 0, 255]), 1, 1, THREE.RGBAFormat);
  phHeight.magFilter = THREE.NearestFilter;
  phHeight.minFilter = THREE.NearestFilter;
  phHeight.generateMipmaps = false;
  phHeight.needsUpdate = true;

  const marsMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: phColor },
      uHeight: { value: phHeight },
      uDetH: { value: phHeight },
      uDetC: { value: phColor },
      uElev: { value: phColor },
      uDetE: { value: phColor },
      uElevOn: { value: 0 },
      uDetEOn: { value: 0 },
      uDetHOn: { value: 0 },
      uDetRect: { value: new THREE.Vector4(0, 0, 1, 1) },
      uDetOn: { value: 0 },
      uRamp: { value: makeRampTexture({ THREE }) },
      uRampT: { value: makeRampTexture({ THREE, tab: TEMP_RAMP, lo: K_LO, hi: K_HI }) },
      uSunLagObj: { value: new THREE.Vector3(1, 0, 0) },
      uFlux: { value: 586 },
      uRes: { value: new THREE.Vector2(2048, 1024) },
      uExag: { value: EXAG },
      uSunObj: { value: sunObj.clone() },
      uMode: { value: 0 },
      uBlank: { value: 0 },
      uPlace: { value: new THREE.Vector4(0, 0, 0, 0) },
      uGrid: { value: 0 },
      uCell: { value: new THREE.Vector4(0, 0, 0, 0) },
      uHome: { value: new THREE.Vector4(0, 0, 0, 0) }
    },
    vertexShader: MARS_VERT,
    fragmentShader: MARS_FRAG,
    defines: { SHADOW_STEPS: HEAVY ? 6 : 0, CRATER_LAYERS: 2 },
    extensions: { derivatives: true }
  });

  const atmoMat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: new THREE.Vector3(1, 0, 0) } },
    vertexShader: MARS_ATMO_VERT,
    fragmentShader: MARS_ATMO_FRAG,
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });

  return { marsMat, atmoMat };
}