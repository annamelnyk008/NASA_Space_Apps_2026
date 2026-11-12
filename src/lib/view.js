// Вспомогательные функции камеры глобуса.
import { D2R, MAX_DIST, MIN_DIST } from '../config.js';

// ---- Управление видом ----------------------------------------------------
export function faceAngles(lonDeg, latDeg) {
  var lon = lonDeg * D2R, lat = latDeg * D2R;
  var x = Math.cos(lat) * Math.cos(lon), z = -Math.cos(lat) * Math.sin(lon);
  return { spin: Math.atan2(-x, z), pitch: lat };
}

export function clampDist(d) { return Math.max(MIN_DIST, Math.min(MAX_DIST, d)); }

export function clampFov(f) { return Math.max(18, Math.min(100, f)); }
