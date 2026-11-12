// Abuse-limit key for a caller address. IPv4 stays the plain address (existing keys unchanged); IPv6 is grouped by its /64,
// because one subscriber or host normally controls a whole /64 and can rotate within it.
// A missing address shares one restricted "unknown" bucket (never a bypass); any other
// unparsable value is kept as its own bucket, as before.
export function networkBucket(ip) {
  const original = typeof ip === 'string' ? ip.trim() : '', raw = original.toLowerCase();
  if (!raw) return 'unknown';
  if (raw.length > 128 || /[\u0000-\u001f]/.test(raw) || !/^[0-9a-f:.%\[\]a-z]+$/.test(raw)) return original;
  const mapped = raw.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return mapped[1];
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(raw)) return raw;
  if (!raw.includes(':')) return original;
  let address = raw.replace(/^\[|\]$/g, '').split('%')[0];
  const tail = address.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (tail) { const p = tail[1].split('.').map(Number); address = address.slice(0, -tail[1].length) + ((p[0] << 8 | p[1]).toString(16)) + ':' + ((p[2] << 8 | p[3]).toString(16)); }
  const halves = address.split('::');
  if (halves.length > 2) return original;
  const head = halves[0] ? halves[0].split(':') : [], rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - rest.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return original;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...rest];
  if (groups.length !== 8 || groups.some(g => !/^[0-9a-f]{1,4}$/.test(g))) return original;
  const n = groups.map(g => parseInt(g, 16)), v4 = () => [n[6] >> 8, n[6] & 255, n[7] >> 8, n[7] & 255].join('.');
  // IPv4-mapped (::ffff:0:0/96) in any spelling, and the NAT64 well-known prefix (64:ff9b::/96), are one IPv4 caller.
  if (n.slice(0, 5).every(x => x === 0) && n[5] === 0xffff) return v4();
  if (n[0] === 0x64 && n[1] === 0xff9b && n.slice(2, 6).every(x => x === 0)) return v4();
  return 'v6-' + groups.slice(0, 4).map(g => g.replace(/^0+(?=.)/, '')).join(':');
}
