(function () {
  'use strict';
  // This workbench saves connection facts. Only the existing, separate approval
  // handlers can authorize a provider operation, charge, permission or send.
  var data, states = {}, selected, host, epoch = 0, opening = 0;
  var $ = function (id) { return document.getElementById(id); };
  var meta = document.querySelector('meta[name="mc-api-base"]');
  var base = meta && meta.content ? meta.content.replace(/\/$/, '') : '';
  var slug = new URLSearchParams(location.search).get('c');
  var names = {voice:'Phone answering',sms:'Two-way texting',web:'Website chat',calendar:'Google Calendar'};
  var phases = {voice:['Call routing','Review details','Next step'],sms:['Registered business','Your representative','Next step'],web:['Website details','Installation instructions','Next step'],calendar:['Your Google account','Access review','Calendar delivery']};
  function session() { try { return sessionStorage.getItem('mc-onboarding-session-v1'); } catch (_) { return null; } }
  function current() { return data && session() && document.body.dataset.workspaceState === 'ready'; }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function facts() { return data && data.serviceIntake; }
  function state() { return states[selected]; }
  function serviceFacts(id) { return facts() && facts()[id] || {}; }
  function field(name,label,value,options) {
    options=options||{};
    return '<div class="intake-field"><label for="intake-'+name+'">'+esc(label)+(options.optional?' <small>Optional</small>':'')+'</label><input class="form-input" id="intake-'+name+'" name="'+name+'" type="'+(options.type||'text')+'" value="'+esc(value)+'" maxlength="'+(options.max||254)+'"'+(options.optional?'':' required')+(options.autocomplete?' autocomplete="'+options.autocomplete+'"':'')+' aria-describedby="intake-'+name+'-error"><p class="cfg-field-error" id="intake-'+name+'-error"></p></div>';
  }
  function select(name,label,value,items) {
    return '<div class="intake-field"><label for="intake-'+name+'">'+esc(label)+'</label><select class="form-input" id="intake-'+name+'" name="'+name+'" required aria-describedby="intake-'+name+'-error"><option value="">Choose…</option>'+items.map(function(row){return '<option value="'+row[0]+'"'+(value===row[0]?' selected':'')+'>'+esc(row[1])+'</option>';}).join('')+'</select><p class="cfg-field-error" id="intake-'+name+'-error"></p></div>';
  }
  function defaults(id) {
    var c=data.client, saved=serviceFacts(id), n=(c.owner.name||'').trim().split(/\s+/);
    if(id==='voice')return Object.assign({forwardingMode:c.onboarding.phoneSetupMode||'',businessNumber:c.phone?.businessNumber||'',ownerPhone:c.owner.phone||'',carrier:'',forwarding:'missed'},saved.routing||{});
    if(id==='sms')return {business:Object.assign({legalName:c.business.legal?.legalName||c.business.name||'',ein:'',businessType:'',street:'',street2:'',city:c.business.city||'',state:'',zip:'',website:c.business.website||''},saved.business||{}),representative:Object.assign({firstName:n[0]||'',lastName:n.slice(1).join(' '),email:c.owner.email||'',phone:c.owner.phone||'',title:'',jobPosition:''},saved.representative||{})};
    if(id==='web')return Object.assign({website:c.business.website||'',builder:'',installationBy:''},saved.preferences||{});
    return {accountEmail:saved.preferences?.accountEmail||c.owner.email||''};
  }
  function snapshot() {
    var s=state(), form=$('serviceIntakeForm');if(!s||!form)return;
    var section=selected==='sms'?(s.step===0?'business':'representative'):null;
    var target=section?s.draft[section]:s.draft;
    form.querySelectorAll('[name]').forEach(function(input){target[input.name]=input.value;});
  }
  function nextAction() {
    var rows=data.setup?.connectionJourney?.channels||[];
    return rows.find(function(row){return row.id===selected;})?.action;
  }
  function actualAction(label) { var action=nextAction();return action&&action.kind!=='wait'?'<button type="button" class="btn-pill btn-pill-blue btn-sm" id="intakeActualAction">'+esc(label||action.label)+'</button>':''; }
  function summary(entries) { return '<dl class="intake-summary">'+entries.map(function(e){return '<div><dt>'+esc(e[0])+'</dt><dd>'+esc(e[1]||'Not provided')+'</dd></div>';}).join('')+'</dl>'; }
  function ready() {
    var s=state(), pre=facts().prerequisites||{}, action=nextAction(), available=facts().providerAvailable?.[selected];
    if(serviceFacts(selected).canSave===false){var row=(data.setup?.connectionJourney?.channels||[]).find(function(row){return row.id===selected;});return '<h4 id="intakeStepTitle" tabindex="-1">Your connection progress</h4><p>'+esc(row?.detail||'Your existing connection is retained.')+'</p><p>'+esc(row?.nextStep||'Check its current status before making another change.')+'</p>'+actualAction();}
    var lines=selected==='voice'?'<li>We reserve your dedicated number and prepare answering and fallback routing after your approval.</li><li>If you keep your current number, you switch on forwarding once; then a test call confirms answering.</li>':'<li>We prepare your shop’s carrier registration and track its review after your approval.</li><li>When the carrier approves it, reply to your setup text to confirm two-way delivery.</li>';
    var waiting=action?.kind==='wait',currentRow=(data.setup?.connectionJourney?.channels||[]).find(function(row){return row.id===selected;});
    return '<h4 tabindex="-1" id="intakeStepTitle">Your details are saved.</h4><p>'+(selected==='voice'?'Your call-routing details are ready to use.':'Registration details saved.')+'</p>'+
      '<div class="intake-next-action"><strong>'+esc(waiting?action.label||'Waiting for service':!pre.reviewed?'Next: check your business answers':!pre.practiced?'Next: try a customer conversation':available?'Next: approve the service review':'Your details are ready for connection review')+'</strong><p>'+esc(waiting?currentRow?.nextStep||'Your saved details are kept while we prepare this service.':!pre.reviewed?'Confirm the services, hours and instructions your front desk will use.':!pre.practiced?'Try your saved answers once before phone or text delivery starts.':'You’ll see the exact services, costs and permissions before anything starts.')+'</p>'+actualAction()+'</div>'+
      '<details><summary>What happens after your approval?</summary><ol class="intake-next-list">'+lines+'</ol></details>'+
      '<button type="button" class="connection-guide-link" id="intakeEdit">Edit saved details</button>';
  }
  var installation = {
    wordpress:['Open WordPress administration and your site-wide footer or custom-code tool.','Add the installation code below immediately before the closing body tag. Your theme or plugin must support site-wide scripts.','Save and publish the change, then return to check this website.'],
    wix:['Open your Wix dashboard, then Settings → Custom Code.','Add the code below, choose All pages and Body – end.','Apply the change to your published site, then return to check this website.'],
    squarespace:['Open your Squarespace site’s Code Injection settings.','Paste the code below into Footer. Code Injection requires a plan that supports it.','Save your change, then return to check this website.'],
    webflow:['Open your Webflow site settings, then Custom code.','Paste the code below in Footer code, before the closing body tag.','Save and publish the site, then return to check this website.'],
    shopify:['Open Shopify → Online Store → Themes → Edit code.','In your active theme layout, add the code below before the closing body tag.','Save the theme change, then return to check this website.'],
    other:['Open your website builder’s site-wide custom-code or footer settings.','Add the code below immediately before the closing body tag on all pages.','Publish the change, then return to check this website.']
  };
  function content() {
    var s=state(), d=s.draft;
    if(selected==='voice') {
      if(s.step===0)return '<h4 id="intakeStepTitle" tabindex="-1">How should customers reach you?</h4><p>Keep your business line or use a dedicated front desk number. Your contact cell is used for owner callbacks and must stay separate.</p><div class="intake-fields">'+select('forwardingMode','Customer calls',d.forwardingMode,[['forward_business_line','Keep my existing business number'],['use_new_number','Use the new front desk number']])+field('ownerPhone','Your contact cell',d.ownerPhone,{type:'tel',autocomplete:'tel'})+'<div id="intakeExistingLine"'+(d.forwardingMode==='forward_business_line'?'':' hidden')+'>'+field('businessNumber','Existing business number',d.businessNumber,{type:'tel',optional:d.forwardingMode!=='forward_business_line'})+select('carrier','Your phone provider',d.carrier,[['att','AT&T'],['verizon','Verizon'],['tmobile','T-Mobile'],['voip','Internet / VoIP provider'],['other','Another provider']])+select('forwarding','When should calls reach the front desk?',d.forwarding,[['all','Every call'],['missed','Missed or unanswered calls']])+'</div></div>';
      if(s.step===1)return '<h4 id="intakeStepTitle" tabindex="-1">Use these call-routing details?</h4>'+summary([['Customer calls',d.forwardingMode==='forward_business_line'?'Through your existing business line':'On the new front desk number'],['Business line',d.businessNumber],['Your contact cell',d.ownerPhone],['Phone provider',({att:'AT&T',verizon:'Verizon',tmobile:'T-Mobile',voip:'Internet / VoIP provider',other:'Another provider'})[d.carrier]],['When calls forward',d.forwardingMode==='use_new_number'?'Calls go directly to the new number':d.forwarding==='all'?'Every call':'Missed or unanswered calls']])+'<p>Saving these details updates your front desk’s phone settings. No number is purchased and no calls are forwarded by this step.</p>';
      return ready();
    }
    if(selected==='sms') {
      if(s.step===0){d=d.business;return '<h4 id="intakeStepTitle" tabindex="-1">Tell us about the registered business.</h4><p>US carriers use these details to register your shop’s text sender. Use the business’s official records.</p><div class="intake-fields">'+field('legalName','Legal business name',d.legalName)+field('ein','EIN',d.ein,{max:10})+select('businessType','Business type',d.businessType,[['llc','LLC'],['corporation','Corporation'],['partnership','Partnership']])+field('street','Registered street address',d.street,{autocomplete:'address-line1'})+field('street2','Suite or unit',d.street2,{optional:true,autocomplete:'address-line2'})+field('city','City',d.city,{autocomplete:'address-level2'})+field('state','State abbreviation',d.state,{max:2,autocomplete:'address-level1'})+field('zip','ZIP code',d.zip,{max:10,autocomplete:'postal-code'})+field('website','Public business website',d.website,{type:'url',autocomplete:'url'})+'</div><p class="intake-help">No EIN? This registration route supports registered businesses with an EIN. <a href="mailto:support@machinesandcloud.com">Ask us about your business type</a> before continuing.</p>';}
      if(s.step===1){d=d.representative;return '<h4 id="intakeStepTitle" tabindex="-1">Who can represent this business?</h4><p>We’ve filled in your contact details. Confirm the person authorized to register this shop’s texting service.</p><div class="intake-fields">'+field('firstName','First name',d.firstName,{autocomplete:'given-name'})+field('lastName','Last name',d.lastName,{autocomplete:'family-name'})+field('email','Work email',d.email,{type:'email',autocomplete:'email'})+field('phone','US mobile number',d.phone,{type:'tel',autocomplete:'tel'})+field('title','Job title',d.title)+select('jobPosition','Position',d.jobPosition,[['CEO','Owner / CEO'],['General_Manager','General manager'],['CFO','CFO'],['VP','VP'],['Director','Director'],['Other','Other']])+'</div>';}
      return ready();
    }
    if(selected==='calendar') {
      if(s.step===0)return '<h4 id="intakeStepTitle" tabindex="-1">Which Google account do you use?</h4><p>Saved visits will go to that account’s primary calendar. We’ll open Google so you can choose the account and review access.</p>'+field('accountEmail','Google account email',d.accountEmail,{type:'email',autocomplete:'email'})+'<p class="intake-help">You sign in directly with Google. We never ask for your Google password.</p>';
      var c=data.connections.calendar;
      return '<h4 id="intakeStepTitle" tabindex="-1">'+(c.connected?'Your Google permission is saved.':c.available?'Connect securely with Google.':'Your Google account is saved.')+'</h4><p role="status">'+(c.connected?esc(c.detail||'New saved visits and changes use your connected calendar. Check each visit’s delivery status.'):c.available?'Review Calendar access, then approve it on Google. We handle the connection and future updates.':'Waiting for Machines &amp; Cloud. We’ll request Google permission here when the connection is ready.')+'</p>'+actualAction(c.connected?'View Calendar delivery':'Review Google access')+summary([['Account to choose',d.accountEmail],['Destination','The selected account’s primary calendar']]);
    }
    if(s.step===0)return '<h4 id="intakeStepTitle" tabindex="-1">Where will your website chat live?</h4>'+field('website','Your business website',d.website,{type:'url',autocomplete:'url'})+'<p>Choose your website builder so we can show the right installation steps.</p><div class="intake-fields">'+select('builder','Website builder',d.builder,[['wordpress','WordPress'],['wix','Wix'],['squarespace','Squarespace'],['webflow','Webflow'],['shopify','Shopify'],['other','Another website builder']])+select('installationBy','Who manages your website?',d.installationBy,[['me','I do'],['web_person','My web person or agency']])+'</div>';
    if(s.step===1){var code=$('snippet')?.textContent||'';return '<h4 id="intakeStepTitle" tabindex="-1">'+(d.installationBy==='web_person'?'Give your web person one installation.':'Add chat to your website.')+'</h4><ol class="intake-next-list">'+(installation[d.builder]||installation.other).map(function(text){return '<li>'+esc(text)+'</li>';}).join('')+'</ol><pre class="snip intake-snippet">'+esc(code)+'</pre><button type="button" class="btn-pill btn-pill-dark btn-sm" id="intakeCopy">'+(d.installationBy==='web_person'?'Copy instructions and code':'Copy installation code')+'</button><p class="intake-help">This prepares the installation instructions. A website check confirms whether the code is actually installed.</p>';}
    var next=nextAction(),review=next?.kind==='route'&&next.target==='know',practice=next?.kind==='route'&&next.target==='test';
    return '<h4 id="intakeStepTitle" tabindex="-1">'+(review?'Check your front desk’s answers.':practice?'Try your front desk.':'Check chat on your website.')+'</h4><p>'+(review?'Your website details and installation instructions are saved. Review your services, hours and answers before using customer chat.':practice?'Ask a customer question to check your saved answers. Your installation instructions stay here when you return.':'The website check verifies the installation and walks through a setup request.')+'</p>'+actualAction();
  }
  function render(focus) {
    var s=state();if(!host||!s?.open)return;
    var focused=host.contains(document.activeElement)?document.activeElement.id:null;
    var node=$('serviceIntakeWorkbench');if(!node){node=document.createElement('section');node.id='serviceIntakeWorkbench';node.className='service-intake';node.setAttribute('aria-label',names[selected]+' setup');host.appendChild(node);}
    host.classList.add('has-service-intake');
    var last=selected==='calendar'?s.step>=1:s.step>=2, locked=s.busy||!!s.attempt||s.conflict;
    node.innerHTML='<div class="intake-heading"><span>'+esc(names[selected])+' setup</span><button type="button" class="connection-guide-link" id="intakeClose"'+(s.busy?' disabled':'')+'>Back to connection</button></div><ol class="intake-phases">'+phases[selected].map(function(text,i){return '<li'+(i===s.step?' aria-current="step"':'')+'><span aria-hidden="true">'+(i+1)+'</span>'+esc(text)+'</li>';}).join('')+'</ol><form id="serviceIntakeForm" novalidate aria-busy="'+s.busy+'">'+content()+(!data.client.onboarding.desiredChannels.includes(selected)?'<p class="intake-help">Saving adds this service to your setup. You’ll review any service costs before activation.</p>':'')+'<p class="intake-status" id="intakeStatus" role="status" aria-live="polite" data-error="'+!!s.error+'">'+esc(s.notice||'')+'</p><div class="intake-actions">'+(s.conflict?'<button type="button" class="btn-pill btn-pill-blue btn-sm" id="intakeLoadLatest">Load latest saved details</button>':'')+(!last&&!s.attempt&&serviceFacts(selected).canSave!==false&&!(selected==='voice'&&s.step===1)?'<button type="button" class="btn-pill btn-pill-dark btn-sm" id="intakeSaveLater"'+(locked?' disabled':'')+'>Save for later</button>':'')+(s.step>0?'<button type="button" class="btn-pill btn-pill-dark btn-sm" id="intakeBack"'+(locked?' disabled':'')+'>Back</button>':'')+(s.attempt?'<button type="button" class="btn-pill btn-pill-blue btn-sm" id="intakeReconcile"'+(s.busy?' disabled':'')+'>Check saved details</button>':!last?'<button type="submit" class="btn-pill btn-pill-blue btn-sm" id="intakeContinue"'+(locked||serviceFacts(selected).canSave===false&&s.step===0?' disabled':'')+'>'+(s.busy?'Saving…':selected==='web'&&s.step===0?'Save website and continue':s.step===1&&selected==='voice'?'Use these phone settings':selected==='web'&&s.step===1?esc(nextAction()?.label||'Back to connection'):'Save and continue')+'</button>':'')+'</div></form>';
    if(selected==='voice'&&s.step===0){var existing=s.draft.forwardingMode==='forward_business_line';['businessNumber','carrier','forwarding'].forEach(function(name){$('intake-'+name).required=existing;});}
    if(s.busy)node.querySelectorAll('input,select').forEach(function(input){input.disabled=true;});
    if(serviceFacts(selected).canSave===false&&!s.attempt&&!last){s.notice=facts().reasonCode==='private_storage_unavailable'?'Secure setup storage needs platform attention. Your existing connection is unchanged.':'This connection already has saved setup in progress. Continue with its current connection step.';$('intakeStatus').textContent=s.notice;}
    Object.entries(s.fieldErrors||{}).forEach(function(entry){var key=entry[0].split('.').pop(),input=$('intake-'+key),error=$('intake-'+key+'-error');if(input){input.setAttribute('aria-invalid','true');if(error)error.textContent=entry[1];}});
    if(focus&&Object.keys(s.fieldErrors||{}).length){document.querySelector('#serviceIntakeForm [aria-invalid="true"]')?.focus();}else if(focus){$('intakeStepTitle')?.focus({preventScroll:true});node.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}else if(focused&&$(focused))$(focused).focus({preventScroll:true});
  }
  function mount(target,id,d) { if(selected!==id)opening++;data=d;host=target;selected=id;if(states[id]?.open)render(false); }
  async function open(id,reload) {
    if(!current()||!names[id]||!facts())return;
    var tag=session(),run=epoch,sequence=++opening,full,controller=new AbortController(),timeout=setTimeout(function(){controller.abort();},15000),trigger=$('setupGuideDetails');if(trigger){trigger.disabled=true;trigger.textContent='Opening your saved details…';}try{var response=await fetch(base+'/api/client?c='+encodeURIComponent(slug)+'&service_intake=1',{headers:{Authorization:'Bearer '+tag},cache:'no-store',signal:controller.signal});if(run!==epoch||sequence!==opening||tag!==session())return;if(response.status===401||response.status===403){document.dispatchEvent(new CustomEvent('mc:session-expired'));return;}var result=await response.json();if(!response.ok||!result.serviceIntake)throw new Error();full=result.serviceIntake;data.serviceIntake=full;}catch(_){if(run===epoch&&sequence===opening){var notice=document.createElement('p');notice.id='intakeOpeningStatus';notice.setAttribute('role','alert');notice.textContent='Your saved connection details could not be opened. Check your connection status and try again.';$('intakeOpeningStatus')?.remove();host?.prepend(notice);if(trigger?.isConnected){trigger.disabled=false;trigger.textContent='Try opening connection details';}}return;}finally{clearTimeout(timeout);if(trigger?.isConnected){trigger.disabled=false;trigger.textContent='Review connection details';}}
    if(selected!==id){document.dispatchEvent(new CustomEvent('mc:guide-select',{detail:{service:id}}));}

    selected=id;var saved=serviceFacts(id);
    if(reload||states[id]&&!states[id].dirty&&!states[id].attempt&&states[id].token!==full.token)states[id]=null;
    if(states[id]&&states[id].token!==full.token&&!states[id].attempt){states[id].conflict=true;states[id].notice='Saved details changed. Load the latest saved details before continuing; this replaces the entries currently shown.';}
    if(!states[id]){var step=['voice','sms'].includes(id)&&saved.canSave===false?2:id==='voice'?(saved.complete?(saved.canApply?1:2):0):id==='sms'?(saved.complete?2:(saved.missingFields||[]).some(function(name){return name.startsWith('sms.business.');})?0:1):id==='calendar'?(saved.preferences?.accountEmail?1:0):saved.canApply!==true&&saved.preferences?.builder&&saved.preferences?.installationBy?1:0;states[id]={draft:defaults(id),step:step,open:true,busy:false,dirty:false,token:full.token,conflict:false};}
    states[id].open=true;render(true);
  }
  function validate() {
    var form=$('serviceIntakeForm'), invalid=null;
    form.querySelectorAll('input,select').forEach(function(input){input.removeAttribute('aria-invalid');var error=$('intake-'+input.name+'-error');if(error)error.textContent='';if(!input.checkValidity()){input.setAttribute('aria-invalid','true');if(error)error.textContent=input.validity.valueMissing?'Enter '+(input.labels[0]?.textContent||'this value').toLowerCase().replace('optional','').trim()+'.':input.type==='email'?'Enter a valid email address.':input.type==='url'?'Enter the full website address, starting with https://.':'Check this value.';invalid=invalid||input;}});
    if(invalid){invalid.focus();return false;}return true;
  }
  function applyResponse(result) {
    if(result.serviceIntake)data.serviceIntake=result.serviceIntake;
    ['client','setup','configurationRevision','editRevision'].forEach(function(key){if(result[key]!=null)data[key]=result[key];});
    document.dispatchEvent(new CustomEvent('mc:desk-refresh'));
  }
  async function save(apply,later) {
    var s=state();if(!current()||s.busy||s.attempt||s.conflict||!later&&!validate())return;
    snapshot();s.fieldErrors={};var fields=selected==='sms'?s.draft[s.step===0?'business':'representative']:s.draft;
    var section=selected==='voice'?'routing':selected==='sms'?(s.step===0?'business':'representative'):'preferences';
    s.attempt={body:{action:apply?'apply_service_intake':'save_service_intake',expectedIntakeToken:s.token,submissionId:Array.from(crypto.getRandomValues(new Uint8Array(16))).map(function(n){return n.toString(16).padStart(2,'0');}).join(''),service:selected},next:later?s.step:s.step+1,closeAfter:!!later,followWeb:selected==='web'&&s.step===0&&!later};
    if(!apply)Object.assign(s.attempt.body,{section:section,fields:JSON.parse(JSON.stringify(fields)),selectService:true});
    await send(selected);
  }
  async function acceptResult(result,attempt,s,id){
    applyResponse(result);s.token=result.serviceIntake.token;
    if(attempt.followWeb&&result.serviceIntake?.web?.canApply){s.attempt={body:{action:'apply_service_intake',expectedIntakeToken:result.serviceIntake.token,submissionId:Array.from(crypto.getRandomValues(new Uint8Array(16))).map(function(n){return n.toString(16).padStart(2,'0');}).join(''),service:'web'},next:attempt.next};s.busy=false;await send(id);return;}
    s.attempt=null;s.step=attempt.next;s.notice='Details saved securely.';s.error=false;s.dirty=false;if(attempt.closeAfter){s.open=false;if(selected===id){host?.classList.remove('has-service-intake');$('serviceIntakeWorkbench')?.remove();}document.dispatchEvent(new CustomEvent('mc:service-intake-saved',{detail:{service:id}}));if(selected===id){$('connectionIntakeSaved')?.scrollIntoView({block:'center',behavior:'instant'});$('connectionIntakeSaved')?.focus({preventScroll:true});}}
  }
  async function send(id) {
    var s=states[id], attempt=s?.attempt, tag=session(), version=epoch;if(!attempt||s.busy)return;
    s.busy=true;s.notice='Saving your connection details…';s.error=false;if(selected===id)render(false);
    var controller=new AbortController(),timeout=setTimeout(function(){controller.abort();},20000);
    try{
      var response=await fetch(base+'/api/client?c='+encodeURIComponent(slug),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tag},body:JSON.stringify(attempt.body),signal:controller.signal});
      if(version!==epoch||tag!==session())return;
      if(response.status===401||response.status===403){document.dispatchEvent(new CustomEvent('mc:session-expired'));return;}
      var result=await response.json();if(!response.ok||!result.ok){if(response.status===422){s.fieldErrors=result.fieldErrors||{};if(id==='voice'&&s.step===1)s.step=0;s.attempt=null;s.notice=result.message||'Check the highlighted details.';s.error=true;return;}if(response.status===409){s.attempt=null;s.conflict=true;applyResponse(result);throw new Error('Saved details changed. Load the latest saved details before continuing; this replaces the entries currently shown.');}throw new Error(result.message||'We could not confirm the saved result.');}
      await acceptResult(result,attempt,s,id);
    }catch(error){if(version===epoch){s.notice=s.attempt?'The response was interrupted. Your details may be saved. Check the saved result before continuing.':error.message;s.error=true;}}
    finally{clearTimeout(timeout);if(version===epoch&&states[id]===s){s.busy=false;if(selected===id)render(true);}}
  }
  async function reconcile() {
    var s=state(), attempt=s.attempt, id=selected, tag=session(), version=epoch;if(!attempt||s.busy)return;
    s.busy=true;s.notice='Checking the saved result…';render(false);var controller=new AbortController(),timeout=setTimeout(function(){controller.abort();},15000);
    try{var response=await fetch(base+'/api/client?c='+encodeURIComponent(slug),{headers:{Authorization:'Bearer '+tag},cache:'no-store',signal:controller.signal});if(version!==epoch||tag!==session())return;if(response.status===401||response.status===403){document.dispatchEvent(new CustomEvent('mc:session-expired'));return;}var result=await response.json();if(!response.ok||!result.serviceIntake)throw new Error();applyResponse(result);if(result.serviceIntake.lastSubmissionId===attempt.body.submissionId){await acceptResult(result,attempt,s,id);if(s.open)s.notice='Your saved details are confirmed.';}else if(result.serviceIntake.token===attempt.body.expectedIntakeToken){s.busy=false;await send(id);return;}else{s.attempt=null;s.conflict=true;s.notice='Another saved change was found. Your entries are kept. Load the latest saved details before continuing; this replaces the entries currently shown.';s.error=true;}}
    catch(_){if(version===epoch){s.notice='Saved details could not be checked. Your entries are kept. Check again before continuing.';s.error=true;}}
    finally{clearTimeout(timeout);if(version===epoch){s.busy=false;if(selected===id)render(true);}}
  }
  function continueActual() {
    var s=state(), action=nextAction();if(!action||action.kind==='wait')return;
    s.open=false;host.classList.remove('has-service-intake');$('serviceIntakeWorkbench')?.remove();
    document.dispatchEvent(new CustomEvent('mc:guide-do-next',{detail:{service:selected}}));
  }
  document.addEventListener('click',async function(event){
    if(!event.target.closest('#serviceIntakeWorkbench')||!current())return;
    var s=state();if(s.busy)return;
    if(event.target.closest('#intakeClose')){snapshot();s.open=false;host.classList.remove('has-service-intake');$('serviceIntakeWorkbench').remove();$('setupGuideDetails')?.focus({preventScroll:true});return;}
    if(event.target.closest('#intakeReconcile'))return reconcile();
    if(event.target.closest('#intakeLoadLatest'))return open(selected,true);
    if(s.attempt)return;
    if(event.target.closest('#intakeSaveLater'))return save(false,true);
    if(event.target.closest('#intakeActualAction'))return continueActual();
    if(event.target.closest('#intakeBack')||event.target.closest('#intakeEdit')){snapshot();s.step=event.target.closest('#intakeEdit')?0:Math.max(0,s.step-1);s.notice='';render(true);}
    if(event.target.closest('#intakeCopy')){try{var code=$('snippet')?.textContent||'';if(!code)throw new Error();var text=s.draft.installationBy==='web_person'?[names.web+' for '+data.client.business.name,'Website: '+data.client.business.website].concat(installation[s.draft.builder]||installation.other,[code]).join('\n\n'):code;await navigator.clipboard.writeText(text);s.notice='Copied. Publish the website change, then continue to the installation check.';s.error=false;}catch(_){s.notice='Copy was blocked. Select and copy the code shown above.';s.error=true;}$('intakeStatus').textContent=s.notice;}
  });
  document.addEventListener('input',function(event){if(!event.target.closest('#serviceIntakeForm')||!current())return;snapshot();state().dirty=true;state().notice='Your changes haven’t been saved yet.';if($('intakeStatus'))$('intakeStatus').textContent=state().notice;if(state().fieldErrors)Object.keys(state().fieldErrors).filter(function(key){return key.split('.').pop()===event.target.name;}).forEach(function(key){delete state().fieldErrors[key];});event.target.removeAttribute('aria-invalid');var error=$('intake-'+event.target.name+'-error');if(error)error.textContent='';if(event.target.name==='forwardingMode'){var show=event.target.value==='forward_business_line';$('intakeExistingLine').hidden=!show;$('intake-businessNumber').required=show;$('intake-forwarding').required=show;$('intake-carrier').required=show;}});
  document.addEventListener('focusin',function(event){var input=event.target;if(!input.closest('#serviceIntakeWorkbench'))return;requestAnimationFrame(function(){if(!input.isConnected||document.activeElement!==input)return;var nav=document.querySelector('.desk-rail .tabs'),bottom=innerHeight-12;if(nav&&getComputedStyle(nav).position==='fixed')bottom=Math.min(bottom,nav.getBoundingClientRect().top-12);var rect=input.getBoundingClientRect();if(rect.bottom>bottom)window.scrollBy({top:rect.bottom-bottom,behavior:'instant'});else if(rect.top<12)window.scrollBy({top:rect.top-12,behavior:'instant'});});});
  document.addEventListener('submit',function(event){if(event.target.id!=='serviceIntakeForm')return;event.preventDefault();var s=state();if(!s||s.busy||s.attempt)return;if(selected==='web'&&s.step===1)continueActual();else save(selected==='voice'&&s.step===1);});
  document.addEventListener('mc:desk',function(event){data=event.detail;});
  document.addEventListener('mc:service-intake-open',function(event){var id=event.detail?.service;if(!names[id])return;document.dispatchEvent(new CustomEvent('mc:desk-route',{detail:{tab:'setup'}}));document.dispatchEvent(new CustomEvent('mc:guide-select',{detail:{service:id}}));open(id);});
  function clear(){epoch++;opening++;states={};data=null;$('serviceIntakeWorkbench')?.remove();host?.classList.remove('has-service-intake');}
  document.addEventListener('mc:session-expired',clear);$('deskSignOut')?.addEventListener('click',clear);
  window.MCServiceIntake={mount:mount,open:open};
})();
