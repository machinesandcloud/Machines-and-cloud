// Fixed-price self-service billing. Commercial approval is configuration, never
// inferred from a saved plan preference or legacy usage counters.
import { createHash, randomBytes } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { atomicUpdate, list } from './store.mjs';
import { strictRead, normalizeAccountEmail } from './accounts.mjs';
import { isSupportedSelfServiceClient, configurationRevision, setupReadiness } from './setup.mjs';
import { workspaceTenant } from './workspace-identity.mjs';
import { serviceConnections } from './service-connections.mjs';
import { managedSMSBudgetPolicy } from './managed-sms-budget.mjs';
import { accessSite } from './access.mjs';
import { billingTestAdmissionPolicy, billingTestAdmits, billingTestMaintenanceAdmits } from './billing-test-admission.mjs';
import { workspaceBillingWebhookSecret } from './billing.mjs';
import { paidContract, paidPeriodMatches, paidPeriodFunding } from './paid-service-authority.mjs';

const STORE='workspace_billing', REVIEWS='workspace_billing_reviews', EVENTS='workspace_billing_events';
const RECOVERY_CURSOR='workspace_billing_cursor', RECOVERY_WAVE_MS=240000, RECOVERY_RECORD_MS=45000;
const recoveryScope=new AsyncLocalStorage();
const credentialScope=new AsyncLocalStorage();
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(canonical(value))).digest('hex');
const stamp=()=>new Date().toISOString(), token=()=>randomBytes(16).toString('hex'), key=c=>`${c.slug}/${workspaceTenant(c)}`;
const hex=value=>typeof value==='string'&&/^[a-f0-9]{32}$/.test(value);
const id=(value,prefix)=>typeof value==='string'&&new RegExp('^'+prefix+'[a-zA-Z0-9_]{3,160}$').test(value);
const exact=(value,names)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...names].sort().join(',');
const actorEmail=actor=>normalizeAccountEmail(actor?.email);
const channels=['web','voice','sms','calendar'], prices={starter:9900,growth:24900}, names={starter:'Coverage',growth:'Follow-through'};
const activeSubscription=status=>['active','trialing','past_due','unpaid','incomplete','paused','payment_pending'].includes(status);
const businessStamp=c=>hash([configurationRevision(c),c.status,c.operationLifecycleVersion||0,c.onboarding?.desiredChannels||['web']]);
export class WorkspaceBillingError extends Error { constructor(code,message,status=409){super(message);this.code=code;this.status=status;} }
const fail=(code,message,status=409)=>{throw new WorkspaceBillingError(code,message,status);};
const defaultCredentialSlot=()=>process.env.WORKSPACE_BILLING_STRIPE_SECRET_KEY?'workspace':'legacy';
const rowCredentialSlot=row=>row?.credentialSlot===undefined?'legacy':row.credentialSlot;
function credentialForSlot(slot){
  if(!['workspace','legacy'].includes(slot))fail('billing_credential_changed','The original payment credential must be restored before this record can be checked.',503);
  return {slot,secret:process.env[slot==='workspace'?'WORKSPACE_BILLING_STRIPE_SECRET_KEY':'STRIPE_SECRET_KEY']||''};
}
function credential(){return credentialScope.getStore()||credentialForSlot(defaultCredentialSlot());}
function mode(secret=credential().secret){if(/^(sk|rk)_test_/.test(secret))return false;if(/^(sk|rk)_live_/.test(secret))return true;fail('billing_unavailable','Billing is being prepared. Your workspace is saved.',503);}
async function withBillingRecord(c,row,run){
  const selected=credentialForSlot(rowCredentialSlot(row)),active=credentialScope.getStore();
  if(active&&(active.slot!==selected.slot||active.secret!==selected.secret||active.recordKey&&active.recordKey!==key(c)))fail('billing_binding_mismatch','The payment request belongs to its original workspace and credential.',503);
  return credentialScope.run({...selected,recordKey:key(c),client:c},run);
}
async function withBillingPurchase(c,run){return credentialScope.run({...credentialForSlot(defaultCredentialSlot()),recordKey:key(c),client:c},run);}
function validTestPredecessor(value){return exact(value,['phaseId','policyDigest','checkoutId','requestId','cleanupOperationId','closeOperationId','expirationEventId'])&&/^[a-z0-9_-]{1,100}$/.test(value.phaseId||'')&&/^[a-f0-9]{64}$/.test(value.policyDigest||'')&&id(value.checkoutId,'cs_test_')&&hex(value.requestId)&&hex(value.cleanupOperationId)&&hex(value.closeOperationId)&&id(value.expirationEventId,'evt_');}
function runtimeTestPolicy(offer,{retained=null,cleanup=false}={}){
  try{
    const phase=retained||JSON.parse(process.env.WORKSPACE_BILLING_TEST_PHASE_JSON||'null');
    const iso=value=>typeof value==='string'&&new Date(value).toISOString()===value;
    const fields=['version','phaseId','issuedAt','expiresAt','stripeAccountId','offerDigest','tenant','maxAttempts','cleanupReserve','cleanupOnExpiry'];
    if(phase&&Object.hasOwn(phase,'predecessor'))fields.push('predecessor');
    if(!offer||!exact(phase,fields)||phase.predecessor!==undefined&&(!validTestPredecessor(phase.predecessor)||phase.predecessor.phaseId===phase.phaseId)||phase.cleanupOnExpiry!==true||phase.version!==offer.version||!/^[a-z0-9_-]{1,100}$/.test(phase.phaseId||'')||!iso(phase.issuedAt)||!iso(phase.expiresAt)||Date.parse(phase.issuedAt)>Date.now()||!cleanup&&Date.parse(phase.expiresAt)<=Date.now()||Date.parse(phase.expiresAt)-Date.parse(phase.issuedAt)>4*3600000||Date.parse(phase.expiresAt)<=Date.parse(phase.issuedAt)||phase.stripeAccountId!==offer.stripeAccountId||phase.offerDigest!==offer.digest||!exact(phase.tenant,['slug','identity','ownerEmailHash'])||!/^[a-z0-9][a-z0-9-]{0,39}$/.test(phase.tenant.slug||'')||!/^[a-f0-9]{64}$/.test(phase.tenant.identity||'')||!/^[a-f0-9]{64}$/.test(phase.tenant.ownerEmailHash||'')||!Number.isSafeInteger(phase.maxAttempts)||phase.maxAttempts<20||phase.maxAttempts>120||!Number.isSafeInteger(phase.cleanupReserve)||phase.cleanupReserve<10||phase.cleanupReserve>=phase.maxAttempts)return null;
    return {...phase,digest:hash(phase)};
  }catch{return null;}
}
function runtimeTestPhase(c,offer,{newAdmission=false,retained=null,cleanup=false}={}){
  const phase=runtimeTestPolicy(offer,{retained,cleanup});
  if(!phase||!isSupportedSelfServiceClient(c)||phase.tenant.slug!==c.slug||phase.tenant.identity!==workspaceTenant(c)||phase.tenant.ownerEmailHash!==hash(normalizeAccountEmail(c.owner.email)))return null;
  if(newAdmission){const cohort=billingTestAdmissionPolicy(offer);if(!cohort||cohort.phaseId!==phase.phaseId||!billingTestAdmits(c,offer))return null;}
  return phase;
}
function cleanupTransport(row,path,method,params){
  if(!row?.testProof?.cleanup||row.testProof.state!=='closing')return false;
  const route=path.split('?')[0],session=row.checkout?.sessionId,subscription=row.subscription?.id;
  return method==='GET'&&(route==='account'||route==='checkout/sessions'||session&&route==='checkout/sessions/'+session||subscription&&route==='subscriptions/'+subscription)||method==='POST'&&(session&&route==='checkout/sessions/'+session+'/expire'&&exact(params,[])||subscription&&route==='subscriptions/'+subscription&&exact(params,['cancel_at_period_end'])&&params.cancel_at_period_end==='true')||method==='DELETE'&&subscription&&route==='subscriptions/'+subscription&&exact(params,['invoice_now','prorate'])&&params.invoice_now==='false'&&params.prorate==='false';
}
async function admitRuntimeTestRequest(selected,path,method,params){
  if(selected.slot!=='workspace'||mode(selected.secret)!==false)return null;
  const c=selected.client;if(!c||selected.recordKey!==key(c))fail('billing_test_phase_required','The internal payment test must be bound to its current workspace.',503);
  const client=await strictRead('clients',c.slug);if(!isSupportedSelfServiceClient(client)||workspaceTenant(client)!==workspaceTenant(c))fail('workspace_changed','The internal payment test belongs to its original workspace.',503);
  const saved=await strictRead(STORE,key(c)),offer=saved?.checkout?.offer||saved?.testProof?.offer||approvedOffer(),cleanup=cleanupTransport(saved,path,method,params),phase=runtimeTestPhase(client,offer,{newAdmission:!saved?.testProof,cleanup,retained:cleanup?saved?.testProof?.policy:null});
  if(!phase)fail('billing_test_phase_required','The internal payment test allowance is missing or expired.',503);
  const requestId=token();
  await atomicUpdate(STORE,key(c),row=>{
    if(!cleanup&&Date.parse(phase.expiresAt)<=Date.now())fail('billing_test_phase_expired','The internal payment test allowance expired.',503);
    if(row&&(row.tenant!==workspaceTenant(client)||row.livemode!==false||row.stripeAccountId!==phase.stripeAccountId||rowCredentialSlot(row)!=='workspace'))fail('billing_binding_mismatch','The internal test cannot adopt an existing financial account.',503);
    if(row?.testProof&&(row.testProof.phaseId!==phase.phaseId||row.testProof.policyDigest!==phase.digest))fail('billing_test_phase_changed','The original internal test allowance cannot be reset or replaced.',503);
    const proof=row?.testProof||{phaseId:phase.phaseId,policyDigest:phase.digest,policy:JSON.parse(process.env.WORKSPACE_BILLING_TEST_PHASE_JSON),offer,issuedAt:phase.issuedAt,expiresAt:phase.expiresAt,maxAttempts:phase.maxAttempts,cleanupReserve:phase.cleanupReserve,state:'open',attempts:[],receipts:[]};
    if(proof.state==='closed')fail('billing_test_phase_closed','This internal payment test is closed.',503);
    if(cleanup!==cleanupTransport(row,path,method,params))fail('billing_test_phase_changed','The internal TEST cleanup changed before admission.',503);
    if(proof.state==='closing'&&!cleanup)fail('billing_test_cleanup_only','Only the saved internal test cleanup may continue.',503);
    if(proof.attempts.length>=phase.maxAttempts-(cleanup?0:phase.cleanupReserve))fail('billing_test_capacity','The internal payment test request allowance is spent. Its cleanup reserve is kept.',503);
    return {value:{...row,version:1,slug:client.slug,tenant:workspaceTenant(client),credentialSlot:'workspace',livemode:false,stripeAccountId:phase.stripeAccountId,testProof:{...proof,attempts:[...proof.attempts,{id:requestId,method,path,at:stamp(),purpose:cleanup?'cleanup':'ordinary'}]}}};
  });
  return {key:key(c),phaseId:phase.phaseId,policyDigest:phase.digest,requestId,cleanup,offer};
}
async function assertRuntimeTestRequest(admission){
  if(!admission)return;
  const row=await strictRead(STORE,admission.key),selected=credential(),client=selected.client&&await strictRead('clients',selected.client.slug),offer=row?.checkout?.offer||row?.testProof?.offer||approvedOffer(),phase=client&&runtimeTestPhase(client,offer,{cleanup:admission.cleanup,retained:admission.cleanup?row?.testProof?.policy:null});
  if(!phase||row?.tenant!==phase.tenant.identity||row.stripeAccountId!==phase.stripeAccountId||row.livemode!==false||rowCredentialSlot(row)!=='workspace'||row?.testProof?.state==='closed'||row.testProof.state==='closing'&&!admission.cleanup||phase.phaseId!==admission.phaseId||phase.digest!==admission.policyDigest||row.testProof.policyDigest!==phase.digest||!row.testProof.attempts.some(request=>request.id===admission.requestId))fail('billing_test_phase_changed','The internal payment test changed or ended. Check its saved result.',503);
}
function paymentURL(value,host='checkout.stripe.com'){let url;try{url=new URL(value);}catch{return null;}return url.protocol==='https:'&&url.hostname===host&&!url.username&&!url.password&&!url.port?url.href:null;}
async function stripe(path,{method='GET',params=null,idempotencyKey=null,authorize=null}={}){
  let transportStarted=false;
  try{
    const scope=recoveryScope.getStore(),selected=credential();
    if(scope)await scope.assertCurrent();
    if(credentialForSlot(selected.slot).secret!==selected.secret)fail('billing_credential_changed','The payment credential changed during this request. Check its saved status.',503);
    mode(selected.secret);
    const admission=await admitRuntimeTestRequest(selected,path,method,params);await assertRuntimeTestRequest(admission);
    if(scope)await scope.assertCurrent();
    // New hosted capabilities require the original owner after the durable
    // admission awaits. Known financial recovery intentionally keeps its saved
    // authority and does not depend on a browser session remaining signed in.
    if(authorize)await authorize();
    if(admission&&!admission.cleanup){const phase=runtimeTestPhase(selected.client,admission.offer);if(!phase||phase.digest!==admission.policyDigest)fail('billing_test_phase_changed','The internal payment test changed before dispatch.',503);}
    if(credentialForSlot(selected.slot).secret!==selected.secret)fail('billing_credential_changed','The payment credential changed during this request. Check its saved status.',503);
    const remaining=scope?scope.deadlineAt-Date.now():5000;
    if(remaining<1||scope&&method!=='GET'&&remaining<5000)fail('billing_recovery_deadline','Billing recovery will continue on its next scheduled run.',503);
    const headers={Authorization:'Bearer '+selected.secret,'Stripe-Version':'2025-06-30.basil'};
    if(params)headers['Content-Type']='application/x-www-form-urlencoded';if(idempotencyKey)headers['Idempotency-Key']=idempotencyKey;
    transportStarted=true;
    const response=await fetch('https://api.stripe.com/v1/'+path,{method,headers,...(params?{body:new URLSearchParams(params).toString()}:{}),signal:AbortSignal.timeout(Math.min(5000,remaining)),redirect:'error'});
    let data;try{data=await response.json();}catch{fail('billing_response_uncertain','The payment provider response could not be confirmed. Check billing status before trying again.',503);}
    if(scope)await scope.assertCurrent();
    if(credentialForSlot(selected.slot).secret!==selected.secret)fail('billing_credential_changed','The payment credential changed during this request. Check its saved status.',503);
    await assertRuntimeTestRequest(admission);
    if(!response.ok)fail('billing_provider_unavailable','The payment provider could not finish this request. Your saved request is kept.',503);
    return data;
  }catch(error){if(error&&typeof error==='object')error.workspaceProviderOutcome=transportStarted?'unknown':'not_sent';throw error;}
}
function approvedOffer(){
  try{
    const offer=JSON.parse(process.env.WORKSPACE_BILLING_OFFER_JSON||'null');
    if(!exact(offer,['version','stripeAccountId','currency','terms','plans'])||!/^[a-z0-9_-]{1,80}$/.test(offer.version||'')||process.env.WORKSPACE_BILLING_APPROVED_VERSION!==offer.version||!id(offer.stripeAccountId,'acct_')||offer.currency!=='usd'||!exact(offer.terms,['version','text','url'])||!/^[a-z0-9_-]{1,80}$/.test(offer.terms.version||'')||typeof offer.terms.text!=='string'||offer.terms.text.length<100||offer.terms.text.length>20000)throw Error();
    const url=new URL(offer.terms.url);if(url.origin!==accessSite()||url.protocol!=='https:'||url.username||url.password||url.hash)throw Error();
    if(!exact(offer.plans,['starter','growth']))throw Error();
    for(const [plan,choice]of Object.entries(offer.plans))if(!exact(choice,['amountCents','priceId','services','limits','limitsDescription'])||choice.amountCents!==prices[plan]||!id(choice.priceId,'price_')||!Array.isArray(choice.services)||!choice.services.length||new Set(choice.services).size!==choice.services.length||choice.services.some(service=>!channels.includes(service))||typeof choice.limitsDescription!=='string'||choice.limitsDescription.length<40||choice.limitsDescription.length>3000||!exact(choice.limits,['webRepliesPerDay','practiceRepliesPerDay','voiceCallsPerDay','voiceReservedMinutesPerDay','maxCallSeconds','smsExposureMessages','smsExposureSegments','smsExposureCostMicros'])||Object.values(choice.limits).some(value=>!Number.isSafeInteger(value)||value<0))throw Error();
    return {...offer,digest:hash(offer)};
  }catch{return null;}
}
function purchasesEnabled(c,offer){
  try{
    if(!billingEnabled())return false;
    if(mode())return true;
    if(!billingTestAdmits(c,offer))return false;
    return defaultCredentialSlot()!=='workspace'||!!runtimeTestPhase(c,offer,{newAdmission:true});
  }catch{return false;}
}
// Keep saved billing readable when credentials are removed. Public LIVE/unconfigured
// plan metadata retains its prior behavior; only TEST cohort metadata is hidden.
function planMetadataVisible(c,offer){try{return mode()||purchasesEnabled(c,offer);}catch{return true;}}
function billingEnabled(){try{return process.env.WORKSPACE_BILLING_ENABLED==='true'&&(!mode()||process.env.WORKSPACE_BILLING_LIVE_ENABLED==='true');}catch{return false;}}
// Configuration only: no provider request, customer read or financial action.
// Keep the operator's view on the same policy used by the owner endpoints.
export function workspaceBillingConfiguration() {
  let live = null;
  try { live = mode(); } catch { /* Missing or unsupported credentials. */ }
  const offer = approvedOffer(), requested = process.env.WORKSPACE_BILLING_ENABLED === 'true';
  const cohort=live===false?billingTestAdmissionPolicy(offer):null,phase=live===false&&defaultCredentialSlot()==='workspace'?runtimeTestPolicy(offer):null;
  const testProof=cohort&&(defaultCredentialSlot()!=='workspace'||phase&&phase.phaseId===cohort.phaseId&&hash(phase.tenant)===hash(cohort.tenant))?cohort:null;
  const purchases = !!offer && billingEnabled() && (live!==false||!!testProof);
  const webhook = !!workspaceBillingWebhookSecret();
  const portal = process.env.WORKSPACE_BILLING_PORTAL_ENABLED === 'true' &&
    id(process.env.WORKSPACE_BILLING_PORTAL_CONFIGURATION_ID, 'bpc_') &&
    live !== null && (!live || process.env.WORKSPACE_BILLING_LIVE_ENABLED === 'true') && (live !== false || !!testProof);
  const modeLabel = live === false ? 'TEST' : live === true ? 'live' : 'unconfigured';
  const detail = purchases
    ? `New self-service checkout is configured in ${modeLabel} mode${live===false?' for one expiring internal test workspace':''}. The merchant, Price and selected customer services are verified before checkout. ${webhook ? 'A dedicated workspace webhook signing secret is configured.' : 'The dedicated workspace webhook signing secret is missing; payment notifications cannot be verified.'}`
    : requested
      ? 'Self-service checkout was requested, but its approved offer, credentials or explicit live-mode approval is incomplete.'
      : 'New self-service checkout is disabled. Existing billing records and renewal reconciliation remain separate.';
  return { label: 'Customer billing', status: purchases ? webhook ? 'configured' : 'needs_attention' : requested ? 'needs_attention' : 'disabled', mode: modeLabel,
    newPurchasesEnabled: purchases, portalConfigured: portal, webhookConfigured: webhook,
    detail: detail + (!purchases&&!webhook ? ' The dedicated workspace webhook verifier is not configured.' : '') + (portal ? ' The restricted payment-details and invoice portal is configured; its provider features are checked when opened.' : ' The payment-details and invoice portal is not configured.') };
}
async function ownerCurrent(c,actor,expectedRevision){const current=await strictRead('clients',c.slug),session=actor?.sessionHash?await strictRead('access_sessions',actor.sessionHash):null;if(!session||session.scope!=='onboarding'||session.status!=='active'||Date.parse(session.expiresAt)<=Date.now()||normalizeAccountEmail(session.email)!==actorEmail(actor)||!isSupportedSelfServiceClient(current)||workspaceTenant(current)!==workspaceTenant(c)||actorEmail(actor)!==normalizeAccountEmail(current.owner.email))fail('forbidden','Sign in as this workspace’s owner.',403);if(expectedRevision!==undefined&&configurationRevision(current)!==expectedRevision)fail('configuration_changed','Your saved setup changed. Review it before continuing.');return current;}
async function assertAccount(expected){const account=await stripe('account');if(account.id!==expected)fail('billing_account_changed','Billing is waiting for the correct payment account to be confirmed.',503);return account;}
function serviceLimits(c){
  let voice;try{voice=JSON.parse(process.env.VOICE_ACTIVATION_POLICY_JSON||'null');}catch{voice=null;}
  const sms=managedSMSBudgetPolicy(),row=voice||{};
  return {webRepliesPerDay:50,practiceRepliesPerDay:20,voiceCallsPerDay:row.maxDailyCalls||0,voiceReservedMinutesPerDay:row.maxDailyMinutes||0,maxCallSeconds:row.maxDurationSeconds||0,smsExposureMessages:sms?.tenantLimits.messages||0,smsExposureSegments:sms?.tenantLimits.segments||0,smsExposureCostMicros:sms?.tenantLimits.costMicros||0};
}
function operating(c){if(!['testing','live'].includes(c.status))fail('service_not_ready','Finish connecting and checking your front desk before starting paid service.');}
async function ready(c,choice){
  operating(c);
  const desired=c.onboarding?.desiredChannels||['web'];if(!Array.isArray(desired)||!desired.length||new Set(desired).size!==desired.length||desired.some(service=>!channels.includes(service)||!choice.services.includes(service)))fail('service_scope_changed','Choose an offer that covers every connection you requested.');
  const connections=await serviceConnections(c),web=setupReadiness(c).channels.web;
  const states={web:c.status==='live'&&web.ready&&web.active,voice:connections.voice.active,sms:connections.messaging.active,calendar:connections.calendar.connected&&connections.calendarDelivery.enabled};
  if(desired.some(service=>states[service]!==true))fail('service_not_ready','Finish connecting and checking the services in this offer before starting paid service.');
  const actual=serviceLimits(c);for(const field of Object.keys(actual)){const relevant=field.startsWith('voice')||field==='maxCallSeconds'?'voice':field.startsWith('sms')?'sms':'web';if(desired.includes(relevant)&&choice.limits[field]!==actual[field])fail('billing_limits_changed','Service limits changed. Review the updated offer before continuing.');}
  return [...desired];
}
async function verifyPrice(offer,plan){const choice=offer.plans[plan],price=await stripe('prices/'+choice.priceId);if(price.id!==choice.priceId||price.active!==true||price.currency!=='usd'||price.unit_amount!==choice.amountCents||price.type!=='recurring'||price.recurring?.interval!=='month'||price.recurring?.interval_count!==1||price.recurring?.usage_type!=='licensed'||price.billing_scheme!=='per_unit'||price.livemode!==mode()||price.tax_behavior!=='inclusive')fail('billing_price_changed','The payment price no longer matches the reviewed monthly offer. No checkout was started.');return choice;}
const quoteView=(offer,plan,services=offer.plans[plan].services)=>({version:offer.version,digest:offer.digest,plan,name:names[plan],amountCents:prices[plan],currency:'usd',interval:'month',services,limits:offer.plans[plan].limits,limitsDescription:offer.plans[plan].limitsDescription,terms:offer.terms,livemode:mode(),additionalUsageCharges:false,trialDays:0});
function view(row,offer=null,c=null){const attempt=row?.checkout;return {...(row?.livemode===true&&c?{serviceFunding:paidPeriodFunding(row,c)}:{}),status:row?.subscription?.status||'none',plan:row?.subscription?.plan||null,services:row?.subscription?.services||[],name:names[row?.subscription?.plan]||null,currentPeriodEnd:row?.subscription?.currentPeriodEnd||null,cancelAtPeriodEnd:row?.subscription?.cancelAtPeriodEnd===true,cancellationState:row?.cancellation?.state||null,checkout:attempt?{requestId:attempt.requestId,state:attempt.state,expiresAt:attempt.expiresAt||null,url:attempt.state==='open'&&Date.parse(attempt.expiresAt)>Date.now()&&purchasesEnabled(c,offer)&&offer?.digest===attempt.offer.digest&&!row.stopRequestedAt?attempt.url:null}:null,portalAvailable:!!row?.customerId&&!!row?.subscription?.id&&portalEnabled(row,c),offerAvailable:!!offer&&purchasesEnabled(c,offer)&&(!row?.testProof||row.testProof.state==='open'),availablePlans:offer&&planMetadataVisible(c,offer)?Object.keys(offer.plans).map(plan=>({id:plan,name:names[plan],amountCents:prices[plan],currency:'usd'})):[],livemode:row?.livemode??null};}
function proofView(row){
  const proof=row?.testProof;if(!proof)return null;
  return {phaseId:proof.phaseId,state:proof.state,closedAt:proof.closedAt||null,closeOperationId:proof.closeOperationId||null,mode:'TEST',stripeAccountId:row.stripeAccountId,tenantIdentity:row.tenant,policyDigest:proof.policyDigest,offerDigest:proof.policy.offerDigest,expiresAt:proof.expiresAt,maxAttempts:proof.maxAttempts,cleanupReserve:proof.cleanupReserve,spent:proof.attempts.length,ordinaryRemaining:Math.max(0,proof.maxAttempts-proof.cleanupReserve-proof.attempts.length),totalRemaining:Math.max(0,proof.maxAttempts-proof.attempts.length),checkoutId:row.checkout?.sessionId||null,subscriptionId:row.subscription?.id||null,customerId:row.customerId||null,invoiceId:proof.invoiceId||null,cleanup:proof.cleanup?{operationId:proof.cleanup.operationId,state:proof.cleanup.state,confirmedAt:proof.cleanup.confirmedAt||null}:null,receipts:proof.receipts||[],...(proof.policy.predecessor?{predecessor:proof.policy.predecessor,priorPhases:(row.history||[]).filter(item=>item.testProof).map(item=>({phaseId:item.testProof.phaseId,policyDigest:item.testProof.policyDigest,state:item.testProof.state,closedAt:item.testProof.closedAt,spent:item.testProof.attempts.length,checkoutId:item.checkout?.sessionId||null,receipts:item.testProof.receipts||[]}))}:{})};
}
export async function workspaceBillingStatus(c){const row=await strictRead(STORE,key(c));return {...view(row,approvedOffer(),c),...(row?.testProof?{testProof:proofView(row)}:{})};}
export async function beginWorkspaceBillingProof(c,actor,body){
  if(!exact(body,['action','phaseId','plan'])||!Object.hasOwn(prices,body.plan))fail('invalid_billing_request','Select the bound internal payment test.',400);
  const current=await ownerCurrent(c,actor),offer=approvedOffer(),phase=runtimeTestPhase(current,offer,{newAdmission:true});
  if(defaultCredentialSlot()!=='workspace'||mode()!==false||!phase||phase.phaseId!==body.phaseId)fail('billing_test_phase_required','This internal TEST payment phase is not admitted.',503);
  if(phase.predecessor){
    await ready(current,offer.plans[body.plan]);
    await atomicUpdate(STORE,key(c),async row=>{
      const latest=await ownerCurrent(c,actor,configurationRevision(current)),admitted=runtimeTestPhase(latest,approvedOffer(),{newAdmission:true});
      if(!admitted||admitted.digest!==phase.digest)fail('billing_test_phase_changed','The fresh internal TEST phase changed before admission.',503);
      await ready(latest,offer.plans[body.plan]);
      const authorized=await ownerCurrent(c,actor,configurationRevision(current));if(runtimeTestPhase(authorized,approvedOffer(),{newAdmission:true})?.digest!==phase.digest)fail('billing_test_phase_changed','The fresh internal TEST phase changed before admission.',503);
      if(row?.testProof?.phaseId===phase.phaseId&&row.testProof.policyDigest===phase.digest)return {};
      const prior=phase.predecessor,proof=row?.testProof,checkout=row?.checkout;
      if(!row||row.tenant!==workspaceTenant(latest)||row.livemode!==false||rowCredentialSlot(row)!=='workspace'||row.stripeAccountId!==phase.stripeAccountId||!proof||proof.phaseId!==prior.phaseId||proof.policyDigest!==prior.policyDigest||proof.state!=='closed'||proof.cleanup?.state!=='complete'||proof.cleanup.operationId!==prior.cleanupOperationId||proof.closeOperationId!==prior.closeOperationId||!Number.isFinite(Date.parse(proof.closedAt))||Date.parse(proof.closedAt)>Date.parse(phase.issuedAt)||!checkout||checkout.state!=='expired'||checkout.sessionId!==prior.checkoutId||checkout.requestId!==prior.requestId||checkout.url||checkout.claim||row.customerId||row.subscription||row.cancellation||row.portal||proof.invoiceId||!proof.receipts?.some(receipt=>receipt.id===prior.expirationEventId&&receipt.type==='checkout.session.expired'&&receipt.verifiedDestination==='workspace'&&/^[a-f0-9]{64}$/.test(receipt.bodyDigest||'')&&receipt.objectId===prior.checkoutId&&receipt.checkoutId===prior.checkoutId&&!receipt.subscriptionId&&!receipt.customerId))fail('billing_test_predecessor_unconfirmed','The exact previous TEST phase must be closed with its expired Checkout and signed expiration receipt confirmed.',409);
      const history=row.history||[];if(!Array.isArray(history)||history.filter(item=>item.testProof).length>=4)fail('billing_test_history_capacity','The retained internal TEST phase history is full.',503);
      const nextProof={phaseId:phase.phaseId,policyDigest:phase.digest,policy:Object.fromEntries(Object.entries(phase).filter(([name])=>name!=='digest')),offer,issuedAt:phase.issuedAt,expiresAt:phase.expiresAt,maxAttempts:phase.maxAttempts,cleanupReserve:phase.cleanupReserve,state:'open',attempts:[],receipts:[]};
      return {value:{...row,history:[...history,{checkout,subscription:null,cancellation:null,testProof:proof,rolledToPhase:phase.phaseId,archivedAt:stamp()}],checkout:null,customerId:null,subscription:null,cancellation:null,portal:null,stopRequestedAt:null,testProof:nextProof,updatedAt:stamp()}};
    });
  }
  await withBillingPurchase(current,async()=>{await assertAccount(phase.stripeAccountId);await verifyPrice(offer,body.plan);});
  return workspaceBillingStatus(current);
}
async function confirmProofCleanup(c){
  return atomicUpdate(STORE,key(c),row=>{
    if(!row?.testProof?.cleanup||row.testProof.cleanup.state==='complete')return {};
    const safe=!row.checkout||['expired','abandoned'].includes(row.checkout.state)||row.checkout.state==='complete'&&row.subscription?.status==='canceled';
    if(!safe)return {};
    return {value:{...row,testProof:{...row.testProof,cleanup:{...row.testProof.cleanup,state:'complete',confirmedAt:stamp()}}}};
  });
}
async function expireWorkspaceBillingProof(c){
  const requested=await atomicUpdate(STORE,key(c),row=>{
    const proof=row?.testProof;if(!proof||proof.state!=='open'||proof.policy?.cleanupOnExpiry!==true||Date.parse(proof.expiresAt)>Date.now())return {result:false};
    return {value:{...row,stopRequestedAt:row.stopRequestedAt||stamp(),testProof:{...proof,state:'closing',cleanup:proof.cleanup||{operationId:hash(['test-expiry-cleanup',row.tenant,proof.phaseId]).slice(0,32),state:'pending',requestedAt:stamp(),source:'phase_expired'}},...(row.cancellation&&row.subscription?.status!=='canceled'?{cancellation:{...row.cancellation,state:'pending'}}:{})},result:true};
  });
  if(requested)await queueWorkspaceStopBilling(c,{reconcileCheckout:false});
}
export async function cleanupWorkspaceBillingProof(c,actor,body){
  if(!exact(body,['action','phaseId','operationId','confirmed'])||!hex(body.operationId)||body.confirmed!==true)fail('invalid_billing_request','Confirm cleanup of the bound internal TEST subscription.',400);
  const current=await ownerCurrent(c,actor),row=await strictRead(STORE,key(c)),phase=runtimeTestPhase(current,row?.checkout?.offer||row?.testProof?.offer||approvedOffer(),{cleanup:true,retained:row?.testProof?.policy});
  if(!phase||row?.testProof?.phaseId!==body.phaseId||phase.phaseId!==body.phaseId||rowCredentialSlot(row)!=='workspace'||row.livemode!==false)fail('billing_test_phase_required','The original internal TEST payment phase is required.',503);
  await atomicUpdate(STORE,key(c),saved=>{
    if(saved?.testProof?.policyDigest!==phase.digest||saved.testProof.state==='closed')fail('billing_test_phase_changed','The internal TEST payment phase changed or closed.',409);
    if(saved.testProof.cleanup&&saved.testProof.cleanup.operationId!==body.operationId)fail('billing_test_cleanup_exists','Check the existing internal TEST cleanup.',409);
    return {value:{...saved,stopRequestedAt:saved.stopRequestedAt||stamp(),testProof:{...saved.testProof,state:'closing',cleanup:saved.testProof.cleanup||{operationId:body.operationId,state:'pending',requestedAt:stamp()}},...(saved.cancellation&&saved.subscription?.status!=='canceled'?{cancellation:{...saved.cancellation,state:'pending'}}:{})}};
  });
  await queueWorkspaceStopBilling(current,{reconcileCheckout:false});
  try{if((await strictRead(STORE,key(c)))?.checkout)await reconcile(current);await recoverCancellation(current);await confirmProofCleanup(current);}catch{/* Same retained cleanup continues on the ordinary schedule. */}
  return workspaceBillingStatus(current);
}
export async function closeWorkspaceBillingProof(c,actor,body){
  if(!exact(body,['action','phaseId','operationId','confirmed'])||!hex(body.operationId)||body.confirmed!==true)fail('invalid_billing_request','Confirm closing the cleaned internal payment phase.',400);
  await ownerCurrent(c,actor);await confirmProofCleanup(c);
  await atomicUpdate(STORE,key(c),row=>{
    if(!row?.testProof||row.testProof.phaseId!==body.phaseId||row.testProof.cleanup?.state!=='complete')fail('billing_test_cleanup_pending','Confirm the original financial cleanup before closing this phase.',409);
    if(row.testProof.closeOperationId&&row.testProof.closeOperationId!==body.operationId)fail('billing_test_phase_closed','The original close operation is already saved.',409);
    return {value:{...row,testProof:{...row.testProof,state:'closed',closeOperationId:body.operationId,closedAt:row.testProof.closedAt||stamp()}}};
  });
  return workspaceBillingStatus(c);
}
// Portal access is a narrow capability for this workspace's existing financial
// customer. Never use the shared account's default or a caller-selected config.
function portalEnabled(row,c){try{return process.env.WORKSPACE_BILLING_PORTAL_ENABLED==='true'&&id(process.env.WORKSPACE_BILLING_PORTAL_CONFIGURATION_ID,'bpc_')&&mode(credentialForSlot(rowCredentialSlot(row)).secret)===row.livemode&&(!row.livemode||process.env.WORKSPACE_BILLING_LIVE_ENABLED==='true')&&(row.livemode||billingTestMaintenanceAdmits(c,row.checkout?.offer));}catch{return false;}}
function verifyPortalConfiguration(config,configurationId,row){
  const features=config.features||{},allowed=['payment_method_update','invoice_history'];
  if(config.id!==configurationId||config.object!=='billing_portal.configuration'||config.active!==true||config.is_default!==false||config.livemode!==row.livemode||config.application!=null||config.login_page?.enabled!==false||config.metadata?.mc_product!=='machines_and_cloud'||config.metadata?.mc_purpose!=='payment_details_and_invoices'||config.metadata?.mc_portal_version!=='v1'||allowed.some(name=>features[name]?.enabled!==true)||['customer_update','subscription_update','subscription_cancel'].some(name=>features[name]?.enabled!==false)||Object.entries(features).some(([name,feature])=>!allowed.includes(name)&&feature?.enabled!==false))fail('billing_portal_configuration_changed','Payment details are waiting for their secure billing settings to be confirmed.',503);
}
const portalBinding=row=>hash([row.tenant,row.stripeAccountId,row.livemode,row.customerId,row.subscription?.id,row.checkout?.id,row.checkout?.sessionId]);
export async function openWorkspaceBillingPortal(c,actor,body){await ownerCurrent(c,actor);const row=await strictRead(STORE,key(c));if(!row)fail('billing_portal_unavailable','Payment details become available after your subscription is confirmed.',409);return withBillingRecord(c,row,()=>openWorkspaceBillingPortalImpl(c,actor,body));}
async function openWorkspaceBillingPortalImpl(c,actor,body){
  if(!exact(body,['action','requestId'])||!hex(body.requestId))fail('invalid_billing_request','Open payment details from this workspace.',400);
  await ownerCurrent(c,actor);const row=await strictRead(STORE,key(c));
  if(!row||row.tenant!==workspaceTenant(c)||!portalEnabled(row,c)||!id(row.customerId,'cus_')||!id(row.subscription?.id,'sub_')||!id(row.checkout?.sessionId,'cs_')||row.checkout.state!=='complete')fail('billing_portal_unavailable','Payment details become available after your subscription is confirmed.',409);
  const configurationId=process.env.WORKSPACE_BILLING_PORTAL_CONFIGURATION_ID,binding=portalBinding(row);
  await assertAccount(row.stripeAccountId);const config=await stripe('billing_portal/configurations/'+configurationId);verifyPortalConfiguration(config,configurationId,row);
  const session=verifySession(await stripe('checkout/sessions/'+row.checkout.sessionId+'?expand[]=line_items'),row,row.checkout),sub=await stripe('subscriptions/'+row.subscription.id+'?expand[]=items.data.price'),item=sub.items?.data?.[0];
  if(session.status!=='complete'||session.customer!==row.customerId||session.subscription!==row.subscription.id||session.metadata?.mc_billing!=='v1'||sub.id!==row.subscription.id||sub.customer!==row.customerId||sub.livemode!==row.livemode||sub.metadata?.mc_billing!=='v1'||sub.metadata?.mc_tenant!==row.tenant||sub.metadata?.mc_slug!==row.slug||sub.metadata?.mc_attempt!==row.checkout.id||sub.metadata?.mc_offer!==row.checkout.offer.digest||sub.metadata?.mc_plan!==row.checkout.plan||sub.items?.data?.length!==1||sub.items?.has_more||item?.quantity!==1||item?.price?.id!==row.checkout.offer.plans[row.checkout.plan].priceId||sub.currency!=='usd'||item?.price?.currency!=='usd'||item?.price?.unit_amount!==prices[row.checkout.plan])fail('billing_binding_mismatch','The payment account could not be matched to this workspace.',503);
  const index=await strictRead('workspace_billing_subscriptions',String(row.livemode)+'/'+sub.id);if(!index||index.slug!==row.slug||index.tenant!==row.tenant||index.customerId!==row.customerId||index.stripeAccountId!==row.stripeAccountId)fail('billing_binding_mismatch','The saved payment account is not confirmed for this workspace.',503);
  // A customer reused across tenants would expose unrelated invoices. Keep the
  // original confirmed customer bound to exactly one workspace incarnation.
  await atomicUpdate('workspace_billing_customers',String(row.livemode)+'/'+row.customerId,previous=>{if(previous&&(previous.tenant!==row.tenant||previous.slug!==row.slug||previous.stripeAccountId!==row.stripeAccountId))fail('billing_binding_mismatch','This payment account is already bound to another workspace.',503);return {value:{tenant:row.tenant,slug:row.slug,stripeAccountId:row.stripeAccountId}};});
  await ownerCurrent(c,actor);const latest=await strictRead(STORE,key(c));if(portalBinding(latest)!==binding||!portalEnabled(latest,c)||process.env.WORKSPACE_BILLING_PORTAL_CONFIGURATION_ID!==configurationId)fail('workspace_changed','Your billing details changed. Check their saved status.');
  const intent=await atomicUpdate(STORE,key(c),current=>{if(portalBinding(current)!==binding)fail('workspace_changed','Your billing details changed. Check their saved status.');const prior=current.portal;if(prior?.requestId===body.requestId){if(prior.configurationId!==configurationId||prior.binding!==binding||prior.actor!==actorEmail(actor)||Date.parse(prior.createdAt)<=Date.now()-5*60000)fail('billing_portal_expired','This secure payment link expired. Open payment details again.');return {result:prior};}const next={id:token(),requestId:body.requestId,actor:actorEmail(actor),binding,configurationId,createdAt:stamp(),state:'pending'};return {value:{...current,portal:next},result:next};});
  const returnURL=accessSite()+'/desk.html?c='+encodeURIComponent(c.slug)+'#account';let result,providerStarted=false;
  try{if(!portalEnabled(row,await ownerCurrent(c,actor)))fail('billing_portal_unavailable','This test payment-details admission expired. Your saved subscription remains available.');providerStarted=true;result=await stripe('billing_portal/sessions',{method:'POST',params:{configuration:configurationId,customer:row.customerId,return_url:returnURL},idempotencyKey:'workspace-portal-'+intent.id,authorize:async()=>{const saved=await strictRead(STORE,key(c)),current=await ownerCurrent(c,actor);if(portalBinding(saved)!==binding||saved.portal?.id!==intent.id||!portalEnabled(saved,current)||process.env.WORKSPACE_BILLING_PORTAL_CONFIGURATION_ID!==configurationId)fail('workspace_changed','Your billing details changed before the secure link was created.',409);}});}
  catch(error){await atomicUpdate(STORE,key(c),current=>current?.portal?.id===intent.id?{value:{...current,portal:{...current.portal,state:providerStarted&&error.workspaceProviderOutcome!=='not_sent'?'uncertain':'abandoned',reasonCode:error.code||'provider_result_unconfirmed',updatedAt:stamp()}}}:{});throw error;}
  const url=paymentURL(result.url,'billing.stripe.com');if(!id(result.id,'bps_')||result.object!=='billing_portal.session'||result.configuration!==configurationId||result.customer!==row.customerId||result.livemode!==row.livemode||result.return_url!==returnURL||result.on_behalf_of||!url)fail('billing_binding_mismatch','The secure payment link could not be confirmed for this workspace.',503);
  await ownerCurrent(c,actor);const after=await strictRead(STORE,key(c));if(portalBinding(after)!==binding||!portalEnabled(after,c)||process.env.WORKSPACE_BILLING_PORTAL_CONFIGURATION_ID!==configurationId)fail('workspace_changed','Your billing view changed. Open payment details again.');
  await atomicUpdate(STORE,key(c),current=>current?.portal?.id===intent.id?{value:{...current,portal:{...current.portal,state:'complete',sessionId:result.id,updatedAt:stamp()}}}:{});
  // The short-lived hosted capability is returned only to this current owner;
  // its secret URL is never stored in our durable financial journal.
  return {url,expiresAt:new Date(Date.parse(intent.createdAt)+5*60000).toISOString()};
}
export async function reviewWorkspaceBilling(c,actor,body){await ownerCurrent(c,actor);return withBillingPurchase(c,()=>reviewWorkspaceBillingImpl(c,actor,body));}
async function reviewWorkspaceBillingImpl(c,actor,body){
  if(!exact(body,['action','plan','expectedRevision'])||!Object.hasOwn(prices,body.plan))fail('invalid_billing_request','Choose Coverage or Follow-through to review its terms.',400);
  const current=await ownerCurrent(c,actor,body.expectedRevision),offer=approvedOffer();if(offer&&billingEnabled())operating(current);if(!offer||!purchasesEnabled(current,offer))fail('billing_unavailable','Your workspace is free to prepare. We will show your complete paid offer here when it is ready.',503);
  const services=await ready(current,offer.plans[body.plan]);await assertAccount(offer.stripeAccountId);await verifyPrice(offer,body.plan);
  const latest=await ownerCurrent(c,actor,body.expectedRevision);if(businessStamp(latest)!==businessStamp(current)||approvedOffer()?.digest!==offer.digest||!purchasesEnabled(latest,offer))fail('configuration_changed','Your setup or offer changed. Review it again.');
  const reviewId=token(),review={id:reviewId,credentialSlot:defaultCredentialSlot(),tenant:workspaceTenant(c),slug:c.slug,actor:actorEmail(actor),businessStamp:businessStamp(current),configurationRevision:configurationRevision(current),offer,plan:body.plan,services,...(defaultCredentialSlot()==='workspace'&&mode()===false?{testPhaseId:runtimeTestPhase(current,offer)?.phaseId}:{}),createdAt:stamp(),expiresAt:new Date(Date.now()+15*60000).toISOString()};
  await atomicUpdate(REVIEWS,key(c)+'/'+reviewId,row=>row?{}:{value:review});return {reviewId,expiresAt:review.expiresAt,offer:quoteView(offer,body.plan,services)};
}
function parameters(c,review,attemptId,expiresAt,customer){const base=accessSite()+'/desk.html?c='+encodeURIComponent(c.slug),metadata={mc_billing:'v1',mc_slug:c.slug,mc_tenant:workspaceTenant(c),mc_attempt:attemptId,mc_offer:review.offer.digest,mc_plan:review.plan,mc_services:review.services.join(',')};return {mode:'subscription','line_items[0][price]':review.offer.plans[review.plan].priceId,'line_items[0][quantity]':'1','payment_method_types[0]':'card',allow_promotion_codes:'false','automatic_tax[enabled]':'false',success_url:base+'&billing=returned#account',cancel_url:base+'&billing=cancelled#account',client_reference_id:attemptId,expires_at:String(expiresAt),...(customer?{customer}:{customer_email:c.owner.email}),...Object.fromEntries(Object.entries(metadata).flatMap(([k,v])=>[['metadata['+k+']',v],['subscription_data[metadata]['+k+']',v]]))};}
function verifySession(session,row,attempt){if(!id(session.id,'cs_')||session.mode!=='subscription'||session.livemode!==row.livemode||session.client_reference_id!==attempt.id||session.metadata?.mc_tenant!==row.tenant||session.metadata?.mc_slug!==row.slug||session.metadata?.mc_attempt!==attempt.id||session.metadata?.mc_offer!==attempt.offer.digest||session.metadata?.mc_plan!==attempt.plan||attempt.services&&session.metadata?.mc_services!==attempt.services.join(',')||session.currency!=='usd'||session.amount_total!==prices[attempt.plan]||session.total_details?.amount_discount||session.total_details?.amount_shipping||session.total_details?.amount_tax)fail('billing_binding_mismatch','The payment record could not be matched to this workspace.',503);const items=session.line_items?.data;if(!Array.isArray(items)||items.length!==1||session.line_items.has_more||items[0].quantity!==1||items[0].price?.id!==attempt.offer.plans[attempt.plan].priceId)fail('billing_binding_mismatch','The payment record has an unexpected price or quantity.',503);return session;}
async function saveSession(c,attemptId,session){return atomicUpdate(STORE,key(c),row=>{if(!row||row.tenant!==workspaceTenant(c)||row.checkout?.id!==attemptId)fail('workspace_changed','Your workspace billing changed. Refresh its status.');verifySession(session,row,row.checkout);if(row.checkout.sessionId&&row.checkout.sessionId!==session.id)fail('billing_binding_mismatch','Two different checkouts were returned for the same request.',503);if(row.checkout.state==='complete'&&session.status==='open')return {};const url=paymentURL(session.url),state=session.status==='expired'?'expired':session.status==='complete'?'complete':session.status==='open'&&url?'open':'uncertain';if(!Number.isSafeInteger(session.expires_at))fail('billing_binding_mismatch','The checkout expiry could not be confirmed.',503);return {value:{...row,checkout:{...row.checkout,sessionId:session.id,state,url:state==='open'?url:null,expiresAt:new Date(session.expires_at*1000).toISOString(),claim:null,updatedAt:stamp()},updatedAt:stamp()},result:row};});}
async function executeCheckout(c,actor,attempt){const row=await strictRead(STORE,key(c));if(!row)return;return withBillingRecord(c,row,()=>executeCheckoutImpl(c,actor,attempt));}
async function executeCheckoutImpl(c,actor,attempt){
  const claimed=await atomicUpdate(STORE,key(c),row=>{if(row?.checkout?.id!==attempt.id)fail('checkout_changed','Check your current billing request.');if(row.checkout.sessionId)return {result:null};if(row.checkout.claim&&Date.parse(row.checkout.claim.until)>Date.now())return {result:null};if(Date.parse(row.checkout.startedAt)<Date.now()-23*3600000)return {result:null};const claim=token();return {value:{...row,checkout:{...row.checkout,state:'pending',claim:{token:claim,until:new Date(Date.now()+30000).toISOString()}}},result:claim};});
  if(!claimed)return workspaceBillingStatus(c);
  let providerStarted=false;
  try{const current=await ownerCurrent(c,actor);if(businessStamp(current)!==attempt.businessStamp||approvedOffer()?.digest!==attempt.offer.digest||!purchasesEnabled(current,attempt.offer))fail('configuration_changed','Your setup or paid offer changed. Check billing status before continuing.');await ready(current,attempt.offer.plans[attempt.plan]);await assertAccount(attempt.offer.stripeAccountId);await verifyPrice(attempt.offer,attempt.plan);const latest=await ownerCurrent(c,actor);if(businessStamp(latest)!==attempt.businessStamp||approvedOffer()?.digest!==attempt.offer.digest||!purchasesEnabled(latest,attempt.offer))fail('configuration_changed','Your setup changed before checkout. Check its saved status.');await atomicUpdate(STORE,key(c),row=>row?.checkout?.claim?.token===claimed?{value:{...row,checkout:{...row.checkout,dispatchStartedAt:row.checkout.dispatchStartedAt||stamp()}}}:{});if(!purchasesEnabled(await ownerCurrent(c,actor),attempt.offer))fail('billing_review_expired','This test checkout admission expired. Check the saved billing status.');providerStarted=true;const session=await stripe('checkout/sessions?expand[]=line_items',{method:'POST',params:attempt.params,idempotencyKey:'workspace-checkout-'+attempt.id,authorize:async()=>{const saved=await strictRead(STORE,key(c)),latest=await ownerCurrent(c,actor);if(saved?.checkout?.id!==attempt.id||saved.checkout.claim?.token!==claimed||saved.stopRequestedAt||businessStamp(latest)!==attempt.businessStamp||approvedOffer()?.digest!==attempt.offer.digest||!purchasesEnabled(latest,attempt.offer))fail('billing_review_expired','The original owner, setup or payment request changed before checkout. Check its saved status.',409);}});await saveSession(c,attempt.id,session);const after=await strictRead('clients',c.slug);if(after?.status==='cancelled'||(await strictRead(STORE,key(c)))?.stopRequestedAt)await reconcile(c);}
  catch(error){await atomicUpdate(STORE,key(c),row=>row?.checkout?.id===attempt.id&&row.checkout.claim?.token===claimed?{value:{...row,checkout:{...row.checkout,state:providerStarted&&error.workspaceProviderOutcome!=='not_sent'?'uncertain':'abandoned',claim:null,reasonCode:error.code||'provider_result_unconfirmed',updatedAt:stamp()}}}:{});}
  return workspaceBillingStatus(c);
}
export async function startWorkspaceCheckout(c,actor,body){
  if(!exact(body,['action','reviewId','requestId','acceptedTerms','expectedRevision'])||!hex(body.reviewId)||!hex(body.requestId)||body.acceptedTerms!==true)fail('billing_acceptance_required','Review the monthly price and service terms, then check the agreement to continue.',400);
  const current=await ownerCurrent(c,actor,body.expectedRevision),review=await strictRead(REVIEWS,key(c)+'/'+body.reviewId);
  if(!review||review.tenant!==workspaceTenant(c)||review.actor!==actorEmail(actor)||Date.parse(review.expiresAt)<=Date.now()||review.businessStamp!==businessStamp(current)||review.offer.digest!==approvedOffer()?.digest||(review.credentialSlot||'legacy')!==defaultCredentialSlot()||!purchasesEnabled(current,review.offer)||defaultCredentialSlot()==='workspace'&&mode()===false&&review.testPhaseId!==runtimeTestPhase(current,review.offer)?.phaseId)fail('billing_review_expired','Review your current offer again before checkout.');
  await ready(current,review.offer.plans[review.plan]);
  const attemptId=token(),expiresAt=Math.floor(Date.now()/1000)+3600;
  const attempt=await atomicUpdate(STORE,key(c),row=>{if(row&&row.tenant!==workspaceTenant(c))fail('billing_binding_mismatch','The saved billing record belongs to another workspace.');if(row&&(row.livemode!==mode()||row.stripeAccountId!==review.offer.stripeAccountId||rowCredentialSlot(row)!==defaultCredentialSlot()))fail('billing_account_changed','Keep existing financial records on their original payment account and mode.',409);if(activeSubscription(row?.subscription?.status))fail('subscription_exists','This workspace already has a subscription. Manage it below.');if(row?.checkout&&!['expired','abandoned'].includes(row.checkout.state)&&!['canceled','incomplete_expired'].includes(row.subscription?.status)){if(row.checkout.requestId!==body.requestId||row.checkout.plan!==review.plan||row.checkout.offer.digest!==review.offer.digest)fail('checkout_exists','A checkout is already saved. Continue it or check its status first.');return {result:row.checkout};}if((row?.generation||0)>=100)fail('billing_review_required','Billing needs a review before another checkout can be created.');const next={id:attemptId,requestId:body.requestId,plan:review.plan,services:review.services,offer:review.offer,businessStamp:review.businessStamp,actor:review.actor,acceptedTerms:{version:review.offer.terms.version,digest:hash(review.offer.terms),at:stamp()},params:parameters(current,review,attemptId,expiresAt,row?.customerId),state:'pending',startedAt:stamp(),createdAt:stamp()};return {value:{...row,version:1,slug:c.slug,tenant:workspaceTenant(c),credentialSlot:defaultCredentialSlot(),livemode:mode(),stripeAccountId:review.offer.stripeAccountId,generation:(row?.generation||0)+1,history:row?.checkout?[...(row.history||[]),{checkout:row.checkout,subscription:row.subscription||null,cancellation:row.cancellation||null}]:row?.history||[],checkout:next,cancellation:null,stopRequestedAt:null,updatedAt:stamp()},result:next};});
  return executeCheckout(current,actor,attempt);
}
async function canonicalPaidPeriod(c,row,sub){
  if(row.livemode!==true)return null;
  const contract=paidContract(row,c);if(!contract)return null;
  if(!id(sub.latest_invoice,'in_'))return null;
  const invoice=await stripe('invoices/'+sub.latest_invoice),subscription=invoice.parent?.subscription_details?.subscription||invoice.subscription;
  if(invoice.id!==sub.latest_invoice||invoice.livemode!==true||invoice.customer!==row.customerId||subscription!==sub.id||invoice.currency!=='usd')fail('billing_binding_mismatch','The paid invoice belongs to its original subscription.',503);
  // An unpaid renewal is not a grant, and cannot erase a separately funded
  // current period retained below. A Checkout's old paid flag is not renewal.
  if(invoice.status!=='paid')return null;
  const line=invoice.lines?.data?.[0],start=line?.period?.start,end=line?.period?.end;
  const cashPaid=Number.isSafeInteger(invoice.amount_paid)&&invoice.amount_paid>=0&&invoice.amount_paid<=contract.amountCents,accountCredit=cashPaid&&Number.isSafeInteger(invoice.starting_balance)&&invoice.starting_balance<0&&invoice.amount_due===invoice.amount_paid&&invoice.amount_due===Math.max(0,contract.amountCents+invoice.starting_balance)&&invoice.ending_balance===Math.min(0,contract.amountCents+invoice.starting_balance);
  if(!['subscription_create','subscription_cycle'].includes(invoice.billing_reason)||(!cashPaid||invoice.amount_paid!==contract.amountCents&&!accountCredit)||invoice.amount_remaining!==0||invoice.total!==contract.amountCents||invoice.lines?.has_more!==false||invoice.lines?.data?.length!==1||(line.pricing?.price_details?.price||line.price?.id)!==contract.priceId||line.amount!==contract.amountCents||line.currency!=='usd'||line.livemode!==true||line.quantity!==1||(line.parent?.subscription_item_details?.subscription||line.subscription)!==sub.id||(line.parent?.subscription_item_details?.proration??line.proration)!==false||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<=0||end<=start)fail('billing_binding_mismatch','The funded subscription period could not be confirmed.',503);
  return {version:1,tenant:row.tenant,stripeAccountId:row.stripeAccountId,livemode:true,checkoutId:row.checkout.id,subscriptionId:sub.id,customerId:row.customerId,offerDigest:contract.offerDigest,priceId:contract.priceId,services:contract.services,invoiceId:invoice.id,start,end,confirmedAt:stamp()};
}
function fundedPeriodProjection(current,c,paid){
  if(!paid)return {};
  const contract=paidContract(current,c),at=Math.floor(Date.now()/1000),periods=[paid,current.paidPeriod,current.nextPaidPeriod].filter(p=>paidPeriodMatches(p,current,contract));
  const present=periods.filter(p=>p.start<=at&&at<p.end).sort((a,b)=>b.end-a.end)[0],future=periods.filter(p=>p.start>at).sort((a,b)=>a.start-b.start)[0];
  return {...(present?{paidPeriod:present}:{}),...(future?{nextPaidPeriod:future}:{})};
}
async function subscriptionProjection(c,row,session){
  if(session.status!=='complete'||!id(session.customer,'cus_')||!id(session.subscription,'sub_'))return;
  const sub=await stripe('subscriptions/'+session.subscription+'?expand[]=items.data.price');
  const attempt=row.checkout,item=sub.items?.data?.[0];if(sub.id!==session.subscription||sub.customer!==session.customer||sub.livemode!==row.livemode||sub.metadata?.mc_tenant!==row.tenant||sub.metadata?.mc_attempt!==attempt.id||sub.metadata?.mc_offer!==attempt.offer.digest||sub.metadata?.mc_slug!==row.slug||sub.metadata?.mc_plan!==attempt.plan||attempt.services&&sub.metadata?.mc_services!==attempt.services.join(',')||sub.items?.data?.length!==1||sub.items?.has_more||item?.price?.id!==attempt.offer.plans[attempt.plan].priceId||item.quantity!==1||item.price.currency!=='usd'||item.price.unit_amount!==prices[attempt.plan]||sub.currency!=='usd')fail('billing_binding_mismatch','The subscription could not be matched to your accepted offer.',503);
  if(row.customerId&&row.customerId!==sub.customer||row.subscription?.id&&row.subscription.id!==sub.id&&activeSubscription(row.subscription.status))fail('billing_binding_mismatch','The subscription identity changed unexpectedly.',503);
  await atomicUpdate('workspace_billing_subscriptions',String(row.livemode)+'/'+sub.id,previous=>{if(previous&&(previous.tenant!==row.tenant||previous.slug!==row.slug))fail('billing_binding_mismatch','This subscription is already bound to another workspace.',503);return {value:{slug:row.slug,tenant:row.tenant,customerId:sub.customer,stripeAccountId:row.stripeAccountId}};});
  await atomicUpdate('workspace_billing_customers',String(row.livemode)+'/'+sub.customer,previous=>{if(previous&&(previous.tenant!==row.tenant||previous.slug!==row.slug||previous.stripeAccountId!==row.stripeAccountId))fail('billing_binding_mismatch','This payment account belongs to another workspace.',503);return {value:{tenant:row.tenant,slug:row.slug,stripeAccountId:row.stripeAccountId}};});
  const periodEnd=item.current_period_end||sub.current_period_end;
  const financial={...row,checkout:{...row.checkout,state:'complete'},customerId:sub.customer,subscription:{...row.subscription,id:sub.id}};
  let paid=null,paidPeriodCheck;
  if(row.livemode===true){
    try{paid=await canonicalPaidPeriod(c,financial,sub);paidPeriodCheck={state:paid?'confirmed':'not_paid',at:stamp()};}
    catch(error){
      // Funding uncertainty never invents a new period or prevents a known
      // financial cancellation/receipt from being reconciled. Authority changes
      // and worker deadlines still stop this entire projection.
      if(error instanceof WorkspaceBillingError&&!['billing_provider_unavailable','billing_response_uncertain','billing_binding_mismatch'].includes(error.code))throw error;
      paidPeriodCheck={state:'unconfirmed',reasonCode:'paid_invoice_unconfirmed',at:stamp()};
    }
  }
  await atomicUpdate(STORE,key(c),current=>{if(!current||current.checkout?.id!==attempt.id||current.tenant!==workspaceTenant(c))fail('workspace_changed','The workspace changed during payment reconciliation.');return {value:{...current,...(paidPeriodCheck?{paidPeriodCheck}:{}),...fundedPeriodProjection({...current,checkout:{...current.checkout,state:'complete'},customerId:sub.customer,subscription:{...current.subscription,id:sub.id}},c,paid),customerId:sub.customer,subscription:{id:sub.id,status:session.payment_status==='paid'||['incomplete','incomplete_expired','canceled','past_due','unpaid'].includes(sub.status)?sub.status:'payment_pending',plan:attempt.plan,services:attempt.services||attempt.offer.plans[attempt.plan].services,cancelAtPeriodEnd:sub.cancel_at_period_end===true,currentPeriodEnd:Number.isSafeInteger(periodEnd)?new Date(periodEnd*1000).toISOString():null,observedAt:stamp()},...(current.testProof&&id(sub.latest_invoice,'in_')?{testProof:{...current.testProof,invoiceId:sub.latest_invoice}}:{}),checkout:{...current.checkout,state:'complete',url:null},updatedAt:stamp()}};});
}
async function reconcile(c,{sessionId=null}={}){const row=await strictRead(STORE,key(c));if(!row)return;return withBillingRecord(c,row,()=>reconcileImpl(c,{sessionId}));}
async function reconcileImpl(c,{sessionId=null}={}){
  let row=await strictRead(STORE,key(c));if(!row?.checkout)return;
  if(mode()!==row.livemode)fail('billing_mode_changed','Billing is waiting for the original payment account.',503);await assertAccount(row.stripeAccountId);
  const lease=token(),locked=await atomicUpdate(STORE,key(c),current=>{if(current?.reconcileClaim&&Date.parse(current.reconcileClaim.until)>Date.now())return {result:false};return {value:{...current,reconcileClaim:{token:lease,until:new Date(Date.now()+30000).toISOString()}},result:true};});if(!locked)fail('billing_busy','Billing is already checking the saved payment. Please check again shortly.',503);
  try{
    row=await strictRead(STORE,key(c));let receiptId=row.checkout.sessionId||sessionId;
    if(!receiptId){const since=Math.floor(Date.parse(row.checkout.startedAt)/1000)-60,results=await stripe('checkout/sessions?limit=100&created[gte]='+since+'&expand[]=data.line_items');const matches=(results.data||[]).filter(value=>value.metadata?.mc_tenant===row.tenant&&value.metadata?.mc_attempt===row.checkout.id);if(matches.length===1)receiptId=matches[0].id;else{await atomicUpdate(STORE,key(c),current=>({value:{...current,checkout:{...current.checkout,state:'uncertain',reasonCode:results.has_more?'checkout_search_incomplete':'provider_result_unconfirmed'}}}));return;}}
    if(!id(receiptId,'cs_'))fail('billing_binding_mismatch','The checkout identity is invalid.',503);
    let session=verifySession(await stripe('checkout/sessions/'+receiptId+'?expand[]=line_items'),row,row.checkout);const currentClient=await strictRead('clients',c.slug),stopping=currentClient?.status==='cancelled'||row.stopRequestedAt;
    if(stopping&&session.status==='open'){try{await stripe('checkout/sessions/'+session.id+'/expire',{method:'POST',params:{},idempotencyKey:'workspace-expire-'+row.checkout.id});}catch{/* The same session is checked again before any retry. */}session=verifySession(await stripe('checkout/sessions/'+receiptId+'?expand[]=line_items'),row,row.checkout);}
    await saveSession(c,row.checkout.id,session);await subscriptionProjection(c,await strictRead(STORE,key(c)),session);if(stopping&&session.status==='complete'){await queueWorkspaceStopBilling(currentClient,{reconcileCheckout:false});await atomicUpdate(STORE,key(c),current=>({value:{...current,paymentReconciledAfterStopAt:current.paymentReconciledAfterStopAt||stamp(),reasonCode:'payment_found_after_stop'}}));}
  }finally{await atomicUpdate(STORE,key(c),current=>current?.reconcileClaim?.token===lease?{value:{...current,reconcileClaim:null}}:{});}
}
export async function refreshWorkspaceBilling(c,actor,body){if(!exact(body,['action']))fail('invalid_billing_request','Check the saved billing status.',400);await ownerCurrent(c,actor);await reconcile(c);return workspaceBillingStatus(c);}
export async function cancelWorkspaceRenewal(c,actor,body){
  if(!exact(body,['action','requestId','confirmed'])||!hex(body.requestId)||body.confirmed!==true)fail('billing_confirmation_required','Confirm ending renewal before continuing.',400);await ownerCurrent(c,actor);const row=await strictRead(STORE,key(c));if(!row?.subscription?.id||!activeSubscription(row.subscription.status))fail('subscription_missing','There is no active subscription to change.');
  await atomicUpdate(STORE,key(c),current=>{if(current?.subscription?.id!==row.subscription.id)fail('billing_binding_mismatch','Your subscription changed. Check its status.');if(current.cancellation&&current.cancellation.subscriptionId===row.subscription.id)return {};return {value:{...current,cancellation:{id:token(),requestId:body.requestId,subscriptionId:row.subscription.id,state:'pending',actor:actorEmail(actor),requestedAt:stamp()}}};});
  await recoverCancellation(c);return workspaceBillingStatus(c);
}
async function recoverCancellation(c){const row=await strictRead(STORE,key(c));if(!row)return;return withBillingRecord(c,row,()=>recoverCancellationImpl(c));}
async function recoverCancellationImpl(c){
  let row=await strictRead(STORE,key(c));if(!row?.cancellation||row.cancellation.state==='complete')return;
  // Owner controls and scheduled continuation share this same claim. In
  // particular, concurrent recovery cannot rotate a 23-hour idempotency key
  // twice after reading the same older provider snapshot.
  const claim=token(),until=new Date((recoveryScope.getStore()?.deadlineAt||Date.now()+55000)+5000).toISOString();
  const locked=await atomicUpdate(STORE,key(c),current=>{
    if(current?.cancellation?.id!==row.cancellation.id||current.cancellation.state==='complete')return {result:false};
    if(current.cancellation.recoveryClaim&&Date.parse(current.cancellation.recoveryClaim.until)>Date.now())return {result:false};
    return {value:{...current,cancellation:{...current.cancellation,recoveryClaim:{token:claim,until}}},result:true};
  });
  if(!locked)fail('billing_busy','Billing is already checking the saved renewal request. Please check again shortly.',503);
  const originalAttempt=row.checkout?.id,originalTenant=row.tenant,subscriptionId=row.cancellation.subscriptionId;
  const currentClaim=async()=>{
    const current=await strictRead(STORE,key(c)),client=await strictRead('clients',c.slug);
    if(!isSupportedSelfServiceClient(client)||workspaceTenant(client)!==originalTenant||current?.tenant!==originalTenant||current.checkout?.id!==originalAttempt||current.cancellation?.subscriptionId!==subscriptionId)fail('billing_binding_mismatch','The saved renewal request belongs to the original workspace and subscription.',503);
    if(current.cancellation.recoveryClaim?.token!==claim||Date.parse(current.cancellation.recoveryClaim.until)<=Date.now())fail('billing_busy','A newer recovery owns this renewal request. Check its saved status.',503);
    return current;
  };
  try{
  row=await currentClaim();
  if(mode()!==row.livemode)fail('billing_mode_changed','Renewal cancellation is saved and waiting for the original payment account.',503);await assertAccount(row.stripeAccountId);
  await currentClaim();
  if(row.cancellation.subscriptionId!==row.subscription?.id)return;
  const sub=await stripe('subscriptions/'+row.cancellation.subscriptionId);if(sub.customer!==row.customerId||sub.metadata?.mc_tenant!==row.tenant||sub.metadata?.mc_attempt!==row.checkout.id)fail('billing_binding_mismatch','The renewal request could not be matched to your subscription.',503);
  const latest=await currentClaim();if(latest?.subscription?.id!==row.subscription.id||latest?.cancellation?.id!==row.cancellation.id)return;
  const immediate=!!row.testProof?.cleanup&&row.livemode===false&&rowCredentialSlot(row)==='workspace';
  if((immediate||sub.cancel_at_period_end!==true)&&sub.status!=='canceled'){
    if(Date.parse(row.cancellation.attemptedAt||row.cancellation.requestedAt)<Date.now()-23*3600000){const previousId=row.cancellation.id;await atomicUpdate(STORE,key(c),current=>current?.cancellation?.id!==previousId||current.cancellation.recoveryClaim?.token!==claim?{}:{value:{...current,cancellation:{...current.cancellation,id:token(),generation:(current.cancellation.generation||0)+1,attemptedAt:stamp(),state:'pending'}}});row=await currentClaim();}
    await atomicUpdate(STORE,key(c),current=>current?.cancellation?.recoveryClaim?.token===claim?{value:{...current,cancellation:{...current.cancellation,attemptedAt:current.cancellation.attemptedAt||stamp()}}}:{});
    await currentClaim();
    try{await stripe('subscriptions/'+sub.id,immediate?{method:'DELETE',params:{invoice_now:'false',prorate:'false'},idempotencyKey:'workspace-proof-cleanup-'+row.testProof.cleanup.operationId}:{method:'POST',params:{cancel_at_period_end:'true'},idempotencyKey:'workspace-renewal-'+row.cancellation.id});}catch{await atomicUpdate(STORE,key(c),current=>current?.cancellation?.recoveryClaim?.token===claim&&current.cancellation.state!=='complete'?{value:{...current,cancellation:{...current.cancellation,state:'uncertain'}}}:{});return;}
  }
  await reconcile(c);row=await currentClaim();if((!immediate&&row.subscription?.cancelAtPeriodEnd)||row.subscription?.status==='canceled')await atomicUpdate(STORE,key(c),current=>current?.cancellation?.recoveryClaim?.token===claim?{value:{...current,cancellation:{...current.cancellation,state:'complete',confirmedAt:stamp()}}}:{});
  await confirmProofCleanup(c);
  }finally{await atomicUpdate(STORE,key(c),current=>current?.cancellation?.recoveryClaim?.token===claim?{value:{...current,cancellation:{...current.cancellation,recoveryClaim:null}}}:{});}
}
// Stop-service acceptance includes ending the monthly renewal. This durable
// write is also repaired by the ordinary scheduler after a lost stop response.
export async function queueWorkspaceStopBilling(c,{reconcileCheckout=true}={}){
  await atomicUpdate(STORE,key(c),row=>{if(!row||row.tenant!==workspaceTenant(c))return {};const cancellation=activeSubscription(row.subscription?.status)&&row.cancellation?.subscriptionId!==row.subscription.id?{id:token(),requestId:token(),subscriptionId:row.subscription.id,state:'pending',actor:normalizeAccountEmail(c.owner.email),requestedAt:stamp(),source:'workspace_stopped'}:row.cancellation||null;return {value:{...row,stopRequestedAt:row.stopRequestedAt||stamp(),cancellation}};});
  const saved=await strictRead(STORE,key(c));if(reconcileCheckout&&saved?.checkout?.sessionId&&saved.checkout.state==='open')try{await reconcile(c);}catch{/* Ordinary recovery retains the same session to expire. */}
}
export async function recoverWorkspaceBilling({limit=3,deadlineAt=Date.now()+RECOVERY_WAVE_MS}={}){
  if(!Number.isInteger(limit)||limit<1||limit>3||!Number.isSafeInteger(deadlineAt)||deadlineAt<=Date.now()||deadlineAt>Date.now()+RECOVERY_WAVE_MS)fail('invalid_billing_recovery','Billing recovery requires a bounded wave.',400);
  const at=stamp(),started=Date.now(),lease=token(),outcomes=[];
  const locked=await atomicUpdate(RECOVERY_CURSOR,'active',cursor=>{
    if(cursor?.lease&&Date.parse(cursor.lease.until)>Date.now())return {result:false};
    const generation=(cursor?.generation||0)+1;
    if(!Number.isSafeInteger(generation)||generation<1)fail('billing_recovery_review','Billing recovery needs an operator review of its saved cursor.',503);
    return {value:{...cursor,generation,lease:{token:lease,at,until:new Date(deadlineAt+5000).toISOString()}},result:generation};
  });
  if(!locked)return {ok:true,visited:0,outcomes,skipped:'wave_running'};
  let reasonCode=null;
  try{
    const keys=await list(STORE,''),cursor=await strictRead(RECOVERY_CURSOR,'active');
    const page=[...keys.filter(value=>value>(cursor?.key||'')),...keys.filter(value=>value<=(cursor?.key||''))].slice(0,limit);
    for(const recordKey of page){
      if(Date.now()>=deadlineAt){reasonCode='billing_recovery_deadline';break;}
      const currentLease=await strictRead(RECOVERY_CURSOR,'active');
      if(currentLease?.lease?.token!==lease){reasonCode='billing_recovery_replaced';break;}
      let row=await strictRead(STORE,recordKey);const c=row&&await strictRead('clients',row.slug);
      if(!isSupportedSelfServiceClient(c)||workspaceTenant(c)!==row.tenant||recordKey!==key(c))outcomes.push({state:'workspace_changed'});
      else{
        await expireWorkspaceBillingProof(c);row=await strictRead(STORE,recordKey);
        const {slot,secret}=credentialForSlot(rowCredentialSlot(row)),attemptId=row.checkout?.id,accountId=row.stripeAccountId,tenant=row.tenant,live=row.livemode,recordDeadline=Math.min(deadlineAt,Date.now()+RECOVERY_RECORD_MS);
        const assertCurrent=async()=>{
          const active=await strictRead(RECOVERY_CURSOR,'active'),client=await strictRead('clients',c.slug),saved=await strictRead(STORE,recordKey);
          if(Date.now()>=recordDeadline)fail('billing_recovery_deadline','Billing recovery will continue on its next scheduled run.',503);
          if(active?.lease?.token!==lease||Date.parse(active.lease.until)<=Date.now())fail('billing_recovery_replaced','A newer recovery run owns this billing request.',503);
          if(!isSupportedSelfServiceClient(client)||workspaceTenant(client)!==tenant||saved?.tenant!==tenant||saved.checkout?.id!==attemptId||saved.stripeAccountId!==accountId||saved.livemode!==live||rowCredentialSlot(saved)!==slot||credentialForSlot(slot).secret!==secret)fail('billing_recovery_changed','The original workspace or payment account changed. Its billing record is kept.',503);
        };
        try{
          await recoveryScope.run({deadlineAt:recordDeadline,assertCurrent},async()=>{
            await assertCurrent();
            if(row.testProof?.cleanup?.state==='complete')return;
            if(c.status==='cancelled'){await queueWorkspaceStopBilling(c);row=await strictRead(STORE,recordKey);}
            if(row.cancellation&&row.cancellation.state!=='complete')await recoverCancellation(c);
            // A received Checkout URL does not mean its later payment/expiry webhook
            // arrived. Re-read that same open Session in this bounded wave too.
            else if(row.checkout&&['pending','uncertain','open','complete'].includes(row.checkout.state))await reconcile(c);
            await confirmProofCleanup(c);
            await assertCurrent();
          });
          const saved=await strictRead(STORE,recordKey);
          outcomes.push(saved?.cancellation&&saved.cancellation.state!=='complete'?{state:'unconfirmed',reasonCode:'renewal_unconfirmed'}:saved?.checkout&&['pending','uncertain'].includes(saved.checkout.state)?{state:'unconfirmed',reasonCode:'checkout_unconfirmed'}:{state:'checked'});
        }catch(error){outcomes.push({state:'unconfirmed',reasonCode:error.code||'billing_recovery_unconfirmed'});}
      }
      // Advance for each visited record, including invalid/slow records, so a
      // failing customer never starves the tail. Preserve the same wave lease.
      const advanced=await atomicUpdate(RECOVERY_CURSOR,'active',current=>current?.lease?.token===lease?{value:{...current,key:recordKey},result:true}:{result:false});
      if(!advanced){reasonCode='billing_recovery_replaced';break;}
    }
  }catch(error){reasonCode=error.code||'billing_recovery_unavailable';}
  finally{
    const result={at,completedAt:stamp(),waveGeneration:locked,ok:!reasonCode&&outcomes.every(row=>row.state==='checked'),visited:outcomes.length,outcomes,durationMs:Date.now()-started,...(reasonCode?{reasonCode}:{})};
    // A stale response cannot erase a newer run's health or release its lease.
    const released=await atomicUpdate(RECOVERY_CURSOR,'active',current=>current?.lease?.token===lease?{value:{...current,lease:null,lastCompletedAt:result.completedAt},result:true}:{result:false});
    if(released)await atomicUpdate('health','workspaceBilling:lastRun',previous=>{
      if(previous&&(Number.isSafeInteger(previous.waveGeneration)?previous.waveGeneration>=locked:previous.at>at))return {};
      return {value:result};
    });
  }
  return {ok:!reasonCode&&outcomes.every(row=>row.state==='checked'),visited:outcomes.length,outcomes,durationMs:Date.now()-started,...(reasonCode?{reasonCode}:{})};
}
export async function dispatchWorkspaceBillingWave(){
  if((process.env.SERVICE_WORKER_KEY||'').length<32)return {ok:false,dispatched:false,visited:0,reasonCode:'billing_worker_unconfigured'};
  try{
    const response=await fetch(accessSite()+'/api/workspace-billing-background',{method:'POST',headers:{'Content-Type':'application/json','x-service-worker-key':process.env.SERVICE_WORKER_KEY},body:'{}',signal:AbortSignal.timeout(3000),redirect:'error'});
    if(response.status!==202)return {ok:false,dispatched:false,visited:0,reasonCode:'billing_dispatch_unconfirmed'};
    return {ok:true,dispatched:true,visited:0};
  }catch{return {ok:false,dispatched:false,visited:0,reasonCode:'billing_dispatch_unconfirmed'};}
}
export async function handleWorkspaceBillingEvent(event,payload,{verifiedDestination=null}={}){
  if(!['checkout.session.completed','checkout.session.expired','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_failed'].includes(event.type))return false;
  const object=event.data?.object;let slug=object?.metadata?.mc_slug;
  if(!object?.metadata?.mc_billing){
    if(!event.type?.startsWith('invoice.')||!object)return false;
    const subscription=object.parent?.subscription_details?.subscription||object.subscription;if(!id(subscription,'sub_'))return false;
    const index=await strictRead('workspace_billing_subscriptions',String(event.livemode)+'/'+subscription);if(!index||index.customerId!==object.customer)return true;
    const current=await strictRead('clients',index.slug),saved=current&&await strictRead(STORE,key(current));if(!isSupportedSelfServiceClient(current)||workspaceTenant(current)!==index.tenant||saved?.subscription?.id!==subscription)return true;
    slug=index.slug;
  }
  if(!/^[a-z0-9][a-z0-9-]{0,39}$/.test(slug||'')||!id(event.id,'evt_')||!Number.isSafeInteger(event.created)||event.created>Date.now()/1000+300||typeof event.livemode!=='boolean'||event.account)fail('invalid_billing_event','Invalid billing event.',400);
  const c=await strictRead('clients',slug);if(!isSupportedSelfServiceClient(c)||object.metadata?.mc_tenant&&object.metadata.mc_tenant!==workspaceTenant(c))return true;
  const row=await strictRead(STORE,key(c));if(!row||object.metadata?.mc_attempt&&object.metadata.mc_attempt!==row.checkout?.id)return true;
  if(row.livemode!==event.livemode||mode(credentialForSlot(rowCredentialSlot(row)).secret)!==row.livemode)fail('invalid_billing_event','The event must use the original payment account and mode.',400);
  if(row.testProof&&verifiedDestination==='workspace'&&event.api_version!=='2025-06-30.basil')fail('invalid_billing_event','The internal payment proof requires its pinned snapshot API version.',400);
  const eventKey=key(c)+'/'+event.id,digest=hash(payload),processed=await atomicUpdate(EVENTS,eventKey,prior=>{if(prior&&prior.digest!==digest)fail('billing_event_changed','The event identity was reused with different data.',400);if(prior?.state==='complete')return {result:true};return {value:{id:event.id,digest,tenant:row.tenant,created:event.created,state:'pending',receivedAt:prior?.receivedAt||stamp()},result:false};});if(processed){if(verifiedDestination==='workspace')await recordDedicatedProofReceipt(c,row,event,payload);return true;}
  // Event snapshots are hints, never authoritative state. Read the original
  // session/subscription while holding a per-workspace reconciliation lease.
  await reconcile(c,{sessionId:event.type.startsWith('checkout.session.')?object.id:null});
  await atomicUpdate(EVENTS,eventKey,prior=>({value:{...prior,state:'complete',type:event.type,completedAt:stamp(),...(verifiedDestination==='workspace'?{verifiedDestination:'workspace',verifiedAt:stamp()}: {})}}));if(verifiedDestination==='workspace')await recordDedicatedProofReceipt(c,row,event,payload);return true;
}

async function recordDedicatedProofReceipt(c,row,event,payload){
  if(!row.testProof)return;
  const object=event.data?.object;
  await atomicUpdate(STORE,key(c),current=>{
    if(current?.tenant!==workspaceTenant(c)||current.testProof?.phaseId!==row.testProof.phaseId)fail('workspace_changed','The internal test event belongs to its original workspace.',503);
    // A signed hint about another resource cannot certify delivery of this
    // payment simply by carrying copied metadata. Bind the receipt to the exact
    // canonical financial object that reconciliation retained.
    const isCheckout=event.type.startsWith('checkout.session.'),isSubscription=event.type.startsWith('customer.subscription.'),isInvoice=event.type.startsWith('invoice.');
    const expected=isCheckout?current.checkout?.sessionId:isSubscription?current.subscription?.id:isInvoice?current.testProof.invoiceId:null;
    if(!expected||object?.id!==expected||object.customer&&object.customer!==current.customerId||isCheckout&&object.subscription&&object.subscription!==current.subscription?.id||isInvoice&&(object.parent?.subscription_details?.subscription||object.subscription)!==current.subscription?.id)return {};
    const receipt={id:event.id,type:event.type,objectId:expected,checkoutId:current.checkout?.sessionId||null,subscriptionId:current.subscription?.id||null,customerId:current.customerId||null,invoiceId:current.testProof.invoiceId||null,bodyDigest:hash(payload),eventCreated:event.created,receivedAt:stamp(),verifiedDestination:'workspace'};
    if(current.testProof.receipts.some(saved=>saved.id===receipt.id))return {};
    if(current.testProof.receipts.length>=30)fail('billing_test_receipt_capacity','The internal event receipt allowance is full.',503);
    return {value:{...current,testProof:{...current.testProof,receipts:[...current.testProof.receipts,receipt]}}};
  });
  await atomicUpdate(EVENTS,key(c)+'/'+event.id,prior=>prior?.state==='complete'?{value:{...prior,type:event.type,verifiedDestination:'workspace',verifiedAt:prior.verifiedAt||stamp()}}:{});
}
