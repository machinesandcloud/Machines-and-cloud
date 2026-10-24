(function () {
  var card = document.getElementById('activityReport'); if (!card) return;
  var $ = function (id) { return document.getElementById(id); }, slug = new URLSearchParams(location.search).get('c');
  var active = false, generation = 0, controller = null, report = null, page = 0;
  var API_BASE = (document.querySelector('meta[name="mc-api-base"]')?.content || '').replace(/\/$/, '');
  function reset() { generation++; if (controller) controller.abort(); controller = null; report = null; page = 0; if ($('activityReportResults')) $('activityReportResults').hidden = true; if ($('activityReportMetrics')) $('activityReportMetrics').replaceChildren(); if ($('activityReportStatus')) $('activityReportStatus').textContent = ''; if ($('activityReportLoad')) $('activityReportLoad').disabled = false; card.setAttribute('aria-busy', 'false'); }
  function current(sequence) { return active && sequence === generation && card.isConnected; }
  function date(value) { return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)); }
  function work(focus) {
    var rows = report.attention.items.slice(page * 10, (page + 1) * 10), box = document.createElement('div');
    var heading = document.createElement('p'); heading.textContent = report.attention.total + ' need follow-up · ' + report.attention.overdue + ' overdue · Checked ' + new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(report.generatedAt)) + ' CT'; box.append(heading);
    rows.forEach(function (row) {
      var line = document.createElement('div'); line.className = 'activity-followup'; var text = document.createElement('div');
      var name = document.createElement('strong'); name.textContent = row.name; var detail = document.createElement('p'); detail.textContent = (row.urgent ? 'Urgent · ' : '') + (row.reviewRequired ? 'Updated request needs review. ' : '') + (row.nextAction || row.issue || 'Review this request') + (row.dueAt ? ' · Due ' + new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(row.dueAt)) + ' CT' : '');
      text.append(name, detail); var button = document.createElement('button'); button.type = 'button'; button.className = 'btn-pill btn-pill-dark btn-sm'; button.dataset.requestOpen = row.id; button.textContent = 'View request'; line.append(text, button); box.append(line);
    });
    if (!rows.length) { var empty = document.createElement('p'); empty.textContent = 'No requests need follow-up in the complete saved history checked.'; box.append(empty); }
    if (report.attention.total > 10) {
      var controls = document.createElement('div'); controls.className = 'activity-report-controls';
      var prev = document.createElement('button'), next = document.createElement('button'), position = document.createElement('span');
      prev.type = next.type = 'button'; prev.className = next.className = 'btn-pill btn-pill-dark btn-sm'; prev.textContent = 'Previous'; next.textContent = 'Next'; prev.disabled = page === 0; next.disabled = (page + 1) * 10 >= report.attention.total;
      position.textContent = (page * 10 + 1) + '–' + Math.min((page + 1) * 10, report.attention.total) + ' of ' + report.attention.total; position.setAttribute('role', 'status');
      prev.addEventListener('click', function () { page--; work('prev'); }); next.addEventListener('click', function () { page++; work('next'); }); controls.append(prev, position, next); box.append(controls);
    }
    $('needsYou').replaceChildren(box); addReviewButton();
    if (focus && prev && next) (focus === 'next' ? next.disabled ? prev : next : prev.disabled ? next : prev).focus();
    var metric = $('today').querySelector('div'); if (metric) { metric.replaceChildren(); var count = document.createElement('b'); count.textContent = report.attention.total; metric.append(count, ' Needs follow-up'); }
  }
  function addReviewButton() {
    if (!active || $('activityAllFollowups')) return;
    var button = document.createElement('button'); button.type = 'button'; button.id = 'activityAllFollowups'; button.className = 'btn-pill btn-pill-dark btn-sm'; button.textContent = 'Review all follow-ups';
    button.addEventListener('click', function () { load(); }); $('needsYou').append(button);
  }
  function valid(value) {
    return value?.version === 1 && value.complete === true && value.timeZone === 'America/Chicago' && [7,30,90].includes(value.period?.days) && ['from','until'].every(function(k){return Number.isFinite(Date.parse(value.period[k]));}) && Number.isFinite(Date.parse(value.generatedAt)) && ['inquiries','visitRequests','followupsCompleted','contactsMarkedReached'].every(function(k){return Number.isInteger(value.activity?.[k]) && value.activity[k] >= 0;}) && Array.isArray(value.attention?.items) && value.attention.total === value.attention.items.length && value.attention.total <= 2000 && Number.isInteger(value.attention.overdue) && value.attention.overdue >= 0 && value.attention.overdue <= value.attention.total && value.attention.items.every(function(row){return /^[a-zA-Z0-9_-]{1,80}$/.test(row.id) && typeof row.name === 'string' && (!row.dueAt || Number.isFinite(Date.parse(row.dueAt)));});
  }
  async function load() {
    if (!active || controller || !card.isConnected) return;
    var token; try { token = sessionStorage.getItem('mc-onboarding-session-v1'); } catch (error) { token = null; }
    if (!token) { document.dispatchEvent(new CustomEvent('mc:session-expired')); return; }
    var sequence = ++generation, days = Number($('activityReportDays').value); controller = new AbortController(); var current = controller;
    var timeout = setTimeout(function () { current.abort(); }, 25000);
    $('activityReportLoad').disabled = true; card.setAttribute('aria-busy', 'true'); $('activityReportStatus').textContent = 'Checking your saved activity and follow-ups…'; $('activityReportResults').hidden = true;
    try {
      var response = await fetch(API_BASE + '/api/client?c=' + encodeURIComponent(slug) + '&report=activity&days=' + days, { headers: { Authorization: 'Bearer ' + token }, signal: current.signal, cache: 'no-store' });
      if (!current(sequence)) return;
      if (response.status === 401 || response.status === 403) { document.dispatchEvent(new CustomEvent('mc:session-expired')); return; }
      var result = await response.json(); if (!current(sequence)) return;
      if (!response.ok || !result.ok || !valid(result.report) || result.report.period.days !== days) throw new Error(result.message || 'The complete report could not be checked. Please try again.');
      report = result.report; page = 0;
      $('activityReportPeriod').textContent = date(report.period.from) + '–' + date(report.period.until) + ' · Central time'; $('activityReportMetrics').replaceChildren();
      [['New inquiries','inquiries'],['Visit requests','visitRequests'],['Follow-ups completed','followupsCompleted'],['New inquiries marked reached','contactsMarkedReached']].forEach(function (metric) { var group = document.createElement('div'), label = document.createElement('dt'), value = document.createElement('dd'); label.textContent = metric[0]; value.textContent = report.activity[metric[1]]; group.append(label, value); $('activityReportMetrics').append(group); });
      $('activityReportExplanation').textContent = 'Visit requests are not confirmed arrivals. Contact and completion reflect actions recorded by your team. Follow-ups needing attention include older requests, outside this period.';
      $('activityReportResults').hidden = false; $('activityReportStatus').textContent = 'Updated ' + new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }).format(new Date(report.generatedAt)) + ' CT. Setup checks and spam are excluded.'; work();
    } catch (error) { if (current(sequence)) $('activityReportStatus').textContent = error.name === 'AbortError' ? 'The report took too long to check. Please try again.' : error.message; }
    finally { clearTimeout(timeout); if (sequence === generation) { controller = null; if (card.isConnected && $('activityReportLoad')) { $('activityReportLoad').disabled = false; card.setAttribute('aria-busy', 'false'); } } }
  }
  $('activityReportLoad').addEventListener('click', load);
  $('activityReportDays').addEventListener('change', reset);
  document.addEventListener('mc:desk', function (event) { reset(); active = card.isConnected && event.detail?.client?.onboarding?.version === 1 && event.detail.client.slug === slug; card.hidden = !active; addReviewButton(); });
  document.addEventListener('mc:session-expired', function () { active = false; reset(); card.hidden = true; });
})();
