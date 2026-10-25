// Generates an internal standalone review, with no runtime imports or provider access.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const catalog=read('product/pricing/catalog.json');
const model=read('product/research/PRICING-COST-MODEL-2026-10-25.json');
const offer=JSON.parse(catalog),economics=JSON.parse(model);
assert.equal(offer.purchasable,false,'Review catalog must remain non-purchasable');
assert.equal(offer.asOf,economics.reviewedOn,'Catalog and economics review dates must match');
assert.equal(offer.packages.length,3,'The reviewed offer has three standard packages');
const ladder=offer.packages.map(p=>p.monthlyPriceCents/100);
assert.equal(new Set(offer.packages.map(p=>p.id)).size,3,'Package IDs must be unique');
for(const [i,p] of offer.packages.entries()){
  assert.ok(Number.isSafeInteger(p.monthlyPriceCents)&&p.monthlyPriceCents>0,'Package price must be positive integer cents');
  assert.equal(p.inherits,i===0?null:offer.packages[i-1].id,'Each package must include its predecessor');
  for(const key of ['voiceMinutes','outgoingSmsSegments','writtenAiReplies'])assert.ok(Number.isSafeInteger(p.included[key])&&p.included[key]>0,'Allowances must be positive whole units');
  for(const scenario of ['base','stress']){
    const matches=economics.results.filter(r=>r.price===ladder[i]&&r.tier===i+1&&r.scenario===scenario&&JSON.stringify(r.ladder)===JSON.stringify(ladder));
    assert.equal(matches.length,1,'Missing or ambiguous economics for '+p.id+'/'+scenario);
    const row=matches[0];
    assert.deepEqual(row.allowances,{writtenReplies:p.included.writtenAiReplies,voiceMinutes:p.included.voiceMinutes,outboundSMSPartsIncludingOwnerAlerts:p.included.outgoingSmsSegments},'Catalog allowance differs from funded economics for '+p.id);
    assert.ok(Number.isFinite(row.totalCost)&&Number.isFinite(row.contributionMarginPercent),'Economics must be finite');
    for(const route of ['sonnet55','opus55_current']){
      const sensitivity=economics.allSonnetAndOpusSensitivity.filter(r=>r.price===ladder[i]&&r.scenario===scenario&&r.allRepliesModel===route);
      assert.equal(sensitivity.length,1,'Missing or ambiguous model sensitivity for '+p.id+'/'+route);
      assert.ok(Number.isFinite(sensitivity[0].totalCost)&&Number.isFinite(sensitivity[0].contributionMarginPercent),'Model sensitivity must be finite');
    }
  }
}
const encode=json=>JSON.stringify(JSON.parse(json)).replaceAll('<','\\u003c');
const logo=readFileSync(new URL('assets/logo-dark.png',root)).toString('base64');
const html=read('product/pricing/preview.template.html')
  .replace('__CATALOG_JSON__',encode(catalog))
  .replace('__COST_JSON__',encode(model))
  .replace('__LOGO_DATA__','data:image/png;base64,'+logo);
writeFileSync(new URL('product/pricing/preview.html',root),html);
console.log(JSON.stringify({file:'product/pricing/preview.html',sha256:createHash('sha256').update(html).digest('hex'),catalog:JSON.parse(catalog).id,purchasable:false}));
