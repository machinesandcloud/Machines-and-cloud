// Explicit continuation under the ORIGINAL aggregate approval. Parent files remain closed/immutable.
// The first schema-rejected attempt still consumes one logical turn and one HTTP attempt.
// --plan is network-free. --fixture exercises the harness without a provider.
// --run requires separate explicit user approval; closed ledgers cannot be resumed or replaced.
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { modelTransport } from './lib/sales-eval-transport.mjs';
const CASES = [
 ['S1', ['Two-truck HVAC shop in Katy. Our diagnostic is $89. I miss calls on installs. What would you actually do for us?', "Write the first reply. Don't ask for my email."]],
 ['S2', ['We miss 30 calls a week.', "Correction: three a month, not 30 a week. I don't want another subscription."]],
 ['S3', ['18 calls a day, three minutes each, 22 days a month. Which plan?', 'Only a quarter would go to AI.']],
 ['S4', ['We use Jobber. Can you sync its busy time and dispatch three crews?', 'That is a requirement, not optional.']],
 ['S5', ['Can you answer my phone tonight? What do I pay and when?', 'So am I billed on day eight?']],
 ['S6', ['Soy Mario. Tengo una plomería en Katy. Solo quiero solicitudes de devolución de llamada, no visitas confirmadas. Escribe el saludo.', 'Me llamo María, no Mario. Ahora dame el resumen para mi socio en inglés.']],
 ['S7', ['AI makes my customers angry. I already have a receptionist.', 'Stop selling. Just give me a way to find the bottleneck.']],
 ['S8-compact', ['Can I hear it? Does Spanish work on the phone? Can you transfer me to someone now?']],
 ['S9', ['Here is my email, demo@example.test. Send this to your team.', "Actually don't contact me. Just give me the rules to copy."]],
];
const SOURCES = ['agent-widget.js','stories.js','styles.css','netlify/functions/chat.mjs','netlify/functions/lib/agent.mjs','netlify/functions/lib/sales-desk.mjs','netlify/functions/lib/sales-budget.mjs','netlify/functions/lib/config.mjs','package-lock.json','scripts/sales-desk-eval.mjs','scripts/lib/sales-eval-transport.mjs','scripts/sales-desk-eval-continuation.mjs'];
const hashes = () => Object.fromEntries(SOURCES.map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]));
const PHASE = 'sales-desk-phase1-2026-10-22';
const SEGMENT = 'schema-repair-continuation-1';
const parentLedgerPath = 'scratchpad/sales-desk-model-phase1-ledger.json';
const parentResultPath = 'scratchpad/sales-desk-model-phase1.json';
const parentBytes = readFileSync(parentLedgerPath), parent = JSON.parse(parentBytes);
const parentResultBytes = readFileSync(parentResultPath), parentResult = JSON.parse(parentResultBytes);
const parentHash = createHash('sha256').update(parentBytes).digest('hex');
const parentResultHash = createHash('sha256').update(parentResultBytes).digest('hex');
assert.equal(parent.phase, PHASE); assert.equal(parent.mode, 'run'); assert.equal(parent.status, 'closed');
assert.equal(parent.logicalTurns, 1); assert.equal(parent.attempts.length, 1); assert.equal(parent.attempts[0].statusCode, 400);
assert.equal(parentResult.status, 'incomplete'); assert.equal(parentResult.realModelRequests, 1);
assert.equal(parent.logicalTurnLimit, 18); assert.equal(parent.actualHTTPAttemptLimit, 30); assert.equal(parent.timeLimitMinutes, 20);
const deadline = Date.parse(parent.startedAt) + 20 * 60000;
function verifyParent() {
 assert.equal(createHash('sha256').update(readFileSync(parentLedgerPath)).digest('hex'), parentHash, 'Parent ledger changed');
 assert.equal(createHash('sha256').update(readFileSync(parentResultPath)).digest('hex'), parentResultHash, 'Parent result changed');
 if (Date.now() >= deadline) throw new Error('Original aggregate twenty-minute deadline reached');
}
verifyParent();
const plan = { phase: PHASE, segment: SEGMENT, parent: { ledgerPath: parentLedgerPath, ledgerHash: parentHash, resultPath: parentResultPath, resultHash: parentResultHash, logicalTurns: parent.logicalTurns, actualHTTPAttempts: parent.attempts.length, startedAt: parent.startedAt }, deadline: new Date(deadline).toISOString(), aggregateLogicalTurnLimit: 18, aggregateActualHTTPAttemptLimit: 30, logicalTurnLimit: 17, actualHTTPAttemptLimit: 29, maxTokensPerAttempt: 3072, maxModelIterationsPerTurn: 3, automaticSDKRetries: 0, timeLimitMinutes: 20, model: 'claude-opus-5-5', effort: 'medium', freshLedgerRequired: true, target: 'actual local sales handler with memory store; only Anthropic Messages HTTPS allowed', forbidden: ['email','forms','voice','SMS','Calendar','customer writes','publication','purchases'], cases: CASES.map(([id, turns]) => ({ id, turns })), source: hashes(), assessment: 'PO manually scores actual complete threads; fixtures and keyword checks cannot establish naturalness or semantic quality.' };
const mode = process.argv.includes('--run') ? 'run' : process.argv.includes('--fixture') ? 'fixture' : 'plan';
if (mode === 'plan') { console.log(JSON.stringify(plan, null, 2)); process.exit(0); }
if (mode === 'run' && process.argv[process.argv.indexOf('--approval') + 1] !== PHASE) throw new Error('Missing explicit approved phase identifier; no provider request made');
const ledgerPath = `scratchpad/sales-desk-model-phase1-continuation-1${mode === 'fixture' ? '-fixture' : ''}-ledger.json`;
const outputPath = `scratchpad/sales-desk-model-phase1-continuation-1${mode === 'fixture' ? '-fixture' : ''}.json`;
if (existsSync(ledgerPath) || existsSync(outputPath)) throw new Error('This phase already exists. Do not reopen, overwrite or silently create a replacement phase.');
if (mode === 'run') {
 const frozenPath = 'scratchpad/sales-desk-model-phase1-continuation-1-plan.json';
 if (!existsSync(frozenPath)) throw new Error('Freeze and review the concrete phase plan before approval');
 const frozen = JSON.parse(readFileSync(frozenPath));
 if (JSON.stringify(frozen) !== JSON.stringify(plan)) throw new Error('Approved phase source/plan has changed; new review required');
}
for (const key of Object.keys(process.env)) if (/^(TWILIO_|VAPI_|RESEND_|GOOGLE_|STRIPE_)/.test(key)) delete process.env[key];
process.env.MC_MEMORY_STORE = '1'; process.env.MC_FAKE_MODEL = '0'; process.env.URL = 'http://127.0.0.1:8888';
process.env.MC_SALES_AI_GLOBAL_DAILY_LIMIT = '50'; process.env.MC_SALES_AI_IP_DAILY_LIMIT = '20';
process.env.ANTHROPIC_BASE_URL = mode === 'fixture' ? 'https://sales-eval-fixture.invalid' : 'https://api.anthropic.com';
if (mode === 'fixture') process.env.ANTHROPIC_API_KEY = 'offline-fixture';
else if (!process.env.ANTHROPIC_API_KEY && existsSync('.env')) {
 const line = readFileSync('.env','utf8').split('\n').find(line => /^\s*ANTHROPIC_API_KEY=/.test(line));
 if (line) process.env.ANTHROPIC_API_KEY = line.slice(line.indexOf('=')+1).trim().replace(/^["']|["']$/g,'');
}
if (!process.env.ANTHROPIC_API_KEY) throw new Error('No Anthropic key; no request made');
const started = Date.now(), ledger = { ...plan, mode, startedAt: new Date(started).toISOString(), status: 'active', logicalTurns: 0, attempts: [], blocked: [] };
writeFileSync(ledgerPath, JSON.stringify(ledger,null,2)+'\n', {flag:'wx'});
const save = () => { const temp=ledgerPath+'.tmp'; writeFileSync(temp,JSON.stringify(ledger,null,2)+'\n'); renameSync(temp,ledgerPath); };
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
 const url = new URL(String(typeof input === 'string' || input instanceof URL ? input : input.url));
 const allowedOrigin = mode === 'fixture' ? 'https://sales-eval-fixture.invalid' : 'https://api.anthropic.com';
 if (url.origin !== allowedOrigin || url.pathname !== '/v1/messages' || init.method !== 'POST') { ledger.blocked.push({ origin:url.origin,path:url.pathname,method:init.method });save();throw new Error('Evaluation blocked non-model traffic'); }
 verifyParent();
 if (ledger.status !== 'active' || parent.attempts.length + ledger.attempts.length >= plan.aggregateActualHTTPAttemptLimit || parent.logicalTurns + ledger.logicalTurns > plan.aggregateLogicalTurnLimit) throw new Error('Aggregate evaluation limit reached');
 const body=JSON.parse(init.body);
 assert.equal(body.model,plan.model);assert.equal(body.max_tokens,plan.maxTokensPerAttempt);assert.equal(body.output_config.effort,plan.effort);
 const row={number:ledger.attempts.length+1,aggregateNumber:parent.attempts.length+ledger.attempts.length+1,at:new Date().toISOString(),status:'reserved-before-request',model:body.model,maxTokens:body.max_tokens,case:ledger.currentCase};
 ledger.attempts.push(row);save(); // An ambiguous failed attempt remains consumed.
 try {
  let response;
  if(mode==='fixture') {
   const text='OFFLINE HARNESS FIXTURE: not an actual model answer.';
   const events=[{type:'message_start',message:{id:'fixture-'+row.number,type:'message',role:'assistant',content:[],model:body.model,stop_reason:null,stop_sequence:null,usage:{input_tokens:10,output_tokens:0}}},{type:'content_block_start',index:0,content_block:{type:'text',text:''}},{type:'content_block_delta',index:0,delta:{type:'text_delta',text}},{type:'content_block_stop',index:0},{type:'message_delta',delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:10}},{type:'message_stop'}];
   response=new Response(events.map(e=>`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''),{headers:{'content-type':'text/event-stream'}});
  } else response=await modelTransport(realFetch,input,init);
  row.statusCode=response.status;row.status='response-received';save();return response;
 } catch(error) { row.status='failed-or-ambiguous';save();throw error; }
};
const output={phase:PHASE,segment:SEGMENT,mode,parent:plan.parent,source:plan.source,coverageVariant:'S8-compact combines hearing, Spanish-phone and transfer questions into one turn. Original S8 two-turn continuity is not established.',threads:[],status:'incomplete'};
try {
 const chat=(await import('../netlify/functions/chat.mjs')).default;
 for (const [id,turns] of CASES) {
  ledger.currentCase=id;const history=[],thread={id,turns:[]};output.threads.push(thread);
  for (const user of turns) {
   verifyParent();
   if(parent.logicalTurns+ledger.logicalTurns>=plan.aggregateLogicalTurnLimit || parent.attempts.length+ledger.attempts.length>=plan.aggregateActualHTTPAttemptLimit) throw new Error('Aggregate approved limit reached; remaining cases untested');
   ledger.logicalTurns++;save();const start=Date.now();
   const response=await chat(new Request(process.env.URL+'/api/chat',{method:'POST',headers:{'content-type':'application/json',origin:process.env.URL},body:JSON.stringify({persona:'mc',messages:history.concat({role:'user',content:user}),stream:false,page:'/'})}),{ip:'192.0.2.200'});
   const data=await response.json();thread.turns.push({user,status:response.status,latencyMs:Date.now()-start,...data});
   if(!response.ok || typeof data.reply!=='string' || !data.reply.trim()) throw new Error('Conversation incomplete; phase stops without automatic retry');
   history.push({role:'user',content:user},{role:'assistant',content:data.reply});
  }
 }
 output.status='complete';
} catch(error) {output.error=String(error.message).replace(/sk-[A-Za-z0-9_-]+/g,'[redacted]');process.exitCode=1;}
finally {
 ledger.status='closed';ledger.closedAt=new Date().toISOString();ledger.outcome=output.status;delete ledger.currentCase;save();
 output.completedAt=ledger.closedAt;output.logicalTurns=ledger.logicalTurns;output.actualHTTPAttempts=ledger.attempts.length;output.realModelRequests=mode==='run'?ledger.attempts.length:0;
 output.aggregate={logicalTurns:parent.logicalTurns+ledger.logicalTurns,actualHTTPAttempts:parent.attempts.length+ledger.attempts.length,logicalLimit:18,httpLimit:30,deadline:plan.deadline};
 writeFileSync(outputPath,JSON.stringify(output,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({mode,status:output.status,logicalTurns:ledger.logicalTurns,attempts:ledger.attempts.length,realModelRequests:output.realModelRequests,aggregate:output.aggregate,error:output.error||null}));
}
