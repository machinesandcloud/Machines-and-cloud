(function () {
  var q = new URLSearchParams(location.search), slug = q.get('c'), key = q.get('k');
  var ownerSession = null; try { ownerSession = sessionStorage.getItem('mc-onboarding-session-v1'); } catch (error) { /* Email sign-in is available when storage is disabled. */ }
  if (!slug || (!key && !ownerSession)) { document.body.dataset.workspaceState = 'recovery'; document.getElementById('title').textContent = 'Your workspace'; document.getElementById('status').textContent = 'Sign in to continue'; document.getElementById('portalRecovery').hidden = false; document.getElementById('retryLoad').hidden = true; return; }
  var API_BASE = (function () { var m = document.querySelector('meta[name="mc-api-base"]'); return (m && m.content) ? m.content.replace(/\/$/, '') : ''; })();
  var API = API_BASE + '/api/client?c=' + encodeURIComponent(slug) + (key ? '&k=' + encodeURIComponent(key) : '');
  var portalGeneration = 0, loadSequence = 0, loadPending = null, reviewBusy = false, leaving = false, chatController = null, cfgRevision = null, cfgEditRevision = null, cfgDirty = false, data = null, contact = 't' + Math.random().toString(36).slice(2, 10), transcript = [];
  var preferenceBaseline=[],preferenceDirty=false,preferenceBusy=false,homeActivityChosen=false;
  var $ = function (id) { return document.getElementById(id); };
  function ownerHeaders() { var headers = { 'Content-Type': 'application/json' }; if (ownerSession) headers.Authorization = 'Bearer ' + ownerSession; return headers; }
  function toast(t) { var el = $('toast'); el.textContent = t; el.style.display = 'block'; setTimeout(function () { el.style.display = 'none'; }, 2500); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function recover(message) {
    closeTour(false, false);
    if (leaving) supportReset(); else if ($('supportDialog')?.open) $('supportDialog').close();
    if ($('phoneCancelDialog').open) $('phoneCancelDialog').close(); phoneCancelSnapshot = null; if ($('phoneAuthority')) $('phoneAuthority').checked = false; if ($('phoneCosts')) $('phoneCosts').checked = false;
    if ($('cancelBox').open) $('cancelBox').close();
    if ($('visitDialog').open) $('visitDialog').close(); visitPending = null; visitSelected = null;
    $('portalContent').hidden = true; $('portalRecovery').hidden = false; document.body.dataset.workspaceState = 'recovery'; $('deskRail').hidden = true; $('railBusiness').textContent = 'Your front desk';
    $('title').textContent = 'Your workspace'; $('status').textContent = 'Unable to open workspace';
    $('recoveryMessage').textContent = message; if ($('liveBtns')) $('liveBtns').innerHTML = '';
  }
  document.addEventListener('mc:session-expired',function () {
    if (leaving && !ownerSession && !key) return;
    leaving = true; portalGeneration++; ownerSession = null; key = null; data = null; transcript = []; if (chatController) chatController.abort(); availabilityReset();
    websitePrivateClear();
    preferenceBaseline=[];preferenceDirty=false;preferenceBusy=false;homeActivityChosen=false;
    cfgBaseline = null; cfgRevision = null; cfgEditRevision = null; cfgConflict = null; cfgDirty = false; cfgBusy = false; reviewBusy = false; cfgClosed = true;
    acctBaseline = null; acctRevision = null; acctEditRevision = null; acctConflict = null; acctDirty = false; acctBusy = false;
    try { sessionStorage.removeItem('mc-owner-visit-pending-v1:'+slug); sessionStorage.removeItem('mc-onboarding-session-v1'); sessionStorage.removeItem('mc-calendar-pending-v1'); } catch (error) { /* Private content is still cleared. */ }
    closeTour(false, false);
    recover('Your session expired. Sign in by email to reopen your workspace.'); $('portalContent').innerHTML = ''; $('deskSignOut').hidden = true; $('retryLoad').hidden = true;
  });
  document.addEventListener('mc:desk-refresh',function(){if(!leaving)load();});
  document.addEventListener('mc:desk-route',function(event){if(!leaving && pageCopy[event.detail?.tab])routeTo(event.detail.tab);});
  async function apiRequest(method, body) {
    var controller = new AbortController(), timeout = setTimeout(function () { controller.abort(); }, 20000);
    try {
      var response = await fetch(API, { method: method || 'GET', headers: ownerHeaders(), body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal });
      if(response.status===401||response.status===403){var denied=new Error('Your session expired. Sign in by email to reopen your workspace.');denied.status=response.status;throw denied;}
      var result = await response.json();
      if (!response.ok || result.error || result.ok === false) {
        var message = result.message || (result.error === 'not_ready' ? 'Finish the setup checklist before activating website chat.' : result.error === 'configuration_changed' ? 'Your rules changed in another tab. Refresh and review the current version.' : response.status === 401 || response.status === 403 ? 'This private link is invalid or expired. Sign in by email to recover your workspace.' : 'We could not confirm that change. Please retry.');
        var error = new Error(message); error.status = response.status; error.code = result.error; error.field = result.field; error.fieldErrors = result.fieldErrors; error.setup = result.setup; throw error;
      }
      return result;
    } finally { clearTimeout(timeout); }
  }
  var visitPending = null, visitSelected = null, visitBusy = false, visitOpener = null;
  function platformLeadLabel(lead) { return lead.platform && ({angi:'Angi',thumbtack:'Thumbtack'})[lead.platform.source] || ''; }
  function leadReference(lead) { return platformLeadLabel(lead) && lead.platform.externalLeadId ? platformLeadLabel(lead) + ' · ' + String(lead.platform.externalLeadId) : lead.id; }
  function humanHandoffStatus(lead) { var h=lead.humanHandoff;if(!h)return '';var text=({callback_only:'Callback requested; no live transfer',control_uncertain:'Live connection unconfirmed',control_accepted:'Call control accepted; connection unconfirmed',not_attempted:'Live transfer was not started',dial_uncertain:'Live connection unconfirmed',human_accepted:'Person accepted; connection unconfirmed',connected:'Person accepted; provider confirmed connection',not_connected:'Live transfer did not connect',unknown:'Live connection outcome unknown',limit_reached:'Live transfer stopped at usage limit'})[h.state]||'Live connection unconfirmed';return '<br><span class="muted" data-human-handoff>'+esc(text)+'. No callback time confirmed.'+(lead.alertAttentionDue?' Needs acknowledgment.':'')+'</span>'; }
  function customerVisitRequest(visit) { return !!(data && data.client && data.client.onboarding && data.client.onboarding.version === 1 && visit && visit.status === 'booked' && ['web','sms','call','voice'].indexOf(visit.channel) >= 0); }
  function visitStatusLabel(visit) { return customerVisitRequest(visit) ? 'Visit requested' : visit && visit.status || ''; }
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
    $('visitDetails').textContent=creating?'Save the agreed visit details. Availability is checked before the visit is created.':'Ref '+id+' · '+visitStatusLabel(row)+' · '+visitDateLabel(visitSelected.date)+' · '+visitSelected.window+'\n'+(visitSelected.issue || '')+' · '+(visitSelected.address || 'Address not saved')+(customerVisitRequest(row)?'\nContact the customer to confirm the arrival window.':'');
    var pending=visitPending, date=pending && pending.date || visitSelected.date, windowValue=pending && pending.window || visitSelected.window;
    $('visitDate').value=date || ''; var windows=(data.client.windows || []).slice(); if(windowValue && windows.indexOf(windowValue)<0)windows.push(windowValue);
    $('visitWindow').innerHTML=windows.map(function(window){return '<option value="'+esc(window)+'">'+esc(window)+'</option>';}).join(''); $('visitWindow').value=windowValue;
    $('visitCancelConfirm').checked=!!(pending && pending.action==='cancel_visit'); $('visitChangeForm').hidden=!visitSelected.canChange && !pending;
    visitFieldsDisabled(!!pending); $('retryVisit').hidden=!pending; $('visitMessage').textContent=pending?'A saved change still needs confirmation. Retry it using the same details.':visitSelected.canChange?(creating?"We’ll check availability when you save.":'Choose a listed arrival window. Full or blocked windows keep the original visit unchanged.'):'This visit is retained for your records.';
    $('visitDialog').showModal();document.dispatchEvent(new CustomEvent('mc:visit-open',{detail:{visitId:creating?null:visitSelected.id,visitRevision:creating?null:visitSelected.revision,configurationRevision:data.configurationRevision,pending:!!pending,canChange:visitSelected.canChange}})); $('closeVisit').focus();
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
    visitBusy=true;document.dispatchEvent(new CustomEvent('mc:visit-busy',{detail:{busy:true,pending:!!visitPending}})); visitFieldsDisabled(true); $('retryVisit').hidden=true; $('closeVisit').disabled=true; $('visitMessage').textContent='Confirming your saved change…';
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
      if(error.status && error.status<500){visitPending=null;await storeVisitInput(null);if(leaving || generation!==portalGeneration)return;visitFieldsDisabled(false);if(error.field==='window'||error.field==='date'||['configuration_changed','visit_changed','visit_not_found'].includes(error.code))document.dispatchEvent(new CustomEvent('mc:visit-availability-invalid',{detail:{reason:error.code}}));if(error.field)visitFieldError(error.field,error.message);else $('visitMessage').focus();}
      else {$('retryVisit').hidden=false; $('visitMessage').textContent+=' Retry saved change safely; the original submission will be reused.';}
    } finally {if(!leaving && generation===portalGeneration){visitBusy=false;document.dispatchEvent(new CustomEvent('mc:visit-busy',{detail:{busy:false,pending:!!visitPending}})); $('closeVisit').disabled=false;}}
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
    }).join('') : emptyState('No unavailable time added', 'Add work booked elsewhere or time off above. These blocks limit new visit requests; they do not change existing visits.');
  }
  var availabilityBusy = false, availabilityController = null;
  function availabilityControls(disabled) {
    if ($('availabilityForm')) $('availabilityForm').setAttribute('aria-busy', String(disabled));
    document.querySelectorAll('#availabilityForm button, #availabilityBlocks button').forEach(function (button) { button.disabled = disabled; });
  }
  function availabilityReset() {
    if (availabilityController) availabilityController.abort();
    availabilityController = null; availabilityBusy = false; availabilityControls(false);
  }
  async function availabilityChange(actionName, date, window) {
    if (availabilityBusy || leaving || !data) return;
    var generation = portalGeneration, session = ownerSession, ownerKey = key, controller = new AbortController();
    function current() { return !leaving && generation === portalGeneration && session === ownerSession && ownerKey === key && availabilityController === controller; }
    availabilityBusy = true; availabilityController = controller; availabilityControls(true);
    $('availabilityMessage').textContent = 'Saving…';
    var timeout = setTimeout(function () { controller.abort(); }, 20000);
    try {
      var response = await fetch(API, { method: 'POST', headers: ownerHeaders(), body: JSON.stringify({ action: actionName, date: date, window: window }), signal: controller.signal });
      if (!current()) return;
      if (response.status === 401 || response.status === 403) { document.dispatchEvent(new CustomEvent('mc:session-expired')); return; }
      var result = await response.json(); if (!current()) return;
      if (!response.ok || !result.ok) {
        var messages = { invalid_date: 'Choose a valid date in Houston time.', invalid_window: 'Choose one of your saved arrival windows.', too_many_blocks: 'Remove an old block before adding another.', availability_unavailable: 'Availability could not be saved. Reload availability before trying again.' };
        throw Object.assign(new Error('Availability request failed'), { availabilityMessage: messages[result.error] || result.message || 'Could not save availability. Reload availability before trying again.' });
      }
      if (!Array.isArray(result.availabilityBlocks)) throw Object.assign(new Error('Availability response incomplete'), { availabilityMessage: 'The schedule change could not be confirmed. Reload availability before trying again.' });
      renderAvailability(result.availabilityBlocks);
      $('availabilityMessage').textContent = (actionName === 'availability_block' ? 'Time blocked.' : 'Block removed.') + ' ' + availabilityDateLabel(date) + ' · ' + (window || 'Whole day') + (result.existingBookings ? '. ' + result.existingBookings + ' existing visit' + (result.existingBookings === 1 ? ' remains' : 's remain') + ' booked.' : '');
    } catch (error) {
      if (!current()) return;
      $('availabilityMessage').textContent = (error.name === 'AbortError' ? 'The schedule change timed out. Reload availability before trying again.' : error.availabilityMessage || 'The schedule change could not be confirmed. Reload availability before trying again.') + ' Your selected date and window are still here.';
    } finally {
      clearTimeout(timeout);
      if (current()) { availabilityController = null; availabilityBusy = false; availabilityControls(false); }
    }
  }
  $('availabilityForm').addEventListener('submit', function (e) { e.preventDefault(); availabilityChange('availability_block', $('availabilityDate').value, $('availabilityWindow').value); });
  $('availabilityBlocks').addEventListener('click', function (e) { var button = e.target.closest('button.availability-remove'); if (button) availabilityChange('availability_unblock', button.dataset.date, button.dataset.window); });

  var pageCopy = {
    today: ['YOUR WORKSPACE', 'Your day, at a glance', 'Your customer requests, visits and the work that needs your attention.'],
    leads: ['INBOX', 'Customer requests', 'See who needs a callback and what they need from your shop.'],
    convs: ['DAILY WORK', 'Conversations', 'See what customers asked and how your front desk responded.'],
    availability: ['YOUR SCHEDULE', 'Schedule', 'Manage saved visits and block time for work booked elsewhere.'],
    know: ['YOUR FRONT DESK', 'Business details', 'Your services, hours and the answers your front desk uses.'],
    test: ['YOUR FRONT DESK', 'Test answers', 'Try a private customer conversation before customers do.'],
    setup: ['YOUR FRONT DESK', 'Connections', 'Follow setup progress, connect your channels and prepare for customers.'],
    account: ['YOUR WORKSPACE', 'Account', 'Manage your contact details, front desk status and saved records.']
  };
  function showTab(t) {
    if (!pageCopy[t] || !document.getElementById('p-' + t)) return;
    var parent = ['leads','convs'].includes(t) ? 'leads' : ['setup','know','test'].includes(t) ? 'setup' : t;
    document.querySelectorAll('.tabs button').forEach(function (x) { var current=x.dataset.t===parent; x.classList.toggle('on', current); x.setAttribute('aria-current', current ? 'page' : 'false'); });
    document.querySelectorAll('[data-workspace-route]').forEach(function (x) { var current=x.dataset.workspaceRoute===t; x.classList.toggle('on',current); x.setAttribute('aria-current',current?'page':'false'); });
    if($('inboxNav'))$('inboxNav').hidden=parent!=='leads'; if($('frontDeskNav'))$('frontDeskNav').hidden=parent!=='setup';
    document.querySelectorAll('.pane').forEach(function (p) { p.classList.toggle('on', p.id === 'p-' + t); });
    document.body.dataset.activePage = t;
    $('pageEyebrow').textContent = pageCopy[t][0]; $('pageTitle').textContent = pageCopy[t][1]; $('pageDescription').textContent = pageCopy[t][2]; if(data){renderHomeNext(data);if(t==='account')renderAccount(data);}else syncNextActionVisibility();
  }
  $('homeActivityDetails').querySelector('summary').addEventListener('click',function(){homeActivityChosen=true;});
  function syncNextActionVisibility() { var guide = $('workspaceGuide'); guide.hidden = guide.dataset.needed !== 'true' || document.body.dataset.activePage !== 'today'; }
  if (location.hash && document.getElementById('p-' + location.hash.slice(1))) showTab(location.hash.slice(1));
  else showTab('today');
  document.querySelectorAll('.tabs button').forEach(function (b) { b.addEventListener('click', function () { routeTo(b.dataset.t); }); });
  document.querySelectorAll('[data-workspace-route]').forEach(function (b) { b.addEventListener('click', function () { routeTo(b.dataset.workspaceRoute); }); });
  window.addEventListener('hashchange', function () { if (!leaving && pageCopy[location.hash.slice(1)]) routeTo(location.hash.slice(1)); });
  function routeTo(tab) {
    if (!pageCopy[tab] || leaving) return;
    window.__tabPicked = true; if (tab === 'test') $('tabTest').style.display = '';
    showTab(tab); var pane = $('p-' + tab); if (!pane) return;
    history.replaceState(null, '', location.pathname + location.search + '#' + tab);
    document.querySelectorAll('.guide-target').forEach(function (node) { node.classList.remove('guide-target'); });
    pane.classList.add('guide-target'); pane.tabIndex = -1; window.scrollTo({top:0,behavior:'instant'}); pane.focus({ preventScroll: true });
  }
  function homeAction(button){routeTo(button.dataset.route||'know');var target=button.dataset.anchor&&$(button.dataset.anchor);if(target){var details=target.closest('details');if(details)details.open=true;target.scrollIntoView({block:'nearest'});target.tabIndex=-1;target.focus({preventScroll:true});}}
  $('nextSetupAction').addEventListener('click',function(){homeAction(this);});
  $('homeSetupSecondary').addEventListener('click',function(){homeAction(this);});
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
  function historyIncomplete(listing) { return Object.keys(listing || {}).some(function (kind) { return listing[kind] && listing[kind].incomplete === true; }); }
  function renderHistoryScope(d) {
    var listing = d.recordListing || {}, limited = historyIncomplete(listing), exportLimited = ['bookings', 'leads'].some(function (kind) { return listing[kind] && listing[kind].incomplete === true; });
    [['todayHistoryNotice', $('p-today')], ['requestsHistoryNotice', $('p-leads')], ['scheduleHistoryNotice', $('p-availability')], ['exportHistoryNotice', $('expBookings').closest('.card2')]].forEach(function (item) {
      var notice = $(item[0]);
      if (!notice) { notice = document.createElement('div'); notice.id = item[0]; notice.className = item[0] === 'exportHistoryNotice' ? 'muted' : 'card2 muted'; notice.setAttribute('role', 'note'); item[1].prepend(notice); }
      notice.hidden = item[0] === 'exportHistoryNotice' ? !exportLimited : item[0] === 'scheduleHistoryNotice' ? !listing.bookings?.incomplete : !limited;
      notice.innerHTML = '<strong>Showing part of your history</strong><br>' + (item[0] === 'exportHistoryNotice' ? 'Booking, lead and customer downloads require complete history. A download is unavailable if those records still need checking. Contact support if you need an earlier request.' : 'The requests and counts shown cover only the records loaded here. Some history still needs checking. Contact support if you need an earlier request.');
    });
  }
  var supportTarget = null, supportCurrent = null, supportOpener = null, supportBusy = false, supportPending = null, supportRestored = false;
  var supportStorageKey = 'mc-support-report-pending-v1:' + slug;
  function supportLabel(status) { return ({reported:'Reported',acknowledged:'Under review',resolved:'Resolved'})[status] || 'Checking report'; }
  function supportFor(channel, contact) { return (data && data.supportReports || []).filter(function(row){return row.channel===channel && row.contact===contact;}).sort(function(a,b){return String(b.reportedAt||'').localeCompare(String(a.reportedAt||''));})[0] || null; }
  function supportCard(report) {
    if (!report) return '';
    var message = report.status==='resolved' ? 'Our reply' : report.status==='acknowledged' ? 'We’ve started reviewing your report.' : 'Your report is saved. You can follow its progress here.';
    return '<section class="support-report" aria-label="Support report '+esc(report.reference)+'"><div class="support-report-head"><strong>Support · '+esc(report.reference)+'</strong><span class="support-state" data-support-status="'+esc(report.status)+'">'+esc(supportLabel(report.status))+'</span></div><p class="support-note">'+esc(report.note)+'</p><p><strong>'+esc(message)+'</strong></p>'+(report.status==='resolved'?'<p class="support-resolution">'+esc(report.resolution)+'</p>':'')+'<small>Reported '+esc(recordTimeLabel(report.reportedAt))+(report.acknowledgedAt?' · Review started '+esc(recordTimeLabel(report.acknowledgedAt)):'')+(report.resolvedAt?' · Resolved '+esc(recordTimeLabel(report.resolvedAt)):'')+'</small></section>';
  }
  function renderConversations(rows) {
    var selfService=!!(data && data.client && data.client.onboarding?.version===1);
    var pending=selfService&&supportPending?'<div class="support-report"><strong>A report still needs confirmation</strong><p>Your saved details are kept. Check this report before sending another.</p><button type="button" class="btn-pill btn-pill-dark btn-sm" data-support-pending>Check saved report</button></div>':'';
    return pending + (rows.length ? rows.map(function(v){
      var report=selfService?(v.supportReport || supportFor(v.channel,v.contact)):null;
      var button=selfService?'<button type="button" class="btn-pill btn-pill-dark btn-sm support-open" data-ch="'+esc(v.channel)+'" data-ct="'+esc(v.contact)+'">'+(report&&report.status!=='resolved'?'View report':report?'Report another problem':'Report a problem')+'</button>':v.flag?'<a href="#" class="unflag" data-ch="'+esc(v.channel)+'" data-ct="'+esc(v.contact)+'">Unflag</a>':'<button type="button" class="btn-pill btn-pill-dark btn-sm flag" data-ch="'+esc(v.channel)+'" data-ct="'+esc(v.contact)+'">Flag</button>';
      return '<article class="conv"><header class="conv-header"><div><b>'+esc(v.contact)+'</b><div class="conv-meta"><span class="conv-channel">'+esc(v.channel)+'</span>'+esc(recordTimeLabel(v.updatedAt))+(!selfService&&v.flag?' · Flagged: '+esc(v.flag.note || ''):'')+'</div></div>'+(v.reference?'<button type="button" class="btn-pill btn-pill-dark btn-sm" data-conversation-open="'+esc(v.reference)+'" data-conversation-contact="'+esc(v.contact)+'">Read saved conversation</button>':'')+button+'</header><div class="conv-thread">'+v.messages.map(function(m){return '<div class="conv-message '+(m.role==='user'?'u':'a')+'"><span>'+(m.role==='user'?'Customer':'Front desk')+'</span>'+esc(m.content)+(m.processing?'<small class="muted"> · '+esc(m.processing.replace(/_/g,' '))+'</small>':'')+'</div>';}).join('')+'</div>'+supportCard(report)+'</article>';
    }).join('') : emptyState('No conversations yet','Customer conversations appear here after a customer sends a message. Private practice stays separate.','Review your connections','setup'));
  }
  async function supportStore(value) {
    var generation=portalGeneration;try{var tag=await visitSessionTag;if(leaving||generation!==portalGeneration)return false;if(value)sessionStorage.setItem(supportStorageKey,JSON.stringify({sessionTag:tag,input:value}));else sessionStorage.removeItem(supportStorageKey);return true;}catch(error){return false;}
  }
  function supportReset() {
    supportTarget=null;supportCurrent=null;supportPending=null;supportBusy=false;
    try{sessionStorage.removeItem(supportStorageKey);}catch(error){}
    if($('supportDialog')?.open)$('supportDialog').close();
    ['supportNote','supportMessage','supportSaved'].forEach(function(id){if($(id)){if(id==='supportNote')$(id).value='';else $(id).textContent='';}});
  }
  function supportMatched(pending) { return (data && data.supportReports || []).find(function(row){return row.reportOperationId===pending.operationId || (row.operationIds || []).includes(pending.operationId);}); }
  function supportControls() {
    ['supportClose','supportCancel','supportCheck','supportRetry'].forEach(function(id){$(id).disabled=supportBusy;});
    $('supportSend').disabled=supportBusy || !!supportPending; $('supportNote').disabled=supportBusy || !!supportPending;
    $('supportForm').setAttribute('aria-busy',String(supportBusy));
  }
  async function supportConfirmed(report) {
    supportCurrent=report;supportPending=null;await supportStore(null);if(leaving)return;
    $('supportSaved').innerHTML=supportCard(report);$('supportSaved').hidden=false;$('supportForm').hidden=true;$('supportCheck').hidden=false;$('supportRetry').hidden=true;
    $('supportTitle').textContent='Your support report';$('supportIntro').textContent='Your report and our reply stay with this conversation.';$('supportMessage').textContent=report.status==='resolved'?'The saved resolution is shown above.':'Your report is saved. Check here for updates.';supportControls();
    if($('supportDialog').open)$('supportMessage').focus();
  }
  async function supportObserve() {
    if(leaving || !data)return;
    if(!supportRestored){supportRestored=true;var generation=portalGeneration;try{var tag=await visitSessionTag;if(leaving||generation!==portalGeneration)return;var cached=JSON.parse(sessionStorage.getItem(supportStorageKey)||'null');if(cached?.sessionTag===tag && cached.input?.action==='report_conversation' && /^[a-f0-9]{32}$/.test(cached.input.operationId || ''))supportPending=cached.input;}catch(error){}}
    if(supportPending){var matched=supportMatched(supportPending);if(matched){if($('supportDialog').open)await supportConfirmed(matched);else{supportPending=null;await supportStore(null);}}}
    if(!leaving && data)$('convs').innerHTML=renderConversations(data.conversations || []);
  }
  function openSupport(channel,contact,opener) {
    if(leaving || supportBusy || !data)return;
    if(supportPending){channel=supportPending.channel;contact=supportPending.contact;}
    supportOpener=opener || document.activeElement;supportTarget={channel:channel,contact:contact};supportCurrent=supportFor(channel,contact);
    $('supportNoteError').textContent='';$('supportNote').removeAttribute('aria-invalid');$('supportMessage').textContent='';$('supportRetry').hidden=true;
    $('supportSaved').innerHTML=supportCard(supportCurrent);$('supportSaved').hidden=!supportCurrent;
    var active=supportCurrent && supportCurrent.status!=='resolved';
    $('supportForm').hidden=!!active && !supportPending;$('supportNote').value=supportPending?supportPending.note:'';
    $('supportCheck').hidden=!active && !supportPending;
    $('supportTitle').textContent=active?'Your support report':supportCurrent?'Report another problem':'Report a problem';
    $('supportIntro').textContent=active?'Your report and our reply stay with this conversation.':'Tell us what went wrong. The saved conversation will be included with your report.';
    if(supportPending)$('supportMessage').textContent='The earlier send is not confirmed. Check its saved status before retrying the same report.';
    supportControls();$('supportDialog').showModal();$('supportDialog').scrollTop=0;(active?$('supportTitle'):$('supportNote')).focus();
  }
  function closeSupport() { if(supportBusy)return;$('supportDialog').close();if(supportOpener?.isConnected)supportOpener.focus({preventScroll:true});else document.querySelector('.support-open')?.focus({preventScroll:true}); }
  $('supportClose').addEventListener('click',closeSupport);$('supportCancel').addEventListener('click',closeSupport);
  $('supportDialog').addEventListener('cancel',function(event){event.preventDefault();closeSupport();});
  $('supportForm').addEventListener('submit',async function(event){
    event.preventDefault();if(supportBusy||supportPending||!supportTarget||leaving)return;
    var note=$('supportNote').value.trim();if(note.length<3){$('supportNoteError').textContent='Tell us what went wrong in a few words.';$('supportNote').setAttribute('aria-invalid','true');$('supportNote').focus();return;}
    supportPending={action:'report_conversation',channel:supportTarget.channel,contact:supportTarget.contact,note:note,operationId:visitSubmissionId(),expectedReportRevision:supportCurrent?.revision || null};
    await sendSupport();
  });
  $('supportNote').addEventListener('input',function(){$('supportNote').removeAttribute('aria-invalid');$('supportNoteError').textContent='';});
  async function sendSupport() {
    if(supportBusy||!supportPending||leaving)return;var generation=portalGeneration,pending=supportPending;supportBusy=true;supportControls();$('supportMessage').textContent='Saving your report…';$('supportRetry').hidden=true;
    try{await supportStore(pending);if(leaving||generation!==portalGeneration)return;var result=await apiRequest('POST',pending);if(leaving||generation!==portalGeneration)return;if(!result.supportReport?.id)throw new Error('The saved report could not be confirmed.');await supportConfirmed(result.supportReport);await load();}
    catch(error){if(leaving||generation!==portalGeneration)return;if(error.status===401||error.status===403){document.dispatchEvent(new CustomEvent('mc:session-expired'));return;}if(error.status && error.status<500){supportPending=null;await supportStore(null);if(leaving||generation!==portalGeneration)return;$('supportMessage').textContent=error.message;$('supportCheck').hidden=false;if(error.status===409){await load();if(leaving||generation!==portalGeneration)return;var existing=supportFor(supportTarget?.channel,supportTarget?.contact);if(existing){supportCurrent=existing;$('supportSaved').innerHTML=supportCard(existing);$('supportSaved').hidden=false;if(existing.status!=='resolved')$('supportForm').hidden=true;}}}else{$('supportMessage').textContent='We could not confirm the save. Your report details are kept. Check the saved status before retrying.';$('supportCheck').hidden=false;}}
    finally{if(!leaving&&generation===portalGeneration){supportBusy=false;supportControls();}}
  }
  $('supportRetry').addEventListener('click',sendSupport);
  $('supportCheck').addEventListener('click',async function(){
    if(supportBusy||leaving)return;var generation=portalGeneration;supportBusy=true;supportControls();$('supportMessage').textContent='Checking your report…';
    try{var latest=await apiRequest();if(leaving||generation!==portalGeneration)return;await load(latest);if(leaving||generation!==portalGeneration)return;var found=supportPending?supportMatched(supportPending):supportFor(supportTarget?.channel,supportTarget?.contact);if(found)await supportConfirmed(found);else if(supportPending){$('supportMessage').textContent='A saved result is not confirmed yet. Retry this same report using the button below.';$('supportRetry').hidden=false;}else{$('supportMessage').textContent='The latest report could not be found. Close this dialog and review the conversation before sending a new report.';}}
    catch(error){if(leaving||generation!==portalGeneration)return;if(error.status===401||error.status===403){document.dispatchEvent(new CustomEvent('mc:session-expired'));return;}$('supportMessage').textContent='We could not check the report. Your details are kept. Try checking again when your connection returns.';}
    finally{if(!leaving&&generation===portalGeneration){supportBusy=false;supportControls();}}
  });
  document.addEventListener('click',function(event){
    var report=event.target.closest('.support-open,[data-support-pending]');if(report){openSupport(report.dataset.ch,report.dataset.ct,report);return;}
    var flag=event.target.closest('button.flag');if(flag){var note=window.prompt('What went wrong? One line is enough.');if(note===null)return;apiRequest('POST',{action:'flag',channel:flag.dataset.ch,contact:flag.dataset.ct,note:note}).then(load).catch(function(error){toast(error.message);});return;}
    var unflag=event.target.closest('a.unflag');if(unflag){event.preventDefault();apiRequest('POST',{action:'unflag',channel:unflag.dataset.ch,contact:unflag.dataset.ct}).then(load).catch(function(error){toast(error.message);});}
  });
  var phoneBusy = false, phoneRequestIdentity = null, phoneCancelSnapshot = null, phoneCancelReturnFocus = null;
  function validPhoneOffer(offer) {
    return offer && offer.scope === 'number_acquisition_only' && offer.country === 'US' && offer.currency === 'USD' && /^[2-9]\d{2}$/.test(offer.areaCode || '') && /^[a-z0-9_-]{1,80}$/.test(offer.version || '') && /^[a-f0-9]{64}$/.test(offer.digest || '') && [offer.oneTimeCents, offer.monthlyCents, offer.maxAcquisitionCents].every(function (value) { return Number.isSafeInteger(value) && value >= 0 && value <= 100000; }) && Date.parse(offer.expiresAt) > Date.now() && typeof offer.authorityText === 'string' && offer.authorityText.length >= 20;
  }
  function renderPhoneActivation(d) {
    var phone = d.phoneActivation, selfService = d.client.onboarding && d.client.onboarding.version === 1;
    var requested=d.client.onboarding?.desiredChannels||[],wantsNumber=requested.includes('voice')||requested.includes('sms');
    var operation = phone && phone.operation, offer = phone && phone.offer, canRequest = wantsNumber && phone && phone.available === true && validPhoneOffer(offer) && !operation && ['testing', 'live'].indexOf(d.client.status) >= 0;
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
  var websiteBusy=false, websiteDirty=false, websiteEditing=false, websiteCopied=false, websiteCheckCache=null, websiteCacheLoaded=false,websiteConflict=false,websiteOriginSelection=null;
  var websiteStorageKey='mc-website-check-v1:'+slug;
  function websiteURL(value){try{var url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url:null;}catch(error){return null;}}
  function websiteMessage(message,error){var node=$('websiteInstallMessage');if(!node)return;node.textContent=message||'';node.dataset.error=String(!!error);}
  function websiteTime(value){var at=new Date(value);return Number.isFinite(at.getTime())?at.toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'';}
  function websiteFact(id,text){$(id).textContent=text;}
  function websitePrivateClear(){websiteCheckCache=null;websiteCacheLoaded=true;websiteDirty=false;websiteEditing=false;websiteBusy=false;websiteConflict=false;try{sessionStorage.removeItem(websiteStorageKey);}catch(error){/* Optional recovery only. */}}
  async function websiteRestore(d){
    var generation=portalGeneration;try{var tag=await visitSessionTag;if(leaving||generation!==portalGeneration)return;var saved=JSON.parse(sessionStorage.getItem(websiteStorageKey)||'null'),w=d.websiteInstallation;
      if(saved&&w&&saved.sessionTag===tag&&saved.tenantIdentity===w.tenantIdentity&&saved.configurationRevision===w.configurationRevision&&saved.check.id===w.attempt?.id&&saved.check.origin===w.selectedOrigin&&Date.parse(saved.check.expiresAt)>Date.now())websiteCheckCache=saved.check;
      else{websiteCheckCache=null;sessionStorage.removeItem(websiteStorageKey);}
    }catch(error){websiteCheckCache=null;}if(!leaving&&generation===portalGeneration){websiteCacheLoaded=true;renderWebsiteInstallation(data);}
  }
  async function websiteStore(check){var generation=portalGeneration,tag=await visitSessionTag;if(leaving||generation!==portalGeneration)return false;websiteCheckCache=check;try{var w=data.websiteInstallation;sessionStorage.setItem(websiteStorageKey,JSON.stringify({sessionTag:tag,tenantIdentity:w.tenantIdentity,configurationRevision:w.configurationRevision,check:check}));return true;}catch(error){return false;}}
  function websiteCurrentCheck(){var w=data&&data.websiteInstallation,c=websiteCheckCache;return c&&w&&w.attempt?.id===c.id&&w.configurationRevision===data.configurationRevision&&!['expired','stale'].includes(w.attempt.state)&&websiteChosenOrigin()===c.origin&&w.selectedOrigin===c.origin&&Date.parse(c.expiresAt)>Date.now()?c:null;}
  function websiteChosenOrigin(){var select=$('websiteInstallOrigin');return !select.parentNode.hidden&&select.value?select.value:data.websiteInstallation?.selectedOrigin||websiteURL(data.client.business.website)?.origin||'';}
  function websiteCheckLink(check){var url=websiteURL(check&&check.url);return url&&url.origin===check.origin&&url.hash==='#mc-website-check='+check.id+'.'+check.challenge?url.href:null;}
  function renderWebsiteInstallation(d){
    if(!d||leaving||!$('websiteInstallCard'))return;var w=d.websiteInstallation,legacy=!d.setup,site=d.client.business.website||'',link=websiteURL(site),root=$('websiteInstallCard');
    var web=d.setup?.connectionJourney?.channels?.find(function(channel){return channel.id==='web';});if($('websiteSetupDetails'))$('websiteSetupDetails').hidden=!!web&&!web.requested;
    if(!websiteCacheLoaded&&w){websiteCacheLoaded=true;websiteRestore(d);}
    $('websiteInstallSite').replaceChildren();if(link){var a=document.createElement('a');a.href=link.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent=link.href;$('websiteInstallSite').appendChild(a);}else $('websiteInstallSite').textContent=site||'Add your business website';
    if(!websiteDirty&&document.activeElement!==$('websiteInstallWebsite'))$('websiteInstallWebsite').value=site;
    var editing=!legacy&&(websiteEditing||websiteDirty);$('websiteInstallEdit').hidden=!editing;$('websiteInstallChange').hidden=legacy||!link||editing;$('websiteInstallSiteGroup').hidden=editing;$('websiteInstallFacts').hidden=legacy||!link;
    $('websiteInstallStep').hidden=editing;$('websiteInstallOriginGroup').hidden=editing;$('websiteInstallHelp').hidden=editing||!link;$('websiteInstallEditCancel').disabled=websiteBusy;
    root.dataset.installationState=w?.nextAction?.id||'loading';
    var originChoices=Array.from(new Set([link&&link.origin].concat(d.client.widget.allowedOrigins||[]).filter(function(value){return !!websiteURL(value)&&websiteURL(value).origin===value;})));
    var select=$('websiteInstallOrigin'),selected=websiteOriginSelection||w?.selectedOrigin||link?.origin;select.replaceChildren();originChoices.forEach(function(value){var option=document.createElement('option');option.value=value;option.textContent=value;select.appendChild(option);});if(originChoices.includes(selected))select.value=selected;$('websiteInstallOriginGroup').hidden=legacy||editing||!link||originChoices.length<2;
    var primary=$('websiteInstallPrimary'),action=w?.nextAction?.id||'check_status',heading='Check your website setup',detail='Refresh the status to see the next step.',number='1';
    if(legacy){action='copy_code';heading='Add chat to your website';detail='Copy the code into your shared website footer, then publish your website.';}
    if(w){var observation=w.observation||{},request=w.setupRequest||{},first=w.firstExternalRequest||{},chat=w.customerChat||{};
      websiteFact('websiteInstallObserved',observation.state==='found'?'Found'+(observation.at?' · '+websiteTime(observation.at):''):observation.state==='stale'?'Found previously'+(observation.origin?' on '+observation.origin:''):observation.state==='waiting'?'Waiting for your website':'Not checked');
      var chatLabels={active:'Active now',paused:'Paused',closed:'Closed',needs_rules:'Business details needed',needs_review:'Rules review needed',needs_practice:'Practice needed',ready_to_activate:'Ready to activate',limit:'Daily limit reached',unavailable:'Temporarily unavailable'};websiteFact('websiteInstallChat',chatLabels[chat.state]||'Check status');
      websiteFact('websiteInstallRequest',request.state==='complete'?'Check completed'+(request.at?' · '+websiteTime(request.at):''):request.state==='saved_unconfirmed'?'Request saved; answer not confirmed':request.state==='stale'?'Previous check retained':'Not checked');
      websiteFact('websiteInstallFirst',first.state==='received'?'Received'+(first.at?' · '+websiteTime(first.at):''):first.state==='stale'?'Previous request on '+(first.origin||'your former website'):'None recorded yet');
      var complete=observation.state==='found'&&request.state==='complete';$('websiteInstallBadge').textContent=complete?'Website check complete':observation.state==='found'?'Widget found':'Not checked';$('websiteInstallBadge').dataset.complete=String(complete);
      if(w.configurationRevision!==d.configurationRevision){action='check_status';detail='Your saved details changed. Refresh the website status before checking again.';}
    }
    var copy={start_check:['Check on my website','Start your website check','Open your published website and look for the chat button. This checks the installation; it does not send a message.','3'],save_website:['Save website','Where should customers find your front desk?','Add your business website. Your other saved details are ready to use.','1'],allow_origin:['Use this website','Allow your front desk on this website','Use '+websiteChosenOrigin()+'. Changing the allowed website requires another rules review and practice conversation.','1'],copy_code:['Copy installation code','Add one line to your website','Add the code in your website’s shared footer, before </body>, then publish your website.','2'],check_status:['Check status','See what is ready',detail,'3'],review_rules:['Review business rules','Check the answers customers will hear','Your widget can stay installed. Review your current business rules before customer chat can answer.','3'],test_desk:['Try your front desk','Try a private conversation','Your widget can stay installed. Practice the requests customers ask before activating chat.','3'],activate_web:['Activate website chat','Ready for customer conversations','Your rules and practice check are ready. Activate website chat, then try a sample request on your website.','3'],resume_web:['Resume website chat','Your website chat is paused','Resume when your current setup checks are complete. Your installation evidence is kept.','3'],try_sample:['Try a sample request','See a request arrive in your workspace','Open the installed widget and create a sample callback request. Use the sample details shown there.','4'],view_setup_request:['View setup request','Your website check is complete','See the sample request and conversation your front desk saved.','4'],open_website:['Open my website','Your website check is complete','No ordinary website request has been recorded yet. The first request will appear here when it arrives.','4'],view_request:['View request','Your first website request arrived','Open the saved request to see what the customer needs and follow up.','4']};
    if(!legacy&&!w){action='check_status';copy.check_status[1]='Website setup is loading';copy.check_status[2]='Refresh to check your saved website and next step.';}
    if(w&&websiteChosenOrigin()!==w.selectedOrigin){action=(d.client.widget.allowedOrigins||[]).includes(websiteChosenOrigin())?'copy_code':'allow_origin';$('websiteInstallBadge').textContent='Check this website';$('websiteInstallBadge').dataset.complete='false';websiteFact('websiteInstallObserved',w.observation?.at?'Previous check on '+w.selectedOrigin:'Not checked');websiteFact('websiteInstallRequest','Not checked on this website');websiteFact('websiteInstallFirst','None recorded on this website');}
    if(action==='check_website')action='start_check';
    if(action==='copy_code'&&websiteCopied){action='start_check';copy.start_check=['Check on my website','Check the widget on your website','Open your published website and look for the chat button. This step checks the installation; it does not send a message.','3'];}
    if(action==='check_status'&&w?.attempt){copy.check_status[1]='Waiting for your website';copy.check_status[2]=w.attempt.state==='expired'?'Your last check expired. Start a new check when you are ready.':'Open your website check, then refresh this status.';}
    var item=copy[action]||copy.check_status;primary.dataset.action=action;primary.textContent=item[0];$('websiteInstallHeading').textContent=item[1];$('websiteInstallDetail').textContent=item[2];$('websiteInstallNumber').textContent=item[3];primary.disabled=websiteBusy||websiteConflict;$('websiteInstallReviewLatest').hidden=!websiteConflict;$('websiteInstallReviewLatest').disabled=websiteBusy;
    $('websiteInstallRefresh').hidden=!w?.attempt; $('websiteInstallRefresh').disabled=websiteBusy;
    $('websiteInstallSave').disabled=websiteBusy||websiteConflict;$('websiteInstallChange').disabled=websiteBusy;$('websiteInstallAlready').disabled=websiteBusy||websiteConflict;$('websiteInstallHandoff').disabled=websiteBusy;$('copySnippet').disabled=websiteBusy;
    var check=websiteCurrentCheck(),checkURL=check&&websiteCheckLink(check),open=$('websiteInstallOpen');open.hidden=!checkURL;open.textContent='Open website check';open.removeAttribute('href');if(checkURL)open.href=checkURL;
    if(action==='save_website')primary.textContent='Add website';
  }
  async function latestWorkspaceRead(){var pending=load();for(;;){await pending;if(pending===loadPending)return;pending=loadPending;}}
  async function websiteRead(){var generation=portalGeneration,previous=data;await latestWorkspaceRead();if(leaving||generation!==portalGeneration)return;if(data===previous)throw new Error('The latest website status could not be confirmed. Please check again.');}
  function websiteHandleError(error){if(error.code==='configuration_changed')websiteConflict=true;if(error.status===401||error.status===403){document.dispatchEvent(new CustomEvent('mc:session-expired'));return;}websiteMessage((error.message||'We could not confirm this step.')+' Your saved details are kept.',true);if(error.field==='business.website'||error.fieldErrors?.['business.website']){websiteEditing=true;$('websiteInstallEdit').hidden=false;$('websiteInstallWebsiteError').textContent=error.fieldErrors?.['business.website']||error.message;$('websiteInstallWebsite').setAttribute('aria-invalid','true');$('websiteInstallWebsite').focus();}}
  async function websiteChange(task){if(websiteBusy||leaving)return;var generation=portalGeneration;websiteBusy=true;renderWebsiteInstallation(data);cfgChanged();acctStatus();try{await task(generation);}catch(error){if(generation===portalGeneration&&!leaving)websiteHandleError(error);}finally{if(generation===portalGeneration&&!leaving){websiteBusy=false;renderWebsiteInstallation(data);cfgChanged();acctStatus();}}}
  function websiteNeedSavedRules(){if(cfgDirty||cfgBusy||acctBusy){websiteMessage('Save your business edits before changing your website setup.',true);routeTo('know');$('saveCfg').focus();return true;}return false;}
  function websiteApplySaved(result){data.client=result.client;data.setup=result.setup||data.setup;data.configurationRevision=result.configurationRevision;data.editRevision=result.editRevision;if(!cfgChanges(cfgFromClient(result.client),cfgBaseline).length){cfgRevision=result.configurationRevision;cfgEditRevision=result.editRevision;}acctObserve(result,true);cfgFence++;renderSetup(data);document.dispatchEvent(new CustomEvent('mc:desk',{detail:data}));}
  async function websiteStart(){if(websiteConflict||websiteNeedSavedRules())return;await websiteChange(async function(generation){websiteMessage('Preparing your website check…');var result=await action('start_website_check',{expectedRevision:cfgRevision,expectedEditRevision:cfgEditRevision,origin:websiteChosenOrigin()});if(generation!==portalGeneration||leaving)return;if(!result.check||!websiteCheckLink(result.check))throw new Error('A safe website check link could not be prepared.');data.websiteInstallation=result.websiteInstallation;var stored=await websiteStore(result.check);if(generation!==portalGeneration||leaving)return;websiteMessage(stored?'Your check is ready. Open your website, then return here to check its status.':'Your check is ready for this page. Keep it open; this browser could not save the link for a reload.');$('websiteInstallOpen').hidden=false;$('websiteInstallOpen').href=websiteCheckLink(result.check);$('websiteInstallOpen').focus();});}
  async function websiteCopy(handoff){var generation=portalGeneration;try{var text=$('snippet').textContent;if(handoff)text='Please add the Machines & Cloud chat to '+(data.client.business.website||websiteChosenOrigin())+'.\n\n'+text+'\n\nAdd this once in the shared footer before </body>, publish the website, then let me know so I can check it from my workspace.';await navigator.clipboard.writeText(text);if(leaving||generation!==portalGeneration)return;if(!handoff)websiteCopied=true;$('copyMessage').textContent=handoff?'Instructions copied. Send them to your web person.':'Code copied. Publish your website, then check it here.';renderWebsiteInstallation(data);}catch(error){if(!leaving&&generation===portalGeneration){$('websiteInstallHelp').open=true;$('copyMessage').textContent='Select the code and copy it manually.';$('snippet').focus();}}}
  function websiteViewRecord(record){if(!record||!['leads','bookings'].includes(record.kind)||typeof record.id!=='string')return;routeTo(record.kind==='bookings'?'availability':'leads');var row=Array.from($(record.kind).querySelectorAll('[data-record-id]')).find(function(node){return node.dataset.recordId===record.id;});if(row){document.querySelectorAll('[data-record-focus]').forEach(function(node){delete node.dataset.recordFocus;});row.dataset.recordFocus='true';row.tabIndex=-1;row.focus();row.scrollIntoView({block:'center'});}else websiteMessage('That saved request is not in the recent list. Refresh '+(record.kind==='bookings'?'Schedule':'Requests')+' to check its latest status.',true);}
  $('websiteInstallReviewLatest').addEventListener('click',function(){websiteChange(async function(generation){await websiteRead();if(generation!==portalGeneration||leaving)return;websiteConflict=false;websiteMessage('Latest saved website: '+(data.client.business.website||'none yet')+'. Your typed address is kept. Review it before saving or checking again.');});});
  $('websiteInstallChange').addEventListener('click',function(){websiteEditing=true;renderWebsiteInstallation(data);$('websiteInstallWebsite').focus();});
  $('websiteInstallEditCancel').addEventListener('click',function(){if(websiteBusy)return;websiteDirty=false;websiteEditing=false;$('websiteInstallWebsiteError').textContent='';$('websiteInstallWebsite').removeAttribute('aria-invalid');renderWebsiteInstallation(data);$(websiteURL(data.client.business.website)?'websiteInstallChange':'websiteInstallPrimary').focus({preventScroll:true});});
  $('websiteInstallWebsite').addEventListener('input',function(){websiteDirty=this.value!==(data.client.business.website||'');websiteEditing=true;$('websiteInstallWebsiteError').textContent='';$('websiteInstallWebsite').removeAttribute('aria-invalid');});
  $('websiteInstallOrigin').addEventListener('change',function(){websiteOriginSelection=this.value;websiteCheckCache=null;websiteCopied=false;renderWebsiteInstallation(data);});
  $('websiteInstallEdit').addEventListener('submit',function(event){event.preventDefault();if(websiteConflict||websiteNeedSavedRules())return;var snapshot=$('websiteInstallWebsite').value,url=websiteURL(snapshot);if(!url){$('websiteInstallWebsiteError').textContent='Enter the full HTTPS address, such as https://yourshop.com.';$('websiteInstallWebsite').setAttribute('aria-invalid','true');$('websiteInstallWebsite').focus();return;}websiteChange(async function(generation){var result=await apiRequest('PUT',{expectedRevision:cfgRevision,expectedEditRevision:cfgEditRevision,business:{website:url.href}});if(generation!==portalGeneration||leaving)return;websiteDirty=$('websiteInstallWebsite').value!==snapshot;websiteEditing=websiteDirty;websiteCheckCache=null;websiteCopied=false;websiteOriginSelection=null;websiteApplySaved(result);await websiteRead();if(generation!==portalGeneration||leaving)return;websiteMessage(websiteDirty?'Website saved. Your newer address is still unsaved.':'Website saved. Continue with the next step below.');if(!websiteDirty)$('websiteInstallPrimary').focus({preventScroll:true});});});
  $('websiteInstallPrimary').addEventListener('click',function(){var actionName=this.dataset.action,w=data?.websiteInstallation;if(actionName==='save_website'){websiteEditing=true;renderWebsiteInstallation(data);$('websiteInstallWebsite').focus();}else if(actionName==='copy_code')websiteCopy(false);else if(actionName==='start_check')websiteStart();else if(actionName==='allow_origin'){if(websiteNeedSavedRules())return;websiteChange(async function(generation){var origins=(data.client.widget.allowedOrigins||[]).slice(),origin=websiteChosenOrigin();if(!origins.includes(origin))origins.push(origin);var result=await apiRequest('PUT',{expectedRevision:cfgRevision,expectedEditRevision:cfgEditRevision,widget:{allowedOrigins:origins}});if(generation!==portalGeneration||leaving)return;websiteApplySaved(result);await websiteRead();if(generation===portalGeneration&&!leaving)websiteMessage('Website allowed. Review and try your updated rules before activation.');});}else if(actionName==='check_status')websiteChange(async function(generation){await websiteRead();if(generation===portalGeneration&&!leaving)websiteMessage('Website status updated.');});else if(actionName==='try_sample'){if(websiteCurrentCheck()){var checkURL=websiteCheckLink(websiteCurrentCheck());if(checkURL)window.open(checkURL,'_blank','noopener,noreferrer');websiteMessage('Use the sample request in your website chat. If the new tab was blocked, use Open website check below.');}else websiteStart();}else if(actionName==='view_setup_request')websiteViewRecord(w?.setupRequest?.record);else if(actionName==='view_request')websiteViewRecord(w?.firstExternalRequest?.record);else if(actionName==='open_website'){var site=websiteURL(data.client.business.website);if(site){window.open(site.href,'_blank','noopener,noreferrer');$('websiteInstallOpen').href=site.href;$('websiteInstallOpen').hidden=false;$('websiteInstallOpen').textContent='Open my website';websiteMessage('If the new tab was blocked, use the website link below.');}}else if(actionName==='review_rules'){routeTo('know');$('reviewRules').focus();}else if(actionName==='test_desk'){routeTo('test');$('chatIn').focus();}else if(['activate_web','resume_web'].includes(actionName)){if(websiteNeedSavedRules())return;if(!data.setup?.canActivateWeb){websiteMessage('Complete the current setup requirements before activating customer chat.',true);return;}websiteChange(async function(generation){await action(actionName==='resume_web'?'resume':'go_live');if(generation!==portalGeneration||leaving)return;await websiteRead();if(generation===portalGeneration&&!leaving)websiteMessage('Website chat is active. Continue with your website check.');});}});
  $('websiteInstallAlready').addEventListener('click',websiteStart);$('websiteInstallRefresh').addEventListener('click',function(){websiteChange(async function(generation){await websiteRead();if(generation===portalGeneration&&!leaving)websiteMessage('Website status updated.');});});$('websiteInstallHandoff').addEventListener('click',function(){websiteCopy(true);});

  function homeFollowupRows(d){var selfService=d.client?.onboarding?.version===1;return (d.leads||[]).filter(function(l){return (!selfService||!l.websiteSetupCheck&&!l.simulation)&&(selfService&&l.followthrough?l.followthrough.needsFollowup:l.status==='open'&&(l.alertWaiting||l.overdueAt||l.outcome==='needs_action'||l.outcome==='wants_call'));});}
  function renderHomeNext(d) {
    var guide=$('workspaceGuide'),button=$('nextSetupAction'),setup=d&&d.setup,client=d&&d.client;
    guide.dataset.needed='false';button.hidden=false;delete button.dataset.anchor;$('homeSetupSecondaryWrap').hidden=true;$('homeSetupReminder').hidden=true;$('homeSetupSecondary').hidden=true;delete $('homeSetupSecondary').dataset.anchor;
    if(!setup||!client||['cancelled','archived'].includes(client.status)){document.body.dataset.homeMode='work';if(!homeActivityChosen)$('homeActivityDetails').open=true;if(document.body.dataset.activePage==='today'){$('pageTitle').textContent=pageCopy.today[1];$('pageDescription').textContent=pageCopy.today[2];}syncNextActionVisibility();return;}
    var next,rows=(setup.connectionJourney?.channels||[]).filter(function(row){return row.requested||row.retained;}),blockers=setup.channels?.web?.blockers||[];
    var modelUnavailable=blockers.some(function(row){return row.id==='model';}),practiceAvailable=!modelUnavailable&&(!d.aiAllowance||d.aiAllowance.private.remaining>0);
    if(cfgDirty||cfgConflict||cfgBusy)next={title:cfgConflict?'Review your saved changes':cfgBusy?'Your changes are being saved':'Finish your business edits',detail:cfgConflict?'Your draft is kept. Compare it with the latest saved details before continuing.':cfgBusy?'Any newer typing stays in your draft.':'Save your draft, then review the answers customers should hear.',label:'Open business details',tab:'know'};
    else if(preferenceDirty)next={title:'Finish your connection choices',detail:'Your current choices are kept on this page. Save them or return to your saved choices.',label:'Review connection choices',tab:'setup',anchor:'connectionPreferencesDetails'};
    else {
      var ownerRows=rows.filter(function(row){return row.responsibility==='customer'&&row.action&&row.action.kind!=='wait';});
      var row=ownerRows.find(function(row){return row.action.kind==='route'&&row.action.target==='know';})||ownerRows.find(function(row){return row.action.kind==='route'&&row.action.target==='test'&&practiceAvailable;});
      if(row)next=row.action.target==='know'?{title:'Check your business details',detail:'Confirm your services, hours and the answers your front desk should use.',label:'Review business details',tab:'know'}:{title:'See your front desk in action',detail:'Try a private customer question using your saved details.',label:'Test your answers',tab:'test'};
      if(!next){row=ownerRows.find(function(row){if(row.action.kind==='route'&&row.action.target==='test')return false;if(row.id==='web'){var w=d.websiteInstallation;return !w||w.observation?.state!=='found'||w.setupRequest?.state!=='complete'||w.customerChat?.state!=='active';}return true;});
        if(row)next={title:row.id==='web'?'Get your website ready for customers':'Continue '+row.label.toLowerCase(),detail:row.nextStep||row.detail,label:row.id==='web'?'Continue website setup':'View next step',tab:'setup',anchor:row.id==='web'?'websiteInstallStep':'connection-guide-'+row.id};
      }
      if(!next){var waiting=rows.find(function(row){return ['platform','carrier'].includes(row.responsibility)&&!row.active;});if(waiting)next={title:waiting.responsibility==='carrier'?'Your registration is being reviewed':'Your setup progress',detail:waiting.nextStep||waiting.detail};}
    }
    var followup=homeFollowupRows(d),workFirst=followup.length>0&&!cfgDirty&&!cfgConflict&&!cfgBusy&&!preferenceDirty;
    if(workFirst){
      var setupNext=next;
      next={title:followup.length===1?'A customer request needs your attention':followup.length+' customer requests need your attention',detail:'Review the saved details and record what happens next.',label:'Open customer requests',tab:'leads'};
      if(setupNext){$('homeSetupSecondaryWrap').hidden=false;$('homeSetupReminder').hidden=false;$('homeSetupReminder').textContent='Setup also needs attention: '+setupNext.title+'.';if(setupNext.tab){var secondary=$('homeSetupSecondary');secondary.hidden=false;secondary.textContent=setupNext.label||'Continue setup';secondary.dataset.route=setupNext.tab;if(setupNext.anchor)secondary.dataset.anchor=setupNext.anchor;}}
    }
    if(next){guide.dataset.needed='true';$('guideTitle').textContent=next.title;$('guideIntro').textContent=next.detail;button.hidden=!next.tab;button.textContent=next.label||'';button.dataset.route=next.tab||'';if(next.anchor)button.dataset.anchor=next.anchor;}
    var selfService=client.onboarding?.version===1,customerRecord=function(row){return !selfService||!row.websiteSetupCheck&&!row.simulation&&!row.ownerVisitCreationAborted;};
    var hasWork=(d.leads||[]).some(customerRecord)||(d.bookings||[]).some(customerRecord)||(d.conversations||d.convs||[]).some(customerRecord)||!selfService&&(Number(d.today?.needsYou)>0||Number(d.today?.bookings)>0);
    var preparing=guide.dataset.needed==='true'&&!hasWork&&!['live','paused'].includes(client.status);
    document.body.dataset.homeMode=preparing?'setup':'work';
    if($('homeSetupLabel'))$('homeSetupLabel').textContent=workFirst?'Needs your attention':preparing?'Get ready for your first customer':'Next for your front desk';
    if(!homeActivityChosen)$('homeActivityDetails').open=!preparing;
    $('homeActivitySummary').textContent=hasWork?'Requests, visits and conversations saved in your workspace':'No customer activity yet. Saved requests will appear here.';
    if(document.body.dataset.activePage==='today'){
      $('pageTitle').textContent=preparing?'Get your front desk ready':'Your day, at a glance';
      $('pageDescription').textContent=preparing?'Your business answers are saved. Follow the next step, then connect the services you choose.':pageCopy.today[2];
    }
    syncNextActionVisibility();
  }
  function reviewState(d) {
    if(!d||!d.setup)return;
    $('reviewRules').disabled=leaving||reviewBusy||websiteBusy||cfgDirty||cfgBusy||acctBusy||cfgClosed||['cancelled','archived'].includes(d.client.status);
    $('reviewMessage').textContent=reviewBusy?'Saving your review…':websiteBusy?'Wait for your website setup to finish updating.':cfgDirty||cfgBusy||acctBusy?'Save your edits before reviewing this version.':d.client.setupProof?.reviewedRevision===d.setup.revision?'Review saved for the current version.':'';
  }
  function renderSetup(d) {
    renderWorkspaceOperations(d);
    renderPhoneActivation(d);
    var setup = d.setup, client = d.client;
    renderWebsiteInstallation(d);
    if (!setup) return;
    $('deskSignOut').hidden = !ownerSession;
    $('reviewCard').hidden = false; ['setupOverview','setupDiagnostics','legacyWebsiteDetails'].forEach(function(id){if($(id))$(id).hidden=true;});
    var allowance = d.aiAllowance, limited = allowance && !allowance.available;
    var operational = setup.channels.web.ready && setup.channels.web.active && !limited;
    $('legacyConnectionDetails').hidden = true; $('legacyDeliveryTests').hidden = true;
    var journey = setup.connectionJourney;
    var wantsWeb = !journey || !Array.isArray(journey.channels) || journey.channels.some(function (channel) { return channel.id === 'web' && channel.requested; });
    $('connectionsCard').hidden = !journey || !Array.isArray(journey.channels);
    if (journey && Array.isArray(journey.channels)) {
      var states = { active: 'Connected', needs_action: 'Setup needed', pending_activation: 'Not connected yet', not_selected: 'Not selected', limited: 'Daily limit reached' };
      preferenceBaseline=journey.channels.filter(function(channel){return channel.requested;}).map(function(channel){return channel.id;}).sort();
      if(!preferenceDirty&&!preferenceBusy)preferenceFill(preferenceBaseline);preferenceState();
      $('connectionJourney').innerHTML = journey.channels.map(function (channel) {
        var state = channel.status, detail = channel.detail, next = channel.nextStep;
        if (channel.id === 'web' && state === 'active' && !operational) {
          state = limited ? 'limited' : 'needs_action';
          detail = limited ? 'Your settings are saved, but customer AI replies are unavailable for the rest of today.' : 'Your settings are saved, but website chat cannot answer customers until its setup checks pass.';
          next = limited ? 'More AI replies become available after the daily reset at midnight Houston time.' : 'Complete the review and test requirements in this setup.';
        }
        return '<div class="setup-step"><div><strong>' + esc(channel.label) + ' · ' + esc(states[state] || 'Not connected yet') + '</strong><p>' + esc(detail) + '</p>' + (channel.requested && next ? '<p><b>Next:</b> ' + esc(next) + '</p>' : '') + '</div></div>';
      }).join('');
    }
    $('status').textContent = client.status === 'cancelled' ? 'Service cancelled' : client.status === 'paused' ? 'Front desk paused' : limited ? 'Daily AI allowance reached' : operational ? 'Website chat active' : 'Setup in progress';
    $('status').className = 'st' + (operational ? ' live' : '');
    renderHomeNext(d);
    $('setupSteps').replaceChildren();$('setupSteps').hidden=true;
    reviewState(d);
    $('aiAllowance').textContent = allowance ? 'AI replies left today: ' + allowance.private.remaining + ' practice · ' + allowance.web.remaining + ' customer chat. Resets at midnight Houston time.' + (allowance.reconciliation ? ' ' + allowance.reconciliation : '') : '';
    if (limited) { var activate = $('golive') || $('resume'); if (activate) activate.disabled = true; }
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
    $('handoffNote').textContent = 'Saved visits appear in Schedule. Customer requests and conversations are in Inbox. Check Front desk for connection setup and delivery status.';
    $('textCommands').hidden = true;
    var voiceChosen=journey&&journey.channels.some(function(channel){return channel.id==='voice'&&(channel.requested||channel.retained);});
    $('phoneProfileHeading').hidden=!voiceChosen;
    ['phone.businessNumber','phone.carrier','phone.forwarding'].forEach(function(name){var field=$('cfg').elements[name];if(field){field.disabled=!voiceChosen||cfgClosed;field.closest('.form-group').hidden=!voiceChosen;}});
    $('transferGroup').style.display=voiceChosen?'block':'none';
    ['phone.handoffEnabled','phone.transferTo','owner.backupPhone','rules.ackMinutes'].forEach(function(name){var field=$('cfg').elements[name];field.disabled=!voiceChosen||cfgClosed;field.closest('.form-group').hidden=!voiceChosen;});
    var disabledNames = ['rules.bypass', 'rules.consentAsk', 'digest.text', 'rules.callbackHours', 'rules.callbackAfterHours'];
    disabledNames.forEach(function (name) { var field = $('cfg').elements[name]; if (field) { field.disabled = true; field.closest('.form-group').hidden = true; } });
    var messages = setup.channels.web.blockers.map(function (blocker) { return blocker.detail; });
    $('setupMessage').textContent = !wantsWeb && !operational ? 'Your connection preferences are saved. Check Your connections for the next step; website chat is optional.' : limited ? 'The daily AI allowance has been used. Your settings and records are saved. More replies become available at midnight Houston time.' : messages.length ? 'Before activation: ' + messages.join(' ') : operational ? 'Website chat is active. Your other connections show their own status below.' : 'Ready to activate website chat using the button above.';
  }
  function preferenceValues(){return Array.prototype.map.call($('connectionPreferences').querySelectorAll('input[name="connection"]:checked'),function(field){return field.value;}).sort();}
  function preferenceFill(values){$('connectionPreferences').querySelectorAll('input[name="connection"]').forEach(function(field){field.checked=values.includes(field.value);});}
  function preferenceState(){
    var closed=data&&['cancelled','archived'].includes(data.client.status);
    preferenceDirty=JSON.stringify(preferenceValues())!==JSON.stringify(preferenceBaseline);
    var choiceSummary=$('connectionChoiceSummary');
    if(choiceSummary){var names={web:'Website chat',voice:'Phone answering',sms:'Text messaging',calendar:'Google Calendar'};choiceSummary.textContent=(preferenceBusy?'Saving choices · ':preferenceDirty?'Unsaved choices · ':'')+(preferenceBaseline.map(function(id){return names[id];}).filter(Boolean).join(' · ')||'No services selected');}
    $('saveConnections').disabled=preferenceBusy||closed||!preferenceDirty;
    $('connectionPreferences').setAttribute('aria-busy',String(preferenceBusy));
    $('connectionPreferences').querySelectorAll('input').forEach(function(field){field.disabled=!!closed;});
    if(closed)$('connectionsMessage').textContent='This workspace is closed. Your saved choices and records are retained.';
    if($('cancelConnectionPreferences')){$('cancelConnectionPreferences').hidden=!preferenceDirty||closed;$('cancelConnectionPreferences').disabled=preferenceBusy;}
  }

  $('connectionPreferences').addEventListener('change',function(){if(leaving)return;$('connectionPreferencesDetails').open=true;preferenceState();$('connectionsMessage').textContent=preferenceBusy?'Saving your submitted choices. Newer changes stay here.':preferenceDirty?'Your connection choices have not been saved.':'Your saved connection choices are shown.';});
  if($('cancelConnectionPreferences'))$('cancelConnectionPreferences').addEventListener('click',function(){if(leaving||preferenceBusy)return;preferenceFill(preferenceBaseline);preferenceState();$('connectionsMessage').textContent='Your saved connection choices are shown.';});
  $('connectionPreferences').addEventListener('submit', async function (event) {
    event.preventDefault(); if (!data || !data.setup || preferenceBusy || leaving || ['cancelled','archived'].includes(data.client.status)) return;
    var selected=preferenceValues(),generation=portalGeneration;
    preferenceBusy=true;preferenceState();$('connectionsMessage').textContent = 'Saving your preferences…';
    try {
      await action('save_connection_preferences', { desiredChannels: selected });
      if (leaving||generation!==portalGeneration) return;
      preferenceBaseline=selected;preferenceState();await load();if(!leaving&&generation===portalGeneration)$('connectionsMessage').textContent=preferenceDirty?'Submitted choices saved. Your newer choices are still unsaved.':'Preferences saved. Each connection shows its next step below.';
    } catch (error) { if (!leaving&&generation===portalGeneration){if(error.status===401||error.status===403){document.dispatchEvent(new CustomEvent('mc:session-expired'));return;}$('connectionPreferencesDetails').open=true;$('connectionsMessage').textContent='Your preferences could not be confirmed. Your choices are kept; check saved status before trying again.';} }
    finally { if (!leaving&&generation===portalGeneration){preferenceBusy=false;preferenceState();} }
  });
  $('reviewRules').addEventListener('click', async function () {
    if (!data || !data.setup || leaving || reviewBusy || websiteBusy || cfgDirty || cfgBusy || acctBusy || cfgClosed || ['cancelled','archived'].includes(data.client.status)) return;
    var generation=portalGeneration,errorMessage=null;reviewBusy=true;cfgFence++;reviewState(data);
    try{await action('review_rules',{revision:data.setup.revision});if(leaving||generation!==portalGeneration)return;cfgFence++;await latestWorkspaceRead();}
    catch(error){if(leaving||generation!==portalGeneration)return;if(error.status===401||error.status===403){document.dispatchEvent(new CustomEvent('mc:session-expired'));return;}errorMessage=error.message;}
    finally{if(!leaving&&generation===portalGeneration){reviewBusy=false;reviewState(data);if(errorMessage)$('reviewMessage').textContent=errorMessage;}}
  });
  $('copySnippet').addEventListener('click', function () { websiteCopy(false); });
  var tour = [
    { title: 'Your day, at a glance', body: 'Home shows requests, visits and work that needs your attention. Use Inbox for customer messages, Schedule for visits and Front desk for setup.', action: 'Explore Home', tab: 'today', target: 'todayTourSummary', compact: 'todayTourHeading', tiny: 'todayTourHeading' },
    { title: 'Make it sound like your shop', body: 'Your services, hours, prices and safety instructions guide every answer. Open a section to check or edit it, then review the saved version.', action: 'Review business details', tab: 'know', target: 'reviewCard', compact: 'businessProfileTourHeading', tiny: 'businessProfileTourTitle' },
    { title: 'Try it before customers do', body: 'Test answers with a customer question or visit request. This private conversation previews the details collected without real bookings, messages or calendar changes.', action: 'Open Test answers', tab: 'test', target: 'chatForm', compact: 'chatForm', tiny: 'chatIn' },
    { title: 'Keep your schedule accurate', body: 'Schedule holds your saved visits and blocked time. Block dates or windows for outside work. Existing visits stay booked; outside calendar busy times are not synced automatically.', action: 'View Schedule', tab: 'availability', target: 'availabilityForm', compact: 'availabilityDateGroup', tiny: 'availabilityTourLabel' },
    { title: 'Put it on your website', body: 'Follow the next step shown here to install and check your website chat. Copying the code alone does not confirm it is installed or answering customers.', action: 'View website setup', tab: 'setup', target: 'websiteInstallStep', compact: 'websiteInstallHeading', tiny: 'websiteInstallHeading', fallback: 'connectionTourHeading' },
    { title: 'Find your customer requests', body: 'Inbox keeps customer requests and conversations together. Review what the customer needs, then confirm the next step directly. Saved visits are in Schedule.', action: 'View Requests', tab: 'leads', target: 'requestTourHeading', compact: 'requestTourHeading', tiny: 'requestTourHeading' }
  ];
  var defaultTour = tour.slice(), tourRevealedDetails = [];
  var tourIndex = 0, returnFocus = null, tourActive = false, tourEpoch = 0, tourFrame = 0, tourGeneration = 0, tourAnchor = null, tourObserver = null, tourResize = null, tourAnimation = null, tourWebsiteOpen = null;
  var tourMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  function tourCurrent() { return tourActive && !leaving && tourGeneration === portalGeneration && $('guideDialog').open && !$('portalContent').hidden; }
  function tourVisible(node) { return !!node && node.isConnected && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden'; }
  function tourFocus(node) { if (!tourVisible(node)) return; if (!node.matches('button,input,select,textarea,a[href],[tabindex]')) node.setAttribute('tabindex', '-1'); node.focus({ preventScroll: true }); }
  function tourRect(node, x, y, width, height) { Object.assign(node.style, { left: x + 'px', top: y + 'px', width: Math.max(0,width) + 'px', height: Math.max(0,height) + 'px' }); }
  function tourCleanup() {
    tourActive = false; tourEpoch++; if (tourFrame) cancelAnimationFrame(tourFrame); tourFrame = 0;
    if (tourAnimation) tourAnimation.cancel(); tourAnimation = null;
    if (tourObserver) tourObserver.disconnect(); if (tourResize) tourResize.disconnect(); tourObserver = null; tourResize = null;
    window.removeEventListener('resize', scheduleTour); window.removeEventListener('scroll', scheduleTour, true); window.removeEventListener('hashchange', tourNavigation); window.removeEventListener('popstate', tourNavigation); if (tourMotion) tourMotion.removeEventListener('change', tourReducedMotion);
    if (window.visualViewport) { visualViewport.removeEventListener('resize', scheduleTour); visualViewport.removeEventListener('scroll', scheduleTour); }
    document.body.classList.remove('guide-tour-open'); $('tourSpotlight').hidden = true;
    if(tourWebsiteOpen!==null&&$('websiteSetupDetails'))$('websiteSetupDetails').open=tourWebsiteOpen;tourWebsiteOpen=null;
    tourRevealedDetails.forEach(function(node){if(node.isConnected)node.open=false;});tourRevealedDetails=[];
    ['tourStep','tourTarget','tourReady','tourPlacement','tourCompact','tourFallback'].forEach(function (name) { delete $('guideDialog').dataset[name]; }); tourAnchor = null;
  }
  function closeTour(remember, restore) {
    var anchor = tourAnchor, opener = returnFocus; tourCleanup(); if ($('guideDialog').open) $('guideDialog').close();
    if (remember !== false) try { localStorage.setItem('mc-walkthrough-v1:' + slug, 'seen'); } catch (error) { /* Preference only, never setup proof. */ }
    if (restore === false || leaving) return;
    var destination = tourVisible(opener) ? opener : tourVisible(anchor) ? anchor.querySelector('h2,h3,h4') || anchor.closest('.card2')?.querySelector('h2,h3,h4') || anchor : $('pageTitle');
    if (tourVisible(destination)) { destination.scrollIntoView({ block: 'nearest', behavior: 'instant' }); tourFocus(destination); }
  }
  function tourNavigation() { if (tourCurrent() && location.hash !== '#' + tour[tourIndex].tab) { closeTour(false, true); var tab = location.hash.slice(1); if (pageCopy[tab]) showTab(tab); } }
  function tourReducedMotion() { if (tourMotion.matches && tourAnimation) { tourAnimation.cancel(); tourAnimation = null; } scheduleTour(); }
  function scheduleTour(event) {
    if (event?.type === 'scroll' && event.target instanceof Node && $('tourCoach').contains(event.target)) return;
    if (!tourCurrent() || tourFrame) return; var epoch = tourEpoch;
    tourFrame = requestAnimationFrame(function () { tourFrame = 0; if (epoch === tourEpoch && tourCurrent()) positionTour(false); });
  }
  function positionTour(scroll) {
    if (!tourCurrent()) return;
    var dialog = $('guideDialog'), coach = $('tourCoach'), step = tour[tourIndex], viewport = window.visualViewport, coachScroll = $('tourContent').scrollTop;
    if (document.body.dataset.activePage !== step.tab) { closeTour(false, true); return; }
    var width = viewport ? viewport.width : innerWidth, height = viewport ? viewport.height : innerHeight, vx = viewport ? viewport.offsetLeft : 0, vy = viewport ? viewport.offsetTop : 0, edge = 12, gap = 16;
    var primary = $(step.target), compact = $(step.compact), missing = !tourVisible(primary) && !tourVisible(compact), anchor = tourVisible(primary) ? primary : tourVisible(compact) ? compact : $(step.fallback) || $('pageTitle');
    if (!tourVisible(anchor)) { closeTour(false, false); return; }
    coach.style.width = Math.min(344, width - edge * 2) + 'px'; coach.style.maxHeight = Math.max(100, height - edge * 2) + 'px';
    var card = coach.getBoundingClientRect(), rect = anchor.getBoundingClientRect(), horizontal = Math.max(rect.left - vx, vx + width - rect.right) >= card.width + gap + edge;
    if (!horizontal && rect.height + card.height + gap + edge * 2 > height && tourVisible(compact)) anchor = compact;
    if (!horizontal && height < 330 && tourVisible($(step.tiny))) anchor = $(step.tiny);
    if (scroll) { rect = anchor.getBoundingClientRect(); window.scrollTo({ top: Math.max(0, window.scrollY + rect.top - vy - edge - 8), behavior: 'instant' }); }
    rect = anchor.getBoundingClientRect();
    var left = Math.max(vx + 6, rect.left - 7), top = Math.max(vy + 6, rect.top - 7), right = Math.min(vx + width - 6, rect.right + 7), bottom = Math.min(vy + height - 6, rect.bottom + 7);
    if (right <= left || bottom <= top) { if (!scroll) positionTour(true); return; }
    var x, y, placement, available, cw = card.width, ch = coach.getBoundingClientRect().height;
    if (vx + width - right >= cw + gap + edge) { x = right + gap; y = Math.max(vy + edge, Math.min(top, vy + height - ch - edge)); placement = 'right'; }
    else if (left - vx >= cw + gap + edge) { x = left - cw - gap; y = Math.max(vy + edge, Math.min(top, vy + height - ch - edge)); placement = 'left'; }
    else {
      x = Math.max(vx + edge, Math.min(left, vx + width - cw - edge));
      var below = vy + height - bottom - gap - edge, above = top - vy - gap - edge;
      placement = below >= ch || below >= above ? 'below' : 'above'; available = Math.max(84, placement === 'below' ? below : above);
      coach.style.maxHeight = available + 'px'; ch = coach.getBoundingClientRect().height;
      y = placement === 'below' ? bottom + gap : top - gap - ch;
    }
    coach.style.left = x + 'px'; coach.style.top = Math.max(vy + edge, y) + 'px'; $('tourContent').scrollTop = coachScroll;
    tourRect($('tourSpotlight'), left, top, right-left, bottom-top); $('tourSpotlight').hidden = false;
    tourRect($('tourMaskTop'), vx, vy, width, top-vy); tourRect($('tourMaskBottom'), vx, bottom, width, vy+height-bottom);
    tourRect($('tourMaskLeft'), vx, top, left-vx, bottom-top); tourRect($('tourMaskRight'), right, top, vx+width-right, bottom-top);
    dialog.dataset.tourStep = String(tourIndex + 1); dialog.dataset.tourTarget = anchor.id; dialog.dataset.tourPlacement = placement; dialog.dataset.tourCompact = String(anchor !== primary); dialog.dataset.tourFallback = String(missing); dialog.dataset.tourReady = 'true';
    $('tourFallback').hidden = !missing; $('tourFallback').textContent = missing ? 'This area is not available in the current workspace. You can continue the tour or close it.' : ''; $('tourAction').disabled = missing;
    if (tourAnchor !== anchor) { tourAnchor = anchor; if (tourResize) { tourResize.disconnect(); tourResize.observe(coach); tourResize.observe(anchor); } }
  }
  function renderTour() {
    if (!tourCurrent()) return; tourEpoch++; if (tourFrame) cancelAnimationFrame(tourFrame); tourFrame = 0;
    var step = tour[tourIndex], dialog = $('guideDialog'); dialog.dataset.tourReady = 'false'; $('tourSpotlight').hidden = true;
    showTab(step.tab); window.__tabPicked = true; history.replaceState(null, '', location.pathname + location.search + '#' + step.tab);
    if(step.target==='websiteInstallStep'&&$('websiteSetupDetails')&&!$('websiteSetupDetails').hidden){if(tourWebsiteOpen===null)tourWebsiteOpen=$('websiteSetupDetails').open;$('websiteSetupDetails').open=true;}
    var reveal=$(step.target);while(reveal){if(reveal.tagName==='DETAILS'&&!reveal.open){tourRevealedDetails.push(reveal);reveal.open=true;}reveal=reveal.parentElement;}
    $('tourCount').textContent = 'Getting started · ' + (tourIndex + 1) + ' of ' + tour.length; $('tourTitle').textContent = step.title; $('tourBody').textContent = step.body; $('tourAction').textContent = step.action;
    $('tourBack').disabled = tourIndex === 0; $('tourNext').textContent = tourIndex === tour.length - 1 ? 'Finish' : 'Next'; $('tourProgress').style.transform = 'scaleX(' + ((tourIndex + 1) / tour.length) + ')';
    $('tourContent').scrollTop = 0; positionTour(true); tourFocus($('tourTitle'));
    if (tourAnimation) tourAnimation.cancel(); if (!tourMotion.matches && coachAnimationAvailable()) tourAnimation = $('tourCoach').animate([{ opacity: 0, transform: 'translateY(7px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 190, easing: 'ease-out' });
  }
  function coachAnimationAvailable() { return typeof $('tourCoach').animate === 'function'; }
  function openTour() {
    if (leaving || !data || $('portalContent').hidden || document.querySelector('dialog[open]:not(#guideDialog)')) return;
    if (tourActive) return; returnFocus = document.activeElement; tourActive = true; tourGeneration = portalGeneration;
    document.body.classList.add('guide-tour-open'); $('guideDialog').dataset.tourReady = 'false'; $('guideDialog').showModal();
    window.addEventListener('resize', scheduleTour); window.addEventListener('scroll', scheduleTour, true); window.addEventListener('hashchange', tourNavigation); window.addEventListener('popstate', tourNavigation); tourMotion.addEventListener('change', tourReducedMotion);
    if (window.visualViewport) { visualViewport.addEventListener('resize', scheduleTour); visualViewport.addEventListener('scroll', scheduleTour); }
    tourObserver = new MutationObserver(scheduleTour); tourObserver.observe($('portalContent'), { childList: true, subtree: true });
    if (window.ResizeObserver) { tourResize = new ResizeObserver(scheduleTour); tourResize.observe($('tourCoach')); }
    renderTour();
  }
  $('openGuide').addEventListener('click', function () { if(tourActive)return; tour = defaultTour.slice(); tourIndex = 0; openTour(); });
  document.addEventListener('mc:service-guide', function(event) {
    if(leaving||!data||tourActive||!['web','voice','sms','calendar','thumbtack','angi'].includes(event.detail?.service))return;
    var id=event.detail.service, journey=data.setup?.connectionJourney;
    var row=(journey?.channels||[]).concat(journey?.leadSources||[]).find(function(item){return item.id===id;});
    if(!row?.guide||!Array.isArray(row.guide.steps)||!row.guide.steps.length)return;
    var anchor=['thumbtack','angi'].includes(id)?'lead-source-'+id:'connection-guide-'+id;
    var maps={business:{tab:'know',target:'reviewCard',compact:'businessProfileTourHeading',tiny:'businessProfileTourTitle'},selection:{tab:'setup',target:'connectionPreferencesDetails',compact:'connectionChoicesTitle',tiny:'connectionChoicesTitle'},connection:{tab:'setup',target:anchor,compact:anchor,tiny:anchor},practice:{tab:'test',target:'chatForm',compact:'chatForm',tiny:'chatIn'},verification:{tab:'setup',target:id==='web'?'websiteInstallStep':id==='voice'&&$('phoneRoutingSteps')?'phoneRoutingSteps':id==='sms'&&$('textConnectionSteps')?'textConnectionSteps':anchor,compact:anchor,tiny:anchor},inbox:{tab:'leads',target:'requestFilters',compact:'pageTitle',tiny:'pageTitle'},schedule:{tab:'availability',target:'scheduleVisits',compact:'pageTitle',tiny:'pageTitle'}};
    tour=row.guide.steps.slice(0,8).map(function(step){return Object.assign({title:String(step.label||row.label),body:String(step.detail||row.nextStep||''),action:step.actor==='customer'?'Go to this step':'View setup status',fallback:'setupGuide'},step.id==='practice'?maps.practice:maps[step.focus]||maps.connection);});
    tourIndex=0;openTour();
  });
  $('closeGuide').addEventListener('click', function () { closeTour(); }); $('skipGuide').addEventListener('click', function () { closeTour(); });
  $('guideDialog').addEventListener('cancel', function (event) { event.preventDefault(); closeTour(); });
  $('guideDialog').addEventListener('close', function () { if (!$('guideDialog').open) tourCleanup(); });
  $('tourNext').addEventListener('click', function () { if (tourIndex === tour.length - 1) closeTour(); else { tourIndex++; renderTour(); } });
  $('tourBack').addEventListener('click', function () { if (tourIndex > 0) { tourIndex--; renderTour(); } });
  $('tourAction').addEventListener('click', function () { var anchor = tourAnchor;if(tour[tourIndex].target==='websiteInstallStep')tourWebsiteOpen=null;tourRevealedDetails=tourRevealedDetails.filter(function(node){return !node.contains(anchor);}); closeTour(true, false); if (tourVisible(anchor)) { anchor.scrollIntoView({ block: 'nearest', behavior: 'instant' }); tourFocus(anchor.querySelector('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)') || anchor); } });

  var accountBusy = false, accountUncertain = null, exportBusy = false;
  function accountMessage(message, error) {
    $('accountServiceMessage').textContent = message || ''; $('accountServiceMessage').dataset.error = error ? 'true' : 'false';
    if ($('cancelBox').open) { $('cancelMessage').textContent = message || ''; $('cancelMessage').dataset.error = error ? 'true' : 'false'; }
  }
  function accountCanResume(d) {
    return !d.client.pausedChannels?.web?.active || !!d.setup?.canActivateWeb && (!d.aiAllowance || d.aiAllowance.available);
  }
  function renderAccount(d) {
    var c = d.client, selfService = c.onboarding?.version === 1, closed = ['cancelled','archived'].includes(c.status), paused = c.status === 'paused';
    $('accountBusiness').textContent = c.business.name || 'Not saved'; $('accountOwner').textContent = c.owner.name || 'Not saved';
    $('accountEmail').textContent = c.owner.email || 'Not available'; $('accountPhone').textContent = c.owner.phone || 'Not saved';
    $('accountEditContact').hidden = closed; $('accountReporting').hidden = selfService || closed; $('workspaceMaintenance').hidden = !selfService || closed;
    var webActive = !!d.webAvailable && !!d.setup?.channels?.web?.ready && !!d.setup?.channels?.web?.active;
    var rows = d.setup?.connectionJourney?.channels || [], active = rows.filter(function (row) { return row.id === 'web' ? webActive : row.active; });
    $('accountServiceStatus').textContent = closed ? 'Service stopped' : paused ? 'Paused' : active.length ? 'Services connected' : c.status==='live' ? (selfService?'Check connections':'Workspace active') : 'Setup in progress';
    $('accountServiceSummary').textContent = closed ? 'Your front desk is stopped. Saved customer records are still available to download.' : paused ? 'Automated service is paused. Your records, setup choices and permissions are kept.' : active.length ? 'Check each connection below. A saved visit or message has its own delivery status.' : c.status==='live' ? 'Check Connections for each service’s readiness and next steps.' : 'Your workspace is saved. Continue setup to prepare the services you want to use.';
    var labels = {not_selected:'Not selected',needs_action:'Setup needed',pending_activation:'Not connected',waiting_platform:'Waiting for service',waiting_carrier:'Carrier review',working:'Setup in progress',needs_attention:'Needs attention',checking:'Checking saved result',checking_status:'Checking saved status',cleanup_pending:'Checking cleanup',cleanup_uncertain:'Checking cleanup',cancel_pending:'Checking cleanup',cancelled:'Disconnected',closed:'Stopped',paused:'Paused',ready_for_website:'Website setup needed'};
    $('accountConnectionSummary').innerHTML = rows.map(function (row) {
      var relevant = row.requested || row.retained || row.active, label = labels[row.status] || 'Check Connections';
      if (closed && relevant) label = 'Stopped';
      else if (paused && relevant) label = 'Paused';
      else if (row.id === 'web' && webActive) label = 'Customer chat enabled';
      else if (row.id === 'calendar' && d.connections?.calendar?.connected) label = d.connections.calendarDelivery?.enabled ? 'Permission saved · sync enabled' : 'Permission saved · sync waiting';
      else if (row.active) label = 'Connection verified';
      return '<div><dt>' + esc(row.label) + '</dt><dd>' + esc(label) + '</dd></div>';
    }).join('');
    $('accountConnectionSummary').hidden = !rows.length;
    var buttons = '';
    if (!closed) {
      if (paused && (!selfService || accountCanResume(d))) buttons += '<button type="button" class="btn-pill btn-pill-blue btn-sm" id="resume">Resume workspace</button>';
      else if (!selfService && !paused && ['testing','draft'].includes(c.status)) buttons += '<button type="button" class="btn-pill btn-pill-blue btn-sm" id="golive">Go live</button>';
      else buttons += '<button type="button" class="btn-pill btn-pill-blue btn-sm" id="accountConnections">' + (paused ? 'View resume requirements' : active.length || c.status === 'live' ? 'Manage connections' : 'Continue setup') + '</button>';
      if (!paused && ['live','testing'].includes(c.status) && (c.status === 'live' || active.length || rows.some(function(row){return row.retained;}))) buttons += '<button type="button" class="btn-pill btn-pill-dark btn-sm" id="pause">Pause workspace</button>';
    } else buttons = '<a class="btn-pill btn-pill-dark btn-sm" href="mailto:support@machinesandcloud.com">Contact support</a>';
    var off = d.forwarding?.off;
    if ((paused || closed) && Array.isArray(off) && off.length) buttons += '<div class="desk-account-forwarding muted">To stop carrier forwarding: ' + off.map(function (code) { return '<a href="tel:' + encodeURIComponent(code) + '">Dial ' + esc(code) + '</a>'; }).join(' · ') + '</div>';
    $('liveBtns').innerHTML = buttons;
    var resumeRequirement = d.aiAllowance && !d.aiAllowance.available ? 'Today’s AI allowance is exhausted. It resets at midnight Houston time; your saved review and test are kept.' : d.setup?.channels?.web?.blockers?.[0]?.detail || 'Check the current website chat requirements under Front desk.';
    $('accountServiceScope').textContent = closed ? 'Stopping service does not delete your account or revoke saved provider permissions.' : paused && selfService && !accountCanResume(d) ? 'Website chat was on before pausing. ' + resumeRequirement : paused ? 'Resuming restores your previous workspace state. Each connection still needs its own readiness and delivery checks.' : $('pause') ? 'Pausing stops automated service in this workspace. Carrier call forwarding may need a separate change.' : 'Your saved service choices do not activate a connection. Continue setup to review what each service needs.';
    $('accountStopService').hidden = closed;
    $('accountStopNote').textContent = selfService ? 'Stop automated service and scheduled tasks. Your account and saved records are kept.' : 'Stop this front desk. Check your existing call forwarding before disconnecting.';
    $('cancelScope').textContent = selfService ? 'This stops automated service and scheduled tasks for this workspace. Saved records remain available to download. It does not release a phone number or revoke Google access. If you forward an existing line, turn off forwarding with your carrier.' : 'This stops your front desk. Saved records remain available to download. Turn off existing call forwarding with your carrier; check Connections for your number and remaining service details.';
    $('liveBtns').querySelectorAll('button').forEach(function(button){button.disabled=accountBusy || !!accountUncertain;});
    $('cancelBtn2').disabled = accountBusy || !!accountUncertain; $('cancelGo').disabled = accountBusy || !!accountUncertain; $('cancelNo').disabled = accountBusy; $('cancelNo').textContent=accountUncertain?'Close':'Keep service'; $('cancelCheckStatus').hidden=!accountUncertain; $('cancelCheckStatus').disabled=accountBusy;
    $('accountCheckStatus').hidden = !accountUncertain; $('accountCheckStatus').disabled = accountBusy;
    $('accountServiceControls').setAttribute('aria-busy', accountBusy ? 'true' : 'false'); $('cancelBox').setAttribute('aria-busy', accountBusy ? 'true' : 'false');
    if ($('accountConnections')) $('accountConnections').addEventListener('click',function(){routeTo('setup');});
    if ($('golive')) $('golive').addEventListener('click',function(){accountChange('go_live');});
    if ($('pause')) $('pause').addEventListener('click',function(){accountChange('pause');});
    if ($('resume')) $('resume').addEventListener('click',function(){accountChange(selfService ? 'resume_services' : 'resume');});
  }
  function accountResultMatches(d, name, prior) {
    var state = d.client?.status || d.status;
    return name === 'cancel' ? state === 'cancelled' : name === 'pause' ? state === 'paused' : ['resume','go_live'].includes(name) ? state === 'live' : state === (prior === 'live' ? 'live' : 'testing');
  }
  function accountConfirmed(name) {
    accountUncertain = null;
    if (name === 'cancel' && $('cancelBox').open) $('cancelBox').close();
    accountMessage(name === 'cancel' ? 'Service stopped. You can still download your saved records.' : name === 'pause' ? 'Workspace paused. Check carrier forwarding if calls should return to your phone.' : name === 'go_live' ? 'Activation saved. Check Connections for each service’s current status.' : 'Workspace resumed. Check Connections for each service’s current status.');
    $('accountServiceMessage').focus({preventScroll:true});
  }
  async function accountChange(name) {
    if (accountBusy || accountUncertain || leaving || !data) return;
    if ((name === 'resume_services' || name === 'resume') && (cfgDirty || cfgBusy || acctDirty || acctBusy || websiteDirty || websiteBusy)) { accountMessage('Save your edited business details before resuming.', true); return; }
    var generation = portalGeneration, prior = data.client.pausedFrom;
    accountBusy = true; accountMessage(name === 'cancel' ? 'Stopping service…' : name === 'pause' ? 'Pausing workspace…' : name === 'go_live' ? 'Activating front desk…' : 'Resuming workspace…'); renderAccount(data);
    var body = name === 'resume_services' ? {expectedRevision:data.configurationRevision} : name === 'cancel' ? {reason:$('cancelReason').value} : {};
    try {
      var result = await action(name, body); if (generation !== portalGeneration || leaving) return;
      if (!accountResultMatches(result, name, prior)) throw new Error('The service change could not be confirmed.');
      accountConfirmed(name); await load();
    } catch (error) {
      if (generation !== portalGeneration || leaving) return;
      if (error.status === 401 || error.status === 403) { document.dispatchEvent(new CustomEvent('mc:session-expired')); return; }
      if (error.status && error.status < 500) { accountMessage(error.message + ' No success was confirmed.', true); if(error.status===409)await load(); }
      else {
        accountUncertain = {name:name, prior:prior};
        accountMessage('The response was lost. Checking the saved service status before another change…', true);
        try {
          var latest = await apiRequest(); if (generation !== portalGeneration || leaving) return;
          if (accountResultMatches(latest, name, prior)) { accountConfirmed(name); await load(latest); }
          else { await load(latest); accountMessage('The change is not confirmed. Check service status before trying again.', true); }
        } catch (readError) {
          if (generation !== portalGeneration || leaving) return;
          if (readError.status === 401 || readError.status === 403) { document.dispatchEvent(new CustomEvent('mc:session-expired')); return; }
          accountMessage('The change could not be confirmed. Check service status when your connection returns; do not repeat it yet.', true);
        }
      }
    } finally { if (generation === portalGeneration && !leaving) { accountBusy = false; if (data) renderAccount(data); } }
  }
  $('accountEditContact').addEventListener('click',function(){routeTo('know');$('contactDetails').open=true;var field=$('cfg').elements['owner.name'];field.scrollIntoView({block:'center'});field.focus({preventScroll:true});});
  $('cancelBtn2').addEventListener('click',function(){if(accountBusy || accountUncertain)return;$('cancelMessage').textContent='';$('cancelBox').showModal();$('cancelNo').focus();});
  function closeAccountCancellation(){if(accountBusy)return;$('cancelBox').close();$('cancelBtn2').focus({preventScroll:true});}
  $('cancelNo').addEventListener('click',closeAccountCancellation);
  $('cancelBox').addEventListener('cancel',function(event){event.preventDefault();closeAccountCancellation();});
  $('cancelGo').addEventListener('click',function(){accountChange('cancel');});
  $('cancelCheckStatus').addEventListener('click',function(){$('accountCheckStatus').click();});
  $('accountCheckStatus').addEventListener('click',async function(){
    if(accountBusy || !accountUncertain || leaving)return;var generation=portalGeneration,pending=accountUncertain;accountBusy=true;accountMessage('Checking saved service status…');renderAccount(data);
    try{var latest=await apiRequest();if(generation!==portalGeneration || leaving)return;if(accountResultMatches(latest,pending.name,pending.prior))accountConfirmed(pending.name);else{accountUncertain=null;accountMessage('Status checked. The previous change was not saved; review the current status before trying again.',true);}await load(latest);}
    catch(error){if(generation!==portalGeneration || leaving)return;if(error.status===401||error.status===403){document.dispatchEvent(new CustomEvent('mc:session-expired'));return;}accountMessage('Status could not be checked. Keep this change on hold and try checking again.',true);}
    finally{if(generation===portalGeneration&&!leaving){accountBusy=false;if(data)renderAccount(data);}}
  });

  function load(snapshot) {
    var generation = portalGeneration, fence = cfgFence, sequence = ++loadSequence;
    loadPending = (snapshot && snapshot.client ? Promise.resolve(snapshot) : apiRequest()).then(function (d) {
      if (generation !== portalGeneration || fence !== cfgFence || sequence !== loadSequence || leaving) return;
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
      $('today').dataset.summaryScope=selfService?'workspace':'legacy';
      var historyListing = d.recordListing || {}, bookingsLimited = !!historyListing.bookings?.incomplete, leadsLimited = !!historyListing.leads?.incomplete, workLimited = historyIncomplete(historyListing);
      renderHistoryScope(d);
      var st = $('status'); st.textContent = c.status === 'live' ? 'live' : c.status === 'testing' ? 'testing, not live yet' : c.status; st.className = 'st' + (c.status === 'live' ? ' live' : '');
      st.textContent = c.status === 'live' ? 'live' : c.status === 'testing' ? 'testing, not live yet' : c.status === 'paused' ? 'paused: calls ring your phone, no texts, no chat' : c.status === 'cancelled' ? 'cancelled' : c.status;
      var offBtns = (d.forwarding && d.forwarding.off && d.forwarding.off.length && (c.status === 'paused' || c.status === 'cancelled')) ? '<div class="muted" style="margin-top:8px">Send calls back to your phone: ' + d.forwarding.off.map(function (k) { return '<a class="btn-pill btn-pill-dark btn-sm" style="margin:4px 6px 4px 0" href="tel:' + encodeURIComponent(k) + '">Dial ' + esc(k) + '</a>'; }).join('') + '<br>' + esc(d.forwarding.offLong || '') + '</div>' : '';
      var live = c.status === 'live'; $('tabToday').style.display = ''; $('tabTest').style.display = c.status === 'cancelled' ? 'none' : '';
      if (!location.hash && !window.__tabPicked) { showTab('today'); window.__tabPicked = true; }

      var needsFollowup=homeFollowupRows(d);
      $('needsYou').innerHTML = (function () { var rows = needsFollowup; return rows.length ? rows.slice(0, 10).map(function (l) { return '<div>' + esc(l.customer_name || l.phone) + (platformLeadLabel(l)?' <span class="tag">'+esc(platformLeadLabel(l))+'</span>':'') + ' (' + esc((l.outcome || '').replace('_', ' ')) + (l.urgency === 'emergency' ? ', <b>EMERGENCY</b>' : '') + (l.overdueAt ? ', <span class="tag-overdue">overdue callback</span>' : '') + ') ref ' + esc(leadReference(l)) + humanHandoffStatus(l) + (selfService&&l.followthrough?' <button type="button" class="btn-pill btn-pill-dark btn-sm" data-request-open="'+esc(l.id)+'">View request</button>':'') + (l.alertWaiting ? ' <button type="button" class="btn-pill btn-pill-blue btn-sm ack" data-id="' + esc(l.id) + '">Acknowledge</button>' : '') + '</div>'; }).join('') : emptyState(workLimited ? 'No requests need attention in the records shown' : 'No requests need attention', workLimited ? 'Some history still needs checking. Contact support if you are looking for an earlier request.' : 'Requests that need a callback, an acknowledgment or urgent attention will appear here.', 'View customer requests', 'leads'); })();
      $('todayEvents').innerHTML = (d.events || []).filter(function (e) { return Date.now() - new Date(e.at).getTime() < 86400000; }).slice(0, 15).map(function (e) { return '<div>' + esc((e.at || '').slice(11, 16)) + ' ' + esc(e.type.replace(/_/g, ' ')) + (e.data && e.data.id ? ' ref ' + esc(e.data.id) : '') + '</div>'; }).join('') || emptyState('No activity in the last 24 hours', 'Customer activity appears here after it happens. Private practice is kept separate.');
      if(selfService){
        var visitsToday=d.bookings.filter(function(b){return b.date===houstonToday&&b.status!=='cancelled'&&!b.websiteSetupCheck&&!b.simulation&&!b.ownerVisitCreationAborted;}).length;
        $('today').innerHTML='<div><b>'+needsFollowup.length+'</b> Needs follow-up'+(leadsLimited?' · shown':'')+'</div><div><b>'+visitsToday+'</b> Visits today'+(bookingsLimited?' · shown':'')+'</div><div><b>'+d.conversations.length+'</b> Recent conversations'+(historyListing.conversations?.incomplete?' · shown':'')+'</div>';
        if($('homeServiceContext')){var webSelected=(c.onboarding.desiredChannels||[]).includes('web');$('homeServiceContext').textContent=c.status==='cancelled'?'Your service is cancelled. Saved records remain available.':c.status==='paused'?'Your front desk is paused. Manage service in Account.':webSelected&&!d.webAvailable?'Website chat is not answering customers yet. Your saved requests stay available.':'';}
      }else{var t=d.today||{},h=d.health||{};$('today').innerHTML='<div><b>'+(t.calls||0)+'</b> calls</div><div><b>'+(t.texts||0)+'</b> texts in</div><div><b>'+(t.bookings||0)+'</b> booked today</div><div><b>'+(t.needsYou||0)+'</b> need you</div><div class="muted">Line: '+(h.errors24h?h.errors24h+' errors in 24 h':'OK')+'</div>';if($('homeServiceContext'))$('homeServiceContext').textContent='';}
      $('missing').textContent = (c.build && c.build.notes) ? c.build.notes : 'Nothing major.';
      // records
      $('bookings').innerHTML = d.bookings.length ? '<div class="tblwrap"><table class="tbl"><tr><th>When</th><th>Customer</th><th>Issue</th><th>Visit</th><th>Status</th><th>Ref</th>' + (selfService ? '<th>Manage</th>' : '') + '</tr>' + d.bookings.map(function (b) { return '<tr data-record-kind="bookings" data-record-id="'+esc(b.id)+'"><td>' + esc(recordTimeLabel(b.createdAt)) + '</td><td>' + esc(b.customer_name) + (b.websiteSetupCheck?' <span class="tag">Setup check</span>':'') + ' <span class="muted">(' + (b.customerType === 'existing' ? 'existing' : 'new') + ')</span><br><span class="muted">' + esc(b.phone) + '</span>' + (b.unsure ? '<br><span class="muted">Unsure: ' + esc(b.unsure) + '</span>' : '') + '</td><td>' + esc(b.issue) + '<br><span class="muted">' + esc(b.address) + '</span></td><td>' + esc(visitDateLabel(b.date)) + ' ' + esc(b.window) + '</td><td>' + esc(visitStatusLabel(b)) + '</td><td>' + esc(b.id) + '</td>' + (selfService ? '<td><button type="button" class="btn-pill btn-pill-dark btn-sm visit-open" data-visit="' + esc(b.id) + '">' + (b.pendingVisitChange ? 'Resume change' : 'View visit') + '</button></td>' : '') + '</tr>'; }).join('') + '</table></div>' : emptyState(bookingsLimited ? 'No visits in this view' : 'No visits yet', bookingsLimited ? 'Some visit history still needs checking. Contact support if you need an earlier visit.' : 'Saved visits appear here with their arrival window and job details.');
      $('newVisit').hidden=!selfService; if(selfService)$('newVisit').textContent=(d.pendingVisitCreations || []).length?'Resume new visit':'Add visit';
      document.querySelectorAll('.visit-open').forEach(function (button) { button.addEventListener('click', function () { openVisit(button.dataset.visit); }); });
      $('leads').innerHTML = d.leads.length ? '<div class="tblwrap"><table class="tbl"><tr><th>When</th><th>Customer</th><th>Issue</th><th>Outcome</th><th>Status</th><th>Ref</th></tr>' + d.leads.map(function (l) { return '<tr data-record-kind="leads" data-record-id="'+esc(l.id)+'"><td>' + esc(recordTimeLabel(l.createdAt)) + '</td><td>' + esc(l.customer_name || 'no name') + (platformLeadLabel(l)?' <span class="tag" data-lead-source-badge>'+esc(platformLeadLabel(l))+'</span>':'') + (l.websiteSetupCheck?' <span class="tag">Setup check</span>':'') + ' <span class="muted">(' + (l.customerType === 'existing' ? 'existing' : 'new') + ')</span><br><span class="muted">' + esc(l.phone) + '</span></td><td>' + esc(l.issue) + (l.unsure ? '<br><span class="muted">Unsure: ' + esc(l.unsure) + '</span>' : '') + '</td><td>' + esc((l.outcome || l.reason || '').replace('_', ' ')) + humanHandoffStatus(l) + (l.urgency === 'emergency' ? ' <b>EMERGENCY</b>' : '') + (l.overdueAt && l.status === 'open' ? '<span class="tag-overdue">overdue callback</span>' : '') + (l.alertWaiting ? ' <button type="button" class="btn-pill btn-pill-blue btn-sm ack" data-id="' + esc(l.id) + '">Acknowledge</button>' : '') + '</td><td>' + (selfService&&l.followthrough?esc(l.followthrough.reviewRequired?'Review updated request':l.followthrough.state.completedAt?'Follow-up complete':l.followthrough.due?'Follow-up due':l.followthrough.state.contact.replace(/_/g,' '))+'<br><span class="muted">'+esc(l.followthrough.state.nextAction||'No next action recorded')+'</span>':esc(l.status)) + '</td><td>' + esc(leadReference(l)) + (selfService&&l.followthrough?' <button type="button" class="btn-pill btn-pill-dark btn-sm" data-request-open="'+esc(l.id)+'">View request</button>':'') + '</td></tr>'; }).join('') + '</table></div>' : emptyState(leadsLimited ? 'No customer requests in this view' : 'No customer requests yet', leadsLimited ? 'Some request history still needs checking. Contact support if you need an earlier request.' : 'Customer requests appear here with the details you need to review and follow up.');
      document.querySelectorAll('button.ack').forEach(function (b) { b.addEventListener('click', function () { apiRequest('POST', { action: 'ack', leadId: b.dataset.id }).then(function () { toast('Acknowledged.'); return load(); }).catch(function (error) { toast(error.message); }); }); });
      $('convs').innerHTML = renderConversations(d.conversations); $('bookingCount').textContent = d.bookings.length + (bookingsLimited ? ' shown' : ''); $('leadCount').textContent = d.leads.length + (leadsLimited ? ' shown' : ''); decorateRecordTables();
      supportObserve();
      // Background refreshes must never replace an edited or pending draft.
      if (!cfgDirty && !cfgBusy && !cfgConflict) {
        cfgFill(cfgFromClient(c)); cfgBaseline = cfgRead(); cfgRevision = d.configurationRevision; cfgEditRevision = d.editRevision; cfgClosed = !!(c.onboarding && c.onboarding.version === 1 && ['cancelled','archived'].includes(c.status));
        cfgStatus(cfgClosed ? 'error' : cfgIncomplete(d.setup) ? 'incomplete' : 'saved', cfgClosed ? 'This workspace no longer accepts business edits.' : cfgSavedMessage(d.setup));
      }
      acctObserve(d, false);
      var u = d.usage || {}; $('usage').textContent = u.month ? 'Recorded legacy usage for ' + u.month + ': ' + (u.minutes || 0) + ' call minutes and ' + (u.texts || 0) + ' outbound texts. This is not a complete report of managed service usage or a bill.' : '';
      [['expBookings','bookings'],['expLeads','leads'],['expConvs','conversations'],['expCustomers','customers']].forEach(function (item) { $(item[0]).dataset.export = item[1]; });
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
      var terms = d.policy && d.policy.privacy, termsURL; try { termsURL = new URL(terms, location.origin); } catch (error) { /* No valid customer terms were supplied. */ }
      $('accountTextingTerms').hidden = !terms || !termsURL || !/^https?:$/.test(termsURL.protocol); $('policyLink').href = termsURL && /^https?:$/.test(termsURL.protocol) ? termsURL.href : '#';
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
      renderSetup(d); renderAccount(d);
    }).catch(function (error) {
      if (generation !== portalGeneration || fence !== cfgFence || sequence !== loadSequence || leaving) return;
      if (error.status === 401 || error.status === 403) { document.dispatchEvent(new CustomEvent('mc:session-expired')); return; }
      if (fence === cfgFence) recover(error.name === 'AbortError' ? 'Loading timed out. Try again or sign in by email.' : error.message);
    });
    return loadPending;
  }
  function action(a, extra) { return apiRequest('POST', Object.assign({ action: a }, extra || {})); }
  function confirmAction(name, message) { return action(name).then(function () { toast(message); return load(); }).catch(function (error) { $('setupMessage').textContent = error.message; toast(error.message); }); }
  $('testSms').addEventListener('click', function () { action('test_sms').then(function (r) { $('smsText').textContent = r.ok ? 'Test text request accepted. Check your phone for delivery.' : 'No test text was sent.'; }).catch(function (error) { $('smsText').textContent = error.message; }); });

  $('cfg').elements['phone.forwarding'].addEventListener('change', function (ev) { document.getElementById('transferGroup').style.display = data?.client?.onboarding?.version === 1 || ev.target.value === 'all' ? 'block' : 'none'; });
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
    $('transferGroup').style.display=data?.client?.onboarding?.version===1||$('cfg').elements['phone.forwarding'].value==='all'?'block':'none';
    cfgErrorElements();$('cfg').querySelectorAll('[name],#hoursRows input').forEach(function(field){cfgEventValues.set(field,field.type==='checkbox'?String(field.checked):field.value);});
  }
  function cfgChanges(values, base) { return base?Object.keys(values).filter(function(name){return values[name]!==base[name];}):[]; }
  function cfgStatus(kind,message) { $('cfg').dataset.saveState=kind;if($('saveMsg').textContent!==message)$('saveMsg').textContent=message;$('saveCfg').disabled=cfgBusy||acctBusy||websiteBusy||cfgClosed;$('cfg').setAttribute('aria-busy',String(cfgBusy));$('cfgCheckLatest').disabled=cfgBusy||acctBusy;$('cfgKeepEdits').disabled=cfgBusy||acctBusy;$('saveAcct').disabled=cfgBusy||acctBusy||websiteBusy||cfgClosed; }
  function cfgIncomplete(setup) { return !!(setup&&setup.channels&&setup.channels.web&&setup.channels.web.blockers.some(function(row){return row.id==='rules'||row.id==='handoff';})); }
  function cfgSavedMessage(setup) { return cfgIncomplete(setup)?'Saved as a draft. Complete your business rules and callback details before activation.':'All changes saved. Connections shows any review, practice or permission needed for each service.'; }
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
    ['owner.phone','owner.backupPhone','phone.businessNumber','phone.transferTo'].forEach(function(name){if(changed.indexOf(name)>=0&&!cfgValidPhone(values[name]))errors[name]='Enter a valid US number, such as (713) 555-0142, or leave it blank for now.';});
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
    reviewState(data);
    renderHomeNext(data);
    if(cfgClosed)cfgStatus('error','This workspace no longer accepts business edits. Your typed changes are kept on this page.');else if(cfgBusy)cfgStatus('saving','Saving the submitted changes. Any newer edits will stay here.');else if(cfgConflict)cfgStatus('conflict','Your edits are kept. Review the latest saved version before saving again.');else cfgStatus(cfgDirty?'dirty':cfgIncomplete(data&&data.setup)?'incomplete':'saved',cfgDirty?'You have unsaved changes.':cfgSavedMessage(data&&data.setup));
  }
  async function saveCfg() {
    if(cfgBusy||acctBusy||websiteBusy||cfgClosed||leaving||!data||!cfgBaseline)return;
    var snapshot=cfgRead(),changed=cfgChanges(snapshot,cfgBaseline);if(!changed.length){cfgChanged();return;}
    if(cfgConflict){$('cfgConflictPanel').hidden=false;cfgStatus('conflict','Your edits are kept. Check the latest saved version before saving again.');$('cfgCheckLatest').focus();return;}
    var errors=cfgValidate(snapshot,changed);if(Object.keys(errors).length){cfgStatus('error','Check the highlighted details. Your edits have not been saved.');cfgShowErrors(errors);return;}
    var generation=portalGeneration;cfgBusy=true;cfgFence++;cfgClearError();cfgChanged();acctStatus();
    try{var result=await apiRequest('PUT',cfgPayload(snapshot,changed));if(leaving||generation!==portalGeneration)return;if(!result.client||data.client.onboarding&&data.client.onboarding.version===1&&(!/^[a-f0-9]{64}$/.test(result.configurationRevision||'')||!/^[a-f0-9]{64}$/.test(result.editRevision||'')))throw new Error('The saved version could not be confirmed.');
      var current=cfgRead(),preserve={};Object.keys(current).forEach(function(name){if(current[name]!==snapshot[name])preserve[name]=current[name];});var saved=cfgFromClient(result.client);cfgFill(saved,preserve);cfgBaseline=saved;cfgRevision=result.configurationRevision;cfgEditRevision=result.editRevision;cfgFence++;data.client=result.client;if(result.setup)data.setup=result.setup;if(result.configurationRevision)data.configurationRevision=result.configurationRevision;if(result.editRevision)data.editRevision=result.editRevision;cfgDirty=cfgChanges(cfgRead(),cfgBaseline).length>0;cfgConflict=null;$('cfgConflictPanel').hidden=true;renderSetup(data);if(!leaving)document.dispatchEvent(new CustomEvent('mc:desk',{detail:data}));
      acctObserve(result,true);cfgBusy=false;cfgStatus(cfgDirty?'dirty':cfgIncomplete(result.setup)?'incomplete':'saved',cfgDirty?'Submitted changes saved. Your newer edits are still unsaved.':cfgSavedMessage(result.setup));
    }catch(error){if(leaving||generation!==portalGeneration)return;cfgBusy=false;cfgDirty=cfgChanges(cfgRead(),cfgBaseline).length>0;if(error.status===401||error.status===403){document.dispatchEvent(new CustomEvent('mc:session-expired'));return;}if(error.code==='configuration_changed'){cfgConflict={latest:null};$('cfgConflictPanel').hidden=false;$('cfgKeepEdits').hidden=true;cfgStatus('conflict','Your saved details changed elsewhere. Your edits are kept; check the latest version.');}else{if(error.code==='workspace_closed')cfgClosed=true;cfgStatus('error',(error.message||'The save could not be confirmed.')+' Your edits are still here.');var fieldErrors=Object.assign({},error.fieldErrors||{});if(error.field&&!Object.keys(fieldErrors).length)fieldErrors[error.field]=error.message;var present=cfgRead();Object.keys(fieldErrors).forEach(function(name){var field=cfgField(name),grouped=name.indexOf('rules.hours')===0?'rules.hours':field&&field.name||name;if(present[grouped]!==snapshot[grouped])delete fieldErrors[name];});if(Object.keys(fieldErrors).length)cfgShowErrors(fieldErrors);}}
    finally{if(!leaving&&generation===portalGeneration){cfgBusy=false;$('cfg').setAttribute('aria-busy','false');$('saveCfg').disabled=cfgClosed||acctBusy;$('cfgCheckLatest').disabled=false;$('cfgKeepEdits').disabled=false;reviewState(data);acctStatus();}}
  }
  function cfgLabel(name) {var field=cfgField(name),label=field&&field.closest('.form-group')&&field.closest('.form-group').querySelector('label');return name==='rules.hours'?'Weekly hours':label?label.textContent.trim():name==='faq'?'Customer questions':name;}
  function cfgDisplay(name,value) {if(name==='rules.hours'){var hours=JSON.parse(value);return cfgDays.map(function(day){return day+': '+(hours[day].open||hours[day].close?hours[day].open+' to '+hours[day].close:'closed');}).join('; ');}return typeof value==='boolean'?value?'Yes':'No':value||'Blank';}
  $('cfgCheckLatest').addEventListener('click',async function(){if(cfgBusy||acctBusy||!cfgConflict||leaving)return;var generation=portalGeneration;cfgBusy=true;cfgStatus('conflict','Checking the latest saved details. Your edits will stay here.');try{var latest=await apiRequest();if(leaving||generation!==portalGeneration)return;if(!latest.client||!/^[a-f0-9]{64}$/.test(latest.configurationRevision||'')||!/^[a-f0-9]{64}$/.test(latest.editRevision||''))throw new Error('The latest saved version could not be read.');if(['cancelled','archived'].includes(latest.client.status)){cfgClosed=true;cfgConflict=null;$('cfgConflictPanel').hidden=true;throw new Error('This workspace no longer accepts business edits.');}cfgConflict.latest={data:latest,values:cfgFromClient(latest.client)};var mine=cfgRead(),changed=cfgChanges(cfgConflict.latest.values,cfgBaseline),box=$('cfgConflictFields');box.replaceChildren();changed.forEach(function(name){var row=document.createElement('p');row.className='cfg-conflict-field';row.textContent=cfgLabel(name)+' | Latest saved: '+cfgDisplay(name,cfgConflict.latest.values[name])+'. Your current value: '+cfgDisplay(name,mine[name]);box.appendChild(row);});$('cfgConflictText').textContent=changed.length?'Compare these updates with your draft. Keeping your edits saves only the fields you changed.':'The latest saved version is ready to compare. Keeping your edits saves only the fields you changed.';$('cfgKeepEdits').hidden=false;cfgStatus('conflict','Latest saved version checked. Your draft is unchanged; review the differences before continuing.');}catch(error){if(leaving||generation!==portalGeneration)return;if(error.status===401||error.status===403){document.dispatchEvent(new CustomEvent('mc:session-expired'));return;}cfgStatus(cfgClosed?'error':'conflict',error.message+' Your edits are still here.');}finally{if(!leaving&&generation===portalGeneration){cfgBusy=false;$('cfg').setAttribute('aria-busy','false');$('saveCfg').disabled=cfgClosed||acctBusy;$('cfgCheckLatest').disabled=false;$('cfgKeepEdits').disabled=false;}}});
  $('cfgKeepEdits').addEventListener('click',function(){if(cfgBusy||acctBusy||websiteBusy||cfgClosed||!cfgConflict||!cfgConflict.latest||leaving)return;var mine=cfgRead(),preserve={};cfgChanges(mine,cfgBaseline).forEach(function(name){preserve[name]=mine[name];});var latest=cfgConflict.latest;cfgFill(latest.values,preserve);cfgBaseline=latest.values;cfgRevision=latest.data.configurationRevision;cfgEditRevision=latest.data.editRevision;data=latest.data;cfgConflict=null;$('cfgConflictPanel').hidden=true;cfgFence++;cfgChanged();saveCfg();});

  $('cfg').addEventListener('submit',function(event){event.preventDefault();saveCfg();});

  function acctValue(client) { return client.rules.avgTicket ? String(client.rules.avgTicket) : ''; }
  function acctStatus(kind,message) {
    if(leaving)return;var state=kind||(acctBusy?'saving':acctConflict?'conflict':acctDirty?'dirty':'saved');
    $('acct').dataset.saveState=state;$('acct').setAttribute('aria-busy',String(acctBusy));$('saveAcct').disabled=acctBusy||cfgBusy||websiteBusy||cfgClosed;$('cfgCheckLatest').disabled=acctBusy||cfgBusy;$('cfgKeepEdits').disabled=acctBusy||cfgBusy;$('acctCheckLatest').disabled=acctBusy||cfgBusy;$('acctKeepEdits').disabled=acctBusy||cfgBusy;
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
    if(acctBusy||cfgBusy||websiteBusy||cfgClosed||leaving||!data||acctBaseline===null)return;
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
  $('acctKeepEdits').addEventListener('click',function(){if(acctBusy||cfgBusy||websiteBusy||cfgClosed||!acctConflict||!acctConflict.latest||leaving)return;var latest=acctConflict.latest;acctBaseline=acctValue(latest.client);acctRevision=latest.configurationRevision;acctEditRevision=latest.editRevision;acctConflict=null;$('acctConflictPanel').hidden=true;acctDirty=$('avgTicket').value!==acctBaseline;saveAcct();});
  $('legal').addEventListener('submit', function (e) {
    e.preventDefault(); var f = e.target;
    apiRequest('PUT', { legal: { legalName: f.elements['legalName'].value, ein: f.elements['ein'].value, businessType: f.elements['businessType'].value, street: f.elements['street'].value, city: f.elements['city'].value, state: f.elements['state'].value, zip: f.elements['zip'].value } })
      .then(function () { return action('provision'); }).then(function () { $('legalMsg').textContent = 'Saved. Filing now; check back in a day.'; setTimeout(load, 4000); }).catch(function (error) { $('legalMsg').textContent = error.message; });
  });

  ['input','change'].forEach(function(type){$('cfg').addEventListener(type,function(event){var field=event.target,value=field.type==='checkbox'?String(field.checked):field.value;if(event.type==='change'&&cfgEventValues.get(field)===value)return;cfgEventValues.set(field,value);if(field.getAttribute('aria-invalid')==='true'&&field.dataset.cfgInvalidValue===value)return;cfgClearError(field.name||'rules.hours');cfgChanged();});});
  window.addEventListener('beforeunload',function(event){if(cfgDirty||cfgBusy||acctDirty||acctBusy||websiteDirty||websiteBusy){event.preventDefault();event.returnValue='';}});

  $('deskSignOut').addEventListener('click', async function () {
    if(accountBusy){accountMessage('A service change is still being checked. You can sign out when that check finishes.');routeTo('account');$('accountServiceMessage').focus({preventScroll:true});return;}
    var button = $('deskSignOut'), interruptedExport = exportBusy; button.disabled = true;
    leaving = true; portalGeneration++; closeTour(false, false); if (chatController) chatController.abort(); availabilityReset();
    try {
      var response = await fetch(API_BASE + '/api/access', { method: 'POST', headers: ownerHeaders(), body: JSON.stringify({ action: 'sign_out' }) });
      if (!response.ok) throw new Error('Sign out could not be confirmed. Please retry.');
      websitePrivateClear();ownerSession = null; key = null; data = null; transcript = [];
      try { sessionStorage.removeItem('mc-owner-visit-pending-v1:'+slug); sessionStorage.removeItem('mc-onboarding-session-v1'); } catch (error) { /* Session is revoked on the server. */ }
      button.hidden = true; $('retryLoad').hidden = true;
      history.replaceState(null, '', location.pathname);
      recover('Signed out. Use an email sign-in link to open your workspace again.');
      $('portalContent').innerHTML = '';
    } catch (error) { if (!ownerSession && !key) return; leaving = false; cfgBusy = false; acctBusy = false; websiteBusy=false; reviewBusy=false;
      if(interruptedExport){exportBusy=false;['expBookings','expLeads','expConvs','expCustomers'].forEach(function(id){$(id).disabled=false;});$('accountDownloads').setAttribute('aria-busy','false');$('exportMessage').dataset.error='true';$('exportMessage').textContent='Sign out could not be confirmed. Your earlier download was interrupted; try the download again.';}
      cfgFence++; cfgChanged(); acctStatus(); await load(); toast(error.message); } finally { button.disabled = false; }
  });
  ['expBookings','expLeads','expConvs','expCustomers'].forEach(function (id) {
    $(id).addEventListener('click', async function (event) {
      event.preventDefault(); var kind = event.currentTarget.dataset.export, generation = portalGeneration; if (!kind || exportBusy || leaving) return;
      exportBusy = true; var controller = new AbortController(), timeout = setTimeout(function(){controller.abort();},20000);
      var buttons = ['expBookings','expLeads','expConvs','expCustomers']; buttons.forEach(function(button){$(button).disabled=true;});
      $('accountDownloads').setAttribute('aria-busy','true'); $('exportMessage').dataset.error='false'; $('exportMessage').textContent='Preparing your '+(kind==='leads'?'requests':kind)+' CSV…';
      try {
        var response = await fetch(API + '&export=' + encodeURIComponent(kind), { headers: ownerHeaders(), signal:controller.signal });
        if (generation !== portalGeneration || leaving) return;
        if (response.status === 401 || response.status === 403) { document.dispatchEvent(new CustomEvent('mc:session-expired')); return; }
        if (!response.ok) {
          var problem = await response.json().catch(function () { return {}; });
          if (generation !== portalGeneration || leaving) return;
          throw new Error(problem.message || 'This download is unavailable. Try again or contact support.');
        }
        if (!/^text\/csv(?:;|$)/i.test(response.headers.get('content-type') || '')) throw new Error('The server did not return a CSV file. No download was started. Try again or contact support.');
        var file = await response.blob(); if (generation !== portalGeneration || leaving) return;
        var address = URL.createObjectURL(file), link = document.createElement('a');
        link.href = address; link.download = slug + '-' + kind + '.csv'; document.body.appendChild(link); link.click(); link.remove(); setTimeout(function () { URL.revokeObjectURL(address); }, 1000);
        $('exportMessage').textContent='Your '+(kind==='leads'?'requests':kind)+' CSV download has started. Check your browser’s downloads.';
      } catch (error) { if (generation === portalGeneration && !leaving) { $('exportMessage').dataset.error='true'; $('exportMessage').textContent=(error.name==='AbortError'?'The download timed out. Try again when your connection returns.':error.message); } }
      finally { clearTimeout(timeout); if(generation===portalGeneration&&!leaving){exportBusy=false;buttons.forEach(function(button){$(button).disabled=false;});$('accountDownloads').setAttribute('aria-busy','false');} }
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
