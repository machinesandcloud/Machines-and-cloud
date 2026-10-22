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
    if (note) { note.hidden = plan !== 'pro'; note.textContent = plan === 'pro' ? 'Pro is no longer offered for new setup. Choose a current preference; billing remains off.' : ''; }
    form.querySelectorAll('.plans-pick label').forEach(function (label) { label.classList.toggle('on', label.querySelector('input').checked); });
  }
  function choosePlan() { selectPlan(new URLSearchParams(location.search).get('plan')); }
  choosePlan();
  // Emergency tiers prefilled by trade (same table as the server); the owner can edit every line.
  var T0 = 'Gas smell\nCarbon monoxide alarm\nSmoke or fire\nSparks or a burning smell from the panel or an outlet\nSewage flooding a living space';
  var T1 = { hvac: 'No cooling when the forecast high is 90°F or more\nNo cooling with an infant, elderly, or medically dependent person in the home\nNo heat when it is at or below freezing outside\nWater pouring from the air handler', plumbing: 'Uncontrolled water (a burst pipe, a leak that will not stop)\nNo water in the house\nSewage backup\nLeaking water heater\nNo hot water with an infant, elderly, or medically dependent person in the home', electrical: "Loss of power from the home's own system, not a utility outage\nA hot outlet, switch, or breaker\nPartial power or flickering across the house\nExposed or damaged wiring", roofing: 'Active leak during rain\nStorm or tree damage with the interior exposed\nTarping after hail or wind', cleaning: '', other: '' };
  function tradeKey(t) { t = (t || '').toLowerCase(); return /hvac|air|cool|heat|a\/c|ac\b/.test(t) ? 'hvac' : /plumb|drain|water heater|sewer/.test(t) ? 'plumbing' : /electr/.test(t) ? 'electrical' : /roof/.test(t) ? 'roofing' : /clean|maid|janitor/.test(t) ? 'cleaning' : 'other'; }
  var t0 = form.elements['tier0'], t1 = form.elements['tier1'], touched = { t0: false, t1: false };
  t0.addEventListener('input', function () { touched.t0 = true; }); t1.addEventListener('input', function () { touched.t1 = true; });
  function fillTiers() { if (!touched.t0) t0.value = T0; if (!touched.t1) t1.value = T1[tradeKey(form.elements['trade'].value)] || ''; }
  form.elements['trade'].addEventListener('change', fillTiers); form.elements['trade'].addEventListener('blur', fillTiers); fillTiers();
  // Structured hours: seven rows, prefilled from the hours sentence (same parser as the server, simplified).
  var DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], DI = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  function clock(str, isClose) { var m = String(str).trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?$/i); if (!m) return null; var h = +m[1], mi = +(m[2] || 0), ap = (m[3] || '').toLowerCase(); if (ap.charAt(0) === 'p' && h < 12) h += 12; else if (ap.charAt(0) === 'a' && h === 12) h = 0; else if (!ap) { if (isClose && h <= 9) h += 12; else if (!isClose && h < 5) h += 12; } return (h < 10 ? '0' : '') + h + ':' + (mi < 10 ? '0' : '') + mi; }
  function parseHours(str) { var out = {}, any = false; String(str || '').split(/[,;\n]+/).forEach(function (part) { var t = part.trim().toLowerCase().replace(/\./g, ''); var dm = t.match(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*(?:\s*(?:to|-|–|through|thru)\s*(mon|tue|wed|thu|fri|sat|sun)[a-z]*)?\s*:?\s*(.*)$/); if (!dm) return; var a = DI[dm[1]], b = dm[2] ? DI[dm[2]] : a, days = [], i = a; for (var k = 0; k < 7; k++) { days.push(DAYS[(i + 6) % 7]); if (i === b) break; i = (i + 1) % 7; } if (/closed/.test(dm[3])) { days.forEach(function (d) { out[d] = null; }); any = true; return; } var tm = dm[3].match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm|a|p)?)\s*(?:to|-|–|until)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm|a|p)?)/); if (!tm) return; var o = clock(tm[1], false), c = clock(tm[2], true); if (!o || !c) return; days.forEach(function (d) { out[d] = { open: o, close: c }; }); any = true; }); if (!any) return null; DAYS.forEach(function (d) { if (out[d] === undefined) out[d] = null; }); return out; }
  var hoursRows = document.getElementById('hoursRows'), hoursTouched = false;
  hoursRows.innerHTML = DAYS.map(function (d) { var day = d.charAt(0).toUpperCase() + d.slice(1); return '<div class="hours-row"><span>' + day + '</span><input type="time" aria-label="' + day + ' opening time" data-d="' + d + '" data-k="open"><span>to</span><input type="time" aria-label="' + day + ' closing time" data-d="' + d + '" data-k="close"></div>'; }).join('');
  hoursRows.addEventListener('input', function () { hoursTouched = true; });
  function fillHours() { if (hoursTouched) return; var h = parseHours(form.elements['hours'].value); hoursRows.querySelectorAll('input').forEach(function (inp) { var v = h && h[inp.dataset.d]; inp.value = v ? v[inp.dataset.k] : ''; }); }
  form.elements['hours'].addEventListener('input', fillHours); form.elements['hours'].addEventListener('blur', fillHours);
  function hoursTable() { var t = {}; DAYS.forEach(function (d) { var o = hoursRows.querySelector('input[data-d="' + d + '"][data-k="open"]').value, c = hoursRows.querySelector('input[data-d="' + d + '"][data-k="close"]').value; t[d] = o && c ? { open: o, close: c } : null; }); return t; }
  var fwdSel = form.elements['forwarding']; function fwdUI() { if (fwdSel && document.getElementById('transferRow')) document.getElementById('transferRow').style.display = fwdSel.value === 'all' ? 'grid' : 'none'; } if (fwdSel) fwdSel.addEventListener('change', fwdUI); fwdUI();
  form.querySelectorAll('.plans-pick input').forEach(function (r) { r.addEventListener('change', function () { selectPlan(r.value); }); });
  var accessGeneration = 0, session = null, revision = 0, saving = null, saveAgain = false, dirty = false, restoring = false, saveTimer = null;
  var gate = document.getElementById('access-gate'), gateStatus = document.getElementById('access-status'), accessForm = document.getElementById('access-form');
  var draftStatus = document.getElementById('draft-status'), verifiedToken = new URLSearchParams(location.hash.slice(1)).get('verify');
  var storageKey = 'mc-onboarding-session-v1';
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
    document.getElementById('access-signed-in').hidden = true; draftStatus.hidden = true;
    document.getElementById('done').classList.remove('on');
    if (message) gateStatus.textContent = message;
  }
  async function request(path, method, body) {
    var generation = accessGeneration;
    var headers = { 'Content-Type': 'application/json' }; if (session) headers.Authorization = 'Bearer ' + session;
    var controller = new AbortController(), timeout = setTimeout(function () { controller.abort(); }, 20000);
    try {
      var response = await fetch(API_BASE + path, { method: method || 'GET', headers: headers, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal });
      var data = await response.json();
      if (!response.ok) {
        if (response.status === 401 && generation === accessGeneration) { setSession(null); gateOnly('Your sign-in expired. Request a new link; your saved answers are kept.'); }
        var failure = new Error(data.message || 'We could not confirm that request. Please try again.'); failure.code = data.error; failure.status = response.status; failure.field = data.field; throw failure;
      }
      return data;
    } finally { clearTimeout(timeout); }
  }
  function show(n, frame) {
    i = Math.max(0, Math.min(steps.length - 1, n));
    steps.forEach(function (step, k) { step.classList.toggle('on', k === i); });
    pills.forEach(function (pill, k) { pill.classList.toggle('on', k <= i); pill.setAttribute('aria-current', k === i ? 'step' : 'false'); });
    back.style.visibility = i ? 'visible' : 'hidden'; next.textContent = i === steps.length - 1 ? 'Create my workspace' : 'Save and continue'; setErrorSummary('');
    if (frame) { window.scrollTo({ top: 0, behavior: 'instant' }); steps[i].querySelector('input,select,textarea')?.focus({ preventScroll: true }); }
  }
  function collect() {
    document.getElementById('hoursTable').value = JSON.stringify(hoursTable());
    var fields = {}; new FormData(form).forEach(function (value, key) {
      if (key === 'botfield' || key === 'email') return;
      if (key === 'leadSources' || key === 'desiredChannels') (fields[key] = fields[key] || []).push(value); else fields[key] = value;
    });
    if (!fields.leadSources) fields.leadSources = [];
    if (!fields.desiredChannels) fields.desiredChannels = [];
    return fields;
  }
  async function saveDraft() {
    clearTimeout(saveTimer);
    if (!session || restoring) return;
    if (saving) { saveAgain = true; await saving; if (dirty) return saveDraft(); return; }
    var snapshot = collect(), step = i, generation = accessGeneration, preferenceVersion = marketingVersion;
    var saveBody = { fields: snapshot, step: step, revision: revision };
    if (preferenceVersion > marketingSavedVersion) saveBody.marketingConsent = marketingField.checked;
    draftStatus.textContent = 'Saving your answers…'; draftStatus.hidden = false;
    var pending = request('/api/access', 'PUT', saveBody).then(function (result) {
      if (generation !== accessGeneration) return;
      revision = result.draft.revision;
      if (!result.marketingPending && Object.prototype.hasOwnProperty.call(saveBody, 'marketingConsent')) marketingSavedVersion = preferenceVersion;
      dirty = JSON.stringify(collect()) !== JSON.stringify(snapshot) || i !== step || marketingVersion !== preferenceVersion;
      draftStatus.textContent = result.marketingPending ? 'Your answers are saved. Your email preference could not be confirmed; it will retry when you save or continue.' : 'Saved. You can leave and continue later.';
    }).catch(function (error) { if (generation !== accessGeneration) return; dirty = true; draftStatus.textContent = error.message + ' Your changes are still on this page.'; throw error; });
    saving = pending;
    try { await pending; } finally { if (saving === pending) saving = null; }
    if (generation !== accessGeneration) return;
    if (saveAgain || dirty) { saveAgain = false; return saveDraft(); }
  }
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
      if (name === 'plan') return; // A retired preference must not clear both current choices.
      form.querySelectorAll('[name]').forEach(function (field) {
        if (field.name !== name) return;
        if (field.type === 'radio') field.checked = field.value === fields[name];
        else if (field.type === 'checkbox') field.checked = Array.isArray(fields[name]) && fields[name].indexOf(field.value) >= 0;
        else field.value = fields[name];
      });
    });
    var savedPlan = fields.plan;
    selectPlan(PLAN_IDS.indexOf(savedPlan) >= 0 || savedPlan === 'pro' ? savedPlan : retiredPlanHint ? 'pro' : form.elements.plan.value);
    if (fields.hoursTable) { try { var hours = JSON.parse(fields.hoursTable); hoursTouched = true; hoursRows.querySelectorAll('input').forEach(function (field) { field.value = hours[field.dataset.d]?.[field.dataset.k] || ''; }); } catch (error) { fillHours(); } } else fillHours();
    touched.t0 = !!fields.tier0; touched.t1 = !!fields.tier1; fillTiers(); fwdUI();
    form.querySelectorAll('.plans-pick label').forEach(function (label) { label.classList.toggle('on', label.querySelector('input').checked); });
    restoring = false; dirty = false;
  }
  function workspace(portal, text) {
    form.hidden = true; document.querySelector('.ob-steps').hidden = true; draftStatus.hidden = true; gate.hidden = true;
    document.getElementById('done').classList.add('on');
    document.getElementById('done').querySelector('h2').textContent = 'Your workspace is ready';
    document.getElementById('buildStatus').textContent = text || 'Your saved answers are ready to review. Follow the checklist before activating website chat.';
    document.getElementById('portalLink').textContent = 'Open your private workspace'; document.getElementById('portalLink').href = portal; document.getElementById('goPortal').href = portal;
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
        gateOnly(error.message);
        document.getElementById('access-identity').textContent = 'Signed in as ' + state.email;
        document.getElementById('access-signed-in').hidden = false;
        intakeNotice.hidden = false; intakeNotice.textContent = 'Your details are saved, but couldn’t be added to this account. Sign out and use the email you entered, or request a new sign-in link below.';
        return;
      }
    }
    form.elements.email.value = state.email; form.elements.email.readOnly = true;
    document.getElementById('access-identity').textContent = 'Signed in as ' + state.email; document.getElementById('access-signed-in').hidden = false;
    gate.hidden = true;
    if (state.existing) { workspace(state.existing.portal, 'Welcome back. Open your workspace to continue setup or manage your front desk.'); return; }
    revision = state.draft.revision || 0; restore(state.draft.fields || {});
    marketingField.checked = !!(state.marketing && state.marketing.preference === true); marketingVersion = 0; marketingSavedVersion = 0;
    form.hidden = false; document.querySelector('.ob-steps').hidden = false; draftStatus.hidden = false;
    draftStatus.textContent = revision ? 'Your saved answers have been restored.' : 'Your answers will save automatically.'; show(state.draft.step || 0, false);
  }
  accessForm.addEventListener('submit', async function (event) {
    var generation = accessGeneration;
    event.preventDefault(); var button = document.getElementById('access-send'); if (!accessForm.reportValidity()) return;
    button.disabled = true; gateStatus.textContent = 'Preparing your sign-in email…';
    try {
      var body = { action: 'request_link', email: document.getElementById('access-email').value, plan: form.elements.plan.value };
      if (intakeToken) body.intake = intakeToken;
      var result = await request('/api/access', 'POST', body);
      if (generation === accessGeneration) gateStatus.textContent = result.message;
    }
    catch (error) { if (generation === accessGeneration) gateStatus.textContent = error.name === 'AbortError' ? 'That request timed out. You can request another link.' : error.message; }
    finally { button.disabled = false; }
  });
  var verifyButton = document.getElementById('access-verify');
  verifyButton.addEventListener('click', async function () {
    var generation = accessGeneration;
    verifyButton.disabled = true; gateStatus.textContent = 'Checking your sign-in link…';
    try { var result = await request('/api/access', 'POST', { action: 'exchange', token: verifiedToken }); if (generation !== accessGeneration) return; setSession(result.session); verifiedToken = null; clearIntake(); intakeNotice.hidden = true; verifyButton.hidden = true; accessForm.hidden = false; await signedIn(); }
    catch (error) { if (generation === accessGeneration) { gateStatus.textContent = error.message; verifyButton.hidden = true; accessForm.hidden = false; } }
    finally { if (generation === accessGeneration) verifyButton.disabled = false; }
  });
  document.getElementById('access-sign-out').addEventListener('click', async function () {
    var generation = accessGeneration;
    try { await request('/api/access', 'POST', { action: 'sign_out' }); } catch (error) { gateStatus.textContent = error.message; return; }
    if (generation !== accessGeneration) return;
    accessGeneration++;
    clearTimeout(saveTimer); setSession(null); form.reset(); clearValidation(); revision = 0; dirty = false; marketingVersion = 0; marketingSavedVersion = 0; gateOnly('Signed out. Your saved answers are kept securely.');
  });
  function setErrorSummary(message) {
    err.textContent = message; err.hidden = !message; err.classList.toggle('is-error', !!message);
  }
  function fieldMessage(field) {
    var value = field.value.trim();
    if (field.required && !value) {
      return { name: 'Enter your name.', email: 'Confirm your email to continue.', phone: 'Enter your contact cell, including the area code.', business: 'Enter your business name.' }[field.name] || 'Fill in this field.';
    }
    if (value && field.name === 'phone' && !validCallbackNumber(value)) return 'Enter a valid US cell number, including the area code, such as (713) 555-0100.';
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
    var names = { 'owner.name': 'name', 'owner.email': 'email', 'owner.phone': 'phone', 'business.name': 'business', 'business.website': 'website' };
    var name = names[path] || String(path).split('.').pop(), field = form.elements[name];
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
    var generation = accessGeneration, submittedStep = i, backWasDisabled = back.disabled;
    next.disabled = true; back.disabled = true;
    try {
      await saveDraft();
      if (generation !== accessGeneration) return;
      // Answers remain editable while saving. Check the latest values before proceeding.
      if (i !== submittedStep || !valid(submittedStep === steps.length - 1)) return;
      if (i < steps.length - 1) { show(i + 1, true); dirty = true; await saveDraft(); return; }
      next.textContent = 'Creating your workspace…';
      var fields = collect(); fields.email = form.elements.email.value;
      var result = await request('/api/onboard', 'POST', fields);
      if (generation !== accessGeneration) return;
      if (!result.portal) throw new Error('Your workspace could not be confirmed. Your saved answers are kept; retry to continue.');
      workspace(result.portal);
    } catch (error) {
      if (generation !== accessGeneration) return;
      var message = error.name === 'AbortError' ? 'The request timed out. Your saved answers are kept. Retry to continue the same workspace.' : error.message;
      var hasField = error.field && revealFieldError(error.field, message);
      setErrorSummary(hasField ? 'Check the highlighted field to continue.' : message);
      if (!hasField) focusError(err);
    } finally { if (generation === accessGeneration) { back.disabled = backWasDisabled; next.disabled = false; next.textContent = i === steps.length - 1 ? 'Create my workspace' : 'Save and continue'; } }
  });
  function showVerification(token) {
    accessGeneration++; clearTimeout(saveTimer); verifiedToken = token;
    saving = null; saveAgain = false; dirty = false; revision = 0; marketingVersion = 0; marketingSavedVersion = 0; form.reset(); clearValidation(); choosePlan(); hoursTouched = false; touched.t0 = false; touched.t1 = false; fillTiers(); fillHours(); show(0, false); verifyButton.disabled = false; next.disabled = false; back.disabled = false;
    setSession(null); gateOnly('Confirm to continue securely. This link works once and expires after 20 minutes.');
    accessForm.hidden = true; verifyButton.hidden = false; document.getElementById('access-title').textContent = 'Continue to your workspace';
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
    if (session) signedIn().catch(function (error) { gateOnly(error.message); }); else gateOnly();
  }
})();
