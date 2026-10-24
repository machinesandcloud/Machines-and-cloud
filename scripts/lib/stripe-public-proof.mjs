// Inert public-TEST proof support. This module never reads credentials, imports
// application handlers, creates a memory tenant, signs an event, or opens a
// browser. The existing lifecycle runner owns explicit execution and custody.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const PUBLIC_STRIPE_ACCOUNT='acct_1NK0c6JW47xiUUpY';
export const PUBLIC_ORIGIN='https://machinesandcloud.com';
export const PUBLIC_WORKSPACE_WEBSITE=Object.freeze({origin:'https://zaricoach.com',path:'/mc-front-desk-acceptance-20261023'});
export const PUBLIC_WEBHOOK_EVENTS=Object.freeze([
  'checkout.session.completed','checkout.session.expired',
  'checkout.session.async_payment_succeeded','checkout.session.async_payment_failed',
  'customer.subscription.created','customer.subscription.updated',
  'customer.subscription.deleted','invoice.paid','invoice.payment_failed'
]);
const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join(',')===[...keys].sort().join(',');
const id=(v,p)=>typeof v==='string'&&new RegExp('^'+p+'[A-Za-z0-9_]{3,160}$').test(v);
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const sha=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(canonical(v))).digest('hex');
export function verifyPublicWorkspace(p,dto,{now=Date.now()}={}){
  const require=(condition,code)=>{if(!condition){const error=new Error('The actual website workspace preflight failed: '+code);error.code=code;throw error;}};
  const c=dto?.client,install=dto?.websiteInstallation,revision=dto?.configurationRevision;
  const validTime=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&Date.parse(value)<=now+60000;
  require(dto?.site===PUBLIC_ORIGIN,'workspace_origin_mismatch');
  require(c?.slug===p.owner.slug&&typeof c.owner?.email==='string'&&c.owner.email.trim().toLowerCase()===p.owner.email.trim().toLowerCase(),'workspace_owner_mismatch');
  require(c.onboarding?.version===1&&Array.isArray(c.onboarding.desiredChannels)&&c.onboarding.desiredChannels.length===1&&c.onboarding.desiredChannels[0]==='web','workspace_service_scope');
  require(c.status==='live'&&c.build?.status==='built'&&c.channels?.web?.active===true&&dto.webAvailable===true&&dto.aiAllowance?.available===true&&Number.isSafeInteger(dto.aiAllowance?.web?.remaining)&&dto.aiAllowance.web.remaining>0,'workspace_not_active');
  require(digest(revision)&&digest(dto.editRevision)&&dto.setup?.revision===revision&&dto.setup.canActivateWeb===true&&dto.setup.channels?.web?.ready===true&&dto.setup.channels.web.active===true&&Array.isArray(dto.setup.channels.web.blockers)&&dto.setup.channels.web.blockers.length===0,'workspace_rules_not_ready');
  require(c.setupProof?.reviewedRevision===revision&&c.setupProof.testedRevision===revision&&c.setupProof.testMode==='live'&&validTime(c.createdAt)&&validTime(c.setupProof.reviewedAt)&&validTime(c.setupProof.testedAt)&&Date.parse(c.setupProof.reviewedAt)>=Date.parse(c.createdAt)&&Date.parse(c.setupProof.testedAt)>=Date.parse(c.createdAt),'workspace_review_or_practice_stale');
  require(install?.tenantIdentity===p.owner.tenantIdentity&&install.configurationRevision===revision&&install.editRevision===dto.editRevision,'workspace_installation_identity');
  let website;try{website=new URL(c.business?.website);}catch{}
  require(website&&website.origin===PUBLIC_WORKSPACE_WEBSITE.origin&&website.pathname===PUBLIC_WORKSPACE_WEBSITE.path&&!website.username&&!website.password&&!website.port&&!website.hash&&website.searchParams.get('client')===p.owner.slug&&website.searchParams.get('phase')===p.phaseId&&[...website.searchParams.keys()].sort().join(',')==='client,phase'&&install.website===c.business.website,'workspace_website_not_bound');
  require(Array.isArray(c.widget?.allowedOrigins)&&c.widget.allowedOrigins.length===1&&c.widget.allowedOrigins[0]===PUBLIC_WORKSPACE_WEBSITE.origin,'workspace_origin_scope');
  require(install.selectedOrigin===website.origin&&install.originAllowed===true&&install.observation?.state==='found'&&install.observation.origin===website.origin&&validTime(install.observation.at)&&install.customerChat?.state==='active'&&install.customerChat.available===true,'workspace_installation_not_current');
  require(install.setupRequest?.state==='complete'&&install.attempt?.state==='complete'&&/^[a-f0-9]{32}$/.test(install.attempt.id||'')&&validTime(install.setupRequest.at),'workspace_setup_request_missing');
  require(install.firstExternalRequest?.state==='received'&&install.firstExternalRequest.origin===website.origin&&validTime(install.firstExternalRequest.at),'workspace_ordinary_request_missing');
  const record=(reference,setup)=>{
    require(exact(reference,['kind','id','createdAt'])&&['leads','bookings'].includes(reference.kind)&&/^[a-f0-9]{10,64}$/.test(reference.id||'')&&validTime(reference.createdAt)&&Date.parse(reference.createdAt)>=Date.parse(c.createdAt),'workspace_record_reference');
    const rows=dto[reference.kind];require(Array.isArray(rows),'workspace_record_not_retained');const matches=rows.filter(row=>row?.id===reference.id);require(matches.length===1,'workspace_record_not_retained');const row=matches[0];
    require(row.slug===p.owner.slug&&row.channel==='web'&&row.createdAt===reference.createdAt&&row.status!=='spam'&&!row.simulation&&row.delivery?.tenantIdentity===p.owner.tenantIdentity&&(row.tenantIdentity===undefined||row.tenantIdentity===p.owner.tenantIdentity),'workspace_record_identity');
    if(setup)require(row.websiteSetupCheck?.checkId===install.attempt.id&&row.websiteSetupCheck.origin===website.origin&&/^[a-f0-9]{32}$/.test(row.websiteSetupCheck.turnId||'')&&row.contact==='websitecheck_'+install.attempt.id,'workspace_setup_record_mismatch');
    else require(!row.websiteSetupCheck&&typeof row.contact==='string'&&!!row.contact&&!row.contact.startsWith('websitecheck_'),'workspace_ordinary_record_mismatch');
    return {kind:reference.kind,id:reference.id,createdAt:reference.createdAt};
  };
  const setupRequest=record(install.setupRequest.record,true),ordinaryRequest=record(install.firstExternalRequest.record,false);
  require(setupRequest.id!==ordinaryRequest.id,'workspace_setup_is_not_ordinary');
  return {slug:p.owner.slug,tenantIdentity:p.owner.tenantIdentity,configurationRevision:revision,editRevision:dto.editRevision,websiteOrigin:website.origin,websitePath:website.pathname,phaseId:p.phaseId,reviewedAt:c.setupProof.reviewedAt,testedAt:c.setupProof.testedAt,testMode:'live',setupRequest,ordinaryRequest,observedAt:new Date(now).toISOString()};
}
export function validatePublicPacket(p,{sourceId,manifestSHA,now=Date.now()}={}){
  assert.ok(exact(p,['version','phaseId','origin','sourceId','sourceManifestSHA','publishedCommit','publishedDeployId','issuedAt','expiresAt','owner','phase','fixture','webhook','cleanupOperationId','closeOperationId']),'Exact current public proof packet required');
  assert.equal(p.version,1);assert.equal(p.origin,PUBLIC_ORIGIN);assert.equal(p.sourceId,sourceId);assert.equal(p.sourceManifestSHA,manifestSHA);
  assert.match(p.phaseId,/^[a-z0-9_-]{1,100}$/);assert.match(p.publishedCommit,/^[a-f0-9]{40}$/);assert.match(p.publishedDeployId,/^[a-f0-9]{24}$/);
  assert.equal(new Date(p.issuedAt).toISOString(),p.issuedAt);assert.equal(new Date(p.expiresAt).toISOString(),p.expiresAt);
  assert.ok(Date.parse(p.issuedAt)<=now&&Date.parse(p.expiresAt)>now&&Date.parse(p.expiresAt)-Date.parse(p.issuedAt)<=4*3600000,'Public proof packet expired or invalid');
  assert.ok(exact(p.owner,['slug','tenantIdentity','email','bearer']));assert.match(p.owner.slug,/^[a-z0-9][a-z0-9-]{0,39}$/);assert.ok(digest(p.owner.tenantIdentity));
  assert.ok(typeof p.owner.email==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.owner.email));assert.match(p.owner.bearer,/^[a-f0-9]{64}$/);
  assert.ok(exact(p.phase,['version','phaseId','issuedAt','expiresAt','stripeAccountId','offerDigest','tenant','maxAttempts','cleanupReserve','cleanupOnExpiry']));
  assert.equal(p.phase.phaseId,p.phaseId);assert.equal(p.phase.stripeAccountId,PUBLIC_STRIPE_ACCOUNT);assert.equal(p.phase.expiresAt,p.expiresAt);assert.ok(digest(p.phase.offerDigest));
  assert.equal(p.phase.issuedAt,p.issuedAt);assert.match(p.phase.version,/^[a-z0-9_-]{1,80}$/);
  assert.equal(p.phase.maxAttempts,80);assert.equal(p.phase.cleanupReserve,20);assert.equal(p.phase.cleanupOnExpiry,true);
  assert.deepEqual(p.phase.tenant,{slug:p.owner.slug,identity:p.owner.tenantIdentity,ownerEmailHash:sha(p.owner.email.trim().toLowerCase())});
  assert.ok(exact(p.fixture,['priceId','productId','initiallyArchived']));assert.ok(id(p.fixture.priceId,'price_')&&id(p.fixture.productId,'prod_'));assert.equal(p.fixture.initiallyArchived,true);
  assert.ok(exact(p.webhook,['id','phaseMetadata']));assert.ok(id(p.webhook.id,'we_'));assert.equal(p.webhook.phaseMetadata,p.phaseId);
  assert.match(p.cleanupOperationId,/^[a-f0-9]{32}$/);assert.match(p.closeOperationId,/^[a-f0-9]{32}$/);assert.notEqual(p.cleanupOperationId,p.closeOperationId);
  return p;
}
export function verifyPublicSnapshot(p,billing,{allowUnstarted=false}={}){
  assert.ok(billing&&typeof billing==='object');
  const proof=billing.testProof;
  if(!proof){assert.ok(allowUnstarted,'Public phase has no durable admission');assert.equal(billing.status,'none');assert.equal(billing.checkout,null);return null;}
  assert.equal(proof.phaseId,p.phaseId);assert.equal(proof.mode,'TEST');assert.equal(proof.tenantIdentity,p.owner.tenantIdentity);assert.equal(proof.stripeAccountId,PUBLIC_STRIPE_ACCOUNT);
  assert.equal(proof.policyDigest,sha(p.phase));assert.equal(proof.offerDigest,p.phase.offerDigest);assert.equal(proof.expiresAt,p.expiresAt);
  assert.equal(proof.maxAttempts,80);assert.equal(proof.cleanupReserve,20);assert.ok(Number.isSafeInteger(proof.spent)&&proof.spent>=0&&proof.spent<=80);
  for(const [field,prefix] of [['checkoutId','cs_test_'],['subscriptionId','sub_'],['customerId','cus_'],['invoiceId','in_']])assert.ok(proof[field]===null||id(proof[field],prefix),'Invalid public proof object identity');
  assert.ok(Array.isArray(proof.receipts)&&proof.receipts.length<=30);
  for(const receipt of proof.receipts){assert.ok(id(receipt.id,'evt_'));assert.ok(PUBLIC_WEBHOOK_EVENTS.includes(receipt.type));assert.equal(receipt.verifiedDestination,'workspace');assert.ok(digest(receipt.bodyDigest));assert.equal(receipt.checkoutId,proof.checkoutId);assert.ok(receipt.subscriptionId===null||receipt.subscriptionId===proof.subscriptionId);assert.ok(receipt.customerId===null||receipt.customerId===proof.customerId);assert.ok(receipt.invoiceId===null||receipt.invoiceId===proof.invoiceId);assert.equal(receipt.objectId,receipt.type.startsWith('checkout.session.')?receipt.checkoutId:receipt.type.startsWith('customer.subscription.')?receipt.subscriptionId:receipt.invoiceId);}
  return proof;
}
export function verifyPublicWebhook(p,endpoint,{disabled=false}={}){
  assert.equal(endpoint.id,p.webhook.id);assert.equal(endpoint.object,'webhook_endpoint');assert.equal(endpoint.livemode,false);assert.equal(endpoint.application,null);
  assert.equal(endpoint.url,PUBLIC_ORIGIN+'/api/workspace-billing-webhook');assert.equal(endpoint.api_version,'2025-06-30.basil');assert.equal(endpoint.status,disabled?'disabled':'enabled');
  assert.equal(endpoint.metadata?.mc_phase,p.webhook.phaseMetadata);assert.equal(endpoint.metadata?.mc_purpose,'workspace_public_test');
  assert.deepEqual([...endpoint.enabled_events].sort(),[...PUBLIC_WEBHOOK_EVENTS].sort());
}
// Root supplies this only after inspecting the exact Workbench delivery and
// recording its artifact. A hash binds that artifact; it is not delivery proof.
export function verifyPublicDeliveryReview(p,report,value,{now=Date.now()}={}){
  assert.ok(exact(value,['action','phaseId','endpointId','eventId','httpStatus','deliveredAt','evidenceSHA256','confirmed']));
  assert.equal(value.action,'record_delivery_and_delete');assert.equal(value.phaseId,p.phaseId);assert.equal(value.endpointId,p.webhook.id);assert.equal(value.confirmed,true);
  assert.equal(report.signedPublicReceiptAccepted,true);assert.equal(report.completedTestCheckouts,1);assert.ok(id(report.verifiedPublicEventId,'evt_'));assert.ok(id(report.checkoutId,'cs_test_'));assert.equal(value.eventId,report.verifiedPublicEventId);
  assert.ok(report.publicReceipts?.some(r=>r.id===value.eventId&&r.type==='checkout.session.completed'&&r.verifiedDestination==='workspace'&&r.objectId===report.checkoutId&&r.checkoutId===report.checkoutId));
  assert.ok(Number.isInteger(value.httpStatus)&&value.httpStatus>=200&&value.httpStatus<300);assert.ok(digest(value.evidenceSHA256));
  assert.equal(new Date(value.deliveredAt).toISOString(),value.deliveredAt);assert.ok(Date.parse(value.deliveredAt)>=Date.parse(report.at)-60000&&Date.parse(value.deliveredAt)<=now+1000);
  return {...value,reviewedAt:new Date(now).toISOString(),authority:'Root-reviewed read-only exact-endpoint Workbench evidence; artifact hash alone does not verify delivery'};
}
export function verifyPublicSession(p,session,owned){
  assert.equal(session.id,owned.checkout);assert.equal(session.livemode,false);assert.equal(session.mode,'subscription');assert.equal(session.metadata?.mc_billing,'v1');
  assert.equal(session.metadata?.mc_slug,p.owner.slug);assert.equal(session.metadata?.mc_tenant,p.owner.tenantIdentity);assert.equal(session.metadata?.mc_offer,p.phase.offerDigest);assert.equal(session.metadata?.mc_plan,'starter');assert.equal(session.metadata?.mc_services,'web');
  assert.ok(id(session.metadata?.mc_attempt,''));assert.equal(session.client_reference_id,session.metadata.mc_attempt);assert.equal(session.currency,'usd');assert.equal(session.amount_total,9900);
  assert.equal(session.line_items?.has_more,false);assert.equal(session.line_items?.data?.length,1);assert.equal(session.line_items.data[0].quantity,1);assert.equal(session.line_items.data[0].price?.id,p.fixture.priceId);
  assert.equal(session.customer,owned.customer);assert.equal(session.subscription,owned.subscription);assert.equal(session.status,'complete');assert.equal(session.payment_status,'paid');
  return session.metadata.mc_attempt;
}
export function verifyPublicSubscription(p,subscription,owned,attempt){
  assert.equal(subscription.id,owned.subscription);assert.equal(subscription.customer,owned.customer);assert.equal(subscription.livemode,false);assert.equal(subscription.metadata?.mc_billing,'v1');assert.equal(subscription.metadata?.mc_slug,p.owner.slug);assert.equal(subscription.metadata?.mc_tenant,p.owner.tenantIdentity);assert.equal(subscription.metadata?.mc_attempt,attempt);assert.equal(subscription.metadata?.mc_offer,p.phase.offerDigest);
  assert.equal(subscription.latest_invoice,owned.invoice);assert.equal(subscription.items?.has_more,false);assert.equal(subscription.items?.data?.length,1);assert.equal(subscription.items.data[0].price?.id,p.fixture.priceId);assert.equal(subscription.items.data[0].quantity,1);
}

// This exact allowlist sits before every Node/app/browser transport in the
// existing runner. Hosted Stripe attempts and this process share its40 cap;
// deployment Functions have their separate immutable80 cap in the billing row.
export class PublicProofGuard {
  constructor(packet,{budget,report,save}){this.packet=packet;this.budget=budget;this.report=report;this.save=save;this.accountVerified=false;this.cleanup=false;this.owned={checkout:null,subscription:null,customer:null,invoice:null};this.checkoutDispatched=false;this.cancelDispatched=false;}
  adopt(billing){const proof=verifyPublicSnapshot(this.packet,billing,{allowUnstarted:true});if(!proof)return null;for(const [field,dto] of [['checkout','checkoutId'],['subscription','subscriptionId'],['customer','customerId'],['invoice','invoiceId']])if(proof[dto]){assert.ok(!this.owned[field]||this.owned[field]===proof[dto],'Saved public proof object changed');this.owned[field]=proof[dto];}if(proof.cleanup){assert.match(proof.cleanup.operationId,/^[a-f0-9]{32}$/);assert.ok(!this.cleanupOperationId||this.cleanupOperationId===proof.cleanup.operationId,'Saved cleanup operation changed');this.cleanupOperationId=proof.cleanup.operationId;}return proof;}
  site(url,method,body='',headers={}){
    assert.equal(url.origin,PUBLIC_ORIGIN);assert.ok(!url.username&&!url.password&&!url.port);assert.ok(['GET','POST'].includes(method));
    assert.ok(this.cleanup||Date.parse(this.packet.expiresAt)>Date.now(),'The public proof phase expired');
    const p=this.packet,api=url.pathname.startsWith('/api/');
    if(api){assert.ok(['/api/client','/api/access','/api/workspace-billing'].includes(url.pathname),'Unapproved application endpoint');assert.ok(new Headers(headers).get('authorization')==='Bearer '+p.owner.bearer,'The exact controlled owner session is required');if(url.pathname!=='/api/access')assert.equal(url.searchParams.get('c'),p.owner.slug);assert.ok([...url.searchParams.keys()].every(k=>k==='c'||k==='operationId'),'Unapproved application query');
      if(method==='POST'){
        assert.equal(url.pathname,'/api/workspace-billing');const value=JSON.parse(body);assert.ok(['review','checkout','refresh','cancel_renewal','proof_begin','proof_cleanup','proof_close'].includes(value.action));
        if(value.action==='proof_begin'){assert.ok(exact(value,['action','phaseId','plan']));assert.equal(value.phaseId,p.phaseId);assert.equal(value.plan,'starter');}
        if(value.action==='proof_cleanup'||value.action==='proof_close'){assert.ok(exact(value,['action','phaseId','operationId','confirmed']));assert.equal(value.phaseId,p.phaseId);assert.equal(value.operationId,value.action==='proof_cleanup'?(this.cleanupOperationId||p.cleanupOperationId):p.closeOperationId);assert.equal(value.confirmed,true);}
        if(this.cleanup)assert.ok(['refresh','proof_cleanup','proof_close'].includes(value.action),'Cleanup cannot start another paid action');
        if(value.action==='review'){assert.equal(value.plan,'starter');assert.ok(!this.checkoutDispatched);}
        if(value.action==='checkout'){assert.ok(!this.checkoutDispatched&&!this.owned.checkout,'No second public Checkout dispatch');assert.equal(value.acceptedTerms,true);this.checkoutDispatched=true;}
        if(value.action==='cancel_renewal'){assert.ok(this.owned.subscription&&!this.cancelDispatched);assert.equal(value.confirmed,true);this.cancelDispatched=true;}
      }
    }else{assert.equal(method,'GET');assert.ok(/^\/(?:desk\.html|[a-zA-Z0-9_.\/-]+\.(?:js|css|svg|png|jpg|jpeg|webp|woff2?|ico)|terms-of-service\.html)$/.test(url.pathname),'Unapproved website resource');assert.ok(!url.pathname.includes('..'));}
    assert.ok(this.report.siteRequests.length<160,'Public site request allowance is spent');assert.ok(method!=='POST'||this.report.siteRequests.filter(r=>r.method==='POST').length<32,'Public site write allowance is spent');
    const entry={method,path:url.pathname,action:method==='POST'?JSON.parse(body).action:undefined,state:'reserved_unknown'};this.report.siteRequests.push(entry);this.save();return entry;
  }
  stripe(url,method,params=new URLSearchParams()){
    assert.ok(this.cleanup||Date.parse(this.packet.expiresAt)>Date.now(),'The public proof phase expired');
    assert.equal(url.origin,'https://api.stripe.com');assert.ok(!url.username&&!url.password&&!url.port);const p=this.packet,path=url.pathname;let allowed=false;
    if(method==='GET')allowed=path==='/v1/account'||path==='/v1/prices/'+p.fixture.priceId||path==='/v1/products/'+p.fixture.productId||path==='/v1/webhook_endpoints/'+p.webhook.id||this.owned.checkout&&path==='/v1/checkout/sessions/'+this.owned.checkout||this.owned.subscription&&path==='/v1/subscriptions/'+this.owned.subscription||this.owned.invoice&&path==='/v1/invoices/'+this.owned.invoice;
    if(method==='GET'&&/^\/v1\/events\/evt_[A-Za-z0-9_]+$/.test(path))allowed=this.report.receiptIds?.includes(path.split('/').at(-1));
    if(method==='POST'&&['/v1/prices/'+p.fixture.priceId,'/v1/products/'+p.fixture.productId].includes(path)){assert.deepEqual([...params.keys()],['active']);assert.ok(params.get('active')==='false'||params.get('active')==='true'&&!this.cleanup);allowed=true;}
    if(this.cleanup&&method==='POST'&&path==='/v1/webhook_endpoints/'+p.webhook.id){assert.deepEqual([...params],[['disabled','true']]);allowed=true;}
    if(this.cleanup&&method==='DELETE'&&path==='/v1/webhook_endpoints/'+p.webhook.id){assert.equal([...params].length,0);allowed=true;}
    assert.ok(allowed,'Unapproved Node Stripe TEST operation');assert.ok(method==='GET'||this.accountVerified,'Account must be verified before a mutation');return this.budget.reserve(method,path,'node-public-proof');
  }
}
