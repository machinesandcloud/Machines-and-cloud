(function () {
  var q = new URLSearchParams(location.search), slug = q.get('c'), key = q.get('k');
  var ownerSession = null; try { ownerSession = sessionStorage.getItem('mc-onboarding-session-v1'); } catch (error) { /* Email sign-in is available when storage is disabled. */ }
  if (!slug || (!key && !ownerSession)) { document.body.dataset.workspaceState = 'recovery'; document.getElementById('title').textContent = 'Your workspace'; document.getElementById('status').textContent = 'Sign in to continue'; document.getElementById('portalRecovery').hidden = false; document.getElementById('retryLoad').hidden = true; return; }
  var API_BASE = (function () { var m = document.querySelector('meta[name="mc-api-base"]'); return (m && m.content) ? m.content.replace(/\/$/, '') : ''; })();
  var API = API_BASE + '/api/client?c=' + encodeURIComponent(slug) + (key ? '&k=' + encodeURIComponent(key) : '');
  var portalGeneration = 0, leaving = false, chatController = null, cfgRevision = null, cfgEditRevision = null, cfgDirty = false, guideStarted = false, data = null, contact = 't' + Math.random().toString(36).slice(2, 10), transcript = [];
  var $ = function (id) { return document.getElementById(id); };
  function ownerHeaders() { var headers = { 'Content-Type': 'application/json' }; if (ownerSession) headers.Authorization = 'Bearer ' + ownerSession; return headers; }
  function toast(t) { var el = $('toast'); el.textContent = t; el.style.display = 'block'; setTimeout(function () { el.style.display = 'none'; }, 2500); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function recover(message) {
    if ($('phoneCancelDialog').open) $('phoneCancelDialog').close(); phoneCancelSnapshot = null; if ($('phoneAuthority')) $('phoneAuthority').checked = false; if ($('phoneCosts')) $('phoneCosts').checked = false;
    if ($('visitDialog').open) $('visitDialog').close(); visitPending = null; visitSelected = null;
    $('portalContent').hidden = true; $('portalRecovery').hidden = false; document.body.dataset.workspaceState = 'recovery'; $('deskRail').hidden = true; $('railBusiness').textContent = 'Your front desk';
    $('title').textContent = 'Your workspace'; $('status').textContent = 'Unable to open workspace';
    $('recoveryMessage').textContent = message; if ($('liveBtns')) $('liveBtns').innerHTML = '';
  }
  document.addEventListener('mc:session-expired',function () {
    leaving = true; portalGeneration++; ownerSession = null; key = null; data = null; transcript = []; if (chatController) chatController.abort();
    try { sessionStorage.removeItem('mc-owner-visit-pending-v1:'+slug); sessionStorage.removeItem('mc-onboarding-session-v1'); sessionStorage.removeItem('mc-calendar-pending-v1'); } catch (error) { /* Private content is still cleared. */ }
    recover('Your session expired. Sign in by email to reopen your workspace.'); $('portalContent').innerHTML = ''; $('deskSignOut').hidden = true; $('retryLoad').hidden = true;
  });
  document.addEventListener('mc:desk-refresh',function(){if(!leaving)load();});
  document.addEventListener('mc:desk-route',function(event){if(!leaving && ['know','test','setup'].includes(event.detail?.tab))routeTo(event.detail.tab);});
  async function apiRequest(method, body) {
    var controller = new AbortController(), timeout = setTimeout(function () { controller.abort(); }, 20000);
    try {
      var response = await fetch(API, { method: method || 'GET', headers: ownerHeaders(), body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal });
      var result = await response.json();
      if (!response.ok || result.error || result.ok === false) {
        var message = result.message || (result.error === 'not_ready' ? 'Finish the setup checklist before activating website chat.' : result.error === 'configuration_changed' ? 'Your rules changed in another tab. Refresh and review the current version.' : response.status === 401 || response.status === 403 ? 'This private link is invalid or expired. Sign in by email to recover your workspace.' : 'We could not confirm that change. Please retry.');
        var error = new Error(message); error.status = response.status; error.code = result.error; error.field = result.field; error.fieldErrors = result.fieldErrors; error.setup = result.setup; throw error;
      }
      return result;
    } finally { clearTimeout(timeout); }
  }
  var visitPending = null, visitSelected = null, visitBusy = false, visitOpener = null;
  function visitFieldsDisabled(disabled) { ['visitName','visitPhone','visitAddress','visitIssue','visitDate','visitWindow','visitCancelConfirm','saveVisit','cancelVisit'].forEach(function(id){$(id).disabled=disabled;}); }
  function visitErrorsClear() { ['visitName','visitPhone','visitAddress','visitIssue','visitDate','visitWindow'].forEach(function(id){$(id).removeAttribute('aria-invalid');}); ['visitNameError','visitPhoneError','visitAddressError','visitIssueError','visitDateError','visitWindowError'].forEach(function(id){$(id).textContent='';}); }
  function visitFieldError(field,message) { var id=({date:'visitDate',window:'visitWindow',customer_name:'visitName',phone:'visitPhone',address:'visitAddress',issue:'visitIssue'})[field] || 'visitWindow'; $(id).setAttribute('aria-invalid','true'); $(id+'Error').textContent=message; $(id).focus(); }
  var visitStorageKey='mc-owner-visit-pending-v1:'+slug;
  var visitSessionTag=crypto.subtle.digest('SHA-256',new TextEncoder().encode(ownerSession || key || '')).then(function(bytes){return Array.from(new Uint8Array(bytes)).map(function(value){return value.toString(16).padStart(2,'0');}).join('');});
  async function storedVisitInput(){try{var row=JSON.parse(sessionStorage.getItem(visitStorageKey));return row && row.sessionTag===await visitSessionTag ? row.input:null;}catch(error){return null;}}
  async function storeVisitInput(input){var generation=portalGeneration;try{var sessionTag=await visitSessionTag;if(leaving || generation!==portalGeneration)return false;if(!input){sessionStorage.removeItem(visitStorageKey);return true;}sessionStorage.setItem(visitStorageKey,JSON.stringify({sessionTag:sessionTag,input:input}));return true;}catch(error){return false;}}
  async function openVisit(id) {
    var row=(data && data.bookings || []).find(function(item){return item.id===id;});
    if(!id){var creation=(data.pendingVisitCreations || [])[0];row={ownerVisit:{id:null,canChange:true},pendingVisitChange:creation || null};}
    if(!row || !row.ownerVisit)return;
    var generation=portalGeneration, stored=await storedVisitInput(); if(leaving || generation!==portalGeneration)return;
    visitOpener=document.activeElement; visitSelected=row.ownerVisit; visitPending=row.pendingVisitChange ? row.pendingVisitChange.input : stored && (stored.visitId===id || !id && stored.action==='create_visit') ? stored:null; visitBusy=false; $('closeVisit').disabled=false; visitErrorsClear();
    var creating=!id || !!(visitPending && visitPending.action==='create_visit');
    $('newVisitFields').hidden=!creating; $('saveVisit').textContent=creating?'Save visit':'Save new time'; $('cancelVisit').parentElement.hidden=creating;
    var values=creating && visitPending || {}; [['visitName','customer_name'],['visitPhone','phone'],['visitAddress','address'],['visitIssue','issue']].forEach(function(pair){$(pair[0]).value=values[pair[1]] || '';});
    $('visitTitle').textContent=creating?'Add a customer visit':visitSelected.customer_name || 'Customer visit';
    $('visitDetails').textContent=creating?'Save the agreed visit details. Availability is checked before the visit is created.':'Ref '+id+' · '+visitSelected.status+' · '+visitDateLabel(visitSelected.date)+' · '+visitSelected.window+'\n'+(visitSelected.issue || '')+' · '+(visitSelected.address || 'Address not saved');
    var pending=visitPending, date=pending && pending.date || visitSelected.date, windowValue=pending && pending.window || visitSelected.window;
    $('visitDate').value=date || ''; var windows=(data.client.windows || []).slice(); if(windowValue && windows.indexOf(windowValue)<0)windows.push(windowValue);
    $('visitWindow').innerHTML=windows.map(function(window){return '<option value="'+esc(window)+'">'+esc(window)+'</option>';}).join(''); $('visitWindow').value=windowValue;
    $('visitCancelConfirm').checked=!!(pending && pending.action==='cancel_visit'); $('visitChangeForm').hidden=!visitSelected.canChange && !pending;
    visitFieldsDisabled(!!pending); $('retryVisit').hidden=!pending; $('visitMessage').textContent=pending?'A saved change still needs confirmation. Retry it using the same details.':visitSelected.canChange?(creating?"We’ll check availability when you save.":'Choose a listed arrival window. Full or blocked windows keep the original visit unchanged.'):'This visit is retained for your records.';
    $('visitDialog').showModal(); $('closeVisit').focus();
  }
  function closeVisit() { if(visitBusy)return; $('visitDialog').close(); if(visitOpener && visitOpener.isConnected)visitOpener.focus(); }
  $('closeVisit').addEventListener('click',closeVisit);
  $('visitDialog').addEventListener('cancel',function(event){if(visitBusy)event.preventDefault();});
  function visitSubmissionId() { var bytes=new Uint8Array(16); crypto.getRandomValues(bytes); return Array.from(bytes).map(function(value){return value.toString(16).padStart(2,'0');}).join(''); }
  async function saveVisitChange(actionName) {
    if(visitBusy || !visitSelected || leaving)return;
    var generation=portalGeneration;
    if(!$('newVisitFields').hidden)actionName='create_visit';
    visitErrorsClear();
    if(!visitPending){
      if(actionName==='create_visit' || actionName==='reschedule_visit') {
        if(!$('visitDate').value || !$('visitDate').checkValidity()){visitFieldError('date','Choose a real visit date.');return;}
        if(!$('visitWindow').value){visitFieldError('window','Choose an arrival window.');return;}
      } else if(!$('visitCancelConfirm').checked){$('visitMessage').textContent='Confirm that you want to cancel this visit first.'; $('visitCancelConfirm').focus();return;}
      visitPending={action:actionName,expectedRevision:data.configurationRevision,submissionId:visitSubmissionId()};
      if(actionName!=='create_visit'){visitPending.visitId=visitSelected.id;visitPending.expectedVisitRevision=visitSelected.revision;}
      else {for(var field of [['visitName','customer_name'],['visitPhone','phone'],['visitAddress','address'],['visitIssue','issue']]){if(!$(field[0]).value.trim()){visitPending=null;visitFieldError(field[1],'Complete this customer detail.');return;}visitPending[field[1]]=$(field[0]).value.trim();}}
      if(actionName==='create_visit' || actionName==='reschedule_visit'){visitPending.date=$('visitDate').value;visitPending.window=$('visitWindow').value;}
    }
    visitBusy=true; visitFieldsDisabled(true); $('retryVisit').hidden=true; $('closeVisit').disabled=true; $('visitMessage').textContent='Confirming your saved change…';
    try {
      var retained=await storeVisitInput(visitPending); if(leaving || generation!==portalGeneration)return;
      if(!retained)$('visitMessage').textContent='Keep this page open while the change is confirmed. Browser recovery storage is unavailable.';
      var result=await apiRequest('POST',visitPending); if(leaving || generation!==portalGeneration)return; visitSelected=result.visit;
      $('visitMessage').textContent=result.message+(result.calendar?' Calendar: '+result.calendar.detail:' Calendar delivery is not confirmed.')+' Customer notification delivery is not confirmed.';
      if(result.complete){visitPending=null;await storeVisitInput(null);if(leaving || generation!==portalGeneration)return; $('visitChangeForm').hidden=true; $('retryVisit').hidden=true;}else{$('retryVisit').hidden=false; $('visitMessage').textContent+=' Retry the saved change to finish preparing its delivery.';}
      $('visitMessage').focus(); await load();
    } catch(error) {
      if(leaving || generation!==portalGeneration)return;
      $('visitMessage').textContent=error.message;
      if(error.status && error.status<500){visitPending=null;await storeVisitInput(null);if(leaving || generation!==portalGeneration)return;visitFieldsDisabled(false);if(error.field)visitFieldError(error.field,error.message);else $('visitMessage').focus();}
      else {$('retryVisit').hidden=false; $('visitMessage').textContent+=' Retry saved change safely; the original submission will be reused.';}
    } finally {if(!leaving && generation===portalGeneration){visitBusy=false; $('closeVisit').disabled=false;}}
  }
  $('newVisit').addEventListener('click',function(){openVisit(null);});
  $('visitChangeForm').addEventListener('submit',function(event){event.preventDefault();saveVisitChange('reschedule_visit');});
  $('cancelVisit').addEventListener('click',function(){saveVisitChange('cancel_visit');});
  $('retryVisit').addEventListener('click',function(){if(visitPending)saveVisitChange(visitPending.action);});
  $('retryLoad').addEventListener('click', function () { load().then(greet); });
  function availabilityDateLabel(date) { return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(date + 'T12:00:00Z')); }
  function renderAvailability(blocks) {
    $('availabilityBlocks').innerHTML = blocks.length ? blocks.map(function (b) {
      var label = availabilityDateLabel(b.date) + ' · ' + (b.window || 'Whole day');
      return '<div class="availability-row"><div><b>' + esc(label) + '</b>' + (b.existingBookings ? '<div>' + esc(b.existingBookings) + ' visit' + (b.existingBookings === 1 ? ' is' : 's are') + ' already reserved and unchanged.</div>' : '') + '</div><button type="button" class="btn-pill btn-pill-dark btn-sm availability-remove" data-date="' + esc(b.date) + '" data-window="' + esc(b.window) + '" aria-label="Remove block for ' + esc(label) + '">Remove block</button></div>';
    }).join('') : emptyState('Your schedule is open', 'Block existing work or time off above. Your front desk uses these blocks when offering new visits.');
  }
  var availabilityBusy = false;
  function availabilityChange(actionName, date, window, button) {
    if (availabilityBusy) return Promise.resolve();
    availabilityBusy = true;
    document.querySelectorAll('#availabilityForm button, #availabilityBlocks button').forEach(function (b) { b.disabled = true; });
    $('availabilityMessage').textContent = 'Saving…';
    return fetch(API, { method: 'POST', headers: ownerHeaders(), body: JSON.stringify({ action: actionName, date: date, window: window }) })
      .then(function (res) { return res.json().then(function (r) { if (!res.ok || !r.ok) { var messages = { invalid_date: 'Choose a valid date in Houston time.', invalid_window: 'Choose one of your saved arrival windows.', too_many_blocks: 'Remove an old block before adding another.', availability_unavailable: 'Availability could not be saved. Refresh to check it before trying again.' }; var err = new Error('Availability request failed'); err.availabilityMessage = messages[r.error] || 'Could not save availability. Refresh and try again.'; throw err; } if (!Array.isArray(r.availabilityBlocks)) throw new Error('Availability response incomplete'); return r; }); })
      .then(function (r) { renderAvailability(r.availabilityBlocks); $('availabilityMessage').textContent = (actionName === 'availability_block' ? 'Time blocked.' : 'Block removed.') + (r.existingBookings ? ' ' + r.existingBookings + ' existing visit' + (r.existingBookings === 1 ? ' remains' : 's remain') + ' booked.' : ''); })
      .catch(function (err) { $('availabilityMessage').textContent = err.availabilityMessage || 'Availability could not be saved. Refresh to check it before trying again.'; })
      .finally(function () { availabilityBusy = false; document.querySelectorAll('#availabilityForm button, #availabilityBlocks button').forEach(function (b) { b.disabled = false; }); });
  }
  $('availabilityForm').addEventListener('submit', function (e) { e.preventDefault(); availabilityChange('availability_block', $('availabilityDate').value, $('availabilityWindow').value, $('availabilitySubmit')); });
  $('availabilityBlocks').addEventListener('click', function (e) { var button = e.target.closest('button.availability-remove'); if (button) availabilityChange('availability_unblock', button.dataset.date, button.dataset.window, button); });

  var pageCopy = {
    today: ['DAILY WORK', 'Your day, at a glance', 'Customer requests, visits and the work that needs your attention.'],
    leads: ['DAILY WORK', 'Customer requests', 'Bookings and callback requests collected by your front desk.'],
    convs: ['DAILY WORK', 'Conversations', 'See what customers asked and how your front desk responded.'],
    availability: ['YOUR SCHEDULE', 'Availability', 'Keep your arrival windows free for the work you can take.'],
    know: ['YOUR FRONT DESK', 'Business rules', 'The answers, services and instructions your front desk uses.'],
    test: ['YOUR FRONT DESK', 'Practice your front desk', 'Try a customer conversation and see the details it collects.'],
    setup: ['YOUR FRONT DESK', 'Connections', 'Follow setup progress, connect your channels and prepare for customers.'],
    account: ['YOUR WORKSPACE', 'Account & data', 'Manage your service preferences and download your customer records.']
  };
  function showTab(t) {
    if (!pageCopy[t] || !document.getElementById('p-' + t)) return;
    document.querySelectorAll('.tabs button').forEach(function (x) { x.classList.toggle('on', x.dataset.t === t); x.setAttribute('aria-current', x.dataset.t === t ? 'page' : 'false'); });
    document.querySelectorAll('.pane').forEach(function (p) { p.classList.toggle('on', p.id === 'p-' + t); });
    document.body.dataset.activePage = t;
    $('pageEyebrow').textContent = pageCopy[t][0]; $('pageTitle').textContent = pageCopy[t][1]; $('pageDescription').textContent = pageCopy[t][2]; syncNextActionVisibility();
  }
  function syncNextActionVisibility() { var guide = $('workspaceGuide'); if (guide.dataset.needed) guide.hidden = guide.dataset.needed !== 'true' || $('nextSetupAction').dataset.route === document.body.dataset.activePage; }
  if (location.hash && document.getElementById('p-' + location.hash.slice(1))) showTab(location.hash.slice(1));
  else showTab('today');
  document.querySelectorAll('.tabs button').forEach(function (b) { b.addEventListener('click', function () { routeTo(b.dataset.t); }); });
  window.addEventListener('hashchange', function () { if (!leaving && pageCopy[location.hash.slice(1)]) routeTo(location.hash.slice(1)); });
  function routeTo(tab) {
    if (!pageCopy[tab] || leaving) return;
    window.__tabPicked = true; if (tab === 'test') $('tabTest').style.display = '';
    showTab(tab); var pane = $('p-' + tab); if (!pane) return;
    history.replaceState(null, '', location.pathname + location.search + '#' + tab);
    document.querySelectorAll('.guide-target').forEach(function (node) { node.classList.remove('guide-target'); });
    pane.classList.add('guide-target'); pane.tabIndex = -1; window.scrollTo({top:0,behavior:'instant'}); pane.focus({ preventScroll: true });
  }
  $('nextSetupAction').addEventListener('click', function () { routeTo(this.dataset.route || 'know'); });
  document.addEventListener('click', function (event) { var button = event.target.closest('.desk-empty-action[data-route]'); if (button) routeTo(button.dataset.route); });
  document.querySelectorAll('[data-practice-prompt]').forEach(function (button) { button.addEventListener('click', function () { $('chatIn').value = button.dataset.practicePrompt; $('chatIn').focus(); }); });
  function emptyState(title, detail, actionLabel, tab) {
    return '<div class="desk-empty"><div class="desk-empty-icon"><svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4zM4 13h4l2 3h4l2-3h4"/></svg></div><div><strong>' + esc(title) + '</strong><p>' + esc(detail) + '</p>' + (actionLabel ? '<button type="button" class="desk-empty-action" data-route="' + esc(tab) + '">' + esc(actionLabel) + ' →</button>' : '') + '</div></div>';
  }
  function decorateRecordTables() {
    document.querySelectorAll('#bookings .tbl, #leads .tbl').forEach(function (table) {
      table.setAttribute('role', 'table'); var labels = Array.prototype.map.call(table.querySelectorAll('th'), function (th) { th.scope = 'col'; th.setAttribute('role', 'columnheader'); return th.textContent; });
      table.querySelectorAll('tr').forEach(function (row) { row.setAttribute('role', 'row'); row.querySelectorAll('td').forEach(function (cell, index) { cell.setAttribute('role', 'cell'); cell.dataset.label = labels[index] || ''; var content = document.createElement('div'); content.className = 'desk-cell-content'; while (cell.firstChild) content.appendChild(cell.firstChild); cell.appendChild(content); }); });
    });
  }
  function recordTimeLabel(value) {
    var date = new Date(value);
    if (!value || !Number.isFinite(date.getTime())) return 'Time not recorded';
    return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date) + ' CT';
  }
  function visitDateLabel(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return value || 'Date not provided';
    var date = new Date(value + 'T12:00:00Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return value;
    return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).format(date);
  }
  function renderConversations(rows) {
    return rows.length ? rows.map(function (v) { return '<article class="conv"><header class="conv-header"><div><b>' + esc(v.contact) + '</b><div class="conv-meta"><span class="conv-channel">' + esc(v.channel) + '</span>' + esc(recordTimeLabel(v.updatedAt)) + (v.flag ? ' · Flagged: ' + esc(v.flag.note || '') : '') + '</div></div>' + (v.flag ? '<a href="#" class="unflag" data-ch="' + esc(v.channel) + '" data-ct="' + esc(v.contact) + '">Unflag</a>' : '<button type="button" class="btn-pill btn-pill-dark btn-sm flag" data-ch="' + esc(v.channel) + '" data-ct="' + esc(v.contact) + '">Flag</button>') + '</header><div class="conv-thread">' + v.messages.map(function (m) { return '<div class="conv-message ' + (m.role === 'user' ? 'u' : 'a') + '"><span>' + (m.role === 'user' ? 'Customer' : 'Front desk') + '</span>' + esc(m.content) + (m.processing ? '<small class="muted"> · ' + esc(m.processing.replace(/_/g, ' ')) + '</small>' : '') + '</div>'; }).join('') + '</div></article>'; }).join('') : emptyState('No conversations yet', 'Customer conversations will appear here once a connected channel receives a message. Private practice stays separate.', 'Review your connections', 'setup');
  }
  var phoneBusy = false, phoneRequestIdentity = null, phoneCancelSnapshot = null, phoneCancelReturnFocus = null;
  function validPhoneOffer(offer) {
    return offer && offer.scope === 'number_acquisition_only' && offer.country === 'US' && offer.currency === 'USD' && /^[2-9]\d{2}$/.test(offer.areaCode || '') && /^[a-z0-9_-]{1,80}$/.test(offer.version || '') && /^[a-f0-9]{64}$/.test(offer.digest || '') && [offer.oneTimeCents, offer.monthlyCents, offer.maxAcquisitionCents].every(function (value) { return Number.isSafeInteger(value) && value >= 0 && value <= 100000; }) && Date.parse(offer.expiresAt) > Date.now() && typeof offer.authorityText === 'string' && offer.authorityText.length >= 20;
  }
  function renderPhoneActivation(d) {
    var phone = d.phoneActivation, selfService = d.client.onboarding && d.client.onboarding.version === 1;
    var operation = phone && phone.operation, offer = phone && phone.offer, canRequest = phone && phone.available === true && validPhoneOffer(offer) && !operation && ['testing', 'live'].indexOf(d.client.status) >= 0;
    $('phoneSetupCard').hidden = !selfService || !phone || !operation && !canRequest;
    if ($('phoneSetupCard').hidden) { $('phoneSetupForm').hidden = true; $('phoneSetupProgress').replaceChildren(); return; }
    var states = { queued: 'Request saved', waiting_platform: 'Waiting for platform', running: 'Reserving number', uncertain: 'Checking request', number_acquired: 'Number reserved', cleanup_pending: 'Release pending', releasing: 'Releasing number', cleanup_uncertain: 'Checking release', cancelled: 'Request cancelled', superseded: 'Setup changed', needs_review: 'Needs attention' };
    var when = function (value) { return value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)) + ' CT' : 'Not recorded'; };
    $('phoneSetupDetail').textContent = canRequest ? 'Review this number-only offer. Nothing is requested until you accept it and submit.' : phone.detail || 'Phone answering is not active.';
    $('phoneSetupProgress').innerHTML = operation ? '<div class="setup-step"><div><strong>' + esc(states[operation.state] || 'Status unavailable') + '</strong><p>' + esc(operation.detail) + '</p>' + (operation.number ? '<p><b>' + (operation.releaseConfirmed ? 'Recorded number: ' : 'Number: ') + '</b>' + esc(operation.number) + '</p>' : '') + '<p>' + (operation.releaseConfirmed ? 'Release confirmed. The resource receipt has been retained.' : operation.resourceRecorded ? 'The number receipt is saved. Release has not been confirmed.' : 'No number resource receipt has been recorded.') + '</p><p>Updated ' + esc(when(operation.updatedAt)) + (operation.nextCheckAt ? ' · Next check ' + esc(when(operation.nextCheckAt)) : '') + '</p><p>Reference: <code style="overflow-wrap:anywhere;white-space:normal">' + esc(operation.id) + '</code></p></div></div>' : '';
    $('phoneSetupForm').hidden = !canRequest; $('phoneAuthority').checked = false; $('phoneCosts').checked = false;
    $('requestPhoneSetup').disabled = phoneBusy; $('phoneAuthority').disabled = phoneBusy; $('phoneCosts').disabled = phoneBusy;
    if (canRequest) {
      var money = function (cents) { return new Intl.NumberFormat('en-US', { style: 'currency', currency: offer.currency }).format(cents / 100); };
      $('phoneSetupOffer').innerHTML = '<p><b>US local number · Area code ' + esc(offer.areaCode) + '</b><br>One-time number cost: ' + esc(money(offer.oneTimeCents)) + '<br>Monthly number cost: ' + esc(money(offer.monthlyCents)) + '<br>Authorized number price cap: ' + esc(money(offer.maxAcquisitionCents)) + '<br>Offer expires ' + esc(when(offer.expiresAt)) + '</p>';
      $('phoneAuthorityText').textContent = offer.authorityText;
      $('phoneCostsText').textContent = 'I accept the disclosed one-time number cost and the monthly number charge until its release is confirmed. This does not activate phone answering or customer texts.';
    } else $('phoneSetupOffer').replaceChildren();
    $('cancelPhoneSetup').hidden = !operation || operation.state === 'cancelled' || operation.releaseConfirmed || operation.cancellationRequested;
    $('cancelPhoneSetup').disabled = phoneBusy;
  }
  async function changePhoneActivation(actionName, extra) {
    var generation = portalGeneration; if (phoneBusy || !data || leaving) return;
    phoneBusy = true; $('phoneAuthority').disabled = true; $('phoneCosts').disabled = true; $('refreshPhoneSetup').disabled = true; $('requestPhoneSetup').disabled = true; $('cancelPhoneSetup').disabled = true; $('confirmPhoneCancel').disabled = true; $('keepPhoneSetup').disabled = true;
    $('phoneSetupMessage').textContent = actionName === 'request_phone_activation' ? 'Saving your number request…' : 'Saving cancellation…';
    try {
      await action(actionName, extra); if (generation !== portalGeneration || leaving) return;
      if ($('phoneCancelDialog').open) $('phoneCancelDialog').close(); phoneCancelSnapshot = null;
      await load(); if (generation !== portalGeneration || leaving) return;
      $('phoneSetupMessage').textContent = actionName === 'request_phone_activation' ? 'Number request saved. Phone answering is not active. Refresh status to check progress.' : 'Cancellation saved. The status above shows whether release is confirmed; the request receipt is retained.';
    } catch (error) {
      if (generation === portalGeneration && !leaving) { $('phoneSetupMessage').textContent = error.message; if ($('phoneCancelDialog').open) $('phoneCancelMessage').textContent = error.message; }
    } finally {
      if (generation === portalGeneration && !leaving) { phoneBusy = false; $('refreshPhoneSetup').disabled = false; $('confirmPhoneCancel').disabled = false; $('keepPhoneSetup').disabled = false; if (data) renderPhoneActivation(data); }
    }
  }
  $('phoneSetupForm').addEventListener('submit', function (event) {
    event.preventDefault(); if (phoneBusy || !data || !data.phoneActivation || !$('phoneSetupForm').reportValidity() || !$('phoneAuthority').checked || !$('phoneCosts').checked) return;
    var offer = data.phoneActivation.offer; if (!data.phoneActivation.available || !validPhoneOffer(offer) || ['testing', 'live'].indexOf(data.client.status) < 0) { $('phoneSetupMessage').textContent = 'Refresh status to review a current number offer.'; return; }
    var identity = data.configurationRevision + ':' + offer.digest;
    if (!phoneRequestIdentity || phoneRequestIdentity.identity !== identity) {
      var bytes = new Uint8Array(32); try { crypto.getRandomValues(bytes); } catch (error) { $('phoneSetupMessage').textContent = 'This browser could not prepare a secure request. Try another browser.'; return; }
      phoneRequestIdentity = { identity: identity, id: Array.from(bytes).map(function (value) { return value.toString(16).padStart(2, '0'); }).join('') };
    }
    changePhoneActivation('request_phone_activation', { expectedRevision: data.configurationRevision, submissionId: phoneRequestIdentity.id, offerVersion: offer.version, offerDigest: offer.digest, acceptedCosts: true, authority: true });
  });
  $('cancelPhoneSetup').addEventListener('click', function () {
    if (phoneBusy || !data || !data.phoneActivation || !data.phoneActivation.operation) return;
    phoneCancelSnapshot = { expectedRevision: data.configurationRevision, operationId: data.phoneActivation.operation.id }; phoneCancelReturnFocus = document.activeElement; $('phoneCancelMessage').textContent = ''; $('phoneCancelDialog').showModal(); $('keepPhoneSetup').focus();
  });
  function closePhoneCancellation() { if (phoneBusy) return; $('phoneCancelDialog').close(); phoneCancelSnapshot = null; if (phoneCancelReturnFocus && phoneCancelReturnFocus.isConnected) phoneCancelReturnFocus.focus(); }
  $('keepPhoneSetup').addEventListener('click', closePhoneCancellation); $('phoneCancelDialog').addEventListener('cancel', function (event) { event.preventDefault(); closePhoneCancellation(); });
  $('confirmPhoneCancel').addEventListener('click', function () { if (phoneCancelSnapshot && !phoneBusy) changePhoneActivation('cancel_phone_activation', phoneCancelSnapshot); });
  $('refreshPhoneSetup').addEventListener('click', async function () { var generation = portalGeneration; $('refreshPhoneSetup').disabled = true; try { await load(); } finally { if (generation === portalGeneration && !leaving) $('refreshPhoneSetup').disabled = false; } });
  var operationBusy = false;
  function renderWorkspaceOperations(d) {
    var selfService = d.client.onboarding && d.client.onboarding.version === 1;
    $('backgroundWork').hidden = !selfService;
    if (!selfService) return;
    var states = { queued: 'Queued', running: 'Preparing your workspace', retry_due: 'Retry scheduled', succeeded: 'Refresh complete', failed: 'Needs attention', superseded: 'Newer answers saved', cancelled: 'Stopped' };
    var rows = Array.isArray(d.operations) ? d.operations : [];
    var when = function (value) { return value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)) + ' CT' : 'Not recorded'; };
    $('workspaceOperations').innerHTML = rows.length ? rows.map(function (operation) { return '<div class="setup-step"><div><strong>' + esc(operation.label || 'Workspace refresh') + ' · ' + esc(states[operation.state] || 'Status unavailable') + '</strong><p>' + esc(operation.detail) + '</p><p>Updated ' + esc(when(operation.updatedAt)) + (operation.nextAttemptAt ? ' · Next attempt ' + esc(when(operation.nextAttemptAt)) : '') + '</p><p>Reference: <code>' + esc(operation.id) + '</code></p></div>' + (operation.nextAction && operation.nextAction.action === 'retry_operation' ? '<button type="button" class="btn-pill btn-pill-dark btn-sm" data-retry-operation="' + esc(operation.id) + '">' + esc(operation.nextAction.label || 'Retry refresh') + '</button>' : '') + '</div>'; }).join('') : '<p class="muted">No refresh has been requested. Your original saved desk remains available.</p>';
    $('requestWorkspaceRefresh').disabled = operationBusy || d.client.status === 'cancelled' || rows.some(function (operation) { return ['queued', 'running', 'retry_due'].indexOf(operation.state) >= 0; });
    $('workspaceOperations').querySelectorAll('button').forEach(function (button) { button.disabled = operationBusy || d.client.status === 'cancelled'; });
  }
  async function requestWorkspaceOperation(actionName, operationId) {
    if (operationBusy || !data || !data.setup || cfgDirty || leaving) {
      if (cfgDirty) $('workspaceOperationMessage').textContent = 'Save your edited business answers before refreshing the workspace.';
      return;
    }
    var generation = portalGeneration; operationBusy = true; renderWorkspaceOperations(data);
    $('workspaceOperationMessage').textContent = 'Saving your refresh request…';
    var body = { expectedRevision: data.configurationRevision, reason: actionName === 'retry_operation' ? 'Owner retried the saved workspace refresh.' : 'Owner requested a refresh from saved business answers.' };
    if (operationId) body.operationId = operationId;
    try {
      var result = await action(actionName, body); if (generation !== portalGeneration || leaving) return;
      await load(); if (generation !== portalGeneration || leaving) return;
      $('workspaceOperationMessage').textContent = result.operation && result.operation.state === 'succeeded' ? 'This version has already been refreshed. Your saved workspace is up to date.' : 'Request saved. Use Refresh status to check the background refresh result.';
    } catch (error) { if (generation === portalGeneration && !leaving) $('workspaceOperationMessage').textContent = error.message; }
    finally { if (generation === portalGeneration && !leaving) { operationBusy = false; if (data) renderWorkspaceOperations(data); } }
  }
  $('requestWorkspaceRefresh').addEventListener('click', function () { requestWorkspaceOperation('rebuild_workspace'); });
  $('workspaceOperations').addEventListener('click', function (event) { var button = event.target.closest('button[data-retry-operation]'); if (button) requestWorkspaceOperation('retry_operation', button.dataset.retryOperation); });
  $('refreshBackgroundWork').addEventListener('click', async function () { var generation = portalGeneration; $('refreshBackgroundWork').disabled = true; try { await load(); } finally { if (generation === portalGeneration && !leaving) $('refreshBackgroundWork').disabled = false; } });
  function renderSetup(d) {
    renderWorkspaceOperations(d);
    renderPhoneActivation(d);
    var setup = d.setup, client = d.client;
    if (!setup) return;
    $('deskSignOut').hidden = !ownerSession;
    $('workspaceGuide').hidden = false; $('reviewCard').hidden = false;
    var allowance = d.aiAllowance, limited = allowance && !allowance.available;
    var operational = setup.channels.web.ready && setup.channels.web.active && !limited;
    $('legacyConnectionDetails').hidden = true; $('legacyDeliveryTests').hidden = true;
    var journey = setup.connectionJourney;
    var wantsWeb = !journey || !Array.isArray(journey.channels) || journey.channels.some(function (channel) { return channel.id === 'web' && channel.requested; });
    $('connectionsCard').hidden = !journey || !Array.isArray(journey.channels);
    if (journey && Array.isArray(journey.channels)) {
      var states = { active: 'Connected', needs_action: 'Setup needed', pending_activation: 'Not connected yet', not_selected: 'Not selected', limited: 'Daily limit reached' };
      $('connectionPreferences').querySelectorAll('input[name="connection"]').forEach(function (field) { field.checked = journey.channels.some(function (channel) { return channel.id === field.value && channel.requested; }); });
      $('connectionJourney').innerHTML = journey.channels.filter(function (channel) { return channel.id === 'web'; }).map(function (channel) {
        var state = channel.status, detail = channel.detail, next = channel.nextStep;
        if (channel.id === 'web' && state === 'active' && !operational) {
          state = limited ? 'limited' : 'needs_action';
          detail = limited ? 'Your settings are saved, but customer AI replies are unavailable for the rest of today.' : 'Your settings are saved, but website chat cannot answer customers until its setup checks pass.';
          next = limited ? 'More AI replies become available after the daily reset at midnight Houston time.' : 'Complete the review and test requirements in this setup.';
        }
        return '<div class="setup-step"><div><strong>' + esc(channel.label) + ' · ' + esc(states[state] || 'Not connected yet') + '</strong><p>' + esc(detail) + '</p>' + (channel.requested && next ? '<p><b>Next:</b> ' + esc(next) + '</p>' : '') + '</div></div>';
      }).join('');
    }
    $('status').textContent = client.status === 'cancelled' ? 'Service cancelled' : client.status === 'paused' ? 'Website chat paused' : limited ? 'Daily AI allowance reached' : operational ? 'Website chat active' : 'Setup in progress';
    $('status').className = 'st' + (operational ? ' live' : '');
    var currentProof = client.setupProof || {}, currentRevision = setup.revision;
    var reviewed = currentProof.reviewedRevision === currentRevision, tested = currentProof.testedRevision === currentRevision && currentProof.testMode === 'live';
    var services = d.connections, selected = client.onboarding && client.onboarding.desiredChannels || [];
    var otherPending = services && (selected.indexOf('voice') >= 0 && !services.voice.active || selected.indexOf('sms') >= 0 && !services.messaging.active || selected.indexOf('calendar') >= 0 && !services.calendar.connected);
    var next = !reviewed ? { title: 'Make sure it sounds like your business', detail: 'Review your services, hours and the answers customers should hear.', button: 'Review business rules', tab: 'know' } : !tested ? { title: 'Try the questions your customers ask', detail: 'Have a private conversation before your front desk answers customers.', button: 'Try your front desk', tab: 'test' } : { title: 'Finish connecting your front desk', detail: 'Your business answers are ready. Check the next step for your selected channels.', button: 'View connections', tab: 'setup' };
    $('workspaceGuide').dataset.needed = client.status === 'cancelled' || operational && !otherPending ? 'false' : 'true';
    $('guideTitle').textContent = next.title; $('guideIntro').textContent = next.detail; $('nextSetupAction').textContent = next.button; $('nextSetupAction').dataset.route = next.tab; syncNextActionVisibility();
    $('channelStates').innerHTML = '<span class="channel-state">Website chat: ' + (operational ? 'active' : client.status === 'paused' ? 'paused' : 'not active') + '</span><span class="channel-state">Phone: not active</span><span class="channel-state">Text messages: not active</span>';
    var revision = setup.revision, proof = client.setupProof || {};
    var tasks = [
      { label: 'Review your saved business rules', done: proof.reviewedRevision === revision, detail: proof.reviewedRevision === revision ? 'Your review is saved for this version.' : 'Check services, area, prices, hours and safety instructions.', tab: 'know', button: 'Review rules' },
      { label: 'Try a private customer conversation', done: proof.testedRevision === revision && proof.testMode === 'live', detail: proof.testedRevision === revision && proof.testMode === 'fake' ? 'A simulated test is saved. A working AI service and a new test are required before activation.' : proof.testedRevision === revision && proof.testMode === 'live' ? 'A private AI test completed using these rules.' : 'Practice a request safely; no real visit or message is created.', tab: 'test', button: 'Try your desk' },
      { label: 'Set your availability', done: false, detail: 'Block time already booked elsewhere. Review it whenever your schedule changes.', tab: 'availability', button: 'Check availability' },
      { label: 'Choose your customer connections', done: false, detail: 'Website, phone, text and calendar preferences share one setup. Check the next step for each connection.', tab: 'setup', button: 'View connections' },
      { label: 'Activate and install website chat', done: operational, detail: limited ? 'Your saved checks are kept. More AI replies become available at midnight Houston time.' : operational ? 'Website chat is active. Install it on your site, then check a customer conversation.' : setup.canActivateWeb ? 'Checks are complete. Activate chat, then install the code on your website.' : 'Complete the requirements below before customers can use your chat.', tab: 'setup', button: 'View setup' }
    ].filter(function (task) { return task.label !== 'Activate and install website chat' || wantsWeb || operational; });
    $('setupSteps').innerHTML = tasks.map(function (task) { return '<div class="setup-step"><div><strong>' + (task.done ? '✓ ' : '') + esc(task.label) + '</strong><p>' + esc(task.detail) + '</p></div><button type="button" class="btn-pill btn-pill-dark btn-sm" data-route="' + task.tab + '">' + esc(task.button) + '</button></div>'; }).join('');
    $('setupSteps').querySelectorAll('button').forEach(function (button) { button.addEventListener('click', function () { routeTo(button.dataset.route); }); });
    $('reviewRules').disabled = cfgDirty || cfgBusy || client.status === 'cancelled';
    $('aiAllowance').textContent = allowance ? 'AI replies left today: ' + allowance.private.remaining + ' practice · ' + allowance.web.remaining + ' customer chat. Resets at midnight Houston time.' : '';
    if (limited) { var activate = $('golive') || $('resume'); if (activate) activate.disabled = true; }
    $('reviewMessage').textContent = cfgDirty ? 'Save your changes before reviewing.' : proof.reviewedRevision === revision ? 'Review saved for the current version.' : '';
    $('checklist').innerHTML = setup.steps.map(function (step) { return '<div class="check"><span class="dot ' + (step.status === 'done' ? 'ok' : 'wait') + '"></span><div><strong>' + esc(step.label) + '</strong><p class="muted">' + esc(step.detail) + '</p></div></div>'; }).join('');
    $('numberText').textContent = 'No phone number has been purchased or connected for this workspace.';
    $('fwd').textContent = 'Call forwarding is not active. Keep your existing business phone setup.';
    $('tenDlc').textContent = 'Not filed. Text messaging requires provider approval and verified delivery before activation.';
    $('legalForm').style.display = 'none';
    $('voiceText').textContent = 'Phone answering is not active. Website chat can be activated separately.';
    $('health').textContent = 'Website chat: ' + (operational ? 'active' : 'not active') + '. Phone and text delivery have not been verified.';
    $('testSms').disabled = true; $('smsText').textContent = 'Not active. This workspace does not send texts.';
    $('calBtn').hidden = true; $('calText').textContent = 'Calendar sync is not connected. Use Availability to block work already booked elsewhere.';
    $('installStatus').textContent = operational ? 'Chat is active. After installing, open your website and confirm a customer can reach it.' : 'The code can be installed now; customer conversations stay unavailable until setup checks pass and website chat is activated.';
    $('handoffNote').textContent = 'Customer visits and callback requests are saved in this portal. Phone alerts, texts and calendar sync are not active. Check Leads and bookings for requests.';
    $('textCommands').hidden = true;
    $('usage').textContent = 'No phone or texting service is active. Creating this workspace does not purchase a number or start a paid subscription.';
    if (client.status === 'cancelled') $('liveBtns').textContent = 'Service cancelled. Saved records can be exported below.';
    var disabledNames = ['owner.backupPhone', 'phone.transferTo', 'phone.forwarding', 'rules.bypass', 'rules.consentAsk', 'digest.text', 'rules.ackMinutes', 'rules.callbackHours', 'rules.callbackAfterHours'];
    disabledNames.forEach(function (name) { var field = $('cfg').elements[name]; if (field) { field.disabled = true; field.closest('.form-group').hidden = true; } });
    var messages = setup.channels.web.blockers.map(function (blocker) { return blocker.detail; });
    $('setupMessage').textContent = !wantsWeb && !operational ? 'Your connection preferences are saved. Check Your connections for the next step; website chat is optional.' : limited ? 'The daily AI allowance has been used. Your settings and records are saved. More replies become available at midnight Houston time.' : messages.length ? 'Before activation: ' + messages.join(' ') : operational ? 'Website chat is active. Your other connections show their own status below.' : 'Ready to activate website chat using the button above.';
    if (!guideStarted) {
      guideStarted = true;
      var seen = false; try { seen = localStorage.getItem('mc-walkthrough-v1:' + slug) === 'seen'; } catch (error) { /* Optional preference only. */ }
      if (!seen) openTour();
    }
  }
  $('connectionPreferences').addEventListener('submit', async function (event) {
    event.preventDefault(); if (!data || !data.setup || $('saveConnections').disabled) return;
    var selected = Array.prototype.map.call($('connectionPreferences').querySelectorAll('input[name="connection"]:checked'), function (field) { return field.value; });
    $('saveConnections').disabled = true; $('connectionsMessage').textContent = 'Saving your preferences…';
    try {
      await action('save_connection_preferences', { desiredChannels: selected });
      if (leaving) return;
      await load(); if (!leaving) $('connectionsMessage').textContent = 'Preferences saved. Each connection shows its next step below.';
    } catch (error) { if (!leaving) $('connectionsMessage').textContent = 'Your preferences could not be saved. Try again.'; }
    finally { if (!leaving) $('saveConnections').disabled = false; }
  });
  $('reviewRules').addEventListener('click', function () {
    if (!data || !data.setup || cfgDirty || cfgBusy) return;
    $('reviewRules').disabled = true; $('reviewMessage').textContent = 'Saving your review…';
    action('review_rules', { revision: data.setup.revision }).then(function () { return load(); }).catch(function (error) { $('reviewMessage').textContent = error.message; $('reviewRules').disabled = false; });
  });
  $('copySnippet').addEventListener('click', async function () {
    try { await navigator.clipboard.writeText($('snippet').textContent); $('copyMessage').textContent = 'Copied. Install this on your website.'; }
    catch (error) { $('copyMessage').textContent = 'Select the code above and copy it manually.'; }
  });
  var tour = [
    { title: 'Your desk, in one place', body: 'Your next step appears at the top. Use the navigation to move between customer requests, your schedule and your front desk. Connections shows what is ready and what still needs attention.', action: 'See my setup', tab: 'setup' },
    { title: 'Make the answers yours', body: 'Open Business rules and check your services, service area, published prices, hours and safety instructions. Save any corrections, then select “I reviewed these saved rules.” Changes require another review and test.', action: 'Review my rules', tab: 'know' },
    { title: 'Practice the requests you get', body: 'Try a customer booking, callback request or question in Practice. The result shows the details collected. Practice does not book a real visit, contact anyone, use your actual capacity or change a calendar.', action: 'Try a private conversation', tab: 'test' },
    { title: 'Protect time you have already booked', body: 'Under Availability, block a whole day or an arrival window for existing jobs, closures or time off. Existing visits stay booked. Calendar sync is not connected, so keep outside work up to date here.', action: 'Check availability', tab: 'availability' },
    { title: 'Choose when customers can use it', body: 'Connections lists the requirements for website chat. When the saved rules have been reviewed and tested with the working AI service, activate chat and install the code on your website. Phone and text messages stay inactive until their own setup is verified.', action: 'See activation and installation', tab: 'setup' },
    { title: 'Know what needs you each day', body: 'Requests holds your customer work; Conversations shows what was said. Check these regularly while phone and text alerts are inactive. Pause website chat from the top of this page, export your records under Account, and reopen this guide whenever you need it.', action: 'View customer requests', tab: 'leads' }
  ];
  var tourIndex = 0, returnFocus = null;
  function renderTour() {
    var step = tour[tourIndex]; $('tourCount').textContent = 'Getting started · ' + (tourIndex + 1) + ' of ' + tour.length;
    $('tourTitle').textContent = step.title; $('tourBody').textContent = step.body; $('tourAction').textContent = step.action;
    $('tourBack').disabled = tourIndex === 0; $('tourNext').textContent = tourIndex === tour.length - 1 ? 'Finish walkthrough' : 'Next';
  }
  function openTour() { returnFocus = document.activeElement; renderTour(); if (!$('guideDialog').open) $('guideDialog').showModal(); }
  function closeTour() { $('guideDialog').close(); try { localStorage.setItem('mc-walkthrough-v1:' + slug, 'seen'); } catch (error) { /* Preference only, never setup proof. */ } if (returnFocus && returnFocus.isConnected) returnFocus.focus(); }
  $('openGuide').addEventListener('click', function () { tourIndex = 0; openTour(); });
  $('closeGuide').addEventListener('click', closeTour); $('skipGuide').addEventListener('click', closeTour);
  $('guideDialog').addEventListener('cancel', function (event) { event.preventDefault(); closeTour(); });
  $('tourNext').addEventListener('click', function () { if (tourIndex === tour.length - 1) closeTour(); else { tourIndex++; renderTour(); } });
  $('tourBack').addEventListener('click', function () { if (tourIndex > 0) { tourIndex--; renderTour(); } });
  $('tourAction').addEventListener('click', function () { var tab = tour[tourIndex].tab; closeTour(); routeTo(tab); });

  function load() {
    var generation = portalGeneration, fence = cfgFence;
    return apiRequest().then(function (d) {
      if (generation !== portalGeneration || fence !== cfgFence || leaving) return;
      if (!d.client || !d.client.owner || !d.client.business) throw new Error('Your workspace could not be loaded. Sign in again to continue.');
      $('portalRecovery').hidden = true; $('portalContent').hidden = false; document.body.dataset.workspaceState = 'ready'; $('deskRail').hidden = false;
      data = d; var c = d.client;
      queueMicrotask(function () { if (!leaving && data === d) document.dispatchEvent(new CustomEvent('mc:desk', { detail: d })); });
      var windowChoice = $('availabilityWindow').value;
      $('availabilityWindow').innerHTML = '<option value="">Whole day</option>' + (c.windows || []).map(function (w) { return '<option value="' + esc(w) + '">' + esc(w) + '</option>'; }).join('');
      if ((c.windows || []).indexOf(windowChoice) >= 0) $('availabilityWindow').value = windowChoice;
      var houstonToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      $('availabilityDate').min = houstonToday; if (!$('availabilityDate').value) $('availabilityDate').value = houstonToday;
      renderAvailability(d.availabilityBlocks || []);
      $('title').textContent = (c.business.name || 'Your front desk'); $('railBusiness').textContent = c.business.name || 'Your front desk';
      var selfService = c.onboarding && c.onboarding.version === 1;
      var st = $('status'); st.textContent = c.status === 'live' ? 'live' : c.status === 'testing' ? 'testing, not live yet' : c.status; st.className = 'st' + (c.status === 'live' ? ' live' : '');
      st.textContent = c.status === 'live' ? 'live' : c.status === 'testing' ? 'testing, not live yet' : c.status === 'paused' ? 'paused: calls ring your phone, no texts, no chat' : c.status === 'cancelled' ? 'cancelled' : c.status;
      var offBtns = (d.forwarding && d.forwarding.off && d.forwarding.off.length && (c.status === 'paused' || c.status === 'cancelled')) ? '<div class="muted" style="margin-top:8px">Send calls back to your phone: ' + d.forwarding.off.map(function (k) { return '<a class="btn-pill btn-pill-dark btn-sm" style="margin:4px 6px 4px 0" href="tel:' + encodeURIComponent(k) + '">Dial ' + esc(k) + '</a>'; }).join('') + '<br>' + esc(d.forwarding.offLong || '') + '</div>' : '';
      document.querySelector('.tabs button[data-t="test"]').style.display = c.status === 'cancelled' ? 'none' : '';
      var live = c.status === 'live'; $('tabToday').style.display = ''; $('tabTest').style.display = c.status === 'cancelled' ? 'none' : '';
      if (!location.hash && !window.__tabPicked) { showTab('today'); window.__tabPicked = true; }

      $('needsYou').innerHTML = (function () { var rows = d.leads.filter(function (l) { return l.status === 'open' && (l.alertWaiting || l.overdueAt || l.outcome === 'needs_action' || l.outcome === 'wants_call'); }); return rows.length ? rows.slice(0, 10).map(function (l) { return '<div>' + esc(l.customer_name || l.phone) + ' (' + esc((l.outcome || '').replace('_', ' ')) + (l.urgency === 'emergency' ? ', <b>EMERGENCY</b>' : '') + (l.overdueAt ? ', <span class="tag-overdue">overdue callback</span>' : '') + ') ref ' + esc(l.id) + (l.alertWaiting ? ' <button type="button" class="btn-pill btn-pill-blue btn-sm ack" data-id="' + esc(l.id) + '">Acknowledge</button>' : '') + '</div>'; }).join('') : emptyState('You’re all caught up', 'Requests that need a callback, an acknowledgment or urgent attention will appear here.', 'View customer requests', 'leads'); })();
      $('todayEvents').innerHTML = (d.events || []).filter(function (e) { return Date.now() - new Date(e.at).getTime() < 86400000; }).slice(0, 15).map(function (e) { return '<div>' + esc((e.at || '').slice(11, 16)) + ' ' + esc(e.type.replace(/_/g, ' ')) + (e.data && e.data.id ? ' ref ' + esc(e.data.id) : '') + '</div>'; }).join('') || emptyState('No activity in the last 24 hours', 'Customer activity appears here after it happens. Private practice is kept separate.');
      (function () { var dayOf = function (iso) { return iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }) : ''; }; var today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
        var t = d.today || {}; var calls = t.calls || 0, texts = t.texts || 0, booked = t.bookings || 0, need = t.needsYou || 0; var h = d.health || {};
        document.getElementById('today').innerHTML = '<div><b>' + calls + '</b> calls</div><div><b>' + texts + '</b> texts in</div><div><b>' + booked + '</b> booked today</div><div><b>' + need + '</b> need you</div><div class="muted">' + (selfService ? 'Website chat: ' + (d.webAvailable ? 'active' : 'not active') : 'Line: ' + (h.errors24h ? h.errors24h + ' errors in 24 h' : 'OK')) + '</div>'; })();
      $('liveBtns').innerHTML = (c.status === 'cancelled' ? '<span class="muted">line rings through until ' + esc((c.serviceEndsAt || '').slice(0, 10)) + '</span>' : c.status === 'paused'
        ? '<button class="btn-pill btn-pill-blue btn-sm" id="resume">Resume</button> <button class="btn-pill btn-pill-dark btn-sm" id="cancelBtn">Cancel service</button>'
        : (c.status === 'live' ? '<button class="btn-pill btn-pill-dark btn-sm" id="pause">Pause</button> ' : '<button class="btn-pill btn-pill-blue btn-sm" id="golive">Go live</button> ') + '<button class="btn-pill btn-pill-dark btn-sm" id="cancelBtn" style="opacity:.7' + (c.status === 'live' ? ';display:none' : '') + '">Cancel service</button>') + offBtns;
      if (c.status === 'live') { var tl = document.createElement('a'); tl.id = 'testLink'; tl.href = '#test'; tl.className = 'muted'; tl.style.marginLeft = '10px'; tl.textContent = 'Test it'; tl.addEventListener('click', function (ev) { ev.preventDefault(); window.__tabPicked = true; $('tabTest').style.display = ''; showTab('test'); }); $('liveBtns').appendChild(tl); }
      var go = $('golive'), pa = $('pause'), re = $('resume'), ca = $('cancelBtn') || $('cancelBtn2');
      if ($('cancelBtn') && $('cancelBtn2')) $('cancelBtn2').addEventListener('click', function () { $('cancelBtn').click(); });
      if (go) { if (selfService) { go.textContent = 'Activate website chat'; go.disabled = !d.setup || !d.setup.canActivateWeb; } go.addEventListener('click', function () { confirmAction('go_live', selfService ? 'Website chat is active. Check Connections for your other services.' : 'Activation saved. Check Setup for each channel.'); }); }
      if (pa) pa.addEventListener('click', function () { confirmAction('pause', selfService ? 'Website chat is paused.' : 'Service paused. Check call forwarding under Setup.'); });
      if (re) { if (selfService) re.disabled = !d.setup || !d.setup.canActivateWeb; re.addEventListener('click', function () { confirmAction('resume', selfService ? 'Website chat is active again.' : 'Resume saved. Check Setup for active channels.'); }); }
      if (ca) ca.addEventListener('click', function () {
        var box = document.getElementById('cancelBox'); if (box) { box.remove(); return; }
        box = document.createElement('div'); box.id = 'cancelBox'; box.className = 'card2'; box.style.marginTop = '12px';
        box.innerHTML = '<h3>Cancel the front desk</h3><p class="muted">This stops service today. Your saved records remain available to export for 30 days. ' + (selfService ? 'Website chat will stop accepting customer messages.' : 'Check call forwarding under Setup before disconnecting your front desk number.') + '</p><div class="form-group"><label class="form-label">Anything we should know? (optional)</label><input class="form-input" id="cancelReason"></div><button type="button" class="btn-pill btn-pill-dark btn-sm" id="cancelGo">Yes, cancel today</button> <button type="button" class="btn-pill btn-pill-blue btn-sm" id="cancelNo">Keep it</button>';
        document.querySelector('.dk-head').after(box);
        document.getElementById('cancelNo').addEventListener('click', function () { box.remove(); });
        document.getElementById('cancelGo').addEventListener('click', function () { apiRequest('POST', { action: 'cancel', reason: document.getElementById('cancelReason').value }).then(function () { box.remove(); toast('Service cancelled. Your records remain available to export.'); return load(); }).catch(function (error) { toast(error.message); }); });
      });
      $('missing').textContent = (c.build && c.build.notes) ? c.build.notes : 'Nothing major.';
      // records
      $('bookings').innerHTML = d.bookings.length ? '<div class="tblwrap"><table class="tbl"><tr><th>When</th><th>Customer</th><th>Issue</th><th>Visit</th><th>Status</th><th>Ref</th>' + (selfService ? '<th>Manage</th>' : '') + '</tr>' + d.bookings.map(function (b) { return '<tr><td>' + esc(recordTimeLabel(b.createdAt)) + '</td><td>' + esc(b.customer_name) + ' <span class="muted">(' + (b.customerType === 'existing' ? 'existing' : 'new') + ')</span><br><span class="muted">' + esc(b.phone) + '</span>' + (b.unsure ? '<br><span class="muted">Unsure: ' + esc(b.unsure) + '</span>' : '') + '</td><td>' + esc(b.issue) + '<br><span class="muted">' + esc(b.address) + '</span></td><td>' + esc(visitDateLabel(b.date)) + ' ' + esc(b.window) + '</td><td>' + esc(b.status) + '</td><td>' + esc(b.id) + '</td>' + (selfService ? '<td><button type="button" class="btn-pill btn-pill-dark btn-sm visit-open" data-visit="' + esc(b.id) + '">' + (b.pendingVisitChange ? 'Resume change' : 'View visit') + '</button></td>' : '') + '</tr>'; }).join('') + '</table></div>' : emptyState('No bookings yet', 'When your front desk saves a real customer visit, you’ll see the arrival window and job details here.', 'Check connections', 'setup');
      $('newVisit').hidden=!selfService; if(selfService)$('newVisit').textContent=(d.pendingVisitCreations || []).length?'Resume new visit':'Add visit';
      document.querySelectorAll('.visit-open').forEach(function (button) { button.addEventListener('click', function () { openVisit(button.dataset.visit); }); });
      $('leads').innerHTML = d.leads.length ? '<div class="tblwrap"><table class="tbl"><tr><th>When</th><th>Customer</th><th>Issue</th><th>Outcome</th><th>Status</th><th>Ref</th></tr>' + d.leads.map(function (l) { return '<tr><td>' + esc(recordTimeLabel(l.createdAt)) + '</td><td>' + esc(l.customer_name || 'no name') + ' <span class="muted">(' + (l.customerType === 'existing' ? 'existing' : 'new') + ')</span><br><span class="muted">' + esc(l.phone) + '</span></td><td>' + esc(l.issue) + (l.unsure ? '<br><span class="muted">Unsure: ' + esc(l.unsure) + '</span>' : '') + '</td><td>' + esc((l.outcome || l.reason || '').replace('_', ' ')) + (l.urgency === 'emergency' ? ' <b>EMERGENCY</b>' : '') + (l.overdueAt && l.status === 'open' ? '<span class="tag-overdue">overdue callback</span>' : '') + (l.alertWaiting ? ' <button type="button" class="btn-pill btn-pill-blue btn-sm ack" data-id="' + esc(l.id) + '">Acknowledge</button>' : '') + '</td><td>' + esc(l.status) + '</td><td>' + esc(l.id) + '</td></tr>'; }).join('') + '</table></div>' : emptyState('No callback requests yet', 'Requests passed to you will include the customer’s details and what they need.', 'Try a private conversation', 'test');
      document.querySelectorAll('button.ack').forEach(function (b) { b.addEventListener('click', function () { apiRequest('POST', { action: 'ack', leadId: b.dataset.id }).then(function () { toast('Acknowledged.'); return load(); }).catch(function (error) { toast(error.message); }); }); });
      $('convs').innerHTML = renderConversations(d.conversations); $('bookingCount').textContent = d.bookings.length; $('leadCount').textContent = d.leads.length; decorateRecordTables();
      document.querySelectorAll('button.flag').forEach(function (b) { b.addEventListener('click', function () { var note = window.prompt('What went wrong? One line is enough.') || ''; apiRequest('POST', { action: 'flag', channel: b.dataset.ch, contact: b.dataset.ct, note: note }).then(function () { toast('Issue recorded on this conversation.'); return load(); }).catch(function (error) { toast(error.message); }); }); });
      document.querySelectorAll('a.unflag').forEach(function (a) { a.addEventListener('click', function (ev) { ev.preventDefault(); apiRequest('POST', { action: 'unflag', channel: a.dataset.ch, contact: a.dataset.ct }).then(function () { return load(); }).catch(function (error) { toast(error.message); }); }); });
      // Background refreshes must never replace an edited or pending draft.
      if (!cfgDirty && !cfgBusy && !cfgConflict) {
        cfgFill(cfgFromClient(c)); cfgBaseline = cfgRead(); cfgRevision = d.configurationRevision; cfgEditRevision = d.editRevision; cfgClosed = !!(c.onboarding && c.onboarding.version === 1 && ['cancelled','archived'].includes(c.status));
        cfgStatus(cfgClosed ? 'error' : cfgIncomplete(d.setup) ? 'incomplete' : 'saved', cfgClosed ? 'This workspace no longer accepts business edits.' : cfgSavedMessage(d.setup));
      }
      acctObserve(d, false);
      var u = d.usage || {}; $('usage').textContent = u.month ? (u.minutes || 0) + ' of ' + (u.included && u.included.minutes) + ' call minutes, ' + (u.texts || 0) + ' of ' + (u.included && u.included.texts) + ' texts to customers (' + u.month + '). Past the plan it is $0.35 a minute and $0.03 a text; nothing changes on the line.' : '';
      [['expBookings','bookings'],['expLeads','leads'],['expConvs','conversations'],['expCustomers','customers']].forEach(function (item) { $(item[0]).href = '#download-' + item[1]; $(item[0]).dataset.export = item[1]; });
      // setup
      $('snippet').textContent = '<script src="' + d.site + '/embed.js" data-client="' + c.slug + '" async><\/script>';
      $('calBtn').href = '/api/google/auth?c=' + c.slug + '&k=' + key; $('calText').textContent = c.calendar.connected ? 'Connected.' : (d.integrations.google ? 'Bookings go on your Google Calendar once connected.' : 'Coming online; bookings are texted to you meanwhile.'); if (!d.integrations.google) $('calBtn').addEventListener('click', function (e) { e.preventDefault(); toast('Calendar connection is being switched on. Bookings are texted to you meanwhile.'); });
      var ph = c.phone || {}, fw = d.forwarding || {}, dlc = ph.tenDlc || 'not_started';
      var dlcText = { not_started: 'Not filed yet.', waiting_keys: 'Being filed by Machines & Cloud.', needs_business_details: 'We need your legal business name, EIN, and address to file it. Add them below.', brand_pending: 'Filed. Carriers are reviewing your business (usually 1 to 2 weeks). Your front desk texts from Machines & Cloud\'s registered number until then, with your name on every message.', campaign_pending: 'Business approved. Carriers are reviewing the texting use case (one to six weeks). Same bridge until then.', approved: 'Approved. Your front desk texts customers from your number.', failed: 'The carriers rejected the filing. Steve has been notified and will fix it with you.' }[dlc] || dlc;
      $('numberText').textContent = ph.twilioNumber ? ph.twilioNumber + ' (calls you forward and all customer texts go here; you keep your main number).' : (c.provision && c.provision.status === 'running' ? 'Being set up now.' : 'Being assigned. You will get it by text and email.');
      $('fwd').innerHTML = ph.twilioNumber ? ('<p>' + esc(fw.carrier || 'Your carrier') + ': ' + (fw.codes && fw.codes.length ? fw.codes.map(function (k) { return '<a class="btn-pill btn-pill-dark btn-sm" style="margin:4px 6px 4px 0" href="tel:' + encodeURIComponent(k) + '">Dial ' + esc(k) + '</a>'; }).join('') : esc(fw.note || '')) + '</p><p>' + esc(fw.long || '') + '</p><p>' + (ph.forwardingVerified ? 'Verified: a forwarded call reached the front desk.' : 'Not verified yet. Call your own number from another phone, do not answer, and the front desk should pick up.') + ' <button type="button" class="btn-pill btn-pill-dark btn-sm" id="fwOk">I did this</button></p>') : '<p>Available once your number is assigned.</p>';
      var fwOk = $('fwOk'); if (fwOk) fwOk.addEventListener('click', function () { action('forwarding_verified').then(function () { toast('Thanks. We will confirm it on the first forwarded call.'); load(); }); });
      $('tenDlc').textContent = dlcText;
      var h = d.health || {}; var rel = function (iso) { if (!iso) return 'none yet'; var m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };
      $('health').innerHTML = '<div>Last inbound call: ' + rel(h.lastInboundCall) + '</div><div>Last inbound text: ' + rel(h.lastInboundText) + '</div><div>Last text delivered: ' + rel(h.lastOutboundText) + '</div><div style="color:' + (h.errors24h > 0 ? '#B91C1C' : 'inherit') + '">Errors in the last 24 h: ' + (h.errors24h || 0) + '</div><div>Texting from: ' + (h.sender === 'own' ? 'your number' : h.sender === 'bridge' ? 'Machines & Cloud\'s registered number until carriers approve yours' : 'not yet') + '</div>';
      $('dataPolicy').textContent = d.dataPolicy || ''; $('policyLink').textContent = (d.policy && d.policy.privacy) || ''; $('policyLink').href = (d.policy && d.policy.privacy) || '#';
      var lg = (c.business && c.business.legal) || {}; var lf = $('legal');
      $('legalForm').style.display = (dlc === 'needs_business_details' || dlc === 'not_started' || dlc === 'failed') ? 'block' : 'none';
      lf.elements['legalName'].value = lg.legalName || ''; lf.elements['ein'].value = lg.ein || ''; lf.elements['businessType'].value = lg.businessType || 'llc'; lf.elements['street'].value = lg.street || ''; lf.elements['city'].value = lg.city || ''; lf.elements['state'].value = lg.state || 'TX'; lf.elements['zip'].value = lg.zip || '';
      $('voiceText').textContent = c.voice && c.voice.ready ? 'On. Forwarded calls are answered by your front desk, which books visits and texts you the details.' : (ph.twilioNumber ? 'Forwarded calls hear a short message and get a text back within seconds; the front desk continues by text. Live phone answering is being switched on.' : 'Available once your number is assigned.');
      $('siteBlock').textContent = ['Hours: ' + (c.business.hours || '[your hours]') + (c.business.afterHours && !/ASK OWNER/i.test(c.business.afterHours) ? '. After hours: ' + c.business.afterHours : ''), 'Service area: ' + ((c.business.serviceArea || []).join(', ') || '[your area]'), (c.fees || []).length ? 'Pricing: ' + c.fees.map(function (x) { return x.label + ' ' + x.amount + (x.note ? ' (' + x.note + ')' : ''); }).join('; ') : '', '', (c.faq || []).filter(function (x) { return !/ASK OWNER/i.test(x.a); }).slice(0, 6).map(function (x) { return x.q + '\n' + x.a; }).join('\n\n')].filter(Boolean).join('\n');
      $('checklist').innerHTML = [
        ['ok', 'Front desk built from your website and answers'],
        [c.faq.some(function (x) { return /ASK OWNER/i.test(x.a); }) ? 'wait' : 'ok', 'Answers checked under What it knows'],
        [c.owner.phone ? 'ok' : 'wait', 'Your cell on file for lead texts'],
        [ph.twilioNumber ? 'ok' : 'wait', 'Front desk number assigned'],
        [ph.forwarding === 'none' ? 'ok' : (ph.forwardingVerified ? 'ok' : 'wait'), ph.forwarding === 'none' ? 'Phone: texts and chat only for now' : 'Call forwarding turned on from your cell (' + (ph.forwarding === 'all' ? 'all calls' : 'missed calls') + ')'],
        [dlc === 'approved' ? 'ok' : 'wait', 'Texting registration approved by carriers'],
        [(c.business.reviewLink || c.business.googlePlaceId) ? 'ok' : 'wait', 'Google review link added (review requests start only once it is there; the field is under You)'],
        [c.calendar.connected ? 'ok' : 'wait', 'Calendar connected (optional; bookings are texted to you either way)'],
        [c.status === 'live' ? 'ok' : 'wait', 'Live on your website'],
      ].map(function (x) { return '<div class="check"><span class="dot ' + x[0] + '"></span><span>' + x[1] + '</span></div>'; }).join('');
      $('liveEvents').innerHTML = (d.events || []).length ? d.events.slice(0, 8).map(function (e) { return '<div>' + esc((e.at || '').slice(5, 16).replace('T', ' ')) + ' ' + esc(e.type) + (e.data && e.data.id ? ' ref ' + esc(e.data.id) : '') + '</div>'; }).join('') : 'No service activity yet. Practice conversations stay separate.';
      renderSetup(d);
    }).catch(function (error) { if (generation === portalGeneration && fence === cfgFence && !leaving) recover(error.name === 'AbortError' ? 'Loading timed out. Try again or sign in by email.' : error.message); });
  }
  function action(a, extra) { return apiRequest('POST', Object.assign({ action: a }, extra || {})); }
  function confirmAction(name, message) { return action(name).then(function () { toast(message); return load(); }).catch(function (error) { $('setupMessage').textContent = error.message; toast(error.message); }); }
  $('testSms').addEventListener('click', function () { action('test_sms').then(function (r) { $('smsText').textContent = r.ok ? 'Test text request accepted. Check your phone for delivery.' : 'No test text was sent.'; }).catch(function (error) { $('smsText').textContent = error.message; }); });

  $('cfg').elements['phone.forwarding'].addEventListener('change', function (ev) { document.getElementById('transferGroup').style.display = ev.target.value === 'all' ? 'block' : 'none'; });
  var cfgBaseline = null, cfgBusy = false, cfgConflict = null, cfgFence = 0, cfgClosed = false, cfgEventValues = new WeakMap();
  var acctBaseline = null, acctRevision = null, acctEditRevision = null, acctDirty = false, acctBusy = false, acctConflict = null, acctEventValue = null;
  var cfgDays = ['mon','tue','wed','thu','fri','sat','sun'];
  var cfgArrayFields = ['services','business.serviceArea','business.notServed','windows','rules.handoff','rules.never','rules.emergencies.tier0','rules.emergencies.tier1','rules.bypass','widget.allowedOrigins'];
  function cfgRead() {
    var values = {};
    $('cfg').querySelectorAll('[name]').forEach(function(field){ values[field.name] = field.type === 'checkbox' ? field.checked : field.value; });
    var hours = {}; cfgDays.forEach(function(day){ hours[day] = {}; ['open','close'].forEach(function(kind){ var field=$('hoursRows').querySelector('[data-d="'+day+'"][data-k="'+kind+'"]'); hours[day][kind]=field ? field.value : ''; }); });
    values['rules.hours'] = JSON.stringify(hours); return values;
  }
  function cfgFromClient(client) {
    var values = {}, read = function(path){return path.split('.').reduce(function(value,key){return value == null ? undefined : value[key];},client);};
    $('cfg').querySelectorAll('[name]').forEach(function(field){var value=read(field.name);values[field.name]=field.type==='checkbox'?!!value:value == null?'':String(value);});
    cfgArrayFields.forEach(function(name){values[name]=(read(name)||[]).join('\n');});
    values['business.spanish']=client.business.spanish?'yes':'no'; values['phone.forwarding']=client.phone.forwarding||'missed';
    values['rules.windowCapacity']=String(client.rules.windowCapacity||1);values['rules.ackMinutes']=String(client.rules.ackMinutes||10);values['digest.text']=!(client.digest&&client.digest.text===false);
    values.fees=(client.fees||[]).map(function(row){return row.label+': '+row.amount+(row.note?' ('+row.note+')':'');}).join('\n');
    values.faq=(client.faq||[]).map(function(row){return row.q+' '+row.a;}).join('\n');
    var hours={};cfgDays.forEach(function(day){var row=client.rules.hours&&client.rules.hours[day];hours[day]={open:row&&row.open||'',close:row&&row.close||''};});values['rules.hours']=JSON.stringify(hours);return values;
  }
  function cfgFill(values, preserve) {
    var rows=$('hoursRows');if(!rows.children.length)rows.innerHTML=cfgDays.map(function(day){return '<div class="hours-row"><span>'+day.charAt(0).toUpperCase()+day.slice(1)+'</span><input type="time" data-d="'+day+'" data-k="open" aria-label="'+day+' opening time"><span>to</span><input type="text" inputmode="numeric" maxlength="5" placeholder="17:00" data-d="'+day+'" data-k="close" aria-label="'+day+' closing time, 24:00 for midnight"></div>';}).join('');
    $('cfg').querySelectorAll('[name]').forEach(function(field){if(preserve&&Object.hasOwn(preserve,field.name))return;if(field.type==='checkbox')field.checked=!!values[field.name];else field.value=values[field.name] == null?'':values[field.name];});
    if(!preserve||!Object.hasOwn(preserve,'rules.hours')){var hours=JSON.parse(values['rules.hours']);rows.querySelectorAll('input').forEach(function(field){field.value=hours[field.dataset.d][field.dataset.k];});}
    $('hoursNote').textContent='Leave both times blank for a closed day. Use 24:00 to end at midnight.';
    $('transferGroup').style.display=$('cfg').elements['phone.forwarding'].value==='all'?'block':'none';
    cfgErrorElements();$('cfg').querySelectorAll('[name],#hoursRows input').forEach(function(field){cfgEventValues.set(field,field.type==='checkbox'?String(field.checked):field.value);});
  }
  function cfgChanges(values, base) { return base?Object.keys(values).filter(function(name){return values[name]!==base[name];}):[]; }
  function cfgStatus(kind,message) { $('cfg').dataset.saveState=kind;if($('saveMsg').textContent!==message)$('saveMsg').textContent=message;$('saveCfg').disabled=cfgBusy||acctBusy||cfgClosed;$('cfg').setAttribute('aria-busy',String(cfgBusy));$('cfgCheckLatest').disabled=cfgBusy||acctBusy;$('cfgKeepEdits').disabled=cfgBusy||acctBusy;$('saveAcct').disabled=cfgBusy||acctBusy||cfgClosed; }
  function cfgIncomplete(setup) { return !!(setup&&setup.channels&&setup.channels.web&&setup.channels.web.blockers.some(function(row){return row.id==='rules'||row.id==='handoff';})); }
  function cfgSavedMessage(setup) { return cfgIncomplete(setup)?'Saved as a draft. Complete your business rules and callback details before activation.':'All changes saved. Review and test these rules before activating website chat.'; }
  function cfgField(name) {if(name.indexOf('rules.hours')!==0){var path=name;while(path&&!$('cfg').elements[path])path=path.includes('.')?path.slice(0,path.lastIndexOf('.')):'';return path?$('cfg').elements[path]:null;}var parts=name.split('.'),match=cfgDays.indexOf(parts[2])>=0?$('hoursRows').querySelector('[data-d="'+parts[2]+'"][data-k="'+(parts[3]==='close'?'close':'open')+'"]'):null;if(match)return match;var bad=null;cfgDays.some(function(day){var open=$('hoursRows').querySelector('[data-d="'+day+'"][data-k="open"]'),close=$('hoursRows').querySelector('[data-d="'+day+'"][data-k="close"]');if(!open||!close||!open.value&&!close.value)return false;if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(open.value)){bad=open;return true;}if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(close.value)&&close.value!=='24:00'||close.value<=open.value){bad=close;return true;}return false;});return bad||$('hoursRows').querySelector('input');}
  function cfgErrorElements() {
    $('cfg').querySelectorAll('[name],#hoursRows input').forEach(function(field,index){var name=field.name||'rules.hours',id=name==='rules.hours'?'cfgHoursError':'cfgError-'+(field.id||(field.id='cfgField-'+index));var error=$(id);if(!error){error=document.createElement('p');error.id=id;error.className='cfg-field-error';if(name==='rules.hours')$('hoursRows').after(error);else field.after(error);}var ids=(field.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean);if(ids.indexOf(id)<0)ids.push(id);field.setAttribute('aria-describedby',ids.join(' '));field.dataset.cfgError=id;});
  }
  function cfgClearError(name) {if(name&&name.indexOf('rules.hours')===0)name='rules.hours';var fields=name==='rules.hours'?$('hoursRows').querySelectorAll('input'):name?[$('cfg').elements[name]]:$('cfg').querySelectorAll('[data-cfg-error]');Array.prototype.forEach.call(fields,function(field){if(!field)return;field.removeAttribute('aria-invalid');delete field.dataset.cfgInvalidValue;if(field.dataset.cfgError&&$(field.dataset.cfgError))$(field.dataset.cfgError).textContent='';});}
  function cfgShowErrors(errors) {
    cfgClearError();var first=null;
    Object.keys(errors).forEach(function(name){var field=cfgField(name);if(!field)return;var fields=name.indexOf('rules.hours')===0?$('hoursRows').querySelectorAll('input'):[field];Array.prototype.forEach.call(fields,function(input){input.setAttribute('aria-invalid','true');input.dataset.cfgInvalidValue=input.type==='checkbox'?String(input.checked):input.value;if(input.dataset.cfgError)$(input.dataset.cfgError).textContent=errors[name];});if(!first&&!field.disabled)first=field;});
    if(first){routeTo('know');var details=first.closest('details');if(details)details.open=true;first.focus();first.scrollIntoView({block:'center'});}else $('saveMsg').focus();
  }
  function cfgValidPhone(value) {var raw=value.trim();if(!raw)return true;if(!/^[+\d\s().-]+$/.test(raw)||raw.indexOf('+')>0||raw.indexOf('+',1)>=0)return false;var digits=raw.replace(/\D/g,'');if(raw[0]==='+'&&!raw.startsWith('+1'))return false;if(digits.length===11&&digits[0]==='1')digits=digits.slice(1);return /^[2-9]\d{2}[2-9]\d{6}$/.test(digits);}
  function cfgValidate(values, changed) {
    var errors={},lines=function(name){return String(values[name]||'').split('\n').map(function(row){return row.trim();}).filter(Boolean);};
    ['owner.phone','owner.backupPhone','phone.transferTo'].forEach(function(name){if(changed.indexOf(name)>=0&&!cfgValidPhone(values[name]))errors[name]='Enter a valid US number, such as (713) 555-0142, or leave it blank for now.';});
    if(changed.indexOf('rules.windowCapacity')>=0&&(!/^\d+$/.test(values['rules.windowCapacity'])||Number(values['rules.windowCapacity'])<1||Number(values['rules.windowCapacity'])>20))errors['rules.windowCapacity']='Choose a whole number from 1 to 20.';
    if(changed.indexOf('rules.hours')>=0){var hours=JSON.parse(values['rules.hours']),valid=function(value,closing){return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)||closing&&value==='24:00';};cfgDays.forEach(function(day){var h=hours[day];if((h.open||h.close)&&(!valid(h.open,false)||!valid(h.close,true)||h.close<=h.open))errors['rules.hours']='Add valid opening and closing times for each open day. Closing time must be later; leave both blank for a closed day.';});}
    if(changed.indexOf('faq')>=0&&lines('faq').some(function(line){var i=line.indexOf('?');return i<=0||!line.slice(i+1).trim();}))errors.faq='Use one question and answer per line, with a question mark between them.';
    return errors;
  }
  function cfgPayload(values, changed) {
    var body={expectedRevision:cfgRevision,expectedEditRevision:cfgEditRevision},lines=function(name){return String(values[name]||'').split('\n').map(function(row){return row.trim();}).filter(Boolean);};
    var legacy=!(data.client.onboarding&&data.client.onboarding.version===1);if(legacy)changed=Object.keys(values);
    changed.forEach(function(name){var value=values[name];if(cfgArrayFields.indexOf(name)>=0)value=lines(name);else if(name==='business.spanish')value=value==='yes';else if(['rules.windowCapacity','rules.ackMinutes'].indexOf(name)>=0)value=Number(value);else if(name==='rules.hours'){var hours=JSON.parse(value);cfgDays.forEach(function(day){if(!hours[day].open&&!hours[day].close)hours[day]=null;});value=hours;}else if(name==='fees')value=lines(name).map(function(line){var m=line.match(/^(.*?)[:\-–]\s*(\$?[\d,.]+[^(]*)(?:\((.*)\))?$/);return m?{label:m[1].trim(),amount:m[2].trim(),note:(m[3]||'').trim()}:{label:line,amount:'',note:''};});else if(name==='faq')value=lines(name).map(function(line){var i=line.indexOf('?');return {q:line.slice(0,i+1).trim(),a:line.slice(i+1).trim()};});var parts=name.split('.'),target=body;parts.slice(0,-1).forEach(function(key){target=target[key]||(target[key]={});});target[parts[parts.length-1]]=value;});if(legacy){body.business.city=data.client.business.city;body.business.googlePlaceId=data.client.business.googlePlaceId;body.phone.businessNumber=data.client.phone.businessNumber;body.phone.carrier=data.client.phone.carrier;}return body;
  }
  function cfgChanged() {
    if(!cfgBaseline||leaving)return;cfgDirty=cfgChanges(cfgRead(),cfgBaseline).length>0;
    if(data&&data.setup){$('reviewRules').disabled=cfgDirty||cfgBusy||data.client.status==='cancelled';$('reviewMessage').textContent=cfgDirty||cfgBusy?'Save your edits before reviewing this version.':'';}
    if(cfgClosed)cfgStatus('error','This workspace no longer accepts business edits. Your typed changes are kept on this page.');else if(cfgBusy)cfgStatus('saving','Saving the submitted changes. Any newer edits will stay here.');else if(cfgConflict)cfgStatus('conflict','Your edits are kept. Review the latest saved version before saving again.');else cfgStatus(cfgDirty?'dirty':cfgIncomplete(data&&data.setup)?'incomplete':'saved',cfgDirty?'You have unsaved changes.':cfgSavedMessage(data&&data.setup));
  }
  async function saveCfg() {
    if(cfgBusy||acctBusy||cfgClosed||leaving||!data||!cfgBaseline)return;
    var snapshot=cfgRead(),changed=cfgChanges(snapshot,cfgBaseline);if(!changed.length){cfgChanged();return;}
    if(cfgConflict){$('cfgConflictPanel').hidden=false;cfgStatus('conflict','Your edits are kept. Check the latest saved version before saving again.');$('cfgCheckLatest').focus();return;}
    var errors=cfgValidate(snapshot,changed);if(Object.keys(errors).length){cfgStatus('error','Check the highlighted details. Your edits have not been saved.');cfgShowErrors(errors);return;}
    var generation=portalGeneration;cfgBusy=true;cfgFence++;cfgClearError();cfgChanged();acctStatus();
    try{var result=await apiRequest('PUT',cfgPayload(snapshot,changed));if(leaving||generation!==portalGeneration)return;if(!result.client||data.client.onboarding&&data.client.onboarding.version===1&&(!/^[a-f0-9]{64}$/.test(result.configurationRevision||'')||!/^[a-f0-9]{64}$/.test(result.editRevision||'')))throw new Error('The saved version could not be confirmed.');
      var current=cfgRead(),preserve={};Object.keys(current).forEach(function(name){if(current[name]!==snapshot[name])preserve[name]=current[name];});var saved=cfgFromClient(result.client);cfgFill(saved,preserve);cfgBaseline=saved;cfgRevision=result.configurationRevision;cfgEditRevision=result.editRevision;cfgFence++;data.client=result.client;if(result.setup)data.setup=result.setup;if(result.configurationRevision)data.configurationRevision=result.configurationRevision;if(result.editRevision)data.editRevision=result.editRevision;cfgDirty=cfgChanges(cfgRead(),cfgBaseline).length>0;cfgConflict=null;$('cfgConflictPanel').hidden=true;renderSetup(data);if(!leaving)document.dispatchEvent(new CustomEvent('mc:desk',{detail:data}));
      acctObserve(result,true);cfgBusy=false;cfgStatus(cfgDirty?'dirty':cfgIncomplete(result.setup)?'incomplete':'saved',cfgDirty?'Submitted changes saved. Your newer edits are still unsaved.':cfgSavedMessage(result.setup));
    }catch(error){if(leaving||generation!==portalGeneration)return;cfgBusy=false;cfgDirty=cfgChanges(cfgRead(),cfgBaseline).length>0;if(error.status===401||error.status===403){document.dispatchEvent(new CustomEvent('mc:session-expired'));return;}if(error.code==='configuration_changed'){cfgConflict={latest:null};$('cfgConflictPanel').hidden=false;$('cfgKeepEdits').hidden=true;cfgStatus('conflict','Your saved details changed elsewhere. Your edits are kept; check the latest version.');}else{if(error.code==='workspace_closed')cfgClosed=true;cfgStatus('error',(error.message||'The save could not be confirmed.')+' Your edits are still here.');var fieldErrors=Object.assign({},error.fieldErrors||{});if(error.field&&!Object.keys(fieldErrors).length)fieldErrors[error.field]=error.message;var present=cfgRead();Object.keys(fieldErrors).forEach(function(name){var field=cfgField(name),grouped=name.indexOf('rules.hours')===0?'rules.hours':field&&field.name||name;if(present[grouped]!==snapshot[grouped])delete fieldErrors[name];});if(Object.keys(fieldErrors).length)cfgShowErrors(fieldErrors);}}
    finally{if(!leaving&&generation===portalGeneration){cfgBusy=false;$('cfg').setAttribute('aria-busy','false');$('saveCfg').disabled=cfgClosed||acctBusy;$('cfgCheckLatest').disabled=false;$('cfgKeepEdits').disabled=false;if(data&&data.setup)$('reviewRules').disabled=cfgDirty||data.client.status==='cancelled';acctStatus();}}
  }
  function cfgLabel(name) {var field=cfgField(name),label=field&&field.closest('.form-group')&&field.closest('.form-group').querySelector('label');return name==='rules.hours'?'Weekly hours':label?label.textContent.trim():name==='faq'?'Customer questions':name;}
  function cfgDisplay(name,value) {if(name==='rules.hours'){var hours=JSON.parse(value);return cfgDays.map(function(day){return day+': '+(hours[day].open||hours[day].close?hours[day].open+' to '+hours[day].close:'closed');}).join('; ');}return typeof value==='boolean'?value?'Yes':'No':value||'Blank';}
  $('cfgCheckLatest').addEventListener('click',async function(){if(cfgBusy||acctBusy||!cfgConflict||leaving)return;var generation=portalGeneration;cfgBusy=true;cfgStatus('conflict','Checking the latest saved details. Your edits will stay here.');try{var latest=await apiRequest();if(leaving||generation!==portalGeneration)return;if(!latest.client||!/^[a-f0-9]{64}$/.test(latest.configurationRevision||'')||!/^[a-f0-9]{64}$/.test(latest.editRevision||''))throw new Error('The latest saved version could not be read.');if(['cancelled','archived'].includes(latest.client.status)){cfgClosed=true;cfgConflict=null;$('cfgConflictPanel').hidden=true;throw new Error('This workspace no longer accepts business edits.');}cfgConflict.latest={data:latest,values:cfgFromClient(latest.client)};var mine=cfgRead(),changed=cfgChanges(cfgConflict.latest.values,cfgBaseline),box=$('cfgConflictFields');box.replaceChildren();changed.forEach(function(name){var row=document.createElement('p');row.className='cfg-conflict-field';row.textContent=cfgLabel(name)+' | Latest saved: '+cfgDisplay(name,cfgConflict.latest.values[name])+'. Your current value: '+cfgDisplay(name,mine[name]);box.appendChild(row);});$('cfgConflictText').textContent=changed.length?'Compare these updates with your draft. Keeping your edits saves only the fields you changed.':'The latest saved version is ready to compare. Keeping your edits saves only the fields you changed.';$('cfgKeepEdits').hidden=false;cfgStatus('conflict','Latest saved version checked. Your draft is unchanged; review the differences before continuing.');}catch(error){if(!leaving&&generation===portalGeneration)cfgStatus(cfgClosed?'error':'conflict',error.message+' Your edits are still here.');}finally{if(!leaving&&generation===portalGeneration){cfgBusy=false;$('cfg').setAttribute('aria-busy','false');$('saveCfg').disabled=cfgClosed||acctBusy;$('cfgCheckLatest').disabled=false;$('cfgKeepEdits').disabled=false;}}});
  $('cfgKeepEdits').addEventListener('click',function(){if(cfgBusy||acctBusy||cfgClosed||!cfgConflict||!cfgConflict.latest||leaving)return;var mine=cfgRead(),preserve={};cfgChanges(mine,cfgBaseline).forEach(function(name){preserve[name]=mine[name];});var latest=cfgConflict.latest;cfgFill(latest.values,preserve);cfgBaseline=latest.values;cfgRevision=latest.data.configurationRevision;cfgEditRevision=latest.data.editRevision;data=latest.data;cfgConflict=null;$('cfgConflictPanel').hidden=true;cfgFence++;cfgChanged();saveCfg();});

  $('cfg').addEventListener('submit',function(event){event.preventDefault();saveCfg();});

  function acctValue(client) { return client.rules.avgTicket ? String(client.rules.avgTicket) : ''; }
  function acctStatus(kind,message) {
    if(leaving)return;var state=kind||(acctBusy?'saving':acctConflict?'conflict':acctDirty?'dirty':'saved');
    $('acct').dataset.saveState=state;$('acct').setAttribute('aria-busy',String(acctBusy));$('saveAcct').disabled=acctBusy||cfgBusy||cfgClosed;$('cfgCheckLatest').disabled=acctBusy||cfgBusy;$('cfgKeepEdits').disabled=acctBusy||cfgBusy;$('acctCheckLatest').disabled=acctBusy||cfgBusy;$('acctKeepEdits').disabled=acctBusy||cfgBusy;
    var text=message||(acctBusy?'Saving the submitted value. Newer edits will stay here.':acctConflict?'Your value is kept. Check the latest saved version.':acctDirty?'You have an unsaved value.':'All changes saved.');if($('acctMsg').textContent!==text)$('acctMsg').textContent=text;
  }
  function acctObserve(result,localAck) {
    var saved=acctValue(result.client);
    if(acctBaseline===null||!acctDirty&&!acctBusy&&!acctConflict){$('avgTicket').value=saved;acctEventValue=saved;acctBaseline=saved;acctRevision=result.configurationRevision;acctEditRevision=result.editRevision;acctDirty=false;acctStatus();}
    else if(localAck&&saved===acctBaseline){acctRevision=result.configurationRevision;acctEditRevision=result.editRevision;}
  }
  function acctError(message) {$('acctError').textContent=message||'';if(message){$('avgTicket').setAttribute('aria-invalid','true');$('avgTicket').dataset.invalidValue=$('avgTicket').value;}else{$('avgTicket').removeAttribute('aria-invalid');delete $('avgTicket').dataset.invalidValue;}}
  function acctChanged(event) {var field=$('avgTicket'),value=field.value;if(event&&event.type==='change'&&acctEventValue===value)return;acctEventValue=value;if(field.getAttribute('aria-invalid')==='true'&&field.dataset.invalidValue===value)return;acctDirty=value!==acctBaseline;acctError('');acctStatus();}
  async function saveAcct() {
    if(acctBusy||cfgBusy||cfgClosed||leaving||!data||acctBaseline===null)return;
    var snapshot=$('avgTicket').value;if(snapshot===acctBaseline){acctStatus();return;}
    if(acctConflict){acctStatus('conflict','Your value is kept. Check the latest saved version before saving again.');$('acctCheckLatest').focus();return;}
    var raw=snapshot.trim();if(raw&&(!/^\d+(?:\.\d+)?$/.test(raw)||!Number.isFinite(Number(raw))||Number(raw)>1000000)){acctError('Enter a number from 0 to 1000000, or leave it blank.');acctStatus('error','Check the highlighted value. It has not been saved.');$('avgTicket').focus();return;}
    var generation=portalGeneration;acctBusy=true;cfgFence++;acctError('');acctStatus();cfgChanged();
    try{var result=await apiRequest('PUT',{expectedRevision:acctRevision,expectedEditRevision:acctEditRevision,rules:{avgTicket:snapshot}});if(leaving||generation!==portalGeneration)return;if(!result.client||data.client.onboarding&&data.client.onboarding.version===1&&(!/^[a-f0-9]{64}$/.test(result.configurationRevision||'')||!/^[a-f0-9]{64}$/.test(result.editRevision||'')))throw new Error('The saved value could not be confirmed.');
      var saved=acctValue(result.client);if($('avgTicket').value===snapshot)$('avgTicket').value=saved;acctEventValue=saved;acctBaseline=saved;acctRevision=result.configurationRevision;acctEditRevision=result.editRevision;acctDirty=$('avgTicket').value!==acctBaseline;acctConflict=null;$('acctConflictPanel').hidden=true;cfgFence++;data.client=result.client;if(result.setup)data.setup=result.setup;data.configurationRevision=result.configurationRevision;data.editRevision=result.editRevision;
      if(!cfgChanges(cfgFromClient(result.client),cfgBaseline).length){cfgRevision=result.configurationRevision;cfgEditRevision=result.editRevision;}renderSetup(data);document.dispatchEvent(new CustomEvent('mc:desk',{detail:data}));acctBusy=false;acctStatus(acctDirty?'dirty':'saved',acctDirty?'Submitted value saved. Your newer value is still unsaved.':'All changes saved.');
    }catch(error){if(leaving||generation!==portalGeneration)return;acctBusy=false;acctDirty=$('avgTicket').value!==acctBaseline;if(error.status===401||error.status===403){document.dispatchEvent(new CustomEvent('mc:session-expired'));return;}if(error.code==='configuration_changed'){acctConflict={latest:null};$('acctConflictPanel').hidden=false;$('acctKeepEdits').hidden=true;acctStatus('conflict','Your saved details changed elsewhere. Your value is kept; check the latest version.');}else{if(error.code==='workspace_closed')cfgClosed=true;acctStatus('error',(error.message||'The save could not be confirmed.')+' Your value is still here.');if($('avgTicket').value===snapshot&&error.fieldErrors&&error.fieldErrors['rules.avgTicket']){acctError(error.fieldErrors['rules.avgTicket']);$('avgTicket').focus();}}}
    finally{if(!leaving&&generation===portalGeneration){acctBusy=false;$('acct').setAttribute('aria-busy','false');$('saveAcct').disabled=cfgClosed;$('acctCheckLatest').disabled=false;$('acctKeepEdits').disabled=false;cfgChanged();}}
  }
  $('acct').addEventListener('submit',function(event){event.preventDefault();saveAcct();});
  ['input','change'].forEach(function(type){$('avgTicket').addEventListener(type,acctChanged);});
  $('acctCheckLatest').addEventListener('click',async function(){if(acctBusy||cfgBusy||!acctConflict||leaving)return;var generation=portalGeneration;acctBusy=true;acctStatus('conflict','Checking the latest saved value. Your value will stay here.');cfgChanged();try{var latest=await apiRequest();if(leaving||generation!==portalGeneration)return;if(!latest.client||!/^[a-f0-9]{64}$/.test(latest.configurationRevision||'')||!/^[a-f0-9]{64}$/.test(latest.editRevision||''))throw new Error('The latest saved value could not be read.');if(['cancelled','archived'].includes(latest.client.status)){cfgClosed=true;acctConflict=null;$('acctConflictPanel').hidden=true;throw new Error('This workspace no longer accepts business edits.');}acctConflict.latest=latest;$('acctConflictText').textContent='Latest saved: '+(acctValue(latest.client)||'Blank')+'. Your current value: '+($('avgTicket').value||'Blank')+'. Keeping your value changes only the average job value.';$('acctKeepEdits').hidden=false;acctStatus('conflict','Latest saved value checked. Review it before keeping your value.');}catch(error){if(leaving||generation!==portalGeneration)return;if(error.status===401||error.status===403){document.dispatchEvent(new CustomEvent('mc:session-expired'));return;}acctStatus('conflict',error.message+' Your value is still here.');}finally{if(!leaving&&generation===portalGeneration){acctBusy=false;$('acct').setAttribute('aria-busy','false');$('saveAcct').disabled=cfgClosed;$('acctCheckLatest').disabled=false;$('acctKeepEdits').disabled=false;cfgChanged();}}});
  $('acctKeepEdits').addEventListener('click',function(){if(acctBusy||cfgBusy||cfgClosed||!acctConflict||!acctConflict.latest||leaving)return;var latest=acctConflict.latest;acctBaseline=acctValue(latest.client);acctRevision=latest.configurationRevision;acctEditRevision=latest.editRevision;acctConflict=null;$('acctConflictPanel').hidden=true;acctDirty=$('avgTicket').value!==acctBaseline;saveAcct();});
  $('legal').addEventListener('submit', function (e) {
    e.preventDefault(); var f = e.target;
    apiRequest('PUT', { legal: { legalName: f.elements['legalName'].value, ein: f.elements['ein'].value, businessType: f.elements['businessType'].value, street: f.elements['street'].value, city: f.elements['city'].value, state: f.elements['state'].value, zip: f.elements['zip'].value } })
      .then(function () { return action('provision'); }).then(function () { $('legalMsg').textContent = 'Saved. Filing now; check back in a day.'; setTimeout(load, 4000); }).catch(function (error) { $('legalMsg').textContent = error.message; });
  });

  ['input','change'].forEach(function(type){$('cfg').addEventListener(type,function(event){var field=event.target,value=field.type==='checkbox'?String(field.checked):field.value;if(event.type==='change'&&cfgEventValues.get(field)===value)return;cfgEventValues.set(field,value);if(field.getAttribute('aria-invalid')==='true'&&field.dataset.cfgInvalidValue===value)return;cfgClearError(field.name||'rules.hours');cfgChanged();});});
  window.addEventListener('beforeunload',function(event){if(cfgDirty||cfgBusy||acctDirty||acctBusy){event.preventDefault();event.returnValue='';}});

  $('deskSignOut').addEventListener('click', async function () {
    var button = $('deskSignOut'); button.disabled = true;
    leaving = true; portalGeneration++; if (chatController) chatController.abort();
    try {
      var response = await fetch(API_BASE + '/api/access', { method: 'POST', headers: ownerHeaders(), body: JSON.stringify({ action: 'sign_out' }) });
      if (!response.ok) throw new Error('Sign out could not be confirmed. Please retry.');
      ownerSession = null; key = null; data = null; transcript = [];
      try { sessionStorage.removeItem('mc-owner-visit-pending-v1:'+slug); sessionStorage.removeItem('mc-onboarding-session-v1'); } catch (error) { /* Session is revoked on the server. */ }
      button.hidden = true; $('retryLoad').hidden = true;
      history.replaceState(null, '', location.pathname);
      recover('Signed out. Use an email sign-in link to open your workspace again.');
      $('portalContent').innerHTML = '';
    } catch (error) { if (!ownerSession && !key) return; leaving = false; cfgBusy = false; acctBusy = false; cfgFence++; cfgChanged(); acctStatus(); await load(); toast(error.message); } finally { button.disabled = false; }
  });
  ['expBookings','expLeads','expConvs','expCustomers'].forEach(function (id) {
    $(id).addEventListener('click', async function (event) {
      event.preventDefault(); var kind = event.currentTarget.dataset.export; if (!kind) return;
      try {
        var response = await fetch(API + '&export=' + encodeURIComponent(kind), { headers: ownerHeaders() });
        if (!response.ok) throw new Error('Download unavailable. Sign in again if your session expired.');
        var address = URL.createObjectURL(await response.blob()), link = document.createElement('a');
        link.href = address; link.download = slug + '-' + kind + '.csv'; link.click(); setTimeout(function () { URL.revokeObjectURL(address); }, 1000);
      } catch (error) { toast(error.message); }
    });
  });

  // test chat
  var msgs = $('msgs');
  function add(role, text) { var el = document.createElement('div'); el.className = 'b ' + (role === 'user' ? 'u' : role === 'sys' ? 's' : 'a'); el.textContent = text; msgs.appendChild(el); msgs.scrollTop = msgs.scrollHeight; return el; }
  function greet() { msgs.innerHTML = ''; add('a', (data && data.client.widget.greeting) || 'Hi, what can we help with today?'); }
  $('newChat').addEventListener('click', function () { contact = 't' + Math.random().toString(36).slice(2, 10); transcript = []; greet(); });
  $('chatIn').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('chatForm').requestSubmit(); } });
  var chatBusy = false;
  $('chatForm').addEventListener('submit', async function (event) {
    event.preventDefault(); var text = $('chatIn').value.trim(); if (!text || chatBusy || !data) return;
    chatBusy = true; $('chatForm').querySelector('button').disabled = true; $('newChat').disabled = true; $('chatIn').value = '';
    transcript.push({ role: 'user', content: text }); add('user', text); var bubble = null, full = '', finished = false;
    var controller = new AbortController(), timeout = setTimeout(function () { controller.abort(); }, 60000);
    chatController = controller;
    function receive(line) {
      if (leaving) return;
      if (!line.trim()) return;
      var out = JSON.parse(line);
      if (out.t === 'delta') { if (!bubble) bubble = add('a', ''); full += out.text; bubble.textContent = full; msgs.scrollTop = msgs.scrollHeight; }
      if (out.t === 'error') throw new Error(out.error === 'offline' ? 'AI service is unavailable. Your setup is saved; retry later.' : 'The practice reply could not be completed. Try a new conversation.');
      if (out.t === 'done') {
        finished = true; if (!bubble) bubble = add('a', out.reply); else bubble.textContent = out.reply;
        transcript.push({ role: 'assistant', content: out.reply });
        var previews = (out.events || []).filter(function (item) { return item.type === 'test_booking' || item.type === 'test_lead'; });
        $('testPreview').textContent = previews.length ? previews.map(function (item) { var values = item.data || {}; return (item.type === 'test_booking' ? 'Practice visit preview' : 'Practice handoff preview') + '\n' + Object.keys(values).map(function (key) { return key.replace(/_/g, ' ') + ': ' + values[key]; }).join('\n'); }).join('\n\n') + '\n\nNo real visit, message or calendar event was created.' : 'Practice reply completed. No real visit, message or calendar event was created.';
        if (out.test && !out.test.proofRecorded) $('testPreview').textContent += '\nYour rules changed during the test. Try again with the saved version.';
      }
    }
    try {
      var response = await fetch(API_BASE + '/api/chat', { method: 'POST', headers: ownerHeaders(), body: JSON.stringify({ client: slug, key: key, channel: 'test', contact: contact, messages: transcript.slice(-20), stream: true }), signal: controller.signal });
      if (!response.ok) {
        var failure = await response.json().catch(function () { return {}; });
        if (response.status === 429) { await load(); throw new Error(failure.message || 'The daily practice allowance has been used. Try again after midnight Houston time.'); }
        throw new Error(response.status === 503 ? 'AI service is unavailable. Your settings are saved.' : 'Could not start the private test. Refresh or sign in again.');
      }
      var reader = response.body.getReader(), decoder = new TextDecoder(), buffer = '';
      for (;;) { var part = await reader.read(); if (part.done) break; buffer += decoder.decode(part.value, { stream: true }); var lines = buffer.split('\n'); buffer = lines.pop(); lines.forEach(receive); }
      buffer += decoder.decode(); if (buffer.trim()) receive(buffer);
      if (!finished) throw new Error('The practice reply was interrupted. Try a new conversation.');
      if (!leaving) await load(); // Even a question-only completion updates revision-bound test readiness.
    } catch (error) { if (!leaving) add('sys', error.name === 'AbortError' ? 'The practice reply timed out. Try a new conversation.' : error.message); }
    finally { clearTimeout(timeout); if (chatController === controller) chatController = null; chatBusy = false; if ($('chatForm')) { $('chatForm').querySelector('button').disabled = false; $('newChat').disabled = false; if (!leaving) $('chatIn').focus(); } }
  });
  load().then(greet);
})();
