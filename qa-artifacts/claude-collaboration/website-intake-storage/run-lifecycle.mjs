// Runs scripts/connection-intake-lifecycle-check.mjs (VM, injected fetch, no transport) against the served intake bytes.
// Usage: node qa-artifacts/claude-collaboration/website-intake-storage/run-lifecycle.mjs --output scratchpad/claude-webstore-<name>.json
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const output = process.argv[process.argv.indexOf('--output') + 1];
if (!/^scratchpad\/claude-webstore-[\w-]+\.json$/.test(output || '') || existsSync(output)) throw new Error('New --output scratchpad/claude-webstore-<name>.json required');
const sha = f => createHash('sha256').update(readFileSync(f)).digest('hex');
const { checkConnectionIntakeLifecycle } = await import('../../../scripts/connection-intake-lifecycle-check.mjs');
let result, error = null; try { result = await checkConnectionIntakeLifecycle(); } catch (e) { error = String(e.stack || e); }
writeFileSync(output, JSON.stringify({ at: new Date().toISOString(), intakeSha256: sha('desk-service-intake.js'), guideSha256: sha('desk-setup-guide.js'), result, error }, null, 2));
console.log(error ? 'FAIL ' + error.split('\n')[0] : result.passed + '/' + result.total + ' -> ' + output); process.exit(error ? 1 : 0);
