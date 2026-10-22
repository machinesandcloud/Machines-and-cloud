// Real microphone/WebRTC practice. Loading this bridge starts no device or provider work.
(function () {
  'use strict';
  const profiles = {
    'bayou-air': { owner: 'Ray', company: 'Bayou Air & Heat' },
    'katy-pipeworks': { owner: 'Dana', company: 'Katy Pipeworks' },
    'westheimer-maids': { owner: 'Nia', company: 'Westheimer Maids' },
  };
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);
  // Local acceptance injects only these dependencies. Production never reads the hook.
  const fixture = local && window.__MC_DEMO_VOICE_TEST_DEPS__ || {};
  const deps = {
    getUserMedia: constraints => navigator.mediaDevices.getUserMedia(constraints),
    loadSDK: () => import('/assets/vendor/vapi-web.js'),
    fetch: (...args) => window.fetch(...args),
    setTimeout: (...args) => window.setTimeout(...args),
    clearTimeout: timer => window.clearTimeout(timer),
    ...fixture,
  };
  let active = null;
  function start(options = {}) {
    active?.destroy();
    let alive = true, ended = false, sdk = null, mic = null, call = null, sdkStopped = false;
    let startTimer = null, callTimer = null;
    let resolveClosed;
    const closed = new Promise(resolve => { resolveClosed = resolve; });
    const abort = new AbortController();
    const emit = (name, data) => { if (!alive || typeof options[name] !== 'function') return; try { options[name](data); } catch { /* UI callback must not leak audio resources. */ } };
    const stopTracks = stream => { for (const track of stream?.getTracks?.() || []) track.stop(); };
    function cleanup() {
      abort.abort(); deps.clearTimeout(startTimer); deps.clearTimeout(callTimer);
      stopTracks(mic);
      if (sdk && !sdkStopped) {
        sdkStopped = true;
        try { sdk.send?.({ type: 'end-call' }); } catch { /* stop still destroys the media session */ }
        try { Promise.resolve(sdk.stop?.()).catch(() => {}); } catch { /* already destroyed */ }
      }
    }
    function finish(reason, silent = false) {
      if (ended) return;
      ended = true;
      if (!silent) { emit('onStatus', { state: 'ended' }); emit('onEnd', { reason }); }
      alive = false; cleanup();
      resolveClosed(null);
      if (active === controller) active = null;
    }
    function fail(code, message) { emit('onError', { code, message }); finish('error'); }
    const controller = { stop: () => finish('stopped'), destroy: () => finish('destroyed', true), ready: null };
    active = controller;
    const valid = Object.hasOwn(profiles, options.persona) && ['en', 'es'].includes(options.language);
    function message(event) {
      if (!alive || !event || typeof event !== 'object') return;
      if (event.type === 'transcript' && typeof event.transcript === 'string') {
        const role = event.role === 'user' ? 'user' : ['assistant', 'bot'].includes(event.role) ? 'assistant' : '';
        if (role) emit('onTranscript', { role, text: event.transcript.slice(0, 1500), isFinal: event.transcriptType === 'final' });
      }
      if (event.type !== 'tool-calls') return;
      for (const tool of event.toolCallList || []) {
        if (tool.function?.name !== 'send_owner_summary') continue;
        let data = tool.function.arguments;
        try { if (typeof data === 'string') data = JSON.parse(data); } catch { continue; }
        const strings = ['customer_name', 'phone', 'address', 'issue', 'requested_window'];
        if (!data || strings.some(field => typeof data[field] !== 'string') || !['emergency', 'today', 'this_week', 'flexible'].includes(data.urgency) || !['en', 'es'].includes(data.language) || !['visit_request', 'callback', 'question_only', 'emergency_handoff'].includes(data.requested_action)) continue;
        const bounded = Object.fromEntries(strings.map(field => [field, data[field].trim().slice(0, 500)]));
        Object.assign(bounded, { urgency: data.urgency, language: data.language, requested_action: data.requested_action });
        emit('onSummary', { type: 'owner_notification', ...profiles[options.persona], data: bounded, at: new Date().toISOString() });
      }
    }
    const work = Promise.resolve().then(async () => {
      if (!alive) return null;
      if (!valid) { fail('invalid_request', 'Choose a supported practice and language.'); return null; }
      if (!fixture.getUserMedia && (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)) { fail('not_supported', 'Voice needs HTTPS and a browser with microphone access.'); return null; }
      emit('onStatus', { state: 'connecting' });
      startTimer = deps.setTimeout(() => fail('timeout', 'Voice took too long to connect. Please try again.'), 30000);
      try {
        mic = await deps.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
        if (!alive) { stopTracks(mic); return null; }
        const loaded = await deps.loadSDK();
        if (!alive) return null;
        const response = await deps.fetch('/api/practice-voice/call/web', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ persona: options.persona, language: options.language }), signal: abort.signal });
        if (!alive) return null;
        const result = await response.json();
        if (!alive) return null;
        if (!response.ok) { const code = ['busy', 'rate_limited', 'daily_limit', 'storage_unavailable'].includes(result.error) ? result.error : 'voice_unavailable'; fail(code, response.status === 429 ? 'Voice practice is busy or has reached its limit. Please try later.' : 'Voice is unavailable right now. You can still type.'); return null; }
        if (typeof result.id !== 'string' || typeof result.webCallUrl !== 'string') throw new Error('Invalid join response');
        call = result;
        const Vapi = loaded.default;
        // reconnect() joins a pre-created room; this placeholder is never used for REST.
        sdk = new Vapi('server-created-practice-room', location.origin + '/api/practice-voice', { avoidEval: true }, { audioSource: mic.getAudioTracks()[0], startAudioOff: false });
        sdk.on('message', message);
        sdk.on('call-start', () => {
          if (!alive) { cleanup(); return; }
          deps.clearTimeout(startTimer);
          emit('onStatus', { state: 'listening' });
          callTimer = deps.setTimeout(() => finish('duration_limit'), 90000);
        });
        sdk.on('speech-start', () => emit('onStatus', { state: 'speaking' }));
        sdk.on('speech-end', () => emit('onStatus', { state: 'listening' }));
        sdk.on('call-end', () => finish('ended'));
        sdk.on('error', () => { if (alive) fail('connection_failed', 'The voice connection ended. Please try again or type.'); });
        await sdk.reconnect(call);
        if (!alive) { cleanup(); return null; }
        return { callId: call.id };
      } catch (error) {
        if (!alive) { cleanup(); return null; }
        if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') fail('microphone_denied', 'Microphone access was denied. Allow it in your browser or type instead.');
        else if (error?.name === 'NotFoundError' || error?.name === 'NotReadableError') fail('microphone_unavailable', 'No usable microphone was found. Check the device or type instead.');
        else fail(error?.name === 'AbortError' ? 'timeout' : 'connection_failed', 'Voice could not connect. Please try again or type.');
        return null;
      }
    });
    controller.ready = Promise.race([work, closed]);
    return controller;
  }
  window.addEventListener('pagehide', () => active?.destroy());
  window.MCDemoVoice = Object.freeze({ start });
})();
