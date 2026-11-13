// QA preload: shift the wall clock so that "now" starts at QA_CLOCK_TARGET (ISO, UTC). Date only; timers unchanged.
const R = Date, shift = R.parse(process.env.QA_CLOCK_TARGET) - R.now();
if (!Number.isFinite(shift)) throw new Error('QA_CLOCK_TARGET missing');
class D extends R { constructor(...a) { super(...(a.length ? a : [R.now() + shift])); } static now() { return R.now() + shift; } }
globalThis.Date = D;
