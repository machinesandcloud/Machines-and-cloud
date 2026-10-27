(function () {
  'use strict';
  var host = document.getElementById('setupGuide');
  if (!host) return;
  var data = null, selected = null, manualSelection = false, intakeSaved = {}, pageScreen = 'overview', restoringPage = false, pageRestored = false;
  var sharedReview = null, mutationReadbackView = null;
  var guideService = null, guideStep = null, guideManual = false, guideTask = null, guideTarget = null, guideOpened = false, pathExpanded = null;
  var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var coach = document.createElement('aside'); coach.id = 'setupGuideCoach'; coach.className = 'setup-guide-coach'; coach.hidden = true; coach.setAttribute('aria-label', 'Your setup guide');
  var heading = document.querySelector('#portalContent .desk-page-heading'); if(heading)heading.after(coach);
  var labels = { web: 'Website chat', voice: 'Phone answering', sms: 'Text messaging', calendar: 'Google Calendar', thumbtack: 'Thumbtack', angi: 'Angi' };
  var brandMark = typeof window.MCBrandMark === 'function' ? window.MCBrandMark : function () { return ''; };
  var $ = function (id) { return document.getElementById(id); };
  var preparation = null, preparationGeneration = 0, preparationTimer = null;
  var connectionCheck = null, connectionNotices = {}, connectionCheckGeneration = 0;
  var channelLabels = { web: 'Website chat', voice: 'Phone answering', sms: 'Two-way texting', calendar: 'Google Calendar' };
  var meta = document.querySelector('meta[name="mc-api-base"]'), apiBase = meta && meta.content ? meta.content.replace(/\/$/, '') : '';
  function preparationFacts() { return data && data.setup && data.setup.connectionPreparation; }
  function preparationSession() { try { return sessionStorage.getItem('mc-onboarding-session-v1'); } catch (error) { return null; } }
  function preparationValues() {
    var form = $('connectionPreparationForm');
    return form ? { desiredChannels: Array.from(form.querySelectorAll('[name="preparationChannel"]:checked')).map(function (field) { return field.value; }).sort(), website: $('preparationWebsite').value.trim() } : preparation && preparation.draft;
  }
  function samePreparation(a, b) { return !!a && !!b && a.website === b.website && JSON.stringify(a.desiredChannels.slice().sort()) === JSON.stringify(b.desiredChannels.slice().sort()); }
  function hasPreparationForm() { var facts=preparationFacts();return !!facts && facts.eligible === true && (!facts.prepared&&!facts.selectionSaved&&!(facts.desiredChannels||[]).length || preparation && (preparation.dirty || preparation.pending || preparation.awaiting || preparation.uncertain)); }
  function preparationNotice(text, isError) { if (preparation) { preparation.notice = text; preparation.error = !!isError; } var node=$('preparationStatus');if(node){node.textContent=text;node.dataset.error=String(!!isError);} }
  function preparationRead() {
    if (!current() || !preparation || preparation.pending || preparation.awaiting) return;
    preparation.awaiting=true;preparationNotice('Checking your saved setup…',false);render();
    document.dispatchEvent(new CustomEvent('mc:desk-refresh'));
    clearTimeout(preparationTimer);var expected=preparationGeneration;
    preparationTimer=setTimeout(function(){if(expected!==preparationGeneration||!preparation||!preparation.awaiting)return;preparation.awaiting=false;preparationNotice('Your saved setup could not be checked. Your choices are kept here. Check again before continuing.',true);render();},15000);
  }
  function observePreparation() {
    var facts=preparationFacts();if(!facts)return;
    var saved={desiredChannels:(facts.desiredChannels||[]).slice().sort(),website:facts.website||''};
    if(!preparation){preparation={draft:saved,dirty:false,pending:false,awaiting:false,uncertain:false,notice:'',error:false,attempt:null};return;}
    var attempt=preparation.attempt;
    if(attempt&&facts.eligible===true&&facts.prepared===true&&facts.lastSubmissionId===attempt.body.submissionId&&samePreparation(saved,attempt.snapshot)){
      preparation.pending=false;preparation.awaiting=false;preparation.uncertain=false;clearTimeout(preparationTimer);
      preparation.dirty=!samePreparation(preparation.draft,attempt.snapshot);preparation.attempt=null;
      preparationNotice(preparation.dirty?'Your submitted setup is saved. Your newer choices are still here; prepare them before continuing.':'Your service choices and website are saved. Review your business answers next.',false);
    } else if(preparation.awaiting){
      preparation.awaiting=false;clearTimeout(preparationTimer);
      if(attempt){preparation.uncertain=true;preparationNotice('We could not confirm that setup was saved. Your choices are kept. Check saved setup before making another change.',true);}
    }
    if(!preparation.dirty&&!preparation.pending&&!preparation.uncertain){preparation.draft=saved;}
    if(facts.eligible!==true&&attempt){preparation.pending=false;preparation.awaiting=false;preparation.uncertain=true;preparationNotice('Your workspace changed. Continue with its current connection steps below.',true);}
  }
  function renderPreparation() {
    var facts=preparationFacts();if(!hasPreparationForm())return false;
    var focused=host.contains(document.activeElement)?document.activeElement:null,focusId=focused&&focused.id,focusValue=focused&&focused.value,selection=focused&&typeof focused.selectionStart==='number'?{start:focused.selectionStart,end:focused.selectionEnd}:null;
    var draft=preparation.draft,blocked=preparation.pending||preparation.awaiting;
    var previousChoices=$('preparationEditChoices'),editChoices=previousChoices?previousChoices.open:!draft.desiredChannels.length;
    host.hidden=false;host.closest('#connectionsCard').classList.add('has-setup-guide','has-connection-preparation');
    $('connectionPreferencesDetails').hidden=true;$('websiteSetupDetails').hidden=true;
    host.innerHTML='<div class="setup-guide-heading"><h3 id="setupGuideTitle">'+(draft.desiredChannels.length?'Confirm your services':'Choose your services')+'</h3><p class="muted">'+(draft.desiredChannels.length?'Here are the services and website you chose. Make any changes, then continue.':'Choose where customers can reach your front desk. You can add your website now or later.')+'</p></div>'+
      '<form id="connectionPreparationForm" class="connection-preparation" novalidate aria-busy="'+blocked+'"><dl class="preparation-saved-summary"><div><dt>Your services</dt><dd id="preparationSavedServices">'+esc(draft.desiredChannels.map(function(id){return channelLabels[id];}).filter(Boolean).join(', ')||'Choose the services you want to use')+'</dd></div><div><dt>Your website</dt><dd id="preparationSavedWebsite">'+esc(draft.website||'You can add a website later')+'</dd></div></dl><details class="preparation-edit-choices" id="preparationEditChoices"'+(editChoices?' open':'')+'><summary>Change services or website</summary><fieldset class="preparation-services" aria-describedby="preparationChannelsError"><legend>What would you like to use?</legend><div class="preparation-choices">'+Object.keys(channelLabels).map(function(id){return '<label><input type="checkbox" id="preparationChannel-'+id+'" name="preparationChannel" value="'+id+'"'+(draft.desiredChannels.includes(id)?' checked':'')+'><span class="brand-lockup">'+brandMark(id)+'<span>'+channelLabels[id]+'</span></span></label>';}).join('')+'</div><p class="cfg-field-error" id="preparationChannelsError"></p></fieldset>'+
      '<div class="preparation-website"><label class="form-label" for="preparationWebsite">Your business website <small>Optional</small></label><input class="form-input" id="preparationWebsite" type="url" autocomplete="url" placeholder="https://yourshop.com" value="'+esc(draft.website)+'" aria-describedby="preparationWebsiteHint preparationWebsiteError"><p id="preparationWebsiteHint" class="muted">If you choose website chat, we’ll prepare its installation for this website. You can add a website later.</p><p class="cfg-field-error" id="preparationWebsiteError"></p></div>'+
      '</details><div class="preparation-actions"><button type="submit" id="prepareConnections" class="btn-pill btn-pill-blue btn-sm"'+(blocked?' disabled':'')+'>'+(preparation.pending?'Preparing your services…':preparation.awaiting?'Checking saved setup…':preparation.uncertain?'Check saved setup':'Prepare my services')+'</button>'+(preparation.uncertain&&!blocked?'<button type="button" id="preparationUseSaved" class="btn-pill btn-pill-dark btn-sm">Use saved choices</button>':'')+'</div><p id="preparationStatus" class="preparation-status" role="status" aria-live="polite" aria-atomic="true" data-error="'+preparation.error+'">'+esc(preparation.notice)+'</p></form>'+
      '<div class="preparation-expectations"><div><strong>Prepared for you</strong><p>One business profile, your selected services and the website installation details.</p></div><div><strong>Next, make it yours</strong><p>Check your answers and try your front desk. Account permissions, routing and any service costs stay yours to approve.</p></div></div>';
    if(focusId){var replacement=$(focusId);if(replacement&&host.contains(replacement)){replacement.focus({preventScroll:true});if(selection&&replacement.value===focusValue)replacement.setSelectionRange(selection.start,selection.end);}}
    return true;
  }
  async function prepareConnections() {
    if(!current()||!preparation||preparation.pending||preparation.awaiting)return;
    if(preparation.uncertain){preparationRead();return;}
    var facts=preparationFacts(),snapshot=preparationValues();if(!facts||facts.eligible!==true)return;
    preparation.draft=snapshot;
    if(snapshot.website){var website;try{website=new URL(snapshot.website);}catch(error){}if(!website||website.protocol!=='https:'||website.username||website.password){$('preparationEditChoices').open=true;$('preparationWebsiteError').textContent='Enter a full HTTPS website address, such as https://yourshop.com.';$('preparationWebsite').setAttribute('aria-invalid','true');$('preparationWebsite').focus();return;}snapshot.website=website.href;preparation.draft=snapshot;}
    if(!/^[a-f0-9]{64}$/.test(facts.token||'')){preparationNotice('Check your saved setup before continuing.',true);preparationRead();return;}
    var session=preparationSession();if(!session)return;
    var id=Array.from(crypto.getRandomValues(new Uint8Array(16))).map(function(byte){return byte.toString(16).padStart(2,'0');}).join('');
    var body={action:'prepare_connections',expectedPreparationToken:facts.token,submissionId:id,desiredChannels:snapshot.desiredChannels,website:snapshot.website};
    preparation.attempt={body:body,snapshot:JSON.parse(JSON.stringify(snapshot))};preparation.pending=true;preparation.dirty=true;preparationNotice('Preparing your selected services and website…',false);render();
    var expected=preparationGeneration,controller=new AbortController(),timeout=setTimeout(function(){controller.abort();},20000);
    try{
      var response=await fetch(apiBase+'/api/client?c='+encodeURIComponent(data.client.slug),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session},body:JSON.stringify(body),signal:controller.signal});
      if(expected!==preparationGeneration||!current()||session!==preparationSession())return;
      if(response.status===401||response.status===403){document.dispatchEvent(new CustomEvent('mc:session-expired'));return;}
      var result=await response.json();if(expected!==preparationGeneration||!current())return;
      if(!response.ok||!result.ok){var error=new Error(result.message||'Your setup could not be confirmed. Your choices are kept.');error.status=response.status;error.code=result.error;error.field=result.field;throw error;}
      preparation.pending=false;preparation.awaiting=true;preparationNotice('Your preparation was received. Checking its saved result…',false);render();document.dispatchEvent(new CustomEvent('mc:desk-refresh'));
      clearTimeout(preparationTimer);preparationTimer=setTimeout(function(){if(expected!==preparationGeneration||!preparation||!preparation.awaiting)return;preparation.awaiting=false;preparation.uncertain=true;preparationNotice('We could not confirm the saved result. Check saved setup; your choices are kept.',true);render();},15000);
    }catch(error){if(expected!==preparationGeneration||!preparation)return;preparation.pending=false;preparation.uncertain=error.status!==422;if(error.status===422)preparation.attempt=null;preparationNotice(error.status===422?'Check your website address. Your choices are kept.':error.status===409?'Your saved setup changed. Check saved setup before continuing.':'The response was interrupted. Your setup may be saved. Check saved setup before continuing.',true);render();if(error.status===422&&$('preparationWebsite')){$('preparationEditChoices').open=true;$('preparationWebsiteError').textContent='Enter a valid public HTTPS website address.';$('preparationWebsite').setAttribute('aria-invalid','true');$('preparationWebsite').focus();}}
    finally{clearTimeout(timeout);}
  }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function current() { return data && document.body.dataset.workspaceState === 'ready' && !$('portalContent').hidden; }
  function rows() {
    var journey = data && data.setup && data.setup.connectionJourney;
    return journey ? (journey.channels || []).concat(journey.leadSources || []).filter(function (row) { return labels[row.id]; }) : [];
  }
  function action(row) { return row.nextAction || row.action || { kind: 'wait', label: 'Checking setup status' }; }
  function needsServiceInformation(id) {
    if(id==='calendar')return false; // Google selects the actual account during permission review.
    var row=rows().find(function(item){return item.id===id;});
    var intake=data.serviceIntake&&data.serviceIntake[id];
    return !!intake&&!!window.MCServiceIntake&&intake.canSave!==false&&!['cancelled','archived','paused'].includes(data.client.status)&&(['voice','sms'].includes(id)?!intake.complete||id==='voice'&&intake.canApply:id==='web'?!intake.preferences?.builder||!intake.preferences?.installationBy||intake.canApply:!intake.preferences?.accountEmail);
  }
  function serviceStatus(row) {
    if(['closed','cancelled','archived'].includes(row.status))return 'Disconnected';
    if(row.status==='paused')return 'Paused';
    if(row.status==='not_selected'||!row.requested&&!row.retained)return 'Not selected';
    if(row.verification?.working===true)return 'Delivery verified';
    if(needsServiceInformation(row.id))return 'Your details needed';
    if(row.activation?.blockedBy==='machines_and_cloud')return 'Needs our attention';
    if(row.verification?.state==='needs_attention')return 'Check needs attention';
    if(needsServiceInformation(row.id))return 'Your next step';
    if(row.responsibility==='carrier'||row.status==='waiting_carrier')return 'Carrier review';
    if(row.status==='checking'||row.status==='uncertain'||row.status==='checking_status')return 'Checking saved result';
    if(row.status==='needs_attention')return 'Needs our attention';
    if(row.status==='partner_required')return 'Partner access needed';
    if(row.id==='calendar'&&data.connections?.calendar?.connected)return 'Google access saved';
    if(row.responsibility==='platform'||['working','waiting_platform'].includes(row.status))return 'Platform check';
    return action(row).kind==='wait'?'Check saved status':'Your next step';
  }
  function checkedTime(value) { var date=new Date(value);return Number.isFinite(date.getTime())?date.toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):''; }
  function renderSetupProgress(row) {
    var progress=row.setupProgress;if(!progress||!row.requested&&!row.retained)return '';
    var intake=data.serviceIntake&&data.serviceIntake[row.id],saved=intake?.complete===true;
    if(!progress.requestSaved)return '<p class="connection-setup-progress" id="connectionSetupProgress" role="status">'+esc((saved?(row.id==='sms'?'Your registration details are saved. ':'Your call-routing details are saved. '):'')+'No connection setup has started. '+(row.id==='sms'?'No carrier registration has been requested. ':''))+'</p>';
    var states={queued:'Setup queued',awaiting_number:'Waiting for your dedicated number',connecting:'Preparing your connection',waiting_platform:'Waiting for Machines & Cloud',uncertain:'Checking the saved result',needs_review:'Review needed',needs_action:'Your action needed',awaiting_approval:'Carrier review in progress',awaiting_test:'Texting verification needed',ready:'Connection prepared',active:'Connection checks complete',cancelled:'Disconnected',cancellation_pending:'Confirming cancellation',cancel_pending:'Confirming cancellation',cleanup_pending:'Confirming cleanup',cleanup_uncertain:'Checking cleanup',paused:'Setup paused'};
    return '<div class="connection-setup-progress" id="connectionSetupProgress" role="status"><strong>'+esc(states[progress.state]||'Setup request saved')+'</strong><p>Setup reference: <code>'+esc(progress.operationId)+'</code></p>'+(progress.updatedAt?'<p>Updated '+esc(checkedTime(progress.updatedAt))+(progress.nextCheckAt?' · Next check '+esc(checkedTime(progress.nextCheckAt)):'')+'</p>':'')+'<p>'+esc(row.responsibility==='customer'?'Next: '+(action(row).label||'Complete the connection check')+'.':row.responsibility==='carrier'?'Next: carrier review. We track the result automatically.':row.verification?.working?'Delivery evidence is saved.':'Next: Machines & Cloud. We continue your approved setup and reconcile its saved result automatically.')+'</p></div>';
  }
  function renderVerification(row) {
    var facts=row.verification;if(!facts)return '';
    var notice=connectionNotices[row.id],pending=connectionCheck&&connectionCheck.service===row.id;
    return '<section class="connection-verification" data-verification-state="'+esc(facts.state)+'" aria-labelledby="connectionVerificationTitle"><div class="connection-verification-heading"><div><h4 id="connectionVerificationTitle">Setup and delivery checks</h4><span class="connection-verification-result">'+esc(facts.label)+'</span><p>'+esc(facts.summary)+'</p></div><button type="button" id="setupGuideCheckConnection" class="btn-pill btn-pill-dark btn-sm"'+(connectionCheck?' disabled':'')+'>'+(pending?'Checking saved status…':'Check saved status')+'</button></div><ul class="connection-verification-checks">'+facts.checks.map(function(item){var label=item.state==='passed'?'Passed':item.state==='needs_attention'?'Needs attention':'Not confirmed';return '<li data-check-state="'+esc(item.state)+'"><span class="connection-check-indicator" aria-hidden="true"><svg viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="7.5" stroke="currentColor" stroke-width="1.5"/>'+(item.state==='passed'?'<path d="m6.5 10 2.3 2.4 4.7-5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>':item.state==='needs_attention'?'<path d="M10 6v4.5m0 3v.1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>':'<path d="M7 10h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>')+'</svg></span><span>'+esc(item.label)+'</span><small>'+label+'</small></li>';}).join('')+'</ul>'+(facts.evidenceAt?'<p class="connection-verification-evidence">Latest delivery evidence: <time datetime="'+esc(facts.evidenceAt)+'">'+esc(checkedTime(facts.evidenceAt))+'</time></p>':'')+(facts.providerCheckedAt?'<p class="connection-verification-evidence">Provider settings last confirmed: <time datetime="'+esc(facts.providerCheckedAt)+'">'+esc(checkedTime(facts.providerCheckedAt))+'</time></p>':'')+'<p id="connectionVerificationNotice" class="connection-verification-notice" role="status" aria-live="polite"'+(notice&&notice.error?' data-error="true"':'')+'>'+esc(pending?'Reading current setup and delivery records…':notice?notice.text:'Check the saved setup and delivery results here.')+'</p></section>';
  }
  async function checkConnection(service,quiet) {
    if(!current()||connectionCheck)return;
    var session=preparationSession(),id=typeof service==='string'?service:selected,slug=data.client.slug;if(!session)return;
    var generation=connectionCheckGeneration,revision=data.configurationRevision,edit=data.editRevision,controller=new AbortController();connectionCheck={service:id,controller:controller};render();
    var timeout=setTimeout(function(){controller.abort();},15000);
    try {
      var response=await fetch(apiBase+'/api/client?c='+encodeURIComponent(slug)+'&setup_assistance=1',{headers:{Authorization:'Bearer '+session},cache:'no-store',signal:controller.signal});
      if(generation!==connectionCheckGeneration||!current()||session!==preparationSession())return;
      if(response.status===401||response.status===403){document.dispatchEvent(new CustomEvent('mc:session-expired'));return;}
      var result=await response.json();if(!response.ok||!result.ok)throw new Error('unavailable');
      if(generation!==connectionCheckGeneration||!current()||data.client.slug!==slug||session!==preparationSession())return;
      if(result.configurationRevision!==revision||result.editRevision!==edit||data.configurationRevision!==revision||data.editRevision!==edit){document.dispatchEvent(new CustomEvent('mc:desk-refresh'));throw new Error('changed');}
      var journey=result.setup?.connectionJourney,checked=journey&&(journey.channels||[]).concat(journey.leadSources||[]).find(function(item){return item.id===id;});if(!checked?.verification)throw new Error('unavailable');
      if(!result.connections||!result.websiteInstallation||!result.setup.channels)throw new Error('unavailable');
      // Replace server-derived connection facts only. Business fields, private
      // intake drafts and pending owner edits stay under their existing owners.
      data.connections=result.connections;data.websiteInstallation=result.websiteInstallation;data.setup.channels=result.setup.channels;if(result.setup.reviewRequirements)data.setup.reviewRequirements=result.setup.reviewRequirements;data.setup.connectionJourney=journey;connectionNotices[id]={confirmed:true,working:checked.verification.working===true,error:false,text:'Saved status checked '+checkedTime(checked.verification.checkedAt)+'. '+(checked.verification.working?'Delivery was verified at the time shown above.':checked.verification.summary)};
      document.dispatchEvent(new CustomEvent('mc:desk-refresh'));
    } catch(error) {if(generation===connectionCheckGeneration&&current())connectionNotices[id]={error:true,text:error.message==='changed'?'Your setup changed while it was checked. Refreshing the latest details; check again before continuing.':'The connection check could not finish. Your setup is kept. Check again to confirm its current status.'};}
    finally {clearTimeout(timeout);if(generation===connectionCheckGeneration){connectionCheck=null;if(current()){render();assistTask();if(selected===id&&!quiet)$('setupGuideCheckConnection')?.focus({preventScroll:true});}}}
  }
  function actorLabel(actor){return actor==='customer'?'You':actor==='platform'?'Machines & Cloud':actor==='provider'||actor==='carrier'?'Provider':actor==='complete'?'Confirmed':'Machines & Cloud';}
  function stepStatus(step,isNext){return (step.state==='complete'?(step.completionSource==='owner_report'?'Reported by you; delivery unverified':'Complete'):isNext?'Current required step':'Pending')+' · '+actorLabel(step.actor);}
  function renderManualTask(row){var task=row.guide?.manualTask;if(!task||!window.MCManualGuide||row.verification?.working)return '';var scene=row.id==='voice'?'phone':row.id==='angi'?'angi':row.id;return window.MCManualGuide.render(Object.assign({},task,{scene:scene,businessNumber:task.businessNumber||data.serviceIntake?.voice?.routing?.businessNumber,destination:task.destination||data.connections?.voice?.number}),row.id,'connection-'+row.id);}
  function renderHomeProgress(){var host=$('homeConnectionProgress'),body=$('homeConnectionProgressRows');if(!host||!body)return;var journey=data?.setup?.connectionJourney,items=journey?(journey.channels||[]).concat(journey.leadSources||[],journey.discovery||[]).filter(function(row){return row.requested||row.retained;}):[];host.hidden=!items.length;if(!items.length){body.replaceChildren();return;}if(!host.dataset.initialized){host.open=!items.some(function(row){return row.verification?.working;});host.dataset.initialized='true';}var confirmed=items.filter(function(row){return row.guide?.success?.verified===true||row.verification?.working===true;}).length;$('homeConnectionProgressSummary').textContent=confirmed+' of '+items.length+' selected services have verified delivery';body.innerHTML=items.map(function(row){var steps=row.guide?.steps||[],done=steps.filter(function(s){return s.state==='complete';}).length,next=steps.find(function(s){return s.state!=='complete';}),evidence=row.guide?.success?.evidenceAt||row.verification?.evidenceAt||steps.filter(function(s){return s.evidenceAt;}).map(function(s){return s.evidenceAt;}).sort().pop(),checked=row.guide?.success?.checkedAt||row.verification?.checkedAt;return '<article class="home-connection-row" data-home-service="'+esc(row.id)+'"><div><h4 class="brand-lockup">'+brandMark(row.id)+'<span>'+esc(row.label||labels[row.id])+'</span></h4><p>'+esc(row.guide?.success?.verified||row.verification?.working?'Delivery verified':next?next.label:row.nextStep||row.detail)+'</p><small>'+done+' of '+steps.length+' required steps complete'+(next?' · Next: '+esc(next.actor==='provider'||next.actor==='carrier'?row.id==='sms'?'Carrier':row.label||labels[row.id]:actorLabel(next.actor)):'')+'</small>'+(row.requestSent?'<p class="home-connection-report">Reported sent by you '+esc(checkedTime(row.requestSent.reportedAt))+'. Delivery remains unverified.</p>':'')+'<p class="home-connection-evidence">'+esc(evidence?'Latest saved evidence: '+checkedTime(evidence):'Delivery evidence not recorded')+(checked?' · Checked '+esc(checkedTime(checked)):'')+'</p></div><button type="button" class="connection-guide-link" data-home-connection="'+esc(row.id)+'">'+esc(row.guide?.success?.verified||row.verification?.working?'View connection':'View next step')+'</button></article>';}).join('');}
  $('homeConnectionProgressRows')?.addEventListener('click',function(event){var button=event.target.closest('[data-home-connection]');if(!button||!current())return;var id=button.dataset.homeConnection;document.dispatchEvent(new CustomEvent('mc:desk-route',{detail:{tab:'setup'}}));if(labels[id])document.dispatchEvent(new CustomEvent('mc:service-guide',{detail:{service:id}}));else document.dispatchEvent(new CustomEvent('mc:lead-source-open',{detail:{source:id}}));});
  document.addEventListener('mc:manual-return',function(event){if(!current()||event.detail?.slug!==data.client.slug)return;if(['web','voice','sms','calendar'].includes(event.detail.service))checkConnection(event.detail.service,true);});
  function chooseDefault(items) {
    var next = data.setup.connectionJourney.nextAction;
    var row = next && next.kind !== 'wait' && items.find(function (item) { var own=action(item);return (item.requested||item.retained)&&own.kind===next.kind&&own.target===next.target&&own.label===next.label; });
    return row || items.find(function (item) { return (item.requested || item.retained) && ['route', 'connection', 'lead'].includes(action(item).kind); }) || items.find(function (item) { return item.requested || item.retained; }) || items[0];
  }
  function currentStep(row,steps){
    var canonical=steps.findIndex(function(step){return step.state==='current'||step.state==='waiting';});if(canonical>=0)return canonical;
    var next=action(row),id=next.kind==='route'&&next.target==='know'?'business':next.kind==='route'&&next.target==='test'?'practice':null;
    if(row.id==='web'&&next.kind==='route'&&next.target==='setup'&&data.websiteInstallation){id=data.websiteInstallation.observation?.state==='found'?'check':'install';}
    var index=id?steps.findIndex(function(step){return step.id===id;}):-1;
    if(index<0)index=steps.findIndex(function(step){return step.state==='current'||step.state==='waiting';});
    return index<0?Math.max(0,steps.length-1):index;
  }
  function visualKind(row,step){return step.id==='business'&&step.focus==='business'?'profile':step.id==='practice'?'practice':step.state==='complete'?'ready':['background','provider','first_lead','first_request'].includes(step.id)?'waiting':row.id==='web'?'website':row.id==='voice'?'phone':row.id;}
  function taskOutcome(row,step,isNext){
    if(!isNext)return step.state==='complete'?'This step is already saved. Your existing work stays in place.':'You’re previewing a later step. Return to your next required step to continue.';
    if(step.id==='business'&&step.focus==='business')return 'We’ll take you to your business details. Check or edit them, then confirm the saved answers.';
    if(step.id==='practice')return 'Try a customer question in Test answers. Your saved result updates this guide.';
    if(action(row).kind==='wait')return 'Your saved progress stays here. We’ll show the next action when this check is ready.';
    if(row.id==='web'&&step.id==='first_request')return action(row).target==='availability'?'Open Schedule to review the saved visit and its customer details.':'Open Inbox to review customer requests, read their conversations and follow up.';
    if(row.id==='web')return 'The installation card shows the code and your next check. We’ll highlight it for you.';
    if(row.id==='calendar'&&step.id==='delivery')return 'Open Schedule to review a saved visit and check its Google Calendar delivery result.';
    if(row.id==='calendar')return 'Review the connection screen and choose the account you want to use.';
    if(row.id==='angi')return 'Your Angi connection opens here. Confirm your details, then follow the provider handoff.';
    if(row.id==='thumbtack')return 'The connection screen shows the account or business choice needed next.';
    return 'The connection screen shows the details to review. You approve any permissions and costs there.';
  }
  function focusStage(){var title=$('setupGuideStageTitle');if(title){var visitReturn=$('visitSetupReturn');((visitReturn&&!visitReturn.hidden?visitReturn:null)||host.querySelector('.guide-task-meta')||title).scrollIntoView({block:'start',behavior:motion.matches?'instant':'smooth'});title.focus({preventScroll:true});}}
  function beginTask(row){var steps=row.guide?.steps||[],step=steps[currentStep(row,steps)];guideManual=false;guideTask={service:row.id,step:step&&step.id,label:step&&step.label||labels[row.id],action:action(row),slug:data.client.slug,session:preparationSession()};}
  function clearTarget(){document.querySelectorAll('[data-guide-inline-context]').forEach(function(node){node.remove();});if(guideTarget&&guideTarget.isConnected)guideTarget.classList.remove('setup-guide-target','guide-step-complete');guideTarget=null;}
  function endTask(){if(sharedReview)resetSharedReview();if($('reviewRules'))$('reviewRules').hidden=false;guideTask=null;clearTarget();coach.hidden=true;coach.replaceChildren();delete coach.dataset.contentKey;delete coach.dataset.guideService;delete coach.dataset.guideStep;delete coach.dataset.guideComplete;document.querySelectorAll('[data-setup-guide-context]').forEach(function(node){node.remove();});}
  function continuation(row){
    var steps=row.guide?.steps||[],now=steps[currentStep(row,steps)],prior=steps.find(function(item){return item.id===guideTask.step;}),next=action(row);
    var changed=!!now&&(now.id!==guideTask.step||next.kind!==guideTask.action.kind||next.target!==guideTask.action.target),complete=!!prior&&prior.state==='complete';
    var review=$('reviewRules'),required=guideTask.step==='business'&&review?.dataset.reviewBlocked==='true',busy=guideTask.step==='business'&&review&&(review.disabled||required)||guideTask.step==='practice'&&$('chatForm')?.getAttribute('aria-busy')==='true';
    var waiting=next.kind==='wait'||now&&now.state==='waiting'&&now.actor!=='customer';
    return {now:now,next:next,changed:changed,complete:complete,busy:!!busy,required:required,waiting:!!waiting,canContinue:changed&&!busy&&!['paused','cancelled','archived'].includes(data.client.status)};
  }
  function resetSharedReview(){
    var edits=$('connectorBusinessEdits');if(edits){var form=$('cfg');if(form)edits.before(form);edits.remove();}
    $('connectorBusinessSummary')?.remove();$('connectorBusinessContinue')?.remove();$('connectorBusinessContext')?.remove();$('connectorBusinessNavigation')?.remove();$('reviewCard')?.classList.remove('connector-business-review');sharedReview=null;
  }
  function sharedBusinessPage(row,progress){
    var card=$('reviewCard'),form=$('cfg');if(!card||!form)return false;
    coach.hidden=true;clearTarget();document.body.dataset.connectorFlow='step';card.hidden=false;card.classList.add('connector-business-review');
    var navigation=$('connectorBusinessNavigation');if(!navigation){navigation=document.createElement('div');navigation.id='connectorBusinessNavigation';navigation.className='connector-shared-navigation';navigation.innerHTML='<button type="button" class="connection-guide-link" id="connectorSharedBack">← Back to setup</button><button type="button" class="connection-guide-link" id="connectorSharedExit">Exit setup</button>';card.prepend(navigation);}
    var context=$('connectorBusinessContext');if(!context){context=document.createElement('p');context.id='connectorBusinessContext';context.className='connector-shared-context';card.prepend(context);}var position=pageProgress(row.id,'business');context.textContent=labels[row.id]+' · Step '+position.number+' of '+position.total;
    var summary=$('connectorBusinessSummary');if(!summary){summary=document.createElement('dl');summary.id='connectorBusinessSummary';summary.className='connector-business-summary';$('reviewNeeds').before(summary);}
    var c=data.client,b=c.business||{},services=(Array.isArray(c.services)?c.services:[]).map(function(item){return typeof item==='string'?item:item.name||item.label||'';}).filter(Boolean),fees=(Array.isArray(c.fees)?c.fees:Object.entries(c.fees||{}).map(function(item){return item[0]+': '+(typeof item[1]==='object'?[item[1]?.amount,item[1]?.price,item[1]?.note].filter(Boolean).join(' · '):item[1]);})).map(function(item){return typeof item==='string'?item:[item.label||item.service||item.name,item.price||item.amount,item.note].filter(Boolean).join(' · ');}).filter(Boolean),handoff=c.rules?.handoff||c.rules?.alwaysHandOff||c.rules?.handoffTriggers||[];
    var weekly=c.rules?.hours,hours=weekly&&typeof weekly==='object'&&Object.keys(weekly).length?['mon','tue','wed','thu','fri','sat','sun'].map(function(day,index){var value=weekly[day];return ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][index]+': '+(value?.open&&value?.close?value.open+'–'+value.close:'Closed');}).join('\n'):b.hours;
    var entries=[['Business',b.name],['Services',services.join(', ')],['Service area',Array.isArray(b.serviceArea)?b.serviceArea.join(', '):String(b.serviceArea||'')],['Opening hours',hours],['Prices customers can hear',fees.join('; ')||'No prices added'],['Contact cell',c.owner?.phone],['Hand off to your team',Array.isArray(handoff)?handoff.join('; '):String(handoff||'Use the saved handoff and safety instructions')]];
    var markup=entries.map(function(entry){return '<div><dt>'+esc(entry[0])+'</dt><dd>'+esc(entry[1]||'Not provided')+'</dd></div>';}).join('');if(summary.innerHTML!==markup)summary.innerHTML=markup;
    var edits=$('connectorBusinessEdits');if(!edits){edits=document.createElement('details');edits.id='connectorBusinessEdits';edits.className='connector-business-edits';edits.innerHTML='<summary>Edit saved answers</summary>';card.after(edits);edits.appendChild(form);}
    var missing=Object.keys(data.setup?.reviewRequirements?.fieldErrors||{}),state=form.dataset.saveState;if(missing.length||['dirty','saving','conflict','error'].includes(state))edits.open=true;
    var next=$('connectorBusinessContinue');if(progress.canContinue){if(!next){next=document.createElement('button');next.type='button';next.id='connectorBusinessContinue';next.className='btn-pill btn-pill-blue btn-sm';card.appendChild(next);}next.textContent='Continue '+labels[row.id]+' setup';$('reviewRules').hidden=true;}else{$('reviewRules').hidden=false;if(next)next.remove();}
    var signature=missing.slice().sort().join('|');if(signature&&sharedReview?.missing!==signature){var task=guideTask;requestAnimationFrame(function(){if(guideTask===task&&current()&&document.body.dataset.activePage==='know')$('reviewNeeds')?.querySelector('[data-review-field]')?.click();});}
    sharedReview={missing:signature};return true;
  }
  function assistTask(){
    if(!guideTask||!current()){if(sharedReview)resetSharedReview();if(!current())endTask();return;}
    if(document.body.dataset.activePage==='setup'&&!document.querySelector('dialog[open]')){endTask();return;}
    if(guideTask.slug!==data.client.slug||guideTask.session!==preparationSession()||['paused','cancelled','archived'].includes(data.client.status)){endTask();return;}
    var row=rows().find(function(item){return item.id===guideTask.service;});if(!row){endTask();return;}if(row.verification?.working&&document.body.dataset.activePage==='setup'){endTask();return;}
    var steps=row.guide?.steps||[];if(steps.length&&steps.every(function(step){return step.state==='complete';})&&document.body.dataset.activePage==='setup'){endTask();return;}
    var progress=continuation(row);if(['know','test','availability'].includes(document.body.dataset.activePage))document.body.dataset.connectorFlow='step';if(guideTask.step==='business'&&document.body.dataset.activePage==='know'&&!document.querySelector('dialog[open]')){sharedBusinessPage(row,progress);return;}if(sharedReview)resetSharedReview();var dialog=document.querySelector('dialog[open]:not(#guideDialog)'),target=null,scrollTarget=false;
    if(dialog){
      coach.hidden=true;clearTarget();
      if(dialog.id==='connectionDialog'&&!dialog.querySelector('[data-setup-guide-context]')){var note=document.createElement('p');note.className='guide-dialog-context';note.dataset.setupGuideContext='true';note.textContent=labels[row.id]+' setup · '+guideTask.label;dialog.prepend(note);}
      return;
    }
    document.querySelectorAll('[data-setup-guide-context]').forEach(function(node){node.remove();});
    var tab=document.body.dataset.activePage;
    if(tab==='today'){coach.hidden=true;clearTarget();return;}
    if(tab==='setup')target=guideTask.action.kind==='route'&&guideTask.action.target==='setup'?$('websiteInstallStep'):null;
    else if(tab==='know')target=$('reviewCard');else if(tab==='test')target=$('chatForm');else if(tab==='availability')target=$('scheduleVisits');else if(tab==='leads')target=$('requestTourHeading');
    if(target&&target.getClientRects().length){
      if(guideTarget!==target){clearTarget();guideTarget=target;target.classList.add('setup-guide-target');var parent=target.parentElement;while(parent){if(parent.tagName==='DETAILS')parent.open=true;parent=parent.parentElement;}scrollTarget=true;}
      target.classList.toggle('guide-step-complete',progress.complete&&progress.changed&&!progress.busy);
      // One service context stays beside the work. Do not repeat return buttons inside it.
      if(coach.nextElementSibling!==target)target.before(coach);
    } else {
      clearTarget();var pageHeading=document.querySelector('#portalContent .desk-page-heading');if(pageHeading&&pageHeading.nextElementSibling!==coach)pageHeading.after(coach);
    }
    var title=progress.complete&&progress.changed?({business:'Business details confirmed',practice:'Your answers are checked',permission:'Account access saved',delivery:'Delivery confirmed',prepare:labels[row.id]+' account details saved',request:labels[row.id]+' request reported sent'}[guideTask.step]||'Step saved'):progress.changed?'Your next setup step':guideTask.label;
    var detail=progress.required?(row.nextStep||'Complete the required business details below before continuing.'):progress.busy?'Save your changes and finish the current check before continuing.':progress.changed?'Next: '+(progress.now?.label||progress.next.label||labels[row.id]+' setup')+'. '+(progress.now?.detail||row.nextStep||'Continue with your saved setup.'):(row.nextStep||progress.now?.detail||'Complete the highlighted step below.');
    if(!progress.changed&&target&&!progress.busy)detail=guideTask.step==='business'?'Check the required business details below, then confirm the saved answers. '+(row.nextStep||''):guideTask.step==='practice'?'Ask a customer question below. When its saved check is confirmed, your next setup step appears here.':detail;
    var button=progress.changed?'<button type="button" class="btn-pill btn-pill-blue btn-sm" id="guideReturn"'+(progress.canContinue?'':' disabled')+'>'+(progress.waiting?'View '+esc(labels[row.id])+' progress':'Continue '+esc(labels[row.id])+' setup')+'</button>':'';
    var key=[guideTask.service,title,detail,tab,progress.canContinue,progress.waiting].join('|'),focused=coach.contains(document.activeElement)?document.activeElement.id:null;
    coach.hidden=false;coach.dataset.guideService=row.id;coach.dataset.guideStep=guideTask.step;coach.dataset.guideComplete=String(progress.complete&&progress.changed);
    if(coach.dataset.contentKey!==key){coach.dataset.contentKey=key;coach.innerHTML='<div><span>'+esc(labels[row.id])+' setup</span><strong id="guideCoachTitle">'+esc(title)+'</strong><p id="guideCoachDetail">'+esc(detail)+'</p></div><div class="guide-coach-actions">'+button+'<button type="button" class="guide-coach-dismiss" id="guideBack">Back to setup</button><button type="button" class="guide-coach-dismiss" id="guideDismiss">Exit setup</button></div>';if(focused&&$(focused))$(focused).focus({preventScroll:true});}
    if(scrollTarget){var capturedTask=guideTask,capturedTarget=target;requestAnimationFrame(function(){requestAnimationFrame(function(){if(current()&&guideTask===capturedTask&&guideTarget===capturedTarget&&capturedTarget.isConnected&&!document.querySelector('dialog[open]'))coach.scrollIntoView({block:'start',behavior:motion.matches?'instant':'smooth'});});});}
  }
  function returnToGuide(){if(!guideTask||!current())return;var id=guideTask.service;endTask();selected=id;manualSelection=true;guideManual=false;var row=rows().find(function(item){return item.id===id;});goToCurrent(row,true);document.dispatchEvent(new CustomEvent('mc:desk-route',{detail:{tab:'setup',connectionHash:location.hash}}));coach.hidden=true;document.dispatchEvent(new CustomEvent('mc:desk-refresh'));}
  function executeAction(row){
    if(!row||['cancelled','archived','paused'].includes(data.client.status))return;var next=action(row);
    selected=row.id;manualSelection=true;guideManual=false;
    if(row.verification?.working){goToCurrent(row);document.dispatchEvent(new CustomEvent('mc:desk-route',{detail:{tab:'setup',connectionHash:location.hash}}));return;}
    if(next.kind==='wait'){returnToGuide();return;}
    if(row.id==='web'&&next.kind==='route'&&next.target==='setup'){document.dispatchEvent(new CustomEvent('mc:desk-route',{detail:{tab:'setup',connectionHash:location.hash}}));render();$('websiteInstallPrimary')?.focus({preventScroll:true});return;}
    if(next.kind==='connection'&&['show_phone_steps','show_text_steps'].includes(next.target)){render();$('setupGuideStageTitle')?.focus({preventScroll:true});return;}
    if(next.kind==='route'&&['know','test','setup','leads','availability'].includes(next.target)){beginTask(row);document.dispatchEvent(new CustomEvent('mc:desk-route',{detail:{tab:next.target,connectionHash:'#setup/'+row.id+'/'+(guideTask.step||'connection')}}));assistTask();return;}
    if(next.kind==='lead'&&['thumbtack','angi'].includes(next.target)){beginTask(row);document.dispatchEvent(new CustomEvent('mc:lead-source-open',{detail:{source:next.target}}));assistTask();return;}
    var card=$('connection-guide-'+row.id),existing=card&&Array.from(card.querySelectorAll('button')).find(function(button){return !button.disabled&&(next.kind==='route'?button.dataset.journeyRoute===next.target:next.kind==='connection'&&button.dataset.connection===next.target);});
    if(!existing&&next.kind==='connection')existing=Array.from(document.querySelectorAll('#connectionJourney [data-connection]')).find(function(button){return button.dataset.connection===next.target&&!button.disabled;});
    if(existing){beginTask(row);existing.click();assistTask();return;}
    if(next.kind==='route'&&['know','test','setup','leads','availability'].includes(next.target)){beginTask(row);document.dispatchEvent(new CustomEvent('mc:desk-route',{detail:{tab:next.target,connectionHash:'#setup/'+row.id+'/'+(guideTask.step||'connection')}}));assistTask();return;}
    // A missing action must return to the current status, not strand the customer.
    returnToGuide();
  }
  document.addEventListener('click',function(event){if(event.target.closest('#connectorSharedBack,#connectorSharedExit')&&guideTask&&current()){var id=guideTask.service,exit=!!event.target.closest('#connectorSharedExit');endTask();pageRoute(exit?null:id,exit?null:'intro');document.dispatchEvent(new CustomEvent('mc:desk-route',{detail:{tab:'setup',connectionHash:location.hash}}));render();focusStage();return;}if(!event.target.closest('#connectorBusinessContinue')||!guideTask||!current())return;var row=rows().find(function(item){return item.id===guideTask.service;});if(row&&continuation(row).canContinue)executeAction(row);});
  coach.addEventListener('click',function(event){
    if(event.target.closest('#guideDismiss')||event.target.closest('#guideBack')){var id=guideTask?.service,exit=!!event.target.closest('#guideDismiss');endTask();pageRoute(exit?null:id,exit?null:'intro');document.dispatchEvent(new CustomEvent('mc:desk-route',{detail:{tab:'setup',connectionHash:location.hash}}));render();focusStage();return;}
    if(event.target.closest('#guideReturn')&&guideTask&&current()){var row=rows().find(function(item){return item.id===guideTask.service;});if(!row||!continuation(row).canContinue)return;if(continuation(row).waiting)returnToGuide();else executeAction(row);}
  });
  document.addEventListener('mc:guide-state-change',assistTask);
  document.addEventListener('mc:guide-step-complete',function(event){
    if(!current()||!guideTask||event.detail?.slug!==data.client.slug||event.detail?.revision!==data.configurationRevision||event.detail?.step!==guideTask.step)return;
    assistTask();var row=rows().find(function(item){return item.id===guideTask.service;}),button=$('guideReturn');if(row&&continuation(row).canContinue&&button&&!button.disabled){button.scrollIntoView({block:'nearest',behavior:motion.matches?'instant':'smooth'});button.focus({preventScroll:true});}
  });
  document.addEventListener('mc:service-guide',function(event){if(!current()||!labels[event.detail?.service])return;selected=event.detail.service;manualSelection=true;guideManual=false;endTask();pageRoute(selected,'intro');document.dispatchEvent(new CustomEvent('mc:desk-route',{detail:{tab:'setup',connectionHash:location.hash}}));render();focusStage();});
  var contextObserver=new MutationObserver(function(){assistTask();});contextObserver.observe(document.body,{attributes:true,attributeFilter:['data-active-page','data-workspace-state']});document.querySelectorAll('dialog').forEach(function(dialog){contextObserver.observe(dialog,{attributes:true,attributeFilter:['open'],childList:true});});
  document.addEventListener('click',function(event){if(event.target.closest('.tabs [data-t=setup]')&&current()){endTask();pageRoute(null);render();}});
  if($('openGuide'))$('openGuide').addEventListener('click',endTask);
  motion.addEventListener('change',function(){if(current())render();});
  var autoCheckKey=null, autoLeadKey=null, websiteTaskActive=false, websiteInstructionsFinished=false;
  var websiteTaskCard=$('websiteInstallCard'),websiteTaskHome=websiteTaskCard?.parentElement;
  function returnWebsiteTask(){if(websiteTaskActive&&websiteTaskCard&&websiteTaskHome){websiteTaskHome.appendChild(websiteTaskCard);websiteTaskActive=false;}}
  function routeParts() { var parts=location.hash.slice(1).split('/');return parts[0]==='setup'&&labels[parts[1]]?{service:parts[1],screen:/^[a-z0-9_-]+$/.test(parts[2]||'')?parts[2]:'intro'}:null; }
  function pageRoute(id,screen,replace) {
    var hash=id?'#setup/'+id+'/'+screen:'#setup';
    if(location.hash!==hash){if(screen==='connection-check'){delete connectionNotices[id];autoCheckKey=null;}history[replace?'replaceState':'pushState'](Object.assign({},history.state,{mcConnectorPage:{slug:data?.client?.slug,service:id||null,screen:screen||'overview'}}),'',location.pathname+location.search+hash);}
    selected=id||null;pageScreen=id?screen:'overview';manualSelection=!!id;
  }
  function pageProgress(id,screen) {
    var row=rows().find(function(item){return item.id===id;}),steps=(row?.guide?.steps||[]).filter(function(step){return id!=='web'||step.id!=='first_request';}),installCount=data?.serviceIntake?.web?.preferences?.builder==='wordpress'?5:4,extra=id==='sms'?2:id==='web'?installCount:0,total=steps.length+extra+1,index=steps.findIndex(function(step){return step.id===screen;});
    if(/^details-\d(?:-\d)?$/.test(screen||'')){var detail=Number(screen.split('-')[1]);index=id==='sms'?Math.min(detail,2):id==='web'&&detail>0?Math.max(0,steps.findIndex(function(step){return step.id==='install';}))+1+Number(screen.split('-')[2]||0):0;}
    else if(screen==='connection-check'||screen==='complete')index=total-1;else if(screen==='installation-check')index=Math.max(0,steps.findIndex(function(step){return step.id==='check';}))+extra;
    else {if(index<0)index=currentStep(row||{},steps);if(id==='sms'&&index>0)index+=extra;if(id==='web')index+=index>=Math.max(0,steps.findIndex(function(step){return step.id==='check';}))?extra:1;}
    return {index:index,total:total,number:Math.min(index+1,total)};
  }
  window.MCConnectorPages={progress:pageProgress};
  function pageShell(row,step,index,total,body,footer) {
    var label=row.label||labels[row.id],position=pageProgress(row.id,pageScreen);index=position.index;total=position.total;
    return '<section class="connector-page setup-guide-current direct-connection-task" data-connector="'+row.id+'" data-connector-step="'+esc(pageScreen)+'" aria-labelledby="setupGuideStageTitle">'+
      '<div class="connector-page-top"><button type="button" id="connectorAllServices" class="connection-guide-link">← All connections</button><span class="brand-lockup">'+brandMark(row.id)+'<span>'+esc(label)+'</span></span></div>'+
      '<div class="connector-page-progress"><span id="connectorStepCount">'+(pageScreen==='complete'?'Connection verified':pageScreen==='intro'?'Let’s connect '+esc(label):'Step '+Math.min(index+1,total)+' of '+total)+'</span><div class="connector-progress-track" role="progressbar" aria-label="'+esc(label)+' setup" aria-valuemin="0" aria-valuemax="'+total+'" aria-valuenow="'+(pageScreen==='complete'?total:Math.min(index,total))+'"><span style="width:'+((pageScreen==='complete'?total:Math.min(index,total))/total*100)+'%"></span></div></div>'+
      '<div class="connector-page-body">'+body+'</div>'+ (footer?'<footer class="connector-page-footer">'+footer+'</footer>':'')+'</section>';
  }
  function renderOverview(items) {
    selected=null;pageScreen='overview';host.dataset.connectorView='overview';var retainedControls=!!(data.connections?.voice?.operation||data.connections?.messaging?.operation||data.connections?.calendar?.connected||data.connections?.calendar?.reconnectRequired||data.serviceOnboarding?.operation),management=$('connectionServiceDetails');if(management){management.hidden=!retainedControls;if(management.querySelector('summary'))management.querySelector('summary').textContent='Connection settings';}
    host.innerHTML='<div class="setup-guide-heading"><h3 id="setupGuideTitle" tabindex="-1">Your connections</h3><p class="muted">Choose a service. We’ll walk you through one step at a time.</p></div><nav class="connector-service-list" aria-label="Choose a connection">'+items.map(function(row){return '<button type="button" data-guide-service="'+row.id+'" class="connector-service-choice"><span class="brand-lockup">'+brandMark(row.id)+'<span>'+esc(labels[row.id])+'</span></span><span class="connector-choice-status">'+esc(serviceStatus(row))+'</span><span aria-hidden="true">→</span></button>';}).join('')+'</nav>';
  }
  function render() {
    if(!current())return;
    returnWebsiteTask();
    var card=host.closest('#connectionsCard');card.classList.add('has-setup-guide','has-connector-pages');card.classList.remove('has-connection-preparation');
    document.body.dataset.connectorFlow=pageScreen==='overview'?'overview':'step';
    if(!/^details-\d(?:-\d)?$/.test(pageScreen)&&window.MCServiceIntake?.isOpen(selected))window.MCServiceIntake.close();
    ['connectionPreferencesDetails','connectionStatusOptions','leadPlatformOptions','connectionServiceDetails','websiteSetupDetails','setupOverview'].forEach(function(id){if($(id))$(id).hidden=true;});
    host.hidden=false;
    if(mutationReadbackView){
      document.body.dataset.connectorFlow='step';
      host.dataset.connectorView='readback';
      host.innerHTML='<section class="connector-page" aria-labelledby="setupGuideStageTitle" aria-busy="'+(mutationReadbackView.state==='checking')+'"><h3 id="setupGuideStageTitle" tabindex="-1">Checking your connection</h3><p role="status" aria-live="polite">'+esc(mutationReadbackView.message)+'</p>'+(mutationReadbackView.state==='failed'?'<button type="button" id="connectorReadbackRetry" class="btn-pill btn-pill-blue btn-sm">Check updated status</button>':'<span class="connector-wait-dot" aria-hidden="true"></span>')+'</section>';
      return;
    }
    var items=rows();if(!items.length){host.hidden=true;return;}
    if(pageScreen==='overview'){renderOverview(items);return;}
    var row=items.find(function(item){return item.id===selected;});if(!row){pageRoute(null,null,true);renderOverview(items);return;}
    host.dataset.connectorView='step';host.dataset.guideSelectedService=selected;
    var steps=Array.isArray(row.guide?.steps)?row.guide.steps:[],next=action(row),nextIndex=currentStep(row,steps),canonical=steps[nextIndex]||{id:'connection',label:labels[selected],detail:row.nextStep};
    var verified=row.verification?.working===true,closed=['cancelled','archived','paused'].includes(data.client.status),total=steps.length+1,index=nextIndex;
    if(pageScreen==='complete'&&(!verified||!connectionNotices[selected]?.confirmed||!connectionNotices[selected]?.working||connectionNotices[selected]?.error)){pageScreen='connection-check';pageRoute(selected,'connection-check',true);}
    if(!['intro','connection-check','complete','installation-check'].includes(pageScreen)&&!/^details-\d(?:-\d)?$/.test(pageScreen)&&!steps.some(function(step){return step.id===pageScreen;})){pageScreen=canonical.id;pageRoute(selected,pageScreen,true);}
    if(selected==='web'&&pageScreen==='install'&&!needsServiceInformation('web')&&!websiteInstructionsFinished){pageRoute('web','details-1-0',true);}
    var viewedIndex=steps.findIndex(function(item){return item.id===pageScreen;});if(viewedIndex>nextIndex){pageRoute(selected,canonical.id,true);viewedIndex=nextIndex;}
    var step=steps.find(function(item){return item.id===pageScreen;})||canonical;index=viewedIndex>=0?viewedIndex:index;
    if(/^details-\d(?:-\d)?$/.test(pageScreen)&&$('serviceIntakeWorkbench')&&window.MCServiceIntake?.isOpen(selected)){window.MCServiceIntake.mount(host.querySelector('.connector-page'),selected,data);return;}
    guideService=selected;guideStep=step.id;host.dataset.guideCurrentStep=canonical.id;host.dataset.guidePreviewStep=step.id;
    var body='',footer='',back='<button type="button" id="connectorBack" class="btn-pill btn-pill-dark btn-sm">Back</button>',exit='<button type="button" id="connectorSaveExit" class="connection-guide-link">Exit setup</button>';
    if(pageScreen==='intro') {
      body='<h4 id="setupGuideStageTitle" tabindex="-1">'+esc(verified?'Your '+labels[selected]+' connection':'Connect '+labels[selected])+'</h4><p class="connector-page-description">'+esc(verified?row.verification.summary:row.guide?.overview||'Use your saved business details and follow each connection step.')+'</p><dl class="connector-intro-summary"><div><dt>Current status</dt><dd>'+esc(serviceStatus(row))+'</dd></div><div><dt>Next</dt><dd>'+esc(verified?'Review connection checks':needsServiceInformation(selected)?'Confirm your connection details':canonical.label)+'</dd></div></dl>';
      footer='<button type="button" id="connectorStart" class="btn-pill btn-pill-blue btn-sm">'+(verified?'View connection checks':row.requested||row.retained?'Continue setup':'Start setup')+'</button>';if(['thumbtack','angi'].includes(selected)&&(data.leadConnections?.[selected]?.generation||data.leadConnections?.[selected]?.setupRequest))footer='<button type="button" id="connectorManageLead" class="connection-guide-link">Manage connection</button>'+footer;
    } else if(pageScreen==='complete') {
      index=total;body='<div class="connector-ready-mark" aria-hidden="true">✓</div><h4 id="setupGuideStageTitle" tabindex="-1">'+esc(labels[selected])+' is connected</h4><p class="connector-page-description">'+esc(row.verification.summary)+'</p>'+(row.verification.evidenceAt?'<p class="connector-evidence-time">Verified '+esc(checkedTime(row.verification.evidenceAt))+'</p>':'');
      footer=back+'<button type="button" id="connectorUse" class="btn-pill btn-pill-blue btn-sm">'+(selected==='calendar'?'Open Schedule':'Open Inbox')+'</button>';
    } else if(pageScreen==='connection-check') {
      index=steps.length;body='<h4 id="setupGuideStageTitle" tabindex="-1">Check '+esc(labels[selected])+'</h4><p class="connector-page-description">'+esc(verified?'Your recorded setup and delivery checks are confirmed.':row.verification?.summary||row.nextStep||'Check the saved result before using this connection.')+'</p>'+renderVerification(row);
      footer=back+(verified?'<button type="button" id="connectorFinish" class="btn-pill btn-pill-blue btn-sm"'+(connectionCheck||!connectionNotices[selected]?.confirmed||connectionNotices[selected]?.error||!connectionNotices[selected]?.working?' disabled':'')+'>Finish connection</button>':'<button type="button" id="connectorResume" class="btn-pill btn-pill-blue btn-sm">'+esc(next.kind==='wait'?'View setup progress':'Continue required step')+'</button>');
    } else {
      var manualCheck=next.kind==='connection'&&['show_phone_steps','show_text_steps'].includes(next.target);
      var waiting=!manualCheck&&!needsServiceInformation(selected)&&(next.kind==='wait'||step.state==='waiting'&&step.actor!=='customer'),title=waiting?next.label||'We’re preparing your connection':step.label,detail=waiting?row.nextStep||row.detail:step.detail||row.nextStep;
      if(manualCheck){title=selected==='voice'?'Make a test call':'Reply to your setup text';detail=selected==='voice'?'Follow the routing instructions below, then call your front desk number. We check the completed call before confirming this connection.':'Reply to the verification text on your saved mobile. We check the incoming reply before confirming two-way texting.';}
      if(needsServiceInformation(selected)){title='Your '+(selected==='voice'?'call-routing':selected==='sms'?'business registration':'website')+' details';detail='Confirm the details for this connection, then continue to the next step.';}
      body='<h4 id="setupGuideStageTitle" tabindex="-1">'+esc(title||labels[selected])+'</h4><p class="connector-page-description">'+esc(detail||'Complete this step to continue.')+'</p>';
      if(waiting)body+='<div class="connector-wait-state" role="status"><span class="connector-wait-dot" aria-hidden="true"></span><span>'+esc(row.responsibility==='carrier'?'Carrier review is in progress. We’ll keep tracking it.':row.responsibility==='customer'?'Complete the action shown here, then check again.':row.setupProgress?.requestSaved?'Machines & Cloud is handling your approved setup. Your progress is kept.':'Machines & Cloud must enable this connection before setup can start.')+'</span></div>'+(row.setupProgress?.nextCheckAt?'<p class="connector-evidence-time">Next automatic check: '+esc(checkedTime(row.setupProgress.nextCheckAt))+'</p>':'');
      // Provider instructions appear only on their dedicated current task page.
      var main=closed?'':manualCheck?'<button type="button" id="setupGuideCheckConnection" class="btn-pill btn-pill-blue btn-sm">'+(connectionCheck?'Checking…':selected==='voice'?'Check call result':'Check text reply')+'</button>':verified?'<button type="button" id="connectorCheckPage" class="btn-pill btn-pill-blue btn-sm">Check connection</button>':needsServiceInformation(selected)?'<button type="button" id="setupGuideDetails" class="btn-pill btn-pill-blue btn-sm">Continue</button>':row.status==='not_selected'&&['web','voice','sms','calendar'].includes(selected)?'<button type="button" id="setupGuideChoose" class="btn-pill btn-pill-blue btn-sm">Connect '+esc(labels[selected])+'</button>':next.kind==='wait'?'<button type="button" id="setupGuideCheckConnection" class="btn-pill btn-pill-blue btn-sm">'+(connectionCheck?'Checking…':'Check progress')+'</button>':'<button type="button" id="setupGuideContinue" class="btn-pill btn-pill-blue btn-sm">'+esc(next.label||'Continue')+'</button>';
      footer=back+exit+main;
      if(connectionNotices[selected])body+='<p id="connectionVerificationNotice" class="connection-verification-notice" role="status"'+(connectionNotices[selected].error?' data-error="true"':'')+'>'+esc(connectionNotices[selected].text)+'</p>';
      if(/^details-\d(?:-\d)?$/.test(pageScreen))body='<h4 id="setupGuideStageTitle" tabindex="-1">Opening your saved details…</h4>';
    }
    host.innerHTML='<h3 id="setupGuideTitle" class="sr-only">'+esc(labels[selected])+' setup</h3>'+pageShell(row,step,index,total,body,footer);
    if(window.MCServiceIntake)window.MCServiceIntake.mount(host.querySelector('.connector-page'),selected,data);
    if(next.kind==='connection'&&['show_phone_steps','show_text_steps'].includes(next.target)&&!['intro','connection-check','complete'].includes(pageScreen)&&!/^details-/.test(pageScreen)){
      var original=$('serviceConnections')?.querySelector(next.target==='show_phone_steps'?'#phoneRoutingSteps':'#textConnectionSteps');
      if(original){var instructions=original.cloneNode(true);instructions.removeAttribute('id');instructions.className='connector-focused-instructions';instructions.querySelectorAll('[id]').forEach(function(node){node.removeAttribute('id');});instructions.querySelectorAll('h4,[data-connection="cancel_voice"],[data-connection="cancel_sms"]').forEach(function(node){node.remove();});host.querySelector('.connector-page-body').appendChild(instructions);}
    }
    if(selected==='web'&&!['intro','connection-check','complete'].includes(pageScreen)&&!/^details-/.test(pageScreen)&&!needsServiceInformation(selected)&&next.kind==='route'&&next.target==='setup'&&websiteTaskCard){host.querySelector('.connector-page-body').appendChild(websiteTaskCard);host.querySelector('.connector-page').classList.add('has-website-task');websiteTaskActive=true;}
    if(['thumbtack','angi'].includes(selected)&&!['intro','connection-check','complete'].includes(pageScreen)&&next.kind==='lead'&&autoLeadKey!==selected+'/'+pageScreen){autoLeadKey=selected+'/'+pageScreen;queueMicrotask(function(){if(current()&&selected===row.id&&pageScreen===step.id&&!$('leadSourceDialog')?.open)executeAction(row);});}
    if(pageScreen==='connection-check'&&autoCheckKey!==selected){autoCheckKey=selected;queueMicrotask(function(){if(current()&&pageScreen==='connection-check')checkConnection(selected,true);});}
    if(/^details-\d(?:-\d)?$/.test(pageScreen)&&!restoringPage&&window.MCServiceIntake&&!$('serviceIntakeWorkbench')){restoringPage=true;window.MCServiceIntake.open(selected,false,false,Number(pageScreen.split('-')[1]),Number(pageScreen.split('-')[2]||0)).finally(function(){restoringPage=false;});}
  }
  function goToCurrent(row,replace) { if(!row)return;var steps=row.guide?.steps||[],step=steps[currentStep(row,steps)];pageRoute(row.id,row.verification?.working?'connection-check':needsServiceInformation(row.id)?'details-0':step?.id||'connection',replace);autoLeadKey=null;render();focusStage(); }
  function restorePage(){if(!current())return;autoLeadKey=null;autoCheckKey=null;var incoming=routeParts();if(incoming&&['connection-check','complete'].includes(incoming.screen))delete connectionNotices[incoming.service];returnWebsiteTask();document.querySelectorAll('#leadSourceDialog[open],#connectionDialog[open]').forEach(function(dialog){dialog.close();});var route=routeParts();if(window.MCServiceIntake?.isOpen(selected))window.MCServiceIntake.close();endTask();if(route){selected=route.service;pageScreen=route.screen;manualSelection=true;}else{selected=null;pageScreen='overview';manualSelection=false;}render();}
  window.addEventListener('hashchange',function(){if(location.hash==='#setup'||location.hash.startsWith('#setup/'))restorePage();});
  document.addEventListener('mc:connector-intake-step',function(event){if(!current()||event.detail?.service!==selected)return;pageRoute(selected,'details-'+event.detail.step+(event.detail.installStage!=null?'-'+event.detail.installStage:''),restoringPage);});
  document.addEventListener('mc:connector-exit',function(event){if(!current()||!labels[event.detail?.service])return;endTask();pageRoute(null);document.dispatchEvent(new CustomEvent('mc:desk-route',{detail:{tab:'setup',connectionHash:location.hash}}));render();$('setupGuideTitle')?.focus({preventScroll:true});});
  document.addEventListener('mc:connector-return',function(event){if(!current()||!labels[event.detail?.service])return;var row=rows().find(function(item){return item.id===event.detail.service;});if(row){goToCurrent(row,true);document.dispatchEvent(new CustomEvent('mc:desk-route',{detail:{tab:'setup',connectionHash:location.hash}}));}});
  document.addEventListener('mc:website-instructions-finished',function(){if(!current()||selected!=='web')return;websiteInstructionsFinished=true;pageRoute('web','installation-check');document.dispatchEvent(new CustomEvent('mc:desk-route',{detail:{tab:'setup',connectionHash:location.hash}}));render();var button=$('websiteInstallAlready');if(button&&!button.disabled)button.click();});
  document.addEventListener('mc:connector-check-page',function(event){if(!current()||!labels[event.detail?.service])return;pageRoute(event.detail.service,'connection-check');render();focusStage();});
  document.addEventListener('mc:connector-intake-close',function(event){if(!current()||event.detail?.service!==selected)return;if(event.detail.exit){pageRoute(null);render();$('setupGuideTitle')?.focus();return;}var row=rows().find(function(item){return item.id===selected;});goToCurrent(row,true);});
  host.addEventListener('input',function(event){if(!event.target.closest('#connectionPreparationForm')||!preparation)return;preparation.draft=preparationValues();preparation.dirty=true;var services=$('preparationSavedServices'),website=$('preparationSavedWebsite');if(services)services.textContent=preparation.draft.desiredChannels.map(function(id){return channelLabels[id];}).filter(Boolean).join(', ')||'Choose the services you want to use';if(website)website.textContent=preparation.draft.website||'You can add a website later';var error=$('preparationWebsiteError');if(error)error.textContent='';if($('preparationWebsite'))$('preparationWebsite').removeAttribute('aria-invalid');});
  host.addEventListener('submit',function(event){if(event.target.id==='connectionPreparationForm'){event.preventDefault();prepareConnections();}});
  host.addEventListener('change',function(event){if(event.target.id==='setupGuideSelect'&&current()&&labels[event.target.value]){endTask();selected=event.target.value;manualSelection=true;render();focusStage();}});
  host.addEventListener('click', function (event) {
    if (!current()) return;
    if(event.target.closest('#connectorReadbackRetry')){document.dispatchEvent(new CustomEvent('mc:connection-readback-retry'));return;}
    if(event.target.closest('[data-connection]')){var target=event.target.closest('[data-connection]');document.dispatchEvent(new CustomEvent('mc:connection-action',{detail:{action:target.dataset.connection}}));return;}
    if(event.target.closest('#setupGuideCheckConnection')){checkConnection();return;}
    var pageRow=rows().find(function(item){return item.id===selected;});
    if(event.target.closest('#connectorAllServices')||event.target.closest('#connectorSaveExit')){returnWebsiteTask();endTask();pageRoute(null);render();$('setupGuideTitle')?.focus();return;}
    if(event.target.closest('#connectorManageLead')&&['thumbtack','angi'].includes(selected)){document.dispatchEvent(new CustomEvent('mc:lead-source-manage',{detail:{source:selected}}));return;}
    if(event.target.closest('#connectorStart')||event.target.closest('#connectorResume')){goToCurrent(pageRow);return;}
    if(event.target.closest('#connectorCheckPage')){pageRoute(selected,'connection-check');render();focusStage();return;}
    if(event.target.closest('#connectorFinish')&&pageRow?.verification?.working&&!connectionCheck&&connectionNotices[selected]?.confirmed&&connectionNotices[selected]?.working&&!connectionNotices[selected]?.error){pageRoute(selected,'complete');render();focusStage();return;}
    if(event.target.closest('#connectorUse')&&pageRow?.verification?.working){endTask();document.dispatchEvent(new CustomEvent('mc:desk-route',{detail:{tab:selected==='calendar'?'availability':'leads'}}));return;}
    if(event.target.closest('#connectorBack')){if(history.state?.mcConnectorPage?.slug===data.client.slug&&location.hash!=='#setup'){history.back();return;}if(pageScreen==='connection-check'||pageScreen==='complete'){pageRoute(selected,pageScreen==='complete'?'connection-check':'intro');render();focusStage();}else{pageRoute(selected,'intro');render();focusStage();}return;}
    if(event.target.closest('#setupGuideOpenInbox')){endTask();document.dispatchEvent(new CustomEvent('mc:desk-route',{detail:{tab:'leads'}}));return;}
    var stepButton=event.target.closest('button[data-guide-step]');
    if(stepButton){guideStep=stepButton.dataset.guideStep;guideManual=true;render();focusStage();return;}
    if(event.target.closest('#setupGuideCurrent')){guideManual=false;render();focusStage();return;}
    if(event.target.closest('#setupGuideDetails')&&window.MCServiceIntake){var edit=event.target.closest('#setupGuideDetails').dataset.editIntake==='true';endTask();window.MCServiceIntake.open(selected,false,edit);return;}
    if(event.target.closest('#setupGuideRefresh')){document.dispatchEvent(new CustomEvent('mc:desk-refresh'));return;}

    var service = event.target.closest('button[data-guide-service]');
    if (service && labels[service.dataset.guideService]) { endTask();selected = service.dataset.guideService; pageRoute(selected,'intro');manualSelection = true; render(); focusStage();return; }
    if(event.target.closest('#preparationUseSaved')&&preparation&&!preparation.pending&&!preparation.awaiting){var facts=preparationFacts();preparation.draft={desiredChannels:(facts.desiredChannels||[]).slice().sort(),website:facts.website||''};preparation.dirty=false;preparation.uncertain=false;preparation.attempt=null;preparationNotice('Your latest saved choices are shown.',false);render();return;}
    var row = rows().find(function (item) { return item.id === selected; });
    if (!row) return;
    if(event.target.closest('#setupGuideChoose')&&['web','voice','sms','calendar'].includes(selected)&&!['cancelled','archived','paused'].includes(data.client.status)){this.querySelector('#setupGuideChoose').disabled=true;document.dispatchEvent(new CustomEvent('mc:connection-select',{detail:{service:selected}}));return;}

    if (!event.target.closest('#setupGuideContinue') || ['cancelled', 'archived', 'paused'].includes(data.client.status)) return;
    executeAction(row);
  });
  document.addEventListener('mc:service-intake-saved',function(event){if(!current()||!labels[event.detail?.service])return;intakeSaved[event.detail.service]=true;if(/^details-/.test(pageScreen)&&!window.MCServiceIntake?.isOpen(event.detail.service)){var row=rows().find(function(item){return item.id===event.detail.service;});goToCurrent(row,true);}else render();});
  document.addEventListener('mc:guide-do-next',function(event){if(!current()||!labels[event.detail?.service])return;endTask();selected=event.detail.service;manualSelection=true;guideManual=false;var row=rows().find(function(item){return item.id===selected;});goToCurrent(row,true);if(row&&action(row).kind!=='wait')executeAction(row);else focusStage();});
  document.addEventListener('mc:connection-selected',function(event){if(!current()||!labels[event.detail?.service])return;selected=event.detail.service;manualSelection=true;guideManual=false;render();if(event.detail.confirmed){var row=rows().find(function(item){return item.id===selected;});if(row&&!needsServiceInformation(selected)&&action(row).kind!=='wait')executeAction(row);else if(row&&needsServiceInformation(selected)&&window.MCServiceIntake)window.MCServiceIntake.open(selected);else focusStage();}else{var note=document.createElement('p');note.className='preparation-status';note.setAttribute('role','alert');note.textContent='Your service choice could not be confirmed. Your saved setup is kept. Try connecting again.';host.querySelector('.setup-guide-current')?.prepend(note);}});
  document.addEventListener('mc:guide-select',function(event){if(!labels[event.detail?.service]||!current())return;endTask();selected=event.detail.service;manualSelection=true;var row=rows().find(function(item){return item.id===selected;});goToCurrent(row,true);});
  document.addEventListener('mc:desk', function (event) { var previousRow=rows().find(function(item){return item.id===selected;}),previousSteps=previousRow?.guide?.steps||[],previousCurrent=previousSteps[currentStep(previousRow||{},previousSteps)]?.id;data = event.detail;var updatedRow=rows().find(function(item){return item.id===selected;});if(updatedRow&&!['overview','intro','connection-check','complete'].includes(pageScreen)&&!/^details-/.test(pageScreen)){var nextSteps=updatedRow.guide?.steps||[],nextCurrent=nextSteps[currentStep(updatedRow,nextSteps)]?.id;if(updatedRow.verification?.working){pageRoute(selected,'connection-check',true);if(guideTask&&['know','test','availability'].includes(document.body.dataset.activePage))document.dispatchEvent(new CustomEvent('mc:desk-route',{detail:{tab:'setup',connectionHash:location.hash}}));}else if(pageScreen===previousCurrent&&nextCurrent&&nextCurrent!==previousCurrent)pageRoute(selected,nextCurrent,true);}observePreparation();renderHomeProgress();if(!pageRestored){pageRestored=true;var route=routeParts();if(route){selected=route.service;pageScreen=route.screen;manualSelection=true;}}if(guideTask){var currentRow=rows().find(function(item){return item.id===guideTask.service;});if(currentRow&&currentRow.verification?.working)pageScreen='connection-check';}render();assistTask(); });
  document.addEventListener('mc:connection-readback',function(event){if(!current()||!['checking','failed','complete'].includes(event.detail?.state))return;var starting=!mutationReadbackView;mutationReadbackView=event.detail.state==='complete'?null:event.detail;clearConnectionCheck();autoCheckKey=null;render();if(starting&&mutationReadbackView)focusStage();});
  document.addEventListener('mc:session-expired',function(){mutationReadbackView=null;});
  $('deskSignOut')?.addEventListener('click',function(){mutationReadbackView=null;});
  function clearConnectionCheck(){connectionCheckGeneration++;if(connectionCheck)connectionCheck.controller.abort();connectionCheck=null;connectionNotices={};}
  document.addEventListener('mc:session-expired', function () { clearConnectionCheck();preparationGeneration++;clearTimeout(preparationTimer);preparation=null;intakeSaved={};endTask();data = null; selected = null; manualSelection = false;guideService=null;guideStep=null;guideManual=false;guideOpened=false;pageRestored=false;pageScreen='overview';delete document.body.dataset.connectorFlow; host.replaceChildren(); host.hidden = true;if($('homeConnectionProgress')){$('homeConnectionProgress').hidden=true;$('homeConnectionProgressRows').replaceChildren();delete $('homeConnectionProgress').dataset.initialized;} });
  if ($('deskSignOut')) $('deskSignOut').addEventListener('click', function () { clearConnectionCheck();preparationGeneration++;clearTimeout(preparationTimer);preparation=null;intakeSaved={};endTask();data = null; selected = null; manualSelection = false;guideService=null;guideStep=null;guideManual=false;guideOpened=false;pageRestored=false;pageScreen='overview';delete document.body.dataset.connectorFlow; host.replaceChildren(); host.hidden = true;if($('homeConnectionProgress')){$('homeConnectionProgress').hidden=true;$('homeConnectionProgressRows').replaceChildren();delete $('homeConnectionProgress').dataset.initialized;} });
})();
