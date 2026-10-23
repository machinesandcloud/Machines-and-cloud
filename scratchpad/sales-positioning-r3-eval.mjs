// Fresh source-bound tone review under the user's ongoing launch implementation mandate.
// Earlier approved and proposed review ledgers remain untouched and closed. --plan/--fixture have zero provider calls.
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { modelTransport } from './lib/sales-eval-transport.mjs';
const CASES = [
 {id:'broad-fit',seed:[],turns:['Help me figure out whether your front desk would fit my shop.']},
 {id:'plumbing-value',seed:[],turns:['I run a two-truck plumbing shop in Dallas. Our website visitors keep asking about the service area and our $89 callout fee while we are on jobs. How would you help?']},
 {id:'required-jobber',seed:[],turns:['We need native Jobber busy-time sync and technician dispatch. Those are must-haves. Does your product include them?']},
 {id:'existing-receptionist',seed:[],turns:['We already have a receptionist. Why would we add this?']},
];
const SOURCES = ['agent-widget.js','stories.js','styles.css','netlify/functions/chat.mjs','netlify/functions/lib/agent.mjs','netlify/functions/lib/sales-desk.mjs','netlify/functions/lib/sales-budget.mjs','netlify/functions/lib/config.mjs','package-lock.json','scripts/sales-positioning-eval.mjs','scripts/lib/sales-eval-transport.mjs'];
const hashes = () => Object.fromEntries(SOURCES.map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')]));
const PHASE = 'sales-positioning-2026-10-22-r3';
const plan = { phase: PHASE, authority: 'Current user instruction to improve sales replies plus standing instruction to implement and verify launch work autonomously; fresh bounded existing-credit quality check, no purchase or billing changes', logicalTurnLimit: 4, actualHTTPAttemptLimit: 8, maxTokensPerAttempt: 3072, maxModelIterationsPerTurn: 3, automaticSDKRetries: 0, timeLimitMinutes: 8, model: 'claude-opus-5-5', effort: 'medium', freshLedgerRequired: true, target: 'actual local sales handler with memory store; direct Anthropic Messages HTTPS only, no Netlify traffic', forbidden: ['email','forms','voice','SMS','Calendar','customer writes','publication','purchases','billing changes'], cases: CASES, source: hashes(), assessment: 'Review actual replies for confident grounded benefits, tailoring, concise discovery, no unrelated limitations dump, and complete relevant/required capability disclosure. Fixtures establish the request guard only.' };
const mode = process.argv.includes('--run') ? 'run' : process.argv.includes('--fixture') ? 'fixture' : 'plan';
if (mode === 'plan') { console.log(JSON.stringify(plan, null, 2)); process.exit(0); }
if (mode === 'run' && process.argv[process.argv.indexOf('--phase') + 1] !== PHASE) throw new Error('Missing exact fresh phase identifier; no provider request made');
const ledgerPath = `scratchpad/sales-positioning-r3${mode === 'fixture' ? '-fixture' : ''}-ledger.json`;
const outputPath = `scratchpad/sales-positioning-r3${mode === 'fixture' ? '-fixture' : ''}.json`;
if (existsSync(ledgerPath) || existsSync(outputPath)) throw new Error('This phase already exists. Do not reopen, overwrite or silently create a replacement phase.');
if (mode === 'run') {
 const frozenPath = 'scratchpad/sales-positioning-r3-plan.json';
 if (!existsSync(frozenPath)) throw new Error('Freeze and review the concrete phase plan before approval');
 const frozen = JSON.parse(readFileSync(frozenPath));
 if (JSON.stringify(frozen) !== JSON.stringify(plan)) throw new Error('Approved phase source/plan has changed; new review required');
}
for (const key of Object.keys(process.env)) if (/^(TWILIO_|MC_TWILIO_|VAPI_|RESEND_|GOOGLE_|STRIPE_|NETLIFY_AI_GATEWAY_)/.test(key)) delete process.env[key];
process.env.MC_MEMORY_STORE = '1'; process.env.MC_FAKE_MODEL = '0'; process.env.URL = 'http://127.0.0.1:8888';
process.env.MC_SALES_AI_GLOBAL_DAILY_LIMIT = '50'; process.env.MC_SALES_AI_IP_DAILY_LIMIT = '20';
process.env.ANTHROPIC_BASE_URL = mode === 'fixture' ? 'https://sales-eval-fixture.invalid' : 'https://api.anthropic.com';
if (mode === 'fixture') process.env.ANTHROPIC_API_KEY = 'offline-fixture';
else if (!process.env.ANTHROPIC_API_KEY && existsSync('/Users/stevengoumnai/Desktop/Repositories/machines-and-cloud/.env')) {
 const line = readFileSync('/Users/stevengoumnai/Desktop/Repositories/machines-and-cloud/.env','utf8').split('\n').find(line => /^\s*ANTHROPIC_API_KEY=/.test(line));
 if (line) process.env.ANTHROPIC_API_KEY = line.slice(line.indexOf('=')+1).trim().replace(/^["']|["']$/g,'');
}
if (!process.env.ANTHROPIC_API_KEY) throw new Error('No Anthropic key; no request made');
const started = Date.now(), ledger = { ...plan, mode, startedAt: new Date(started).toISOString(), status: 'active', logicalTurns: 0, attempts: [], blocked: [] };
writeFileSync(ledgerPath, JSON.stringify(ledger,null,2)+'\n', {flag:'wx'});
const save = () => { const temp=ledgerPath+'.tmp'; writeFileSync(temp,JSON.stringify(ledger,null,2)+'\n'); renameSync(temp,ledgerPath); };
const realFetch = globalThis.fetch;
function guardSourceAndTime() {
 assert.deepEqual(hashes(), plan.source, 'Frozen source changed during phase');
 if (ledger.status !== 'active' || Date.now()-started >= plan.timeLimitMinutes*60000) throw new Error('Evaluation time/status limit reached');
}
globalThis.fetch = async (input, init = {}) => {
 const url = new URL(String(typeof input === 'string' || input instanceof URL ? input : input.url));
 const allowedOrigin = mode === 'fixture' ? 'https://sales-eval-fixture.invalid' : 'https://api.anthropic.com';
 if (url.origin !== allowedOrigin || url.pathname !== '/v1/messages' || init.method !== 'POST') { ledger.blocked.push({ origin:url.origin,path:url.pathname,method:init.method });save();throw new Error('Evaluation blocked non-model traffic'); }
 guardSourceAndTime();
 if (ledger.logicalTurns < 1 || ledger.logicalTurns > plan.logicalTurnLimit || ledger.attempts.length >= plan.actualHTTPAttemptLimit || ledger.attempts.filter(row => row.logicalTurn === ledger.logicalTurns).length >= plan.maxModelIterationsPerTurn) throw new Error('Evaluation request/turn limit reached');
 const body=JSON.parse(init.body);
 assert.equal(body.model,plan.model);assert.equal(body.max_tokens,plan.maxTokensPerAttempt);assert.equal(body.output_config.effort,plan.effort);
 const row={number:ledger.attempts.length+1,logicalTurn:ledger.logicalTurns,at:new Date().toISOString(),status:'reserved-before-request',model:body.model,maxTokens:body.max_tokens,case:ledger.currentCase};
 ledger.attempts.push(row);save(); // An ambiguous failed attempt remains consumed.
 try {
  let response;
  if(mode==='fixture') {
   const text='OFFLINE HARNESS FIXTURE: not an actual model answer.';
   const events=[{type:'message_start',message:{id:'fixture-'+row.number,type:'message',role:'assistant',content:[],model:body.model,stop_reason:null,stop_sequence:null,usage:{input_tokens:10,output_tokens:0}}},{type:'content_block_start',index:0,content_block:{type:'text',text:''}},{type:'content_block_delta',index:0,delta:{type:'text_delta',text}},{type:'content_block_stop',index:0},{type:'message_delta',delta:{stop_reason:'end_turn',stop_sequence:null},usage:{output_tokens:10}},{type:'message_stop'}];
   response=new Response(events.map(e=>`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''),{headers:{'content-type':'text/event-stream'}});
  } else {
   const remaining = started + plan.timeLimitMinutes * 60000 - Date.now();
   if (remaining <= 0) throw new Error('Evaluation phase deadline reached');
   const phaseSignal = AbortSignal.timeout(remaining);
   const signal = init.signal ? AbortSignal.any([init.signal, phaseSignal]) : phaseSignal;
   response=await modelTransport(realFetch,input,{...init,signal});
  }
  row.statusCode=response.status;row.status='response-received';save();return response;
 } catch(error) { row.status='failed-or-ambiguous';save();throw error; }
};
const output={phase:PHASE,mode,source:plan.source,threads:[],status:'incomplete'};
try {
 const chat=(await import('../netlify/functions/chat.mjs')).default;
 for (const {id,seed,turns} of CASES) {
  ledger.currentCase=id;const history=seed.map(message=>({...message})),thread={id,seed,turns:[]};output.threads.push(thread);
  for (const user of turns) {
   guardSourceAndTime();
   if(ledger.logicalTurns>=plan.logicalTurnLimit || ledger.attempts.length>=plan.actualHTTPAttemptLimit) throw new Error('Approved phase limit reached; remaining cases untested');
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
 writeFileSync(outputPath,JSON.stringify(output,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({mode,status:output.status,logicalTurns:ledger.logicalTurns,attempts:ledger.attempts.length,realModelRequests:output.realModelRequests,error:output.error||null}));
}
