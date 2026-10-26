import './network-block.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { createServer } from '../dist/server.js';
import { OwnerAccess, readConfiguration, WorkspaceReader } from '../dist/workspace.js';
import { SetupPreparer } from '../dist/preparation.js';
import { environment, bearer, slug, privateStrings, fixture, jsonResponse } from './fixtures.mjs';
import { physicalAttempts } from './network-block.mjs';
const config = readConfiguration(environment), token = 'a'.repeat(64), nextToken = 'b'.repeat(64);
const proposed = { desiredChannels: ['web', 'voice', 'sms', 'calendar'], website: 'https://trusted-trades.com/' };
function dto(overrides={}) {
  const value=fixture(); value.setup.connectionPreparation={ eligible:true, prepared:false, token, lastSubmissionId:null,
    desiredChannels:['web'], website:'https://private-business-domain.com/', ...overrides };
  return value;
}
function saved(body) { const value=dto({prepared:true,token:nextToken,lastSubmissionId:body.submissionId,desiredChannels:body.desiredChannels,...('website' in body?{website:body.website}:{})}); value.preparation={state:'saved',submissionId:body.submissionId,token:nextToken}; return value; }
function clean(value) { const text=JSON.stringify(value); for(const secret of [...privateStrings,bearer,token,nextToken,'private-business-domain']) assert.equal(text.includes(secret),false,secret); }
function subject(transport, now) {return new SetupPreparer(new OwnerAccess(config,transport,30),now);}
async function protocol(t, transport) {
  const server=createServer(new WorkspaceReader(config,transport),subject(transport));
  const client=new Client({name:'preparation-review',version:'1'}), [a,b]=InMemoryTransport.createLinkedPair();
  await server.connect(a);await client.connect(b);t.after(async()=>{await client.close();await server.close();});return client;
}

test('opt-in exposes strict preview/save schemas and accurate mutation hints',async t=>{
 const client=await protocol(t,async()=>jsonResponse(dto()));const {tools}=await client.listTools();assert.equal(tools.length,5);
 const preview=tools.find(t=>t.name==='mc_preview_connection_setup'),save=tools.find(t=>t.name==='mc_save_connection_setup');
 assert.equal(preview.annotations.readOnlyHint,true);assert.equal(save.annotations.readOnlyHint,false);assert.equal(save.annotations.destructiveHint,true);
 assert.equal(save.inputSchema.additionalProperties,false);assert.ok(save.outputSchema);
 const result=await client.callTool({name:preview.name,arguments:proposed});assert.equal(result.structuredContent.state,'preview');clean(result);
});
test('preview is read-only, bounded, private and fixed to the configured tenant',async()=>{
 const calls=[];const prep=subject(async(url,init)=>{calls.push({url:String(url),init});return jsonResponse(dto());});
 const result=await prep.preview(proposed);assert.equal(calls.length,1);assert.equal(calls[0].init.method,'GET');
 assert.equal(calls[0].url,`https://machinesandcloud.com/api/client?c=${slug}&setup_assistance=1`);assert.equal(calls[0].init.headers.Authorization,`Bearer ${bearer}`);
 assert.equal(calls[0].init.redirect,'error');assert.equal(calls[0].init.credentials,'omit');assert.match(result.previewId,/^[a-f0-9]{32}$/);
 assert.deepEqual(result.desiredChannels,proposed.desiredChannels);assert.equal(result.websiteOrigin,'https://trusted-trades.com');clean(result);
 const omitted=await prep.preview({desiredChannels:[]});assert.equal('website' in omitted,false);clean(omitted);
});
test('matching confirmation saves only exact patch once after fresh owner GET',async()=>{
 let current=dto();const calls=[];const prep=subject(async(url,init)=>{calls.push({url:String(url),init});if(init.method==='POST'){const body=JSON.parse(init.body);current=saved(body);}return jsonResponse(current);});
 const preview=await prep.preview(proposed),result=await prep.save(preview.previewId,true);assert.equal(result.state,'saved');
 const post=calls.filter(c=>c.init.method==='POST');assert.equal(post.length,1);assert.equal(calls.length,3);
 assert.equal(post[0].init.headers.Origin,'https://machinesandcloud.com');
 const body=JSON.parse(post[0].init.body);assert.deepEqual(Object.keys(body).sort(),['action','desiredChannels','expectedPreparationToken','submissionId','website']);
 assert.equal(body.action,'prepare_connections');assert.equal(body.expectedPreparationToken,token);assert.match(body.submissionId,/^[a-f0-9]{32}$/);
 assert.equal((await prep.save(preview.previewId,true)).state,'saved');assert.equal(calls.filter(c=>c.init.method==='POST').length,1);clean(result);
});
test('SDK rejects extra fields, arbitrary providers, duplicates and unconfirmed saves before network',async t=>{
 let calls=0;const client=await protocol(t,async()=>{calls++;return jsonResponse(dto());});
 for(const [name,args]of[
 ['mc_preview_connection_setup',{...proposed,endpoint:'https://evil.com'}],['mc_preview_connection_setup',{desiredChannels:['web','web']}],
 ['mc_preview_connection_setup',{desiredChannels:['thumbtack']}],['mc_save_connection_setup',{previewId:'a'.repeat(32),confirm:false}],
 ['mc_save_connection_setup',{previewId:'a'.repeat(32),confirm:true,website:'https://evil.com'}]]){
 let failed=false;try{failed=(await client.callTool({name,arguments:args})).isError===true;}catch{failed=true;}assert.equal(failed,true);
 }assert.equal(calls,0);
});
test('unsafe website values and wrong preview never produce a write',async()=>{
 let posts=0;const prep=subject(async(_u,init)=>{if(init.method==='POST')posts++;return jsonResponse(dto());});
 for(const website of ['http://trades.com','https://127.0.0.1','https://localhost','https://secret@trades.com','https://trades.com:444','https://trades.com/?key=secret','https://trades.com/#secret','https://machinesandcloud.com','https://test.invalid','https://[::1]']) await assert.rejects(prep.preview({...proposed,website}));
 const preview=await prep.preview(proposed);await assert.rejects(prep.save('0'.repeat(32),true));await assert.rejects(prep.save(preview.previewId,false));assert.equal(posts,0);
});
test('stale revision, protected lifecycle and expired preview reject before POST',async()=>{
 for(const changed of [{token:nextToken},{eligible:false,token:null},{prepared:true,token:nextToken,lastSubmissionId:'c'.repeat(32)}]){
 let reads=0,posts=0;const prep=subject(async(_u,init)=>{if(init.method==='POST')posts++;return jsonResponse(++reads===1?dto():dto(changed));});
 const preview=await prep.preview(proposed);await assert.rejects(prep.save(preview.previewId,true));assert.equal(posts,0);
 }
 let clock=0,posts=0;const prep=subject(async(_u,init)=>{if(init.method==='POST')posts++;return jsonResponse(dto());},()=>clock);
 const preview=await prep.preview(proposed);clock=600000;await assert.rejects(prep.save(preview.previewId,true));assert.equal(posts,0);
});
test('expired or revoked owner session cannot submit or leak error bodies',async()=>{
 let calls=0;const prep=subject(async()=>++calls===1?jsonResponse(dto()):jsonResponse({message:privateStrings.join(' ')},401));
 const preview=await prep.preview(proposed);await assert.rejects(prep.save(preview.previewId,true),e=>{clean(e.message);return e.code==='session_expired';});assert.equal(calls,2);
});
test('lost committed POST reconciles exact submission marker, never repeats POST',async()=>{
 let current=dto(),posts=0;const prep=subject(async(_u,init)=>{if(init.method==='POST'){posts++;current=saved(JSON.parse(init.body));throw Error(bearer);}return jsonResponse(current);});
 const preview=await prep.preview(proposed);assert.equal((await prep.save(preview.previewId,true)).state,'saved');assert.equal((await prep.save(preview.previewId,true)).state,'saved');assert.equal(posts,1);
});
test('identical fields without exact receipt remain uncertain and block a second preview',async()=>{
 let current=dto(),posts=0;const prep=subject(async(_u,init)=>{if(init.method==='POST'){posts++;current=dto({...proposed,prepared:true,lastSubmissionId:'f'.repeat(32),token:nextToken});throw Error(bearer);}return jsonResponse(current);});
 const preview=await prep.preview(proposed),result=await prep.save(preview.previewId,true);assert.equal(result.state,'uncertain');clean(result);
 assert.equal((await prep.save(preview.previewId,true)).state,'uncertain');await assert.rejects(prep.preview(proposed),e=>e.code==='operation_uncertain');assert.equal(posts,1);
});
test('lost POST with failed subsequent read remains uncertain; later exact GET can resolve',async()=>{
 let current=dto(),posts=0,fail=false;const prep=subject(async(_u,init)=>{if(init.method==='POST'){posts++;current=saved(JSON.parse(init.body));fail=true;throw Error(bearer);}if(fail)throw Error(bearer);return jsonResponse(current);});
 const preview=await prep.preview(proposed);assert.equal((await prep.save(preview.previewId,true)).state,'uncertain');fail=false;assert.equal((await prep.save(preview.previewId,true)).state,'saved');assert.equal(posts,1);
});
test('definitive rejection never retries POST; explicit new preview uses fresh state',async()=>{
 let posts=0;const prep=subject(async(_u,init)=>init.method==='POST'?(posts++,jsonResponse({secret:bearer},409)):jsonResponse(dto()));
 const preview=await prep.preview(proposed);await assert.rejects(prep.save(preview.previewId,true),e=>{clean(e.message);return e.status===409;});
 await assert.rejects(prep.save(preview.previewId,true));const next=await prep.preview(proposed);assert.notEqual(next.previewId,preview.previewId);assert.equal(posts,1);
});
test('concurrent save and replacement preview cannot multiply a pending write',async()=>{
 let release,posts=0,current=dto();const hold=new Promise(r=>release=r);
 const prep=subject(async(_u,init)=>{if(init.method==='POST'){posts++;await hold;current=saved(JSON.parse(init.body));}return jsonResponse(current);});
 const preview=await prep.preview(proposed),pending=prep.save(preview.previewId,true);await new Promise(r=>setImmediate(r));
 await assert.rejects(prep.save(preview.previewId,true),e=>e.code==='save_in_progress');await assert.rejects(prep.preview(proposed),e=>e.code==='save_in_progress');release();assert.equal((await pending).state,'saved');assert.equal(posts,1);
});
test('wrong tenant, missing projection, oversize and redirect fail closed without POST',async()=>{
 const wrong=dto();wrong.client.slug='another-owner';const no=dto();delete no.setup.connectionPreparation;
 for(const make of [()=>jsonResponse(wrong),()=>jsonResponse(no),()=>jsonResponse(dto(),200,{'content-length':'2000000'}),()=>new Response('{broken',{headers:{'content-type':'application/json'}}),()=>new Proxy(jsonResponse(dto()),{get(t,k){if(k==='redirected')return true;const v=Reflect.get(t,k);return typeof v==='function'?v.bind(t):v;}})]){
 let posts=0;const prep=subject(async(_u,init)=>{if(init.method==='POST')posts++;return make();});await assert.rejects(prep.preview(proposed),e=>{clean(e.message);return true;});assert.equal(posts,0);
 }
});
test('preparation protocol tests made no physical network attempts',()=>assert.equal(physicalAttempts.count,0));

test('explicit CLI opt-in serves preview/save through actual stdio with no physical transport',async t=>{
 const transport=new StdioClientTransport({command:process.execPath,args:['--import',fileURLToPath(new URL('./preparation-stdio-network.mjs',import.meta.url)),fileURLToPath(new URL('../dist/index.js',import.meta.url))],env:{...environment,MC_MCP_ALLOW_SETUP_PREPARATION:'1'},stderr:'pipe'});
 let stderr='';transport.stderr.on('data',chunk=>stderr+=chunk);const client=new Client({name:'setup-stdio-test',version:'1'});t.after(()=>client.close());await client.connect(transport);
 assert.equal((await client.listTools()).tools.length,5);
 const preview=await client.callTool({name:'mc_preview_connection_setup',arguments:{desiredChannels:['sms','web'],website:'https://trusted-trades.com'}});
 assert.equal(preview.structuredContent.state,'preview');const result=await client.callTool({name:'mc_save_connection_setup',arguments:{previewId:preview.structuredContent.previewId,confirm:true}});
 assert.equal(result.structuredContent.state,'saved');assert.equal(stderr,'');clean(result);
});
test('omitted website remains omitted in the write; explicit blank clears only the supplied URL',async()=>{
 for(const patch of [{desiredChannels:[]},{desiredChannels:['web'],website:''}]){
  let current=dto(),written;const prep=subject(async(_u,init)=>{if(init.method==='POST'){written=JSON.parse(init.body);current=saved(written);}return jsonResponse(current);});
  const preview=await prep.preview(patch);assert.equal((await prep.save(preview.previewId,true)).state,'saved');assert.equal(Object.hasOwn(written,'website'),Object.hasOwn(patch,'website'));if('website'in patch)assert.equal(written.website,'');
 }
});
test('progressed state after commit does not certify current preparation or resend it',async()=>{
 let current=dto(),posts=0;const prep=subject(async(_u,init)=>{if(init.method==='POST'){posts++;current=saved(JSON.parse(init.body));Object.assign(current.setup.connectionPreparation,{eligible:false,prepared:false,token:null,lastSubmissionId:null});}return jsonResponse(current);});
 const preview=await prep.preview(proposed);const result=await prep.save(preview.previewId,true);assert.equal(result.state,'uncertain');assert.equal((await prep.save(preview.previewId,true)).state,'uncertain');assert.equal(posts,1);
});
