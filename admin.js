(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var meta = document.querySelector('meta[name="mc-api-base"]'), base = meta && meta.content ? meta.content.replace(/\/$/, '') : '';
  var storageKey = 'mc-operator-session-v1', session = null, generation = 0, data = null, selected = null, selectedRecord = null, detailVersion = 0, view = 'overview', action = null, busy = false, toastTimer;
  var controllers = new Set();
  var pendingSupportAction=null, pendingSupportLoaded=false, supportActionStorage='mc-support-action-pending-v1';
  var loginPending = false, loginRecipient = '', loginRetryAt = 0, loginRetryTimer = null;
  var verifyToken = new URLSearchParams(location.hash.slice(1)).get('verify');
  if (location.hash || location.search) history.replaceState(null, '', location.pathname);
  if (!/^[a-f0-9]{64}$/.test(verifyToken || '')) verifyToken = null;
  try { session = sessionStorage.getItem(storageKey); sessionStorage.removeItem('mc_admin_key'); } catch (error) { /* Memory-only access works when storage is disabled. */ }
  if (!/^[a-f0-9]{64}$/.test(session || '')) session = null;
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function array(value) { return Array.isArray(value) ? value : []; }
  function label(value) { return String(value || 'Not recorded').replace(/_/g, ' '); }
  function planLabel(value) { return ({ starter: 'Coverage', growth: 'Follow-through', enterprise: 'Enterprise', pro: 'Pro' })[value] || label(value); }
  function date(value) { if (!value || !Number.isFinite(Date.parse(value))) return 'Not recorded'; return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)) + ' CT'; }
  function badge(value) { var good = ['live', 'active', 'connected', 'ready', 'succeeded', 'approved', 'healthy'].indexOf(value) >= 0, bad = ['failed', 'error', 'critical'].indexOf(value) >= 0, neutral = ['cancelled', 'archived', 'unavailable', 'disabled'].indexOf(value) >= 0; return '<span class="badge' + (good ? ' good' : bad ? ' bad' : neutral ? ' neutral' : ' warn') + '">' + esc(label(value)) + '</span>'; }
  function emptyState(title, detail, destination, cta) { return '<div class="empty"><span class="empty-icon" aria-hidden="true"><svg class="ui-icon" viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4m8-4v4M8 12h8m-8 4h5"/></svg></span><h3>' + esc(title) + '</h3><p>' + esc(detail) + '</p>' + (destination ? '<button type="button" class="btn small" data-go="' + esc(destination) + '">' + esc(cta) + '</button>' : '') + '</div>'; }
  function diagnostic(title, content, open) { return '<details class="panel diagnostic-panel"' + (open ? ' open' : '') + '><summary>' + esc(title) + '</summary><div class="diagnostic-content">' + content + '</div></details>'; }
  function setSession(value) { session = value; try { if (value) sessionStorage.setItem(storageKey, value); else sessionStorage.removeItem(storageKey); } catch (error) { /* Retain the current in-memory session only. */ } }
  function abortRequests() { controllers.forEach(function (controller) { controller.abort(); }); controllers.clear(); }
  function clearPrivate(message) {
    pendingSupportAction=null;pendingSupportLoaded=false;try{sessionStorage.removeItem(supportActionStorage);}catch(error){}if($('pendingSupportAction'))$('pendingSupportAction').remove();
    generation++; abortRequests(); data = null; selected = null; selectedRecord = null; detailVersion++; action = null; busy = false; loading = null; setSession(null);
    if ($('actionDialog').open) $('actionDialog').close();
    ['summary', 'overviewIssues', 'overviewActivity', 'customers', 'customerDetail', 'issues', 'activity', 'prospects', 'platformSMS', 'system'].forEach(function (id) { $(id).replaceChildren(); });
    $('scopeNotice').hidden = true; $('scopeNotice').textContent = ''; $('issueNavCount').hidden = true; $('issueNavCount').textContent = ''; $('currentLocation').textContent = 'Overview';
    $('operator').textContent = ''; $('lastUpdated').textContent = ''; $('prospectsStatus').textContent = ''; $('platformSMSStatus').textContent = ''; $('customerSearch').value = ''; $('customerStatus').value = 'all';
    ['actionNote', 'actionResolution', 'actionReason', 'ruleServices', 'ruleServiceArea', 'ruleNotServed', 'ruleSummary'].forEach(function (id) { $(id).value = ''; }); ['actionStatus', 'actionTitle', 'actionDescription', 'actionSupportReference', 'appStatus', 'customerCount', 'toast'].forEach(function (id) { $(id).textContent = ''; }); $('toast').hidden = true; clearTimeout(toastTimer);
    resetLoginEmail();
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
  function issueRows() { return data ? array(data.customers).flatMap(function (customer) { return array(customer.issues).map(function (issue) { return Object.assign({}, issue, { slug: customer.slug, name: customer.name || customer.slug }); }); }).sort(function (a, b) { var priority = { critical: 0, error: 1, high: 1, warning: 2, attention: 3 }; return (priority[a.severity] == null ? 4 : priority[a.severity]) - (priority[b.severity] == null ? 4 : priority[b.severity]); }) : []; }
  function activities() { return data ? array(data.customers).flatMap(function (customer) { return array(customer.activity).map(function (event) { return Object.assign({}, event, { slug: customer.slug, name: customer.name || customer.slug }); }); }).sort(function (a, b) { return String(b.at || '').localeCompare(String(a.at || '')); }) : []; }
  function renderIssues(rows, target) {
    $(target).innerHTML = rows.length ? '<ul class="record-list">' + rows.map(function (issue) { return '<li><div class="record-top"><b>' + esc(issue.title || 'Needs attention') + '</b>' + badge(issue.severity || 'attention') + '</div><p>' + esc(issue.detail) + '</p><button class="btn small" type="button" data-customer="' + esc(issue.slug) + '"' + (issue.reportId ? ' data-support-target="' + esc(issue.reportId) + '"' : '') + ' style="margin-top:10px">' + (issue.reportId ? 'Review report · ' : '') + esc(issue.name) + ' →</button></li>'; }).join('') + '</ul>' : emptyState('No current issues reported', 'New setup or service issues will appear here, with a link to the customer account.', 'customers', 'View customers');
  }
  function renderActivity(rows, target, includeCustomer) {
    $(target).innerHTML = rows.length ? '<ul class="record-list">' + rows.map(function (event) { return '<li><div class="record-top"><b>' + esc(label(event.type)) + '</b><span class="timestamp">' + esc(date(event.at)) + '</span></div><p>' + esc(event.detail || '') + '</p>' + (includeCustomer ? '<button type="button" class="btn small" data-customer="' + esc(event.slug) + '" style="margin-top:8px">' + esc(event.name) + '</button>' : '') + '</li>'; }).join('') + '</ul>' : emptyState('No activity recorded yet', 'Customer setup and support actions will build a clear history here.');
  }
  function renderCustomers() {
    if (!data) return;
    var term = $('customerSearch').value.trim().toLowerCase(), status = $('customerStatus').value;
    var rows = array(data.customers).filter(function (customer) { var owner = customer.owner || {}; return (status === 'all' || customer.status === status || status === 'setup_pending' && customer.selfService && !['cancelled', 'archived'].includes(customer.status) && array(customer.connections).some(function (connection) { return connection.requested && !['active', 'connected'].includes(connection.status); })) && (!term || [customer.name, customer.slug, owner.name, owner.email, owner.phone].join(' ').toLowerCase().includes(term)); });
    $('customerCount').textContent = rows.length + ' matching · ' + array(data.customers).length + ' loaded' + (Number.isFinite(data.total) ? ' of ' + data.total + ' customers' : ' customers');
    $('loadMoreCustomers').hidden = !data.nextCursor;
    $('customers').innerHTML = rows.length ? '<div class="table-scroll customers-table" tabindex="0" role="region" aria-label="Customer accounts"><table class="data-table"><thead><tr><th scope="col">Customer</th><th scope="col">Status</th><th scope="col">Plan</th><th scope="col">Connections</th><th scope="col">Needs attention</th></tr></thead><tbody>' + rows.map(function (customer) {
      var connected = array(customer.connections).filter(function (connection) { return ['active', 'connected'].includes(connection.status); });
      return '<tr><td><span class="customer-avatar" aria-hidden="true">' + esc((customer.name || customer.slug).split(/\s+/).slice(0, 2).map(function (word) { return word.charAt(0); }).join('').toUpperCase()) + '</span><button class="customer-name" type="button" data-customer="' + esc(customer.slug) + '">' + esc(customer.name || customer.slug) + '</button><small>' + esc((customer.owner || {}).email || customer.slug) + '</small></td><td data-label="Status">' + badge(customer.status) + '</td><td data-label="Plan">' + esc(planLabel(customer.plan)) + '</td><td data-label="Connections">' + (connected.length ? connected.map(function (connection) { return esc(connection.label); }).join(', ') : '<span class="muted">None active</span>') + '</td><td data-label="Needs attention">' + (array(customer.issues).length ? '<span class="badge warn">' + array(customer.issues).length + ' issue' + (array(customer.issues).length === 1 ? '' : 's') + '</span>' : '<span class="muted">No issues reported</span>') + '</td></tr>';
    }).join('') + '</tbody></table></div>' : emptyState(array(data.customers).length ? 'No matching customers' : 'No customer workspaces yet.', array(data.customers).length ? 'Try a different business name, email or service status.' : 'New customer workspaces will appear here with their setup progress and service status.');
  }
  function renderOperations(rows, closed) {
    return rows.length ? rows.map(function (operation) { return '<div class="operation-line"><div class="record-top"><b>' + esc(operation.label || 'Workspace operation') + '</b>' + badge(operation.state) + '</div><p>' + esc(operation.detail) + '</p><p class="timestamp">Updated ' + esc(date(operation.updatedAt)) + ' · ' + Number(operation.attempts || 0) + ' attempt' + (operation.attempts === 1 ? '' : 's') + (operation.nextAttemptAt ? ' · Next attempt ' + esc(date(operation.nextAttemptAt)) : '') + '</p><div class="mono muted">Reference: ' + esc(operation.id) + '</div>' + (operation.nextAction && operation.nextAction.action === 'retry_operation' ? '<button class="btn small" type="button" data-action="retry_operation" data-operation="' + esc(operation.id) + '"' + (closed ? ' disabled' : '') + ' style="margin-top:10px">' + esc(operation.nextAction.label || 'Retry refresh') + '</button>' : '') + '</div>'; }).join('') : '<p class="muted">No background refresh has been requested.</p>';
  }
  function renderPhoneOperation(phone) {
    var operation = phone && phone.operation; if (!operation) return '';
    var states = { queued: 'Number request saved', waiting_platform: 'Waiting for platform', running: 'Reserving number', uncertain: 'Checking number request', number_acquired: 'Number reserved', cleanup_pending: 'Number release pending', releasing: 'Releasing number', cleanup_uncertain: 'Checking number release', cancelled: 'Number request cancelled', superseded: 'Setup changed', needs_review: 'Needs platform review' };
    return '<section class="panel"><h2>Phone number request</h2><p class="muted">Number acquisition only. Phone answering and customer texts are not activated by this operation.</p><div class="operation-line"><div class="record-top"><b>' + esc(states[operation.state] || 'Status unavailable') + '</b>' + badge(operation.state) + '</div><p>' + esc(operation.detail) + '</p>' + (operation.number ? '<p><b>Recorded number:</b> ' + esc(operation.number) + '</p>' : '') + '<p>' + (operation.releaseConfirmed ? 'Release is confirmed; the resource receipt is retained.' : operation.resourceRecorded ? 'Resource receipt is retained; release is not confirmed.' : 'No resource receipt is recorded.') + '</p><p class="timestamp">Updated ' + esc(date(operation.updatedAt)) + (operation.nextCheckAt ? ' · Next check ' + esc(date(operation.nextCheckAt)) : '') + '</p><div class="mono muted">Reference: ' + esc(operation.id) + '</div></div></section>';
  }
  function historyIncomplete(listing) { return Object.keys(listing || {}).some(function (kind) { return listing[kind] && listing[kind].incomplete === true; }); }
  function historyNotice(listing) { return historyIncomplete(listing) ? '<p class="notice" data-history-notice><strong>Showing part of this customer’s history.</strong> Counts cover only the records shown. Some history still needs checking. Exports require a complete matching record history.</p>' : ''; }
  function supportStatus(value) { return ({reported:'Reported',acknowledged:'Under review',resolved:'Resolved'})[value] || 'Check report status'; }
  function supportOperationId() { return Array.from(crypto.getRandomValues(new Uint8Array(16))).map(function(n){return n.toString(16).padStart(2,'0');}).join(''); }
  async function supportSessionTag() { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(session || '')))).map(function(n){return n.toString(16).padStart(2,'0');}).join(''); }
  async function storeSupportAction(body) { var current=generation;try{var tag=await supportSessionTag();if(current!==generation||!session)return;if(body)sessionStorage.setItem(supportActionStorage,JSON.stringify({sessionTag:tag,body:body}));else sessionStorage.removeItem(supportActionStorage);}catch(error){} }
  function supportActionApplied(customer,body) { return array(customer?.supportReports).find(function(report){return report.id===body.reportId && (report.operationIds || []).includes(body.operationId);}); }
  function renderPendingSupport() {
    var previous=$('pendingSupportAction');if(previous)previous.remove();if(!pendingSupportAction||!data)return;
    var notice=document.createElement('div');notice.id='pendingSupportAction';notice.className='support-pending-action';notice.innerHTML='<p><strong>A support change still needs confirmation.</strong> Check its saved result before making another support change.</p><button type="button" class="btn small" id="resumeSupportAction">Check saved support action</button>';$('appStatus').after(notice);
  }
  async function restoreSupportAction() {
    if(pendingSupportLoaded||!session)return;pendingSupportLoaded=true;var current=generation;
    try{var tag=await supportSessionTag();if(current!==generation)return;var saved=JSON.parse(sessionStorage.getItem(supportActionStorage)||'null');if(saved?.sessionTag===tag && ['acknowledge_report','resolve_report'].includes(saved.body?.action) && /^[a-f0-9]{32}$/.test(saved.body.operationId || ''))pendingSupportAction=saved.body;}catch(error){}
    if(current===generation)renderPendingSupport();
  }
  function renderSupportReports(customer) {
    var rows=array(customer.supportReports);if(!rows.length)return '';
    return '<section class="panel" id="supportReports"><h2>Customer support reports</h2><p class="muted">Acknowledge the report to start review. The resolution is shown to the customer in their workspace; internal notes stay private.</p>'+rows.map(function(report){
      var actions=report.status==='reported'?'<button class="btn small primary" type="button" data-action="acknowledge_report" data-report="'+esc(report.id)+'">Acknowledge report</button>':report.status==='acknowledged'?'<button class="btn small primary" type="button" data-action="resolve_report" data-report="'+esc(report.id)+'">Resolve report</button>':'';
      return '<article class="support-case" data-support-case="'+esc(report.id)+'"><div class="record-top"><h3 tabindex="-1">'+esc(report.reference)+'</h3><span class="badge '+(report.status==='resolved'?'good':'warn')+'">'+esc(supportStatus(report.status))+'</span></div><p><strong>'+esc(report.channel)+' · '+esc(report.contact)+'</strong></p><p>'+esc(report.note)+'</p><p class="timestamp">Reported '+esc(date(report.reportedAt))+(report.acknowledgedAt?' · Review started '+esc(date(report.acknowledgedAt)):'')+(report.resolvedAt?' · Resolved '+esc(date(report.resolvedAt)):'')+'</p>'+(array(report.messages).length?'<details class="support-context"><summary>Reported conversation</summary>'+report.messages.map(function(message){return '<p><b>'+(message.role==='user'?'Customer':'Front desk')+':</b> '+esc(message.content)+'</p>';}).join('')+'</details>':'')+(report.resolution?'<div class="support-public-reply"><strong>Resolution for the customer</strong><p>'+esc(report.resolution)+'</p></div>':'')+'<div class="actions">'+actions+'</div></article>';
    }).join('')+'</section>';
  }
  function focusSupportReport(id) { var card=Array.from(document.querySelectorAll('[data-support-case]')).find(function(node){return node.dataset.supportCase===id;});if(card){card.scrollIntoView({block:'center'});card.querySelector('h3').focus({preventScroll:true});} }
  function renderRecords(records, listing) {
    var bookings = array(records.bookings), leads = array(records.leads), conversations = array(records.conversations);
    var processingLabels = { queued: 'Reply queued', running: 'Processing', failed: 'Processing failed', suppressed: 'Reply withheld', awaiting_delivery: 'Awaiting delivery confirmation', uncertain: 'Delivery uncertain; do not resend', superseded: 'Replaced by a newer reply', expired: 'Reply expired' };
    var list = function (rows, kind) { return rows.length ? '<ul class="record-list">' + rows.map(function (row) { return '<li><div class="record-top"><b>' + esc(row.name || row.customer_name || row.contact || row.phone || row.id || 'Customer record') + '</b>' + badge(row.status || row.channel || kind) + '</div><p>' + esc(row.issue || row.outcome || row.summary || '') + '</p><p>' + esc([row.phone, row.address, row.date, row.window].filter(Boolean).join(' · ')) + '</p>' + (Array.isArray(row.messages) ? '<details><summary>Read conversation</summary>' + row.messages.map(function (message) { return '<p><b>' + esc(message.role === 'user' ? 'Customer' : 'Front desk') + ':</b> ' + esc(message.content) + (message.processing ? '<br><span class="muted">' + esc(processingLabels[message.processing] || 'Processing status unavailable') + '</span>' : '') + '</p>'; }).join('') + '</details>' : '') + '<span class="timestamp">' + esc(date(row.at || row.createdAt || row.updatedAt)) + '</span></li>'; }).join('') + '</ul>' : '<p class="muted">None recorded.</p>'; };
    return '<details><summary>Bookings (' + bookings.length + ' ' + (listing?.bookings?.incomplete ? 'shown' : 'recent') + ')</summary>' + list(bookings, 'booking') + '</details><details style="margin-top:14px"><summary>Leads (' + leads.length + ' ' + (listing?.leads?.incomplete ? 'shown' : 'recent') + ')</summary>' + list(leads, 'lead') + '</details><details style="margin-top:14px"><summary>Conversations (' + conversations.length + ' recent)</summary>' + list(conversations, 'conversation') + '</details>';
  }
  function renderDetail(focus) {
    var customer = currentCustomer();
    if (!customer) { $('customersPageHead').hidden = false; $('view-customers').setAttribute('aria-labelledby', 'customersTitle'); $('customerDetail').hidden = true; $('customerList').hidden = false; if (view === 'customers') $('currentLocation').textContent = 'Customers'; return; }
    $('customersPageHead').hidden = true; $('view-customers').setAttribute('aria-labelledby', 'detailTitle'); $('customerList').hidden = true; $('customerDetail').hidden = false; if (view === 'customers') $('currentLocation').textContent = 'Customers / ' + (customer.name || customer.slug);
    var owner = customer.owner || {}, metrics = customer.metrics || {}, setup = customer.setup || {}, isManaged = customer.selfService === true, closed = ['cancelled', 'archived'].includes(customer.status);
    $('customerDetail').innerHTML = '<button type="button" class="btn small back-button" id="backCustomers">← All customers</button><div class="panel detail-account"><div class="detail-head"><div><p class="eyebrow">Customer account</p><h1 class="detail-title" id="detailTitle" tabindex="-1">' + esc(customer.name || customer.slug) + '</h1><p class="muted">' + esc(customer.slug) + ' · Created ' + esc(date(customer.createdAt)) + '</p></div>' + badge(customer.status) + '</div><dl class="facts"><div><dt>Owner</dt><dd>' + esc(owner.name || 'Not recorded') + '</dd></div><div><dt>Email</dt><dd>' + esc(owner.email || 'Not recorded') + '</dd></div><div><dt>Phone</dt><dd>' + esc(owner.phone || 'Not recorded') + '</dd></div><div><dt>Plan preference</dt><dd>' + esc(planLabel(customer.plan)) + '</dd></div></dl></div>'
      + (!isManaged ? '<p class="notice">This is a legacy account. This portal provides a read-only view while management access is migrated.</p>' : '')
      + '<div class="detail-grid"><div class="detail-main"><section class="panel connections-panel"><h2>Connections</h2><div class="channel-grid">' + (array(customer.connections).concat(array(customer.leadSources)).length ? array(customer.connections).concat(array(customer.leadSources)).map(function (connection) { return '<div class="channel-card">' + badge(connection.status) + '<h3>' + esc(connection.label || connection.id) + '</h3><p>' + esc(connection.detail) + '</p></div>'; }).join('') : '<p class="muted">No connection status is available.</p>') + '</div></section><section class="panel"><h2>Setup and checks</h2>' + (array(setup.steps).length ? '<ul class="record-list">' + array(setup.steps).map(function (step) { return '<li><div class="record-top"><b>' + esc(step.label) + '</b>' + badge(step.status) + '</div><p>' + esc(step.detail) + '</p></li>'; }).join('') + '</ul>' : '<p class="muted">No setup checks were reported.</p>') + '</section><section class="panel"><h2>Background work</h2><p class="muted">A refresh rebuilds the desk from saved business answers. It does not activate connections or contact customers.</p>' + renderOperations(array(customer.operations), closed) + '</section>' + renderPhoneOperation(customer.phoneActivation) + '<section class="panel"><h2>Recent activity</h2><div id="detailActivity"></div></section></div><div class="detail-aside"><section class="panel work-panel"><h2>Customer work</h2>' + historyNotice(customer.recordListing) + '<p class="muted" data-count-scope>' + esc(metrics.scope || 'Latest 100 records per category') + '</p><dl class="facts work-stats"><div><dt>Bookings</dt><dd>' + Number(metrics.bookings || 0) + '</dd></div><div><dt>Leads</dt><dd>' + Number(metrics.leads || 0) + '</dd></div><div><dt>Conversations</dt><dd>' + Number(metrics.conversations || 0) + '</dd></div><div><dt>Open issues</dt><dd>' + Number(metrics.openIssues || array(customer.issues).length) + '</dd></div></dl></section><section class="panel support-panel"><h2>Support actions</h2><p class="muted">Every change includes a reason and an account history entry.</p><div class="actions support-actions">' + (isManaged ? (customer.status === 'live' ? '<button class="btn danger" type="button" data-action="pause">Pause front desk</button>' : customer.status === 'paused' ? '<button class="btn" type="button" data-action="resume"' + (setup.canActivateWeb ? '' : ' disabled') + '>Resume front desk</button>' : '') + (!closed ? '<button class="btn" type="button" data-action="rebuild_workspace">Refresh saved workspace</button><button class="btn" type="button" data-action="update_rules">Correct business answers</button>' : '') + '<button class="btn" type="button" data-action="save_note">Add internal note</button>' + (!closed ? '<button class="btn danger" type="button" data-action="cancel_service">Cancel front desk</button>' : '') : '<p class="muted">Support actions are not available for this legacy account.</p>') + '</div>' + (customer.status === 'paused' && !setup.canActivateWeb ? '<p class="muted">The current setup checks must pass before website chat can resume.</p>' : '') + '</section><section class="panel"><h2>Internal notes</h2>' + (array(customer.notes).length ? '<ul class="record-list">' + array(customer.notes).map(function (note) { return '<li><p style="white-space:pre-wrap;margin:0;color:#263a56">' + esc(note.text) + '</p><p>' + esc(note.actor || 'Operator') + ' · ' + esc(date(note.at)) + '</p></li>'; }).join('') + '</ul>' : '<p class="muted">No internal notes yet.</p>') + '</section></div></div>';
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
    var recordPanel = document.createElement('section'); recordPanel.className = 'panel'; recordPanel.innerHTML = '<h2>Customer records</h2>' + historyNotice(customer.recordListing) + '<p class="muted" data-count-scope>' + esc(metrics.scope || 'Latest 100 records per category') + ' Read only. Provider messages and billing are not changed here.</p>' + renderRecords(customer.records || {}, customer.recordListing || {}); $('detailActivity').closest('section').before(recordPanel);
    if (array(customer.supportReports).length) { var supportPanel=document.createElement('div');supportPanel.innerHTML=renderSupportReports(customer);$('customerDetail').querySelector('.detail-main').prepend(supportPanel.firstElementChild); }
    // Keep daily account work in view; open deeper receipts only when needed.
    var detailMain = $('customerDetail').querySelector('.detail-grid > div');
    if (array(customer.issues).length) {
      var attentionPanel = document.createElement('section'); attentionPanel.className = 'panel detail-priority';
      attentionPanel.innerHTML = '<h2>Needs attention</h2><div id="detailIssues"></div>'; detailMain.prepend(attentionPanel);
      renderIssues(array(customer.issues).map(function (issue) { return Object.assign({}, issue, { slug: customer.slug, name: customer.name || customer.slug }); }), 'detailIssues');
    }
    Array.from(detailMain.children).forEach(function (panel) {
      var heading = panel.querySelector(':scope > h2'); if (!heading) return;
      var title = heading.textContent;
      if (['Setup and checks', 'Background work', 'Phone number request', 'Service delivery'].indexOf(title) < 0) return;
      var open = title === 'Background work' && array(customer.operations).length > 0;
      var content = panel.innerHTML.slice(heading.outerHTML.length);
      var wrapper = document.createElement('div'); wrapper.innerHTML = diagnostic(title, content, open);
      panel.replaceWith(wrapper.firstElementChild);
    });
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
    $('currentLocation').textContent = view.charAt(0).toUpperCase() + view.slice(1);
    var scope = data.nextCursor || (Number.isFinite(data.total) && data.total > array(data.customers).length) ? ' (loaded)' : '';
    if (summary.scope === 'loaded' || summary.scope === 'Current page') summary = { customers: array(data.customers).length, active: array(data.customers).filter(function (c) { return c.status === 'live'; }).length, needsAttention: array(data.customers).filter(function (c) { return array(c.issues).length > 0; }).length, setupPending: array(data.customers).filter(function (c) { return c.selfService && !['cancelled', 'archived'].includes(c.status) && array(c.connections).some(function (connection) { return connection.requested && !['active','connected'].includes(connection.status); }); }).length };
    $('scopeNotice').hidden = !scope; $('scopeNotice').textContent = 'Overview, search, issues and activity cover the ' + array(data.customers).length + ' customers loaded so far. Load more in Customers to include the next accounts.';
    $('operator').textContent = 'Operator: ' + (data.operator && data.operator.email || 'operator');
    $('summary').innerHTML = [{ value: summary.needsAttention, label: 'Need attention' + scope, attention: true, go: 'issues' }, { value: summary.setupPending, label: 'Setup pending' + scope, go: 'customers', filter: 'setup_pending' }, { value: summary.active, label: 'Live accounts' + scope, go: 'customers', filter: 'live' }, { value: summary.customers, label: 'All customers' + scope, go: 'customers', filter: 'all' }].map(function (stat) { return '<button type="button" class="stat' + (stat.attention ? ' attention' : '') + '" data-go="' + stat.go + '"' + (stat.filter ? ' data-filter="' + stat.filter + '"' : '') + '><span>' + esc(stat.label) + '</span><svg class="stat-arrow ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg><b>' + (Number.isFinite(stat.value) ? stat.value : '—') + '</b></button>'; }).join('');
    $('issueNavCount').hidden = !issues.length; $('issueNavCount').textContent = issues.length ? String(issues.length) : '';
    renderIssues(issues.slice(0, 4), 'overviewIssues'); renderIssues(issues, 'issues'); renderActivity(events.slice(0, 5), 'overviewActivity', true); renderActivity(events, 'activity', true);
    renderCustomers(); renderDetail(false); renderInquiries(); renderSystem(); renderPendingSupport();
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
      $('lastUpdated').textContent = 'Updated ' + date(new Date().toISOString()); render(); restoreSupportAction();
    }).catch(function (error) {
      if (current !== generation || error.stale) return;
      if (data) { $('appStatus').textContent = 'Could not refresh. The information below may be out of date. ' + error.message; $('appStatus').className = 'notice error'; $('appStatus').hidden = false; }
      else { $('login').hidden = false; showOperatorRecovery(error); }
      throw error;
    }).finally(function () { if (current === generation) { $('refreshAll').disabled = false; $('refreshProspects').disabled = false; } if (loading === pending) loading = null; });
    loading = pending; return pending;
  }
  function navigate(nextView, focus) {
    if (!data || ['overview', 'customers', 'issues', 'activity', 'inquiries', 'system'].indexOf(nextView) < 0) return;
    view = nextView; $('currentLocation').textContent = view.charAt(0).toUpperCase() + view.slice(1); document.querySelectorAll('.view').forEach(function (panel) { panel.hidden = panel.id !== 'view-' + view; });
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
  function selectCustomer(slug,reportId) { if (!data || !array(data.customers).some(function (customer) { return customer.slug === slug; })) return; return loadDetail(slug, !reportId).then(function(){if(selected===slug && reportId)focusSupportReport(reportId);}); }
  document.addEventListener('click', function (event) {
    var customer = event.target.closest('[data-customer]'); if (customer) { selectCustomer(customer.dataset.customer,customer.dataset.supportTarget); return; }
    var nav = event.target.closest('[data-view],[data-go]'); if (nav) { if ((nav.dataset.view || nav.dataset.go) === 'customers') { selected = null; if (nav.dataset.filter) { $('customerSearch').value = ''; $('customerStatus').value = nav.dataset.filter; renderCustomers(); } } navigate(nav.dataset.view || nav.dataset.go, true); return; }
    if (event.target.closest('#refreshCustomerDetail')) { if (selected) loadDetail(selected, true); return; }
    if (event.target.closest('#backCustomers')) { selected = null; selectedRecord = null; detailVersion++; renderDetail(false); $('customerSearch').focus(); return; }
    if(event.target.closest('#resumeSupportAction')){resumeSupportAction();return;}
    var trigger = event.target.closest('[data-action]'); if (trigger) openAction(trigger.dataset.action, trigger.dataset.operation, trigger.dataset.report);
  });
  $('customerFilters').addEventListener('submit', function (event) { event.preventDefault(); renderCustomers(); }); $('customerSearch').addEventListener('input', renderCustomers); $('customerStatus').addEventListener('change', renderCustomers);
  var actionCopy = {
    acknowledge_report: {title:'Acknowledge support report',description:'The customer will see that their report is under review. This does not mark the problem fixed.',submit:'Acknowledge report'},
    resolve_report: {title:'Resolve support report',description:'Explain what you found and what happens next. This reply will be shown to the customer in their workspace.',submit:'Save resolution'},
    cancel_service: { title: 'Cancel front desk', description: 'This stops new chat, phone answering, customer texts and calendar sync. Saved records remain available. Provider cleanup is recovered in the background for attached services; billing is unchanged.', submit: 'Cancel front desk' },
    pause: { title: 'Pause front desk', description: 'Chat, phone answering, texts and calendar updates pause. Existing call forwarding may still need to be switched off at the phone carrier. Saved records and business answers remain.', submit: 'Pause front desk' },
    resume: { title: 'Resume front desk', description: 'Restore the previous service state after the current setup and AI checks pass. Existing accepted phone, texting and calendar connections are checked in the background. Website chat is restored only if it was previously active and is selected.', submit: 'Resume front desk' },
    update_rules: { title: 'Correct business answers', description: 'Save corrected answers on this account. The customer will see the saved changes. A new review and private test are required before changed rules can serve customers.', submit: 'Save corrected answers' },
    save_note: { title: 'Add an internal note', description: 'This note is visible to operators. It is not emailed or shown to the customer.', submit: 'Save note' },
    rebuild_workspace: { title: 'Refresh the saved workspace', description: 'Queue a refresh from the business answers already saved on this account. This does not contact customers, change their answers or activate a connection.', submit: 'Request refresh' },
    retry_operation: { title: 'Retry the workspace refresh', description: 'Retry this recorded refresh if it is still eligible. The server checks its current revision and retry limit first.', submit: 'Retry refresh' }
    ,reconcile_services: { title: 'Check authorized services', description: 'Save an audited request to recheck existing customer-authorized phone, texting, calendar and message work. Platform workers may also check other already-authorized work. Execution gates and existing approvals remain in force. This does not authorize a purchase, create customer consent, or resend an uncertain message. A queued check is not proof of successful service delivery.', submit: 'Request service checks' }
  };
  function openAction(name, operationId, reportId) {
    var customer = currentCustomer(), copy = actionCopy[name]; if (!customer || !customer.selfService || !copy || busy || ['cancelled', 'archived'].includes(customer.status) && !['save_note','reconcile_services','acknowledge_report','resolve_report'].includes(name)) return;
    var reportAction=['acknowledge_report','resolve_report'].includes(name),report=reportAction?array(customer.supportReports).find(function(row){return row.id===reportId;}):null;
    if(reportAction && (!report || name==='acknowledge_report' && report.status!=='reported' || name==='resolve_report' && report.status!=='acknowledged'))return;
    if(reportAction && pendingSupportAction){toast('Check the saved support change before starting another.');return;}
    action = { name: name, slug: customer.slug, expectedRevision: customer.revision, operationId: reportAction?supportOperationId():operationId, reportId:reportId, expectedReportRevision:report?.revision };
    $('resolutionField').hidden=name!=='resolve_report';$('actionResolution').required=name==='resolve_report';$('actionResolution').value='';$('actionResolution').readOnly=false;$('actionReason').readOnly=false;$('actionCheck').hidden=true;$('actionSupportReference').hidden=!report;$('actionSupportReference').textContent=report?'Report '+report.reference:'';
    $('actionTitle').textContent = copy.title; $('actionDescription').textContent = (customer.name || customer.slug) + ': ' + copy.description; $('actionSubmit').textContent = copy.submit; $('actionSubmit').className = name === 'cancel_service' ? 'btn danger' : 'btn primary'; $('actionSubmit').disabled = false;
    $('actionReason').value = ''; $('actionNote').value = ''; $('rulesFields').hidden = name !== 'update_rules'; var rules = customer.rules || {}; $('ruleServices').value = array(rules.services).join('\n'); $('ruleServiceArea').value = array((rules.business || {}).serviceArea).join('\n'); $('ruleNotServed').value = array((rules.business || {}).notServed).join('\n'); $('ruleSummary').value = rules.summary || ''; $('noteField').hidden = name !== 'save_note'; $('actionNote').required = name === 'save_note'; $('actionStatus').textContent = ''; $('actionCancel').disabled = false;
    $('actionDialog').showModal(); (name==='resolve_report'?$('actionResolution'):name === 'save_note' ? $('actionNote') : $('actionReason')).focus();
  }
  $('actionCancel').addEventListener('click', function () { if (!busy) { $('actionDialog').close(); action = null; } });
  $('actionDialog').addEventListener('cancel', function (event) { if (busy) event.preventDefault(); else action = null; });
  $('actionForm').addEventListener('submit', async function (event) {
    event.preventDefault(); if (!action || busy || !$('actionForm').reportValidity()) return;
    var current = generation, snapshot = Object.assign({}, action), body = { action: action.name, slug: action.slug, expectedRevision: action.expectedRevision, reason: $('actionReason').value.trim() };
    if (!body.reason) { $('actionStatus').textContent = 'Add a reason for this action.'; $('actionReason').focus(); return; }
    if (action.name === 'update_rules') { var lines = function (id) { return $(id).value.split('\n').map(function (line) { return line.trim(); }).filter(Boolean); }; body.patch = { services: lines('ruleServices'), business: { serviceArea: lines('ruleServiceArea'), notServed: lines('ruleNotServed') }, summary: $('ruleSummary').value.trim() }; }
    if (action.name === 'save_note') body.text = $('actionNote').value.trim(); if (action.name === 'retry_operation') body.operationId = action.operationId;
    var reportAction=['acknowledge_report','resolve_report'].includes(action.name);
    if(reportAction){body.reportId=action.reportId;body.expectedReportRevision=action.expectedReportRevision;body.operationId=action.operationId;if(action.name==='resolve_report'){body.resolution=$('actionResolution').value.trim();if(body.resolution.length<10){$('actionStatus').textContent='Add a clear resolution of at least 10 characters for the customer.';$('actionResolution').focus();return;}}if(action.savedBody)body=action.savedBody;else action.savedBody=structuredClone(body);snapshot=Object.assign({},action);}

    var reportSaved=false;
    busy = true; $('actionSubmit').disabled = true; $('actionCancel').disabled = true; $('actionStatus').textContent = 'Saving…';
    try {
      if(reportAction){pendingSupportAction=body;await storeSupportAction(body);if(current!==generation)return;}
      var result = await request('POST', body); if (current !== generation) return;
      if(reportAction){reportSaved=true;pendingSupportAction=null;await storeSupportAction(null);if(current!==generation)return;renderPendingSupport();}
      $('actionDialog').close(); action = null; selected = snapshot.slug;
      if (result.refreshRequired === true) {
        selectedRecord = null; detailVersion++; data.customers = array(data.customers).filter(function (customer) { return customer.slug !== snapshot.slug; });
        $('customerList').hidden = true; $('customerDetail').hidden = false; $('customerDetail').innerHTML = '<div class="panel"><h2 tabindex="-1" id="savedTitle">Change saved</h2><p class="notice success">' + esc(result.message || 'Your change is saved. Refresh customer details to confirm the current state.') + '</p><button class="btn primary" type="button" id="refreshCustomerDetail">Refresh customer details</button></div>';
        $('appStatus').textContent = 'Your change was saved. Refresh this account to confirm its current state before making another change.'; $('appStatus').className = 'notice'; $('appStatus').hidden = false; $('savedTitle').focus(); return;
      }
      if (result.customer && result.customer.slug === snapshot.slug) selectedRecord = result.customer;
      await loadData(); if (current === generation) await loadDetail(snapshot.slug, false);
      if (current === generation) { renderDetail(false); if(snapshot.reportId)focusSupportReport(snapshot.reportId); toast(snapshot.name==='acknowledge_report'?'Report acknowledged. The customer can see it is under review.':snapshot.name==='resolve_report'?'Resolution saved in the customer’s workspace.':snapshot.name === 'save_note' ? 'Internal note saved.' : snapshot.name === 'reconcile_services' ? 'Service-check request saved. Its receipt shows whether checks were dispatched; delivery is confirmed separately.' : snapshot.name === 'update_rules' ? 'Corrected answers saved. Review and test are required before using changed rules.' : snapshot.name === 'rebuild_workspace' || snapshot.name === 'retry_operation' ? 'Refresh request saved. Check Background work for its result.' : 'Change saved. Current service status is shown on the account.'); }
    } catch (error) {
      if (current !== generation || error.stale) return;
      if(reportAction && reportSaved){toast('The support change is saved. Refresh customer details to see its current status.');return;}
      if(reportAction){
        if(error.status && error.status<500){pendingSupportAction=null;await storeSupportAction(null);if(current!==generation)return;renderPendingSupport();if(action)action.savedBody=null;}
        else{if(action)action.uncertain=true;$('actionReason').readOnly=true;$('actionResolution').readOnly=true;$('actionCheck').hidden=false;$('actionStatus').textContent='The result is not confirmed. Your saved details are kept. Check the report before retrying the same change.';renderPendingSupport();return;}
      }
      if (error.status === 409) { await loadDetail(snapshot.slug, false); if (current === generation) { if (action) action.stale = true; } }
      if (current === generation && $('actionDialog').open) $('actionStatus').textContent = error.status === 409 ? error.message + ' Close this dialog, review the latest account details, then start the action again.' : error.message;
    } finally { if (current === generation) { busy = false; $('actionSubmit').disabled = !!(action && (action.stale || action.uncertain)); $('actionCancel').disabled = false; } }
  });
  async function checkSupportAction() {
    var body=pendingSupportAction;if(!body||busy||!session)return;var current=generation;busy=true;$('actionCheck').disabled=true;
    try{var result=await request('GET',undefined,'?c='+encodeURIComponent(body.slug));if(current!==generation)return;selected=body.slug;selectedRecord=result.customer;
      if(supportActionApplied(result.customer,body)){pendingSupportAction=null;await storeSupportAction(null);if(current!==generation)return;if($('actionDialog').open)$('actionDialog').close();action=null;renderPendingSupport();await loadData();if(current!==generation)return;await loadDetail(body.slug,false);focusSupportReport(body.reportId);toast('The support change is saved. The current report status is shown.');}
      else{renderDetail(false);if($('actionDialog').open && action){action.uncertain=false;$('actionSubmit').disabled=false;$('actionSubmit').textContent='Retry saved change';$('actionStatus').textContent='The saved result is not confirmed. Retry this exact change; the same request will be used.';}else{var report=array(result.customer.supportReports).find(function(row){return row.id===body.reportId;});if(!report)throw new Error('The report could not be found. Keep the saved change on hold.');
        action={name:body.action,slug:body.slug,expectedRevision:body.expectedRevision,operationId:body.operationId,reportId:body.reportId,expectedReportRevision:body.expectedReportRevision,savedBody:body};var copy=actionCopy[body.action];$('actionTitle').textContent=copy.title;$('actionDescription').textContent='Check the retained change on this report. A retry reuses the same request.';$('rulesFields').hidden=true;$('noteField').hidden=true;$('actionNote').required=false;$('resolutionField').hidden=body.action!=='resolve_report';$('actionResolution').required=body.action==='resolve_report';$('actionResolution').value=body.resolution||'';$('actionResolution').readOnly=true;$('actionReason').value=body.reason;$('actionReason').readOnly=true;$('actionCheck').hidden=false;$('actionSupportReference').hidden=false;$('actionSupportReference').textContent='Report '+report.reference;$('actionSubmit').textContent='Retry saved change';$('actionSubmit').disabled=false;$('actionCancel').disabled=false;$('actionStatus').textContent='The result is not confirmed. Retry this same saved change or check again.';$('actionDialog').showModal();$('actionTitle').setAttribute('tabindex','-1');$('actionTitle').focus();}}
    }catch(error){if(current!==generation||error.stale)return;if($('actionDialog').open)$('actionStatus').textContent=error.message;else toast(error.message);}
    finally{if(current===generation){busy=false;$('actionCheck').disabled=false;}}
  }
  function resumeSupportAction(){checkSupportAction();}
  $('actionCheck').addEventListener('click',checkSupportAction);
  function updateLoginControls() {
    var seconds = Math.max(0, Math.ceil((loginRetryAt - Date.now()) / 1000));
    $('requestLink').disabled = loginPending || seconds > 0;
    $('requestLink').textContent = loginPending ? 'Sending link…' : seconds ? 'Try again in ' + seconds + 's' : 'Email me a sign-in link';
    $('resendLink').disabled = loginPending || seconds > 0;
    $('resendLink').textContent = loginPending ? 'Sending link…' : seconds ? 'Resend in ' + seconds + 's' : 'Resend sign-in link';
    $('changeEmail').disabled = loginPending; $('adminEmail').disabled = loginPending;
    if (loginPending) $('login').setAttribute('aria-busy', 'true'); else $('login').removeAttribute('aria-busy');
    if (!seconds && loginRetryTimer) { clearInterval(loginRetryTimer); loginRetryTimer = null; }
  }
  function startLoginCooldown() {
    loginRetryAt = Date.now() + 30000;
    if (loginRetryTimer) clearInterval(loginRetryTimer);
    loginRetryTimer = setInterval(updateLoginControls, 250); updateLoginControls();
  }
  function resetLoginEmail() {
    if (loginRetryTimer) clearInterval(loginRetryTimer);
    loginRetryTimer = null; loginPending = false; loginRetryAt = 0; loginRecipient = '';
    $('loginConfirmation').hidden = true; $('loginRecipient').textContent = ''; $('loginDeliveryHelp').textContent = '';
    $('loginTitle').textContent = 'Welcome back.';
    $('loginIntro').textContent = 'Sign in to manage customers, follow their setup and resolve issues.';
    $('loginStatus').classList.remove('login-announcement');
    updateLoginControls();
  }
  function showOperatorRecovery(error) {
    resetLoginEmail();
    if (session) {
      $('loginForm').hidden = true; $('verifyPanel').hidden = false;
      $('loginTitle').textContent = 'Let’s open your operations portal';
      $('loginIntro').textContent = 'You’re signed in. Try opening the portal again without requesting another email.';
      $('verifyIntro').textContent = 'Your verified sign-in is kept in this browser.';
      $('verifyLink').textContent = 'Try opening the portal again';
    } else {
      verifyToken = null; $('verifyPanel').hidden = true; $('loginForm').hidden = false;
      $('loginTitle').textContent = error.status === 410 ? 'Request a fresh sign-in link' : 'Let’s get you signed in';
      $('loginIntro').textContent = 'Request a new email below to continue to your operations portal.';
      $('verifyIntro').textContent = 'Your sign-in link is ready. Continue to confirm access to this browser.';
      $('verifyLink').textContent = 'Continue securely';
    }
    $('loginStatus').textContent = error.message || 'We couldn’t confirm access. Please try again.';
    $('loginTitle').focus();
  }
  function showLoginEmail(email, kind, message) {
    loginRecipient = email; $('loginForm').hidden = true; $('verifyPanel').hidden = true; $('loginConfirmation').hidden = false;
    $('loginTitle').textContent = kind === 'test_outbox' ? 'Your test link is ready' : kind === 'unknown' ? 'Check your inbox first' : 'Check your email';
    $('loginIntro').textContent = kind === 'email' ? 'Your secure sign-in link is on its way to' : kind === 'test_outbox' ? 'A sign-in link was saved in the local test inbox for' : kind === 'unknown' ? 'We couldn’t confirm the email request for' : 'If this address has operator access, a sign-in link will arrive shortly.';
    $('loginRecipient').textContent = email;
    $('loginDeliveryHelp').textContent = kind === 'test_outbox' ? 'No email was sent. Use the local test inbox to continue.' : kind === 'unknown' ? 'An email may still arrive. Check your inbox and spam folder before requesting another link.' : 'Open the email from Machines & Cloud to continue. The link expires in 20 minutes. Check your spam folder if you don’t see it.';
    $('loginStatus').textContent = message || '';
    $('loginStatus').classList.toggle('login-announcement', kind !== 'unknown');
    $('loginTitle').focus();
  }
  async function sendLoginEmail(email) {
    if (loginPending || Date.now() < loginRetryAt) return;
    var current = generation; loginPending = true; updateLoginControls(); $('loginStatus').classList.remove('login-announcement'); $('loginStatus').textContent = 'Preparing your sign-in email…';
    try {
      var result = await request('POST', { action: 'request_link', email: email });
      if (current !== generation) return;
      var deliveryKnown = ['email', 'test_outbox'].includes(result.delivery), conditional = result.delivery === undefined && typeof result.message === 'string' && !!result.message.trim();
      if (result.ok !== true || !deliveryKnown && !conditional) throw new Error('The email response could not be confirmed.');
      startLoginCooldown(); showLoginEmail(email, result.delivery || 'conditional', result.message);
    } catch (error) {
      if (current !== generation || error.stale) return;
      if (!error.status) { startLoginCooldown(); showLoginEmail(email, 'unknown', 'We couldn’t confirm whether the link was sent. Check your inbox first, then try again if needed.'); }
      else { $('loginStatus').textContent = error.message; $('loginStatus').focus(); }
    } finally { if (current === generation) { loginPending = false; updateLoginControls(); } }
  }
  $('loginStatus').setAttribute('tabindex', '-1');
  $('loginForm').addEventListener('submit', function (event) {
    event.preventDefault(); if (!$('loginForm').reportValidity() || $('requestLink').disabled || $('loginForm').hidden) return;
    sendLoginEmail($('adminEmail').value.trim());
  });
  $('resendLink').addEventListener('click', function () { if (!$('loginConfirmation').hidden && loginRecipient) sendLoginEmail(loginRecipient); });
  $('changeEmail').addEventListener('click', function () {
    if (loginPending) return;
    resetLoginEmail(); $('loginForm').hidden = false; $('loginStatus').textContent = ''; $('adminEmail').focus(); $('adminEmail').select();
  });
  $('verifyLink').addEventListener('click', async function () {
    if ((!verifyToken && !session) || $('verifyLink').disabled) return;
    var current = generation; $('verifyLink').disabled = true; $('login').setAttribute('aria-busy', 'true'); $('loginStatus').textContent = session ? 'Opening your operations portal…' : 'Confirming operator access…';
    try {
      if (session) { await loadData(); return; }
      var result = await request('POST', { action: 'exchange', token: verifyToken }); if (current !== generation) return;
      if (!/^[a-f0-9]{64}$/.test(result.session || '')) throw new Error('Access could not be confirmed. Request a new sign-in link.');
      verifyToken = null; generation++; abortRequests(); setSession(result.session); $('verifyPanel').hidden = true; $('loginForm').hidden = false; await loadData();
    } catch (error) { if (!error.stale && $('login').hidden === false) showOperatorRecovery(error); }
    finally { $('verifyLink').disabled = false; $('login').removeAttribute('aria-busy'); }
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
