// sim/sim-model.js — чистая модель симуляции (без DOM): ГСЧ, перспектива плоскости, физика бури и метеоров
export function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));
export function smoothstep(a, b, x) { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); }
export function lerp(a, b, t) { return a + (b - a) * t; }

/**
 * Точка на плоскости земли → экран.
 * hy — линия горизонта (px), d: 0 — у горизонта, 1 — у нижнего края; xr: −1..1 — влево/вправо.
 * Возвращает { x, y, s } — s: масштаб (≈ 0.06 вдали … 1 вблизи)
 */
export function groundPoint(W, H, hy, xr, d) {
  const k = d * d * 0.85 + d * 0.15;
  const s = Math.max(0.06, k);
  return { x: W / 2 + xr * W * 0.62 * s, y: hy + (H - hy) * k, s: s };
}

const RHO_MARS = 0.020;   // кг/м³ у поверхности (≈ 1/60 земной)
const RHO_EARTH = 1.2;

/** Пылевая буря: уровень 0..10 → физические величины */
export function stormParams(v) {
  v = Math.max(0, Math.min(10, v));
  const tau = 0.6 + v * 1.0;                         // оптическая толщина пыли (0.6 — ясно, >10 — глобальная буря 2018 г.)
  const wind = 3 + v * 2.4;                          // порывы, м/с (до ≈27 м/с)
  const earthEq = wind * Math.sqrt(RHO_MARS / RHO_EARTH);   // скорость земного ветра с тем же давлением на предмет
  const directPct = 100 * Math.exp(-tau);            // доля прямого солнечного луча, дошедшая до поверхности
  let label;
  if (v === 0) label = 'Clear sky';
  else if (v <= 2) label = 'Hazy day with dust devils';
  else if (v <= 4) label = 'Local dust storm';
  else if (v <= 6) label = 'Regional dust storm';
  else if (v <= 8) label = 'Large storm — may grow around the planet';
  else label = 'Global, planet-encircling storm';
  return { tau, wind, earthEq, directPct, label };
}

/** Сценарии симуляции: «level» — сила 0..10, «time» — время суток (значение = четверти часа, 0..96) */
export const SCENARIOS = {
  storm: { max: 10, def: 5, time: false },
  quake: { max: 10, def: 5, time: false },
  day: { max: 96, def: 48, time: true },
  moons: { max: 96, def: 48, time: true }
};
export const SOL_HOURS = 24 + 39 / 60;     // марсианские сутки (сол) = 24 ч 39 мин

export function fmtTime(tod) {
  const m = Math.round(((tod % 24) + 24) % 24 * 60) % 1440;
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}

/** Положение Солнца для вида: tod — местное солнечное время, ч. Высота сжата (≈ 0.34 рад), чтобы Солнце оставалось в кадре. */
export function sunAt(tod) {
  const k = Math.cos((tod - 12) * Math.PI / 12);
  return { az: Math.max(-0.48, Math.min(0.48, (tod - 12) * 0.08)), el: 0.34 * k, k };
}

/** Температура воздуха у поверхности, °C: ночной минимум перед рассветом (≈ 5 ч), максимум после полудня (≈ 14 ч) */
export function dayTemp(tod) {
  const t = ((tod % 24) + 24) % 24, lo = -85, hi = -5;
  let u;
  if (t >= 5 && t <= 14) u = (t - 5) / 9;                  // нагрев
  else { const d = t > 14 ? t - 14 : t + 10; u = 1 - d / 15; }   // остывание за 15 часов
  return lo + (hi - lo) * (0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, u))));
}

export function dayLabel(tod) {
  const el = sunAt(tod).el;
  if (el < -0.12) return 'Night';
  if (el < 0.02) return tod < 12 ? 'Dawn' : 'Dusk — the Sun sets';
  if (el < 0.12) return tod < 12 ? 'Sunrise: the Sun glows blue' : 'Sunset: the Sun glows blue';
  if (el < 0.27) return tod < 12 ? 'Morning' : 'Late afternoon';
  return 'Midday';
}

/** Марсотрясение: уровень 0..10 → магнитуда (InSight: >1300 толчков, сильнейший M4.7 в 2022 г.) */
export function quakeParams(v) {
  v = Math.max(0, Math.min(10, Math.round(v)));
  const mag = v === 0 ? 0 : Math.round((0.7 + 0.4 * v) * 10) / 10;
  let label;
  if (v === 0) label = 'Quiet ground';
  else if (v <= 3) label = 'Tiny marsquake — typical of what InSight recorded';
  else if (v <= 6) label = 'Moderate marsquake — felt clearly at a base';
  else if (v <= 9) label = 'Strong marsquake — rare';
  else label = 'Record-size marsquake (about the strongest ever recorded)';
  return { mag, amp: v / 10, label, shakeSec: v === 0 ? 0 : 5 + v * 1.2 };
}

// ---------------- 3D-геометрия вида и физика частиц ----------------
export const G_MARS = 3.71;        // м/с²
export const CAM_H = 1.7;          // высота глаз, м (горизонт ≈ 3.4 км из-за кривизны Марса)

/** Перспективная проекция точки мира (X вправо, Y вверх, Z вперёд) на экран. f — фокус (px), hy — горизонт. */
export function project3(f, W, hy, X, Y, Z, out) {
  out.x = W / 2 + f * X / Z;
  out.y = hy - f * (Y - CAM_H) / Z;
  out.s = f / Z;                    // пикселей на метр
  return out;
}

/** Шаг баллистической частицы: гравитация Марса, слабое сопротивление разреженного воздуха. Возвращает true, если упала. */
export function stepBallistic(p, dt, drag, gScale) {
  const k = Math.exp(-(drag || 0) * dt);
  p.vx *= k; p.vz *= k; p.vy = p.vy * k - G_MARS * (gScale === undefined ? 1 : gScale) * dt;
  p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
  if (p.y <= 0 && p.vy < 0) { p.y = 0; return true; }
  return false;
}

/** Видимость в пыли, м (≈ 3 км / τ) */
export function visibilityM(tau) { return 3000 / Math.max(0.3, tau); }
