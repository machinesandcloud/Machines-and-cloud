// ---------- independent QA probes ----------
for (const [width, height] of [[390, 844]]) {
  await check(`QA lost APPLY response: Check is GET, confirms apply, no second apply/save (${width})`, async () => {
    const x = await open(await seed(width), { height }); const { page } = x;
    await toDetails(x, 'security', 'before-open');
    x.state.lose = body => body?.action === 'apply_service_intake';
    await page.locator('#intakeContinue').click();
    await page.waitForFunction(lost => document.getElementById('setupGuide').innerText.includes(lost) && !!document.getElementById('intakeReconcile'), INTAKE_LOST, { timeout: 8000 });
    assert.deepEqual(posts(x).map(r => r.action + ':' + r.status), ['save_service_intake:200', 'apply_service_intake:200'], 'save then apply (lost)');
    const text = await page.locator('#setupGuide').innerText();
    assert.ok(!/Details saved securely|saved details are confirmed/.test(text), 'No success while unconfirmed');
    const before = x.state.requests.length;
    await page.locator('#intakeReconcile').click();
    await page.waitForFunction(() => location.hash === '#setup/web/details-1-0', null, { timeout: 8000 }).catch(() => {});
    const after = x.state.requests.slice(before);
    report.observations.push({ check: x.slug, step: 'QA after apply reconcile', after: after.map(r => r.method + ':' + (r.action || r.query)), ...(await snapshot(page)) });
    assert.equal(after[0]?.method, 'GET', 'status check is GET');
    assert.deepEqual(posts(x).map(r => r.action), ['save_service_intake', 'apply_service_intake'], 'No write repeated after confirming lost apply: ' + JSON.stringify(posts(x)));
    assert.equal(await page.evaluate(() => location.hash), '#setup/web/details-1-0');
    await shot(page, 'qa-lost-apply-recovered-' + width);
  });
  await check(`QA lost save, server state then changed by another writer: Check is GET and shows conflict, no write (${width})`, async () => {
    const x = await open(await seed(width), { height }); const { page } = x;
    await toDetails(x, 'security', 'before-open');
    x.state.lose = body => body?.action === 'save_service_intake';
    x.state.dropAll = false;
    await page.locator('#intakeContinue').click();
    await page.waitForFunction(lost => document.getElementById('setupGuide').innerText.includes(lost), INTAKE_LOST, { timeout: 8000 });
    // Another writer (same owner, server-side) saves different web prefs, so lastSubmissionId no longer matches.
    const d = await dto(x);
    const r = await handlers['/api/client'](new Request(origin + '/api/client?c=' + x.slug, { method: 'POST', headers: { origin, authorization: 'Bearer ' + x.token, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'save_service_intake', expectedIntakeToken: d.serviceIntake.token, submissionId: 'c'.repeat(32), service: 'web', section: 'preferences', fields: { website: SITE, builder: 'squarespace', installationBy: 'me' }, selectService: true }) }), { ip: '192.0.2.71' });
    report.observations.push({ check: x.slug, step: 'QA other writer', status: r.status, body: (await r.text()).slice(0, 300) });
    const before = x.state.requests.length;
    await page.locator('#intakeReconcile').click();
    await page.waitForTimeout(1500);
    const after = x.state.requests.slice(before);
    report.observations.push({ check: x.slug, step: 'QA after conflict reconcile', after: after.map(r => r.method + ':' + (r.action || r.query)), ...(await snapshot(page)) });
    assert.ok(after.every(r => r.method === 'GET'), 'only GET after reconcile: ' + JSON.stringify(after));
    if (r.status === 200) assert.match(await page.locator('#setupGuide').innerText(), /Another saved change was found/);
  });
  await check(`QA identity: readable storage holds a DIFFERENT session (swap) blocks the save; no write (${width})`, async () => {
    const x = await open(await seed(width), { height }); const { page } = x;
    await toDetails(x, 'none', 'none');
    await page.evaluate(() => sessionStorage.setItem('mc-onboarding-session-v1', 'f'.repeat(64)));
    const writes = posts(x).length;
    await page.locator('#intakeContinue').click(); await page.waitForTimeout(800);
    assert.equal(posts(x).length, writes, 'No write under swapped session: ' + JSON.stringify(posts(x)));
  });
  await check(`QA identity (intermittent): storage readable WITHOUT session, then throws; save must not go out under old owner (${width})`, async () => {
    const x = await open(await seed(width), { height }); const { page } = x;
    await toDetails(x, 'none', 'none');
    await page.evaluate(() => sessionStorage.removeItem('mc-onboarding-session-v1'));
    await page.locator('#intakeContinue').click(); await page.waitForTimeout(500);
    const writesBlocked = posts(x).length;
    await breakStorage(page, 'security'); await storageBroken(page, 'security');
    await page.locator('#intakeContinue').click(); await page.waitForTimeout(1500);
    report.observations.push({ check: x.slug, step: 'QA intermittent removed->throw', writesBlocked, posts: posts(x).map(r => r.action + ':' + r.status + ':' + r.auth), ...(await snapshot(page)) });
    assert.equal(posts(x).length, 0, 'Write went out under the in-memory owner after storage said signed out: ' + JSON.stringify(posts(x)));
  });
  await check(`QA identity (intermittent): storage holds DIFFERENT session, then throws; save must not go out under old owner (${width})`, async () => {
    const x = await open(await seed(width), { height }); const { page } = x;
    await toDetails(x, 'none', 'none');
    await page.evaluate(() => sessionStorage.setItem('mc-onboarding-session-v1', 'f'.repeat(64)));
    await page.locator('#intakeContinue').click(); await page.waitForTimeout(500);
    await breakStorage(page, 'security');
    await page.locator('#intakeContinue').click(); await page.waitForTimeout(1500);
    report.observations.push({ check: x.slug, step: 'QA intermittent swap->throw', posts: posts(x).map(r => r.action + ':' + r.status + ':' + r.auth) });
    assert.equal(posts(x).length, 0, 'Write went out under the in-memory owner after storage showed another session: ' + JSON.stringify(posts(x)));
  });
}
