// Independent M&C-only SMS integration review. Real handlers + installed Blobs SDK;
// every provider/storage request is intercepted and all other network is denied.
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import net from 'node:net'; import http from 'node:http'; import https from 'node:https';

const outputAt=process.argv.indexOf('--output'),output=outputAt<0?null:process.argv[outputAt+1];
if(output && (!/^scratchpad\/[a-z0-9-]+\.json$/.test(output)||existsSync(output)))throw new Error('Use a new receipt path');
const hash=value=>createHash('sha256').update(value).digest('hex');
const sources=['netlify/functions/lib/platform-sms.mjs','netlify/functions/platform-sms.mjs','netlify/functions/manage.mjs'];
const hashes=()=>Object.fromEntries(sources.map(file=>[file,hash(readFileSync(file))]));
const report={at:new Date().toISOString(),mode:'independent actual HTTP handlers and installed SDK CAS; synthetic Twilio GET receipts; no external network, model, SMS or email',before:hashes(),checks:[],conflicts:0,providerReads:0,blocked:[]};
for(const name of Object.keys(process.env))if(/^(TWILIO_|MC_|VAPI_|ANTHROPIC_|RESEND_|GOOGLE_|STRIPE_|PLATFORM_|SERVICE_|PHONE_|MESSAGING_|CALENDAR_)/.test(name))delete process.env[name];
const origin='https://machinesandcloud.com',url=origin+'/api/platform-sms',account='AC'+'a'.repeat(32),service='MG'+'b'.repeat(32),number='+17135550100',secret='offline-platform-sms-secret',operator='operator@example.test';
Object.assign(process.env,{MC_MEMORY_STORE:'0',MC_FAKE_MODEL:'1',NODE_ENV:'test',URL:origin,PUBLIC_SITE_URL:origin,TWILIO_ACCOUNT_SID:account,TWILIO_AUTH_TOKEN:secret,MC_TWILIO_NUMBER:number,MC_MESSAGING_SERVICE_SID:service,ADMIN_EMAILS:operator,EXAMPLE_PRIVATE_TOKEN:'fixture-private-value-not-a-live-token'});
const RealDate=Date;let clock=Date.parse('2026-10-22T18:00:00.000Z');globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}};
const at=()=>new Date().toISOString(),blobs=new Map(),messages=new Map();let revision=0,serial=0,storageFailure=false,providerFailure=false,beforeBlobWrite=null,afterBlobRead=null;
const deny=()=>{throw new Error('Independent SMS QA blocked external network');};net.connect=net.createConnection=http.get=http.request=https.get=https.request=deny;syncBuiltinESMExports();
globalThis.fetch=async(input,init={})=>{
  const target=new URL(String(input)),method=String(init.method||'GET').toUpperCase();
  if(target.origin==='https://platform-sms-blobs.invalid'){
    const [,site,kind,...parts]=target.pathname.split('/').map(decodeURIComponent),key=parts.join('/'),name=kind+'/'+key;assert.equal(site,'platform-sms-site');
    if(storageFailure&&kind==='site:platform_sms_messages')return new Response('Offline fixture storage failure',{status:400});
    if(method==='GET'&&!key)return Response.json({blobs:[...blobs.keys()].filter(name=>name.startsWith(kind+'/'+(target.searchParams.get('prefix')||''))).map(name=>({key:name.slice(kind.length+1)})),directories:[]});
    if(method==='PUT'&&beforeBlobWrite)await beforeBlobWrite({kind,key,body:init.body});
    const prior=blobs.get(name),headers=new Headers(init.headers);
    if(method==='GET'){if(afterBlobRead)await afterBlobRead({kind,key,prior});return prior?new Response(prior.body,{headers:{etag:prior.etag,'content-type':'application/json'}}):new Response(null,{status:404});}
    if(method==='DELETE'){blobs.delete(name);return new Response(null,{status:204});}
    assert.equal(method,'PUT');if(headers.get('if-none-match')==='*'&&prior||headers.has('if-match')&&prior?.etag!==headers.get('if-match')){report.conflicts++;return new Response(null,{status:412});}
    const etag=String(++revision);blobs.set(name,{body:init.body,etag});return new Response(null,{headers:{etag}});
  }
  if(target.origin==='https://api.twilio.com'&&method==='GET'){
    assert.equal(new Headers(init.headers).get('authorization'),'Basic '+Buffer.from(`${account}:${secret}`).toString('base64'));
    const match=target.pathname.match(new RegExp(`^/2010-04-01/Accounts/${account}/Messages/(SM[a-f0-9]{32})\\.json$`));assert.ok(match,'Only exact inbound Message reads are allowed');report.providerReads++;
    if(providerFailure)return new Response('Offline fixture provider failure',{status:503});
    return messages.has(match[1])?Response.json(messages.get(match[1])):new Response(null,{status:404});
  }
  report.blocked.push({origin:target.origin,path:target.pathname,method});return deny();
};
const {setEnvironmentContext}=await import('@netlify/blobs');setEnvironmentContext({siteID:'platform-sms-site',token:'offline-fixture-token',edgeURL:'https://platform-sms-eventual.invalid',uncachedEdgeURL:'https://platform-sms-blobs.invalid'});
const store=await import('../netlify/functions/lib/store.mjs'),{strictRead}=await import('../netlify/functions/lib/accounts.mjs');
const handler=(await import('../netlify/functions/platform-sms.mjs')).default,{platformSMSView}=await import('../netlify/functions/lib/platform-sms.mjs'),manage=(await import('../netlify/functions/manage.mjs')).default;
const ledger=()=>strictRead('platform_sms_messages','inbound_v1');
const contact=()=>'+1713'+String(5550100+ ++serial).slice(-7);
function incoming(body,{from=contact(),time=clock,...overrides}={}){
  const sid='SM'+hash('platform-incoming-'+ ++serial).slice(0,32),row={sid,account_sid:account,messaging_service_sid:service,direction:'inbound',status:'received',from,to:number,body,date_created:new Date(time).toUTCString(),...overrides};messages.set(sid,row);
  return{AccountSid:account,MessagingServiceSid:service,MessageSid:sid,From:from,To:number,Body:body,NumMedia:'0'};
}
function signed(fields,{path=url,signature='valid',extra='',method='POST'}={}){
  const data=path+Object.keys(fields).sort().map(key=>key+fields[key]).join(''),sig=signature==='valid'?createHmac('sha1',secret).update(data).digest('base64'):signature;
  return new Request(path,{method,headers:{'content-type':'application/x-www-form-urlencoded','x-twilio-signature':sig},...(method==='POST'?{body:new URLSearchParams(fields).toString()+extra}:{})});
}
async function request(fields,options){const response=await handler(signed(fields,options));return{status:response.status,text:await response.text()};}
const hasReply=response=>/<Message>/.test(response.text);
async function check(name,fn){try{await fn();report.checks.push({name,pass:true});}catch(error){storageFailure=false;providerFailure=false;beforeBlobWrite=null;afterBlobRead=null;report.checks.push({name,pass:false,error:error.message,stack:error.stack});}}
function signal(){let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};}

await check('gate starts closed; verified inquiry is retained without a reply or any proactive send',async()=>{
  const fields=incoming('Tell me about pricing'),result=await request(fields);assert.equal(result.status,200);assert.equal(hasReply(result),false);const row=(await ledger()).entries[fields.MessageSid];assert.equal(row.reason,'gate_closed');assert.equal(row.replyDelivery,'not_requested');assert.equal((await platformSMSView()).enabled,false);
});
await check('signature, canonical URL, account, service, number, duplicate parameters and media fail closed',async()=>{
  process.env.MC_PLATFORM_SMS_ENABLED='true';const fields=incoming('My own product question'),before=(await platformSMSView()).total;
  for(const result of[await request(fields,{signature:'wrong'}),await request(fields,{path:url+'?replay=1'}),await request({...fields,AccountSid:'AC'+'c'.repeat(32)}),await request({...fields,MessagingServiceSid:'MG'+'c'.repeat(32)}),await request({...fields,To:'+17135550999'}),await request(fields,{extra:'&Body=second'}),await request({...fields,NumMedia:'1'}),await request(fields,{method:'GET'})])assert.equal(result.status,403);
  assert.equal((await platformSMSView()).total,before);
});
await check('authenticated Message GET must match each signed receipt field and bounded creation time',async()=>{
  const changes=[{sid:'SM'+'c'.repeat(32)},{account_sid:'AC'+'c'.repeat(32)},{messaging_service_sid:'MG'+'c'.repeat(32)},{direction:'outbound-api'},{from:'+17135550998'},{to:'+17135550999'},{body:'Different body'},{date_created:new Date(clock-2*86400000).toISOString()},{date_created:new Date(clock+3600000).toISOString()}];
  for(const change of changes){const fields=incoming('Receipt identity check');Object.assign(messages.get(fields.MessageSid),change);assert.equal((await request(fields)).status,403);assert.equal((await ledger()).entries[fields.MessageSid],undefined);}
  const fields=incoming('Provider outage');providerFailure=true;assert.equal((await request(fields)).status,503);providerFailure=false;assert.equal((await ledger()).entries[fields.MessageSid],undefined);
});
await check('same-SID races reserve exactly one reply; discarded first response remains delivery unknown and is not replayed',async()=>{
  const fields=incoming('Show me your demo'),results=await Promise.all(Array.from({length:8},()=>request(fields)));assert.ok(results.every(row=>row.status===200));assert.equal(results.filter(hasReply).length,1);
  const first=(await ledger()).entries[fields.MessageSid];assert.equal(first.state,'reply_delivery_unknown');assert.equal(first.replyDelivery,'unknown');assert.equal(hasReply(await request(fields)),false);
  const lost=incoming('How do I start setup?');await request(lost);assert.equal(hasReply(await request(lost)),false);assert.equal((await ledger()).entries[lost.MessageSid].replyDelivery,'unknown');
});
await check('same-SID changed contents are held rather than overwriting consent or generating another response',async()=>{
  const fields=incoming('First request');await request(fields);messages.get(fields.MessageSid).body='Different authenticated contents';const changed={...fields,Body:'Different authenticated contents'};assert.equal((await request(changed)).status,409);assert.equal((await ledger()).entries[fields.MessageSid].body,'First request');
});
await check('delayed duplicate finalization cannot downgrade an archived primary reply receipt',async()=>{
  const fields=incoming('Show the platform demo'),ledgerReached=signal(),releaseLedger=signal(),duplicateRead=signal(),releaseDuplicate=signal();let held=false,receiptReads=0;
  beforeBlobWrite=async({kind})=>{if(kind==='site:platform_sms_messages'&&!held){held=true;ledgerReached.resolve();await releaseLedger.promise;}};
  afterBlobRead=async({kind,key})=>{if(kind==='site:platform_sms_receipts'&&key===fields.MessageSid&&++receiptReads===3){duplicateRead.resolve();await releaseDuplicate.promise;}};
  const winner=request(fields);await ledgerReached.promise;const duplicate=request(fields);await duplicateRead.promise;releaseLedger.resolve();const result=await winner;assert.equal(hasReply(result),true);releaseDuplicate.resolve();assert.equal(hasReply(await duplicate),false);beforeBlobWrite=null;afterBlobRead=null;
  const primary=await strictRead('platform_sms_receipts',fields.MessageSid);assert.equal(primary.state,'reply_delivery_unknown');assert.ok(primary.reply);assert.equal(primary.replyDelivery,'unknown');
});
await check('STOP wins equal/older START; ordinary messages never remove suppression; newer START grants replies only',async()=>{
  const from=contact(),stop=incoming('ALTO',{from}),stopped=await request(stop);assert.equal(hasReply(stopped),true);assert.equal(hasReply(await request(incoming('What do you charge?',{from}))),false);
  for(const time of[clock-1000,clock]){const start=incoming('START',{from,time});assert.equal(hasReply(await request(start)),false);}
  clock+=1000;const resumed=await request(incoming('EMPEZAR',{from}));assert.equal(hasReply(resumed),true);assert.match(resumed.text,/no recurring texts|does not sign you up for recurring texts/);assert.equal(hasReply(await request(incoming('Show the demo',{from}))),true);
  const sameTimeStop=incoming('STOP',{from});assert.equal(hasReply(await request(sameTimeStop)),true);assert.equal(hasReply(await request(incoming('START',{from}))),false);
});
await check('repeat distinct stop receipts are retained silently; gate-off stop persistence is still permitted',async()=>{
  const from=contact();assert.equal(hasReply(await request(incoming('STOP',{from}))),true);clock+=1000;assert.equal(hasReply(await request(incoming('PARAR',{from}))),false);
  process.env.MC_PLATFORM_SMS_ENABLED='false';const other=contact();assert.equal(hasReply(await request(incoming('ALTO',{from:other}))),true);clock+=1000;assert.equal(hasReply(await request(incoming('START',{from:other}))),false);assert.equal(hasReply(await request(incoming('HELP',{from:other}))),false);process.env.MC_PLATFORM_SMS_ENABLED='true';
});
await check('provider-managed keyword acknowledgments are never duplicated by the application',async()=>{
  const from=contact();for(const [Body,OptOutType]of[['STOP','STOP'],['START','START'],['HELP','HELP']]){clock+=1000;const fields={...incoming(Body,{from}),OptOutType};assert.equal(hasReply(await request(fields)),false);assert.equal((await ledger()).entries[fields.MessageSid].reason,'provider_keyword_handling');}
});
await check('M&C inquiry never resolves a legacy customer or shared homeowner bridge',async()=>{
  const from=contact();await store.put('index','bridge:'+from,'legacy-private-shop');await store.put('index','number:'+number,'legacy-private-shop');await store.put('clients','legacy-private-shop',{slug:'legacy-private-shop',business:{name:'Private Fixture Shop'}});
  const result=await request(incoming('How do I get started?',{from}));assert.equal(result.status,200);assert.match(result.text,/Machines &amp; Cloud/);assert.ok(!result.text.includes('Private Fixture Shop'));assert.deepEqual(await store.list('conversations','legacy-private-shop/'),[]);await store.del('clients','legacy-private-shop');
});
await check('private history omits provider references, configured secrets, tax identifiers and common sign-in credentials',async()=>{
  const values=['Bearer fixture-bearer-token',service,'EIN 92-1234567',process.env.EXAMPLE_PRIVATE_TOKEN,'password: fixture-colon-password','passcode=fixture-nospace-code','my password is fixture-word-password','verification code is 123456','Cookie: session=fixture-cookie-token'];
  const fields=incoming(values.join(' | '));await request(fields);const view=JSON.stringify(await platformSMSView({limit:100}));
  for(const secretValue of['fixture-bearer-token',service,'92-1234567',process.env.EXAMPLE_PRIVATE_TOKEN,'fixture-colon-password','fixture-nospace-code','fixture-word-password','123456','fixture-cookie-token'])assert.ok(!view.includes(secretValue),'A private fixture value survived the operator projection');
  assert.ok(!view.includes(fields.MessageSid));assert.ok(!view.includes('"digest"'));assert.ok(!view.includes('"binding"'));await assert.rejects(()=>platformSMSView({limit:101}));
});
await check('only authorized operator sessions can retrieve platform inquiries through the actual management handler',async()=>{
  const ownerToken=hash('platform-owner-fixture'),operatorToken=hash('platform-operator-fixture');for(const[token,email,scope]of[[ownerToken,operator,'onboarding'],[operatorToken,operator,'operator']])await store.put('access_sessions',hash(token),{scope,status:'active',email,expiresAt:new Date(clock+3600000).toISOString()});
  const get=token=>manage(new Request(origin+'/api/manage',{headers:token?{authorization:'Bearer '+token}:{}}));assert.equal((await get()).status,401);assert.equal((await get(ownerToken)).status,401);const result=await get(operatorToken);assert.equal(result.status,200);const data=await result.json();assert.ok(data.platformSMS.total>0);assert.ok(data.platformSMS.rows.length>0);assert.equal(result.headers.get('cache-control'),'no-store');
});
await check('projection failure retains the primary receipt; retries recover STOP and history without a second reply',async()=>{
  storageFailure=true;const fields=incoming('Do not reply without a durable fence');assert.equal((await request(fields)).status,503);storageFailure=false;assert.equal((await ledger()).entries[fields.MessageSid],undefined);
  assert.ok(await strictRead('platform_sms_receipts',fields.MessageSid));assert.equal(hasReply(await request(fields)),false);assert.ok((await ledger()).entries[fields.MessageSid]);
  const from=contact(),stop=incoming('STOP',{from});storageFailure=true;assert.equal((await request(stop)).status,503);storageFailure=false;assert.equal(hasReply(await request(stop)),false);assert.equal(hasReply(await request(incoming('Please send pricing',{from}))),false);
});
await check('recent history archives automatically; per-SID fences survive eviction and the daily reply budget renews without clearing STOP',async()=>{
  clock+=86400000;const first=incoming('Show the demo'),from=contact();assert.equal(hasReply(await request(first)),true);
  for(let i=1;i<500;i++){clock++;assert.equal(hasReply(await request(incoming('How does setup work?',{from}))),true);}
  clock++;const over=incoming('The 501st reply is withheld',{from});assert.equal(hasReply(await request(over)),false);assert.equal((await ledger()).entries[over.MessageSid].reason,'reply_budget_reached');
  const view=await platformSMSView();assert.equal(view.replyBudget.used,500);assert.equal(view.atCapacity,true);assert.equal(view.total,500);assert.match(view.scope,/older receipts archived/);assert.ok(Object.keys((await ledger()).entries).length<=500);assert.equal((await ledger()).entries[first.MessageSid],undefined);assert.ok(await strictRead('platform_sms_receipts',first.MessageSid));assert.equal(hasReply(await request(first)),false);
  const blockedFrom=contact();clock++;await request(incoming('STOP',{from:blockedFrom}));clock+=86400000;assert.equal(hasReply(await request(incoming('New day inquiry',{from}))),true);assert.equal((await platformSMSView()).replyBudget.used,1);assert.equal(hasReply(await request(incoming('Still blocked next day',{from:blockedFrom}))),false);
});

report.after=hashes();report.sourceStable=JSON.stringify(report.before)===JSON.stringify(report.after);report.passed=report.checks.filter(row=>row.pass).length;report.total=report.checks.length;report.ok=report.passed===report.total&&report.sourceStable&&report.blocked.length===0;
if(output)writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(!report.ok)process.exitCode=1;
