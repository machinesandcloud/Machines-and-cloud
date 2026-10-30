// Operator-owned environment selection. No URL or environment comes from a customer.
import { createHash } from 'node:crypto';
import { workspaceTenant } from './workspace-identity.mjs';

const ENDPOINTS = Object.freeze(Object.fromEntries(['production', 'staging'].map(environment => {
  const prefix = environment === 'staging' ? 'staging-' : '';
  return [environment, Object.freeze({ environment, api: `https://${prefix}api.thumbtack.com/api/v4/`,
    issuer: `https://${prefix}auth.thumbtack.com/`, authorization_endpoint: `https://${prefix}auth.thumbtack.com/oauth2/auth`,
    token_endpoint: `https://${prefix}auth.thumbtack.com/oauth2/token` })];
})));
export function thumbtackEndpoints(environment = 'production') {
  if (!Object.hasOwn(ENDPOINTS, environment)) throw new Error('Unsupported Thumbtack environment');
  return ENDPOINTS[environment];
}
export function thumbtackRedirectURI(environment = 'production') {
  thumbtackEndpoints(environment);
  return 'https://machinesandcloud.com/api/thumbtack/' + (environment === 'staging' ? 'staging-connect' : 'connect');
}
const hash = value => createHash('sha256').update(value).digest('hex');
function cohort() {
  const raw = process.env.THUMBTACK_STAGING_TENANTS_JSON;
  if (!raw) return { valid: true, active: true, tenants: [] };
  try {
    if (raw.length > 12000) throw Error();
    const value = JSON.parse(raw), expiry = Date.parse(value.expiresAt);
    if (!value || Array.isArray(value) || Object.keys(value).some(key => !['version','expiresAt','tenants'].includes(key)) ||
        value.version !== 1 || typeof value.expiresAt !== 'string' || !Number.isFinite(expiry) || !Array.isArray(value.tenants) ||
        value.tenants.length < 1 || value.tenants.length > 25 || new Set(value.tenants.map(row => row?.slug)).size !== value.tenants.length ||
        value.tenants.some(row => !row || Array.isArray(row) || Object.keys(row).some(key => !['slug','identity'].includes(key)) ||
          !/^[a-z0-9][a-z0-9-]{0,39}$/.test(row.slug || '') || !/^[a-f0-9]{64}$/.test(row.identity || ''))) throw Error();
    return { valid: true, active: expiry > Date.now(), tenants: value.tenants };
  } catch { return { valid: false, tenants: [] }; }
}
function configuration(environment, valid = true) {
  const prefix = environment === 'staging' ? 'THUMBTACK_STAGING_' : 'THUMBTACK_';
  const clientId = process.env[prefix+'CLIENT_ID'] || '', clientSecret = process.env[prefix+'CLIENT_SECRET'] || '';
  const scopes = (process.env[prefix+'SCOPES'] || '').trim().split(/\s+/).filter(Boolean);
  const tokenAuthMethod = process.env[prefix+'CLIENT_AUTH_METHOD'] || '', secret = process.env.THUMBTACK_TOKEN_ENCRYPTION_KEY || '';
  const separate = environment !== 'staging' || (!process.env.THUMBTACK_CLIENT_ID || clientId !== process.env.THUMBTACK_CLIENT_ID) &&
    (!process.env.THUMBTACK_CLIENT_SECRET || clientSecret !== process.env.THUMBTACK_CLIENT_SECRET);
  const ready = valid && separate && process.env[prefix+'PARTNER_ENABLED'] === '1' && !!clientId && !!clientSecret &&
    !/\s/.test(clientId+clientSecret) && scopes.length > 0 && scopes.length <= 30 && scopes.includes('offline_access') &&
    scopes.some(scope => scope.startsWith('supply::')) && scopes.every(scope => /^(?:offline_access|supply::[a-zA-Z0-9._:-]{1,120})$/.test(scope)) &&
    ['client_secret_basic','client_secret_post'].includes(tokenAuthMethod) && /^[a-f0-9]{64}$/i.test(secret) &&
    (process.env.URL || 'https://machinesandcloud.com') === 'https://machinesandcloud.com';
  return { ready, environment, clientId, clientIdHash: hash(clientId), clientSecret, scopes, tokenAuthMethod,
    encryptionKey: /^[a-f0-9]{64}$/i.test(secret) ? Buffer.from(secret, 'hex') : null,
    redirectURI: thumbtackRedirectURI(environment), ...thumbtackEndpoints(environment) };
}
export function thumbtackConfiguration(client, saved) {
  const selected = cohort();
  if (!selected.valid) {
    // A staging-only configuration typo cannot disable a durably bound production connection.
    // Unknown/new selection stays closed, and a known staging connection never falls back.
    const production = saved && (saved.providerBinding?.environment === 'production' || !saved.providerBinding && (saved.version === 1 || saved.tokens?.version === 1));
    return configuration(saved?.providerBinding?.environment === 'staging' ? 'staging' : 'production', !!production);
  }
  const staging = client && selected.tenants.some(row => row.slug === client.slug && row.identity === workspaceTenant(client));
  return configuration(staging ? 'staging' : 'production', selected.valid && (!staging || selected.active));
}
export function thumbtackAnyConfigurationReady() {
  const selected = cohort();
  return configuration('production').ready || selected.active && selected.tenants.length > 0 && configuration('staging', selected.valid).ready;
}
export const thumbtackProviderBinding = cfg => ({ environment: cfg.environment, clientIdHash: cfg.clientIdHash });
export function thumbtackBindingMatches(native, cfg) {
  if (!native?.providerBinding) return cfg.environment === 'production' && native?.version !== 2 && native?.tokens?.version !== 2; // Existing unmarked tokens are production-only.
  return typeof native.providerBinding === 'object' && !Array.isArray(native.providerBinding) && Object.keys(native.providerBinding).length === 2 && native.providerBinding.environment === cfg.environment && native.providerBinding.clientIdHash === cfg.clientIdHash;
}
