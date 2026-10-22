(function () {
  var q = new URLSearchParams(location.search), slug = q.get('c'), key = q.get('k');
  var ownerSession = null; try { ownerSession = sessionStorage.getItem('mc-onboarding-session-v1'); } catch (error) { /* Email sign-in is available when storage is disabled. */ }
  if (!slug || (!key && !ownerSession)) { document.getElementById('title').textContent = 'Your workspace'; document.getElementById('status').textContent = 'Sign in to continue'; document.getElementById('portalRecovery').hidden = false; document.getElementById('retryLoad').hidden = true; return; }
  var API_BASE = (function () { var m = document.querySelector('meta[name="mc-api-base"]'); return (m && m.content) ? m.content.replace(/\/$/, '') : ''; })();
  var API = API_BASE + '/api/client?c=' + encodeURIComponent(slug) + (key ? '&k=' + encodeURIComponent(key) : '');
  var portalGeneration = 0, leaving = false, chatController = null, cfgRevision = null, cfgDirty = false, guideStarted = false, data = null, contact = 't' + Math.random().toString(36).slice(2, 10), transcript = [];
  var $ = function (id) { return document.getElementById(id); };
  function ownerHeaders() { var headers = { 'Content-Type': 'application/json' }; if (ownerSession) headers.Authorization = 'Bearer ' + ownerSession; return headers; }
  function toast(t) { var el = $('toast'); el.textContent = t; el.style.display = 'block'; setTimeout(function () { el.style.display = 'none'; }, 2500); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function recover(message) {
    if ($('phoneCancelDialog').open) $('phoneCancelDialog').close(); phoneCancelSnapshot = null; if ($('phoneAuthority')) $('phoneAuthority').checked = false; if ($('phoneCosts')) $('phoneCosts').checked = false;
    $('portalContent').hidden = true; $('portalRecovery').hidden = false;
    $('title').textContent = 'Your workspace'; $('status').textContent = 'Unable to open workspace';
    $('recoveryMessage').textContent = message; if ($('liveBtns')) $('liveBtns').innerHTML = '';
  }
  document.addEventListener('mc:session-expired',function () {
    leaving = true; portalGeneration++; ownerSession = null; key = null; data = null; transcript = []; if (chatController) chatController.abort();
    try { sessionStorage.removeItem('mc-onboarding-session-v1'); sessionStorage.removeItem('mc-calendar-pending-v1'); } catch (error) { /* Private content is still cleared. */ }
    recover('Your session expired. Sign in by email to reopen your workspace.'); $('portalContent').innerHTML = ''; $('deskSignOut').hidden = true; $('retryLoad').hidden = true;
  });
  document.addEventListener('mc:desk-refresh',function(){if(!leaving)load();});
  async function apiRequest(method, body) {
    var controller = new AbortController(), timeout = setTimeout(function () { controller.abort(); }, 20000);
    try {
      var response = await fetch(API, { method: method || 'GET', headers: ownerHeaders(), body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal });
      var result = await response.json();
      if (!response.ok || result.error || result.ok === false) {
        var message = result.message || (result.error === 'not_ready' ? 'Finish the setup checklist before activating website chat.' : result.error === 'configuration_changed' ? 'Your rules changed in another tab. Refresh and review the current version.' : response.status === 401 || response.status === 403 ? 'This private link is invalid or expired. Sign in by email to recover your workspace.' : 'We could not confirm that change. Please retry.');
        var error = new Error(message); error.status = response.status; error.setup = result.setup; throw error;
      }
      return result;
    } finally { clearTimeout(timeout); }
  }
  $('retryLoad').addEventListener('click', function () { load().then(greet); });
  function availabilityDateLabel(date) { return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(date + 'T12:00:00Z')); }
  function renderAvailability(blocks) {
    $('availabilityBlocks').innerHTML = blocks.length ? blocks.map(function (b) {
      var label = availabilityDateLabel(b.date) + ' · ' + (b.window || 'Whole day');
      return '<div class="availability-row"><div><b>' + esc(label) + '</b>' + (b.existingBookings ? '<div>' + esc(b.existingBookings) + ' visit' + (b.existingBookings === 1 ? ' is' : 's are') + ' already reserved and unchanged.</div>' : '') + '</div><button type="button" class="btn-pill btn-pill-dark btn-sm availability-remove" data-date="' + esc(b.date) + '" data-window="' + esc(b.window) + '" aria-label="Remove block for ' + esc(label) + '">Remove block</button></div>';
    }).join('') : '<p>No time blocked.</p>';
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

  function showTab(t) { document.querySelectorAll('.tabs button').forEach(function (x) { x.classList.toggle('on', x.dataset.t === t); }); document.querySelectorAll('.pane').forEach(function (p) { p.classList.toggle('on', p.id === 'p-' + t); }); }
  if (location.hash && document.getElementById('p-' + location.hash.slice(1))) showTab(location.hash.slice(1));
  document.querySelectorAll('.tabs button').forEach(function (b) { b.addEventListener('click', function () { window.__tabPicked = true; document.querySelectorAll('.tabs button').forEach(function (x) { x.classList.toggle('on', x === b); }); document.querySelectorAll('.pane').forEach(function (p) { p.classList.toggle('on', p.id === 'p-' + b.dataset.t); }); }); });

  function routeTo(tab) {
    window.__tabPicked = true; if (tab === 'test') $('tabTest').style.display = '';
    showTab(tab); var pane = $('p-' + tab); if (!pane) return;
    document.querySelectorAll('.guide-target').forEach(function (node) { node.classList.remove('guide-target'); });
    pane.classList.add('guide-target'); pane.tabIndex = -1; pane.scrollIntoView({ behavior: 'instant', block: 'start' }); pane.focus({ preventScroll: true });
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
    $('guideTitle').textContent = operational ? 'Your website front desk' : 'Set up your front desk';
    $('guideIntro').textContent = operational ? 'Customer requests appear under Leads and bookings. Keep your rules and blocked time up to date.' : wantsWeb ? 'Your answers are saved. Review the rules, try a private conversation and follow your connection setup here.' : 'Your answers and connection preferences are saved. Follow their next steps under Setup. You can add website chat if you want it.';
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
    $('reviewRules').disabled = cfgDirty || client.status === 'cancelled';
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
    if (!data || !data.setup || cfgDirty) return;
    $('reviewRules').disabled = true; $('reviewMessage').textContent = 'Saving your review…';
    action('review_rules', { revision: data.setup.revision }).then(function () { return load(); }).catch(function (error) { $('reviewMessage').textContent = error.message; $('reviewRules').disabled = false; });
  });
  $('copySnippet').addEventListener('click', async function () {
    try { await navigator.clipboard.writeText($('snippet').textContent); $('copyMessage').textContent = 'Copied. Install this on your website.'; }
    catch (error) { $('copyMessage').textContent = 'Select the code above and copy it manually.'; }
  });
  var tour = [
    { title: 'Your desk, in one place', body: 'Your business answers are saved here. The checklist shows what is complete and what needs attention. Website chat, phone and texting have separate statuses, so you can see exactly what customers can use.', action: 'See my setup', tab: 'setup' },
    { title: 'Make the answers yours', body: 'Open What it knows and check your services, service area, published prices, hours and safety instructions. Save any corrections, then select “I reviewed these saved rules.” Changes require another review and test.', action: 'Review my rules', tab: 'know' },
    { title: 'Practice the requests you get', body: 'Try a customer booking, callback request or question in Test it. The result shows the details collected. Practice does not book a real visit, contact anyone, use your actual capacity or change a calendar.', action: 'Try a private conversation', tab: 'test' },
    { title: 'Protect time you have already booked', body: 'Under Availability, block a whole day or an arrival window for existing jobs, closures or time off. Existing visits stay booked. Calendar sync is not connected, so keep outside work up to date here.', action: 'Check availability', tab: 'availability' },
    { title: 'Choose when customers can use it', body: 'Setup lists the requirements for website chat. When the saved rules have been reviewed and tested with the working AI service, activate chat and install the code on your website. Phone and text messages stay inactive until their own setup is verified.', action: 'See activation and installation', tab: 'setup' },
    { title: 'Know what needs you each day', body: 'Leads and bookings holds customer requests; Conversations shows what was said. Check these regularly while phone and text alerts are inactive. Pause website chat from the top of this page, export your records under Account, and reopen this guide whenever you need it.', action: 'View customer requests', tab: 'leads' }
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
    var generation = portalGeneration;
    return apiRequest().then(function (d) {
      if (generation !== portalGeneration) return;
      if (!d.client || !d.client.owner || !d.client.business) throw new Error('Your workspace could not be loaded. Sign in again to continue.');
      $('portalRecovery').hidden = true; $('portalContent').hidden = false;
      data = d; var c = d.client;
      queueMicrotask(function () { if (!leaving && data === d) document.dispatchEvent(new CustomEvent('mc:desk', { detail: d })); });
      var windowChoice = $('availabilityWindow').value;
      $('availabilityWindow').innerHTML = '<option value="">Whole day</option>' + (c.windows || []).map(function (w) { return '<option value="' + esc(w) + '">' + esc(w) + '</option>'; }).join('');
      if ((c.windows || []).indexOf(windowChoice) >= 0) $('availabilityWindow').value = windowChoice;
      var houstonToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      $('availabilityDate').min = houstonToday; if (!$('availabilityDate').value) $('availabilityDate').value = houstonToday;
      renderAvailability(d.availabilityBlocks || []);
      $('title').textContent = (c.business.name || 'Your front desk');
      var selfService = c.onboarding && c.onboarding.version === 1;
      var st = $('status'); st.textContent = c.status === 'live' ? 'live' : c.status === 'testing' ? 'testing, not live yet' : c.status; st.className = 'st' + (c.status === 'live' ? ' live' : '');
      st.textContent = c.status === 'live' ? 'live' : c.status === 'testing' ? 'testing, not live yet' : c.status === 'paused' ? 'paused: calls ring your phone, no texts, no chat' : c.status === 'cancelled' ? 'cancelled' : c.status;
      var offBtns = (d.forwarding && d.forwarding.off && d.forwarding.off.length && (c.status === 'paused' || c.status === 'cancelled')) ? '<div class="muted" style="margin-top:8px">Send calls back to your phone: ' + d.forwarding.off.map(function (k) { return '<a class="btn-pill btn-pill-dark btn-sm" style="margin:4px 6px 4px 0" href="tel:' + encodeURIComponent(k) + '">Dial ' + esc(k) + '</a>'; }).join('') + '<br>' + esc(d.forwarding.offLong || '') + '</div>' : '';
      document.querySelector('.tabs button[data-t="test"]').style.display = c.status === 'cancelled' ? 'none' : '';
      var live = c.status === 'live'; $('tabToday').style.display = live ? '' : 'none'; $('tabTest').style.display = live || c.status === 'cancelled' ? 'none' : '';
      if (live && !location.hash && !window.__tabPicked) { showTab('today'); window.__tabPicked = true; }

      $('needsYou').innerHTML = (function () { var rows = d.leads.filter(function (l) { return l.status === 'open' && (l.alertWaiting || l.overdueAt || l.outcome === 'needs_action' || l.outcome === 'wants_call'); }); return rows.length ? rows.slice(0, 10).map(function (l) { return '<div>' + esc(l.customer_name || l.phone) + ' (' + esc((l.outcome || '').replace('_', ' ')) + (l.urgency === 'emergency' ? ', <b>EMERGENCY</b>' : '') + (l.overdueAt ? ', <span class="tag-overdue">overdue callback</span>' : '') + ') ref ' + esc(l.id) + (l.alertWaiting ? ' <button type="button" class="btn-pill btn-pill-blue btn-sm ack" data-id="' + esc(l.id) + '">Acknowledge</button>' : '') + '</div>'; }).join('') : 'Nothing waiting on you.'; })();
      $('todayEvents').innerHTML = (d.events || []).filter(function (e) { return Date.now() - new Date(e.at).getTime() < 86400000; }).slice(0, 15).map(function (e) { return '<div>' + esc((e.at || '').slice(11, 16)) + ' ' + esc(e.type.replace(/_/g, ' ')) + (e.data && e.data.id ? ' ref ' + esc(e.data.id) : '') + '</div>'; }).join('') || 'Quiet so far.';
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
      $('bookings').innerHTML = d.bookings.length ? '<div class="tblwrap"><table class="tbl"><tr><th>When</th><th>Customer</th><th>Issue</th><th>Visit</th><th>Status</th><th>Ref</th></tr>' + d.bookings.map(function (b) { return '<tr><td>' + esc((b.createdAt || '').slice(0, 16).replace('T', ' ')) + '</td><td>' + esc(b.customer_name) + ' <span class="muted">(' + (b.customerType === 'existing' ? 'existing' : 'new') + ')</span><br><span class="muted">' + esc(b.phone) + '</span>' + (b.unsure ? '<br><span class="muted">Unsure: ' + esc(b.unsure) + '</span>' : '') + '</td><td>' + esc(b.issue) + '<br><span class="muted">' + esc(b.address) + '</span></td><td>' + esc(b.date) + ' ' + esc(b.window) + '</td><td>' + esc(b.status) + '</td><td>' + esc(b.id) + '</td></tr>'; }).join('') + '</table></div>' : '<p class="muted">No bookings yet.</p>';
      $('leads').innerHTML = d.leads.length ? '<div class="tblwrap"><table class="tbl"><tr><th>When</th><th>Customer</th><th>Issue</th><th>Outcome</th><th>Status</th><th>Ref</th></tr>' + d.leads.map(function (l) { return '<tr><td>' + esc((l.createdAt || '').slice(0, 16).replace('T', ' ')) + '</td><td>' + esc(l.customer_name || 'no name') + ' <span class="muted">(' + (l.customerType === 'existing' ? 'existing' : 'new') + ')</span><br><span class="muted">' + esc(l.phone) + '</span></td><td>' + esc(l.issue) + (l.unsure ? '<br><span class="muted">Unsure: ' + esc(l.unsure) + '</span>' : '') + '</td><td>' + esc((l.outcome || l.reason || '').replace('_', ' ')) + (l.urgency === 'emergency' ? ' <b>EMERGENCY</b>' : '') + (l.overdueAt && l.status === 'open' ? '<span class="tag-overdue">overdue callback</span>' : '') + (l.alertWaiting ? ' <button type="button" class="btn-pill btn-pill-blue btn-sm ack" data-id="' + esc(l.id) + '">Acknowledge</button>' : '') + '</td><td>' + esc(l.status) + '</td><td>' + esc(l.id) + '</td></tr>'; }).join('') + '</table></div>' : '<p class="muted">No leads yet.</p>';
      document.querySelectorAll('button.ack').forEach(function (b) { b.addEventListener('click', function () { apiRequest('POST', { action: 'ack', leadId: b.dataset.id }).then(function () { toast('Acknowledged.'); return load(); }).catch(function (error) { toast(error.message); }); }); });
      $('convs').innerHTML = d.conversations.length ? d.conversations.map(function (v) { return '<div class="conv"><b>' + esc(v.channel) + ' · ' + esc(v.contact) + ' · ' + esc((v.updatedAt || '').slice(0, 16).replace('T', ' ')) + ' ' + (v.flag ? '<span class="muted">Flagged: ' + esc(v.flag.note || '') + '</span> <a href="#" class="unflag" data-ch="' + esc(v.channel) + '" data-ct="' + esc(v.contact) + '">Unflag</a>' : '<button type="button" class="btn-pill btn-pill-dark btn-sm flag" data-ch="' + esc(v.channel) + '" data-ct="' + esc(v.contact) + '">Flag</button>') + '</b>' + v.messages.map(function (m) { return '<div class="' + (m.role === 'user' ? 'u' : 'a') + '">' + (m.role === 'user' ? 'Customer: ' : 'Desk: ') + esc(m.content) + (m.processing ? '<small class="muted"> · ' + esc(m.processing.replace(/_/g, ' ')) + '</small>' : '') + '</div>'; }).join('') + '</div>'; }).join('') : '<p class="muted">No conversations yet.</p>';
      document.querySelectorAll('button.flag').forEach(function (b) { b.addEventListener('click', function () { var note = window.prompt('What went wrong? One line is enough.') || ''; apiRequest('POST', { action: 'flag', channel: b.dataset.ch, contact: b.dataset.ct, note: note }).then(function () { toast('Issue recorded on this conversation.'); return load(); }).catch(function (error) { toast(error.message); }); }); });
      document.querySelectorAll('a.unflag').forEach(function (a) { a.addEventListener('click', function (ev) { ev.preventDefault(); apiRequest('POST', { action: 'unflag', channel: a.dataset.ch, contact: a.dataset.ct }).then(function () { return load(); }).catch(function (error) { toast(error.message); }); }); });
      // config form
      if (!cfgDirty) {
      cfgRevision = d.configurationRevision;
      var f = $('cfg'), lines = function (a) { return (a || []).join('\n'); };
      f.elements['business.name'].value = c.business.name || ''; f.elements['business.trade'].value = c.business.trade || ''; f.elements['business.hours'].value = c.business.hours || ''; var DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']; var hr = document.getElementById('hoursRows'); if (!hr.children.length) hr.innerHTML = DAYS.map(function (d) { return '<div class="hours-row"><span>' + d.charAt(0).toUpperCase() + d.slice(1) + '</span><input type="time" data-d="' + d + '" data-k="open"><span>to</span><input type="time" data-d="' + d + '" data-k="close"></div>'; }).join(''); var hrs = c.rules.hours || {}; hr.querySelectorAll('input').forEach(function (inp) { var v = hrs[inp.dataset.d]; inp.value = v ? v[inp.dataset.k] : ''; }); document.getElementById('hoursNote').textContent = c.rules.hours ? 'The front desk uses these for the callback promise and after-hours rules.' : 'We could not read your hours; using 7 am to 7 pm until you fill in the rows.'; f.elements['business.afterHours'].value = c.business.afterHours || '';
      f.elements['business.serviceArea'].value = lines(c.business.serviceArea); f.elements['business.notServed'].value = lines(c.business.notServed); f.elements['business.spanish'].value = c.business.spanish ? 'yes' : 'no'; f.elements['business.licenses'].value = c.business.licenses || '';
      f.elements['services'].value = lines(c.services); f.elements['fees'].value = (c.fees || []).map(function (x) { return x.label + ': ' + x.amount + (x.note ? ' (' + x.note + ')' : ''); }).join('\n'); f.elements['windows'].value = lines(c.windows);
      f.elements['rules.handoff'].value = lines(c.rules.handoff); f.elements['rules.never'].value = lines(c.rules.never); var em = (c.rules.emergencies && typeof c.rules.emergencies === 'object') ? c.rules.emergencies : { tier0: [], tier1: [], tier2: '', script: c.rules.emergencies || '' }; f.elements['rules.emergencies.tier0'].value = lines(em.tier0); f.elements['rules.emergencies.tier1'].value = lines(em.tier1); f.elements['rules.emergencies.tier2'].value = em.tier2 || ''; f.elements['rules.emergencies.script'].value = em.script || ''; f.elements['widget.allowedOrigins'].value = lines(c.widget.allowedOrigins || []); f.elements['summary'].value = c.summary || ''; f.elements['widget.greeting'].value = c.widget.greeting || '';
      f.elements['faq'].value = (c.faq || []).map(function (x) { return x.q + ' ' + x.a; }).join('\n'); f.elements['owner.name'].value = c.owner.name || ''; f.elements['owner.phone'].value = c.owner.phone || ''; f.elements['owner.backupPhone'].value = c.owner.backupPhone || ''; f.elements['phone.transferTo'].value = c.phone.transferTo || ''; f.elements['rules.ackMinutes'].value = String(c.rules.ackMinutes || 10); f.elements['phone.forwarding'].value = c.phone.forwarding || 'missed'; f.elements['rules.callbackHours'].value = c.rules.callbackHours || ''; f.elements['rules.callbackAfterHours'].value = c.rules.callbackAfterHours || ''; document.getElementById('transferGroup').style.display = (c.phone.forwarding === 'all') ? 'block' : 'none'; f.elements['business.reviewLink'].value = c.business.reviewLink || ''; f.elements['business.payLink'].value = c.business.payLink || ''; f.elements['rules.bypass'].value = lines(c.rules.bypass || []); f.elements['digest.text'].checked = !(c.digest && c.digest.text === false); f.elements['rules.consentAsk'].checked = !!c.rules.consentAsk; f.elements['rules.windowCapacity'].value = c.rules.windowCapacity || 1; $('acct').elements['rules.avgTicket'].value = c.rules.avgTicket || '';
      }
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
    }).catch(function (error) { if (generation === portalGeneration) recover(error.name === 'AbortError' ? 'Loading timed out. Try again or sign in by email.' : error.message); });
  }
  function action(a, extra) { return apiRequest('POST', Object.assign({ action: a }, extra || {})); }
  function confirmAction(name, message) { return action(name).then(function () { toast(message); return load(); }).catch(function (error) { $('setupMessage').textContent = error.message; toast(error.message); }); }
  $('testSms').addEventListener('click', function () { action('test_sms').then(function (r) { $('smsText').textContent = r.ok ? 'Test text request accepted. Check your phone for delivery.' : 'No test text was sent.'; }).catch(function (error) { $('smsText').textContent = error.message; }); });

  $('cfg').elements['phone.forwarding'].addEventListener('change', function (ev) { document.getElementById('transferGroup').style.display = ev.target.value === 'all' ? 'block' : 'none'; });
  $('cfg').addEventListener('submit', function (e) {
    e.preventDefault(); var f = e.target, L = function (n) { return f.elements[n].value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean); };
    var body = { expectedRevision: cfgRevision, business: { name: f.elements['business.name'].value, trade: f.elements['business.trade'].value, hours: f.elements['business.hours'].value, afterHours: f.elements['business.afterHours'].value, serviceArea: L('business.serviceArea'), notServed: L('business.notServed'), spanish: f.elements['business.spanish'].value === 'yes', licenses: f.elements['business.licenses'].value, reviewLink: f.elements['business.reviewLink'].value, payLink: f.elements['business.payLink'].value, city: data.client.business.city, googlePlaceId: data.client.business.googlePlaceId },
      owner: { name: f.elements['owner.name'].value, phone: f.elements['owner.phone'].value, backupPhone: f.elements['owner.backupPhone'].value }, phone: { businessNumber: data.client.phone.businessNumber, forwarding: f.elements['phone.forwarding'].value, carrier: data.client.phone.carrier, transferTo: f.elements['phone.transferTo'].value }, services: L('services'),
      fees: L('fees').map(function (line) { var m = line.match(/^(.*?)[:\-–]\s*(\$?[\d,.]+[^(]*)(?:\((.*)\))?$/); return m ? { label: m[1].trim(), amount: m[2].trim(), note: (m[3] || '').trim() } : { label: line, amount: '', note: '' }; }),
      windows: L('windows'), rules: { handoff: L('rules.handoff'), never: L('rules.never'), emergencies: { tier0: L('rules.emergencies.tier0'), tier1: L('rules.emergencies.tier1'), tier2: f.elements['rules.emergencies.tier2'].value, script: f.elements['rules.emergencies.script'].value }, ackMinutes: Number(f.elements['rules.ackMinutes'].value), callbackHours: f.elements['rules.callbackHours'].value, callbackAfterHours: f.elements['rules.callbackAfterHours'].value, bypass: L('rules.bypass'), consentAsk: f.elements['rules.consentAsk'].checked, windowCapacity: Number(f.elements['rules.windowCapacity'].value) || 1, hours: (function () { var t = {}; document.querySelectorAll('#hoursRows input[data-k="open"]').forEach(function (o) { var c2 = document.querySelector('#hoursRows input[data-d="' + o.dataset.d + '"][data-k="close"]'); t[o.dataset.d] = o.value && c2.value ? { open: o.value, close: c2.value } : null; }); return t; })() }, digest: { text: f.elements['digest.text'].checked }, summary: f.elements['summary'].value, widget: { greeting: f.elements['widget.greeting'].value, allowedOrigins: L('widget.allowedOrigins') },
      faq: L('faq').map(function (line) { var i = line.indexOf('?'); return i > 0 ? { q: line.slice(0, i + 1).trim(), a: line.slice(i + 1).trim() } : null; }).filter(Boolean) };
    $('saveMsg').textContent = 'Saving…'; apiRequest('PUT', body).then(function () { cfgDirty = false; $('saveMsg').textContent = 'Saved. Review and test this version before activating website chat.'; return load(); }).catch(function (error) { $('saveMsg').textContent = error.message + ' Your edits are still on this page.'; });
  });

  $('acct').addEventListener('submit', function (event) { event.preventDefault(); apiRequest('PUT', { expectedRevision: cfgRevision, rules: { avgTicket: event.target.elements['rules.avgTicket'].value } }).then(function () { $('acctMsg').textContent = 'Saved.'; return load(); }).catch(function (error) { $('acctMsg').textContent = error.message; }); });
  $('legal').addEventListener('submit', function (e) {
    e.preventDefault(); var f = e.target;
    apiRequest('PUT', { legal: { legalName: f.elements['legalName'].value, ein: f.elements['ein'].value, businessType: f.elements['businessType'].value, street: f.elements['street'].value, city: f.elements['city'].value, state: f.elements['state'].value, zip: f.elements['zip'].value } })
      .then(function () { return action('provision'); }).then(function () { $('legalMsg').textContent = 'Saved. Filing now; check back in a day.'; setTimeout(load, 4000); }).catch(function (error) { $('legalMsg').textContent = error.message; });
  });

  $('cfg').addEventListener('input', function () { cfgDirty = true; if (data && data.setup) { $('reviewRules').disabled = true; $('reviewMessage').textContent = 'Save your edits before reviewing this version.'; } });
  $('cfg').addEventListener('change', function () { cfgDirty = true; if (data && data.setup) $('reviewRules').disabled = true; });

  $('deskSignOut').addEventListener('click', async function () {
    var button = $('deskSignOut'); button.disabled = true;
    leaving = true; portalGeneration++; if (chatController) chatController.abort();
    try {
      var response = await fetch(API_BASE + '/api/access', { method: 'POST', headers: ownerHeaders(), body: JSON.stringify({ action: 'sign_out' }) });
      if (!response.ok) throw new Error('Sign out could not be confirmed. Please retry.');
      ownerSession = null; key = null; data = null; transcript = [];
      try { sessionStorage.removeItem('mc-onboarding-session-v1'); } catch (error) { /* Session is revoked on the server. */ }
      button.hidden = true; $('retryLoad').hidden = true;
      history.replaceState(null, '', location.pathname);
      recover('Signed out. Use an email sign-in link to open your workspace again.');
      $('portalContent').innerHTML = '';
    } catch (error) { leaving = false; await load(); toast(error.message); } finally { button.disabled = false; }
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
