// The walkthrough is local playback. Only an explicit visitor send calls the isolated persona agent.
(function () {
  'use strict';
  var wrap = document.getElementById('demo-wrap');
  if (!wrap) return;
  var el = function (id) { return document.getElementById('example-' + id); };
  var buttons = wrap.querySelectorAll('[data-example]');
  var messages = el('messages'), summary = el('summary'), input = el('input');
  var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var examples = {
    sms: {
      persona: 'bayou-air', company: 'Bayou Air & Heat', channel: 'Text conversation', liveChannel: 'AC repair chat', lang: 'en', customer: 'Customer', agent: 'Front desk',
      greeting: 'Hi! I’m the AI front desk for Bayou Air & Heat. What can I help you with?',
      suggestion: 'My AC is running, but the house isn’t cooling. Do you come out to Katy?',
      messages: [
        ['customer', 'My AC is running, but the house isn’t cooling. Do you come out to Katy?'],
        ['agent', 'Yes, Katy is in our service area. We have tomorrow, 8 to 12 or 12 to 5. Which works for you?'],
        ['customer', 'I’m Alex, (713) 555-0142, at 12 Oak St in Katy. 12 to 5 works.'],
        ['agent', 'You’re booked for tomorrow, 12 to 5. The tech will text when they’re on the way. You’ll get appointment texts from your shop; reply STOP any time to end them.']
      ],
      first: [['Job', 'AC running, not cooling'], ['Where', 'Katy'], ['Window', 'Not chosen yet'], ['Contact', 'Not provided yet'], ['Next', 'Choose an arrival window']],
      summary: [['Job', 'AC running, not cooling'], ['Where', '12 Oak St, Katy'], ['Window', 'Tomorrow, 12 to 5'], ['Contact', 'Alex · (713) 555-0142'], ['Next', 'Text when you’re on the way']]
    },
    call: {
      persona: 'katy-pipeworks', company: 'Katy Pipeworks', channel: 'Call transcript', liveChannel: 'Plumbing chat', lang: 'en', customer: 'Caller', agent: 'Front desk',
      greeting: 'Hi! I’m the AI front desk for Katy Pipeworks. What do you need a hand with?',
      suggestion: 'The kitchen tap keeps dripping. Can a plumber come this week?',
      messages: [
        ['customer', 'The kitchen tap keeps dripping. Can a plumber come this week?'],
        ['agent', 'We can help with that. Thursday’s open windows are 8 to 12 or 12 to 5. Which works for you?'],
        ['customer', '8 to 12. I’m Sam, (713) 555-0151, at 24 Pine St in Katy.'],
        ['agent', 'You’re booked for Thursday, 8 to 12. The plumber will confirm the price on site and text when they’re on the way. You’ll get appointment texts from your shop; reply STOP any time to end them.']
      ],
      first: [['Job', 'Dripping kitchen tap'], ['Where', 'Not provided yet'], ['Window', 'This week, not chosen yet'], ['Contact', 'Not provided yet'], ['Next', 'Choose an arrival window']],
      summary: [['Job', 'Dripping kitchen tap'], ['Where', '24 Pine St, Katy'], ['Window', 'Thursday, 8 to 12'], ['Contact', 'Sam · (713) 555-0151'], ['Next', 'Confirm the price on site']]
    },
    spanish: {
      persona: 'westheimer-maids', company: 'Westheimer Maids', channel: 'Website chat · Español', liveChannel: 'Limpieza · Chat en español', lang: 'es', customer: 'Cliente', agent: 'Recepción',
      greeting: '¡Hola! Soy la recepción con IA de Westheimer Maids. ¿En qué puedo ayudarle?',
      suggestion: 'Hola, necesito una limpieza profunda de mi apartamento en Memorial. ¿Atienden esa zona?',
      messages: [
        ['customer', 'Hola, ¿hacen limpieza de apartamentos en Memorial? Necesito una limpieza profunda.'],
        ['agent', '¡Sí! Atendemos Memorial. ¿Cuántas habitaciones y baños tiene, y de cuántos pies cuadrados es el apartamento?'],
        ['customer', 'Dos habitaciones, dos baños y 1,000 pies cuadrados. Soy Ana, (713) 555-0152, en 36 Elm St, Memorial. ¿Tienen el sábado de 8 a 10?'],
        ['agent', 'Sí, queda reservada su limpieza para el sábado de 8 a 10. Recibirá mensajes de texto sobre su cita de su empresa. Responda STOP o ALTO cuando quiera para dejar de recibirlos.']
      ],
      first: [['Job', 'Apartment deep clean'], ['Where', 'Memorial'], ['Window', 'Not chosen yet'], ['Contact', 'Not provided yet'], ['Language', 'Spanish']],
      summary: [['Job', 'Deep clean · 2 bed, 2 bath · 1,000 sq ft'], ['Where', '36 Elm St, Memorial'], ['Window', 'Saturday, 8 to 10'], ['Contact', 'Ana · (713) 555-0152'], ['Language', 'Spanish']]
    }
  };
  var scenario = 'sms', mode = 'watch', step = 1, playing = false, timer = null;
  var autoStarted = false, visible = false, generation = 0, controller = null, requestTimer = null;
  var history = [], pending = false, typing = null;
  var composerVisible = false;
  function launcherVisibility() { document.body.classList.toggle('site-inline-chat-active', mode === 'live' && composerVisible); }
  function announce(text) { el('status').textContent = text; }
  function rows(data) {
    summary.replaceChildren();
    data.forEach(function (item) {
      var row = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = item[0]; dd.textContent = item[1]; row.append(dt, dd); summary.appendChild(row);
    });
  }
  function bubble(role, text) {
    var row = document.createElement('div'), speaker = document.createElement('span'), p = document.createElement('p');
    row.className = 'site-message site-message-' + role;
    speaker.textContent = role === 'agent' ? examples[scenario].agent : examples[scenario].customer;
    p.textContent = text; row.append(speaker, p); messages.appendChild(row); return row;
  }
  function follow() { messages.scrollTop = messages.scrollHeight; }
  function removeTyping() { if (typing) typing.remove(); typing = null; }
  function showTyping() {
    removeTyping();
    typing = document.createElement('div'); typing.className = 'site-demo-typing'; typing.setAttribute('aria-hidden', 'true');
    var who = mode === 'live' || examples[scenario].messages[step][0] === 'agent' ? examples[scenario].agent : examples[scenario].customer;
    typing.textContent = who + (examples[scenario].lang === 'es' ? ' está escribiendo' : ' is typing');
    var dots = document.createElement('span'); dots.className = 'site-demo-dots'; dots.textContent = '•••'; typing.appendChild(dots); messages.appendChild(typing);
  }
  function watchSummary() {
    var ex = examples[scenario];
    var data = step < 3 ? ex.first : ex.summary.map(function (row) { return row.slice(); });
    if (step === 3 && scenario !== 'spanish') data[4] = ['Next', 'Confirm the visit'];
    rows(data); el('ticket-status').textContent = step === 4 ? 'Example booking' : 'Gathering details';
    el('progress').textContent = step + ' of 4 messages';
  }
  function playbackControls() {
    el('play').hidden = step === 4;
    el('play').textContent = playing ? 'Pause' : step === 4 ? 'Play again' : 'Play';
    el('play').setAttribute('aria-label', playing ? 'Pause the example' : step === 4 ? 'Play the example again' : 'Play the example');
  }
  function pause() { clearTimeout(timer); timer = null; playing = false; removeTyping(); playbackControls(); }
  function nextMessage() {
    if (!playing || mode !== 'watch') return;
    removeTyping(); var m = examples[scenario].messages[step]; bubble(m[0], m[1]); step++; watchSummary(); follow();
    announce(step === 4 ? 'Example complete. The owner summary is ready.' : step + ' of 4 messages shown.');
    if (step === 4) { pause(); return; }
    schedule();
  }
  function schedule() {
    showTyping(); follow();
    timer = setTimeout(nextMessage, 2300);
  }
  function watchStart() {
    pause(); messages.replaceChildren(); step = motion.matches ? 4 : 1;
    examples[scenario].messages.slice(0, step).forEach(function (m) { bubble(m[0], m[1]); });
    messages.scrollTop = 0; watchSummary(); playbackControls();
  }
  function play() {
    autoStarted = true;
    if (motion.matches) { watchStart(); announce('Complete example shown.'); return; }
    if (step === 4) watchStart();
    playing = true; playbackControls(); schedule();
  }
  function cancelRequest() {
    generation++; if (controller) controller.abort(); controller = null;
    clearTimeout(requestTimer); requestTimer = null; pending = false;
    messages.setAttribute('aria-busy', 'false'); input.readOnly = false; el('send').disabled = !input.value.trim(); removeTyping();
  }
  function emptySummary() {
    rows([['Job', 'Waiting for your request'], ['Where', 'Not provided yet'], ['Window', 'Not chosen yet'], ['Contact', 'Not provided yet'], ['Next', 'Tell the front desk what you need']]);
    el('ticket-status').textContent = 'Waiting for details';
  }
  function liveStart() {
    cancelRequest(); history = []; messages.replaceChildren(); bubble('agent', examples[scenario].greeting);
    input.value = ''; input.disabled = false; el('send').disabled = true; el('suggestion').hidden = false; el('error').hidden = true;
    el('summary-link').textContent = 'Owner summary below ↓';
    emptySummary(); messages.scrollTop = 0;
  }
  function render(focus) {
    pause(); cancelRequest();
    var ex = examples[scenario], live = mode === 'live';
    wrap.dataset.mode = mode;
    launcherVisibility();
    buttons.forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.example === scenario));
      button.textContent = button.dataset.example === 'call' && live ? 'Chat with a plumber' : button.dataset.example === 'call' ? 'A call for a plumber' : button.dataset.example === 'sms' ? 'A text about the AC' : 'A chat in Spanish';
    });
    el('mode-watch').setAttribute('aria-pressed', String(!live)); el('mode-live').setAttribute('aria-pressed', String(live));
    el('live').hidden = !live; el('playback').hidden = live; el('reset').hidden = !live;
    el('channel').textContent = live ? ex.liveChannel : ex.channel;
    el('company').textContent = live ? ex.company + ' · AI front desk' : 'Your shop’s AI front desk';
    el('badge').textContent = live ? 'Live AI' : 'Example';
    messages.lang = ex.lang;
    el('context').textContent = live ? 'Practice conversation only. No appointments or messages are sent. Use made-up details.' : 'An example conversation. Watch the details come together for the owner.';
    el('owner-foot').textContent = live ? 'This summary updates from your conversation. In your shop, these details would go straight to you.' : 'A clear handoff, with the conversation there when you need it.';
    el('suggestion').textContent = 'Try: ' + ex.suggestion; el('suggestion').lang = ex.lang;
    input.lang = ex.lang; input.placeholder = ex.lang === 'es' ? 'Cuéntenos qué necesita…' : 'Tell the front desk what you need…';
    if (live) liveStart(); else watchStart();
    if (focus && live) input.focus({ preventScroll: true });
  }
  function liveSummary(events) {
    var event = (events || []).filter(function (e) { return e && e.type === 'owner_notification' && e.data && e.company === examples[scenario].company; }).pop();
    if (!event) return;
    var d = event.data, fields = ['issue', 'address', 'requested_window', 'customer_name', 'phone', 'language', 'urgency'];
    if (!fields.every(function (key) { return typeof d[key] === 'string' && d[key].length <= 2000; }) || !['en', 'es'].includes(d.language) || !['emergency', 'today', 'this_week', 'flexible'].includes(d.urgency)) return;
    var ready = d.issue && d.address && d.requested_window && d.customer_name && d.phone;
    rows([['Job', d.issue || 'Not provided yet'], ['Where', d.address || 'Not provided yet'], ['Window', d.requested_window || 'Not chosen yet'], ['Contact', [d.customer_name, d.phone].filter(Boolean).join(' · ') || 'Not provided yet'], ['Priority', { emergency: 'Urgent', today: 'Today', this_week: 'This week', flexible: 'Not specified' }[d.urgency]], ['Language', d.language === 'es' ? 'Spanish' : 'English'], ['Next', d.urgency === 'emergency' ? 'Urgent handoff to the owner' : ready ? 'Owner reviews the visit request' : 'Review the conversation']]);
    el('ticket-status').textContent = d.urgency === 'emergency' ? 'Urgent request' : ready ? 'Visit request' : 'Gathering details';
    el('summary-link').textContent = 'Owner summary updated ↓';
  }
  function friendlyError(error) {
    if (error.message === 'busy') return 'The front desk is busy. Please try again in a moment.';
    return 'The reply didn’t finish. Your message is below, ready to try again.';
  }
  async function send(event) {
    event.preventDefault();
    var text = input.value.trim();
    if (pending || mode !== 'live' || !text) return;
    if (history.length >= 20) { el('error').hidden = false; el('error').textContent = 'You’ve reached the end of this practice conversation. Choose Start over to try another.'; return; }
    var id = ++generation, prior = history.slice(), userRow = bubble('customer', text), replyRow = null, final = null;
    pending = true; input.value = ''; input.readOnly = true; el('send').disabled = true; el('error').hidden = true; el('suggestion').hidden = true;
    messages.setAttribute('aria-busy', 'true'); showTyping(); follow(); announce('The front desk is replying.');
    controller = new AbortController();
    var signal = controller.signal;
    requestTimer = setTimeout(function () { if (id === generation && controller) controller.abort(); }, 90000);
    function line(data) {
      if (id !== generation) return;
      if (data.t === 'error') throw new Error(data.error || 'upstream');
      if (data.t === 'delta' && typeof data.text === 'string') {
        removeTyping(); if (!replyRow) replyRow = bubble('agent', '');
        var p = replyRow.querySelector('p'); p.textContent = (p.textContent + data.text).slice(0, 12000); follow();
      }
      if (data.t === 'done' && typeof data.reply === 'string' && data.reply.trim() && data.reply.length <= 12000) final = data;
    }
    try {
      var response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ persona: examples[scenario].persona, messages: prior.concat({ role: 'user', content: text }), stream: true, page: '/' }), signal: signal });
      if (id !== generation) return;
      if (!response.ok) throw new Error(response.status === 429 ? 'busy' : 'upstream');
      if (!response.body) throw new Error('upstream');
      var reader = response.body.getReader(), decoder = new TextDecoder(), buffer = '';
      try {
        while (!final) {
          var chunk = await reader.read(); if (id !== generation) return;
          buffer += decoder.decode(chunk.value || new Uint8Array(), { stream: !chunk.done });
          if (buffer.length > 100000) throw new Error('upstream');
          var lines = buffer.split('\n'); buffer = lines.pop();
          for (var i = 0; i < lines.length && !final; i++) if (lines[i].trim()) line(JSON.parse(lines[i]));
          if (chunk.done) { if (!final && buffer.trim()) line(JSON.parse(buffer)); break; }
        }
      } finally { reader.cancel().catch(function () {}); }
      if (id !== generation) return;
      if (!final) throw new Error('upstream');
      removeTyping(); if (!replyRow) replyRow = bubble('agent', ''); replyRow.querySelector('p').textContent = final.reply;
      history = prior.concat({ role: 'user', content: text }, { role: 'assistant', content: final.reply });
      liveSummary(Array.isArray(final.events) ? final.events : []); follow(); announce('Front desk: ' + final.reply);
    } catch (error) {
      if (id !== generation) return;
      userRow.remove(); if (replyRow) replyRow.remove(); removeTyping(); input.value = text;
      el('error').textContent = friendlyError(error); el('error').hidden = false; announce('The reply didn’t finish. You can send your message again.');
    } finally {
      if (id === generation) {
        clearTimeout(requestTimer); requestTimer = null; controller = null; pending = false;
        messages.setAttribute('aria-busy', 'false'); input.readOnly = false; el('send').disabled = !input.value.trim();
      }
    }
  }
  buttons.forEach(function (button) { button.addEventListener('click', function () { if (scenario === button.dataset.example) return; scenario = button.dataset.example; autoStarted = true; render(false); announce(examples[scenario].channel + ' selected.'); }); });
  el('mode-watch').addEventListener('click', function () { if (mode === 'watch') return; mode = 'watch'; autoStarted = true; render(false); announce('Example playback selected. Choose Play to watch.'); });
  el('mode-live').addEventListener('click', function () { if (mode === 'live') return; mode = 'live'; autoStarted = true; render(true); announce('Live AI practice chat ready. No visits are booked or messages sent.'); });
  el('play').addEventListener('click', function () { if (playing) { pause(); announce('Example paused.'); } else play(); });
  el('replay').addEventListener('click', function () { watchStart(); play(); announce('Example restarted.'); });
  el('reset').addEventListener('click', function () { liveStart(); input.focus({ preventScroll: true }); announce('New practice conversation started.'); });
  el('suggestion').addEventListener('click', function () { if (pending) return; input.value = examples[scenario].suggestion; el('send').disabled = false; input.focus({ preventScroll: true }); });
  el('form').addEventListener('submit', send);
  input.addEventListener('input', function () { el('send').disabled = pending || !input.value.trim(); });
  input.addEventListener('keydown', function (event) { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); el('form').requestSubmit(); } });
  document.addEventListener('visibilitychange', function () { if (document.hidden && playing) pause(); });
  window.addEventListener('pagehide', function () { pause(); cancelRequest(); });
  motion.addEventListener('change', function () { if (mode === 'watch') { pause(); watchStart(); } });
  render(false); el('controls').hidden = false; wrap.classList.add('site-demo-ready');
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) { composerVisible = entries[0].isIntersecting; launcherVisibility(); }, { threshold: 0 }).observe(el('form'));
    new IntersectionObserver(function (entries) {
      visible = entries[0].intersectionRatio >= 0.25;
      if (!visible && playing) pause();
      if (visible && !autoStarted && !document.hidden && !motion.matches && mode === 'watch') play();
    }, { threshold: [0, 0.25] }).observe(wrap);
  }
})();
