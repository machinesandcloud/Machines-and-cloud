// Mixed case: cookie sign-in while the header arrives, then the header disappears mid-session.
import { writeFileSync } from "node:fs";
const { chromium } = await import("/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs");
const B = "http://127.0.0.1:9855", MB = "http://127.0.0.1:9854", OUT = process.argv[2], email = "mixed-" + Date.now() % 1e5 + "@example.test", R = { steps: [], pageErrors: [] };
const step = (id, ok, info = {}) => { R.steps.push({ id, ok, ...info }); console.log((ok ? "ok   " : "FAIL ") + id + " " + JSON.stringify(info).slice(0, 300)); };
const strip = on => fetch(B + "/__qa/strip?on=" + (on ? 1 : 0));
const outbox = async () => { for (let i = 0; i < 30; i++) { const r = await (await fetch(MB + "/outbox?email=" + encodeURIComponent(email))).json(); if (r && r.createdAt !== R.lastAt) { R.lastAt = r.createdAt; return r; } await new Promise(r => setTimeout(r, 200)); } };
const b = await chromium.launch({ headless: true, executablePath: "/Users/stevengoumnai/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell" }); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
await ctx.route("**/*", r => new URL(r.request().url()).hostname === "127.0.0.1" ? r.continue() : r.abort());
const page = await ctx.newPage(); page.on("pageerror", e => R.pageErrors.push(String(e.message)));
async function signin(tag) { await page.goto(B + "/onboard.html?signin=1"); await page.fill("#access-email", email); await page.click("#access-send"); await page.waitForTimeout(800); const box = await outbox(); await page.goto(box.link); await page.waitForTimeout(3000); await page.screenshot({ path: OUT + "/mixed-" + tag + ".png" }); return page.locator("[data-step='1']").isVisible(); }
await strip(false); step("M1-cookie-signin (header present)", await signin("1-cookie"), {});
const cookies = (await ctx.cookies()).map(c => c.name); step("M1-cookie-set", cookies.includes("mc_owner"), { cookies });
await strip(true); await page.reload(); await page.waitForTimeout(3000); await page.screenshot({ path: OUT + "/mixed-2-after-strip-reload.png" });
const body = await page.locator("body").innerText(); const signedIn = await page.locator("[data-step='1']").isVisible();
step("M2-header-lost-mid-session -> owner asked to sign in again (not silent breakage)", !signedIn && /sign-in link|Send my sign-in/i.test(body), { signedIn, msg: body.slice(0, 200) });
step("M3-sign-in again while header missing -> per-tab session works", await signin("3-tab"), {});
await page.fill("#name", "Mixed Owner"); await page.waitForTimeout(1500); await page.reload(); await page.waitForTimeout(2500); step("M4-tab session survives reload in same tab", await page.locator("[data-step='1']").isVisible(), {});
step("M5-no page errors", R.pageErrors.length === 0, { pageErrors: R.pageErrors });
await strip(false); writeFileSync(OUT + "/mixed.json", JSON.stringify(R, null, 1)); await b.close();
