// Actual owner billing GET with synthetic retained financial state. No provider,
// credentials file, browser or commercial/live operation is used by these cases.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import net from 'node:net';import http from 'node:http';import https from 'node:https';
import {syncBuiltinESMExports} from 'node:module';
const output=process.argv[process.argv.indexOf('--output')+1];
if(!/^scratchpad\/[a-z0-9-]+\.json$/.test(output)||existsSync(output))throw Error('Fresh scratchpad receipt required');
const sha=value=>createHash('sha256').update(value).digest('hex');
const files=['netlify/functions/lib/billing-test-admission.mjs','netlify/functions/lib/workspace-billing.mjs','netlify/functions/workspace-billing.mjs','scripts/billing-test-admission-projection-check.mjs'];
const hashes=()=>Object.fromEntries(files.map(file=>[file,sha(readFileSync(file))]));
let physical=0,provider=0;const deny=()=>{physical++;throw Error('Physical transport denied');};net.connect=net.createConnection=http.request=http.get=https.request=https.get=deny;syncBuiltinESMExports();globalThis.fetch=async()=>{provider++;throw Error('No provider permitted by read-only projection proof');};
for(const key of Object.keys(process.env))if(/^(STRIPE_|WORKSPACE_BILLING_|ANTHROPIC_|RESEND_|GOOGLE_|TWILIO_|VAPI_)/.test(key))delete process.env[key];
const origin='https://billing-read.fixture.invalid';
Object.assign(process.env,{MC_MEMORY_STORE:'1',NODE_ENV:'test',URL:origin,PUBLIC_SITE_URL:origin,WORKSPACE_BILLING_ENABLED:'true',WORKSPACE_BILLING_APPROVED_VERSION:'projection_fixture'});
const store=await import('../netlify/functions/lib/store.mjs'),{newClient}=await import('../netlify/functions/lib/config.mjs'),{workspaceTenant}=await import('../netlify/functions/lib/workspace-identity.mjs'),handler=(await import('../netlify/functions/workspace-billing.mjs')).default;
const limits={webRepliesPerDay:50,practiceRepliesPerDay:20,voiceCallsPerDay:0,voiceReservedMinutesPerDay:0,maxCallSeconds:0,smsExposureMessages:0,smsExposureSegments:0,smsExposureCostMicros:0};
const offer={version:'projection_fixture',stripeAccountId:'acct_fixture_projection',currency:'usd',terms:{version:'terms_fixture',text:'Synthetic internal billing read projection only. No Checkout, provider transport, payment, commercial terms, service activation or customer permission is established by this fixture.',url:origin+'/terms-of-service.html'},plans:Object.fromEntries([['starter',9900],['growth',24900]].map(([plan,amountCents])=>[plan,{amountCents,priceId:'price_'+plan+'_fixture',services:['web'],limits,limitsDescription:'Synthetic saved-state maxima only; no paid entitlement or provider request is established by this read.'}]))};
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const boundOffer={...offer,digest:sha(JSON.stringify(canonical(offer)))};
process.env.WORKSPACE_BILLING_OFFER_JSON=JSON.stringify(offer);
const email='projection-owner@example.test',c=newClient({slug:'billing-read-fixture',ownerKey:'offline-incarnation-fixture',owner:{name:'Synthetic owner',email,phone:'+17135550140'},business:{name:'Synthetic shop',trade:'HVAC',serviceArea:['Katy']}});c.status='live';c.onboarding={version:1,desiredChannels:['web']};await store.put('clients',c.slug,c);
const token=sha('synthetic-owner-session');await store.put('access_sessions',sha(token),{scope:'onboarding',email,status:'active',expiresAt:new Date(Date.now()+3600000).toISOString()});
const row={slug:c.slug,tenant:workspaceTenant(c),livemode:false,customerId:'cus_saved_fixture',checkout:{id:'1'.repeat(32),requestId:'2'.repeat(32),state:'complete',offer:boundOffer,sessionId:'cs_test_saved_fixture'},subscription:{id:'sub_saved_fixture',status:'active',plan:'starter',services:['web'],cancelAtPeriodEnd:true}};await store.put('workspace_billing',c.slug+'/'+workspaceTenant(c),row);
const policy={version:offer.version,phaseId:'offline_read_fixture',issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+3*3600000).toISOString(),stripeAccountId:offer.stripeAccountId,offerDigest:boundOffer.digest,tenant:{slug:c.slug,identity:workspaceTenant(c),ownerEmailHash:sha(email)}};
const report={at:new Date().toISOString(),sourceBefore:hashes(),scope:'Actual owner billing read handler; synthetic retained subscription, no physical transport or credential file',checks:[]};
const cases=[
{name:'missing key retains saved financial state and old public metadata without offers',key:null,plans:2,available:false},
{name:'unsupported key retains saved financial state and old public metadata without offers',key:'unsupported_synthetic',plans:2,available:false},
{name:'LIVE closed approval preserves plan metadata while offers stay closed',key:'rk_live_synthetic',plans:2,available:false},
{name:'LIVE approved configuration retains existing metadata and explicit double gate',key:'rk_live_synthetic',live:true,plans:2,available:true},
{name:'LIVE purchase gate off preserves metadata and does not borrow TEST authority',key:'rk_live_synthetic',live:true,enabled:false,plans:2,available:false},
{name:'TEST policy absent hides offer metadata while retaining known financial state',key:'rk_test_synthetic',plans:0,available:false},
{name:'TEST exact policy displays metadata and new offer only for its owned incarnation',key:'rk_test_synthetic',policy,plans:2,available:true},
{name:'TEST expired policy hides metadata while renewal state remains readable',key:'rk_test_synthetic',policy:{...policy,expiresAt:new Date(Date.now()-1).toISOString()},plans:0,available:false}
];
for(const item of cases){delete process.env.STRIPE_SECRET_KEY;delete process.env.WORKSPACE_BILLING_LIVE_ENABLED;delete process.env.WORKSPACE_BILLING_TEST_PROOF_POLICY_JSON;process.env.WORKSPACE_BILLING_ENABLED=item.enabled===false?'false':'true';if(item.key)process.env.STRIPE_SECRET_KEY=item.key;if(item.live)process.env.WORKSPACE_BILLING_LIVE_ENABLED='true';if(item.policy)process.env.WORKSPACE_BILLING_TEST_PROOF_POLICY_JSON=JSON.stringify(item.policy);try{const response=await handler(new Request(origin+'/api/workspace-billing?c='+c.slug,{headers:{origin,authorization:'Bearer '+token}})),data=await response.json();assert.equal(response.status,200,JSON.stringify(data));assert.equal(data.billing.status,'active');assert.equal(data.billing.cancelAtPeriodEnd,true);assert.equal(data.billing.offerAvailable,item.available);assert.equal(data.billing.availablePlans.length,item.plans);assert.equal(data.billing.checkout.url,null);assert.equal(data.billing.portalAvailable,false);report.checks.push({name:item.name,pass:true});}catch(error){report.checks.push({name:item.name,pass:false,error:error.message});}}
report.sourceAfter=hashes();report.sourceStable=JSON.stringify(report.sourceBefore)===JSON.stringify(report.sourceAfter);report.physicalExternalRequests=physical;report.providerDispatches=provider;report.passed=report.checks.filter(x=>x.pass).length;report.total=report.checks.length;report.ok=report.passed===report.total&&report.sourceStable&&physical===0&&provider===0;writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({ok:report.ok,passed:report.passed,total:report.total,sourceStable:report.sourceStable,physicalExternalRequests:physical,providerDispatches:provider,output}));if(!report.ok)process.exitCode=1;
