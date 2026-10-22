/** Machines & Cloud sales adviser. Only completed exchanges become model context. */
(function () {
  'use strict';
  if (document.getElementById('mcAgent') || document.body.hasAttribute('data-no-widget')) return;
  var meta = document.querySelector('meta[name="mc-api-base"]');
  var ENDPOINT = (meta && meta.content ? meta.content.replace(/\/$/, '') : '') + '/api/chat';
  var STORE_KEY = 'mc_sales_desk_v3';
  var GREETING = "What gets in the way at your shop? Tell me a little about it. I can work through a tricky customer request, draft a response, or check how our front desk would fit.";
  var OFFLINE = 'I can’t connect right now. Your question is saved. You can retry, or use “Talk with us” below to choose a time.';
  var RETRY = 'That reply didn’t finish. You can retry without losing your question.';
  var CHIPS = [
    ['Show me a customer reply', 'Show me how you would handle a customer asking for help at my shop.'],
    ['Would this fit my shop?', 'Help me figure out whether your front desk would fit my shop.'],
    ['Work out my call volume', 'Help me work out how much of my call volume would need covering.'],
    ['Hablemos en español', 'Hablemos en español. ¿Cómo ayudaría a mi negocio?']
  ];
  // Navigation is chosen by an explicit visitor click, never by arbitrary model URLs.
  var ACTIONS = {
    start_workspace: { href: '/#pilot', label: 'Get started' },
    see_example: { href: '/#demo-wrap', label: 'Try an example' },
    contact: { href: 'https://calendly.com/ngoumnaisteve/30', label: 'Choose a time to talk' }
  };
  var MAX_TURNS = 60, TIMEOUT_MS = 85000;
  var transcript = [], restoredDraft = '', failedText = '', active = null, generation = 0;
  try {
    var saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || 'null');
    if (saved && saved.version === 3 && Array.isArray(saved.turns) && saved.turns.length <= MAX_TURNS && saved.turns.length % 2 === 0 && saved.turns.every(function (m, i) {
      return m && m.role === (i % 2 ? 'assistant' : 'user') && typeof m.content === 'string' && m.content.trim() && m.content.length <= (i % 2 ? 16000 : 1500);
    })) {
      transcript = saved.turns.map(function (m) { return { role: m.role, content: m.content, events: cleanEvents(m.events) }; });
      restoredDraft = typeof saved.draft === 'string' ? saved.draft.slice(0, 1500) : '';
      failedText = typeof saved.failed === 'string' ? saved.failed.slice(0, 1500) : '';
    }
  } catch (_) { /* Invalid or inaccessible tab storage starts a fresh conversation. */ }
  function persist() {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify({ version: 3, turns: transcript, draft: input ? input.value : restoredDraft, failed: failedText })); } catch (_) {}
  }
  function cleanEvents(events) {
    if (!Array.isArray(events)) return [];
    return events.slice(0, 6).filter(function (e) {
      return e && (e.type === 'sales_action' && Object.prototype.hasOwnProperty.call(ACTIONS, e.action) || (e.type === 'sales_estimate' || e.type === 'sales_fit') && e.data && typeof e.data === 'object');
    });
  }
  function el(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  var root = el('div', 'mc-agent'); root.id = 'mcAgent';
  root.innerHTML = '<button type="button" class="mc-agent-launcher" id="mcAgentLauncher" aria-expanded="false" aria-controls="mcAgentPanel"><span class="mc-agent-launcher-dot" aria-hidden="true"></span><span>Ask the front desk</span></button>' +
    '<section class="mc-agent-panel" id="mcAgentPanel" role="dialog" aria-modal="true" aria-labelledby="mcAgentTitle" hidden>' +
    '<header class="mc-agent-header"><div class="mc-agent-brand"><span class="mc-agent-avatar" aria-hidden="true">M<span>&</span>C</span><div><strong id="mcAgentTitle">Ask the front desk</strong><span class="mc-agent-sub">AI adviser · Machines &amp; Cloud</span></div></div><div class="mc-agent-header-actions"><button type="button" class="mc-agent-reset" id="mcAgentReset">New chat</button><button type="button" class="mc-agent-close" id="mcAgentClose" aria-label="Close chat">&times;</button></div></header>' +
    '<div class="mc-agent-messages" id="mcAgentMessages" role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions"></div>' +
    '<div class="mc-agent-chips" id="mcAgentChips"></div>' +
    '<div class="mc-agent-status" id="mcAgentStatus" role="status"></div>' +
    '<form class="mc-agent-form" id="mcAgentForm"><label for="mcAgentInput" class="sr-only">Your message</label><textarea id="mcAgentInput" rows="1" placeholder="Tell me about your shop…" maxlength="1500" required></textarea><button type="submit" class="btn btn-primary" id="mcAgentSend">Send</button><button type="button" class="mc-agent-stop" id="mcAgentStop" hidden>Stop</button></form>' +
    '<div class="mc-agent-bottom"><p class="mc-agent-foot">AI assistant. History saved for this tab. Messages go to our AI provider. <a href="/privacy">Privacy</a></p><div class="mc-agent-bottom-actions"><button type="button" class="mc-agent-save" id="mcAgentSave">Save chat</button><a href="https://calendly.com/ngoumnaisteve/30" target="_blank" rel="noopener noreferrer">Talk with us</a></div></div></section>';
  document.body.appendChild(root);
  var launcher = document.getElementById('mcAgentLauncher'), panel = document.getElementById('mcAgentPanel');
  var closeBtn = document.getElementById('mcAgentClose'), resetBtn = document.getElementById('mcAgentReset');
  var list = document.getElementById('mcAgentMessages'), chips = document.getElementById('mcAgentChips');
  var form = document.getElementById('mcAgentForm'), input = document.getElementById('mcAgentInput');
  var sendBtn = document.getElementById('mcAgentSend'), stopBtn = document.getElementById('mcAgentStop');
  var status = document.getElementById('mcAgentStatus'), saveBtn = document.getElementById('mcAgentSave');
  var lastFocus = null, inertNodes = [], failureRow = null, viewport;
  input.value = restoredDraft;

  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // DOM-built links keep attributes separate from text, including quotes and HTML in a response.
  function inline(target, text) {
    var parts = String(text).split(/(\*\*[^*]+\*\*|\[[^\]\n]+\]\([^\s)]+\)|https?:\/\/[^\s<>]+)/g);
    parts.forEach(function (part) {
      if (!part) return;
      if (/^\*\*[^*]+\*\*$/.test(part)) { target.appendChild(el('strong', '', part.slice(2, -2))); return; }
      var md = part.match(/^\[([^\]\n]+)\]\(([^\s)]+)\)$/), trailing = md ? '' : (part.match(/[.,;!?)\]]+$/) || [''])[0];
      var href = md ? md[2] : trailing ? part.slice(0, -trailing.length) : part;
      if (md || /^https?:\/\//.test(part)) {
        try {
          var url = new URL(href, window.location.origin);
          var own = url.origin === window.location.origin || /^https:\/\/(www\.)?machinesandcloud\.com$/.test(url.origin);
          var safePath = /^\/(?:index\.html|onboard(?:\.html)?|desk(?:\.html)?|privacy(?:\.html)?|terms(?:\.html)?|about(?:\.html)?|text-messaging-terms(?:\.html)?)?$/.test(url.pathname);
          var safeQuery = !url.search || (url.pathname === '/' || url.pathname === '/index.html') && /^\?example=(sms|call|spanish)$/.test(url.search);
          var safeHash = !url.hash || /^#(week|demo-wrap|plans|pilot|faq|top|rules)$/.test(url.hash);
          var contact = url.href === ACTIONS.contact.href;
          // Public product routes and our fixed scheduling page are the only actionable destinations.
          if ((contact || own && safePath && safeQuery && safeHash) && !url.username && !url.password && (url.protocol === 'http:' || url.protocol === 'https:')) {
            var a = el('a', '', md ? md[1] : href); a.href = contact ? ACTIONS.contact.href : url.pathname + url.search + url.hash;
            if (contact) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
            target.appendChild(a); if (trailing) target.appendChild(document.createTextNode(trailing)); return;
          }
        } catch (_) {}
      }
      target.appendChild(document.createTextNode(part));
    });
  }
  function renderText(target, text) {
    target.replaceChildren();
    var para = [], currentList = null, lines = String(text).replace(/\r/g, '').split('\n');
    function paragraph() { if (para.length) { var p = el('p'); inline(p, para.join(' ')); target.appendChild(p); para = []; } }
    function cells(raw) {
      var value = raw.trim().replace(/^\|/, '').replace(/\|$/, '');
      if (value.indexOf('|') < 0) return null;
      return value.split(/\|/).map(function (cell) { return cell.trim(); });
    }
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim(), m, header = cells(line), separator = cells(lines[i + 1] || '');
      if (header && separator && header.length === separator.length && separator.every(function (cell) { return /^:?-{3,}:?$/.test(cell); })) {
        paragraph(); currentList = null;
        var wrap = el('div', 'mc-agent-table-wrap'), table = el('table', 'mc-agent-table'), head = el('thead'), body = el('tbody'), tr = el('tr');
        wrap.tabIndex = 0; wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-label', 'Comparison table');
        header.forEach(function (cell) { var th = el('th'); th.scope = 'col'; inline(th, cell); tr.appendChild(th); });
        head.appendChild(tr); table.appendChild(head); i++;
        while (i + 1 < lines.length) {
          var row = cells(lines[i + 1]);
          if (!row || row.length !== header.length) break;
          tr = el('tr'); row.forEach(function (cell) { var td = el('td'); inline(td, cell); tr.appendChild(td); }); body.appendChild(tr); i++;
        }
        table.appendChild(body); wrap.appendChild(table); target.appendChild(wrap); continue;
      }
      if (!line) { paragraph(); currentList = null; continue; }
      if ((m = line.match(/^([-*•]|\d+[.)])\s+(.*)$/))) {
        paragraph(); var type = /^\d/.test(m[1]) ? 'OL' : 'UL';
        if (!currentList || currentList.tagName !== type) { currentList = el(type.toLowerCase()); target.appendChild(currentList); }
        var li = el('li'); inline(li, m[2]); currentList.appendChild(li); continue;
      }
      currentList = null;
      if ((m = line.match(/^>\s?(.*)$/))) { paragraph(); var q = el('blockquote'); inline(q, m[1]); target.appendChild(q); continue; }
      para.push(line.replace(/^#{1,4}\s+/, ''));
    }
    paragraph();
  }
  function scrollDown(force) { if (force || list.scrollHeight - list.scrollTop - list.clientHeight < 160) list.scrollTop = list.scrollHeight; }
  function addMessage(role, text) {
    var row = el('div', 'mc-agent-row ' + role), label = el('span', 'mc-agent-speaker', role === 'user' ? 'You' : 'Front desk');
    var bubble = el('div', 'mc-agent-msg ' + (role === 'user' ? 'user' : 'agent'));
    renderText(bubble, text); row.append(label, bubble); list.appendChild(row); scrollDown(true); return bubble;
  }
  function renderEvents(bubble, events) {
    cleanEvents(events).filter(function (e) { return e.type === 'sales_estimate' || e.type === 'sales_fit'; }).slice(-1).forEach(function (event) {
      var data = event.data, card = el('details', 'mc-agent-card'), summary = el('summary'), body = el('div', 'mc-agent-card-body');
      if (event.type === 'sales_estimate' && data.kind === 'call_volume') {
        var valid = function (n) { return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n < 1000000000; };
        summary.textContent = valid(data.routedMinutes) ? data.routedMinutes.toLocaleString() + ' routed minutes / month' : 'Call-volume planning estimate';
        var dl = el('dl');
        [['Total call minutes', data.totalMinutes], ['Missed-call minutes', data.missedMinutes], ['Minutes routed to AI', data.routedMinutes]].forEach(function (row) {
          var div = el('div'); div.append(el('dt', '', row[0]), el('dd', '', valid(row[1]) ? row[1].toLocaleString() : 'Not established')); dl.appendChild(div);
        });
        body.appendChild(dl);
        if (Array.isArray(data.assumptions) && data.assumptions.length) body.appendChild(el('p', '', 'Assumptions: ' + data.assumptions.filter(function (s) { return typeof s === 'string'; }).slice(0, 5).join('; ').slice(0, 1000)));
        body.appendChild(el('p', '', 'Planning only. Phone service needs separate activation. This starts no subscription and predicts no booked jobs.'));
      } else if (event.type === 'sales_fit' && data.kind === 'workflow_fit' && ['current_fit', 'not_current_fit', 'clarify'].indexOf(data.fit) >= 0) {
        summary.textContent = data.fit === 'not_current_fit' ? 'Fit check: a requirement is unavailable' : data.fit === 'current_fit' ? 'Fit check: website workflow' : 'Fit check: clarify your must-haves';
        var gaps = Array.isArray(data.gaps) ? data.gaps : [];
        gaps.slice(0, 5).forEach(function (gap) { if (gap && typeof gap.detail === 'string') body.appendChild(el('p', '', gap.detail.slice(0, 600))); });
        body.appendChild(el('p', '', 'Website chat requires your review, a private test and activation. A useful website feature does not replace an unavailable requirement.'));
      } else return;
      card.append(summary, body); bubble.appendChild(card);
    });
    var actions = cleanEvents(events).filter(function (e) { return e.type === 'sales_action'; });
    if (actions.length) {
      var group = el('div', 'mc-agent-next'); group.setAttribute('aria-label', 'Optional next steps');
      var seen = {};
      actions.forEach(function (event) {
        if (seen[event.action]) return; seen[event.action] = true;
        var def = ACTIONS[event.action], a = el('a', 'mc-agent-action', typeof event.label === 'string' && event.label.length <= 60 ? event.label : def.label);
        a.href = def.href;
        if (event.action === 'contact') { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
        if (event.action === 'start_workspace') {
          a.addEventListener('click', function (e) {
            close();
            var intake = document.getElementById('signup-intake');
            if (intake) { e.preventDefault(); intake.scrollIntoView({ block: 'center', behavior: 'instant' }); document.getElementById('intake-name').focus({ preventScroll: true }); }
          });
        }
        if (event.action === 'see_example') {
          var scenario = ['sms', 'call', 'spanish'].indexOf(event.scenario) >= 0 ? event.scenario : 'none';
          if (scenario !== 'none') a.href = '/?example=' + scenario + '#demo-wrap';
          a.addEventListener('click', function (e) {
            close();
            if (document.getElementById('demo-wrap')) { e.preventDefault(); document.dispatchEvent(new CustomEvent('mc:show-example', { detail: { scenario: scenario } })); }
          });
        }
        group.appendChild(a);
      });
      bubble.appendChild(group);
    }
    var copy = el('button', 'mc-agent-copy', 'Copy reply'); copy.type = 'button';
    copy.addEventListener('click', function () {
      var original = bubble.dataset.reply || '';
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(original).then(function () { copy.textContent = 'Copied'; }, function () { copy.textContent = 'Use Save chat to keep this reply'; });
      else copy.textContent = 'Use Save chat to keep this reply';
    });
    bubble.appendChild(copy);
  }
  function renderChips() {
    chips.replaceChildren(); chips.hidden = transcript.length > 0 || !!failedText;
    CHIPS.forEach(function (choice) { var b = el('button', 'mc-agent-chip', choice[0]); b.type = 'button'; b.addEventListener('click', function () { send(choice[1]); }); chips.appendChild(b); });
  }
  function render() {
    list.replaceChildren(); addMessage('agent', GREETING);
    transcript.forEach(function (m) { var b = addMessage(m.role, m.content); if (m.role === 'assistant') { b.dataset.reply = m.content; renderEvents(b, m.events); } });
    renderChips(); if (failedText) showFailure(failedText, RETRY);
    updateControls();
  }
  function updateControls() {
    var busy = !!active, limit = transcript.length >= MAX_TURNS || transcript.reduce(function (n, m) { return n + m.content.length; }, 0) > 118500;
    sendBtn.hidden = busy; stopBtn.hidden = !busy; sendBtn.disabled = busy || limit;
    input.disabled = limit;
    list.setAttribute('aria-busy', String(busy));
    if (limit) status.textContent = 'Save this conversation, then choose New chat to continue.';
    else if (!busy && !failedText) status.textContent = '';
  }
  function resizeInput() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 110) + 'px'; }
  function fitViewport() {
    if (!window.visualViewport) return;
    var v = window.visualViewport;
    root.style.setProperty('--mc-view-height', v.height + 'px');
    root.style.setProperty('--mc-keyboard-inset', Math.max(0, window.innerHeight - v.height - v.offsetTop) + 'px');
  }
  function open() {
    if (!panel.hidden) return;
    lastFocus = document.activeElement; panel.hidden = false; launcher.setAttribute('aria-expanded', 'true'); root.classList.add('is-open');
    Array.prototype.forEach.call(document.body.children, function (node) {
      if (node !== root && node.tagName !== 'SCRIPT' && !node.inert) { node.inert = true; inertNodes.push(node); }
    });
    if (!list.childElementCount) render(); fitViewport(); input.disabled ? resetBtn.focus() : input.focus(); scrollDown(true);
  }
  function close() {
    if (panel.hidden) return;
    panel.hidden = true; launcher.setAttribute('aria-expanded', 'false'); root.classList.remove('is-open');
    inertNodes.forEach(function (node) { node.inert = false; }); inertNodes = [];
    if (lastFocus && lastFocus.isConnected && !lastFocus.closest('#mcAgentPanel')) lastFocus.focus(); else launcher.focus();
  }
  function reset() {
    generation++; if (active) { active.controller.abort(); clearTimeout(active.timer); active = null; }
    transcript = []; failedText = ''; failureRow = null; input.value = ''; status.textContent = ''; persist(); render(); resizeInput(); input.focus();
  }
  launcher.addEventListener('click', function () { panel.hidden ? open() : close(); });
  closeBtn.addEventListener('click', close); resetBtn.addEventListener('click', reset);
  document.addEventListener('keydown', function (e) {
    if (panel.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    var focusable = Array.prototype.filter.call(panel.querySelectorAll('button:not([disabled]), a[href], textarea:not([disabled])'), function (n) { return !n.hidden && n.getClientRects().length; });
    if (!focusable.length) return;
    var first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
  });
  document.addEventListener('click', function (e) { var t = e.target.closest('[data-open-agent], a[href="#agent"]'); if (t) { e.preventDefault(); open(); } });
  if (window.visualViewport) { viewport = window.visualViewport; viewport.addEventListener('resize', fitViewport); viewport.addEventListener('scroll', fitViewport); }
  input.addEventListener('input', function () { resizeInput(); persist(); });
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); if (!active) form.requestSubmit(); } });
  form.addEventListener('submit', function (e) {
    e.preventDefault(); if (active) return;
    var text = input.value.trim(); if (!text) return;
    if (send(text)) { input.value = ''; resizeInput(); persist(); }
  });
  saveBtn.addEventListener('click', function () {
    var text = 'Machines & Cloud · AI conversation\n\n' + transcript.map(function (m) { return (m.role === 'user' ? 'You' : 'Front desk') + '\n' + m.content; }).join('\n\n');
    if (failedText) text += '\n\nUnanswered question\n' + failedText;
    var url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    var a = el('a'); a.href = url; a.download = 'machines-and-cloud-conversation.txt'; a.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  });
  stopBtn.addEventListener('click', function () { if (active) { active.stopped = true; active.controller.abort(); } });
  function errorText(code, statusCode) {
    if (code === 'sales_daily_limit') return 'Today’s AI allowance is used up. Save your chat and come back after the daily reset, or use “Talk with us” to choose a time.';
    if (code === 'busy' || statusCode === 429) return 'The front desk is busy right now. Your question is saved; please try again later.';
    if (code === 'offline' || statusCode === 503) return OFFLINE;
    return RETRY;
  }
  function showFailure(text, message) {
    if (failureRow && failureRow.isConnected) failureRow.remove();
    var user = addMessage('user', text); failureRow = user.parentElement;
    failureRow.classList.add('mc-agent-unanswered');
    var note = el('div', 'mc-agent-error', message), retry = el('button', 'mc-agent-retry', 'Retry this question'); retry.type = 'button';
    retry.addEventListener('click', function () { send(text); }); note.appendChild(retry); failureRow.appendChild(note); scrollDown(true);
  }
  async function readStream(body, onLine) {
    var reader = body.getReader(), decoder = new TextDecoder(), buffer = '';
    try {
      while (true) {
        var r = await reader.read(); buffer += decoder.decode(r.value || new Uint8Array(), { stream: !r.done });
        var lines = buffer.split('\n'); buffer = lines.pop();
        for (var i = 0; i < lines.length; i++) if (lines[i].trim() && onLine(JSON.parse(lines[i])) === false) return;
        if (buffer.length > 180000) throw new Error('Oversized chat stream');
        if (r.done) { if (buffer.trim()) onLine(JSON.parse(buffer)); return; }
      }
    } finally { try { await reader.cancel(); } catch (_) {} reader.releaseLock(); }
  }
  function send(text) {
    if (!text || active || input.disabled) return false;
    text = text.trim().slice(0, 1500); if (!text) return false;
    if (failureRow && failureRow.isConnected) failureRow.remove(); failureRow = null; failedText = '';
    var request = { controller: new AbortController(), generation: generation, terminal: false, stopped: false, timer: null };
    active = request; updateControls(); chips.hidden = true; status.textContent = 'Working through your question…';
    var userBubble = addMessage('user', text), typing = el('div', 'mc-agent-thinking', 'Working through your question…'); list.appendChild(typing);
    var bubble = null, full = '';
    function current() { return active === request && generation === request.generation && !request.terminal; }
    function delta(piece) {
      if (!current() || typeof piece !== 'string') return;
      full += piece; if (full.length > 16000) throw new Error('Oversized chat reply');
      if (!bubble) { typing.remove(); bubble = addMessage('agent', ''); }
      renderText(bubble, full); scrollDown();
    }
    function finish(reply, events) {
      if (!current()) return;
      if (typeof reply !== 'string' || !reply.trim() || reply.length > 16000) throw new Error('Missing final answer');
      request.terminal = true; typing.remove();
      if (!bubble) bubble = addMessage('agent', reply); else renderText(bubble, reply);
      var safe = cleanEvents(events); bubble.dataset.reply = reply; renderEvents(bubble, safe);
      transcript.push({ role: 'user', content: text }, { role: 'assistant', content: reply, events: safe });
      failedText = ''; status.textContent = ''; persist(); scrollDown();
    }
    function fail(message) {
      if (!current()) return;
      request.terminal = true; typing.remove(); if (bubble) bubble.parentElement.remove(); userBubble.parentElement.remove();
      failedText = text; showFailure(text, message); status.textContent = 'Question saved. No completed reply.'; persist();
    }
    request.timer = setTimeout(function () { request.controller.abort(); }, TIMEOUT_MS);
    // Save unanswered input separately; it never becomes a fabricated assistant or dangling user turn.
    failedText = text; persist();
    (async function () {
      try {
        var messages = transcript.map(function (m) { return { role: m.role, content: m.content }; }).concat({ role: 'user', content: text });
        var res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ persona: 'mc', messages: messages, page: window.location.pathname, stream: true }), signal: request.controller.signal });
        if (!current()) return;
        var type = res.headers.get('content-type') || '';
        if (!res.ok) { var err = await res.json().catch(function () { return {}; }); fail(errorText(err.error, res.status)); return; }
        if (type.indexOf('ndjson') !== -1 && res.body) {
          await readStream(res.body, function (o) {
            if (!current()) return false;
            if (o.t === 'delta') delta(o.text);
            else if (o.t === 'done') { finish(o.reply, o.events); return false; }
            else if (o.t === 'error') { fail(errorText(o.error, 0)); return false; }
          });
          if (current()) fail(RETRY); // EOF is never proof of a completed answer.
        } else if (type.indexOf('json') !== -1) { var data = await res.json(); finish(data.reply, data.events); }
        else fail(RETRY);
      } catch (err) { fail(request.stopped ? 'Stopped. Your question is saved if you want to retry.' : err && err.name === 'AbortError' ? RETRY : OFFLINE); }
      finally {
        clearTimeout(request.timer);
        if (active === request && generation === request.generation) { active = null; updateControls(); if (!panel.hidden && panel.contains(document.activeElement)) input.focus(); }
      }
    })();
    return true;
  }
  if (window.location.hash === '#agent') open();
})();
