// Preload: shift the wall clock so each process starts at 18:05 Houston (digest fan-out hour), time then ticks normally.
const R = Date, off = R.parse(process.env.MC_QA_FAKE_START || "2026-11-14T00:05:00Z") - R.now();
globalThis.Date = class extends R { constructor(...a) { super(...(a.length ? a : [R.now() + off])); } static now() { return R.now() + off; } };
