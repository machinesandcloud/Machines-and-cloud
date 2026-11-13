// Test-only preload: shift the wall clock to today 21:30 America/Chicago (CST, UTC-6) to reproduce the fan-out hour.
const R = Date, now = R.now(), d = new R(now - 6 * 3600e3), target = R.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 21 + 6, 30), shift = target - now;
class D extends R { constructor(...a) { super(...(a.length ? a : [R.now() + shift])); } static now() { return R.now() + shift; } }
globalThis.Date = D;
