# Release 3 copy of mutants-r4.py: M05/M11/M13/M16 re-anchored after the Spanish fixes and the P6 merge; R3-1..R3-4 added.
# Usage: python3 -I mutants-rc3.py <tree> <out.json>. Each mutant is one exact replacement in the patched tree;
# the check must fail (exit != 0). The file is restored after each run.
import json, subprocess, sys, os
T, OUT = sys.argv[1], sys.argv[2]
D = 'netlify/functions/lib/desk.mjs'; S = 'netlify/functions/lib/managed-sms.mjs'; M = 'netlify/functions/lib/managed-delivery.mjs'
MUTANTS = [
 ('M01 HELP contact drops the registered email', S, '(c, c.phone?.businessNumber || c.owner.email)); }', '(c, c.phone?.businessNumber || "this number")); }'),
 ('M02 HELP contact ignores the business number', S, '(c, c.phone?.businessNumber || c.owner.email)); }', '(c, c.owner.email)); }'),
 ('M03 no-number reply names the email', D, ': saved ? `${c.business.name}: I cannot complete this reply right now. The shop has your message and will contact you.`', ': saved ? `${c.business.name}: I cannot complete this reply right now. Please contact ${c.owner.email}.`'),
 ('M04 AI-limit uses the texted number', D, 'STRINGS.en.managed_ai_limit = (c, { saved = false } = {}) => shopPhoneDisplay(c.phone?.businessNumber)', 'STRINGS.en.managed_ai_limit = (c, { saved = false } = {}) => shopPhoneDisplay(c.phone?.businessNumber || "+17135550199")'),
 ('M05 promise made without a saved request', S, 'const reply=disclose(str("managed_ai_limit",{language})(c,{saved}),language);', 'const reply=disclose(str("managed_ai_limit",{language})(c,{saved:true}),language);'),
 ('M06 no owner request saved', S, 'if(!shopPhoneDisplay(c.phone?.businessNumber)){try{', 'if(false){try{'),
 ('M07 request keyed per message', S, 'managedActionId:hash(`ai_daily_limit:${job.tenant}:${job.from}:${day}`)', 'managedActionId:hash(`ai_daily_limit:${job.tenant}:${job.messageSid}`)'),
 ('M07b request not keyed by day', S, 'managedActionId:hash(`ai_daily_limit:${job.tenant}:${job.from}:${day}`)', 'managedActionId:hash(`ai_daily_limit:${job.tenant}:${job.from}`)'),
 ('M07c request not keyed by customer', S, 'managedActionId:hash(`ai_daily_limit:${job.tenant}:${job.from}:${day}`)', 'managedActionId:hash(`ai_daily_limit:${job.tenant}:${day}`)'),
 ('M07d closed request still promises', S, 'saved=lead?.status==="open";', 'saved=true;'),
 ('M08 failed save still promises', D, "  : `${c.business.name}: I cannot complete this reply right now. The shop can see your message in its workspace.`;", "  : `${c.business.name}: I cannot complete this reply right now. The shop has your message and will contact you.`;"),
 ('M09 saved language ignored', S, '    if (rows.length) return rows.at(-1).language;', '    if (false) return rows.at(-1).language;'),
 ('M10 shop Spanish setting ignored', S, 'return c.business?.spanish && managedTextLooksSpanish(job.body) ? "es" : "en";', 'return managedTextLooksSpanish(job.body) ? "es" : "en";'),
 ('M11 always English', S, 'const reply=disclose(str("managed_ai_limit",{language})(c,{saved}),language);', 'const reply=disclose(str("managed_ai_limit",{language:"en"})(c,{saved}),language);'),
 ('M12 Spanish not GSM-7', D, 'El negocio ya tiene su mensaje y se va a comunicar con usted.', 'El negocio tiene su mensaje y le responderá por aquí.'),
 ('M13 Spanish failed-save wording promises', D, '  : `${c.business.name}: en este momento no puedo responderle. El negocio puede ver su mensaje.`;', '  : `${c.business.name}: en este momento no puedo responderle. El negocio ya tiene su mensaje y se va a comunicar con usted.`;'),
 ('M14 lead saved in the wrong language', S, 'wanted:"",language,nobook_reason', 'wanted:"",language:"en",nobook_reason'),
 ('M08 confirmation carries the visit ID again', D, '`${c.business.name}: your visit is saved for ${visitWhenEn(b)}.', '`${c.business.name}: visit ${b.id} is saved for ${visitWhenEn(b)}.'),
 ('M09 ISO date', D, 'return m ? new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))) : String(d || "");', 'return String(d || "");'),
 ('M10 date formatted in local zone', D, 'new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short"', 'new Intl.DateTimeFormat("en-US", { timeZone: "Pacific/Honolulu", weekday: "short"'),
 ('M11 reschedule reads like a new visit', D, 'STRINGS.en.managed_confirmation = (c, b) => managedVisitMoved(b)', 'STRINGS.en.managed_confirmation = (c, b) => false'),
 ('M12 moved text without the previous time', D, 'return last?.action === "reschedule_visit" && last.at === b.ownerVisitMutation?.at && last.previous?.date ? visitWhenEn(last.previous) : "";', 'return "";'),
 ('M13 reminder carries the ID', D, '"your visit"} on ${visitWhenEn(b)}.', '"your visit"} ${b.id} on ${visitWhenEn(b)}.'),
 ('M14 cancel without rebook line', D, 'has been cancelled. To rebook, reply here${', 'has been cancelled.${'),
 ('M15 cancel omits the business number', D, ' or call ${shopPhoneDisplay(c.phone.businessNumber)}` : ""}.`;', '` : ""}.`;'),
 ('M16 Spanish cancel without rebook line', D, ' fue cancelada. Para agendar otra visita, ${shopPhoneDisplay(c.phone?.businessNumber) ? "llame al " + shopPhoneDisplay(c.phone.businessNumber) + " o responda" : "responda a este mensaje"}.`;', ' fue cancelada.`;'),
 ('M17 reminder schedule reverted', M, '  if (!inQuietHours(new Date(due1))) return [["reminder_24h", due24], ["reminder_1h", due1]];', '  return [["reminder_24h", due24], ["reminder_1h", due1]];'),
 ('M18 always evening before', M, 'moved = morning <= start - 30 * minute ? morning : arrivalInstant', 'moved = false ? morning : arrivalInstant'),
 ('M19 morning even when too late', M, 'moved = morning <= start - 30 * minute ? morning :', 'moved = morning < start ? morning :'),
 ('M20 margin 15 minutes', M, 'morning <= start - 30 * minute', 'morning <= start - 15 * minute'),
 ('M21 Sunday treated as weekday', M, "getUTCDay() === 0 ? '12 pm to 1 pm' : '9 am to 10 am'", "getUTCDay() === 7 ? '12 pm to 1 pm' : '9 am to 10 am'"),
 ('M22 evening moved into quiet hours', M, "moved = morning <= start - 30 * minute ? morning : arrivalInstant(previous, '8:30 pm to 9 pm');", "moved = morning <= start - 30 * minute ? morning : arrivalInstant(previous, '9:30 pm to 10 pm');"),
 ('M23 late-night uses the previous evening', M, "if (Number(local.hour) >= 21) moved = arrivalInstant(day, '8:30 pm to 9 pm');", "if (Number(local.hour) >= 21) moved = arrivalInstant(previous, '8:30 pm to 9 pm');"),
 ('M24 no 2-hour guard', M, 'moved < start && moved - now >= 2 * hour ?', 'moved < start ?'),
 ('M25 guard 1 hour', M, 'moved - now >= 2 * hour', 'moved - now >= 1 * hour'),
 ('M26 guard applied to unmoved reminder too', M, '  if (!inQuietHours(new Date(due1))) return [["reminder_24h", due24], ["reminder_1h", due1]];', '  if (!inQuietHours(new Date(due1))) return due1 - now >= 2 * hour ? [["reminder_24h", due24], ["reminder_1h", due1]] : [["reminder_24h", due24]];'),
 ('M27 quiet check of the due time uses now', M, 'function inQuietHours(at = new Date()) {\n  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(at);', 'function inQuietHours(at = new Date()) {\n  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(new Date());'),
 ('M28 queue loop ignores the schedule', M, 'for (const [purpose, due] of managedReminderSchedule(start)) {', 'for (const [purpose, due] of [["reminder_24h", start - 86400000], ["reminder_1h", start - 3600000]]) {'),
 ('R3-1 AI-limit reply loses the automated disclosure', S, 'const reply=disclose(str("managed_ai_limit",{language})(c,{saved}),language);', 'const reply=str("managed_ai_limit",{language})(c,{saved});'),
 ('R3-2 AI-limit disclosure language guessed from the text', S, 'const reply=disclose(str("managed_ai_limit",{language})(c,{saved}),language);', 'const reply=disclose(str("managed_ai_limit",{language})(c,{saved}));'),
 ('R3-3 AI-limit disclosure on every reply', S, 'const reply=disclose(str("managed_ai_limit",{language})(c,{saved}),language);', 'const reply=withAutomatedIntro(c,str("managed_ai_limit",{language})(c,{saved}),{first:true,language});'),
 ('R3-4 Spanish cancel order reverted (ambiguous "al X")', D, '"llame al " + shopPhoneDisplay(c.phone.businessNumber) + " o responda"', '"responda o llame al " + shopPhoneDisplay(c.phone.businessNumber)'),
]
results = []
for name, rel, old, new in MUTANTS:
    p = os.path.join(T, rel); src = open(p).read()
    if src.count(old) != 1: results.append({'mutant': name, 'status': 'NOT_APPLIED', 'count': src.count(old)}); continue
    open(p, 'w').write(src.replace(old, new))
    try:
        r = subprocess.run([os.path.join(os.path.dirname(os.path.abspath(__file__)), 'run-check.sh'), T, 'scripts/uncovered-cards-check.mjs'], capture_output=True, text=True, timeout=600)
        failed = [l[5:] for l in r.stdout.splitlines() if l.startswith('FAIL ')]
        results.append({'mutant': name, 'status': 'KILLED' if r.returncode != 0 else 'SURVIVED', 'exit': r.returncode, 'failedChecks': failed})
    finally:
        open(p, 'w').write(src)
    print(results[-1]['status'], name, flush=True)
json.dump({'killed': sum(r['status'] == 'KILLED' for r in results), 'total': len(MUTANTS), 'results': results}, open(OUT, 'w'), indent=1)
print('killed', sum(r['status'] == 'KILLED' for r in results), '/', len(MUTANTS))
