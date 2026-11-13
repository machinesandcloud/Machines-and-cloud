const { webkit } = await import("/Users/stevengoumnai/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs");
const B = "http://127.0.0.1:9855", MB = "http://127.0.0.1:9854", email = "webkit-" + Date.now() % 1e5 + "@example.test";
const b = await webkit.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
await ctx.route("**/*", r => new URL(r.request().url()).hostname === "127.0.0.1" ? r.continue() : r.abort());
const page = await ctx.newPage(); const errs = []; page.on("pageerror", e => errs.push(String(e.message)));
await fetch(B + "/__qa/strip?on=" + process.argv[3]);
await page.goto(B + "/onboard.html?signin=1"); await page.fill("#access-email", email); await page.click("#access-send"); await page.waitForTimeout(1000);
let box; for (let i = 0; i < 30 && !box; i++) { box = await (await fetch(MB + "/outbox?email=" + encodeURIComponent(email))).json(); await new Promise(r => setTimeout(r, 200)); }
await page.goto(box.link); await page.waitForTimeout(3000); await page.screenshot({ path: process.argv[2] });
const ok = await page.locator("[data-step='1']").isVisible(); const p2 = await ctx.newPage(); await p2.goto(B + "/onboard.html"); await p2.waitForTimeout(2500); const ok2 = await p2.locator("[data-step='1']").isVisible();
console.log(JSON.stringify({ engine: "webkit " + b.version(), strip: process.argv[3], signedIn: ok, secondTabSignedIn: ok2, pageErrors: errs })); await fetch(B + "/__qa/strip?on=0"); await b.close();
