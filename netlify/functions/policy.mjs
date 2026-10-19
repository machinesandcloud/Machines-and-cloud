// Per-shop texting terms and privacy page, hosted by us: /policy?c=slug. Carriers require these URLs
// on every 10DLC campaign; most small shops have neither page.
import { getClient } from "./lib/store.mjs";
import { DATA_POLICY } from "./lib/config.mjs";

export const config = { path: "/policy" };

const esc = (s) => String(s || "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

export default async (req) => {
  const url = new URL(req.url);
  const c = await getClient(url.searchParams.get("c") || "");
  if (!c) return new Response("<!DOCTYPE html><title>Not found</title><p>No such business.</p>", { status: 404, headers: { "Content-Type": "text/html" } });
  const termsFirst = url.searchParams.get("page") === "terms";
  const name = esc(c.business?.name || "this business");
  const phone = esc(c.phone?.twilioNumber || c.phone?.businessNumber || "");
  const email = esc(c.owner?.email || "");
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${name}: ${termsFirst ? "texting terms" : "texting and privacy terms"}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif;max-width:760px;margin:40px auto;padding:0 20px;color:#1E2433;line-height:1.6}h1{font-size:1.6rem}h2{font-size:1.15rem;margin-top:28px}p,li{font-size:15px}.muted{color:#5B6273;font-size:13px}</style></head><body>
<h1>${name}: ${termsFirst ? "texting terms" : "texting and privacy terms"}</h1>
<p class="muted">${name} uses a front desk service operated by Machines &amp; Cloud (Houston, Texas) to answer calls, texts, and website chats and to send appointment messages. Last updated ${new Date().toISOString().slice(0, 10)}.</p>
<h2 id="terms">Text messaging terms</h2>
<ul>
<li><b>Program.</b> When you contact ${name} by phone, text, or website chat, or book a visit, you may receive text messages about your request and your appointments: replies to your questions, booking confirmations, reminders, a notice when the technician is on the way, a follow-up on an open estimate, an invoice reminder, and one request for a review after a completed job.</li>
<li><b>Opt-in.</b> You agree to receive these messages by texting ${name}, by giving your mobile number when you book, or by asking for a text reply. Consent is not a condition of purchase.</li>
<li><b>Frequency.</b> Message frequency varies by appointment; typically fewer than 6 per visit.</li>
<li><b>Opt-out.</b> Reply STOP to any message to stop all texts from ${name}. You will get one confirmation and nothing further. Reply START to opt back in.</li>
<li><b>Help.</b> Reply HELP for help, or contact ${name}${phone ? ` at ${phone}` : ""}${email ? ` or ${email}` : ""}.</li>
<li><b>Cost.</b> Message and data rates may apply. Carriers are not liable for delayed or undelivered messages.</li>
</ul>
<h2 id="privacy">Privacy</h2>
<ul>
<li>${name} collects the information you give to book or ask about service: name, phone number, address, and a description of the work. It is used to schedule and perform the work, to send the messages above, and to keep a record of the conversation.</li>
<li>Your information belongs to ${name}. It is not sold, rented, or shared with third parties for their marketing. Mobile numbers and texting consent are never shared with third parties or affiliates for marketing purposes.</li>
<li>${esc(DATA_POLICY)}</li>
<li>Machines &amp; Cloud processes this data on ${name}'s behalf to run the front desk and does not use it to serve any other business. See also the <a href="https://www.machinesandcloud.com/privacy-policy.html">Machines &amp; Cloud privacy policy</a>.</li>
<li>You can ask ${name} to correct or delete your information at any time using the contact details above.</li>
</ul>
<p class="muted">Machines &amp; Cloud, 5718 Westheimer Rd Suite 1000, Houston, TX 77057, support@machinesandcloud.com.</p>
</body></html>`;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" } });
};
