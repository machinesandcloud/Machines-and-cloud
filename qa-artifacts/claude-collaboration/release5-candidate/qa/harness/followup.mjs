// Compare request/quote follow-up texts: production outreach() source vs candidate requestFollowupText(); GSM-7 + compliance check for Spanish.
import { readFileSync } from "node:fs";
const prodSrc = readFileSync(process.argv[2] + "/netlify/functions/lib/request-followup.mjs", "utf8");
const fn = prodSrc.match(/function outreach\(c,lead,plan\)\{return [\s\S]*?;\}/)[0];
const prodOutreach = new Function("return " + fn)();
const { requestFollowupText, requestFollowupQuestion } = await import(process.cwd() + "/netlify/functions/lib/request-followup.mjs");
const GSM = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const out = [];
for (const name of ["Bayou Plumbing", "Plomería José & Hijos"]) for (const purpose of ["request_followup", "quote_followup"]) for (const quoteUrl of ["", "https://example.test/q/1"]) {
  const c = { business: { name }, slug: "x" }, plan = { purpose, quoteUrl };
  const en = requestFollowupText(c, { id: "abc123", language: "en" }, plan), none = requestFollowupText(c, { id: "abc123" }, plan), prod = prodOutreach(c, { id: "abc123" }, plan);
  const es = requestFollowupText(c, { id: "abc123", language: "es" }, plan);
  const nonGsm = [...es.replace(name, "")].filter(ch => !GSM.includes(ch));
  out.push({ name, purpose, quoteUrl, enIdentical: en === prod && none === prod, es, esLen: es.length, nonGsm, hasStop: /STOP/.test(es) && /ALTO/.test(es), hasHelp: /AYUDA/.test(es), hasName: es.startsWith(name + ":") });
}
const fails = out.filter(o => !o.enIdentical || o.nonGsm.length || !o.hasStop || !o.hasHelp || !o.hasName);
console.log(JSON.stringify({ cases: out.length, fails: fails.length, out, question: requestFollowupQuestion({ business: { name: "Bayou" }, slug: "bayou" }, { id: "abc123", language: "es" }, "request_followup") }, null, 1));
process.exit(fails.length ? 1 : 0);
