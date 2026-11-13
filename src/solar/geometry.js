// Процедурные геометрии астероидов и спутников Марса.
import * as THREE from 'three';
import { rng } from '../lib/math.js';

export function rockGeometry(seed) {
  var g = new THREE.IcosahedronGeometry(1, 1);
  var pos = g.attributes.position, map = {}, rnd = rng(seed);
  for (var i = 0; i < pos.count; i++) {
    var x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    var k = x.toFixed(3) + ',' + y.toFixed(3) + ',' + z.toFixed(3);
    if (map[k] === undefined) map[k] = 0.72 + rnd() * 0.5;
    var s = map[k];
    pos.setXYZ(i, x * s, y * s, z * s);
  }
  g.computeVertexNormals();
  return g;
}

export function moonGeometry(seed) {
  var g = new THREE.IcosahedronGeometry(1, 2);
  var pos = g.attributes.position, map = {}, rnd = rng(seed);
  for (var i = 0; i < pos.count; i++) {
    var x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    var k = x.toFixed(3) + ',' + y.toFixed(3) + ',' + z.toFixed(3);
    if (map[k] === undefined) map[k] = 0.88 + rnd() * 0.22;
    var s = map[k];
    pos.setXYZ(i, x * s, y * s, z * s);
  }
  g.computeVertexNormals();
  return g;
}
