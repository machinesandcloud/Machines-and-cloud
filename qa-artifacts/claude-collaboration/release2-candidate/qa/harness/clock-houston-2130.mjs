// QA preload: shift wall clock to today 21:30 America/Chicago (autoflag fan-out hour). Date only.
const R = Date;
const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new R());
const g = t => +parts.find(p => p.type === t).value;
const curMin = (g('hour') % 24) * 60 + g('minute');
let deltaMin = 21 * 60 + 30 - curMin; // same Houston day, 21:30
const shift = deltaMin * 60e3;
class D extends R { constructor(...a) { super(...(a.length ? a : [R.now() + shift])); } static now() { return R.now() + shift; } }
globalThis.Date = D;
if (process.env.QA_CLOCK_TRACE) console.error('[qa-clock] Houston now', new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',dateStyle:'short',timeStyle:'short'}).format(new D()));
