// M&C's own inbound product questions. Dedicated customer-shop numbers use managed-sms.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { atomicUpdate } from './store.mjs';
import { strictRead } from './accounts.mjs';

export const PLATFORM_SMS_WEBHOOK_URL = 'https://machinesandcloud.com/api/platform-sms';
export const PLATFORM_SMS_KEYWORDS = Object.freeze({
  stop: Object.freeze(['STOP','STOPALL','UNSUBSCRIBE','CANCEL','END','QUIT','REVOKE','OPTOUT','ALTO','PARAR']),
  start: Object.freeze(['START','UNSTOP','EMPEZAR']), help: Object.freeze(['HELP','INFO','AYUDA'])
});
const STORE = 'platform_sms_messages', RECEIPTS = 'platform_sms_receipts', KEY = 'inbound_v1', CAPACITY = 500;
const phone = value => /^\+1[2-9]\d{9}$/.test(value || '');
const hash = value => createHash('sha256').update(value).digest('hex');
const now = () => new Date().toISOString();
const xml = text => String(text || '').replace(/[&<>"']/g, value => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[value]));
const twiml = text => new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${text ? `<Message>${xml(text)}</Message>` : ''}</Response>`, {headers:{'Content-Type':'text/xml; charset=utf-8','Cache-Control':'no-store'}});
function settings() {
  const account = process.env.TWILIO_ACCOUNT_SID || '', secret = process.env.TWILIO_AUTH_TOKEN || '', number = process.env.MC_TWILIO_NUMBER || '', service = process.env.MC_MESSAGING_SERVICE_SID || '';
  const configured = /^AC[a-f0-9]{32}$/i.test(account) && secret.length >= 16 && phone(number) && /^MG[a-f0-9]{32}$/i.test(service);
  return {account,secret,number,service,configured,enabled:configured && process.env.MC_PLATFORM_SMS_ENABLED === 'true'};
}
function redact(value) {
  let text = String(value || '').slice(0,1600);
  for (const [name,secret] of Object.entries(process.env)) if (/(?:TOKEN|SECRET|API_KEY|ENCRYPTION_KEY|WORKER_KEY)$/.test(name) && secret.length >= 8) text = text.split(secret).join('[private value removed]');
  return text.replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi,'[authorization removed]')
    .replace(/\b(?:AC|SK|MG|PN|BN|BU|QE|SM|IT|RD|AD|EL|BV)[a-f0-9]{32}\b/gi,'[provider reference removed]')
    .replace(/\b(?:sk-ant-|sk-|re_)[A-Za-z0-9_-]{8,}\b/g,'[API key removed]')
    .replace(/\b(?:EIN|tax\s*(?:ID|number))\s*[:#-]?\s*\d{2}-?\d{7}\b/gi,'EIN [removed]')
    .replace(/\b\d{2}-\d{7}\b/g,'[tax identifier removed]')
    .replace(/\b(?:cookie|set-cookie|authorization|x-api-key)\s*:\s*[^\r\n]*/gi,'[private header removed]')
    .replace(/\b(?:password|passcode|verification code|sign.?in code|session token)(?:\s*[:=]\s*|\s+(?:is\s+)?)\S+/gi,'[private sign-in value removed]')
    .replace(/\b[a-f0-9]{64}\b/gi,'[private reference removed]')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').slice(0,1600);
}
function keyword(body, type) {
  const word = body.trim().toUpperCase();
  if (PLATFORM_SMS_KEYWORDS.stop.includes(word) || type === 'STOP') return 'stop';
  if (PLATFORM_SMS_KEYWORDS.start.includes(word) || type === 'START') return 'start';
  if (PLATFORM_SMS_KEYWORDS.help.includes(word) || type === 'HELP') return 'help';
  return 'question';
}
function guidance(body, kind) {
  if (kind === 'stop') return 'Machines & Cloud: texts stopped. Reply START or EMPEZAR to remove the block.';
  if (kind === 'start') return 'Machines & Cloud: your texting block is removed. We only reply to messages you send; no recurring texts. Reply HELP for help or STOP to stop.';
  if (kind === 'help') return 'Machines & Cloud: account help at https://machinesandcloud.com/desk. Setup guidance at https://machinesandcloud.com/onboard. Reply STOP, ALTO or PARAR to stop texts.';
  if (/\b(price|prices|pricing|cost|plans?|precio|precios|cuesta)\b/i.test(body)) return 'Machines & Cloud: you asked about plan pricing. Current plan details are at https://machinesandcloud.com/#plans. Reply STOP to stop texts.';
  if (/\b(log\s?in|sign\s?in|password|account|cuenta|acceso|sesion|sesión)\b/i.test(body)) return 'Machines & Cloud: sign in securely at https://machinesandcloud.com/desk. Request a fresh email link there. Never text a password or sign-in code. Reply STOP to stop texts.';
  if (/\b(set\s?up|onboard\w*|register|start|signup|sign\s?up|empezar|configurar|registro)\b/i.test(body)) return 'Machines & Cloud: continue your workspace setup at https://machinesandcloud.com/onboard using your setup email. Reply STOP to stop texts.';
  return 'Machines & Cloud: this line provides account and setup guidance. For secure account access, visit https://machinesandcloud.com/desk. Reply STOP to stop texts.';
}
async function verifyRequest(req, config) {
  if (req.method !== 'POST' || req.url !== PLATFORM_SMS_WEBHOOK_URL || !/^application\/x-www-form-urlencoded(?:\s*;\s*charset=utf-8)?$/i.test(req.headers.get('content-type') || '')) return null;
  if (Number(req.headers.get('content-length')) > 8192) return null;
  const raw = await req.text(); if (Buffer.byteLength(raw) > 8192) return null;
  const form = new URLSearchParams(raw), keys = [...form.keys()];
  if (!keys.length || keys.length > 80 || keys.some(key => form.getAll(key).length !== 1 || key.length > 80)) return null;
  const fields = Object.fromEntries(form), signature = req.headers.get('x-twilio-signature') || '';
  if (fields.AccountSid !== config.account || fields.To !== config.number || fields.MessagingServiceSid !== config.service || !phone(fields.From) || fields.From === config.number || !/^SM[a-f0-9]{32}$/i.test(fields.MessageSid || '') || typeof fields.Body !== 'string' || fields.Body.length > 1600 || fields.NumMedia && fields.NumMedia !== '0' || fields.OptOutType && !['STOP','START','HELP'].includes(fields.OptOutType)) return null;
  const expected = createHmac('sha1',config.secret).update(PLATFORM_SMS_WEBHOOK_URL + keys.sort().map(key => key + fields[key]).join('')).digest('base64');
  if (Buffer.byteLength(expected) !== Buffer.byteLength(signature) || !timingSafeEqual(Buffer.from(expected),Buffer.from(signature))) return null;
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.account}/Messages/${fields.MessageSid}.json`,{method:'GET',headers:{Authorization:'Basic '+Buffer.from(`${config.account}:${config.secret}`).toString('base64')},signal:AbortSignal.timeout(5000),redirect:'error'});
  if (!response.ok) throw new Error('Inbound message verification unavailable');
  const receipt = await response.json(), at = Date.parse(receipt.date_created);
  if (receipt.sid !== fields.MessageSid || receipt.account_sid !== config.account || receipt.messaging_service_sid !== config.service || receipt.direction !== 'inbound' || receipt.from !== fields.From || receipt.to !== fields.To || receipt.body !== fields.Body || !Number.isFinite(at) || at < Date.now()-86400000 || at > Date.now()+300000) return null;
  return {fields,at};
}
export async function handlePlatformSMS(req) {
  try {
    const config = settings(); if (!config.configured) return new Response('Unavailable',{status:503});
    const verified = await verifyRequest(req,config); if (!verified) return new Response('Forbidden',{status:403});
    const latest = settings(); if (!latest.configured || ['account','secret','number','service'].some(key=>latest[key]!==config[key])) return new Response('Unavailable',{status:503});
    const {fields,at} = verified, binding = hash(JSON.stringify([config.account,config.service,config.number])), contact = `${binding}/${fields.From}`, kind = keyword(fields.Body,fields.OptOutType);
    const digest = hash(JSON.stringify([binding,fields.MessageSid,fields.From,fields.To,fields.Body,fields.OptOutType || null,at]));
    const source = {binding,contact:fields.From,body:redact(fields.Body),keyword:kind,providerAt:new Date(at).toISOString(),receivedAt:now(),digest,reply:'',state:'receipt_saved_reply_unknown',reason:'reply_not_confirmed',replyDelivery:'unknown'};
    // This permanent primary receipt is also the one-shot response fence. Even after
    // automatic recent-history rollover, a prior SID can never earn another reply.
    const first = await atomicUpdate(RECEIPTS,fields.MessageSid,previous => {
      if (previous) return {result:{duplicate:true,mismatch:previous.digest!==digest,entry:previous}};
      return {value:source,result:{duplicate:false,entry:source}};
    });
    if (first.mismatch) return new Response('Receipt mismatch',{status:409});
    const result = await atomicUpdate(STORE,KEY,previous => {
      const ledger = previous || {version:1,entries:{},directives:{},replyBudget:{day:'',used:0},received:0};
      if (ledger.version !== 1 || !ledger.entries || !ledger.directives) throw new Error('SMS ledger unavailable');
      if (at < Date.now()-86400000 || at > Date.now()+300000) return {result:{expired:true}};
      let directive = ledger.directives[contact] || {suppressed:false,at:0}, applied = true, alreadyStopped = directive.suppressed;
      if (['stop','start'].includes(kind)) {
        applied = at > directive.at || kind === 'stop' && at === directive.at;
        if (applied) directive = {suppressed:kind === 'stop',at,keyword:kind};
      }
      const day = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      const budget = ledger.replyBudget?.day === day ? {...ledger.replyBudget} : {day,used:0};
      const providerHandled = !!fields.OptOutType, enabled = settings().enabled;
      let reply = '', reason = 'gate_closed';
      if (first.duplicate) reason = first.entry.reason;
      else if (!applied) reason = 'older_directive';
      else if (providerHandled) reason = 'provider_keyword_handling';
      else if (kind === 'stop' && alreadyStopped) reason = 'already_suppressed';
      else if (budget.used >= CAPACITY) reason = 'reply_budget_reached';
      else if (kind === 'stop') { reply = guidance(fields.Body,kind); reason = 'reply_prepared'; }
      else if (!enabled) reason = 'gate_closed';
      else if (directive.suppressed) reason = 'suppressed';
      else if (!fields.Body.trim()) reason = 'empty_message';
      else { reply = guidance(fields.Body,kind); reason = 'reply_prepared'; }
      const entry = first.duplicate ? ledger.entries[fields.MessageSid] || first.entry : {...source,reply,state:reply?'reply_delivery_unknown':'reply_withheld',reason,replyDelivery:reply?'unknown':'not_requested'};
      if (reply) budget.used++;
      const entries = Object.fromEntries(Object.entries({...ledger.entries,[fields.MessageSid]:entry}).sort((a,b)=>b[1].receivedAt.localeCompare(a[1].receivedAt) || a[0].localeCompare(b[0])).slice(0,CAPACITY));
      return {value:{...ledger,entries,directives:{...ledger.directives,[contact]:directive},replyBudget:budget,received:(ledger.received || 0)+(first.duplicate?0:1),updatedAt:now()},result:{reply,entry}};
    });
    if (result.expired) return new Response('Expired receipt',{status:403});
    await atomicUpdate(RECEIPTS,fields.MessageSid,entry=>{
      if (entry?.digest!==digest) throw new Error('Receipt changed');
      if (entry.state!=='receipt_saved_reply_unknown' || result.entry.state==='receipt_saved_reply_unknown') return {};
      return {value:{...result.entry}};
    });
    await atomicUpdate('health','platformSMS:lastRun',()=>({value:{ok:true,at:now()}}));
    // A first response can be lost after the durable fence commits. Replaying it could
    // charge/send twice, so a duplicate is empty and the original remains delivery-unknown.
    return twiml(first.duplicate || kind !== 'stop' && !settings().enabled ? '' : result.reply);
  } catch {
    try { await atomicUpdate('health','platformSMS:lastRun',()=>({value:{ok:false,at:now(),reasonCode:'platform_sms_processing_failed'}})); } catch { /* The caller still receives a failed request. */ }
    return new Response('Message handling unavailable',{status:503});
  }
}
export async function platformSMSView({limit=60}={}) {
  if (!Number.isInteger(limit) || limit<1 || limit>100) throw new Error('Choose a bounded history view');
  const ledger = await strictRead(STORE,KEY), entries = Object.values(ledger?.entries || {});
  const day = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()), used = ledger?.replyBudget?.day===day ? ledger.replyBudget.used : 0;
  return {enabled:settings().enabled,capacity:CAPACITY,total:entries.length,replyBudget:{used,limit:CAPACITY},scope:`Latest ${Math.min(limit,entries.length)} platform texts; at most ${CAPACITY} recent texts shown, older receipts archived`,atCapacity:used>=CAPACITY,rows:entries.sort((a,b)=>b.receivedAt.localeCompare(a.receivedAt)).slice(0,limit).map(entry=>({contact:entry.contact,body:redact(entry.body),keyword:entry.keyword,at:entry.providerAt,receivedAt:entry.receivedAt,state:entry.state,reason:entry.reason,reply:redact(entry.reply),replyDelivery:entry.replyDelivery,suppressed:ledger.directives[`${entry.binding}/${entry.contact}`]?.suppressed===true}))};
}
export async function platformSMSHealth() {
  const view = await platformSMSView({limit:100}), last = await strictRead('health','platformSMS:lastRun');
  return {ok:!view.atCapacity && last?.ok!==false,enabled:view.enabled,at:last?.at || null,total:view.total,inspected:view.rows.length,replyBudget:view.replyBudget,atCapacity:view.atCapacity,unverifiedReplies:view.rows.filter(row=>row.replyDelivery==='unknown').length,reasonCode:view.atCapacity?'platform_sms_reply_budget_reached':last?.ok===false?'platform_sms_processing_failed':null};
}
