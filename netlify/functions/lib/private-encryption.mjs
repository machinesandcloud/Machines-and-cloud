// Shared authenticated-encryption/key selection for the four retained private formats.
// This module never reads stores, contacts providers, logs plaintext or migrates data.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export class PrivateEncryptionError extends Error {
  constructor() { super('Private encrypted information could not be opened or saved safely.'); this.name = 'PrivateEncryptionError'; this.code = 'private_storage_unavailable'; this.status = 503; }
}
const fail = () => { throw new PrivateEncryptionError(); };
const plain = value => !!value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const exact = (value, fields) => plain(value) && Object.keys(value).sort().join(',') === [...fields].sort().join(',');
const validId = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(value);
const keyBytes = text => {
  if (typeof text !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(text)) fail();
  const value = Buffer.from(text, 'base64'); if (value.length !== 32 || value.toString('base64') !== text) fail();
  return value;
};
function uniqueMembers(text) {
  const nesting=[];
  for(const match of text.matchAll(/"(?:\\.|[^"\\])*"|[{}\[\]]/g)){
    const token=match[0];
    if(token==='{')nesting.push(new Set());else if(token==='[')nesting.push(null);else if(token==='}'||token===']')nesting.pop();
    else if(nesting.at(-1) instanceof Set && /^\s*:/.test(text.slice(match.index+token.length))){const key=JSON.parse(token);if(nesting.at(-1).has(key))fail();nesting.at(-1).add(key);}
  }
}
function ring(text) {
  if (typeof text !== 'string' || text.length > 16384) fail();
  let value; try { value = JSON.parse(text); uniqueMembers(text); } catch { fail(); }
  if (!exact(value, ['version', 'activeKeyId', 'legacyKeyId', 'keys']) || value.version !== 1 || !validId(value.activeKeyId) || !validId(value.legacyKeyId) || !Array.isArray(value.keys) || value.keys.length < 1 || value.keys.length > 8) fail();
  const keys = new Map(), material = new Set();
  for (const entry of value.keys) {
    if (!exact(entry, ['id', 'key']) || !validId(entry.id) || keys.has(entry.id)) fail();
    const bytes = keyBytes(entry.key); if (material.has(entry.key)) fail();
    keys.set(entry.id, bytes); material.add(entry.key);
  }
  if (!keys.has(value.activeKeyId) || !keys.has(value.legacyKeyId)) fail();
  return { keys, activeKeyId: value.activeKeyId, legacyKeyId: value.legacyKeyId, versioned: true };
}
const configured = (name,env=process.env) => Object.hasOwn(env,name) && env[name] !== undefined;
function calendarKeys(env=process.env) {
  if (configured('CALENDAR_TOKEN_ENCRYPTION_KEYRING_JSON',env)) return ring(env.CALENDAR_TOKEN_ENCRYPTION_KEYRING_JSON);
  return { keys: new Map([['legacy', keyBytes(env.CALENDAR_TOKEN_ENCRYPTION_KEY)]]), activeKeyId: 'legacy', legacyKeyId: 'legacy', versioned: false };
}
function selection(family,env=process.env) {
  if (family === 'calendar') return calendarKeys(env);
  if (family !== 'platform') fail();
  if (configured('PLATFORM_DATA_ENCRYPTION_KEYRING_JSON',env)) return ring(env.PLATFORM_DATA_ENCRYPTION_KEYRING_JSON);
  if (configured('PLATFORM_DATA_ENCRYPTION_KEY',env)) return { keys: new Map([['legacy', keyBytes(env.PLATFORM_DATA_ENCRYPTION_KEY)]]), activeKeyId: 'legacy', legacyKeyId: 'legacy', versioned: false };
  return calendarKeys(env);
}
export function privateEncryptionAvailable(family,env=process.env) { try { selection(family,env); return true; } catch { return false; } }
const formats = Object.freeze({ calendar: ['iv', 'data'], registration: ['nonce', 'ciphertext'], privateData: ['iv', 'ciphertext'] });
const purposes = Object.freeze({ 'calendar-oauth': 'calendar', 'calendar-refresh': 'calendar', 'messaging-registration': 'platform', 'service-onboarding': 'platform', 'service-intake': 'platform' });
function context(value) {
  if (!exact(value, ['family', 'purpose', 'aad', 'legacyAAD', 'legacyFormat']) || typeof value.purpose !== 'string' || !Object.hasOwn(purposes,value.purpose) || purposes[value.purpose] !== value.family || typeof value.legacyFormat !== 'string' || !Object.hasOwn(formats,value.legacyFormat) || typeof value.aad !== 'string' || !value.aad || value.aad.length > 8192 || typeof value.legacyAAD !== 'string' || !value.legacyAAD || value.legacyAAD.length > 8192) fail();
  if ((value.family === 'calendar') !== (value.legacyFormat === 'calendar') || (value.purpose === 'messaging-registration') !== (value.legacyFormat === 'registration')) fail();
  return value;
}
function encoded(value, length, max = length) {
  if (typeof value !== 'string' || value.length > Math.ceil(max / 3) * 4) fail();
  const bytes = Buffer.from(value, 'base64'); if (bytes.length < length || bytes.length > max || bytes.toString('base64') !== value) fail();
  return bytes;
}
const associated = (c, keyId) => Buffer.from(JSON.stringify(['mc-private', 2, c.family, c.purpose, keyId, c.aad]));
function encrypt(text, c, selected) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > 1048576) fail();
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', selected.keys.get(selected.activeKeyId), iv);
  cipher.setAAD(selected.versioned ? associated(c, selected.activeKeyId) : Buffer.from(c.legacyAAD));
  const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]).toString('base64'), tag = cipher.getAuthTag().toString('base64');
  if (selected.versioned) return { version: 2, keyId: selected.activeKeyId, iv: iv.toString('base64'), ciphertext, tag };
  const [nonce, data] = formats[c.legacyFormat]; return { ...(c.legacyFormat === 'calendar' ? {} : { version: 1 }), [nonce]: iv.toString('base64'), [data]: ciphertext, tag };
}
export function sealPrivate(text, input) {
  try { const c = context(input); return encrypt(text, c, selection(c.family)); } catch { fail(); }
}
export function openPrivate(envelope, input) {
  try {
    const c = context(input), selected = selection(c.family); let iv, ciphertext, key, aad;
    if (envelope?.version === 2) {
      if (!exact(envelope, ['version', 'keyId', 'iv', 'ciphertext', 'tag']) || !validId(envelope.keyId) || !selected.versioned || !selected.keys.has(envelope.keyId)) fail();
      key = selected.keys.get(envelope.keyId); aad = associated(c, envelope.keyId); iv = encoded(envelope.iv, 12); ciphertext = encoded(envelope.ciphertext, 0, 1048576);
    } else {
      const [nonce, data] = formats[c.legacyFormat], fields = [...(c.legacyFormat === 'calendar' ? [] : ['version']), nonce, data, 'tag'];
      if (!exact(envelope, fields) || (c.legacyFormat !== 'calendar' && envelope.version !== 1)) fail();
      key = selected.keys.get(selected.legacyKeyId); aad = Buffer.from(c.legacyAAD); iv = encoded(envelope[nonce], 12); ciphertext = encoded(envelope[data], 0, 1048576);
    }
    const decipher = createDecipheriv('aes-256-gcm', key, iv); decipher.setAAD(aad); decipher.setAuthTag(encoded(envelope.tag, 16));
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch { fail(); }
}
// Explicit pure primitive: caller retains the original envelope until a separately
// authorized, identity-fenced migration has durably verified and stored the result.
export function reencryptPrivate(envelope, input) {
  try { const c = context(input), selected = selection(c.family); if (!selected.versioned) fail(); const text = openPrivate(envelope, c); return encrypt(text, c, selected); } catch { fail(); }
}
