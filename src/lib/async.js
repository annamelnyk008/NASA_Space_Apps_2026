export function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

export function waitFor(fn, max) {
  return new Promise(res => {
    const t0 = Date.now();
    (function poll() { if (fn() || Date.now() - t0 > max) res(); else setTimeout(poll, 60); })();
  });
}
