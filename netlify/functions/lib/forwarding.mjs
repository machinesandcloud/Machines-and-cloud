// Carrier call-forwarding instructions with tap-to-dial codes. Codes differ by carrier and line
// type; the portal shows the two most common forms for AT&T and tells the owner to test by calling.
export const CARRIERS = {
  verizon: { name: "Verizon", missed: (n) => [`*71${n}`], all: (n) => [`*72${n}`], off: ["*73"], note: "One code covers busy and unanswered calls. Verizon has no ring-time setting, so unanswered calls forward after about 25 seconds; if you run Google Local Services ads, use *72 (all calls) on that line to stay under Google's 20-second clock." },
  tmobile: { name: "T-Mobile", missed: (n) => [`**61*1${n}**15#`, `**67*1${n}#`], all: (n) => [`**21*1${n}#`], off: ["##61#", "##67#", "##21#"], note: "The first code forwards unanswered calls after 15 seconds (the **15# part sets the ring time, which keeps you under Google's 20-second clock); the second covers busy." },
  att: { name: "AT&T", missed: (n) => [`*61*1${n}**15#`, `*67*1${n}#`], all: (n) => [`*21*1${n}#`], off: ["#61#", "#67#", "#21#"], note: "The first code forwards unanswered calls after 15 seconds (the **15# part sets the ring time, which keeps you under Google's 20-second clock); the second covers busy. If a code is refused, try it with two stars (**61*1...**15#). AT&T landlines use *92 and *90 instead." },
  other: { name: "Your carrier", missed: () => [], all: () => [], off: [], note: "Search your carrier app for 'call forwarding when unanswered' and enter the front desk number." },
  voip: { name: "VoIP or office phone", missed: () => [], all: () => [], off: [], note: "In your phone system's admin page, set 'no answer' and 'busy' forwarding to the front desk number." },
};

export function forwardingInstructions(c) {
  const num = (c.phone?.twilioNumber || "").replace(/^\+1/, "");
  const carrier = CARRIERS[c.phone?.carrier] || CARRIERS.other;
  const mode = c.phone?.forwarding === "all" ? "all" : "missed";
  if (c.onboarding?.version === 1) {
    const sourceNumber = c.phone?.businessNumber || '', targetNumber = c.phone?.twilioNumber || '';
    const direct = c.onboarding.phoneSetupMode === 'use_new_number' || c.phone?.forwarding === 'none';
    const guides = {
      att: [{ label: 'AT&T mobile lines', url: 'https://www.att.com/support/article/wireless/KM1011513/' }, { label: 'AT&T Digital Phone', url: 'https://www.att.com/support/article/u-verse-voice/KM1000459/' }],
      verizon: [{ label: 'Verizon mobile lines', url: 'https://www.verizon.com/support/call-forwarding-faqs/' }],
      tmobile: [{ label: 'T-Mobile calling services', url: 'https://www.t-mobile.com/support/plans-features/calling-services' }],
    };
    const base = { codes: [], off: [], carrier: carrier.name, mode: direct ? 'none' : mode, sourceNumber, targetNumber, guides: guides[c.phone?.carrier] || [], manualCarrierStep: !direct, note: 'Your carrier controls forwarding on the business line. Use the account or device for that line; your separate contact cell stays a callback destination.' };
    if (!num) return { ...base, short: 'Your forwarding destination will appear after your front desk number is reserved.', long: 'Keep your existing business routing unchanged until the destination and connection instructions are ready.', steps: [] };
    if (typeof targetNumber !== 'string' || !/^\+1[2-9]\d{2}[2-9]\d{6}$/.test(targetNumber) || targetNumber === c.owner?.phone) return { ...base, short: 'Your front desk destination needs verification.', long: 'Keep your current routing unchanged. The front desk number must be valid and separate from your contact cell.', steps: [], invalidDestination: true };
    if (direct) return { ...base, short: `Use ${targetNumber} as your front desk number. No call forwarding is needed.`, long: 'Once phone answering is verified, publish this number wherever customers contact your business. Keep your separate contact cell for callbacks and handoffs.', steps: [`Call ${targetNumber} from another phone and complete the verification conversation.`, 'Check the connection result in your workspace before giving the number to customers.'], offLong: 'Remove the front desk number from your customer-facing listings when you stop using it.' };
    if (!/^\+1[2-9]\d{2}[2-9]\d{6}$/.test(sourceNumber) || sourceNumber === c.owner?.phone || sourceNumber === targetNumber) return { ...base, short: 'Review the business line before forwarding calls.', long: 'Add the existing number customers call, separate from your contact cell and the front desk number. Then return for instructions.', steps: [], needsBusinessNumber: true };
    const choice = mode === 'all' ? 'all incoming calls' : 'unanswered and busy calls';
    const steps = [`Open ${carrier.name}'s forwarding settings for your business line ${sourceNumber}. For an office or internet phone, use its phone-system admin page.`, `Forward ${choice} to ${targetNumber}. Apply this to ${sourceNumber}, not your separate contact cell.`, `From another phone, call ${sourceNumber}${mode === 'all' ? '' : ' and let it ring unanswered'}. Complete the front desk verification conversation.`, 'Check the verified connection result in your workspace. Reading these steps does not confirm routing.'];
    return { ...base, short: `Set forwarding on your business line ${sourceNumber} to ${targetNumber}.`, long: steps.join(' '), steps, offLong: `In the carrier settings for ${sourceNumber}, turn off forwarding and confirm incoming calls ring your business line. Do not change forwarding on your separate contact cell.` };
  }
  if (!num) return { short: "", long: "", codes: [], off: carrier.off, carrier: carrier.name, note: carrier.note };
  const codes = mode === "all" ? carrier.all(num) : carrier.missed(num);
  if (c.phone?.forwarding === "none") return { short: "Texts and website chat only for now.", long: "You chose texts and chat only, so no forwarding is needed. Turn it on any time from your portal.", codes: [], off: carrier.off, carrier: carrier.name, note: carrier.note };
  const short = codes.length ? `From your cell, dial ${codes[0]} and press call to send ${mode === "all" ? "all" : "missed"} calls to it.` : `Turn on ${mode === "all" ? "all-call" : "no-answer"} forwarding to it in your carrier app.`;
  const long = codes.length
    ? `On ${carrier.name}: dial ${codes.join(" then ")} from your business cell and press call. ${carrier.note} To turn it off later: ${carrier.off.join(" or ")}. iPhone: turn off Live Voicemail first (Settings, Phone, Live Voicemail) or it picks up before forwarding. Dial *#61# to check that forwarding is set. Test it by calling your own number from another phone and not answering; the front desk should pick up and text that phone.`
    : `${carrier.note} The front desk number is ${c.phone.twilioNumber}. Test it by calling your own number from another phone and not answering.`;
  const offLong = carrier.off.length ? `To send calls back to your phone: dial ${carrier.off.join(" then ")} from your business cell. iPhone users: also check Settings, Phone, Live Voicemail is off.` : "To send calls back to your phone, turn forwarding off in your carrier app.";
  return { short, long, codes, off: carrier.off, offLong, carrier: carrier.name, note: carrier.note, mode };
}
