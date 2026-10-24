// Fixed-price self-service billing. Commercial approval is configuration, never
// inferred from a saved plan preference or legacy usage counters.
import { createHash, randomBytes } from 'node:crypto';
import { atomicUpdate, list } from './store.mjs';
import { strictRead, normalizeAccountEmail } from './accounts.mjs';
import { isSupportedSelfServiceClient, configurationRevision, setupReadiness } from './setup.mjs';
import { workspaceTenant } from './workspace-identity.mjs';
import { serviceConnections } from './service-connections.mjs';
import { managedSMSBudgetPolicy } from './managed-sms-budget.mjs';
import { accessSite } from './access.mjs';
import { billingTestAdmissionPolicy, billingTestAdmits, billingTestMaintenanceAdmits } from './billing-test-admission.mjs';
import { workspaceBillingWebhookSecret } from './billing.mjs';

const STORE='workspace_billing', REVIEWS='workspace_billing_reviews', EVENTS='workspace_billing_events';
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
function mode(){const secret=process.env.STRIPE_SECRET_KEY||'';if(/^(sk|rk)_test_/.test(secret))return false;if(/^(sk|rk)_live_/.test(secret))return true;fail('billing_unavailable','Billing is being prepared. Your workspace is saved.',503);}
function paymentURL(value,host='checkout.stripe.com'){let url;try{url=new URL(value);}catch{return null;}return url.protocol==='https:'&&url.hostname===host&&!url.username&&!url.password&&!url.port?url.href:null;}
async function stripe(path,{method='GET',params=null,idempotencyKey=null}={}){
  const headers={Authorization:'Bearer '+(process.env.STRIPE_SECRET_KEY||''),'Stripe-Version':'2025-06-30.basil'};
  if(params)headers['Content-Type']='application/x-www-form-urlencoded';if(idempotencyKey)headers['Idempotency-Key']=idempotencyKey;
  const response=await fetch('https://api.stripe.com/v1/'+path,{method,headers,...(params?{body:new URLSearchParams(params).toString()}:{}),signal:AbortSignal.timeout(5000),redirect:'error'});
  let data;try{data=await response.json();}catch{fail('billing_response_uncertain','The payment provider response could not be confirmed. Check billing status before trying again.',503);}
  if(!response.ok)fail('billing_provider_unavailable','The payment provider could not finish this request. Your saved request is kept.',503);return data;
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
function purchasesEnabled(c,offer){try{return billingEnabled()&&(mode()||billingTestAdmits(c,offer));}catch{return false;}}
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
  const testProof=live===false?billingTestAdmissionPolicy(offer):null;
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
function view(row,offer=null,c=null){const attempt=row?.checkout;return {status:row?.subscription?.status||'none',plan:row?.subscription?.plan||null,services:row?.subscription?.services||[],name:names[row?.subscription?.plan]||null,currentPeriodEnd:row?.subscription?.currentPeriodEnd||null,cancelAtPeriodEnd:row?.subscription?.cancelAtPeriodEnd===true,cancellationState:row?.cancellation?.state||null,checkout:attempt?{requestId:attempt.requestId,state:attempt.state,expiresAt:attempt.expiresAt||null,url:attempt.state==='open'&&Date.parse(attempt.expiresAt)>Date.now()&&purchasesEnabled(c,offer)&&offer?.digest===attempt.offer.digest&&!row.stopRequestedAt?attempt.url:null}:null,portalAvailable:!!row?.customerId&&!!row?.subscription?.id&&portalEnabled(row,c),offerAvailable:!!offer&&purchasesEnabled(c,offer),availablePlans:offer&&planMetadataVisible(c,offer)?Object.keys(offer.plans).map(plan=>({id:plan,name:names[plan],amountCents:prices[plan],currency:'usd'})):[],livemode:row?.livemode??null};}
export async function workspaceBillingStatus(c){return view(await strictRead(STORE,key(c)),approvedOffer(),c);}
// Portal access is a narrow capability for this workspace's existing financial
// customer. Never use the shared account's default or a caller-selected config.
function portalEnabled(row,c){try{return process.env.WORKSPACE_BILLING_PORTAL_ENABLED==='true'&&id(process.env.WORKSPACE_BILLING_PORTAL_CONFIGURATION_ID,'bpc_')&&mode()===row.livemode&&(!row.livemode||process.env.WORKSPACE_BILLING_LIVE_ENABLED==='true')&&(row.livemode||billingTestMaintenanceAdmits(c,row.checkout?.offer));}catch{return false;}}
function verifyPortalConfiguration(config,configurationId,row){
  const features=config.features||{},allowed=['payment_method_update','invoice_history'];
  if(config.id!==configurationId||config.object!=='billing_portal.configuration'||config.active!==true||config.is_default!==false||config.livemode!==row.livemode||config.application!=null||config.login_page?.enabled!==false||config.metadata?.mc_product!=='machines_and_cloud'||config.metadata?.mc_purpose!=='payment_details_and_invoices'||config.metadata?.mc_portal_version!=='v1'||allowed.some(name=>features[name]?.enabled!==true)||['customer_update','subscription_update','subscription_cancel'].some(name=>features[name]?.enabled!==false)||Object.entries(features).some(([name,feature])=>!allowed.includes(name)&&feature?.enabled!==false))fail('billing_portal_configuration_changed','Payment details are waiting for their secure billing settings to be confirmed.',503);
}
const portalBinding=row=>hash([row.tenant,row.stripeAccountId,row.livemode,row.customerId,row.subscription?.id,row.checkout?.id,row.checkout?.sessionId]);
export async function openWorkspaceBillingPortal(c,actor,body){
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
  try{if(!portalEnabled(row,await ownerCurrent(c,actor)))fail('billing_portal_unavailable','This test payment-details admission expired. Your saved subscription remains available.');providerStarted=true;result=await stripe('billing_portal/sessions',{method:'POST',params:{configuration:configurationId,customer:row.customerId,return_url:returnURL},idempotencyKey:'workspace-portal-'+intent.id});}
  catch(error){await atomicUpdate(STORE,key(c),current=>current?.portal?.id===intent.id?{value:{...current,portal:{...current.portal,state:providerStarted?'uncertain':'abandoned',reasonCode:error.code||'provider_result_unconfirmed',updatedAt:stamp()}}}:{});throw error;}
  const url=paymentURL(result.url,'billing.stripe.com');if(!id(result.id,'bps_')||result.object!=='billing_portal.session'||result.configuration!==configurationId||result.customer!==row.customerId||result.livemode!==row.livemode||result.return_url!==returnURL||result.on_behalf_of||!url)fail('billing_binding_mismatch','The secure payment link could not be confirmed for this workspace.',503);
  await ownerCurrent(c,actor);const after=await strictRead(STORE,key(c));if(portalBinding(after)!==binding||!portalEnabled(after,c)||process.env.WORKSPACE_BILLING_PORTAL_CONFIGURATION_ID!==configurationId)fail('workspace_changed','Your billing view changed. Open payment details again.');
  await atomicUpdate(STORE,key(c),current=>current?.portal?.id===intent.id?{value:{...current,portal:{...current.portal,state:'complete',sessionId:result.id,updatedAt:stamp()}}}:{});
  // The short-lived hosted capability is returned only to this current owner;
  // its secret URL is never stored in our durable financial journal.
  return {url,expiresAt:new Date(Date.parse(intent.createdAt)+5*60000).toISOString()};
}
export async function reviewWorkspaceBilling(c,actor,body){
  if(!exact(body,['action','plan','expectedRevision'])||!Object.hasOwn(prices,body.plan))fail('invalid_billing_request','Choose Coverage or Follow-through to review its terms.',400);
  const current=await ownerCurrent(c,actor,body.expectedRevision),offer=approvedOffer();if(offer&&billingEnabled())operating(current);if(!offer||!purchasesEnabled(current,offer))fail('billing_unavailable','Your workspace is free to prepare. We will show your complete paid offer here when it is ready.',503);
  const services=await ready(current,offer.plans[body.plan]);await assertAccount(offer.stripeAccountId);await verifyPrice(offer,body.plan);
  const latest=await ownerCurrent(c,actor,body.expectedRevision);if(businessStamp(latest)!==businessStamp(current)||approvedOffer()?.digest!==offer.digest||!purchasesEnabled(latest,offer))fail('configuration_changed','Your setup or offer changed. Review it again.');
  const reviewId=token(),review={id:reviewId,tenant:workspaceTenant(c),slug:c.slug,actor:actorEmail(actor),businessStamp:businessStamp(current),configurationRevision:configurationRevision(current),offer,plan:body.plan,services,createdAt:stamp(),expiresAt:new Date(Date.now()+15*60000).toISOString()};
  await atomicUpdate(REVIEWS,key(c)+'/'+reviewId,row=>row?{}:{value:review});return {reviewId,expiresAt:review.expiresAt,offer:quoteView(offer,body.plan,services)};
}
function parameters(c,review,attemptId,expiresAt,customer){const base=accessSite()+'/desk.html?c='+encodeURIComponent(c.slug),metadata={mc_billing:'v1',mc_slug:c.slug,mc_tenant:workspaceTenant(c),mc_attempt:attemptId,mc_offer:review.offer.digest,mc_plan:review.plan,mc_services:review.services.join(',')};return {mode:'subscription','line_items[0][price]':review.offer.plans[review.plan].priceId,'line_items[0][quantity]':'1','payment_method_types[0]':'card',allow_promotion_codes:'false','automatic_tax[enabled]':'false',success_url:base+'&billing=returned#account',cancel_url:base+'&billing=cancelled#account',client_reference_id:attemptId,expires_at:String(expiresAt),...(customer?{customer}:{customer_email:c.owner.email}),...Object.fromEntries(Object.entries(metadata).flatMap(([k,v])=>[['metadata['+k+']',v],['subscription_data[metadata]['+k+']',v]]))};}
function verifySession(session,row,attempt){if(!id(session.id,'cs_')||session.mode!=='subscription'||session.livemode!==row.livemode||session.client_reference_id!==attempt.id||session.metadata?.mc_tenant!==row.tenant||session.metadata?.mc_slug!==row.slug||session.metadata?.mc_attempt!==attempt.id||session.metadata?.mc_offer!==attempt.offer.digest||session.metadata?.mc_plan!==attempt.plan||attempt.services&&session.metadata?.mc_services!==attempt.services.join(',')||session.currency!=='usd'||session.amount_total!==prices[attempt.plan]||session.total_details?.amount_discount||session.total_details?.amount_shipping||session.total_details?.amount_tax)fail('billing_binding_mismatch','The payment record could not be matched to this workspace.',503);const items=session.line_items?.data;if(!Array.isArray(items)||items.length!==1||session.line_items.has_more||items[0].quantity!==1||items[0].price?.id!==attempt.offer.plans[attempt.plan].priceId)fail('billing_binding_mismatch','The payment record has an unexpected price or quantity.',503);return session;}
async function saveSession(c,attemptId,session){return atomicUpdate(STORE,key(c),row=>{if(!row||row.tenant!==workspaceTenant(c)||row.checkout?.id!==attemptId)fail('workspace_changed','Your workspace billing changed. Refresh its status.');verifySession(session,row,row.checkout);if(row.checkout.sessionId&&row.checkout.sessionId!==session.id)fail('billing_binding_mismatch','Two different checkouts were returned for the same request.',503);if(row.checkout.state==='complete'&&session.status==='open')return {};const url=paymentURL(session.url),state=session.status==='expired'?'expired':session.status==='complete'?'complete':session.status==='open'&&url?'open':'uncertain';if(!Number.isSafeInteger(session.expires_at))fail('billing_binding_mismatch','The checkout expiry could not be confirmed.',503);return {value:{...row,checkout:{...row.checkout,sessionId:session.id,state,url:state==='open'?url:null,expiresAt:new Date(session.expires_at*1000).toISOString(),claim:null,updatedAt:stamp()},updatedAt:stamp()},result:row};});}
async function executeCheckout(c,actor,attempt){
  const claimed=await atomicUpdate(STORE,key(c),row=>{if(row?.checkout?.id!==attempt.id)fail('checkout_changed','Check your current billing request.');if(row.checkout.sessionId)return {result:null};if(row.checkout.claim&&Date.parse(row.checkout.claim.until)>Date.now())return {result:null};if(Date.parse(row.checkout.startedAt)<Date.now()-23*3600000)return {result:null};const claim=token();return {value:{...row,checkout:{...row.checkout,state:'pending',claim:{token:claim,until:new Date(Date.now()+30000).toISOString()}}},result:claim};});
  if(!claimed)return workspaceBillingStatus(c);
  let providerStarted=false;
  try{const current=await ownerCurrent(c,actor);if(businessStamp(current)!==attempt.businessStamp||approvedOffer()?.digest!==attempt.offer.digest||!purchasesEnabled(current,attempt.offer))fail('configuration_changed','Your setup or paid offer changed. Check billing status before continuing.');await ready(current,attempt.offer.plans[attempt.plan]);await assertAccount(attempt.offer.stripeAccountId);await verifyPrice(attempt.offer,attempt.plan);const latest=await ownerCurrent(c,actor);if(businessStamp(latest)!==attempt.businessStamp||approvedOffer()?.digest!==attempt.offer.digest||!purchasesEnabled(latest,attempt.offer))fail('configuration_changed','Your setup changed before checkout. Check its saved status.');await atomicUpdate(STORE,key(c),row=>row?.checkout?.claim?.token===claimed?{value:{...row,checkout:{...row.checkout,dispatchStartedAt:row.checkout.dispatchStartedAt||stamp()}}}:{});if(!purchasesEnabled(await ownerCurrent(c,actor),attempt.offer))fail('billing_review_expired','This test checkout admission expired. Check the saved billing status.');providerStarted=true;const session=await stripe('checkout/sessions?expand[]=line_items',{method:'POST',params:attempt.params,idempotencyKey:'workspace-checkout-'+attempt.id});await saveSession(c,attempt.id,session);const after=await strictRead('clients',c.slug);if(after?.status==='cancelled'||(await strictRead(STORE,key(c)))?.stopRequestedAt)await reconcile(c);}
  catch(error){await atomicUpdate(STORE,key(c),row=>row?.checkout?.id===attempt.id&&row.checkout.claim?.token===claimed?{value:{...row,checkout:{...row.checkout,state:providerStarted?'uncertain':'abandoned',claim:null,reasonCode:error.code||'provider_result_unconfirmed',updatedAt:stamp()}}}:{});}
  return workspaceBillingStatus(c);
}
export async function startWorkspaceCheckout(c,actor,body){
  if(!exact(body,['action','reviewId','requestId','acceptedTerms','expectedRevision'])||!hex(body.reviewId)||!hex(body.requestId)||body.acceptedTerms!==true)fail('billing_acceptance_required','Review the monthly price and service terms, then check the agreement to continue.',400);
  const current=await ownerCurrent(c,actor,body.expectedRevision),review=await strictRead(REVIEWS,key(c)+'/'+body.reviewId);
  if(!review||review.tenant!==workspaceTenant(c)||review.actor!==actorEmail(actor)||Date.parse(review.expiresAt)<=Date.now()||review.businessStamp!==businessStamp(current)||review.offer.digest!==approvedOffer()?.digest||!purchasesEnabled(current,review.offer))fail('billing_review_expired','Review your current offer again before checkout.');
  await ready(current,review.offer.plans[review.plan]);
  const attemptId=token(),expiresAt=Math.floor(Date.now()/1000)+3600;
  const attempt=await atomicUpdate(STORE,key(c),row=>{if(row&&row.tenant!==workspaceTenant(c))fail('billing_binding_mismatch','The saved billing record belongs to another workspace.');if(activeSubscription(row?.subscription?.status))fail('subscription_exists','This workspace already has a subscription. Manage it below.');if(row?.checkout&&!['expired','abandoned'].includes(row.checkout.state)&&!['canceled','incomplete_expired'].includes(row.subscription?.status)){if(row.checkout.requestId!==body.requestId||row.checkout.plan!==review.plan||row.checkout.offer.digest!==review.offer.digest)fail('checkout_exists','A checkout is already saved. Continue it or check its status first.');return {result:row.checkout};}if((row?.generation||0)>=100)fail('billing_review_required','Billing needs a review before another checkout can be created.');const next={id:attemptId,requestId:body.requestId,plan:review.plan,services:review.services,offer:review.offer,businessStamp:review.businessStamp,actor:review.actor,acceptedTerms:{version:review.offer.terms.version,digest:hash(review.offer.terms),at:stamp()},params:parameters(current,review,attemptId,expiresAt,row?.customerId),state:'pending',startedAt:stamp(),createdAt:stamp()};return {value:{...row,version:1,slug:c.slug,tenant:workspaceTenant(c),livemode:mode(),stripeAccountId:review.offer.stripeAccountId,generation:(row?.generation||0)+1,history:row?.checkout?[...(row.history||[]),{checkout:row.checkout,subscription:row.subscription||null,cancellation:row.cancellation||null}]:row?.history||[],checkout:next,cancellation:null,stopRequestedAt:null,updatedAt:stamp()},result:next};});
  return executeCheckout(current,actor,attempt);
}
async function subscriptionProjection(c,row,session){
  if(session.status!=='complete'||!id(session.customer,'cus_')||!id(session.subscription,'sub_'))return;
  const sub=await stripe('subscriptions/'+session.subscription+'?expand[]=items.data.price');
  const attempt=row.checkout,item=sub.items?.data?.[0];if(sub.id!==session.subscription||sub.customer!==session.customer||sub.livemode!==row.livemode||sub.metadata?.mc_tenant!==row.tenant||sub.metadata?.mc_attempt!==attempt.id||sub.metadata?.mc_offer!==attempt.offer.digest||sub.metadata?.mc_slug!==row.slug||sub.metadata?.mc_plan!==attempt.plan||attempt.services&&sub.metadata?.mc_services!==attempt.services.join(',')||sub.items?.data?.length!==1||sub.items?.has_more||item?.price?.id!==attempt.offer.plans[attempt.plan].priceId||item.quantity!==1||item.price.currency!=='usd'||item.price.unit_amount!==prices[attempt.plan]||sub.currency!=='usd')fail('billing_binding_mismatch','The subscription could not be matched to your accepted offer.',503);
  if(row.customerId&&row.customerId!==sub.customer||row.subscription?.id&&row.subscription.id!==sub.id&&activeSubscription(row.subscription.status))fail('billing_binding_mismatch','The subscription identity changed unexpectedly.',503);
  await atomicUpdate('workspace_billing_subscriptions',String(row.livemode)+'/'+sub.id,previous=>{if(previous&&(previous.tenant!==row.tenant||previous.slug!==row.slug))fail('billing_binding_mismatch','This subscription is already bound to another workspace.',503);return {value:{slug:row.slug,tenant:row.tenant,customerId:sub.customer,stripeAccountId:row.stripeAccountId}};});
  await atomicUpdate('workspace_billing_customers',String(row.livemode)+'/'+sub.customer,previous=>{if(previous&&(previous.tenant!==row.tenant||previous.slug!==row.slug||previous.stripeAccountId!==row.stripeAccountId))fail('billing_binding_mismatch','This payment account belongs to another workspace.',503);return {value:{tenant:row.tenant,slug:row.slug,stripeAccountId:row.stripeAccountId}};});
  const periodEnd=item.current_period_end||sub.current_period_end;
  await atomicUpdate(STORE,key(c),current=>{if(!current||current.checkout?.id!==attempt.id||current.tenant!==workspaceTenant(c))fail('workspace_changed','The workspace changed during payment reconciliation.');return {value:{...current,customerId:sub.customer,subscription:{id:sub.id,status:session.payment_status==='paid'||['incomplete','incomplete_expired','canceled','past_due','unpaid'].includes(sub.status)?sub.status:'payment_pending',plan:attempt.plan,services:attempt.services||attempt.offer.plans[attempt.plan].services,cancelAtPeriodEnd:sub.cancel_at_period_end===true,currentPeriodEnd:Number.isSafeInteger(periodEnd)?new Date(periodEnd*1000).toISOString():null,observedAt:stamp()},checkout:{...current.checkout,state:'complete',url:null},updatedAt:stamp()}};});
}
async function reconcile(c,{sessionId=null}={}){
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
async function recoverCancellation(c){
  let row=await strictRead(STORE,key(c));if(!row?.cancellation||row.cancellation.state==='complete')return;
  if(mode()!==row.livemode)fail('billing_mode_changed','Renewal cancellation is saved and waiting for the original payment account.',503);await assertAccount(row.stripeAccountId);
  if(row.cancellation.subscriptionId!==row.subscription?.id)return;
  const sub=await stripe('subscriptions/'+row.cancellation.subscriptionId);if(sub.customer!==row.customerId||sub.metadata?.mc_tenant!==row.tenant||sub.metadata?.mc_attempt!==row.checkout.id)fail('billing_binding_mismatch','The renewal request could not be matched to your subscription.',503);
  const latest=await strictRead(STORE,key(c));if(latest?.subscription?.id!==row.subscription.id||latest?.cancellation?.id!==row.cancellation.id)return;
  if(sub.cancel_at_period_end!==true&&sub.status!=='canceled'){
    if(Date.parse(row.cancellation.attemptedAt||row.cancellation.requestedAt)<Date.now()-23*3600000){const previousId=row.cancellation.id;await atomicUpdate(STORE,key(c),current=>current?.cancellation?.id!==previousId?{}:{value:{...current,cancellation:{...current.cancellation,id:token(),generation:(current.cancellation.generation||0)+1,attemptedAt:stamp(),state:'pending'}}});row=await strictRead(STORE,key(c));}
    await atomicUpdate(STORE,key(c),current=>({value:{...current,cancellation:{...current.cancellation,attemptedAt:current.cancellation.attemptedAt||stamp()}}}));
    try{await stripe('subscriptions/'+sub.id,{method:'POST',params:{cancel_at_period_end:'true'},idempotencyKey:'workspace-renewal-'+row.cancellation.id});}catch{await atomicUpdate(STORE,key(c),current=>({value:{...current,cancellation:{...current.cancellation,state:'uncertain'}}}));return;}
  }
  await reconcile(c);row=await strictRead(STORE,key(c));if(row.subscription?.cancelAtPeriodEnd||row.subscription?.status==='canceled')await atomicUpdate(STORE,key(c),current=>({value:{...current,cancellation:{...current.cancellation,state:'complete',confirmedAt:stamp()}}}));
}
// Stop-service acceptance includes ending the monthly renewal. This durable
// write is also repaired by the ordinary scheduler after a lost stop response.
export async function queueWorkspaceStopBilling(c,{reconcileCheckout=true}={}){
  await atomicUpdate(STORE,key(c),row=>{if(!row||row.tenant!==workspaceTenant(c))return {};const cancellation=activeSubscription(row.subscription?.status)&&row.cancellation?.subscriptionId!==row.subscription.id?{id:token(),requestId:token(),subscriptionId:row.subscription.id,state:'pending',actor:normalizeAccountEmail(c.owner.email),requestedAt:stamp(),source:'workspace_stopped'}:row.cancellation||null;return {value:{...row,stopRequestedAt:row.stopRequestedAt||stamp(),cancellation}};});
  const saved=await strictRead(STORE,key(c));if(reconcileCheckout&&saved?.checkout?.sessionId&&saved.checkout.state==='open')try{await reconcile(c);}catch{/* Ordinary recovery retains the same session to expire. */}
}
export async function recoverWorkspaceBilling({limit=3}={}){
  const keys=await list(STORE,''),cursor=await strictRead('workspace_billing_cursor','active'),page=[...keys.filter(value=>value>(cursor?.key||'')),...keys.filter(value=>value<=(cursor?.key||''))].slice(0,Math.min(3,limit));const outcomes=[];
  for(const recordKey of page){let row=await strictRead(STORE,recordKey);const c=row&&await strictRead('clients',row.slug);if(!isSupportedSelfServiceClient(c)||workspaceTenant(c)!==row.tenant){outcomes.push({state:'workspace_changed'});continue;}try{if(c.status==='cancelled'){await queueWorkspaceStopBilling(c);row=await strictRead(STORE,recordKey);}if(row.cancellation&&row.cancellation.state!=='complete')await recoverCancellation(c);else if(row.checkout&&(['pending','uncertain','complete'].includes(row.checkout.state)||row.stopRequestedAt&&row.checkout.state==='open'))await reconcile(c);outcomes.push({state:'checked'});}catch{outcomes.push({state:'unconfirmed'});}}
  if(page.length)await atomicUpdate('workspace_billing_cursor','active',()=>({value:{key:page.at(-1)}}));return {ok:outcomes.every(row=>row.state==='checked'),visited:page.length,outcomes};
}
export async function handleWorkspaceBillingEvent(event,payload){
  if(!['checkout.session.completed','checkout.session.expired','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_failed'].includes(event.type))return false;
  const object=event.data?.object;let slug=object?.metadata?.mc_slug;
  if(!object?.metadata?.mc_billing){
    if(!event.type?.startsWith('invoice.')||!object)return false;
    const subscription=object.parent?.subscription_details?.subscription||object.subscription;if(!id(subscription,'sub_'))return false;
    const index=await strictRead('workspace_billing_subscriptions',String(event.livemode)+'/'+subscription);if(!index||index.customerId!==object.customer)return true;
    const current=await strictRead('clients',index.slug),saved=current&&await strictRead(STORE,key(current));if(!isSupportedSelfServiceClient(current)||workspaceTenant(current)!==index.tenant||saved?.subscription?.id!==subscription)return true;
    slug=index.slug;
  }
  if(!/^[a-z0-9][a-z0-9-]{0,39}$/.test(slug||'')||!id(event.id,'evt_')||!Number.isSafeInteger(event.created)||event.created>Date.now()/1000+300||event.livemode!==mode()||event.account)fail('invalid_billing_event','Invalid billing event.',400);
  const c=await strictRead('clients',slug);if(!isSupportedSelfServiceClient(c)||object.metadata?.mc_tenant&&object.metadata.mc_tenant!==workspaceTenant(c))return true;
  const row=await strictRead(STORE,key(c));if(!row||row.livemode!==event.livemode||object.metadata?.mc_attempt&&object.metadata.mc_attempt!==row.checkout?.id)return true;
  const eventKey=key(c)+'/'+event.id,digest=hash(payload),processed=await atomicUpdate(EVENTS,eventKey,prior=>{if(prior&&prior.digest!==digest)fail('billing_event_changed','The event identity was reused with different data.',400);if(prior?.state==='complete')return {result:true};return {value:{id:event.id,digest,tenant:row.tenant,created:event.created,state:'pending',receivedAt:prior?.receivedAt||stamp()},result:false};});if(processed)return true;
  // Event snapshots are hints, never authoritative state. Read the original
  // session/subscription while holding a per-workspace reconciliation lease.
  await reconcile(c,{sessionId:event.type.startsWith('checkout.session.')?object.id:null});
  await atomicUpdate(EVENTS,eventKey,prior=>({value:{...prior,state:'complete',completedAt:stamp()}}));return true;
}
