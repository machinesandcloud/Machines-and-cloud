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
  var data, busy = false, generation = 0, dialog = document.createElement('dialog'); dialog.className = 'walkthrough'; dialog.setAttribute('aria-labelledby', 'connectionTitle'); document.body.appendChild(dialog);
  var $ = function (id) { return document.getElementById(id); }, container = $('serviceConnections'), message = $('serviceConnectionMessage');
  var meta = document.querySelector('meta[name="mc-api-base"]'), base = meta && meta.content ? meta.content.replace(/\/$/, '') : '';
  async function sessionBinding() {
    var digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(session));
    return Array.from(new Uint8Array(digest)).map(function (byte) { return byte.toString(16).padStart(2,'0'); }).join('');
  }
  function currentSession() { try { return sessionStorage.getItem('mc-onboarding-session-v1') === session; } catch (error) { return false; } }
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
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function button(action, label) { return '<button type="button" class="btn-pill btn-pill-blue btn-sm" data-connection="' + action + '">' + esc(label) + '</button>'; }
  function money(cents) { return new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' }).format(cents / 100); }
  function labelState(value) { return String(value || 'not active').replace(/_/g, ' '); }
  function registrationFields(client) {
    var legal = client.business.legal || {}, names = client.owner.name.trim().split(/\s+/);
    return '<h3>Registered business</h3><p>These details are used for your carrier registration. They are not saved in your signup draft.</p>' + field('legalName','Legal business name',legal.legalName || client.business.name) + field('ein','EIN','') + '<label class="form-label">Business type<select class="form-input" name="businessType"><option value="llc">LLC</option><option value="corporation">Corporation</option><option value="partnership">Partnership</option></select></label>' + field('street','Registered street address',legal.street) + field('street2','Suite or unit','','text',true) + field('city','City',legal.city || client.business.city) + field('state','State abbreviation',legal.state || 'TX') + field('zip','ZIP code',legal.zip) + field('website','Public business website',client.business.website,'url') + '<h3>Authorized representative</h3>' + field('firstName','First name',names[0]) + field('lastName','Last name',names.slice(1).join(' ')) + field('email','Work email',client.owner.email,'email') + field('phone','US mobile number (+1…)',client.owner.phone,'tel') + field('title','Job title','') + '<label class="form-label">Position<select class="form-input" name="jobPosition"><option value="CEO">Owner / CEO</option><option value="General_Manager">General manager</option><option value="CFO">CFO</option><option value="VP">VP</option><option value="Director">Director</option><option value="Other">Other</option></select></label>';
  }
  function registrationDetails(form) {
    var details = {}, representative = {};
    ['legalName','ein','businessType','street','street2','city','state','zip','website'].forEach(function (key) { details[key] = form.get(key); });
    ['firstName','lastName','email','phone','title','jobPosition'].forEach(function (key) { representative[key] = form.get(key); });
    details.state = details.state.toUpperCase(); details.representative = representative; return details;
  }
  function submissionId() { var bytes = new Uint8Array(16); crypto.getRandomValues(bytes); return Array.from(bytes).map(function (byte) { return byte.toString(16).padStart(2,'0'); }).join(''); }
  function setupPlan(d) {
    var plan = d.serviceOnboarding;
    if (!plan || !plan.requestedChannels || !plan.requestedChannels.length) return '';
    if ((plan.reasonCode === 'existing_setup' || plan.legacySetup) && !plan.operation) return '';
    var operation = plan.operation, content = '<div class="connection-plan"><div class="connection-plan-heading"><div><p class="connection-eyebrow">Your connection setup</p><h4>One review. We handle the setup.</h4></div><span class="connection-badge">' + esc(operation ? labelState(operation.state) : plan.available ? 'Ready to review' : 'Not available yet') + '</span></div>';
    content += '<p>Your saved business details carry into setup. Review the costs and permissions once; we prepare your number and selected services in the background.</p>';
    if (operation) {
      content += '<p role="status">' + esc(operation.detail) + '</p><ol class="connection-progress"><li>Business details saved</li><li>' + (d.phoneActivation?.operation?.state === 'number_acquired' ? 'Front desk number reserved' : operation.numberRequested ? 'Number request saved' : 'Number setup awaiting approval') + '</li>';
      if (plan.requestedChannels.includes('voice')) content += '<li>' + esc(d.connections.voice.active ? 'Phone answering verified' : operation.voiceRequested ? 'Phone answering setup requested' : 'Phone answering follows number setup') + '</li>';
      if (plan.requestedChannels.includes('sms')) content += '<li>' + esc(d.connections.messaging.active ? 'Text messaging verified' : operation.messagingRequested ? 'Text registration requested' : 'Text registration follows number setup') + '</li>';
      content += '</ol>';
      if (operation.nextAction === 'review_existing_connections') content += '<p>Review the connection details below to finish any requested correction or verification.</p>';
      if (!operation.cancellationRequested && !['cancelled','complete','completed'].includes(operation.state)) content += '<button type="button" class="btn-pill btn-pill-dark btn-sm" data-connection="cancel_setup">Cancel connection setup</button>';
    }
    var proof = d.client.setupProof || {}, reviewed = proof.reviewedRevision === d.configurationRevision, tested = proof.testedRevision === d.configurationRevision && proof.testMode === 'live';
    if (plan.available && (!operation || operation.state === 'needs_review')) content += !reviewed ? '<p>First check the business details your front desk will use.</p>' + button('review_business', 'Review business details') : !tested ? '<p>Try a private customer conversation before connecting your services.</p>' + button('try_frontdesk', 'Try your front desk') : button('review_setup', operation ? 'Review updated setup' : 'Review and connect');
    else if (!operation) content += '<p class="connection-note">Phone and text connections are not available yet. Your choices are saved; nothing is being purchased or activated.</p>';
    return content + '</div>';
  }
  function render(d) {
    if (!d.connections) return; data = d;
    var c = d.connections, requested = d.client.onboarding.desiredChannels || [], html = setupPlan(d), coordinated = !!d.serviceOnboarding && !d.serviceOnboarding.legacySetup && d.serviceOnboarding.reasonCode !== 'existing_setup';
    var numberCard = $('phoneSetupCard');
    if (numberCard && coordinated && (d.serviceOnboarding.requestedChannels || []).length) numberCard.hidden = true;
    if(c.voice.active || c.messaging.active){$('status').textContent='Front desk active';html+='<p>'+button('pause_services','Pause front desk')+'</p>';}
    else if(d.client.status==='paused' && (requested.indexOf('voice')>=0 || requested.indexOf('sms')>=0))html+='<p>'+button('resume_services','Resume connections')+'</p>';
    if (requested.indexOf('calendar') >= 0 || c.calendar.connected || calendarReturn) html += '<div class="setup-step"><div><h4>Keep visits on your calendar</h4><p>' + esc(c.calendar.detail) + '</p><p>Your other Google events do not set availability. Block unavailable time in your workspace.</p>' + (calendarReturn ? button('finish_calendar', 'Finish connecting Google Calendar') : c.calendar.connected ? button('disconnect_calendar', 'Disconnect Calendar') : c.calendar.available ? button('start_calendar', c.calendar.reconnectRequired ? 'Reconnect Google Calendar' : 'Connect Google Calendar') : '<p>Calendar connection is being prepared. Your preference is saved.</p>') + '</div></div>';
    if ((!coordinated && requested.indexOf('voice') >= 0) || c.voice.operation) html += '<div class="setup-step"><div><h4>Answer your calls</h4><p>' + esc(c.voice.operation ? c.voice.operation.detail : 'Your answering service is prepared after a number is reserved and you review the usage terms.') + '</p>' + (!coordinated && c.voice.available && (!c.voice.operation || ['needs_review','suspended','waiting_platform'].includes(c.voice.state)) && d.phoneActivation.operation && d.phoneActivation.operation.state === 'number_acquired' ? button('review_voice', 'Review phone answering') : '') + (c.voice.operation && c.voice.operation.state !== 'cancelled' ? button('cancel_voice', 'Disconnect phone answering') : '') + '</div></div>';
    if (c.voice.operation?.number && c.voice.operation.forwardingMode === 'forward_business_line' && c.voice.forwarding) {
      html += '<div class="setup-step"><div><h4>Keep your existing business number</h4><p>' + esc(c.voice.forwarding.short) + '</p><p>' + esc(c.voice.forwarding.note) + '</p>';
      (c.voice.forwarding.codes || []).forEach(function (code) { if (/^[*#\d]+$/.test(code)) html += '<a class="btn-pill btn-pill-dark btn-sm" href="tel:' + esc(code.replace(/#/g,'%23')) + '">' + esc('Dial ' + code) + '</a> '; });
      html += '<p>Make a test call from another phone to confirm calls reach your front desk.</p></div></div>';
    }
    if ((!coordinated && requested.indexOf('sms') >= 0) || c.messaging.operation) html += '<div class="setup-step"><div><h4>Text customers from your business number</h4><p>' + esc(c.messaging.detail) + '</p>' + (c.messaging.available && (!coordinated || c.messaging.operation?.customerAction === 'correct_registration') && (!c.messaging.operation || c.messaging.operation.customerAction === 'correct_registration') && d.phoneActivation.operation && d.phoneActivation.operation.state === 'number_acquired' ? button('review_sms', c.messaging.operation ? 'Review registration details' : 'Review texting setup') : '') + (c.messaging.operation && !c.messaging.operation.cancellationRequested && c.messaging.operation.state !== 'cancelled' ? button('cancel_sms', 'Disconnect texting') : '') + '</div></div>';
    if (c.delivery.total || c.calendarDelivery.total) html += '<details><summary>Recent delivery status</summary><p>Saved requests stay in your workspace. Provider acceptance and confirmed delivery are tracked separately.</p><ul>' + c.delivery.jobs.map(function (j) { return '<li>' + esc(labelState(j.purpose)) + ' · ' + esc(labelState(j.state)) + '</li>'; }).concat(c.calendarDelivery.jobs.map(function (j) { return '<li>Calendar visit ' + esc(j.bookingId) + ' · ' + esc(labelState(j.state)) + '</li>'; })).join('') + '</ul></details>';
    container.innerHTML = html;
    var states = $('channelStates'); if (states) states.innerHTML = '<span class="channel-state">Website chat: ' + (d.webAvailable ? 'active' : 'not active') + '</span><span class="channel-state">Phone: ' + (c.voice.active ? 'active' : esc(labelState(c.voice.state))) + '</span><span class="channel-state">Texts: ' + (c.messaging.active ? 'active' : esc(labelState(c.messaging.state))) + '</span><span class="channel-state">Calendar: ' + esc(labelState(c.calendar.status)) + '</span>';
  }
  document.addEventListener('mc:desk', function (event) { render(event.detail); if (calendarNotice) { message.textContent = calendarNotice; calendarNotice = ''; } continueCalendarReturn(event.detail); });
  $('deskSignOut').addEventListener('click', function () { generation++; data = null; calendarReturn = null; if (dialog.open) dialog.close(); dialog.innerHTML = ''; container.innerHTML = ''; });
  document.addEventListener('mc:session-expired',function () { generation++; data = null; calendarReturn = null; if (dialog.open) dialog.close(); dialog.innerHTML = ''; });
  function review(title, content, submitLabel, onSubmit) {
    dialog.innerHTML = '<form id="connectionForm"><h2 id="connectionTitle">' + esc(title) + '</h2>' + content + '<p id="connectionDialogMessage" role="status" aria-live="polite"></p><div class="walkthrough-actions"><button type="submit" class="btn-pill btn-pill-blue btn-sm">' + esc(submitLabel) + '</button><button type="button" class="btn-pill btn-pill-dark btn-sm" id="connectionBack">Back</button></div></form>';
    $('connectionBack').onclick = function () { if (!busy) dialog.close(); };
    $('connectionForm').onsubmit = function (event) { event.preventDefault(); if (!busy && event.target.reportValidity()) onSubmit(new FormData(event.target)); }; dialog.showModal();
  }
  dialog.addEventListener('cancel', function (event) { if (busy) event.preventDefault(); });
  dialog.addEventListener('close', function () { dialog.innerHTML = ''; });
  async function request(action, fields) {
    if (busy || !data) return; busy = true; var expectedGeneration = generation;
    var controller=new AbortController(),timeout=setTimeout(function(){controller.abort();},20000);
    message.textContent = action === 'complete_calendar_connection' ? (fields.error ? 'Confirming your calendar choice…' : 'Connecting your Google Calendar…') : 'Saving your connection…'; dialog.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
    try {
      var response = await fetch(base + '/api/client?c=' + encodeURIComponent(slug), { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:'Bearer ' + session }, body:JSON.stringify(Object.assign({ action:action }, fields || {})),signal:controller.signal });
      var result = await response.json(); if (generation !== expectedGeneration) return;
      if (response.status===401 || response.status===403) { document.dispatchEvent(new CustomEvent('mc:session-expired')); return; }
      if (!response.ok || !result.ok) throw new Error(result.message || 'The connection could not be confirmed. Refresh its status before retrying.');
      if (action === 'start_calendar_connection') {
        var destination = new URL(result.result.authorizationUrl); if (destination.protocol !== 'https:' || destination.hostname !== 'accounts.google.com') throw new Error('Google connection address could not be verified.');
        var state = destination.searchParams.get('state'), expiresAt = result.result.expiresAt, binding = await sessionBinding();
        if (!/^[a-f0-9]{64}$/.test(state || '') || !Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now()) throw new Error('Google connection expired before it could start. Try again.');
        if (generation !== expectedGeneration || !currentSession()) return;
        sessionStorage.setItem('mc-calendar-pending-v1', JSON.stringify({ slug:slug, state:state, expiresAt:expiresAt, sessionBinding:binding })); location.assign(destination.href); return;
      }
      if (action === 'complete_calendar_connection') clearCalendarReturn();
      if(!result.connections){document.dispatchEvent(new CustomEvent('mc:desk-refresh'));if(dialog.open)dialog.close();message.textContent='Your change is saved. Refreshing connection status…';return;}
      if(result.client)data.client=result.client;
      if(result.serviceOnboarding)data.serviceOnboarding=result.serviceOnboarding;
      if(result.phoneActivation)data.phoneActivation=result.phoneActivation;
      if (dialog.open) dialog.close(); data.connections = result.connections; render(data);
      message.textContent = action === 'complete_calendar_connection' ? result.result?.denied ? 'Calendar access was not granted. Your existing settings are unchanged.' : result.connections.calendar.connected ? 'Google Calendar is connected. Future saved visits will sync in the background.' : 'Your calendar status is saved. Check its next step above.' : 'Your change is saved. Its status above shows what happens next.';
    } catch (error) {
      if (expectedGeneration === generation) {
        if (action === 'complete_calendar_connection') { clearCalendarReturn(); if (data) render(data); document.dispatchEvent(new CustomEvent('mc:desk-refresh')); }
        (dialog.open ? $('connectionDialogMessage') : message).textContent = error.name==='AbortError'?'The request timed out. Your change may be saved; refresh its status before retrying.':error.message;
      }
    }
    finally { clearTimeout(timeout); busy = false; dialog.querySelectorAll('button').forEach(function (b) { b.disabled = false; }); }
  }
  function check(name, text) { return '<label style="display:flex;gap:10px;margin:16px 0"><input type="checkbox" name="' + name + '" required><span>' + esc(text) + '</span></label>'; }
  function field(name, label, value, type, optional) { return '<div class="form-group"><label class="form-label">' + esc(label) + '<input class="form-input" name="' + name + '" value="' + esc(value || '') + '" type="' + (type || 'text') + '" maxlength="500"' + (optional ? '' : ' required') + '></label></div>'; }
  container.addEventListener('click', function (event) {
    var target = event.target.closest('[data-connection]'); if (!target || busy || !data) return;
    var action = target.dataset.connection, c = data.connections, revision = data.configurationRevision;
    if (action === 'review_business' || action === 'try_frontdesk') return document.dispatchEvent(new CustomEvent('mc:desk-route', { detail: { tab: action === 'review_business' ? 'know' : 'test' } }));
    if (action === 'cancel_setup') return review('Cancel connection setup?', '<p>We stop new setup and reconcile any number or services already requested. Your business details and customer records remain saved.</p>', 'Cancel setup', function () { request('cancel_service_onboarding', { expectedRevision: revision, operationId: data.serviceOnboarding.operation.id }); });
    if (action === 'review_setup') {
      var plan = data.serviceOnboarding, quote = plan.offer, chosen = plan.requestedChannels;
      if (!plan.available || !quote) return;
      var content = '<p>Review your selected services below. After you approve, number reservation and provider setup continue without another setup submission.</p><h3>Your front desk number</h3><p>' + money(quote.number.oneTimeCents) + ' one-time and ' + money(quote.number.monthlyCents) + ' per month.</p><p>' + esc(quote.number.authorityText) + '</p>';
      if (chosen.includes('voice')) content += '<h3>Phone answering</h3><p>' + esc(quote.voice.usageDisclosure) + '</p><p>' + esc(quote.voice.authorityText) + '</p><p>Up to ' + esc(quote.voice.maxDailyCalls) + ' calls and ' + esc(quote.voice.maxDailyMinutes) + ' minutes per day, with a ' + esc(quote.voice.maxDurationSeconds) + '-second call limit.</p><label class="form-label">Customers reach your front desk<select class="form-input" name="forwardingMode"><option value="forward_business_line"' + (data.client.onboarding.phoneSetupMode !== 'use_new_number' ? ' selected' : '') + '>Through my existing business number</option><option value="use_new_number"' + (data.client.onboarding.phoneSetupMode === 'use_new_number' ? ' selected' : '') + '>On the new front desk number</option></select></label>';
      if (chosen.includes('sms')) {
        content += '<h3>Customer texting</h3><p>Brand filing: ' + money(quote.messaging.brandRegistrationCents) + '. Campaign filing: ' + money(quote.messaging.campaignRegistrationCents) + '. Campaign registration: ' + money(quote.messaging.campaignMonthlyCents) + ' per month.</p><p>' + esc(quote.messaging.usageDisclosure) + '</p><p>' + esc(quote.messaging.authorityText) + '</p><details><summary>Your texts and customer consent</summary><p>' + esc(quote.program.description) + '</p><p>' + esc(quote.program.messageFlow) + '</p>' + quote.program.messageSamples.map(function (sample) { return '<p>' + esc(sample) + '</p>'; }).join('') + '</details>' + registrationFields(data.client);
        content += check('accuracy','These registered business details are accurate and I am authorized to register this business.') + check('consumerConsent','My business will obtain and record customer agreement before appointment texts. Customers can book without texting consent.') + check('testConsent','Send a setup verification text to my saved owner mobile number. I will reply to confirm delivery.');
      }
      content += check('costs','I accept the number, registration and recurring usage costs shown for my selected services.') + check('authority','I authorize Machines & Cloud to reserve my business number and set up the selected services under the terms shown above.');
      var requestId = submissionId();
      return review('Review your front desk connections', content, 'Approve and start setup', function (form) {
        var body = { expectedRevision: revision, submissionId: requestId, offerDigest: quote.digest, acceptedCosts: true, authority: true };
        if (chosen.includes('voice')) body.forwardingMode = form.get('forwardingMode');
        if (chosen.includes('sms')) Object.assign(body, { legal: registrationDetails(form), attestLegalAccuracy: true, attestConsent: true, testPhoneConsent: true });
        request('request_service_onboarding', body);
      });
    }
    if(action==='pause_services')return review('Pause your front desk?','<p>Calls, customer texts, chat and calendar updates pause. Existing carrier forwarding may still need to be switched off. Your records remain saved.</p>','Pause front desk',function(){request('pause');});
    if(action==='resume_services')return request('resume_services',{expectedRevision:revision});
    if (action === 'start_calendar') return request('start_calendar_connection', { expectedRevision:revision });
    if (action === 'finish_calendar' && calendarReturn) return request('complete_calendar_connection', calendarReturn);
    if (action === 'disconnect_calendar') return review('Disconnect Google Calendar?', '<p>New updates will stop. Existing events and saved visits remain. Reconnect the same calendar to resume pending work.</p>', 'Disconnect Calendar', function () { request('disconnect_calendar'); });
    if (action === 'cancel_voice' || action === 'cancel_sms') return review('Disconnect this service?', '<p>New delivery will stop. We confirm provider cleanup in the background and retain your customer records. Number release waits until attached services are disconnected.</p>', 'Disconnect service', function () { request(action === 'cancel_voice' ? 'cancel_voice_activation' : 'cancel_messaging_activation', action === 'cancel_voice' ? { expectedRevision:revision } : { expectedRevision:revision, operationId:c.messaging.operation.id }); });
    if (action === 'review_voice') {
      var offer = c.voice.offer;
      return review('Set up phone answering', '<p>' + esc(offer.usageDisclosure) + '</p><p>Up to ' + esc(offer.maxDurationSeconds) + ' seconds per call, ' + esc(offer.maxDailyCalls) + ' calls and ' + esc(offer.maxDailyMinutes) + ' minutes per day for your shop.</p><label class="form-label">How should customers reach you?<select class="form-input" name="forwardingMode"><option value="forward_business_line">Keep my existing number and forward calls</option><option value="use_new_number">Use my new front desk number directly</option></select></label><p>A completed test call confirms the connection.</p>' + check('authority',offer.authorityText), 'Set up phone answering', function (form) { request('request_voice_activation',{ expectedRevision:revision, acceptedAuthority:true, policyVersion:offer.version, policyDigest:offer.digest, forwardingMode:form.get('forwardingMode') }); });
    }
    if (action !== 'review_sms') return;
    var sms = c.messaging, terms = sms.offer, client = data.client, legal = client.business.legal || {};
    var content = '<p>Mobile carriers require your registered business details. We prepare and track the application for you.</p><p>Brand filing: ' + money(terms.brandRegistrationCents) + '. Campaign filing: ' + money(terms.campaignRegistrationCents) + '. Campaign registration: ' + money(terms.campaignMonthlyCents) + ' monthly.</p><p>' + esc(terms.usageDisclosure) + '</p><details><summary>Review your texts and consent process</summary><p>' + esc(sms.program.description) + '</p><p>' + esc(sms.program.messageFlow) + '</p>' + sms.program.messageSamples.map(function (sample) { return '<p>' + esc(sample) + '</p>'; }).join('') + '</details><h3>Registered business</h3>' + field('legalName','Legal business name',legal.legalName || client.business.name) + field('ein','EIN','') + '<label class="form-label">Business type<select class="form-input" name="businessType"><option value="llc">LLC</option><option value="corporation">Corporation</option><option value="partnership">Partnership</option></select></label>' + field('street','Registered street address',legal.street) + field('street2','Suite or unit','','text',true) + field('city','City',legal.city || client.business.city) + field('state','State abbreviation',legal.state || 'TX') + field('zip','ZIP code',legal.zip) + field('website','Public business website',client.business.website,'url') + '<h3>Authorized representative</h3>' + field('firstName','First name',client.owner.name.split(' ')[0]) + field('lastName','Last name',client.owner.name.split(' ').slice(1).join(' ')) + field('email','Work email',client.owner.email,'email') + field('phone','US mobile number (+1…)',client.owner.phone,'tel') + field('title','Job title','') + '<label class="form-label">Position<select class="form-input" name="jobPosition"><option value="CEO">Owner / CEO</option><option value="General_Manager">General manager</option><option value="CFO">CFO</option><option value="VP">VP</option><option value="Director">Director</option><option value="Other">Other</option></select></label>' + check('authority',terms.authorityText) + check('costs','I accept the filing fees, recurring campaign costs and usage terms shown above.') + check('accuracy','These legal details are accurate and I am authorized to register this business.') + check('consumerConsent','My business will obtain and record customer agreement before appointment texts. Customers can book without texting consent.') + check('testConsent','Send a setup verification text to my saved owner mobile number. I will reply to confirm delivery.');
    review('Set up customer texting',content,sms.operation ? 'Save corrected details' : 'Submit texting setup',function (form) {
      var details = {}, representative = {}; ['legalName','ein','businessType','street','street2','city','state','zip','website'].forEach(function (key) { details[key] = form.get(key); }); ['firstName','lastName','email','phone','title','jobPosition'].forEach(function (key) { representative[key] = form.get(key); }); details.state = details.state.toUpperCase(); details.representative = representative;
      var random = new Uint8Array(16); crypto.getRandomValues(random);
      var body = { expectedRevision:revision, submissionId:Array.from(random).map(function (byte) { return byte.toString(16).padStart(2,'0'); }).join(''), offerVersion:terms.version, offerDigest:terms.digest, programDigest:sms.program.digest, acceptedCosts:true, authority:true, attestLegalAccuracy:true, attestConsent:true, testPhoneConsent:true, legal:details };
      if (sms.operation) { body.operationId = sms.operation.id; body.expectedSubmissionRevision = sms.operation.submissionRevision; }
      request(sms.operation ? 'correct_messaging_activation' : 'request_messaging_activation',body);
    });
  });
})();
