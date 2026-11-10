(function () {
  'use strict';
  var form = document.getElementById('signup-intake');
  if (!form) return;
  var button = document.getElementById('intake-submit'), status = document.getElementById('intake-status');
  var busy = false, done = false, submissionIds = Object.create(null);
  var handoffStorage = 'mc-signup-intake-v1';
  var plan = new URLSearchParams(window.location.search).get('plan');
  if (['starter', 'growth'].indexOf(plan) < 0) plan = null;
  var API_BASE = (function () { var meta = document.querySelector('meta[name="mc-api-base"]'); return meta && meta.content ? meta.content.replace(/\/$/, '') : ''; })();
  var buttonLabel = (button.textContent || '').replace(/[↗]/g, '').trim() || 'Continue to setup';
  // Each set of answers keeps its own submission id, so sending the same answers again returns the first signup.
  // A changed answer is a different submission, and the copy says so.
  var UNKNOWN = 'We couldn’t confirm whether your details were saved. They may already be saved, and your answers are still here. If you keep the same answers, choosing ' + buttonLabel + ' again is safe and won’t create a second signup. If you change an answer, it will be sent as a new signup.';
  var SLOW = 'Still saving. Please keep this page open.';
  // The server refused a stale or changed submission id. A fresh id is used next time, so one more click works.
  var RESTART = {
    intake_expired: 'Those details expired before setup opened. Choose ' + buttonLabel + ' to send them again.',
    submission_changed: 'Your answers changed after they were first sent. Choose ' + buttonLabel + ' to send them as a new signup.',
    invalid_submission: 'We couldn’t send that form. Choose ' + buttonLabel + ' to try again.'
  };
  form.noValidate = true; // Inline messages below replace the browser bubble so each one is tied to its field.
  // #intake-status is the polite live region for progress. An error is announced once, by focus: the region is made
  // non-live before the error text goes in. The next-step link sits in a separate, non-live element.
  status.setAttribute('tabindex', '-1');
  var next = document.createElement('p');
  next.id = 'intake-next'; next.className = 'form-status'; next.hidden = true;
  status.insertAdjacentElement('afterend', next);
  var fields = [
    { el: document.getElementById('intake-name'), missing: 'Enter your name.' },
    { el: document.getElementById('intake-email'), missing: 'Enter your email address.', invalid: 'Enter an email address like name@example.com.' },
    { el: document.getElementById('intake-business'), missing: 'Enter your business name.' }
  ].filter(function (field) { return field.el; });
  function id() {
    if (!window.crypto || !window.crypto.getRandomValues) throw new Error('Please use a current browser to continue securely.');
    if (window.crypto.randomUUID) return window.crypto.randomUUID();
    return Array.from(window.crypto.getRandomValues(new Uint8Array(24)), function (value) { return value.toString(16).padStart(2, '0'); }).join('');
  }
  function progress(text) { status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.textContent = text; status.classList.remove('is-error'); }
  function clearNext() { next.textContent = ''; next.hidden = true; }
  function showError(text) {
    clearNext(); status.removeAttribute('role'); status.setAttribute('aria-live', 'off');
    status.textContent = text; status.classList.add('is-error'); status.focus();
  }
  function errorNode(field) {
    var nodeId = field.el.id + '-error', node = document.getElementById(nodeId);
    if (!node) {
      node = document.createElement('p'); node.id = nodeId; node.className = 'form-status is-error'; node.hidden = true;
      field.el.insertAdjacentElement('afterend', node);
    }
    return node;
  }
  function setFieldError(field, text) {
    var node = errorNode(field), refs = (field.el.getAttribute('aria-describedby') || '').split(/\s+/).filter(function (ref) { return ref && ref !== node.id; });
    if (text) { node.textContent = text; node.hidden = false; field.el.setAttribute('aria-invalid', 'true'); refs.push(node.id); }
    else { node.textContent = ''; node.hidden = true; field.el.removeAttribute('aria-invalid'); }
    if (refs.length) field.el.setAttribute('aria-describedby', refs.join(' ')); else field.el.removeAttribute('aria-describedby');
  }
  function fieldById(fieldId) { return fields.filter(function (field) { return field.el.id === fieldId; })[0]; }
  function problem(field) {
    var value = String(field.el.value || '').trim();
    if (!value) return field.missing;
    if (field.el.validity && (field.el.validity.typeMismatch || field.el.validity.tooLong)) return field.invalid || 'Please check this answer.';
    return '';
  }
  function validate() {
    var first = null;
    fields.forEach(function (field) { var text = problem(field); setFieldError(field, text); if (text && !first) first = field.el; });
    if (first) { progress(''); clearNext(); first.focus(); }
    return !first;
  }
  fields.forEach(function (field) {
    field.el.addEventListener('input', function () { if (field.el.getAttribute('aria-invalid') === 'true' && !problem(field)) setFieldError(field, ''); });
  });
  function setupUrl(handoff) { return '/onboard.html' + (plan ? '?plan=' + encodeURIComponent(plan) : '') + '#intake=' + handoff; }
  function showNext(handoff) {
    // A real link stays as the way forward if the page change is stopped or never arrives.
    clearNext();
    var link = document.createElement('a'); link.href = setupUrl(handoff); link.textContent = 'Open your setup';
    next.appendChild(document.createTextNode('If it doesn’t open, choose ')); next.appendChild(link); next.appendChild(document.createTextNode('.'));
    next.hidden = false; link.focus();
  }
  // Back/forward cache: a restored page must be usable again.
  window.addEventListener('pageshow', function (event) { if (event.persisted) { done = false; busy = false; button.disabled = false; form.removeAttribute('aria-busy'); progress(''); clearNext(); } });
  function definite(text) { var error = new Error(text); error.definite = true; return error; }
  form.addEventListener('input', function () { if (done) progress('Your signup is already saved with the earlier answers. Open your setup to continue; you can change details there.'); });
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (busy || done || !validate()) return;
    var values = new FormData(form);
    var payload = {
      name: String(values.get('name') || '').trim(),
      email: String(values.get('email') || '').trim(),
      business: String(values.get('business') || '').trim(),
      trade: '', goal: String(values.get('goal') || ''),
      marketingConsent: values.has('marketingConsent'), botfield: String(values.get('botfield') || '')
    };
    var signature = JSON.stringify(Object.assign({}, payload, { email: payload.email.toLowerCase() })), submissionId;
    try {
      // The same answers always reuse their key, even after an edit and a change back.
      submissionId = submissionIds[signature] || (submissionIds[signature] = id());
    } catch (error) { showError(error.message); return; }
    busy = true; button.disabled = true; form.setAttribute('aria-busy', 'true'); clearNext(); progress('Saving your details…');
    var controller = new AbortController(), timer = setTimeout(function () { controller.abort(); }, 20000);
    var slow = setTimeout(function () { if (busy) progress(SLOW); }, 8000);
    try {
      var response, result = null;
      try {
        response = await fetch(API_BASE + '/api/intake', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(Object.assign({ submissionId: submissionId }, payload)), signal: controller.signal
        });
      } catch (error) { throw new Error(UNKNOWN); } // Lost before or after the server ran, or timed out.
      try { result = await response.json(); } catch (error) { result = null; }
      if (response.status >= 400 && response.status < 500) {
        // The server answered and refused. Nothing new was saved for this request.
        var code = result && result.error;
        if (RESTART[code]) { delete submissionIds[signature]; throw definite(RESTART[code]); }
        var emailField = code === 'invalid_email' && fieldById('intake-email');
        if (emailField) {
          // The message lives on the field only; focus goes there.
          progress(''); setFieldError(emailField, (result && result.message) || emailField.invalid); emailField.el.focus();
          return;
        }
        throw definite(result && typeof result.message === 'string' && result.message ? result.message : 'We couldn’t save your details. Please check your answers and try again.');
      }
      // 5xx, a gateway page or an unreadable reply: the server may have saved before failing.
      if (!response.ok || !result) throw new Error(UNKNOWN);
      if (!result.ok || !/^[a-f0-9]{64}$/.test(result.handoff || '')) throw new Error(UNKNOWN);
      try {
        // The server carries the full answers after verification. Only this tab’s email is needed now.
        sessionStorage.setItem(handoffStorage, JSON.stringify({ handoff: result.handoff, email: payload.email, expiresAt: result.expiresAt }));
      } catch (error) { /* The opaque handoff still works; the next page can ask for the same email. */ }
      done = true; // Keep the form locked while the next page opens; the link below is the way forward.
      progress('Saved. Opening your setup…');
      showNext(result.handoff);
      window.location.assign(setupUrl(result.handoff));
    } catch (error) {
      showError(error && error.definite ? error.message : UNKNOWN);
    } finally {
      clearTimeout(timer); clearTimeout(slow); busy = false; form.removeAttribute('aria-busy');
      if (!done) button.disabled = false;
    }
  });
})();
