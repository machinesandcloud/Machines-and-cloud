# How Houston home service companies find, win, serve, and keep customers

Research notes, 2026-10-18. Sources: industry surveys (ServiceTitan, Jobber, FIELDBOSS, Roofing Contractor, Ruya, BrightLocal), platform documentation (Thumbtack, Angi, Google LSA), trade forums, and Reddit (r/Thumbtack, r/Contractor, r/sweatystartup, r/Roofing, r/hvacadvice, r/Plumbing, r/HomeImprovement, a cleaning-business sub) read through the Arctic Shift archive because reddit.com blocks crawlers. Vendor numbers are flagged as such.

## 1. Who the owner is

- One to five trucks. The owner is often on the tools. The "office" is a spouse, one office manager, or nobody.
- The phone is the business. Posts on r/Contractor estimate about three missed calls a day, 80 to 90 a month, and say "people in this industry don't leave voicemails anymore." Vendor data puts after-hours calls at 10 to 14% of volume (ServiceTitan 2025 platform data, via a vendor).
- Average response to a new lead is 42 minutes and 23% of leads never get a response (ServiceTitan 2025 benchmark, vendor-reported). Hatch's HVAC data: 88% of contractors take longer than 5 minutes.
- Published booking rate on answered calls: 42% average (ServiceTitan 2022, 3,000+ businesses), with top shops at 62 to 70%.
- Admin is the thing they want to hand off first: invoicing, scheduling, "the phone" (r/sweatystartup).

## 2. The customer's journey, step by step

### Trigger
The AC quits in July, the water heater leaks on Sunday, hail hits in spring, a buyer's inspection flags the roof, a tenant moves out Friday. Most of it is unplanned and urgent, which is why speed decides who gets the job.

### Search
- Referrals and repeat dominate: 69% of homeowners hired a company they had used before or that friends recommended (FIELDBOSS 2025, 1,000 homeowners); 59% rely on trusted connections (Ruya 2025, 422 homeowners).
- About 80% start online (ServiceTitan 2025). Google is the dominant review platform at 71% of local-business researchers, down from 83% a year earlier (BrightLocal 2026).
- 52% judge quality by online reviews (Ruya). "Every participant would read reviews before hiring" (NN/g trust study).
- Neighborhood channels matter in Houston: Nextdoor "Faves" lists show plumbing and HVAC names with 700 to 800 votes; recommendation threads are common. Facebook groups work but ban self-promotion; "whoever answers first usually wins" (cleaning and sweatystartup posts).
- Marketplaces (Thumbtack, Angi, HomeAdvisor, Yelp) are where price-shoppers and urgent people go. The same request goes to 3 to 7 pros.
- Other channels: Google LSA, home warranty dispatch (volume at low rates, slow pay, reputation risk), property managers and realtors (one relationship can mean many buildings), yard signs and door hangers (one recurring-service owner credits $1,900 in signs with roughly $75k ARR), truck wraps.

### Contact
- Phone still wins: 46 to 60% of homeowners prefer to call (Roofing Contractor 2024 to 2026 surveys); 50% phone, 24% text, 12% online booking for HVAC scheduling (FIELDBOSS 2025). Text is rising with younger customers; 14% value online booking (Jobber 2026).
- Over 70% expect a same-day response and 1 in 4 cite response speed as a hiring factor (Jobber 2026).
- On Thumbtack, customers do not know pros pay per contact (top post on r/Thumbtack, score 39, is a customer discovering this). They message several pros, compare prices, and often go quiet. Thumbtack now masks phone numbers ("Thumbtack Numbers"); calls show as "Thumbtack" on caller ID and get ignored as spam; pros say customers prefer a text first.
- Google LSA now masks the customer's number behind a forwarding number plus an extension; message leads are answered in Google's thread.
- Angi delivers the lead by webhook with name, phone, email, address, and task.

### Quote
- HVAC: diagnostic or trip fee $70 to $200, most often $89, applied to the repair or waived if they proceed. Plumbing: $75 to $100 service call, or free for planned work (water heater, toilet, repipe) but paid diagnostics for leaks and backups. Electrical: service call about $99, applied; free estimates for defined installs, paid troubleshooting.
- Roofing: free inspection, then insurance. Texas wind and hail deductibles are typically 1 to 2% of dwelling value; insurers must acknowledge within 15 days; replacement-cost policies hold back depreciation until completion. Homeowners are told to document before the adjuster visit. Storm chasers are a known fraud pattern (Texas AG).
- Cleaning: priced by bedrooms and bathrooms with add-ons at booking; owners who "put every extra in the booking price" stop haggling in the home; recurring clients get 15% off and a 3 to 5% January raise that almost nobody leaves over.
- Homeowners get multiple quotes and compare them publicly: three tear-off quotes at $11k, $16k, and $23k (r/Roofing); the low bidder would not itemize. They want line items, warranty terms, and photos.
- Good, better, best plus a monthly payment lifts close rates: 38% without financing versus 49% with it (ACHR News survey); 41% of consumers actively seek financing (ServiceTitan 2025).
- Deposits before a signed contract are a red flag to homeowners (a $2,000 "price lock" deposit was questioned on r/Roofing).

### Schedule
- Two-hour arrival windows are standard; customers hate exact-time promises that slip. "On my way" texts should go at dispatch, include what to prepare (pets, driveway), and offer a live tracking link. Reminders 24 to 48 hours out plus 1 to 2 hours before cut no-shows; customers who cannot reschedule without calling simply do not show.
- No-shows by the contractor are the number one homeowner complaint (Consumer Reports, 913 homeowners), with unreturned calls close behind.

### Service
- Homeowners want the tech to explain what was installed and why, honor the written scope (a Carrier install delivered the wrong tonnage and substituted parts), state warranty coverage before work, and call before extra work. "Call the customer with the cost of a hidden problem before doing more" (r/Contractor). Change orders are approved by photo and a short text.
- Repeat paid visits for the same unresolved fault are a top anger point (three charged visits for one Lennox code).
- Owners who push 20 stops a day see techs skip notes and inspections; callbacks rise.

### Pay
- Same-day invoicing by text or email; card on site; financing through Wisetack, GreenSky, Synchrony. The gap between finishing and getting paid "quietly kills" small shops (r/sweatystartup). 65% of remodeling decisions are made by women (ServiceTitan).

### Review and repeat
- Ask the same day: tech asks in person, text with the direct Google review link within hours, one follow-up at 48 hours. Never only the happy customers, never an incentive (Google policy and the FTC rule effective October 2024). A five-minute final walkthrough "saved my ratings" (cleaning owner).
- Unsold estimates: text the estimate when it is emailed, follow up once at day 14 ("want me to close this or keep it open?"), put an expiry date on it, then stop.
- Retention: maintenance plans ($14 a month for two tune-ups is the kind of offer), recurring cleans, annual price raises announced in December.

## 3. Lead sources, with what owners say

| Source | Cost | Owner sentiment |
|---|---|---|
| Referrals, repeat | Cost of a thank-you | Best quality; the only source for many; slow to build |
| Google Business Profile, reviews | Free | Consistently recommended; "the boring local SEO stuff still beats the clever stuff" |
| Google LSA | $53 per lead, $233 per paying customer, 44% booked (SearchLight, 888 contractors) | "Pretty good to me"; refunds only for spam, not tire-kickers; numbers now masked |
| Angi / HomeAdvisor | $288 to $300 a year plus $15 to $130 per lead; shared | "Beware" (score 36 on r/Contractor): $235 in a week of unresponsive leads, no refunds. Close 5 to 12% |
| Thumbtack | $10 to $100 per contact, charged even if the customer never replies; up to 4x listed in practice | Most-complained-about: one pro spent $20k on 677 leads for 158 jobs with a 24-second average response; "customer responded" AI errors; refunds denied; calls for a strike. Still "a reasonable supplement" for new or niche trades that answer in under a minute |
| Nextdoor, Facebook groups | Free | Occasional leads, 20 to 30 replies per request, first responder wins |
| Meta ads | About $41 per lead for fences (one owner); $1,000 spent, zero jobs (another) | Works with tight radius targeting and real job video; poor without |
| Home warranty networks | Below-market rates, slow pay | Volume for new shops; reputation risk from non-coverage disputes |
| Property managers, realtors, designers | Time | "One relationship could lead to multiple buildings"; a third of a senior person's week on relationships |

## 4. What frustrates each side

Owners: paying for leads who never reply; the same lead sold to 3 to 7 pros; masked numbers that look like spam; refund denials; missing calls while on a ladder; price shoppers; ghosting after a quote; admin and collections; techs skipping notes.

Homeowners: contractors who do not show or call back; surprise costs (21% cite "costs higher than expected" as a top frustration, FIELDBOSS); being charged repeatedly for the same unresolved problem; fear-based upsells (hurricane windows at $4,000 each, a "6 to 12 months left" roof); deposits before a contract; vague quotes without line items; being brushed off when they ask questions; installers who do not honor the written scope.

## 5. Houston specifics

- 45% of Harris County residents age 5+ speak a language other than English at home (Census 2020 to 2024); Spanish is roughly 35%. Bilingual answering is table stakes, not a feature.
- Licensing: HVAC and electrical under TDLR, plumbing under TSBPE; a responsible master plumber stands behind permits. City of Houston trade registrations apply per permit.
- Demand spikes: summer AC failures, spring hail (roof inspections "fill fast"), hurricane season. After-hours share peaks in June (14%).

## 6. What this means for Machines & Cloud

1. Phone is still the front door for half the customers. A website agent alone covers the text and form half. Phone answering is the second half, not an upsell.
2. The whole game is the first minute. The owner's problem is not quality of answer, it is being on a ladder. Instant text-back on Angi and website leads is feasible today; Thumbtack needs partner approval for in-app replies; LSA cannot be texted and must be answered in Google's thread.
3. Homeowners trust what is written and stated up front: fees, windows, what is and is not included. The agent's rules (published prices only, no promised times, safety first) are exactly what homeowners say they want.
4. Two-hour windows, "on my way" at dispatch, reminders with one-tap reschedule, and photo-approved change orders are the delivery standards to build toward.
5. The after-job review text to every customer, same day, with a 48-hour nudge and no gating, is the cheapest proof engine available and most small shops do not run one.
6. Spanish is required. Customers who write in Spanish should be answered in Spanish with the owner's summary in English.
7. Consent must be captured at booking ("OK to text you about this job?") before any promotional or reactivation texts. Informational replies about an open request are fine; marketing is not.
8. The buyer to target is the shop missing three calls a day with a spouse answering the phone, not the ServiceTitan shop with a CSR team.

## Sources

Surveys and reports: FIELDBOSS 2025 HVAC homeowner survey; Ruya Homeowner Shopping Attitudes 2025; BrightLocal 2026 consumer review survey; ServiceTitan Consumer Trends in the Trades 2025 and 2022 booking-rate data; Jobber 2026 Home Service Trends Report; Roofing Contractor homeowner surveys 2024, 2025, 2026; ACHR News financing close-rate survey; SearchLight Digital LSA cost data 2026; Consumer Reports homeowner complaints survey; NN/g trustworthy design study; Census QuickFacts Harris County.

Platform docs: Thumbtack Partner and Pro API docs; Angi CRM integration help; Google LSA lead callback change (Location3); Google Ads API local_services_lead.

Communities: r/Thumbtack (about 200 posts and comments), r/Contractor posts and comments, r/sweatystartup, r/Roofing, r/hvacadvice, r/Plumbing, r/HomeImprovement, a cleaning-business subreddit, Thumbtack Community forum, PlumbingZone and Mike Holt forums, Trustpilot contractor reviews of Thumbtack and Angi.
