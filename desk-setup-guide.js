(function () {
  'use strict';
  var host = document.getElementById('setupGuide');
  if (!host) return;
  var data = null, selected = null, manualSelection = false, intakeSaved = {};
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
      data.connections=result.connections;data.websiteInstallation=result.websiteInstallation;data.setup.channels=result.setup.channels;if(result.setup.reviewRequirements)data.setup.reviewRequirements=result.setup.reviewRequirements;data.setup.connectionJourney=journey;connectionNotices[id]={error:false,text:'Saved status checked '+checkedTime(checked.verification.checkedAt)+'. '+(checked.verification.working?'Delivery was verified at the time shown above.':checked.verification.summary)};
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
  function endTask(){guideTask=null;clearTarget();coach.hidden=true;coach.replaceChildren();delete coach.dataset.contentKey;delete coach.dataset.guideService;delete coach.dataset.guideStep;delete coach.dataset.guideComplete;document.querySelectorAll('[data-setup-guide-context]').forEach(function(node){node.remove();});}
  function continuation(row){
    var steps=row.guide?.steps||[],now=steps[currentStep(row,steps)],prior=steps.find(function(item){return item.id===guideTask.step;}),next=action(row);
    var changed=!!now&&(now.id!==guideTask.step||next.kind!==guideTask.action.kind||next.target!==guideTask.action.target),complete=!!prior&&prior.state==='complete';
    var review=$('reviewRules'),required=guideTask.step==='business'&&review?.dataset.reviewBlocked==='true',busy=guideTask.step==='business'&&review&&(review.disabled||required)||guideTask.step==='practice'&&$('chatForm')?.getAttribute('aria-busy')==='true';
    var waiting=next.kind==='wait'||now&&now.state==='waiting'&&now.actor!=='customer';
    return {now:now,next:next,changed:changed,complete:complete,busy:!!busy,required:required,waiting:!!waiting,canContinue:changed&&!busy&&!['paused','cancelled','archived'].includes(data.client.status)};
  }
  function assistTask(){
    if(!guideTask||!current()){if(!current())endTask();return;}
    if(guideTask.slug!==data.client.slug||guideTask.session!==preparationSession()||['paused','cancelled','archived'].includes(data.client.status)){endTask();return;}
    var row=rows().find(function(item){return item.id===guideTask.service;});if(!row){endTask();return;}
    var steps=row.guide?.steps||[];if(steps.length&&steps.every(function(step){return step.state==='complete';})){endTask();return;}
    var progress=continuation(row),dialog=document.querySelector('dialog[open]:not(#guideDialog)'),target=null,scrollTarget=false;
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
    if(coach.dataset.contentKey!==key){coach.dataset.contentKey=key;coach.innerHTML='<div><span>'+esc(labels[row.id])+' setup</span><strong id="guideCoachTitle">'+esc(title)+'</strong><p id="guideCoachDetail">'+esc(detail)+'</p></div><div class="guide-coach-actions">'+button+'<button type="button" class="guide-coach-dismiss" id="guideDismiss">Close guide</button></div>';if(focused&&$(focused))$(focused).focus({preventScroll:true});}
    if(scrollTarget){var capturedTask=guideTask,capturedTarget=target;requestAnimationFrame(function(){requestAnimationFrame(function(){if(current()&&guideTask===capturedTask&&guideTarget===capturedTarget&&capturedTarget.isConnected&&!document.querySelector('dialog[open]'))coach.scrollIntoView({block:'start',behavior:motion.matches?'instant':'smooth'});});});}
  }
  function returnToGuide(){if(!guideTask||!current())return;var id=guideTask.service;endTask();selected=id;manualSelection=true;guideManual=false;document.dispatchEvent(new CustomEvent('mc:desk-route',{detail:{tab:'setup'}}));render();coach.hidden=true;focusStage();document.dispatchEvent(new CustomEvent('mc:desk-refresh'));}
  function executeAction(row){
    if(!row||['cancelled','archived','paused'].includes(data.client.status))return;var next=action(row);
    selected=row.id;manualSelection=true;guideManual=false;
    if(next.kind==='wait'){returnToGuide();return;}
    if(next.kind==='lead'&&['thumbtack','angi'].includes(next.target)){beginTask(row);document.dispatchEvent(new CustomEvent('mc:lead-source-open',{detail:{source:next.target}}));assistTask();return;}
    var card=$('connection-guide-'+row.id),existing=card&&Array.from(card.querySelectorAll('button')).find(function(button){return !button.disabled&&(next.kind==='route'?button.dataset.journeyRoute===next.target:next.kind==='connection'&&button.dataset.connection===next.target);});
    if(!existing&&next.kind==='connection')existing=Array.from(document.querySelectorAll('#connectionJourney [data-connection]')).find(function(button){return button.dataset.connection===next.target&&!button.disabled;});
    if(existing){beginTask(row);existing.click();assistTask();return;}
    if(next.kind==='route'&&['know','test','setup','leads','availability'].includes(next.target)){beginTask(row);document.dispatchEvent(new CustomEvent('mc:desk-route',{detail:{tab:next.target}}));assistTask();return;}
    // A missing action must return to the current status, not strand the customer.
    returnToGuide();
  }
  coach.addEventListener('click',function(event){
    if(event.target.closest('#guideDismiss')){var target=guideTarget;endTask();var focus=target&&target.querySelector('button:not(:disabled),input:not(:disabled),textarea:not(:disabled)')||$('pageTitle');if(focus)focus.focus({preventScroll:true});return;}
    if(event.target.closest('#guideReturn')&&guideTask&&current()){var row=rows().find(function(item){return item.id===guideTask.service;});if(!row||!continuation(row).canContinue)return;if(continuation(row).waiting)returnToGuide();else executeAction(row);}
  });
  document.addEventListener('mc:guide-state-change',assistTask);
  document.addEventListener('mc:guide-step-complete',function(event){
    if(!current()||!guideTask||event.detail?.slug!==data.client.slug||event.detail?.revision!==data.configurationRevision||event.detail?.step!==guideTask.step)return;
    assistTask();var row=rows().find(function(item){return item.id===guideTask.service;}),button=$('guideReturn');if(row&&continuation(row).canContinue&&button&&!button.disabled){button.scrollIntoView({block:'nearest',behavior:motion.matches?'instant':'smooth'});button.focus({preventScroll:true});}
  });
  document.addEventListener('mc:service-guide',function(event){if(!current()||!labels[event.detail?.service])return;selected=event.detail.service;manualSelection=true;guideManual=false;endTask();document.dispatchEvent(new CustomEvent('mc:desk-route',{detail:{tab:'setup'}}));render();focusStage();});
  var contextObserver=new MutationObserver(function(){assistTask();});contextObserver.observe(document.body,{attributes:true,attributeFilter:['data-active-page','data-workspace-state']});document.querySelectorAll('dialog').forEach(function(dialog){contextObserver.observe(dialog,{attributes:true,attributeFilter:['open'],childList:true});});
  document.addEventListener('click',function(event){if(event.target.closest('.tabs [data-t=setup]')&&current()&&!hasPreparationForm()){endTask();}});
  if($('openGuide'))$('openGuide').addEventListener('click',endTask);
  motion.addEventListener('change',function(){if(current())render();});
  function render() {
    if (!current()) return;
    if(renderPreparation())return;
    host.closest('#connectionsCard').classList.remove('has-connection-preparation');
    $('connectionPreferencesDetails').hidden=false;
    var web=data.setup&&data.setup.connectionJourney&&data.setup.connectionJourney.channels.find(function(row){return row.id==='web';});
    if(web)$('websiteSetupDetails').hidden=!web.requested;
    var items = rows();
    if (!items.length) { host.hidden = true; return; }
    var row = manualSelection && items.find(function (item) { return item.id === selected; }) || chooseDefault(items);
    selected = row.id;
    var guide = row.guide || {}, steps = Array.isArray(guide.steps) ? guide.steps.slice() : [], next = action(row);
    var platformBlocked=row.activation?.blockedBy==='machines_and_cloud';
    var intake=data.serviceIntake&&data.serviceIntake[selected],intakeEnabled=selected!=='calendar'&&!!intake&&!!window.MCServiceIntake&&!['cancelled','archived','paused'].includes(data.client.status),intakeNeeded=needsServiceInformation(selected);
    var nextIndex = currentStep(row, steps), nextId = steps[nextIndex] && steps[nextIndex].id;
    if(guideService!==selected){guideService=selected;guideStep=nextId;guideManual=false;}
    if(!guideManual || !steps.some(function(step){return step.id===guideStep;}))guideStep=nextId;
    var index=steps.findIndex(function(step){return step.id===guideStep;});if(index<0)index=nextIndex;
    var step=steps[index]||{id:'connection',label:labels[row.id],detail:row.nextStep,actor:'customer',state:'current'}, isNext=index===nextIndex, closed=['cancelled','archived','paused'].includes(data.client.status);
    var complete=steps.filter(function(item){return item.state==='complete';}).length, finished=steps.length>0&&complete===steps.length;
    var focused = host.contains(document.activeElement) ? document.activeElement.dataset.guideService || document.activeElement.id : null;
    var existingPath=$('guideSetupPath');if(existingPath)pathExpanded=existingPath.open;
    var showPath=true;
    host.hidden=false;host.closest('#connectionsCard').classList.add('has-setup-guide');
    host.dataset.guideCurrentStep=nextId||'';host.dataset.guidePreviewStep=step.id;host.dataset.guideSelectedService=selected;
    var status=step.state==='complete'?'Saved':!isNext?'Looking ahead':finished?'All steps confirmed':next.kind==='wait'?'Setup is continuing':'Your next step';
    var waiting=isNext&&next.kind==='wait'&&row.status!=='not_selected',kind=waiting?'waiting':visualKind(row,step), title=waiting?next.label||'Setup is continuing':step.label||labels[row.id], detail=waiting?row.detail||row.nextStep||step.detail:isNext&&row.status==='not_selected'?'Choose this service to add it to your front desk.':step.detail||row.nextStep||guide.overview;
    var verified=isNext&&finished&&row.verification?.working===true;
    if(verified){status='Delivery verified';kind='ready';title='Connection verified';detail=row.verification.summary;}
    if(intakeNeeded&&isNext){
      status='Your next step';title='Set up '+labels[selected].toLowerCase();
      detail={web:'Add your website and choose its builder. We’ll prepare the installation steps for you.',voice:'Choose your business line or a new front desk number, then confirm where owner callbacks should go.',sms:'Confirm your registered business and contact details. We’ll keep them ready for the carrier review.',calendar:'Choose the Google account you use for work, then continue to its permission review.'}[selected];
      kind=selected==='voice'?'phone':selected==='web'?'website':selected;
    }
    if(platformBlocked&&isNext&&!intakeNeeded){status='Needs our attention';title=labels[selected]+' needs Machines & Cloud setup';detail=row.nextStep||'Your service choice is saved. Machines & Cloud must finish enabling this connection before you can activate it.';kind='waiting';}
    var primary='',secondary='';
    if(!isNext)primary='<button type="button" class="btn-pill btn-pill-blue btn-sm" id="setupGuideCurrent">Return to current task</button>';
    else if(!closed&&intakeNeeded)primary='<button type="button" class="btn-pill btn-pill-blue btn-sm" id="setupGuideDetails">Save '+esc(selected==='voice'?'call-routing details':selected==='sms'?'registration details':'website details')+'</button>';
    else if(!closed&&row.status==='not_selected'&&['web','voice','sms','calendar'].includes(selected))primary='<button type="button" class="btn-pill btn-pill-blue btn-sm" id="setupGuideChoose">'+(platformBlocked?'Add ':'Connect ')+esc(labels[selected])+'</button>';
    else if(!closed&&verified&&['voice','sms','thumbtack','angi'].includes(selected))primary='<button type="button" class="btn-pill btn-pill-blue btn-sm" id="setupGuideOpenInbox">Open Inbox</button>';
    else if(!closed&&next.kind!=='wait')primary='<button type="button" class="btn-pill btn-pill-blue btn-sm" id="setupGuideContinue">'+esc(next.label||'Connect '+labels[selected])+'</button>';
    else if(!closed&&!verified)primary='<button type="button" class="btn-pill btn-pill-dark btn-sm" id="setupGuideRefresh">Check setup status</button>';
    if(intakeEnabled&&!intakeNeeded)secondary='<button type="button" class="connection-guide-link" id="setupGuideDetails" data-edit-intake="'+(intake.canSave!==false)+'">'+(intake.canSave===false?'View connection details':'Edit connection details')+'</button>';
    host.innerHTML=(preparation&&preparation.uncertain&&preparationFacts()?.eligible!==true?'<p id="preparationRecoveryNotice" class="preparation-status" role="status">'+esc(preparation.notice)+'</p>':'')+
      '<div class="setup-guide-heading"><h3 id="setupGuideTitle">Connect your services</h3><p class="muted">Choose a service to connect or manage. Your saved business details carry across.</p></div>'+
      '<label class="setup-guide-mobile" for="setupGuideSelect">Service<select id="setupGuideSelect" class="form-input">'+items.map(function(item){return '<option value="'+item.id+'"'+(item.id===selected?' selected':'')+'>'+esc(labels[item.id]+' · '+serviceStatus(item))+'</option>';}).join('')+'</select></label>'+
      '<div class="setup-guide-layout"><nav class="setup-guide-services" id="setupGuideServices" aria-label="Choose a service to set up">'+items.map(function(item){return '<button type="button" class="setup-guide-service" data-guide-service="'+item.id+'" aria-pressed="'+(item.id===selected)+'"><span class="brand-lockup">'+brandMark(item.id)+'<span'+(item.id==='angi'?' class="brand-wordmark-label"':'')+'>'+esc(labels[item.id])+'</span></span><small>'+esc(serviceStatus(item))+'</small></button>';}).join('')+'</nav>'+
      '<section class="setup-guide-current direct-connection-task" aria-labelledby="setupGuideStageTitle"><div class="guide-task-meta"><span class="brand-lockup">'+brandMark(row.id)+'<span'+(row.id==='angi'?' class="brand-wordmark-label"':'')+'>'+esc(labels[row.id])+'</span></span><span>'+esc(verified?'Connected':row.requested||row.retained?'Selected service':'Add to your front desk')+'</span></div>'+
      '<div class="guide-task-grid"><div class="guide-task-copy"><h4 id="setupGuideStageTitle" tabindex="-1">'+esc(title)+'</h4>'+(status!=='Your next step'?'<p class="guide-task-status muted">'+esc(status)+'</p>':'')+'<p class="guide-task-detail">'+esc(detail)+'</p>'+
      renderSetupProgress(row)+'<div class="setup-guide-actions">'+primary+secondary+'</div>'+
      (row.setupProgress&&!row.setupProgress.requestSaved?'':'<p class="guide-task-expectation">'+esc(verified?'Your delivery evidence is saved. You can check this connection again whenever you need.':intakeNeeded&&isNext?'Your saved business details are filled in where they apply. You can save and return anytime.':taskOutcome(row,step,isNext))+'</p>')+'</div>'+
      '</div>'+renderManualTask(row)+'<details class="direct-connection-help"><summary>How this connection works</summary><p>'+esc(guide.overview||row.ownerTask||'')+'</p><figure class="guide-task-visual"><div id="guideVisualScene">'+(window.MCSetupVisuals?window.MCSetupVisuals.render(kind):'')+'</div><figcaption>Illustrated setup example</figcaption></figure></details>'+
      (row.verification?'<details class="direct-connection-checks"><summary>Connection and delivery checks</summary>'+renderVerification(row)+'</details>':'')+
      '<section class="guide-path-details" id="guideSetupPath" aria-labelledby="guidePathTitle"><h5 id="guidePathTitle">Required path <span>'+complete+' of '+steps.length+' complete</span></h5><nav class="guide-path" aria-label="'+esc(labels[row.id])+' setup steps"><ol>'+steps.map(function(item,i){return '<li><button type="button" data-guide-step="'+esc(item.id)+'"'+(i===index?' aria-current="step"':'')+' data-step-state="'+esc(item.state)+'"><span class="guide-path-number" aria-hidden="true">'+(item.state==='complete'?'✓':i+1)+'</span><span>'+esc(item.label)+'<small>'+esc(stepStatus(item,i===nextIndex))+'</small>'+(item.evidenceAt?'<time datetime="'+esc(item.evidenceAt)+'">'+esc(checkedTime(item.evidenceAt))+'</time>':'')+'</span></button></li>';}).join('')+'</ol></nav><p class="guide-success-condition"><strong>Working when:</strong> '+esc(guide.success?.description||row.readyWhen||'The required setup and actual delivery checks are confirmed.')+'</p></section>'+
      '</section></div>';
    if(intakeSaved[selected]&&!row.setupProgress){
      var savedNotice=document.createElement('p');savedNotice.id='connectionIntakeSaved';savedNotice.className='preparation-status';savedNotice.setAttribute('role','status');savedNotice.tabIndex=-1;
      savedNotice.textContent='Your '+labels[selected].toLowerCase()+' details are saved. Continue with the next setup step below.';
      host.querySelector('.setup-guide-current').prepend(savedNotice);
    }
    if(window.MCServiceIntake)window.MCServiceIntake.mount(host.querySelector('.setup-guide-current'),selected,data);
    if(!guideOpened&&document.body.dataset.activePage==='setup')guideOpened=true;
    if (focused) {
      var replacement = labels[focused] ? host.querySelector('[data-guide-service="' + focused + '"]') : $(focused);
      if (replacement && host.contains(replacement)) replacement.focus({ preventScroll: true });
    }
  }
  host.addEventListener('input',function(event){if(!event.target.closest('#connectionPreparationForm')||!preparation)return;preparation.draft=preparationValues();preparation.dirty=true;var services=$('preparationSavedServices'),website=$('preparationSavedWebsite');if(services)services.textContent=preparation.draft.desiredChannels.map(function(id){return channelLabels[id];}).filter(Boolean).join(', ')||'Choose the services you want to use';if(website)website.textContent=preparation.draft.website||'You can add a website later';var error=$('preparationWebsiteError');if(error)error.textContent='';if($('preparationWebsite'))$('preparationWebsite').removeAttribute('aria-invalid');});
  host.addEventListener('submit',function(event){if(event.target.id==='connectionPreparationForm'){event.preventDefault();prepareConnections();}});
  host.addEventListener('change',function(event){if(event.target.id==='setupGuideSelect'&&current()&&labels[event.target.value]){endTask();selected=event.target.value;manualSelection=true;render();focusStage();}});
  host.addEventListener('click', function (event) {
    if (!current()) return;
    if(event.target.closest('#setupGuideCheckConnection')){checkConnection();return;}
    if(event.target.closest('#setupGuideOpenInbox')){endTask();document.dispatchEvent(new CustomEvent('mc:desk-route',{detail:{tab:'leads'}}));return;}
    var stepButton=event.target.closest('button[data-guide-step]');
    if(stepButton){guideStep=stepButton.dataset.guideStep;guideManual=true;render();focusStage();return;}
    if(event.target.closest('#setupGuideCurrent')){guideManual=false;render();focusStage();return;}
    if(event.target.closest('#setupGuideDetails')&&window.MCServiceIntake){var edit=event.target.closest('#setupGuideDetails').dataset.editIntake==='true';endTask();window.MCServiceIntake.open(selected,false,edit);return;}
    if(event.target.closest('#setupGuideRefresh')){document.dispatchEvent(new CustomEvent('mc:desk-refresh'));return;}

    var service = event.target.closest('button[data-guide-service]');
    if (service && labels[service.dataset.guideService]) { endTask();selected = service.dataset.guideService; manualSelection = true; render(); focusStage();return; }
    if(event.target.closest('#preparationUseSaved')&&preparation&&!preparation.pending&&!preparation.awaiting){var facts=preparationFacts();preparation.draft={desiredChannels:(facts.desiredChannels||[]).slice().sort(),website:facts.website||''};preparation.dirty=false;preparation.uncertain=false;preparation.attempt=null;preparationNotice('Your latest saved choices are shown.',false);render();return;}
    var row = rows().find(function (item) { return item.id === selected; });
    if (!row) return;
    if(event.target.closest('#setupGuideChoose')&&['web','voice','sms','calendar'].includes(selected)&&!['cancelled','archived','paused'].includes(data.client.status)){this.querySelector('#setupGuideChoose').disabled=true;document.dispatchEvent(new CustomEvent('mc:connection-select',{detail:{service:selected}}));return;}

    if (!event.target.closest('#setupGuideContinue') || ['cancelled', 'archived', 'paused'].includes(data.client.status)) return;
    executeAction(row);
  });
  document.addEventListener('mc:service-intake-saved',function(event){if(!current()||!labels[event.detail?.service])return;intakeSaved[event.detail.service]=true;render();});
  document.addEventListener('mc:guide-do-next',function(event){if(!current()||!labels[event.detail?.service])return;endTask();selected=event.detail.service;manualSelection=true;guideManual=false;render();var row=rows().find(function(item){return item.id===selected;});if(row&&action(row).kind!=='wait')executeAction(row);else focusStage();});
  document.addEventListener('mc:connection-selected',function(event){if(!current()||!labels[event.detail?.service])return;selected=event.detail.service;manualSelection=true;guideManual=false;render();if(event.detail.confirmed){var row=rows().find(function(item){return item.id===selected;});if(row&&!needsServiceInformation(selected)&&action(row).kind!=='wait')executeAction(row);else if(row&&needsServiceInformation(selected)&&window.MCServiceIntake)window.MCServiceIntake.open(selected);else focusStage();}else{var note=document.createElement('p');note.className='preparation-status';note.setAttribute('role','alert');note.textContent='Your service choice could not be confirmed. Your saved setup is kept. Try connecting again.';host.querySelector('.setup-guide-current')?.prepend(note);}});
  document.addEventListener('mc:guide-select',function(event){if(!labels[event.detail?.service]||!current())return;endTask();selected=event.detail.service;manualSelection=true;render();});
  document.addEventListener('mc:desk', function (event) { data = event.detail; observePreparation();renderHomeProgress();render();assistTask(); });
  function clearConnectionCheck(){connectionCheckGeneration++;if(connectionCheck)connectionCheck.controller.abort();connectionCheck=null;connectionNotices={};}
  document.addEventListener('mc:session-expired', function () { clearConnectionCheck();preparationGeneration++;clearTimeout(preparationTimer);preparation=null;intakeSaved={};endTask();data = null; selected = null; manualSelection = false;guideService=null;guideStep=null;guideManual=false;guideOpened=false; host.replaceChildren(); host.hidden = true;if($('homeConnectionProgress')){$('homeConnectionProgress').hidden=true;$('homeConnectionProgressRows').replaceChildren();delete $('homeConnectionProgress').dataset.initialized;} });
  if ($('deskSignOut')) $('deskSignOut').addEventListener('click', function () { clearConnectionCheck();preparationGeneration++;clearTimeout(preparationTimer);preparation=null;intakeSaved={};endTask();data = null; selected = null; manualSelection = false;guideService=null;guideStep=null;guideManual=false;guideOpened=false; host.replaceChildren(); host.hidden = true;if($('homeConnectionProgress')){$('homeConnectionProgress').hidden=true;$('homeConnectionProgressRows').replaceChildren();delete $('homeConnectionProgress').dataset.initialized;} });
})();
