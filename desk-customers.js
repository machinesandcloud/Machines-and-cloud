(function () {
  'use strict';
  // Customers (PRA-DESK-08): a read-only view of the requests, visits and conversations already loaded in the
  // workspace, grouped by phone number the same way as the customers CSV export. Nothing here writes or fetches.
  var $ = function (id) { return document.getElementById(id); }, list = $('customerList');
  if (!list) return;
  var data = null, customers = [], LIMIT = 50;
  // The owner GET returns the latest 100 requests and 100 visits (client.mjs listWorkspaceRecords); this view searches only those (PRA-DESK-08).
  var SCOPE = 'Searches your most recent 100 requests and 100 visits, grouped by phone number. Read only.';
  var word = window.MCOwnerWords ? window.MCOwnerWords.word : function (value) { return String(value || '').replace(/_/g, ' '); };
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function phoneText(value) { var m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(value || ''); return m ? '(' + m[1] + ') ' + m[2] + '-' + m[3] : String(value || ''); }
  function digits(value) { return String(value || '').replace(/\D/g, ''); }
  function fold(value) { return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function day(value) { var date = new Date(value); return value && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric' }).format(date) : ''; }
  function visitDay(value) { if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return value || 'Date not set'; return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value + 'T12:00:00Z')); }
  function selfService() { return !!(data && data.client && data.client.onboarding && data.client.onboarding.version === 1); }
  function requestStatus(lead) {
    var follow = lead.followthrough, state = follow && follow.state || {};
    if (follow) return follow.reviewRequired ? 'Review updated request' : state.completedAt ? 'Follow-up complete' : follow.due ? 'Follow-up due' : ({ not_recorded: 'Not contacted yet', attempted: 'Contact attempted', reached: 'Customer reached' })[state.contact] || 'Needs follow-up';
    return word(lead.status) || 'Saved';
  }
  function visitStatus(visit) {
    if (visit.status === 'booked' && selfService() && ['web', 'sms', 'call', 'voice'].indexOf(visit.channel) >= 0) return 'Visit requested';
    return word(visit.status) || 'Saved visit';
  }
  // Same grouping rule as export=customers: records with a phone, no website setup checks, no spam.
  function build(d) {
    var byPhone = {}, rows = [];
    (d.leads || []).forEach(function (lead) { if (lead.status !== 'spam' && !lead.simulation) rows.push({ kind: 'request', row: lead }); });
    (d.bookings || []).forEach(function (visit) { if (!visit.ownerVisitCreationAborted && !visit.simulation) rows.push({ kind: 'visit', row: visit }); });
    rows.sort(function (a, b) { return String(a.row.createdAt || '').localeCompare(String(b.row.createdAt || '')); }).forEach(function (item) {
      var r = item.row; if (!r.phone || r.websiteSetupCheck) return;
      var c = byPhone[r.phone] || (byPhone[r.phone] = { phone: r.phone, name: '', address: '', requests: [], visits: [], conversations: [], last: '' });
      if (r.customer_name) c.name = r.customer_name;
      if (r.address && (item.kind === 'visit' || !c.address)) c.address = r.address;
      c[item.kind === 'visit' ? 'visits' : 'requests'].push(r);
      if (String(r.createdAt || '') > c.last) c.last = String(r.createdAt || '');
    });
    var out = Object.keys(byPhone).map(function (phone) { return byPhone[phone]; });
    out.forEach(function (c) {
      var contacts = c.requests.filter(function (lead) { return lead.contact; }).map(function (lead) { return lead.channel + '\n' + lead.contact; });
      c.conversations = (d.conversations || []).filter(function (v) { return v.contact === c.phone || contacts.indexOf(v.channel + '\n' + v.contact) >= 0; });
      c.requests.reverse(); c.visits.reverse();
    });
    return out.sort(function (a, b) { return b.last.localeCompare(a.last) || a.phone.localeCompare(b.phone); });
  }
  function matches(c, query) {
    var text = fold(query).trim(), number = digits(query), words = text.replace(/[\d()+.\-]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text) return true;
    var phoneHit = number.length >= 3 && (digits(c.phone).indexOf(number) >= 0 || digits(c.phone).slice(1).indexOf(number) >= 0);
    if (words && number.length >= 3) return fold(c.name).indexOf(words) >= 0 && phoneHit; // "Jordan 713" needs both
    if (words) return fold(c.name).indexOf(words) >= 0 || fold(c.name).indexOf(text) >= 0;
    return phoneHit;
  }
  function group(title, rows, render, empty) {
    return '<section><h5>' + esc(title) + ' (' + rows.length + ')</h5>' + (rows.length ? '<ul>' + rows.slice(0, 3).map(render).join('') + '</ul>' + (rows.length > 3 ? '<p class="muted">' + (rows.length - 3) + ' earlier not shown</p>' : '') : '<p class="muted">' + esc(empty) + '</p>') + '</section>';
  }
  function card(c) {
    var own = selfService();
    var requests = group('Requests', c.requests, function (lead) { return '<li><strong>' + esc(lead.issue || 'Customer request') + '</strong><br><span class="muted">' + esc(day(lead.createdAt)) + ' · ' + esc(requestStatus(lead)) + '</span>' + (own && lead.followthrough ? '<br><button type="button" class="btn-pill btn-pill-dark btn-sm" data-request-open="' + esc(lead.id) + '">View request</button>' : '') + '</li>'; }, 'No saved requests');
    var visits = group('Visits', c.visits, function (visit) { return '<li><strong>' + esc(visitDay(visit.date) + (visit.window ? ', ' + visit.window : '')) + '</strong><br><span class="muted">' + esc(visit.issue || '') + (visit.issue ? ' · ' : '') + esc(visitStatus(visit)) + '</span>' + (own && visit.ownerVisit ? '<br><button type="button" class="btn-pill btn-pill-dark btn-sm" data-customer-visit="' + esc(visit.id) + '">View visit</button>' : '') + '</li>'; }, 'No saved visits');
    var conversations = group('Conversations', c.conversations, function (v) { return '<li><strong>' + esc(word(v.channel)) + '</strong><br><span class="muted">Last message ' + esc(day(v.updatedAt)) + '</span>' + (v.reference ? '<br><button type="button" class="btn-pill btn-pill-dark btn-sm" data-conversation-open="' + esc(v.reference) + '" data-conversation-contact="' + esc(v.contact) + '">Read saved conversation</button>' : '') + '</li>'; }, 'No recent conversations');
    var tel = /^\+1\d{10}$/.test(c.phone) ? '<a href="tel:' + esc(c.phone) + '">' + esc(phoneText(c.phone)) + '</a>' : esc(c.phone);
    return '<article class="desk-customer" role="listitem" data-customer-phone="' + esc(c.phone) + '"><h4>' + esc(c.name || phoneText(c.phone)) + '</h4><div class="desk-customer-contact">' + tel + (c.address ? '<span>' + esc(c.address) + '</span>' : '') + '</div><div class="desk-customer-groups">' + requests + visits + conversations + '</div></article>';
  }
  function render() {
    var query = $('customerSearch').value, shown = customers.filter(function (c) { return matches(c, query); });
    var incomplete = !!(data && data.recordListing && ['bookings', 'leads'].some(function (kind) { return data.recordListing[kind] && data.recordListing[kind].incomplete; }));
    $('customerCount').textContent = customers.length + (incomplete ? ' shown' : '');
    list.innerHTML = shown.length ? shown.slice(0, LIMIT).map(card).join('') : '<div class="desk-empty"><div><strong>' + esc(customers.length ? 'No customer matches “' + query.trim() + '”' + ' in your most recent 100 requests and 100 visits' : 'No customers yet') + '</strong><p>' + esc(customers.length ? 'Only your most recent 100 requests and 100 visits are searched here, so an earlier customer may not appear. Search by part of a name or at least three digits of a phone number.' : 'Customers appear here after a request or visit with a phone number is saved.') + '</p></div></div>';
    $('customerSearchStatus').textContent = query.trim() ? shown.length + ' customer' + (shown.length === 1 ? '' : 's') + ' found' + (shown.length > LIMIT ? '. Showing the first ' + LIMIT + '.' : '.') : shown.length > LIMIT ? 'Showing the ' + LIMIT + ' most recent customers. Search to find others.' : '';
    $('customersIntro').textContent = SCOPE + (incomplete ? ' Older history is not searched, so earlier customers may be missing.' : '');
  }
  document.addEventListener('mc:desk', function (event) { data = event.detail || null; if (!data) return; customers = build(data); render(); });
  document.addEventListener('mc:session-expired', function () { data = null; customers = []; list.replaceChildren(); var search = $('customerSearch'), status = $('customerSearchStatus'); if (search) search.value = ''; if (status) status.textContent = ''; }); // desk.js clears #portalContent on expiry first, so these may already be gone (RC2-D1)
  $('customerSearch').addEventListener('input', render);
  list.addEventListener('click', function (event) { var button = event.target.closest('[data-customer-visit]'); if (button) document.dispatchEvent(new CustomEvent('mc:schedule-open-visit', { detail: { id: button.dataset.customerVisit } })); });
})();
