// Pure originating identity. Never infer a record's owner from its slug or the latest client row.
import { createHash } from 'node:crypto';
const marked = client => !!client && Object.hasOwn(client, 'onboarding');
export const supportedWorkspace = client => client?.onboarding?.version === 1;
const email = value => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
};
// Identical to the existing managed delivery digest, including normalized invalid-email nulls.
export const workspaceTenant = client => createHash('sha256').update(JSON.stringify([client.slug, client.ownerKey, email(client.owner?.email)])).digest('hex');
export class WorkspaceIdentityError extends Error {
  constructor() { super('This workspace changed. Refresh before continuing.'); this.code = 'workspace_changed'; this.status = 409; }
}
export function belongsToWorkspace(client, record) {
  if (!marked(client)) return true;
  if (!supportedWorkspace(client) || !record || record.slug && record.slug !== client.slug) return false;
  const identities = [record.tenantIdentity, record.delivery?.tenantIdentity].filter(value => value !== undefined);
  return identities.length > 0 && identities.every(value => value === workspaceTenant(client));
}
