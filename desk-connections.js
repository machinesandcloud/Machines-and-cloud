(function () {
  'use strict';
  var query = new URLSearchParams(location.search), slug = query.get('c'), fragment = new URLSearchParams(location.hash.slice(1));
  var session = null, pending = null;
  try { session = sessionStorage.getItem('mc-onboarding-session-v1'); pending = JSON.parse(sessionStorage.getItem('mc-calendar-pending-v1') || 'null'); } catch (error) { /* Sign in again when browser storage is unavailable. */ }
  var calendarReturn = session && pending && pending.slug === slug && pending.state === fragment.get('calendar_state') ? { state: fragment.get('calendar_state'), code: fragment.get('calendar_code') || undefined, error: fragment.get('calendar_error') || undefined } : null;
  if (fragment.has('calendar_state') || query.has('calendar')) { query.delete('calendar'); history.replaceState(null, '', location.pathname + '?' + query.toString()); }
  if (!session || !slug) return;
  var data, busy = false, generation = 0, dialog = document.createElement('dialog'); dialog.className = 'walkthrough'; dialog.setAttribute('aria-labelledby', 'connectionTitle'); document.body.appendChild(dialog);
  var $ = function (id) { return document.getElementById(id); }, container = $('serviceConnections'), message = $('serviceConnectionMessage');
  var meta = document.querySelector('meta[name="mc-api-base"]'), base = meta && meta.content ? meta.content.replace(/\/$/, '') : '';
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function button(action, label) { return '<button type="button" class="btn-pill btn-pill-blue btn-sm" data-connection="' + action + '">' + esc(label) + '</button>'; }
  function money(cents) { return new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' }).format(cents / 100); }
  function labelState(value) { return String(value || 'not active').replace(/_/g, ' '); }
  function render(d) {
    if (!d.connections) return; data = d;
    var c = d.connections, requested = d.client.onboarding.desiredChannels || [], html = '';
    if(c.voice.active || c.messaging.active){$('status').textContent='Front desk active';html+='<p>'+button('pause_services','Pause front desk')+'</p>';}
    else if(d.client.status==='paused' && (requested.indexOf('voice')>=0 || requested.indexOf('sms')>=0))html+='<p>'+button('resume_services','Resume connections')+'</p>';
    if (requested.indexOf('calendar') >= 0 || c.calendar.connected || calendarReturn) html += '<div class="setup-step"><div><h4>Keep visits on your calendar</h4><p>' + esc(c.calendar.detail) + '</p><p>Your other Google events do not set availability. Block unavailable time in your workspace.</p>' + (calendarReturn ? button('finish_calendar', 'Finish connecting Google Calendar') : c.calendar.connected ? button('disconnect_calendar', 'Disconnect Calendar') : c.calendar.available ? button('start_calendar', c.calendar.reconnectRequired ? 'Reconnect Google Calendar' : 'Connect Google Calendar') : '<p>Calendar connection is being prepared. Your preference is saved.</p>') + '</div></div>';
    if (requested.indexOf('voice') >= 0 || c.voice.operation) html += '<div class="setup-step"><div><h4>Answer your calls</h4><p>' + esc(c.voice.operation ? c.voice.operation.detail : 'Your answering service is prepared after a number is reserved and you review the usage terms.') + '</p>' + (c.voice.available && (!c.voice.operation || ['needs_review','suspended','waiting_platform'].includes(c.voice.state)) && d.phoneActivation.operation && d.phoneActivation.operation.state === 'number_acquired' ? button('review_voice', 'Review phone answering') : '') + (c.voice.operation && c.voice.operation.state !== 'cancelled' ? button('cancel_voice', 'Disconnect phone answering') : '') + '</div></div>';
    if (requested.indexOf('sms') >= 0 || c.messaging.operation) html += '<div class="setup-step"><div><h4>Text customers from your business number</h4><p>' + esc(c.messaging.detail) + '</p>' + (c.messaging.available && (!c.messaging.operation || c.messaging.operation.customerAction === 'correct_registration') && d.phoneActivation.operation && d.phoneActivation.operation.state === 'number_acquired' ? button('review_sms', c.messaging.operation ? 'Review registration details' : 'Review texting setup') : '') + (c.messaging.operation && !c.messaging.operation.cancellationRequested && c.messaging.operation.state !== 'cancelled' ? button('cancel_sms', 'Disconnect texting') : '') + '</div></div>';
    if (c.delivery.total || c.calendarDelivery.total) html += '<details><summary>Recent delivery status</summary><p>Saved requests stay in your workspace. Provider acceptance and confirmed delivery are tracked separately.</p><ul>' + c.delivery.jobs.map(function (j) { return '<li>' + esc(labelState(j.purpose)) + ' · ' + esc(labelState(j.state)) + '</li>'; }).concat(c.calendarDelivery.jobs.map(function (j) { return '<li>Calendar visit ' + esc(j.bookingId) + ' · ' + esc(labelState(j.state)) + '</li>'; })).join('') + '</ul></details>';
    container.innerHTML = html;
    var states = $('channelStates'); if (states) states.innerHTML = '<span class="channel-state">Website chat: ' + (d.webAvailable ? 'active' : 'not active') + '</span><span class="channel-state">Phone: ' + (c.voice.active ? 'active' : esc(labelState(c.voice.state))) + '</span><span class="channel-state">Texts: ' + (c.messaging.active ? 'active' : esc(labelState(c.messaging.state))) + '</span><span class="channel-state">Calendar: ' + esc(labelState(c.calendar.status)) + '</span>';
  }
  document.addEventListener('mc:desk', function (event) { render(event.detail); });
  $('deskSignOut').addEventListener('click', function () { generation++; data = null; calendarReturn = null; if (dialog.open) dialog.close(); dialog.innerHTML = ''; container.innerHTML = ''; });
  document.addEventListener('mc:session-expired',function () { generation++; data = null; calendarReturn = null; if (dialog.open) dialog.close(); dialog.innerHTML = ''; });
  function review(title, content, submitLabel, onSubmit) {
    dialog.innerHTML = '<form id="connectionForm"><h2 id="connectionTitle">' + esc(title) + '</h2>' + content + '<p id="connectionDialogMessage" role="status" aria-live="polite"></p><div class="walkthrough-actions"><button type="submit" class="btn-pill btn-pill-blue btn-sm">' + esc(submitLabel) + '</button><button type="button" class="btn-pill btn-pill-dark btn-sm" id="connectionBack">Back</button></div></form>';
    $('connectionBack').onclick = function () { if (!busy) dialog.close(); };
    $('connectionForm').onsubmit = function (event) { event.preventDefault(); if (!busy && event.target.reportValidity()) onSubmit(new FormData(event.target)); }; dialog.showModal();
  }
  dialog.addEventListener('cancel', function (event) { if (busy) event.preventDefault(); });
  async function request(action, fields) {
    if (busy || !data) return; busy = true; var expectedGeneration = generation;
    var controller=new AbortController(),timeout=setTimeout(function(){controller.abort();},20000);
    message.textContent = 'Saving your connection…'; dialog.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
    try {
      var response = await fetch(base + '/api/client?c=' + encodeURIComponent(slug), { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:'Bearer ' + session }, body:JSON.stringify(Object.assign({ action:action }, fields || {})),signal:controller.signal });
      var result = await response.json(); if (generation !== expectedGeneration) return;
      if (response.status===401 || response.status===403) { document.dispatchEvent(new CustomEvent('mc:session-expired')); return; }
      if (!response.ok || !result.ok) throw new Error(result.message || 'The connection could not be confirmed. Refresh its status before retrying.');
      if (action === 'start_calendar_connection') {
        var destination = new URL(result.result.authorizationUrl); if (destination.protocol !== 'https:' || destination.hostname !== 'accounts.google.com') throw new Error('Google connection address could not be verified.');
        sessionStorage.setItem('mc-calendar-pending-v1', JSON.stringify({ slug:slug, state:destination.searchParams.get('state') })); location.assign(destination.href); return;
      }
      if (action === 'complete_calendar_connection') { calendarReturn = null; sessionStorage.removeItem('mc-calendar-pending-v1'); }
      if(!result.connections){document.dispatchEvent(new CustomEvent('mc:desk-refresh'));if(dialog.open)dialog.close();message.textContent='Your change is saved. Refreshing connection status…';return;}
      if(result.client)data.client=result.client;
      if (dialog.open) dialog.close(); data.connections = result.connections; render(data);
      message.textContent = action === 'complete_calendar_connection' && result.connections.calendar.connected ? 'Google Calendar is connected. Future saved visits will sync in the background.' : 'Your change is saved. Its status above shows what happens next.';
    } catch (error) { if (expectedGeneration === generation) (dialog.open ? $('connectionDialogMessage') : message).textContent = error.name==='AbortError'?'The request timed out. Your change may be saved; refresh its status before retrying.':error.message; }
    finally { clearTimeout(timeout); busy = false; dialog.querySelectorAll('button').forEach(function (b) { b.disabled = false; }); }
  }
  function check(name, text) { return '<label style="display:flex;gap:10px;margin:16px 0"><input type="checkbox" name="' + name + '" required><span>' + esc(text) + '</span></label>'; }
  function field(name, label, value, type, optional) { return '<div class="form-group"><label class="form-label">' + esc(label) + '<input class="form-input" name="' + name + '" value="' + esc(value || '') + '" type="' + (type || 'text') + '" maxlength="500"' + (optional ? '' : ' required') + '></label></div>'; }
  container.addEventListener('click', function (event) {
    var target = event.target.closest('[data-connection]'); if (!target || busy || !data) return;
    var action = target.dataset.connection, c = data.connections, revision = data.configurationRevision;
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
