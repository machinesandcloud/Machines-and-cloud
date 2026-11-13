// PRA-FC-05: after a connection review request the owner is told what happens next, truthfully: our team
// will email them at the saved address, no response time is promised, and how to reach support meanwhile.
import { assert, launch, seed, open, route, shot, check, finish, noHScroll } from './fc-lib.mjs';
await launch();
for (const [width, height] of [[390, 844], [1440, 900]]) {
  const x = await seed({ channels: ['web', 'voice', 'sms', 'calendar'] });
  const { page, context } = await open(x, { width, height, hash: '#setup' });
  await route(page, 'setup');
  await check(`phone review request says we will email, with no invented time frame, and gives support contact @${width}`, async () => {
    await page.locator('[data-guide-service="voice"]').click();
    await page.waitForFunction(() => document.getElementById('setupGuide')?.dataset.guideSelectedService === 'voice');
    await page.locator('#connectorRequestReview').click();
    await page.locator('#connectionReviewReference').waitFor({ timeout: 15000 });
    const next = page.locator('#connectionReviewReceipt [data-review-next]'); await next.waitFor();
    const text = await next.innerText();
    assert.ok(text.includes('will email you at ' + x.c.owner.email), text);
    assert.ok(text.includes('We can’t promise a set response time.'), text);
    assert.ok(!/\b(\d+\s*(hours?|days?|minutes?)|within|by tomorrow|24\/7)\b/i.test(text), 'no invented SLA: ' + text);
    assert.equal(await next.locator('a').getAttribute('href'), 'mailto:support@machinesandcloud.com');
    await next.scrollIntoViewIfNeeded(); await noHScroll(page); await shot(page, 'fc05-review-next', width);
  });
  await check(`a resolved review drops the "we will email you" promise @${width}`, async () => {
    const { store } = await import('./fc-lib.mjs'); const c = await store.get('clients', x.slug);
    for (const r of c.management?.supportReports || []) Object.assign(r, { status: 'resolved', resolvedAt: new Date().toISOString(), resolution: 'Set up together on a call.' });
    await store.put('clients', x.slug, c); await page.reload(); await page.waitForFunction(() => document.body.dataset.workspaceState === 'ready'); await route(page, 'setup');
    assert.ok((c.management?.supportReports || []).length >= 1, 'review report saved');
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('mc:service-guide', { detail: { service: 'voice' } })));
    await page.locator('#connectionReviewReceipt[data-report-status="resolved"]').waitFor({ timeout: 15000 });
    assert.equal(await page.locator('#connectionReviewReceipt [data-review-next]').count(), 0);
  });
  await context.close();
}
await finish('fc05-review-next-steps');
