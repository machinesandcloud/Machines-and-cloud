// Copy-clarity fix: 390px screenshots of the changed owner screens plus text assertions on the new copy.
// Uses the first-customer-fix offline harness (actual /api/client handlers, memory store, fake model, no physical network).
// node qa-artifacts/claude-collaboration/copy-clarity-fix/copy-shots-check.mjs --playwright <index.mjs> --out <new dir> --label copyfix
import { assert, launch, seed, open, route, shot, check, finish } from '../first-customer-fix/checks/fc-lib.mjs';
await launch();
const W = 390, H = 844, txt = (page, sel) => page.locator(sel).innerText();
const KEEP = 'Your Inbox, visits, settings and downloads keep working.';
{
  const x = await seed({ channels: ['web'], configure: c => { c.status = 'live'; c.channels = { web: { active: true }, voice: { active: false }, sms: { active: false } }; } });
  const { page, context } = await open(x, { width: W, height: H, hash: '#account' });
  await check('Account: Pause front desk button and scope say what stops and what keeps working', async () => {
    await route(page, 'account'); await page.locator('#pause').waitFor();
    assert.equal((await page.locator('#pause').innerText()).trim(), 'Pause front desk');
    const scope = await txt(page, '#accountServiceScope');
    assert.match(scope, /stops your front desk from answering website chat, calls and texts\. Calls may still ring your saved contact cell\./); assert.ok(scope.includes(KEEP));
    await page.locator('#pause').scrollIntoViewIfNeeded(); await shot(page, 'account-before-pause', W);
  });
  await check('Account: after pausing, message and summary match the Home banner wording', async () => {
    await page.locator('#pause').click(); await page.waitForFunction(() => /paused/i.test(document.getElementById('accountServiceStatus').textContent));
    assert.match(await txt(page, '#accountServiceMessage'), /^Front desk paused: website chat, calls and texts are not answered until you resume\. Calls may still ring your saved contact cell\./);
    assert.doesNotMatch(await txt(page, '#accountServiceMessage'), /calls (?:are|have)|delivered|forwarding (?:off|disabled)/i);
    const summary = await txt(page, '#accountServiceSummary'); assert.match(summary, /Your front desk is paused: website chat, calls and texts are not answered\. Calls may still ring your saved contact cell\./); assert.ok(summary.includes(KEEP));
    assert.equal((await page.locator('#resume').count()) + (await page.locator('#accountConnections').count()) > 0, true);
    await page.locator('#accountServiceStatus').scrollIntoViewIfNeeded(); await shot(page, 'account-paused', W);
  });
  await check('Home: paused banner names what stops', async () => {
    await route(page, 'today'); await page.locator('#homeServiceContext').waitFor({ state: 'visible' });
    assert.equal(await txt(page, '#homeServiceContext'), 'Your front desk is paused: website chat, calls and texts are not answered. Calls may still ring your saved contact cell. Resume it in Account.');
    await shot(page, 'home-paused', W);
  });
  await context.close();
}
{
  const x = await seed({ channels: ['web', 'voice', 'sms', 'calendar'] });
  const lead = await x.lead({ customer_name: 'Jim Homeowner', phone: '+17135550142', issue: 'AC blowing warm air' });
  const { page, context } = await open(x, { width: W, height: H, hash: '#account' });
  await check('Account downloads say Visits', async () => {
    await route(page, 'account'); const card = page.locator('#expBookings').locator('xpath=ancestor::div[1]');
    assert.match(await card.innerText(), /Visits/); assert.match(await page.locator('#expBookings').innerText(), /visits/i);
    await page.locator('#expBookings').scrollIntoViewIfNeeded(); await shot(page, 'account-downloads', W);
  });
  await check('Business details: short phone fallback note', async () => {
    await route(page, 'know'); await page.locator('#phoneFallbackNote').waitFor({ state: 'attached' });
    await page.locator('#phoneFallbackNote').evaluate(n => { let e = n; while (e) { if (e.hidden) e.hidden = false; if (e.tagName === 'DETAILS') e.open = true; e = e.parentElement; } });
    assert.equal((await page.locator('#phoneFallbackNote').textContent()).trim(), 'If our phone answering fails, calls go to your saved contact cell. Requests that need a person stay in Inbox. Live transfers need your approval below.');
    await page.locator('#phoneFallbackNote').scrollIntoViewIfNeeded(); await shot(page, 'business-details-phone-note', W);
  });
  await check('Connections: Manage service choices explanation is short', async () => {
    await route(page, 'setup'); const d = page.locator('#connectionPreferencesDetails'); await d.waitFor({ state: 'attached' });
    await d.evaluate(n => { n.open = true; }); const p = d.locator('.desk-preference-body > p.muted').first();
    assert.match(await p.innerText(), /^Choose the services you want\./); assert.ok((await p.innerText()).split(/\s+/).length <= 40);
    await d.scrollIntoViewIfNeeded(); await shot(page, 'connections-service-choices', W);
  });
  await check('Conversations: About conversation history is short', async () => {
    await route(page, 'convs'); const d = page.locator('#p-convs details.desk-record-note'); await d.waitFor({ state: 'attached' });
    await d.evaluate(n => { n.open = true; }); assert.match(await d.innerText(), /Previews show the latest 12 messages\./);
    await d.scrollIntoViewIfNeeded(); await shot(page, 'conversations-history-note', W);
  });
  await check('Activity report labels say requests', async () => {
    await route(page, 'today'); const btn = page.locator('#activityReportLoad');
    if (!(await btn.isVisible())) { const det = page.locator('#homeActivityDetails'); if (await det.count()) await det.evaluate(n => { n.open = true; }); }
    if (!(await btn.isVisible())) await page.locator('#activityReport').evaluate(n => { n.hidden = false; n.closest('[hidden]')?.removeAttribute('hidden'); });
    await btn.click(); await page.locator('#activityReportMetrics dt').first().waitFor();
    const m = await txt(page, '#activityReportMetrics'); assert.match(m, /New requests/); assert.doesNotMatch(m, /inquir/i);
    await page.locator('#activityReportMetrics').scrollIntoViewIfNeeded(); await shot(page, 'activity-report', W);
  });
  await check('Request dialog: one follow-up text note (section revealed for the screenshot)', async () => {
    await route(page, 'leads'); const b = page.locator('[data-lead="' + lead.id + '"], [data-request="' + lead.id + '"]').first();
    if (await b.count()) await b.evaluate(n => n.click()); else await page.evaluate(() => document.getElementById('requestDialog').showModal());
    await page.locator('#requestDialog[open]').waitFor();
    await page.locator('#requestAutoSection').evaluate(n => { n.hidden = false; n.open = true; });
    const note = page.locator('#requestAutoSection > p.muted').last();
    await note.evaluate(n => { let e = n; while (e) { if (e.hidden) e.hidden = false; if (e.tagName === 'DETAILS') e.open = true; e = e.parentElement; } n.scrollIntoView({ block: 'center' }); });
    assert.equal((await note.textContent()).trim(), 'One follow-up text per request. If a text may have gone out, it is not sent again. Visit texts and marking the job done are separate.');
    await shot(page, 'request-one-text-note', W);
    await page.evaluate(() => document.getElementById('requestDialog').close());
  });
  await check('Number cancel dialog copy (opened directly for the screenshot)', async () => {
    await page.evaluate(() => document.getElementById('phoneCancelDialog').showModal());
    const t = await txt(page, '#phoneCancelDialog'); assert.match(t, /we will release it\. Phone answering stays off\./); assert.doesNotMatch(t, /receipt|platform/);
    await shot(page, 'phone-cancel-dialog', W); await page.evaluate(() => document.getElementById('phoneCancelDialog').close());
  });
  await context.close();
}
{
  const x = await seed({ channels: ['web'] });
  const { page, context } = await open(x, { width: W, height: H, hash: '#today' });
  await check('Onboarding trade picker has no em dash (text only; native select options do not render in screenshots)', async () => {
    await page.goto(new URL('/onboard.html', page.url()).href); const opt = page.locator('option[value="other"]', { hasText: 'type your trade' }); await opt.waitFor({ state: 'attached' });
    assert.equal((await opt.textContent()).trim(), 'Other (type your trade)'); assert.equal(await page.locator('option', { hasText: '\u2014' }).count(), 0);
  });
  await context.close();
}
{
  const x = await seed({ channels: ['voice', 'sms'], configure: c => { c.status = 'live'; } });
  const { page, context } = await open(x, { width: W, height: H, hash: '#setup' });
  await check('Connections: Pause your front desk dialog matches Account wording', async () => {
    await route(page, 'setup');
    // The fixture cannot produce a verified phone/text connection, so the button that render() adds in that state is
    // injected into #connectionJourney; the click runs the actual handleConnectionClick and review() dialog code.
    await page.locator('#connectionJourney').evaluate(n => { const b = document.createElement('button'); b.type = 'button'; b.dataset.connection = 'pause_services'; b.textContent = 'Pause front desk'; b.id = 'copyfixPause'; n.hidden = false; n.append(b); });
    const b = page.locator('#copyfixPause');
    await b.evaluate(n => n.click()); const dlg = page.locator('dialog[open]').last(); await dlg.waitFor();
    const t = await dlg.innerText(); assert.match(t, /Pause your front desk\?/); assert.match(t, /stops answering website chat, calls and texts, and Google Calendar updates pause\. Calls may still ring your saved contact cell\./); assert.ok(t.includes(KEEP));
    await shot(page, 'connections-pause-dialog', W);
  });
  await context.close();
}
await finish('copy-shots');
