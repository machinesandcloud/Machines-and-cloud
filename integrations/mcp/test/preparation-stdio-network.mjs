import './network-block.mjs';
import assert from 'node:assert/strict';
import { bearer, slug, fixture, jsonResponse } from './fixtures.mjs';
let value=fixture();value.setup.connectionPreparation={eligible:true,prepared:false,token:'a'.repeat(64),lastSubmissionId:null,desiredChannels:['web'],website:''};
globalThis.fetch=async(url,init)=>{
 assert.equal(String(url),`https://machinesandcloud.com/api/client?c=${slug}${init.method==='POST'?'':'&setup_assistance=1'}`);assert.equal(init.redirect,'error');assert.equal(init.credentials,'omit');assert.equal(init.headers.Authorization,'Bearer '+bearer);
 if(init.method==='POST'){
  assert.equal(init.headers.Origin,'https://machinesandcloud.com');
  const b=JSON.parse(init.body);assert.equal(b.action,'prepare_connections');assert.deepEqual(b.desiredChannels,['web','sms']);assert.equal(b.website,'https://trusted-trades.com/');
  value.setup.connectionPreparation={eligible:true,prepared:true,token:'b'.repeat(64),lastSubmissionId:b.submissionId,desiredChannels:b.desiredChannels,website:b.website};
  value.preparation={state:'saved',submissionId:b.submissionId,token:'b'.repeat(64)};
 }else assert.equal(init.method,'GET');return jsonResponse(value);
};
