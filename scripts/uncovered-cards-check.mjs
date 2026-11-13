// PRA-HOMEOWNER-05/-06/-07 check (uncovered-cards proposal). Offline: it reuses the setup of
// scripts/managed-sms-qa-check.mjs (signed Twilio payloads, real handlers, in-memory blob/provider
// fixtures, all physical networking denied) and appends the scenarios below the TAIL marker.
// Usage: node scripts/uncovered-cards-check.mjs [--json <path outside the tree>]
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const setupSource = readFileSync(join(here, "managed-sms-qa-check.mjs"), "utf8");
const cut = setupSource.indexOf("\nawait check(");
if (cut < 0) throw new Error("managed-sms-qa-check.mjs setup boundary not found");
const self = readFileSync(fileURLToPath(import.meta.url), "utf8"), tail = self.slice(self.lastIndexOf("/*@@TAIL") + 8, self.lastIndexOf("@@END*/"));
const composed = join(here, `.uncovered-cards-composed-${process.pid}.mjs`);
writeFileSync(composed, setupSource.slice(0, cut) + "\n" + tail);
try { await import(pathToFileURL(composed).href); } finally { rmSync(composed, { force: true }); }
/*@@TAIL
// ---------------- uncovered-cards scenarios ----------------
const jsonAt = process.argv.indexOf("--json"), jsonOut = jsonAt < 0 ? null : process.argv[jsonAt + 1];
const scripted = [];
function sse(item) {
  const packets=[],emit=data=>packets.push(`event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`);
  emit({type:'message_start',message:{id:'scripted',type:'message',role:'assistant',content:[],model:'scripted',stop_reason:null,stop_sequence:null,usage:{input_tokens:10,output_tokens:0}}});
  if(item.tool){emit({type:'content_block_start',index:0,content_block:{type:'tool_use',id:'tool_'+(++serial),name:item.tool.name,input:{}}});emit({type:'content_block_delta',index:0,delta:{type:'input_json_delta',partial_json:JSON.stringify(item.tool.input)}});}
  else{emit({type:'content_block_start',index:0,content_block:{type:'text',text:''}});emit({type:'content_block_delta',index:0,delta:{type:'text_delta',text:item.text}});}
  emit({type:'content_block_stop',index:0});emit({type:'message_delta',delta:{stop_reason:item.tool?'tool_use':'end_turn',stop_sequence:null},usage:{output_tokens:10}});emit({type:'message_stop'});
  return new Response(packets.join(''),{headers:{'content-type':'text/event-stream'}});
}
const prevFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input instanceof Request ? input.url : input));
  if (url.origin === 'https://scripted-model.invalid') return sse(scripted.shift() || { text: 'OK.' });
  return prevFetch(input, init);
};
const useScript = items => { scripted.length = 0; scripted.push(...items); Object.assign(process.env, { MC_FAKE_MODEL: '0', ANTHROPIC_API_KEY: 'offline-scripted', ANTHROPIC_BASE_URL: 'https://scripted-model.invalid' }); };
const endScript = () => { process.env.MC_FAKE_MODEL = '1'; delete process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_BASE_URL; };
const outbound = f => [...messages.values()].filter(r => r.direction === 'outbound-api' && r.from === f.number);
const deliveries = async f => store.listJSON('managed_deliveries', f.c.slug + '/');
const display = n => `(${n.slice(2,5)}) ${n.slice(5,8)}-${n.slice(8)}`;
const hex32 = /\b[a-f0-9]{32}\b/;
const quiet = t => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',weekday:'short',hour:'numeric',hourCycle:'h23'}).formatToParts(new Date(t)).map(x=>[x.type,x.value])); const h = Number(p.hour); return h < (p.weekday === 'Sun' ? 12 : 9) || h >= 21; };
async function text(f, body, from = caller) { clock += 2000; const fields = inbound(f, body, { from }); fields.From = from; const r = await httpHandler(signed(fields)); const twimlBody = await r.text(); const row = await strictRead('managed_sms_inbound', inboundKey(f, fields)); let processed = null; if (row) processed = await processManagedSMS(row.id); await delivery.runManagedDelivery({ limit: 50, discoveryLimit: 50 }); return { status: r.status, twiml: twimlBody.replace(/<[^>]+>/g, '').trim(), row: row && await strictRead('managed_sms_inbound', inboundKey(f, fields)), processed }; }
const bookScript = (name, date, window, language = 'en', phone = caller) => [{ tool: { name: 'book_visit', input: { customer_name: name, phone, address: '9 Oak Dr, Houston', issue: 'Water heater pilot out', date, window, urgency: 'this_week', language, notes: '', unsure: '' } } }, { text: 'Your visit is saved. The shop confirms arrival details directly.' }];
async function bookByText(f, date, window, language = 'en', phone = caller) { useScript(bookScript('Sam Early', date, window, language, phone)); await text(f, `Book ${date} ${window} please, Sam Early 9 Oak Dr`, phone); endScript(); await text(f, language === 'es' ? 'SÍ' : 'YES', phone); return (await store.listJSON('bookings', f.c.slug + '/')).find(b => b.phone === phone && b.status === 'booked'); }
const sentTo = (f, phone = caller) => outbound(f).filter(m => m.to === phone).map(m => m.body);

// PRA-HOMEOWNER-07 (rev 2)
const { buildMessagingProgram } = await import('../netlify/functions/lib/messaging-program.mjs');
const registeredHelpContact = c => { const m = buildMessagingProgram(c).helpMessage.match(/help with service texts at (.+?)\. Reply STOP/); assert.ok(m, 'registered HelpMessage shape changed'); return m[1]; };
// A shop registered with a published business number: the number is part of the registered program, so the
// fixture's registration digest and setup proof are re-bound to it, as a real registration would be.
async function withBusinessNumber(f, number = '+17135550142') {
  const saved = await strictRead('clients', f.c.slug); saved.phone = { ...(saved.phone || {}), businessNumber: number }; const revision = configurationRevision(saved); saved.setupProof = { ...saved.setupProof, reviewedRevision: revision, testedRevision: revision }; await store.put('clients', f.c.slug, saved);
  await store.atomicUpdate('messaging_activation', f.row.id, row => ({ value: { ...row, programDigest: buildMessagingProgram(saved).digest, inputRevision: revision } })); f.c = saved; f.row = await strictRead('messaging_activation', f.row.id);
}
await check('H07 in-app HELP and AYUDA name exactly the registered campaign HELP contact (with and without a business number)', async () => {
  const plain = await fixture('u-help'); assert.ok(!plain.c.phone?.businessNumber, 'fixture must start without a business number');
  const biz = await fixture('u-help-biz'); await withBusinessNumber(biz);
  for (const f of [plain, biz]) {
    const contact = registeredHelpContact(await strictRead('clients', f.c.slug)), help = await text(f, 'HELP'), ayuda = await text(f, 'AYUDA');
    assert.equal(help.twiml, `${f.c.business.name}: for help contact ${contact}. Reply STOP, ALTO or PARAR to stop texts.`);
    assert.ok(ayuda.twiml.includes(` ${contact}. `) && /ayuda/i.test(ayuda.twiml) && !/this number/.test(ayuda.twiml), ayuda.twiml);
  }
  assert.equal(registeredHelpContact(await strictRead('clients', plain.c.slug)), plain.c.owner.email); assert.equal(registeredHelpContact(await strictRead('clients', biz.c.slug)), '+17135550142');
});
async function limited(fn) { const before = process.env.MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT; process.env.MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT = '0'; try { return await fn(); } finally { if (before === undefined) delete process.env.MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT; else process.env.MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT = before; } }
const gsm7 = /^[A-Za-z0-9 @£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà]*$/;
async function rebind(f, mutate) {
  const saved = await strictRead('clients', f.c.slug); mutate(saved); const revision = configurationRevision(saved); saved.setupProof = { ...saved.setupProof, reviewedRevision: revision, testedRevision: revision }; await store.put('clients', f.c.slug, saved);
  await store.atomicUpdate('messaging_activation', f.row.id, row => ({ value: { ...row, programDigest: buildMessagingProgram(saved).digest, inputRevision: revision } })); f.c = saved; f.row = await strictRead('messaging_activation', f.row.id);
}
const leadsFor = async (f, phone) => (await store.listJSON('leads', f.c.slug + '/')).filter(l => l.phone === phone);
// Release 3: with legal P6, the first reply in a conversation starts with the automated-assistant line. The AI-limit
// body is compared after that one line; the intro itself (and its language) is checked in its own H07 row below.
const AI_INTRO = /^(?:Automated assistant(?: for [^\n]*)?|Asistente automatizado(?: de [^\n]*)?)\.\n/;
const ai = r => String(r?.row?.reply || '').replace(AI_INTRO, '');
await check('H07 AI-limit without a business number first saves an owner request (with the owner alert), then says the shop will reply', async () => {
  const f = await fixture('u-limit'); await limited(async () => {
    const body = 'Is anyone available to look at my AC?', r = await text(f, body), reply = ai(r);
    assert.equal(reply, `${f.c.business.name}: I cannot complete this reply right now. The shop has your message and will contact you.`);
    const leads = await leadsFor(f, caller); assert.equal(leads.length, 1, 'no owner request saved'); const lead = leads[0];
    assert.equal(lead.status, 'open'); assert.equal(lead.channel, 'sms'); assert.equal(lead.contact, caller); assert.equal(lead.reason, 'handoff'); assert.ok(lead.issue.includes(body), lead.issue);
    const ownerAlert = (await deliveries(f)).find(d => d.source?.id === lead.id && d.channel === 'email'); assert.ok(ownerAlert, `no owner alert queued for the request: ${JSON.stringify((await deliveries(f)).map(d => [d.purpose, d.channel, d.source?.kind]))}`);
    assert.ok(!reply.includes(f.number) && !reply.includes(display(f.number)) && !reply.includes('@'), reply);
    assert.equal(lead.managedActionId, hash(`ai_daily_limit:${f.tenant}:${caller}:${new Date(clock).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })}`), 'request identity must be one per customer per Houston day');
    await processManagedSMS(r.row.id); assert.equal((await leadsFor(f, caller)).length, 1, 'a reprocessed message saved a second request');
  });
});
await check('H07 AI-limit: 5 texts from one customer give 1 request and 1 owner email; another customer gets its own; a closed request gets no promise', async () => {
  const f = await fixture('u-limit-repeat'), other = '+17135550184'; await limited(async () => {
    const replies = []; for (let i = 0; i < 5; i++) replies.push(ai(await text(f, `Message ${i + 1}: is anyone there about my AC?`)));
    assert.ok(replies.every(r => r === `${f.c.business.name}: I cannot complete this reply right now. The shop has your message and will contact you.`), JSON.stringify(replies));
    const mine = await leadsFor(f, caller); assert.equal(mine.length, 1, `${mine.length} requests for one customer`);
    const ownerEmails = id => deliveries(f).then(rows => rows.filter(d => d.channel === 'email' && d.source?.id === id && d.state !== 'superseded'));
    assert.equal((await ownerEmails(mine[0].id)).length, 1, 'more than one owner email for one customer');
    assert.equal((await deliveries(f)).filter(d => d.channel === 'email').length, 1, 'extra owner emails queued');
    await text(f, 'Hello?', other); const theirs = await leadsFor(f, other); assert.equal(theirs.length, 1); assert.notEqual(theirs[0].id, mine[0].id); assert.equal((await ownerEmails(theirs[0].id)).length, 1);
    await store.atomicUpdate('leads', `${f.c.slug}/${mine[0].id}`, row => ({ value: { ...row, status: 'closed' } }));
    assert.equal(ai(await text(f, 'Still there?')), `${f.c.business.name}: I cannot complete this reply right now. The shop can see your message in its workspace.`);
    assert.equal((await leadsFor(f, caller)).length, 1, 'a closed request was duplicated');
    const save = clock; try { clock += 86400000; await store.atomicUpdate('messaging_activation', f.row.id, row => ({ value: { ...row, lastVerifiedAt: stamp() } })); const nd = await text(f, 'Next day: still need help'); assert.ok(nd.row, 'next-day text not accepted'); } finally { clock = save; } assert.equal((await leadsFor(f, caller)).length, 2, 'a new Houston day should start a new request');
  });
});
await check('H07 AI-limit: if saving the request fails, the reply promises nothing', async () => {
  const f = await fixture('u-limit-fail'); await limited(async () => {
    faultKind = 'leads'; let r, es; try { r = await text(f, 'Is anyone available to look at my AC?'); es = await text(f, 'Hola, ¿pueden venir mañana?', '+17135550185'); } finally { faultKind = null; }
    assert.equal(ai(r), `${f.c.business.name}: I cannot complete this reply right now. The shop can see your message in its workspace.`);
    assert.equal(ai(es), `${f.c.business.name}: en este momento no puedo responderle. El negocio puede ver su mensaje.`);
    assert.equal((await leadsFor(f, caller)).length, 0);
  });
});
await check('H07 AI-limit language: saved customer language wins; else Spanish only when the shop serves Spanish; Spanish stays GSM-7, 1 segment', async () => {
  const es = '+17135550188', en = '+17135550187', unknown = '+17135550186';
  const f = await fixture('u-limit-lang');
  await limited(async () => {
    // A customer whose saved request is Spanish gets Spanish even for an English-looking text, and vice versa.
    const { flagLead } = await import('../netlify/functions/lib/desk.mjs');
    await flagLead(f.c, { customer_name: '', phone: es, address: '', issue: 'Calentador', reason: 'lead', urgency: 'this_week', wanted: '', language: 'es', nobook_reason: 'none', unsure: '' }, { channel: 'sms', contact: es });
    await flagLead(f.c, { customer_name: '', phone: en, address: '', issue: 'Heater', reason: 'lead', urgency: 'this_week', wanted: '', language: 'en', nobook_reason: 'none', unsure: '' }, { channel: 'sms', contact: en });
    const esReply = ai(await text(f, 'Ok thanks, tomorrow?', es)), enReply = ai(await text(f, 'Hola, ¿pueden venir mañana?', en)), guess = ai(await text(f, 'Hola, ¿pueden venir mañana?', unknown));
    const spanish = `${f.c.business.name}: en este momento no puedo responderle. El negocio ya tiene su mensaje y se va a comunicar con usted.`;
    assert.equal(esReply, spanish); assert.equal(guess, spanish); assert.match(enReply, /The shop has your message and will contact you\.$/);
    for (const t of [spanish, `${f.c.business.name}: en este momento no puedo responderle. El negocio puede ver su mensaje.`, `${f.c.business.name}: en este momento no puedo responderle. Llame o escriba al (713) 555-0142. El negocio puede revisar su mensaje.`]) { assert.ok(gsm7.test(t), `not GSM-7: ${t}`); assert.ok(t.length <= 160, `${t.length} chars`); }
    assert.ok((await leadsFor(f, unknown)).some(l => l.language === 'es'), 'saved request should carry the reply language');
  });
  const g = await fixture('u-limit-no-es'); await rebind(g, c => { c.business.spanish = false; });
  await limited(async () => { const r = ai(await text(g, 'Hola, ¿pueden venir mañana?', unknown)); assert.match(r, /^Fixture Service: I cannot complete this reply right now\./, r); });
});
await check('H07 AI-limit reply with a published business number names that number only', async () => {
  const f = await fixture('u-limit-biz'); await withBusinessNumber(f);
  await limited(async () => { const r = ai(await text(f, 'Is anyone available to look at my AC?')); assert.equal(r, `${f.c.business.name}: I cannot complete this reply right now. Please contact (713) 555-0142. The shop can review your message in its workspace.`); assert.ok(!r.includes(display(f.number)), r); });
});

// PRA-HOMEOWNER-05
await check('H05 confirmation and reminders: no 32-hex ID, absolute date', async () => {
  const f = await fixture('u-texts'); const b = await bookByText(f, '2026-10-24', '12 to 5'); assert.ok(b, 'booking not saved');
  const confirmation = sentTo(f).find(t => /saved for/.test(t)); assert.ok(confirmation, `no confirmation sent: ${JSON.stringify(sentTo(f))}`);
  assert.ok(!hex32.test(confirmation) && !confirmation.includes(b.id), confirmation); assert.match(confirmation, /your visit is saved for Sat, Oct 24, 12 to 5\./); assert.ok(!/2026-10-24/.test(confirmation), confirmation);
  const reminders = (await deliveries(f)).filter(d => /^reminder_/.test(d.purpose)); assert.ok(reminders.length >= 1);
  for (const r of reminders) { assert.ok(!hex32.test(r.body), r.body); assert.match(r.body, /reminder of your requested visit on Sat, Oct 24, 12 to 5\./); }
});
await check('H05 owner reschedule says moved, from and to; cancel says how to rebook', async () => {
  const f = await fixture('u-move'); const b = await bookByText(f, '2026-10-24', '12 to 5'); assert.ok(b);
  const { changeOwnerVisit, ownerVisitRevision } = await import('../netlify/functions/lib/owner-visits.mjs'), { configurationRevision } = await import('../netlify/functions/lib/setup.mjs');
  const session = { email: f.c.owner.email, sessionHash: hash('u-move-session') }; await store.put('access_sessions', session.sessionHash, { scope: 'onboarding', status: 'active', email: f.c.owner.email, expiresAt: new Date(clock + 3600000).toISOString() });
  let current = await strictRead('clients', f.c.slug), visit = await strictRead('bookings', `${f.c.slug}/${b.id}`);
  await changeOwnerVisit(current, session, { action: 'reschedule_visit', visitId: b.id, expectedRevision: configurationRevision(current), expectedVisitRevision: ownerVisitRevision(visit), submissionId: hash('u-move-1').slice(0, 32), date: '2026-10-26', window: '8 to 12' });
  await delivery.runManagedDelivery({ limit: 50, discoveryLimit: 50 });
  const moved = sentTo(f).find(t => /has moved/.test(t)); assert.ok(moved, `no moved text sent: ${JSON.stringify((await deliveries(f)).map(d => [d.purpose, d.state, d.reasonCode]))}`);
  assert.match(moved, /your visit has moved to Mon, Oct 26, 8 to 12 \(was Sat, Oct 24, 12 to 5\)\./); assert.ok(!hex32.test(moved), moved);
  current = await strictRead('clients', f.c.slug); visit = await strictRead('bookings', `${f.c.slug}/${b.id}`);
  await changeOwnerVisit(current, session, { action: 'cancel_visit', visitId: b.id, expectedRevision: configurationRevision(current), expectedVisitRevision: ownerVisitRevision(visit), submissionId: hash('u-move-2').slice(0, 32) });
  await delivery.runManagedDelivery({ limit: 50, discoveryLimit: 50 });
  assert.ok(sentTo(f).includes(`${f.c.business.name}: your visit on Mon, Oct 26, 8 to 12 has been cancelled. To rebook, reply here.`), JSON.stringify(sentTo(f)));
  assert.ok(sentTo(f).every(t => !hex32.test(t)), 'a sent text carries a 32-hex ID');
});
await check('H05 cancellation with a published number names it (English, and Spanish needing its reviewer); dates are absolute', async () => {
  const desk = await import('../netlify/functions/lib/desk.mjs'), c = { business: { name: 'Taller' }, phone: { businessNumber: '+17135550142' } };
  assert.equal(desk.str('managed_cancelled', { language: 'es' })(c, { date: '2026-10-24', window: '8 to 12', language: 'es' }), 'Taller: su visita del 24 de octubre, de 8 a. m. a 12 p. m., fue cancelada. Para agendar otra visita, llame al (713) 555-0142 o responda.');
  assert.equal(desk.str('managed_cancelled', { language: 'en' })(c, { date: '2026-10-24', window: '8 to 12' }), 'Taller: your visit on Sat, Oct 24, 8 to 12 has been cancelled. To rebook, reply here or call (713) 555-0142.');
  assert.equal(desk.managedDateEn('2026-03-08'), 'Sun, Mar 8'); assert.equal(desk.managedDateEn('2026-11-01'), 'Sun, Nov 1');
});

// PRA-HOMEOWNER-06
const { managedReminderSchedule } = delivery, { arrivalInstant } = await import('../netlify/functions/lib/service-time.mjs');
const iso = t => new Date(t).toISOString();
await check('H06 exact moved times: same-morning send when 30+ minutes before the window, else 8:30 pm the evening before (DST, Sunday, late night)', async () => {
  const now = Date.parse('2026-01-01T00:00:00Z'), cases = [
    ['2027-02-05', '8:30 am to 11:45 am', '2027-02-05T02:30:00.000Z'], // Fri: 9:00 too late -> Thu 8:30 pm CST
    ['2026-11-01', '9:30 am to 11 am', '2026-11-01T01:30:00.000Z'],     // Sun DST end: noon too late -> Sat 8:30 pm CDT
    ['2026-11-02', '9:30 am to 11 am', '2026-11-02T15:00:00.000Z'],     // Mon after DST end: 9:00 CST
    ['2026-10-26', '9:30 am to 11 am', '2026-10-26T14:00:00.000Z'],     // Mon: 9:00 CDT, exactly 30 min before
    ['2026-10-26', '9:15 am to 11 am', '2026-10-26T01:30:00.000Z'],     // Mon: 9:00 is 15 min before -> Sun 8:30 pm
    ['2026-10-26', '8 to 12', '2026-10-26T01:30:00.000Z'],              // Mon early -> Sun 8:30 pm CDT
    ['2026-10-25', '12:30 pm to 3 pm', '2026-10-25T17:00:00.000Z'],     // Sun: noon CDT
    ['2026-10-25', '8 to 12', '2026-10-25T01:30:00.000Z'],              // Sun early -> Sat 8:30 pm
    ['2026-03-08', '12:30 pm to 3 pm', '2026-03-08T17:00:00.000Z'],     // Sun DST start: noon CDT
    ['2026-03-08', '8 to 12', '2026-03-08T02:30:00.000Z'],              // Sun DST start: Sat 8:30 pm CST
    ['2026-03-09', '8 to 12', '2026-03-09T01:30:00.000Z'],              // Mon after DST start: Sun 8:30 pm CDT
    ['2026-11-14', '10:30 pm to 11:30 pm', '2026-11-15T02:30:00.000Z'], // late night: same evening 8:30 pm CST
  ];
  for (const [date, window, expected] of cases) { const start = arrivalInstant(date, window), rows = Object.fromEntries(managedReminderSchedule(start, now)); assert.equal(rows.reminder_1h && iso(rows.reminder_1h), expected, `${date} ${window}`); assert.ok(!quiet(rows.reminder_1h) && rows.reminder_1h < start); assert.equal(rows.reminder_24h, start - 86400000, `${date} ${window} 24h moved`); }
  for (const [date, window] of [['2026-10-26', '10 to 12'], ['2026-10-25', '1 pm to 5 pm'], ['2026-10-24', '12 to 5'], ['2026-03-09', '10 am to 12 pm']]) { const start = arrivalInstant(date, window); assert.deepEqual(managedReminderSchedule(start, now), [['reminder_24h', start - 86400000], ['reminder_1h', start - 3600000]], `${date} ${window} changed`); }
});
await check('H06 a moved reminder less than 2 hours after queueing is skipped; 2 hours or more is kept', async () => {
  const sun8 = arrivalInstant('2026-10-25', '8 to 12'), moved = Date.parse('2026-10-25T01:30:00.000Z');
  assert.deepEqual(managedReminderSchedule(sun8, moved - 10 * 60000), [['reminder_24h', sun8 - 86400000]], 'booked 8:20 pm got a reminder at 8:30 pm');
  assert.deepEqual(managedReminderSchedule(sun8, moved - 2 * 3600000 + 1), [['reminder_24h', sun8 - 86400000]]);
  assert.equal(Object.fromEntries(managedReminderSchedule(sun8, moved - 2 * 3600000)).reminder_1h, moved);
  const mon930 = arrivalInstant('2026-10-26', '9:30 am to 11 am'); assert.deepEqual(managedReminderSchedule(mon930, Date.parse('2026-10-26T12:30:00.000Z')), [['reminder_24h', mon930 - 86400000]], 'booked 7:30 am got a 9:00 reminder');
  const late = arrivalInstant('2026-10-26', '10 to 12'); assert.deepEqual(managedReminderSchedule(late, late - 90 * 60000), [['reminder_24h', late - 86400000], ['reminder_1h', late - 3600000]], 'unmoved reminder must keep base behaviour');
});
await check('H06 Monday 8 to 12 booked by text: the 1h reminder is actually sent before the window', async () => {
  const f = await fixture('u-early'); const b = await bookByText(f, '2026-10-26', '8 to 12'); assert.ok(b);
  const r1 = (await deliveries(f)).find(d => d.purpose === 'reminder_1h'); assert.ok(r1, 'no 1h reminder queued'); assert.ok(!quiet(r1.dueAt), `queued in quiet hours: ${r1.dueAt}`);
  const save = clock; try {
    clock = Date.parse(r1.dueAt) + 60000; await store.atomicUpdate('messaging_activation', f.row.id, row => ({ value: { ...row, lastVerifiedAt: stamp() } })); await delivery.runManagedDelivery({ limit: 50, discoveryLimit: 50 });
    const row = await strictRead('managed_deliveries', r1.id); assert.ok(row.providerId && !['expired', 'waiting_hours'].includes(row.state), `1h reminder not sent: ${row.state} ${row.reasonCode}`);
    assert.ok(Date.parse(r1.dueAt) < arrivalInstant('2026-10-26', '8 to 12'));
    assert.ok(sentTo(f).some(t => /reminder of your requested visit on Mon, Oct 26, 8 to 12/.test(t)), JSON.stringify(sentTo(f)));
  } finally { clock = save; }
});
await check('H06 Sunday 8 to 12: the 24h reminder still goes out, then the moved 1h reminder', async () => {
  const f = await fixture('u-sunday'); const b = await bookByText(f, '2026-10-25', '8 to 12'); assert.ok(b);
  const rows = await deliveries(f), r1 = rows.find(d => d.purpose === 'reminder_1h'), r24 = rows.find(d => d.purpose === 'reminder_24h'); assert.ok(r1 && r24);
  assert.ok(Date.parse(r1.dueAt) - Date.parse(r24.dueAt) >= 4 * 3600000);
  const save = clock; try {
    for (const step of [r24, r1]) { clock = Math.max(clock, Date.parse(step.dueAt) + 60000); for (let i = 0; i < 6; i++) { await store.atomicUpdate('messaging_activation', f.row.id, row => ({ value: { ...row, lastVerifiedAt: stamp() } })); await delivery.runManagedDelivery({ limit: 50, discoveryLimit: 50 }); if ((await strictRead('managed_deliveries', step.id)).providerId) break; clock += 3600000; } }
    for (const step of [r24, r1]) { const row = await strictRead('managed_deliveries', step.id); assert.ok(row.providerId, `${step.purpose} not sent: ${row.state} ${row.reasonCode}`); }
  } finally { clock = save; }
});
// Release 3: placed last so its deliveries do not change the earlier rows' bounded delivery waves (limit 50).
await check('H07 AI-limit + P6: the first reply carries the automated disclosure in the reply language, above the AI-limit body; later replies do not', async () => {
  const es = '+17135550189', en = '+17135550190', f = await fixture('u-limit-intro');
  await limited(async () => {
    const { flagLead } = await import('../netlify/functions/lib/desk.mjs');
    await flagLead(f.c, { customer_name: '', phone: es, address: '', issue: 'Calentador', reason: 'lead', urgency: 'this_week', wanted: '', language: 'es', nobook_reason: 'none', unsure: '' }, { channel: 'sms', contact: es });
    await flagLead(f.c, { customer_name: '', phone: en, address: '', issue: 'Heater', reason: 'lead', urgency: 'this_week', wanted: '', language: 'en', nobook_reason: 'none', unsure: '' }, { channel: 'sms', contact: en });
    // Saved Spanish customer, English-looking text: Spanish intro above the Spanish body (Spanish review r4 merge note).
    const first = (await text(f, 'Ok thanks', es)).row?.reply || '';
    assert.equal(first, `Asistente automatizado de ${f.c.business.name}.\n${f.c.business.name}: en este momento no puedo responderle. El negocio ya tiene su mensaje y se va a comunicar con usted.`);
    // Saved English customer, Spanish-looking text: English intro above the English body.
    const firstEn = (await text(f, 'Hola, ¿pueden venir mañana?', en)).row?.reply || '';
    assert.equal(firstEn, `Automated assistant for ${f.c.business.name}.\n${f.c.business.name}: I cannot complete this reply right now. The shop has your message and will contact you.`);
    for (const t of [first, firstEn]) assert.ok(gsm7.test(t), `not GSM-7: ${t}`);
    const again = (await text(f, 'Gracias', es)).row?.reply || ''; assert.ok(!AI_INTRO.test(again), 'intro repeated: ' + again);
  });
});
const passed = report.checks.filter(r => r.pass).length, total = report.checks.length;
const out = { passed, total, blocked: report.blocked, failures: report.checks.filter(r => !r.pass).map(r => ({ name: r.name, error: r.error })), names: report.checks.map(r => `${r.pass ? 'PASS' : 'FAIL'} ${r.name}`) };
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 2));
console.log(out.names.join('\n')); if (out.failures.length) console.log(JSON.stringify(out.failures, null, 1));
console.log(`uncovered-cards-check: ${passed}/${total}`);
(await import('node:fs')).rmSync((await import('node:url')).fileURLToPath(import.meta.url), { force: true });
process.exit(passed === total && total === 14 && !report.blocked.length ? 0 : 1);
@@END*/
