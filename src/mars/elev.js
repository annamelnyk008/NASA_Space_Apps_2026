import { DET_PAD, DET_TOT } from '../config.js';
import { TILES, TS, overlay } from '../data/tiles.js';
import { buildMosaic, canvasTex } from '../data/mosaic.js';

export function createElev({
  renderer, getMarsMat, getViewMode, getTexCur, getTileCur,
  getTexLv, getLevels, onDirty
}) {
  const ovFixed = {};

  function dropOtherOv(map, keep) {
    for (const k in map) if (k !== keep) { if (map[k].tex) map[k].tex.dispose(); delete map[k]; }
  }

  function ensureLevelElev(i) {
    const L = getTexLv()[i], id = overlay.id;
    if (L.ev[id]) return L.ev[id].p;
    dropOtherOv(L.ev, id);
    const rec = L.ev[id] = { tex: null, ok: false };
    const maxA = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
    const lv = getLevels()[i];
    rec.p = buildMosaic('elev', lv.z, 0, 0, lv.w, lv.h).then(cv => {
      rec.tex = canvasTex(cv, false, true, maxA);
      rec.ok = cv._ok > 0;
      return rec;
    });
    return rec.p;
  }

  function ensureWinElev(T) {
    const id = overlay.id;
    if (T.ev[id]) return T.ev[id].p;
    dropOtherOv(T.ev, id);
    const rec = T.ev[id] = { tex: null, ok: false };
    const maxA = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
    rec.p = buildMosaic('elev', T.z, T.ox - DET_PAD, T.oy - DET_PAD, DET_TOT, DET_TOT).then(cv => {
      rec.tex = canvasTex(cv, false, false, maxA);
      rec.ok = cv._ok > 0;
      return rec;
    });
    return rec.p;
  }

  function syncElev() {
    const marsMat = getMarsMat();
    const viewMode = getViewMode();
    if (!marsMat || !(viewMode === 1 || viewMode >= 3)) return;
    const u = marsMat.uniforms, id = overlay.id;
    if (id !== 'elev') {
      let fr = ovFixed[id];
      u.uDetEOn.value = 0;
      if (fr && fr.tex) { u.uElev.value = fr.tex; u.uElevOn.value = fr.ok ? 1 : 0; }
      else {
        u.uElevOn.value = 0;
        if (!fr) {
          dropOtherOv(ovFixed, id);
          fr = ovFixed[id] = { tex: null, ok: false };
          const zf = 1, maxF = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
          fr.p = buildMosaic('elev', zf, 0, 0, Math.pow(2, zf + 1) * TS, Math.pow(2, zf) * TS).then(cv => {
            fr.tex = canvasTex(cv, false, true, maxF);
            fr.ok = cv._ok > 0;
            if (id === overlay.id) { syncElev(); onDirty(); }
          });
        }
      }
      onDirty();
      return;
    }
    const texCur = getTexCur();
    const texLv = getTexLv();
    if (texCur >= 0) {
      const rec = texLv[texCur].ev[id];
      if (rec && rec.tex) { u.uElev.value = rec.tex; u.uElevOn.value = rec.ok ? 1 : 0; }
      else {
        u.uElevOn.value = 0;
        ensureLevelElev(texCur).then(() => { if (id === overlay.id) { syncElev(); onDirty(); } });
      }
    }
    const T = getTileCur();
    if (T && T.z < TILES.zSurface - 1) {
      const wr = T.ev[id];
      if (wr && wr.tex) { u.uDetE.value = wr.tex; u.uDetEOn.value = wr.ok ? 1 : 0; }
      else {
        u.uDetEOn.value = 0;
        ensureWinElev(T).then(() => { if (id === overlay.id && getTileCur() === T) { syncElev(); onDirty(); } });
      }
    } else { u.uDetEOn.value = 0; }
    onDirty();
  }

  return { syncElev };
}