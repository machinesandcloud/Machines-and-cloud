// QA-only preload: no provider or external website requests can leave this process.
import { writeFileSync } from 'node:fs';
const actual = globalThis.fetch;
const ledger = { phase: 'customer-journey-fake', startedAt: new Date().toISOString(), allowed: [], blocked: [] };
const path = new URL('./customer-journey-network.json', import.meta.url);
function save() { writeFileSync(path, JSON.stringify(ledger, null, 2)); }
save();
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url);
  const event = { at: new Date().toISOString(), method: init?.method || input?.method || 'GET', origin: url.origin, pathname: url.pathname };
  if (url.origin !== 'http://127.0.0.1:8895') {
    ledger.blocked.push(event); save(); throw new Error('QA outbound request blocked');
  }
  ledger.allowed.push(event); save(); return actual(input, init);
};
