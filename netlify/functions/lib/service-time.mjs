import { canonicalWindow, isoDateValid } from "./availability.mjs";
export function arrivalInstant(date, window) {
  const match = /^(\d+)-(\d+)$/.exec(canonicalWindow(window));
  if (!isoDateValid(date) || !match || Number(match[1]) < 0 || Number(match[2]) > 1440 || Number(match[2]) <= Number(match[1])) throw new Error("Saved visit needs a real date and timed window");
  const target = Date.parse(`${date}T00:00:00Z`) + Number(match[1]) * 60000;
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone:'America/Chicago', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23' });
  let instant = target;
  for (let attempt = 0; attempt < 5; attempt++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).filter(p => p.type !== 'literal').map(p => [p.type,Number(p.value)]));
    const local = Date.UTC(parts.year,parts.month-1,parts.day,parts.hour,parts.minute,parts.second);
    if (local === target) return instant;
    instant += target - local;
  }
  throw new Error("Arrival time does not exist in the shop time zone");
}
