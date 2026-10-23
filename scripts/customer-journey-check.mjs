// Historical bb8d515 failure reproduction: signup/owner workflow, loopback + fake model only.
// Current acceptance uses customer-access-check/customer-account-qa-check/customer-onboarding-ui-check.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const args = process.argv.slice(2);
function arg(name, fallback) { const n = args.indexOf(name); return n < 0 ? fallback : args[n + 1]; }
const base = arg('--base', 'http://127.0.0.1:8895');
if (base !== 'http://127.0.0.1:8895') throw new Error('This QA phase is restricted to isolated port 8895');
const output = arg('--output', 'scratchpad/customer-journey-baseline.json');
const pw = arg('--playwright', '/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs');
const { chromium } = await import(pw);
const sourceFiles = ['onboard.html', 'desk.html', 'script.js', 'netlify/functions/onboard.mjs', 'netlify/functions/onboard-build-background.mjs', 'netlify/functions/provision-background.mjs', 'netlify/functions/client.mjs', 'netlify/functions/lib/config.mjs', 'netlify/functions/lib/store.mjs'];
const hashes = () => Object.fromEntries(sourceFiles.map(path => [path, createHash('sha256').update(readFileSync(resolve(path))).digest('hex')]));
if (hashes()['netlify/functions/onboard.mjs'] !== 'a94322bc80471b206651799952c7442eff6135202e6290d64b58ac1a37333e9d') throw new Error('Historical failure harness requires the original bb8d515 onboarding source. Run current customer access/account/UI acceptance for repaired source.');
const evidence = { at: new Date().toISOString(), base, mode: 'memory/fake; outbound blocked', sourceBefore: hashes(), checks: [], observations: {}, browserBlocked: [], pageErrors: [] };
const check = (name, pass, detail) => evidence.checks.push({ name, pass: !!pass, detail });
async function api(path, body, method = 'POST') {
  const r = await fetch(base + path, { method: body === undefined ? 'GET' : method, headers: { 'Content-Type': 'application/json', Origin: base }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: r.status, data: await r.json() };
}
const seed = { name: 'QA Owner', email: 'qa-owner@example.test', phone: '7135550101', business: 'QA Isolated HVAC', trade: 'HVAC', services: 'AC repair', hours: 'Mon to Fri 8 am to 5 pm', serviceArea: 'Katy', windows: '8 to 12\n12 to 5', fees: 'Diagnostic: $89', forwarding: 'none', spanish: 'no' };
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await context.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (u.origin === base) return route.continue();
    evidence.browserBlocked.push({ origin: u.origin, pathname: u.pathname });
    return route.abort('blockedbyclient');
  });
  const page = await context.newPage(); page.on('pageerror', e => evidence.pageErrors.push(String(e.message)));
  await page.goto(base + '/onboard?plan=starter');
  await page.locator('#next').click();
  check('Signup shows actionable required-field validation before advancing', /highlighted/.test(await page.locator('#err').innerText()) && await page.locator('[data-step="1"]').isVisible());
  await page.locator('#name').fill(seed.name); await page.locator('#email').fill(seed.email); await page.locator('#phone').fill(seed.phone);
  await page.locator('#next').click(); await page.locator('#business').fill(seed.business); await page.locator('#trade').selectOption('HVAC'); await page.locator('#hours').fill(seed.hours); await page.locator('#serviceArea').fill('Katy');
  await page.locator('#spanish').selectOption('no'); await page.locator('#next').click();
  await page.locator('#fees').fill(seed.fees); await page.locator('#windows').fill(seed.windows); await page.locator('#next').click();
  await page.locator('#notes').fill('Synthetic QA shop; no real customers.'); await page.locator('#next').click(); await page.locator('#forwarding').selectOption('none');
  const creation = page.waitForResponse(r => r.url() === base + '/api/onboard' && r.request().method() === 'POST');
  await page.locator('#next').click(); const creationResponse = await creation; const created = await creationResponse.json();
  check('Five-step mobile signup creates a private portal without a website', creationResponse.status() === 200 && !!created.portal);
  if (!created.portal) throw new Error('Baseline signup did not produce a synthetic portal');
  const slug = created.slug, key = created.key;
  const ownerPath = '/api/client?c=' + encodeURIComponent(slug) + '&k=' + encodeURIComponent(key);
  const firstOwner = await api(ownerPath);
  evidence.observations.created = { slug, status: firstOwner.data.client?.status, build: firstOwner.data.client?.build, provision: firstOwner.data.client?.provision, integrations: firstOwner.data.integrations };
  await page.locator('#done.on').waitFor();
  check('Completion distinguishes logged email from actual delivery', !/We also emailed it to you\./.test(await page.locator('#done').innerText()));
  await page.screenshot({ path: 'scratchpad/customer-journey-signup-mobile.png', fullPage: true });
  await page.locator('#goPortal').click(); await page.locator('#title').filter({ hasText: seed.business }).waitFor();
  check('Owner portal loads exact configured shop after signup', await page.locator('#title').innerText() === seed.business);
  evidence.observations.firstPortal = { status: await page.locator('#status').innerText(), buttons: await page.locator('.tabs button').allInnerTexts(), goLiveVisible: await page.locator('#golive').isVisible(), tutorialControls: await page.getByRole('button', { name: /tour|tutorial|getting started|guide/i }).count() };
  check('New owner has a discoverable guided tutorial', evidence.observations.firstPortal.tutorialControls > 0);
  await page.locator('[data-t="setup"]').click();
  await page.screenshot({ path: 'scratchpad/customer-journey-setup-mobile.png', fullPage: true });
  evidence.observations.setupText = await page.locator('#p-setup').innerText();
  check('Setup accurately marks unavailable SMS and phone as unavailable', /not switched on|being switched on|not yet|once your number/i.test(evidence.observations.setupText));
  await page.locator('#golive').click(); await page.waitForTimeout(200);
  const liveOwner = await api(ownerPath);
  evidence.observations.afterGoLive = { status: liveOwner.data.client?.status, number: liveOwner.data.client?.phone?.twilioNumber || '', texting: liveOwner.data.integrations?.sms, voice: liveOwner.data.client?.voice, toast: await page.locator('#toast').innerText() };
  check('Go live does not claim a texting number is answering when no number/provider exists', !/texting number are answering/.test(evidence.observations.afterGoLive.toast));
  await page.screenshot({ path: 'scratchpad/customer-journey-false-live-mobile.png', fullPage: true });
  const unauth = await api('/api/client?c=' + encodeURIComponent(slug));
  check('Public client response omits private owner record/key', !unauth.data.ownerKey && !unauth.data.owner && !unauth.data.client && !unauth.data.bookings);
  const wrongKey = await api('/api/client?c=' + encodeURIComponent(slug) + '&k=wrong', { action: 'pause' });
  check('Wrong owner key cannot mutate status', wrongKey.status === 403);
  const beforeAttack = await api(ownerPath);
  const attack = await api('/api/onboard', { ...seed, name: 'Unverified Re-entry', phone: '7135550199', business: 'QA Replacement Attacker' });
  const afterAttack = await api(ownerPath);
  evidence.observations.duplicateEmail = { status: attack.status, reusedSlug: attack.data.slug === slug, exposedSameOwnerKey: attack.data.key === key, returnedPrivateClient: !!attack.data.client?.owner, before: { name: beforeAttack.data.client?.business?.name, status: beforeAttack.data.client?.status, phone: beforeAttack.data.client?.owner?.phone }, after: { name: afterAttack.data.client?.business?.name, status: afterAttack.data.client?.status, phone: afterAttack.data.client?.owner?.phone } };
  check('Unauthenticated duplicate email never discloses existing portal credential', !attack.data.key && !attack.data.portal && !attack.data.client);
  check('Unauthenticated duplicate email leaves existing account unchanged', JSON.stringify(beforeAttack.data.client) === JSON.stringify(afterAttack.data.client));
  await page.goto(base + '/onboard'); await page.locator('#name').fill('Draft Owner'); await page.locator('#email').fill('qa-draft@example.test'); await page.locator('#phone').fill('7135550102'); await page.locator('#next').click(); await page.locator('#business').fill('Draft Shop'); await page.reload();
  check('Reload restores in-progress onboarding instead of losing answers', await page.locator('#name').inputValue() === 'Draft Owner');
  evidence.observations.draftAfterReload = { name: await page.locator('#name').inputValue(), business: await page.locator('#business').inputValue() };
  await page.goto(base + '/desk?c=' + encodeURIComponent(slug) + '&k=wrong'); await page.waitForTimeout(250);
  evidence.observations.invalidLink = { title: await page.locator('#title').innerText(), status: await page.locator('#status').innerText() };
  check('Wrong portal link fails cleanly with no uncaught browser error', !evidence.pageErrors.length && /not found|invalid|check|missing/i.test(evidence.observations.invalidLink.title + evidence.observations.invalidLink.status));
  await context.close();
} catch (e) { evidence.fatal = String(e.stack || e); }
finally { await browser.close(); evidence.sourceAfter = hashes(); check('Source remained stable throughout evidence capture', JSON.stringify(evidence.sourceBefore) === JSON.stringify(evidence.sourceAfter)); evidence.summary = { checks: evidence.checks.length, passed: evidence.checks.filter(c => c.pass).length, failed: evidence.checks.filter(c => !c.pass).length }; writeFileSync(output, JSON.stringify(evidence, null, 2)); console.log(JSON.stringify({ output, ...evidence.summary, fatal: evidence.fatal || null })); }
