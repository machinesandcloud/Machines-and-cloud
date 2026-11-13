import { writeFileSync } from "node:fs";
const [pw, base, out] = process.argv.slice(2); const { chromium } = await import(pw);
const browser = await chromium.launch({ channel: "chrome", headless: true }); const res = { pages: [], external: [] };
for (const width of [390, 1440]) for (const page of ["terms-of-service", "privacy-policy", "sms-terms"]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } }), p = await ctx.newPage(), errors = [];
  await p.route("**/*", r => { const u = new URL(r.request().url()); if (u.hostname === "127.0.0.1") return r.continue(); res.external.push(u.origin + u.pathname); return r.abort(); });
  p.on("pageerror", e => errors.push(String(e))); p.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  const resp = await p.goto(`${base}/${page}.html`, { waitUntil: "load" });
  const info = await p.evaluate(() => {
    const footer = document.querySelector("footer"); const links = [...(footer?.querySelectorAll("a[href]") || [])].map(a => a.getAttribute("href"));
    const body = document.body.innerText; const h1 = document.querySelector("h1")?.innerText;
    return { overflow: document.documentElement.scrollWidth - window.innerWidth, h1, footerLinks: links, emDash: /—/.test(body), widget: !!document.querySelector('[class*="agent"], #mc-agent'), canonical: document.querySelector('link[rel=canonical]')?.href };
  });
  const broken = [];
  for (const href of info.footerLinks) { if (!href || /^(mailto:|tel:|https?:)/.test(href)) continue; const u = new URL(href, `${base}/${page}.html`); const r = await p.request.get(u.href); if (r.status() >= 400) broken.push(href + " " + r.status()); }
  await p.screenshot({ path: `${out}/${page}-${width}.png`, fullPage: false });
  res.pages.push({ page, width, status: resp.status(), ...info, brokenFooter: broken, errors });
  await ctx.close();
}
await browser.close(); writeFileSync(`${out}/legal-ui.json`, JSON.stringify(res, null, 1));
const bad = res.pages.filter(x => x.status !== 200 || x.overflow > 0 || x.emDash || x.brokenFooter.length || x.errors.length);
console.log(JSON.stringify(res.pages.map(x => [x.page, x.width, x.status, x.overflow, x.footerLinks.length, x.brokenFooter, x.errors.length, x.h1])));
console.log("external aborted:", [...new Set(res.external)]); console.log(`legal-ui: ${res.pages.length - bad.length}/${res.pages.length}`);
