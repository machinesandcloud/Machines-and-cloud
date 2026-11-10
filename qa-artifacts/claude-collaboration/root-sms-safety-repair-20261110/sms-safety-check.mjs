// Proposal 3 acceptance check: the SMS "planning line" trim never drops life-safety text.
// Runs the real netlify/functions/sms-agent-background.mjs handler in-process for every case. The only seam
// is the model: a loader hook points lib/agent.mjs's "./fake-model.mjs" import at a scripted stub that
// returns the case's reply as one end_turn message (MC_FAKE_MODEL=1 path, no network, no provider env).
// The text actually handed to sendSMS (the "[sms:disabled] ... :: body" log line) and the stored
// assistant turn are both compared with the expectation. Revision 2 counts two numbers:
//   safetyDropped:  a "keep" reply (customer instruction first) was not sent whole;
//   planningLeaked: a "trim" reply still starts with its planning note(s). A trim case lists how many leading
//                   sentences are planning (QA's "Have name, address. Next ask window." has two).
// Trim cases carry a class: "note" (internal checklist, tool name, status: must never reach a customer) or
// "narration" (a harmless first-person line such as "Got everything."). Both are counted and reported.
// Cases: my 40 (revision 1), QA2's 39 (qa2/qa2-sms-trim-probe.mjs) and QA3's 29 (qa3/qa3-sms-trim-probe.mjs), verbatim.
// QA3 rows are required keep cases, except 5 that start with a genuine checklist note (the note is dropped, the safety
// text after it must be sent unchanged) and "Call 911; notify_owner done.", which must arrive as "Call 911. ...".
// Usage: node sms-trim-safety-check.mjs [--repo <repo root>] [--output <new json path>]
// "labelNote" (rev 3): "Got address, gas furnace." and "Have issue: water heater leaking outside." are internal notes that
// now reach the customer, because the rules that caught them also swallowed safety text (QA3); counted, accepted.
// PASS requires safetyDropped === 0 and noteLeaked === 0. Expected: FAILS on dfb0ae78, PASSES with 03 rev 2.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { existsSync, writeFileSync } from "node:fs";
import { register, syncBuiltinESMExports } from "node:module";
import net from "node:net"; import http from "node:http"; import https from "node:https";

const arg = (name) => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const repo = resolve(arg("--repo") || resolve(import.meta.dirname, "../../.."));
const output = arg("--output");
if (output && existsSync(output)) throw new Error("Choose a new output path: " + output);
const deny = () => { throw new Error("sms-trim-safety-check denies real networking"); };
net.connect = net.createConnection = http.request = http.get = https.request = https.get = deny; syncBuiltinESMExports();
let netAttempts = 0; globalThis.fetch = async () => { netAttempts++; deny(); };
for (const key of Object.keys(process.env)) if (/^(ANTHROPIC|TWILIO|VAPI|RESEND|GOOGLE|STRIPE|CALENDAR_|MANAGED_|PHONE_|SERVICE_|MC_TWILIO|MC_MESSAGING|STEVE_|ADMIN_KEY|DEPLOY_)/.test(key)) delete process.env[key];
Object.assign(process.env, { MC_MEMORY_STORE: "1", MC_FAKE_MODEL: "1", NODE_ENV: "test", ADMIN_KEY: "trim-check-admin", URL: "https://platform.example.test" });

// Scripted model: each runAgent call takes the next queued reply.
// Model I/O only is substituted; the actual runAgent and SMS handler remain unchanged.
const stub = `export function fakeClient() {
 const stream = () => {
  const next = (globalThis.__trimScript || []).shift() ?? {text:"OK.",stop:"end_turn"};
  const item = typeof next === "string" ? {text:next,stop:globalThis.__trimStop||"end_turn"} : next;
  const t=item.text||"", final={stop_reason:item.stop||"end_turn",content:[{type:"text",text:t},...(item.tools||[])],usage:{input_tokens:1,output_tokens:1}};
  return {async *[Symbol.asyncIterator](){yield {type:"content_block_delta",delta:{type:"text_delta",text:t}};},finalMessage:async()=>final};
 };
 return {messages:{stream,create:async()=>{throw new Error("not scripted");}},beta:{messages:{stream,create:async()=>{throw new Error("not scripted");}}}};
}`;
const stubURL = "data:text/javascript," + encodeURIComponent(stub);
register("data:text/javascript," + encodeURIComponent(`export async function resolve(s, ctx, next) {
  if (s === "./fake-model.mjs" && ctx.parentURL?.endsWith("/netlify/functions/lib/agent.mjs")) return { url: ${JSON.stringify(stubURL)}, shortCircuit: true };
  return next(s, ctx); }`));

const sent = []; const origLog = console.log, origErr = console.error;
console.log = (...a) => { const s = a.map(String).join(" "); const m = s.match(/^\[sms:disabled\] to=(\S+) from=\S+ :: ([\s\S]*)$/); if (m) sent.push({ to: m[1], body: m[2] }); };
console.error = (...a) => origErr("[handler error]", ...a.map((x) => x instanceof Error ? x.message : x));

const F = (p) => pathToFileURL(resolve(repo, "netlify/functions", p)).href;
const store = await import(F("lib/store.mjs"));
const cfg = await import(F("lib/config.mjs"));
const smsAgent = (await import(F("sms-agent-background.mjs"))).default;

function legacyClient(slug, script) {
  const c = cfg.newClient({ slug, ownerKey: "owner-" + slug, owner: { name: "Ray", email: "", phone: "" }, business: { name: "Bayou Air", trade: "HVAC", hours: "Mon-Sat 7am-7pm" } });
  Object.assign(c, { status: "live", services: ["AC repair"], windows: ["8 to 12", "12 to 5"] });
  if (script !== undefined) c.rules.emergencies = { ...cfg.normalizeEmergencies(null, "HVAC"), script };
  return c;
}
const OWNER_A = "Now walk away from the house and phone Atmos at 888-286-6700. We will follow up once you are safe.";
const OWNER_B = "Call Atmos at 888-286-6700 and stay off the property. We will follow up.";
const clients = { default: legacyClient("trim-default"), ownerA: legacyClient("trim-owner-a", OWNER_A), ownerB: legacyClient("trim-owner-b", OWNER_B) };
for (const c of Object.values(clients)) await store.saveClient(c);



const {createHash}=await import('node:crypto');
const {readFileSync}=await import('node:fs');
const hashes=()=>Object.fromEntries(['netlify/functions/sms-agent-background.mjs','netlify/functions/lib/agent.mjs'].map(p=>[p,createHash('sha256').update(readFileSync(resolve(repo,p))).digest('hex')]));
const before=hashes();
const cases=[
 {id:'semicolon_safety',text:'Call 911; notify_owner done. Ray has your request.',want:'Call 911. Ray has your request.'},
 {id:'comma_safety',text:'Call 911, notify_owner done. Ray has your request.',want:'Call 911. Ray has your request.'},
 {id:'conjunction_safety',text:'Leave the house now and notify_owner done. Ray has your request.',want:'Leave the house now. Ray has your request.'},
 {id:'property_owner_safety',text:'Now notify owner of the building and leave the unit. Ray has your request.'},
 {id:'property_owner_original_suite_correction',text:'Then notify owner of the property right away. Get outside first. What is the address?'},
 {id:'tool_name_inside_instruction',text:'Leave now even if notify_owner is not working. Ray has your request.'},
 {id:'unknown_clause_preserved',text:'Leave the house now, notify_owner might not work. Ray has your request.'},
 {id:'ordinary_safety',text:'Please leave the house and call 911 from outside. Ray has your request.'},
 {id:'spanish_safety',text:'Salga de la casa, notify_owner done. Ray tiene su solicitud.',want:'Salga de la casa. Ray tiene su solicitud.'},
 {id:'planning_tool_prefix',text:'Now call book_visit. You are booked for tomorrow.',want:'You are booked for tomorrow.'},
 {id:'planning_tool_urgency',text:'Call notify_owner with urgency emergency. Please leave the house now.',want:'Please leave the house now.'},
 {id:'planning_checklist',text:'Have name, address, issue, window. Please leave the house now.',want:'Please leave the house now.'},
 {id:'planning_double_prefix',text:'Have phone. Calling bookVisit next. Please leave the house now.',want:'Please leave the house now.'},
 {id:'short_safety_after_checklist',text:'Have phone. Run!',want:'Run!'},
 {id:'single_exact_tool_note',text:'Now call book_visit.',want:'Sorry, could you say that again?'},
 {id:'max_tokens_internal',text:'Need to invoke notify_owner for emergency',stop:'max_tokens',want:'Sorry, could you say that again?'},
 {id:'refusal_internal',text:'Need to invoke notify_owner for emergency',stop:'refusal',want:"I can't help with that one. Anything else, ask away."},
 {id:'actual_tool_loop',script:[{text:'Now call get_availability before answering.',stop:'tool_use',tools:[{type:'tool_use',id:'tool_fixture',name:'get_availability',input:{date:'tomorrow'}}]},{text:'Please leave the house and call 911 from outside.',stop:'end_turn'}],want:'Please leave the house and call 911 from outside.'}
];
const results=[];
for(const [n,t] of cases.entries()){
 const c=clients.default,from='+1713555'+String(8000+n),cv=await store.getConversation(c,'sms',from);
 cv.messages.push({role:'user',content:'I smell gas. What should I do?',at:new Date().toISOString()});await store.saveConversation(cv);
 globalThis.__trimScript=t.script||[{text:t.text,stop:t.stop||'end_turn'}];sent.length=0;
 const res=await smsAgent(new Request('https://platform.example.test/.netlify/functions/sms-agent-background',{method:'POST',headers:{'x-admin-key':'trim-check-admin'},body:JSON.stringify({slug:c.slug,from})}));
 const delivered=sent.find(s=>s.to===from)?.body??null,want=t.want??t.text;
 const stored=(await store.getConversation(c,'sms',from)).messages.at(-1)?.content;
 results.push({id:t.id,input:t.text||t.script,status:res.status,want,delivered,stored,remainingModelSteps:globalThis.__trimScript.length,pass:res.status===200&&delivered===want&&stored===want&&globalThis.__trimScript.length===0});
}
const {runAgent}=await import(F('lib/agent.mjs'));
const agent=[];
for(const opts of [{dropToolPreamble:true},{withholdToolText:true}])for(const stop of ['end_turn','max_tokens','refusal']){
 const text='Internal planning CANARY before a possible tool',pieces=[];
 globalThis.__trimScript=[{text,stop}];
 const out=await runAgent({system:'Fixture',tools:[],messages:[{role:'user',content:'Fixture'}],execTool:async()=>({content:'unused'}),maxTokens:1200,onText:t=>pieces.push(t),...opts});
 const want=stop==='end_turn'?text:stop==='refusal'?"I can't help with that one. Anything else, ask away.":'Sorry, could you say that again?';
 agent.push({opts,stop,reply:out.reply,streamed:pieces.join(''),want,pass:out.reply===want&&pieces.join('')===want});
}
console.log=origLog;
const after=hashes(),report={repo,sourceBefore:before,sourceAfter:after,sourceStable:JSON.stringify(before)===JSON.stringify(after),sms:results,agent,physicalNetwork:netAttempts};
report.pass=report.sourceStable&&netAttempts===0&&results.every(r=>r.pass)&&agent.every(r=>r.pass);
writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pass:report.pass,smsPassed:results.filter(r=>r.pass).length,smsTotal:results.length,agentPassed:agent.filter(r=>r.pass).length,agentTotal:agent.length,physicalNetwork:netAttempts,sourceStable:report.sourceStable,failures:[...results,...agent].filter(r=>!r.pass)}));
process.exitCode=report.pass?0:1;
