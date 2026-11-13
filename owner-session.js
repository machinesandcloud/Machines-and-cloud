// Owner sign-in shared by every tab of this browser.
// The secret session is an HttpOnly, SameSite=Strict cookie that page code cannot read. Pages hold only a tab
// handle derived from it, which authenticates nothing without that cookie. This script runs before the setup and
// workspace scripts and copies the browser's current handle into this tab's session storage, which they read.
(function () {
  'use strict';
  var KEY = 'mc-onboarding-session-v1', SOURCE = 'mc-owner-session-source-v1', HANDLE = 'mc-owner-tab-handle-v1', CHANNEL = 'mc-owner-session-v1';
  var valid = function (value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); };
  function shared() { try { var value = localStorage.getItem(HANDLE); return valid(value) ? value : null; } catch (error) { return null; } }
  function stored() { try { return sessionStorage.getItem(KEY); } catch (error) { return null; } }
  function forget(value) {
    try { if (value && localStorage.getItem(HANDLE) === value) localStorage.removeItem(HANDLE); } catch (error) { /* Nothing secret is kept here. */ }
    try { if (sessionStorage.getItem(SOURCE) === 'cookie' && (!value || sessionStorage.getItem(KEY) === value)) { sessionStorage.removeItem(KEY); sessionStorage.removeItem(SOURCE); } } catch (error) { /* Nothing secret is kept here. */ }
  }
  try {
    // The browser's current sign-in wins over an earlier cookie sign-in in this tab. A tab still holding an older
    // per-tab session (sign-in before this change) keeps it until that session ends.
    var handle = shared(), current = sessionStorage.getItem(KEY);
    if (handle && (!current || sessionStorage.getItem(SOURCE) === 'cookie')) { sessionStorage.setItem(KEY, handle); sessionStorage.setItem(SOURCE, 'cookie'); }
  } catch (error) { /* Without tab storage the page shows the email sign-in. */ }
  // A rejected handle (expired, revoked, or the cookie ended with the browser) is dropped so later tabs ask to sign in.
  document.addEventListener('mc:session-expired', function () { var value = stored(); if (valid(value)) forget(value); });
  var channel = null; try { channel = new BroadcastChannel(CHANNEL); } catch (error) { channel = null; }
  if (channel) channel.onmessage = function (event) {
    var message = event.data || {};
    // Only tabs holding the session that was signed out react; the server has already revoked it.
    if (['signed_out', 'replaced', 'renewed'].indexOf(message.type) < 0 || !valid(message.handle) || stored() !== message.handle) return;
    // The same owner signed in again: a page that can continue on the new handle claims the event (setup keeps the
    // owner's answers); any other page closes with "signed in again", never "another account".
    if (message.type === 'renewed' && message.same === true && valid(message.next)) {
      var renewal = new CustomEvent('mc:session-renewed', { cancelable: true, detail: { previous: message.handle, handle: message.next } });
      if (!document.dispatchEvent(renewal)) return;
    }
    document.dispatchEvent(new CustomEvent('mc:session-expired', { detail: { reason: message.type } }));
  };
  window.MCOwnerSession = {
    adopt: function (value, replaced, previousHandle) {
      if (!valid(value)) return;
      // A new sign-in in this browser revoked the session other tabs still hold; close them now.
      // Only a different mailbox is reported as another account; the same owner signing in again is a renewal.
      var previous = shared();
      try { sessionStorage.setItem(KEY, value); sessionStorage.setItem(SOURCE, 'cookie'); } catch (error) { /* In-memory sign-in continues on this page. */ }
      try { localStorage.setItem(HANDLE, value); } catch (error) { /* Other tabs will ask for an email link. */ }
      // Only the server's "same_account" for this browser's exact previous handle lets other tabs continue on the new one.
      // If the stored handle is not the one the cookie held (a sign-in whose page never adopted it), it is an unknown session.
      if (channel && previous && previous !== value) channel.postMessage(replaced === 'other_account' ? { type: 'replaced', handle: previous } : { type: 'renewed', handle: previous, next: value, same: replaced === 'same_account' && valid(previousHandle) && previousHandle === previous });
    },
    rejected: function (value) { if (valid(value)) forget(value); },
    // A page that continues after a same-owner renewal moves this tab onto the browser's new handle.
    follow: function (value) { if (!valid(value)) return false; try { sessionStorage.setItem(KEY, value); sessionStorage.setItem(SOURCE, 'cookie'); } catch (error) { /* The page keeps the handle in memory. */ } return true; },
    signedOut: function (value) { forget(value); if (channel && valid(value)) channel.postMessage({ type: 'signed_out', handle: value }); }
  };
})();
