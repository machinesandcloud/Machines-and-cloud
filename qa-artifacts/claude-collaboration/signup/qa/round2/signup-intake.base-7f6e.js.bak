(function () {
  'use strict';
  var form = document.getElementById('signup-intake');
  if (!form) return;
  var button = document.getElementById('intake-submit'), status = document.getElementById('intake-status');
  var busy = false, previousPayload = null, submissionId = null;
  var handoffStorage = 'mc-signup-intake-v1';
  var plan = new URLSearchParams(window.location.search).get('plan');
  if (['starter', 'growth'].indexOf(plan) < 0) plan = null;
  var API_BASE = (function () { var meta = document.querySelector('meta[name="mc-api-base"]'); return meta && meta.content ? meta.content.replace(/\/$/, '') : ''; })();
  function id() {
    if (!window.crypto || !window.crypto.getRandomValues) throw new Error('Please use a current browser to continue securely.');
    if (window.crypto.randomUUID) return window.crypto.randomUUID();
    return Array.from(window.crypto.getRandomValues(new Uint8Array(24)), function (value) { return value.toString(16).padStart(2, '0'); }).join('');
  }
  function message(text, error) { status.textContent = text; status.classList.toggle('is-error', !!error); }
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (busy || !form.reportValidity()) return;
    var values = new FormData(form);
    var payload = {
      name: String(values.get('name') || '').trim(),
      email: String(values.get('email') || '').trim(),
      business: String(values.get('business') || '').trim(),
      trade: '', goal: String(values.get('goal') || ''),
      marketingConsent: values.has('marketingConsent'), botfield: String(values.get('botfield') || '')
    };
    if (!payload.name || !payload.business) { message('Please add your name and business name.', true); return; }
    var signature = JSON.stringify(payload);
    try {
      // Keep the same key after an uncertain response. A changed answer is a new submission.
      if (signature !== previousPayload || !submissionId) { submissionId = id(); previousPayload = signature; }
    } catch (error) { message(error.message, true); return; }
    busy = true; button.disabled = true; form.setAttribute('aria-busy', 'true'); message('Saving your details…', false);
    var controller = new AbortController(), timer = setTimeout(function () { controller.abort(); }, 20000);
    try {
      var response = await fetch(API_BASE + '/api/intake', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ submissionId: submissionId }, payload)), signal: controller.signal
      });
      var result = await response.json();
      if (!response.ok) throw new Error(result.message || 'We couldn’t save your details. Please try again.');
      if (!result.ok || !/^[a-f0-9]{64}$/.test(result.handoff || '')) throw new Error('We couldn’t confirm the next step. Your answers are still here; please try again.');
      try {
        // The server carries the full answers after verification. Only this tab’s email is needed now.
        sessionStorage.setItem(handoffStorage, JSON.stringify({ handoff: result.handoff, email: payload.email, expiresAt: result.expiresAt }));
      } catch (error) { /* The opaque handoff still works; the next page can ask for the same email. */ }
      message('Saved. Opening your setup…', false);
      window.location.assign('/onboard.html' + (plan ? '?plan=' + encodeURIComponent(plan) : '') + '#intake=' + result.handoff);
    } catch (error) {
      message(error.name === 'AbortError' ? 'That took longer than expected. Your answers are still here. Please try again.' : error.message, true);
    } finally {
      clearTimeout(timer); busy = false; button.disabled = false; form.removeAttribute('aria-busy');
    }
  });
})();
