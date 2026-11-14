// sim/sim.js — реалистичная сцена симуляций: плоская поверхность Марса от лица стоящего человека (глаза на 1,7 м).
// Земля — процедурная реголитовая текстура с низким Солнцем; пыль, вихри, летящие камешки — симуляция частиц
// с гравитацией Марса (3,71 м/с²) и разреженным воздухом.
import { mulberry, smoothstep, lerp, stormParams, quakeParams, sunAt, SCENARIOS, project3, visibilityM, CAM_H, G_MARS } from './sim-model.js';
import { fbm, vnoise, rockCell, hash2 } from './noise.js';

const DAY_CLEAR = { top: [150, 108, 86], mid: [188, 140, 106], hor: [216, 170, 130] };
const DAY_STORM = { top: [92, 58, 38], mid: [134, 86, 54], hor: [168, 114, 76] };
const NIGHT = { top: [2, 3, 9], mid: [7, 8, 20], hor: [26, 24, 40] };
const SUN_AZ = 0.26, SUN_EL = 0.28;                 // азимут и высота Солнца, рад (низкое — длинные тени)
const WIND_DIR = -1;                                // ветер дует справа налево
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const rgb = (c, a) => 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + (a === undefined ? 1 : a) + ')';
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export function createSim(deps) {
  const canvas = deps.canvas;
  const g = canvas.getContext('2d');
  const rng = mulberry(11);
  const st = { scenario: null, value: { storm: 5, quake: 5, day: SCENARIOS.day.def, moons: SCENARIOS.moons.def }, sl: 0, night: 0, tod: 14.6, qt: -1, qNext: 0.8, qEnv: 0 };
  const listeners = [];
  const frameHooks = [];
  let W = 0, H = 0, dpr = 1, hy = 0, f = 800, time = 0;
  let raf = 0, last = 0, running = false;
  let stat = null, statNight = null, cloudFar = null, cloudNear = null, milky = null;
  let shake = 0, grainPat = null;
  const grain = (function () { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); const im = x.createImageData(128, 128); for (let i = 0; i < 128 * 128; i++) { const v = Math.floor(rng() * 255); im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; } x.putImageData(im, 0, 0); return c; })();

  // ---------- спрайты ----------
  function sprite(color, mid) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(' + color + ',1)');
    gr.addColorStop(mid || 0.45, 'rgba(' + color + ',0.38)');
    gr.addColorStop(1, 'rgba(' + color + ',0)');
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    return c;
  }
  const sDust = sprite('212,150,98');
  const sDustDk = sprite('70,52,46');

  // ---------- состояние частиц ----------
  const dust = [];          // пыль: выброс, ветер
  const devils = [];        // пылевые вихри
  const wind = [];          // пылинки ветра у земли
  const flyers = [];        // камешки, которые ветер катит и подбрасывает (сальтация)

  function emit() { for (let i = 0; i < listeners.length; i++) listeners[i](api.get()); }

  // ---------- геометрия ----------
  const P0 = { x: 0, y: 0, s: 1 }, P1 = { x: 0, y: 0, s: 1 };

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth || window.innerWidth; H = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    f = W * 0.8; hy = H * 0.56;
    buildStatic();
    buildClouds();
    buildMilky();
  }

  // ---------- процедурная поверхность ----------
  const SUN_L = { h: Math.cos(SUN_EL), y: Math.sin(SUN_EL), x: Math.sin(SUN_AZ), z: Math.cos(SUN_AZ) };
  const fade = (scale, foot) => clamp((scale / foot - 1.6) / 2.2, 0, 1);
  const RK = { h: 0, tone: 0 };

  function heightAt(X, Z, foot, out) {
    let h = 0;
    // дюнные гряды-рифели поперёк ветра
    const wr = fade(1.7, foot);
    if (wr > 0) {
      const ph = (Z * 1.0 + X * 0.22 + 2.6 * vnoise(X / 4, Z / 4, 5)) * (6.2832 / 1.7);
      const s = Math.sin(ph) * 0.5 + 0.5;
      h += s * s * 0.016 * wr * (0.4 + 0.9 * vnoise(X / 9, Z / 9, 7));
    }
    // холмистость и мелкие неровности
    h += (fbm(X / 14, Z / 14, 3, 11) - 0.5) * 0.3 * fade(14, foot);
    h += (fbm(X / 1.3, Z / 1.3, 3, 23) - 0.5) * 0.06 * fade(1.3, foot);
    h += (fbm(X / 0.45, Z / 0.45, 3, 27) - 0.5) * 0.015 * fade(0.45, foot);
    const rh = 0, tone = 0.5;
    out.h = h + rh; out.rock = rh; out.tone = tone;
    return out;
  }

  const HO = { h: 0, rock: 0, tone: 0 }, HO2 = { h: 0, rock: 0, tone: 0 };

  function buildStatic() {
    const rs = Math.min(1, 980 / W);
    const gw = Math.max(2, Math.round(W * rs)), gh = Math.max(2, Math.round(H * rs));
    const fs = f * rs, hys = hy * rs;
    const cv = document.createElement('canvas'); cv.width = gw; cv.height = gh;
    const c = cv.getContext('2d');
    c.setTransform(rs, 0, 0, rs, 0, 0);
    // далёкие хребты (за горизонтом кривизны: края кратера, столовые горы)
    const hazeC = [216, 170, 130], rockC = [146, 94, 66];
    const layers = [
      { amp: 0.085, mixv: 0.62, seed: 3, sc: 340, pw: 1.6, mesa: 0 },
      { amp: 0.052, mixv: 0.45, seed: 9, sc: 210, pw: 1.4, mesa: 0 },
      { amp: 0.024, mixv: 0.28, seed: 15, sc: 120, pw: 1.2, mesa: 7 }
    ];
    for (let L = 0; L < layers.length; L++) {
      const ly = layers[L];
      const col = mix(rockC, hazeC, ly.mixv);
      const top = mix(col, [236, 196, 150], 0.22);
      const gr = c.createLinearGradient(0, hy - ly.amp * H, 0, hy);
      gr.addColorStop(0, rgb(top)); gr.addColorStop(1, rgb(mix(col, hazeC, 0.5)));
      c.fillStyle = gr;
      c.beginPath(); c.moveTo(0, hy + 3);
      for (let x = 0; x <= W + 4; x += 3) {
        let n = fbm(x / ly.sc + L * 7, L * 3.3, 4, ly.seed);
        n = Math.pow(clamp((n - 0.28) / 0.6, 0, 1), ly.pw);
        if (ly.mesa) n = Math.round(n * ly.mesa) / ly.mesa;
        c.lineTo(x, hy - n * ly.amp * H);
      }
      c.lineTo(W + 4, hy + 3); c.closePath(); c.fill();
      // подсветка гребня
      c.strokeStyle = rgb(mix(top, [250, 214, 170], 0.4), 0.28); c.lineWidth = 1;
      c.beginPath();
      for (let x = 0; x <= W + 4; x += 3) {
        let n = fbm(x / ly.sc + L * 7, L * 3.3, 4, ly.seed);
        n = Math.pow(clamp((n - 0.28) / 0.6, 0, 1), ly.pw);
        if (ly.mesa) n = Math.round(n * ly.mesa) / ly.mesa;
        if (x === 0) c.moveTo(x, hy - n * ly.amp * H); else c.lineTo(x, hy - n * ly.amp * H);
      }
      c.stroke();
    }
    // грунт: пиксель → точка на плоскости (X, Z), затем шум, камни, освещение, дымка расстояния
    const y0 = Math.max(0, Math.floor(hys));
    const img = c.getImageData(0, y0, gw, gh - y0);
    const d = img.data;
    const lh = SUN_L.h, ly = SUN_L.y, lx = SUN_L.x / lh, lz = SUN_L.z / lh;
    for (let y = 0; y < img.height; y++) {
      const dy = y0 + y + 0.5 - hys;
      if (dy <= 0.25) continue;
      const Z = fs * CAM_H / dy;
      const footZ = Z * Z / (fs * CAM_H);
      const fogA = (1 - Math.exp(-Z / 14000)) * 0.85;
      for (let x = 0; x < gw; x++) {
        const X = (x + 0.5 - gw / 2) * Z / fs;
        const foot = Math.max(Z / fs, footZ * 0.8);
        heightAt(X, Z, foot, HO);
        const e = Math.max(0.07, foot * 0.9);
        heightAt(X + lx * e, Z + lz * e, foot, HO2);
        const slope = (HO2.h - HO.h) / e;
        const lit = ly - lh * slope;
        let shade = clamp(lit / ly, 0.2, 1.9);
        shade = 1 + (shade - 1) * 0.5;
        // альбедо реголита: тёмный базальтовый песок и светлые пылевые наносы
        const n0 = fbm(X / 80, Z / 80, 3, 61);
        const t0 = smoothstep(0.38, 0.62, n0);
        let r = lerp(150, 116, t0), gg = lerp(96, 72, t0), b = lerp(66, 52, t0);
        const dr = smoothstep(0.6, 0.72, fbm(X / 26, Z / 26, 3, 67));
        r = lerp(r, 176, dr * 0.55); gg = lerp(gg, 126, dr * 0.55); b = lerp(b, 92, dr * 0.55);
        const v = 0.92 + 0.14 * fbm(X / 4, Z / 4, 2, 71);
        r *= v; gg *= v; b *= v;
        if (HO.rock > 0.004) {
          const m = smoothstep(0.004, 0.03, HO.rock);
          const tn = 0.72 + 0.5 * HO.tone;
          r = lerp(r, 98 * tn, m * 0.92); gg = lerp(gg, 72 * tn, m * 0.92); b = lerp(b, 62 * tn, m * 0.92);
        }
        r *= shade; gg *= shade; b *= shade;
        r = lerp(r, hazeC[0], fogA); gg = lerp(gg, hazeC[1], fogA); b = lerp(b, hazeC[2], fogA);
        const nz = (hash2(x, y0 + y, 5) - 0.5) * 4;
        const mf = fade(0.22, foot);
        if (mf > 0) { const mv = 0.94 + 0.12 * fbm(X / 0.22, Z / 0.22, 2, 81); const k2 = 1 + (mv - 1) * mf; r *= k2; gg *= k2; b *= k2; if (hash2(x, y0 + y, 9) > 0.997) { r *= 0.62; gg *= 0.62; b *= 0.62; } }
        const i = (y * gw + x) * 4;
        d[i] = clamp(r + nz, 0, 255); d[i + 1] = clamp(gg + nz, 0, 255); d[i + 2] = clamp(b + nz, 0, 255); d[i + 3] = 255;
      }
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.putImageData(img, 0, y0);
    // камни — объёмные тела, стоящие на грунте (дальше → ближе), с длинными тенями от низкого Солнца
    c.setTransform(rs, 0, 0, rs, 0, 0);
    const rr = mulberry(77), rocksL = [];
    for (let i = 0; i < 260; i++) {
      const Z = 2.2 + Math.pow(rr(), 0.7) * 60;
      const X = (rr() * 2 - 1) * (Z * (W / 2 / f) + 4);
      const sz = 0.03 + Math.pow(rr(), 4.5) * 0.3;
      rocksL.push({ X, Z, sz, tone: rr(), ar: 0.25 + rr() * 0.25, seed: rr() * 1000 });
    }
    rocksL.sort(function (a, b) { return b.Z - a.Z; });
    for (let i = 0; i < rocksL.length; i++) {
      const k = rocksL[i];
      const sx = W / 2 + f * k.X / k.Z, sy = hy + f * CAM_H / k.Z, wpx = k.sz * f / k.Z;
      if (wpx < 0.9 || sx < -60 || sx > W + 60 || sy > H + 60) continue;
      const hpx = wpx * k.ar;
      // тень: на землю в сторону от Солнца (к зрителю и влево), длина = высота / tan(высоты Солнца)
      const shLen = k.sz * k.ar * 0.75 / Math.tan(SUN_EL);
      const shPx = Math.max(1, f * CAM_H * shLen / (k.Z * k.Z));
      c.fillStyle = 'rgba(30,16,10,0.38)';
      c.beginPath(); c.ellipse(sx - wpx * 0.12 - shLen * 0.15 * f / k.Z, sy + shPx * 0.3, wpx * 0.5 + 0.6, shPx * 0.38 + 0.7, 0, 0, 6.283); c.fill();
      // тело: неровный купол
      const tn = 0.7 + 0.55 * k.tone;
      const base = [122 * tn, 84 * tn, 66 * tn];
      const pts = [];
      for (let j = 0; j <= 14; j++) {
        const t = j / 14, ang = Math.PI * t;
        const jit = 0.9 + 0.16 * hash2(j, Math.floor(k.seed), 9);
        pts.push([sx - Math.cos(ang) * wpx * 0.5 * jit, sy - Math.sin(ang) * hpx * jit]);
      }
      const gr = c.createLinearGradient(sx - wpx * 0.5, sy - hpx, sx + wpx * 0.5, sy);
      gr.addColorStop(0, rgb([base[0] * 1.5, base[1] * 1.45, base[2] * 1.4]));
      gr.addColorStop(0.45, rgb(base));
      gr.addColorStop(1, rgb([base[0] * 0.5, base[1] * 0.5, base[2] * 0.5]));
      c.fillStyle = gr;
      c.beginPath(); c.moveTo(sx - wpx * 0.5, sy);
      for (let j = 0; j < pts.length; j++) c.lineTo(pts[j][0], pts[j][1]);
      c.lineTo(sx + wpx * 0.5, sy); c.closePath(); c.fill();
      if (wpx > 5) {                      // светлый край со стороны Солнца
        c.strokeStyle = 'rgba(236,184,140,0.22)'; c.lineWidth = Math.max(0.6, wpx * 0.04);
        c.beginPath(); for (let j = 6; j < pts.length; j++) { if (j === 6) c.moveTo(pts[j][0], pts[j][1]); else c.lineTo(pts[j][0], pts[j][1]); } c.stroke();
        c.fillStyle = 'rgba(40,24,18,0.35)'; c.beginPath(); c.ellipse(sx, sy, wpx * 0.5, Math.max(0.6, wpx * 0.08), 0, 0, Math.PI); c.fill();
      }
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    stat = cv;
    // ночной вариант: тот же грунт при свете звёзд и спутников
    statNight = document.createElement('canvas'); statNight.width = gw; statNight.height = gh;
    const n = statNight.getContext('2d');
    n.drawImage(cv, 0, 0);
    n.globalCompositeOperation = 'source-atop';
    n.fillStyle = 'rgba(10,14,40,0.8)';
    n.fillRect(0, 0, gw, gh);
  }

  // облака пыли: бесшовные текстуры по горизонтали
  function mkCloud(w, h, seed, cellX, cellY) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    const im = x.createImageData(w, h);
    const px = Math.round(w / cellX);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const n = fbm(i / cellX, j / cellY, 5, seed, px);
        let a = clamp((n - 0.36) * 2.5, 0, 1);
        a = a * a * (3 - 2 * a);
        const edge = Math.min(1, Math.min(j, h - 1 - j) / (h * 0.28));     // мягкие верх и низ
        const k = (i + j * w) * 4;
        const br = 0.78 + 0.4 * fbm(i / (cellX * 0.5), j / (cellY * 0.5), 3, seed + 5, px * 2);
        im.data[k] = clamp(204 * br, 0, 255); im.data[k + 1] = clamp(142 * br, 0, 255); im.data[k + 2] = clamp(92 * br, 0, 255);
        im.data[k + 3] = a * edge * 255;
      }
    }
    x.putImageData(im, 0, 0);
    return c;
  }
  function buildClouds() {
    if (!cloudFar) { cloudFar = mkCloud(512, 96, 101, 64, 28); cloudNear = mkCloud(512, 160, 131, 90, 50); }
  }
  function buildMilky() {
    const mw = Math.max(64, Math.round(W / 2)), mh = Math.max(32, Math.round(hy / 2));
    const c = document.createElement('canvas'); c.width = mw; c.height = mh;
    const x = c.getContext('2d');
    const im = x.createImageData(mw, mh);
    for (let j = 0; j < mh; j++) {
      for (let i = 0; i < mw; i++) {
        const u = i / mw, v = j / mh;
        const line = 0.95 - u * 1.05;                                  // диагональ полосы
        const dist = (v - line) * 1.4;
        const band = Math.exp(-dist * dist * 14);
        const cl = fbm(i / 18, j / 18, 5, 211);
        const a = band * clamp((cl - 0.3) * 2.2, 0, 1) * 0.55;
        const k = (i + j * mw) * 4;
        im.data[k] = 176; im.data[k + 1] = 182; im.data[k + 2] = 226; im.data[k + 3] = a * 255;
      }
    }
    x.putImageData(im, 0, 0);
    milky = c;
  }

  // ---------- небо ----------
  const stars = [];
  for (let i = 0; i < 520; i++) { const a = rng(), b = rng(); stars.push({ x: a, y: Math.pow(b, 1.15) * 0.99, r: 0.35 + Math.pow(rng(), 3) * 1.5, a: 0.25 + rng() * 0.75, ph: rng() * 6.28, hue: rng() }); }

  const sunP = { x: 0, y: 0, el: 0.28 };
  const SR_REAL = 2.7;                                  // видимый радиус Солнца на Марсе в кадре, px (диск ≈ 0,35°)

  function drawSky(sl, night) {
    const day = { top: mix(DAY_CLEAR.top, DAY_STORM.top, sl), mid: mix(DAY_CLEAR.mid, DAY_STORM.mid, sl), hor: mix(DAY_CLEAR.hor, DAY_STORM.hor, sl) };
    const top = mix(day.top, NIGHT.top, night), mid = mix(day.mid, NIGHT.mid, night), hor = mix(day.hor, NIGHT.hor, night);
    const gr = g.createLinearGradient(0, 0, 0, hy);
    gr.addColorStop(0, rgb(top)); gr.addColorStop(0.55, rgb(mid)); gr.addColorStop(1, rgb(hor));
    g.fillStyle = gr; g.fillRect(0, 0, W, hy + 2);
    const tau = stormParams(sl * 10).tau;
    const sp = sunP, el = sp.el, moons = st.scenario === 'moons';
    // у горизонта закатное Солнце окружено голубым ореолом, остальное небо остаётся «карамельным»
    const lowK = 1 - smoothstep(0.02, 0.3, el), tw = smoothstep(-0.16, -0.02, el);
    const dim = Math.exp(-tau * 0.55) * (1 - night);
    const blue = lowK * tw * (1 - sl * 0.8);
    if (blue > 0.01) {
      g.save(); g.beginPath(); g.rect(0, 0, W, hy + 1); g.clip();
      const R = H * (0.42 + 0.35 * lowK);
      const bg = g.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, R);
      bg.addColorStop(0, 'rgba(110,165,255,' + (0.62 * blue).toFixed(3) + ')');
      bg.addColorStop(0.35, 'rgba(80,130,225,' + (0.3 * blue).toFixed(3) + ')');
      bg.addColorStop(1, 'rgba(60,100,200,0)');
      g.fillStyle = bg; g.fillRect(sp.x - R, sp.y - R, R * 2, R * 2);
      g.restore();
    }
    // Солнце: на Марсе вдвое меньше по видимому диаметру, чем над Землёй
    const SR = moons ? 11 : SR_REAL * 1.8;
    if (dim > 0.008 || blue > 0.05) {
      const dd = Math.max(dim, blue * 0.9);
      const R = Math.max(90, H * 0.3);
      const halo = g.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, R);
      halo.addColorStop(0, 'rgba(170,196,236,' + (0.5 * dd * (1 - sl * 0.7)).toFixed(3) + ')');
      halo.addColorStop(0.25, 'rgba(186,196,214,' + (0.18 * dd).toFixed(3) + ')');
      halo.addColorStop(1, 'rgba(190,196,210,0)');
      g.fillStyle = halo; g.fillRect(sp.x - R, sp.y - R, R * 2, R * 2);
      const cr = SR * 2.6;
      const core = g.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, cr);
      core.addColorStop(0, 'rgba(255,250,240,' + Math.min(1, dd * 1.6).toFixed(3) + ')');
      core.addColorStop(0.4, 'rgba(236,240,255,' + Math.min(1, dd).toFixed(3) + ')');
      core.addColorStop(1, 'rgba(255,230,200,0)');
      g.fillStyle = core; g.fillRect(sp.x - cr, sp.y - cr, cr * 2, cr * 2);
      g.fillStyle = 'rgba(255,252,246,' + Math.min(1, dd * 1.8).toFixed(3) + ')';
      g.beginPath(); g.arc(sp.x, sp.y, SR, 0, 6.283); g.fill();
    }
    if (sl > 0.05) {
      const R2 = H * 0.5;
      const ge = g.createRadialGradient(sp.x, sp.y, 0, sp.x, sp.y, R2);
      ge.addColorStop(0, 'rgba(255,168,98,' + (0.22 * sl * (1 - night)).toFixed(3) + ')');
      ge.addColorStop(1, 'rgba(255,168,98,0)');
      g.fillStyle = ge; g.fillRect(sp.x - R2, sp.y - R2, R2 * 2, R2 * 2);
    }
    if (night > 0.02) drawNightSky(night);
    if (moons) drawPhobosTransit(SR);
  }

  // Фобос проходит по диску Солнца: его диск ≈ 0,57 солнечного (≈ 0,2° против 0,35°). Для наглядности размеры увеличены,
  // а проход замедлен (в реальности — до ~30 с).
  const PH_CYCLE = 20;
  function drawPhobosTransit(SR) {
    const sp = sunP;
    if (sp.el < -0.03) return;
    const u = (time % PH_CYCLE) / PH_CYCLE;
    const ox = (0.5 - u) * 2 * 110, oy = (0.5 - u) * 2 * -9;
    const px = sp.x + ox, py = sp.y + oy, pr = SR * 0.57;
    if (py > hy + pr) return;
    g.save(); g.beginPath(); g.rect(0, 0, W, hy + 1); g.clip();
    const over = Math.hypot(ox, oy) < SR + pr;
    g.fillStyle = over ? 'rgb(28,22,22)' : 'rgb(104,88,80)';
    g.beginPath(); g.ellipse(px, py, pr * 1.08, pr * 0.92, -0.35, 0, 6.283); g.fill();
    g.restore();
    if (py < hy - 14) {
      g.fillStyle = 'rgba(255,240,225,0.85)'; g.font = '600 12px Inter, system-ui, sans-serif'; g.textAlign = 'center';
      g.fillText(Math.hypot(ox, oy) < SR ? 'Phobos transit' : 'Phobos', px, py - pr - 8);
      g.textAlign = 'start';
    }
  }

  function drawNightSky(night) {
    if (milky) { g.globalAlpha = 0.85 * night; g.drawImage(milky, 0, 0, W, hy); g.globalAlpha = 1; }
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const tw = 0.82 + 0.18 * Math.sin(time * 1.7 + s.ph);
      const a = s.a * tw * night * (1 - 0.7 * smoothstep(0.7, 1, s.y));   // у горизонта ярче поглощаются
      g.fillStyle = s.hue < 0.2 ? 'rgba(255,214,190,' + a.toFixed(3) + ')' : s.hue > 0.8 ? 'rgba(200,216,255,' + a.toFixed(3) + ')' : 'rgba(255,252,246,' + a.toFixed(3) + ')';
      g.beginPath(); g.arc(s.x * W, s.y * hy, s.r, 0, 6.283); g.fill();
    }
    // Фобос (≈ 0,2° — втрое мельче нашей Луны, быстро ползёт по небу) и точка Деймоса
    const phx = ((time * 6 + W * 0.15) % (W * 1.2)) - W * 0.1, phy = hy * 0.34 - Math.sin(phx / W * 3.1) * hy * 0.08;
    g.globalAlpha = night;
    const gl = g.createRadialGradient(phx, phy, 0, phx, phy, 22);
    gl.addColorStop(0, 'rgba(200,190,180,0.3)'); gl.addColorStop(1, 'rgba(200,190,180,0)');
    g.fillStyle = gl; g.fillRect(phx - 22, phy - 22, 44, 44);
    g.fillStyle = 'rgb(168,158,148)';
    g.beginPath(); g.ellipse(phx, phy, 5.4, 4.6, -0.3, 0, 6.283); g.fill();
    g.fillStyle = 'rgba(40,36,34,0.5)';
    g.beginPath(); g.ellipse(phx + 1.6, phy + 0.8, 3.2, 3.8, -0.3, -0.6, 1.9); g.fill();
    g.fillStyle = 'rgba(70,64,60,0.5)'; g.beginPath(); g.arc(phx - 1.8, phy - 1, 1.1, 0, 6.283); g.fill();
    const dx = ((time * 1.6 + W * 0.7) % (W * 1.2)) - W * 0.1, dy = hy * 0.22 + Math.sin(dx / W * 2) * hy * 0.05;
    const moons = st.scenario === 'moons';
    if (moons) {                                       // Деймос выглядит яркой звездой
      const dgl = g.createRadialGradient(dx, dy, 0, dx, dy, 14);
      dgl.addColorStop(0, 'rgba(255,246,230,0.8)'); dgl.addColorStop(1, 'rgba(255,246,230,0)');
      g.fillStyle = dgl; g.fillRect(dx - 14, dy - 14, 28, 28);
    }
    g.fillStyle = 'rgb(240,230,216)'; g.beginPath(); g.arc(dx, dy, moons ? 2.2 : 1.6, 0, 6.283); g.fill();
    if (moons) {
      g.fillStyle = 'rgba(255,240,225,0.8)'; g.font = '600 12px Inter, system-ui, sans-serif'; g.textAlign = 'center';
      g.fillText('Deimos', dx, dy - 12); g.fillText('Phobos', phx, phy - 14); g.textAlign = 'start';
    }
    g.globalAlpha = 1;
  }

  // ---------- облака и дымка бури ----------
  function drawClouds(img, y, h, alpha, scroll, scale) {
    if (alpha <= 0.01) return;
    const w = img.width * scale * (W / 1100 > 1 ? W / 1100 : 1);
    let x0 = -((scroll % w) + w) % w;
    g.globalAlpha = alpha;
    for (let x = x0; x < W; x += w) g.drawImage(img, x, y, w + 1, h);
    g.globalAlpha = 1;
  }

  function fogColor(sl) { return mix([216, 170, 130], [172, 116, 76], sl); }

  function drawStormBack(sl, windMs) {
    if (sl <= 0.02) return;
    // стена пыли у горизонта — её вдали видно раньше всего
    drawClouds(cloudFar, hy - H * (0.05 + 0.3 * sl), H * (0.1 + 0.34 * sl), Math.min(0.9, sl * 1.2), time * windMs * 2.2, 2.4);
    drawClouds(cloudNear, hy - H * (0.02 + 0.2 * sl), H * (0.08 + 0.26 * sl), Math.min(0.7, sl), time * windMs * 3.6 + 140, 3.4);
  }

  function drawStormFront(sl, windMs, night) {
    if (sl <= 0.015) return;
    const tau = stormParams(sl * 10).tau * (1 + 0.8 * sl * sl), vis = visibilityM(tau);
    const fc = fogColor(sl);
    // атмосферное ослабление: расстояние → непрозрачность дымки (Z = f·h / (y − hy))
    const gr = g.createLinearGradient(0, hy, 0, H);
    for (let i = 0; i <= 10; i++) {
      const t = i / 10, y = hy + (H - hy) * t * t;
      const Z = f * CAM_H / Math.max(0.6, y - hy);
      gr.addColorStop(Math.min(1, (y - hy) / (H - hy)), rgb(fc, clamp(1 - Math.exp(-Z / vis), 0, 0.96) * 0.95));
    }
    g.fillStyle = gr; g.fillRect(0, hy, W, H - hy);
    // хребты на горизонте (≈ 15–30 км): тают в пыли
    const ah = clamp(1 - Math.exp(-20000 / vis), 0, 0.97);
    const gh2 = g.createLinearGradient(0, hy - H * 0.14, 0, hy);
    gh2.addColorStop(0, rgb(fc, 0)); gh2.addColorStop(0.5, rgb(fc, ah * 0.6)); gh2.addColorStop(1, rgb(fc, ah));
    g.fillStyle = gh2; g.fillRect(0, hy - H * 0.14, W, H * 0.14 + 1);
    // ближние пылевые полосы у земли
    drawClouds(cloudNear, hy + (H - hy) * 0.02, (H - hy) * 0.55, Math.min(0.5, sl * 0.55), time * windMs * 8, 4.6);
    // общее потемнение: в густой пыли света на поверхности остаются проценты
    const gust = 0.85 + 0.15 * Math.sin(time * 1.1) * Math.sin(time * 0.43 + 1);
    g.fillStyle = 'rgba(30,14,6,' + ((0.5 + 0.14 * smoothstep(0.7, 1, sl)) * smoothstep(0.2, 1, sl) * gust).toFixed(3) + ')';
    g.fillRect(0, 0, W, H);
  }

  // ---------- пыль ветра и вихри (3D-частицы) ----------
  function ensureWindDust(sl, windMs) {
    const target = Math.round(520 * smoothstep(0.02, 0.5, sl) + 520 * smoothstep(0.6, 1, sl));
    while (wind.length < target) {
      const z = 3 + Math.pow(rng(), 1.8) * 160;
      wind.push({ x: (rng() * 2 - 1) * z * 0.7, y: rng() * rng() * 7, z, r: 0.012 + rng() * 0.05, a: 0.1 + rng() * 0.28, ph: rng() * 6.28, w: true });
    }
    if (wind.length > target) wind.length = target;
    return windMs;
  }

  function stepFlyers(dt, sl, windMs) {
    const k = smoothstep(0.35, 1, sl);
    const want = k * (4 + 70 * k) * dt;                         // штук в секунду растёт с силой бури
    let n = want; while (n > 0 && flyers.length < 220) { if (rng() < Math.min(1, n)) {
      const z = 2.5 + Math.pow(rng(), 1.4) * 70;
      flyers.push({ x: z * (0.55 + rng() * 0.35), y: rng() * 0.8, z, vx: WIND_DIR * windMs * (0.45 + rng() * 0.5), vy: 1 + rng() * 3.5, vz: (rng() - 0.5) * 3, r: 0.015 + Math.pow(rng(), 2.2) * 0.09, rot: 0, px: 0, py: 0, ok: false });
    } n -= 1; }
    for (let i = flyers.length - 1; i >= 0; i--) {
      const p = flyers[i];
      p.vx += WIND_DIR * windMs * 0.9 * dt * 0.8 - p.vx * 0.0 ;          // ветер подгоняет камешек
      p.vx = Math.max(p.vx, -windMs * 0.95);
      p.x += p.vx * dt; p.z += p.vz * dt; p.vy -= G_MARS * dt; p.y += p.vy * dt;
      if (p.y <= 0) {                                                       // отскок от грунта с потерей энергии
        p.y = 0; p.vy = Math.abs(p.vy) * 0.55 + rng() * 0.8;
        if (dust.length < 2400 && rng() < 0.5) dust.push({ x: p.x, y: 0.05, z: p.z, vx: p.vx * 0.2, vy: 0.5 + rng(), vz: 0, r: 0.12 + p.r, t: 0, life: 1.4, a: 0.25, grow: 1.2, hot: 0 });
      }
      if (p.x < -p.z * 0.95 || p.z < 1.5) flyers.splice(i, 1);
    }
  }

  function stepWindDust(dt, windMs) {
    for (let i = 0; i < wind.length; i++) {
      const p = wind[i];
      p.x += WIND_DIR * windMs * (0.55 + 0.4 * Math.sin(p.ph + time * 0.7)) * dt;
      p.y += Math.sin(time * 1.3 + p.ph) * 0.4 * dt;
      if (p.y < 0) p.y = 0;
      if (p.x < -p.z * 0.75) { p.x = p.z * 0.75; p.y = rng() * rng() * 7; }
    }
  }

  function setupDevils(sl) {
    const want = sl <= 0.01 ? 0 : Math.min(3, Math.ceil(sl * 5));
    while (devils.length < want) {
      const z = 60 + rng() * 240;
      const dv = { x: (rng() * 2 - 1) * z * 0.6, z, H: 40 + rng() * 80, parts: [], ph: rng() * 6.28 };
      for (let i = 0; i < 90; i++) dv.parts.push({ h: rng() * dv.H, a: rng() * 6.28, w: 0.8 + rng() * 0.5 });
      devils.push(dv);
    }
    if (devils.length > want) devils.length = want;
  }

  function stepDevils(dt, windMs) {
    for (let i = 0; i < devils.length; i++) {
      const dv = devils[i];
      dv.x += WIND_DIR * windMs * 0.18 * dt;
      if (dv.x < -dv.z * 0.8) dv.x = dv.z * 0.8;
      for (let k = 0; k < dv.parts.length; k++) {
        const p = dv.parts[k];
        p.h += 7.5 * dt * p.w;
        p.a += (2.6 + 7 / (1 + p.h / 8)) * dt;
        if (p.h > dv.H) { p.h = 0; p.a = rng() * 6.28; }
      }
    }
  }

  // ---------- пыль: оседание и снос ветром ----------
  function stepEffects(dt, sl) {
    for (let i = dust.length - 1; i >= 0; i--) {
      const p = dust[i]; p.t += dt;
      if (p.t > p.life) { dust.splice(i, 1); continue; }
      const k = Math.exp(-0.5 * dt);
      p.vx *= k; p.vz *= k; p.vy = p.vy * k - G_MARS * 0.12 * dt;     // мелкая пыль почти висит в воздухе
      p.vx += WIND_DIR * 0.4 * dt * (sl * 8 + 0.2);
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.05) { p.y = 0.05; p.vy = Math.abs(p.vy) * 0.2; }
      p.r += p.grow * dt * 0.4;
    }
  }

  function drawEffects(night) {
    // пыль (дальше → ближе), тёмная ночью; освещается вспышками
    const list = [];
    for (let i = 0; i < dust.length; i++) list.push(dust[i]);
    for (let i = 0; i < wind.length; i++) list.push(wind[i]);
    for (let d = 0; d < devils.length; d++) {
      const dv = devils[d];
      for (let k = 0; k < dv.parts.length; k++) {
        const p = dv.parts[k], rad = 1.2 + p.h * 0.1;
        list.push({ x: dv.x + Math.cos(p.a) * rad, y: p.h, z: dv.z + Math.sin(p.a) * rad, r: 0.9 + p.h * 0.05, a: 0.3 * (1 - p.h / dv.H) * 0.9, dv: true });
      }
    }
    list.sort(function (a, b) { return b.z - a.z; });
    const tau = stormParams(st.sl * 10).tau * (1 + 0.8 * st.sl * st.sl), vis = visibilityM(tau);
    const spr = night > 0.5 ? sDustDk : sDust;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (p.z < 2) continue;
      project3(f, W, hy, p.x, p.y, p.z, P0);
      let a = p.a !== undefined ? p.a : 0.3;
      if (p.life) a *= Math.min(1, p.t * 5) * (1 - Math.pow(p.t / p.life, 1.5));
      a *= Math.exp(-p.z / (vis * 2.2));
      if (a < 0.008) continue;
      let sz = Math.max(1.2, p.r * P0.s);
      if (p.w && sz > 7) sz = 7;
      if (P0.x < -sz || P0.x > W + sz || P0.y < -sz || P0.y > H + sz) continue;
      g.globalAlpha = Math.min(0.9, a);
      g.drawImage(spr, P0.x - sz, P0.y - sz, sz * 2, sz * 2);
    }
    g.globalAlpha = 1;
    // камешки, летящие по ветру: тёмные точки со смазом
    g.lineCap = 'round';
    for (let i = 0; i < flyers.length; i++) {
      const p = flyers[i];
      project3(f, W, hy, p.x, p.y, p.z, P0);
      const sz = clamp(p.r * P0.s, 0.9, 4);
      if (p.ok) {
        let dx = P0.x - p.px, dy = P0.y - p.py; const L = Math.hypot(dx, dy);
        if (L > 0.5 && L < 220) {
          const k = Math.min(1, 16 / L);                                   // короткий смаз, не длиннее ~16 px
          g.strokeStyle = 'rgba(80,56,46,' + (0.4 * Math.exp(-p.z / (vis * 2))).toFixed(2) + ')'; g.lineWidth = Math.max(1, sz * 0.9);
          g.beginPath(); g.moveTo(P0.x - dx * k, P0.y - dy * k); g.lineTo(P0.x, P0.y); g.stroke();
        }
      }
      g.fillStyle = 'rgba(96,68,54,' + Math.exp(-p.z / (vis * 2)).toFixed(2) + ')';
      g.beginPath(); g.arc(P0.x, P0.y, sz, 0, 6.283); g.fill();
      p.px = P0.x; p.py = P0.y; p.ok = true;
    }
    g.globalCompositeOperation = 'source-over';
  }

  // ---------- кадр ----------
  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    step(dt);
  }

  function step(dt) {
    time += dt;
    const sc = st.scenario;
    if (W !== (canvas.clientWidth || window.innerWidth) || H !== (canvas.clientHeight || window.innerHeight) || !stat) resize();
    const tgtStorm = sc === 'storm' ? st.value.storm / 10 : 0;
    st.sl += (tgtStorm - st.sl) * Math.min(1, dt * 1.1);
    if (Math.abs(st.sl - tgtStorm) < 0.002) st.sl = tgtStorm;
    // время суток: сценарии «день/ночь» и «луны» двигают его ползунком, остальные показывают послеполуденный свет
    const tgtT = SCENARIOS[sc] && SCENARIOS[sc].time ? st.value[sc] / 4 : 14.6;
    st.tod += (tgtT - st.tod) * Math.min(1, dt * 4);
    if (Math.abs(st.tod - tgtT) < 0.003) st.tod = tgtT;
    const sun = sunAt(st.tod);
    sunP.x = W / 2 + f * Math.tan(sun.az); sunP.y = hy - f * Math.tan(sun.el) / Math.cos(sun.az); sunP.el = sun.el;
    st.night = 1 - smoothstep(-0.1, 0.04, sun.el);
    const sl = st.sl, night = st.night;
    // марсотрясение: короткая P-волна, затем S-волна с затуханием; события повторяются (на самом деле они редки)
    let qEnv = 0;
    if (sc === 'quake' && st.value.quake > 0) {
      const qp = quakeParams(st.value.quake);
      st.qNext -= dt;
      if (st.qt < 0 && st.qNext <= 0) st.qt = 0;
      if (st.qt >= 0) {
        st.qt += dt;
        const t = st.qt, S = 1.6, dur = qp.shakeSec;
        const pw = t < S ? 0.16 * smoothstep(0, 0.6, t) : 0;
        const sw = t >= S ? smoothstep(S, S + 0.7, t) * Math.exp(-(t - S - 0.7) / (dur / 3)) : 0;
        qEnv = Math.max(pw, sw) * (0.14 + 0.86 * Math.pow(qp.amp, 1.1));
        if (t > S + 0.7 + dur * 1.3) { st.qt = -1; st.qNext = 4 + rng() * 3; }
      }
    } else { st.qt = -1; }
    st.qEnv = qEnv;
    if (qEnv > 0.03) {
      let n = qEnv * 150 * dt;
      while (n > 0) {
        if (rng() < Math.min(1, n) && dust.length < 2400) {
          const z = 4 + Math.pow(rng(), 1.6) * 90;
          dust.push({ x: (rng() * 2 - 1) * z * 0.8, y: 0.05, z, vx: (rng() - 0.5), vy: 0.8 + rng() * (1.5 + 3 * qEnv), vz: 0, r: 0.25 + rng() * 0.4, t: 0, life: 1.6 + rng() * 2, a: 0.3, grow: 1.3, hot: 0 });
        }
        if (rng() < Math.min(1, n * 0.35) && flyers.length < 220) {
          const z = 3 + Math.pow(rng(), 1.5) * 40;
          flyers.push({ x: (rng() * 2 - 1) * z * 0.6, y: 0, z, vx: (rng() - 0.5) * 0.6, vy: 0.8 + rng() * 3.2 * qEnv, vz: (rng() - 0.5) * 0.8, r: 0.015 + Math.pow(rng(), 2.2) * 0.08, rot: 0, px: 0, py: 0, ok: false });
        }
        n -= 1;
      }
    }
    const windMs = stormParams(sl * 10).wind * (sl > 0.01 ? 1 : 0.4);
    ensureWindDust(sl, windMs); stepWindDust(dt, windMs);
    setupDevils(sl); stepDevils(dt, windMs);
    stepEffects(dt, sl);
    stepFlyers(dt, sl, windMs);
    for (let i = 0; i < frameHooks.length; i++) frameHooks[i]({ storm: sl, wind: windMs, night, quake: qEnv, scenario: sc, level: sc ? st.value[sc] : 0 });

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalAlpha = 1;
    g.save();
    shake *= Math.exp(-dt * 6);
    if (shake > 0.01) g.translate((rng() - 0.5) * 9 * shake, (rng() - 0.5) * 7 * shake);
    if (qEnv > 0.02) shake = Math.max(shake, qEnv * 1.6);
    if (sl > 0.7) shake = Math.max(shake, 0.1 * (sl - 0.7) / 0.3 * (0.6 + 0.4 * Math.sin(time * 2.3)));   // порывы бьют по «камере»
    drawSky(sl, night);
    drawStormBack(sl, windMs);
    g.drawImage(stat, 0, 0, W, H);
    if (night > 0.01) { g.globalAlpha = night; g.drawImage(statNight, 0, 0, W, H); g.globalAlpha = 1; }
    const dusk = clamp(1 - (sun.el + 0.02) / 0.22, 0, 1) * (1 - night) * 0.38;      // низкое Солнце: грунт темнеет
    if (dusk > 0.01) { g.fillStyle = 'rgba(18,10,34,' + dusk.toFixed(3) + ')'; g.fillRect(0, hy, W, H - hy); }
    drawEffects(night);
    drawStormFront(sl, windMs, night);
    g.restore();
    // оптика камеры: лёгкая виньетка и плёночное зерно
    const vg = g.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.45, W / 2, H * 0.55, Math.max(W, H) * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.32)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    if (grain) {
      g.save(); g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.07;
      g.translate(-Math.floor(rng() * 128), -Math.floor(rng() * 128));
      g.fillStyle = grainPat || (grainPat = g.createPattern(grain, 'repeat'));
      g.fillRect(0, 0, W + 128, H + 128); g.restore();
    }
  }

  const api = {
    start() { if (running) return; running = true; resize(); last = performance.now(); raf = requestAnimationFrame(frame); },
    stop() { running = false; cancelAnimationFrame(raf); },
    resize, step,
    onChange(fn) { listeners.push(fn); },
    onFrame(fn) { frameHooks.push(fn); },
    get() { return { scenario: st.scenario, value: st.scenario ? st.value[st.scenario] : 0, tod: st.tod }; },
    setScenario(s) {
      if (s === st.scenario) return;
      st.scenario = s;
      if (s) st.value[s] = Math.round(SCENARIOS[s].max / 2);          // при выборе режима ползунок — на середину
      st.qt = -1; st.qNext = 0.8;
      emit();
    },
    setValue(v) {
      if (!st.scenario) return;
      st.value[st.scenario] = Math.max(0, Math.min(SCENARIOS[st.scenario].max, Math.round(v)));
      emit();
    },
    _state: st,
    _dbg: { dust, flyers }
  };
  return api;
}
