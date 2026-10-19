/**
 * Machines & Cloud front desk agent widget.
 * This is the product: a real agent backed by /api/chat (Netlify Function + Claude).
 * It is labeled as an AI, never pretends to be a person, and degrades to contact
 * details if the backend is unavailable.
 */
(function () {
  'use strict';
  if (document.getElementById('mcAgent')) return;
  if (document.body && document.body.hasAttribute('data-no-widget')) return; // pages with the inline demo

  var ENDPOINT = '/api/chat';
  var STORE_KEY = 'mc_agent_transcript_v1';
  var GREETING = "Hi, I'm the Machines & Cloud front desk agent. I'm an AI, and I'm the same product we build for your business. Ask me what it costs, how it works, or leave your details and Steve will call you.";
  var OFFLINE = 'The agent is offline right now. Email support@machinesandcloud.com or call (346) 248-8359 and a person will reply within one business day.';

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
      '<span>Ask the agent</span>' +
    '</button>' +
    '<section class="mc-agent-panel" id="mcAgentPanel" role="dialog" aria-label="Machines and Cloud front desk agent" hidden>' +
      '<header class="mc-agent-header">' +
        '<div><strong>Front desk agent</strong><span class="mc-agent-sub">AI agent. This is the product we sell.</span></div>' +
        '<button type="button" class="mc-agent-close" id="mcAgentClose" aria-label="Close">&times;</button>' +
      '</header>' +
      '<div class="mc-agent-messages" id="mcAgentMessages" aria-live="polite"></div>' +
      '<form class="mc-agent-form" id="mcAgentForm">' +
        '<label for="mcAgentInput" class="sr-only">Your message</label>' +
        '<textarea id="mcAgentInput" rows="1" placeholder="Ask about pricing, timing, or your business" maxlength="1500" required></textarea>' +
        '<button type="submit" class="btn btn-primary" id="mcAgentSend">Send</button>' +
      '</form>' +
      '<p class="mc-agent-foot">Conversations are logged so Steve can follow up. No medical, legal, or financial advice.</p>' +
    '</section>';
  document.body.appendChild(root);

  var launcher = document.getElementById('mcAgentLauncher');
  var panel = document.getElementById('mcAgentPanel');
  var closeBtn = document.getElementById('mcAgentClose');
  var list = document.getElementById('mcAgentMessages');
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
  function addMessage(role, text) {
    var el = document.createElement('div');
    el.className = 'mc-agent-msg ' + (role === 'user' ? 'user' : 'agent');
    el.innerHTML = linkify(escapeHtml(text)).replace(/\n/g, '<br>');
    list.appendChild(el);
    list.scrollTop = list.scrollHeight;
    return el;
  }
  function showTyping() {
    var el = document.createElement('div');
    el.className = 'mc-agent-msg agent mc-agent-typing';
    el.setAttribute('aria-label', 'Agent is typing');
    el.innerHTML = '<span></span><span></span><span></span>';
    list.appendChild(el);
    list.scrollTop = list.scrollHeight;
    return el;
  }

  function render() {
    list.innerHTML = '';
    addMessage('agent', GREETING);
    transcript.forEach(function (m) { addMessage(m.role, m.content); });
  }

  function open() {
    panel.hidden = false;
    launcher.setAttribute('aria-expanded', 'true');
    root.classList.add('is-open');
    if (!list.childElementCount) render();
    setTimeout(function () { input.focus(); }, 50);
  }
  function close() {
    panel.hidden = true;
    launcher.setAttribute('aria-expanded', 'false');
    root.classList.remove('is-open');
    launcher.focus();
  }

  launcher.addEventListener('click', function () { panel.hidden ? open() : close(); });
  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) close(); });

  // Any element with data-open-agent, or a link to #agent, opens the panel.
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
    if (!text || busy) return;
    busy = true;
    sendBtn.disabled = true;
    input.value = '';
    input.style.height = 'auto';
    transcript.push({ role: 'user', content: text });
    persist();
    addMessage('user', text);
    var typing = showTyping();

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: transcript.slice(-20), page: window.location.pathname })
    })
      .then(function (res) {
        return res.json().then(function (data) { return { ok: res.ok, status: res.status, data: data }; });
      })
      .then(function (r) {
        typing.remove();
        if (!r.ok || !r.data || typeof r.data.reply !== 'string') {
          var msg = (r.data && r.data.error === 'busy')
            ? 'I am getting a lot of questions right now. Give me a minute and try again, or email support@machinesandcloud.com.'
            : OFFLINE;
          addMessage('agent', msg);
          return;
        }
        transcript.push({ role: 'assistant', content: r.data.reply });
        persist();
        addMessage('agent', r.data.reply);
      })
      .catch(function () {
        typing.remove();
        addMessage('agent', OFFLINE);
      })
      .then(function () {
        busy = false;
        sendBtn.disabled = false;
        input.focus();
      });
  });
})();
