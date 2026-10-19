/**
 * Machines & Cloud front desk agent widget.
 * This is the product: a real agent backed by /api/chat (Netlify Function + Claude).
 * It is labeled as an AI, never pretends to be a person, streams its replies,
 * and degrades to contact details if the backend is unavailable.
 */
(function () {
  'use strict';
  if (document.getElementById('mcAgent')) return;
  if (document.body && document.body.hasAttribute('data-no-widget')) return;

  var ENDPOINT = '/api/chat';
  var STORE_KEY = 'mc_agent_transcript_v2';
  var GREETING = "Hi, I'm the Machines & Cloud front desk. I'm an AI, the same one we set up for your shop. Ask me about plans, the phone, or how it would work for your business.";
  var OFFLINE = 'The front desk is offline right now. Email support@machinesandcloud.com or call (346) 248-8359 and a person will reply within one business day.';
  var RETRY = 'Something went wrong on my end. Please try that again, or email support@machinesandcloud.com.';
  var BUSY = 'I am getting a lot of questions right now. Give me a minute and try again, or email support@machinesandcloud.com.';
  var CHIPS = ['What does it cost?', 'Can it answer my phone?', 'What about Thumbtack and Angi leads?', 'How fast can I be live?'];
  var TIMEOUT_MS = 45000;

  var transcript = [];
  try {
    var saved = sessionStorage.getItem(STORE_KEY);
    if (saved) transcript = JSON.parse(saved) || [];
  } catch (e) { transcript = []; }

  function persist() {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(transcript.slice(-20))); } catch (e) { /* ignore */ }
  }

  // ---------- DOM ----------
  var root = document.createElement('div');
  root.id = 'mcAgent';
  root.className = 'mc-agent';
  root.innerHTML =
    '<button type="button" class="mc-agent-launcher" id="mcAgentLauncher" aria-expanded="false" aria-controls="mcAgentPanel">' +
      '<span class="mc-agent-launcher-dot" aria-hidden="true"></span>' +
      '<span>Ask the front desk</span>' +
    '</button>' +
    '<section class="mc-agent-panel" id="mcAgentPanel" role="dialog" aria-label="Machines and Cloud front desk" hidden>' +
      '<header class="mc-agent-header">' +
        '<div><strong>Front desk</strong><span class="mc-agent-sub">AI. The same one we set up for you.</span></div>' +
        '<div class="mc-agent-header-actions">' +
          '<button type="button" class="mc-agent-reset" id="mcAgentReset" title="Start over">New chat</button>' +
          '<button type="button" class="mc-agent-close" id="mcAgentClose" aria-label="Close">&times;</button>' +
        '</div>' +
      '</header>' +
      '<div class="mc-agent-messages" id="mcAgentMessages" aria-live="polite"></div>' +
      '<div class="mc-agent-chips" id="mcAgentChips" hidden></div>' +
      '<form class="mc-agent-form" id="mcAgentForm">' +
        '<label for="mcAgentInput" class="sr-only">Your message</label>' +
        '<textarea id="mcAgentInput" rows="1" placeholder="Ask anything about your shop" maxlength="1500" required></textarea>' +
        '<button type="submit" class="btn btn-primary" id="mcAgentSend" aria-label="Send">Send</button>' +
      '</form>' +
      '<p class="mc-agent-foot">Conversations are logged so Steve can follow up. No medical, legal, or financial advice.</p>' +
    '</section>';
  document.body.appendChild(root);

  var launcher = document.getElementById('mcAgentLauncher');
  var panel = document.getElementById('mcAgentPanel');
  var closeBtn = document.getElementById('mcAgentClose');
  var resetBtn = document.getElementById('mcAgentReset');
  var list = document.getElementById('mcAgentMessages');
  var chips = document.getElementById('mcAgentChips');
  var form = document.getElementById('mcAgentForm');
  var input = document.getElementById('mcAgentInput');
  var sendBtn = document.getElementById('mcAgentSend');
  var busy = false;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function linkify(escaped) {
    return escaped.replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  }
  function renderText(el, text) {
    el.innerHTML = linkify(escapeHtml(text)).replace(/\n/g, '<br>');
  }
  function scrollDown() { list.scrollTop = list.scrollHeight; }
  function addMessage(role, text) {
    var el = document.createElement('div');
    el.className = 'mc-agent-msg ' + (role === 'user' ? 'user' : 'agent');
    renderText(el, text);
    list.appendChild(el);
    scrollDown();
    return el;
  }
  function showTyping() {
    var el = document.createElement('div');
    el.className = 'mc-agent-msg agent mc-agent-typing';
    el.setAttribute('aria-label', 'Front desk is typing');
    el.innerHTML = '<span></span><span></span><span></span>';
    list.appendChild(el);
    scrollDown();
    return el;
  }
  function renderChips() {
    chips.innerHTML = '';
    if (transcript.length) { chips.hidden = true; return; }
    CHIPS.forEach(function (q) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'mc-agent-chip'; b.textContent = q;
      b.addEventListener('click', function () { send(q); });
      chips.appendChild(b);
    });
    chips.hidden = false;
  }
  function render() {
    list.innerHTML = '';
    addMessage('agent', GREETING);
    transcript.forEach(function (m) { addMessage(m.role, m.content); });
    renderChips();
  }

  function open() {
    panel.hidden = false;
    launcher.setAttribute('aria-expanded', 'true');
    root.classList.add('is-open');
    if (!list.childElementCount) render();
    setTimeout(function () { input.focus(); scrollDown(); }, 50);
  }
  function close() {
    panel.hidden = true;
    launcher.setAttribute('aria-expanded', 'false');
    root.classList.remove('is-open');
    launcher.focus();
  }
  function reset() {
    if (busy) return;
    transcript = [];
    persist();
    render();
    input.focus();
  }

  launcher.addEventListener('click', function () { panel.hidden ? open() : close(); });
  closeBtn.addEventListener('click', close);
  resetBtn.addEventListener('click', reset);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) close(); });
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-open-agent], a[href="#agent"]');
    if (!t) return;
    e.preventDefault();
    open();
  });
  if (window.location.hash === '#agent') open();

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
  });
  input.addEventListener('input', function () {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = input.value.trim();
    if (!text) return;
    input.value = '';
    input.style.height = 'auto';
    send(text);
  });

  function errorText(status, code) {
    if (code === 'busy' || status === 429) return BUSY;
    if (code === 'offline' || status === 503) return OFFLINE;
    return RETRY;
  }

  // Reads an NDJSON stream. Calls onLine(obj) for each line. Resolves when the stream ends.
  function readStream(body, onLine) {
    var reader = body.getReader();
    var decoder = new TextDecoder();
    var buffer = '';
    function pump() {
      return reader.read().then(function (r) {
        if (r.done) {
          if (buffer.trim()) { try { onLine(JSON.parse(buffer)); } catch (e) { /* ignore */ } }
          return;
        }
        buffer += decoder.decode(r.value, { stream: true });
        var lines = buffer.split('\n');
        buffer = lines.pop();
        lines.forEach(function (line) {
          if (!line.trim()) return;
          try { onLine(JSON.parse(line)); } catch (e) { /* ignore */ }
        });
        return pump();
      });
    }
    return pump();
  }

  function send(text) {
    if (!text || busy) return;
    busy = true;
    sendBtn.disabled = true;
    chips.hidden = true;
    transcript.push({ role: 'user', content: text });
    persist();
    addMessage('user', text);
    var typing = showTyping();
    var bubble = null;
    var full = '';
    var done = false;
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (controller) controller.abort(); }, TIMEOUT_MS);

    function onDelta(t) {
      if (!bubble) { typing.remove(); bubble = addMessage('agent', ''); }
      full += t;
      renderText(bubble, full);
      scrollDown();
    }
    function finish(reply) {
      if (done) return;
      done = true;
      if (typing.parentNode) typing.remove();
      if (!bubble) bubble = addMessage('agent', reply);
      else renderText(bubble, reply);
      transcript.push({ role: 'assistant', content: reply });
      persist();
      scrollDown();
    }
    function fail(msg) {
      if (done) return;
      done = true;
      if (typing.parentNode) typing.remove();
      if (bubble && full) { transcript.push({ role: 'assistant', content: full }); persist(); }
      addMessage('agent', msg);
    }

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: transcript.slice(-20), page: window.location.pathname, stream: true }),
      signal: controller ? controller.signal : undefined
    })
      .then(function (res) {
        var type = res.headers.get('content-type') || '';
        if (!res.ok || type.indexOf('json') === -1 && type.indexOf('ndjson') === -1) {
          return res.json().catch(function () { return {}; }).then(function (d) { fail(errorText(res.status, d && d.error)); });
        }
        if (type.indexOf('ndjson') !== -1 && res.body && res.body.getReader) {
          return readStream(res.body, function (o) {
            if (o.t === 'delta') onDelta(o.text || '');
            else if (o.t === 'done') finish(o.reply || full);
            else if (o.t === 'error') fail(errorText(0, o.error));
          }).then(function () { if (!done) { if (full) finish(full); else fail(RETRY); } });
        }
        return res.json().then(function (d) {
          if (d && typeof d.reply === 'string') finish(d.reply); else fail(errorText(res.status, d && d.error));
        });
      })
      .catch(function (err) {
        fail(err && err.name === 'AbortError' ? RETRY : OFFLINE);
      })
      .then(function () {
        clearTimeout(timer);
        busy = false;
        sendBtn.disabled = false;
        input.focus();
      });
  }
})();
