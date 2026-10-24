// Verification infrastructure only. Importing this module performs no I/O or network.
import { open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_STRIPE_ACCOUNT } from './lib/stripe-public-proof.mjs';

export const HOSTED_ONBOARDING_SCOPE = 'hosted_onboarding_zaricoach_v1';
// Proposed ceilings only. No manifest in this repository grants live authority.
export const HOSTED_ONBOARDING_LIMITS = Object.freeze({total:240,platform:220,api:100,mutation:45,draft:14,asset:120,external:12,email:4,ownerEmail:3,operatorEmail:1,metadata:6,logical:10,bytes:35000000});
export const HOSTED_ONBOARDING_TARGET = Object.freeze({
  origin:'https://machinesandcloud.com',canonicalOrigin:'https://www.machinesandcloud.com',siteId:'f87916f1-bcc4-4171-a96f-2900cbf0b6dc',accountId:'69797d78f01c70674ffef858',accountSlug:'docteureminem',
  commit:'fc344d869086598accb8539ca2367dcb58dc9800',deployId:'6add0372cd11ef8c0a8a064f',
  externalOrigin:'https://zaricoach.com',externalPath:'/mc-front-desk-acceptance-20261023',pageExpiresAt:'2026-10-24T23:59:59Z',phaseId:'hosted-onboarding-stripe-20261024-v4',
  ownerEmail:'ngoumnaisteve+mc-zari-stripe-v4-20261024@gmail.com',operatorEmail:'ngoumnaisteve@gmail.com',ownerName:'Internal QA Owner',business:'MC Acceptance Zari',callback:'+17135550142'
});
export const HOSTED_ONBOARDING_GATES = Object.freeze(['PHONE_ACQUISITION_ENABLED','VOICE_ACTIVATION_ENABLED','MESSAGING_ACTIVATION_ENABLED','SERVICE_DELIVERY_ENABLED','CALENDAR_CONNECTION_ENABLED','CALENDAR_DELIVERY_ENABLED','MC_PLATFORM_SMS_ENABLED','WORKSPACE_BILLING_ENABLED','WORKSPACE_BILLING_LIVE_ENABLED']);
export const HOSTED_ONBOARDING_ASSETS = Object.freeze(['/','/index','/index.html','/onboard','/onboard.html','/desk','/desk.html','/admin','/admin.html','/styles.css','/site-refresh.css','/product-ui.css','/onboard.css','/desk.css','/desk-connections.css','/desk-billing.css','/admin.css','/script.js','/hero-photos.js','/agent-widget.js','/stories.js','/signup-intake.js','/onboard.js','/desk.js','/desk-connections.js','/desk-billing.js','/desk-requests.js','/desk-activity.js','/desk-visits.js','/desk-conversations.js','/desk-lead-sources.js','/desk-lead-sources.css','/admin.js','/embed.js','/assets/favicon.png','/assets/logo-dark.png','/assets/logo.png','/assets/photos/hero-hvac.jpg','/assets/photos/hero-electrician.jpg','/assets/photos/hero-home-repair.jpg','/assets/photos/cleaning.jpg']);
const T=HOSTED_ONBOARDING_TARGET,L=HOSTED_ONBOARDING_LIMITS;
const fileStores=new WeakMap();
const STATIC=new Set(HOSTED_ONBOARDING_ASSETS);
const ROLES=new Set(['owner','operator','anonymous','setup','visitor']);
const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const obj=v=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const exact=(v,keys)=>obj(v)&&Object.keys(v).every(k=>keys.includes(k));
const shape=(v,keys)=>exact(v,keys)&&Object.keys(v).length===keys.length;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const canonical=v=>Array.isArray(v)?v.map(canonical):obj(v)?Object.fromEntries(Object.keys(v).sort().map(key=>[key,canonical(v[key])])):v;
const digest=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(canonical(v))).digest('hex');
const fail=code=>{throw new GuardError(code);};
export class GuardError extends Error { constructor(code){super(`Hosted onboarding guard: ${code}`);this.name='GuardError';this.code=code;} }
const TIER0='Gas smell\nCarbon monoxide alarm\nSmoke or fire\nSparks or a burning smell from the panel or an outlet\nSewage flooding a living space';
const BILLING_KEYS=['WORKSPACE_BILLING_ENABLED','WORKSPACE_BILLING_STRIPE_SECRET_KEY','WORKSPACE_BILLING_APPROVED_VERSION','WORKSPACE_BILLING_OFFER_JSON','WORKSPACE_BILLING_WEBHOOK_SECRET','WORKSPACE_BILLING_TEST_PROOF_POLICY_JSON','WORKSPACE_BILLING_TEST_PHASE_JSON','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','WORKSPACE_BILLING_LIVE_ENABLED','WORKSPACE_BILLING_PORTAL_ENABLED','WORKSPACE_BILLING_PORTAL_CONFIGURATION_ID'];
const billingSnapshot=env=>Object.fromEntries(BILLING_KEYS.map(key=>[key,digest(key.endsWith('_ENABLED')?String(env[key]==='true'):env[key]||'')]));
export function verifyHostedBillingTestConfiguration(manifest,env,{slug,identity,now=Date.now()}={}){
  const declaration=manifest.billingTest;
  if(!shape(declaration,['version','stripeAccountId','offerDigest','credentialHash','webhookSecretHash'])||declaration.stripeAccountId!==PUBLIC_STRIPE_ACCOUNT||!/^[a-z0-9_-]{1,80}$/.test(declaration.version||'')||!['offerDigest','credentialHash','webhookSecretHash'].every(key=>hex(declaration[key])))fail('billing_test_manifest_required');
  if(env.WORKSPACE_BILLING_ENABLED!=='true'||env.WORKSPACE_BILLING_LIVE_ENABLED==='true'||env.WORKSPACE_BILLING_PORTAL_ENABLED==='true'||!/^(?:sk|rk)_test_[A-Za-z0-9_]+$/.test(env.WORKSPACE_BILLING_STRIPE_SECRET_KEY||'')||digest(env.WORKSPACE_BILLING_STRIPE_SECRET_KEY)!==declaration.credentialHash||!/^whsec_[A-Za-z0-9_]+$/.test(env.WORKSPACE_BILLING_WEBHOOK_SECRET||'')||digest(env.WORKSPACE_BILLING_WEBHOOK_SECRET)!==declaration.webhookSecretHash||env.WORKSPACE_BILLING_APPROVED_VERSION!==declaration.version)fail('billing_test_credentials_or_gates');
  let offer,cohort,phase;try{offer=JSON.parse(env.WORKSPACE_BILLING_OFFER_JSON);cohort=JSON.parse(env.WORKSPACE_BILLING_TEST_PROOF_POLICY_JSON);phase=JSON.parse(env.WORKSPACE_BILLING_TEST_PHASE_JSON);}catch{fail('billing_test_policy_not_bound');}
  const tenant={slug,identity,ownerEmailHash:digest(T.ownerEmail)},limits={webRepliesPerDay:50,practiceRepliesPerDay:20,voiceCallsPerDay:0,voiceReservedMinutesPerDay:0,maxCallSeconds:0,smsExposureMessages:0,smsExposureSegments:0,smsExposureCostMicros:0};
  if(!shape(offer,['version','stripeAccountId','currency','terms','plans'])||offer.version!==declaration.version||offer.stripeAccountId!==PUBLIC_STRIPE_ACCOUNT||offer.currency!=='usd'||digest(offer)!==declaration.offerDigest||!shape(offer.terms,['version','text','url'])||!/^[a-z0-9_-]{1,80}$/.test(offer.terms.version||'')||typeof offer.terms.text!=='string'||offer.terms.text.length<100||offer.terms.text.length>20000||offer.terms.url!==T.origin+'/terms-of-service.html'||!shape(offer.plans,['starter','growth']))fail('billing_test_offer_not_bound');
  for(const [plan,amount] of [['starter',9900],['growth',24900]]){const choice=offer.plans[plan];if(!shape(choice,['amountCents','priceId','services','limits','limitsDescription'])||choice.amountCents!==amount||!/^price_[A-Za-z0-9_]{3,160}$/.test(choice.priceId||'')||!same(choice.services,['web'])||!same(canonical(choice.limits),canonical(limits))||typeof choice.limitsDescription!=='string'||choice.limitsDescription.length<40||choice.limitsDescription.length>3000)fail('billing_test_offer_not_bound');}
  const common=['version','phaseId','issuedAt','expiresAt','stripeAccountId','offerDigest','tenant'];
  if(!shape(cohort,common)||!shape(phase,[...common,'maxAttempts','cleanupReserve','cleanupOnExpiry'])||!same(canonical(Object.fromEntries(common.map(key=>[key,phase[key]]))),canonical(cohort))||cohort.version!==declaration.version||cohort.phaseId!==manifest.phaseId||cohort.stripeAccountId!==PUBLIC_STRIPE_ACCOUNT||cohort.offerDigest!==declaration.offerDigest||!same(canonical(cohort.tenant),canonical(tenant))||cohort.expiresAt!==manifest.expiresAt||!Number.isFinite(Date.parse(cohort.issuedAt))||Date.parse(cohort.issuedAt)>now||Date.parse(cohort.expiresAt)<=now||Date.parse(cohort.expiresAt)-Date.parse(cohort.issuedAt)>4*3600000||Date.parse(cohort.expiresAt)<=Date.parse(cohort.issuedAt)||phase.maxAttempts!==80||phase.cleanupReserve!==20||phase.cleanupOnExpiry!==true)fail('billing_test_policy_not_bound');
  return {version:declaration.version,phaseId:manifest.phaseId,stripeAccountId:PUBLIC_STRIPE_ACCOUNT,offerDigest:declaration.offerDigest,tenantIdentity:identity,maxAttempts:80,cleanupReserve:20};
}

function validateManifest(m,mode,now){
  if(!exact(m,['version','scope','phaseId','approved','approvalId','approvedAt','expiresAt','ownerMailboxConfirmed','callbackApproved','targets','limits','release','baselineGates','assets','signupAssets','signupRelease','cleanupRelease','billingTest'])||m.version!==2||m.scope!==HOSTED_ONBOARDING_SCOPE||m.phaseId!==T.phaseId)fail('invalid_manifest');
  if(m.billingTest!==undefined&&(!shape(m.billingTest,['version','stripeAccountId','offerDigest','credentialHash','webhookSecretHash'])||m.billingTest.stripeAccountId!==PUBLIC_STRIPE_ACCOUNT||!/^[a-z0-9_-]{1,80}$/.test(m.billingTest.version||'')||!['offerDigest','credentialHash','webhookSecretHash'].every(key=>hex(m.billingTest[key]))))fail('billing_test_manifest_required');
  if(!same(m.targets,T)||!same(m.limits,L))fail('manifest_target_or_limits');
  if(!exact(m.release,['commit','deployId','sourceManifestSHA256'])||!/^([a-f0-9]{40})$/.test(m.release.commit||'')||!(m.release.deployId===null||/^([a-f0-9]{24})$/.test(m.release.deployId||''))||!hex(m.release.sourceManifestSHA256))fail('invalid_release_binding');
  if(!exact(m.cleanupRelease,['commit','deployId','sourceManifestSHA256'])||!/^([a-f0-9]{40})$/.test(m.cleanupRelease.commit||'')||!(m.cleanupRelease.deployId===null||/^([a-f0-9]{24})$/.test(m.cleanupRelease.deployId||''))||m.cleanupRelease.deployId!==null&&m.cleanupRelease.deployId===m.release.deployId||!hex(m.cleanupRelease.sourceManifestSHA256))fail('cleanup_release_required');
  if(!exact(m.signupRelease,['commit','deployId','sourceManifestSHA256'])||!/^([a-f0-9]{40})$/.test(m.signupRelease.commit||'')||!(m.signupRelease.deployId===null||/^([a-f0-9]{24})$/.test(m.signupRelease.deployId||''))||!hex(m.signupRelease.sourceManifestSHA256))fail('invalid_signup_release');
  if(!obj(m.baselineGates)||!same(Object.keys(m.baselineGates).sort(),[...HOSTED_ONBOARDING_GATES].sort())||Object.values(m.baselineGates).some(v=>typeof v!=='boolean')||HOSTED_ONBOARDING_GATES.filter(k=>!k.startsWith('CALENDAR_')).some(k=>m.baselineGates[k]))fail('invalid_baseline_gates');
  for(const assets of [m.assets,m.signupAssets])if(!obj(assets)||!same(Object.keys(assets).sort(),[...STATIC].sort())||Object.values(assets).some(v=>!hex(v)&&(!Array.isArray(v)||v.length<1||v.length>4||new Set(v).size!==v.length||v.some(x=>!hex(x)))))fail('invalid_asset_binding');
  if(!['offline','live'].includes(mode))fail('invalid_mode');
  if(!Number.isFinite(Date.parse(m.expiresAt))||Date.parse(m.expiresAt)<=now||Date.parse(m.expiresAt)>Date.parse(T.pageExpiresAt))fail('phase_expired');
  if(mode==='live'&&(m.approved!==true||m.ownerMailboxConfirmed!==true||m.callbackApproved!==true||!/^approval-[a-zA-Z0-9-]{4,100}$/.test(m.approvalId||'')||!Number.isFinite(Date.parse(m.approvedAt))||Date.parse(m.approvedAt)>now+60000||Date.parse(m.expiresAt)-Date.parse(m.approvedAt)>4*3600000))fail('approval_required');
  if(mode==='live'&&!m.billingTest)fail('billing_test_manifest_required');
  if(mode==='offline'&&m.approved===true)fail('offline_manifest_must_not_claim_approval');
}

/** Exclusive, append-only JSONL phase ledger. Existing files never reset/resume. */
export function hostedOnboardingLedgerPath(phaseId){if(phaseId!==T.phaseId)fail('invalid_phase_id');return fileURLToPath(new URL('../scratchpad/'+phaseId+'-ledger.jsonl',import.meta.url));}
export function fileGuardPersistence(file){
  let handle;
  const persistence=Object.freeze({
    async create(value){try{handle=await open(file,'wx',0o600);}catch(e){if(e.code==='EEXIST')return false;throw e;}await handle.writeFile(JSON.stringify(value)+'\n');await handle.sync();return true;},
    async append(value){if(!handle)fail('ledger_not_open');await handle.writeFile(JSON.stringify(value)+'\n');await handle.sync();},
    async close(){await handle?.close();handle=null;}
  });fileStores.set(persistence,resolve(file));return persistence;
}

/**
 * All response bodies / bearers / message tokens and the one tenant binding live
 * only in this instance. A new process must use a newly approved phase, not resume
 * a partial ledger whose unknown effects or credentials cannot be reconstructed.
 */
export async function createHostedOnboardingGuard({manifest,persistence,mode='offline',now=()=>Date.now()}={}){
  validateManifest(manifest,mode,now());
  manifest=structuredClone(manifest);
  if(mode==='live'&&fileStores.get(persistence)!==hostedOnboardingLedgerPath(manifest.phaseId))fail('live_durable_phase_ledger_required');
  if(!persistence||typeof persistence.create!=='function'||typeof persistence.append!=='function')fail('durable_persistence_required');
  let counts=Object.fromEntries(Object.keys(L).map(k=>[k,0])),records=[],poisoned=false,closed=false,halted=false,serial=Promise.resolve(),seq=0;
  const privateRequests=new Map(), contexts=new Map(), sessions=new Map(), revoked=new Set(), links=new Map(), used=new Set();
  let siteOK=false,gatesOK=false,releaseOK=false,proofOK=false,cleanupReleaseOK=false,operatorAbsent=false,ownerEmpty=false,preflightRevoked=false,preflightRevocationVerified=false,mainRevoked=false;
  let handoff=null,binding=null,creationFingerprint=null,managementRevision=null,configurationRevision=null,createAttempts=0;
  let currentOwnerStage=null,currentOperatorStage=null,lastDraftRevision=null,editRevision=null,tenantIdentity=null,checkBinding=null,webActive=false,billingBaseline=null;
  let ownerRevisionEpoch=0,ownerRevisionObservedId=0;
  const deploymentBindings={signup:null,proof:null,cleanup:null};let workspaceCancelled=false,configurationClosed=false;
  const contacts=new Map(),pendingTurns=new Set(),recordIDs=new Set(),internalToken=Symbol('phase-internal-dispatch');let workerKeyHash=null;
  const externalURL=()=>T.externalOrigin+T.externalPath+'?client='+binding.slug+'&phase='+manifest.phaseId;
  const snapshot=()=>({version:1,scope:HOSTED_ONBOARDING_SCOPE,phaseId:manifest.phaseId,mode,counters:{...counts},halted,closed,deploymentBindings:structuredClone(deploymentBindings),cleanup:{platformComplete:cleanupReleaseOK&&configurationClosed&&workspaceCancelled&&[...sessions.keys()].every(token=>revoked.has(token))&&![...privateRequests.values()].some(r=>r.mutation&&(r.outcome!=='completed'||typeof records.find(x=>x.id===r.id)?.status!=='number'||records.find(x=>x.id===r.id).status>=500)),deploymentVerified:cleanupReleaseOK,configurationClosed,workspaceCancelled,activeSessions:[...sessions.keys()].filter(token=>!revoked.has(token)).length,unconfirmedMutations:[...privateRequests.values()].filter(r=>r.mutation&&(r.outcome!=='completed'||typeof records.find(x=>x.id===r.id)?.status!=='number'||records.find(x=>x.id===r.id).status>=500)).map(r=>({id:r.id,action:r.action})),externalSiteRollback:'outside this platform guard; requires separate exact route removal/readback'},records:structuredClone(records)});
  if(!await persistence.create(snapshot()))fail('phase_ledger_already_exists');
  async function persist(){try{await persistence.append(snapshot());}catch{poisoned=true;fail('ledger_persistence_failed');}}
  const exclusive=fn=>{const result=serial.then(fn);serial=result.catch(()=>{});return result;};
  const authStage=role=>role==='operator'?currentOperatorStage:currentOwnerStage;
  const knownBearer=(role,headers,{allowRevoked=false}={})=>{
    const raw=headers.get('authorization')||'', match=/^Bearer ([a-f0-9]{64})$/.exec(raw);
    if(!match||!sessions.has(match[1])||sessions.get(match[1]).role!==role||(!allowRevoked&&revoked.has(match[1])))fail('phase_session_required');
    return {token:match[1],...sessions.get(match[1])};
  };
  const cleanupNeed=()=>[...sessions.entries()].filter(([token])=>!revoked.has(token)).length+(binding&&!used.has('cancel_service')?1:0);
  const ensureRole=role=>{if(!ROLES.has(role))fail('invalid_context_role');};
  function query(url,allowed){const keys=[...url.searchParams.keys()];if(keys.some(k=>!allowed.includes(k))||new Set(keys).size!==keys.length)fail('query_not_allowed');}
  function tenantQuery(url,{exportAllowed=false}={}){query(url,exportAllowed?['c','export']:['c']);if(!binding||url.searchParams.get('c')!==binding.slug)fail('unbound_or_other_tenant');if(url.searchParams.has('export')&&url.searchParams.get('export')!=='bookings')fail('export_not_allowed');}
  function fields(input,{create=false}={}){
    if(!obj(input))fail('invalid_fields');
    const values={name:T.ownerName,email:T.ownerEmail,phone:T.callback,business:T.business,plan:'starter',primaryGoal:'booking',setupVersion:'2',trade:'Internal QA',city:'Houston',services:'Internal acceptance fixture; no customer service offered',hours:'Mon to Fri 8 to 5',serviceArea:'Houston',spanish:'no',windows:'8 to 12\n12 to 5',notes:`Internal controlled website proof ${manifest.phaseId}; synthetic details only. No phone, text, Calendar or payment action.`,tier0:TIER0,tier1:''};
    const blank=['website','afterHours','notServed','licenses','fees','faq','handoff','never','emergencies','greeting','botfield'];
    for(const [k,v]of Object.entries(input)){
      if(k==='desiredChannels'){if(!same(v,['web']))fail('paid_channel_preference');}
      else if(k==='leadSources'){if(!same(v,[]))fail('unexpected_lead_source');}
      else if(k==='hoursTable'){
        let h;try{h=typeof v==='string'?JSON.parse(v):v;}catch{fail('invalid_hours');}
        const days=['mon','tue','wed','thu','fri','sat','sun'];
        if(!exact(h,days)||Object.keys(h).length!==7||Object.entries(h).some(([day,x])=>x!==null&&(!days.slice(0,5).includes(day)||!same(x,{open:'08:00',close:'17:00'}))))fail('invalid_hours');
      }else if(blank.includes(k)){if(v!=='')fail('unexpected_authority_or_value');}
      else if(Object.hasOwn(values,k)){let check=v;if(k==='phone')check=String(v).replace(/[^\d+]/g,'');if(k==='phone'&&/^\d{10}$/.test(check))check='+1'+check;if(!create&&k==='spanish'&&check==='yes')continue;if(check!==values[k]&&(!create&&check===''))continue;if(check!==values[k])fail('wrong_fixture_value');}
      else fail('field_not_allowed');
    }
    if(create&&(!['name','email','phone','business','plan','primaryGoal','desiredChannels'].every(k=>Object.hasOwn(input,k))||input.name!==T.ownerName||input.email!==T.ownerEmail||input.business!==T.business||input.plan!=='starter'||input.primaryGoal!=='booking'||!same(input.desiredChannels,['web'])))fail('incomplete_create_identity');
  }
  function validateProject({role,url:raw,method='GET',headers:rawHeaders={},body}){
    ensureRole(role);let url;try{url=new URL(raw);}catch{fail('invalid_url');}
    if(![T.origin,T.canonicalOrigin,T.externalOrigin].includes(url.origin)||url.username||url.password||url.hash)fail('origin_or_fragment_not_allowed');
    const headers=new Headers(rawHeaders);method=String(method).toUpperCase();
    if(headers.has('cookie')||headers.has('x-admin-key')||headers.has('x-vapi-secret')||headers.has('x-service-worker-key'))fail('inherited_or_private_credentials');
    if(headers.has('origin')&&headers.get('origin')!==(['setup','visitor'].includes(role)?T.externalOrigin:T.origin))fail('wrong_origin');
    const api=url.pathname.startsWith('/api/'),mutation=['POST','PUT'].includes(method);
    const visitor=['setup','visitor'].includes(role);
    if(url.origin===T.externalOrigin){
      query(url,['client','phase']);
      if(!visitor||method!=='GET'||body!==undefined&&body!==null&&body!==''||headers.has('authorization')||!binding||url.pathname!==T.externalPath||url.searchParams.get('client')!==binding.slug||url.searchParams.get('phase')!==manifest.phaseId||[...url.searchParams].length!==2||!releaseOK||!proofOK)fail('external_route_not_allowed');
      return {role,url,method,api:false,mutation:false,external:true,action:'external_page',cleanup:false};
    }
    if(url.origin===T.canonicalOrigin&&(api||headers.has('authorization')||!STATIC.has(url.pathname)))fail('canonical_private_request');
    if(visitor&&(!binding||!releaseOK||!proofOK))fail('proof_configuration_required');

    if(!api){
      if(visitor&&url.pathname!=='/embed.js')fail('visitor_static_not_allowed');
      if(method!=='GET'||body!==undefined&&body!==null&&body!==''||!STATIC.has(url.pathname))fail('static_path_not_allowed');
      if(headers.has('authorization'))fail('credential_on_static_request');
      if(['/','/index','/index.html'].includes(url.pathname)){query(url,['plan']);if(url.search&&url.searchParams.get('plan')!=='starter')fail('wrong_plan');}
      else if(['/onboard','/onboard.html'].includes(url.pathname)){query(url,['plan','signin']);if(url.searchParams.has('plan')&&url.searchParams.get('plan')!=='starter'||url.searchParams.has('signin')&&url.searchParams.get('signin')!=='1')fail('page_query_not_allowed');}
      else if(['/desk','/desk.html'].includes(url.pathname)){tenantQuery(url);}
      else query(url,[]);
      return {role,url,method,api:false,mutation:false,action:'asset',cleanup:false};
    }
    if(!['/api/access','/api/intake','/api/onboard','/api/client','/api/manage','/api/workspace-billing','/api/website-installation','/api/chat'].includes(url.pathname)||!['GET','POST','PUT','OPTIONS'].includes(method))fail('api_not_allowed');
    if(mutation&&(!siteOK||!gatesOK))fail('metadata_preflight_required');
    if(method==='OPTIONS'){
      query(url,[]);if(!visitor||!['/api/chat','/api/website-installation'].includes(url.pathname)||headers.get('origin')!==T.externalOrigin||headers.get('access-control-request-method')!=='POST'||headers.get('access-control-request-headers')?.toLowerCase()!=='content-type'||headers.has('authorization')||body)fail('preflight_not_allowed');
      return {role,url,method,api:true,mutation:false,action:'preflight',cleanup:false};
    }

    let b=body;
    if(mutation){if(!headers.get('content-type')?.toLowerCase().startsWith('application/json'))fail('json_required');if(typeof body==='string'){if(Buffer.byteLength(body)>32000)fail('body_too_large');try{b=JSON.parse(body);}catch{fail('invalid_json');}}if(!obj(b))fail('invalid_body');}
    else if(body!==undefined&&body!==null&&body!=='')fail('get_body_not_allowed');
    let action=method==='GET'?'read':b.action||'',cleanup=false,emailSlot=null,bearer=null;
    const result=()=>({role,url,method,api:true,mutation,action,cleanup,emailSlot,bearer,body:b});
    if(url.pathname==='/api/workspace-billing'){
      tenantQuery(url);if(method!=='GET'||role!=='owner')fail('billing_write_not_allowed');bearer=knownBearer(role,headers);return result();
    }
    if(url.pathname==='/api/website-installation'){
      query(url,[]);if(role!=='setup'||method!=='POST'||!checkBinding||headers.has('authorization')||headers.get('origin')!==T.externalOrigin||!exact(b,['action','client','checkId','challenge','turnId','completionRef'])||b.client!==binding.slug||b.checkId!==checkBinding.id||b.challenge!==checkBinding.challenge||!['observe','status','acknowledge'].includes(action)||b.turnId!==undefined&&!/^[a-f0-9]{32}$/.test(b.turnId)||action==='acknowledge'&&!hex(b.completionRef))fail('website_check_not_bound');return result();
    }
    if(url.pathname==='/api/chat'){
      query(url,[]);if(method!=='POST'||!binding||!releaseOK||!proofOK||!exact(b,['client','key','contact','messages','channel','stream','page','websiteCheck','turnId'])||b.client!==binding.slug||b.stream!==true||!Array.isArray(b.messages)||!b.messages.length||b.messages.length>20||b.messages.some((m,i)=>!exact(m,['role','content'])||m.role!==(i%2?'assistant':'user')||typeof m.content!=='string'||!m.content.trim()||m.content.length>6000)||b.messages.length%2!==1)fail('chat_not_bound');
      if(role==='owner'){bearer=knownBearer(role,headers);if(b.key!==null||b.channel!=='test'||b.websiteCheck!==undefined||b.page!==undefined||b.turnId!==undefined)fail('private_chat_not_allowed');}
      else{
        if(b.key!==undefined||!visitor||headers.has('authorization')||headers.get('origin')!==T.externalOrigin||b.page!==T.externalPath||b.channel!==undefined||!/^[a-f0-9]{32}$/.test(b.turnId||''))fail('visitor_chat_not_allowed');
        if(role==='setup'){if(!checkBinding||!exact(b.websiteCheck,['checkId','challenge','turnId'])||b.websiteCheck.checkId!==checkBinding.id||b.websiteCheck.challenge!==checkBinding.challenge||!/^([a-f0-9]{32})$/.test(b.websiteCheck.turnId||'')||b.contact!=='websitecheck_'+checkBinding.id)fail('setup_chat_not_bound');}
        else if(b.websiteCheck!==undefined||typeof b.contact!=='string'||!/^w[a-z0-9]{8,35}$/.test(b.contact))fail('ordinary_chat_not_allowed');
      }
      if(typeof b.contact!=='string'||contacts.has(role)&&contacts.get(role)!==b.contact)fail('chat_contact_changed');
      const turn=hash([role,b.contact,b.messages]);if(pendingTurns.has(turn))fail('chat_repeat_requires_reconciliation');
      return {...result(),action:'chat',turn};
    }
    if(visitor&&!(method==='GET'&&url.pathname==='/api/client'))fail('visitor_api_not_allowed');

    if(url.pathname==='/api/access'||url.pathname==='/api/manage'){
      const isManage=url.pathname==='/api/manage', ownRole=isManage?'operator':'owner';
      if(method==='GET'){
        if(isManage){if(url.searchParams.has('c'))tenantQuery(url);else{query(url,['cursor']);if(url.searchParams.has('cursor')&&!/^[a-z0-9-]{1,40}$/.test(url.searchParams.get('cursor')))fail('invalid_cursor');}}
        else query(url,[]);
        if(role==='anonymous'){if(headers.has('authorization'))fail('anonymous_credentials');}
        else bearer=knownBearer(role,headers,{allowRevoked:true});
        return result();
      }
      query(url,[]);if(role!==ownRole)fail('wrong_action_context');
      if(action==='request_link'){
        if(!exact(b,isManage?['action','email']:['action','email','plan','intake'])||b.email!==T[isManage?'operatorEmail':'ownerEmail']||headers.has('authorization'))fail('wrong_mail_target');
        if(isManage){if(currentOperatorStage)fail('email_retry_not_allowed');emailSlot='operator';}
        else if(!currentOwnerStage){if(!operatorAbsent||b.intake!==undefined||b.plan!=='starter')fail('owner_preflight_not_ready');emailSlot='owner_preflight';}
        else if(preflightRevoked&&handoff&&!used.has('mail:owner_signup')){if(b.intake!==handoff||b.plan!=='starter')fail('intake_binding_required');emailSlot='owner_signup';}
        else if(mainRevoked&&binding&&!used.has('mail:owner_return')){if(b.intake!==undefined||b.plan!=='starter')fail('return_identity_required');emailSlot='owner_return';}
        else fail('email_retry_not_allowed');
        if(used.has('mail:'+emailSlot))fail('email_retry_not_allowed');
      }else if(action==='exchange'){
        if(!exact(b,['action','token'])||!hex(b.token)||headers.has('authorization'))fail('invalid_exchange');
        const link=links.get(b.token);if(!link||link.role!==role||used.has('exchange:'+b.token))fail('unregistered_or_retried_link');
      }else if(action==='sign_out'){
        if(!exact(b,['action']))fail('invalid_signout');bearer=knownBearer(role,headers);if(used.has('signout:'+bearer.token))fail('signout_retry_not_allowed');cleanup=true;
      }else if(!isManage&&method==='PUT'){
        action='save_draft';if(!exact(b,['fields','step','revision','marketingConsent'])||!Number.isInteger(b.step)||b.step<0||b.step>3||!Number.isInteger(b.revision)||b.revision!==lastDraftRevision||b.marketingConsent!==undefined&&b.marketingConsent!==false)fail('invalid_draft_or_marketing');
        bearer=knownBearer(role,headers);if(bearer.stage!=='owner_signup'||!ownerEmpty||!handoff||binding)fail('draft_not_authorized');fields(b.fields);
      }else if(!isManage&&action==='attach_intake'){
        if(!exact(b,['action','intake'])||b.intake!==handoff||used.has('attach_intake'))fail('invalid_intake_attachment');bearer=knownBearer(role,headers);if(bearer.stage!=='owner_signup')fail('wrong_owner_stage');
      }else if(isManage&&['save_note','cancel_service'].includes(action)){
        if(!binding||!managementRevision||!exact(b,action==='save_note'?['action','slug','expectedRevision','reason','text']:['action','slug','expectedRevision','reason'])||b.slug!==binding.slug||b.expectedRevision!==managementRevision||used.has(action))fail('operator_target_or_retry');
        bearer=knownBearer(role,headers);
        if(action==='save_note'){const note=`Internal hosted onboarding acceptance ${manifest.phaseId}; no service activation.`;if(b.reason!==note||b.text!==note)fail('wrong_note');}
        else{if(b.reason!==`Internal acceptance complete ${manifest.phaseId}; retain test records.`)fail('wrong_cancel_reason');cleanup=true;}
      }else fail('action_not_allowed');
      return result();
    }
    if(url.pathname==='/api/intake'){
      query(url,[]);if(role!=='owner'||method!=='POST'||!ownerEmpty||!preflightRevoked||!preflightRevocationVerified||!operatorAbsent||used.has('intake')||headers.has('authorization'))fail('intake_not_authorized');
      if(!exact(b,['submissionId','name','email','business','trade','goal','marketingConsent','botfield'])||!/^(?:[a-f0-9]{32,64}|[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/i.test(b.submissionId||'')||b.name!==T.ownerName||b.email!==T.ownerEmail||b.business!==T.business||b.trade!==''||b.goal!=='booking'||b.marketingConsent!==false||b.botfield!=='')fail('wrong_intake_fixture');
      action='intake';return result();
    }
    if(url.pathname==='/api/client'&&method==='GET'&&role==='owner'&&url.searchParams.has('requestId')){query(url,['c','requestId']);if(!binding||url.searchParams.get('c')!==binding.slug||!recordIDs.has(url.searchParams.get('requestId')))fail('unbound_request_record');bearer=knownBearer(role,headers);action='read_request';return result();}
    tenantQuery(url,{exportAllowed:url.pathname==='/api/client'});
    if(method==='GET'){
      if(role==='anonymous'||visitor){if(headers.has('authorization'))fail('anonymous_credentials');}
      else bearer=knownBearer(role,headers,{allowRevoked:true});
      return result();
    }
    if(url.pathname==='/api/onboard')fail('onboard_query_not_allowed');

    if(role!=='owner')fail('client_action_not_allowed');
    if(method==='PUT'){
      if(!hex(configurationRevision)||!hex(editRevision)||b.expectedRevision!==configurationRevision||b.expectedEditRevision!==editRevision)fail('stale_owner_revision');
      if(exact(b,['expectedRevision','expectedEditRevision','business'])&&exact(b.business,['website'])&&b.business.website===externalURL()&&!used.has('save_website'))action='save_website';
      else if(exact(b,['expectedRevision','expectedEditRevision','widget'])&&exact(b.widget,['allowedOrigins'])&&same(b.widget.allowedOrigins,[T.externalOrigin])&&!used.has('allow_origin'))action='allow_origin';
      else fail('workspace_update_not_allowed');
    }else if(method==='POST'&&action==='review_rules'){
      if(!exact(b,['action','revision'])||b.revision!==configurationRevision||!hex(b.revision)||used.has('review_rules'))fail('client_action_not_allowed');
    }else if(method==='POST'&&action==='start_website_check'){
      if(!exact(b,['action','expectedRevision','expectedEditRevision','origin'])||b.expectedRevision!==configurationRevision||b.expectedEditRevision!==editRevision||b.origin!==T.externalOrigin||used.has(action)||!proofOK)fail('website_start_not_allowed');
    }else if(method==='POST'&&action==='pause'){
      if(!exact(b,['action'])||used.has(action)||!webActive)fail('pause_not_allowed');cleanup=true;
    }else if(method==='POST'&&action==='go_live'){
      if(!exact(b,['action'])||used.has(action)||!proofOK)fail('activation_not_allowed');
    }else fail('client_action_not_allowed');
    bearer=knownBearer(role,headers);return result();
  }
  // Creation has no query/slug yet; handled separately rather than granting a wildcard.
  function classify(input){
    const u=new URL(input.url);
    if(input.internal===internalToken){
      const h=new Headers(input.headers),b=input.body;if(!proofOK||!binding||u.href!==T.origin+'/api/managed-delivery-background'||input.method!=='POST'||b!=='{}'||h.has('authorization')||h.has('cookie')||!workerKeyHash||createHash('sha256').update(h.get('x-service-worker-key')||'').digest('hex')!==workerKeyHash||used.has('internal_dispatch'))fail('internal_dispatch_not_allowed');
      return {role:'server',url:u,method:'POST',api:true,mutation:true,action:'internal_dispatch',cleanup:true,body:b};
    }
    if(u.origin===T.origin&&u.pathname==='/api/onboard'&&String(input.method||'GET').toUpperCase()==='POST'){
      if(u.search||u.hash||u.username||u.password)fail('onboard_query_not_allowed');
      ensureRole(input.role);if(input.role!=='owner'||!siteOK||!gatesOK||!ownerEmpty||!handoff)fail('create_not_authorized');
      const h=new Headers(input.headers||{});if(h.has('cookie')||h.has('x-admin-key')||h.has('origin')&&h.get('origin')!==T.origin||!h.get('content-type')?.startsWith('application/json'))fail('create_headers');
      const bearer=knownBearer('owner',h);if(bearer.stage!=='owner_signup')fail('create_owner_stage');
      let b=input.body;try{if(typeof b==='string'){if(Buffer.byteLength(b)>32000)fail('body_too_large');b=JSON.parse(b);}}catch{fail('invalid_json');}fields(b,{create:true});
      if(createAttempts>=2||creationFingerprint&&creationFingerprint!==hash(b))fail('create_retry_or_payload_changed');
      if(createAttempts&&[...privateRequests.values()].some(x=>x.action==='create_workspace'&&x.outcome!=='completed'))fail('unknown_create_no_blind_retry');
      return {role:'owner',url:u,method:'POST',api:true,mutation:true,action:'create_workspace',cleanup:false,bearer,body:b};
    }
    return validateProject(input);
  }
  async function recordDenial(code,method='GET'){
    halted=true;const at=now();records.push({id:++seq,method:['GET','POST','PUT','OPTIONS'].includes(method)?method:'OTHER',path:'/blocked',queryNames:[],action:'denied_request',status:'blocked',reason:code,startedAt:at,completedAt:at,elapsedMs:0,counters:{...counts}});await persist();
  }
  async function reserveProjectRequest(input){return exclusive(async()=>{
    try{
    if(closed||poisoned)fail('guard_closed_or_poisoned');
    const r=classify(input);if(halted&&r.api&&r.method==='GET')r.cleanup=true;if(halted&&!r.cleanup&&r.mutation)fail('phase_halted');
    if(Date.parse(manifest.expiresAt)<=now()&&!r.cleanup)fail('phase_expired');
    const next={...counts,total:counts.total+1};
    if(r.external)next.external++;else{next.platform++;next[r.api?'api':'asset']++;}
    if(r.action==='chat')next.logical++;
    if(r.mutation)next.mutation++;if(r.action==='save_draft')next.draft++;
    if(r.emailSlot){next.email++;next[r.role==='owner'?'ownerEmail':'operatorEmail']++;}
    for(const k of Object.keys(L))if(next[k]>L[k])fail('budget_'+k);
    const needed=cleanupNeed()-(r.cleanup&&r.mutation?1:0);
    if(next.total+needed>L.total||r.api&&next.api+needed>L.api||r.mutation&&next.mutation+needed>L.mutation)fail('cleanup_reserve');
    if(!r.cleanup&&(next.total+needed+8>L.total||r.api&&next.api+needed+8>L.api||r.mutation&&next.mutation+needed>L.mutation))fail('cleanup_reserve');
    counts=next;
    const id=++seq,at=now();
    records.push({id,method:r.method,path:r.url.pathname,queryNames:[...r.url.searchParams.keys()].sort(),action:r.action,status:'reserved_unknown',startedAt:at,counters:{...counts}});
    // A GET begun before or during a configuration mutation must not replace its result.
    if(r.role==='owner'&&r.url.pathname==='/api/client'&&r.mutation)ownerRevisionEpoch++;
    privateRequests.set(id,{...r,id,at,ownerRevisionEpoch,outcome:'reserved_unknown'});
    if(r.emailSlot){used.add('mail:'+r.emailSlot);if(r.role==='owner')currentOwnerStage=r.emailSlot;else currentOperatorStage='operator';}
    if(r.action==='exchange')used.add('exchange:'+r.body.token);
    if(r.action==='sign_out')used.add('signout:'+r.bearer.token);
    if(['intake','attach_intake','save_note','cancel_service','review_rules','save_website','allow_origin','start_website_check','go_live','pause','internal_dispatch'].includes(r.action))used.add(r.action);
    if(r.action==='create_workspace'){createAttempts++;creationFingerprint=hash(r.body);}
    if(r.action==='chat'){contacts.set(r.role,r.body.contact);pendingTurns.add(r.turn);}
    await persist();return id;
    }catch(e){if(e instanceof GuardError&&!poisoned&&!closed)await recordDenial(e.code,String(input.method||'GET').toUpperCase());throw e;}
  });}
  function bindClient(client,slug){
    if(!obj(client)||client.business?.name!==T.business||client.owner?.email!==T.ownerEmail||client.owner?.name!==T.ownerName||client.owner?.phone!==T.callback||client.summary!==`Internal controlled website proof ${manifest.phaseId}; synthetic details only. No phone, text, Calendar or payment action.`||client.onboarding?.version!==1||client.onboarding?.verifiedEmail!==T.ownerEmail||client.status!=='testing'||client.channels?.web?.active!==false||client.channels?.voice?.active!==false||client.channels?.sms?.active!==false||client.build?.status!=='built'||client.build?.source!=='owner_answers'||!Number.isFinite(Date.parse(client.createdAt))||Date.parse(client.createdAt)<Date.parse(manifest.approvedAt||new Date(now()-60000).toISOString())-60000||Date.parse(client.createdAt)>now()+60000||Object.hasOwn(client,'ownerKey'))fail('created_identity_not_verified');
    const base=T.business.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,32);
    if(!new RegExp('^'+base+'-[a-f0-9]{4}$').test(slug||'')||client.slug!==slug||binding&&binding.slug!==slug)fail('different_created_tenant');
    binding={slug,createdAt:client.createdAt};
  }
  function observe(r,status,b){
    if(r.method==='GET'){
      const denial=r.role==='anonymous'&&['/api/access','/api/manage','/api/onboard'].includes(r.url.pathname)||r.role==='anonymous'&&r.url.searchParams.has('export')||r.role==='owner'&&r.url.pathname==='/api/manage'||r.role==='operator'&&['/api/client','/api/onboard','/api/access'].includes(r.url.pathname);
      if(denial){if(status!==401)fail('expected_access_denial_missing');return;}
      if(['anonymous','setup','visitor'].includes(r.role)&&r.url.pathname==='/api/client'){
        if(status!==200||!exact(b,['slug','status','name','greeting','spanish','businessNumber','webAvailable'])||b.slug!==binding?.slug||b.webAvailable!==webActive)fail('public_view_exposed_private_data');return;
      }
    }
    if(r.method==='OPTIONS'){if(status!==204)fail('preflight_failed');return;}
    if(r.method==='GET'&&r.bearer&&revoked.has(r.bearer.token)){
      if(status!==401)fail('revoked_session_not_rejected');
      if(r.url.pathname==='/api/access'&&r.bearer.stage==='owner_preflight')preflightRevocationVerified=true;
    }
    if(status>=400){if(r.mutation)halted=true;return;}
    if(r.role==='owner'&&r.url.pathname==='/api/client'&&r.mutation)ownerRevisionEpoch++;
    if(r.action==='pause'){if(b?.ok!==true)fail('pause_unconfirmed');webActive=false;}
    if(r.action==='go_live'){if(b?.ok!==true)fail('activation_unconfirmed');webActive=true;}
    if(r.action==='start_website_check'){const c=b?.check;if(!c||!/^([a-f0-9]{32})$/.test(c.id)||!hex(c.challenge)||c.contact!=='websitecheck_'+c.id||c.origin!==T.externalOrigin||c.url!==externalURL()+'#mc-website-check='+c.id+'.'+c.challenge||Date.parse(c.expiresAt)<=now())fail('website_check_response_not_bound');checkBinding=c;}
    if(r.action==='read_request'&&b?.request?.source?.id!==r.url.searchParams.get('requestId'))fail('request_record_changed');
    if(r.action==='chat'){if(b?.t!=='done'||typeof b.reply!=='string'||!b.reply.trim()||!Array.isArray(b.events))fail('chat_completion_unconfirmed');for(const e of b.events)if(['lead','booking'].includes(e.type)&&/^[a-f0-9]{12,64}$/.test(e.id||''))recordIDs.add(e.id);}
    if(r.action==='request_link'){if(status!==202||b?.delivery!=='email')fail('mail_not_confirmed');return;}
    if(r.action==='exchange'){
      const link=links.get(r.body.token),email=r.role==='owner'?T.ownerEmail:T.operatorEmail;
      if(b?.email!==email||!hex(b.session)||!Number.isFinite(Date.parse(b.expiresAt))||sessions.has(b.session))fail('session_identity_not_verified');
      const max=(r.role==='owner'?24:8)*3600000;if(Date.parse(b.expiresAt)>now()+max+60000||Date.parse(b.expiresAt)<=now())fail('session_expiry_not_verified');
      sessions.set(b.session,{role:r.role,stage:link.stage});return;
    }
    if(r.action==='sign_out'){if(b?.ok!==true)fail('revocation_unconfirmed');revoked.add(r.bearer.token);if(r.bearer.stage==='owner_preflight')preflightRevoked=true;if(r.bearer.stage==='owner_signup')mainRevoked=true;return;}
    if(r.action==='intake'){if(status!==202||b?.ok!==true||!hex(b.handoff))fail('intake_unconfirmed');handoff=b.handoff;return;}
    if(r.action==='save_draft'){if(!Number.isInteger(b?.draft?.revision)||b.draft.revision!==r.body.revision+1||b.marketingPending)fail('draft_unconfirmed');lastDraftRevision=b.draft.revision;return;}
    if(r.action==='create_workspace'){
      if(status!==200||b?.ok!==true||!b.client||Object.hasOwn(b,'key')||b.portal!==T.origin+'/desk.html?c='+b.slug||!binding&&b.existing===true)fail('create_unconfirmed');bindClient(b.client,b.slug);return;
    }
    if(r.url.pathname==='/api/access'&&r.method==='GET'&&r.bearer&&!revoked.has(r.bearer.token)&&r.bearer.role==='owner'){
      if(b?.email!==T.ownerEmail)fail('owner_identity_changed');
      if(r.bearer.stage==='owner_preflight'){if(b.existing||!obj(b.draft?.fields)||Object.keys(b.draft.fields).length||b.draft.revision!==0||b.marketing?.preference===true)fail('existing_owner_identity');ownerEmpty=true;lastDraftRevision=0;}
      else if(b.existing){if(!binding||b.existing.slug!==binding.slug)fail('unexpected_existing_tenant');}
      else{if(r.bearer.stage!=='owner_signup'||!handoff||!obj(b.draft?.fields)||b.draft.fields.business!==T.business||b.draft.fields.name!==T.ownerName||b.draft.fields.primaryGoal!=='booking'||!Number.isInteger(b.draft.revision))fail('intake_prefill_unverified');lastDraftRevision=b.draft.revision;}
    }
    if(r.url.pathname==='/api/manage'&&r.method==='GET'&&r.role==='operator'&&r.bearer&&!revoked.has(r.bearer.token)){
      if(!r.url.searchParams.has('c')){if(!Array.isArray(b?.inquiries)||b.inquiries.some(x=>x.email===T.ownerEmail)&&!used.has('intake'))fail('existing_inquiry');if(b.inquiries.some(x=>x.email===T.ownerEmail&&x.marketingEligible===true))fail('unexpected_marketing_eligibility');operatorAbsent=true;}
      else{const c=b?.customer;if(c?.slug!==binding?.slug||c.owner?.email!==T.ownerEmail||c.name!==T.business||c.createdAt!==binding.createdAt||c.selfService!==true||!hex(c.revision))fail('operator_identity_changed');managementRevision=c.revision;}
    }
    if(r.url.pathname==='/api/client'&&['GET','PUT'].includes(r.method)&&r.role==='owner'&&r.bearer&&!revoked.has(r.bearer.token)&&(b?.client||r.method==='PUT')){
      if(!b?.client||b.client.slug!==binding?.slug||b.client.owner?.email!==T.ownerEmail||b.client.business?.name!==T.business||Object.hasOwn(b.client,'ownerKey')||Object.hasOwn(b.client,'management'))fail('owner_view_identity_or_secret');
      if(r.method==='PUT'&&(b.ok!==true||!hex(b.configurationRevision)||!hex(b.editRevision)||b.setup?.revision!==b.configurationRevision))fail('owner_update_unconfirmed');
      // PUT is authoritative immediately. Later-started GETs may advance it; older
      // GETs and GETs overlapping a mutation remain identity-checked but cannot rewind it.
      if(r.method==='PUT'||r.ownerRevisionEpoch===ownerRevisionEpoch&&r.id>=ownerRevisionObservedId){
        if(hex(b.configurationRevision))configurationRevision=b.configurationRevision;
        if(hex(b.editRevision))editRevision=b.editRevision;
        ownerRevisionObservedId=r.id;
      }
      if(hex(b.websiteInstallation?.tenantIdentity))tenantIdentity=b.websiteInstallation.tenantIdentity;
      for(const record of b.leads||[])if(record.slug===binding.slug&&record.channel==='web'&&record.delivery?.tenantIdentity===tenantIdentity&&Date.parse(record.createdAt)>=Date.parse(binding.createdAt)&&/^[a-f0-9]{12,64}$/.test(record.id||''))recordIDs.add(record.id);
    }
    if(['save_note','cancel_service'].includes(r.action)){
      if(r.action==='cancel_service'&&b?.ok===true&&b.customer?.status==='cancelled')workspaceCancelled=true;
      if(b?.ok!==true)fail('operator_change_unconfirmed');
      if(b.customer){if(b.customer.slug!==binding.slug||b.customer.owner?.email!==T.ownerEmail||b.customer.name!==T.business||!hex(b.customer.revision))fail('operator_change_identity');managementRevision=b.customer.revision;}
      else managementRevision=null;
    }
  }
  async function completeProjectRequest(id,{status,body,unknown=false}={}){return exclusive(async()=>{
    const r=privateRequests.get(id),entry=records.find(x=>x.id===id);if(!r||r.outcome!=='reserved_unknown')fail('completion_not_pending');
    if(unknown||!Number.isInteger(status)){r.outcome='unknown';entry.status='unknown';if(r.mutation)halted=true;}
    else{r.outcome='completed';entry.status=status;try{observe(r,status,body);}catch(e){halted=true;entry.status='response_rejected';entry.reason=e.code||'response_rejected';await persist();throw e;}}
    entry.completedAt=now();entry.elapsedMs=Math.max(0,entry.completedAt-r.at);await persist();
  });}
  async function registerVerificationLink({role,url:raw}){return exclusive(async()=>{
    ensureRole(role);if(!['owner','operator'].includes(role)||halted||closed||poisoned)fail('mail_link_not_allowed');
    const u=new URL(raw),stage=authStage(role),path=role==='operator'?'/admin.html':'/onboard.html';
    if(u.origin!==T.origin||u.pathname!==path||u.username||u.password)fail('wrong_verification_link');query(u,role==='owner'?['plan']:[]);if(u.search&&u.searchParams.get('plan')!=='starter')fail('wrong_verification_plan');
    const fragment=new URLSearchParams(u.hash.slice(1)),token=fragment.get('verify');if([...fragment.keys()].length!==1||!hex(token)||links.has(token)||[...links.values()].some(x=>x.stage===stage))fail('invalid_or_repeated_mail_link');
    const mail=[...privateRequests.values()].find(x=>x.emailSlot===stage);if(!mail||mail.outcome!=='completed'||records.find(x=>x.id===mail.id)?.status!==202)fail('mail_request_not_confirmed');
    links.set(token,{role,stage});return {role,registered:true};
  });}
  async function reserveMetadata(kind){return exclusive(async()=>{
    const kinds=['site','gates','release','proof','closedsite','closedgates'];
    if(['release','proof'].includes(kind)&&(cleanupReleaseOK||configurationClosed)||kind==='closedsite'&&(!releaseOK||!workspaceCancelled)||kind==='closedgates'&&!cleanupReleaseOK)fail('metadata_stage_not_allowed');
    if(closed||poisoned||!kinds.includes(kind)||used.has('metadata:'+kind)||counts.metadata>=L.metadata||counts.total>=L.total||['site','gates'].includes(kind)&&counts.platform>0||['release','proof'].includes(kind)&&!binding||kind==='proof'&&!releaseOK)fail('metadata_not_allowed');
    counts={...counts,total:counts.total+1,metadata:counts.metadata+1};used.add('metadata:'+kind);const id=++seq,at=now();records.push({id,method:'GET',path:['site','release','closedsite'].includes(kind)?'/api/v1/sites/:site':'/api/v1/accounts/:account/env',queryNames:['site','release','closedsite'].includes(kind)?[]:['site_id'],action:'metadata_'+kind,status:'reserved_unknown',startedAt:at,counters:{...counts}});await persist();return id;
  });}
  function verifyMetadata(kind,b){
    if(['site','release','closedsite'].includes(kind)){
      const expected=kind==='site'?manifest.signupRelease:kind==='closedsite'?manifest.cleanupRelease:manifest.release;
      const stage=kind==='site'?'signup':kind==='closedsite'?'cleanup':'proof',observed=b?.published_deploy?.id;if(b?.id!==T.siteId||!/^([a-f0-9]{24})$/.test(observed||'')||expected.deployId!==null&&observed!==expected.deployId||b.published_deploy?.commit_ref!==expected.commit||b.published_deploy?.state!=='ready'||b.account_id!==T.accountId||b.account_slug!==T.accountSlug)fail('production_release_changed');if(deploymentBindings[stage]||stage==='cleanup'&&observed===deploymentBindings.proof?.deployId||stage==='proof'&&observed===deploymentBindings.cleanup?.deployId)fail('deployment_rebound_or_reused');deploymentBindings[stage]={deployId:observed,commit:expected.commit,sourceManifestSHA256:expected.sourceManifestSHA256};
      if(kind==='site')siteOK=true;if(kind==='release')releaseOK=true;if(kind==='closedsite')cleanupReleaseOK=true;return;
    }
    if(!Array.isArray(b))fail('invalid_environment_response');
    const env={};for(const row of b){if(!obj(row)||typeof row.key!=='string'||!Array.isArray(row.values))fail('ambiguous_gate');const vals=row.values.filter(v=>['production','all'].includes(v.context));if(vals.length>1)fail('ambiguous_gate');if(vals.length){if(typeof vals[0].value!=='string'||Object.hasOwn(env,row.key))fail('ambiguous_gate');env[row.key]=vals[0].value;}}
    for(const key of HOSTED_ONBOARDING_GATES){const expected=kind==='proof'&&(key==='SERVICE_DELIVERY_ENABLED'||key==='WORKSPACE_BILLING_ENABLED'&&!!manifest.billingTest)?true:manifest.baselineGates[key];if((env[key]==='true')!==expected||env[key]&&!['true','false','0'].includes(env[key]))fail('execution_gate_changed');}
    if(kind==='gates'){billingBaseline=billingSnapshot(env);gatesOK=true;return;}
    if(kind==='closedgates'){if(!cleanupReleaseOK)fail('cleanup_deployment_readback_required');if(env.MC_SELF_SERVICE_AI_PROOF_SLUG||env.MC_SELF_SERVICE_AI_PROOF_POLICY_JSON||env.MANAGED_EMAIL_BUDGET_POLICY_JSON)fail('proof_configuration_not_closed');if(manifest.billingTest&&!same(billingSnapshot(env),billingBaseline))fail('billing_test_configuration_not_restored');proofOK=false;configurationClosed=true;return;}
    let ai,email;try{ai=JSON.parse(env.MC_SELF_SERVICE_AI_PROOF_POLICY_JSON);email=JSON.parse(env.MANAGED_EMAIL_BUDGET_POLICY_JSON);}catch{fail('invalid_proof_configuration');}
    const normalizedHash=createHash('sha256').update(T.ownerEmail).digest('hex');
    if(!binding||!tenantIdentity||env.MC_SELF_SERVICE_AI_PROOF_SLUG!==binding.slug||env.MC_SELF_SERVICE_AI_PROOF_APPROVED_VERSION!==ai.version||ai.phaseId!==manifest.phaseId||ai.tenant?.slug!==binding.slug||ai.tenant.identity!==tenantIdentity||ai.tenant.emailHash!==normalizedHash||ai.model!=='claude-opus-5-5'||ai.maxOutputTokens!==1500||ai.maxRequestBytes!==120000||!same(ai.limits,{logical:10,physical:30,ordinaryMutations:1,setupMutations:1})||Date.parse(ai.expiresAt)>Date.parse(manifest.expiresAt)||Date.parse(ai.expiresAt)<=now())fail('ai_proof_not_bound');
    const eh=v=>createHash('sha256').update(v||'').digest('hex');
    if((env.SERVICE_WORKER_KEY||'').length<32)fail('owner_email_worker_unavailable');workerKeyHash=eh(env.SERVICE_WORKER_KEY);
    if(env.MANAGED_EMAIL_BUDGET_APPROVED_VERSION!==email.version||email.mode!=='cohort'||email.accountLimit!==2||email.tenantLimit!==2||email.providerCredentialHash!==eh(env.RESEND_API_KEY)||email.senderHash!==eh(env.FROM_EMAIL)||!env.RESEND_API_KEY||!env.FROM_EMAIL||!same(email.tenants,[{slug:binding.slug,identity:tenantIdentity,emailHash:normalizedHash}])||Date.parse(email.expiresAt)>Date.parse(manifest.expiresAt)||Date.parse(email.expiresAt)<=now())fail('owner_email_proof_not_bound');
    if(manifest.billingTest){if(!billingBaseline||BILLING_KEYS.slice(7).some(key=>billingSnapshot(env)[key]!==billingBaseline[key]))fail('billing_test_preserved_settings_changed');verifyHostedBillingTestConfiguration(manifest,env,{slug:binding.slug,identity:tenantIdentity,now:now()});}
    proofOK=true;
  }
  async function metadataRequest({kind,url,headers={},transport}){
    const site=['site','release','closedsite'].includes(kind),expected=`https://api.netlify.com/api/v1/${site?'sites/'+T.siteId:'accounts/'+T.accountId+'/env?site_id='+T.siteId}`;
    if(url!==expected||!['site','gates','release','proof','closedsite','closedgates'].includes(kind))fail('metadata_url_not_allowed');
    const h=new Headers(headers);if(!/^Bearer \S+$/.test(h.get('authorization')||''))fail('metadata_auth_required');
    checkTransport(transport);const id=await reserveMetadata(kind),entry=records.find(x=>x.id===id);
    try{const response=await transport(url,{method:'GET',headers:h,redirect:'manual'});const b=await response.clone().json();await exclusive(async()=>{if(response.status!==200)fail('metadata_http_failed');verifyMetadata(kind,b);entry.status=200;entry.completedAt=now();entry.elapsedMs=Math.max(0,entry.completedAt-entry.startedAt);await persist();});return {ok:true,kind};}
    catch(e){await exclusive(async()=>{halted=true;entry.status='unknown_or_rejected';entry.completedAt=now();entry.elapsedMs=Math.max(0,entry.completedAt-entry.startedAt);await persist();});throw new GuardError(e.code||'metadata_unknown');}
  }
  function checkTransport(transport){if(typeof transport!=='function'||mode==='offline'&&transport.offlineFixture!==true)fail('offline_fixture_transport_required');}
  async function projectRequest({role,url,method='GET',headers={},body,transport}){
    checkTransport(transport);const wireHeaders=new Headers(headers);if(['POST','PUT'].includes(method.toUpperCase())){if(!wireHeaders.has('origin'))wireHeaders.set('origin',['setup','visitor'].includes(role)?T.externalOrigin:T.origin);if(!wireHeaders.has('content-type'))wireHeaders.set('content-type','application/json');}
    const raw=body!==undefined&&typeof body!=='string'?JSON.stringify(body):body,id=await reserveProjectRequest({role,url,method,headers:wireHeaders,body:raw});
    try{
      const response=await transport(url,{method,headers:wireHeaders,body:raw,redirect:'manual'});
      if(response.redirected)fail('transport_followed_hidden_redirect');
      const chunks=[],reader=response.body?.getReader();if(reader){try{for(;;){const part=await reader.read();if(part.done)break;await exclusive(async()=>{counts.bytes+=part.value.byteLength;await persist();if(counts.bytes>L.bytes)fail('budget_bytes');});chunks.push(Buffer.from(part.value));}}catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}}const bytes=Buffer.concat(chunks);
      let parsed;try{parsed=JSON.parse(bytes.toString());}catch{if(new URL(url).pathname==='/api/chat'&&response.status===200){const lines=bytes.toString().trim().split('\n').map(line=>JSON.parse(line));if(lines.at(-1)?.t!=='done'||lines.some((line,i)=>line.t==='done'&&i!==lines.length-1))fail('chat_completion_unconfirmed');parsed=lines.at(-1);}}
      if(!new URL(url).pathname.startsWith('/api/')&&new URL(url).origin!==T.externalOrigin&&!response.status.toString().startsWith('3')){const sha=createHash('sha256').update(bytes).digest('hex');const accepted=(releaseOK?manifest.assets:manifest.signupAssets)[new URL(url).pathname];if(!(Array.isArray(accepted)?accepted.includes(sha):accepted===sha))fail('asset_source_changed');}
      await completeProjectRequest(id,{status:response.status,body:parsed});
      if([301,302,303,307,308].includes(response.status)){
        // Only public GET hops. Never repeat an API/mutation or leak its bearer.
        const from=new URL(url),location=response.headers.get('location');
        if(method.toUpperCase()!=='GET'||from.pathname.startsWith('/api/')||!location||wireHeaders.has('authorization'))fail('api_or_credential_redirect_blocked');
        const next=new URL(location,url);if(![T.origin,T.canonicalOrigin].includes(from.origin)||![T.origin,T.canonicalOrigin].includes(next.origin)||next.pathname!==from.pathname&&!(from.pathname.endsWith('.html')&&next.pathname===from.pathname.slice(0,-5)))fail('off_origin_redirect_blocked');
        return projectRequest({role,url:next.href,method:'GET',headers:wireHeaders,transport});
      }
      return new Response([204,304].includes(response.status)?null:bytes,{status:response.status,headers:response.headers});
    }
    catch(e){if(privateRequests.get(id)?.outcome==='reserved_unknown')await completeProjectRequest(id,{unknown:true});if(e instanceof GuardError&&!halted)await exclusive(()=>recordDenial(e.code,method.toUpperCase()));throw e;}
  }
  async function internalRequest({url,method,headers,body,transport}){
    checkTransport(transport);const id=await reserveProjectRequest({internal:internalToken,url,method,headers,body});
    try{const response=await transport(url,{method,headers,body,redirect:'error'});let parsed;try{parsed=await response.clone().json();}catch{}await completeProjectRequest(id,{status:response.status,body:parsed});if(response.status!==202)fail('internal_dispatch_unconfirmed');return response;}
    catch(error){if(privateRequests.get(id)?.outcome==='reserved_unknown')await completeProjectRequest(id,{unknown:true});throw error;}
  }
  async function createGuardedContext(browser,role){
    ensureRole(role);if(contexts.has(role)||closed||poisoned)fail('context_already_registered');
    if(mode==='offline'&&browser?.offlineFixture!==true)fail('offline_fixture_browser_required');
    if(mode==='live'&&manifest.approved!==true)fail('approval_required');
    const context=await browser.newContext({serviceWorkers:'block',storageState:{cookies:[],origins:[]},acceptDownloads:false});
    if(typeof context.route!=='function'||typeof context.routeWebSocket!=='function'||typeof context.cookies!=='function'||(await context.cookies()).length||(context.serviceWorkers?.()||[]).length){await context.close?.();fail('fresh_interceptable_context_required');}
    contexts.set(role,context);
    await context.routeWebSocket('**/*',async socket=>{socket.close();await exclusive(()=>recordDenial('websocket_blocked'));});
    await context.route('**/*',async route=>{
      const request=route.request();
      try{
        const requested=new URL(request.url());
        if(request.method()==='GET'&&['https://fonts.googleapis.com','https://fonts.gstatic.com'].includes(requested.origin)&&['stylesheet','font'].includes(request.resourceType())){
          await exclusive(async()=>{const at=now();records.push({id:++seq,method:'GET',path:'/blocked-font',queryNames:[],action:'blocked_optional_font',status:'blocked',startedAt:at,completedAt:at,elapsedMs:0,counters:{...counts}});await persist();});
          await route.abort('blockedbyclient');return;
        }
        const transport=mode==='offline'?browser.fixtureTransport:async(url,options)=>{
          const response=await route.fetch({url,method:options.method,headers:Object.fromEntries(options.headers),postData:options.body,maxRedirects:0,maxRetries:0});
          return new Response([204,304].includes(response.status())?null:await response.body(),{status:response.status(),headers:response.headers()});
        };
        const response=await projectRequest({role,url:request.url(),method:request.method(),headers:await request.allHeaders(),body:request.postData()??undefined,transport});
        // Fulfill only final bytes; browser never receives a Location to follow
        // outside this guard. Its address remains the initial URL by design.
        const headers=Object.fromEntries(response.headers);delete headers.location;delete headers['set-cookie'];delete headers['content-encoding'];delete headers['content-length'];
        await route.fulfill({status:response.status,headers,body:Buffer.from(await response.arrayBuffer())});
      }catch{await route.abort('blockedbyclient');}
    });
    return context;
  }
  async function finish(){return exclusive(async()=>{closed=true;await persist();await persistence.close?.();return snapshot();});}
  async function beginCleanup(){return exclusive(async()=>{halted=true;await persist();return {cleanupOnly:true};});}
  return Object.freeze({reserveProjectRequest,completeProjectRequest,registerVerificationLink,metadataRequest,projectRequest,internalRequest,createGuardedContext,beginCleanup,binding:()=>binding?{...binding,tenantIdentity,website:externalURL()}:null,snapshot:()=>snapshot(),finish});
}
