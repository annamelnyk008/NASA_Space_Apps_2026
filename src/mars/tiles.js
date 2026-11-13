import { DET_PAD, DET_TOT, DET_WIN } from '../config.js';
import { TILES, TS } from '../data/tiles.js';
import { buildMosaic, canvasTex } from '../data/mosaic.js';

export function createTiles({ renderer, HEAVY, getMarsMat, getEachSM, onLodChange, onSyncElev, onDirty }) {
  var TILE_MAX = HEAVY ? 5 : 2;
  var tiles = {};
  var state = { tileCur: null, tileWant: null };

  function tileLoadWin(z, lonDeg, latDeg) {
    var Wz = Math.pow(2, z + 1) * TS, Hz = Math.pow(2, z) * TS;
    var cx = (lonDeg + 180) / 360 * Wz, cy = (90 - latDeg) / 180 * Hz;
    var ox = Math.max(0, Math.min(Wz - DET_WIN, Math.round((cx - DET_WIN / 2) / 256) * 256));
    var oy = Math.max(0, Math.min(Hz - DET_WIN, Math.round((cy - DET_WIN / 2) / 256) * 256));
    var key = z + '_' + ox + '_' + oy, T = tiles[key];
    if (T) { T.t = performance.now(); return T; }
    T = tiles[key] = { state: 1, h: null, c: null, t: performance.now(), z: z, ox: ox, oy: oy, cx: cx, cy: cy, key: key, Wz: Wz, Hz: Hz };
    var maxA = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
    var gx0 = ox - DET_PAD, gy0 = oy - DET_PAD;
    T.promise = buildMosaic('color', z, gx0, gy0, DET_TOT, DET_TOT).then(function (cv) {
      T.c = canvasTex(cv, false, false, maxA);
      T.h = null;
      T.ev = {};
      T.state = 2;
      var keys = Object.keys(tiles).filter(function (k) { return tiles[k].state === 2 && tiles[k] !== state.tileCur; });
      if (keys.length > TILE_MAX) {
        keys.sort(function (a, b) { return tiles[a].t - tiles[b].t; });
        while (keys.length > TILE_MAX) {
          var o = tiles[keys.shift()];
          if (o.h) o.h.dispose(); if (o.c) o.c.dispose(); for (var kk in o.ev) if (o.ev[kk].tex) o.ev[kk].tex.dispose();
          delete tiles[o.key];
        }
      }
      return true;
    });
    return T;
  }

  function applyDetail(T) {
    state.tileCur = T || null;
    function setOn(u) {
      if (T) {
        u.uDetC.value = T.c;
        u.uDetRect.value.set(T.ox / T.Wz, 1 - (T.oy + DET_WIN) / T.Hz, DET_WIN / T.Wz, DET_WIN / T.Hz);
        u.uDetOn.value = 1;
      } else { u.uDetOn.value = 0; }
    }
    var marsMat = getMarsMat();
    if (marsMat) setOn(marsMat.uniforms);
    var eachSM = getEachSM();
    if (typeof eachSM === 'function') { try { eachSM(function (m) { setOn(m.uniforms); }); } catch (e) {} }
    onLodChange();
    onSyncElev();
    onDirty();
  }

  function tileUpdate(lonDeg, latDeg, wantIt, z) {
    if (!wantIt) { if (state.tileCur) applyDetail(null); return Promise.resolve(false); }
    z = Math.max(0, Math.min(TILES.zMax, z === undefined ? 3 : z));
    var Wz = Math.pow(2, z + 1) * TS, Hz = Math.pow(2, z) * TS;
    var cx = (lonDeg + 180) / 360 * Wz, cy = (90 - latDeg) / 180 * Hz;
    if (state.tileCur && state.tileCur.z === z && Math.abs(cx - (state.tileCur.ox + DET_WIN / 2)) < 300 && Math.abs(cy - (state.tileCur.oy + DET_WIN / 2)) < 300) {
      state.tileCur.t = performance.now(); return Promise.resolve(true);
    }
    var T = tileLoadWin(z, lonDeg, latDeg);
    if (state.tileWant === T.key && T.state === 1) return T.promise;
    state.tileWant = T.key;
    return T.promise.then(function () {
      if (state.tileWant !== T.key) return false;
      applyDetail(T);
      return true;
    });
  }

  return { tiles, state, tileLoadWin, applyDetail, tileUpdate };
}