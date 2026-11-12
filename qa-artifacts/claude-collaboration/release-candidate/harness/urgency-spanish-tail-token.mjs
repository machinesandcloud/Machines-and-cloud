// ---- PRA-HOMEOWNER-03/04 check (appended to the managed-sms-qa-check setup by run-check.sh) ----
// Real handlers in-process: website chat (chat.mjs), signed Twilio SMS (managed-sms), managed voice
// tool dispatch, managed delivery, the scheduler's escalation tasks. Model replies are scripted; every
// provider is intercepted by the setup's fetch; anything else is blocked and counted.
const obs = []; const note = (step, data) => obs.push({ step, at: new Date(clock).toISOString(), ...data });
const scripted = [];
function sse(item) {
  const packets=[],emit=data=>packets.push(`event: ${data.type}\ndata: ${JSON.stringify(data)}\n\n`);
  emit({type:'message_start',message:{id:'scripted',type:'message',role:'assistant',content:[],model:'scripted',stop_reason:null,stop_sequence:null,usage:{input_tokens:10,output_tokens:0}}});
  if(item.tool){emit({type:'content_block_start',index:0,content_block:{type:'tool_use',id:'tool_'+(++serial),name:item.tool.name,input:{}}});emit({type:'content_block_delta',index:0,delta:{type:'input_json_delta',partial_json:JSON.stringify(item.tool.input)}});}
  else{emit({type:'content_block_start',index:0,content_block:{type:'text',text:''}});emit({type:'content_block_delta',index:0,delta:{type:'text_delta',text:item.text}});}
  emit({type:'content_block_stop',index:0});emit({type:'message_delta',delta:{stop_reason:item.tool?'tool_use':'end_turn',stop_sequence:null},usage:{output_tokens:10}});emit({type:'message_stop'});
  return new Response(packets.join(''),{headers:{'content-type':'text/event-stream'}});
}
// Soft assertions: every expectation in a check is evaluated and recorded (so the a54 receipt shows
// each defect, not only the first); the check fails if any expectation failed.
let soft = null;
const expect = (label, fn) => { try { fn(); soft?.push({ label, pass: true }); } catch (e) { if (!soft) throw e; soft.push({ label, pass: false, error: String(e.message).slice(0, 300) }); } };
async function softCheck(name, fn) { await check(name, async () => { soft = []; let rows; try { await fn(); } finally { rows = soft; soft = null; (report.assertions ||= []).push({ check: name, passed: rows.filter(r => r.pass).length, total: rows.length, results: rows }); } const bad = rows.filter(r => !r.pass); if (bad.length) throw new Error(bad.length + '/' + rows.length + ' expectations failed: ' + bad.map(b => b.label + ' (' + b.error.split('\n')[0] + ')').join('; ')); }); }
const sentEmails = [];
const prevFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input instanceof Request ? input.url : input));
  if (url.origin === 'https://scripted-model.invalid') return sse(scripted.shift() || { text: 'OK.' });
  if (url.origin === 'https://api.resend.com' && String(init.method || 'GET').toUpperCase() === 'POST') { const data = JSON.parse(init.body); sentEmails.push({ to: data.to, subject: data.subject, text: data.text }); }
  return prevFetch(input, init);
};
function useScript(items){ scripted.length=0; scripted.push(...items); Object.assign(process.env,{MC_FAKE_MODEL:'0',ANTHROPIC_API_KEY:'offline-scripted',ANTHROPIC_BASE_URL:'https://scripted-model.invalid'}); }
function endScript(){ process.env.MC_FAKE_MODEL='1'; delete process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_BASE_URL; }
const outbound = (f, to) => [...messages.values()].filter(r=>r.direction==='outbound-api'&&r.from===f.number&&(!to||r.to===to));
const deliveries = async f => (await store.listJSON('managed_deliveries',f.c.slug+'/'));
const leadsOf = async f => (await store.listJSON('leads',f.c.slug+'/'));
const alertsOf = async f => (await store.listJSON('alerts',f.c.slug+'/'));
const tasksOf = async f => (await store.listJSON('tasks','')).filter(t=>t.slug===f.c.slug);
async function emailOwnerPolicy(f){ f.c.onboarding.verifiedEmail=f.c.owner.email; await store.put('clients',f.c.slug,f.c); const p={version:'urg_email_'+f.c.slug,expiresAt:new Date(clock+40*86400000).toISOString(),mode:'cohort',providerCredentialHash:hash(process.env.RESEND_API_KEY),senderHash:hash(process.env.FROM_EMAIL),accountLimit:50,tenantLimit:50,tenants:[{slug:f.c.slug,identity:f.tenant,emailHash:hash(f.c.owner.email)}]}; process.env.MANAGED_EMAIL_BUDGET_POLICY_JSON=JSON.stringify(p); process.env.MANAGED_EMAIL_BUDGET_APPROVED_VERSION=p.version; }
async function text(f, body, from = caller) { clock += 2000; const fields = inbound(f, body, { from }); fields.From = from; const r = await httpHandler(signed(fields)); const twimlBody = await r.text(); const row = await strictRead('managed_sms_inbound', inboundKey(f, fields)); if (row) await processManagedSMS(row.id); await delivery.runManagedDelivery({ limit: 50, discoveryLimit: 50 }); return { status: r.status, twiml: twimlBody.replace(/<[^>]+>/g,'').trim().replace(/&apos;/g,"'").replace(/&quot;/g,'"').replace(/&amp;/g,'&') }; }
const touchSender = f => store.atomicUpdate('messaging_activation',f.row.id,row=>({value:{...row,lastVerifiedAt:stamp()}}));
// SMS segments: GSM-7 (160, then 153 per segment; extension characters count twice) or UCS-2 (70, then 67).
const GSM = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà", GSM_EXT = "^{}\\[~]|€";
function segments(body) { body = String(body || ""); let septets = 0; for (const ch of body) { if (GSM.includes(ch)) septets++; else if (GSM_EXT.includes(ch)) septets += 2; else { const units = body.length; return { encoding: 'UCS-2', units, segments: units <= 70 ? 1 : Math.ceil(units / 67) }; } } return { encoding: 'GSM-7', units: septets, segments: septets <= 160 ? 1 : Math.ceil(septets / 153) }; }

// Owner-side expectations, one per request kind. Never invent urgency: price and area stay unmarked.
const EXPECT = {
  emergency: { subject: /^EMERGENCY: Gas smell/, first: /^EMERGENCY: Gas smell/, urgentLine: true, alert: 'emergency' },
  callback: { subject: /^Callback requested: by 3pm/, first: /^Callback requested: by 3pm/, urgentLine: true, alert: 'wants_call' },
  price: { subject: /^Question \(price\): /, first: /^Question \(price\): /, urgentLine: false, alert: null },
  area: { subject: /^Outside service area: /, first: /^Outside service area: /, urgentLine: false, alert: null },
};
const INPUT = {
  emergency: phone => ({ customer_name: 'Jo Caller', phone, address: '1 Gas Ct, Houston', issue: 'Gas smell in the kitchen; family outside now', reason: 'emergency', urgency: 'emergency', wanted: '', language: 'en', nobook_reason: 'none', unsure: '' }),
  callback: phone => ({ customer_name: 'Ray Callme', phone, address: '', issue: 'Wants to talk to the owner about a quote', reason: 'wants_call', urgency: 'flexible', wanted: 'by 3pm', language: 'en', nobook_reason: 'other', unsure: '' }),
  price: phone => ({ customer_name: 'Lee Price', phone, address: '', issue: 'Wants price for water heater replacement', reason: 'question', urgency: 'flexible', wanted: '', language: 'en', nobook_reason: 'wanted_price', unsure: '' }),
  area: phone => ({ customer_name: 'Gal Veston', phone, address: '9 Seawall Blvd, Galveston', issue: 'Leaking pipe, outside service area', reason: 'lead', urgency: 'this_week', wanted: '', language: 'en', nobook_reason: 'out_of_area', unsure: '' }),
};
const PHONES = { emergency: '+17135550141', callback: '+17135550142', price: '+17135550143', area: '+17135550144' };
async function ownerEmailFor(f, lead) {
  const job = (await deliveries(f)).find(d => d.channel === 'email' && d.purpose === 'owner_lead' && d.source?.id === lead.id && !d.alert);
  assert.ok(job, 'owner email queued for ' + lead.id);
  const sent = sentEmails.find(e => e.text === job.body);
  assert.ok(sent, 'owner email sent through the provider: ' + job.state + ' ' + job.reasonCode);
  return { job, sent };
}
async function assertOwnerSide(f, channel, kind) {
  const lead = (await leadsOf(f)).find(l => l.phone === PHONES[kind]);
  assert.ok(lead, channel + ' ' + kind + ' lead saved');
  const { sent } = await ownerEmailFor(f, lead), e = EXPECT[kind];
  note(`03 ${channel} ${kind} owner email`, { subject: sent.subject, firstLines: sent.text.split('\n').slice(0, 3) });
  expect(`${channel} ${kind}: subject leads with urgency/reason`, () => assert.match(sent.subject, e.subject, `${channel} ${kind} subject: ${sent.subject}`));
  expect(`${channel} ${kind}: subject is at most 78 characters`, () => assert.ok(sent.subject.length <= 78, 'subject is short: ' + sent.subject.length));
  expect(`${channel} ${kind}: body first line is the headline`, () => assert.match(sent.text.split('\n')[0], e.first, `${channel} ${kind} first line`));
  expect(`${channel} ${kind}: urgent acknowledgment line only when urgent`, () => assert.equal(/^Urgent: acknowledge/m.test(sent.text), e.urgentLine, `${channel} ${kind} urgent line`));
  if (!e.alert) expect(`${channel} ${kind}: no invented urgency`, () => assert.doesNotMatch(sent.subject + '\n' + sent.text, /EMERGENCY|Callback requested|Urgent/, `${channel} ${kind} carries no invented urgency`));
  const alert = (await alertsOf(f)).find(a => a.leadId === lead.id);
  note(`03 ${channel} ${kind} alert`, { alert: alert && { kind: alert.kind, status: alert.status, deadlineAt: alert.deadlineAt }, tasks: (await tasksOf(f)).filter(t => t.data?.alertId === lead.id).map(t => ({ dueAt: t.dueAt, step: t.data.step || 1 })) });
  if (e.alert) { expect(`${channel} ${kind}: alert opened`, () => assert.ok(alert, `${channel} ${kind} opens an alert`)); expect(`${channel} ${kind}: alert kind`, () => assert.equal(alert?.kind, e.alert)); expect(`${channel} ${kind}: alert waiting`, () => assert.equal(alert?.status, 'waiting')); const tasks = await tasksOf(f); expect(`${channel} ${kind}: escalation task scheduled`, () => assert.ok(tasks.some(t => t.type === 'escalate' && t.data?.alertId === lead.id), 'escalation task')); }
  else expect(`${channel} ${kind}: no alert for a routine request`, () => assert.equal(alert, undefined, `${channel} ${kind} opens no alert`));
  return lead;
}
const scheduler = await import('../netlify/functions/scheduler.mjs');
async function runScheduler() { const saved = process.env.VOICE_ACTIVATION_ENABLED; process.env.VOICE_ACTIVATION_ENABLED = 'false'; const out = await scheduler.run({ forceHour: 3, forceDay: 2, inline: true }); process.env.VOICE_ACTIVATION_ENABLED = saved; return out; }
async function assertEscalation(f, channel) {
  const leads = await leadsOf(f), byKind = Object.fromEntries(Object.keys(PHONES).map(k => [k, leads.find(l => l.phone === PHONES[k])]));
  const start = clock, mins = 10;
  clock = start + (mins + 1) * 60000; await touchSender(f);
  const first = await runScheduler(); assert.ok(first.blocks.tasks.ok, 'scheduler task block ok: ' + JSON.stringify(first.blocks.tasks));
  await delivery.runManagedDelivery({ limit: 50, discoveryLimit: 50 });
  const reminders = () => sentEmails.filter(e => /^Reminder: /.test(e.subject) && Object.values(byKind).some(l => e.text.includes(l.id)));
  const r1 = reminders();
  const a1 = Object.fromEntries((await alertsOf(f)).map(a => [Object.keys(byKind).find(k => byKind[k].id === a.leadId), { step: a.step, attentionDueAt: a.attentionDueAt, history: a.history.map(h => h.how) }]));
  note(`03 ${channel} escalation step 1`, { reminders: r1.map(e => e.subject), alerts: a1 });
  expect(`${channel}: emergency alert escalates (step 1)`, () => assert.ok(a1.emergency?.attentionDueAt && a1.emergency.step === 1, 'emergency alert escalated to step 1'));
  expect(`${channel}: callback alert escalates (step 1)`, () => assert.ok(a1.callback?.attentionDueAt && a1.callback.step === 1, 'callback alert escalated to step 1'));
  expect(`${channel}: emergency reminder email sent`, () => assert.ok(r1.some(e => /^Reminder: EMERGENCY/.test(e.subject) && e.text.includes(byKind.emergency.id)), 'emergency reminder email sent'));
  expect(`${channel}: callback reminder email sent`, () => assert.ok(r1.some(e => /^Reminder: Callback requested/.test(e.subject) && e.text.includes(byKind.callback.id)), 'callback reminder email sent'));
  expect(`${channel}: no reminder for price/area`, () => assert.equal(r1.some(e => e.text.includes(byKind.price.id) || e.text.includes(byKind.area.id)), false, 'no reminder for routine requests'));
  clock = start + (2 * mins + 2) * 60000; await touchSender(f);
  await runScheduler(); await delivery.runManagedDelivery({ limit: 50, discoveryLimit: 50 });
  const r2 = reminders().filter(e => !r1.includes(e));
  const a2 = Object.fromEntries((await alertsOf(f)).map(a => [Object.keys(byKind).find(k => byKind[k].id === a.leadId), { step: a.step, status: a.status }]));
  note(`03 ${channel} escalation step 2`, { reminders: r2.map(e => e.subject), alerts: a2, remainingTasks: (await tasksOf(f)).length });
  expect(`${channel}: emergency escalates again (step 2)`, () => assert.equal(a2.emergency?.step, 2, 'emergency escalates a second time'));
  expect(`${channel}: callback escalates once`, () => assert.equal(a2.callback?.step, 1, 'callback escalates once'));
  expect(`${channel}: exactly one step-2 reminder`, () => assert.equal(r2.length, 1, 'exactly one more reminder (emergency)'));
  expect(`${channel}: step-2 reminder is the emergency`, () => assert.match(r2[0]?.subject || '', /^Reminder: EMERGENCY/));
  const left = (await tasksOf(f)).length; expect(`${channel}: no escalation task left`, () => assert.equal(left, 0, 'no escalation tasks left behind'));
}
function webFixture(f) { f.c.channels.web.active = true; const rv = configurationRevision(f.c); f.c.setupProof = { reviewedRevision: rv, testedRevision: rv, testMode: 'live' }; return store.put('clients', f.c.slug, f.c); }

// ===== 03: website chat =====
await softCheck('03 web: emergency/callback/price/out-of-area owner email, alert and escalation', async () => {
  const f = await fixture('urgweb'); await emailOwnerPolicy(f); await webFixture(f);
  const chat = (await import('../netlify/functions/chat.mjs')).default;
  for (const kind of Object.keys(PHONES)) {
    useScript([{ tool: { name: 'notify_owner', input: INPUT[kind](PHONES[kind]) } }, { text: 'Your request is saved for the shop.' }]);
    const res = await chat(new Request(site + '/api/chat', { method: 'POST', headers: { origin: site, 'content-type': 'application/json' }, body: JSON.stringify({ client: f.c.slug, contact: 'w' + hash(kind).slice(0, 30), messages: [{ role: 'user', content: 'Customer message for ' + kind }], stream: true }) }));
    const t = await res.text(); endScript(); assert.equal(res.status, 200, t.slice(0, 200));
  }
  await delivery.runManagedDelivery({ limit: 50, discoveryLimit: 50 });
  for (const kind of Object.keys(PHONES)) await assertOwnerSide(f, 'web', kind);
  await assertEscalation(f, 'web');
});
// ===== 03: SMS =====
await softCheck('03 sms: emergency/callback/price/out-of-area owner email, alert and escalation', async () => {
  const f = await fixture('urgsms'); await emailOwnerPolicy(f);
  for (const kind of Object.keys(PHONES)) { useScript([{ tool: { name: 'notify_owner', input: INPUT[kind](PHONES[kind]) } }, { text: 'Your request is saved for the shop.' }]); await text(f, 'Customer text for ' + kind, PHONES[kind]); endScript(); }
  await delivery.runManagedDelivery({ limit: 50, discoveryLimit: 50 });
  for (const kind of Object.keys(PHONES)) await assertOwnerSide(f, 'sms', kind);
  await assertEscalation(f, 'sms');
});
// ===== 03: voice =====
await softCheck('03 voice: emergency/callback/price/out-of-area owner email, alert and escalation', async () => {
  const f = await fixture('urgvoice'); await emailOwnerPolicy(f);
  const { dispatchManagedVoiceTool } = await import('../netlify/functions/lib/managed-actions.mjs');
  for (const kind of Object.keys(PHONES)) await dispatchManagedVoiceTool({ client: f.c, callId: 'call' + kind, toolCallId: 't1', name: 'notify_owner', caller: PHONES[kind], channel: 'call', input: INPUT[kind](PHONES[kind]) });
  await delivery.runManagedDelivery({ limit: 50, discoveryLimit: 50 });
  for (const kind of Object.keys(PHONES)) await assertOwnerSide(f, 'voice', kind);
  await assertEscalation(f, 'voice');
});
// ===== 03: acknowledging stops the reminder; Spanish emergency is labelled for the owner =====
await softCheck('03 ack before the deadline stops escalation; Spanish emergency email is English with a language marker', async () => {
  const f = await fixture('urgack'); await emailOwnerPolicy(f);
  const { dispatchManagedVoiceTool } = await import('../netlify/functions/lib/managed-actions.mjs'); const desk = await import('../netlify/functions/lib/desk.mjs');
  await dispatchManagedVoiceTool({ client: f.c, callId: 'callAckEs', toolCallId: 't1', name: 'notify_owner', caller: '+17135550151', channel: 'call', input: { ...INPUT.emergency('+17135550151'), issue: 'Gas smell in the kitchen', language: 'es' } });
  await delivery.runManagedDelivery({ limit: 50, discoveryLimit: 50 });
  const lead = (await leadsOf(f))[0], { sent } = await ownerEmailFor(f, lead);
  note('03 spanish emergency owner email', { subject: sent.subject, body: sent.text });
  expect('es emergency: owner subject marks Spanish', () => assert.match(sent.subject, /^EMERGENCY: Gas smell.*\(Spanish\)$/)); expect('es emergency: owner body has Language: Spanish', () => assert.match(sent.text, /^Language: Spanish$/m));
  const acked = await desk.ackAlertsFor(f.c, lead.id, 'portal'); expect('ack closes one alert', () => assert.equal(acked, 1));
  const start = clock; clock = start + 11 * 60000; await touchSender(f); await runScheduler(); await delivery.runManagedDelivery({ limit: 50, discoveryLimit: 50 });
  const alert = (await alertsOf(f))[0] || {};
  note('03 acked alert after deadline', { status: alert.status, alertStep: alert.step, reminders: sentEmails.filter(e => /^Reminder/.test(e.subject) && e.text.includes(lead.id)).length });
  expect('alert stays acked after the deadline', () => assert.equal(alert.status, 'acked')); expect('no reminder after acknowledgment', () => assert.equal(sentEmails.some(e => /^Reminder/.test(e.subject) && e.text.includes(lead.id)), false, 'no reminder after acknowledgment'));
  // A reminder already queued by the escalation must not go out once the owner acknowledges.
  await dispatchManagedVoiceTool({ client: f.c, callId: 'callAckLate', toolCallId: 't1', name: 'notify_owner', caller: '+17135550152', channel: 'call', input: INPUT.emergency('+17135550152') });
  await delivery.runManagedDelivery({ limit: 50, discoveryLimit: 50 });
  const late = (await leadsOf(f)).find(l => l.phone === '+17135550152');
  clock += 11 * 60000; await touchSender(f); await runScheduler();
  const queued = (await deliveries(f)).find(d => d.alert?.id === late.id);
  const lateAck = await desk.ackAlertsFor(f.c, late.id, 'portal'); await delivery.runManagedDelivery({ limit: 50, discoveryLimit: 50 });
  const after = queued && await strictRead('managed_deliveries', queued.id);
  note('03 ack after reminder queued', { queuedState: queued?.state, finalState: after?.state, reasonCode: after?.reasonCode, lateAck });
  expect('escalation queued a reminder before the late ack', () => assert.ok(queued, 'reminder queued'));
  expect('queued reminder is not sent after a late ack', () => assert.equal(sentEmails.some(e => /^Reminder/.test(e.subject) && e.text.includes(late.id)), false));
  expect('queued reminder ends superseded', () => assert.equal(after?.state, 'superseded'));
});

// ===== 04: Spanish booking full text lifecycle =====
await softCheck('04 Spanish SMS booking: confirmation, 24h, 1h, reschedule, cancellation and AYUDA in Spanish; owner email English', async () => {
  const f = await fixture('urges'); await emailOwnerPolicy(f); const es = '+17135550177';
  useScript([{ tool: { name: 'book_visit', input: { customer_name: 'María López', phone: es, address: '45 Elm St, Houston', issue: 'Calentador de agua no calienta', date: '2026-10-24', window: '12 to 5', urgency: 'this_week', language: 'es', notes: '', unsure: '' } } }, { text: 'Su solicitud de visita está guardada. El negocio confirmará la llegada.' }]);
  await text(f, 'Hola, mi calentador no calienta. Soy María López, 45 Elm St. ¿Pueden venir el sábado de 12 a 5?', es); endScript();
  await text(f, 'SÍ', es); await delivery.runManagedDelivery({ limit: 50, discoveryLimit: 50 });
  const sms = () => outbound(f, es).map(m => m.body);
  const life = []; const record = (stage, body) => { const s = segments(body); life.push({ stage, body, ...s }); return body; };
  const confirmation = sms().find(b => /visita queda guardada|visit [a-f0-9]{32} is saved/.test(b)); expect('es confirmation sent', () => assert.ok(confirmation, 'confirmation sent: ' + JSON.stringify(sms())));
  record('confirmation', confirmation);
  const rows = await deliveries(f), r24 = rows.find(d => d.purpose === 'reminder_24h'), r1 = rows.find(d => d.purpose === 'reminder_1h');
  assert.ok(r24 && r1, 'both reminders queued');
  const save = clock;
  for (const step of [r24, r1]) { clock = Date.parse(step.dueAt) + 60000; await touchSender(f); await delivery.runManagedDelivery({ limit: 50, discoveryLimit: 50 }); const row = await strictRead('managed_deliveries', step.id); expect(`es ${step.purpose} sent`, () => assert.equal(row.state === 'accepted' || row.state === 'delivered', true, step.purpose + ' sent: ' + row.state + ' ' + row.reasonCode)); record(step.purpose, sms().find(b => b === row.body)); }
  let b = (await store.listJSON('bookings', f.c.slug + '/'))[0];
  b = { ...b, date: '2026-10-26', window: '8 to 12', rescheduledAt: stamp() }; await store.put('bookings', `${f.c.slug}/${b.id}`, b); await delivery.queueManagedRecord(f.c, b); await touchSender(f); await delivery.runManagedDelivery({ limit: 50, discoveryLimit: 50 });
  record('reschedule', sms().at(-1));
  b = { ...b, status: 'cancelled', cancelledAt: stamp() }; await store.put('bookings', `${f.c.slug}/${b.id}`, b); await delivery.queueManagedRecord(f.c, b); await touchSender(f); await delivery.runManagedDelivery({ limit: 50, discoveryLimit: 50 });
  record('cancelled', sms().at(-1));
  const ayuda = await text(f, 'AYUDA', es); record('AYUDA reply', ayuda.twiml);
  const help = await text(f, 'HELP', es);
  clock = save;
  const ownerEmails = sentEmails.filter(e => e.text.includes(b.id) && !/^Reminder/.test(e.subject));
  note('04 spanish lifecycle', { texts: life, helpReply: help.twiml, ownerSubjects: ownerEmails.map(e => e.subject), ownerFirstEmail: ownerEmails[0]?.text });
  const want = { confirmation: /su visita queda guardada para el 24 de octubre, de 12 p\. m\. a 5 p\. m\./, reminder_24h: /recordatorio de su visita solicitada para el 24 de octubre, de 12 p\. m\. a 5 p\. m\./, reminder_1h: /recordatorio de su visita solicitada para el 24 de octubre, de 12 p\. m\. a 5 p\. m\./, reschedule: /su visita ahora es el 26 de octubre, de 8 a\. m\. a 12 p\. m\./, cancelled: /su visita del 26 de octubre, de 8 a\. m\. a 12 p\. m\., fue cancelada\./, 'AYUDA reply': /para ayuda, llame o escriba a /, };
  for (const row of life) {
    expect(`es ${row.stage}: Spanish wording`, () => assert.match(row.body, want[row.stage], row.stage + ' is Spanish: ' + row.body));
    expect(`es ${row.stage}: no English template text`, () => assert.doesNotMatch(row.body, /\b(visit|reminder|cancelled|Reply here|for help contact)\b/, row.stage + ' has no English template text'));
    expect(`es ${row.stage}: GSM-7 encoding`, () => assert.equal(row.encoding, 'GSM-7', row.stage + ' stays GSM-7'));
    expect(`es ${row.stage}: at most 2 segments`, () => assert.ok(row.segments <= 2, row.stage + ' fits two segments: ' + row.segments));
  }
  expect('HELP stays English', () => assert.match(help.twiml, /^Fixture Service: for help contact /, 'HELP stays English'));
  expect('es owner email sent', () => assert.ok(ownerEmails.length >= 1)); for (const e of ownerEmails) { expect('es owner email: Language: Spanish line', () => assert.match(e.text, /^Language: Spanish$/m, 'owner email names the language')); expect('es owner email: (Spanish) in subject', () => assert.match(e.subject, /\(Spanish\)$/)); expect('es owner email stays English', () => assert.match(e.text, /Open your workspace to review and respond\./, 'owner email stays English')); }
});
// ===== 04: English control stays byte-identical =====
await softCheck('04 English booking texts are unchanged', async () => {
  const f = await fixture('urgen');
  useScript([{ tool: { name: 'book_visit', input: { customer_name: 'Alex Fixture', phone: caller, address: '123 Example St, Houston', issue: 'Kitchen sink leaking', date: '2026-10-24', window: '8 to 12', urgency: 'this_week', language: 'en', notes: '', unsure: '' } } }, { text: 'Saved.' }]);
  await text(f, 'Book Saturday 8 to 12 please'); endScript(); await text(f, 'YES'); await delivery.runManagedDelivery({ limit: 50, discoveryLimit: 50 });
  const b = (await store.listJSON('bookings', f.c.slug + '/'))[0], rows = await deliveries(f);
  const conf = rows.find(d => d.purpose === 'confirmation'), r24 = rows.find(d => d.purpose === 'reminder_24h');
  note('04 english control', { confirmation: conf.body, reminder: r24.body, confirmationSegments: segments(conf.body), reminderSegments: segments(r24.body) });
  expect('English confirmation byte-identical', () => assert.equal(conf.body, `Fixture Service: visit ${b.id} is saved for 2026-10-24, 8 to 12. The shop confirms arrival details directly. Reply STOP to end texts.`));
  expect('English reminder byte-identical', () => assert.equal(r24.body, `Fixture Service: reminder of your requested visit ${b.id} on 2026-10-24, 8 to 12. The shop confirms arrival details directly. Reply here if anything changes. Reply STOP to end texts.`));
});
// ===== Revision 2: QA-URG probes Q1-Q10 folded in (qa/probes/probe-tail*.mjs), plus Q11 and the r2 checks =====
// The composed check starts more website/SMS AI turns than the default 50 global starts per Houston day;
// this offline process raises only that synthetic counter (scripted model, no provider).
process.env.MC_SELF_SERVICE_AI_GLOBAL_DAILY_LIMIT = '500';
// The owner-email budget ledger is shared by every fixture in this process (account limit 50 in the
// helper policy); the folded probes would exhaust it, so their policy raises only that synthetic limit.
async function qaPolicy(f) { await emailOwnerPolicy(f); const p = JSON.parse(process.env.MANAGED_EMAIL_BUDGET_POLICY_JSON); p.accountLimit = 1000; process.env.MANAGED_EMAIL_BUDGET_POLICY_JSON = JSON.stringify(p); }
const qaDesk = await import('../netlify/functions/lib/desk.mjs');
const qaChat = (await import('../netlify/functions/chat.mjs')).default;
const __tok = new Map();
async function qaWeb(f, contact0, input) { const __k = f.c.slug + "/" + contact0, __s = __tok.get(__k) || { contact: contact0 }; const contact = __s.contact; useScript([{ tool: { name: 'notify_owner', input } }, { text: 'Saved.' }]); const r = await qaChat(new Request(site + '/api/chat', { method: 'POST', headers: { origin: site, 'content-type': 'application/json' }, body: JSON.stringify({ client: f.c.slug, contact, messages: [{ role: 'user', content: 'hello' }], stream: true, ...(__s.token ? { conversationToken: __s.token } : {}) }) })); const __t=await r.text(); endScript(); const __h=r.headers.get('X-MC-Conversation-Token'), __c=r.headers.get('X-MC-Contact'); if (__h) __tok.set(__k, { contact: __c || contact, token: __h }); if (r.status!==200) console.error('QAWEB', contact0, r.status, __t.slice(0,120)); return r.status; }
const qaEmails = id => sentEmails.filter(e => e.text.includes(id)).map(e => ({ subject: e.subject, first: e.text.split('\n')[0] }));
const qaWave = () => delivery.runManagedDelivery({ limit: 50, discoveryLimit: 50 });
const qaTick = async (f, ms) => { clock += ms; await touchSender(f); const out = await runScheduler(); await qaWave(); return out; };
// Q1 (D1): a routine web lead that becomes an EMERGENCY 25 minutes later (merged inside the 30-minute window).
await check('Q1 late emergency upgrade: reminder timing is truthful (D1)', async () => {
  const f = await fixture('q1'); await qaPolicy(f); await webFixture(f);
  const t0 = clock; await qaWeb(f, 'q1contact', { ...INPUT.area('+17135550301'), nobook_reason: 'none', issue: 'Water heater making noise' }); await qaWave();
  clock = t0 + 25 * 60000; await touchSender(f); await qaWeb(f, 'q1contact', { ...INPUT.emergency('+17135550301') }); await qaWave();
  const lead = (await leadsOf(f))[0], alert = (await alertsOf(f))[0], upgradeAt = clock;
  clock = upgradeAt + 60000; await touchSender(f); await runScheduler(); await qaWave(); const afterOneMinute = qaEmails(lead.id);
  clock = upgradeAt + 11 * 60000; await touchSender(f); await runScheduler(); await qaWave(); const afterEleven = qaEmails(lead.id);
  note('Q1', { leads: (await leadsOf(f)).length, deadlineMinutesAfterUpgrade: (Date.parse(alert.deadlineAt) - upgradeAt) / 60000, afterOneMinute, afterEleven });
  assert.equal(afterOneMinute.filter(e => /^Reminder/.test(e.subject)).length, 0, 'no reminder within 1 minute of the emergency first becoming known');
  assert.equal((Date.parse(alert.deadlineAt) - upgradeAt) / 60000, 10, 'deadline is ackMinutes after the alert opened');
  assert.equal(afterEleven.filter(e => /^Reminder: EMERGENCY/.test(e.subject)).length, 1, 'one truthful reminder after the real 10 minutes');
});
// Q2: a routine SMS lead that becomes a callback request (new wanted text) 25 minutes later.
await check('Q2 late callback upgrade sends a "Callback requested" owner email', async () => {
  const f = await fixture('q2'); await qaPolicy(f); const ph = '+17135550302';
  const t0 = clock; useScript([{ tool: { name: 'notify_owner', input: { ...INPUT.price(ph), reason: 'lead', nobook_reason: 'none' } } }, { text: 'Saved.' }]); await text(f, 'Need a quote', ph); endScript(); await qaWave();
  clock = t0 + 25 * 60000; await touchSender(f);
  useScript([{ tool: { name: 'notify_owner', input: { ...INPUT.callback(ph), issue: INPUT.price(ph).issue } } }, { text: 'Saved.' }]); await text(f, 'Actually just have the owner call me by 3pm', ph); endScript(); await qaWave();
  // SMS requests carry distinct action ids, so this is a second lead; pick it by reason, not list order
  // (QA's probe took leads[0], which only passed because of storage key order).
  const lead = (await leadsOf(f)).find(l => l.reason === 'wants_call'); assert.ok(lead, 'callback lead saved'); await qaTick(f, 60000);
  note('Q2', { leads: (await leadsOf(f)).length, reason: lead.reason, emails: qaEmails(lead.id) });
  assert.ok(qaEmails(lead.id).some(e => /^Callback requested/.test(e.subject)));
});
// Q2b (D1): lead -> wants_call with the same revision; no reminder claims 10 unacknowledged minutes after 1 minute.
await check('Q2b late callback upgrade with unchanged revision (D1)', async () => {
  const f = await fixture('q2b'); await qaPolicy(f); await webFixture(f);
  const base = { ...INPUT.callback('+17135550312'), reason: 'lead', wanted: '', nobook_reason: 'none' };
  await qaWeb(f, 'q2b', base); await qaWave(); clock += 25 * 60000; await touchSender(f);
  await qaWeb(f, 'q2b', { ...base, reason: 'wants_call' }); await qaWave();
  const lead = (await leadsOf(f))[0]; await qaTick(f, 60000); const e = qaEmails(lead.id);
  note('Q2b', { reason: lead.reason, emails: e });
  assert.ok(!e.some(x => /^Reminder/.test(x.subject)) || e.some(x => /^Callback requested/.test(x.subject)), 'owner first hears of the callback from a reminder claiming 10 unacknowledged minutes');
  await qaTick(f, 10 * 60000); assert.equal(qaEmails(lead.id).filter(x => /^Reminder: Callback requested/.test(x.subject)).length, 1, 'one reminder after the real deadline');
});
// Q3: repeated merges / replays stay bounded.
await check('Q3 repeated emergency merges stay idempotent and bounded', async () => {
  const f = await fixture('q3'); await qaPolicy(f); await webFixture(f);
  for (let i = 0; i < 5; i++) { clock += 30000; await qaWeb(f, 'q3contact', { ...INPUT.emergency('+17135550303'), issue: 'Gas smell ' + i }); }
  await qaWave(); const lead = (await leadsOf(f))[0];
  for (let k = 0; k < 6; k++) await qaTick(f, 6 * 60000);
  const rem = qaEmails(lead.id).filter(e => /^Reminder/.test(e.subject));
  note('Q3', { leads: (await leadsOf(f)).length, alerts: (await alertsOf(f)).length, tasksLeft: (await tasksOf(f)).length, reminders: rem.map(e => e.subject) });
  assert.equal((await alertsOf(f)).length, 1); assert.ok(rem.length <= 2, 'at most 2 reminders, got ' + rem.length); assert.equal((await tasksOf(f)).length, 0);
});
// Q4: the customer books after a reminder is queued: booking acks the alert and the queued reminder is superseded.
await check('Q4 customer booking acks the alert and supersedes a queued reminder', async () => {
  const f = await fixture('q4'); await qaPolicy(f); const ph = '+17135550304';
  const { dispatchManagedVoiceTool } = await import('../netlify/functions/lib/managed-actions.mjs');
  await dispatchManagedVoiceTool({ client: f.c, callId: 'q4call', toolCallId: 't1', name: 'notify_owner', caller: ph, channel: 'call', input: INPUT.emergency(ph) }); await qaWave();
  const lead = (await leadsOf(f))[0]; clock += 11 * 60000; await touchSender(f); await runScheduler();
  const queued = (await deliveries(f)).filter(d => d.alert?.id === lead.id);
  await store.put('leads', `${f.c.slug}/${lead.id}`, { ...(await strictRead('leads', `${f.c.slug}/${lead.id}`)), status: 'booked' }); await qaDesk.ackAlertsFor(f.c, lead.id, 'booking');
  await qaWave(); await qaTick(f, 11 * 60000);
  const states = await Promise.all(queued.map(q => strictRead('managed_deliveries', q.id)));
  note('Q4', { queued: queued.length, states: states.map(s => s.state), alert: (await alertsOf(f))[0]?.status, tasksLeft: (await tasksOf(f)).length });
  assert.ok(queued.length >= 1, 'a reminder was queued'); assert.equal(qaEmails(lead.id).filter(e => /^Reminder/.test(e.subject)).length, 0);
});
// Q5: hostile issue text on the real web path: no CR/LF in the subject, at most 78 characters, structured prefix only.
await check('Q5 hostile issue text through the real web path', async () => {
  const f = await fixture('q5'); await qaPolicy(f); await webFixture(f);
  await qaWeb(f, 'q5contact', { ...INPUT.price('+17135550305'), issue: 'EMERGENCY!!!\r\nBcc: evil@example.com\r\n' + 'z'.repeat(300) }); await qaWave();
  const lead = (await leadsOf(f))[0], e = sentEmails.find(x => x.text.includes(lead.id));
  note('Q5', { subject: e?.subject, len: e?.subject.length });
  assert.ok(e && !/[\r\n]/.test(e.subject) && e.subject.length <= 78 && /^Question \(price\)/.test(e.subject));
});
// Q6: Spanish emergency reminders stay English for the owner, with the language marker.
await check('Q6 Spanish emergency reminders are English with language marker', async () => {
  const f = await fixture('q6'); await qaPolicy(f); const ph = '+17135550306';
  useScript([{ tool: { name: 'notify_owner', input: { ...INPUT.emergency(ph), language: 'es', issue: 'Smells like gas in kitchen' } } }, { text: 'Guardado.' }]); await text(f, 'Huele a gas', ph); endScript(); await qaWave();
  const lead = (await leadsOf(f))[0]; await qaTick(f, 11 * 60000); await qaTick(f, 11 * 60000);
  const all = sentEmails.filter(x => x.text.includes(lead.id));
  note('Q6', { subjects: all.map(e => e.subject) });
  assert.equal(all.filter(e => /^Reminder: EMERGENCY/.test(e.subject)).length, 2); for (const e of all) assert.match(e.text, /^Language: Spanish$/m);
});
// Q7 (D2): a callback acknowledged, then the same customer reports an emergency: a waiting emergency alert reopens.
await check('Q7 emergency after an acknowledged callback re-alerts (D2)', async () => {
  const f = await fixture('q7'); await qaPolicy(f); await webFixture(f);
  await qaWeb(f, 'q7', INPUT.callback('+17135550317')); await qaWave();
  const lead = (await leadsOf(f))[0]; await qaDesk.ackAlertsFor(f.c, lead.id, 'portal');
  clock += 5 * 60000; await touchSender(f); await qaWeb(f, 'q7', { ...INPUT.emergency('+17135550317') }); await qaWave();
  const reopened = (await alertsOf(f))[0];
  await qaTick(f, 11 * 60000); await qaTick(f, 11 * 60000);
  const alerts = await alertsOf(f), rem = qaEmails(lead.id).filter(e => /^Reminder/.test(e.subject));
  note('Q7', { reopened: { kind: reopened.kind, status: reopened.status, epoch: reopened.epoch }, alerts: alerts.map(a => ({ kind: a.kind, status: a.status, step: a.step, epoch: a.epoch })), reminders: rem.map(e => e.subject) });
  assert.equal(reopened.kind, 'emergency'); assert.equal(reopened.status, 'waiting'); assert.equal(reopened.epoch, 1);
  assert.equal(alerts.length, 1); assert.equal(alerts[0].step, 2); assert.equal(rem.filter(e => /^Reminder: EMERGENCY/.test(e.subject)).length, 2); assert.equal((await tasksOf(f)).length, 0);
});
// Q8: a status check after an emergency neither opens nor suppresses an alert.
await check('Q8 status check does not suppress the emergency alert', async () => {
  const f = await fixture('q8'); await qaPolicy(f); await webFixture(f);
  await qaWeb(f, 'q8', INPUT.emergency('+17135550318')); await qaWave();
  clock += 2 * 60000; await qaWeb(f, 'q8', { ...INPUT.emergency('+17135550318'), reason: 'status_check', urgency: 'emergency' });
  await qaTick(f, 11 * 60000);
  note('Q8', { leads: (await leadsOf(f)).map(l => l.reason), alerts: (await alertsOf(f)).map(a => ({ kind: a.kind, status: a.status, step: a.step })) });
  assert.equal((await alertsOf(f)).length, 1); assert.equal((await alertsOf(f))[0].step, 1);
});
// Q9: website setup-check leads never open alerts.
await check('Q9 setup-check emergency opens no alert', async () => {
  const f = await fixture('q9'); await qaPolicy(f);
  await qaDesk.flagLead(f.c, INPUT.emergency('+17135550319'), { channel: 'web', contact: 'q9', websiteSetupCheck: { checkId: 'chk1', at: stamp() } });
  assert.equal((await alertsOf(f)).length, 0); assert.equal((await tasksOf(f)).length, 0);
});
// Q10 (D2): a callback reminder queued before the ack stays superseded after the alert reopens as an emergency.
await check('Q10 stale callback reminder stays superseded after emergency reopen (D2)', async () => {
  const f = await fixture('q10'); await qaPolicy(f); await webFixture(f);
  await qaWeb(f, 'q10', INPUT.callback('+17135550320')); await qaWave();
  const lead = (await leadsOf(f))[0]; clock += 11 * 60000; await touchSender(f); await runScheduler();
  const queued = (await deliveries(f)).find(d => d.alert?.id === lead.id);
  await qaDesk.ackAlertsFor(f.c, lead.id, 'portal'); clock += 60000; await qaWeb(f, 'q10', INPUT.emergency('+17135550320')); await qaWave();
  const stale = queued && await strictRead('managed_deliveries', queued.id);
  note('Q10', { queued: !!queued, staleState: stale?.state });
  assert.ok(queued, 'callback reminder was queued'); assert.equal(stale?.state, 'superseded');
  assert.equal(sentEmails.filter(e => e.text.includes(lead.id) && /^Reminder: Callback/.test(e.subject)).length, 0);
});
// Q11 (r2, found reviewing the D2 fix): the callback's own epoch-0 task fires after the reopen but before the
// emergency's new deadline. It must retire quietly, not throw "Alert is not due" (a retained managed task failure
// that marks health failing on every run until the new deadline), and the epoch-1 reminder must still come on time.
await check('Q11 earlier-epoch escalation task retires quietly after an emergency reopen', async () => {
  const f = await fixture('q11'); await qaPolicy(f); await webFixture(f);
  await qaWeb(f, 'q11', INPUT.callback('+17135550321')); await qaWave();
  const lead = (await leadsOf(f))[0], t0 = clock; await qaDesk.ackAlertsFor(f.c, lead.id, 'portal');
  clock = t0 + 8 * 60000; await touchSender(f); await qaWeb(f, 'q11', INPUT.emergency('+17135550321')); await qaWave();
  const reopenAt = clock;
  clock = t0 + 11 * 60000; await touchSender(f); const between = await runScheduler(); await qaWave();
  const mid = (await alertsOf(f))[0], midTasks = (await tasksOf(f)).map(t => ({ dueAt: t.dueAt, epoch: t.data.epoch || 0, step: t.data.step || 1 }));
  clock = reopenAt + 11 * 60000; await touchSender(f); await runScheduler(); await qaWave();
  const rem = qaEmails(lead.id).filter(e => /^Reminder/.test(e.subject));
  note('Q11', { betweenTasks: between.blocks.tasks, mid: { step: mid.step, status: mid.status, epoch: mid.epoch }, midTasks, reminders: rem.map(e => e.subject) });
  assert.ok(between.blocks.tasks.ok, 'scheduler task block ok between the old and new deadlines: ' + JSON.stringify(between.blocks.tasks));
  assert.ok(!JSON.stringify(between.blocks.tasks).includes('error'), 'no task error between the deadlines');
  assert.equal(mid.step, 0, 'no premature step under the reopened alert'); assert.equal(midTasks.filter(t => t.epoch === 0).length, 0, 'the earlier-epoch task is retired');
  assert.equal(rem.length, 1); assert.match(rem[0].subject, /^Reminder: EMERGENCY/);
});
// ===== r2: Spanish time wording, GSM-7 and segments across window shapes and name lengths =====
await softCheck('r2 Spanish window wording: noon and evening read naturally; managed texts stay GSM-7 and at most 2 segments', async () => {
  const W = { '8 to 12': '8 a. m. a 12 p. m.', '12 to 5': '12 p. m. a 5 p. m.', '8 am to 12 pm': '8 a. m. a 12 p. m.', '12 pm to 5 pm': '12 p. m. a 5 p. m.', '1 pm to 5 pm': '1 a 5 p. m.', '6 pm to 8 pm': '6 a 8 p. m.', '5 pm to 9 pm': '5 a 9 p. m.', '8:30 am to 10:30 am': '8:30 a 10:30 a. m.', '8 a.m. to 12 p.m.': '8 a. m. a 12 p. m.', '11 am to 1 pm': '11 a. m. a 1 p. m.', '7 to 9': '7 a 9 a. m.' };
  const L = { '8 am to 12 pm': '8 de la mañana a 12 del mediodía', '12 pm to 5 pm': '12 del mediodía a 5 de la tarde', '6 pm to 8 pm': '6 de la tarde a 8 de la noche', '8 a.m. to 12 p.m.': '8 de la mañana a 12 del mediodía', '7 pm to 11 pm': '7 de la noche a 11 de la noche', '12 to 5': '12 a 5' };
  for (const [w, out] of Object.entries(W)) expect(`managed window "${w}"`, () => assert.equal(qaDesk.managedWinEs(w), out));
  for (const [w, out] of Object.entries(L)) expect(`legacy window "${w}"`, () => assert.equal(qaDesk.winEs(w), out));
  const names = { n15: 'Bayou Air Plumb', n44: 'Westheimer Maids & Home Cleaning Services LLC', n60: 'Westheimer Maids & Home Cleaning and Plumbing Services LLC TX' };
  const rows = [];
  for (const [nk, name] of Object.entries(names)) for (const w of Object.keys(W)) {
    const c = { business: { name } }, b = { id: 'b'.repeat(32), date: '2026-10-24', window: w, language: 'es' };
    const bodies = { confirmation: qaDesk.str('managed_confirmation', b)(c, b), reschedule: qaDesk.str('managed_confirmation', b)(c, { ...b, rescheduledAt: 'x' }), reminder_requested: qaDesk.str('managed_reminder', b)(c, b, true), reminder_owner: qaDesk.str('managed_reminder', b)(c, b, false), cancelled: qaDesk.str('managed_cancelled', b)(c, b) };
    for (const [t, body] of Object.entries(bodies)) { const s = segments(body); rows.push({ name: nk, window: w, text: t, ...s }); expect(`${nk} ${w} ${t}: GSM-7, <=2 segments`, () => assert.ok(s.encoding === 'GSM-7' && s.segments <= 2, JSON.stringify(s) + ' ' + body)); expect(`${nk} ${w} ${t}: no "12 de la tarde"/"de la tarde" at 8 pm`, () => assert.doesNotMatch(body, /m\.\.|12 de la tarde|\b(?:[7-9]|1[01]) de la tarde|\bam\b|\bpm\b|\bto\b/)); }
  }
  const worst = rows.reduce((m, r) => r.units > m.units ? r : m, rows[0]);
  note('r2 spanish window matrix', { managed: Object.fromEntries(Object.keys(W).map(w => [w, qaDesk.managedWinEs(w)])), legacy: Object.fromEntries(Object.keys(L).map(w => [w, qaDesk.winEs(w)])), worst, rows });
});
// ===== r2: bidi controls never reach the owner subject (QA-URG note 1) =====
await check('r2 owner subject strips bidi override and isolate characters', async () => {
  const subject = delivery.ownerRequestSubject({ id: 'a'.repeat(32), reason: 'emergency', urgency: 'emergency', issue: '\u202egas leak\u202c done \u2066x\u2069 \u200fy' }, 'leads');
  note('r2 bidi subject', { subject });
  assert.doesNotMatch(subject, /[\u200e\u200f\u202a-\u202e\u2066-\u2069\u0000-\u001f\u007f]/); assert.match(subject, /^EMERGENCY: gas leak done x y$/);
});
// ===== r2: owner-created visits text in the customer's known language =====
await softCheck('r2 owner-created visit uses the known customer language; unknown stays English', async () => {
  const f = await fixture('urgowner'); await qaPolicy(f); const es = '+17135550188', en = '+17135550189';
  const visits = await import('../netlify/functions/lib/owner-visits.mjs');
  const sessionHash = hash('owner-session-' + f.c.slug), session = { sessionHash, email: f.c.owner.email, scope: 'onboarding', status: 'active', expiresAt: new Date(clock + 6 * 3600000).toISOString() };
  await store.put('access_sessions', sessionHash, session);
  // The customer is known as Spanish from an earlier SMS request, and has replied SÍ to texts.
  useScript([{ tool: { name: 'notify_owner', input: { ...INPUT.price(es), customer_name: 'María López', issue: 'Precio de calentador', language: 'es' } } }, { text: 'Guardado.' }]); await text(f, 'Hola, cuánto cuesta un calentador?', es); endScript();
  await text(f, 'SÍ', es); await text(f, 'YES', en);
  // A third number was Spanish earlier but its newest request is English: the newest known language wins.
  const mixed = '+17135550190';
  useScript([{ tool: { name: 'notify_owner', input: { ...INPUT.price(mixed), language: 'es' } } }, { text: 'Guardado.' }]); await text(f, 'Hola', mixed); endScript(); clock += 3600000;
  useScript([{ tool: { name: 'notify_owner', input: { ...INPUT.price(mixed), language: 'en', issue: 'Second question' } } }, { text: 'Saved.' }]); await text(f, 'Hi again', mixed); endScript(); await text(f, 'YES', mixed);
  const current = await strictRead('clients', f.c.slug);
  const create = (phone, sub, date) => ({ action: 'create_visit', expectedRevision: configurationRevision(current), submissionId: hash(sub), customer_name: 'Owner Made', phone, address: '7 Oak St, Houston', issue: 'Water heater', date, window: '8 to 12' });
  const madeEs = await visits.changeOwnerVisit(current, session, create('(713) 555-0188', 'owner-es', '2026-10-24')); await touchSender(f); await qaWave();
  const madeEn = await visits.changeOwnerVisit(current, session, create('(713) 555-0189', 'owner-en', '2026-10-27')); await touchSender(f); await qaWave();
  const madeMixed = await visits.changeOwnerVisit(current, session, create('(713) 555-0190', 'owner-mixed', '2026-10-28')); await touchSender(f); await qaWave();
  const savedEs = await strictRead('bookings', `${f.c.slug}/${madeEs.visit.id}`), savedEn = await strictRead('bookings', `${f.c.slug}/${madeEn.visit.id}`);
  const confFor = async id => (await deliveries(f)).find(d => d.purpose === 'confirmation' && d.source?.id === id);
  const cEs = await confFor(savedEs.id), cEn = await confFor(savedEn.id);
  const moved = await visits.changeOwnerVisit(current, session, { action: 'reschedule_visit', expectedRevision: configurationRevision(current), expectedVisitRevision: madeEs.visit.revision, visitId: madeEs.visit.id, submissionId: hash('owner-es-move'), date: '2026-10-26', window: '12 to 5' }); await touchSender(f); await qaWave();
  const rows = (await deliveries(f)).filter(d => d.purpose === 'confirmation' && d.source?.id === savedEs.id).map(d => d.body);
  note('r2 owner-created visit language', { esLanguage: savedEs.language, enLanguage: savedEn.language ?? null, esConfirmation: cEs?.body, enConfirmation: cEn?.body, esAfterMove: rows, movedComplete: moved.complete, esSegments: cEs && segments(cEs.body) });
  expect('known Spanish customer: booking stores language es', () => assert.equal(savedEs.language, 'es'));
  const savedMixed = await strictRead('bookings', `${f.c.slug}/${madeMixed.visit.id}`);
  expect('newest known language wins (es earlier, en latest)', () => assert.equal(savedMixed.language, 'en'));
  expect('unknown customer: booking stores no language (English)', () => assert.equal(savedEn.language, undefined));
  expect('owner-created Spanish confirmation says "queda guardada", not "ahora es"', () => assert.match(cEs?.body || '', /su visita queda guardada para el 24 de octubre, de 8 a\. m\. a 12 p\. m\./));
  expect('owner-created Spanish confirmation is GSM-7, <=2 segments', () => { const s = segments(cEs?.body); assert.ok(s.encoding === 'GSM-7' && s.segments <= 2, JSON.stringify(s)); });
  expect('unknown customer confirmation stays English byte-identical', () => assert.equal(cEn?.body, `Fixture Service: visit ${savedEn.id} is saved for 2026-10-27, 8 to 12. The shop confirms arrival details directly. Reply STOP to end texts.`));
  expect('owner reschedule of that visit says "ahora es"', () => assert.ok(rows.some(b => /su visita ahora es el 26 de octubre, de 12 p\. m\. a 5 p\. m\./.test(b)), JSON.stringify(rows)));
});
report.obs = obs; report.sentEmails = sentEmails.length;
report.passed = report.checks.filter(r=>r.pass).length; report.total = report.checks.length;
writeFileSync(process.env.URG_OUT, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ passed: report.passed, total: report.total, blocked: report.blocked.length, fails: report.checks.filter(c=>!c.pass).map(c=>({name:c.name,error:c.error?.slice(0,300)})) }, null, 1));
process.exit(report.passed === report.total && report.blocked.length === 0 ? 0 : 1);
