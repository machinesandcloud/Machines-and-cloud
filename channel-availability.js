/* Channel availability for public pages. The HTML ships the conservative state
 * (gated services "Setup with our team"); this script replaces it with the
 * server's current projection from /api/channel-availability, which reads the
 * same gates the service workers enforce. Any failure keeps the shipped text,
 * so a page never claims more than the platform can deliver. */
(function () {
  'use strict';
  var IDS = ['web', 'voice', 'sms', 'calendar', 'thumbtack', 'angi'], STATES = ['available', 'team_setup'];
  function valid(view) {
    if (!view || view.version !== 1 || !Array.isArray(view.channels)) return null;
    var out = {};
    for (var i = 0; i < view.channels.length; i++) {
      var row = view.channels[i];
      if (!row || IDS.indexOf(row.id) < 0 || STATES.indexOf(row.state) < 0 || typeof row.status !== 'string' || typeof row.note !== 'string' || typeof row.detail !== 'string' || row.status.length > 60 || row.note.length > 200 || row.detail.length > 300) return null;
      out[row.id] = row;
    }
    return IDS.every(function (id) { return out[id]; }) ? out : null;
  }
  function apply(byId) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-channel-status]'), function (node) { var row = byId[node.getAttribute('data-channel-status')]; if (!row) return; node.textContent = row.status; node.setAttribute('data-state', row.state); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-channel-note]'), function (node) { var row = byId[node.getAttribute('data-channel-note')]; if (!row) return; node.textContent = row.note; node.hidden = !row.note; });
    Array.prototype.forEach.call(document.querySelectorAll('[data-channel-detail]'), function (node) { var row = byId[node.getAttribute('data-channel-detail')]; if (row) node.textContent = row.detail; });
    window.MCChannelAvailability = byId;
    document.dispatchEvent(new CustomEvent('mc:channel-availability', { detail: byId }));
  }
  if (!document.querySelector('[data-channel-status],[data-channel-note],[data-channel-detail],[data-channel-availability-consumer]') || typeof fetch !== 'function') return;
  var controller = typeof AbortController === 'function' ? new AbortController() : null, timer = setTimeout(function () { if (controller) controller.abort(); }, 8000);
  fetch('/api/channel-availability', { credentials: 'omit', headers: { Accept: 'application/json' }, signal: controller ? controller.signal : undefined })
    .then(function (response) { return response.ok ? response.json() : null; })
    .then(function (view) { var byId = valid(view); if (byId) apply(byId); })
    .catch(function () { /* Keep the shipped conservative availability. */ })
    .then(function () { clearTimeout(timer); });
})();
