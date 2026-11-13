(function () {
  var brandMark = typeof window.MCBrandMark === 'function' ? window.MCBrandMark : function () { return ''; };
  // Owner wording for saved request, visit and follow-up codes (PRA-DESK-03). An unknown code falls back to sentence case, so nothing is hidden.
  var OWNER_WORDS = { needs_action: 'Needs your reply', wants_call: 'Wants a callback', question_only: 'Asked a question', question: 'Asked a question', took_message: 'Message taken', status_check: 'Checking on a job', handoff: 'Asked for a person', lead: 'New request', quote: 'Wants a quote', emergency: 'Emergency', spam: 'Spam', open: 'Open', booked: 'Booked', confirmed: 'Confirmed', done: 'Done', completed: 'Completed', cancelled: 'Cancelled', paid: 'Paid', resolved: 'Resolved', not_proceeding: 'Not going ahead', no_followup_needed: 'No follow-up needed', call: 'Call', text: 'Text', email: 'Email', other: 'Other', web: 'Website chat', sms: 'Text', voice: 'Phone call', no_answer: 'No answer', left_message: 'Left a message', sent_message: 'Sent a message' };
  function ownerWord(value) { var text = String(value == null ? '' : value).trim(); if (!text) return ''; return Object.prototype.hasOwnProperty.call(OWNER_WORDS, text) ? OWNER_WORDS[text] : (text.charAt(0).toUpperCase() + text.slice(1)).replace(/_/g, ' '); }
  // US numbers read as (713) 555-0142 wherever the owner sees them; the saved value and tel: links stay E.164 (PRA-DESK-16).
  function ownerPhone(value) { var m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(String(value == null ? '' : value)); return m ? '(' + m[1] + ') ' + m[2] + '-' + m[3] : String(value == null ? '' : value); }
  window.MCOwnerWords = Object.freeze({ word: ownerWord, phone: ownerPhone });
  var q = new URLSearchParams(location.search), slug = q.get('c'), key = q.get('k');
  // The emailed owner link carries the workspace owner key as ?k=. Keep it for this tab only (memory, plus
  // sessionStorage so a reload works) and take it out of the address bar, so it is not kept in history or copied links.
  var ownerKeyStorage = 'mc-owner-key-v1:' + slug, ownerKeyRecovery = null;
  // Email sign-in opens only self-service workspaces; an owner-key owner returns through the link in their welcome email.
  var OWNER_KEY_INVALID = 'This workspace link is no longer valid. If our team set up your workspace, open the link from your welcome email, or contact support.';
  if (q.has('k')) { q.delete('k'); try { history.replaceState(history.state, '', location.pathname + (String(q) ? '?' + q : '') + location.hash); } catch (error) { /* The key still works on this page. */ } }
  try { if (slug && key) sessionStorage.setItem(ownerKeyStorage, key); else if (slug) key = sessionStorage.getItem(ownerKeyStorage); } catch (error) { /* Without storage, a reload needs the emailed link. */ }
  var ownerSession = null; try { ownerSession = sessionStorage.getItem('mc-onboarding-session-v1'); } catch (error) { /* Email sign-in is available when storage is disabled. */ }
  // A signed-out owner keeps their place: the next successful sign-in to this workspace within 30 minutes returns there.
  var RETURN_ROUTE_KEY = 'mc-return-route-v1', RETURN_ROUTE_MS = 30 * 60 * 1000;
  function returnRouteValid(hash) { return typeof hash === 'string' && /^#(?:today|leads|convs|customers|availability|know|test|setup|account|setup\/(?:web|voice|sms|calendar|thumbtack|angi)(?:\/[a-z0-9_-]{1,40})?)$/.test(hash); }
  function rememberReturnRoute(hash) { if (!slug || !returnRouteValid(hash)) return; try { localStorage.setItem(RETURN_ROUTE_KEY, JSON.stringify({ slug: slug, hash: hash, at: Date.now() })); } catch (error) { /* Without storage the owner lands on Home. */ } }
  function takeReturnRoute() {
    var saved = null; try { saved = JSON.parse(localStorage.getItem(RETURN_ROUTE_KEY) || 'null'); } catch (error) { saved = null; }
    if (!saved || typeof saved !== 'object' || saved.slug !== slug) return null;
    try { localStorage.removeItem(RETURN_ROUTE_KEY); } catch (error) { /* The route is used once at most. */ }
    var age = Date.now() - saved.at;
    return typeof saved.at === 'number' && age >= 0 && age <= RETURN_ROUTE_MS && returnRouteValid(saved.hash) ? saved.hash : null;
  }
  if (!slug || (!key && !ownerSession)) { rememberReturnRoute(location.hash); document.body.dataset.workspaceState = 'recovery'; document.getElementById('title').textContent = 'Your workspace'; document.getElementById('status').textContent = 'Sign in to continue'; document.getElementById('portalRecovery').hidden = false; document.getElementById('retryLoad').hidden = true; return; }
  var API_BASE = (function () { var m = document.querySelector('meta[name="mc-api-base"]'); return (m && m.content) ? m.content.replace(/\/$/, '') : ''; })();
  var API = API_BASE + '/api/client?c=' + encodeURIComponent(slug) + (key ? '&k=' + encodeURIComponent(key) : '');
  var portalGeneration = 0, loadSequence = 0, loadPending = null, reviewBusy = false, leaving = false, chatController = null, cfgRevision = null, cfgEditRevision = null, cfgDirty = false, data = null, contact = 't' + Math.random().toString(36).slice(2, 10), transcript = [];
  var preferenceBaseline=[],preferenceDirty=false,preferenceBusy=false,homeActivityChosen=false;
  var $ = function (id) { return document.getElementById(id); };
  function ownerHeaders() { var headers = { 'Content-Type': 'application/json' }; if (ownerSession) headers.Authorization = 'Bearer ' + ownerSession; return headers; }
  function toast(t) { var el = $('toast'); el.textContent = t; el.style.display = 'block'; setTimeout(function () { el.style.display = 'none'; }, 2500); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function recover(message, signedOut) {
    closeTour(false, false);
    if (leaving) supportReset(); else if ($('supportDialog')?.open) $('supportDialog').close();
    if ($('phoneCancelDialog').open) $('phoneCancelDialog').close(); phoneCancelSnapshot = null; if ($('phoneAuthority')) $('phoneAuthority').checked = false; if ($('phoneCosts')) $('phoneCosts').checked = false;
    if ($('cancelBox').open) $('cancelBox').close();
    if ($('visitDialog').open) $('visitDialog').close(); visitPending = null; visitSelected = null;
    $('portalContent').hidden = true; $('portalRecovery').hidden = false; document.body.dataset.workspaceState = 'recovery'; $('deskRail').hidden = true; $('railBusiness').textContent = 'Your front desk';
    $('title').textContent = 'Your workspace'; $('status').textContent = signedOut ? 'Signed out' : 'Unable to open workspace';
    $('recoveryMessage').textContent = message; if ($('liveBtns')) $('liveBtns').innerHTML = '';
    if (ownerKeyRecovery) { $('recoveryMessage').textContent = ownerKeyRecovery; ownerKeyRecovery = null; }
  }
  document.addEventListener('mc:session-expired',function (event) {
    ownerKeyRecovery = key && !ownerSession ? OWNER_KEY_INVALID : null; // an owner key is fixed, so a refusal means it is wrong or was replaced
    if (leaving && !ownerSession && !key) return;
    var keptDraft = cfgKeepExpired();
    var reason = event && event.detail && event.detail.reason, signedOutElsewhere = reason === 'signed_out';
    rememberReturnRoute(location.hash);
    leaving = true; portalGeneration++; ownerSession = null; key = null; data = null; transcript = []; cancelPracticeReply(); availabilityReset();
    websitePrivateClear();
    preferenceBaseline=[];preferenceDirty=false;preferenceBusy=false;homeActivityChosen=false;
    cfgBaseline = null; cfgRevision = null; cfgEditRevision = null; cfgConflict = null; cfgDirty = false; cfgBusy = false; reviewBusy = false; cfgClosed = true;
    acctBaseline = null; acctBaseClient = null; acctRevision = null; acctEditRevision = null; acctConflict = null; acctDirty = false; acctBusy = false;
    try { sessionStorage.removeItem('mc-owner-visit-pending-v1:'+slug); sessionStorage.removeItem('mc-onboarding-session-v1'); sessionStorage.removeItem('mc-calendar-pending-v1'); sessionStorage.removeItem(ownerKeyStorage); } catch (error) { /* Private content is still cleared. */ }
    closeTour(false, false);
    recover(signedOutElsewhere ? 'You signed out in another tab. Use an email sign-in link to open your workspace again.' : reason === 'replaced' ? 'This browser signed in to another account in another tab. Use an email sign-in link to open this workspace again.' : reason === 'renewed' ? 'This browser signed in again in another tab. Reload this page to continue.' : keptDraft ? 'Your session expired. Your unsaved business details are kept in this browser tab. Open your email sign-in link in this tab to restore them.' : 'Your session expired. Sign in by email to reopen your workspace.', true); $('portalContent').innerHTML = ''; $('deskSignOut').hidden = true; $('retryLoad').hidden = true;
    var focused = document.activeElement; if (!focused || focused === document.body || !focused.getClientRects().length) $('recoveryTitle').focus();
  });
  document.addEventListener('mc:desk-refresh',function(event){if(!leaving)load(null,{soft:event.detail?.soft===true,connectionProgress:event.detail?.reason==='connection-progress',connectionProgressRequest:event.detail?.requestId});});
  document.addEventListener('mc:desk-snapshot',function(event){
    var snapshot=event.detail?.snapshot,session=event.detail?.session,currentSession;
    try{currentSession=sessionStorage.getItem('mc-onboarding-session-v1');}catch(error){return;}
    if(leaving||!ownerSession||session!==ownerSession||currentSession!==ownerSession||snapshot?.client?.slug!==slug||!snapshot.client.owner||!/^[a-f0-9]{64}$/.test(snapshot.configurationRevision||'')||!/^[a-f0-9]{64}$/.test(snapshot.editRevision||''))return;
    // A newer profile save wins over an earlier connection readback.
    if(data&&(snapshot.configurationRevision!==data.configurationRevision||snapshot.editRevision!==data.editRevision)){load(null,{soft:true});return;}
    load(snapshot,{soft:true});
  });
  document.addEventListener('mc:desk-route',function(event){if(!leaving && pageCopy[event.detail?.tab])routeTo(event.detail.tab,event.detail.connectionHash);});
  async function apiRequest(method, body) {
    var requestGeneration = portalGeneration, requestSession = ownerSession, requestKey = key;
    var controller = new AbortController(), timeout = setTimeout(function () { controller.abort(); }, 20000);
    try {
      var response = await fetch(API, { method: method || 'GET', headers: ownerHeaders(), body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal });
      if(response.status===401||response.status===403){
        if(!leaving&&requestGeneration===portalGeneration&&requestSession===ownerSession&&requestKey===key)document.dispatchEvent(new CustomEvent('mc:session-expired'));
        var denied=new Error('Your session expired. Sign in by email to reopen your workspace.');denied.status=response.status;throw denied;
      }
      var result = await response.json();
      if (!response.ok || result.error || result.ok === false) {
        var message = result.message || (result.error === 'not_ready' ? 'Finish the setup checklist before activating website chat.' : result.error === 'configuration_changed' ? 'Your rules changed in another tab. Refresh and review the current version.' : response.status === 401 || response.status === 403 ? 'This private link is invalid or expired. Sign in by email to recover your workspace.' : 'We could not confirm that change. Please retry.');
        var error = new Error(message); error.status = response.status; error.code = result.error; error.field = result.field; error.fieldErrors = result.fieldErrors; error.setup = result.setup; throw error;
      }
      return result;
    } finally { clearTimeout(timeout); }
  }
  var visitPending = null, visitSelected = null, visitBusy = false, visitOpener = null, visitCalendarReturn = null, visitEditing = false, visitPrefill = null;
  var scheduleRows = [], scheduleRange = null, scheduleController = null, scheduleSequence = 0;
  function scheduleEmit(name, detail) { document.dispatchEvent(new CustomEvent(name, { detail: detail })); }
  function scheduleReset() { scheduleSequence++; if(scheduleController)scheduleController.abort(); scheduleController=null; scheduleRows=[];scheduleRange=null; }
  async function readSchedule(range) {
    if(leaving||!data||!ownerSession||!range||!/^\d{4}-\d{2}-\d{2}$/.test(range.from)||!/^\d{4}-\d{2}-\d{2}$/.test(range.to))return;
    if(scheduleController && scheduleRange?.from===range.from && scheduleRange?.to===range.to && !range.force)return;
    if(scheduleController)scheduleController.abort();
    var run=++scheduleSequence,generation=portalGeneration,session=ownerSession,controller=new AbortController();
    scheduleController=controller;scheduleRange={from:range.from,to:range.to};
    function current(){return !leaving&&run===scheduleSequence&&generation===portalGeneration&&session===ownerSession;}
    scheduleEmit('mc:schedule-status',{busy:true,from:range.from,to:range.to,message:'Loading saved visits and blocked time…'});
    var timeout=setTimeout(function(){controller.abort();},20000);
    try {
      var response=await fetch(API_BASE+'/api/client?'+new URLSearchParams({c:slug,schedule:'1',from:range.from,to:range.to}),{headers:ownerHeaders(),signal:controller.signal});
      if(!current())return;
      if(response.status===401||response.status===403){document.dispatchEvent(new CustomEvent('mc:session-expired'));return;}
      var result=await response.json();if(!current())return;
      if(!response.ok||!result.ok||result.schedule?.from!==range.from||result.schedule?.to!==range.to||result.schedule?.timezone!=='America/Chicago'||!Array.isArray(result.schedule.bookings)||!Array.isArray(result.schedule.undatedBookings)||!Array.isArray(result.schedule.availabilityBlocks))throw new Error(result.message||'Your schedule could not be refreshed. Try again before making changes.');
      scheduleRows=result.schedule.bookings.concat(result.schedule.undatedBookings);
      scheduleEmit('mc:schedule-data',result.schedule);
      scheduleEmit('mc:schedule-status',{busy:false,error:false,from:range.from,to:range.to,message:''});
    } catch(error) {if(current())scheduleEmit('mc:schedule-status',{busy:false,error:true,from:range.from,to:range.to,message:error.name==='AbortError'?'The schedule took too long to load. Your selected date is still here. Try again.':error.message});}
    finally {clearTimeout(timeout);if(current())scheduleController=null;}
  }
  document.addEventListener('mc:schedule-range',function(event){readSchedule(event.detail);});
  document.addEventListener('mc:schedule-open-visit',function(event){if(!leaving&&data)openVisit(event.detail?.id||null,event.detail?.date,event.detail?.prefill||null);});
  document.addEventListener('mc:schedule-block-time',function(event){
    if(leaving||!data||availabilityBusy)return;var detail=event.detail||{},date=$('availabilityDate');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(detail.date||''))return;
    date.value=detail.date;$('availabilityWindow').value=detail.window||'';
    if($('scheduleBlockManager'))$('scheduleBlockManager').open=true;
    date.focus();date.scrollIntoView({block:'center',behavior:'auto'});
  });
  document.addEventListener('mc:schedule-remove-block',function(event){if(!leaving&&data&&event.detail)availabilityChange('availability_unblock',event.detail.date,event.detail.window||'');});
  document.addEventListener('mc:session-expired',scheduleReset);
  function platformLeadLabel(lead) { return lead.platform && ({angi:'Angi',thumbtack:'Thumbtack'})[lead.platform.source] || ''; }
  function leadReference(lead) { return platformLeadLabel(lead) && lead.platform.externalLeadId ? platformLeadLabel(lead) + ' · ' + String(lead.platform.externalLeadId) : lead.id; }
  function humanHandoffStatus(lead) { var h=lead.humanHandoff;if(!h)return '';var text=({callback_only:'Callback requested; no live transfer',control_uncertain:'Live connection unconfirmed',control_accepted:'Transfer started; not confirmed connected',not_attempted:'Live transfer was not started',dial_uncertain:'Live connection unconfirmed',human_accepted:'Answered and pressed 1; not confirmed connected',connected:'Transferred: connected to the caller',not_connected:'Live transfer did not connect',unknown:'Live connection outcome unknown',limit_reached:'Live transfer stopped at usage limit'})[h.state]||'Live connection unconfirmed';return '<br><span class="muted" data-human-handoff>'+esc(text)+'. No callback time confirmed.'+(lead.alertAttentionDue?' Needs acknowledgment.':'')+'</span>'; }
  function customerVisitRequest(visit) { return !!(data && data.client && data.client.onboarding && data.client.onboarding.version === 1 && visit && visit.status === 'booked' && ['web','sms','call','voice'].indexOf(visit.channel) >= 0); }
  function visitStatusLabel(visit) { return customerVisitRequest(visit) ? 'Visit requested' : visit && ({done:'Job done',no_show:'No-show'})[visit.status] || visit && ownerWord(visit.status) || ''; }
  function visitRef(id) { id=String(id||''); return id.length>12?id.slice(0,8).toUpperCase():id; }
  // A plain receipt: what was saved and when, and Calendar delivery only when the owner chose Calendar (PRA-DESK-13).
  function visitReceipt(input,result) { var v=result.visit||{},calendar=(data&&data.client&&data.client.onboarding&&data.client.onboarding.desiredChannels||[]).indexOf('calendar')>=0||!!(data&&data.client&&data.client.calendar&&data.client.calendar.connected)||!!(data&&data.connections&&data.connections.calendar&&data.connections.calendar.connected),when=visitDateLabel(v.date)+(v.window?', '+v.window:''),head=({create_visit:'Visit added in your workspace for '+when+'.',reschedule_visit:'Visit rescheduled in your workspace to '+when+'.',cancel_visit:'Visit cancelled in your workspace.'})[input&&input.action]||result.message; var connected=!!(data&&(data.connections&&data.connections.calendar&&data.connections.calendar.connected||data.client&&data.client.calendar&&data.client.calendar.connected)); return head+(calendar?(result.calendar?' Calendar: '+result.calendar.detail:connected?' Calendar delivery is not confirmed.':' Google Calendar is not connected, so this change is only in your workspace.'):''); }
  // PRA-FC-06: say plainly whether the customer heard about the change. Only a live texting connection can notify them, and even then delivery is unconfirmed here.
  function visitCustomerNote(visit) { var p=String(visit&&visit.phone||''),ok=visitPhoneOk(p),texting=!!(data&&data.connections&&data.connections.messaging&&data.connections.messaging.active===true); return texting?' An appointment text goes only if the customer agreed to texts, and its delivery is not confirmed yet. To be sure they know, '+(ok?'call or text them at '+ownerPhone(p)+'.':'contact them directly.'):' The customer was not notified. '+(ok?'Call or text them at '+ownerPhone(p)+'.':p?'Check their saved phone number ('+p+') and contact them directly.':'No phone is saved for this customer.'); }
  function visitDetailsText(visit) { return 'Ref '+visitRef(visit.id)+' · '+visitStatusLabel(visit)+' · '+visitDateLabel(visit.date)+' · '+visit.window+'\n'+(visit.issue || '')+' · '+(visit.address || 'Address not saved')+(customerVisitRequest(visit)?'\nContact the customer to confirm the arrival window.':''); }
  // PRA-FC-01: whenever the visit asks the owner to contact the customer, the name and a tap-to-call/text number sit beside it.
  function visitPhoneOk(phone) { return /^\+\d{10,15}$/.test(String(phone||'')); }
  function visitContactHtml(visit) { var p=String(visit.phone||''); return '<span class="visit-contact" data-visit-contact>Customer: '+esc(visit.customer_name||'Name not given')+(visit.language==='es'?' ·':'')+languageBadge(visit)+(visitPhoneOk(p)?'<br><a href="tel:'+esc(p)+'" data-visit-call>Call '+esc(ownerPhone(p))+'</a> <a href="sms:'+esc(p)+'" data-visit-text>Text '+esc(ownerPhone(p))+'</a>':p?' · Phone saved: '+esc(p)+' (check this number)':' · No phone saved')+'</span>'; }
  function setVisitDetails(visit) { var lines=visitDetailsText(visit).split('\n'),ask=customerVisitRequest(visit),html=esc(lines[0])+'<br>'+esc(lines[1])+'<br>'+visitContactHtml(visit); if(ask)html+='<br>'+(visitPhoneOk(visit.phone)?'Contact the customer to confirm the arrival window.':visit.phone?'Check the phone number with Edit details so you can confirm the arrival window with the customer.':'Add a phone number with Edit details so you can confirm the arrival window with the customer.'); $('visitDetails').innerHTML=html; }
  var VISIT_EDIT_FIELDS=[['visitEditName','customer_name'],['visitEditPhone','phone'],['visitEditAddress','address'],['visitEditIssue','issue']];
  function visitFieldsDisabled(disabled) { ['visitName','visitPhone','visitAddress','visitIssue','visitDate','visitWindow','visitCancelConfirm','saveVisit','cancelVisit','visitCompleteRequest','visitEditName','visitEditPhone','visitEditAddress','visitEditIssue','saveVisitDetails','discardVisitDetails','editVisitDetails'].forEach(function(id){$(id).disabled=disabled;}); }
  function visitErrorsClear() { ['visitName','visitPhone','visitAddress','visitIssue','visitDate','visitWindow','visitEditName','visitEditPhone','visitEditAddress','visitEditIssue'].forEach(function(id){$(id).removeAttribute('aria-invalid');$(id+'Error').textContent='';}); }
  function visitFieldError(field,message) { var id=(visitEditing?{customer_name:'visitEditName',phone:'visitEditPhone',address:'visitEditAddress',issue:'visitEditIssue'}:{date:'visitDate',window:'visitWindow',customer_name:'visitName',phone:'visitPhone',address:'visitAddress',issue:'visitIssue'})[field] || (visitEditing?'visitEditName':'visitWindow'); $(id).setAttribute('aria-invalid','true'); $(id+'Error').textContent=message; $(id).focus(); }
  // A value copied from a request can exceed a visit field; maxlength does not apply to copied text.
  function visitTooLong(pairs){var long=pairs.filter(function(pair){var node=$(pair[0]);return node.maxLength>0&&node.value.trim().length>node.maxLength;});long.slice().reverse().forEach(function(pair){var node=$(pair[0]);visitFieldError(pair[1],'Shorten this to '+node.maxLength+' characters or fewer (now '+node.value.trim().length+').');});return long.length>0;}
  var visitStorageKey='mc-owner-visit-pending-v1:'+slug;
  var visitSessionTag=crypto.subtle.digest('SHA-256',new TextEncoder().encode(ownerSession || key || '')).then(function(bytes){return Array.from(new Uint8Array(bytes)).map(function(value){return value.toString(16).padStart(2,'0');}).join('');});
  async function storedVisitInput(){try{var row=JSON.parse(sessionStorage.getItem(visitStorageKey));return row && row.sessionTag===await visitSessionTag ? row.input:null;}catch(error){return null;}}
  async function storeVisitInput(input){var generation=portalGeneration;try{var sessionTag=await visitSessionTag;if(leaving || generation!==portalGeneration)return false;if(!input){sessionStorage.removeItem(visitStorageKey);return true;}sessionStorage.setItem(visitStorageKey,JSON.stringify({sessionTag:sessionTag,input:input}));return true;}catch(error){return false;}}
  async function openVisit(id, selectedDate, prefill) {
    if(visitBusy||!data||$('visitDialog').open)return;
    var row=scheduleRows.find(function(item){return item.id===id;})||(data.bookings || []).find(function(item){return item.id===id;});
    if(!id){var creation=(data.pendingVisitCreations || [])[0];row={ownerVisit:{id:null,canChange:true},pendingVisitChange:creation || null};}
    if(!row || !row.ownerVisit)return;
    var mutable=['testing','live','paused'].includes(data.client.status);
    if(!id&&!mutable&&!row.pendingVisitChange)return;
    var generation=portalGeneration, stored=await storedVisitInput(); if(leaving || generation!==portalGeneration)return;
    visitOpener=document.activeElement; visitSelected=Object.assign({},row.ownerVisit,{canChange:row.ownerVisit.canChange&&mutable}); visitPending=row.pendingVisitChange ? row.pendingVisitChange.input : stored && (stored.visitId===id || !id && stored.action==='create_visit') ? stored:null; visitBusy=false; $('closeVisit').disabled=false; visitErrorsClear();
    var creating=!id || !!(visitPending && visitPending.action==='create_visit');
    // A request prefill applies only to a fresh Add visit; a retained unconfirmed creation always wins.
    visitPrefill=creating && !visitPending && prefill && typeof prefill==='object' ? prefill : creating && visitPending && visitPending.requestId ? {requestId:visitPending.requestId,customer_name:visitPending.customer_name} : null;
    visitEditing=!creating && !!(visitPending && visitPending.action==='edit_visit');
    $('newVisitFields').hidden=!creating; $('saveVisit').textContent=creating?'Save visit':'Save new time'; $('cancelVisit').parentElement.hidden=creating;
    var values=creating && (visitPending || visitPrefill) || {}; [['visitName','customer_name'],['visitPhone','phone'],['visitAddress','address'],['visitIssue','issue']].forEach(function(pair){$(pair[0]).value=values[pair[1]] || '';});
    $('visitFromRequest').hidden=!visitPrefill; $('visitCompleteRequest').checked=!visitPending || visitPending.completeRequest!==false;
    var wanted=visitPrefill && visitPrefill.wanted ? String(visitPrefill.wanted) : ''; $('visitRequestWanted').hidden=!wanted; $('visitRequestWanted').textContent=wanted?'Customer asked for: '+wanted:''; if(visitPrefill && visitPrefill.language)$('visitRequestWanted').lang=visitPrefill.language; else $('visitRequestWanted').removeAttribute('lang');
    var editValues=visitEditing ? visitPending : visitSelected; VISIT_EDIT_FIELDS.forEach(function(pair){$(pair[0]).value=!creating && editValues[pair[1]] || '';});
    $('visitEditForm').hidden=!visitEditing; $('editVisitDetails').hidden=creating || visitEditing || !!visitPending || !visitSelected.canChange; $('editVisitDetails').setAttribute('aria-expanded',visitEditing?'true':'false');
    $('visitTitle').textContent=creating?'Add a customer visit':visitSelected.customer_name || 'Customer visit';
    if(creating)$('visitDetails').textContent='Save the agreed visit details. Availability is checked before the visit is created.';else setVisitDetails(Object.assign({},row,visitSelected));
    var pending=visitPending, date=pending && pending.date || visitSelected.date || (!id&&/^\d{4}-\d{2}-\d{2}$/.test(selectedDate||'')?selectedDate:''), windowValue=pending && pending.window || visitSelected.window || visitPrefill && visitPrefill.window;
    visitCalendarReturn=visitOpener?.closest('#scheduleCalendar')?{calendar:true,id:id||null,date:date||null}:null;
    $('visitDate').value=date || ''; var windows=(data.client.windows || []).slice(); if(windowValue && windows.indexOf(windowValue)<0)windows.push(windowValue);
    $('visitWindow').innerHTML=windows.map(function(window){return '<option value="'+esc(window)+'">'+esc(window)+'</option>';}).join(''); $('visitWindow').value=windowValue;
    $('visitCancelConfirm').checked=!!(pending && pending.action==='cancel_visit'); $('visitChangeForm').hidden=visitEditing || !visitSelected.canChange && !pending;
    visitFieldsDisabled(!!pending); $('retryVisit').hidden=!pending; $('visitMessage').textContent=pending?'A saved change still needs confirmation. Retry it using the same details.':visitSelected.canChange?(creating?"We’ll check availability when you save.":'Choose a listed arrival window. Full or blocked windows keep the original visit unchanged.'):'This visit is retained for your records.';
    renderPostVisit(creating?null:id);
    $('visitDialog').showModal();document.dispatchEvent(new CustomEvent('mc:visit-open',{detail:{visitId:creating?null:visitSelected.id,visitRevision:creating?null:visitSelected.revision,configurationRevision:data.configurationRevision,pending:!!pending || visitEditing,canChange:visitSelected.canChange,preferredWindow:visitPrefill && visitPrefill.window || null}})); $('closeVisit').focus();
  }
  // A save re-renders lists, so the opener may be replaced. Return to the same record's
  // current control, then to the page heading, instead of dropping focus to the document.
  // With inbox triage a request completed by this visit moves to Done: show the list that now holds it, then focus its row.
  function visitReturnTarget() { var o=visitOpener; if(o && !o.isConnected && o.dataset){ if(o.dataset.visit)o=document.querySelector('.visit-open[data-visit="'+CSS.escape(o.dataset.visit)+'"]'); else if(o.dataset.requestOpen){showRequestFor(o.dataset.requestOpen);o=document.querySelector('[data-request-open="'+CSS.escape(o.dataset.requestOpen)+'"]');} else if(o.dataset.customerVisit)o=document.querySelector('[data-customer-visit="'+CSS.escape(o.dataset.customerVisit)+'"]'); else o=null; } return o && o.isConnected && !o.disabled && o.getClientRects().length ? o : $('pageTitle'); }
  function closeVisit() { if(visitBusy)return; $('visitDialog').close(); var target=visitReturnTarget(); if(target)target.focus(); }
  function visitEditMode(on){ if(visitBusy)return; visitEditing=on; visitErrorsClear(); $('visitEditForm').hidden=!on; $('visitChangeForm').hidden=on || !visitSelected.canChange; $('editVisitDetails').hidden=on; $('editVisitDetails').setAttribute('aria-expanded',on?'true':'false');
    if(on){VISIT_EDIT_FIELDS.forEach(function(pair){$(pair[0]).value=visitSelected[pair[1]] || '';}); $('visitMessage').textContent=''; document.dispatchEvent(new CustomEvent('mc:visit-busy',{detail:{busy:false,pending:true}})); $('visitEditName').focus();}
    else {document.dispatchEvent(new CustomEvent('mc:visit-busy',{detail:{busy:false,pending:false}})); $('editVisitDetails').focus();} }
  $('editVisitDetails').addEventListener('click',function(){if(visitSelected && visitSelected.canChange && !visitPending)visitEditMode(true);});
  $('discardVisitDetails').addEventListener('click',function(){if(!visitPending)visitEditMode(false);});
  $('visitEditForm').addEventListener('submit',function(event){event.preventDefault();saveVisitChange('edit_visit');});
  $('closeVisit').addEventListener('click',closeVisit);
  $('visitDialog').addEventListener('close',function(){if(!leaving&&(!document.activeElement||document.activeElement===document.body)){var back=visitReturnTarget();if(back)back.focus();}var target=visitCalendarReturn;visitCalendarReturn=null;if(target&&!leaving)scheduleEmit('mc:schedule-visit-closed',target);});
  // Escape runs the same close path as the Close button, so focus returns to the (re-rendered) opener (PRA-A11Y-01).
  $('visitDialog').addEventListener('cancel',function(event){event.preventDefault();closeVisit();});
  function visitSubmissionId() { var bytes=new Uint8Array(16); crypto.getRandomValues(bytes); return Array.from(bytes).map(function(value){return value.toString(16).padStart(2,'0');}).join(''); }
  async function saveVisitChange(actionName) {
    if(visitBusy || !visitSelected || leaving)return;
    var generation=portalGeneration;
    if(!$('newVisitFields').hidden)actionName='create_visit';
    visitErrorsClear();
    if(!visitPending && actionName==='create_visit'){
      // Report every missing customer detail at once, before the time, so the owner can fix them in one pass.
      var missing=[['visitName','customer_name'],['visitPhone','phone'],['visitAddress','address'],['visitIssue','issue']].filter(function(field){return !$(field[0]).value.trim();});
      if(missing.length){missing.forEach(function(field){$(field[0]).setAttribute('aria-invalid','true');$(field[0]+'Error').textContent='Complete this customer detail.';});$('visitMessage').textContent=missing.length===1?'Complete the highlighted customer detail.':'Complete the '+missing.length+' highlighted customer details.';$(missing[0][0]).focus();return;}
    }
    if(!visitPending && actionName==='edit_visit'){
      var missing=VISIT_EDIT_FIELDS.filter(function(pair){return !$(pair[0]).value.trim();});
      // Mark every missing required detail, then focus the first one.
      if(missing.length){missing.slice().reverse().forEach(function(pair){visitFieldError(pair[1],'Complete this customer detail.');});return;}
      if(visitTooLong(VISIT_EDIT_FIELDS))return;
      var editInput={action:'edit_visit',expectedRevision:data.configurationRevision,submissionId:visitSubmissionId(),visitId:visitSelected.id,expectedVisitRevision:visitSelected.revision};
      VISIT_EDIT_FIELDS.forEach(function(pair){editInput[pair[1]]=$(pair[0]).value.trim();});
      if(VISIT_EDIT_FIELDS.every(function(pair){return pair[1]==='phone' ? String(visitSelected.phone||'').replace(/\D/g,'').slice(-10)===editInput.phone.replace(/\D/g,'').slice(-10) : String(visitSelected[pair[1]]||'')===editInput[pair[1]];})){$('visitMessage').textContent='Change at least one detail before saving, or choose Keep current details.';$('visitMessage').focus();return;}
      visitPending=editInput;
    }
    if(!visitPending){
      if(actionName==='create_visit' || actionName==='reschedule_visit') {
        if(!$('visitDate').value || !$('visitDate').checkValidity()){visitFieldError('date','Choose a real visit date.');return;}
        if(!$('visitWindow').value){visitFieldError('window','Choose an arrival window.');return;}
      } else if(!$('visitCancelConfirm').checked){$('visitMessage').textContent='Confirm that you want to cancel this visit first.'; $('visitCancelConfirm').focus();return;}
      visitPending={action:actionName,expectedRevision:data.configurationRevision,submissionId:visitSubmissionId()};
      if(actionName!=='create_visit'){visitPending.visitId=visitSelected.id;visitPending.expectedVisitRevision=visitSelected.revision;}
      else {if(visitTooLong([['visitName','customer_name'],['visitPhone','phone'],['visitAddress','address'],['visitIssue','issue']])){visitPending=null;return;}for(var field of [['visitName','customer_name'],['visitPhone','phone'],['visitAddress','address'],['visitIssue','issue']]){if(!$(field[0]).value.trim()){visitPending=null;visitFieldError(field[1],'Complete this customer detail.');return;}visitPending[field[1]]=$(field[0]).value.trim();}}
      if(actionName==='create_visit' || actionName==='reschedule_visit'){visitPending.date=$('visitDate').value;visitPending.window=$('visitWindow').value;}
      if(actionName==='create_visit' && visitPrefill && visitPrefill.requestId){visitPending.requestId=visitPrefill.requestId;visitPending.completeRequest=$('visitCompleteRequest').checked;}
    }
    visitBusy=true;document.dispatchEvent(new CustomEvent('mc:visit-busy',{detail:{busy:true,pending:!!visitPending}})); $('visitMessage').textContent='Confirming your saved change…'; if($('visitDialog').contains(document.activeElement))$('visitMessage').focus(); visitFieldsDisabled(true); $('retryVisit').hidden=true; $('closeVisit').disabled=true;
    try {
      var retained=await storeVisitInput(visitPending); if(leaving || generation!==portalGeneration)return;
      if(!retained)$('visitMessage').textContent='Keep this page open while the change is confirmed. Browser recovery storage is unavailable.';
      var result=await apiRequest('POST',visitPending); if(leaving || generation!==portalGeneration)return; visitSelected=result.visit;
      var source=scheduleRows.find(function(row){return row.id===result.visit.id;})||(data.bookings||[]).find(function(row){return row.id===result.visit.id;})||{};
      $('visitTitle').textContent=result.visit.customer_name||'Customer visit';
      setVisitDetails(Object.assign({},source,result.visit));
      $('visitMessage').textContent=visitReceipt(visitPending,result)+visitCustomerNote(result.visit)+visitDetailsNote(result)+visitRequestNote(result);
      if(result.complete){visitPending=null;await storeVisitInput(null);if(leaving || generation!==portalGeneration)return; $('visitChangeForm').hidden=true; $('visitEditForm').hidden=true; $('visitFromRequest').hidden=true; $('retryVisit').hidden=true; visitEditing=false; visitPrefill=null;}else{$('retryVisit').hidden=false; $('visitMessage').textContent+=' Retry the saved change to finish preparing its delivery.';}
      $('visitMessage').focus(); await load();
    } catch(error) {
      if(leaving || generation!==portalGeneration)return;
      $('visitMessage').textContent=error.message;
      if(error.status && error.status<500){visitPending=null;await storeVisitInput(null);if(leaving || generation!==portalGeneration)return;visitFieldsDisabled(false);if(visitEditing){$('editVisitDetails').disabled=false;if(error.code==='visit_changed')load();}if(error.field==='window'||error.field==='date'||['configuration_changed','visit_changed','visit_not_found'].includes(error.code))document.dispatchEvent(new CustomEvent('mc:visit-availability-invalid',{detail:{reason:error.code}}));if(error.field)visitFieldError(error.field,error.message);else $('visitMessage').focus();}
      else {$('retryVisit').hidden=false; $('visitMessage').textContent+=' Your change may not have saved. Select Retry saved change; it will only be applied once.';}
    } finally {if(!leaving && generation===portalGeneration){visitBusy=false;document.dispatchEvent(new CustomEvent('mc:visit-busy',{detail:{busy:false,pending:!!visitPending}})); $('closeVisit').disabled=false;}}
  }
  function visitDetailsNote(result){var d=result.details;if(!d||!d.phoneChanged)return '';return ({agreed:' The new callback number has its own permission for appointment texts, so reminders go there.',stopped:' The new callback number opted out of texts, so no appointment texts will go to it.',not_recorded:' The new callback number has not agreed to appointment texts, so no reminders will be texted to it. Permission from the previous number was not carried over.'})[d.textPermission]||'';}
  function visitRequestNote(result){var r=result.request;if(!r)return '';if(r.completed)return ' Linked to the request, and its follow-up is marked complete.';return ' Linked to the request.'+(({already_completed:' Its follow-up was already complete.',review_required:' The request changed since your last review, so its follow-up was left open. Review it in Inbox.',request_changed:' Another action was saved on the request, so its follow-up was left open. Review it in Inbox.',not_requested:' Its follow-up is still open.'})[r.reason]||' Its follow-up could not be confirmed as complete. Check the request in Inbox.');}
  $('newVisit').addEventListener('click',function(){openVisit(null);});
  $('visitChangeForm').addEventListener('submit',function(event){event.preventDefault();saveVisitChange('reschedule_visit');});
  $('cancelVisit').addEventListener('click',function(){saveVisitChange('cancel_visit');});
  $('retryVisit').addEventListener('click',function(){if(visitPending)saveVisitChange(visitPending.action);});
  // ---- After the visit (PRA-HOMEOWNER-08): done/no-show, payment reminders, follow-up settings ----
  var postVisitBusy=false,postVisitPending=null,postVisitId=null;
  var POST_STATES={queued:'Scheduled',waiting_consent:'Waiting for the customer’s permission',waiting_hours:'Waiting for sending hours',waiting_platform:'Waiting for a texting registration that includes it',sending:'Sending',accepted:'Sent to the carrier',delivered:'Delivered',superseded:'Stopped',suppressed:'Stopped',expired:'Expired unsent',failed:'Not delivered',uncertain:'Outcome unconfirmed',not_queued:'Not scheduled'};
  function postState(job){return job?POST_STATES[job.state]||job.state:'Not scheduled';}
  function renderPostVisit(id){
    postVisitId=id;var row=id&&(data.bookings||[]).find(function(item){return item.id===id;}),pv=row&&row.postVisit,mutable=['testing','live','paused'].includes(data.client.status);
    $('visitPost').hidden=!pv;if(!pv)return;
    var lines=[];
    if(pv.outcome==='done')lines.push('Job marked done'+(pv.at?' on '+recordTimeLabel(pv.at):'')+'. Visit reminders are stopped.');
    else if(pv.outcome==='no_show')lines.push('Marked as no-show. Visit reminders are stopped and no follow-up is sent.');
    else lines.push(pv.canComplete?'When the job is finished, mark it done. Reminders still scheduled for this visit stop.':'You can mark this visit done on its service day.');
    if(pv.review)lines.push('Review request: '+postState(pv.review)+'.');
    if(pv.payment)lines.push('Payment reminders for '+pv.payment.amount+': '+(pv.payment.paidAt?'stopped, marked paid':pv.payment.reminders.map(function(job){return (job&&job.dueAt?visitDateLabel(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago'}).format(new Date(job.dueAt)))+' ':'')+postState(job).toLowerCase();}).join(' · '))+'.');
    $('visitPostStatus').textContent=lines.join(' ');
    $('visitPostClose').hidden=!pv.canComplete||!mutable;
    $('visitPayForm').hidden=!(pv.outcome==='done'&&(pv.canInvoice||pv.payment)&&mutable);
    $('visitPaySend').hidden=!pv.canInvoice;$('visitPaySend').textContent=pv.payment&&!pv.payment.paidAt?'Replace amount':'Start payment reminders';$('visitPayAmount').parentElement.hidden=!pv.canInvoice;
    $('visitMarkPaid').hidden=!(pv.payment&&!pv.payment.paidAt);$('visitReopen').hidden=!(pv.canReopen&&mutable);
    $('visitPostRetry').hidden=!postVisitPending;
    ['visitMarkDone','visitNoShow','visitPaySend','visitMarkPaid','visitPayAmount','visitReopen'].forEach(function(name){$(name).disabled=postVisitBusy;});
  }
  async function postVisitAction(type,extra){
    if(postVisitBusy||leaving||!data)return;
    var generation=portalGeneration,row=(data.bookings||[]).find(function(item){return item.id===postVisitId;});
    if(postVisitPending&&postVisitPending.type!==type)postVisitPending=null;
    if(!postVisitPending){
      if(type!=='settings'&&(!row||!row.ownerVisit))return;
      postVisitPending=Object.assign({action:'post_visit',type:type,expectedRevision:data.configurationRevision,operationId:visitSubmissionId()},type==='settings'?{}:{visitId:row.id,expectedVisitRevision:row.ownerVisit.revision},extra||{});
    }
    var target=type==='settings'?$('pvMessage'):$('visitMessage');postVisitBusy=true;if(type!=='settings')renderPostVisit(postVisitId);target.textContent='Saving…';
    try{
      var result=await apiRequest('POST',postVisitPending);if(leaving||generation!==portalGeneration)return;
      postVisitPending=null;target.textContent=result.message;
      await load();if(leaving||generation!==portalGeneration)return;
      if(type!=='settings'&&$('visitDialog').open){var fresh=(data.bookings||[]).find(function(item){return item.id===postVisitId;});if(fresh){visitSelected=Object.assign({},fresh.ownerVisit);setVisitDetails(Object.assign({},fresh,fresh.ownerVisit));$('visitChangeForm').hidden=!fresh.ownerVisit.canChange;}}
      target.focus();
    }catch(error){
      if(leaving||generation!==portalGeneration)return;
      target.textContent=error.message;
      if(error.status&&error.status<500){postVisitPending=null;if(error.field==='amount'){$('visitPayAmount').setAttribute('aria-invalid','true');$('visitPayAmountError').textContent=error.message;$('visitPayAmount').focus();}else target.focus();}
      else target.textContent+=' Retry the saved action; it will not be applied twice.';
    }finally{if(!leaving&&generation===portalGeneration){postVisitBusy=false;if(type==='settings')$('pvSave').disabled=false;else renderPostVisit(postVisitId);}}
  }
  $('visitMarkDone').addEventListener('click',function(){postVisitAction('mark_done');});
  $('visitNoShow').addEventListener('click',function(){postVisitAction('no_show');});
  $('visitMarkPaid').addEventListener('click',function(){postVisitAction('mark_paid');});
  $('visitReopen').addEventListener('click',function(){postVisitAction('reopen');});
  $('visitPostRetry').addEventListener('click',function(){if(postVisitPending)postVisitAction(postVisitPending.type);});
  $('visitPayForm').addEventListener('submit',function(event){event.preventDefault();$('visitPayAmount').removeAttribute('aria-invalid');$('visitPayAmountError').textContent='';var amount=$('visitPayAmount').value.trim();if(!amount){$('visitPayAmount').setAttribute('aria-invalid','true');$('visitPayAmountError').textContent='Enter the amount still owed.';$('visitPayAmount').focus();return;}postVisitAction('payment_reminder',{amount:amount});});
  $('visitDialog').addEventListener('close',function(){postVisitPending=null;postVisitId=null;});
  function renderPostVisitSettings(d){
    var settings=d.postVisitSettings,box=$('postVisitSettings');box.hidden=!settings;if(!settings)return;
    if(!$('postVisitForm').dataset.dirty){$('pvVisitCheck').checked=settings.visitCheck;$('pvReview').checked=settings.reviewRequest;$('pvPayment').checked=settings.paymentReminders;}
    $('pvReview').closest('label').hidden=!settings.reviewAvailable;$('pvSampleReview').hidden=!settings.reviewAvailable;if(!settings.reviewAvailable)$('pvReview').checked=false;
    var name=d.client.business.name||'Your business';
    $('pvSampleReview').textContent='Review request: “Thanks for choosing '+name+', Rosa. How did we do? A quick Google review helps a small shop a lot: (your review link). Reply here if anything was not right. Reply STOP to end texts.”';
    $('pvSamplePayment').textContent='Payment reminder: “'+name+': friendly reminder that the invoice for $180 is open. Reply here with any questions. Reply STOP to end texts.”';
    var customer=$('pvReview').checked||$('pvPayment').checked;$('pvProgram').hidden=!customer;
    var notes=[];if($('pvReview').checked&&!settings.reviewLink)notes.push('Add your Google review link under Your business before review requests can go out.');
    if(customer&&settings.program&&!settings.program.registered)notes.push(settings.program.reason==='post_visit_program_not_selected'?'Your current texting registration does not include review requests or payment reminders, so none will be scheduled or sent. Updating the registration is a separate step. Your appointment texts are unchanged.':'Review requests and payment reminders wait for your texting registration, which will include them. Your appointment texts are unchanged.');
    $('pvProgramState').hidden=!notes.length;$('pvProgramState').textContent=notes.join(' ');
    $('pvSave').disabled=postVisitBusy||!['testing','live','paused'].includes(d.client.status);
  }
  ['pvVisitCheck','pvReview','pvPayment'].forEach(function(name){$(name).addEventListener('change',function(){$('postVisitForm').dataset.dirty='1';if(data)renderPostVisitSettings(data);});});
  $('postVisitForm').addEventListener('submit',function(event){event.preventDefault();var customer=$('pvReview').checked||$('pvPayment').checked;if(customer&&!$('pvAcknowledge').checked){$('pvMessage').textContent='Review what customers will receive, then confirm.';$('pvAcknowledge').focus();return;}$('pvSave').disabled=true;delete $('postVisitForm').dataset.dirty;postVisitAction('settings',{visitCheck:$('pvVisitCheck').checked,reviewRequest:$('pvReview').checked,paymentReminders:$('pvPayment').checked,acknowledgeProgram:customer&&$('pvAcknowledge').checked});});
  $('retryLoad').addEventListener('click', function () { load().then(greet); });
  function availabilityDateLabel(date) { return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(date + 'T12:00:00Z')); }
  function renderAvailability(blocks) {
    $('availabilityBlocks').innerHTML = blocks.length ? blocks.map(function (b) {
      var label = availabilityDateLabel(b.date) + ' · ' + (b.window || 'Whole day') + (b.label ? ' · ' + b.label : '');
      return '<div class="availability-row"><div><b>' + esc(label) + '</b>' + (b.existingBookings ? '<div>' + esc(b.existingBookings) + ' visit' + (b.existingBookings === 1 ? ' is' : 's are') + ' already reserved and unchanged.</div>' : '') + '</div><button type="button" class="btn-pill btn-pill-dark btn-sm availability-remove" data-date="' + esc(b.date) + '" data-window="' + esc(b.window) + '" aria-label="Remove block for ' + esc(label) + '">Remove block</button></div>';
    }).join('') : emptyState('No unavailable time added', 'Add work booked elsewhere or time off above. These blocks limit new visit requests; they do not change existing visits.');
  }
  var availabilityBusy = false, availabilityController = null;
  function availabilityControls(disabled) {
    if ($('availabilityForm')) $('availabilityForm').setAttribute('aria-busy', String(disabled));
    document.querySelectorAll('#availabilityForm button, #availabilityBlocks button').forEach(function (button) { button.disabled = disabled; });
    scheduleEmit('mc:schedule-availability',{busy:disabled});
  }
  function availabilityReset() {
    if (availabilityController) availabilityController.abort();
    availabilityController = null; availabilityBusy = false; availabilityControls(false); pendingAvailability = null; if ($('availabilityReload')) $('availabilityReload').hidden = true;
  }
  // PRA-FC2-11: whole days from date through an optional end date, as the server expands them.
  function availabilityDays(date, through) { var days = [date]; if (!through || through <= date) return days; var d = new Date(date + 'T12:00:00Z'); while (days.length < 32) { d.setUTCDate(d.getUTCDate() + 1); var next = d.toISOString().slice(0, 10); days.push(next); if (next >= through) break; } return days; }
  function availabilitySpan(date, through, label) { return availabilityDateLabel(date) + (through && through > date ? ' – ' + availabilityDateLabel(through) : '') + (label ? ' · ' + label : ''); }
  async function availabilityChange(actionName, date, window, extra) {
    extra = extra || {}; var through = extra.through && extra.through !== date ? extra.through : '', blockLabel = (extra.label || '').trim();
    if (availabilityBusy || leaving || !data) return;
    var generation = portalGeneration, session = ownerSession, ownerKey = key, controller = new AbortController(), focusAtStart=document.activeElement;
    var returnAfterSave=!!$('scheduleBlockManager')?.open&&$('availabilityForm').contains(focusAtStart);
    function current() { return !leaving && generation === portalGeneration && session === ownerSession && ownerKey === key && availabilityController === controller; }
    availabilityBusy = true; availabilityController = controller; availabilityControls(true);
    $('availabilityBackToCalendar').hidden=true; $('availabilityReload').hidden=true; pendingAvailability=null;
    $('availabilityMessage').textContent = 'Saving…';
    var timeout = setTimeout(function () { controller.abort(); }, 20000);
    try {
      var response = await fetch(API, { method: 'POST', headers: ownerHeaders(), body: JSON.stringify(Object.assign({ action: actionName, date: date, window: window }, through ? { through: through } : {}, blockLabel ? { label: blockLabel } : {})), signal: controller.signal });
      if (!current()) return;
      if (response.status === 401 || response.status === 403) { document.dispatchEvent(new CustomEvent('mc:session-expired')); return; }
      var result = await response.json(); if (!current()) return;
      if (!response.ok || !result.ok) {
        if (response.status >= 500) throw Object.assign(new Error('Availability outcome unknown'), { availabilityUncertain: true });
        var messages = { invalid_date: 'Choose a valid date in Houston time.', invalid_window: 'Choose one of your saved arrival windows.', invalid_range: result.message || 'Check the dates: a range blocks whole days, up to 31 at once.', invalid_label: result.message || 'Use a shorter label.', too_many_blocks: 'Remove an old block before adding another.', availability_unavailable: 'Availability could not be saved. Reload availability before trying again.' };
        throw Object.assign(new Error('Availability request failed'), { availabilityMessage: messages[result.error] || result.message || 'Could not save availability. Reload availability before trying again.' });
      }
      if (!Array.isArray(result.availabilityBlocks)) throw Object.assign(new Error('Availability response incomplete'), { availabilityUncertain: true });
      renderAvailability(result.availabilityBlocks);
      data.availabilityBlocks=result.availabilityBlocks;
      scheduleEmit('mc:schedule-availability',{blocks:result.availabilityBlocks,busy:true});
      // Fence an older range response so it cannot erase this confirmed change.
      if(scheduleRange)readSchedule({from:scheduleRange.from,to:scheduleRange.to,force:true});
      $('availabilityMessage').textContent = (actionName === 'availability_block' ? 'Time blocked.' : 'Block removed.') + ' ' + availabilitySpan(date, through, '') + ' · ' + (window || 'Whole day') + (blockLabel ? ' · ' + blockLabel : '') + (result.existingBookings ? '. ' + result.existingBookings + ' existing visit' + (result.existingBookings === 1 ? ' remains' : 's remain') + ' booked.' : '');
      $('availabilityBackToCalendar').dataset.date=date;$('availabilityBackToCalendar').hidden=false;
      if(returnAfterSave&&$('availabilityDate').value===date&&$('availabilityWindow').value===(window||'')&&(document.activeElement===focusAtStart||document.activeElement===document.body)){$('availabilityBackToCalendar').focus({preventScroll:true});$('availabilityBackToCalendar').scrollIntoView({block:'center',behavior:'auto'});}
    } catch (error) {
      if (!current()) return;
      if (error.availabilityMessage) { $('availabilityMessage').textContent = error.availabilityMessage + ' Your selected date and window are still here.'; scheduleEmit('mc:schedule-availability',{busy:true,error:true,message:$('availabilityMessage').textContent}); }
      // A lost, timed-out or failed response may still have saved. Read the saved blocks (read only) before saying anything.
      else { pendingAvailability = { action: actionName, date: date, window: window || '', through: through, label: blockLabel }; await availabilityReconcile(controller); }
    } finally {
      clearTimeout(timeout);
      if (current()) { availabilityController = null; availabilityBusy = false; availabilityControls(false); }
    }
  }
  var pendingAvailability = null;
  function availabilityHas(blocks, date, window) { return blocks.some(function (b) { return b.date === date && (b.window || '') === window; }); }
  async function availabilityReconcile(ownController) {
    var change = pendingAvailability; if (!change || leaving || !data) return;
    var generation = portalGeneration, session = ownerSession, controller = ownController || new AbortController();
    function current() { return change === pendingAvailability && !leaving && generation === portalGeneration && session === ownerSession && (!ownController || availabilityController === ownController); }
    if (!ownController) { availabilityBusy = true; availabilityController = controller; availabilityControls(true); }
    $('availabilityReload').hidden = true; $('availabilityMessage').textContent = 'Checking your saved blocked time…';
    try {
      var latest = await apiRequest(); if (!current()) return;
      if (!Array.isArray(latest.availabilityBlocks)) throw new Error('incomplete');
      var blocks = latest.availabilityBlocks, label = availabilitySpan(change.date, change.through, '') + ' · ' + (change.window || 'Whole day') + (change.label ? ' · ' + change.label : ''), present = availabilityDays(change.date, change.through).every(function (day) { return availabilityHas(blocks, day, change.window); });
      renderAvailability(blocks); data.availabilityBlocks = blocks; scheduleEmit('mc:schedule-availability', { blocks: blocks, busy: true });
      if (scheduleRange) readSchedule({ from: scheduleRange.from, to: scheduleRange.to, force: true });
      pendingAvailability = null;
      var confirmed = change.action === 'availability_block' ? present : !present;
      $('availabilityMessage').textContent = confirmed ? (change.action === 'availability_block' ? 'Time blocked. ' : 'Block removed. ') + label + '. Confirmed from your saved schedule.' : 'We couldn’t confirm this change yet. Your saved blocked time is shown below. Your selected date and window are still here; try again when ready. A block can’t be added twice.';
    } catch (error) {
      if (!current()) return;
      if (error.status === 401 || error.status === 403) return;
      $('availabilityMessage').textContent = 'We couldn’t confirm this change or read your saved blocked time. Your selected date and window are still here. Reload availability to check before trying again.';
      $('availabilityReload').hidden = false;
      scheduleEmit('mc:schedule-availability', { busy: true, error: true, message: $('availabilityMessage').textContent });
    } finally { if (!ownController && availabilityController === controller) { availabilityController = null; availabilityBusy = false; availabilityControls(false); } }
  }
  $('availabilityReload').addEventListener('click', function () { if (!availabilityBusy && pendingAvailability) availabilityReconcile(null); });
  $('availabilityForm').addEventListener('submit', function (e) { e.preventDefault(); var through = $('availabilityThrough') ? $('availabilityThrough').value : ''; if (through && $('availabilityWindow').value) { $('availabilityMessage').textContent = 'A date range blocks whole days. Choose Whole day, or clear the Through date.'; $('availabilityWindow').focus(); return; } if (through && through < $('availabilityDate').value) { $('availabilityMessage').textContent = 'Choose a Through date on or after the first date.'; $('availabilityThrough').focus(); return; } availabilityChange('availability_block', $('availabilityDate').value, $('availabilityWindow').value, { through: through, label: $('availabilityLabel') ? $('availabilityLabel').value : '' }); });
  // PRA-FC2-11: holiday notes in the hours text are not applied automatically; say so while the owner writes one.
  (function () { var hours = $('desk-setting-7'), hint = $('hoursHolidayHint'); if (!hours || !hint) return; var base = hint.textContent; function check() { var mentions = /\b(?:holidays?|thanksgiving|christmas|xmas|new year'?s?|easter|july 4|labor day|memorial day|vacation|feriados?|navidad|a\u00f1o nuevo|acci\u00f3n de gracias)\b|\bclosed (?:on |for )?(?:the )?(?:\d|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|\bcerrado (?:el|del) \d/i.test(hours.value); hint.textContent = mentions ? 'Your hours mention a holiday or closure. That note is not applied to your availability: add those dates in Schedule under Blocked time so customers are not offered them.' : base; hint.dataset.holidayMentioned = mentions ? 'true' : 'false'; hint.setAttribute('role', mentions ? 'status' : 'note'); } hours.addEventListener('input', check); document.addEventListener('mc:desk', function () { setTimeout(check, 0); }); })();
  $('availabilityBlocks').addEventListener('click', function (e) { var button = e.target.closest('button.availability-remove'); if (button) availabilityChange('availability_unblock', button.dataset.date, button.dataset.window); });
  $('availabilityBackToCalendar').addEventListener('click',function(){if($('scheduleBlockManager'))$('scheduleBlockManager').open=false;scheduleEmit('mc:schedule-return',{date:this.dataset.date});});

  var pageCopy = {
    today: ['YOUR WORKSPACE', 'Your day, at a glance', 'Your customer requests, visits and the work that needs your attention.'],
    leads: ['INBOX', 'Inbox', 'The job, the conversation and what happens next.'],
    convs: ['DAILY WORK', 'Conversations', 'See what customers asked and how your front desk responded.'],
    customers: ['INBOX', 'Customers', 'Find a customer by name or phone and see their requests, visits and conversations.'],
    availability: ['YOUR SCHEDULE', 'Schedule', 'Your visits and blocked time, together. Select a day to plan your work.'],
    know: ['YOUR FRONT DESK', 'Business details', 'Your services, hours and the answers your front desk uses.'],
    test: ['YOUR FRONT DESK', 'Test answers', 'Try a private customer conversation before customers do.'],
    setup: ['YOUR FRONT DESK', 'Connections', 'Connect and manage the services for your front desk.'],
    account: ['YOUR WORKSPACE', 'Account', 'Manage your contact details, front desk status and saved records.']
  };
  function showTab(t) {
    if (!pageCopy[t] || !document.getElementById('p-' + t)) return;
    var parent = ['leads','convs','customers'].includes(t) ? 'leads' : ['setup','know','test'].includes(t) ? 'setup' : t;
    document.querySelectorAll('.tabs button').forEach(function (x) { var current=x.dataset.t===parent; x.classList.toggle('on', current); x.setAttribute('aria-current', current ? 'page' : 'false'); });
    document.querySelectorAll('[data-workspace-route]').forEach(function (x) { var current=x.dataset.workspaceRoute===t; x.classList.toggle('on',current); x.setAttribute('aria-current',current?'page':'false'); });
    if($('inboxNav'))$('inboxNav').hidden=parent!=='leads'; if($('frontDeskNav'))$('frontDeskNav').hidden=parent!=='setup';
    document.querySelectorAll('.pane').forEach(function (p) { p.classList.toggle('on', p.id === 'p-' + t); });
    document.body.dataset.activePage = t;
    scheduleEmit('mc:schedule-visible',{active:t==='availability'});
    $('pageTitle').textContent = pageCopy[t][1]; $('pageDescription').textContent = pageCopy[t][2];
    document.title = (t === 'today' ? 'Home' : pageCopy[t][1]) + ' | Your front desk | Machines & Cloud'; if(data){renderHomeNext(data);if(t==='account')renderAccount(data);}else syncNextActionVisibility();
  }
  $('homeActivityDetails').querySelector('summary').addEventListener('click',function(){homeActivityChosen=true;});
  function syncNextActionVisibility() { var guide = $('workspaceGuide'); guide.hidden = guide.dataset.needed !== 'true' || document.body.dataset.activePage !== 'today'; }
  if (location.hash && document.getElementById('p-' + location.hash.slice(1).split('/')[0])) showTab(location.hash.slice(1).split('/')[0]);
  else showTab('today');
  document.querySelectorAll('.tabs button').forEach(function (b) { b.addEventListener('click', function () { routeTo(b.dataset.t); }); });
  document.querySelectorAll('[data-workspace-route]').forEach(function (b) { b.addEventListener('click', function () { routeTo(b.dataset.workspaceRoute); }); });
  // Workspace history: an owner's page change adds an entry, so Back and Forward move between workspace pages and Back
  // from the first workspace page still leaves normally. Back/Forward, refreshes, restores and the tour route without adding one.
  // Pages set their own scroll; automatic restoration also blurs focus when the desk steps back to a #page entry.
  try { history.scrollRestoration = 'manual'; } catch (error) { /* Older browsers restore scroll themselves. */ }
  var deskRoutedHref = location.href, deskStepBackFocus = null, tourHistoryBack = false, requestHistory = null, requestHistoryBack = false, requestReopening = false, requestLastId = null;
  function deskOtherDialogOpen() { return !!document.querySelector('dialog[open]:not(#requestDialog):not(#guideDialog)'); }
  // One modal policy for popstate and hashchange. The desk's own modals (a visit, a support report, a saved conversation and
  // the account confirmations) hold Back and Forward: the dialog stays open with its typed details, the page underneath is not
  // routed, and the browser is traversed back to the entry the dialog was opened on, with its address and state intact.
  // The hold traverses to that entry by its Navigation API key (navigation.traverseTo), so it adds no history without a user
  // gesture, keeps Forward, and does not depend on how many traversals were queued. Until the held entry is current again it
  // re-checks after each traversal settles and on a short timer, so a traversal that lands late or is dropped is still corrected.
  // Dialogs whose own scripts keep history (lead-source and connection dialogs, the request dialog, the tour) are left to them.
  var deskHeldDialogs = '#visitDialog[open],#supportDialog[open],#conversationDialog[open],#cancelBox[open],#phoneCancelDialog[open],#billingCancel[open]';
  var deskHold = null, deskHoldTimer = 0;
  function deskHeldModalOpen() { return !!document.querySelector(deskHeldDialogs); }
  function deskNav() { try { var nav = window.navigation; return nav && nav.currentEntry && typeof nav.traverseTo === 'function' ? nav : null; } catch (error) { return null; } }
  // Records the entry under a held dialog: when the first one opens, and after the desk's own steps or added entries while it is open.
  function deskHoldSync() { var nav = deskNav(); deskHold = deskHeldModalOpen() ? { key: nav ? nav.currentEntry.key : null, href: location.href, state: history.state, going: null, tries: 0 } : null; }
  function deskHoldSettle() {
    var hold = deskHold, nav = deskNav(); clearTimeout(deskHoldTimer);
    if (!hold || !hold.key || !nav || leaving || !deskHeldModalOpen()) return;
    if (nav.currentEntry.key === hold.key) { hold.going = null; hold.tries = 0; return; }
    if (!nav.entries().some(function (entry) { return entry.key === hold.key; })) {
      // The held entry no longer exists (an entry was added after it); put its address and state back once instead.
      try { history.pushState(hold.state, '', hold.href); } catch (error) { /* The page and dialog stay as they are. */ }
      deskHoldSync(); return;
    }
    if (hold.going && Date.now() - hold.going.at > 1500) hold.going = null;
    if (!hold.going && hold.tries < 12) {
      hold.tries++;
      var going = { at: Date.now() }, done = function () { if (hold.going === going) hold.going = null; if (deskHold === hold) setTimeout(deskHoldSettle, 0); };
      hold.going = going;
      try { var result = nav.traverseTo(hold.key); result.committed.catch(function () {}); result.finished.then(done, done); } catch (error) { hold.going = null; }
    }
    deskHoldTimer = setTimeout(deskHoldSettle, 250);
  }
  function deskModalHold() {
    if (!deskHeldModalOpen()) return false;
    if (!deskHold) deskHoldSync();
    if (deskHold.key) deskHoldSettle();
    else if (location.href !== deskHold.href) {
      // Without the Navigation API the entry is unknown; put the held address and state back as a new entry instead.
      try { history.pushState(deskHold.state, '', deskHold.href); } catch (error) { /* The page and dialog stay as they are. */ }
    }
    return true;
  }
  new MutationObserver(function () { if (!deskHeldModalOpen()) { deskHold = null; clearTimeout(deskHoldTimer); } else if (!deskHold) deskHoldSync(); }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
  try {
    if (deskNav()) {
      // While the Back or Forward entry is current, an address rewrite from the page underneath (the calendar's date and view)
      // would land on that other entry; it is skipped, and only a rewrite of the held entry itself updates the hold.
      window.navigation.addEventListener('navigate', function (event) { if (deskHold && deskHold.key && event.navigationType === 'replace' && event.cancelable && event.destination.sameDocument && window.navigation.currentEntry.key !== deskHold.key && deskHeldModalOpen()) event.preventDefault(); });
      window.navigation.addEventListener('currententrychange', function (event) {
        if (!deskHold) return;
        if (event.navigationType === 'push') deskHoldSync();
        else if (event.navigationType === 'replace' && window.navigation.currentEntry.key === deskHold.key) { deskHold.href = location.href; deskHold.state = history.state; }
      });
    }
  } catch (error) { /* The hold falls back to the recorded address. */ }
  window.addEventListener('hashchange', function () { var tab=location.hash.slice(1).split('/')[0];if(leaving||deskModalHold()||!pageCopy[tab]||document.body.dataset.activePage===tab&&deskRoutedHref===location.href)return;routeTo(tab,location.hash,true); });
  window.addEventListener('popstate', function () {
    if (leaving) return;
    var dialog = $('requestDialog'), state = history.state || {};
    // The desk's own step back off a request or tour entry: traversing to a #fragment entry can drop focus, so put it back.
    if (requestHistoryBack || tourHistoryBack) { var own = requestHistoryBack ? !state.mcRequestDialog : !state.mcTour; requestHistoryBack = tourHistoryBack = false; if (own) { if (deskHold) deskHoldSync(); var kept = deskStepBackFocus; deskStepBackFocus = null; if (kept) setTimeout(function () { if (leaving || document.activeElement && document.activeElement !== document.body || !kept.node.isConnected) return; window.scrollTo({ top: kept.scroll, behavior: 'instant' }); kept.node.focus({ preventScroll: true }); }, 0); return; } }
    if (deskModalHold()) return;
    if (tourActive && tourOrigin && !state.mcTour) { var origin = tourOrigin; if (pageCopy[origin.tab]) routeTo(origin.tab, origin.hash || null, true); closeTour(false, true); return; }
    if (dialog && dialog.open && !state.mcRequestDialog) {
      // Back closes the open request. Its close keeps a typed note for when the request is opened again.
      var entry = requestHistory; requestHistory = null; $('requestClose').click();
      if (dialog.open) { requestHistory = entry; try { history.pushState({ mcRequestDialog: entry && entry.id || true }, '', entry ? entry.href : location.href); } catch (error) { /* The request stays open. */ } return; }
    }
    if (deskOtherDialogOpen()) return;
    var hash = location.hash, tab = hash ? hash.slice(1).split('/')[0] : 'today';
    if (!pageCopy[tab]) return;
    if (!(document.body.dataset.activePage === tab && deskRoutedHref === location.href)) routeTo(tab, hash || null, true);
    // Forward to a request entry opens that request again, with its kept note.
    if (state.mcRequestDialog && dialog && !dialog.open) {
      var id = typeof state.mcRequestDialog === 'string' ? state.mcRequestDialog : null, pane = $('p-' + document.body.dataset.activePage);
      var button = id && pane && Array.prototype.find.call(pane.querySelectorAll('[data-request-open]'), function (node) { return node.dataset.requestOpen === id && node.getClientRects().length; });
      if (button) { requestHistory = { href: location.href, id: id }; requestReopening = true; button.click(); requestReopening = false; if (!dialog.open) requestHistory = null; }
    }
  });
  document.addEventListener('click', function (event) { var button = event.target.closest && event.target.closest('[data-request-open]'); if (button) requestLastId = button.dataset.requestOpen; }, true);
  if ($('requestDialog')) new MutationObserver(function () {
    var dialog = $('requestDialog');
    if (dialog.open && !requestHistory) { requestHistory = { href: location.href, id: requestLastId }; try { history.pushState({ mcRequestDialog: requestLastId || true }, '', location.href); } catch (error) { requestHistory = null; } }
    else if (!dialog.open && requestHistory) {
      // Closed in the page (Close, Esc or a link): step back off the request entry unless a new page was already added.
      var entry = requestHistory; requestHistory = null;
      if (!leaving && history.state && history.state.mcRequestDialog && location.href === entry.href) { requestHistoryBack = true; deskStepBackFocus = { node: document.activeElement, scroll: window.scrollY }; history.back(); }
    }
  }).observe($('requestDialog'), { attributes: true, attributeFilter: ['open'] });
  function routeTo(tab,connectionHash,quiet) {
    if (!pageCopy[tab] || leaving) return;
    var previous=document.body.dataset.activePage;
    window.__tabPicked = true; if (tab === 'test') $('tabTest').style.display = '';
    var pane = $('p-' + tab); if (!pane) return;
    var connectorHash=typeof connectionHash==='string'&&/^#setup\/(?:web|voice|sms|calendar|thumbtack|angi)(?:\/[a-z0-9_-]+)?$/.test(connectionHash)?connectionHash:null;
    if(connectorHash&&connectorHash.split('/').length===2)connectorHash+='/intro';
    var destination = location.pathname + location.search + (connectorHash||'#' + tab);
    // The new entry is added before the page is shown, so a page that writes its own address while it is shown
    // (the calendar's date and view) writes onto its own entry, not onto the page the owner just left.
    try { if (!quiet && destination !== location.pathname + location.search + location.hash) history.pushState({ mcDeskPage: tab }, '', destination); else history.replaceState(history.state, '', destination); } catch (error) { /* The page still changes. */ }
    showTab(tab);
    deskRoutedHref = location.href;
    document.querySelectorAll('.guide-target').forEach(function (node) { node.classList.remove('guide-target'); });
    pane.classList.add('guide-target'); pane.tabIndex = -1; window.scrollTo({top:0,behavior:'instant'}); $('pageTitle').focus({ preventScroll: true });
    if(tab==='leads'&&data){var readSequence=loadSequence;queueMicrotask(function(){if(!leaving&&data&&document.body.dataset.activePage==='leads'&&loadSequence===readSequence)load(null,{soft:true});});}
  }
  $('inboxRefreshRetry').addEventListener('click',function(){if(!leaving&&data)load(null,{soft:true});});
  function homeAction(button){if(button.dataset.service){document.dispatchEvent(new CustomEvent('mc:service-guide',{detail:{service:button.dataset.service}}));return;}routeTo(button.dataset.route||'know');var target=button.dataset.anchor&&$(button.dataset.anchor);if(target){var details=target.closest('details');if(details)details.open=true;target.scrollIntoView({block:'nearest'});target.tabIndex=-1;target.focus({preventScroll:true});}}
  $('nextSetupAction').addEventListener('click',function(){homeAction(this);});
  $('homeSetupSecondary').addEventListener('click',function(){homeAction(this);});
  document.addEventListener('click', function (event) { var button = event.target.closest('.desk-empty-action[data-route]'); if (button) homeAction(button); });
  document.querySelectorAll('[data-practice-prompt]').forEach(function (button) { button.addEventListener('click', function () { $('chatIn').value = button.dataset.practicePrompt; $('chatIn').focus(); }); });
  function emptyState(title, detail, actionLabel, tab) {
    return '<div class="desk-empty"><div class="desk-empty-icon"><svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4zM4 13h4l2 3h4l2-3h4"/></svg></div><div><strong>' + esc(title) + '</strong><p>' + esc(detail) + '</p>' + (actionLabel ? '<button type="button" class="desk-empty-action" data-route="' + esc(tab) + '">' + esc(actionLabel) + ' →</button>' : '') + '</div></div>';
  }
  // Self-service requests show their latest follow-up state; the outcome recorded at creation is context only until the owner acts.
  function requestFollowLabel(l) {var follow=l.followthrough,state=follow.state||{};return follow.reviewRequired?'Review updated request':state.completedAt?'Follow-up complete':follow.due?'Follow-up due':({not_recorded:'Not contacted yet',attempted:'Contact attempted',reached:'Customer reached'})[state.contact]||'Needs follow-up';}
  function requestOutcomeLabel(l,follow) {var outcome=l.outcome||l.reason||'',state=follow&&follow.state||{};if(follow&&(outcome==='needs_action'||state.completedAt||['attempted','reached'].includes(state.contact)))return '';return ownerWord(outcome);}
  // Inbox order: open emergency, then open same-day, then other open requests, each newest first; handled requests last.
  // Uses the saved urgency/reason fields only; nothing is reclassified here.
  function requestUrgency(l){return l&&(l.urgency==='emergency'||l.reason==='emergency')?'emergency':l&&l.urgency==='today'?'today':'';}
  // A request whose owner alert is still waiting stays Open (with its Acknowledge button) even after follow-up is recorded
  // complete: escalation keeps running until the alert is acknowledged (desk.mjs runEscalation).
  function requestIsOpen(l,selfService){if(l&&(l.alertWaiting||l.alertAttentionDue))return true;if(selfService&&l.followthrough){var follow=l.followthrough;return !!follow.needsFollowup||!!(l.websiteSetupCheck||l.simulation)&&!(follow.state&&follow.state.completedAt);}return l.status==='open';}
  function requestRank(l,selfService){if(!requestIsOpen(l,selfService))return 3;var u=requestUrgency(l);return u==='emergency'?0:u==='today'?1:2;}
  function idOrder(a,b){var x=String(a&&a.id||''),y=String(b&&b.id||'');return x<y?-1:x>y?1:0;}
  // Ties on createdAt order by record id, so the same data always lists the same way (storage listing order can vary).
  function sortRequests(rows,selfService){return rows.map(function(l,i){return [l,i];}).sort(function(a,b){return requestRank(a[0],selfService)-requestRank(b[0],selfService)||String(b[0].createdAt||'').localeCompare(String(a[0].createdAt||''))||idOrder(a[0],b[0])||a[1]-b[1];}).map(function(x){return x[0];});}
  // PRA-FC2-04: the saved customer language ("es" from a Spanish conversation) beside the customer, so the owner calls ready.
  function languageBadge(row){return row&&row.language==='es'?' '+'<span class="tag lang-tag" data-customer-language="es">Habla español / Spanish</span>':'';}
  function urgencyBadge(l,selfService){var u=requestUrgency(l);if(!u||!requestIsOpen(l,selfService))return '';return '<span class="desk-urgency" data-urgency="'+u+'"><svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 2.5 20h19L12 4zM12 10v4M12 17h.01"/></svg>'+(u==='emergency'?'Emergency':'Same day')+'</span>';}
  // Open is the default. A refresh returns the list to Open, except while the owner is working in a request dialog
  // (so closing it returns focus to the same row) or right after "View request" chose a row (routing to the Inbox
  // refreshes it). While Done stays selected, a "New" cue on Open says new open requests arrived.
  // The Open/Done choice is kept for this tab across routes and refreshes, and each switch is announced (PRA-A11Y-07).
  var requestFilterKey='mc-desk-request-filter-v1:'+(slug||''),requestFilter=(function(){try{return sessionStorage.getItem(requestFilterKey)==='done'?'done':'open';}catch(error){return 'open';}})(),requestOpenSeen=null,requestFilterHold=null;
  // Only an owner's own Open/Done choice is remembered; automatic switches (for example after scheduling) are not (QA F2).
  function setRequestFilter(value,remember){requestFilter=value==='done'?'done':'open';if(remember)try{sessionStorage.setItem(requestFilterKey,requestFilter);}catch(error){}}
  function announceRequestFilter(){var node=$('requestFilterStatus');if(!node)return;var n=Number((requestFilter==='done'?$('requestDoneCount'):$('requestOpenCount')).textContent)||0;node.textContent=n+' '+requestFilter+' request'+(n===1?'':'s')+' shown';}
  function renderRequests(d,selfService,leadsLimited){
    var rows=sortRequests(d.leads||[],selfService),open=rows.filter(function(l){return requestIsOpen(l,selfService);}),done=rows.filter(function(l){return !requestIsOpen(l,selfService);});
    var openIds=open.map(function(l){return l.id;}),fresh=false;if(requestFilter==='open'||!requestOpenSeen)requestOpenSeen=openIds;else fresh=openIds.some(function(id){return requestOpenSeen.indexOf(id)<0;});
    $('requestOpenCount').textContent=open.length;$('requestDoneCount').textContent=done.length;$('requestOpenNew').hidden=!fresh;$('leadCount').textContent=open.length+(leadsLimited?' shown':'');
    document.querySelectorAll('[data-request-filter]').forEach(function(button){button.setAttribute('aria-pressed',String(button.dataset.requestFilter===requestFilter));});
    var shown=requestFilter==='done'?done:open;
    $('leads').innerHTML=shown.length?requestList(shown,selfService):!rows.length?emptyState(leadsLimited?'No customer requests in this view':'No customer requests yet',leadsLimited?'Some request history still needs checking. Contact support if you need an earlier request.':'Customer requests appear here with the details you need to review and follow up.'):requestFilter==='done'?emptyState('No handled requests yet','Requests move here after you record that follow-up is complete.'):emptyState('No open requests','Every saved request has a recorded outcome. Choose Done to review them.');
  }
  function bindRequestAcks(scope){scope.querySelectorAll('button.ack').forEach(function (b) { b.addEventListener('click', function () { apiRequest('POST', { action: 'ack', leadId: b.dataset.id }).then(function () { toast('Acknowledged.'); return load(); }).catch(function (error) { toast(error.message); }); }); });}
  document.addEventListener('click',function(event){var button=event.target.closest&&event.target.closest('[data-request-filter]');if(!button||!data||button.dataset.requestFilter===requestFilter)return;setRequestFilter(button.dataset.requestFilter,true);var selfService=data.client?.onboarding?.version===1;renderRequests(data,selfService,!!data.recordListing?.leads?.incomplete);bindRequestAcks($('leads'));announceRequestFilter();});
  function showRequestFor(id){var lead=data&&(data.leads||[]).find(function(l){return l.id===id;});if(!lead)return;requestFilterHold=id;var want=requestIsOpen(lead,data.client?.onboarding?.version===1)?'open':'done';if(want===requestFilter)return;setRequestFilter(want);renderRequests(data,data.client?.onboarding?.version===1,!!data.recordListing?.leads?.incomplete);bindRequestAcks($('leads'));}
  // Owner views only. Stored front desk turns end with "[Done: …, ref X]" lines that tell the AI an action already
  // happened; the customer never saw them. They stay in storage and in AI history; only this display hides them.
  function ownerMessageText(m){var text=String(m==null||m.content==null?'':m.content);if(!m||m.role==='user')return text;var shown=text.replace(/(?:\s*\[Done:[^\]\n]*\])+\s*$/,'');return shown.trim()?shown:text.replace(/\[Done:\s*([^\]\n]*)\]/g,'$1').trim();}
  function channelLabel(channel){return ({web:'Website chat',sms:'Text',call:'Phone call',voice:'Phone call',test:'Practice'})[channel]||String(channel||'Conversation');}
  function conversationLead(v){return (data&&data.leads||[]).find(function(l){return l.channel===v.channel&&l.contact&&l.contact===v.contact;})||null;}
  function conversationTitle(v){var lead=conversationLead(v);if(lead&&(lead.customer_name||lead.phone))return lead.customer_name||lead.phone;if(/^\+\d{10,15}$/.test(v.contact||''))return v.contact;var first=(v.messages||[]).find(function(m){return m&&m.at;});return (v.channel==='web'?'Website visitor':channelLabel(v.channel)+' customer')+' · '+recordTimeLabel(first?first.at:v.updatedAt);}
  // Recent activity: Houston time with CST/CDT (so the repeated hour on DST fall-back is unambiguous) and owner wording.
  // Unknown event types fall back to their plain name.
  function houstonTime(value,withDate){var at=new Date(value);if(!value||!Number.isFinite(at.getTime()))return '';return new Intl.DateTimeFormat('en-US',withDate?{timeZone:'America/Chicago',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}:{timeZone:'America/Chicago',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(at);}
  function activityRow(e,d,withDate){
    var data_=e.data||{},leads=d.leads||[],bookings=d.bookings||[],selfService=d.client?.onboarding?.version===1;
    var lead=leads.find(function(l){return l.id===(data_.leadId||data_.id);})||null,booking=bookings.find(function(b){return b.id===data_.id;})||null;
    var who=function(row){return row&&(row.customer_name||row.phone)||'a customer';},source=({angi:'Angi',thumbtack:'Thumbtack'})[data_.source]||'';
    var text=({
      lead:function(){return data_.setupCheck?'Setup check request saved':'New request from '+who(lead);},
      platform_lead:function(){return 'New '+(source?source+' ':'')+'lead from '+who(lead);},
      lead_updated:function(){return 'Request updated: '+who(lead);},
      lead_closed:function(){return 'Request closed by a saved visit: '+who(lead);},
      booking:function(){return data_.setupCheck?'Setup check visit saved':'Visit saved for '+who(booking);},
      confirmed:function(){return 'Visit confirmed by '+who(booking);},
      rescheduled:function(){return 'Visit moved for '+who(booking);},
      called:function(){return 'Callback recorded for '+who(booking||lead);},
      alert_opened:function(){return (data_.kind==='emergency'?'Urgent alert for ':'Callback alert for ')+who(lead);},
      alert_acked:function(){return 'Alert acknowledged';},
      escalated:function(){return 'Alert escalated';},
      missed_call:function(){return 'Missed call'+(data_.from?' from '+data_.from:'');},
      sms_inbound:function(){return 'Text received'+(data_.from?' from '+data_.from:'');},
      sms_reply:function(){return 'Text received'+(data_.from?' from '+data_.from:'');}
    })[e.type];
    var label=text?text():String(e.type||'Activity').replace(/_/g,' ').replace(/^./,function(c){return c.toUpperCase();});
    var open=selfService&&lead&&lead.followthrough&&['lead','platform_lead','lead_updated','lead_closed','alert_opened','called'].indexOf(e.type)>=0?' <button type="button" class="btn-pill btn-pill-dark btn-sm" data-request-open="'+esc(lead.id)+'">View request</button>':'';
    return '<div><time datetime="'+esc(e.at||'')+'">'+esc(houstonTime(e.at,withDate))+'</time> '+esc(label)+open+'</div>';
  }
  function requestList(rows,selfService) {
    return '<div class="desk-request-list" role="list" aria-label="Customer requests">'+rows.map(function(l){
      var follow=selfService&&l.followthrough,state=follow&&follow.state||{};
      var status=follow?requestFollowLabel(l):ownerWord(l.status)||'Saved';
      var source=platformLeadLabel(l),reason=requestOutcomeLabel(l,follow),phone=/^\+1\d{10}$/.test(l.phone||'')?'<a href="tel:'+esc(l.phone)+'">'+esc(ownerPhone(l.phone))+'</a>':esc(l.phone||'No contact number');
      var requested=l.wanted?'<span>'+esc(l.wanted)+'</span>':'';
      var urgent=requestIsOpen(l,selfService)?requestUrgency(l):'';
      return '<article class="desk-request-row" role="listitem" data-record-kind="leads" data-record-id="'+esc(l.id)+'"'+(urgent?' data-urgency="'+urgent+'"':'')+'><div class="desk-request-person"><strong>'+esc(l.customer_name||'Customer request')+'</strong>'+languageBadge(l)+urgencyBadge(l,selfService)+'<span class="muted">'+phone+'</span>'+(source?' <span class="tag brand-lockup" data-lead-source-badge>'+brandMark(l.platform&&l.platform.source)+esc(source)+'</span>':'')+(l.websiteSetupCheck?' <span class="tag">Setup check</span>':'')+'<div class="desk-request-ref">Ref '+esc(leadReference(l))+'</div></div><div class="desk-request-job"><p>'+esc(l.issue||'Details in the saved conversation')+'</p><div class="desk-request-context">'+[l.address?'<span>'+esc(l.address)+'</span>':'',requested].filter(Boolean).join('<br>')+'</div>'+(reason?'<p class="muted">'+esc(reason)+'</p>':'')+humanHandoffStatus(l)+(l.unsure?'<p class="muted">Needs checking: '+esc(l.unsure)+'</p>':'')+(requestUrgency(l)==='emergency'&&!urgent?'<p class="muted">Emergency request</p>':'')+(l.overdueAt&&l.status==='open'?'<span class="tag-overdue">Overdue callback</span>':'')+'</div><div class="desk-request-meta"><time>'+esc(recordTimeLabel(l.createdAt))+'</time><span class="desk-request-status">'+esc(status)+'</span>'+(follow?'<button type="button" class="btn-pill btn-pill-dark btn-sm" data-request-open="'+esc(l.id)+'">View request</button>':'')+(l.alertWaiting?'<button type="button" class="btn-pill btn-pill-blue btn-sm ack" data-id="'+esc(l.id)+'">Acknowledge</button>':'')+(follow&&state.nextAction?'<span class="muted">'+esc(state.nextAction)+'</span>':'')+'</div></article>';
    }).join('')+'</div>';
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
  // Structured hours as owners write them: "Mon-Fri 7 am to 6 pm, Sat 8 am to 12 pm". Closed days are left out. (PRA-DESK-09, 16)
  function clock12(value) { var m = /^(\d{2}):(\d{2})$/.exec(value || ''); if (!m) return value || ''; var h = Number(m[1]), ap = h >= 12 && h < 24 ? 'pm' : 'am', hh = h % 12 || 12; return m[2] === '00' ? hh + ' ' + ap : hh + ':' + m[2] + ' ' + ap; }
  function weeklyHoursText(hours) {
    var days = ['mon','tue','wed','thu','fri','sat','sun'], names = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], groups = [];
    if (!hours || typeof hours !== 'object' || !days.some(function (d) { return hours[d] && hours[d].open && hours[d].close; })) return '';
    days.forEach(function (d, i) { var h = hours[d], span = h && h.open && h.close ? clock12(h.open) + ' to ' + clock12(h.close === '24:00' ? '00:00' : h.close) : ''; var last = groups[groups.length - 1]; if (span && last && last.span === span && last.end === i - 1) last.end = i; else if (span) groups.push({ start: i, end: i, span: span }); });
    return groups.map(function (g) { return names[g.start] + (g.end > g.start ? '-' + names[g.end] : '') + ' ' + g.span; }).join(', ');
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
      var lead=conversationLead(v),requestButton=selfService&&lead&&lead.followthrough?'<button type="button" class="btn-pill btn-pill-dark btn-sm" data-request-open="'+esc(lead.id)+'">View request</button>':'';
      return '<article class="conv"><header class="conv-header"><div><b>'+esc(conversationTitle(v))+'</b><div class="conv-meta"><span class="conv-channel">'+esc(channelLabel(v.channel))+'</span>'+esc(recordTimeLabel(v.updatedAt))+(!selfService&&v.flag?' · Flagged: '+esc(v.flag.note || ''):'')+(v.channel==='sms'&&((data&&data.possibleOptOuts)||[]).some(function(f){return f.phone===v.contact;})?' · <strong class="optout-flag">Possible opt-out: please review. Texts were not stopped.</strong>':'')+'</div></div>'+(v.reference?'<button type="button" class="btn-pill btn-pill-dark btn-sm" data-conversation-open="'+esc(v.reference)+'" data-conversation-contact="'+esc(v.contact)+'">Read saved conversation</button>':'')+requestButton+button+'</header><div class="conv-thread">'+v.messages.map(function(m){return '<div class="conv-message '+(m.role==='user'?'u':'a')+'"><span>'+(m.role==='user'?'Customer':'Front desk')+'</span>'+esc(ownerMessageText(m))+(m.processing?'<small class="muted"> · '+esc(m.processingDetail||m.processing.replace(/_/g,' '))+(m.processingAction==='account'?' <a href="#account">Review usage and billing</a>':'')+'</small>':'')+'</div>';}).join('')+'</div>'+supportCard(report)+'</article>';
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
    var voice = d.connections?.voice, forwardingMode = voice?.operation?.forwardingMode || (voice?.forwarding?.mode === 'none' ? 'use_new_number' : voice?.forwarding?.manualCarrierStep === true ? 'forward_business_line' : d.client.onboarding?.phoneSetupMode);
    var directNumberReserved = operation?.state === 'number_acquired' && forwardingMode === 'use_new_number', numberDetail = directNumberReserved ? 'Your front desk number is reserved. Use the phone connection guide to check answering on this number.' : operation?.detail;
    var when = function (value) { return value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)) + ' CT' : 'Not recorded'; };
    $('phoneSetupDetail').textContent = canRequest ? 'Review this number-only offer. Nothing is requested until you accept it and submit.' : directNumberReserved ? numberDetail : phone.detail || 'Phone answering is not active.';
    $('phoneSetupProgress').innerHTML = operation ? '<div class="setup-step"><div><strong>' + esc(states[operation.state] || 'Status unavailable') + '</strong><p>' + esc(numberDetail) + '</p>' + (operation.number ? '<p><b>' + (operation.releaseConfirmed ? 'Recorded number: ' : 'Number: ') + '</b>' + esc(operation.number) + '</p>' : '') + '<p>' + (operation.releaseConfirmed ? 'Release confirmed. The resource receipt has been retained.' : operation.resourceRecorded ? 'The number receipt is saved. Release has not been confirmed.' : 'No number resource receipt has been recorded.') + '</p><p>Updated ' + esc(when(operation.updatedAt)) + (operation.nextCheckAt ? ' · Next check ' + esc(when(operation.nextCheckAt)) : '') + '</p><p>Reference: <code style="overflow-wrap:anywhere;white-space:normal">' + esc(operation.id) + '</code></p></div></div>' : '';
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
      $('phoneSetupMessage').textContent = actionName === 'request_phone_activation' ? 'Number request saved. Phone answering is not active. Refresh status to check progress.' : 'Cancellation saved. The status above shows when the number is released. We keep a record of your request.';
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
    var web=d.setup?.connectionJourney?.channels?.find(function(channel){return channel.id==='web';});if($('websiteSetupDetails'))$('websiteSetupDetails').hidden=$('connectionsCard')?.classList.contains('has-connector-pages')&&document.body.dataset.connectorFlow==='step'||!!web&&!web.requested&&!web.retained;
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
    if(w){var observation=w.observation||{},request=w.setupRequest||{},first=w.firstExternalRequest||{},chat=w.customerChat||{},impact=cfgWebImpact(d.setup);
      if(impact)chat=Object.assign({},chat,{available:false,state:impact.state});
      websiteFact('websiteInstallObserved',observation.state==='found'?'Found'+(observation.at?' · '+websiteTime(observation.at):''):observation.state==='stale'?'Found previously'+(observation.origin?' on '+observation.origin:''):observation.state==='waiting'?'Waiting for your website':'Not checked');
      var chatLabels={active:'Active now',paused:'Paused',closed:'Closed',needs_rules:'Business details needed',needs_review:'Rules review needed',needs_practice:'Practice needed',ready_to_activate:'Ready to activate',limit:'Daily limit reached',unavailable:'Temporarily unavailable'};websiteFact('websiteInstallChat',chatLabels[chat.state]||'Check status');
      websiteFact('websiteInstallRequest',request.state==='complete'?'Check completed'+(request.at?' · '+websiteTime(request.at):''):request.state==='saved_unconfirmed'?'Request saved; answer not confirmed':request.state==='stale'?'Previous check retained':'Not checked');
      websiteFact('websiteInstallFirst',first.state==='received'?'Received'+(first.at?' · '+websiteTime(first.at):''):first.state==='stale'?'Previous request on '+(first.origin||'your former website'):'None recorded yet');
      var complete=observation.state==='found'&&request.state==='complete';$('websiteInstallBadge').textContent=complete?'Website check complete':observation.state==='found'?'Widget found':'Not checked';$('websiteInstallBadge').dataset.complete=String(complete);
      if(w.configurationRevision!==d.configurationRevision){action='check_status';detail='Your saved details changed. Refresh the website status before checking again.';}
    }
    var copy={start_check:['Check on my website','Start your website check','Open your published website and look for the chat button. This checks the installation; it does not send a message.','3'],save_website:['Save website','Where should customers find your front desk?','Add your business website. Your other saved details are ready to use.','1'],allow_origin:['Use this website','Allow your front desk on this website','Use '+websiteChosenOrigin()+'. Only websites you allow can use your front desk.','1'],copy_code:['Copy installation code','Add one line to your website','Add the code in your website’s shared footer, before </body>, then publish your website.','2'],check_status:['Check status','See what is ready',detail,'3'],review_rules:['Review business rules','Check the answers customers will hear','Your widget can stay installed. Review your current business rules before customer chat can answer.','3'],test_desk:['Try your front desk','Try a private conversation','Your widget can stay installed. Practice the requests customers ask before activating chat.','3'],activate_web:['Activate website chat','Ready for customer conversations','Your rules and practice check are ready. Activate website chat, then try a sample request on your website.','3'],resume_web:['Resume website chat','Your website chat is paused','Resume when your current setup checks are complete. Your installation evidence is kept.','3'],try_sample:['Try a sample request','See a request arrive in your workspace','Open the installed widget and create a sample callback request. Use the sample details shown there.','4'],view_setup_request:['View setup request','Your website check is complete','See the sample request and conversation your front desk saved.','4'],open_website:['Open my website','Your website check is complete','No ordinary website request has been recorded yet. The first request will appear here when it arrives.','4'],view_request:['View request','Your first website request arrived','Open the saved request to see what the customer needs and follow up.','4']};
    if(!legacy&&!w){action='check_status';copy.check_status[1]='Website setup is loading';copy.check_status[2]='Refresh to check your saved website and next step.';}
    if(w&&websiteChosenOrigin()!==w.selectedOrigin){action=(d.client.widget.allowedOrigins||[]).includes(websiteChosenOrigin())?'copy_code':'allow_origin';$('websiteInstallBadge').textContent='Check this website';$('websiteInstallBadge').dataset.complete='false';websiteFact('websiteInstallObserved',w.observation?.at?'Previous check on '+w.selectedOrigin:'Not checked');websiteFact('websiteInstallRequest','Not checked on this website');websiteFact('websiteInstallFirst','None recorded on this website');}
    if(action==='check_website')action='start_check';
    if(action==='copy_code'&&websiteCopied){action='start_check';copy.start_check=['Check on my website','Check the widget on your website','Open your published website and look for the chat button. This step checks the installation; it does not send a message.','3'];}
    if(action==='check_status'&&w?.attempt){copy.check_status[1]='Waiting for your website';copy.check_status[2]=w.attempt.state==='expired'?'Your last check expired. Start a new check when you are ready.':'Open your website check, then refresh this status.';}
    var check=websiteCurrentCheck(),checkURL=check&&websiteCheckLink(check),waitingForWebsite=action==='check_status'&&!!w?.attempt&&w.observation?.state!=='found'&&w.configurationRevision===d.configurationRevision;
    if(waitingForWebsite&&!checkURL){action='start_check';copy.start_check=['Prepare website check','Continue your website check','Prepare a fresh check link, then open your published website. A saved check without its browser link cannot confirm the installation.','3'];}
    var item=copy[action]||copy.check_status;primary.hidden=(waitingForWebsite||action==='try_sample')&&!!checkURL;primary.dataset.action=action;primary.textContent=item[0];$('websiteInstallHeading').textContent=item[1];$('websiteInstallDetail').textContent=item[2];$('websiteInstallNumber').textContent=item[3];primary.disabled=websiteBusy||websiteConflict;$('websiteInstallReviewLatest').hidden=!websiteConflict;$('websiteInstallReviewLatest').disabled=websiteBusy;
    $('websiteInstallRefresh').hidden=!((waitingForWebsite||action==='try_sample')&&checkURL); $('websiteInstallRefresh').disabled=websiteBusy;$('websiteInstallRefresh').textContent='Check website result';
    $('websiteInstallSave').disabled=websiteBusy||websiteConflict;$('websiteInstallChange').disabled=websiteBusy;$('websiteInstallAlready').disabled=websiteBusy||websiteConflict;$('websiteInstallHandoff').disabled=websiteBusy;$('copySnippet').disabled=websiteBusy;
    var open=$('websiteInstallOpen');open.hidden=!checkURL||!(waitingForWebsite||action==='try_sample');open.className='btn-pill btn-pill-blue btn-sm';open.textContent=action==='try_sample'?'Try a sample request':'Open website check';open.removeAttribute('href');if(checkURL)open.href=checkURL;
    if(action==='save_website')primary.textContent='Add website';
    var calendarView=d.connections?.calendar,calendarChosen=(d.client.onboarding?.desiredChannels||[]).includes('calendar'),calendarLost=calendarView?.status==='reconnect_required',calendarHeld=calendarChosen&&calendarView?.status==='disconnected'&&!!calendarView?.connectedAt,calendarOff=calendarChosen&&!calendarView?.connectedAt&&['not_connected','disconnected'].includes(calendarView?.status);$('websiteCalendarNote').hidden=legacy||!(calendarOff||calendarLost||calendarHeld);$('websiteCalendarNoteText').textContent=calendarLost?'New bookings are paused. Google Calendar needs to be reconnected, so new visits are not booked from website chat, texts or calls until you reconnect it. To book from your saved hours instead, disconnect Google Calendar'+(calendarChosen?' and remove it from your service choices.':'. It is already removed from your service choices.'):calendarHeld?'New bookings are paused. Google Calendar is disconnected but still in your service choices, so new visits are not booked from website chat, texts or calls until you reconnect it or remove it from your service choices.':'Google Calendar not connected yet. Bookings are not checked against your calendar; they use your saved hours and arrival windows.';$('websiteCalendarConnect').textContent=calendarLost||calendarHeld?'Reconnect Google Calendar':calendarView?.available!==true?'Ask about Google Calendar':'Connect Google Calendar';$('websiteCalendarConnect').disabled=websiteBusy;
  }
  async function latestWorkspaceRead(){var pending=load();for(;;){await pending;if(pending===loadPending)return;pending=loadPending;}}
  async function websiteRead(){var generation=portalGeneration,previous=data;await latestWorkspaceRead();if(leaving||generation!==portalGeneration)return;if(data===previous)throw new Error('The latest website status could not be confirmed. Please check again.');}
  function websiteReadMessage(){var w=data?.websiteInstallation;if(!w)return 'The website status is not available yet. Try checking again.';if(w.observation?.state!=='found')return 'We have not seen the chat code load on your published website yet. Open the website check, let the page finish loading, then return here. If the chat button is missing, review the installation steps.';if(w.customerChat?.state==='unavailable')return 'Your website installation is confirmed. Customer chat is not active because the AI service is unavailable. Request a connection review from setup.';if(w.setupRequest?.state==='complete')return 'Your website installation and setup request are confirmed. Continue to the connection checks.';return 'Your website installation is confirmed. '+(w.nextAction?.label||'Follow the current step above to check customer chat.');}
  function websiteHandleError(error){if(error.code==='configuration_changed')websiteConflict=true;if(error.status===401||error.status===403){document.dispatchEvent(new CustomEvent('mc:session-expired'));return;}websiteMessage((error.message||'We could not confirm this step.')+' Your saved details are kept.',true);if(error.field==='business.website'||error.fieldErrors?.['business.website']){websiteEditing=true;$('websiteInstallEdit').hidden=false;$('websiteInstallWebsiteError').textContent=error.fieldErrors?.['business.website']||error.message;$('websiteInstallWebsite').setAttribute('aria-invalid','true');$('websiteInstallWebsite').focus();}}
  // A definite 429 ai_daily_limit changed nothing. Re-read softly once, so the card shows what a reload would (Daily limit
  // reached, the read-only next step). A failed or superseded re-read keeps the desk and the card, never the recovery
  // screen; the reset time is shown only from a fresh read and only while it is still ahead. Returns true when fresh.
  async function websiteLimitRefused(error,generation){var previous=data,pending=load(null,{soft:true});for(;;){await pending;if(pending===loadPending)break;pending=loadPending;}if(generation!==portalGeneration||leaving)return null;var fresh=data!==previous,reset=fresh?data.websiteInstallation?.customerChat?.resetAt||data.aiAllowance?.resetAt:null,when=reset&&Date.parse(reset)>Date.now()?websiteTime(reset):'';websiteMessage((error.message||'Website chat cannot activate while today’s AI allowance is exhausted.')+(when?' The allowance resets '+when+'.':' The allowance resets at midnight Houston time.')+(fresh?'':' The latest website status could not be checked.')+' Your saved details are kept.',true);return fresh;}
  // Focus may move after the refusal only if it was on the button at the click, is still there or on <body>, the owner
  // has not interacted meanwhile (Tab counts even from <body>) and Connections is still shown. Local listeners always run;
  // the desk's deskFocusStart/deskInteraction guard is added where both exist. If the owner had moved focus to a control
  // that the re-read's re-render replaced, focus returns to the control with the same id instead of being lost. Only the
  // owner's latest focus target is restored (settle.lastFocused); a pointer press forgets it unless it focuses a control.
  function websiteFocusGuard(primary){var on=document.activeElement===primary,moved=false,last=document.activeElement,types=['pointerdown','wheel','touchstart','keydown'],mark=function(event){if(event.type==='pointerdown'||event.type==='touchstart')last=null;if(event.type==='keydown'&&(['Shift','Control','Alt','Meta'].includes(event.key)||event.key!=='Tab'&&(!document.activeElement||document.activeElement===document.body)))return;moved=true;},track=function(event){last=event.target;},start=typeof deskFocusStart==='function'&&typeof deskInteraction==='number'?deskFocusStart([primary]):null;types.forEach(function(type){document.addEventListener(type,mark,{capture:true,passive:true});});document.addEventListener('focusin',track,true);var settle=function(){types.forEach(function(type){document.removeEventListener(type,mark,{capture:true});});document.removeEventListener('focusin',track,true);settle.lastFocused=last;var still=!document.activeElement||document.activeElement===primary||document.activeElement===document.body;return still&&!leaving&&document.body.dataset.activePage==='setup'&&on&&!moved&&(!start||start.on===true&&start.mark===deskInteraction);};return settle;}
  async function websiteChange(task){if(websiteBusy||leaving)return;var generation=portalGeneration;websiteBusy=true;renderWebsiteInstallation(data);cfgChanged();acctStatus();try{await task(generation);}catch(error){if(generation===portalGeneration&&!leaving)websiteHandleError(error);}finally{if(generation===portalGeneration&&!leaving){websiteBusy=false;renderWebsiteInstallation(data);cfgChanged();acctStatus();}}}
  function websiteNeedSavedRules(){if(cfgDirty||cfgBusy||acctBusy){websiteMessage('Save your business edits before changing your website setup.',true);routeTo('know');$('saveCfg').focus();return true;}return false;}
  function websiteApplySaved(result){data.client=result.client;data.setup=result.setup||data.setup;data.configurationRevision=result.configurationRevision;data.editRevision=result.editRevision;if(!cfgChanges(cfgFromClient(result.client),cfgBaseline).length){cfgRevision=result.configurationRevision;cfgEditRevision=result.editRevision;}acctObserve(result,true);cfgFence++;renderSetup(data);document.dispatchEvent(new CustomEvent('mc:desk',{detail:data}));}
  async function websiteStart(){if(websiteConflict||websiteNeedSavedRules())return;await websiteChange(async function(generation){websiteMessage('Preparing your website check…');var result=await action('start_website_check',{expectedRevision:cfgRevision,expectedEditRevision:cfgEditRevision,origin:websiteChosenOrigin()});if(generation!==portalGeneration||leaving)return;if(!result.check||!websiteCheckLink(result.check))throw new Error('A safe website check link could not be prepared.');data.websiteInstallation=result.websiteInstallation;var stored=await websiteStore(result.check);if(generation!==portalGeneration||leaving)return;websiteMessage(stored?'Your check is ready. Open your website, then return here to check its status.':'Your check is ready for this page. Keep it open; this browser could not save the link for a reload.');$('websiteInstallOpen').hidden=false;$('websiteInstallOpen').href=websiteCheckLink(result.check);$('websiteInstallOpen').focus();});}
  async function websiteCopy(handoff){var generation=portalGeneration;try{var text=$('snippet').textContent;if(handoff)text='Please add the Machines & Cloud chat to '+(data.client.business.website||websiteChosenOrigin())+'.\n\n'+text+'\n\nAdd this once in the shared footer before </body>, publish the website, then let me know so I can check it from my workspace.';await navigator.clipboard.writeText(text);if(leaving||generation!==portalGeneration)return;if(!handoff)websiteCopied=true;$('copyMessage').textContent=handoff?'Instructions copied. Send them to your web person.':'Code copied. Publish your website, then check it here.';renderWebsiteInstallation(data);}catch(error){if(!leaving&&generation===portalGeneration){$('websiteInstallHelp').open=true;$('copyMessage').textContent='Select the code and copy it manually.';$('snippet').focus();}}}
  function websiteViewRecord(record){if(!record||!['leads','bookings'].includes(record.kind)||typeof record.id!=='string')return;if(record.kind==='leads')showRequestFor(record.id);routeTo(record.kind==='bookings'?'availability':'leads');var row=Array.from($(record.kind).querySelectorAll('[data-record-id]')).find(function(node){return node.dataset.recordId===record.id;});if(row){var recordDetails=row.closest('details');if(recordDetails)recordDetails.open=true;document.querySelectorAll('[data-record-focus]').forEach(function(node){delete node.dataset.recordFocus;});row.dataset.recordFocus='true';row.tabIndex=-1;row.focus();row.scrollIntoView({block:'center'});}else websiteMessage('That saved request is not in the recent list. Refresh '+(record.kind==='bookings'?'Schedule':'Requests')+' to check its latest status.',true);}
  $('websiteInstallReviewLatest').addEventListener('click',function(){websiteChange(async function(generation){await websiteRead();if(generation!==portalGeneration||leaving)return;websiteConflict=false;websiteMessage('Latest saved website: '+(data.client.business.website||'none yet')+'. Your typed address is kept. Review it before saving or checking again.');});});
  $('websiteInstallChange').addEventListener('click',function(){websiteEditing=true;renderWebsiteInstallation(data);$('websiteInstallWebsite').focus();});
  $('websiteInstallEditCancel').addEventListener('click',function(){if(websiteBusy)return;websiteDirty=false;websiteEditing=false;$('websiteInstallWebsiteError').textContent='';$('websiteInstallWebsite').removeAttribute('aria-invalid');renderWebsiteInstallation(data);$(websiteURL(data.client.business.website)?'websiteInstallChange':'websiteInstallPrimary').focus({preventScroll:true});});
  $('websiteInstallWebsite').addEventListener('input',function(){websiteDirty=this.value!==(data.client.business.website||'');websiteEditing=true;$('websiteInstallWebsiteError').textContent='';$('websiteInstallWebsite').removeAttribute('aria-invalid');});
  $('websiteInstallOrigin').addEventListener('change',function(){websiteOriginSelection=this.value;websiteCheckCache=null;websiteCopied=false;renderWebsiteInstallation(data);});
  $('websiteInstallEdit').addEventListener('submit',function(event){event.preventDefault();if(websiteConflict||websiteNeedSavedRules())return;var snapshot=$('websiteInstallWebsite').value,url=websiteURL(snapshot);if(!url){$('websiteInstallWebsiteError').textContent='Enter the full HTTPS address, such as https://yourshop.com.';$('websiteInstallWebsite').setAttribute('aria-invalid','true');$('websiteInstallWebsite').focus();return;}websiteChange(async function(generation){var result=await apiRequest('PUT',{expectedRevision:cfgRevision,expectedEditRevision:cfgEditRevision,business:{website:url.href}});if(generation!==portalGeneration||leaving)return;websiteDirty=$('websiteInstallWebsite').value!==snapshot;websiteEditing=websiteDirty;websiteCheckCache=null;websiteCopied=false;websiteOriginSelection=null;websiteApplySaved(result);await websiteRead();if(generation!==portalGeneration||leaving)return;websiteMessage(websiteDirty?'Website saved. Your newer address is still unsaved.':'Website saved. Continue with the next step below.');if(!websiteDirty)$('websiteInstallPrimary').focus({preventScroll:true});});});
  $('websiteInstallPrimary').addEventListener('click',function(){var actionName=this.dataset.action,w=data?.websiteInstallation;if(actionName==='save_website'){websiteEditing=true;renderWebsiteInstallation(data);$('websiteInstallWebsite').focus();}else if(actionName==='copy_code')websiteCopy(false);else if(actionName==='start_check')websiteStart();else if(actionName==='allow_origin'){if(websiteNeedSavedRules())return;websiteChange(async function(generation){var origins=(data.client.widget.allowedOrigins||[]).slice(),origin=websiteChosenOrigin();if(!origins.includes(origin))origins.push(origin);var result=await apiRequest('PUT',{expectedRevision:cfgRevision,expectedEditRevision:cfgEditRevision,widget:{allowedOrigins:origins}});if(generation!==portalGeneration||leaving)return;websiteApplySaved(result);await websiteRead();if(generation===portalGeneration&&!leaving)websiteMessage('Website allowed. Continue with its installation check.');});}else if(actionName==='check_status')websiteChange(async function(generation){await websiteRead();if(generation===portalGeneration&&!leaving)websiteMessage(websiteReadMessage());});else if(actionName==='try_sample'){if(websiteCurrentCheck()){var checkURL=websiteCheckLink(websiteCurrentCheck());if(checkURL)window.open(checkURL,'_blank','noopener,noreferrer');websiteMessage('Use the sample request in your website chat. If the new tab was blocked, use Open website check below.');}else websiteStart();}else if(actionName==='view_setup_request')websiteViewRecord(w?.setupRequest?.record);else if(actionName==='view_request')websiteViewRecord(w?.firstExternalRequest?.record);else if(actionName==='open_website'){var site=websiteURL(data.client.business.website);if(site){window.open(site.href,'_blank','noopener,noreferrer');$('websiteInstallOpen').href=site.href;$('websiteInstallOpen').hidden=false;$('websiteInstallOpen').textContent='Open my website';websiteMessage('If the new tab was blocked, use the website link below.');}}else if(actionName==='review_rules'){routeTo('know');$('reviewRules').focus();}else if(actionName==='test_desk'){routeTo('test');$('chatIn').focus();}else if(['activate_web','resume_web'].includes(actionName)){if(websiteNeedSavedRules())return;if(!data.setup?.canActivateWeb){websiteMessage('Complete the current setup requirements before activating customer chat.',true);return;}var refused=null,focusAllowed=websiteFocusGuard(this);websiteChange(async function(generation){try{await action(actionName==='resume_web'?'resume':'go_live');}catch(error){if(error.code!=='ai_daily_limit')throw error;refused=await websiteLimitRefused(error,generation);return;}if(generation!==portalGeneration||leaving)return;await websiteRead();if(generation===portalGeneration&&!leaving)websiteMessage('Website chat is active. Continue with your website check.');}).then(function(){var allowed=focusAllowed(),held=focusAllowed.lastFocused,primary=$('websiteInstallPrimary'),message=$('websiteInstallMessage');if(refused===null)return;if(!allowed){if(held&&held.id&&held.id!=='websiteInstallPrimary'&&held!==document.body&&!held.isConnected&&(!document.activeElement||document.activeElement===document.body)){var again=$(held.id);if(again&&!again.disabled&&again.getClientRects().length)again.focus({preventScroll:true});}return;}if(refused&&!primary.hidden&&!primary.disabled&&!['activate_web','resume_web'].includes(primary.dataset.action))primary.focus({preventScroll:true});else{message.tabIndex=-1;message.focus({preventScroll:true});}});}});
  $('websiteCalendarConnect').addEventListener('click',function(){if(leaving)return;document.dispatchEvent(new CustomEvent('mc:service-guide',{detail:{service:'calendar'}}));});
  $('websiteInstallAlready').addEventListener('click',websiteStart);$('websiteInstallRefresh').addEventListener('click',function(){websiteChange(async function(generation){await websiteRead();if(generation===portalGeneration&&!leaving)websiteMessage(websiteReadMessage());});});$('websiteInstallHandoff').addEventListener('click',function(){websiteCopy(true);});

  function homeFollowupRows(d){var selfService=d.client?.onboarding?.version===1;return (d.leads||[]).filter(function(l){return (!selfService||!l.websiteSetupCheck&&!l.simulation)&&(selfService&&l.followthrough?l.followthrough.needsFollowup||!!l.alertWaiting:l.status==='open'&&(l.alertWaiting||l.overdueAt||l.outcome==='needs_action'||l.outcome==='wants_call'));});}
  function supportNotice(c) { var n = c && c.lifecycleNotice; return n && n.by === 'support' && ['pause','resume','cancel','reopen'].indexOf(n.action) >= 0 ? n : null; }
  function supportNoticeText(n) {
    var verb = { pause: 'Paused', resume: 'Resumed', cancel: 'Stopped', reopen: 'Reopened' }[n.action], when = n.at ? new Date(n.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    return verb + ' by Machines & Cloud support' + (when ? ' on ' + when : '') + ': ' + n.summary + (n.message ? ' ' + n.message : '');
  }
  function ownerCanReopen(c) { if (['cancelled','archived'].indexOf(c.status) < 0 || c.erasureStartedAt) return false; var by = c.cancelledBy; return !(by && by.role === 'operator') || (by.ownerMayReopen === true && by.category !== 'policy_review'); }
  // QA-LIFE D1: reopen waits until phone and texting work from before the stop has registered it.
  var SHUTDOWN_FINISHING = 'We are still finishing the shutdown of phone and texting setup from before the stop. You can reopen once that completes, usually within a few minutes.';
  function renderLifecycleNotice(d) {
    var c = d && d.client, n = supportNotice(c), box = $('supportLifecycleNotice'), stopped = c && c.onboarding && c.onboarding.version === 1 && ['cancelled','archived'].indexOf(c.status) >= 0;
    if (!n && !stopped) { if (box) box.hidden = true; return; }
    if (!box) { box = document.createElement('div'); box.id = 'supportLifecycleNotice'; box.className = 'desk-support-lifecycle'; box.setAttribute('role', 'status'); box.style.cssText = 'border:1px solid #f0c36d;background:#fff8e6;border-radius:12px;padding:12px 16px;margin:0 0 16px;color:#3b2a05'; var anchor = $('workspaceGuide'); anchor.parentNode.insertBefore(box, anchor); }
    box.hidden = false; box.innerHTML = (n ? '<strong>' + esc(supportNoticeText(n)) + '</strong><br><span>' + esc(n.nextStep || '') + '</span>' : '<strong>Your front desk is stopped.</strong><br><span>' + (ownerCanReopen(c) ? 'Your saved records and answers are kept. You can reopen this workspace from Account.' : 'Your saved records are kept. Contact support to discuss reopening.') + '</span>') + (stopped && ownerCanReopen(c) && d.lifecycleCleanupPending ? '<br><span data-shutdown-finishing>' + esc(SHUTDOWN_FINISHING) + '</span>' : '') + (stopped && ownerCanReopen(c) ? ' <button type="button" class="btn-pill btn-pill-blue btn-sm" id="homeReopen">Go to Account</button>' : '');
    if ($('homeReopen')) $('homeReopen').onclick = function () { routeTo('account'); };
  }
  function renderHomeNext(d) {
    renderLifecycleNotice(d);
    var guide=$('workspaceGuide'),button=$('nextSetupAction'),setup=d&&d.setup,client=d&&d.client;
    guide.dataset.needed='false';button.hidden=false;delete button.dataset.anchor;delete button.dataset.service;$('homeSetupSecondaryWrap').hidden=true;$('homeSetupReminder').hidden=true;$('homeSetupSecondary').hidden=true;delete $('homeSetupSecondary').dataset.anchor;delete $('homeSetupSecondary').dataset.service;
    if(!setup||!client||['cancelled','archived'].includes(client.status)){document.body.dataset.homeMode='work';if(!homeActivityChosen)$('homeActivityDetails').open=true;if(document.body.dataset.activePage==='today'){$('pageTitle').textContent=pageCopy.today[1];$('pageDescription').textContent=pageCopy.today[2];}syncNextActionVisibility();return;}
    var next,rows=(setup.connectionJourney?.channels||[]).filter(function(row){return row.requested||row.retained;}),blockers=setup.channels?.web?.blockers||[];
    var modelUnavailable=blockers.some(function(row){return row.id==='model';}),practiceAvailable=!modelUnavailable&&(!d.aiAllowance||d.aiAllowance.private.remaining>0);
    if(cfgDirty||cfgConflict||cfgBusy)next={title:cfgConflict?'Review your saved changes':cfgBusy?'Your changes are being saved':'Finish your business edits',detail:cfgConflict?'Your draft is kept. Compare it with the latest saved details before continuing.':cfgBusy?'Any newer typing stays in your draft.':'Save your draft, then review the answers customers should hear.',label:'Open business details',tab:'know'};
    // Only an owner with no saved service choices still has to choose them (the same rule as the Connections form in
    // desk-setup-guide.js hasPreparationForm). Choices saved during onboarding go straight to their connection steps below.
    else if(setup.connectionPreparation?.eligible===true&&setup.connectionPreparation.prepared!==true&&!setup.connectionPreparation.selectionSaved&&!(setup.connectionPreparation.desiredChannels||[]).length)next={title:'Prepare your services',detail:'Choose your services and website once, then review the answers your front desk will use.',label:'Prepare my services',tab:'setup',anchor:'setupGuide'};
    else if(preferenceDirty)next={title:'Finish your connection choices',detail:'Your current choices are kept on this page. Save them or return to your saved choices.',label:'Review connection choices',tab:'setup',anchor:'connectionPreferencesDetails'};
    else {
      var ownerRows=rows.filter(function(row){return row.responsibility==='customer'&&row.action&&row.action.kind!=='wait';});
      var row=ownerRows.find(function(row){return row.action.kind==='route'&&row.action.target==='know';})||ownerRows.find(function(row){return row.action.kind==='route'&&row.action.target==='test'&&practiceAvailable;});
      if(row)next=row.action.target==='know'?{title:'Check your business details',detail:'Confirm your services, hours and the answers your front desk should use.',label:'Review business details',tab:'know'}:{title:'See your front desk in action',detail:'Try a private customer question using your saved details.',label:'Test your answers',tab:'test'};
      if(!next){row=ownerRows.find(function(row){if(row.action.kind==='route'&&row.action.target==='test')return false;if(row.id==='web'){var w=d.websiteInstallation;return !w||w.observation?.state!=='found'||w.setupRequest?.state!=='complete'||w.customerChat?.state!=='active';}return true;});
        if(row)next={title:row.id==='web'?'Get your website ready for customers':'Continue '+row.label.toLowerCase(),detail:row.id==='web'?'Add chat to your website, check the installation and see your first request arrive here.':row.nextStep||row.detail,label:row.id==='web'?'Continue website setup':'View next step',tab:'setup',service:row.id,anchor:'setupGuide'};
      }
      if(!next){var waiting=rows.find(function(row){return ['platform','carrier'].includes(row.responsibility)&&!row.active;});if(waiting)next={title:waiting.responsibility==='carrier'?'Your registration is being reviewed':'Your setup progress',detail:waiting.nextStep||waiting.detail};}
    }
    var followup=homeFollowupRows(d),workFirst=followup.length>0&&!cfgDirty&&!cfgConflict&&!cfgBusy&&!preferenceDirty;
    if(workFirst){
      var setupNext=next;
      next={title:followup.length===1?'A customer request needs your attention':followup.length+' customer requests need your attention',detail:'Review the saved details and record what happens next.',label:'Open customer requests',tab:'leads'};
      if(setupNext){$('homeSetupSecondaryWrap').hidden=false;$('homeSetupReminder').hidden=false;$('homeSetupReminder').textContent='Setup also needs attention: '+setupNext.title+'.';if(setupNext.tab){var secondary=$('homeSetupSecondary');secondary.hidden=false;secondary.textContent=setupNext.label||'Continue setup';secondary.dataset.route=setupNext.tab;if(setupNext.anchor)secondary.dataset.anchor=setupNext.anchor;if(setupNext.service)secondary.dataset.service=setupNext.service;}}
    }
    if(next){guide.dataset.needed='true';$('guideTitle').textContent=next.title;$('guideIntro').textContent=next.detail;button.hidden=!next.tab;button.textContent=next.label||'';button.dataset.route=next.tab||'';if(next.anchor)button.dataset.anchor=next.anchor;if(next.service)button.dataset.service=next.service;}
    var selfService=client.onboarding?.version===1,customerRecord=function(row){return !selfService||!row.websiteSetupCheck&&!row.simulation&&!row.ownerVisitCreationAborted;};
    var hasWork=(d.leads||[]).some(customerRecord)||(d.bookings||[]).some(customerRecord)||(d.conversations||d.convs||[]).some(customerRecord)||!selfService&&(Number(d.today?.needsYou)>0||Number(d.today?.bookings)>0);
    var preparing=guide.dataset.needed==='true'&&!hasWork&&!['live','paused'].includes(client.status);
    document.body.dataset.homeMode=preparing?'setup':'work';
    if(!homeActivityChosen)$('homeActivityDetails').open=!preparing;
    $('homeActivitySummary').textContent=hasWork?'Requests, visits and conversations saved in your workspace':'No customer activity yet. Saved requests will appear here.';
    if(document.body.dataset.activePage==='today'){
      $('pageTitle').textContent=preparing?'Get your front desk ready':'Your day, at a glance';
      $('pageDescription').textContent=preparing?'Your business answers are saved. Follow the next step, then connect the services you choose.':pageCopy.today[2];
    }
    var inboxEmpty=$('leads').querySelector('.desk-empty');$('inboxSetupAction')?.remove();
    if(inboxEmpty&&selfService&&!hasWork&&next&&!['live','paused','cancelled','archived'].includes(client.status)&&!historyIncomplete(d.recordListing||{})){
      var inboxAction=document.createElement('button');inboxAction.id='inboxSetupAction';inboxAction.type='button';inboxAction.className='desk-empty-action';inboxAction.textContent=next.label||'View setup progress';inboxAction.dataset.route=next.tab||'setup';if(next.anchor)inboxAction.dataset.anchor=next.anchor;if(next.service)inboxAction.dataset.service=next.service;inboxEmpty.querySelector('div:last-child').appendChild(inboxAction);
    }
    // Booked visits live in Schedule. Point to recent ones from Home and from an empty Inbox.
    var recentVisits=selfService?(d.bookings||[]).filter(function(row){var at=Date.parse(row.createdAt);return customerRecord(row)&&row.status!=='cancelled'&&Number.isFinite(at)&&Date.now()-at<=7*864e5;}).length:0,visitText=recentVisits===1?'1 visit was booked in the last 7 days.':recentVisits+' visits were booked in the last 7 days.';
    if($('homeNewVisits')){$('homeNewVisits').hidden=!recentVisits;$('homeNewVisitsText').textContent=recentVisits?visitText+' Booked visits are kept in Schedule.':'';}
    $('inboxVisitAction')?.remove();
    if(inboxEmpty&&recentVisits&&inboxEmpty.querySelector('strong')?.textContent==='No customer requests yet'){inboxEmpty.querySelector('strong').textContent='No requests to follow up';inboxEmpty.querySelector('div:last-child p').textContent=visitText+' Booked visits are kept in Schedule; new customer requests appear here.';var visitAction=document.createElement('button');visitAction.id='inboxVisitAction';visitAction.type='button';visitAction.className='desk-empty-action';visitAction.dataset.route='availability';visitAction.textContent='Open Schedule →';inboxEmpty.querySelector('div:last-child').appendChild(visitAction);}
    syncNextActionVisibility();
  }
  function reviewRequirements(d) {
    var required=d?.setup?.reviewRequirements;
    return required||{fieldErrors:{},blockers:(d?.setup?.channels?.web?.blockers||[]).filter(function(row){return ['knowledge','rules','handoff'].includes(row.id);})};
  }
  function reviewShowErrors(errors) {
    // An older unsafe route may live in an otherwise optional, hidden setting.
    // Expose only the exact fields the server requires the owner to correct.
    if(!cfgClosed)Object.keys(errors).forEach(function(name){var field=cfgField(name);if(!field)return;field.disabled=false;var parent=field.parentElement;while(parent&&parent!==$('cfg')){if(parent.classList.contains('form-group'))parent.hidden=false;if(parent.id==='transferGroup')parent.style.display='block';if(parent.tagName==='DETAILS')parent.open=true;parent=parent.parentElement;}});
    cfgShowErrors(errors);
  }
  function reviewState(d) {
    if(!d||!d.setup)return;
    var required=reviewRequirements(d),fields=Object.keys(required.fieldErrors||{}),blocked=!!required.blockers.length,reviewed=d.client.setupProof?.reviewedRevision===d.setup.revision;
    $('reviewRules').disabled=leaving||reviewBusy||websiteBusy||cfgDirty||cfgBusy||acctBusy||cfgClosed||['cancelled','archived'].includes(d.client.status);
    $('reviewRules').dataset.reviewBlocked=String(blocked);
    $('reviewRules').textContent=fields.length?'Complete business details':blocked?'Check preparation':'Confirm business details';
    $('reviewCard').dataset.reviewState=blocked?'incomplete':reviewed?'confirmed':'needs_confirmation';
    $('reviewHeading').textContent=fields.length?'Finish your business details':blocked?'Your business profile is being prepared':reviewed?'Business details confirmed':'Confirm your business details';
    $('reviewIntro').textContent=fields.length?'Complete the items below and save your changes. Then confirm the answers your front desk should use.':blocked?required.blockers.map(function(row){return row.detail;}).join(' '):reviewed?'Your saved answers are confirmed for this version. You can edit them below.':'Check your services, hours and contact details below, then confirm these are the answers your front desk should use.';
    $('reviewNeeds').hidden=!fields.length;
    $('reviewNeeds').innerHTML=fields.map(function(field){return '<li><button type="button" data-review-field="'+esc(field)+'">'+esc(required.fieldErrors[field])+'</button></li>';}).join('');
    $('reviewMessage').textContent=reviewBusy?(blocked?'Checking preparation…':'Saving your review…'):websiteBusy?'Wait for your website setup to finish updating.':cfgDirty||cfgBusy||acctBusy?'Save your edits before reviewing this version.':blocked?'Your saved draft is kept. Complete the required details before continuing.':reviewed?'Review saved for the current version.':'';
    cfgWebNext();
    document.dispatchEvent(new CustomEvent('mc:guide-state-change'));
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
    $('status').textContent = client.status === 'cancelled' ? 'Service cancelled' : client.status === 'paused' ? 'Front desk paused' : limited ? (allowance.web.platformLimited ? 'Shared AI limit reached' : 'Daily AI allowance reached') : operational ? 'Website chat active' : 'Setup in progress';
    $('status').className = 'st' + (operational ? ' live' : '');
    renderHomeNext(d);
    $('setupSteps').replaceChildren();$('setupSteps').hidden=true;
    reviewState(d);
    $('aiAllowance').textContent = allowance ? 'AI replies left today: ' + allowance.private.remaining + ' practice · ' + allowance.web.remaining + ' customer chat. Practice never uses customer chat replies. Both reset at midnight Houston time.' + (allowance.web.platformLimited || allowance.private.platformLimited ? ' Today’s shared platform limit is used, not your own allowance; our team has been shown this.' : '') + (allowance.reconciliation ? ' ' + allowance.reconciliation : '') : '';
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
  document.addEventListener('mc:connection-select',async function(event){
    var service=event.detail?.service,generation=portalGeneration,confirmed=false;
    if(!['web','voice','sms','calendar'].includes(service)||!data||leaving||['paused','cancelled','archived'].includes(data.client.status))return;
    if(preferenceBusy){document.dispatchEvent(new CustomEvent('mc:connection-selected',{detail:{service:service,confirmed:false}}));return;}
    var selected=Array.from(new Set(preferenceBaseline.concat(service))).sort();
    preferenceBusy=true;
    var field=$('connectionPreferences').querySelector('input[value="'+service+'"]');if(field)field.checked=true;
    preferenceState();
    try{
      if(!(data.client.onboarding.desiredChannels||[]).includes(service))await action('save_connection_preferences',{desiredChannels:selected});
      if(leaving||generation!==portalGeneration)return;
      var prior=data;await load(null,{soft:true});
      confirmed=!leaving&&generation===portalGeneration&&data!==prior&&(data.client.onboarding.desiredChannels||[]).includes(service);
    }catch(error){
      if(leaving||generation!==portalGeneration)return;
      if(error.status===401||error.status===403){document.dispatchEvent(new CustomEvent('mc:session-expired'));return;}
      // Selecting a service grants no provider authority. Reconcile its saved
      // preference before allowing this click to open a connection action.
      var before=data;await load(null,{soft:true});
      confirmed=!leaving&&generation===portalGeneration&&data!==before&&(data.client.onboarding.desiredChannels||[]).includes(service);
    }finally{
      if(!leaving&&generation===portalGeneration){preferenceBusy=false;preferenceState();document.dispatchEvent(new CustomEvent('mc:connection-selected',{detail:{service:service,confirmed:confirmed}}));}
    }
  });
  $('reviewRules').addEventListener('click', async function () {
    if (!data || !data.setup || leaving || reviewBusy || websiteBusy || cfgDirty || cfgBusy || acctBusy || cfgClosed || ['cancelled','archived'].includes(data.client.status)) return;
    var required=reviewRequirements(data);
    if(Object.keys(required.fieldErrors||{}).length){reviewShowErrors(required.fieldErrors);return;}
    var generation=portalGeneration,errorMessage=null,revision=data.setup.revision,confirmed=false;reviewBusy=true;cfgFence++;reviewState(data);
    try{if(required.blockers.length){await latestWorkspaceRead();return;}await action('review_rules',{revision:revision});if(leaving||generation!==portalGeneration)return;cfgFence++;await latestWorkspaceRead();confirmed=data?.setup?.revision===revision&&data.client.setupProof?.reviewedRevision===revision&&!reviewRequirements(data).blockers.length;}
    catch(error){if(leaving||generation!==portalGeneration)return;if(error.status===401||error.status===403){document.dispatchEvent(new CustomEvent('mc:session-expired'));return;}errorMessage=error.message;if(error.fieldErrors)reviewShowErrors(error.fieldErrors);}
    finally{if(!leaving&&generation===portalGeneration){reviewBusy=false;reviewState(data);if(errorMessage)$('reviewMessage').textContent=errorMessage;if(confirmed&&!cfgDirty&&!cfgBusy&&!acctBusy)document.dispatchEvent(new CustomEvent('mc:guide-step-complete',{detail:{step:'business',revision:revision,slug:slug}}));}}
  });
  $('reviewNeeds').addEventListener('click',function(event){var button=event.target.closest('[data-review-field]');if(!button||leaving)return;var required=reviewRequirements(data),field=button.dataset.reviewField;if(!Object.hasOwn(required.fieldErrors||{},field))return;var errors={};errors[field]=required.fieldErrors[field];reviewShowErrors(errors);});
  $('copySnippet').addEventListener('click', function () { websiteCopy(false); });
  var tour = [
    { title: 'Your day, at a glance', body: 'Home shows requests, visits and work that needs your attention. Use Inbox for customer messages, Schedule for visits and Front desk for setup.', action: 'Explore Home', tab: 'today', target: 'todayTourSummary', compact: 'todayTourHeading', tiny: 'todayTourHeading' },
    { title: 'Make it sound like your shop', body: 'Your services, hours, prices and safety instructions guide every answer. Open a section to check or edit it, then review the saved version.', action: 'Review business details', tab: 'know', target: 'reviewCard', compact: 'businessProfileTourHeading', tiny: 'businessProfileTourTitle' },
    { title: 'Try it before customers do', body: 'Test answers with a customer question or visit request. This private conversation previews the details collected without real bookings, messages or calendar changes.', action: 'Open Test answers', tab: 'test', target: 'chatForm', compact: 'chatForm', tiny: 'chatIn' },
    { title: 'Plan your work', body: 'See saved visits and blocked time together. Choose a day to add or manage a visit, or block time for other work.', action: 'Explore Schedule', tab: 'availability', target: 'scheduleCalendar', compact: 'calendarRangeTitle', tiny: 'calendarRangeTitle', fallback: 'pageTitle' },
    { title: 'Connect your services', body: 'Choose the services you want to use. Each guide keeps your saved details and shows the next step, including any permissions or provider checks.', action: 'Explore Connections', tab: 'setup', target: 'setupGuide', compact: 'setupGuideServices', tiny: 'pageTitle', fallback: 'pageTitle' },
    { title: 'Find your customer requests', body: 'Inbox keeps customer requests and conversations together. Review what the customer needs, then confirm the next step directly. Saved visits are in Schedule.', action: 'View Requests', tab: 'leads', target: 'requestTourHeading', compact: 'requestTourHeading', tiny: 'requestTourHeading' }
  ];
  var defaultTour = tour.slice(), tourRevealedDetails = [];
  var tourIndex = 0, returnFocus = null, tourOrigin = null, tourActive = false, tourEpoch = 0, tourFrame = 0, tourGeneration = 0, tourAnchor = null, tourObserver = null, tourResize = null, tourAnimation = null, tourWebsiteOpen = null;
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
    var anchor = tourAnchor, opener = returnFocus, origin = tourOrigin; tourOrigin = null; tourCleanup(); if ($('guideDialog').open) $('guideDialog').close();
    if (remember !== false) try { localStorage.setItem('mc-walkthrough-v1:' + slug, 'seen'); } catch (error) { /* Preference only, never setup proof. */ }
    if (restore === false || leaving) return;
    // Closed in the page: step back off the tour's own entry once the opening page is restored.
    var tourEntry = remember !== false && history.state && history.state.mcTour;
    // An owner closing the tour (Close, Skip, Esc, Finish) returns to the page and route it was opened from. Navigation during the tour keeps the new page.
    if (remember !== false && origin && pageCopy[origin.tab] && document.body.dataset.activePage !== origin.tab) { showTab(origin.tab); history.replaceState(history.state, '', location.pathname + location.search + (origin.hash || '#' + origin.tab)); deskRoutedHref = location.href; window.scrollTo({ top: origin.scroll, behavior: 'instant' }); }
    var destination = tourVisible(opener) ? opener : tourVisible(anchor) ? anchor.querySelector('h2,h3,h4') || anchor.closest('.card2')?.querySelector('h2,h3,h4') || anchor : $('pageTitle');
    if (tourVisible(destination)) { destination.scrollIntoView({ block: 'nearest', behavior: 'instant' }); tourFocus(destination); }
    if (tourEntry) { tourHistoryBack = true; deskStepBackFocus = { node: document.activeElement, scroll: window.scrollY }; history.back(); }
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
    var primary = $(step.target), compact = $(step.compact); if (step.tab === 'setup' && !tourVisible(compact)) compact = $('setupGuideTitle'); var missing = !tourVisible(primary) && !tourVisible(compact), anchor = tourVisible(primary) ? primary : tourVisible(compact) ? compact : $(step.fallback) || $('pageTitle');
    if (!tourVisible(anchor)) { closeTour(false, false); return; }
    coach.style.width = Math.min(344, width - edge * 2) + 'px'; coach.style.maxHeight = Math.max(100, height - edge * 2) + 'px';
    var card = coach.getBoundingClientRect(), rect = anchor.getBoundingClientRect(), horizontal = Math.max(rect.left - vx, vx + width - rect.right) >= card.width + gap + edge;
    if (!horizontal && rect.height + card.height + gap + edge * 2 > height && tourVisible(compact)) anchor = compact;
    if (!horizontal && height < 330 && tourVisible($(step.tiny))) anchor = $(step.tiny);
    if (scroll) { rect = anchor.getBoundingClientRect(); window.scrollTo({ top: Math.max(0, window.scrollY + rect.top - vy - edge - 8), behavior: 'instant' }); }
    rect = anchor.getBoundingClientRect();
    var left = Math.max(vx + 6, rect.left - 7), top = Math.max(vy + 6, rect.top - 7), right = Math.min(vx + width - 6, rect.right + 7), bottom = Math.min(vy + height - 6, rect.bottom + 7);
    if (height < 330) bottom = Math.min(bottom, top + 44);
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
    showTab(step.tab); window.__tabPicked = true; history.replaceState(history.state && history.state.mcTour ? history.state : null, '', location.pathname + location.search + '#' + step.tab); deskRoutedHref = location.href;
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
    if (tourActive) return; returnFocus = document.activeElement; tourOrigin = { tab: document.body.dataset.activePage, hash: location.hash, scroll: window.scrollY }; tourActive = true; tourGeneration = portalGeneration;
    // The tour has one history entry of its own, so Back closes it on the page it was opened from.
    try { history.pushState({ mcTour: true }, '', location.href); } catch (error) { /* The tour still works without history. */ }
    document.body.classList.add('guide-tour-open'); $('guideDialog').dataset.tourReady = 'false'; $('guideDialog').showModal();
    window.addEventListener('resize', scheduleTour); window.addEventListener('scroll', scheduleTour, true); window.addEventListener('hashchange', tourNavigation); window.addEventListener('popstate', tourNavigation); tourMotion.addEventListener('change', tourReducedMotion);
    if (window.visualViewport) { visualViewport.addEventListener('resize', scheduleTour); visualViewport.addEventListener('scroll', scheduleTour); }
    tourObserver = new MutationObserver(scheduleTour); tourObserver.observe($('portalContent'), { childList: true, subtree: true });
    if (window.ResizeObserver) { tourResize = new ResizeObserver(scheduleTour); tourResize.observe($('tourCoach')); }
    renderTour();
  }
  $('openGuide').addEventListener('click', function () { if(tourActive)return; tour = defaultTour.slice(); tourIndex = 0; openTour(); });
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
    $('accountEmail').textContent = c.owner.email || 'Not available'; $('accountPhone').textContent = c.owner.phone ? ownerPhone(c.owner.phone) : 'Not saved';
    $('accountEditContact').hidden = closed; $('accountReporting').hidden = selfService || closed; $('workspaceMaintenance').hidden = !selfService || closed;
    var webActive = !!d.webAvailable && !!d.setup?.channels?.web?.ready && !!d.setup?.channels?.web?.active;
    var rows = d.setup?.connectionJourney?.channels || [], active = rows.filter(function (row) { return row.id === 'web' ? webActive : row.active; });
    $('accountServiceStatus').textContent = closed ? 'Service stopped' : paused ? 'Paused' : active.length ? 'Services connected' : c.status==='live' ? (selfService?'Check connections':'Workspace active') : 'Setup in progress';
    var notice = supportNotice(c), finishing = closed && selfService && ownerCanReopen(c) && d.lifecycleCleanupPending ? ' ' + SHUTDOWN_FINISHING : '';
    $('accountServiceSummary').textContent = (notice && (closed || paused || ['resume','reopen'].indexOf(notice.action) >= 0) ? supportNoticeText(notice) + ' ' + (notice.nextStep || '') : closed ? 'Your front desk is stopped. Saved customer records are still available to download.' : paused ? 'Your front desk is paused: website chat, calls and texts are not answered. Calls may still ring your saved contact cell. Your Inbox, visits, settings and downloads keep working.' : active.length ? 'Check each connection below. A saved visit or message has its own delivery status.' : c.status==='live' ? 'Check Connections for each service’s readiness and next steps.' : 'Your workspace is saved. Continue setup to prepare the services you want to use.') + finishing;
    var labels = {not_selected:'Not selected',needs_action:'Setup needed',pending_activation:'Not connected',waiting_platform:'Waiting for service',waiting_carrier:'Carrier review',working:'Setup in progress',needs_attention:'Needs attention',checking:'Checking saved result',checking_status:'Checking saved status',cleanup_pending:'Checking cleanup',cleanup_uncertain:'Checking cleanup',cancel_pending:'Checking cleanup',cancelled:'Disconnected',closed:'Stopped',paused:'Paused',ready_for_website:'Website setup needed'};
    $('accountConnectionSummary').innerHTML = rows.map(function (row) {
      var relevant = row.requested || row.retained || row.active, label = labels[row.status] || 'Check Connections';
      if (closed && relevant) label = 'Stopped';
      else if (paused && relevant) label = row.pausedService === false ? (row.activation?.blockedBy === 'machines_and_cloud' ? 'Setup with our team' : 'Not set up yet') : 'Paused';
      else if (row.id === 'web' && webActive) label = 'Customer chat enabled';
      else if (row.id === 'calendar' && d.connections?.calendar?.connected) label = d.connections.calendarDelivery?.enabled ? 'Permission saved · sync enabled' : 'Permission saved · sync waiting';
      else if (row.active) label = 'Connection verified';
      return '<div><dt>' + esc(row.label) + '</dt><dd>' + esc(label) + '</dd></div>';
    }).join('');
    $('accountConnectionSummary').hidden = !rows.length;
    var buttons = '';
    if (!closed) {
      if (paused && (!selfService || accountCanResume(d))) buttons += '<button type="button" class="btn-pill btn-pill-blue btn-sm" id="resume">Resume front desk</button>';
      else if (!selfService && !paused && ['testing','draft'].includes(c.status)) buttons += '<button type="button" class="btn-pill btn-pill-blue btn-sm" id="golive">Go live</button>';
      else buttons += '<button type="button" class="btn-pill btn-pill-blue btn-sm" id="accountConnections">' + (paused ? 'View resume requirements' : active.length || c.status === 'live' ? 'Manage connections' : 'Continue setup') + '</button>';
      if (!paused && ['live','testing'].includes(c.status) && (c.status === 'live' || active.length || rows.some(function(row){return row.retained;}))) buttons += '<button type="button" class="btn-pill btn-pill-dark btn-sm" id="pause">Pause front desk</button>';
    } else buttons = (selfService && ownerCanReopen(c) ? '<button type="button" class="btn-pill btn-pill-blue btn-sm" id="reopenWorkspace">Reopen your workspace</button>' : '') + '<a class="btn-pill btn-pill-dark btn-sm" href="mailto:support@machinesandcloud.com">Contact support</a>';
    var off = d.forwarding?.off;
    if ((paused || closed) && Array.isArray(off) && off.length) buttons += '<div class="desk-account-forwarding muted">To stop carrier forwarding: ' + off.map(function (code) { return '<a href="tel:' + encodeURIComponent(code) + '">Dial ' + esc(code) + '</a>'; }).join(' · ') + '</div>';
    $('liveBtns').innerHTML = buttons;
    var resumeRequirement = d.aiAllowance && !d.aiAllowance.available ? 'Today’s AI allowance is exhausted. It resets at midnight Houston time; your saved review and test are kept.' : d.setup?.channels?.web?.blockers?.[0]?.detail || 'Check the current website chat requirements under Front desk.';
    $('accountServiceScope').textContent = closed ? 'Stopping service does not delete your account or revoke saved provider permissions.' : paused && selfService && !accountCanResume(d) ? 'Website chat was on before pausing. ' + resumeRequirement : paused ? 'Resuming turns website chat back on if it was on before. Phone, texting and calendar come back after their usual checks.' : $('pause') ? 'Pausing stops your front desk from answering website chat, calls and texts. Calls may still ring your saved contact cell. Your Inbox, visits, settings and downloads keep working. Call forwarding on your phone does not change.' : 'Your saved service choices do not activate a connection. Continue setup to review what each service needs.';
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
    if ($('reopenWorkspace')) $('reopenWorkspace').addEventListener('click',function(){accountChange('reopen_workspace');});
  }
  function accountResultMatches(d, name, prior) {
    var state = d.client?.status || d.status;
    return name === 'reopen_workspace' ? state === 'testing' : name === 'cancel' ? state === 'cancelled' : name === 'pause' ? state === 'paused' : ['resume','go_live'].includes(name) ? state === 'live' : state === (prior === 'live' ? 'live' : 'testing');
  }
  function accountConfirmed(name) {
    accountUncertain = null;
    if (name === 'cancel' && $('cancelBox').open) $('cancelBox').close();
    accountMessage(name === 'reopen_workspace' ? 'Workspace reopened. Review your business details and run a private test before turning service back on.' : name === 'cancel' ? 'Service stopped. You can still download your saved records.' : name === 'pause' ? 'Front desk paused: website chat, calls and texts are not answered until you resume. Calls may still ring your saved contact cell. If your business line forwards calls here, turn off forwarding with your carrier so calls ring your phone directly.' : name === 'go_live' ? 'Activation saved. Check Connections for each service’s current status.' : 'Front desk resumed. Check Connections for each service’s current status.');
    $('accountServiceMessage').focus({preventScroll:true});
  }
  async function accountChange(name) {
    if (accountBusy || accountUncertain || leaving || !data) return;
    if ((name === 'resume_services' || name === 'resume') && (cfgDirty || cfgBusy || acctDirty || acctBusy || websiteDirty || websiteBusy)) { accountMessage('Save your edited business details before resuming.', true); return; }
    var generation = portalGeneration, prior = data.client.pausedFrom;
    accountBusy = true; accountMessage(name === 'reopen_workspace' ? 'Reopening workspace…' : name === 'cancel' ? 'Stopping service…' : name === 'pause' ? 'Pausing front desk…' : name === 'go_live' ? 'Activating front desk…' : 'Resuming front desk…'); renderAccount(data);
    var body = name === 'resume_services' || name === 'reopen_workspace' ? {expectedRevision:data.configurationRevision} : name === 'cancel' ? {reason:$('cancelReason').value} : {};
    try {
      var result = await action(name, body); if (generation !== portalGeneration || leaving) return;
      if (!accountResultMatches(result, name, prior)) throw new Error('The service change could not be confirmed.');
      accountConfirmed(name); await load();
    } catch (error) {
      if (generation !== portalGeneration || leaving) return;
      if (error.status === 401 || error.status === 403) { document.dispatchEvent(new CustomEvent('mc:session-expired')); return; }
      if (error.code === 'service_cleanup_pending') { accountMessage(error.message, false); await load(); }
      else if (error.status && error.status < 500) { accountMessage(error.message + ' No success was confirmed.', true); if(error.status===409)await load(); }
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

  var returnRoute;
  function load(snapshot, options) {
    options=options||{};
    var generation = portalGeneration, fence = cfgFence, sequence = ++loadSequence,refreshApplied=false;
    if(options.soft&&data&&!options.connectionProgress){$('inboxRefresh').hidden=false;$('inboxRefreshMessage').textContent='Checking for the latest requests…';$('inboxRefreshRetry').hidden=true;}
    loadPending = (snapshot && snapshot.client ? Promise.resolve(snapshot) : apiRequest()).then(function (d) {
      if (generation !== portalGeneration || fence !== cfgFence || sequence !== loadSequence || leaving) return;
      if (!d.client || !d.client.owner || !d.client.business) throw new Error('Your workspace could not be loaded. Sign in again to continue.');
      $('portalRecovery').hidden = true; $('portalContent').hidden = false; document.body.dataset.workspaceState = 'ready'; $('deskRail').hidden = false;
      data = d; var c = d.client;$('inboxRefresh').hidden=true;
      queueMicrotask(function () { if (!leaving && data === d) document.dispatchEvent(new CustomEvent('mc:desk', { detail: d })); });
      var windowChoice = $('availabilityWindow').value;
      $('availabilityWindow').innerHTML = '<option value="">Whole day</option>' + (c.windows || []).map(function (w) { return '<option value="' + esc(w) + '">' + esc(w) + '</option>'; }).join('');
      if ((c.windows || []).indexOf(windowChoice) >= 0) $('availabilityWindow').value = windowChoice;
      var houstonToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      $('availabilityDate').min = houstonToday; if (!$('availabilityDate').value) $('availabilityDate').value = houstonToday;
      renderAvailability(d.availabilityBlocks || []); renderPostVisitSettings(d);
      $('title').textContent = (c.business.name || 'Your front desk'); $('railBusiness').textContent = c.business.name || 'Your front desk';
      var selfService = c.onboarding && c.onboarding.version === 1;
      $('today').dataset.summaryScope=selfService?'workspace':'legacy';
      var historyListing = d.recordListing || {}, bookingsLimited = !!historyListing.bookings?.incomplete, leadsLimited = !!historyListing.leads?.incomplete, workLimited = historyIncomplete(historyListing);
      renderHistoryScope(d);
      var st = $('status'); st.textContent = c.status === 'live' ? 'live' : c.status === 'testing' ? 'testing, not live yet' : c.status; st.className = 'st' + (c.status === 'live' ? ' live' : '');
      st.textContent = c.status === 'live' ? 'live' : c.status === 'testing' ? 'testing, not live yet' : c.status === 'paused' ? 'paused: calls ring your phone, no texts, no chat' : c.status === 'cancelled' ? 'cancelled' : c.status;
      var offBtns = (d.forwarding && d.forwarding.off && d.forwarding.off.length && (c.status === 'paused' || c.status === 'cancelled')) ? '<div class="muted" style="margin-top:8px">Send calls back to your phone: ' + d.forwarding.off.map(function (k) { return '<a class="btn-pill btn-pill-dark btn-sm" style="margin:4px 6px 4px 0" href="tel:' + encodeURIComponent(k) + '">Dial ' + esc(k) + '</a>'; }).join('') + '<br>' + esc(d.forwarding.offLong || '') + '</div>' : '';
      var live = c.status === 'live'; $('tabToday').style.display = ''; $('tabTest').style.display = c.status === 'cancelled' ? 'none' : '';
      if (returnRoute === undefined) { returnRoute = takeReturnRoute(); if (returnRoute && !location.hash && !window.__tabPicked) { routeTo(returnRoute.slice(1).split('/')[0], returnRoute, true); window.__tabPicked = true; } }
      if (!location.hash && !window.__tabPicked) { showTab('today'); window.__tabPicked = true; }

      var needsFollowup=homeFollowupRows(d);
      $('needsYou').innerHTML = (function () { var rows = sortRequests(needsFollowup, selfService); return rows.length ? rows.slice(0, 10).map(function (l) { var urgent = requestUrgency(l); return '<div class="desk-attention-row"' + (urgent ? ' data-urgency="' + urgent + '"' : '') + '><div class="desk-attention-head"><strong>' + esc(l.customer_name || ownerPhone(l.phone) || 'Customer request') + '</strong>' + urgencyBadge(l, selfService) + (platformLeadLabel(l)?' <span class="tag brand-lockup">'+brandMark(l.platform.source)+esc(platformLeadLabel(l))+'</span>':'') + '</div><p class="desk-attention-issue">' + esc(l.issue || 'Details in the saved conversation') + '</p><div class="desk-attention-meta"><time datetime="' + esc(l.createdAt || '') + '">' + esc(recordTimeLabel(l.createdAt)) + '</time> · ' + esc(selfService && l.followthrough ? requestFollowLabel(l) : ownerWord(l.outcome)) + ' · Ref ' + esc(leadReference(l)) + '</div>' + (l.overdueAt ? '<span class="tag-overdue">Overdue callback</span>' : '') + humanHandoffStatus(l) + (selfService&&l.followthrough?' <button type="button" class="btn-pill btn-pill-dark btn-sm" data-request-open="'+esc(l.id)+'">View request</button>':'') + (l.alertWaiting ? ' <button type="button" class="btn-pill btn-pill-blue btn-sm ack" data-id="' + esc(l.id) + '">Acknowledge</button>' : '') + '</div>'; }).join('') : emptyState(workLimited ? 'No requests need attention in the records shown' : 'No requests need attention', workLimited ? 'Some history still needs checking. Contact support if you are looking for an earlier request.' : 'Requests that need a callback, an acknowledgment or urgent attention will appear here.', 'View customer requests', 'leads'); })();
      $('todayEvents').innerHTML = (d.events || []).filter(function (e) { return Date.now() - new Date(e.at).getTime() < 86400000; }).slice(0, 15).map(function (e) { return activityRow(e, d, false); }).join('') || emptyState('No front desk activity in the last 24 hours', 'New requests, visits and customer messages appear here. Your own follow-up notes stay with each request. Private practice is kept separate.');
      if(selfService){
        var visitsToday=d.bookings.filter(function(b){return b.date===houstonToday&&b.status!=='cancelled'&&!b.websiteSetupCheck&&!b.simulation&&!b.ownerVisitCreationAborted;}).length;
        $('today').innerHTML='<div><b>'+needsFollowup.length+'</b> Needs follow-up'+(leadsLimited?' · shown':'')+'</div><div><b>'+visitsToday+'</b> Visits today'+(bookingsLimited?' · shown':'')+'</div><div><b>'+d.conversations.length+'</b> Recent conversations'+(historyListing.conversations?.incomplete?' · shown':'')+'</div>';
        if($('homeServiceContext')){var webSelected=(c.onboarding.desiredChannels||[]).includes('web');$('homeServiceContext').textContent=c.status==='cancelled'?'Your service is cancelled. Saved records remain available.':c.status==='paused'?'Your front desk is paused: website chat, calls and texts are not answered. Calls may still ring your saved contact cell. Resume it in Account.':webSelected&&!d.webAvailable?'Website chat is not answering customers yet. Your saved requests stay available.':'';}
      }else{var t=d.today||{},h=d.health||{};$('today').innerHTML='<div><b>'+(t.calls||0)+'</b> calls</div><div><b>'+(t.texts||0)+'</b> texts in</div><div><b>'+(t.bookings||0)+'</b> booked today</div><div><b>'+(t.needsYou||0)+'</b> need you</div><div class="muted">Line: '+(h.errors24h?h.errors24h+' errors in 24 h':'OK')+'</div>';if($('homeServiceContext'))$('homeServiceContext').textContent='';}
      $('missing').textContent = (c.build && c.build.notes) ? c.build.notes : 'Nothing major.';
      // records
      $('bookings').innerHTML = d.bookings.length ? '<div class="tblwrap"><table class="tbl"><tr><th>When</th><th>Customer</th><th>Issue</th><th>Visit</th><th>Status</th><th>Ref</th>' + (selfService ? '<th>Manage</th>' : '') + '</tr>' + d.bookings.map(function (b) { return '<tr data-record-kind="bookings" data-record-id="'+esc(b.id)+'"><td>' + esc(recordTimeLabel(b.createdAt)) + '</td><td>' + esc(b.customer_name) + languageBadge(b) + (b.websiteSetupCheck?' <span class="tag">Setup check</span>':'') + ' <span class="muted">(' + (b.customerType === 'existing' ? 'existing' : 'new') + ')</span><br><span class="muted">' + esc(ownerPhone(b.phone)) + '</span>' + (b.unsure ? '<br><span class="muted">Unsure: ' + esc(b.unsure) + '</span>' : '') + '</td><td>' + esc(b.issue) + '<br><span class="muted">' + esc(b.address) + '</span></td><td>' + esc(visitDateLabel(b.date)) + ' ' + esc(b.window) + '</td><td>' + esc(visitStatusLabel(b)) + '</td><td><span title="' + esc(b.id) + '">' + esc(visitRef(b.id)) + '</span></td>' + (selfService ? '<td><button type="button" class="btn-pill btn-pill-dark btn-sm visit-open" data-visit="' + esc(b.id) + '">' + (b.pendingVisitChange ? 'Resume change' : 'View visit') + '</button></td>' : '') + '</tr>'; }).join('') + '</table></div>' : emptyState(bookingsLimited ? 'No visits in this view' : 'No visits yet', bookingsLimited ? 'Some visit history still needs checking. Contact support if you need an earlier visit.' : 'Saved visits appear here with their arrival window and job details.');
      $('newVisit').hidden=!selfService||!['testing','live','paused'].includes(c.status)&&!(d.pendingVisitCreations||[]).length; if(selfService)$('newVisit').textContent=(d.pendingVisitCreations || []).length?'Resume new visit':'Add visit';
      document.querySelectorAll('.visit-open').forEach(function (button) { button.addEventListener('click', function () { openVisit(button.dataset.visit); }); });
      var heldRequest = requestFilterHold && (d.leads || []).find(function (l) { return l.id === requestFilterHold; }); requestFilterHold = null;
      if (heldRequest) setRequestFilter(requestIsOpen(heldRequest, selfService) ? 'open' : 'done');
      renderRequests(d, selfService, leadsLimited);
      if (heldRequest && (!document.activeElement || document.activeElement === document.body)) { var heldRow = Array.from($('leads').querySelectorAll('[data-record-id]')).find(function (node) { return node.dataset.recordId === heldRequest.id; }); if (heldRow) { heldRow.dataset.recordFocus = 'true'; heldRow.tabIndex = -1; heldRow.focus({ preventScroll: true }); } }
      document.querySelectorAll('button.ack').forEach(function (b) { b.addEventListener('click', function () { apiRequest('POST', { action: 'ack', leadId: b.dataset.id }).then(function () { toast('Acknowledged.'); return load(); }).catch(function (error) { toast(error.message); }); }); });
      $('convs').innerHTML = renderConversations(d.conversations); $('bookingCount').textContent = d.bookings.length + (bookingsLimited ? ' shown' : ''); decorateRecordTables();
      supportObserve();
      // Background refreshes must never replace an edited or pending draft.
      if (!cfgDirty && !cfgBusy && !cfgConflict) {
        cfgFill(cfgFromClient(c)); cfgBaseline = cfgRead(); cfgRevision = d.configurationRevision; cfgEditRevision = d.editRevision; cfgClosed = !!(c.onboarding && c.onboarding.version === 1 && ['cancelled','archived'].includes(c.status));
        cfgStatus(cfgClosed ? 'error' : cfgIncomplete(d.setup) ? 'incomplete' : 'saved', cfgClosed ? 'This workspace no longer accepts business edits.' : cfgSavedMessage(d.setup));
        cfgRestoreExpired();
      }
      acctObserve(d, false);
      var u = d.usage || {}; $('usage').textContent = u.month ? 'Recorded legacy usage for ' + u.month + ': ' + (u.minutes || 0) + ' call minutes and ' + (u.texts || 0) + ' outbound texts. This is not a complete report of managed service usage or a bill.' : '';
      [['expBookings','bookings'],['expLeads','leads'],['expConvs','conversations'],['expCustomers','customers']].forEach(function (item) { $(item[0]).dataset.export = item[1]; });
      // setup
      $('snippet').textContent = '<script src="' + d.site + '/embed.js" data-client="' + c.slug + '" async><\/script>';
      $('calBtn').href = '/api/google/auth?c=' + encodeURIComponent(c.slug); $('calText').textContent = c.calendar.connected ? 'Connected.' : (d.integrations.google ? 'Bookings go on your Google Calendar once connected.' : ('Coming online; bookings reach you by ' + (((c.phone || {}).twilioNumber && (c.phone || {}).tenDlc === 'approved') ? 'text and email' : 'email') + ' meanwhile.')); if (!d.integrations.google) $('calBtn').addEventListener('click', function (e) { e.preventDefault(); toast('Calendar connection is being switched on. Bookings are texted to you meanwhile.'); });
      var ph = c.phone || {}, fw = d.forwarding || {}, dlc = ph.tenDlc || 'not_started';
      var dlcText = { not_started: 'Not filed yet.', waiting_keys: 'Being filed by Machines & Cloud.', needs_business_details: 'We need your legal business name, EIN, and address to file it. Add them below.', brand_pending: 'Filed. Carriers are reviewing your business (usually 1 to 2 weeks). Your front desk does not text customers until carriers approve your number; owner alerts come by email until then.', campaign_pending: 'Business approved. Carriers are reviewing the texting use case (one to six weeks). No customer texts until then.', approved: 'Approved. Your front desk texts customers from your number.', failed: 'The carriers rejected the filing. Steve has been notified and will fix it with you.' }[dlc] || dlc;
      $('numberText').textContent = ph.twilioNumber ? ph.twilioNumber + ' (calls you forward and all customer texts go here; you keep your main number).' : (c.provision && c.provision.status === 'running' ? 'Being set up now.' : 'Being assigned. You will get it by text and email.');
      $('fwd').innerHTML = ph.twilioNumber ? ('<p>' + esc(fw.carrier || 'Your carrier') + ': ' + (fw.codes && fw.codes.length ? fw.codes.map(function (k) { return '<a class="btn-pill btn-pill-dark btn-sm" style="margin:4px 6px 4px 0" href="tel:' + encodeURIComponent(k) + '">Dial ' + esc(k) + '</a>'; }).join('') : esc(fw.note || '')) + '</p><p>' + esc(fw.long || '') + '</p><p>' + (ph.forwardingVerified ? 'Verified: a forwarded call reached the front desk.' : 'Not verified yet. Call your own number from another phone, do not answer, and the front desk should pick up.') + ' <button type="button" class="btn-pill btn-pill-dark btn-sm" id="fwOk">I did this</button></p>') : '<p>Available once your number is assigned.</p>';
      var fwOk = $('fwOk'); if (fwOk) fwOk.addEventListener('click', function () { action('forwarding_verified').then(function () { toast('Thanks. We will confirm it on the first forwarded call.'); load(); }); });
      $('tenDlc').textContent = dlcText;
      var h = d.health || {}; var rel = function (iso) { if (!iso) return 'none yet'; var m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };
      $('health').innerHTML = '<div>Last inbound call: ' + rel(h.lastInboundCall) + '</div><div>Last inbound text: ' + rel(h.lastInboundText) + '</div><div>Last text delivered: ' + rel(h.lastOutboundText) + '</div><div style="color:' + (h.errors24h > 0 ? '#B91C1C' : 'inherit') + '">Errors in the last 24 h: ' + (h.errors24h || 0) + '</div><div>Texting from: ' + (h.sender === 'own' ? 'your number' : 'not yet (carriers have not approved your number)') + '</div>';
      var terms = d.policy && d.policy.privacy, termsURL; try { termsURL = new URL(terms, location.origin); } catch (error) { /* No valid customer terms were supplied. */ }
      $('accountTextingTerms').hidden = !terms || !termsURL || !/^https?:$/.test(termsURL.protocol); $('policyLink').href = termsURL && /^https?:$/.test(termsURL.protocol) ? termsURL.href : '#';
      var lg = (c.business && c.business.legal) || {}; var lf = $('legal');
      $('legalForm').style.display = (dlc === 'needs_business_details' || dlc === 'not_started' || dlc === 'failed') ? 'block' : 'none';
      lf.elements['legalName'].value = lg.legalName || ''; lf.elements['ein'].value = lg.ein || ''; lf.elements['businessType'].value = lg.businessType || 'llc'; lf.elements['street'].value = lg.street || ''; lf.elements['city'].value = lg.city || ''; lf.elements['state'].value = lg.state || 'TX'; lf.elements['zip'].value = lg.zip || '';
      $('voiceText').textContent = c.voice && c.voice.ready ? 'On. Forwarded calls are answered by your front desk, which books visits and texts you the details.' : (ph.twilioNumber ? 'Forwarded calls hear a short message and get a text back within seconds; the front desk continues by text. Live phone answering is being switched on.' : 'Available once your number is assigned.');
      $('siteBlock').textContent = ['Hours: ' + (weeklyHoursText(c.rules && c.rules.hours) || c.business.hours || '[your hours]') + (c.business.afterHours && !/ASK OWNER/i.test(c.business.afterHours) ? '. After hours: ' + c.business.afterHours : ''), 'Service area: ' + ((c.business.serviceArea || []).join(', ') || '[your area]'), (c.fees || []).length ? 'Pricing: ' + c.fees.map(function (x) { return x.label + ' ' + x.amount + (x.note ? ' (' + x.note + ')' : ''); }).join('; ') : '', '', (c.faq || []).filter(function (x) { return !/ASK OWNER/i.test(x.a); }).slice(0, 6).map(function (x) { return x.q + '\n' + x.a; }).join('\n\n')].filter(Boolean).join('\n');
      $('checklist').innerHTML = [
        ['ok', 'Front desk built from your website and answers'],
        [c.faq.some(function (x) { return /ASK OWNER/i.test(x.a); }) ? 'wait' : 'ok', 'Answers checked under What it knows'],
        [c.owner.phone ? 'ok' : 'wait', 'Your cell on file for lead texts'],
        [ph.twilioNumber ? 'ok' : 'wait', 'Front desk number assigned'],
        [ph.forwarding === 'none' ? 'ok' : (ph.forwardingVerified ? 'ok' : 'wait'), ph.forwarding === 'none' ? 'Phone: texts and chat only for now' : 'Call forwarding turned on from your cell (' + (ph.forwarding === 'all' ? 'all calls' : 'missed calls') + ')'],
        [dlc === 'approved' ? 'ok' : 'wait', 'Texting registration approved by carriers'],
        [(c.business.reviewLink || c.business.googlePlaceId) ? 'ok' : 'wait', 'Google review link added (review requests start only once it is there; the field is under You)'],
        [c.calendar.connected ? 'ok' : 'wait', 'Calendar connected (optional; bookings reach you by ' + (((c.phone || {}).twilioNumber && (c.phone || {}).tenDlc === 'approved') ? 'text and email' : 'email') + ' either way)'],
        [c.status === 'live' ? 'ok' : 'wait', 'Live on your website'],
      ].map(function (x) { return '<div class="check"><span class="dot ' + x[0] + '"></span><span>' + x[1] + '</span></div>'; }).join('');
      $('liveEvents').innerHTML = (d.events || []).length ? d.events.slice(0, 8).map(function (e) { return activityRow(e, d, true); }).join('') : 'No service activity yet. Practice conversations stay separate.';
      renderSetup(d); renderAccount(d);refreshApplied=true;
    }).catch(function (error) {
      if (generation !== portalGeneration || fence !== cfgFence || sequence !== loadSequence || leaving) return;
      if (error.status === 401 || error.status === 403) { document.dispatchEvent(new CustomEvent('mc:session-expired')); return; }
      if(options.soft&&data){if(!options.connectionProgress){$('inboxRefresh').hidden=false;$('inboxRefreshMessage').textContent='The latest requests could not be checked. Your saved view and edits are kept.';$('inboxRefreshRetry').hidden=false;}return;}
      if (fence === cfgFence) recover(error.name === 'AbortError' ? 'Loading timed out. Try again or sign in by email.' : error.message);
    }).finally(function(){if(options.connectionProgress&&generation===portalGeneration&&!leaving)document.dispatchEvent(new CustomEvent('mc:connection-progress-read',{detail:{requestId:options.connectionProgressRequest,slug:slug,ok:refreshApplied}}));});
    return loadPending;
  }
  function action(a, extra) { return apiRequest('POST', Object.assign({ action: a }, extra || {})); }
  function confirmAction(name, message) { return action(name).then(function () { toast(message); return load(); }).catch(function (error) { $('setupMessage').textContent = error.message; toast(error.message); }); }
  // Test text: a definite answer from the server (a 2xx/4xx JSON reply with ok:false or an error code) means nothing was
  // sent, so say so with its reason. Anything else (lost response, timeout, 5xx, unreadable body) is unknown: the text may
  // already be on its way. The button stays disabled while the request runs so one press sends at most one text.
  var testSmsReasons = { no_owner_phone: 'Add your contact cell in your business details first.', disabled: 'Texting is not set up for this workspace yet.', channel_not_active: 'This workspace does not send texts.', missing: 'Add your contact cell in your business details first.', opted_out: 'Your cell number has opted out of texts from this front desk.' };
  function testSmsOutcome(error) {
    if (error.status === 401 || error.status === 403) return error.message;
    if (typeof error.status === 'number' && error.status < 500 && error.code !== undefined || error.status === 200) { var reason = testSmsReasons[error.code] || (typeof error.code === 'string' && error.code && !/^[a-z0-9_]+$/.test(error.code) ? 'The texting provider refused it: ' + error.code.slice(0, 200).replace(/\.?$/, '.') : ''); return 'No test text was sent.' + (reason ? ' ' + reason : ''); }
    return 'We couldn’t confirm whether the test text was sent; check your phone before trying again.';
  }
  $('testSms').addEventListener('click', function () {
    var button = $('testSms'), status = $('smsText'), label = button.textContent; if (button.disabled || button.dataset.busy) return;
    button.dataset.busy = 'true'; button.disabled = true; button.setAttribute('aria-busy', 'true'); button.textContent = 'Sending test text…'; status.setAttribute('role', 'status'); status.textContent = '';
    action('test_sms').then(function () { status.textContent = 'Test text request accepted. Check your phone for delivery.'; }).catch(function (error) { status.textContent = testSmsOutcome(error); }).finally(function () {
      delete button.dataset.busy; button.removeAttribute('aria-busy'); button.textContent = label; button.disabled = false;
      if (button.isConnected && (!document.activeElement || document.activeElement === document.body)) button.focus({ preventScroll: true });
    });
  });

  $('cfg').elements['phone.forwarding'].addEventListener('change', function (ev) { document.getElementById('transferGroup').style.display = data?.client?.onboarding?.version === 1 || ev.target.value === 'all' ? 'block' : 'none'; });
  var cfgBaseline = null, cfgBusy = false, cfgConflict = null, cfgFence = 0, cfgClosed = false, cfgEventValues = new WeakMap();
  // When the session expires, unsaved Business details edits stay in this tab's sessionStorage (like the visit and support drafts):
  // only the changed fields and the values they were edited from. The next sign-in to this workspace in this tab restores them once.
  // If one of those fields was changed elsewhere meanwhile, the restored draft goes through the existing Check latest review.
  var cfgExpiredKey = 'mc-owner-details-draft-v1:' + slug, CFG_EXPIRED_MS = 24 * 3600 * 1000;
  function cfgKeepExpired() {
    if (!cfgBaseline || cfgClosed || !data || !$('cfg')) return false;
    var current = cfgRead(), changed = cfgChanges(current, cfgBaseline), edits = {}, base = {}; if (!changed.length) return false;
    changed.forEach(function (name) { edits[name] = current[name]; base[name] = cfgBaseline[name]; });
    try { sessionStorage.setItem(cfgExpiredKey, JSON.stringify({ version: 1, slug: slug, at: Date.now(), edits: edits, base: base })); return true; } catch (error) { return false; }
  }
  function cfgRestoreExpired() {
    var saved = null; try { saved = JSON.parse(sessionStorage.getItem(cfgExpiredKey) || 'null'); if (saved) sessionStorage.removeItem(cfgExpiredKey); } catch (error) { saved = null; }
    if (!saved || saved.version !== 1 || saved.slug !== slug || typeof saved.at !== 'number' || saved.at > Date.now() || Date.now() - saved.at > CFG_EXPIRED_MS || !saved.edits || !saved.base) return;
    if (cfgClosed || cfgDirty || cfgBusy || cfgConflict || !cfgBaseline) return;
    var names = Object.keys(saved.edits).filter(function (name) { return Object.hasOwn(cfgBaseline, name) && typeof saved.edits[name] === typeof cfgBaseline[name] && typeof saved.base[name] === typeof cfgBaseline[name]; }); if (!names.length) return;
    var moved = names.filter(function (name) { return !cfgSame(name, cfgBaseline[name], saved.base[name]); }), values = Object.assign({}, cfgBaseline);
    names.forEach(function (name) { values[name] = saved.edits[name]; }); cfgFill(values);
    if (moved.length) { var base = Object.assign({}, cfgBaseline); moved.forEach(function (name) { base[name] = saved.base[name]; }); cfgBaseline = base; cfgConflict = { latest: null }; $('cfgConflictPanel').hidden = false; $('cfgKeepEdits').hidden = true; }
    cfgChanged();
    cfgStatus(moved.length ? 'conflict' : 'dirty', moved.length ? 'Your unsaved edits from before your session expired are restored. Some of those details changed since then, so check the latest version before saving.' : 'Your unsaved edits from before your session expired are restored. Review them, then save.');
    // Focus on the page heading here comes from this same load's routing (the owner cannot have moved yet), so it moves too.
    var focused = document.activeElement; if (!focused || focused === document.body || focused === $('pageTitle') || focused === $('p-know')) { routeTo('know'); $('saveMsg').focus({ preventScroll: true }); }
  }
  var acctBaseline = null, acctBaseClient = null, acctRevision = null, acctEditRevision = null, acctDirty = false, acctBusy = false, acctConflict = null, acctEventValue = null;
  var cfgDays = ['mon','tue','wed','thu','fri','sat','sun'];
  var cfgDayNames = {mon:'Monday',tue:'Tuesday',wed:'Wednesday',thu:'Thursday',fri:'Friday',sat:'Saturday',sun:'Sunday'};
  // Days whose business-hours row is incomplete or out of order, with the field to focus and the fix to name (PRA-A11Y-02).
  function cfgHoursProblems(hours) {var ok=function(value,closing){return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)||closing&&value==='24:00';},out=[];cfgDays.forEach(function(day){var h=hours[day]||{};if(!h.open&&!h.close)return;if(!ok(h.open,false))out.push({day:day,kind:'open',text:cfgDayNames[day]+': add an opening time.'});else if(!ok(h.close,true)||h.close<=h.open)out.push({day:day,kind:'close',text:cfgDayNames[day]+': add a closing time later than the opening time.'});});return out;}
  function cfgHoursTable() {var hours={};cfgDays.forEach(function(day){hours[day]={};['open','close'].forEach(function(kind){var field=$('hoursRows').querySelector('[data-d="'+day+'"][data-k="'+kind+'"]'),value=field?field.value:'';hours[day][kind]=kind==='close'&&value==='00:00'?'24:00':value;});});return hours;}
  var cfgArrayFields = ['services','business.serviceArea','business.notServed','windows','rules.handoff','rules.never','rules.emergencies.tier0','rules.emergencies.tier1','rules.bypass','widget.allowedOrigins'];
  var cfgAppointmentDraft = null;
  function cfgAppointmentTable(rows) {var out={};cfgDays.forEach(function(day){var open=rows.querySelector('[data-d="'+day+'"][data-k="open"]').value,close=rows.querySelector('[data-d="'+day+'"][data-k="close"]').value;out[day]=open||close?{open:open,close:open&&close==='00:00'?'24:00':close}:null;});return out;}
  function cfgAppointmentValidTable(hours) {return hours&&typeof hours==='object'&&!Array.isArray(hours)&&Object.keys(hours).length===7&&cfgDays.every(function(day){if(!Object.hasOwn(hours,day))return false;var row=hours[day];return row===null||row&&typeof row==='object'&&Object.keys(row).sort().join(',')==='close,open'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(row.open)&&/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/.test(row.close)&&row.close>row.open;});}
  function cfgAppointmentPolicy(raw) {if(!raw)return {mode:'legacy'};try{var value=JSON.parse(raw);if(!value||value.version!==1||['business','custom'].indexOf(value.mode)<0||Object.keys(value).sort().join(',')!==(value.mode==='custom'?'hours,mode,version':'mode,version')||value.mode==='custom'&&!cfgAppointmentValidTable(value.hours))throw new Error();return value;}catch(error){return {mode:'invalid'};}}
  function cfgAppointmentRange(value) {var m=String(value).trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?\s*(?:to|[-–—])\s*(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?$/);if(!m)return null;function time(h,min,ap){if(Number(min||0)>59||(ap?Number(h)<1||Number(h)>12:Number(h)>24||Number(h)===24&&Number(min||0)!==0))return NaN;return (ap?Number(h)%12+(/^p/.test(ap)?12:0):Number(h))*60+Number(min||0);}var start=time(m[1],m[2],m[3]),end=time(m[4],m[5],m[6]);if(!Number.isFinite(start)||!Number.isFinite(end))return null;var legacyStart=start,legacyEnd=end;if(!m[3]&&legacyStart<420)legacyStart+=720;if(!m[6]&&legacyEnd<=legacyStart)legacyEnd+=720;if(!m[3]&&!m[2]&&!/^0\d?$/.test(m[1])&&start<420)start+=720;if(!m[6]&&!m[5]&&!/^0\d?$/.test(m[4])&&end<=start)end+=720;var requiresPeriod=legacyStart!==start||legacyEnd!==end;if(requiresPeriod)return {start:start,end:end,requiresPeriod:true};return Number.isFinite(start)&&Number.isFinite(end)&&end>start&&end<=1440?{start:start,end:end,requiresPeriod:false}:null;}
  function cfgAppointmentIssue(policy,hours,windows) {if(policy.mode==='legacy')return '';if(policy.mode==='invalid'||!cfgAppointmentValidTable(hours))return 'Review the appointment times for each day before saving.';var ranges=windows.map(cfgAppointmentRange);if(ranges.some(function(row){return row&&row.requiresPeriod;}))return 'Add am or pm to make each arrival time clear, such as 6 am to 8 am.';if(!ranges.length||ranges.some(function(row){return !row;}))return 'Update arrival windows with a start and end time, such as 8 am to 12 pm. Your window text is retained.';var open=Object.values(hours).filter(Boolean),minutes=function(t){return Number(t.slice(0,2))*60+Number(t.slice(3));};if(open.length&&ranges.some(function(range){return !open.some(function(row){return range.start>=minutes(row.open)&&range.end<=minutes(row.close);});}))return 'Update arrival windows so each whole window fits within at least one open day.';return '';}
  function cfgAppointmentRefresh(sync) {var mode=$('cfgAppointmentHoursMode').value,rows=$('cfgAppointmentHoursRows');if(sync&&['business','custom'].indexOf(mode)>=0){if(mode==='custom')cfgAppointmentDraft=cfgAppointmentTable(rows);$('cfgAppointmentHoursValue').value=JSON.stringify({version:1,mode:mode,...(mode==='custom'?{hours:cfgAppointmentDraft}:{})});}rows.hidden=mode!=='custom';$('cfgAdoptAppointmentHours').hidden=mode!=='legacy';var policy=cfgAppointmentPolicy($('cfgAppointmentHoursValue').value),hours=mode==='custom'?cfgAppointmentTable(rows):cfgAppointmentTable($('hoursRows')),windows=$('cfg').elements.windows.value.split('\n').map(function(row){return row.trim();}).filter(Boolean),issue=cfgAppointmentIssue(policy,hours,windows);var summary=policy.mode==='legacy'?'Using your existing appointment availability. Your saved arrival windows keep their existing days until you set appointment hours.':policy.mode==='invalid'?'Your saved appointment hours need review. Choose business hours or set valid custom hours before accepting new visits.':!cfgAppointmentValidTable(hours)?'Complete opening and closing times, or leave both blank for a closed day.':Object.values(hours).every(function(row){return row===null;})?'No appointments are accepted with this all-closed week.':cfgDays.map(function(day){return day.charAt(0).toUpperCase()+day.slice(1)+': '+(hours[day]?hours[day].open+' to '+hours[day].close:'closed');}).join('; ')+'. Whole arrival windows must fit these times.';$('cfgAppointmentHoursSummary').textContent=summary+(issue&&policy.mode!=='invalid'?' '+issue:'');$('cfgFixAppointmentWindows').hidden=!issue||policy.mode==='legacy'||policy.mode==='invalid';}
  function cfgAppointmentFill(raw,preserve) {var rows=$('cfgAppointmentHoursRows');if(!rows.children.length)rows.innerHTML=cfgDays.map(function(day){return '<div class="hours-row"><span>'+day.charAt(0).toUpperCase()+day.slice(1)+'</span><input type="time" data-d="'+day+'" data-k="open" aria-label="'+cfgDayNames[day]+' appointment opening time" aria-describedby="hoursNote"><span>to</span><input type="time" data-d="'+day+'" data-k="close" aria-label="'+cfgDayNames[day]+' appointment closing time, midnight ends this day" aria-describedby="hoursNote"></div>';}).join('');if(!preserve){var policy=cfgAppointmentPolicy(raw);$('cfgAppointmentHoursValue').value=raw;$('cfgAppointmentHoursMode').value=policy.mode;if(policy.mode==='custom')cfgAppointmentDraft=policy.hours;if(!cfgAppointmentDraft)cfgAppointmentDraft=cfgAppointmentTable($('hoursRows'));rows.querySelectorAll('input').forEach(function(field){var row=cfgAppointmentDraft[field.dataset.d];var value=row&&row[field.dataset.k]||'';field.value=field.dataset.k==='close'&&value==='24:00'?'00:00':value;});}cfgAppointmentRefresh(false);}
  function cfgRead() {
    var values = {};
    $('cfg').querySelectorAll('[name]').forEach(function(field){ values[field.name] = field.type === 'checkbox' ? field.checked : field.value; });
    var hours = {}; cfgDays.forEach(function(day){ hours[day] = {}; ['open','close'].forEach(function(kind){ var field=$('hoursRows').querySelector('[data-d="'+day+'"][data-k="'+kind+'"]'); hours[day][kind]=field ? field.value : ''; }); });
    cfgDays.forEach(function(day){if(hours[day].open&&hours[day].close==='00:00')hours[day].close='24:00';});
    values['rules.hours'] = JSON.stringify(hours); return values;
  }
  function cfgFromClient(client) {
    var values = {}, read = function(path){return path.split('.').reduce(function(value,key){return value == null ? undefined : value[key];},client);};
    $('cfg').querySelectorAll('[name]').forEach(function(field){var value=read(field.name);values[field.name]=field.type==='checkbox'?!!value:value == null?'':String(value);});
    cfgArrayFields.forEach(function(name){values[name]=(read(name)||[]).join('\n');});
    values['business.spanish']=client.business.spanish?'yes':'no'; values['phone.forwarding']=client.phone.forwarding||'missed';
    values['rules.windowCapacity']=String(client.rules.windowCapacity||1);values['rules.ackMinutes']=String(client.rules.ackMinutes||10);values['digest.text']=!(client.digest&&client.digest.text===false);
    // A price line saved without an amount shows as typed, so it reads back exactly as the save parsed it.
    values.fees=(client.fees||[]).map(function(row){return !row.amount&&!row.note?row.label:row.label+': '+row.amount+(row.note?' ('+row.note+')':'');}).join('\n');
    values.faq=(client.faq||[]).map(function(row){return row.q+' '+row.a;}).join('\n');
    var hours={};cfgDays.forEach(function(day){var row=client.rules.hours&&client.rules.hours[day];hours[day]={open:row&&row.open||'',close:row&&row.close||''};});values['rules.hours']=JSON.stringify(hours);values['rules.appointmentHours']=Object.hasOwn(client.rules,'appointmentHours')?JSON.stringify(client.rules.appointmentHours):'';return values;
  }
  function cfgFill(values, preserve) {
    var rows=$('hoursRows');if(!rows.children.length)rows.innerHTML=cfgDays.map(function(day){return '<div class="hours-row"><span>'+day.charAt(0).toUpperCase()+day.slice(1)+'</span><input type="time" data-d="'+day+'" data-k="open" aria-label="'+cfgDayNames[day]+' opening time" aria-describedby="hoursNote"><span>to</span><input type="time" data-d="'+day+'" data-k="close" aria-label="'+cfgDayNames[day]+' closing time, midnight ends this day" aria-describedby="hoursNote"></div>';}).join('');
    $('cfg').querySelectorAll('[name]').forEach(function(field){if(preserve&&Object.hasOwn(preserve,field.name))return;if(field.type==='checkbox')field.checked=!!values[field.name];else field.value=values[field.name] == null?'':values[field.name];});
    if(!preserve||!Object.hasOwn(preserve,'rules.hours')){var hours=JSON.parse(values['rules.hours']);rows.querySelectorAll('input').forEach(function(field){var value=hours[field.dataset.d][field.dataset.k];field.value=field.dataset.k==='close'&&value==='24:00'?'00:00':value;});}
    cfgAppointmentFill(values['rules.appointmentHours']||'',preserve&&Object.hasOwn(preserve,'rules.appointmentHours'));
    $('hoursNote').textContent='Leave both times blank for a closed day. A midnight closing time ends that day.';
    $('transferGroup').style.display=data?.client?.onboarding?.version===1||$('cfg').elements['phone.forwarding'].value==='all'?'block':'none';
    cfgErrorElements();$('cfg').querySelectorAll('[name]:not([type=hidden]),#hoursRows input,#cfgAppointmentHoursRows input').forEach(function(field){cfgEventValues.set(field,field.type==='checkbox'?String(field.checked):field.value);});
  }
  function cfgChanges(values, base) { return base?Object.keys(values).filter(function(name){return values[name]!==base[name];}):[]; }
  function cfgPhoneField(name) { return ['owner.phone','owner.backupPhone','phone.businessNumber','phone.transferTo'].indexOf(name)>=0; }
  function cfgPhoneDigits(value) { var digits=String(value||'').replace(/\D/g,'');return digits.length===11&&digits[0]==='1'?digits.slice(1):digits; }
  // The same phone number in another format is the same saved fact, never a conflict. Other values compare exactly.
  function cfgSame(name,a,b) {return a===b||cfgPhoneField(name)&&typeof a==='string'&&typeof b==='string'&&cfgValidPhone(a)&&cfgValidPhone(b)&&cfgPhoneDigits(a)===cfgPhoneDigits(b)||name==='rules.bypass'&&typeof a==='string'&&typeof b==='string'&&cfgPredictable(name,a)&&cfgPredictable(name,b)&&cfgNorm(name,a)===cfgNorm(name,b);}
  // A value whose stored form the desk can predict exactly. Anything else can only stay unconfirmed after a lost response.
  function cfgPredictable(name,value) {return name!=='rules.bypass'||String(value||'').split('\n').map(function(row){return row.trim();}).filter(Boolean).every(function(line){return cfgValidPhone(line);});}
  function cfgFeeRow(line) {var m=line.match(/^(.*?)[:\-–]\s*(\$?[\d,.]+[^(]*)(?:\((.*)\))?$/);return m?{label:m[1].trim(),amount:m[2].trim(),note:(m[3]||'').trim()}:{label:line,amount:'',note:''};}
  // The form value as the server will store it, through the same parsing the save sends (fee and question rows, phone digits, website origins, trimmed lines).
  // Used only to recognise our own stored values after a lost response; a value it cannot predict simply stays unconfirmed.
  function cfgNorm(name,value) {
    if(typeof value!=='string')return value;var lines=value.split('\n').map(function(row){return row.trim();}).filter(Boolean),canon=function(item){return item&&typeof item==='object'?Array.isArray(item)?item.map(canon):Object.keys(item).sort().reduce(function(out,key){out[key]=canon(item[key]);return out;},{}):item;};
    if(cfgPhoneField(name))return cfgValidPhone(value)?cfgPhoneDigits(value):value.trim();
    if(name==='fees')return lines.map(function(line){var row=cfgFeeRow(line);return row.label+': '+row.amount+(row.note?' ('+row.note+')':'');}).join('\n');
    if(name==='faq')return lines.map(function(line){var i=line.indexOf('?');return i<0?line:line.slice(0,i+1).trim()+' '+line.slice(i+1).trim();}).join('\n');
    // Always-ring-through numbers are stored one per line as +1 and ten digits; legacy saves also drop repeats.
    if(name==='rules.bypass'){var numbers=lines.map(function(line){return cfgValidPhone(line)?'+1'+cfgPhoneDigits(line):line;});if(!(data&&data.client&&data.client.onboarding&&data.client.onboarding.version===1))numbers=numbers.filter(function(number,index){return numbers.indexOf(number)===index;});return numbers.join('\n');}
    if(name==='widget.allowedOrigins')return lines.map(function(line){try{var url=new URL(line);return line.replace(/\/$/,'')===url.origin?url.origin:line;}catch(error){return line;}}).join('\n');
    if(cfgArrayFields.indexOf(name)>=0)return lines.join('\n');
    if(name==='rules.hours'||name==='rules.appointmentHours'){try{return value?JSON.stringify(canon(JSON.parse(value))):'';}catch(error){return value;}}
    if(['rules.windowCapacity','rules.ackMinutes'].indexOf(name)>=0)return String(Number(value));
    return value.trim();
  }
  // Fields the server re-derives from a submitted source field; their movement is explained by our own save.
  // The hours table is rebuilt from the hours text. An emergency field that was not submitted is only re-normalized
  // from its saved value, so it may move only when the move is that normalization (trimmed lines), never to new content.
  function cfgDerived(changed,latestValues,base) {var out=[];if(changed.indexOf('business.hours')>=0)out.push('rules.hours');if(changed.indexOf('rules.hours')>=0&&changed.indexOf('business.hours')<0)out.push('business.hours');if(changed.some(function(name){return name.indexOf('rules.emergencies.')===0;}))$('cfg').querySelectorAll('[name^="rules.emergencies."]').forEach(function(field){var name=field.name;if(changed.indexOf(name)<0&&latestValues&&base&&cfgNorm(name,latestValues[name])===cfgNorm(name,base[name]))out.push(name);});return out;}
  // Self-service workspaces carry revisions on every read; legacy workspaces have none, and their reads are still the latest saved details.
  function cfgSelfService(result) { return !!(result&&result.client&&result.client.onboarding&&result.client.onboarding.version===1); }
  function cfgLatestReadable(result) { return !!(result&&result.client&&(!cfgSelfService(result)||/^[a-f0-9]{64}$/.test(result.configurationRevision||'')&&/^[a-f0-9]{64}$/.test(result.editRevision||''))); }
  function cfgStatus(kind,message) { $('cfg').dataset.saveState=kind;if($('saveMsg').textContent!==message)$('saveMsg').textContent=message;$('saveCfg').disabled=cfgBusy||acctBusy||websiteBusy||cfgClosed;$('cfg').setAttribute('aria-busy',String(cfgBusy));$('cfgCheckLatest').disabled=cfgBusy||acctBusy;$('cfgKeepEdits').disabled=cfgBusy||acctBusy;$('saveAcct').disabled=cfgBusy||acctBusy||websiteBusy||cfgClosed;cfgWebNext(); }
  function cfgIncomplete(setup) { return !!(setup&&setup.channels&&setup.channels.web&&setup.channels.web.blockers.some(function(row){return row.id==='rules'||row.id==='handoff';})); }
  function cfgWebImpact(setup) {
    var client=data&&data.client,web=setup&&setup.channels&&setup.channels.web,blockers=web&&web.blockers||[];
    if(client?.onboarding?.version!==1||client.status!=='live'||web?.active!==true)return null;
    var has=function(id){return blockers.some(function(row){return row.id===id;});};
    if(web.ready===false){
      if(has('rules')||has('handoff'))return {message:'Website chat is unavailable. Complete and review your business details before customers use these changes.',label:'Complete business details',tab:'know',target:'reviewRules',state:'needs_rules'};
      if(has('review'))return {message:'Website chat is unavailable. Review these changes and complete a private test before customers can use them.',label:'Review business details',tab:'know',target:'reviewRules',state:'needs_review'};
      if(has('model'))return {message:'Website chat is unavailable while the AI service needs attention. Your changes are saved.',label:'Check website chat',tab:'setup',target:'websiteInstallPrimary',state:'unavailable'};
    }
    if(data.aiAllowance?.available===false||has('test')&&data.aiAllowance?.private?.remaining===0)return {message:'Website chat is unavailable while its AI allowance needs attention. Your changes are saved.',label:'View AI allowance',tab:'account',state:'limit'};
    if(web.ready!==false)return null;
    if(has('test'))return {message:'Website chat is unavailable. Complete a private test of these changes next.',label:'Try your front desk',tab:'test',target:'chatIn',state:'needs_practice'};
    return {message:'Website chat is unavailable until its current setup checks pass. Your changes are saved.',label:'Check website chat',tab:'setup',target:'websiteInstallPrimary',state:'unavailable'};
  }
  function cfgWebNext() {
    var impact=cfgWebImpact(data&&data.setup),button=$('cfgWebNext');
    if(!button){button=document.createElement('button');button.id='cfgWebNext';button.type='button';button.className='btn-pill btn-pill-dark btn-sm';$('saveMsg').after(button);button.addEventListener('click',function(){var next=cfgWebImpact(data&&data.setup);if(!next||button.disabled)return;routeTo(next.tab);var target=$(next.target)||$('pageTitle');target.scrollIntoView({block:'center'});target.focus({preventScroll:true});});}
    button.hidden=!impact;button.disabled=leaving||cfgDirty||cfgBusy||acctBusy||websiteBusy||reviewBusy||cfgClosed;
    if(impact)button.textContent=impact.label;
    button.title=cfgDirty?'Save your newer edits before continuing.':'';
  }
  function cfgSavedMessage(setup) { var impact=cfgWebImpact(setup);return impact?(cfgIncomplete(setup)?'Saved as a draft. ':'All changes saved. ')+impact.message:cfgIncomplete(setup)?'Saved as a draft. Complete your business rules and callback details before activation.':'All changes saved. Connections shows any review, practice or permission needed for each service.'; }
  function cfgField(name) {if(name.indexOf('rules.appointmentHours')===0){var badAppointment=null;if($('cfgAppointmentHoursMode').value==='custom')cfgDays.some(function(day){var open=$('cfgAppointmentHoursRows').querySelector('[data-d="'+day+'"][data-k=open]'),close=$('cfgAppointmentHoursRows').querySelector('[data-d="'+day+'"][data-k=close]');if(!open.value&&!close.value)return false;if(!open.value){badAppointment=open;return true;}if(!close.value||(close.value==='00:00'?'24:00':close.value)<=open.value){badAppointment=close;return true;}return false;});return badAppointment||$('cfgAppointmentHoursMode');}if(name.indexOf('rules.hours')!==0){var path=name;while(path&&!$('cfg').elements[path])path=path.includes('.')?path.slice(0,path.lastIndexOf('.')):'';return path?$('cfg').elements[path]:null;}var parts=name.split('.'),match=cfgDays.indexOf(parts[2])>=0?$('hoursRows').querySelector('[data-d="'+parts[2]+'"][data-k="'+(parts[3]==='close'?'close':'open')+'"]'):null;if(match)return match;var bad=null;cfgDays.some(function(day){var open=$('hoursRows').querySelector('[data-d="'+day+'"][data-k="open"]'),close=$('hoursRows').querySelector('[data-d="'+day+'"][data-k="close"]');if(!open||!close||!open.value&&!close.value)return false;if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(open.value)){bad=open;return true;}if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(close.value)||(close.value==='00:00'?'24:00':close.value)<=open.value){bad=close;return true;}return false;});return bad||$('hoursRows').querySelector('input');}
  function cfgErrorElements() {
    $('cfg').querySelectorAll('[name]:not([type=hidden]),#hoursRows input,#cfgAppointmentHoursRows input').forEach(function(field,index){var name=field.closest('#cfgAppointmentHoursGroup')?'rules.appointmentHours':field.name||'rules.hours',id=name==='rules.appointmentHours'?'cfgAppointmentHoursError':name==='rules.hours'?'cfgHoursError':'cfgError-'+(field.id||(field.id='cfgField-'+index));var error=$(id);if(!error){error=document.createElement('p');error.id=id;error.className='cfg-field-error';if(name==='rules.appointmentHours')$('cfgAppointmentHoursSummary').after(error);else if(name==='rules.hours')$('hoursRows').after(error);else field.after(error);}var ids=(field.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean);if(ids.indexOf(id)<0)ids.push(id);field.setAttribute('aria-describedby',ids.join(' '));field.dataset.cfgError=id;});
  }
  function cfgClearError(name) {if(name&&name.indexOf('rules.appointmentHours')===0){$('cfgAppointmentHoursGroup').querySelectorAll('[data-cfg-error]').forEach(function(field){field.removeAttribute('aria-invalid');delete field.dataset.cfgInvalidValue;});if($('cfgAppointmentHoursError'))$('cfgAppointmentHoursError').textContent='';return;}if(name&&name.indexOf('rules.hours')===0)name='rules.hours';var fields=name==='rules.hours'?$('hoursRows').querySelectorAll('input'):name?[$('cfg').elements[name]]:$('cfg').querySelectorAll('[data-cfg-error]');Array.prototype.forEach.call(fields,function(field){if(!field)return;field.removeAttribute('aria-invalid');delete field.dataset.cfgInvalidValue;if(field.dataset.cfgError&&$(field.dataset.cfgError))$(field.dataset.cfgError).textContent='';});}
  function cfgShowErrors(errors) {
    cfgClearError();var first=null;
    Object.keys(errors).forEach(function(name){var field=cfgField(name);if(!field)return;var fields=[field];if(name.indexOf('rules.hours')===0){var days=cfgHoursProblems(cfgHoursTable()).map(function(row){return row.day;});if(/^rules\.hours\.\w+/.test(name)&&field.dataset.d&&days.indexOf(field.dataset.d)<0)days.unshift(field.dataset.d);fields=$('hoursRows').querySelectorAll(days.map(function(day){return 'input[data-d="'+day+'"]';}).join(',')||'input');}Array.prototype.forEach.call(fields,function(input){input.setAttribute('aria-invalid','true');input.dataset.cfgInvalidValue=input.type==='checkbox'?String(input.checked):input.value;if(input.dataset.cfgError)$(input.dataset.cfgError).textContent=errors[name];});if(!first&&!field.disabled)first=field;});
    if(first){routeTo('know');var details=first.closest('details');if(details)details.open=true;first.focus();first.scrollIntoView({block:'center'});}else $('saveMsg').focus();
  }
  function cfgValidPhone(value) {var raw=value.trim();if(!raw)return true;if(!/^[+\d\s().-]+$/.test(raw)||raw.indexOf('+')>0||raw.indexOf('+',1)>=0)return false;var digits=raw.replace(/\D/g,'');if(raw[0]==='+'&&!raw.startsWith('+1'))return false;if(digits.length===11&&digits[0]==='1')digits=digits.slice(1);return /^[2-9]\d{2}[2-9]\d{6}$/.test(digits);}
  function cfgValidate(values, changed) {
    var errors={},lines=function(name){return String(values[name]||'').split('\n').map(function(row){return row.trim();}).filter(Boolean);};
    ['owner.phone','owner.backupPhone','phone.businessNumber','phone.transferTo'].forEach(function(name){if(changed.indexOf(name)>=0&&!cfgValidPhone(values[name]))errors[name]='Enter a valid US number, such as (713) 555-0142, or leave it blank for now.';});
    if(changed.indexOf('rules.windowCapacity')>=0&&(!/^\d+$/.test(values['rules.windowCapacity'])||Number(values['rules.windowCapacity'])<1||Number(values['rules.windowCapacity'])>20))errors['rules.windowCapacity']='Choose a whole number from 1 to 20.';
    if(changed.indexOf('rules.hours')>=0){var hours=JSON.parse(values['rules.hours']),valid=function(value,closing){return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)||closing&&value==='24:00';};var problems=cfgHoursProblems(hours);if(problems.length)errors['rules.hours']=problems.map(function(row){return row.text;}).join(' ');}
    if(changed.indexOf('faq')>=0&&lines('faq').some(function(line){var i=line.indexOf('?');return i<=0||!line.slice(i+1).trim();}))errors.faq='Use one question and answer per line, with a question mark between them.';
    if(changed.some(function(name){return ['rules.appointmentHours','rules.hours','business.hours','windows'].indexOf(name)>=0;})){var policy=cfgAppointmentPolicy(values['rules.appointmentHours']),hours=policy.mode==='custom'?policy.hours:JSON.parse(values['rules.hours']);if(policy.mode==='business')cfgDays.forEach(function(day){if(!hours[day].open&&!hours[day].close)hours[day]=null;});var issue=cfgAppointmentIssue(policy,hours,lines('windows'));if(issue)errors[policy.mode==='invalid'||!cfgAppointmentValidTable(hours)?'rules.appointmentHours':'windows']=issue;}
    return errors;
  }
  function cfgPayload(values, changed) {
    var body={expectedRevision:cfgRevision,expectedEditRevision:cfgEditRevision},lines=function(name){return String(values[name]||'').split('\n').map(function(row){return row.trim();}).filter(Boolean);};
    var legacy=!(data.client.onboarding&&data.client.onboarding.version===1);if(legacy)changed=Object.keys(values);
    changed.forEach(function(name){var value=values[name];if(name==='rules.appointmentHours'){if(!value)return;value=JSON.parse(value);}else if(cfgArrayFields.indexOf(name)>=0)value=lines(name);else if(name==='business.spanish')value=value==='yes';else if(['rules.windowCapacity','rules.ackMinutes'].indexOf(name)>=0)value=Number(value);else if(name==='rules.hours'){var hours=JSON.parse(value);cfgDays.forEach(function(day){if(!hours[day].open&&!hours[day].close)hours[day]=null;});value=hours;}else if(name==='fees')value=lines(name).map(cfgFeeRow);else if(name==='faq')value=lines(name).map(function(line){var i=line.indexOf('?');return {q:line.slice(0,i+1).trim(),a:line.slice(i+1).trim()};});var parts=name.split('.'),target=body;parts.slice(0,-1).forEach(function(key){target=target[key]||(target[key]={});});target[parts[parts.length-1]]=value;});if(legacy){body.business.city=data.client.business.city;body.business.googlePlaceId=data.client.business.googlePlaceId;body.phone.businessNumber=data.client.phone.businessNumber;body.phone.carrier=data.client.phone.carrier;}return body;
  }
  function cfgChanged() {
    cfgAppointmentRefresh(false);
    if(!cfgBaseline||leaving)return;cfgDirty=cfgChanges(cfgRead(),cfgBaseline).length>0;
    reviewState(data);
    renderHomeNext(data);
    if(cfgClosed)cfgStatus('error','This workspace no longer accepts business edits. Your typed changes are kept on this page.');else if(cfgBusy)cfgStatus('saving','Saving the submitted changes. Any newer edits will stay here.');else if(cfgConflict)cfgStatus('conflict','Your edits are kept. Review the latest saved version before saving again.');else cfgStatus(cfgDirty?'dirty':cfgIncomplete(data&&data.setup)?'incomplete':'saved',cfgDirty?'You have unsaved changes.':cfgSavedMessage(data&&data.setup));
  }
  function cfgResultValid(result) { return !!(result&&result.client&&!(data.client.onboarding&&data.client.onboarding.version===1&&(!/^[a-f0-9]{64}$/.test(result.configurationRevision||'')||!/^[a-f0-9]{64}$/.test(result.editRevision||'')))); }
  // PRA-DESK-09: the owner's own hours line is never rewritten silently. The server regenerates only its own generated line;
  // when a grid edit keeps a hand-written line (notes, holidays, Spanish) or a typed line leaves the grid as it was, say so.
  function cfgHoursTouched(snapshot) {return !!(cfgBaseline&&(cfgNorm('rules.hours',snapshot['rules.hours'])!==cfgNorm('rules.hours',cfgBaseline['rules.hours'])||snapshot['business.hours']!==cfgBaseline['business.hours']));}
  function cfgHoursNotice(result,snapshot) {
    if(!cfgBaseline||!result.client)return '';var saved=cfgFromClient(result.client),line=snapshot['business.hours']||'',savedLine=saved['business.hours']||'';
    var gridSent=cfgNorm('rules.hours',snapshot['rules.hours'])!==cfgNorm('rules.hours',cfgBaseline['rules.hours']),lineSent=line!==cfgBaseline['business.hours'];
    if(gridSent&&!lineSent&&line&&savedLine===line)return 'Your hours grid is saved. Your hours line was kept as you wrote it: “'+line+'”. Check that it still matches the grid, which is what your front desk and website copy use.';
    if(gridSent&&!lineSent&&line&&savedLine!==line)return 'Your hours line was updated from the hours grid.';
    if(lineSent&&!gridSent&&savedLine&&cfgNorm('rules.hours',saved['rules.hours'])===cfgNorm('rules.hours',cfgBaseline['rules.hours']))return 'Your hours grid did not change. Edit the grid if the days or times changed.';
    return '';
  }
  function cfgSaved(result,snapshot,note) {
    var hoursNotice=cfgHoursNotice(result,snapshot);if(hoursNotice)note=(note||'')+hoursNotice+' ';var hoursNode=$('hoursKept');if(!hoursNode&&hoursNotice&&$('hoursNote')){hoursNode=document.createElement('p');hoursNode.id='hoursKept';hoursNode.className='muted';hoursNode.setAttribute('role','status');$('hoursNote').after(hoursNode);}if(hoursNode&&(hoursNotice||cfgHoursTouched(snapshot)))hoursNode.textContent=hoursNotice;
    var current=cfgRead(),preserve={};Object.keys(current).forEach(function(name){if(current[name]!==snapshot[name])preserve[name]=current[name];});var saved=cfgFromClient(result.client);cfgFill(saved,preserve);cfgBaseline=saved;cfgRevision=result.configurationRevision;cfgEditRevision=result.editRevision;cfgFence++;data.client=result.client;if(result.setup)data.setup=result.setup;if(result.configurationRevision)data.configurationRevision=result.configurationRevision;if(result.editRevision)data.editRevision=result.editRevision;cfgDirty=cfgChanges(cfgRead(),cfgBaseline).length>0;cfgConflict=null;$('cfgConflictPanel').hidden=true;renderSetup(data);if(!leaving)document.dispatchEvent(new CustomEvent('mc:desk',{detail:data}));
    acctObserve(result,true);cfgBusy=false;cfgStatus(cfgDirty?'dirty':cfgIncomplete(result.setup)?'incomplete':'saved',(note||'')+(cfgDirty?'Submitted changes saved. Your newer edits are still unsaved.'+(cfgWebImpact(result.setup)?' '+cfgWebImpact(result.setup).message:''):cfgSavedMessage(result.setup)));
  }
  // Busy controls are disabled to block double submits, which drops keyboard focus. When a save or check finishes, return focus
  // only if it was lost (or still rests on Save or the status): to Check latest while a conflict is open, otherwise to Save.
  var deskInteraction = 0;
  // Pointer, touch and wheel always mean the owner moved on. A key counts only when it can move focus from a real element:
  // modifier keys (including a screen reader's stop-speech Control) and keys pressed while focus was already lost to the page do not.
  ['pointerdown', 'wheel', 'touchstart'].forEach(function (type) { document.addEventListener(type, function () { deskInteraction++; }, { capture: true, passive: true }); });
  document.addEventListener('keydown', function (event) { var focused = document.activeElement; if (['Shift', 'Control', 'Alt', 'Meta'].indexOf(event.key) >= 0 || !focused || focused === document.body) return; deskInteraction++; }, { capture: true, passive: true });
  function deskFocusStart(controls) { return { on: controls.indexOf(document.activeElement) >= 0, mark: deskInteraction }; }
  function cfgFocusAfter(start) {
    if (leaving || document.body.dataset.activePage !== 'know' || !start || !start.on || start.mark !== deskInteraction) return;
    var focused = document.activeElement, lost = !focused || focused === document.body || focused.disabled || !focused.getClientRects().length || focused.closest('[hidden]');
    if (!$('cfgConflictPanel').hidden && (lost || focused === $('saveCfg') || focused === $('saveMsg'))) { $('cfgCheckLatest').focus(); return; }
    if (lost) { if (!$('saveCfg').disabled) $('saveCfg').focus(); else $('saveMsg').focus(); }
  }
  // The same rule for other busy controls on one page: back to the control when it is usable again, otherwise to its status message.
  function deskFocusAfter(start, page, control, status) {
    if (leaving || document.body.dataset.activePage !== page || !start || !start.on || start.mark !== deskInteraction) return;
    var focused = document.activeElement, lost = !focused || focused === document.body || focused.disabled || !focused.getClientRects().length || focused.closest('[hidden]');
    if (!lost) return;
    if (control && control.isConnected && !control.disabled && control.getClientRects().length && !control.closest('[hidden]')) control.focus(); else if (status) status.focus();
  }
  async function saveCfg() {
    var focusStart=deskFocusStart([$('saveCfg'),$('cfgCheckLatest'),$('cfgKeepEdits'),$('saveMsg')]);
    if(cfgBusy||acctBusy||websiteBusy||cfgClosed||leaving||!data||!cfgBaseline)return;
    var snapshot=cfgRead(),changed=cfgChanges(snapshot,cfgBaseline);if(!changed.length){cfgChanged();return;}
    if(cfgConflict){$('cfgConflictPanel').hidden=false;cfgStatus('conflict','Your edits are kept. Check the latest saved version before saving again.');$('cfgCheckLatest').focus();return;}
    var errors=cfgValidate(snapshot,changed);if(Object.keys(errors).length){cfgStatus('error','Check the highlighted details. Your edits have not been saved.');cfgShowErrors(errors);return;}
    var generation=portalGeneration,base=cfgBaseline,revision=cfgRevision,editRevision=cfgEditRevision;cfgBusy=true;cfgFence++;cfgClearError();cfgChanged();acctStatus();
    try{var result=await apiRequest('PUT',cfgPayload(snapshot,changed));if(leaving||generation!==portalGeneration)return;if(!cfgResultValid(result))throw new Error('The saved version could not be confirmed.');cfgSaved(result,snapshot);
    }catch(error){if(leaving||generation!==portalGeneration)return;cfgBusy=false;cfgDirty=cfgChanges(cfgRead(),cfgBaseline).length>0;if(error.status===401||error.status===403){document.dispatchEvent(new CustomEvent('mc:session-expired'));return;}
      // A lost or unreadable response is uncertain: the server may have saved it. Re-read and decide by revision and field movement,
      // not by predicting how the server rewrites values: unchanged revision means not saved; exactly our fields moved means saved.
      if(!error.status||error.status>=500){cfgBusy=true;cfgStatus('saving','The response was lost. Checking your saved details before another save…');
        try{var latest=await apiRequest();if(leaving||generation!==portalGeneration)return;if(!cfgResultValid(latest))throw new Error('unreadable');
          // Saved only with positive evidence: the revision moved, every submitted field is stored as submitted, and nothing else moved except fields derived from ours.
          // An unchanged read never proves "not saved": the original request can still finish after this read. Everything ambiguous stays unconfirmed with the edits kept.
          // With a revision, the next save carries the old one, so a late commit turns it into a 409 that Check latest reconciles. Legacy workspaces carry no revision.
          var latestValues=cfgFromClient(latest.client),moved=cfgChanges(latestValues,base),derived=cfgDerived(changed,latestValues,base),known=latest.client.onboarding?.version===1&&typeof revision==='string'&&typeof latest.configurationRevision==='string';
          var landed=changed.every(function(name){return cfgNorm(name,latestValues[name])===cfgNorm(name,snapshot[name]);}),stray=moved.filter(function(name){return changed.indexOf(name)<0&&derived.indexOf(name)<0;});
          var predictable=changed.every(function(name){return cfgPredictable(name,snapshot[name]);});
          if(known?latest.configurationRevision===revision&&latest.editRevision===editRevision:!moved.length){cfgBusy=false;cfgDirty=cfgChanges(cfgRead(),cfgBaseline).length>0;cfgStatus('dirty',known?'We couldn’t confirm this save yet. Your edits are still here. Save again when you are ready; a save can’t apply twice.':'We couldn’t confirm this save yet. Your edits are still here. Save again to send the same details.');}
          else if(landed&&!stray.length&&predictable)cfgSaved(latest,snapshot);
          else if(!predictable&&!stray.length){cfgBusy=false;cfgDirty=cfgChanges(cfgRead(),cfgBaseline).length>0;cfgConflict={latest:null};$('cfgConflictPanel').hidden=false;$('cfgKeepEdits').hidden=true;cfgStatus('conflict','We couldn’t confirm this save. Your edits are kept; check the latest saved version before saving again.');}
          else{cfgBusy=false;cfgDirty=cfgChanges(cfgRead(),cfgBaseline).length>0;cfgConflict={latest:null};$('cfgConflictPanel').hidden=false;$('cfgKeepEdits').hidden=true;cfgStatus('conflict','We couldn’t confirm this save. Your saved details changed while it was checked. Your edits are kept; check the latest version before saving again.');}
        }catch(readError){if(leaving||generation!==portalGeneration)return;cfgBusy=false;if(readError.status===401||readError.status===403){document.dispatchEvent(new CustomEvent('mc:session-expired'));return;}cfgStatus('error','We could not confirm the save. Your edits are still here; save again when your connection returns.');}
        return;}
      if(error.code==='configuration_changed'){cfgConflict={latest:null};$('cfgConflictPanel').hidden=false;$('cfgKeepEdits').hidden=true;cfgStatus('conflict','Your saved details changed elsewhere. Your edits are kept; check the latest version.');}else{if(error.code==='workspace_closed')cfgClosed=true;cfgStatus('error',(error.message||'The save could not be confirmed.')+' Your edits are still here.');var fieldErrors=Object.assign({},error.fieldErrors||{});if(error.field&&!Object.keys(fieldErrors).length)fieldErrors[error.field]=error.message;var present=cfgRead();Object.keys(fieldErrors).forEach(function(name){var field=cfgField(name),grouped=name.indexOf('rules.appointmentHours')===0?'rules.appointmentHours':name.indexOf('rules.hours')===0?'rules.hours':field&&field.name||name;if(present[grouped]!==snapshot[grouped])delete fieldErrors[name];});if(Object.keys(fieldErrors).length)cfgShowErrors(fieldErrors);}}
    finally{if(!leaving&&generation===portalGeneration){cfgBusy=false;$('cfg').setAttribute('aria-busy','false');$('saveCfg').disabled=cfgClosed||acctBusy;$('cfgCheckLatest').disabled=false;$('cfgKeepEdits').disabled=false;reviewState(data);acctStatus();cfgFocusAfter(focusStart);}}
  }
  function cfgLabel(name) {var field=cfgField(name),label=field&&field.closest('.form-group')&&field.closest('.form-group').querySelector('label');return name==='rules.appointmentHours'?'Appointment hours':name==='rules.hours'?'Business hours':label?label.textContent.trim():name==='faq'?'Customer questions':name;}
  function cfgDisplay(name,value) {if(cfgPhoneField(name)&&value&&cfgValidPhone(value)){var digits=cfgPhoneDigits(value);return '('+digits.slice(0,3)+') '+digits.slice(3,6)+'-'+digits.slice(6);}if(name==='rules.appointmentHours'){var policy=cfgAppointmentPolicy(value);return policy.mode==='legacy'?'Existing appointment availability':policy.mode==='business'?'Use my business hours':policy.mode==='custom'?'Custom: '+cfgDays.map(function(day){var row=policy.hours[day];return day+': '+(row?row.open+' to '+row.close:'closed');}).join('; '):'Needs review';}if(name==='rules.hours'){var hours=JSON.parse(value);return cfgDays.map(function(day){return day+': '+(hours[day].open||hours[day].close?hours[day].open+' to '+hours[day].close:'closed');}).join('; ');}return typeof value==='boolean'?value?'Yes':'No':value||'Blank';}
  // Show the latest saved version against the draft. Returns false when the draft already matches it (then it is confirmed saved).
  function cfgShowLatest(latest,again) {
    cfgConflict.latest={data:latest,values:cfgFromClient(latest.client)};var mine=cfgRead(),latestValues=cfgConflict.latest.values;
    if(Object.keys(mine).every(function(name){return cfgSame(name,latestValues[name],mine[name]);})){cfgSaved(latest,mine,'Your edits were already saved. ');return false;}
    var changed=cfgChanges(latestValues,cfgBaseline).filter(function(name){return !cfgSame(name,latestValues[name],mine[name]);}),box=$('cfgConflictFields');box.replaceChildren();
    changed.forEach(function(name){var row=document.createElement('p');row.className='cfg-conflict-field';row.textContent=cfgLabel(name)+' | Latest saved: '+cfgDisplay(name,cfgConflict.latest.values[name])+'. Your current value: '+cfgDisplay(name,mine[name]);box.appendChild(row);});
    $('cfgConflictText').textContent=changed.length?'Compare these updates with your draft. Keeping your edits saves only the fields you changed.':'The latest saved version is ready to compare. Keeping your edits saves only the fields you changed.';
    if(!cfgSelfService(latest))$('cfgConflictText').textContent+=' This workspace saves every detail on this page together, so check the latest values shown here first.';
    $('cfgConflictPanel').hidden=false;$('cfgKeepEdits').hidden=false;
    cfgStatus('conflict',again?'Your saved details changed again while you reviewed them. Nothing was saved. Review the updated values before keeping your edits.':'Latest saved version checked. Your draft is unchanged; review the differences before continuing.');
    return true;
  }
  $('cfgCheckLatest').addEventListener('click',async function(){var focusStart=deskFocusStart([$('cfgCheckLatest'),$('saveMsg')]);if(cfgBusy||acctBusy||!cfgConflict||leaving)return;var generation=portalGeneration;cfgBusy=true;cfgStatus('conflict','Checking the latest saved details. Your edits will stay here.');try{var latest=await apiRequest();if(leaving||generation!==portalGeneration)return;if(!cfgLatestReadable(latest))throw new Error('The latest saved version could not be read.');if(['cancelled','archived'].includes(latest.client.status)){cfgClosed=true;cfgConflict=null;$('cfgConflictPanel').hidden=true;throw new Error('This workspace no longer accepts business edits.');}cfgShowLatest(latest,false);}catch(error){if(leaving||generation!==portalGeneration)return;if(error.status===401||error.status===403){document.dispatchEvent(new CustomEvent('mc:session-expired'));return;}cfgStatus(cfgClosed?'error':'conflict',error.message+' Your edits are still here.');}finally{if(!leaving&&generation===portalGeneration){cfgBusy=false;$('cfg').setAttribute('aria-busy','false');$('saveCfg').disabled=cfgClosed||acctBusy;$('cfgCheckLatest').disabled=false;$('cfgKeepEdits').disabled=false;cfgFocusAfter(focusStart);}}});
  $('cfgKeepEdits').addEventListener('click',async function(){if(cfgBusy||acctBusy||websiteBusy||cfgClosed||!cfgConflict||!cfgConflict.latest||leaving)return;
    // A legacy save sends every field, so first re-read: a change made after Check latest must be shown, never overwritten unseen.
    if(!cfgSelfService(cfgConflict.latest.data)){
      var focusStart=deskFocusStart([this,$('cfgCheckLatest'),$('saveMsg')]),generation=portalGeneration,shown=cfgConflict.latest.values,fresh=null;
      cfgBusy=true;cfgStatus('conflict','Checking that your saved details have not changed again. Your edits will stay here.');
      try{fresh=await apiRequest();if(leaving||generation!==portalGeneration)return;if(!cfgLatestReadable(fresh))throw new Error('The latest saved version could not be read.');}
      catch(error){if(leaving||generation!==portalGeneration)return;cfgBusy=false;if(error.status===401||error.status===403){document.dispatchEvent(new CustomEvent('mc:session-expired'));return;}cfgStatus('conflict',error.message+' Nothing was saved. Your edits are still here.');cfgFocusAfter(focusStart);return;}
      cfgBusy=false;
      if(cfgChanges(cfgFromClient(fresh.client),shown).length){cfgShowLatest(fresh,true);cfgFocusAfter(focusStart);return;}
      if(!cfgConflict||!cfgConflict.latest||cfgClosed)return;
      if(focusStart.on&&focusStart.mark===deskInteraction&&(document.activeElement===document.body||document.activeElement===this))$('saveMsg').focus({preventScroll:true});
    }
    else if(document.activeElement===this)$('saveMsg').focus({preventScroll:true});var mine=cfgRead(),preserve={};cfgChanges(mine,cfgBaseline).forEach(function(name){preserve[name]=mine[name];});var latest=cfgConflict.latest;cfgFill(latest.values,preserve);cfgBaseline=latest.values;cfgRevision=latest.data.configurationRevision;cfgEditRevision=latest.data.editRevision;data=latest.data;cfgConflict=null;$('cfgConflictPanel').hidden=true;cfgFence++;cfgChanged();saveCfg();});

  $('cfgAdoptAppointmentHours').addEventListener('click',function(){$('cfgAppointmentHoursMode').value='business';cfgAppointmentRefresh(true);cfgChanged();$('cfgAppointmentHoursMode').focus();});
  $('cfgFixAppointmentWindows').addEventListener('click',function(){$('cfg').elements.windows.focus();$('cfg').elements.windows.scrollIntoView({block:'center'});});
  $('cfg').addEventListener('submit',function(event){event.preventDefault();saveCfg();});

  function acctValue(client) { return client.rules.avgTicket ? String(client.rules.avgTicket) : ''; }
  function acctStatus(kind,message) {
    if(leaving)return;var state=kind||(acctBusy?'saving':acctConflict?'conflict':acctDirty?'dirty':'saved');
    $('acct').dataset.saveState=state;$('acct').setAttribute('aria-busy',String(acctBusy));$('saveAcct').disabled=acctBusy||cfgBusy||websiteBusy||cfgClosed;$('cfgCheckLatest').disabled=acctBusy||cfgBusy;$('cfgKeepEdits').disabled=acctBusy||cfgBusy;$('acctCheckLatest').disabled=acctBusy||cfgBusy;$('acctKeepEdits').disabled=acctBusy||cfgBusy;
    var text=message||(acctBusy?'Saving the submitted value. Newer edits will stay here.':acctConflict?'Your value is kept. Check the latest saved version.':acctDirty?'You have an unsaved value.':'All changes saved.');if($('acctMsg').textContent!==text)$('acctMsg').textContent=text;
  }
  function acctObserve(result,localAck) {
    var saved=acctValue(result.client);
    if(acctBaseline===null||!acctDirty&&!acctBusy&&!acctConflict){$('avgTicket').value=saved;acctEventValue=saved;acctBaseline=saved;acctBaseClient=result.client;acctRevision=result.configurationRevision;acctEditRevision=result.editRevision;acctDirty=false;acctStatus();}
    else if(localAck&&saved===acctBaseline){acctBaseClient=result.client;acctRevision=result.configurationRevision;acctEditRevision=result.editRevision;}
  }
  function acctError(message) {$('acctError').textContent=message||'';if(message){$('avgTicket').setAttribute('aria-invalid','true');$('avgTicket').dataset.invalidValue=$('avgTicket').value;}else{$('avgTicket').removeAttribute('aria-invalid');delete $('avgTicket').dataset.invalidValue;}}
  function acctChanged(event) {var field=$('avgTicket'),value=field.value;if(event&&event.type==='change'&&acctEventValue===value)return;acctEventValue=value;if(field.getAttribute('aria-invalid')==='true'&&field.dataset.invalidValue===value)return;acctDirty=value!==acctBaseline;acctError('');acctStatus();}
  function acctNorm(value) {var number=Math.round(Number(String(value||'').replace(/[^\d.]/g,'')))||0;return number?String(number):'';}
  function acctSaved(result,snapshot) {
    var saved=acctValue(result.client);if($('avgTicket').value===snapshot)$('avgTicket').value=saved;acctEventValue=saved;acctBaseline=saved;acctBaseClient=result.client;acctRevision=result.configurationRevision;acctEditRevision=result.editRevision;acctDirty=$('avgTicket').value!==acctBaseline;acctConflict=null;$('acctConflictPanel').hidden=true;cfgFence++;data.client=result.client;if(result.setup)data.setup=result.setup;data.configurationRevision=result.configurationRevision;data.editRevision=result.editRevision;
    if(!cfgChanges(cfgFromClient(result.client),cfgBaseline).length){cfgRevision=result.configurationRevision;cfgEditRevision=result.editRevision;}renderSetup(data);document.dispatchEvent(new CustomEvent('mc:desk',{detail:data}));acctBusy=false;acctStatus(acctDirty?'dirty':'saved',acctDirty?'Submitted value saved. Your newer value is still unsaved.':'All changes saved.');
  }
  // Average job value uses the same disabled-while-busy guard as Business details; return lost focus the same way.
  function acctFocusAfter(start) {
    if (leaving || document.body.dataset.activePage !== 'account' || !start || !start.on || start.mark !== deskInteraction) return;
    var focused = document.activeElement, lost = !focused || focused === document.body || focused.disabled || !focused.getClientRects().length || focused.closest('[hidden]');
    if (!$('acctConflictPanel').hidden && (lost || focused === $('saveAcct') || focused === $('acctMsg'))) { $('acctCheckLatest').focus(); return; }
    if (lost) { if (!$('saveAcct').disabled) $('saveAcct').focus(); else $('acctMsg').focus(); }
  }
  async function saveAcct() {
    var focusStart=deskFocusStart([$('saveAcct'),$('acctCheckLatest'),$('acctKeepEdits'),$('acctMsg')]);
    if(acctBusy||cfgBusy||websiteBusy||cfgClosed||leaving||!data||acctBaseline===null)return;
    var snapshot=$('avgTicket').value;if(snapshot===acctBaseline){acctStatus();return;}
    if(acctConflict){acctStatus('conflict','Your value is kept. Check the latest saved version before saving again.');$('acctCheckLatest').focus();return;}
    var raw=snapshot.trim();if(raw&&(!/^\d+(?:\.\d+)?$/.test(raw)||!Number.isFinite(Number(raw))||Number(raw)>1000000)){acctError('Enter a number from 0 to 1000000, or leave it blank.');acctStatus('error','Check the highlighted value. It has not been saved.');$('avgTicket').focus();return;}
    var generation=portalGeneration,base=acctBaseline,baseClient=acctBaseClient,revision=acctRevision,editRevision=acctEditRevision;acctBusy=true;cfgFence++;acctError('');acctStatus();cfgChanged();
    try{var result=await apiRequest('PUT',{expectedRevision:acctRevision,expectedEditRevision:acctEditRevision,rules:{avgTicket:snapshot}});if(leaving||generation!==portalGeneration)return;if(!cfgResultValid(result))throw new Error('The saved value could not be confirmed.');acctSaved(result,snapshot);
    }catch(error){if(leaving||generation!==portalGeneration)return;acctBusy=false;acctDirty=$('avgTicket').value!==acctBaseline;if(error.status===401||error.status===403){document.dispatchEvent(new CustomEvent('mc:session-expired'));return;}
      // Same rule as business details: a lost response is uncertain until the saved revision and the moved fields are read back.
      if(!error.status||error.status>=500){acctBusy=true;acctStatus('saving','The response was lost. Checking your saved value before another save…');
        try{var latest=await apiRequest();if(leaving||generation!==portalGeneration)return;if(!cfgResultValid(latest))throw new Error('unreadable');
          // Same evidence rule: saved only when the stored value is the submitted value (as the server rounds it) and nothing else moved.
          var landed=acctNorm(acctValue(latest.client))===acctNorm(snapshot),moved=acctValue(latest.client)!==base,others=baseClient?cfgChanges(cfgFromClient(latest.client),cfgFromClient(baseClient)).length:1,known=latest.client.onboarding?.version===1&&typeof revision==='string'&&typeof latest.configurationRevision==='string';
          // Legacy average job value saves have no revision check, so a repeated save sends the same value again rather than being refused.
          if(known?latest.configurationRevision===revision&&latest.editRevision===editRevision:!moved&&!others){acctBusy=false;acctDirty=$('avgTicket').value!==acctBaseline;acctStatus('dirty',known?'We couldn’t confirm this save yet. Your value is still here. Save again when you are ready; a save can’t apply twice.':'We couldn’t confirm this save yet. Your value is still here. Save again to send the same value.');}
          else if(landed&&moved&&!others)acctSaved(latest,snapshot);
          else{acctBusy=false;acctDirty=$('avgTicket').value!==acctBaseline;acctConflict={latest:null};$('acctConflictPanel').hidden=false;$('acctKeepEdits').hidden=true;acctStatus('conflict','We couldn’t confirm this save. Your saved details changed while it was checked. Your value is kept; check the latest version before saving again.');}
        }catch(readError){if(leaving||generation!==portalGeneration)return;acctBusy=false;if(readError.status===401||readError.status===403){document.dispatchEvent(new CustomEvent('mc:session-expired'));return;}acctStatus('error','We could not confirm the save. Your value is still here; save again when your connection returns.');}
        return;}
      if(error.code==='configuration_changed'){acctConflict={latest:null};$('acctConflictPanel').hidden=false;$('acctKeepEdits').hidden=true;acctStatus('conflict','Your saved details changed elsewhere. Your value is kept; check the latest version.');}else{if(error.code==='workspace_closed')cfgClosed=true;acctStatus('error',(error.message||'The save could not be confirmed.')+' Your value is still here.');if($('avgTicket').value===snapshot&&error.fieldErrors&&error.fieldErrors['rules.avgTicket']){acctError(error.fieldErrors['rules.avgTicket']);$('avgTicket').focus();}}}
    finally{if(!leaving&&generation===portalGeneration){acctBusy=false;$('acct').setAttribute('aria-busy','false');$('saveAcct').disabled=cfgClosed;$('acctCheckLatest').disabled=false;$('acctKeepEdits').disabled=false;cfgChanged();acctFocusAfter(focusStart);}}
  }
  $('acct').addEventListener('submit',function(event){event.preventDefault();saveAcct();});
  ['input','change'].forEach(function(type){$('avgTicket').addEventListener(type,acctChanged);});
  $('acctCheckLatest').addEventListener('click',async function(){var focusStart=deskFocusStart([$('acctCheckLatest'),$('acctMsg')]);if(acctBusy||cfgBusy||!acctConflict||leaving)return;var generation=portalGeneration;acctBusy=true;acctStatus('conflict','Checking the latest saved value. Your value will stay here.');cfgChanged();try{var latest=await apiRequest();if(leaving||generation!==portalGeneration)return;if(!cfgLatestReadable(latest))throw new Error('The latest saved value could not be read.');if(['cancelled','archived'].includes(latest.client.status)){cfgClosed=true;acctConflict=null;$('acctConflictPanel').hidden=true;throw new Error('This workspace no longer accepts business edits.');}acctConflict.latest=latest;$('acctConflictText').textContent='Latest saved: '+(acctValue(latest.client)||'Blank')+'. Your current value: '+($('avgTicket').value||'Blank')+'. Keeping your value changes only the average job value.'+(cfgSelfService(latest)?'':' This workspace does not check for other changes when saving, so your value replaces the one shown.');$('acctKeepEdits').hidden=false;acctStatus('conflict','Latest saved value checked. Review it before keeping your value.');}catch(error){if(leaving||generation!==portalGeneration)return;if(error.status===401||error.status===403){document.dispatchEvent(new CustomEvent('mc:session-expired'));return;}acctStatus('conflict',error.message+' Your value is still here.');}finally{if(!leaving&&generation===portalGeneration){acctBusy=false;$('acct').setAttribute('aria-busy','false');$('saveAcct').disabled=cfgClosed;$('acctCheckLatest').disabled=false;$('acctKeepEdits').disabled=false;cfgChanged();acctFocusAfter(focusStart);}}});
  $('acctKeepEdits').addEventListener('click',function(){if(acctBusy||cfgBusy||websiteBusy||cfgClosed||!acctConflict||!acctConflict.latest||leaving)return;if(document.activeElement===this)$('acctMsg').focus({preventScroll:true});var latest=acctConflict.latest;acctBaseline=acctValue(latest.client);acctBaseClient=latest.client;acctRevision=latest.configurationRevision;acctEditRevision=latest.editRevision;acctConflict=null;$('acctConflictPanel').hidden=true;acctDirty=$('avgTicket').value!==acctBaseline;saveAcct();});
  $('legal').addEventListener('submit', function (e) {
    e.preventDefault(); var f = e.target;
    apiRequest('PUT', { legal: { legalName: f.elements['legalName'].value, ein: f.elements['ein'].value, businessType: f.elements['businessType'].value, street: f.elements['street'].value, city: f.elements['city'].value, state: f.elements['state'].value, zip: f.elements['zip'].value } })
      .then(function () { return action('provision'); }).then(function () { $('legalMsg').textContent = 'Saved. Filing now; check back in a day.'; setTimeout(load, 4000); }).catch(function (error) { $('legalMsg').textContent = error.message; });
  });

  ['input','change'].forEach(function(type){$('cfg').addEventListener(type,function(event){var field=event.target,value=field.type==='checkbox'?String(field.checked):field.value;if(event.type==='change'&&cfgEventValues.get(field)===value)return;cfgEventValues.set(field,value);if(field.getAttribute('aria-invalid')==='true'&&field.dataset.cfgInvalidValue===value)return;if(field.closest('#cfgAppointmentHoursGroup')){cfgAppointmentRefresh(true);cfgClearError('rules.appointmentHours');}else cfgClearError(field.name||'rules.hours');cfgChanged();});});
  window.addEventListener('beforeunload',function(event){if(cfgDirty||cfgBusy||acctDirty||acctBusy||websiteDirty||websiteBusy){event.preventDefault();event.returnValue='';}});

  $('deskSignOut').addEventListener('click', async function () {
    if(accountBusy){accountMessage('A service change is still being checked. You can sign out when that check finishes.');routeTo('account');$('accountServiceMessage').focus({preventScroll:true});return;}
    var button = $('deskSignOut'), interruptedExport = exportBusy; button.disabled = true;
    leaving = true; portalGeneration++; closeTour(false, false); cancelPracticeReply(); availabilityReset(); scheduleReset();
    try {
      var response = await fetch(API_BASE + '/api/access', { method: 'POST', headers: ownerHeaders(), body: JSON.stringify({ action: 'sign_out' }) });
      if (!response.ok) throw new Error('Sign out could not be confirmed. Please retry.');
      var signedOutHandle = ownerSession; websitePrivateClear();ownerSession = null; key = null; data = null; transcript = [];
      try { sessionStorage.removeItem('mc-owner-visit-pending-v1:'+slug); sessionStorage.removeItem('mc-onboarding-session-v1'); sessionStorage.removeItem(ownerKeyStorage); sessionStorage.removeItem(cfgExpiredKey); } catch (error) { /* Session is revoked on the server. */ }
      // Every other tab of this browser shares the revoked session; tell them now rather than at their next request.
      if (window.MCOwnerSession) window.MCOwnerSession.signedOut(signedOutHandle);
      button.hidden = true; $('retryLoad').hidden = true;
      history.replaceState(null, '', location.pathname);
      try { localStorage.removeItem(RETURN_ROUTE_KEY); } catch (error) { /* Nothing to return to after a chosen sign-out. */ }
      recover('Signed out. Use an email sign-in link to open your workspace again.', true);
      $('portalContent').innerHTML = '';
    } catch (error) { if (!ownerSession && !key) return; leaving = false; cfgBusy = false; acctBusy = false; websiteBusy=false; reviewBusy=false;
      if(interruptedExport){exportBusy=false;['expBookings','expLeads','expConvs','expCustomers'].forEach(function(id){$(id).disabled=false;});$('accountDownloads').setAttribute('aria-busy','false');$('exportMessage').dataset.error='true';$('exportMessage').textContent='Sign out could not be confirmed. Your earlier download was interrupted; try the download again.';}
      cfgFence++; cfgChanged(); acctStatus(); await load(); toast(error.message); } finally { button.disabled = false; }
  });
  ['expBookings','expLeads','expConvs','expCustomers'].forEach(function (id) {
    $(id).addEventListener('click', async function (event) {
      event.preventDefault(); var kind = event.currentTarget.dataset.export, generation = portalGeneration, control = event.currentTarget; if (!kind || exportBusy || leaving) return;
      var focusStart = deskFocusStart([control]);
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
      finally { clearTimeout(timeout); if(generation===portalGeneration&&!leaving){exportBusy=false;buttons.forEach(function(button){$(button).disabled=false;});$('accountDownloads').setAttribute('aria-busy','false');deskFocusAfter(focusStart,'account',control,$('exportMessage'));} }
    });
  });

  // test chat
  var msgs = $('msgs'), chatPending = null;
  function add(role, text) { var el = document.createElement('div'); el.className = 'b ' + (role === 'user' ? 'u' : role === 'sys' ? 's' : 'a'); el.textContent = text; msgs.appendChild(el); msgs.scrollTop = msgs.scrollHeight; return el; }
  function practiceStatus(text) { if ($('chatStatus')) $('chatStatus').textContent = text; }
  function clearPracticePending() {
    if (!chatPending) return;
    clearTimeout(chatPending.timer); chatPending.element.remove(); chatPending = null;
  }
  function showPracticePending() {
    clearPracticePending();
    var element = add('a', ''), dots = document.createElement('span'), label = document.createElement('span');
    element.classList.add('chat-pending'); element.setAttribute('aria-hidden', 'true'); dots.className = 'chat-pending-dots';
    for (var i = 0; i < 3; i++) dots.appendChild(document.createElement('i'));
    label.textContent = 'Preparing your reply…'; element.append(dots, label);
    var pending = { element: element, timer: null }; chatPending = pending;
    practiceStatus(label.textContent); $('testPreview').textContent = label.textContent; msgs.scrollTop = msgs.scrollHeight;
    element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    pending.timer = setTimeout(function () {
      if (chatPending !== pending || leaving) return;
      label.textContent = 'Still working on your reply…'; practiceStatus(label.textContent); $('testPreview').textContent = label.textContent;
      msgs.scrollTop = msgs.scrollHeight;
    }, 8000);
  }
  function practiceControls(busy) {
    chatBusy = busy;
    if ($('chatForm')) { $('chatForm').setAttribute('aria-busy', String(busy)); var button = $('chatForm').querySelector('button'); button.disabled = busy; button.textContent = busy ? 'Replying…' : 'Send'; }
    if ($('newChat')) $('newChat').disabled = busy;
    msgs.setAttribute('aria-busy', String(busy));
  }
  function cancelPracticeReply() {
    var controller = chatController, pending = chatBusy;
    chatController = null; if (controller) controller.abort(); clearPracticePending(); practiceControls(false); practiceStatus('');
    if (pending && $('testPreview')) $('testPreview').textContent = 'The reply was stopped. Start a new conversation to try again.';
  }
  function greet() { clearPracticePending(); practiceStatus(''); msgs.innerHTML = ''; add('a', (data && data.client.widget.greeting) || 'Hi, what can we help with today?'); }
  $('newChat').addEventListener('click', function () { if (chatBusy || leaving) return; contact = 't' + Math.random().toString(36).slice(2, 10); transcript = []; greet(); $('testPreview').textContent = 'Send a practice message to see the result here.'; });
  $('chatIn').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('chatForm').requestSubmit(); } });
  // PRA-FC-04: name the real reason a practice reply did not count, and say whether an earlier check of the same answers still does.
  function practiceNotSavedText(test) {
    var why = ({ booking_details: 'the practice visit was not saved because the name, phone, address, problem or a listed future arrival window was missing. Practice again and give all of them.', emergency_booking: 'it was treated as an emergency, and emergencies are never booked. Practice an ordinary repair request to complete the check.', handoff_reason: 'the practice handoff was refused. Send the question again.', tool_unavailable: 'the front desk tried an action that practice does not support. Send the question again.', reply_incomplete: 'the reply did not finish. Send the question again.', rules_changed: 'your business details changed while it ran. Practice again with the saved details.', workspace_changed: 'your workspace changed while it ran. Reload the page and practice again.' })[test && test.notRecordedReason];
    return (why ? 'This reply did not count as a check: ' + why : 'This reply did not count as a check. Send the question again.') + (test && test.earlierCheckCurrent ? ' Your earlier check of these same answers still counts.' : '');
  }
  var chatBusy = false;
  window.addEventListener('pagehide', cancelPracticeReply);
  $('chatForm').addEventListener('submit', async function (event) {
    event.preventDefault(); var text = $('chatIn').value.trim(); if (!text || chatBusy || !data || leaving) return;
    var practiceRevision=data.setup?.revision,practiceGeneration=portalGeneration,proofRecorded=false;
    practiceControls(true);document.dispatchEvent(new CustomEvent('mc:guide-state-change'));$('chatIn').value = '';
    var turn = { role: 'user', content: text }, question = add('user', text), bubble = null, full = '', finished = false; transcript.push(turn);
    var controller = new AbortController(), timeout = setTimeout(function () { controller.abort(); }, 60000);
    chatController = controller; showPracticePending();
    function current() { return !leaving && practiceGeneration === portalGeneration && chatController === controller; }
    function receive(line) {
      if (!current() || finished) return;
      if (!line.trim()) return;
      var out = JSON.parse(line);
      if (out.t === 'delta' && typeof out.text === 'string' && out.text) { full += out.text; if (!full.trim()) return; if (!bubble) { clearPracticePending(); bubble = add('a', ''); practiceStatus('Your front desk is replying.'); $('testPreview').textContent = 'Your reply is arriving…'; } bubble.textContent = full; msgs.scrollTop = msgs.scrollHeight; }
      if (out.t === 'error') throw new Error(out.error === 'offline' ? 'The AI service is unavailable right now. Your settings are saved.' : 'The practice reply could not be completed.');
      if (out.t === 'done') {
        clearPracticePending(); msgs.setAttribute('aria-busy', 'false'); practiceStatus('Reply received.'); $('chatForm').querySelector('button').textContent = 'Updating…';
        proofRecorded=out.test?.proofRecorded===true;
        finished = true; if (!bubble) bubble = add('a', out.reply); else bubble.textContent = out.reply;
        transcript.push({ role: 'assistant', content: out.reply });
        var previews = (out.events || []).filter(function (item) { return item.type === 'test_booking' || item.type === 'test_lead'; });
        $('testPreview').textContent = previews.length ? previews.map(function (item) { var values = item.data || {}; return (item.type === 'test_booking' ? 'Practice visit preview' : 'Practice handoff preview') + '\n' + Object.keys(values).map(function (key) { return key.replace(/_/g, ' ') + ': ' + values[key]; }).join('\n'); }).join('\n\n') + '\n\nNo real visit, message or calendar event was created.' : 'Practice reply completed. No real visit, message or calendar event was created.';
        if (out.test && !out.test.proofRecorded) $('testPreview').textContent += '\n' + practiceNotSavedText(out.test);
      }
    }
    try {
      var response = await fetch(API_BASE + '/api/chat', { method: 'POST', headers: ownerHeaders(), body: JSON.stringify({ client: slug, key: key, channel: 'test', contact: contact, messages: transcript.slice(-20), stream: true }), signal: controller.signal });
      if (!current()) return;
      if (!response.ok) {
        var failure = await response.json().catch(function () { return {}; });
        if (response.status === 401 || response.status === 403) { document.dispatchEvent(new CustomEvent('mc:session-expired')); throw new Error('Your session expired. Sign in by email to continue.'); }
        if (response.status === 429) { await load(); throw new Error(failure.message || 'The daily practice allowance has been used. Try again after midnight Houston time.'); }
        throw new Error(response.status === 503 ? 'The AI service is unavailable right now. Your settings are saved.' : 'The practice reply could not be started.');
      }
      var reader = response.body.getReader(), decoder = new TextDecoder(), buffer = '';
      for (;;) { var part = await reader.read(); if (part.done) break; buffer += decoder.decode(part.value, { stream: true }); var lines = buffer.split('\n'); buffer = lines.pop(); lines.forEach(receive); }
      buffer += decoder.decode(); if (buffer.trim()) receive(buffer);
      if (!finished) throw new Error('The reply did not arrive.');
      if (current()) await latestWorkspaceRead(); // Use the latest canonical revision before offering a connector continuation.
    } catch (error) {
      if (current()) {
        // An unanswered question leaves the conversation and returns to the input, so the next send stays a normal user/assistant exchange.
        var message = error.name === 'AbortError' ? 'The reply took too long and did not arrive.' : error instanceof TypeError ? 'The reply did not arrive.' : error.message;
        if (!finished) { if (question.isConnected) question.remove(); if (bubble && bubble.isConnected) bubble.remove(); var later = /allowance|unavailable/.test(message); if (!$('chatIn').value.trim()) { $('chatIn').value = text; message += ' Your question is back in the message box; send it again' + (later ? ' when replies are available.' : '.'); } else message = (/did not arrive/.test(message) ? '' : message + ' ') + 'The reply to “' + (text.length > 80 ? text.slice(0, 79) + '…' : text) + '” did not arrive. Send it again when ' + (later ? 'replies are available.' : 'you’re ready.'); }
        // The conversation log announces the message once: clear the status first, and end the log's busy state before adding it.
        practiceStatus(''); msgs.setAttribute('aria-busy', 'false'); add('sys', message); $('testPreview').textContent = message;
      }
    }
    finally { if (!finished) { var unanswered = transcript.indexOf(turn); if (unanswered >= 0) transcript.splice(unanswered, 1); } clearTimeout(timeout); if (chatController === controller) { clearPracticePending(); chatController = null; practiceControls(false); if (!leaving && $('chatIn')) $('chatIn').focus(); if(!leaving){document.dispatchEvent(new CustomEvent('mc:guide-state-change'));if(proofRecorded&&practiceGeneration===portalGeneration&&data?.setup?.revision===practiceRevision&&data.client.setupProof?.testedRevision===practiceRevision&&data.client.setupProof?.testMode==='live'&&!cfgDirty&&!cfgBusy)document.dispatchEvent(new CustomEvent('mc:guide-step-complete',{detail:{step:'practice',revision:practiceRevision,slug:slug}}));} } }
  });
  load().then(greet);
})();
