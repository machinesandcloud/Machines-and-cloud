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
