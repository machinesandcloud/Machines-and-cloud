(function () {
  'use strict';
  var query = new URLSearchParams(location.search), slug = query.get('c'), fragment = new URLSearchParams(location.hash.slice(1));
  var session = null, pending = null;
  try { session = sessionStorage.getItem('mc-onboarding-session-v1'); pending = JSON.parse(sessionStorage.getItem('mc-calendar-pending-v1') || 'null'); } catch (error) { /* Sign in again when browser storage is unavailable. */ }
  var returnedState = fragment.get('calendar_state'), returnedCode = fragment.get('calendar_code'), returnedError = fragment.get('calendar_error');
  var hasCalendarReturn = ['calendar_state','calendar_code','calendar_error'].some(function (key) { return fragment.has(key); });
  var validCalendarReturn = /^[a-f0-9]{64}$/.test(returnedState || '') && ['calendar_state','calendar_code','calendar_error'].every(function (key) { return fragment.getAll(key).length <= 1; }) && (returnedError === 'access_denied' && !fragment.has('calendar_code') || !fragment.has('calendar_error') && typeof returnedCode === 'string' && !!returnedCode && returnedCode.length <= 4096);
  var calendarReturn = session && pending && pending.slug === slug && pending.state === returnedState && validCalendarReturn ? { state: returnedState, code: returnedCode || undefined, error: returnedError || undefined } : null;
  var calendarAutoAttempted = false, calendarNotice = hasCalendarReturn && !calendarReturn ? 'This calendar return could not be matched to this workspace. Connect Google Calendar again to continue.' : '';
  if (hasCalendarReturn || query.has('calendar')) { query.delete('calendar'); history.replaceState(null, '', location.pathname + '?' + query.toString() + '#setup'); }
  if (!session || !slug) return;
  var data, busy = false, generation = 0, savedSetupReadback = null, mutationReadback = null, dialog = document.createElement('dialog'); dialog.id = 'connectionDialog'; dialog.className = 'walkthrough'; dialog.setAttribute('aria-labelledby', 'connectionTitle'); document.body.appendChild(dialog);
  var $ = function (id) { return document.getElementById(id); }, container = $('serviceConnections'), message = $('serviceConnectionMessage');
  var meta = document.querySelector('meta[name="mc-api-base"]'), base = meta && meta.content ? meta.content.replace(/\/$/, '') : '';
  async function sessionBinding() {
    var digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(session));
    return Array.from(new Uint8Array(digest)).map(function (byte) { return byte.toString(16).padStart(2,'0'); }).join('');
  }
  function currentSession() { try { return sessionStorage.getItem('mc-onboarding-session-v1') === session; } catch (error) { return false; } }
  var approvalStorageKey = 'mc-service-approval-pending-v1:' + slug;
  async function rememberApproval() {
    var held = savedSetupReadback, binding = await sessionBinding();
    if (!held || held !== savedSetupReadback || held.generation !== generation || !currentSession()) return false;
    sessionStorage.setItem(approvalStorageKey, JSON.stringify({ binding: binding, submissionId: held.submissionId, confirmed: held.confirmed === true, service: held.service || null }));
    return true;
  }
  function clearApproval() { savedSetupReadback = null; try { sessionStorage.removeItem(approvalStorageKey); } catch (error) { /* A new session cannot use the old binding. */ } }
  function resumeApproval() { if (savedSetupReadback && !savedSetupReadback.resumeAttempted && !busy && data?.client?.slug === slug && currentSession()) { savedSetupReadback.resumeAttempted = true; readSavedSetup(); } }
  var approvalRestore = sessionBinding().then(function (binding) {
    try { var stored = JSON.parse(sessionStorage.getItem(approvalStorageKey) || 'null'); if (!currentSession() || savedSetupReadback || stored?.binding !== binding || !/^[a-f0-9]{32,64}$/.test(stored.submissionId || '')) return; savedSetupReadback = { generation: generation, submissionId: stored.submissionId, confirmed: stored.confirmed === true, service: ['voice','sms'].includes(stored.service) ? stored.service : null, restored: true, resumeAttempted: false }; resumeApproval(); } catch (error) { /* Corrupt local data grants no approval. */ }
  });
  function clearCalendarReturn() {
    var previous = calendarReturn; calendarReturn = null;
    try {
      var saved = JSON.parse(sessionStorage.getItem('mc-calendar-pending-v1') || 'null');
      if (previous && saved && saved.slug === slug && saved.state === previous.state) sessionStorage.removeItem('mc-calendar-pending-v1');
    } catch (error) { /* A new connection can still be started if storage is unavailable. */ }
  }
  async function continueCalendarReturn(d) {
    // A Google consent return can finish without another approval click. The
    // server still validates its one-use state, original owner session and PKCE.
    // Old receipts without a session binding retain the explicit recovery action.
    if (!calendarReturn || calendarAutoAttempted || busy || !pending || !pending.sessionBinding || !d.connections || d.client?.slug !== slug || d.client.onboarding?.version !== 1) return;
    calendarAutoAttempted = true; var expectedGeneration = generation, returned = calendarReturn;
    try {
      var binding = await sessionBinding();
      if (expectedGeneration !== generation || returned !== calendarReturn || !data || !currentSession()) return;
      if (!/^[a-f0-9]{64}$/.test(pending.sessionBinding) || binding !== pending.sessionBinding || !Number.isFinite(Date.parse(pending.expiresAt)) || Date.parse(pending.expiresAt) <= Date.now()) {
        clearCalendarReturn(); render(data); message.textContent = 'This calendar sign-in expired or belongs to another session. Connect Google Calendar again to continue.'; return;
      }
      request('complete_calendar_connection', returned);
    } catch (error) {
      if (expectedGeneration === generation && calendarReturn) message.textContent = 'Select Finish connecting to confirm the calendar connection in this browser.';
    }
  }
  var brandMark = typeof window.MCBrandMark === 'function' ? window.MCBrandMark : function () { return ''; };
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function deliveryStatus(job, calendar) {
    var title = calendar ? 'Calendar visit ' + job.bookingId : labelState(job.purpose);
    var detail = job.detail || '', next = calendar && job.nextAttemptAt && new Date(job.nextAttemptAt);
    if (calendar && job.reasonCode === 'calendar_budget_exhausted') detail = 'Your visit is saved. Calendar sync will continue automatically when capacity renews.';
    var note = detail ? '<p class="connection-note">' + esc(detail) + '</p>' : '';
    if (!calendar && /^sms_budget_/.test(job.reasonCode || '')) note += '<p class="connection-note">Machines &amp; Cloud manages this delivery check. Your message stays saved.</p>';
    if (next && Number.isFinite(next.getTime())) note += '<p class="connection-note">Resumes after <time datetime="' + esc(next.toISOString()) + '">' + esc(next.toLocaleString(undefined, { month:'short', day:'numeric', hour:'numeric', minute:'2-digit', timeZoneName:'short' })) + '</time>.</p>';
    return '<li data-delivery-status="' + (calendar ? 'calendar' : 'message') + '">' + esc(title) + ' · ' + esc(labelState(job.state)) + note + '</li>';
  }
  function button(action, label) { return '<button type="button" class="btn-pill btn-pill-blue btn-sm" data-connection="' + action + '">' + (/calendar/.test(action) ? brandMark('calendar') : '') + esc(label) + '</button>'; }
  function money(cents) { return new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' }).format(cents / 100); }
  function labelState(value) { return String(value || 'not active').replace(/_/g, ' '); }
  var reviewLegalDraft=null,privateReviewAction=null;
  function registrationFields(client) {
    var draft=data&&data.serviceIntake&&data.serviceIntake.sms;reviewLegalDraft=null;
    if(draft&&draft.complete&&draft.business.ein){reviewLegalDraft=JSON.parse(JSON.stringify(Object.assign({},draft.business,{representative:draft.representative})));return '<h3>Registered business</h3><p>'+esc(draft.business.legalName)+' · EIN ending '+esc(draft.business.ein.slice(-4))+'</p><p>'+esc([draft.business.street,draft.business.city,draft.business.state,draft.business.zip].filter(Boolean).join(', '))+'</p><h3>Authorized representative</h3><p>'+esc(draft.representative.firstName+' '+draft.representative.lastName)+' · '+esc(draft.representative.email)+'</p><button type="button" class="connection-guide-link" data-connection="edit_sms_intake">Edit registration details</button>';}
    var legal = client.business.legal || {}, names = client.owner.name.trim().split(/\s+/);
    return '<h3>Registered business</h3><p>These details are used for your carrier registration. They are not saved in your signup draft.</p>' + field('legalName','Legal business name',legal.legalName || client.business.name) + field('ein','EIN','') + '<label class="form-label">Business type<select class="form-input" name="businessType"><option value="llc">LLC</option><option value="corporation">Corporation</option><option value="partnership">Partnership</option></select></label>' + field('street','Registered street address',legal.street) + field('street2','Suite or unit','','text',true) + field('city','City',legal.city || client.business.city) + field('state','State abbreviation',legal.state || 'TX') + field('zip','ZIP code',legal.zip) + field('website','Public business website',client.business.website,'url') + '<h3>Authorized representative</h3>' + field('firstName','First name',names[0]) + field('lastName','Last name',names.slice(1).join(' ')) + field('email','Work email',client.owner.email,'email') + field('phone','US mobile number (+1…)',client.owner.phone,'tel') + field('title','Job title','') + '<label class="form-label">Position<select class="form-input" name="jobPosition"><option value="CEO">Owner / CEO</option><option value="General_Manager">General manager</option><option value="CFO">CFO</option><option value="VP">VP</option><option value="Director">Director</option><option value="Other">Other</option></select></label>';
  }
  function registrationDetails(form) {
    if(reviewLegalDraft)return JSON.parse(JSON.stringify(reviewLegalDraft));
    var details = {}, representative = {};
    ['legalName','ein','businessType','street','street2','city','state','zip','website'].forEach(function (key) { details[key] = form.get(key); });
    ['firstName','lastName','email','phone','title','jobPosition'].forEach(function (key) { representative[key] = form.get(key); });
    details.state = details.state.toUpperCase(); details.representative = representative; return details;
  }
  function submissionId() { var bytes = new Uint8Array(16); crypto.getRandomValues(bytes); return Array.from(bytes).map(function (byte) { return byte.toString(16).padStart(2,'0'); }).join(''); }
  function hasJourney(d) { return Array.isArray(d.setup?.connectionJourney?.channels) && d.setup.connectionJourney.channels.length===4; }
  var readinessRefreshPending=false, connectionRefreshFocus=null;
  function journeyRows(d) {
    var rows=d.setup.connectionJourney.channels;
    var detailed=rows.every(function(row){return row.action&&typeof row.automation==='string'&&typeof row.ownerTask==='string'&&typeof row.readyWhen==='string';});
    if(detailed){readinessRefreshPending=false;return rows;}
    // PUT confirms saved facts; only the full GET projection supplies current
    // provider readiness and offers. Keep the overview visible during that read.
    if(!readinessRefreshPending){readinessRefreshPending=true;requestAnimationFrame(function(){if(data===d&&currentSession())document.dispatchEvent(new CustomEvent('mc:desk-refresh'));});}
    return rows.map(function(row){
      var service=row.id==='voice'?d.connections.voice:row.id==='sms'?d.connections.messaging:row.id==='calendar'?d.connections.calendar:d.setup.channels.web;
      var retained=!!service.operation||row.id==='calendar'&&service.connected||row.id==='web'&&service.active;
      return Object.assign({},row,{retained:!!retained,active:false,status:row.requested||retained?'checking_status':'not_selected',responsibility:'customer',detail:'Your business details are saved. Checking the current connection status.',nextStep:'Read the latest saved status before continuing setup.',automation:'The current setup and delivery details will appear after the status check.',ownerTask:'Use the next step shown after your saved status is checked.',readyWhen:'Each service shows its own connection and delivery checks.',action:{kind:'connection',target:'check_status',label:'Check saved status'}});
    });
  }
  function journeyAction(row,seen) {
    var action=row.action,key=action.kind+':'+action.target;
    if(row.status==='not_selected')return '<button type="button" class="btn-pill btn-pill-blue btn-sm" data-journey-choose="'+esc(row.id)+'">Choose '+esc(row.id==='sms'?'two-way texting':row.id==='calendar'?'Google Calendar':row.label.toLowerCase())+'</button>';
    if(action.kind==='wait')return '<span class="connection-guide-wait">'+esc(action.label||row.nextStep)+'</span>';
    if(seen[key])return '<button type="button" class="connection-guide-link" data-journey-jump="'+esc(seen[key])+'">'+esc(action.kind==='route'?(action.target==='know'?'Use the shared business review above':'Use the shared private practice above'):'Included in the shared service review above')+'</button>';
    if(action.kind==='route'&&['know','test','setup','leads','availability'].includes(action.target)){seen[key]=row.id;return '<button type="button" class="btn-pill btn-pill-blue btn-sm" data-journey-route="'+action.target+'">'+esc(action.label)+'</button>';}
    var allowed=['review_setup','review_voice','review_sms','start_calendar','show_phone_steps','show_text_steps','show_calendar_steps','renew_text_probe','check_status'];
    if(action.kind==='connection'&&allowed.includes(action.target)){seen[key]=row.id;return button(action.target,action.label);}
    return '<span class="connection-guide-wait">'+esc(row.nextStep)+'</span>';
  }
  function renderJourney(d) {
    if(!hasJourney(d))return false;
    var node=$('connectionJourney'),focused=node.contains(document.activeElement)?document.activeElement:null,focusData=focused?{connection:focused.dataset.connection,route:focused.dataset.journeyRoute,detail:focused.dataset.journeyDetail}:connectionRefreshFocus,expanded=node.querySelector('[data-journey-detail][aria-expanded="true"]')?.dataset.journeyDetail,seen={};
    var rows=journeyRows(d),counts={},closed=['cancelled','archived'].includes(d.client.status);
    function actionKey(row){return row.action.kind+':'+row.action.target;}
    rows.forEach(function(row){var key=actionKey(row);if(row.status!=='not_selected'&&row.action.kind!=='wait')counts[key]=(counts[key]||0)+1;});
    function commonAction(row){return !closed&&row.status!=='not_selected'&&(counts[actionKey(row)]>1||row.action.kind==='route'&&['know','test'].includes(row.action.target));}
    var shared=[];rows.forEach(function(row){var key=actionKey(row);if(commonAction(row)&&!shared.some(function(item){return actionKey(item)===key;}))shared.push(row);});
    var sharedHtml=shared.map(function(row){var title=row.action.target==='know'?'Your business details, reviewed once':row.action.target==='test'?'Try the answers used across your services':row.action.target==='check_status'?'Check your updated setup':'Phone and text setup review';return '<div class="connection-guide-shared" id="connection-guide-shared-'+row.id+'"><div><strong>'+title+'</strong><p>'+esc(row.nextStep)+'</p></div>'+journeyAction(row,seen)+'</div>';}).join('');
    var purpose={web:'Answer website visitors and keep their requests in your workspace.',voice:'Answer calls through your existing business line or a dedicated front desk number.',sms:'Exchange customer texts from your dedicated front desk number.',calendar:'Send saved visits and changes to the Google calendar you authorize.'};
    var badges={limited:'AI allowance reached',not_selected:'Not selected',active:'Connection verified',connected:'Google permission saved',ready_for_website:'Website setup needed',paused:'Paused',closed:'Workspace cancelled',cancelled:'Disconnected',waiting_carrier:'Carrier review',checking:'Checking saved result',checking_status:'Checking saved status',cleanup_uncertain:'Checking cleanup',cleanup_pending:'Checking cleanup',cancel_pending:'Checking cleanup',needs_attention:'Needs attention',working:'Setup in progress'};
    node.innerHTML='<section class="connection-guide" aria-labelledby="connectionOverviewTitle">'+sharedHtml+'<div class="connection-guide-grid">'+rows.map(function(row){
      var badge=closed?'Workspace closed':row.id==='calendar'&&d.connections.calendar.connected?'Google permission saved':badges[row.status]||(row.responsibility==='platform'?'Waiting for service':'Your next step'),common=commonAction(row),open=expanded===row.id,unselected=row.status==='not_selected';
      var detail=unselected||common?purpose[row.id]:row.nextStep||row.detail;
      var retained=!row.requested&&row.retained?'<p class="connection-guide-retained">Not selected for new setup. Existing permissions or setup are retained; use the connection controls to disconnect.</p>':'';
      var action=closed?'<span class="connection-guide-wait">Saved records remain available.</span>':common?'<span class="connection-guide-shared-note">Complete the shared step above</span>':row.id==='web'&&!row.requested?'<button type="button" class="btn-pill btn-pill-blue btn-sm" data-journey-choose="web">Choose website setup</button>':journeyAction(row,seen);
      var phoneDetails=!closed&&row.id==='voice'&&(row.requested||row.retained)?'<button type="button" class="connection-guide-link" data-connection="review_phone_details">Review phone details</button>':'';
      return '<article class="connection-guide-card" id="connection-guide-'+row.id+'" data-channel="'+row.id+'" data-responsibility="'+row.responsibility+'"><header><h4 class="brand-lockup">'+brandMark(row.id)+'<span>'+esc(row.id==='sms'?'Two-way texting':row.label)+'</span></h4><span class="connection-guide-badge">'+esc(badge)+'</span></header><p class="connection-guide-detail">'+esc(detail)+'</p>'+retained+'<div class="connection-guide-actions">'+action+phoneDetails+'<button type="button" class="connection-guide-disclosure" data-journey-detail="'+row.id+'" aria-expanded="'+open+'" aria-controls="connection-guide-flow-'+row.id+'">What happens next <span aria-hidden="true">'+(open?'−':'+')+'</span></button></div><div class="connection-guide-flow" id="connection-guide-flow-'+row.id+'"'+(open?'':' hidden')+'><p>'+esc(row.detail)+'</p><dl><div><dt>We handle</dt><dd>'+esc(row.automation)+'</dd></div><div><dt>Your part</dt><dd>'+esc(row.ownerTask)+'</dd></div><div><dt>Ready when</dt><dd>'+esc(row.readyWhen)+'</dd></div></dl></div></article>';
    }).join('')+'</div><div class="connection-workspace-destination"><div><strong>Customer requests stay together</strong><p>Use Inbox for callback requests and conversations, and Schedule for saved visits. Check delivery status before treating a message as delivered or a visit as synced.</p></div><div><button type="button" class="connection-guide-link" data-journey-route="leads">Open Inbox</button><button type="button" class="connection-guide-link" data-journey-route="availability">Open Schedule</button></div></div><div class="connection-guide-refresh"><p id="connectionRefreshStatus">Check saved setup progress at any time.</p>'+button('check_status','Check saved status')+'</div></section>';
    if(focusData){var replacement=Array.from(node.querySelectorAll('button')).find(function(button){return focusData.connection&&button.dataset.connection===focusData.connection||focusData.route&&button.dataset.journeyRoute===focusData.route||focusData.detail&&button.dataset.journeyDetail===focusData.detail;});if(replacement){replacement.focus({preventScroll:true});connectionRefreshFocus=null;}}
    return true;
  }
  function revealConnectionStep(id) { var target=$(id);if(!target)return;var parent=target.parentElement;while(parent){if(parent.tagName==='DETAILS')parent.open=true;parent=parent.parentElement;}target.hidden=false;target.tabIndex=-1;target.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});target.focus({preventScroll:true}); }
  function showSetupStep(id) {
    if (!currentSession()) return;
    var run = generation;
    document.dispatchEvent(new CustomEvent('mc:desk-route', { detail: { tab: 'setup' } }));
    requestAnimationFrame(function () { if (currentSession() && run === generation && document.body.dataset.activePage === 'setup') revealConnectionStep(id); });
  }

  function setupPlan(d,guideShown) {
    var plan = d.serviceOnboarding;
    if (!plan || !plan.requestedChannels || !plan.requestedChannels.length) return '';
    if ((plan.reasonCode === 'existing_setup' || plan.legacySetup) && !plan.operation) return '';
    var operation = plan.operation, content = '<div class="connection-plan"><div class="connection-plan-heading"><div><h4>Approved setup progress</h4></div><span class="connection-badge">' + esc(operation ? labelState(operation.state) : plan.available ? 'Ready to review' : 'Not available yet') + '</span></div>';
    content += '<p>Your saved review covers only the services you approved. We prepare those connections in the background; other selected services wait for their own available review.</p>';
    if (operation) {
      content += '<p role="status">' + esc(operation.detail) + '</p><ol class="connection-progress"><li>Business details saved</li><li>' + (d.phoneActivation?.operation?.state === 'number_acquired' ? 'Front desk number reserved' : operation.numberRequested ? 'Number request saved' : 'Approval saved; number setup queued') + '</li>';
      if ((operation.requestedChannels || plan.acceptedChannels || plan.requestedChannels).includes('voice')) content += '<li>' + esc(d.connections.voice.active ? 'Phone answering verified' : operation.voiceRequested ? 'Phone answering setup requested' : 'Phone answering follows number setup') + '</li>';
      if ((operation.requestedChannels || plan.acceptedChannels || plan.requestedChannels).includes('sms')) content += '<li>' + esc(d.connections.messaging.active ? 'Text messaging verified' : operation.messagingRequested ? 'Text registration requested' : 'Text registration follows number setup') + '</li>';
      content += '</ol>';
      if (operation.nextAction === 'review_existing_connections') content += '<p>Review the connection details below to finish any requested correction or verification.</p>';
      if (!operation.cancellationRequested && !['cancelled','complete','completed'].includes(operation.state)) content += '<button type="button" class="btn-pill btn-pill-dark btn-sm" data-connection="cancel_setup">Cancel connection setup</button>';
    }
    var proof = d.client.setupProof || {}, reviewed = proof.reviewedRevision === d.configurationRevision, tested = proof.testedRevision === d.configurationRevision && proof.testMode === 'live';
    if (!guideShown && plan.available && (!operation || operation.state === 'needs_review')) content += !reviewed ? '<p>First check the business details your front desk will use.</p>' + button('review_business', 'Review business details') : !tested ? '<p>Try a private customer conversation before connecting your services.</p>' + button('try_frontdesk', 'Try your front desk') : button('review_setup', operation ? 'Review updated setup' : 'Review and connect');
    else if (!guideShown && !operation) content += '<p class="connection-note">Phone and text connections are not available yet. Your choices are saved; nothing is being purchased or activated.</p>';
    if(guideShown&&!operation)return '';
    return guideShown?'<details class="connection-guide-management"><summary>Manage approved phone and text setup</summary>'+content+'</div></details>':content+'</div>';
  }
  function render(d) {
    if (!d.connections) return; var wasRefreshing=connectionRefreshInFlight;data = d;
    var guideShown=renderJourney(d), c = d.connections, requested = d.client.onboarding.desiredChannels || [], html = setupPlan(d,guideShown), coordinated = !!d.serviceOnboarding && !d.serviceOnboarding.legacySetup && d.serviceOnboarding.reasonCode !== 'existing_setup';
    var numberCard = $('phoneSetupCard');
    if (numberCard && coordinated && (d.serviceOnboarding.requestedChannels || []).length) numberCard.hidden = true;
    if(c.voice.active || c.messaging.active){$('status').textContent='Front desk active';if(!guideShown)html+='<p>'+button('pause_services','Pause front desk')+'</p>';}
    else if(!guideShown&&d.client.status==='paused' && (requested.indexOf('voice')>=0 || requested.indexOf('sms')>=0))html+='<p>'+button('resume_services','Resume connections')+'</p>';
    if ((!guideShown && requested.indexOf('calendar') >= 0) || c.calendar.connected || c.calendar.availabilityConsentRequired || calendarReturn) html += '<div class="setup-step" id="calendarConnectionSteps"><div><h4 class="brand-lockup">' + brandMark('calendar') + '<span>Keep visits on your calendar</span></h4><p>' + esc(c.calendar.detail) + '</p><p>After the current access review, busy time on your connected calendar and saved workspace visits are checked before new reservations. Keep your offered arrival windows and crew capacity up to date.</p>' + (calendarReturn ? button('finish_calendar', 'Finish connecting Google Calendar') : c.calendar.connected ? button('disconnect_calendar', 'Disconnect Calendar') : c.calendar.available ? button('start_calendar', c.calendar.reconnectRequired ? 'Reconnect Google Calendar' : 'Connect Google Calendar') : '<p>Calendar connection is being prepared. Your preference is saved.</p>') + (c.calendar.availabilityConsentRequired ? button('disconnect_calendar','Disconnect retained Calendar access') : '') + '</div></div>';
    if ((!guideShown && !coordinated && requested.indexOf('voice') >= 0) || c.voice.operation) html += '<div class="setup-step" id="phoneConnectionSteps"><div><h4>Answer your calls</h4><p>' + esc(c.voice.operation ? c.voice.operation.detail : 'Your answering service is prepared after a number is reserved and you review the usage terms.') + '</p>' + (!coordinated && c.voice.available && (!c.voice.operation || ['needs_review','suspended','waiting_platform'].includes(c.voice.state)) && d.phoneActivation.operation && d.phoneActivation.operation.state === 'number_acquired' ? button('review_voice', 'Review phone answering') : '') + (c.voice.operation && c.voice.operation.state !== 'cancelled' ? button('cancel_voice', 'Disconnect phone answering') : '') + '</div></div>';
    if (c.voice.operation?.number && c.voice.forwarding) {
      var forwarding=c.voice.forwarding;
      html += '<div class="setup-step" id="phoneRoutingSteps"><div><h4>'+(forwarding.manualCarrierStep?'Route your business line':'Test your new front desk number')+'</h4><p>'+esc(forwarding.short)+'</p>';
      if(forwarding.sourceNumber)html+='<p><strong>Business line:</strong> '+esc(forwarding.sourceNumber)+'<br><strong>Front desk destination:</strong> '+esc(forwarding.targetNumber)+'</p>';
      if(forwarding.steps?.length)html+='<ol class="connection-guide-instructions">'+forwarding.steps.map(function(step){return'<li>'+esc(step)+'</li>';}).join('')+'</ol>';
      if(forwarding.note)html+='<p>'+esc(forwarding.note)+'</p>';
      var official=(forwarding.guides||[]).filter(function(guide){try{var url=new URL(guide.url);return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&['www.att.com','www.verizon.com','www.t-mobile.com'].includes(url.hostname);}catch(error){return false;}});
      if(official.length)html+='<div class="connection-guide-links">'+official.map(function(guide){return'<a href="'+esc(guide.url)+'" target="_blank" rel="noopener noreferrer">'+esc(guide.label)+' ↗</a>';}).join('')+'</div>';
      if(forwarding.needsBusinessNumber)html+=button('review_business','Review business details');
      html+='</div></div>';
    }
    if ((!guideShown && !coordinated && requested.indexOf('sms') >= 0) || c.messaging.operation) html += '<div class="setup-step" id="textConnectionSteps"><div><h4>Text from your front desk number</h4><p>' + esc(c.messaging.operation ? c.messaging.operation.detail : c.messaging.detail) + '</p>' + (c.messaging.available && c.messaging.operation?.customerAction === 'renew_setup_text' ? button('renew_text_probe','Request a new setup text') : c.messaging.operation?.customerAction === 'reply_to_setup_text' && c.messaging.operation.probe ? '<p>When the setup text arrives at ' + esc(c.messaging.operation.probe.to) + ', reply ' + esc(c.messaging.operation.probe.nonce) + ' to confirm.</p>' : '') + (c.messaging.available && (!coordinated || c.messaging.operation?.customerAction === 'correct_registration') && (!c.messaging.operation || c.messaging.operation.customerAction === 'correct_registration') && d.phoneActivation.operation && d.phoneActivation.operation.state === 'number_acquired' ? button('review_sms', c.messaging.operation ? 'Review registration details' : 'Review texting setup') : '') + (c.messaging.operation && !c.messaging.operation.cancellationRequested && c.messaging.operation.state !== 'cancelled' ? button('cancel_sms', 'Disconnect texting') : '') + '</div></div>';
    if (c.delivery.total || c.calendarDelivery.total) html += '<details><summary>Recent delivery status</summary><p>Saved requests stay in your workspace. Provider acceptance and confirmed delivery are tracked separately.</p><ul>' + c.delivery.jobs.map(function (j) { return deliveryStatus(j,false); }).concat(c.calendarDelivery.jobs.map(function (j) { return deliveryStatus(j,true); })).join('') + '</ul></details>';
    container.innerHTML = html;var controls=$('connectionServiceDetails');if(controls)controls.hidden=!html.trim();
    connectionRefreshInFlight=false;if(wasRefreshing&&message.textContent==='Checking saved connection status…')message.textContent='Saved connection status updated.';if(['Your fresh verification request is saved. Checking its current steps…','We could not confirm the renewal response. Checking your saved texting setup.'].includes(message.textContent))message.textContent='Saved texting status updated. Follow the current verification step above.';scheduleConnectionRefresh();
    var states = $('channelStates');
    if(states&&hasJourney(d)){var statusLabels={limited:'AI allowance reached',ready_for_website:'ready for website setup',active:'verified',connected:'permission saved · ready to sync',needs_action:'setup needed',waiting_platform:'waiting for service',waiting_carrier:'carrier review',working:'setup in progress',paused:'paused',closed:'workspace cancelled',cleanup_pending:'checking cleanup',cleanup_uncertain:'checking cleanup',cancel_pending:'checking cleanup',cancelled:'disconnected'};states.innerHTML=d.setup.connectionJourney.channels.map(function(row){return '<span class="channel-state">'+esc(row.label)+': '+esc(statusLabels[row.status]||labelState(row.status))+'</span>';}).join('');}
    else if(states) states.innerHTML = '<span class="channel-state">Website chat: ' + (d.webAvailable ? 'active' : 'not active') + '</span><span class="channel-state">Phone: ' + (c.voice.active ? 'active' : esc(labelState(c.voice.state))) + '</span><span class="channel-state">Texts: ' + (c.messaging.active ? 'active' : esc(labelState(c.messaging.state))) + '</span><span class="channel-state">Google permission: ' + esc(labelState(c.calendar.status)) + '</span>' + (c.calendar.connected ? '<span class="channel-state">Calendar delivery: ' + (c.calendarDelivery.enabled ? 'ready to sync' : 'waiting for service') + '</span>' : '');
  }
  var connectionRefreshTimer=null,connectionAutoReads=0,connectionRefreshInFlight=false;
  var connectionRefreshDelays=[15000,30000,60000,60000,60000,60000];
  function connectionRefreshStop(){if(connectionRefreshTimer)clearTimeout(connectionRefreshTimer);connectionRefreshTimer=null;}
  function connectionHasWork(){if(!data)return false;var states=['queued','running','awaiting_number','waiting_number','connecting','preparing','creating_assistant','importing_number','configuring_routing','uncertain'];return [data.serviceOnboarding?.operation,data.phoneActivation?.operation,data.connections?.voice?.operation,data.connections?.messaging?.operation].some(function(operation){return operation&&states.includes(operation.state);})||Object.values(data.leadConnections||{}).some(function(row){return row&&(['awaiting_provider','preparing','configuring','setup_unconfirmed','waiting_platform'].includes(row.state)||row.setupRequest?.state==='waiting_platform');});}
  function connectionCanRefresh(){var modal=document.querySelector('dialog[open]'),waitingLead=modal?.id==='leadSourceDialog'&&modal.dataset.connectorStage==='waiting'&&modal.getAttribute('aria-busy')!=='true';return data&&currentSession()&&document.body.dataset.activePage==='setup'&&document.body.dataset.workspaceState==='ready'&&!$('portalContent').hidden&&document.visibilityState==='visible'&&!busy&&!connectionRefreshInFlight&&(!modal||waitingLead)&&connectionHasWork();}
  function scheduleConnectionRefresh(){connectionRefreshStop();var status=$('connectionRefreshStatus');if(status)status.textContent=connectionAutoReads>=6?'Automatic status checks paused. You can check saved status again below.':connectionHasWork()?'Progress updates while setup is running. The background setup continues if you leave this page.':'Check saved setup progress at any time.';if(connectionAutoReads>=6||!connectionCanRefresh())return;var expectedGeneration=generation;connectionRefreshTimer=setTimeout(function(){connectionRefreshTimer=null;if(expectedGeneration!==generation||!connectionCanRefresh())return;connectionAutoReads++;connectionRefreshInFlight=true;document.querySelectorAll('[data-connection="check_status"]').forEach(function(button){button.disabled=true;});document.dispatchEvent(new CustomEvent('mc:desk-refresh'));},connectionRefreshDelays[connectionAutoReads]);}
  document.addEventListener('visibilitychange',scheduleConnectionRefresh);window.addEventListener('hashchange',scheduleConnectionRefresh);document.addEventListener('close',scheduleConnectionRefresh,true);
  var connectionRefreshObserver=new MutationObserver(scheduleConnectionRefresh);connectionRefreshObserver.observe(document.body,{subtree:true,attributes:true,attributeFilter:['data-active-page','data-workspace-state','open','data-connector-stage','aria-busy']});
  document.addEventListener('mc:desk', function (event) { render(event.detail); resumeApproval(); if (calendarNotice) { message.textContent = calendarNotice; calendarNotice = ''; } continueCalendarReturn(event.detail); });
  $('deskSignOut').addEventListener('click', function () { generation++; connectionRefreshStop(); connectionRefreshInFlight=false; busy=false; mutationReadback=null; data = null; calendarReturn = null; clearApproval(); if (dialog.open) dialog.close(); dialog.innerHTML = ''; container.innerHTML = ''; });
  document.addEventListener('mc:session-expired',function () { generation++; connectionRefreshStop(); connectionRefreshInFlight=false; busy=false; mutationReadback=null; data = null; calendarReturn = null; clearApproval(); if (dialog.open) dialog.close(); dialog.innerHTML = ''; });
  function review(title, content, submitLabel, onSubmit) {
    if (savedSetupReadback) { showSavedSetupReadback(savedSetupReadback.confirmed ? 'Your approval is saved. Check its current progress before making another setup change.' : 'Check whether your earlier request was saved before submitting another approval.'); return; }
    dialog.innerHTML = '<form id="connectionForm"><h2 id="connectionTitle">' + esc(title) + '</h2>' + content + '<p id="connectionDialogMessage" role="status" aria-live="polite"></p><div class="walkthrough-actions"><button type="submit" class="btn-pill btn-pill-blue btn-sm">' + esc(submitLabel) + '</button><button type="button" class="btn-pill btn-pill-dark btn-sm" id="connectionBack">Back</button></div></form>';
    $('connectionBack').onclick = function () { if (!busy) dialog.close(); };
    $('connectionForm').onsubmit = function (event) { event.preventDefault(); if (!busy && event.target.reportValidity()) onSubmit(new FormData(event.target)); }; dialog.showModal();
  }
  dialog.addEventListener('cancel', function (event) { if (busy) event.preventDefault(); });
  dialog.addEventListener('close', function () { dialog.innerHTML = ''; });
  function showSavedSetupReadback(text, failed) {
    var confirmed = savedSetupReadback?.confirmed === true;
    dialog.innerHTML = '<section><h2 id="connectionTitle">'+(confirmed?'Your setup request is saved':'Check your setup request')+'</h2><p>'+(confirmed?'We are checking its latest progress so you can continue from the right step.':'We will check whether your last request was saved before another approval.')+'</p><p id="connectionDialogMessage" role="status" aria-live="polite"></p><div class="walkthrough-actions"><button type="button" class="btn-pill btn-pill-blue btn-sm" id="connectionReadbackRetry">Check saved setup</button><button type="button" class="btn-pill btn-pill-dark btn-sm" id="connectionBack">Close</button></div></section>';
    $('connectionDialogMessage').textContent = text || 'Checking your saved setup…'; $('connectionDialogMessage').dataset.error = String(!!failed);
    $('connectionReadbackRetry').disabled = busy; $('connectionBack').disabled = busy;
    $('connectionReadbackRetry').onclick = function () { readSavedSetup(); };
    $('connectionBack').onclick = function () { if (!busy) dialog.close(); };
    if (!dialog.open) dialog.showModal();
  }
  async function readSavedSetup(alreadyBusy) {
    var held = savedSetupReadback;
    if (!held || busy && alreadyBusy !== true || !currentSession() || held.generation !== generation) return;
    busy = true; showSavedSetupReadback('Checking this setup request and its next step…');
    var controller = new AbortController(), timeout = setTimeout(function () { controller.abort(); }, 15000);
    try {
      var receiptResponse = await fetch(base + '/api/client?c=' + encodeURIComponent(slug) + '&service_approval=' + encodeURIComponent(held.submissionId), { headers: { Authorization: 'Bearer ' + session }, cache: 'no-store', signal: controller.signal });
      if (held.generation !== generation || !currentSession()) return;
      if (receiptResponse.status === 401 || receiptResponse.status === 403) { document.dispatchEvent(new CustomEvent('mc:session-expired')); return; }
      var receipt = await receiptResponse.json(), approval = receipt.approval;
      if (held.generation !== generation || !currentSession()) return;
      if (!receiptResponse.ok || receipt.ok !== true || approval?.submissionId !== held.submissionId || approval.state !== 'accepted' || !approval.operationId || !Number.isSafeInteger(approval.generation)) throw new Error('This setup request is not yet confirmed.');
      held.confirmed = true; held.operationId = approval.operationId; held.operationGeneration = approval.generation;
      try { await rememberApproval(); } catch (error) { /* The original submission remains retained in memory and storage. */ }
      var response = await fetch(base + '/api/client?c=' + encodeURIComponent(slug), { headers: { Authorization: 'Bearer ' + session }, cache: 'no-store', signal: controller.signal });
      if (held.generation !== generation || !currentSession()) return;
      if (response.status === 401 || response.status === 403) { document.dispatchEvent(new CustomEvent('mc:session-expired')); return; }
      var latest = await response.json();
      if (held.generation !== generation || !currentSession()) return;
      if (!response.ok || latest.error || latest.ok === false || latest.client?.slug !== slug || !latest.setup?.connectionJourney || latest.serviceOnboarding?.operation?.id !== held.operationId || latest.serviceOnboarding.operation.generation !== held.operationGeneration) throw new Error('The saved approval could not be matched to its current setup.');
      // The main workspace owns applying a full response and retaining newer
      // business/account drafts. Wait until that exact canonical state is shown.
      await new Promise(function (resolve, reject) {
        var timer = setTimeout(function () { finish(new Error('The latest setup could not be displayed.')); }, 5000);
        function finish(error) { clearTimeout(timer); document.removeEventListener('mc:desk', observed); error ? reject(error) : resolve(); }
        function observed(event) { if (!currentSession() || held.generation !== generation) return finish(new Error('This workspace session changed.')); if (event.detail?.client?.slug === slug && event.detail.setup?.connectionJourney && event.detail.serviceOnboarding?.operation?.id === held.operationId && event.detail.serviceOnboarding.operation.generation === held.operationGeneration) finish(); }
        document.addEventListener('mc:desk', observed);
        document.dispatchEvent(new CustomEvent('mc:desk-snapshot', { detail: { snapshot: latest, session: session } }));
      });
      if (held.generation !== generation || !currentSession()) return;
      clearApproval(); if (dialog.open) dialog.close();
      message.textContent = 'Your approval is saved. The current setup step is ready.';
      if (held.restored) {
        var accepted = data?.serviceOnboarding?.operation?.acceptedChannels || [], service = accepted.includes(held.service) ? held.service : accepted.find(function (id) { return ['voice','sms'].includes(id); });
        if (service) document.dispatchEvent(new CustomEvent('mc:service-guide', { detail: { service: service } }));
      }
    } catch (error) {
      if (held.generation === generation && currentSession()) showSavedSetupReadback(held.confirmed ? 'Your approval is saved, but its latest progress could not be checked. Check saved setup again; your approval will not be submitted again.' : 'We could not confirm whether this request was saved. Keep it on hold and check saved setup again. Another approval will not be submitted.', true);
    } finally {
      clearTimeout(timeout);
      if (held.generation === generation && currentSession()) { busy = false; dialog.querySelectorAll('button').forEach(function (button) { button.disabled = false; }); scheduleConnectionRefresh(); document.dispatchEvent(new CustomEvent('mc:guide-state-change')); }
    }
  }
  function mutationReadbackNotice(state, text) {
    message.textContent=text;message.hidden=state!=='complete';
    document.dispatchEvent(new CustomEvent('mc:connection-readback', { detail: { state: state, message: text } }));
  }
  async function readMutationStatus(alreadyBusy) {
    var held=mutationReadback;
    if(!held||busy&&alreadyBusy!==true||held.generation!==generation||!currentSession())return;
    busy=true;connectionRefreshStop();
    mutationReadbackNotice('checking','Your change is saved. Checking the latest connection status…');
    if(dialog.open)dialog.close();
    var controller=new AbortController(),timeout=setTimeout(function(){controller.abort();},15000);
    try {
      var response=await fetch(base+'/api/client?c='+encodeURIComponent(slug),{headers:{Authorization:'Bearer '+session},cache:'no-store',signal:controller.signal});
      if(held!==mutationReadback||held.generation!==generation||!currentSession())return;
      if(response.status===401||response.status===403){document.dispatchEvent(new CustomEvent('mc:session-expired'));return;}
      var latest=await response.json();
      if(held!==mutationReadback||held.generation!==generation||!currentSession())return;
      if(!response.ok||latest.error||latest.ok===false||latest.client?.slug!==slug||!latest.setup?.connectionJourney)throw new Error('Latest connection status is unavailable.');
      await new Promise(function(resolve,reject){
        var timer=setTimeout(function(){finish(new Error('Updated status could not be displayed.'));},5000);
        function finish(error){clearTimeout(timer);document.removeEventListener('mc:desk',observed);error?reject(error):resolve();}
        function observed(event){
          if(held!==mutationReadback||held.generation!==generation||!currentSession())return finish(new Error('Workspace session changed.'));
          var shown=event.detail;
          if(shown?.client?.slug===slug&&shown.setup?.connectionJourney&&shown.configurationRevision===latest.configurationRevision&&shown.editRevision===latest.editRevision)finish();
        }
        document.addEventListener('mc:desk',observed);
        document.dispatchEvent(new CustomEvent('mc:desk-snapshot',{detail:{snapshot:latest,session:session}}));
      });
      if(held!==mutationReadback||held.generation!==generation||!currentSession())return;
      mutationReadback=null;mutationReadbackNotice('complete','Connection status updated.');
      if(held.serviceReturn)document.dispatchEvent(new CustomEvent('mc:connector-return',{detail:{service:held.serviceReturn}}));
      message.textContent=held.successMessage;
    } catch(error) {
      if(held===mutationReadback&&held.generation===generation&&currentSession())mutationReadbackNotice('failed','Your change is saved, but the updated status could not be checked. Check status again; your change will not be submitted again.');
    } finally {
      clearTimeout(timeout);
      if(held.generation===generation&&currentSession()){busy=false;scheduleConnectionRefresh();}
    }
  }
  document.addEventListener('mc:connection-readback-retry',function(){readMutationStatus();});
  async function request(action, fields) {
    if (busy || !data) return; if (mutationReadback) { readMutationStatus(); return; } if (savedSetupReadback) { readSavedSetup(); return; } busy = true; var expectedGeneration = generation, approvalDispatched = false;
    var controller=new AbortController(),timeout=setTimeout(function(){controller.abort();},20000);
    message.textContent = action === 'complete_calendar_connection' ? (fields.error ? 'Confirming your calendar choice…' : 'Connecting your Google Calendar…') : 'Saving your connection…'; dialog.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
    try {
      if (action === 'request_service_onboarding') {
        await approvalRestore;
        if (generation !== expectedGeneration || !currentSession()) return;
        if (savedSetupReadback) { clearTimeout(timeout); await readSavedSetup(true); return; }
        var accepted = fields.acceptedChannels || [], selectedService = $('setupGuide')?.dataset.guideSelectedService;
        savedSetupReadback = { generation: expectedGeneration, submissionId: fields.submissionId.toLowerCase(), confirmed: false, service: accepted.includes(selectedService) ? selectedService : accepted.find(function (id) { return ['voice','sms'].includes(id); }) || null, restored: false, resumeAttempted: true };
        if (!await rememberApproval()) return;
      }
      approvalDispatched = action === 'request_service_onboarding';
      var response = await fetch(base + '/api/client?c=' + encodeURIComponent(slug), { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:'Bearer ' + session }, body:JSON.stringify(Object.assign({ action:action }, fields || {})),signal:controller.signal });
      if (generation !== expectedGeneration) return;
      if (response.status===401 || response.status===403) { document.dispatchEvent(new CustomEvent('mc:session-expired')); return; }
      var result = await response.json(); if (generation !== expectedGeneration) return;
      if (!response.ok || !result.ok) throw new Error(result.message || 'The connection could not be confirmed. Refresh its status before retrying.');
      if (action === 'start_calendar_connection') {
        var destination = new URL(result.result.authorizationUrl); if (destination.protocol !== 'https:' || destination.hostname !== 'accounts.google.com') throw new Error('Google connection address could not be verified.');
        var state = destination.searchParams.get('state'), expiresAt = result.result.expiresAt, binding = await sessionBinding();
        if (!/^[a-f0-9]{64}$/.test(state || '') || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now()) throw new Error('Google connection expired before it could start. Try again.');
        if (generation !== expectedGeneration || !currentSession()) return;
        sessionStorage.setItem('mc-calendar-pending-v1', JSON.stringify({ slug:slug, state:state, expiresAt:expiresAt, sessionBinding:binding })); location.assign(destination.href); return;
      }
      if (action === 'complete_calendar_connection') clearCalendarReturn();
      if (action === 'request_service_onboarding') {
        savedSetupReadback.confirmed = true; try { await rememberApproval(); } catch (error) { /* The original submission remains retained. */ }
        clearTimeout(timeout); await readSavedSetup(true); return;
      }
      mutationReadback={generation:expectedGeneration,serviceReturn:action==='complete_calendar_connection'?'calendar':null,successMessage:action==='complete_calendar_connection'?result.result?.denied?'Calendar access was not granted. Your existing settings are unchanged.':result.connections?.calendar?.connected?'Google account access is saved. Next, check a saved visit’s Calendar delivery.':'Your calendar status is saved. Check its next step above.':'Your change is saved. Its current status is shown above.'};
      clearTimeout(timeout);await readMutationStatus(true);
    } catch (error) {
      if (expectedGeneration === generation) {
        if (action === 'request_service_onboarding' && savedSetupReadback) {
          if (approvalDispatched && !(response?.status >= 400 && response.status < 500)) { clearTimeout(timeout); await readSavedSetup(true); return; }
          clearApproval();
        }
        if (action === 'complete_calendar_connection') { clearCalendarReturn(); if (data) render(data); document.dispatchEvent(new CustomEvent('mc:desk-refresh')); }
        if (action === 'renew_messaging_probe') {if(dialog.open)dialog.close();var next=$('setupGuideContinue');if(next)next.disabled=true;document.dispatchEvent(new CustomEvent('mc:desk-refresh'));}
        (dialog.open ? $('connectionDialogMessage') : message).textContent = action==='renew_messaging_probe'&&(!response||response.ok)?'We could not confirm the renewal response. Checking your saved texting setup.':error.name==='AbortError'?'The request timed out. Your change may be saved; refresh its status before retrying.':error.message;
      }
    }
    finally { clearTimeout(timeout); if(generation===expectedGeneration){busy = false; dialog.querySelectorAll('button').forEach(function (b) { b.disabled = false; });scheduleConnectionRefresh();} }
  }
  function calendarDisclosure() {
    return '<section id="calendarAccessDisclosure" aria-label="Google Calendar access" data-disclosure-version="2026-10-24-busy-v1"><p>Keep saved visits in your primary Google Calendar. You choose whether to grant access on Google’s next screen.</p><p><strong>Access and use.</strong> Google asks for calendar details and access to events on calendars you own. We use your primary calendar identifier to create, check, update and delete the visit events this workspace manages. We read busy intervals on that calendar to avoid offering a window that conflicts with another appointment. Appointment titles, descriptions and other attendees’ identities are not imported. Saved workspace reservations and their matching Google copies count once.</p><p><strong>Storage and sharing.</strong> Google receives the visit details you sync. Netlify stores the calendar identifier, an encrypted refresh token, connection history and sync records, including visit details, with no automatic deletion. A short-lived availability cache stores event references, start and end times and workspace ownership tags; it is reused for up to 60 seconds. Booking and calendar changes check Google again. Google API responses and tokens aren’t sent to our AI provider; separately supplied customer conversations and visit details may be.</p><p><strong>Your control.</strong> Disconnect removes the stored refresh token and stops new sync; a request already sent may finish. It keeps Google’s permission, existing events, saved visits and history. Remove the app’s access in your Google Account if needed. For retained-record deletion help, email <a href="mailto:support@machinesandcloud.com">support@machinesandcloud.com</a>.</p><p><a href="privacy-policy.html#google-calendar" target="_blank" rel="noopener">Google Calendar privacy and data controls</a></p></section>';
  }
  function reviewCalendarConnection(revision) {
    review('Connect Google Calendar', calendarDisclosure(), 'Continue to Google', function () { request('start_calendar_connection', { expectedRevision:revision, availabilityConsentVersion:'2026-10-24-busy-v1' }); });
    // Keep the disclosure heading visible rather than autofocus-scrolling to a
    // link near the end of the text on a narrow screen.
    $('connectionTitle').tabIndex=-1;$('connectionTitle').focus({preventScroll:true});dialog.scrollTop=0;
  }
  function check(name, text) { return '<label style="display:flex;gap:10px;margin:16px 0"><input type="checkbox" name="' + name + '" required><span>' + esc(text) + '</span></label>'; }
  function field(name, label, value, type, optional) { return '<div class="form-group"><label class="form-label">' + esc(label) + '<input class="form-input" name="' + name + '" value="' + esc(value || '') + '" type="' + (type || 'text') + '" maxlength="500"' + (optional ? '' : ' required') + '></label></div>'; }
  function phoneRoutingFields(client) {
    var phone=client.phone||{},owner=client.owner||{},canForward=/^\+1[2-9]\d{2}[2-9]\d{6}$/.test(phone.businessNumber||'')&&phone.businessNumber!==owner.phone&&phone.businessNumber!==phone.twilioNumber;
    var forward=canForward&&client.onboarding.phoneSetupMode!=='use_new_number';
    return '<label class="form-label">Customers reach your front desk<select class="form-input" name="forwardingMode"><option value="forward_business_line"'+(canForward?'':' disabled')+(forward?' selected':'')+'>Through my existing business number</option><option value="use_new_number"'+(!forward?' selected':'')+'>On the new front desk number</option></select></label><p>'+(canForward?'Existing business line: '+esc(phone.businessNumber)+'. Your contact cell stays separate.':'To forward an existing line, first save a business number that is different from your contact cell. You can use a new front desk number without forwarding your existing line.')+'</p><button type="button" class="connection-guide-link" data-connection="review_phone_details">'+(canForward?'Edit phone details':'Add or review phone details')+'</button>';
  }
  async function loadPrivateReview(action){if(busy)return;busy=true;var run=generation,revision=data.configurationRevision;message.textContent='Loading your saved registration details…';try{var response=await fetch(base+'/api/client?c='+encodeURIComponent(slug)+'&service_intake=1',{headers:{Authorization:'Bearer '+session},cache:'no-store'});if(run!==generation||!currentSession())return;if(response.status===401||response.status===403){document.dispatchEvent(new CustomEvent('mc:session-expired'));return;}var result=await response.json();if(!response.ok||!result.serviceIntake||result.configurationRevision!==revision)throw new Error('Your saved setup changed. Check its status before reviewing.');data.serviceIntake=result.serviceIntake;privateReviewAction=action;busy=false;var button=document.createElement('button');button.dataset.connection=action;handleConnectionClick({target:button});}catch(error){if(run===generation)message.textContent=error.message||'Saved registration details could not be loaded. Try again.';}finally{if(run===generation)busy=false;}}
  function handleConnectionClick(event) {
    var target = event.target.closest('[data-connection],[data-journey-route],[data-journey-jump],[data-journey-detail],[data-journey-choose]'); if (!target || busy || !data) return;
    if(target.dataset.journeyDetail){var selected=target.dataset.journeyDetail,open=target.getAttribute('aria-expanded')!=='true';$('connectionJourney').querySelectorAll('[data-journey-detail]').forEach(function(button){var expanded=open&&button.dataset.journeyDetail===selected;button.setAttribute('aria-expanded',String(expanded));button.querySelector('span').textContent=expanded?'−':'+';$('connection-guide-flow-'+button.dataset.journeyDetail).hidden=!expanded;});return;}
    if(target.dataset.journeyJump){revealConnectionStep('connection-guide-'+target.dataset.journeyJump);return;}
    if(target.dataset.journeyChoose){var channel=target.dataset.journeyChoose;if(['paused','cancelled','archived'].includes(data.client.status)||!['web','voice','sms','calendar'].includes(channel))return;document.dispatchEvent(new CustomEvent('mc:connection-select',{detail:{service:channel}}));return;}
    if(target.dataset.journeyRoute){var tab=target.dataset.journeyRoute;if(!['know','test','setup','leads','availability'].includes(tab))return;document.dispatchEvent(new CustomEvent('mc:desk-route',{detail:{tab:tab}}));if(tab==='setup')requestAnimationFrame(function(){revealConnectionStep('websiteInstallCard');if(!$('websiteInstallEdit').hidden)$('websiteInstallWebsite').focus({preventScroll:true});});return;}
    if(target.dataset.connection==='edit_sms_intake'){if(dialog.open)dialog.close();document.dispatchEvent(new CustomEvent('mc:service-intake-open',{detail:{service:'sms'}}));return;}
    if(target.dataset.connection==='review_phone_details'){if(dialog.open)dialog.close();document.dispatchEvent(new CustomEvent('mc:desk-route',{detail:{tab:'know'}}));requestAnimationFrame(function(){revealConnectionStep('phoneProfileHeading');$('phoneBusinessNumber').focus({preventScroll:true});});return;}
    if(target.dataset.connection==='show_phone_steps'){showSetupStep('phoneRoutingSteps');return;}
    if(target.dataset.connection==='show_text_steps'){showSetupStep('textConnectionSteps');return;}
    if(target.dataset.connection==='show_calendar_steps'){showSetupStep('calendarConnectionSteps');return;}
    var action = target.dataset.connection, c = data.connections, revision = data.configurationRevision;
    if(['review_setup','review_sms'].includes(action)&&data.serviceIntake?.sms?.complete&&privateReviewAction!==action){loadPrivateReview(action);return;}
    privateReviewAction=null;
    if(action==='check_status'){if(connectionRefreshInFlight)return;if(document.activeElement===target)connectionRefreshFocus={connection:'check_status'};connectionRefreshStop();connectionRefreshInFlight=true;target.disabled=true;message.textContent='Checking saved connection status…';document.dispatchEvent(new CustomEvent('mc:desk-refresh'));return;}
    if (action === 'review_business' || action === 'try_frontdesk') return document.dispatchEvent(new CustomEvent('mc:desk-route', { detail: { tab: action === 'review_business' ? 'know' : 'test' } }));
    if (action === 'cancel_setup') return review('Cancel connection setup?', '<p>We stop new setup and reconcile any number or services already requested. Your business details and customer records remain saved.</p>', 'Cancel setup', function () { request('cancel_service_onboarding', { expectedRevision: revision, operationId: data.serviceOnboarding.operation.id }); });
    if (action === 'review_setup') {
      var plan = data.serviceOnboarding, quote = plan.offer, chosen = (quote && quote.scopeChannels || plan.authorizableChannels || plan.requestedChannels).slice();
      if (!plan.available || !quote) return;
      if(data.serviceIntake&&chosen.includes('sms')&&!data.serviceIntake.sms.complete){document.dispatchEvent(new CustomEvent('mc:service-intake-open',{detail:{service:'sms'}}));return;}
      if(data.serviceIntake&&chosen.includes('voice')&&(!data.serviceIntake.voice.complete||data.serviceIntake.voice.canApply)){document.dispatchEvent(new CustomEvent('mc:service-intake-open',{detail:{service:'voice'}}));return;}
      var content = '<p>Review only the services listed below. After approval, we continue their setup in the background. Other selected services wait for their own available review.</p><h3>Your front desk number</h3>'+(quote.numberCostAlreadyAccepted?'<p>Your existing dedicated number is retained. This review does not purchase a second number.</p>':'<p>'+money(quote.number.oneTimeCents)+' one-time and '+money(quote.number.monthlyCents)+' per month.</p><p>'+esc(quote.number.authorityText)+'</p>');
      if (chosen.includes('voice')) content += '<h3>Phone answering</h3><p>' + esc(quote.voice.usageDisclosure) + '</p><p>' + esc(quote.voice.authorityText) + '</p><p>Up to ' + esc(quote.voice.maxDailyCalls) + ' calls and ' + esc(quote.voice.maxDailyMinutes) + ' minutes per day, with a ' + esc(quote.voice.maxDurationSeconds) + '-second call limit.</p>'+phoneRoutingFields(data.client);
      if (chosen.includes('sms')) {
        content += '<h3>Customer texting</h3><p>Texts use your dedicated front desk number. Forwarding an existing line changes calls only.</p><p>Brand filing: ' + money(quote.messaging.brandRegistrationCents) + '. Campaign filing: ' + money(quote.messaging.campaignRegistrationCents) + '. Campaign registration: ' + money(quote.messaging.campaignMonthlyCents) + ' per month.</p><p>' + esc(quote.messaging.usageDisclosure) + '</p><p>' + esc(quote.messaging.authorityText) + '</p><details><summary>Your texts and customer consent</summary><p>' + esc(quote.program.description) + '</p><p>' + esc(quote.program.messageFlow) + '</p>' + quote.program.messageSamples.map(function (sample) { return '<p>' + esc(sample) + '</p>'; }).join('') + '</details>' + registrationFields(data.client);
        content += check('accuracy','These registered business details are accurate and I am authorized to register this business.') + check('consumerConsent','My business will obtain and record customer agreement before appointment texts. Customers can book without texting consent.') + check('testConsent','Send a setup verification text to my saved owner mobile number. I will reply to confirm delivery.');
      }
      content += check('costs','I accept the costs and usage terms shown for the services in this review.') + check('authority',quote.numberCostAlreadyAccepted?'I authorize Machines & Cloud to set up only the services listed in this review using my existing dedicated front desk number.':'I authorize Machines & Cloud to reserve my dedicated front desk number and set up only the services listed in this review.');
      var requestId = submissionId();
      return review('Review your front desk connections', content, 'Approve and start setup', function (form) {
        var body = { expectedRevision: revision, submissionId: requestId, offerDigest: quote.digest, acceptedChannels:chosen, acceptedCosts: true, authority: true };
        if (chosen.includes('voice')) body.forwardingMode = form.get('forwardingMode');
        if (chosen.includes('sms')) Object.assign(body, { legal: registrationDetails(form), attestLegalAccuracy: true, attestConsent: true, testPhoneConsent: true });
        request('request_service_onboarding', body);
      });
    }
    if(action==='pause_services')return review('Pause your front desk?','<p>Calls, customer texts, chat and calendar updates pause. Existing carrier forwarding may still need to be switched off. Your records remain saved.</p>','Pause front desk',function(){request('pause');});
    if(action==='resume_services')return request('resume_services',{expectedRevision:revision});
    if (action === 'start_calendar') return reviewCalendarConnection(revision);
    if (action === 'finish_calendar' && calendarReturn) return request('complete_calendar_connection', calendarReturn);
    if (action === 'disconnect_calendar') return review('Disconnect Google Calendar?', '<p>Disconnecting removes the stored refresh token and stops new sync. A request already sent may finish. Your Google permission, existing Google events, saved visits and sync history remain.</p><p>You can also <a href="https://myaccount.google.com/connections" target="_blank" rel="noopener">remove the app’s access in your Google Account</a>. For retained-record deletion help, email <a href="mailto:support@machinesandcloud.com">support@machinesandcloud.com</a>. <a href="privacy-policy.html#google-calendar" target="_blank" rel="noopener">Read the Calendar privacy details</a>.</p>', 'Disconnect Calendar', function () { request('disconnect_calendar'); });
    if (action === 'cancel_voice' || action === 'cancel_sms') return review('Disconnect this service?', '<p>New delivery will stop. We confirm provider cleanup in the background and retain your customer records. Number release waits until attached services are disconnected.</p>', 'Disconnect service', function () { request(action === 'cancel_voice' ? 'cancel_voice_activation' : 'cancel_messaging_activation', action === 'cancel_voice' ? { expectedRevision:revision } : { expectedRevision:revision, operationId:c.messaging.operation.id }); });
    if (action === 'renew_text_probe') {
      var operation = c.messaging.operation;
      if (!c.messaging.available || operation?.customerAction !== 'renew_setup_text' || !(operation.probe?.renewable || operation.probe?.expired)) return;
      return review('Verify texting on your mobile', '<p>We will prepare a fresh text for your saved mobile number, ' + esc(data.client.owner.phone) + '. Reply with its code when it arrives to confirm the connection.</p>' + check('testPhoneConsent','Send one new setup verification text to my saved mobile number.'), 'Request setup text', function () {
        request('renew_messaging_probe',{expectedRevision:revision,operationId:operation.id,expectedProbeNonce:operation.probe.nonce,testPhoneConsent:true});
      });
    }
    if (action === 'review_voice') {
      var offer = c.voice.offer;
      return review('Set up phone answering', '<p>' + esc(offer.usageDisclosure) + '</p><p>Up to ' + esc(offer.maxDurationSeconds) + ' seconds per call, ' + esc(offer.maxDailyCalls) + ' calls and ' + esc(offer.maxDailyMinutes) + ' minutes per day for your shop.</p>' + phoneRoutingFields(data.client) + '<p>A completed test call confirms the connection.</p>' + check('authority',offer.authorityText), 'Set up phone answering', function (form) { request('request_voice_activation',{ expectedRevision:revision, acceptedAuthority:true, policyVersion:offer.version, policyDigest:offer.digest, forwardingMode:form.get('forwardingMode') }); });
    }
    if (action !== 'review_sms') return;
    var sms = c.messaging, terms = sms.offer, client = data.client, legal = client.business.legal || {};
    var content = '<p>Mobile carriers require your registered business details. We prepare and track the application for you.</p><p>Brand filing: ' + money(terms.brandRegistrationCents) + '. Campaign filing: ' + money(terms.campaignRegistrationCents) + '. Campaign registration: ' + money(terms.campaignMonthlyCents) + ' monthly.</p><p>' + esc(terms.usageDisclosure) + '</p><details><summary>Review your texts and consent process</summary><p>' + esc(sms.program.description) + '</p><p>' + esc(sms.program.messageFlow) + '</p>' + sms.program.messageSamples.map(function (sample) { return '<p>' + esc(sample) + '</p>'; }).join('') + '</details>' + registrationFields(client) + check('authority',terms.authorityText) + check('costs','I accept the filing fees, recurring campaign costs and usage terms shown above.') + check('accuracy','These legal details are accurate and I am authorized to register this business.') + check('consumerConsent','My business will obtain and record customer agreement before appointment texts. Customers can book without texting consent.') + check('testConsent','Send a setup verification text to my saved owner mobile number. I will reply to confirm delivery.');
    review('Set up customer texting',content,sms.operation ? 'Save corrected details' : 'Submit texting setup',function (form) {
      var details = {}, representative = {}; ['legalName','ein','businessType','street','street2','city','state','zip','website'].forEach(function (key) { details[key] = form.get(key); }); ['firstName','lastName','email','phone','title','jobPosition'].forEach(function (key) { representative[key] = form.get(key); }); details.state = details.state.toUpperCase(); details.representative = representative;if(reviewLegalDraft)details=JSON.parse(JSON.stringify(reviewLegalDraft));
      var random = new Uint8Array(16); crypto.getRandomValues(random);
      var body = { expectedRevision:revision, submissionId:Array.from(random).map(function (byte) { return byte.toString(16).padStart(2,'0'); }).join(''), offerVersion:terms.version, offerDigest:terms.digest, programDigest:sms.program.digest, acceptedCosts:true, authority:true, attestLegalAccuracy:true, attestConsent:true, testPhoneConsent:true, legal:details };
      if (sms.operation) { body.operationId = sms.operation.id; body.expectedSubmissionRevision = sms.operation.submissionRevision; }
      request(sms.operation ? 'correct_messaging_activation' : 'request_messaging_activation',body);
    });
  }
  // Native Tab scrolling may put a connection control behind the fixed mobile
  // navigation. After that scroll settles, keep the actual focused control clear.
  function revealFocusedConnection(event) {
    var target=event.target;
    requestAnimationFrame(function () {
      if(!target.isConnected||document.activeElement!==target)return;
      var nav=document.querySelector('.desk-rail .tabs'),bottom=window.innerHeight-12;
      if(nav&&getComputedStyle(nav).position==='fixed')bottom=Math.min(bottom,nav.getBoundingClientRect().top-12);
      var rect=target.getBoundingClientRect();
      if(rect.bottom>bottom)window.scrollBy({top:rect.bottom-bottom,behavior:'instant'});
      else if(rect.top<12)window.scrollBy({top:rect.top-12,behavior:'instant'});
    });
  }
  container.addEventListener('focusin',revealFocusedConnection);
  $('connectionJourney').addEventListener('focusin',revealFocusedConnection);
  document.addEventListener('mc:connection-action',function(event){if(!['review_setup','review_voice','review_sms','start_calendar','show_phone_steps','show_text_steps','show_calendar_steps','renew_text_probe','check_status'].includes(event.detail?.action))return;var button=document.createElement('button');button.dataset.connection=event.detail.action;handleConnectionClick({target:button});});
  container.addEventListener('click',handleConnectionClick);
  $('connectionJourney').addEventListener('click',handleConnectionClick);
  dialog.addEventListener('click',handleConnectionClick);
})();
