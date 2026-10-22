(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var meta = document.querySelector('meta[name="mc-api-base"]'), base = meta && meta.content ? meta.content.replace(/\/$/, '') : '';
  var storageKey = 'mc-operator-session-v1', session = null, generation = 0, data = null, selected = null, selectedRecord = null, detailVersion = 0, view = 'overview', action = null, busy = false, toastTimer;
  var controllers = new Set();
  var verifyToken = new URLSearchParams(location.hash.slice(1)).get('verify');
  if (location.hash || location.search) history.replaceState(null, '', location.pathname);
  if (!/^[a-f0-9]{64}$/.test(verifyToken || '')) verifyToken = null;
  try { session = sessionStorage.getItem(storageKey); sessionStorage.removeItem('mc_admin_key'); } catch (error) { /* Memory-only access works when storage is disabled. */ }
  if (!/^[a-f0-9]{64}$/.test(session || '')) session = null;
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function array(value) { return Array.isArray(value) ? value : []; }
  function label(value) { return String(value || 'Not recorded').replace(/_/g, ' '); }
  function date(value) { if (!value || !Number.isFinite(Date.parse(value))) return 'Not recorded'; return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)) + ' CT'; }
  function badge(value) { var good = ['live', 'active', 'connected', 'ready', 'succeeded', 'approved', 'healthy'].indexOf(value) >= 0, bad = ['failed', 'error', 'cancelled', 'critical'].indexOf(value) >= 0; return '<span class="badge' + (good ? ' good' : bad ? ' bad' : ' warn') + '">' + esc(label(value)) + '</span>'; }
  function setSession(value) { session = value; try { if (value) sessionStorage.setItem(storageKey, value); else sessionStorage.removeItem(storageKey); } catch (error) { /* Retain the current in-memory session only. */ } }
  function abortRequests() { controllers.forEach(function (controller) { controller.abort(); }); controllers.clear(); }
  function clearPrivate(message) {
    generation++; abortRequests(); data = null; selected = null; selectedRecord = null; detailVersion++; action = null; busy = false; loading = null; setSession(null);
    if ($('actionDialog').open) $('actionDialog').close();
    ['summary', 'overviewIssues', 'overviewActivity', 'customers', 'customerDetail', 'issues', 'activity', 'prospects', 'platformSMS', 'system'].forEach(function (id) { $(id).replaceChildren(); });
    $('scopeNotice').hidden = true; $('scopeNotice').textContent = '';
    $('operator').textContent = ''; $('lastUpdated').textContent = ''; $('prospectsStatus').textContent = ''; $('platformSMSStatus').textContent = ''; $('customerSearch').value = ''; $('customerStatus').value = 'all';
    ['actionNote', 'actionReason', 'ruleServices', 'ruleServiceArea', 'ruleNotServed', 'ruleSummary'].forEach(function (id) { $(id).value = ''; }); ['actionStatus', 'actionTitle', 'actionDescription', 'appStatus', 'customerCount', 'toast'].forEach(function (id) { $(id).textContent = ''; }); $('toast').hidden = true; clearTimeout(toastTimer);
    $('app').hidden = true; $('login').hidden = false; $('loginStatus').textContent = message || ''; $('verifyPanel').hidden = !verifyToken; $('loginForm').hidden = !!verifyToken;
  }
  function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(function () { $('toast').hidden = true; }, 4500); }
  async function request(method, body, query, format) {
    var current = generation, token = session, controller = new AbortController(), timeout = setTimeout(function () { controller.abort(); }, 20000);
    controllers.add(controller);
    var headers = {}; if (body !== undefined) headers['Content-Type'] = 'application/json'; if (token) headers.Authorization = 'Bearer ' + token;
    try {
      var response = await fetch(base + '/api/manage' + (query || ''), { method: method || 'GET', headers: headers, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal, cache: 'no-store', credentials: 'same-origin' });
      if (current !== generation || token !== session) throw Object.assign(new Error('This request belongs to a previous sign-in.'), { stale: true });
      if (format === 'csv' && response.ok) return await response.blob();
      var result = await response.json();
      if (current !== generation || token !== session) throw Object.assign(new Error('This request belongs to a previous sign-in.'), { stale: true });
      if (!response.ok || result.ok === false || result.error) {
        var error = new Error(result.message || (response.status === 409 ? 'This account changed while you were working. Refresh it, review the latest state and try again.' : response.status === 401 || response.status === 403 ? 'Your operator access is unavailable. Sign in again with an authorized email.' : 'We could not confirm this request. Please try again.'));
        error.status = response.status; error.code = result.error;
        if (token && (response.status === 401 || response.status === 403)) clearPrivate(error.message);
        throw error;
      }
      return result;
    } catch (error) { if (error.name === 'AbortError') error.message = 'This request timed out. Refresh to check the current state before retrying a change.'; throw error; }
    finally { clearTimeout(timeout); controllers.delete(controller); }
  }
  function currentCustomer() { return selectedRecord && selectedRecord.slug === selected ? selectedRecord : data && array(data.customers).find(function (customer) { return customer.slug === selected; }); }
  function issueRows() { return data ? array(data.customers).flatMap(function (customer) { return array(customer.issues).map(function (issue) { return Object.assign({}, issue, { slug: customer.slug, name: customer.name || customer.slug }); }); }) : []; }
  function activities() { return data ? array(data.customers).flatMap(function (customer) { return array(customer.activity).map(function (event) { return Object.assign({}, event, { slug: customer.slug, name: customer.name || customer.slug }); }); }).sort(function (a, b) { return String(b.at || '').localeCompare(String(a.at || '')); }) : []; }
  function renderIssues(rows, target) {
    $(target).innerHTML = rows.length ? '<ul class="record-list">' + rows.map(function (issue) { return '<li><div class="record-top"><b>' + esc(issue.title || 'Needs attention') + '</b>' + badge(issue.severity || 'attention') + '</div><p>' + esc(issue.detail) + '</p><button class="btn small" type="button" data-customer="' + esc(issue.slug) + '" style="margin-top:10px">' + esc(issue.name) + ' →</button></li>'; }).join('') + '</ul>' : '<p class="empty">No current issues were reported.</p>';
  }
  function renderActivity(rows, target, includeCustomer) {
    $(target).innerHTML = rows.length ? '<ul class="record-list">' + rows.map(function (event) { return '<li><div class="record-top"><b>' + esc(label(event.type)) + '</b><span class="timestamp">' + esc(date(event.at)) + '</span></div><p>' + esc(event.detail || '') + '</p>' + (includeCustomer ? '<button type="button" class="btn small" data-customer="' + esc(event.slug) + '" style="margin-top:8px">' + esc(event.name) + '</button>' : '') + '</li>'; }).join('') + '</ul>' : '<p class="empty">No recent activity was recorded.</p>';
  }
  function renderCustomers() {
    if (!data) return;
    var term = $('customerSearch').value.trim().toLowerCase(), status = $('customerStatus').value;
    var rows = array(data.customers).filter(function (customer) { var owner = customer.owner || {}; return (status === 'all' || customer.status === status) && (!term || [customer.name, customer.slug, owner.name, owner.email, owner.phone].join(' ').toLowerCase().includes(term)); });
    $('customerCount').textContent = rows.length + ' matching · ' + array(data.customers).length + ' loaded' + (Number.isFinite(data.total) ? ' of ' + data.total + ' customers' : ' customers');
    $('loadMoreCustomers').hidden = !data.nextCursor;
    $('customers').innerHTML = rows.length ? '<div class="table-scroll" tabindex="0" role="region" aria-label="Customer list; scroll to see all columns"><table class="data-table"><thead><tr><th scope="col">Customer</th><th scope="col">Status</th><th scope="col">Plan</th><th scope="col">Connections</th><th scope="col">Needs attention</th></tr></thead><tbody>' + rows.map(function (customer) {
      var connected = array(customer.connections).filter(function (connection) { return ['active', 'connected'].includes(connection.status); });
      return '<tr><td><button class="customer-name" type="button" data-customer="' + esc(customer.slug) + '">' + esc(customer.name || customer.slug) + '</button><small>' + esc((customer.owner || {}).email || customer.slug) + '</small></td><td>' + badge(customer.status) + '</td><td>' + esc(label(customer.plan)) + '</td><td>' + (connected.length ? connected.map(function (connection) { return esc(connection.label); }).join(', ') : '<span class="muted">None active</span>') + '</td><td>' + (array(customer.issues).length ? '<span class="badge warn">' + array(customer.issues).length + ' issue' + (array(customer.issues).length === 1 ? '' : 's') + '</span>' : '<span class="muted">No issues reported</span>') + '</td></tr>';
    }).join('') + '</tbody></table></div>' : '<div class="panel empty">' + (array(data.customers).length ? 'No customers match these filters.' : 'No customer accounts yet. New workspaces will appear here.') + '</div>';
  }
  function renderOperations(rows, closed) {
    return rows.length ? rows.map(function (operation) { return '<div class="operation-line"><div class="record-top"><b>' + esc(operation.label || 'Workspace operation') + '</b>' + badge(operation.state) + '</div><p>' + esc(operation.detail) + '</p><p class="timestamp">Updated ' + esc(date(operation.updatedAt)) + ' · ' + Number(operation.attempts || 0) + ' attempt' + (operation.attempts === 1 ? '' : 's') + (operation.nextAttemptAt ? ' · Next attempt ' + esc(date(operation.nextAttemptAt)) : '') + '</p><div class="mono muted">Reference: ' + esc(operation.id) + '</div>' + (operation.nextAction && operation.nextAction.action === 'retry_operation' ? '<button class="btn small" type="button" data-action="retry_operation" data-operation="' + esc(operation.id) + '"' + (closed ? ' disabled' : '') + ' style="margin-top:10px">' + esc(operation.nextAction.label || 'Retry refresh') + '</button>' : '') + '</div>'; }).join('') : '<p class="muted">No background refresh has been requested.</p>';
  }
  function renderPhoneOperation(phone) {
    var operation = phone && phone.operation; if (!operation) return '';
    var states = { queued: 'Number request saved', waiting_platform: 'Waiting for platform', running: 'Reserving number', uncertain: 'Checking number request', number_acquired: 'Number reserved', cleanup_pending: 'Number release pending', releasing: 'Releasing number', cleanup_uncertain: 'Checking number release', cancelled: 'Number request cancelled', superseded: 'Setup changed', needs_review: 'Needs platform review' };
    return '<section class="panel"><h2>Phone number request</h2><p class="muted">Number acquisition only. Phone answering and customer texts are not activated by this operation.</p><div class="operation-line"><div class="record-top"><b>' + esc(states[operation.state] || 'Status unavailable') + '</b>' + badge(operation.state) + '</div><p>' + esc(operation.detail) + '</p>' + (operation.number ? '<p><b>Recorded number:</b> ' + esc(operation.number) + '</p>' : '') + '<p>' + (operation.releaseConfirmed ? 'Release is confirmed; the resource receipt is retained.' : operation.resourceRecorded ? 'Resource receipt is retained; release is not confirmed.' : 'No resource receipt is recorded.') + '</p><p class="timestamp">Updated ' + esc(date(operation.updatedAt)) + (operation.nextCheckAt ? ' · Next check ' + esc(date(operation.nextCheckAt)) : '') + '</p><div class="mono muted">Reference: ' + esc(operation.id) + '</div></div></section>';
  }
  function renderRecords(records) {
    var bookings = array(records.bookings), leads = array(records.leads), conversations = array(records.conversations);
    var processingLabels = { queued: 'Reply queued', running: 'Processing', failed: 'Processing failed', suppressed: 'Reply withheld', awaiting_delivery: 'Awaiting delivery confirmation', uncertain: 'Delivery uncertain; do not resend', superseded: 'Replaced by a newer reply', expired: 'Reply expired' };
    var list = function (rows, kind) { return rows.length ? '<ul class="record-list">' + rows.map(function (row) { return '<li><div class="record-top"><b>' + esc(row.name || row.customer_name || row.contact || row.phone || row.id || 'Customer record') + '</b>' + badge(row.status || row.channel || kind) + '</div><p>' + esc(row.issue || row.outcome || row.summary || '') + '</p><p>' + esc([row.phone, row.address, row.date, row.window].filter(Boolean).join(' · ')) + '</p>' + (Array.isArray(row.messages) ? '<details><summary>Read conversation</summary>' + row.messages.map(function (message) { return '<p><b>' + esc(message.role === 'user' ? 'Customer' : 'Front desk') + ':</b> ' + esc(message.content) + (message.processing ? '<br><span class="muted">' + esc(processingLabels[message.processing] || 'Processing status unavailable') + '</span>' : '') + '</p>'; }).join('') + '</details>' : '') + '<span class="timestamp">' + esc(date(row.at || row.createdAt || row.updatedAt)) + '</span></li>'; }).join('') + '</ul>' : '<p class="muted">None recorded.</p>'; };
    return '<details><summary>Bookings (' + bookings.length + ' recent)</summary>' + list(bookings, 'booking') + '</details><details style="margin-top:14px"><summary>Leads (' + leads.length + ' recent)</summary>' + list(leads, 'lead') + '</details><details style="margin-top:14px"><summary>Conversations (' + conversations.length + ' recent)</summary>' + list(conversations, 'conversation') + '</details>';
  }
  function renderDetail(focus) {
    var customer = currentCustomer();
    if (!customer) { $('customerDetail').hidden = true; $('customerList').hidden = false; return; }
    $('customerList').hidden = true; $('customerDetail').hidden = false;
    var owner = customer.owner || {}, metrics = customer.metrics || {}, setup = customer.setup || {}, isManaged = customer.selfService === true, closed = ['cancelled', 'archived'].includes(customer.status);
    $('customerDetail').innerHTML = '<button type="button" class="btn small back-button" id="backCustomers">← All customers</button><div class="panel"><div class="detail-head"><div><p class="eyebrow">Customer account</p><h2 class="detail-title" id="detailTitle" tabindex="-1">' + esc(customer.name || customer.slug) + '</h2><p class="muted">' + esc(customer.slug) + ' · Created ' + esc(date(customer.createdAt)) + '</p></div>' + badge(customer.status) + '</div><dl class="facts"><div><dt>Owner</dt><dd>' + esc(owner.name || 'Not recorded') + '</dd></div><div><dt>Email</dt><dd>' + esc(owner.email || 'Not recorded') + '</dd></div><div><dt>Phone</dt><dd>' + esc(owner.phone || 'Not recorded') + '</dd></div><div><dt>Plan preference</dt><dd>' + esc(label(customer.plan)) + '</dd></div></dl></div>'
      + (!isManaged ? '<p class="notice">This is a legacy account. This portal provides a read-only view while management access is migrated.</p>' : '')
      + '<div class="detail-grid"><div><section class="panel"><h2>Connections</h2><div class="channel-grid">' + (array(customer.connections).length ? array(customer.connections).map(function (connection) { return '<div class="channel-card">' + badge(connection.status) + '<h3>' + esc(connection.label || connection.id) + '</h3><p>' + esc(connection.detail) + '</p></div>'; }).join('') : '<p class="muted">No connection status is available.</p>') + '</div></section><section class="panel"><h2>Setup and checks</h2>' + (array(setup.steps).length ? '<ul class="record-list">' + array(setup.steps).map(function (step) { return '<li><div class="record-top"><b>' + esc(step.label) + '</b>' + badge(step.status) + '</div><p>' + esc(step.detail) + '</p></li>'; }).join('') + '</ul>' : '<p class="muted">No setup checks were reported.</p>') + '</section><section class="panel"><h2>Background work</h2><p class="muted">A refresh rebuilds the desk from saved business answers. It does not activate connections or contact customers.</p>' + renderOperations(array(customer.operations), closed) + '</section>' + renderPhoneOperation(customer.phoneActivation) + '<section class="panel"><h2>Recent activity</h2><div id="detailActivity"></div></section></div><div><section class="panel"><h2>Customer work</h2><p class="muted">' + esc(metrics.scope || 'Latest 100 records per category') + '</p><dl class="facts"><div><dt>Bookings</dt><dd>' + Number(metrics.bookings || 0) + '</dd></div><div><dt>Leads</dt><dd>' + Number(metrics.leads || 0) + '</dd></div><div><dt>Conversations</dt><dd>' + Number(metrics.conversations || 0) + '</dd></div><div><dt>Open issues</dt><dd>' + Number(metrics.openIssues || array(customer.issues).length) + '</dd></div></dl></section><section class="panel"><h2>Support actions</h2><p class="muted">Changes need a reason and are recorded on this account.</p><div class="actions">' + (isManaged ? (customer.status === 'live' ? '<button class="btn danger" type="button" data-action="pause">Pause front desk</button>' : customer.status === 'paused' ? '<button class="btn" type="button" data-action="resume"' + (setup.canActivateWeb ? '' : ' disabled') + '>Resume front desk</button>' : '') + (!closed ? '<button class="btn" type="button" data-action="rebuild_workspace">Refresh saved workspace</button><button class="btn" type="button" data-action="update_rules">Correct business answers</button>' : '') + '<button class="btn" type="button" data-action="save_note">Add internal note</button>' + (!closed ? '<button class="btn danger" type="button" data-action="cancel_service">Cancel front desk</button>' : '') : '<p class="muted">Support actions are not available for this legacy account.</p>') + '</div>' + (customer.status === 'paused' && !setup.canActivateWeb ? '<p class="muted">The current setup checks must pass before website chat can resume.</p>' : '') + '</section><section class="panel"><h2>Internal notes</h2>' + (array(customer.notes).length ? '<ul class="record-list">' + array(customer.notes).map(function (note) { return '<li><p style="white-space:pre-wrap;margin:0;color:#263a56">' + esc(note.text) + '</p><p>' + esc(note.actor || 'Operator') + ' · ' + esc(date(note.at)) + '</p></li>'; }).join('') + '</ul>' : '<p class="muted">No internal notes yet.</p>') + '</section></div></div>';
    renderActivity(array(customer.activity), 'detailActivity', false);
    if (isManaged) {
      var checksPanel = document.createElement('section'); checksPanel.className = 'panel';
      var checks = array(customer.serviceChecks), pendingChecks = checks.some(function (check) { return ['queued','running','retry','waiting_platform'].includes(check.state); });
      checksPanel.innerHTML = '<h2>Service checks</h2><p class="muted">Recheck existing customer-authorized phone, texting, calendar and message work. Saved approvals and execution limits still apply. Uncertain sends require reconciliation before any retry.</p><button class="btn small" type="button" data-action="reconcile_services"' + (pendingChecks ? ' disabled' : '') + '>Check authorized services</button>' + (pendingChecks ? '<p class="muted">A check request is already saved. Refresh this account to see its result.</p>' : '') + (checks.length ? '<ul class="record-list">' + checks.map(function (check) { return '<li><div class="record-top"><b>Existing service checks</b>' + badge(check.state) + '</div><p>' + esc(check.detail) + '</p><p class="timestamp">Updated ' + esc(date(check.updatedAt)) + ' · ' + Number(check.attempts || 0) + ' dispatch attempts</p></li>'; }).join('') + '</ul>' : '<p class="muted">No operator check has been requested.</p>');
      $('detailActivity').closest('section').before(checksPanel);
    }
    if (customer.services) {
      var deliveryPanel = document.createElement('section'); deliveryPanel.className = 'panel';
      var jobs = array(customer.services.delivery && customer.services.delivery.jobs).map(function (job) { return { name: label(job.purpose) + ' (' + job.channel + ')', state: job.state, detail: job.reasonCode || '', at: job.updatedAt }; }).concat(array(customer.services.calendarDelivery && customer.services.calendarDelivery.jobs).map(function (job) { return { name: 'Calendar visit ' + job.bookingId, state: job.state, detail: job.detail, at: job.updatedAt }; }));
      deliveryPanel.innerHTML = '<h2>Service delivery</h2><p class="muted">Latest 30 jobs per delivery channel. Accepted means the provider has a receipt; delivered means delivery was confirmed. Unknown sends are retained for reconciliation.</p>' + (jobs.length ? '<ul class="record-list">' + jobs.map(function (job) { return '<li><div class="record-top"><b>' + esc(job.name) + '</b>' + badge(job.state) + '</div><p>' + esc(job.detail) + '</p><small>' + esc(date(job.at)) + '</small></li>'; }).join('') + '</ul>' : '<p>No service delivery has been requested.</p>');
      $('detailActivity').closest('section').before(deliveryPanel);
    }
    var recordPanel = document.createElement('section'); recordPanel.className = 'panel'; recordPanel.innerHTML = '<h2>Customer records</h2><p class="muted">' + esc(metrics.scope || 'Latest 100 records per category') + ' Read only. Provider messages and billing are not changed here.</p>' + renderRecords(customer.records || {}); $('detailActivity').closest('section').before(recordPanel);
    if (focus) $('detailTitle').focus();
  }
  function renderInquiries() {
    var rows = array(data.inquiries), eligible = rows.filter(function (row) { return row.marketingEligible === true; }).length;
    $('prospectsStatus').textContent = rows.length + ' inquiries · ' + eligible + ' eligible for marketing email. No campaign has been sent.';
    $('prospects').innerHTML = rows.length ? '<div class="table-scroll prospects-table-scroll" tabindex="0" role="region" aria-label="Website inquiries; scroll to see all columns"><table class="data-table"><thead><tr><th scope="col">Contact</th><th scope="col">Business</th><th scope="col">Main goal</th><th scope="col">Email verified</th><th scope="col">Email updates</th></tr></thead><tbody>' + rows.map(function (row) { return '<tr><td>' + esc(row.name || '') + '<small>' + esc(row.email) + '</small></td><td>' + esc(row.business) + '</td><td>' + esc(label(row.goal)) + '</td><td>' + (row.emailVerifiedAt ? 'Verified' : 'Not verified') + '</td><td>' + (row.suppressed ? 'Unsubscribed' : row.marketingEligible ? 'Confirmed' : row.marketingRequested ? 'Not confirmed' : 'Not requested') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="empty">No website inquiries yet.</p>';
    var sms = data.platformSMS || {}, texts = array(sms.rows), reasons = { gate_closed: 'Automated reply withheld while disabled', suppressed: 'Reply withheld: texts stopped', already_suppressed: 'Already stopped; no second confirmation prepared', reply_budget_reached: 'Reply withheld: daily safety allowance reached', provider_keyword_handling: 'Provider keyword handling; no second reply prepared', older_directive: 'Older instruction retained without changing the current texting choice', empty_message: 'No reply to an empty text' };
    $('platformSMSStatus').textContent = (sms.enabled ? 'Reply handler enabled; delivery remains unverified. ' : 'Automated replies are off. Carrier readiness must be approved before activation. ') + (sms.scope || 'No text history available.') + (sms.atCapacity ? ' The daily reply safety allowance is used; incoming texts and stop/restart choices are still recorded.' : '');
    $('platformSMS').innerHTML = texts.length ? '<ul class="record-list">' + texts.map(function (message) { return '<li><div class="record-top"><b>' + esc(message.contact) + '</b>' + badge(message.suppressed ? 'texts_stopped' : message.keyword || 'question') + '</div><p style="white-space:pre-wrap">' + esc(message.body) + '</p><p class="timestamp">' + esc(date(message.at || message.receivedAt)) + '</p><p class="muted">' + esc(message.state === 'reply_delivery_unknown' ? 'Reply prepared; delivery unconfirmed' : reasons[message.reason] || 'No reply prepared') + '</p>' + (message.reply ? '<details><summary>Prepared reply</summary><p>' + esc(message.reply) + '</p></details>' : '') + '</li>'; }).join('') + '</ul>' : '<p class="empty">No M&amp;C product texts recorded.</p>';
  }
  function renderSystem() {
    var system = data.system || {}, scheduler = system.scheduler || {}, states = system.providerStates || {};
    var rows = Array.isArray(states) ? states : Object.entries(states).map(function (entry) { var value = entry[1]; return typeof value === 'object' && value ? Object.assign({ id: entry[0] }, value) : { id: entry[0], status: typeof value === 'boolean' ? value ? 'configured' : 'unavailable' : /unavailable|disabled/i.test(String(value)) ? 'unavailable' : 'configured', detail: typeof value === 'string' ? value : '' }; });
    $('system').innerHTML = '<section class="panel"><h2>Scheduler</h2><p class="muted">This is the last saved result, not a continuous uptime check.</p><dl class="facts"><div><dt>Last recorded run</dt><dd>' + esc(date(scheduler.at)) + '</dd></div><div><dt>Result</dt><dd>' + (scheduler.at ? badge(scheduler.healthy === true ? 'healthy' : 'needs_attention') : 'No run recorded') + '</dd></div></dl>' + (scheduler.detail ? '<p class="muted" style="margin-top:16px">' + esc(scheduler.detail) + '</p>' : '') + (array(scheduler.blocks).length ? '<h3 style="margin-top:22px">Last recorded work scan</h3><p class="muted">These are the last recorded counts. A scan processes a limited batch; pending work and unresolved failures can remain after it.</p><div class="table-scroll" tabindex="0" role="region" aria-label="Scheduler block results; scroll to see all columns"><table class="data-table" style="min-width:980px"><thead><tr><th scope="col">Work</th><th scope="col">Result</th><th scope="col">Queued</th><th scope="col">Pending</th><th scope="col">Failed in scan</th><th scope="col">Uncertain</th><th scope="col">Unresolved</th><th scope="col">Release pending</th><th scope="col">Open failures</th></tr></thead><tbody>' + array(scheduler.blocks).map(function (block) { var count = function (value) { return Number.isInteger(value) && value >= 0 ? value : '—'; }; var explanations = { phone_scope_partial: 'More saved work remains outside this scan.', phone_recovery_stale: 'Phone setup worker has not reported recently.', product_gate_closed: 'Phone execution is disabled; saved work is retained.' }; return '<tr><td>' + esc(label(block.name)) + (explanations[block.reasonCode] ? '<small>' + esc(explanations[block.reasonCode]) + '</small>' : '') + (Number.isInteger(block.inspected) && block.inspected >= 0 ? '<small>Checked ' + block.inspected + ' saved requests in this scan.</small>' : '') + '</td><td>' + badge(block.ok === true && !(block.openFailures > 0) && !(block.unresolved > 0) ? 'succeeded' : 'needs_attention') + '</td><td>' + count(block.queued) + '</td><td>' + count(block.pending) + '</td><td>' + count(block.failed) + '</td><td>' + count(block.uncertain) + '</td><td>' + count(block.unresolved) + '</td><td>' + count(block.cleanupPending) + '</td><td>' + count(block.openFailures) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="muted" style="margin-top:16px">No work scan details were recorded.</p>') + '</section><section class="panel"><h2>Platform connections</h2><p class="muted">Platform configuration does not mean a customer connection has been activated or delivery verified.</p><div class="channel-grid">' + rows.map(function (provider) { return '<div class="channel-card">' + badge(provider.status || provider.state || 'unavailable') + '<h3>' + esc(provider.label || label(provider.id)) + '</h3><p>' + esc(provider.detail || 'Check the customer account for actual connection and delivery status.') + '</p></div>'; }).join('') + '</div></section>';
  }
  function render() {
    var summary = data.summary || {}, issues = issueRows(), events = activities();
    var scope = data.nextCursor || (Number.isFinite(data.total) && data.total > array(data.customers).length) ? ' (loaded)' : '';
    if (summary.scope === 'loaded' || summary.scope === 'Current page') summary = { customers: array(data.customers).length, active: array(data.customers).filter(function (c) { return c.status === 'live'; }).length, needsAttention: array(data.customers).filter(function (c) { return array(c.issues).length > 0; }).length, setupPending: array(data.customers).filter(function (c) { return c.selfService && !['cancelled', 'archived'].includes(c.status) && array(c.connections).some(function (connection) { return connection.requested && !['active','connected'].includes(connection.status); }); }).length };
    $('scopeNotice').hidden = !scope; $('scopeNotice').textContent = 'Overview, search, issues and activity cover the ' + array(data.customers).length + ' customers loaded so far. Load more in Customers to include the next accounts.';
    $('operator').textContent = 'Signed in as ' + (data.operator && data.operator.email || 'operator');
    $('summary').innerHTML = [{ value: summary.customers, label: 'Customers' + scope }, { value: summary.active, label: 'Live accounts' + scope }, { value: summary.needsAttention, label: 'Need attention' + scope, attention: true }, { value: summary.setupPending, label: 'In setup' + scope }].map(function (stat) { return '<div class="stat' + (stat.attention ? ' attention' : '') + '"><b>' + (Number.isFinite(stat.value) ? stat.value : '—') + '</b><span>' + stat.label + '</span></div>'; }).join('');
    renderIssues(issues.slice(0, 4), 'overviewIssues'); renderIssues(issues, 'issues'); renderActivity(events.slice(0, 5), 'overviewActivity', true); renderActivity(events, 'activity', true);
    renderCustomers(); renderDetail(false); renderInquiries(); renderSystem();
  }
  var loading = null;
  async function loadData() {
    if (loading) return loading;
    var current = generation;
    $('refreshAll').disabled = true; $('refreshProspects').disabled = true;
    var pending = request('GET').then(function (result) {
      if (current !== generation) return;
      if (!Array.isArray(result.customers) || !result.operator || typeof result.operator.email !== 'string') throw new Error('The operations response was incomplete. Try refreshing.');
      data = result; $('login').hidden = true; $('app').hidden = false; $('appStatus').hidden = true;
      $('lastUpdated').textContent = 'Updated ' + date(new Date().toISOString()); render();
    }).catch(function (error) {
      if (current !== generation || error.stale) return;
      if (data) { $('appStatus').textContent = 'Could not refresh. The information below may be out of date. ' + error.message; $('appStatus').className = 'notice error'; $('appStatus').hidden = false; }
      else { $('login').hidden = false; $('loginStatus').textContent = error.message; }
      throw error;
    }).finally(function () { if (current === generation) { $('refreshAll').disabled = false; $('refreshProspects').disabled = false; } if (loading === pending) loading = null; });
    loading = pending; return pending;
  }
  function navigate(nextView, focus) {
    if (!data || ['overview', 'customers', 'issues', 'activity', 'inquiries', 'system'].indexOf(nextView) < 0) return;
    view = nextView; document.querySelectorAll('.view').forEach(function (panel) { panel.hidden = panel.id !== 'view-' + view; });
    document.querySelectorAll('.side nav button').forEach(function (button) { if (button.dataset.view === view) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); });
    if (view === 'customers') renderDetail(false);
    if (focus) { var heading = $('view-' + view).querySelector('h1'); if (heading) heading.focus(); }
  }
  async function loadDetail(slug, focus) {
    var current = generation, version = ++detailVersion, previous = currentCustomer(); selected = slug; selectedRecord = previous && previous.slug === slug ? previous : null; navigate('customers', false);
    if (!selectedRecord) { $('customerList').hidden = true; $('customerDetail').hidden = false; $('customerDetail').innerHTML = '<p class="notice" role="status">Loading customer details…</p>'; }
    try { var result = await request('GET', undefined, '?c=' + encodeURIComponent(slug)); if (current !== generation || version !== detailVersion || selected !== slug) return; if (!result.customer || result.customer.slug !== slug) throw new Error('The customer response was incomplete. Refresh and try again.'); selectedRecord = result.customer; var index = data.customers.findIndex(function (customer) { return customer.slug === slug; }); if (index >= 0) data.customers[index] = result.customer; renderDetail(focus); }
    catch (error) { if (current !== generation || version !== detailVersion || error.stale) return; if (selectedRecord) { renderDetail(false); var warning = document.createElement('p'); warning.className = 'notice error'; warning.textContent = 'Could not refresh this account. The details below may be out of date. ' + error.message; $('customerDetail').prepend(warning); } else { $('customerDetail').innerHTML = '<p class="notice error">' + esc(error.message) + '</p><button class="btn" type="button" id="backCustomers">← All customers</button>'; } }
  }
  function selectCustomer(slug) { if (!data || !array(data.customers).some(function (customer) { return customer.slug === slug; })) return; loadDetail(slug, true); }
  document.addEventListener('click', function (event) {
    var customer = event.target.closest('[data-customer]'); if (customer) { selectCustomer(customer.dataset.customer); return; }
    var nav = event.target.closest('[data-view],[data-go]'); if (nav) { if ((nav.dataset.view || nav.dataset.go) === 'customers') selected = null; navigate(nav.dataset.view || nav.dataset.go, true); return; }
    if (event.target.closest('#refreshCustomerDetail')) { if (selected) loadDetail(selected, true); return; }
    if (event.target.closest('#backCustomers')) { selected = null; selectedRecord = null; detailVersion++; renderDetail(false); $('customerSearch').focus(); return; }
    var trigger = event.target.closest('[data-action]'); if (trigger) openAction(trigger.dataset.action, trigger.dataset.operation);
  });
  $('customerFilters').addEventListener('submit', function (event) { event.preventDefault(); renderCustomers(); }); $('customerSearch').addEventListener('input', renderCustomers); $('customerStatus').addEventListener('change', renderCustomers);
  var actionCopy = {
    cancel_service: { title: 'Cancel front desk', description: 'This stops new chat, phone answering, customer texts and calendar sync. Saved records remain available. Provider cleanup is recovered in the background for attached services; billing is unchanged.', submit: 'Cancel front desk' },
    pause: { title: 'Pause front desk', description: 'Chat, phone answering, texts and calendar updates pause. Existing call forwarding may still need to be switched off at the phone carrier. Saved records and business answers remain.', submit: 'Pause front desk' },
    resume: { title: 'Resume front desk', description: 'Restore the previous service state after the current setup and AI checks pass. Existing accepted phone, texting and calendar connections are checked in the background. Website chat is restored only if it was previously active and is selected.', submit: 'Resume front desk' },
    update_rules: { title: 'Correct business answers', description: 'Save corrected answers on this account. The customer will see the saved changes. A new review and private test are required before changed rules can serve customers.', submit: 'Save corrected answers' },
    save_note: { title: 'Add an internal note', description: 'This note is visible to operators. It is not emailed or shown to the customer.', submit: 'Save note' },
    rebuild_workspace: { title: 'Refresh the saved workspace', description: 'Queue a refresh from the business answers already saved on this account. This does not contact customers, change their answers or activate a connection.', submit: 'Request refresh' },
    retry_operation: { title: 'Retry the workspace refresh', description: 'Retry this recorded refresh if it is still eligible. The server checks its current revision and retry limit first.', submit: 'Retry refresh' }
    ,reconcile_services: { title: 'Check authorized services', description: 'Save an audited request to recheck existing customer-authorized phone, texting, calendar and message work. Platform workers may also check other already-authorized work. Execution gates and existing approvals remain in force. This does not authorize a purchase, create customer consent, or resend an uncertain message. A queued check is not proof of successful service delivery.', submit: 'Request service checks' }
  };
  function openAction(name, operationId) {
    var customer = currentCustomer(), copy = actionCopy[name]; if (!customer || !customer.selfService || !copy || busy || ['cancelled', 'archived'].includes(customer.status) && !['save_note','reconcile_services'].includes(name)) return;
    action = { name: name, slug: customer.slug, expectedRevision: customer.revision, operationId: operationId };
    $('actionTitle').textContent = copy.title; $('actionDescription').textContent = (customer.name || customer.slug) + ': ' + copy.description; $('actionSubmit').textContent = copy.submit; $('actionSubmit').className = name === 'cancel_service' ? 'btn danger' : 'btn primary'; $('actionSubmit').disabled = false;
    $('actionReason').value = ''; $('actionNote').value = ''; $('rulesFields').hidden = name !== 'update_rules'; var rules = customer.rules || {}; $('ruleServices').value = array(rules.services).join('\n'); $('ruleServiceArea').value = array((rules.business || {}).serviceArea).join('\n'); $('ruleNotServed').value = array((rules.business || {}).notServed).join('\n'); $('ruleSummary').value = rules.summary || ''; $('noteField').hidden = name !== 'save_note'; $('actionNote').required = name === 'save_note'; $('actionStatus').textContent = ''; $('actionCancel').disabled = false;
    $('actionDialog').showModal(); (name === 'save_note' ? $('actionNote') : $('actionReason')).focus();
  }
  $('actionCancel').addEventListener('click', function () { if (!busy) { $('actionDialog').close(); action = null; } });
  $('actionDialog').addEventListener('cancel', function (event) { if (busy) event.preventDefault(); else action = null; });
  $('actionForm').addEventListener('submit', async function (event) {
    event.preventDefault(); if (!action || busy || !$('actionForm').reportValidity()) return;
    var current = generation, snapshot = Object.assign({}, action), body = { action: action.name, slug: action.slug, expectedRevision: action.expectedRevision, reason: $('actionReason').value.trim() };
    if (!body.reason) { $('actionStatus').textContent = 'Add a reason for this action.'; $('actionReason').focus(); return; }
    if (action.name === 'update_rules') { var lines = function (id) { return $(id).value.split('\n').map(function (line) { return line.trim(); }).filter(Boolean); }; body.patch = { services: lines('ruleServices'), business: { serviceArea: lines('ruleServiceArea'), notServed: lines('ruleNotServed') }, summary: $('ruleSummary').value.trim() }; }
    if (action.name === 'save_note') body.text = $('actionNote').value.trim(); if (action.name === 'retry_operation') body.operationId = action.operationId;
    busy = true; $('actionSubmit').disabled = true; $('actionCancel').disabled = true; $('actionStatus').textContent = 'Saving…';
    try {
      var result = await request('POST', body); if (current !== generation) return;
      $('actionDialog').close(); action = null; selected = snapshot.slug;
      if (result.refreshRequired === true) {
        selectedRecord = null; detailVersion++; data.customers = array(data.customers).filter(function (customer) { return customer.slug !== snapshot.slug; });
        $('customerList').hidden = true; $('customerDetail').hidden = false; $('customerDetail').innerHTML = '<div class="panel"><h2 tabindex="-1" id="savedTitle">Change saved</h2><p class="notice success">' + esc(result.message || 'Your change is saved. Refresh customer details to confirm the current state.') + '</p><button class="btn primary" type="button" id="refreshCustomerDetail">Refresh customer details</button></div>';
        $('appStatus').textContent = 'Your change was saved. Refresh this account to confirm its current state before making another change.'; $('appStatus').className = 'notice'; $('appStatus').hidden = false; $('savedTitle').focus(); return;
      }
      if (result.customer && result.customer.slug === snapshot.slug) selectedRecord = result.customer;
      await loadData(); if (current === generation) await loadDetail(snapshot.slug, false);
      if (current === generation) { renderDetail(false); toast(snapshot.name === 'save_note' ? 'Internal note saved.' : snapshot.name === 'reconcile_services' ? 'Service-check request saved. Its receipt shows whether checks were dispatched; delivery is confirmed separately.' : snapshot.name === 'update_rules' ? 'Corrected answers saved. Review and test are required before using changed rules.' : snapshot.name === 'rebuild_workspace' || snapshot.name === 'retry_operation' ? 'Refresh request saved. Check Background work for its result.' : 'Change saved. Current service status is shown on the account.'); }
    } catch (error) {
      if (current !== generation || error.stale) return;
      if (error.status === 409) { await loadDetail(snapshot.slug, false); if (current === generation) { if (action) action.stale = true; } }
      if (current === generation && $('actionDialog').open) $('actionStatus').textContent = error.status === 409 ? error.message + ' Close this dialog, review the latest account details, then start the action again.' : error.message;
    } finally { if (current === generation) { busy = false; $('actionSubmit').disabled = !!(action && action.stale); $('actionCancel').disabled = false; } }
  });
  $('loginForm').addEventListener('submit', async function (event) {
    event.preventDefault(); if (!$('loginForm').reportValidity() || $('requestLink').disabled) return;
    var current = generation; $('requestLink').disabled = true; $('loginStatus').textContent = 'Requesting your sign-in link…';
    try { var result = await request('POST', { action: 'request_link', email: $('adminEmail').value.trim() }); if (current === generation) $('loginStatus').textContent = result.message || 'Check your email for the sign-in link.'; }
    catch (error) { if (current === generation && !error.stale) $('loginStatus').textContent = error.message; }
    finally { if (current === generation) $('requestLink').disabled = false; }
  });
  $('verifyLink').addEventListener('click', async function () {
    if (!verifyToken || $('verifyLink').disabled) return;
    var current = generation; $('verifyLink').disabled = true; $('loginStatus').textContent = 'Confirming operator access…';
    try {
      var result = await request('POST', { action: 'exchange', token: verifyToken }); if (current !== generation) return;
      if (!/^[a-f0-9]{64}$/.test(result.session || '')) throw new Error('Access could not be confirmed. Request a new sign-in link.');
      verifyToken = null; generation++; abortRequests(); setSession(result.session); $('verifyPanel').hidden = true; $('loginForm').hidden = false; await loadData();
    } catch (error) { if (!error.stale && $('login').hidden === false) $('loginStatus').textContent = error.message; }
    finally { $('verifyLink').disabled = false; }
  });
  $('signOut').addEventListener('click', async function () {
    if ($('signOut').disabled) return;
    $('signOut').disabled = true; var token = session, controller = new AbortController(), timer = setTimeout(function () { controller.abort(); }, 20000);
    // The dedicated revocation request is not aborted with the private view's older reads.
    var pending = fetch(base + '/api/manage', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ action: 'sign_out' }), signal: controller.signal, cache: 'no-store', credentials: 'same-origin' });
    clearPrivate('You are signed out of this browser.'); var revocationGeneration = generation;
    try { var response = await pending; if (!response.ok && response.status !== 401 && response.status !== 403) throw new Error('revocation_failed'); } catch (error) { if (generation === revocationGeneration) $('loginStatus').textContent = 'This browser is signed out. We could not confirm server revocation; the previous session will still expire.'; }
    finally { clearTimeout(timer); $('signOut').disabled = false; }
  });
  $('loadMoreCustomers').addEventListener('click', async function () {
    if (!data || !data.nextCursor || $('loadMoreCustomers').disabled) return;
    var current = generation, cursor = data.nextCursor; $('loadMoreCustomers').disabled = true;
    try { var result = await request('GET', undefined, '?cursor=' + encodeURIComponent(cursor)); if (current !== generation || !data || data.nextCursor !== cursor) return; if (!Array.isArray(result.customers)) throw new Error('The next customer page was incomplete.'); var known = new Set(data.customers.map(function (customer) { return customer.slug; })); result.customers.forEach(function (customer) { if (!known.has(customer.slug)) data.customers.push(customer); }); data.nextCursor = result.nextCursor || null; if (Number.isFinite(result.total)) data.total = result.total; render(); }
    catch (error) { if (current === generation && !error.stale) { $('appStatus').textContent = error.message; $('appStatus').className = 'notice error'; $('appStatus').hidden = false; } }
    finally { if (current === generation) $('loadMoreCustomers').disabled = false; }
  });
  $('refreshAll').addEventListener('click', function () { var slug = view === 'customers' ? selected : null; loadData().then(function () { if (slug && data && view === 'customers' && selected === slug) return loadDetail(slug, false); }).catch(function () {}); }); $('refreshProspects').addEventListener('click', function () { loadData().catch(function () {}); });
  async function exportInquiries(audience) {
    if (!data || $('exportMarketing').disabled) return;
    var current = generation; $('exportMarketing').disabled = true; $('exportProspects').disabled = true;
    try {
      var blob = await request('GET', undefined, '?export=' + audience, 'csv'); if (current !== generation) return;
      var url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = audience === 'eligible' ? 'marketing-contacts.csv' : 'all-inquiries.csv'; link.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      $('prospectsStatus').textContent = audience === 'eligible' ? 'Marketing list downloaded. No email has been sent.' : 'All inquiries downloaded. This includes contacts who are not eligible for marketing email.';
    } catch (error) { if (current === generation && !error.stale) $('prospectsStatus').textContent = error.message; }
    finally { if (current === generation) { $('exportMarketing').disabled = false; $('exportProspects').disabled = false; } }
  }
  $('exportMarketing').addEventListener('click', function () { exportInquiries('eligible'); }); $('exportProspects').addEventListener('click', function () { exportInquiries('all'); });
  $('verifyPanel').hidden = !verifyToken; $('loginForm').hidden = !!verifyToken;
  if (verifyToken) { setSession(null); $('loginStatus').textContent = 'Select Continue securely to use this sign-in link.'; }
  else if (session) { $('loginStatus').textContent = 'Checking your operator access…'; loadData().catch(function () {}); }
})();
