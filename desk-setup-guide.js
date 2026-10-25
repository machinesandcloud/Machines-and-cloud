(function () {
  'use strict';
  var host = document.getElementById('setupGuide');
  if (!host) return;
  var data = null, selected = null, manualSelection = false;
  var labels = { web: 'Website chat', voice: 'Phone answering', sms: 'Text messaging', calendar: 'Google Calendar', thumbtack: 'Thumbtack', angi: 'Angi' };
  var $ = function (id) { return document.getElementById(id); };
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function current() { return data && document.body.dataset.workspaceState === 'ready' && !$('portalContent').hidden; }
  function rows() {
    var journey = data && data.setup && data.setup.connectionJourney;
    return journey ? (journey.channels || []).concat(journey.leadSources || []).filter(function (row) { return labels[row.id]; }) : [];
  }
  function action(row) { return row.nextAction || row.action || { kind: 'wait', label: 'Checking setup status' }; }
  function chooseDefault(items) {
    var next = data.setup.connectionJourney.nextAction;
    var row = next && next.kind !== 'wait' && items.find(function (item) { var own=action(item);return (item.requested||item.retained)&&own.kind===next.kind&&own.target===next.target&&own.label===next.label; });
    return row || items.find(function (item) { return (item.requested || item.retained) && ['route', 'connection', 'lead'].includes(action(item).kind); }) || items.find(function (item) { return item.requested || item.retained; }) || items[0];
  }
  function render() {
    if (!current()) return;
    var items = rows();
    if (!items.length) { host.hidden = true; return; }
    var row = manualSelection && items.find(function (item) { return item.id === selected; }) || chooseDefault(items);
    selected = row.id;
    var guide = row.guide || {}, next = action(row), closed = ['cancelled', 'archived', 'paused'].includes(data.client.status);
    var steps = Array.isArray(guide.steps) ? guide.steps : [];
    var focused = host.contains(document.activeElement) ? document.activeElement.dataset.guideService || document.activeElement.id : null;
    host.hidden = false;
    host.innerHTML = '<div class="setup-guide-heading"><div><p class="ui-eyebrow">LET’S GET YOU CONNECTED</p><h3 id="setupGuideTitle">Your next step, made clear.</h3><p class="muted">' + esc(data.setup.connectionJourney.summary || 'Choose a service for its next step. Your saved business details carry across your front desk.') + '</p></div></div>' +
      '<nav class="setup-guide-services" aria-label="Choose a service to set up">' + items.map(function (item) { return '<button type="button" class="setup-guide-service" data-guide-service="' + item.id + '" aria-pressed="' + (item.id === selected) + '">' + esc(labels[item.id]) + '</button>'; }).join('') + '</nav>' +
      '<section class="setup-guide-current" aria-labelledby="setupGuideServiceTitle"><div class="setup-guide-current-heading"><span class="setup-guide-icon" aria-hidden="true">' + (row.id === 'voice' ? '↗' : row.id === 'calendar' ? '▦' : '↔') + '</span><div><h4 id="setupGuideServiceTitle">' + esc(labels[row.id]) + '</h4><p>' + esc(guide.overview || row.nextStep || row.detail || row.reason || 'Your saved connection status is shown below.') + '</p></div></div>' +
      (steps.length ? '<details class="setup-guide-step-details"><summary>See setup stages</summary><ol class="setup-guide-steps">' + steps.map(function (step, i) { return '<li data-step-state="' + esc(step.state) + '"' + (step.state === 'current' ? ' aria-current="step"' : '') + '><span class="setup-guide-number" aria-hidden="true">' + (step.state === 'complete' ? '✓' : i + 1) + '</span><div><strong>' + esc(step.label) + '</strong><span class="setup-guide-owner">' + esc(step.actor === 'customer' ? 'Your part' : step.actor === 'provider' ? 'Provider check' : 'Handled for you') + '</span><p>' + esc(step.detail) + '</p></div></li>'; }).join('') + '</ol></details>' : '') +
      (guide.automationSummary ? '<p class="setup-guide-automation"><span aria-hidden="true">↻</span> ' + esc(guide.automationSummary) + '</p>' : '') +
      '<div class="setup-guide-actions">' + (!closed && next.kind !== 'wait' ? '<button type="button" class="btn-pill btn-pill-blue btn-sm" id="setupGuideContinue">' + esc(next.label || 'Continue setup') + '</button>' : '<p class="setup-guide-wait" role="status">' + esc(closed ? 'Your saved setup is retained. Check Account to manage your service.' : next.label || row.nextStep || 'Setup is continuing in the background.') + '</p>') + '<button type="button" class="btn-pill btn-pill-dark btn-sm" id="setupGuideTutorial">Walk me through it</button></div></section>';
    if (focused) {
      var replacement = labels[focused] ? host.querySelector('[data-guide-service="' + focused + '"]') : $(focused);
      if (replacement && host.contains(replacement)) replacement.focus({ preventScroll: true });
    }
  }
  host.addEventListener('click', function (event) {
    if (!current()) return;
    var service = event.target.closest('[data-guide-service]');
    if (service && labels[service.dataset.guideService]) { selected = service.dataset.guideService; manualSelection = true; render(); return; }
    var row = rows().find(function (item) { return item.id === selected; });
    if (!row) return;
    if (event.target.closest('#setupGuideTutorial')) {
      document.dispatchEvent(new CustomEvent('mc:service-guide', { detail: { service: selected } })); return;
    }
    if (!event.target.closest('#setupGuideContinue') || ['cancelled', 'archived', 'paused'].includes(data.client.status)) return;
    var next = action(row);
    if (next.kind === 'lead' && ['thumbtack', 'angi'].includes(next.target)) {
      document.dispatchEvent(new CustomEvent('mc:lead-source-open', { detail: { source: next.target } })); return;
    }
    var card = $('connection-guide-' + selected), existing = card && Array.from(card.querySelectorAll('button')).find(function (button) {
      return !button.disabled && (next.kind === 'route' ? button.dataset.journeyRoute === next.target : next.kind === 'connection' && button.dataset.connection === next.target);
    });
    if (!existing && next.kind === 'connection') existing = Array.from(document.querySelectorAll('#connectionJourney [data-connection]')).find(function (button) { return button.dataset.connection === next.target && !button.disabled; });
    if (existing) { existing.click(); return; }
    if (next.kind === 'route' && ['know', 'test', 'setup', 'leads', 'availability'].includes(next.target)) document.dispatchEvent(new CustomEvent('mc:desk-route', { detail: { tab: next.target } }));
  });
  document.addEventListener('mc:desk', function (event) { data = event.detail; render(); });
  document.addEventListener('mc:session-expired', function () { data = null; selected = null; manualSelection = false; host.replaceChildren(); host.hidden = true; });
  if ($('deskSignOut')) $('deskSignOut').addEventListener('click', function () { data = null; selected = null; manualSelection = false; host.replaceChildren(); host.hidden = true; });
})();
