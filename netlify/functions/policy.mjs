// Per-shop texting terms and privacy page, hosted by us: /policy?c=slug. Carriers require these URLs
// on every 10DLC campaign; most small shops have neither page.
import { getClient } from "./lib/store.mjs";
import { isSelfServiceClient, isSupportedSelfServiceClient } from "./lib/setup.mjs";
import { SERVICE_FOLLOWUP_PROGRAM_VERSION } from "./lib/messaging-program.mjs";

export const config = { path: "/policy" };

const esc = (s) => String(s || "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

export default async (req) => {
  if (!["GET", "HEAD"].includes(req.method)) return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  const url = new URL(req.url);
  const c = await getClient(url.searchParams.get("c") || "");
  if (!c || isSelfServiceClient(c) && !isSupportedSelfServiceClient(c)) return new Response("<!DOCTYPE html><title>Not found</title><p>No such business.</p>", { status: 404, headers: { "Content-Type": "text/html" } });
  const managed = isSupportedSelfServiceClient(c);
  const termsFirst = url.searchParams.get("page") === "terms";
  const name = esc(c.business?.name || "this business");
  const phone = esc(c.phone?.twilioNumber || c.phone?.businessNumber || "");
  const email = esc(c.owner?.email || "");
  const followupTerms=managed&&c.serviceFollowupProgram?.version===SERVICE_FOLLOWUP_PROGRAM_VERSION?`<li><b>One requested service follow-up.</b> You can choose one neutral text about your specific service request, or a quote the shop has already sent. The optional invitation beside your saved request opens an SMS instruction; opening it sends nothing. Send REQUEST plus your request reference, or QUOTE plus that reference, from the mobile saved for the request. We reply with a fixed question naming ${name}, the exact request and purpose, one follow-up within 30 days, message and data rates, HELP/STOP and these policy links. Only your separate YES REQUEST reference or YES QUOTE reference after that sent question grants this permission. We retain the exact question and reply, their provider identifiers and dates. Provider acceptance of the question does not guarantee delivery. One attempted follow-up uses the request's single allowance across both purposes; repeated permission or a new schedule does not refill it. A new customer reply, owner contact, changed request or opt-out stops an unsent check-in. You can continue service without texts. This permission never covers another request, recurring updates, reviews, referrals, promotions or invoices. START removes a block only; a fresh question and separate affirmative are required for this purpose.</li>`:'';
  const program = managed
    ? `<li><b>Program.</b> This is ${name}'s separate customer-care texting program for its requested home services. The supported US-EIN service uses this business's own carrier registration and number; it does not use the Machines &amp; Cloud product-support number as a shared sender. This policy does not, by itself, confirm that carrier approval or activation is complete.</li>
<li><b>Direct conversations.</b> You start by texting ${name}'s number. The shop may reply about that request in the same conversation. Your inbound message does not give permission for recurring appointment updates.</li>
<li><b>Appointment opt-in.</b> After a website or phone booking, you can text APPOINTMENTS or CITAS from the mobile number saved for your visit to this business's service number. Opening that option sends nothing. When you send that keyword, or when a visit is saved during a text conversation, the front desk names ${name} and asks whether you want ongoing appointment texts from this business, including future visits. The question explains variable frequency, message and data rates, help and opt-out, and that booking is available without texts. A separate written YES or SÍ after that question is required for confirmations, appointment reminders and cancellation updates, including future appointments with ${name}. The request and your reply are recorded with the number, message identifiers, time and consent wording version. Merely giving a mobile number, calling, using website chat or booking a visit does not provide this permission. A past agreement limited to one visit is not treated as ongoing permission.</li>
${followupTerms}<li><b>Scope.</b> This supported program does not include on-the-way notices, review requests, promotional follow-ups or marketing. Consent is not a condition of purchase. Message frequency varies with your conversation and the appointment updates you separately agree to receive.</li>
<li><b>Opt-out and restart.</b> Reply STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT, ALTO or PARAR to stop texts from ${name}. Standard carrier opt-out keywords are also honored. You may receive one stop confirmation. START, UNSTOP or EMPEZAR removes a prior block only; appointment updates need a separate written YES or SÍ after a new appointment-text question. Restart keywords do not grant marketing consent.</li>`
    : `<li><b>Legacy program.</b> ${name} has an older front desk arrangement. Its configured service may include direct replies and agreed service messages such as booking confirmations, reminders, on-the-way notices, estimate or invoice follow-ups and a request for a review after a completed visit. Availability depends on the business's service; this page does not confirm activation. This arrangement is separate from the supported US-EIN shop program and the Machines &amp; Cloud product-support campaign.</li>
<li><b>Consent.</b> ${name} is responsible for obtaining and keeping the permission needed for its legacy service messages. Texting the business permits direct replies about your request; it is not blanket permission for recurring messages or marketing. Calling, providing a number or booking alone does not supply that permission. Ask ${name} about the consent recorded for your service. Consent is not a condition of purchase.</li>
<li><b>Optional marketing.</b> Promotional or maintenance marketing requires separate express written agreement to the stated subject. An appointment or a restart keyword does not provide that agreement. This legacy service is not represented as using the supported program's written appointment-YES workflow.</li>
<li><b>Frequency and opt-out.</b> Message frequency varies with the service and your agreed messages. Reply STOP, ALTO or PARAR to stop texts; you may receive one confirmation. START or EMPEZAR requests removal of a previous block. Any ongoing messages still need the permission required for that legacy service.</li>`;
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${name}: ${termsFirst ? "Terms &amp; Conditions" : "Privacy Policy"}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif;max-width:760px;margin:40px auto;padding:0 20px;color:#1E2433;line-height:1.6}h1{font-size:1.6rem}h2{font-size:1.15rem;margin-top:28px}p,li{font-size:15px}.muted{color:#5B6273;font-size:13px}</style></head><body>
<h1>${name}: ${termsFirst ? "Terms &amp; Conditions" : "Privacy Policy"}</h1>
<p class="muted">${name} uses front desk software operated by Machines And Cloud LLC (Machines &amp; Cloud), Houston, Texas. This page describes ${name}'s own program. Last updated October 23, 2026.</p>
<h2 id="terms">SMS Terms &amp; Conditions</h2>
<ul>
${program}
<li><b>Help.</b> Reply HELP${managed ? ", INFO or AYUDA" : ""} for help, or contact ${name}${phone ? ` at ${phone}` : ""}${email ? ` or ${email}` : ""}.</li>
<li><b>Cost.</b> Message and data rates may apply. Carriers are not liable for delayed or undelivered messages.</li>
</ul>
<h2 id="privacy">Privacy</h2>
<ul>
<li>${name} collects the information you give to book or ask about service: name, phone number, address and a description of the work. Conversation and consent records also include message content, identifiers, timestamps and texting preferences. They are used to handle your service request, send only permitted messages, prevent duplicate processing and honor opt-outs.</li>
<li>We do not sell or share your SMS opt-in data or personal information with third parties for marketing purposes. Mobile numbers and SMS consent are not sold, rented or transferred to another shop, sender or marketing program.</li>
<li>Your customer information belongs to ${name}. Machines &amp; Cloud processes it on the shop's behalf to run its front desk and does not use it to train or inform another shop's desk. Hosting, messaging and other service providers process it as necessary to provide and protect the service. See also the <a href="https://www.machinesandcloud.com/privacy-policy.html#sms">Machines &amp; Cloud privacy policy</a>.</li>
<li>You can ask ${name} for an export, correction or deletion using the contact details above. Records needed to honor an opt-out or meet legal, security and service-record obligations may be retained. Our phone and messaging providers retain their own records under their policies. Disconnecting a channel or cancelling service does not, by itself, delete retained records.</li>
</ul>
<p class="muted">Machines And Cloud LLC (Machines &amp; Cloud), 5718 Westheimer Rd Suite 1000, Houston, TX 77057, support@machinesandcloud.com.</p>
</body></html>`;
  return new Response(req.method === "HEAD" ? null : html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" } });
};
