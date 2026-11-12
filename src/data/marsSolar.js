// Положение Солнца над Марсом (Allison & McEwen, Mars24) и направление на Солнце для точки.
import { D2R } from '../config.js';

// ---- Положение Солнца над Марсом (Allison & McEwen, Mars24) -----------
export function marsSolar(ms) {
  var jd = ms / 86400000 + 2440587.5;
  var jdtt = jd + 69.184 / 86400;
  var dj = jdtt - 2451545.0;
  var M = (19.3871 + 0.52402073 * dj) % 360;
  var afms = (270.3871 + 0.524038496 * dj) % 360;
  var A = [0.0071, 0.0057, 0.0039, 0.0037, 0.0021, 0.0020, 0.0018];
  var T = [2.2353, 2.7543, 1.1177, 15.7866, 2.1354, 2.4694, 32.8493];
  var P = [49.409, 168.173, 191.837, 21.736, 15.704, 95.528, 49.095];
  var pbs = 0;
  for (var i = 0; i < 7; i++) pbs += A[i] * Math.cos((0.985626 * dj / T[i] + P[i]) * D2R);
  var Mr = M * D2R;
  var nuM = (10.691 + 3.0e-7 * dj) * Math.sin(Mr) + 0.623 * Math.sin(2 * Mr) + 0.050 * Math.sin(3 * Mr) +
    0.005 * Math.sin(4 * Mr) + 0.0005 * Math.sin(5 * Mr) + pbs;
  var Ls = (afms + nuM) % 360; if (Ls < 0) Ls += 360;
  var Lsr = Ls * D2R;
  var eot = 2.861 * Math.sin(2 * Lsr) - 0.071 * Math.sin(4 * Lsr) + 0.002 * Math.sin(6 * Lsr) - nuM;
  var msd = (jdtt - 2451549.5) / 1.0274912517 + 44796.0 - 0.0009626;
  var mtc = (24 * msd) % 24; if (mtc < 0) mtc += 24;
  var lonW = 15 * (mtc - 12) + eot;
  var lonE = (((-lonW) % 360) + 540) % 360 - 180;
  var dec = Math.asin(0.42565 * Math.sin(Lsr)) / D2R + 0.25 * Math.sin(Lsr);
  return { lonE: lonE, lat: dec, Ls: Ls, mtc: mtc };
}

var MARS_HOUR_MS = 88775244 / 24;

// ---- Солнце в локальных осях (восток, север, зенит) -------------------------
// Солнце и звёзды для точки (lon, lat в радианах): направление на Солнце в осях E,N,Up и матрица звёзд
export function sunFor(lon, lat, tOff) {
  var ss = marsSolar(Date.now() + tOff);
  var la = ss.lat * D2R, lo = ss.lonE * D2R;
  var Lx = Math.cos(la) * Math.cos(lo), Ly = Math.sin(la), Lz = -Math.cos(la) * Math.sin(lo);
  var sl = Math.sin(lat), cl = Math.cos(lat), so = Math.sin(lon), co = Math.cos(lon);
  var E = [-so, 0, -co], Nr = [-sl * co, cl, sl * so], Nn = [cl * co, sl, -cl * so];
  var cs = Math.cos(lo), sn = Math.sin(lo);
  function rot(v) { return [v[0] * cs - v[2] * sn, v[1], v[2] * cs + v[0] * sn]; }   // небесная система: Солнце на долготе 0
  return {
    ss: ss,
    sE: Lx * E[0] + Ly * E[1] + Lz * E[2], sN: Lx * Nr[0] + Ly * Nr[1] + Lz * Nr[2], sU: Lx * Nn[0] + Ly * Nn[1] + Lz * Nn[2],
    c0: rot(E), c1: rot(Nr), c2: rot(Nn)
  };
}
