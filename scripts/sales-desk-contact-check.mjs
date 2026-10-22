// Narrow independent QA bridge for removal of unverified sales contact literals.
// Does not call a model, visit Calendly, dispatch a message or rerun the UI matrix.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
const hash = value => createHash('sha256').update(value).digest('hex');
const oldBackend = JSON.parse(readFileSync('scratchpad/sales-desk-backend-qa-final.json'));
const oldUI = JSON.parse(readFileSync('scratchpad/sales-desk-ui-final.json'));
const report = { at: new Date().toISOString(), scope: 'one-line contact-fact cleanup; pure runtime + exact source bridge', checks: [], previousBackend: 'scratchpad/sales-desk-backend-qa-final.json', previousUI: 'scratchpad/sales-desk-ui-final.json', sources: {} };
const check = (name, pass, detail) => report.checks.push({ name, pass: !!pass, ...(detail === undefined ? {} : { detail }) });
const changed = 'netlify/functions/lib/sales-desk.mjs';
const currentLine = "  company: { name: 'Machines & Cloud', location: 'Houston, Texas' },";
const priorLine = "  company: { name: 'Machines & Cloud', location: 'Houston, Texas', email: 'support@machinesandcloud.com', phone: '(346) 248-8359' },";
for (const [path, previousSHA256] of Object.entries(oldBackend.sourceAfter)) {
  const current = readFileSync(path, 'utf8');
  const reconstructed = path === changed ? current.replace(currentLine, priorLine) : current;
  report.sources[path] = { previousSHA256, currentSHA256: hash(current), reconstructedPreviousSHA256: hash(reconstructed) };
  check(path === changed ? 'Exact reversal of only the contact company line reproduces accepted backend source' : 'Accepted backend source unchanged: ' + path, hash(reconstructed) === previousSHA256);
}
for (const [path, previousSHA256] of Object.entries(oldUI.sourceAfter)) check('Accepted UI source unchanged: ' + path, hash(readFileSync(path)) === previousSHA256);
let outbound = 0; globalThis.fetch = async () => { outbound++; throw new Error('QA networking forbidden'); };
const { SALES_FACTS, salesSystem, suggestNextStep } = await import('../netlify/functions/lib/sales-desk.mjs');
const system = salesSystem();
check('Company exposes only name and location', JSON.stringify(Object.keys(SALES_FACTS.company).sort()) === JSON.stringify(['location', 'name']));
const emails = system.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
const phones = system.match(/(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\b\d{3})[\s.-]\d{3}[\s.-]\d{4}\b/g) || [];
check('Actual sales system offers no literal email address', emails.length === 0, { count: emails.length });
check('Actual sales system offers no literal phone number', phones.length === 0, { count: phones.length });
for (const language of ['en', 'es']) {
  const contact = suggestNextStep({ action: 'contact', scenario: 'none', language });
  check('Contact remains fixed visitor-chosen public Calendly route: ' + language, contact.type === 'sales_action' && contact.action === 'contact' && contact.href === 'https://calendly.com/ngoumnaisteve/30' && contact.scenario === 'none' && contact.language === language);
}
check('Pure inspection performed no external/model/provider request', outbound === 0);
const pairs = Object.entries(report.sources).map(([path, value]) => [path, value.currentSHA256]).sort((a, b) => a[0].localeCompare(b[0]));
report.currentBackendFingerprint = hash(JSON.stringify(pairs));
report.uiFingerprintUnchanged = '04a9797dbdbd256fa7e20803fe229ec2c78f256cc1052c13b4c7452f8f114903';
report.summary = { checks: report.checks.length, passed: report.checks.filter(row => row.pass).length, failed: report.checks.filter(row => !row.pass).length, actualModelRequests: 0, actualExternalRequests: 0 };
writeFileSync('scratchpad/sales-desk-contact-source-bridge.json', JSON.stringify(report, null, 2)); console.log(JSON.stringify({ ...report.summary, currentBackendFingerprint: report.currentBackendFingerprint }));
