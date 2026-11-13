(function () {
  var API_BASE = (function () { var m = document.querySelector('meta[name="mc-api-base"]'); return (m && m.content) ? m.content.replace(/\/$/, '') : ''; })();
  var form = document.getElementById('ob'), steps = [].slice.call(form.querySelectorAll('fieldset')), pills = [].slice.call(document.querySelectorAll('.ob-steps span'));
  var i = 0, back = document.getElementById('back'), next = document.getElementById('next'), err = document.getElementById('err');
  var q = new URLSearchParams(location.search);
  var PLAN_IDS = ['starter', 'growth'], retiredPlanHint = false;
  function selectPlan(plan) {
    var selected = PLAN_IDS.indexOf(plan) >= 0 ? plan : 'growth';
    retiredPlanHint = plan === 'pro';
    form.querySelectorAll('input[name=plan]').forEach(function (field) { field.checked = field.value === selected; });
    var note = document.getElementById('plan-preference-note');
    if (note) { note.hidden = plan !== 'pro'; note.textContent = plan === 'pro' ? 'Choose Coverage or Follow-through below, or talk with us about Enterprise. Your selection saves a preference; you’ll review any paid service before it starts.' : ''; }
    var preferences = document.getElementById('plan-email-preferences'); if (preferences && plan === 'pro') preferences.open = true;
    form.querySelectorAll('.plans-pick label').forEach(function (label) { label.classList.toggle('on', label.querySelector('input').checked); });
  }
  function choosePlan() { selectPlan(new URLSearchParams(location.search).get('plan')); }
  choosePlan();
  // Emergency tiers prefilled by trade (same table as the server); the owner can edit every line.
  var T0 = 'Gas smell\nCarbon monoxide alarm\nSmoke or fire\nSparks or a burning smell from the panel or an outlet\nSewage flooding a living space';
  var T1 = { hvac: 'No cooling when the forecast high is 90°F or more\nNo cooling with an infant, elderly, or medically dependent person in the home\nNo heat when it is at or below freezing outside\nWater pouring from the air handler', plumbing: 'Uncontrolled water (a burst pipe, a leak that will not stop)\nNo water in the house\nSewage backup\nLeaking water heater\nNo hot water with an infant, elderly, or medically dependent person in the home', electrical: "Loss of power from the home's own system, not a utility outage\nA hot outlet, switch, or breaker\nPartial power or flickering across the house\nExposed or damaged wiring", roofing: 'Active leak during rain\nStorm or tree damage with the interior exposed\nTarping after hail or wind', cleaning: '', other: '' };
  function tradeKey(t) { t = (t || '').toLowerCase(); return /\b(?:hvac|air|cool(?:ing)?|heat(?:ing)?|a\/c|ac)\b/.test(t) ? 'hvac' : /plumb|drain|water heater|sewer/.test(t) ? 'plumbing' : /electr/.test(t) ? 'electrical' : /roof/.test(t) ? 'roofing' : /clean|maid|janitor/.test(t) ? 'cleaning' : 'other'; }
  var t0 = form.elements['tier0'], t1 = form.elements['tier1'], touched = { t0: false, t1: false };
  t0.addEventListener('input', function () { touched.t0 = true; }); t1.addEventListener('input', function () { touched.t1 = true; });
  var tradeSelect = form.elements.trade, customTrade = form.elements.customTrade, customTradeGroup = document.getElementById('custom-trade-group');
  function effectiveTrade() { return tradeSelect.value === 'other' ? customTrade.value.trim() : tradeSelect.value; }
  function fillTiers() { if (!touched.t0) t0.value = T0; if (!touched.t1) t1.value = T1[tradeKey(effectiveTrade())] || ''; }
  function updateTrade(focusCustom) {
    var other = tradeSelect.value === 'other';
    customTradeGroup.hidden = !other; customTrade.disabled = !other; customTrade.required = other;
    if (!other) { setFieldError(customTrade, ''); if (!steps[i].querySelector('[aria-invalid="true"]')) setErrorSummary(''); }
    fillTiers();
    if (other && focusCustom) customTrade.focus();
  }
  function restoreTrade(value) {
    value = typeof value === 'string' ? value : '';
    var preset = Array.from(tradeSelect.options).some(function (option) { return option.value && option.value !== 'other' && option.value === value; });
    tradeSelect.value = preset ? value : value ? 'other' : '';
    customTrade.value = preset ? '' : value;
    updateTrade(false);
  }
  tradeSelect.addEventListener('change', function () { updateTrade(true); });
  customTrade.addEventListener('input', fillTiers); customTrade.addEventListener('blur', fillTiers); updateTrade(false);
  // Structured hours: seven rows, prefilled from the hours sentence (same parser as the server, simplified).
  var DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], DI = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  function clock(str, isClose) { var m = String(str).trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/i); if (!m) return null; var h = +m[1], mi = +(m[2] || 0), ap = (m[3] || '').toLowerCase(); if (ap.charAt(0) === 'p' && h < 12) h += 12; else if (ap.charAt(0) === 'a' && h === 12) h = 0; else if (!ap) { if (isClose && h <= 9) h += 12; else if (!isClose && h < 5) h += 12; } return (h < 10 ? '0' : '') + h + ':' + (mi < 10 ? '0' : '') + mi; }
  function parseHours(str) { var out = {}, any = false; if (/^\s*(?:24\s*[/x]\s*7|24\s*hours)(?:\s*(?:a day|daily|every day))?\s*$/i.test(String(str || ''))) { DAYS.forEach(function (day) { out[day] = { open: '00:00', close: '24:00' }; }); return out; } String(str || '').split(/[,;\n]+/).forEach(function (part) { var t = part.trim().toLowerCase().replace(/\./g, ''); var dm = t.match(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*(?:\s*(?:to|-|–|through|thru)\s*(mon|tue|wed|thu|fri|sat|sun)[a-z]*)?\s*:?\s*(.*)$/); if (!dm) return; var a = DI[dm[1]], b = dm[2] ? DI[dm[2]] : a, days = [], i = a; for (var k = 0; k < 7; k++) { days.push(DAYS[(i + 6) % 7]); if (i === b) break; i = (i + 1) % 7; } if (/closed/.test(dm[3])) { days.forEach(function (d) { out[d] = null; }); any = true; return; } var tm = dm[3].match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm|a|p)?)\s*(?:to|-|–|until)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm|a|p)?)/); if (!tm) return; var o = clock(tm[1], false), c = clock(tm[2], true); if (!o || !c) return; days.forEach(function (d) { out[d] = { open: o, close: c }; }); any = true; }); if (!any) return null; DAYS.forEach(function (d) { if (out[d] === undefined) out[d] = null; }); return out; }
  var hoursRows = document.getElementById('hoursRows'), hoursTouched = false;
  hoursRows.innerHTML = DAYS.map(function (d) { var day = d.charAt(0).toUpperCase() + d.slice(1); return '<div class="hours-row"><span>' + day + '</span><input type="time" aria-label="' + day + ' opening time" data-d="' + d + '" data-k="open"><span>to</span><input type="time" aria-label="' + day + ' closing time" data-d="' + d + '" data-k="close"></div>'; }).join('');
  hoursRows.addEventListener('input', function () { hoursTouched = true; if (!form.elements.hours.value.trim()) form.elements.hours.value = 'Custom weekly hours'; });
  function fillBusinessTable(table) { hoursRows.querySelectorAll('input').forEach(function (field) { var value = table && table[field.dataset.d]?.[field.dataset.k] || ''; field.value = value === '24:00' && field.dataset.k === 'close' ? '00:00' : value; }); }
  function fillHours() { if (!hoursTouched) fillBusinessTable(parseHours(form.elements.hours.value)); }
  form.elements['hours'].addEventListener('input', fillHours); form.elements['hours'].addEventListener('blur', fillHours);
  function hoursTable() { var t = {}; DAYS.forEach(function (d) { var o = hoursRows.querySelector('input[data-d="' + d + '"][data-k="open"]').value, c = hoursRows.querySelector('input[data-d="' + d + '"][data-k="close"]').value; t[d] = o && c ? { open: o, close: c === '00:00' ? '24:00' : c } : null; }); return t; }
  // A saved table is the owner's own edit only when it differs from what the hours text produces. An all-closed table next to
  // empty or unparsed text (an early autosave) matches; one next to text that opens days is an explicit choice to close them.
  function sameHours(a, b) { var close = function (row) { return row.close === '00:00' ? '24:00' : row.close; }; return DAYS.every(function (d) { var x = a && a[d] || null, y = b && b[d] || null; return !x === !y && (!x || x.open === y.open && close(x) === close(y)); }); }
  function customHours(table) { return !!table && typeof table === 'object' && !sameHours(table, parseHours(form.elements.hours.value)); }
  var appointmentMode = document.getElementById('appointmentHoursMode'), appointmentRows = document.getElementById('appointmentHoursRows'), appointmentSeeded = false;
  appointmentRows.innerHTML = DAYS.map(function (day) { var label = day.charAt(0).toUpperCase() + day.slice(1); return '<div class="hours-row"><span>' + label + '</span><input class="form-input" type="time" id="appointment-' + day + '-open" aria-label="' + label + ' appointment start time" data-d="' + day + '" data-k="open" disabled><span>to</span><input class="form-input" type="time" id="appointment-' + day + '-close" aria-label="' + label + ' appointment end time" data-d="' + day + '" data-k="close" disabled></div>'; }).join('');
  function readAppointmentTable() { var table = {}; DAYS.forEach(function (day) { var open = appointmentRows.querySelector('[data-d="' + day + '"][data-k="open"]').value, close = appointmentRows.querySelector('[data-d="' + day + '"][data-k="close"]').value.trim(); table[day] = open || close ? { open: open, close: open && close === '00:00' ? '24:00' : close } : null; }); return table; }
  function fillAppointmentTable(table) { appointmentRows.querySelectorAll('input').forEach(function (field) { var value = table && table[field.dataset.d]?.[field.dataset.k] || ''; field.value = value === '24:00' && field.dataset.k === 'close' ? '00:00' : value; }); }
  function appointmentTable() { return appointmentMode.value === 'custom' ? readAppointmentTable() : hoursTable(); }
  function appointmentClock(value) { if (value === '24:00' || value === '00:00') return 'midnight'; var parts = value.split(':'), hour = Number(parts[0]); return (hour % 12 || 12) + (parts[1] === '00' ? '' : ':' + parts[1]) + (hour < 12 ? 'am' : 'pm'); }
  function appointmentSummary() {
    var table = appointmentTable(), open = DAYS.filter(function (day) { return !!table[day]; }), groups = [];
    if (open.some(function (day) { var row = table[day]; return !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(row.open) || !/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/.test(row.close) || row.close <= row.open; })) { document.getElementById('appointmentHoursSummary').textContent = 'Finish both times for each appointment day, or leave both blank for no appointments.'; return; }
    DAYS.forEach(function (day, index) { var row = table[day], previous = groups[groups.length - 1]; if (!row) return; if (previous && previous.end === index - 1 && previous.open === row.open && previous.close === row.close) previous.end = index; else groups.push({ start: index, end: index, open: row.open, close: row.close }); });
    function label(index) { return DAYS[index].charAt(0).toUpperCase() + DAYS[index].slice(1); }
    var summary = groups.map(function (group) { return label(group.start) + (group.start === group.end ? '' : '–' + label(group.end)) + ', ' + (group.open === '00:00' && group.close === '24:00' ? '24 hours' : appointmentClock(group.open) + '–' + appointmentClock(group.close)); }).join('; ');
    document.getElementById('appointmentHoursSummary').textContent = !open.length ? (appointmentMode.value === 'custom' ? 'All days are closed for appointments. No visit windows will be offered.' : 'Add your business hours in the previous step. Visits will use those days and times.') : (appointmentMode.value === 'business' ? 'Using your business hours: ' : 'Appointments: ') + summary + '.' + (open.length < 7 ? ' Other days are unavailable.' : '');
  }
  function updateAppointmentHours(seed) {
    var custom = appointmentMode.value === 'custom';
    if (custom && seed && !appointmentSeeded) { fillAppointmentTable(hoursTable()); appointmentSeeded = true; }
    document.getElementById('appointmentHoursCustom').hidden = !custom;
    appointmentRows.querySelectorAll('input').forEach(function (field) { field.disabled = !custom; if (!custom) setFieldError(field, ''); });
    appointmentSummary();
  }
  appointmentMode.addEventListener('change', function () { updateAppointmentHours(true); });
  appointmentRows.addEventListener('input', function () { appointmentSeeded = true; appointmentSummary(); });
  hoursRows.addEventListener('input', appointmentSummary); form.elements.hours.addEventListener('input', appointmentSummary);
  function appointmentWindow(value) {
    var match = value.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?\s*(?:to|[-–—])\s*(\d{1,2})(?::(\d{2}))?\s*([ap]\.?m\.?)?$/);
    if (!match) return null;
    var parts = [[match[1], match[2], match[3]], [match[4], match[5], match[6]]];
    if (parts.some(function (part) { return Number(part[1] || 0) > 59 || (part[2] ? Number(part[0]) < 1 || Number(part[0]) > 12 : Number(part[0]) > 24 || Number(part[0]) === 24 && Number(part[1] || 0) !== 0); })) return null;
    function minutes(part) { return (part[2] ? Number(part[0]) % 12 + (/^p/.test(part[2]) ? 12 : 0) : Number(part[0])) * 60 + Number(part[1] || 0); }
    var start = minutes(parts[0]), end = minutes(parts[1]); if (!match[3] && start < 420) start += 720; if (!match[6] && end <= start) end += 720;
    var literalStart = !parts[0][2] && (parts[0][1] !== undefined || /^0\d$/.test(parts[0][0]) || Number(parts[0][0]) === 0) ? minutes(parts[0]) : start;
    var literalEnd = !parts[1][2] && (parts[1][1] !== undefined || /^0\d$/.test(parts[1][0]) || Number(parts[1][0]) === 0) ? minutes(parts[1]) : end;
    if (literalEnd === 0 && literalStart > 0) literalEnd = 1440;
    if (literalStart !== start || literalEnd !== end) return null;
    return start >= 0 && end > start && end <= 1440 ? [start, end] : null;
  }
  function clockMinutes(value) { var parts = value.split(':').map(Number); return parts[0] * 60 + parts[1]; }
  updateAppointmentHours(false);
  var fwdSel = form.elements['forwarding']; function fwdUI() { if (fwdSel && document.getElementById('transferRow')) document.getElementById('transferRow').style.display = fwdSel.value === 'all' ? 'grid' : 'none'; } if (fwdSel) fwdSel.addEventListener('change', fwdUI); fwdUI();
  form.querySelectorAll('.plans-pick input').forEach(function (r) { r.addEventListener('change', function () { selectPlan(r.value); }); });
  var accessGeneration = 0, session = null, revision = 0, lostSave = null, saving = null, saveAgain = false, dirty = false, restoring = false, saveTimer = null;
  var gate = document.getElementById('access-gate'), gateStatus = document.getElementById('access-status'), accessForm = document.getElementById('access-form');
  var accessEmail = document.getElementById('access-email'), accessSend = document.getElementById('access-send'), accessConfirmation = document.getElementById('access-confirmation');
  var accessResend = document.getElementById('access-resend'), accessChangeEmail = document.getElementById('access-change-email');
  var linkRequestPending = null, requestedEmail = '', emailState = '', resendNotBefore = 0, resendTimer = null;
  var draftStatus = document.getElementById('draft-status'), verifiedToken = new URLSearchParams(location.hash.slice(1)).get('verify');
  var storageKey = 'mc-onboarding-session-v1', keepKey = 'mc-keep-signed-in-v1', keepField = document.getElementById('access-keep');
  // A per-device preference, not a credential: it only chooses whether the next sign-in cookie outlives the browser.
  // The choice is bound to one sign-in: it is stamped when a link is requested, lasts only as long as that link (20 minutes),
  // and is consumed by the exchange, so a later person on a shared computer never inherits an earlier person's choice.
  var KEEP_WINDOW_MS = 20 * 60 * 1000;
  function keepSignedIn() { try { var until = Number(localStorage.getItem(keepKey)); if (until > Date.now() && until <= Date.now() + KEEP_WINDOW_MS) return true; localStorage.removeItem(keepKey); return false; } catch (error) { return false; } }
  function stampKeep() { try { if (keepField && keepField.checked) localStorage.setItem(keepKey, String(Date.now() + KEEP_WINDOW_MS)); else localStorage.removeItem(keepKey); } catch (error) { /* The default applies. */ } }
  function consumeKeep() { var keep = keepSignedIn(); try { localStorage.removeItem(keepKey); } catch (error) { /* Nothing secret is kept here. */ } return keep; }
  if (keepField) { keepField.checked = keepSignedIn(); keepField.addEventListener('change', stampKeep); }
  var intakeStorageKey = 'mc-signup-intake-v1', intakeToken = new URLSearchParams(location.hash.slice(1)).get('intake');
  var intakeNotice = document.getElementById('intake-notice'), intakeSaved = null;
  var marketingField = document.getElementById('setup-marketing'), marketingVersion = 0, marketingSavedVersion = 0;
  if (!/^[a-f0-9]{64}$/.test(intakeToken || '')) intakeToken = null;
  try {
    var storedIntake = JSON.parse(sessionStorage.getItem(intakeStorageKey) || 'null');
    if (storedIntake && /^[a-f0-9]{64}$/.test(storedIntake.handoff || '') && new Date(storedIntake.expiresAt).getTime() > Date.now()) {
      if (!intakeToken && !verifiedToken && q.get('signin') !== '1') intakeToken = storedIntake.handoff;
      if (intakeToken === storedIntake.handoff) intakeSaved = storedIntake;
    }
  } catch (error) { /* An opaque URL handoff still works without browser storage. */ }
  if (intakeToken) {
    intakeNotice.hidden = false; intakeNotice.textContent = 'Your business details are saved. Confirm your email to carry them into your setup.';
    document.getElementById('access-intro').textContent = 'We’ll email a secure link to the address you entered. Open it to continue with your saved details.';
    if (intakeSaved && typeof intakeSaved.email === 'string') document.getElementById('access-email').value = intakeSaved.email;
    else document.getElementById('access-intro').textContent = 'Enter the same email you used a moment ago. We’ll send a secure link to continue with your saved details.';
  }
  // A returning owner (the workspace's sign-in link sends mode=signin; the site's Sign in link sends signin=1) gets sign-in copy.
  // Only the words change: the same form sends the same request, and a link request saves and creates nothing.
  var returningOwner = !intakeToken && (q.get('mode') === 'signin' || q.get('signin') === '1'), accessSendLabel = returningOwner ? 'Email me a sign-in link' : accessSend.textContent;
  if (returningOwner) {
    document.getElementById('access-title').textContent = 'Sign in to your workspace';
    document.getElementById('access-intro').textContent = 'Enter the email you use for Machines & Cloud. We’ll send a secure link that opens your workspace, or your setup if you haven’t finished it. No password to remember.';
    accessSend.textContent = accessSendLabel;
  }
  // The top bar and page title follow the screen: sign-in wording while a returning owner's gate shows, setup wording once
  // the setup form or the finished workspace is on screen.
  var topbarLabel = document.querySelector('.onboard-topbar span'), setupTopbar = topbarLabel ? topbarLabel.textContent : '', setupDocTitle = document.title;
  function syncPageLabels() {
    var signingIn = returningOwner && ['questions', 'ready'].indexOf(document.body.dataset.setupState) < 0;
    if (topbarLabel) topbarLabel.textContent = signingIn ? 'Sign in to your workspace' : setupTopbar;
    document.title = signingIn ? 'Sign in to your workspace | Machines & Cloud' : setupDocTitle;
  }
  syncPageLabels();
  var initialAccessTitle = document.getElementById('access-title').textContent, initialAccessIntro = document.getElementById('access-intro').textContent;
  if (location.hash || ['email', 'name', 'phone', 'business'].some(function (key) { return q.has(key); })) {
    history.replaceState(null, '', location.pathname + (PLAN_IDS.indexOf(q.get('plan')) >= 0 ? '?plan=' + encodeURIComponent(q.get('plan')) : ''));
  }
  function setSession(value) {
    session = value;
    try { if (value) sessionStorage.setItem(storageKey, value); else sessionStorage.removeItem(storageKey); } catch (error) { /* In-memory sign-in still works if browser storage is disabled. */ }
  }
  function clearIntake() {
    intakeToken = null; intakeSaved = null;
    try { sessionStorage.removeItem(intakeStorageKey); } catch (error) { /* Preference storage is optional. */ }
  }
  function gateOnly(message) {
    gate.hidden = false; form.hidden = true; document.querySelector('.ob-steps').hidden = true;
    document.body.dataset.setupState = 'signin'; syncPageLabels();
    document.getElementById('access-signed-in').hidden = true; draftStatus.hidden = true;
    document.getElementById('done').classList.remove('on');
    gate.removeAttribute('aria-busy');
    if (message) gateStatus.textContent = message;
  }
  // A dropped or timed-out connection never shows the browser's own error text; callers word the next step.
  // A server reply that isn't JSON (such as a gateway page) is 'unavailable', not the owner's connection.
  function connectionError(error, unavailable) { var timedOut = !unavailable && !!error && error.name === 'AbortError', lost = new Error(unavailable ? 'Machines & Cloud couldn’t answer right now. Try again in a moment.' : timedOut ? 'Machines & Cloud took too long to answer. Check your connection and try again.' : 'We couldn’t reach Machines & Cloud. Check your connection and try again.'); lost.name = timedOut ? 'AbortError' : 'ConnectionError'; lost.code = unavailable ? 'unavailable' : 'connection'; return lost; }
  async function request(path, method, body) {
    var generation = accessGeneration, used = session;
    var headers = { 'Content-Type': 'application/json' }; if (session) headers.Authorization = 'Bearer ' + session;
    var controller = new AbortController(), timeout = setTimeout(function () { controller.abort(); }, 20000);
    try {
      var response; try { response = await fetch(API_BASE + path, { method: method || 'GET', headers: headers, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal }); } catch (error) { throw connectionError(error); }
      // A 401 for a handle this tab has since renewed (same owner, another tab) did nothing on the server; resend it once.
      // Only for this tab's own sign-in (generation) and only once (used !== session). This includes Sign out: one pressed
      // while the same owner signed in again elsewhere did nothing on the server, so it is resent and signs out the new
      // sign-in too. Every tab of the browser ends up signed out, which is what Sign out promises on a shared computer.
      if (response.status === 401 && used && session && used !== session && generation === accessGeneration) return request(path, method, body);
      if (response.status === 401) {
        var expired = new Error('Your sign-in expired. Request a new link; your saved answers are kept.'); expired.code = 'sign_in_required'; expired.status = 401;
        if (generation === accessGeneration) {
          accessGeneration++; clearTimeout(saveTimer); saveAgain = false;
          if (window.MCOwnerSession) window.MCOwnerSession.rejected(session);
          setSession(null); signInFailure(expired);
        }
        throw expired;
      }
      var data; try { data = await response.json(); } catch (error) { if (response.ok || response.status >= 500) throw connectionError(error, !response.ok); data = {}; }
      if (!response.ok) {
        var failure = new Error(data.message || (response.status < 500 ? 'Machines & Cloud didn’t accept that request. Check your details and try again.' : 'We could not confirm that request. Please try again.')); failure.code = data.error; failure.status = response.status; failure.data = data; failure.field = data.field; if (data.error === 'replace_confirm') { failure.current = data.current; failure.next = data.next; } throw failure;
      }
      return data;
    } finally { clearTimeout(timeout); }
  }
  function show(n, frame) {
    i = Math.max(0, Math.min(steps.length - 1, n));
    steps.forEach(function (step, k) { step.classList.toggle('on', k === i); });
    pills.forEach(function (pill, k) {
      var complete = k < i && Array.from(steps[k].querySelectorAll('.form-input')).every(function (field) { return !fieldMessage(field) && field.getAttribute('aria-invalid') !== 'true'; });
      pill.classList.toggle('on', k <= i); pill.dataset.stepState = complete ? 'complete' : k === i ? 'current' : 'upcoming'; pill.setAttribute('aria-current', k === i ? 'step' : 'false');
    });
    var contextTitle = document.getElementById('setup-context-title'), contextCopy = document.getElementById('setup-context-copy');
    if (contextTitle) contextTitle.textContent = steps[i].dataset.stepTitle || steps[i].querySelector('legend').textContent;
    if (contextCopy && steps[i].dataset.stepDescription) contextCopy.textContent = steps[i].dataset.stepDescription;
    var stepLabel = document.getElementById('onboard-step-label');
    if (stepLabel) stepLabel.textContent = 'Step ' + (i + 1) + ' of ' + steps.length;
    var progress=document.getElementById('onboardProgress');if(progress){progress.max=steps.length;progress.value=i+1;progress.textContent=(i+1)+' of '+steps.length;}
    back.style.visibility = i ? 'visible' : 'hidden'; next.textContent = i === steps.length - 1 ? 'Create my workspace' : 'Save and continue'; setErrorSummary('');
    if (frame) { window.scrollTo({ top: 0, behavior: 'instant' }); steps[i].querySelector('input,select,textarea')?.focus({ preventScroll: true }); }
    appointmentSummary();
  }
  var connectionDescriptions = {
    web: {label:'Website chat',summary:'First answers and clear customer requests',automation:'Use your services, fees and business details to answer website questions and gather customer requests.',owner:'Review the answers, try a customer question and add the chat to your website.',ready:'Complete the review, practice conversation and website check, then activate chat in your workspace.'},
    voice: {label:'Phone answering',summary:'Save your call-handling preferences',automation:'Your connection checklist covers an answering assistant, a front desk number and a backup call route.',owner:'Review the service and usage terms. Follow the forwarding instructions only when your workspace asks you to.',ready:'Your workspace shows the connection status and the test call needed before activation.'},
    sms: {label:'Text messaging',summary:'Plan your customer texting setup',automation:'Your connection checklist covers business registration, customer consent and carrier review.',owner:'Confirm your legal business details and opt-in process, review the costs and complete the setup text test.',ready:'Your workspace tracks approval and the two-way text check before texting is activated.'},
    calendar: {label:'Google Calendar',summary:'Save your calendar preference',automation:'Your connection checklist covers Google authorization and syncing saved visits.',owner:'Choose your Google account and review the requested calendar permissions.',ready:'Your workspace shows the connection status and the visit-sync check needed before use.',note:'Keep your workspace availability up to date, including jobs booked elsewhere.'}
  };
  // Availability comes from channel-availability.js (server gates); the HTML badge
  // state is the conservative fallback when that request has not completed.
  var teamSetupPreview = {
    voice: {save:'Your business number, phone provider and when you want calls answered.'},
    sms: {save:'Your texting preference. Registered business details are collected when texting is set up.'},
    calendar: {save:'Your Google Calendar preference. Google access is not requested now.'}
  };
  function channelState(id) {
    var live=window.MCChannelAvailability&&window.MCChannelAvailability[id];if(live)return live;
    var badge=form.querySelector('[data-channel-status="'+id+'"]'),available=!!badge&&badge.getAttribute('data-state')==='available';
    return {state:available?'available':'team_setup',status:badge?badge.textContent:'Setup with our team',note:available?'':'We’ll set this up with you; it is not live yet.'};
  }
  function teamSetup(id) { return channelState(id).state!=='available'; }
  function updateAvailabilityCopy() {
    var gated=['voice','sms','calendar'].filter(teamSetup),note=document.getElementById('connection-availability-note');
    if(note){var names=gated.map(function(id){return connectionDescriptions[id].label;});note.hidden=!names.length;note.textContent=names.length?(names.length>1?names.slice(0,-1).join(', ')+' and '+names[names.length-1]:names[0])+': choose '+(names.length>1?'them':'it')+' now to record your interest. '+channelState(gated[0]).note:'';}
    var hint=document.getElementById('business-number-hint');
    if(hint){if(!hint.dataset.defaultHint)hint.dataset.defaultHint=hint.textContent;hint.textContent=hint.dataset.defaultHint+(teamSetup('voice')?' Saved for your phone setup with our team. Nothing is forwarded or purchased now.':'');}
  }
  function updateConnectionPreview(changed) {
    var plan=document.getElementById('selected-connection-plan'),selected=Array.from(form.querySelectorAll('input[name="desiredChannels"]:checked')).map(function(field){return field.value;}),open=plan.querySelector('details[open]')?.dataset.channel;
    document.getElementById('connection-preview-count').textContent=selected.length+' option'+(selected.length===1?'':'s')+' selected';
    if(changed?.checked)open=changed.value;
    if(!selected.includes(open))open=selected[0];
    plan.innerHTML=selected.length?selected.map(function(id){var row=connectionDescriptions[id],gated=id!=='web'&&teamSetup(id),availability=channelState(id),head='<details class="connection-preview-card" data-channel="'+id+'" data-availability="'+(gated?'team_setup':'available')+'"'+(id===open?' open':'')+'><summary><strong class="brand-lockup">'+(id==='calendar'?'<img class="brand-mark" src="assets/brands/google-calendar.svg" width="24" height="24" alt="" aria-hidden="true">':'')+row.label+'</strong><span>'+(gated?escapeText(availability.status):row.summary)+'</span></summary>';
      if(gated)return head+'<dl><div><dt>Availability</dt><dd>'+escapeText(availability.status+'. '+availability.note)+'</dd></div><div><dt>What we save now</dt><dd>'+teamSetupPreview[id].save+'</dd></div><div><dt>What happens next</dt><dd>In your workspace, Connections lets you request setup with our team. Nothing is purchased, registered or connected during setup.</dd></div></dl></details>';
      return head+'<dl><div><dt>Your connection</dt><dd>'+row.automation+'</dd></div><div><dt>Your part</dt><dd>'+row.owner+'</dd></div><div><dt>Before activation</dt><dd>'+row.ready+'</dd></div></dl>'+(row.note?'<p class="connection-preview-note">'+row.note+'</p>':'')+'</details>';}).join(''):'<p class="connection-preview-empty">Choose what you’d like help with to see the next steps.</p>';
  }
  function updatePhoneSetup() {
    var section = document.getElementById('phone-routing-settings'), existing = document.getElementById('existing-phone-fields'), mode = form.elements.phoneSetupMode;
    if (!section || !existing || !mode) return;
    var wantsVoice = !!form.querySelector('input[name="desiredChannels"][value="voice"]:checked');
    var keepNumber = wantsVoice && mode.value === 'forward_business_line';
    section.hidden = !wantsVoice; existing.hidden = !keepNumber; mode.disabled = !wantsVoice;
    ['businessNumber', 'carrier', 'forwarding'].forEach(function (name) {
      var field = form.elements[name]; if (!field) return;
      field.disabled = !keepNumber;
      if (name === 'businessNumber') field.required = keepNumber;
      if (field.disabled) setFieldError(field, '');
    });
  }
  form.addEventListener('change', function(event){updatePhoneSetup();if(event.target.name==='desiredChannels')updateConnectionPreview(event.target);});
  function escapeText(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  document.addEventListener('mc:channel-availability',function(){updateAvailabilityCopy();updateConnectionPreview();});
  updatePhoneSetup(); updateAvailabilityCopy(); updateConnectionPreview();
  function collect() {
    document.getElementById('hoursTable').value = JSON.stringify(hoursTable());
    document.getElementById('appointmentHoursTable').value = appointmentSeeded ? JSON.stringify(readAppointmentTable()) : '';
    var fields = {}; new FormData(form).forEach(function (value, key) {
      if (key === 'botfield' || key === 'email') return;
      if (key === 'leadSources' || key === 'desiredChannels') (fields[key] = fields[key] || []).push(value); else fields[key] = value;
    });
    fields.trade = effectiveTrade(); delete fields.customTrade;
    if (!fields.leadSources) fields.leadSources = [];
    if (!fields.desiredChannels) fields.desiredChannels = [];
    return fields;
  }
  // The visible status follows every keystroke and save. Screen readers hear only a settled outcome, once, from #draft-announce.
  // A newer announcement always wins: a queued one is cancelled by the next, by a silent save starting, or by the error summary.
  // A success identical to the last thing announced adds nothing and is skipped; failures and other messages always speak.
  var draftAnnounce = document.getElementById('draft-announce'), announceTimer = null, lastAnnounced = '';
  function cancelAnnouncement() { clearTimeout(announceTimer); announceTimer = null; }
  function announceDraft(text, success) {
    if (!draftAnnounce) return;
    cancelAnnouncement();
    if (success && text === lastAnnounced) return;
    draftAnnounce.textContent = ''; announceTimer = setTimeout(function () { announceTimer = null; draftAnnounce.textContent = text; lastAnnounced = text; }, 100);
  }
  // options.silent: the caller moves on or reports the outcome itself. options.reportsFailure: the caller reports failures.
  async function saveDraft(options) {
    options = options || {};
    if (options.silent) cancelAnnouncement();
    clearTimeout(saveTimer);
    if (!session || restoring) return;
    if (saving) { saveAgain = true; await saving; if (dirty) return saveDraft(options); return; }
    var snapshot = collect(), step = i, generation = accessGeneration, preferenceVersion = marketingVersion;
    var saveBody = { fields: snapshot, step: step, revision: revision };
    if (preferenceVersion > marketingSavedVersion) saveBody.marketingConsent = marketingField.checked;
    draftStatus.textContent = 'Saving your answers…'; draftStatus.hidden = false;
    // A save whose reply was lost may still have landed. Adopt its revision only when the saved draft is exactly that save; any other change still meets the conflict check.
    var unconfirmed = lostSave, adopted = false, confirm = unconfirmed ? request('/api/access').then(function (state) { if (generation !== accessGeneration) return; lostSave = null; if (ownLostSave(state.draft, unconfirmed)) { revision = state.draft.revision; adopted = true; } saveBody.revision = revision; }) : Promise.resolve();
    // The lost save can also commit after the read above, so this save meets a 409 that no other tab caused. Read once more and
    // re-send once only when the stored draft is exactly that lost save. The PUT is conditional on the revision, so the re-send
    // can only replace our own lost save; if anything else wrote, it meets the conflict check and the conflict is shown.
    function lateOwnSave(error) {
      if (error.status !== 409 || !unconfirmed || adopted || generation !== accessGeneration) throw error;
      adopted = true;
      return request('/api/access').then(function (state) {
        if (generation !== accessGeneration) return;
        if (!ownLostSave(state.draft, unconfirmed)) throw error;
        revision = state.draft.revision; saveBody.revision = revision;
        return request('/api/access', 'PUT', saveBody);
      }, function (readError) { if (generation === accessGeneration && !lostSave) lostSave = unconfirmed; throw readError; });
    }
    var pending = confirm.then(function () { if (generation === accessGeneration) return request('/api/access', 'PUT', saveBody).catch(lateOwnSave); }).then(function (result) {
      if (generation !== accessGeneration) return;
      revision = result.draft.revision;
      if (!result.marketingPending && Object.prototype.hasOwnProperty.call(saveBody, 'marketingConsent')) marketingSavedVersion = preferenceVersion;
      dirty = JSON.stringify(collect()) !== JSON.stringify(snapshot) || i !== step || marketingVersion !== preferenceVersion;
      draftStatus.textContent = result.marketingPending ? 'Your answers are saved. Your email preference could not be confirmed; it will retry when you save or continue.' : 'Saved. You can leave and continue later.';
    }).catch(function (error) {
      if (generation !== accessGeneration) return; dirty = true;
      // A lost reply or a non-JSON server error leaves the outcome unknown; only a readable server answer is a definite failure.
      var unknown = error.code === 'connection' || error.code === 'unavailable'; if (unknown && !lostSave) lostSave = { fields: snapshot, step: step, revision: saveBody.revision };
      draftStatus.textContent = unknown ? 'We couldn’t confirm whether your changes were saved.' + (error.code === 'connection' ? ' Check your connection.' : '') + ' They’re still on this page.' : error.message + ' Your changes are still on this page.';
      if (!options.silent && !options.reportsFailure) announceDraft(draftStatus.textContent);
      throw error;
    });
    saving = pending;
    try { await pending; } finally { if (saving === pending) saving = null; }
    if (generation !== accessGeneration) return;
    if (saveAgain || dirty) { saveAgain = false; return saveDraft(options); }
    if (!options.silent) announceDraft(draftStatus.textContent, true);
  }
  function ownLostSave(draft, lost) { return !!draft && draft.revision === lost.revision + 1 && draft.step === lost.step && sameFields(draft.fields, lost.fields); }
  function sameFields(a, b) { var keys = Object.keys(a || {}); return keys.length === Object.keys(b || {}).length && keys.every(function (key) { return JSON.stringify(a[key]) === JSON.stringify(b[key]); }); }
  function scheduleSave() {
    if (!session || restoring) return;
    dirty = true; draftStatus.textContent = 'Changes not saved yet.'; clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { saveDraft().catch(function () {}); }, 700);
  }
  form.addEventListener('input', scheduleSave); form.addEventListener('change', scheduleSave);
  marketingField.addEventListener('change', function () { marketingVersion++; scheduleSave(); });
  function restore(fields) {
    restoring = true; hoursTouched = false;
    Object.keys(fields || {}).forEach(function (name) {
      if (name === 'plan' || name === 'trade') return; // Restore plan and trade choices with their dedicated controls.
      form.querySelectorAll('[name]').forEach(function (field) {
        if (field.name !== name) return;
        if (field.type === 'radio') field.checked = field.value === fields[name];
        else if (field.type === 'checkbox') field.checked = Array.isArray(fields[name]) && fields[name].indexOf(field.value) >= 0;
        else field.value = fields[name];
      });
    });
    var savedPlan = fields.plan;
    selectPlan(PLAN_IDS.indexOf(savedPlan) >= 0 || savedPlan === 'pro' ? savedPlan : retiredPlanHint ? 'pro' : form.elements.plan.value);
    if (fields.hoursTable) { try { var hours = JSON.parse(fields.hoursTable); hoursTouched = customHours(hours); if (hoursTouched) fillBusinessTable(hours); else fillHours(); } catch (error) { fillHours(); } } else fillHours();
    appointmentMode.value = fields.appointmentHoursMode === 'custom' ? 'custom' : 'business'; appointmentSeeded = false;
    if (fields.appointmentHoursTable) { try { fillAppointmentTable(JSON.parse(fields.appointmentHoursTable)); appointmentSeeded = true; } catch (error) { fillAppointmentTable(null); } } else fillAppointmentTable(null);
    updateAppointmentHours(appointmentMode.value === 'custom');
    touched.t0 = !!fields.tier0; touched.t1 = !!fields.tier1; restoreTrade(fields.trade); fillTiers(); fwdUI();
    form.querySelectorAll('.plans-pick label').forEach(function (label) { label.classList.toggle('on', label.querySelector('input').checked); });
    restoring = false; dirty = false;
    updatePhoneSetup(); updateConnectionPreview();
  }
  // Re-signup on an email whose workspace is stopped: offer to reopen that same workspace.
  // The server never creates a second one; reopening keeps saved records and answers.
  function stoppedWorkspace(info) {
    document.body.dataset.setupState = 'stopped'; syncPageLabels();
    form.hidden = true; document.querySelector('.ob-steps').hidden = true; draftStatus.hidden = true; gate.hidden = true;
    var done = document.getElementById('done'), title = document.getElementById('done-title'); done.classList.add('on');
    title.textContent = info.reopen && info.reopen.available ? 'Reopen your workspace' : 'Your workspace is stopped';
    document.getElementById('buildStatus').textContent = info.message || 'This email already has a stopped workspace.';
    var go = document.getElementById('goPortal'), link = document.getElementById('portalLink'), button = document.getElementById('reopenWorkspace');
    link.textContent = 'Open your stopped workspace'; link.href = info.portal || '/desk.html?c=' + encodeURIComponent(info.slug);
    go.hidden = true;
    if (info.reopen && info.reopen.available) {
      if (!button) { button = document.createElement('button'); button.type = 'button'; button.id = 'reopenWorkspace'; button.className = go.className || 'btn'; go.parentNode.insertBefore(button, go); }
      button.hidden = false; button.disabled = false; button.textContent = 'Reopen your workspace';
      button.onclick = async function () {
        button.disabled = true; button.textContent = 'Reopening…';
        try {
          var result = await request('/api/client?c=' + encodeURIComponent(info.slug), 'POST', { action: 'reopen_workspace', expectedRevision: info.reopen.configurationRevision });
          if (!result.ok || result.status !== 'testing') throw new Error('The reopen could not be confirmed. Open your workspace to check its status.');
          go.hidden = false; button.hidden = true;
          workspace(link.href, 'Your workspace is reopened with your saved records and answers. Review your business details and run a private test before turning service back on.');
        } catch (error) { button.disabled = false; button.textContent = 'Reopen your workspace'; document.getElementById('buildStatus').textContent = (error.message || 'The reopen could not be confirmed.') + ' Nothing new was created.'; }
      };
    } else { if (button) button.hidden = true; go.hidden = false; go.href = 'mailto:support@machinesandcloud.com'; go.textContent = 'Contact support'; }
    window.scrollTo({ top: 0, behavior: 'instant' }); title.focus({ preventScroll: true });
  }
  function workspace(portal, text) {
    document.body.dataset.setupState = 'ready'; syncPageLabels();
    form.hidden = true; document.querySelector('.ob-steps').hidden = true; draftStatus.hidden = true; gate.hidden = true;
    document.getElementById('done').classList.add('on');
    var doneTitle = document.getElementById('done-title'); doneTitle.textContent = 'Your workspace is ready';
    document.getElementById('buildStatus').textContent = text || 'Your business details are saved. Review your answers, try a private conversation and finish your selected connections.';
    document.getElementById('portalLink').textContent = 'Open your private workspace'; document.getElementById('portalLink').href = portal; document.getElementById('goPortal').href = portal;
    document.getElementById('goPortal').textContent = text ? 'Open my workspace' : 'Review my front desk';
    if (!text) { var connectionPortal=portal.split('#')[0]+'#setup';document.getElementById('goPortal').href=connectionPortal;document.getElementById('goPortal').textContent='Continue my connections';document.getElementById('buildStatus').textContent='Your answers are saved. Your selected connections are next, with a clear step for anything that needs your permission.';document.getElementById('portalLink').href=portal.split('#')[0]+'#today';document.getElementById('portalLink').textContent='Open workspace overview'; }
    // The focused Create button was just hidden; put keyboard and screen-reader users on the result.
    window.scrollTo({ top: 0, behavior: 'instant' }); doneTitle.focus({ preventScroll: true });
  }
  async function signedIn() {
    var generation = accessGeneration;
    var state = await request('/api/access');
    if (generation !== accessGeneration) return;
    if (intakeToken) {
      try {
        state = await request('/api/access', 'POST', { action: 'attach_intake', intake: intakeToken });
        if (generation !== accessGeneration) return;
        clearIntake(); intakeNotice.hidden = false; intakeNotice.textContent = 'Your business details are ready below.';
      } catch (error) {
        if (generation !== accessGeneration) return;
        signInFailure(error); accessForm.hidden = false;
        document.getElementById('access-title').textContent = 'Your saved details need attention';
        document.getElementById('access-intro').textContent = 'Your sign-in worked, but we couldn’t add the saved setup details. Try again, or request a link for the email you used when you started.';
        document.getElementById('access-identity').textContent = 'Signed in as ' + state.email;
        document.getElementById('access-signed-in').hidden = false;
        intakeNotice.hidden = false; intakeNotice.textContent = 'We couldn’t add the saved details to this account. If you started with another email, sign out and use that address. Your answers have not been replaced.';
        return;
      }
    }
    form.elements.email.value = state.email; form.elements.email.readOnly = true;
    document.getElementById('access-identity').textContent = 'Signed in as ' + state.email; document.getElementById('access-signed-in').hidden = false;
    gate.hidden = true;
    if (state.existing) { openExistingWorkspace(state.existing); return; }
    revision = state.draft.revision || 0; lostSave = null; restore(state.draft.fields || {});
    marketingField.checked = !!(state.marketing && state.marketing.preference === true); marketingVersion = 0; marketingSavedVersion = 0;
    form.hidden = false; document.querySelector('.ob-steps').hidden = false; draftStatus.hidden = false;
    document.body.dataset.setupState = 'questions'; syncPageLabels();
    draftStatus.textContent = revision ? 'Your saved answers have been restored.' : 'Your answers will save automatically.'; announceDraft(draftStatus.textContent); show(state.draft.step || 0, false);
    // The form opens in place of the gate (after a sign-in link or on a return visit). Tell keyboard and screen-reader owners
    // where they are by focusing the current step heading, unless they already put focus on something still on the page.
    var active = document.activeElement;
    if (!active || active === document.body || !active.getClientRects().length) document.getElementById('setup-context-title').focus();
  }
  function accessMessage(message, isError) {
    gateStatus.classList.remove('sr-only'); gateStatus.textContent = message || ''; if (isError) gateStatus.setAttribute('data-error', 'true'); else gateStatus.removeAttribute('data-error');
  }
  function updateEmailActions() {
    var seconds = Math.max(0, Math.ceil((resendNotBefore - Date.now()) / 1000));
    accessResend.disabled = !!linkRequestPending || seconds > 0;
    accessResend.textContent = linkRequestPending ? 'Sending link…' : seconds ? 'Resend in ' + seconds + 's' : 'Resend sign-in link';
    accessChangeEmail.disabled = !!linkRequestPending;
    if (!seconds && resendTimer) { clearInterval(resendTimer); resendTimer = null; }
  }
  function startResendWait() {
    clearInterval(resendTimer); resendNotBefore = Date.now() + 30000;
    resendTimer = setInterval(updateEmailActions, 1000); updateEmailActions();
  }
  function resetEmailConfirmation(restoreCopy) {
    clearInterval(resendTimer); resendTimer = null; resendNotBefore = 0; linkRequestPending = null; requestedEmail = ''; emailState = '';
    gate.removeAttribute('data-email-state'); gate.removeAttribute('aria-busy'); accessForm.removeAttribute('aria-busy');
    accessConfirmation.hidden = true; if (document.getElementById('access-replace')) document.getElementById('access-replace').hidden = true; accessForm.hidden = false; accessEmail.disabled = false; accessSend.disabled = false; accessSend.textContent = accessSendLabel;
    document.getElementById('access-title').removeAttribute('aria-describedby');
    document.getElementById('access-recipient').textContent = ''; gateStatus.removeAttribute('data-error'); gateStatus.classList.remove('sr-only'); updateEmailActions();
    if (restoreCopy) { document.getElementById('access-title').textContent = initialAccessTitle; document.getElementById('access-intro').textContent = initialAccessIntro; }
  }
  function showEmailConfirmation(email, state, message) {
    requestedEmail = email; emailState = state; gate.dataset.emailState = state; accessForm.hidden = true; accessConfirmation.hidden = false; verifyButton.hidden = true;
    document.getElementById('access-recipient').textContent = email;
    document.getElementById('access-title').textContent = state === 'email' ? 'Check your email' : state === 'test_outbox' ? 'Your test link is ready' : 'Check your inbox first';
    document.getElementById('access-intro').textContent = state === 'email' ? 'Your secure sign-in link is on its way to' : state === 'test_outbox' ? 'A local test link is ready for' : 'We couldn’t confirm whether a sign-in email was sent to';
    document.getElementById('access-delivery-help').textContent = state === 'email' ? 'Open the email from Machines & Cloud to continue. The link expires in 20 minutes.' : state === 'test_outbox' ? 'This preview uses a local test inbox. No email was sent.' : 'Check your inbox before requesting another link. If an email arrives, you can use it to continue.';
    accessMessage(message, state === 'unknown'); gateStatus.classList.toggle('sr-only', state !== 'unknown'); startResendWait();
    document.getElementById('access-title').focus();
  }
  async function sendAccessLink(email, isResend) {
    if (linkRequestPending || gate.hidden || (isResend ? accessConfirmation.hidden || Date.now() < resendNotBefore : accessForm.hidden)) return;
    var attempt = { generation: accessGeneration, email: email }; linkRequestPending = attempt;
    stampKeep();
    accessEmail.disabled = true; accessSend.disabled = true; accessSend.textContent = 'Sending link…';
    gate.setAttribute('aria-busy', 'true'); accessForm.setAttribute('aria-busy', 'true'); updateEmailActions(); accessMessage('Preparing your sign-in email…');
    try {
      var body = { action: 'request_link', email: email, plan: form.elements.plan.value };
      if (intakeToken) body.intake = intakeToken;
      var result = await request('/api/access', 'POST', body);
      if (attempt.generation !== accessGeneration || linkRequestPending !== attempt) return;
      if (!result || result.ok !== true || !['email', 'test_outbox'].includes(result.delivery)) throw new Error('We couldn’t confirm whether your sign-in email was sent.');
      showEmailConfirmation(email, result.delivery, result.message || (result.delivery === 'test_outbox' ? 'No email was sent.' : 'Your sign-in email is on its way.'));
    } catch (error) {
      if (attempt.generation !== accessGeneration || linkRequestPending !== attempt) return;
      if (!error.status) {
        var uncertain = 'We couldn’t confirm whether ' + (isResend ? 'another email was' : 'the email was') + ' sent. Check your inbox before requesting another link.';
        if (emailState === 'email' || emailState === 'test_outbox') { accessMessage(uncertain, true); startResendWait(); gateStatus.focus(); }
        else showEmailConfirmation(email, 'unknown', uncertain);
      } else {
        accessMessage(error.message, true);
        if (isResend) { startResendWait(); gateStatus.focus(); }
        else { accessEmail.setAttribute('aria-describedby', 'access-status'); gateStatus.focus(); }
      }
    } finally {
      if (attempt.generation === accessGeneration && linkRequestPending === attempt) {
        linkRequestPending = null; accessEmail.disabled = false; accessSend.disabled = false; accessSend.textContent = accessSendLabel;
        gate.removeAttribute('aria-busy'); accessForm.removeAttribute('aria-busy'); updateEmailActions();
      }
    }
  }
  accessForm.addEventListener('submit', function (event) {
    event.preventDefault(); if (linkRequestPending || gate.hidden || accessForm.hidden || !accessForm.reportValidity()) return;
    sendAccessLink(accessEmail.value.trim(), false);
  });
  accessResend.addEventListener('click', function () { if (requestedEmail) sendAccessLink(requestedEmail, true); });
  accessChangeEmail.addEventListener('click', function () {
    if (linkRequestPending || gate.hidden || accessConfirmation.hidden) return;
    resetEmailConfirmation(true); verifyButton.hidden = true; accessMessage(''); accessEmail.removeAttribute('aria-describedby'); accessEmail.focus(); accessEmail.select();
  });
  var verifyButton = document.getElementById('access-verify'), verificationAttempt = null;
  function signInFailure(error) {
    resetEmailConfirmation(false);
    gateOnly(error.name === 'AbortError' ? 'Opening your account timed out. Please try again.' : error.message);
    document.getElementById('access-title').textContent = session ? 'Let’s finish signing you in' : 'Sign in to your workspace';
    document.getElementById('access-intro').textContent = session ? 'Your link was verified. Try opening your account again without requesting another email.' : 'Request a fresh sign-in link below. Your saved business details are kept.';
    accessForm.hidden = !!session; verifyButton.hidden = !session;
    verifyButton.disabled = false; verifyButton.textContent = 'Try opening my account again';
  }
  function openExistingWorkspace(existing) {
    var destination;
    try { destination = new URL(existing.portal, location.href); } catch (error) { throw new Error('We could not find your workspace address. Please contact support.'); }
    if (destination.origin !== location.origin || destination.username || destination.password || !['/desk.html', '/desk'].includes(destination.pathname) || !existing.slug || destination.searchParams.get('c') !== existing.slug) throw new Error('We could not confirm your workspace address. Please contact support.');
    var retained = false;
    try { retained = !!session && sessionStorage.getItem(storageKey) === session; } catch (error) { /* Keep the verified session in memory for a read-only retry. */ }
    if (!retained) throw new Error('Your browser is blocking sign-in storage. Allow site storage for this website, then try opening your account again.');
    gateOnly('Opening your workspace…'); accessForm.hidden = true; verifyButton.hidden = true;
    document.getElementById('access-title').textContent = 'Opening your workspace…';
    document.getElementById('access-intro').textContent = 'You’re signed in. Taking you to your front desk.';
    gate.setAttribute('aria-busy', 'true');
    location.replace(destination.href);
  }
  var accessReplace = document.getElementById('access-replace');
  // The browser must keep a probe cookie before the one-time link is spent on the cookie transport; if it does not
  // (cookies blocked for this site, an extension), the exchange falls back to this tab's own session.
  async function cookieProbe() {
    if (navigator.cookieEnabled === false || !window.MCOwnerSession) return null;
    try { var probe = await request('/api/access', 'POST', { action: 'cookie_probe' }); return probe && /^[a-f0-9]{64}$/.test(probe.probe || '') ? probe.probe : null; } catch (error) { return null; }
  }
  // Login CSRF guard: a link for another mailbox would switch this whole browser and sign the current owner out, so ask.
  function confirmReplace(attempt, error) {
    gateOnly(''); accessMessage(''); accessForm.hidden = true; verifyButton.hidden = true; accessReplace.hidden = false;
    document.getElementById('access-title').textContent = 'Switch accounts?';
    document.getElementById('access-intro').textContent = 'This browser is signed in as ' + error.current + '. The link you opened signs in as ' + error.next + ' and signs ' + error.current + ' out on this browser.';
    document.getElementById('access-replace-keep').textContent = 'Stay signed in as ' + error.current;
    document.getElementById('access-replace-continue').textContent = 'Continue as ' + error.next;
    // The focused heading alone says only "Switch accounts?"; tie the explanation naming both accounts to it.
    document.getElementById('access-title').setAttribute('aria-describedby', 'access-intro');
    document.getElementById('access-replace-continue').onclick = function () { if (attempt.generation !== accessGeneration) return; accessReplace.hidden = true; document.getElementById('access-title').removeAttribute('aria-describedby'); gate.setAttribute('aria-busy', 'true'); gateOnly('Checking your secure sign-in link…'); accessForm.hidden = true; attempt.replace = true; verificationAttempt = attempt; verifyAccess(attempt); };
    document.getElementById('access-replace-keep').onclick = function () { accessReplace.hidden = true; verifiedToken = null; location.replace(location.pathname + location.search); };
    document.getElementById('access-title').focus();
  }
  async function verifyAccess(attempt) {
    try {
      // Browsers that keep cookies share one HttpOnly session across tabs; the page keeps only its tab handle.
      var probe = attempt.probe || (attempt.probe = await cookieProbe());
      if (attempt.generation !== accessGeneration) return;
      if (probe && attempt.keep === undefined) attempt.keep = consumeKeep();
      var result = await request('/api/access', 'POST', probe ? { action: 'exchange', token: attempt.token, transport: 'cookie', probe: probe, persistent: attempt.keep, replace: attempt.replace === true } : { action: 'exchange', token: attempt.token });
      if (attempt.generation !== accessGeneration) return;
      if (result.transport === 'cookie') { setSession(result.handle); window.MCOwnerSession.adopt(result.handle, result.replaced, result.previousHandle); } else setSession(result.session); verifiedToken = null; clearIntake(); intakeNotice.hidden = true;
      await signedIn();
    } catch (error) {
      if (attempt.generation !== accessGeneration) return;
      if (error.code === 'replace_confirm' && error.current && error.next && !attempt.replace) { confirmReplace(attempt, error); return; }
      signInFailure(error);
    }
    finally { if (verificationAttempt === attempt) { verificationAttempt = null; gate.removeAttribute('aria-busy'); } }
  }
  // This control is only a recovery path after verification; normal email links need no extra click.
  verifyButton.addEventListener('click', async function () {
    if (!session || verifyButton.disabled) return;
    var generation = accessGeneration; verifyButton.disabled = true; gateStatus.textContent = 'Opening your account…'; gate.setAttribute('aria-busy', 'true');
    setSession(session);
    try { await signedIn(); } catch (error) { if (generation === accessGeneration) signInFailure(error); }
    finally { if (generation === accessGeneration) { verifyButton.disabled = false; gate.removeAttribute('aria-busy'); } }
  });
  document.getElementById('access-sign-out').addEventListener('click', async function () {
    var generation = accessGeneration;
    try { await request('/api/access', 'POST', { action: 'sign_out' }); } catch (error) {
      if (generation !== accessGeneration) return;
      // While the questions are open the gate (and its status line) is hidden, so say it where the owner is looking.
      var lost = error.code === 'connection' || error.code === 'unavailable', status = gate.hidden ? draftStatus : gateStatus;
      status.hidden = false; status.textContent = lost ? 'We couldn’t confirm that you were signed out.' + (error.code === 'connection' ? ' Check your connection.' : '') + ' You’re still signed in on this page. Select Sign out again.' : error.message;
      if (status === draftStatus) announceDraft(status.textContent);
      return;
    }
    if (generation !== accessGeneration) return;
    var signedOutHandle = session;
    accessGeneration++;
    clearTimeout(saveTimer); setSession(null); if (window.MCOwnerSession) window.MCOwnerSession.signedOut(signedOutHandle); resetEmailConfirmation(true); form.reset(); appointmentSeeded = false; updateAppointmentHours(false); updateTrade(false); updatePhoneSetup(); updateConnectionPreview(); clearValidation(); revision = 0; lostSave = null; dirty = false; marketingVersion = 0; marketingSavedVersion = 0; gateOnly('Signed out. Your saved answers are kept securely.');
  });
  // The same owner signed in again in another tab: keep this page's answers and continue on the new handle.
  document.addEventListener('mc:session-renewed', function (event) {
    var detail = event.detail || {};
    if (!session || !detail.handle || detail.previous !== session || !window.MCOwnerSession || !window.MCOwnerSession.follow(detail.handle)) return;
    event.preventDefault(); setSession(detail.handle);
  });
  // Sign-out in another tab of this browser revoked the shared session; close this page's setup the same way.
  document.addEventListener('mc:session-expired', function (event) {
    if (!event.detail || !['signed_out', 'replaced', 'renewed'].includes(event.detail.reason) || !session) return;
    accessGeneration++;
    clearTimeout(saveTimer); saveAgain = false; setSession(null); resetEmailConfirmation(true); form.reset(); appointmentSeeded = false; updateAppointmentHours(false); updateTrade(false); updatePhoneSetup(); updateConnectionPreview(); clearValidation(); revision = 0; lostSave = null; dirty = false; marketingVersion = 0; marketingSavedVersion = 0; gateOnly(event.detail.reason === 'replaced' ? 'This browser signed in to another account in another tab. Your saved answers are kept securely.' : event.detail.reason === 'renewed' ? 'This browser signed in again in another tab. Reload this page to continue; your saved answers are kept securely.' : 'You signed out in another tab. Your saved answers are kept securely.');
  });
  function setErrorSummary(message) {
    err.textContent = message; err.hidden = !message; err.classList.toggle('is-error', !!message);
    if (message) { cancelAnnouncement(); lastAnnounced = message; } // The alert speaks now; nothing queued earlier may follow it.
  }
  function fieldMessage(field) {
    if (field.disabled) return '';
    var value = field.value.trim();
    if (field.closest('#appointmentHoursRows')) {
      var day = field.dataset.d, row = readAppointmentTable()[day];
      if (row && (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(row.open) || !/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/.test(row.close) || row.close <= row.open)) return 'Add both appointment times. Use a later closing time, or leave both blank for no appointments.';
      return '';
    }
    if (field.required && !value) {
      return { name: 'Enter your name.', email: 'Confirm your email to continue.', phone: 'Enter your contact cell, including the area code.', business: 'Enter your business name.', businessNumber: 'Enter the business number your customers call.', trade: 'Choose your trade.', customTrade: 'Enter your trade.', services: 'Add at least one service your business offers.', serviceArea: 'Add a town, neighborhood or ZIP code you serve.', hours: 'Add your business hours, or enter them under Review each day.', windows: 'Add at least one arrival window you offer.' }[field.name] || 'Fill in this field.';
    }
    if (field.name === 'customTrade' && value.length > 80) return 'Use 80 characters or fewer for your trade.';
    if (value && field.name === 'phone' && !validCallbackNumber(value)) return 'Enter a valid US cell number, including the area code, such as (713) 555-0100.';
    if (value && field.name === 'businessNumber' && !validCallbackNumber(value)) return 'Enter a valid US business number, including the area code.';
    if (value && field.name === 'businessNumber' && field.required && value.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '') === form.elements.phone.value.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '')) return 'Use a separate contact cell above so calls can reach you without looping back to the front desk. You can also choose a new front desk number.';
    if (field.required && (field.name === 'services' || field.name === 'serviceArea' || field.name === 'windows') && !value.split(/[\n,;]+/).some(function (part) { return part.trim(); })) return 'Add at least one item before continuing.';
    if (field.name === 'hours' && field.required && value) {
      var table = hoursTable(), any = DAYS.some(function (day) { return !!table[day]; });
      var partial = DAYS.some(function (day) { var row = hoursRows.querySelectorAll('[data-d="' + day + '"]'); return !!row[0].value !== !!row[1].value; });
      if (partial || !any && !/(?:24\s*[/x]\s*7|24\s*hours)/i.test(value)) return 'Use hours such as Mon–Fri 8am–5pm, or finish the opening and closing times under Review each day.';
    }
    if (field.name === 'windows' && value) {
      var offered = value.split(/[\n,;]+/).map(function (item) { return item.trim(); }).filter(Boolean), table = appointmentTable(), openDays = DAYS.filter(function (day) { return !!table[day]; });
      for (var w = 0; w < offered.length; w++) {
        var range = appointmentWindow(offered[w]);
        if (!range) return 'Use a time range with am or pm, such as 8 am to 12 pm.';
        if (openDays.length && !openDays.some(function (day) { return range[0] >= clockMinutes(table[day].open) && range[1] <= clockMinutes(table[day].close); })) return 'The window “' + offered[w] + '” falls outside your appointment hours. Adjust the window or choose different appointment hours above.';
      }
    }
    if (value && !field.checkValidity()) return field.type === 'url' ? 'Enter a full website address, such as https://yourbusiness.com, or leave this blank.' : 'Check this field and try again.';
    return '';
  }
  function setFieldError(field, message, fromServer) {
    var id = field.id + '-error', note = document.getElementById(id);
    if (!note && message) {
      note = document.createElement('p'); note.id = id; note.className = 'field-error'; field.insertAdjacentElement('afterend', note);
    }
    if (note) { note.textContent = message; note.hidden = !message; }
    var descriptions = (field.getAttribute('aria-describedby') || '').split(/\s+/).filter(function (value) { return value && value !== id; });
    if (message) descriptions.push(id);
    if (descriptions.length) field.setAttribute('aria-describedby', descriptions.join(' ')); else field.removeAttribute('aria-describedby');
    field.classList.toggle('error', !!message);
    if (message) field.setAttribute('aria-invalid', 'true'); else field.removeAttribute('aria-invalid');
    if (fromServer) field.dataset.rejectedValue = field.value; else delete field.dataset.rejectedValue;
  }
  function clearValidation() {
    form.querySelectorAll('.form-input').forEach(function (field) { setFieldError(field, ''); }); setErrorSummary('');
  }
  function focusError(field) {
    if (field.name === 'hours' && hoursTouched) { var hoursDetails = hoursRows.closest('details'); if (hoursDetails) hoursDetails.open = true; }
    var ancestor = field.parentElement;
    while (ancestor && ancestor !== form) { if (ancestor.tagName === 'DETAILS') ancestor.open = true; ancestor = ancestor.parentElement; }
    field.focus({ preventScroll: true }); field.scrollIntoView({ block: 'center', behavior: 'instant' });
  }
  function valid(allSteps) {
    var invalid = [];
    (allSteps ? steps : [steps[i]]).forEach(function (step) {
      step.querySelectorAll('.form-input').forEach(function (field) {
        var message = fieldMessage(field);
        // A server-rejected value stays marked until it is changed.
        if (!message && field.dataset.rejectedValue === field.value) message = document.getElementById(field.id + '-error').textContent;
        setFieldError(field, message, !!message && field.dataset.rejectedValue === field.value);
        if (message) invalid.push(field);
      });
    });
    if (invalid.length) {
      var step = steps.indexOf(invalid[0].closest('fieldset'));
      if (step !== i) show(step, false);
      setErrorSummary(invalid.length === 1 ? 'Check the highlighted field to continue.' : 'Check the highlighted fields to continue.'); focusError(invalid[0]); return false;
    }
    setErrorSummary(''); return true;
  }
  function validCallbackNumber(value) {
    // Match onboard.mjs's trimmed 30-character input and send.mjs's e164 normalization.
    var digits = String(value || '').trim().slice(0, 30).replace(/[^\d+]/g, '');
    var normalized = digits.charAt(0) === '+' ? digits : digits.length === 10 ? '+1' + digits : '+' + digits;
    return /^\+1\d{10}$/.test(normalized);
  }
  function revealFieldError(path, message) {
    var names = { 'owner.name': 'name', 'owner.email': 'email', 'owner.phone': 'phone', 'business.name': 'business', 'business.website': 'website', 'phone.businessNumber': 'businessNumber' };
    var appointmentPath = /^(?:rules\.)?appointmentHours/.test(path), name = appointmentPath ? 'appointmentHoursMode' : names[path] || String(path).split('.').pop(), field = form.elements[name];
    if (appointmentPath && appointmentMode.value === 'custom') { var parts = String(path).split('.'), day = parts.find(function (part) { return DAYS.indexOf(part) >= 0; }); field = day ? appointmentRows.querySelector('[data-d="' + day + '"][data-k="' + (parts[parts.length - 1] === 'close' ? 'close' : 'open') + '"]') : appointmentMode; }
    if (name === 'trade' && tradeSelect.value === 'other') field = customTrade;
    if (!field || field.nodeType !== 1) return false;
    var step = steps.indexOf(field.closest('fieldset'));
    if (step >= 0) show(step, false);
    setFieldError(field, message, true); focusError(field); return true;
  }
  function recheckField(event) {
    var field = event.target;
    if (!field.matches('.form-input[aria-invalid="true"]') || field.dataset.rejectedValue === field.value) return;
    setFieldError(field, fieldMessage(field));
    if (!steps[i].querySelector('[aria-invalid="true"]')) setErrorSummary('');
  }
  form.addEventListener('input', recheckField); form.addEventListener('change', recheckField);
  back.addEventListener('click', async function () { if (i > 0) { show(i - 1, true); dirty = true; await saveDraft().catch(function () {}); } });
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (next.disabled || !session || !valid(i === steps.length - 1)) return;
    var generation = accessGeneration, submittedStep = i, backWasDisabled = back.disabled, creating = false;
    next.disabled = true; back.disabled = true;
    try {
      // Silent: a step change announces only the save after the move, and failures go to the error summary.
      await saveDraft({ silent: true });
      if (generation !== accessGeneration) return;
      // Answers remain editable while saving. Check the latest values before proceeding.
      if (i !== submittedStep || !valid(submittedStep === steps.length - 1)) return;
      if (i < steps.length - 1) { show(i + 1, true); dirty = true; await saveDraft({ reportsFailure: true }); return; }
      next.textContent = 'Creating your workspace…';
      var fields = collect(); fields.email = form.elements.email.value; creating = true;
      var result = await request('/api/onboard', 'POST', fields);
      if (generation !== accessGeneration) return;
      if (!result.portal) throw new Error('Your workspace could not be confirmed. Your saved answers are kept; retry to continue.');
      workspace(result.portal);
    } catch (error) {
      if (generation !== accessGeneration) return;
      if (error.code === 'workspace_stopped' && error.data) { stoppedWorkspace(error.data); return; }
      // The create call is safe to repeat: the server returns the workspace already made for this email, with the answers it first received.
      // Name the button shown now; a lost save after advancing leaves the page on the next step.
      var lost = error.code === 'connection' || error.code === 'unavailable', button = i === steps.length - 1 ? 'Create my workspace' : 'Save and continue';
      var message = !lost ? error.message : creating ? 'We couldn’t confirm that your workspace was created. Your answers are saved, and it may already be ready. Select Create my workspace again. If it was created, you’ll get that same workspace, not a second one. Changes you make now may not reach it, but you can update details in your workspace.' : 'We couldn’t confirm whether your latest answers were saved.' + (error.code === 'connection' ? ' Check your connection.' : '') + ' They’re still on this page and will save when you select ' + button + '.';
      var hasField = error.field && revealFieldError(error.field, message);
      setErrorSummary(hasField ? 'Check the highlighted field to continue.' : message);
      if (!hasField) focusError(err);
    } finally { if (generation === accessGeneration) { back.disabled = backWasDisabled; next.disabled = false; next.textContent = i === steps.length - 1 ? 'Create my workspace' : 'Save and continue'; } }
  });
  function showVerification(token) {
    if (verificationAttempt && verificationAttempt.token === token) return;
    accessGeneration++; clearTimeout(saveTimer); verifiedToken = token;
    resetEmailConfirmation(false);
    saving = null; saveAgain = false; dirty = false; revision = 0; lostSave = null; marketingVersion = 0; marketingSavedVersion = 0; form.reset(); updateTrade(false); clearValidation(); choosePlan(); hoursTouched = false; touched.t0 = false; touched.t1 = false; fillTiers(); fillHours(); show(0, false); verifyButton.disabled = false; next.disabled = false; back.disabled = false;
    updatePhoneSetup();
    setSession(null); gateOnly('Checking your secure sign-in link…');
    accessForm.hidden = true; verifyButton.hidden = true;
    document.getElementById('access-title').textContent = 'Signing you in…';
    document.getElementById('access-intro').textContent = 'We’re checking your link and opening your account.';
    gate.setAttribute('aria-busy', 'true');
    verificationAttempt = { token: token, generation: accessGeneration };
    verifyAccess(verificationAttempt);
  }
  // An email opened in the same tab can change only the fragment, without reloading this script.
  window.addEventListener('hashchange', function () {
    var token = new URLSearchParams(location.hash.slice(1)).get('verify');
    if (!token) return;
    history.replaceState(null, '', location.pathname + location.search);
    showVerification(token);
  });
  if (verifiedToken) {
    showVerification(verifiedToken);
  } else {
    try { session = sessionStorage.getItem(storageKey); } catch (error) { session = null; }
    var startupGeneration = accessGeneration;
    if (session) signedIn().catch(function (error) { if (startupGeneration === accessGeneration) signInFailure(error); }); else gateOnly();
  }
})();
