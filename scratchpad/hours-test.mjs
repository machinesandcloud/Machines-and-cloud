import { parseHours, emergency247 } from "/Users/stevengoumnai/Desktop/Repositories/machines-and-cloud/netlify/functions/lib/config.mjs";
const cases = [
 "Monday - Friday: 8:00 AM - 5:00 PM",
 "Mon-Fri 7am-7pm, Sat 8am-2pm, Sun Closed",
 "Open 24 Hours",
 "24/7 Emergency Service",
 "Monday through Saturday 7:00am to 7:00pm",
 "M-F 8-5",
 "Mon – Fri: 8am – 6pm",
 "Monday-Friday 7:30 AM-5:30 PM",
 "Hours: Mon-Sun 7am-9pm",
 "We are open 7 days a week, 8am to 8pm",
 "Mon-Fri 8:00am-5:00pm; After hours emergency service available",
 "Monday to Friday 8 a.m. to 5 p.m.",
 "Mon-Fri: 7AM-7PM | Sat: 8AM-4PM | Sun: Closed",
 "Weekdays 8-5",
 "Every day 7am-10pm",
 "Mon-Fri 9-5pm",
 "Monday-Friday 8AM–5PM Saturday 9AM–1PM",
 "Mon to Fri 7 to 6, Sat 8 to 2",
 "Open daily 8am-6pm",
 "Mon-Thu 8-5, Fri 8-3",
 "Monday thru Friday 8:30AM to 5:00PM. Emergency service 24 hours a day",
 "Mon - Sat 7am - 7pm",
 "Lunes a Viernes 8am a 6pm",
];
for (const s of cases) {
  const h = parseHours(s);
  const short = h ? Object.entries(h).map(([d,v]) => d.slice(0,2)+(v? v.open.slice(0,5)+"-"+v.close.slice(0,5):"x")).join(" ") : "NULL (fallback 7-19)";
  console.log(JSON.stringify(s).padEnd(70), "=>", short, emergency247(s) ? " [247]" : "");
}
