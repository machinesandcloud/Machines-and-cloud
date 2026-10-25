"""Offline planning calculator only; no app imports, provider requests or billing changes."""
from decimal import Decimal as D
import hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).with_name('PRICING-COST-MODEL-2026-10-25.json')
MODELS={'haiku55':{'inputPerMillion':D('.10'),'outputPerMillion':D('.50')},'sonnet55':{'inputPerMillion':D('2'),'outputPerMillion':D('10')},'opus55_current':{'inputPerMillion':D('4'),'outputPerMillion':D('20')}}
ENVELOPES={'base':{'inputTokensPerRequest':8000,'outputTokensPerRequest':500,'requestsPerReply':D('1.3')},'stress':{'inputTokensPerRequest':12000,'outputTokensPerRequest':800,'requestsPerReply':D('2')}}
def unit(model,scenario):
 r=MODELS[model];e=ENVELOPES[scenario]
 return (D(e['inputTokensPerRequest'])*r['inputPerMillion']+D(e['outputTokensPerRequest'])*r['outputPerMillion'])/D(1000000)*e['requestsPerReply']
def routed(scenario):return D('.9')*unit('haiku55',scenario)+D('.1')*unit('sonnet55',scenario)
assert routed('base')==D('.0039585') and routed('stress')==D('.00928')
results=[]
for ladder in [[99,249,449],[149,299,499]]:
 for n,(price,voice,sms,written)in enumerate(zip(ladder,[100,250,500],[250,750,1500],[1500,3000,6000]),1):
  for scenario in ENVELOPES:
   partner=D(20)if n==3 else D(0)
   costs={'ai':D(written)*routed(scenario),'voice':D(voice)*D('.15'if scenario=='base'else'.25'),'smsIncludingFundedInbound':D(sms)*D('.020'if scenario=='base'else'.030'),'numberAndStandardCampaign':D('11.15'),'infrastructureEmailAllocation':D(15),'supportAllocation':D(15),'paymentAndSubscriptionFees':D(price)*D('.036')+D('.30'),'unquotedPartnerContingency':partner}
   total=sum(costs.values());nonAI=total-costs['ai']
   results.append({'ladder':ladder,'tier':n,'price':price,'scenario':scenario,'allowances':{'writtenReplies':written,'voiceMinutes':voice,'outboundSMSPartsIncludingOwnerAlerts':sms},'costs':{k:float(v.quantize(D('.01')))for k,v in costs.items()},'totalCost':float(total.quantize(D('.01'))),'nonAICostExact':str(nonAI),'contributionMarginPercent':float(((D(price)-total)/D(price)*100).quantize(D('.1'))),'availablePerReplyAt50PercentMargin':float((D(price)*D('.5')-nonAI)/D(written)),'availablePerReplyAt60PercentMargin':float((D(price)*D('.4')-nonAI)/D(written))})
paths=['netlify/functions/lib/config.mjs','netlify/functions/lib/usage.mjs','netlify/functions/lib/workspace-billing.mjs','netlify/functions/lib/billing.mjs','netlify/functions/lib/self-service-ai.mjs','netlify/functions/lib/agent.mjs','netlify/functions/lib/managed-sms.mjs','netlify/functions/lib/managed-sms-budget.mjs','netlify/functions/lib/managed-email-budget.mjs','netlify/functions/lib/voice-provider.mjs','netlify/functions/lib/voice-activation.mjs','netlify/functions/lib/lead-connections.mjs','netlify/functions/lib/thumbtack-connection.mjs','netlify/functions/lib/thumbtack-api.mjs','netlify/functions/lib/platform-ai.mjs','netlify/functions/lib/platform-ai-proposal.mjs','netlify/functions/lib/request-followthrough.mjs','netlify/functions/lib/sales-desk.mjs','netlify/functions/lib/access.mjs','netlify/functions/lib/workspace-edit.mjs','netlify/functions/onboard.mjs','netlify/functions/client.mjs','netlify/functions/admin.mjs','netlify/functions/angi.mjs','netlify/functions/thumbtack.mjs','index.html','onboard.html','onboard.js','signup-intake.js','desk-billing.js','admin.js','.env.example']
sensitivity=[]
for row in results:
 if row['ladder']!=[149,299,499]:continue
 nonai=D(row['nonAICostExact'])
 for model in ['sonnet55','opus55_current']:
  ai=D(row['allowances']['writtenReplies'])*unit(model,row['scenario']);total=nonai+ai
  sensitivity.append({'price':row['price'],'scenario':row['scenario'],'allRepliesModel':model,'aiCost':float(ai.quantize(D('.01'))),'totalCost':float(total.quantize(D('.01'))),'contributionMarginPercent':float(((D(row['price'])-total)/D(row['price'])*100).quantize(D('.1')))})
out={'version':2,'reviewedOn':'2026-10-25','sourceCommit':'1b5905bb7f11acd9dc32ed6ad122b33e80b21261','status':'DRAFT_PLANNING_ONLY_MODEL_QUALITY_UNVERIFIED_NO_AUTHORITY_OR_RUNTIME_CHANGE','models':MODELS,'tokenEnvelopes':ENVELOPES,'unitCosts':{m:{s:unit(m,s)for s in ENVELOPES}for m in MODELS},'routingHypothesis':{'haikuShare':.9,'sonnetShare':.1,'maximumSonnetShare':.1,'notQualityGuarantee':True,'modelQualityAccepted':False,'basePerReplyUSD':routed('base'),'stressPerReplyUSD':routed('stress')},'fixedAssumptions':{'domesticPaymentsPercent':2.9,'stripeBillingPercent':.7,'paymentFixedUSD':.30,'numberMonthlyUSD':1.15,'outboundSMSFullyFundedUnitCost':{'base':.020,'stress':.030},'inboundSMSBilling':'Not deducted from outbound allowance; funding assumes0.5inboundsegment/outbound base and1.0stress, separate spam/abuse/provider safety admission','standardCampaignMonthlyUSD':10,'infrastructureAndEmailMonthlyUSD':15,'supportMonthlyUSD':15,'supportLoadedHourlyUSD':40,'unquotedPartnerContingencyTopOnlyUSD':20,'firstPeriodStandardBrandCampaignUSD':61,'firstPeriodLowVolumeBrandCampaignIfEligibleUSD':19.50},'results':results,'allSonnetAndOpusSensitivity':sensitivity,'sourcePins':{p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest()for p in paths},'limits':['Not supplier invoices or measured support','Stress is the specified bounded-token scenario, not the current unbounded-token architecture','Existing shared daily free pool is not paid reserved capacity; new paid monthly entitlement and free fallback are distinct','One-time onboarding labor/registration, taxes, refunds, CAC and extraordinary incidents excluded','Voice allowance counts connected hosted call legs, each leg rounded up to60seconds; handoff legs are not free. No unlimited human support, lead purchases or unquoted supplier access included','Top partner20 is a planning reserve, not a quoted fee or confirmed free API','Sonnet10percent ceiling and hard2requests/12kinput/800output must be implemented and quality accepted before relying on stress bound','No cache, Batch, negotiated volume or annual-prepay discounts assumed']}
def encode(v):
 if isinstance(v,D):return float(v)
 raise TypeError(type(v).__name__)
OUT.write_text(json.dumps(out,indent=2,default=encode)+'\n')
for r in results:print(f"{r['ladder']} tier{r['tier']} {r['scenario']}: cost{r['totalCost']} margin{r['contributionMarginPercent']}%")
