// Independent release-2 browser walk against the real local server (loopback only). Non-loopback requests are aborted, never fetched.
// node walk.mjs <width> <outdir> [base=http://127.0.0.1:9853]
import { writeFileSync, mkdirSync } from "node:fs";
const PW = "/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs";
const { chromium } = await import(PW);
const W = Number(process.argv[2]), OUT = process.argv[3], B = process.argv[4] || "http://127.0.0.1:9853", MB = "http://127.0.0.1:9854";
mkdirSync(OUT, { recursive: true });
const email = `owner-${W}-${Date.now() % 100000}@example.test`;
const R = { width: W, base: B, email, steps: [], pageErrors: [], consoleErrors: [], blocked: [], downloads: [] };
const step = (id, ok, info = {}) => { R.steps.push({ id, ok, ...info }); console.log((ok ? "ok   " : "FAIL ") + id + " " + JSON.stringify(info).slice(0, 400)); };
const browser = await chromium.launch({ headless: true, executablePath: "/Users/stevengoumnai/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell", args: ["--disable-background-networking", "--disable-component-update", "--no-first-run"] });
const ctx = await browser.newContext({ viewport: { width: W, height: W < 600 ? 844 : 900 }, serviceWorkers: "block", acceptDownloads: true });
ctx.setDefaultTimeout(8000);
await ctx.route("**/*", route => { const u = new URL(route.request().url()); if (u.hostname === "127.0.0.1") return route.continue(); R.blocked.push(u.origin); return route.abort("blockedbyclient"); });
const watch = p => { p.on("pageerror", e => R.pageErrors.push({ url: p.url(), msg: String(e.message || e).slice(0, 300) })); p.on("console", m => { if (m.type() === "error" && !/ERR_BLOCKED_BY_CLIENT|Failed to load resource/.test(m.text())) R.consoleErrors.push({ url: p.url(), msg: m.text().slice(0, 300) }); }); };
let page = await ctx.newPage(); watch(page);
let shotN = 0; const shot = async (name, full = false, p = page) => { const f = `${String(++shotN).padStart(2, "0")}-${name}.png`; try { await p.screenshot({ path: `${OUT}/${f}`, fullPage: full }); } catch (e) { } return f; };
const overflow = async (p = page) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const outbox = async addr => { for (let i = 0; i < 30; i++) { const r = await (await fetch(MB + "/outbox?email=" + encodeURIComponent(addr))).json(); if (r) return r; await new Promise(r => setTimeout(r, 200)); } return null; };
const T = async (id, fn) => { try { await fn(); } catch (e) { step(id, false, { error: String(e.message || e).split("\n")[0].slice(0, 300) }); await shot(id + "-error"); } };
const mobile = W < 900;
async function nav(text) { if (mobile && await page.locator("#navToggle").isVisible()) { await page.click("#navToggle"); await page.waitForTimeout(250); } await page.locator("#navMenu a", { hasText: text }).first().click(); await page.waitForTimeout(700); }
async function deskTab(t) { if (mobile) { const m = page.locator("button[aria-controls='deskNav'], #deskMenu, button:has-text('Menu')").first(); if (await m.isVisible().catch(() => false)) { await m.click(); await page.waitForTimeout(200); } } await page.locator(`button[data-t='${t}']`).first().click(); await page.waitForTimeout(800); }

// ---------- Homepage, demo, plans ----------
await T("H1-home", async () => { await page.goto(B + "/"); await page.waitForTimeout(800); const ov = await overflow(); const h1 = await page.locator("h1").first().innerText(); await shot("home-top"); step("H1-home", ov <= 0, { h1, overflowPx: ov }); });
await T("H2-plans", async () => {
  await nav("Plans"); const open = await page.locator("#plans details.site-future-plans").evaluate(d => d.open).catch(() => null);
  const txt = await page.locator("#plans").innerText(); const prices = (txt.match(/\$\d+/g) || []);
  const allowance = (await page.locator("body").innerText()).match(/[^.\n]*AI replies a day[^.\n]*\.?/g) || [];
  const chats = (await page.locator("body").innerText()).match(/[^.\n]*customer chats a day[^.\n]*/g) || [];
  await page.locator("#plans").scrollIntoViewIfNeeded(); await shot("plans", false);
  step("H2-plans", open === true && prices.length >= 2 && allowance.length >= 1 && chats.length === 0, { detailsOpen: open, prices, allowance, chatsWording: chats });
  const homeText = await page.locator("main").innerText(); const allPrices = homeText.match(/\$\d[\d,]*/g) || []; step("H2b-each-price-once", ["$99", "$249"].every(p => allPrices.filter(x => x === p).length === 1), { allPrices });
});
await T("H3-demo", async () => {
  await page.goto(B + "/#week"); await page.waitForTimeout(6000); await page.locator("#demo-wrap, #week").first().scrollIntoViewIfNeeded(); await shot("demo-watch");
  if (!(await page.locator("#example-input").isVisible())) { await page.locator("#example-mode-live").scrollIntoViewIfNeeded(); await page.click("#example-mode-live"); await page.waitForTimeout(500); } const box = page.locator("#example-input"); await box.scrollIntoViewIfNeeded(); await box.fill("Do you service Katy, and how much is a drain cleaning?"); await page.click("#example-send");
  await page.waitForTimeout(4000); const conv = await page.locator("#demo-wrap").innerText(); await shot("demo-typed");
  step("H3-demo", !/could not|went wrong|try again later/i.test(conv.slice(-400)), { tail: conv.slice(-300) });
});
// ---------- Inquiry -> verify -> onboarding ----------
await T("I1-inquiry", async () => {
  await page.goto(B + "/#pilot"); await page.waitForTimeout(500);
  await page.fill("#intake-name", "Alex Rivera"); await page.fill("#intake-email", email); await page.fill("#intake-business", "Rivera Air QA");
  await shot("inquiry-filled"); await page.click("#intake-submit"); await page.waitForURL(/onboard/, { timeout: 10000 }); await page.waitForTimeout(1500); await shot("after-inquiry");
  step("I1-inquiry", /onboard/.test(page.url()), { url: page.url().replace(/#.*/, "#…") });
});
await T("V1-verify", async () => {
  const send = page.locator("#access-send"); if (await send.isVisible().catch(() => false)) { const v = await page.locator("#access-email").inputValue(); if (!v) await page.fill("#access-email", email); await send.click(); await page.waitForTimeout(1000); }
  await shot("verify-sent"); const msg = await page.locator("body").innerText();
  const box = await outbox(email); if (!box) throw new Error("no link in outbox; page says: " + msg.slice(0, 300));
  await page.goto(box.link.replace("http://127.0.0.1:9853", B)); await page.waitForTimeout(2500); await shot("verified");
  step("V1-verify", await page.locator("[data-step='1']").isVisible().catch(() => false), { url: page.url().replace(/#.*/, "") });
});
const next = async n => { await page.click("#next"); await page.waitForTimeout(1200); await shot("onboard-after-step" + n); };
await T("O1-onboarding", async () => {
  await shot("onboard-step1"); await page.fill("#name", "Alex Rivera"); await page.fill("#phone", "(713) 555-0101"); await next(1);
  if (await page.locator("#business").isVisible()) { if (!(await page.inputValue("#business"))) await page.fill("#business", "Rivera Air QA"); }
  const opts = await page.locator("#trade option").evaluateAll(o => o.map(x => x.value).filter(Boolean)); await page.selectOption("#trade", opts.find(v => /hvac|air/i.test(v)) || opts[0]);
  await page.fill("#services", "AC repair\nAC replacement"); await page.fill("#serviceArea", "Katy, Cypress"); await page.fill("#hours", "Mon to Fri 7 to 6, Sat 8 to 12");
  await shot("onboard-step2"); await next(2);
  await page.fill("#windows", "8 to 12\n12 to 5"); await shot("onboard-step3"); await next(3);
  await shot("onboard-step4", true);
  for (let i = 0; i < 4 && !/desk/.test(page.url()); i++) { const b = page.locator("#next"); if (await b.isVisible().catch(() => false)) { await b.click(); await page.waitForTimeout(2500); } else break; }
  await shot("onboard-ready"); if (!/desk/.test(page.url())) { const go = page.locator("a:has-text('Open workspace overview'), button:has-text('Open workspace overview')").first(); if (await go.isVisible().catch(() => false)) { await go.click(); await page.waitForTimeout(2500); } }
  await page.waitForURL(/desk/, { timeout: 15000 }); await page.waitForTimeout(2500); if (new URL(page.url()).origin !== B) { const u = new URL(page.url()); R.originRewrites = (R.originRewrites || 0) + 1; await page.goto(B + u.pathname + u.search + u.hash); await page.waitForTimeout(2500); } await shot("desk-first");
  step("O1-onboarding", /desk/.test(page.url()), { url: page.url() });
});
let slug = new URL(page.url()).searchParams.get("c"); R.slug = slug;
await T("D0-seed", async () => { const s = await (await fetch(MB + "/seed?slug=" + slug)).json(); step("D0-seed", !JSON.stringify(s).includes("ERR"), { seed: JSON.stringify(s).slice(0, 300) }); await page.reload(); await page.waitForTimeout(3000); await shot("desk-home-seeded", true); });
// ---------- Second tab of the same browser (sign-in rev 4) ----------
await T("T2-second-tab", async () => { const p2 = await ctx.newPage(); watch(p2); await p2.goto(B + "/desk.html?c=" + slug); await p2.waitForTimeout(3000); const signin = await p2.locator("text=/sign-in link|Sign in by email|Send my sign-in/i").first().isVisible().catch(() => false); const ok = await p2.locator("button[data-t='leads']").first().isVisible().catch(() => false); await shot("second-tab", false, p2); step("T2-second-tab-opens-without-link", ok && !signin, { signinPrompt: signin }); await p2.close(); });
// ---------- Desk: details + hours grid ----------
await T("D1-details", async () => {
  await deskTab("setup"); await page.waitForTimeout(500); const det = page.locator("#frontDeskNav button, #frontDeskNav a", { hasText: /details|business/i }).first(); if (await det.isVisible().catch(() => false)) { await det.click(); await page.waitForTimeout(800); }
  await page.locator("#cfg").scrollIntoViewIfNeeded(); await shot("details");
  const area = page.locator("#cfg [name='business.serviceArea']"); if (await area.count()) { await area.fill("Katy, Cypress, Sugar Land"); }
  await page.locator("#hoursDetails").evaluate(d => { if (d.tagName === "DETAILS") d.open = true; }).catch(() => { });
  await page.locator("#hoursRows").scrollIntoViewIfNeeded(); await shot("hours-grid");
  const satClose = page.locator("#hoursRows [aria-label^='sat closing time']").first(); const lineBefore = await page.locator("#cfg [name='business.hours']").inputValue().catch(() => null); R.hoursLineBefore = lineBefore;
  const inputs = await page.locator("#hoursRows input, #hoursRows select").evaluateAll(e => e.map(x => x.name || x.id || x.getAttribute("aria-label")).slice(0, 30));
  let changed = false; if (await satClose.count()) { await satClose.fill("14:00"); changed = true; }
  await page.click("#saveCfg"); await page.waitForTimeout(2500); await page.locator("#saveCfg").scrollIntoViewIfNeeded(); await shot("details-saved");
  R.hoursLineAfter = await page.locator("#cfg [name='business.hours']").inputValue().catch(() => null); const msg = await page.locator("#cfg").innerText(); const kept = await page.locator("#hoursKept").innerText().catch(() => "");
  step("D1-details-save", /saved/i.test(msg) && !/could not|error/i.test(msg.slice(-300)), { hoursInputs: inputs.slice(0, 8), satChanged: changed, hoursNotice: kept, tail: msg.slice(-240) });
});
// ---------- Inbox Open / Done ----------
await T("D2-inbox", async () => {
  await deskTab("leads"); await page.waitForTimeout(1200); await shot("inbox", true); const txt = await page.locator("#p-leads").innerText();
  const btns = await page.locator("#p-leads button:visible").evaluateAll(b => b.map(x => x.textContent.trim()).filter(Boolean).slice(0, 30));
  step("D2-inbox-lists", /Dan Wu|Maria Lopez/.test(txt) && /\(\d{3}\) \d{3}-\d{4}/.test(txt), { buttons: btns, phonesFormatted: /\(\d{3}\) \d{3}-\d{4}/.test(txt), rawCodes: (txt.match(/\b[a-z]+_[a-z_]+\b/g) || []).slice(0, 5) });
  const done = page.locator("#p-leads button:visible", { hasText: /^(Done|Mark done)/ }).first();
  if (await done.count()) { await done.click(); await page.waitForTimeout(1500); const dlg = page.locator("dialog[open]"); if (await dlg.count()) { await shot("inbox-done-dialog"); const c = dlg.locator("button", { hasText: /done|save|confirm/i }).first(); if (await c.count()) { await c.click(); await page.waitForTimeout(1500); } } await shot("inbox-after-done", true); const t2 = await page.locator("#p-leads").innerText(); step("D2-inbox-done", true, { tail: t2.slice(0, 400) }); }
  else step("D2-inbox-done", false, { error: "no Done button", buttons: btns });
  const openBtn = page.locator("#p-leads button:visible", { hasText: /^Open/ }).first(); if (await openBtn.count()) { await openBtn.click(); await page.waitForTimeout(1000); await shot("inbox-open-tab"); step("D2-inbox-open-tab", true, { text: (await page.locator("#p-leads").innerText()).slice(0, 300) }); }
});
// ---------- Customers ----------
await T("D3-customers", async () => {
  const cust = page.locator("#inboxNav button, #inboxNav a", { hasText: /Customers/ }).first(); await cust.click(); await page.waitForTimeout(1500); await shot("customers");
  await page.fill("#customerSearch", "maria"); await page.waitForTimeout(800); await shot("customers-search");
  const list = await page.locator("#customerList").innerText(); const status = await page.locator("#customerSearchStatus").innerText().catch(() => "");
  step("D3-customers-search", /Maria/.test(list) && !/Dan Wu/.test(list), { status, list: list.slice(0, 300) });
  await page.fill("#customerSearch", "2815550177"); await page.waitForTimeout(800); const l2 = await page.locator("#customerList").innerText(); step("D3-customers-phone-search", /Dan Wu/.test(l2), { list: l2.slice(0, 200) });
  await page.fill("#customerSearch", "");
});
// ---------- Schedule: visit edit ----------
await T("D4-visit-edit", async () => {
  await deskTab("availability"); await page.waitForTimeout(1500); await shot("schedule", true);
  if (mobile) { await page.locator("#p-availability button:visible", { hasText: /^Agenda$/ }).first().click(); await page.waitForTimeout(800); await shot("schedule-agenda", true); } const v = page.locator("#p-availability button:visible, #p-availability [role=button]:visible", { hasText: /Maria|Lopez/ }).first(); R.scheduleButtons = await page.locator("#p-availability button:visible").evaluateAll(b => b.map(x => x.textContent.trim().slice(0, 40)).slice(0, 25)); await v.click(); await page.waitForTimeout(1000);
  await page.locator("#visitDialog[open]").waitFor({ timeout: 4000 }); await shot("visit-dialog");
  await page.click("#editVisitDetails"); await page.waitForTimeout(500); await page.fill("#visitEditName", "Maria Lopez-Garza"); await shot("visit-edit-form");
  await page.click("#saveVisitDetails"); await page.waitForTimeout(2000); await shot("visit-edit-saved");
  const d = await page.locator("#visitDialog").innerText(); step("D4-visit-edit", /Lopez-Garza/.test(d) && !/could not/i.test(d), { dialog: d.slice(0, 400) });
  const close = page.locator("#closeVisit"); if (await close.isVisible().catch(() => false)) await close.click();
});
// ---------- Connections ----------
await T("D5-connections", async () => {
  await deskTab("setup"); const c = page.locator("#frontDeskNav button, #frontDeskNav a", { hasText: /Connections/ }).first(); if (await c.count()) { await c.click(); await page.waitForTimeout(1200); }
  await page.locator("#connectionsCard, #serviceConnections").first().scrollIntoViewIfNeeded().catch(() => { }); await shot("connections", true);
  const t = await page.locator("main").innerText(); step("D5-connections", /Website chat/i.test(t) && /Phone|Text|Calendar/i.test(t), { claimsLive: (t.match(/[^.\n]*(is live|are live|now answering)[^.\n]*/gi) || []).slice(0, 5), ov: await overflow() });
});
// ---------- Account: export, pause/resume ----------
await T("A1-export", async () => {
  await page.click("#tabAccount").catch(async () => { await page.goto(B + "/desk.html?c=" + slug + "#account"); }); await page.waitForTimeout(1500); await shot("account", true);
  const links = await page.locator("#accountDownloads a:visible, #accountDownloads button:visible").evaluateAll(a => a.map(x => x.textContent.trim()));
  const dl = page.waitForEvent("download", { timeout: 8000 }); await page.locator("#accountDownloads a:visible, #accountDownloads button:visible").first().click(); const d = await dl; const p = `${OUT}/export-${d.suggestedFilename()}`; await d.saveAs(p);
  const { readFileSync } = await import("node:fs"); const csv = readFileSync(p, "utf8"); R.downloads.push({ name: d.suggestedFilename(), bytes: csv.length, head: csv.split("\n")[0].slice(0, 200), rows: csv.trim().split("\n").length - 1 });
  step("A1-export", csv.length > 10, { links, file: d.suggestedFilename(), rows: csv.trim().split("\n").length - 1, header: csv.split("\n")[0].slice(0, 160) });
});
await T("A2-pause", async () => {
  R.serviceButtons = await page.locator("#p-account button:visible").evaluateAll(b => b.map(x => x.textContent.trim().slice(0, 40)));
  if (!(await page.locator("#accountServiceControls button:visible", { hasText: /Pause/ }).count())) {
    // Pause is offered only while a service is live; a new workspace offers Stop service (recoverable). Walk Stop -> reopen instead.
    await page.locator("#accountStopService button:visible").first().click(); await page.waitForTimeout(800); const dlg = page.locator("dialog[open]"); await shot("stop-dialog");
    if (await dlg.count()) { const inputs = dlg.locator("input[type=checkbox]"); for (let i = 0; i < await inputs.count(); i++) await inputs.nth(i).check(); const t = dlg.locator("input[type=text]"); if (await t.count()) await t.first().fill("STOP"); await dlg.locator("button", { hasText: /Yes, stop service/i }).click(); await page.waitForTimeout(2500); }
    await shot("stopped", true); const body = await page.locator("main").innerText(); step("A2-stop", /stopped/i.test(body), { msg: (body.match(/[^\n]*stopped[^\n]*/i) || [""])[0].slice(0, 200), pauseOffered: false });
    const reopen = page.locator("button:visible", { hasText: /Reopen|Resume|Restart/i }).first(); if (await reopen.count()) { await reopen.click(); await page.waitForTimeout(800); const d2 = page.locator("dialog[open]"); if (await d2.count()) await d2.locator("button", { hasText: /Reopen|Resume|Restart|Yes/i }).last().click(); await page.waitForTimeout(2500); await shot("reopened", true); const b2 = await page.locator("main").innerText(); step("A2-reopen", !/workspace is stopped|service is stopped/i.test(b2), { tail: b2.slice(0, 200) }); } else step("A2-reopen", false, { error: "no reopen control" });
    return;
  }
  const pause = page.locator("#accountServiceControls button:visible", { hasText: /Pause/ }).first(); await pause.click(); await page.waitForTimeout(800);
  const dlg = page.locator("dialog[open]"); if (await dlg.count()) { await shot("pause-dialog"); await dlg.locator("button", { hasText: /Pause/ }).last().click(); await page.waitForTimeout(2000); }
  await shot("paused", true); const s = await page.locator("#accountServiceControls").innerText(); step("A2-pause", /paused/i.test(s), { status: s.slice(0, 300) });
  const resume = page.locator("#accountServiceControls button:visible", { hasText: /Resume/ }).first(); if (await resume.count()) { await resume.click(); await page.waitForTimeout(800); const d2 = page.locator("dialog[open]"); if (await d2.count()) await d2.locator("button", { hasText: /Resume/ }).last().click(); await page.waitForTimeout(2000); await shot("resumed"); step("A2-resume", !/paused/i.test((await page.locator("#accountServiceStatus").innerText()).slice(0, 80)), { status: (await page.locator("#accountServiceControls").innerText()).slice(0, 200) }); }
});
// ---------- Session expiry on Customers (RC2-D1) ----------
await T("S1-expiry", async () => {
  await deskTab("leads"); await page.locator("#inboxNav button, #inboxNav a", { hasText: /Customers/ }).first().click(); await page.waitForTimeout(800);
  const before = R.pageErrors.length; const ex = await (await fetch(MB + "/expire")).json();
  await page.fill("#customerSearch", "mar"); await page.waitForTimeout(400);
  await deskTab("leads").catch(() => { }); await page.waitForTimeout(2500);
  try { await page.locator("#inboxNav button, #inboxNav a", { hasText: /Customers/ }).first().click({ timeout: 2000 }); } catch { }
  await page.waitForTimeout(1500); await shot("session-expired");
  const body = await page.locator("body").innerText(); step("S1-expiry-message", /session expired|sign in/i.test(body), { expired: ex.expired, newPageErrors: R.pageErrors.slice(before), msg: (body.match(/[^\n]*(expired|Sign in)[^\n]*/i) || [""])[0].slice(0, 200) });
  step("S1-expiry-no-page-error", R.pageErrors.length === before, {});
});
// ---------- Sign out, then sign in again ----------
await T("A3-signin-again", async () => {
  // the expiry above already ended the session; sign in again by email from the desk's own recovery path
  await page.goto(B + "/onboard.html?signin=1"); await page.waitForTimeout(1200); await shot("signin-page");
  await page.fill("#access-email", email); await page.click("#access-send"); await page.waitForTimeout(1200); await shot("signin-sent");
  const box = await outbox(email); await page.goto(box.link.replace("http://127.0.0.1:9853", B)); await page.waitForURL(/desk/, { timeout: 15000 }); await page.waitForTimeout(2500); if (new URL(page.url()).origin !== B) { const u = new URL(page.url()); R.originRewrites = (R.originRewrites || 0) + 1; await page.goto(B + u.pathname + u.search + u.hash); await page.waitForTimeout(2500); }  await shot("signed-in-again");
  step("A3-signin-again-desk", await page.locator("button[data-t='leads']").first().isVisible(), { url: page.url() });
});
await T("A4-signout", async () => {
  await page.click("#tabAccount").catch(() => { }); await page.waitForTimeout(800);
  const so = page.locator("#deskSignOut"); await so.scrollIntoViewIfNeeded().catch(() => { }); await so.click(); await page.waitForTimeout(2000); await shot("signed-out");
  const body = await page.locator("body").innerText(); step("A4-signout", /signed out|sign in/i.test(body), { msg: (body.match(/[^\n]*(signed out|Sign in)[^\n]*/i) || [""])[0].slice(0, 200) });
  const p2 = await ctx.newPage(); watch(p2); await p2.goto(B + "/desk.html?c=" + slug); await p2.waitForTimeout(2500); await shot("after-signout-new-tab", false, p2);
  step("A4-signout-other-tab-closed", !(await p2.locator("button[data-t='leads']").first().isVisible().catch(() => false)), {}); await p2.close();
});
R.denied = await (await fetch(MB + "/denied")).json();
writeFileSync(`${OUT}/walk-${W}.json`, JSON.stringify(R, null, 1));
console.log(JSON.stringify({ steps: R.steps.length, failed: R.steps.filter(s => !s.ok).map(s => s.id), pageErrors: R.pageErrors, consoleErrors: R.consoleErrors.slice(0, 5), blocked: [...new Set(R.blocked)], denied: R.denied }));
await browser.close();
