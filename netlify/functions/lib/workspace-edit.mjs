// Supplied fields only: omission preserves, explicit blank clears, malformed input rejects.
// This parser has no storage or provider effects and is shared by owner and operator edits.
import { ACK_MINUTES, normalizeHours, normalizeEmergencies, emergency247 } from './config.mjs';
import { parseHours } from './config.mjs';
import { createHash } from 'node:crypto';
import { preserveWebsiteOriginRevision } from './setup.mjs';

const own = (value, key) => Object.hasOwn(value || {}, key);
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const editable = {
  business: ['name', 'website', 'trade', 'city', 'serviceArea', 'notServed', 'hours', 'afterHours', 'spanish', 'licenses', 'googlePlaceId', 'reviewLink', 'payLink'],
  owner: ['name', 'phone', 'backupPhone'], phone: ['businessNumber', 'transferTo', 'handoffEnabled', 'forwarding', 'carrier'],
  widget: ['greeting', 'allowedOrigins'], digest: ['text'],
  rules: ['never', 'handoff', 'emergencies', 'ackMinutes', 'callbackHours', 'callbackAfterHours', 'windowCapacity', 'consentAsk', 'emergency247', 'hours', 'bypass', 'avgTicket'],
};
const canonical = value => Array.isArray(value) ? value.map(canonical) : plain(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
// Editing concurrency is separate from the revision that certifies a reviewed/live-tested desk.
export function workspaceEditRevision(client) {
  const facts = Object.fromEntries(['services', 'fees', 'windows', 'faq', 'summary', 'plan', 'software'].map(key => [key, client[key] ?? null]));
  facts.workspace = [client.slug, client.ownerKey, client.owner?.email];
  for (const [group, fields] of Object.entries(editable)) facts[group] = Object.fromEntries(fields.map(key => [key, client[group]?.[key] ?? null]));
  return createHash('sha256').update(JSON.stringify(canonical(facts))).digest('hex');
}
export class WorkspaceEditError extends Error {
  constructor(fieldErrors, malformed = false) {
    super(Object.values(fieldErrors)[0] || 'Check your business details and try again.');
    this.code = malformed ? 'invalid_request' : 'invalid_fields';
    this.status = malformed ? 400 : 422;
    this.fieldErrors = fieldErrors;
  }
}

export function normalizeWorkspacePhone(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return '';
  if (text.length > 40 || !/^[+()\d .-]+$/.test(text) || /\+/.test(text.slice(1))) return null;
  const digits = text.replace(/\D/g, '');
  const normalized = text.startsWith('+') ? '+' + digits : digits.length === 10 ? '+1' + digits : '+' + digits;
  return /^\+1[2-9]\d{2}[2-9]\d{6}$/.test(normalized) ? normalized : null;
}

export function parseWorkspacePatch(input, { operator = false } = {}) {
  const errors = {}; let malformed = false;
  const bad = (path, message, shape = false) => { errors[path || '_form'] ||= message; malformed ||= shape; };
  const text = (max, required = false, multiline = false) => (value, path) => {
    if (typeof value !== 'string' || value.length > max || (multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(value)) {
      bad(path, `Enter text of ${max} characters or fewer.`); return;
    }
    const normalized = value.trim();
    if (required && !normalized) bad(path, 'Complete this detail or remove the empty row.');
    return normalized;
  };
  const bool = (value, path) => { if (typeof value !== 'boolean') bad(path, 'Choose yes or no.'); return value; };
  const choice = values => (value, path) => { if (!values.includes(value)) bad(path, 'Choose one of the listed options.'); return value; };
  const list = (max = 40, length = 160, item = text(length, true)) => (value, path) => {
    if (!Array.isArray(value) || value.length > max) { bad(path, `Use a list with no more than ${max} entries.`); return; }
    return value.map((entry, index) => item(entry, path + '.' + index));
  };
  const object = schema => (value, path = '') => {
    if (!plain(value)) { bad(path, 'Check the format of these details.', true); return; }
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      const field = path ? path + '.' + key : key;
      if (!own(schema, key)) bad(field, 'This field cannot be changed here.', true);
      else out[key] = schema[key](item, field);
    }
    return out;
  };
  const phone = (value, path) => {
    const normalized = normalizeWorkspacePhone(value);
    if (normalized === null) bad(path, 'Enter a valid US phone number, including the area code, or leave it blank.');
    return normalized;
  };
  const link = (originOnly = false) => (value, path) => {
    const normalized = text(300)(value, path);
    if (!normalized) { if (originOnly) bad(path, 'Remove the empty website row, or enter a full website origin.'); return normalized; }
    try {
      const url = new URL(normalized);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname || originOnly && normalized.replace(/\/$/, '') !== url.origin) throw new Error();
      return originOnly ? url.origin : normalized;
    } catch { bad(path, originOnly ? 'Enter a website origin such as https://yourshop.com, without a page path.' : 'Enter a full http:// or https:// link, or leave it blank.'); }
  };
  const number = (min, max, whole = false) => (value, path) => {
    if (!['number', 'string'].includes(typeof value) || typeof value === 'string' && !/^\d+(?:\.\d+)?$/.test(value.trim())) { bad(path, 'Enter a valid number.'); return; }
    const normalized = Number(value);
    if (!Number.isFinite(normalized) || normalized < min || normalized > max || whole && !Number.isInteger(normalized)) bad(path, `Enter ${whole ? 'a whole number' : 'a number'} from ${min} to ${max}.`);
    return normalized;
  };
  const fee = object({ label: text(80, true), amount: text(40), note: text(120) });
  const faq = object({ q: text(200, true), a: text(600, true, true) });
  const rows = (max, parser, required) => list(max, 0, (value, path) => {
    const row = parser(value, path);
    if (plain(value)) for (const key of required) if (!own(value, key)) bad(path + '.' + key, 'Complete this detail or remove the empty row.');
    return row;
  });
  const hours = (value, path) => {
    if (value === null) return null;
    if (!plain(value)) { bad(path, 'Enter your opening and closing times, or mark the day closed.'); return; }
    const out = {};
    for (const [day, interval] of Object.entries(value)) {
      const field = path + '.' + day;
      if (!days.includes(day)) { bad(field, 'Choose a listed day of the week.', true); continue; }
      if (interval === null) { out[day] = null; continue; }
      if (!plain(interval) || Object.keys(interval).some(key => !['open', 'close'].includes(key))) { bad(field, 'Add an opening and closing time, or mark the day closed.'); continue; }
      const open = interval.open, close = interval.close;
      if (typeof open !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(open)) bad(field + '.open', 'Enter an opening time from 00:00 to 23:59.');
      if (typeof close !== 'string' || !/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/.test(close)) bad(field + '.close', 'Enter a closing time from 00:00 to 24:00.');
      if (!errors[field + '.open'] && !errors[field + '.close'] && close <= open) bad(field + '.close', 'Closing time must be after opening time on the same day.');
      out[day] = { open, close };
    }
    return out;
  };
  const readableHours = (value, path) => {
    const normalized = text(300)(value, path);
    if (normalized !== undefined) { const derived = parseHours(normalized); if (derived) hours(derived, path); }
    return normalized;
  };
  const business = { name: text(120), website: link(), trade: text(80), city: text(80), serviceArea: list(), notServed: list(), hours: readableHours, afterHours: text(300), spanish: bool, licenses: text(200), googlePlaceId: text(120), reviewLink: link(), payLink: link() };
  const schema = {
    business: object(operator ? Object.fromEntries(['name', 'city', 'serviceArea', 'notServed'].map(key => [key, business[key]])) : business),
    services: list(60), fees: rows(30, fee, ['label', 'amount']), windows: list(8), faq: rows(40, faq, ['q', 'a']), summary: text(2000, false, true),
  };
  if (!operator) Object.assign(schema, {
    owner: object({ name: text(300), phone, backupPhone: phone }),
    phone: object({ businessNumber: phone, transferTo: phone, handoffEnabled:bool, forwarding: choice(['missed', 'all', 'none']), carrier: choice(['att', 'verizon', 'tmobile', 'voip', 'other', '']) }),
    widget: object({ greeting: text(200), allowedOrigins: list(5, 300, link(true)) }),
    digest: object({ text: bool }),
    rules: object({
      never: list(20), handoff: list(20), emergencies: object({ tier0: list(20), tier1: list(20), tier2: text(200), script: text(500, false, true) }),
      ackMinutes: choice(ACK_MINUTES), callbackHours: text(80), callbackAfterHours: text(80), windowCapacity: number(1, 20, true),
      consentAsk: bool, emergency247: bool, hours, bypass: list(20, 40, (value, path) => { const result = phone(value, path); if (result === '') bad(path, 'Remove the empty phone-number row.'); return result; }),
      avgTicket: (value, path) => typeof value === 'string' && !value.trim() ? 0 : Math.round(number(0, 1000000)(value, path)),
    }),
    plan: choice(['starter', 'growth', 'pro']), software: text(30),
  });
  const patch = object(schema)(input);
  if (Object.keys(errors).length) throw new WorkspaceEditError(errors, malformed);
  return patch;
}

// Keep unrelated account, lifecycle, provider and review metadata from the latest row.
export function applyWorkspacePatch(current, patch) {
  const value = structuredClone(current);
  const nested = new Set(['business', 'owner', 'phone', 'widget', 'digest', 'rules']);
  for (const [field, item] of Object.entries(patch)) value[field] = nested.has(field) ? { ...(value[field] || {}), ...structuredClone(item) } : structuredClone(item);
  if (own(patch.rules, 'hours')) value.rules.hours = patch.rules.hours === null ? null : normalizeHours({ ...(current.rules?.hours || {}), ...patch.rules.hours });
  else if (own(patch.business, 'hours')) value.rules = { ...value.rules, hours: parseHours(value.business.hours) };
  if (own(patch.rules, 'emergencies')) value.rules.emergencies = normalizeEmergencies({ ...normalizeEmergencies(current.rules?.emergencies, value.business?.trade), ...patch.rules.emergencies }, value.business?.trade);
  if (own(patch.business, 'hours') && !own(patch.rules, 'emergency247')) value.rules = { ...value.rules, emergency247: emergency247(value.business.hours) };
  return own(patch.widget, 'allowedOrigins') ? preserveWebsiteOriginRevision(current, value) : value;
}

// An omitted value differs from an explicit blank, even for non-revision metadata.
export function workspacePatchConflicts(original, current, patch) {
  function differs(before, latest, supplied) {
    return Object.entries(supplied).some(([key, value]) => {
      if (plain(value)) return differs(before?.[key], latest?.[key], value);
      return own(before, key) !== own(latest, key) || JSON.stringify(before?.[key]) !== JSON.stringify(latest?.[key]);
    });
  }
  return differs(original, current, patch);
}
