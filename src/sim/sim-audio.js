// sim/sim-audio.js — звук симуляции (Web Audio, без файлов), по физике Марса:
//  • воздух в ~60 раз разреженнее и CO₂ → звук идёт ≈ 240 м/с (на Земле 343), высокие частоты почти не доходят,
//    поэтому всё звучит глухо, низко и тихо;
//  • марсотрясение — низкий гул (в реальности его «слышит» грунт, а не воздух); закат и луны беззвучны.
export const SOUND_SPEED = 240;    // м/с на поверхности Марса

function noiseBuffer(ctx, seconds, brown) {
  const n = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
  }
  return buf;
}

export function createSimAudio(sim) {
  let ctx = null, master = null, wind = null, gust = null, grain = null, rumble = null, sub = null, enabled = true, active = false;
  try { const v = localStorage.getItem('marsSimSound'); if (v === '0') enabled = false; } catch (e) { /* ignore */ }
  let grainT = 0;

  function init() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = enabled ? 0.9 : 0; master.connect(ctx.destination);
    // ветер: бурый шум → два фильтра (только низ), громкость и срез «дышат» порывами
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, 6, true); src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220; lp.Q.value = 0.6;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 130; bp.Q.value = 0.5;
    wind = ctx.createGain(); wind.gain.value = 0;
    src.connect(lp); lp.connect(wind); src.connect(bp); bp.connect(wind); wind.connect(master);
    src.start();
    gust = { lp, bp, t: 0 };
    // пылинки, бьющие по микрофону: короткие тики
    grain = ctx.createGain(); grain.gain.value = 0.6; grain.connect(master);
    // гул марсотрясения: бурый шум ниже ~60 Гц + глухой синус
    const rs = ctx.createBufferSource(); rs.buffer = noiseBuffer(ctx, 4, true); rs.loop = true;
    const rl = ctx.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.value = 62; rl.Q.value = 0.7;
    rumble = ctx.createGain(); rumble.gain.value = 0;
    rs.connect(rl); rl.connect(rumble); rumble.connect(master); rs.start();
    const so = ctx.createOscillator(); so.type = 'sine'; so.frequency.value = 31;
    sub = ctx.createGain(); sub.gain.value = 0; so.connect(sub); sub.connect(master); so.start();
    return true;
  }

  sim.onFrame(function (s) {
    if (!ctx || !active) return;
    const t = ctx.currentTime;
    gust.t += 0.016;
    const lvl = s.scenario === 'storm' ? s.storm : 0;
    const base = 0.012;      // марсианская тишина: едва слышный ветерок
    const vol = base + 0.5 * Math.pow(lvl, 1.4);
    const gus = 0.65 + 0.35 * Math.sin(gust.t * 0.9) * Math.sin(gust.t * 0.37 + 1.3);
    wind.gain.setTargetAtTime(vol * gus, t, 0.25);
    const q = s.quake || 0;
    rumble.gain.setTargetAtTime(q * 1.6, t, 0.06);
    sub.gain.setTargetAtTime(q * 0.4, t, 0.08);
    const fc = 120 + 520 * lvl + 90 * gus;                                    // срез растёт с силой ветра, но не выше ≈ 800 Гц
    gust.lp.frequency.setTargetAtTime(fc, t, 0.3);
    gust.bp.frequency.setTargetAtTime(90 + 260 * lvl, t, 0.3);
    // пылевые тики
    if (lvl > 0.25 && enabled) {
      grainT -= 0.016;
      while (grainT <= 0) {
        grainT += 0.35 / (0.2 + lvl * 3) * (0.5 + Math.random());
        const n = ctx.createBufferSource(); n.buffer = noiseBuffer(ctx, 0.05, false);
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500 + Math.random() * 500; f.Q.value = 1.1;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.06 * lvl, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
        n.connect(f); f.connect(g); g.connect(grain); n.start(t);
      }
    }
  });

  return {
    /** вызывать из обработчика клика (нужен жест пользователя) */
    start() { if (!init()) return; active = true; if (ctx.state === 'suspended') ctx.resume(); },
    stop() { active = false; if (ctx) { wind.gain.setTargetAtTime(0, ctx.currentTime, 0.1); rumble.gain.value = 0; sub.gain.value = 0; ctx.suspend(); } },
    setEnabled(on) {
      enabled = on;
      try { localStorage.setItem('marsSimSound', on ? '1' : '0'); } catch (e) { /* ignore */ }
      if (ctx) master.gain.setTargetAtTime(on ? 0.9 : 0, ctx.currentTime, 0.05);
    },
    isEnabled: () => enabled
  };
}
