/**
 * Interactive demo: chat as a customer of a fictional Houston company,
 * watch what the owner receives. Backed by /api/chat with a persona.
 */
(function () {
  'use strict';
  var root = document.getElementById('demo');
  if (!root) return;

  var ENDPOINT = '/api/chat';
  var OFFLINE = 'The demo agent is offline right now. Email support@machinesandcloud.com or call (346) 248-8359 and a person will reply within one business day.';

  var SCENARIOS = [
    { id: 'bayou-air', company: 'Bayou Air & Heat', trade: 'HVAC', owner: 'Ray', area: 'Katy, Cypress, Sugar Land', earlier: [['6:52 pm', 'Tune-up booked, Thu 8 to 12', 'D. Nguyen'], ['4:10 pm', 'Quote request, new system', 'The Okafors']],
      problem: 'HVAC. Katy, Cypress, Sugar Land. Diagnostic $89, after-hours $189.',
      greeting: "Hi, this is the Bayou Air & Heat front desk. How can I help with your heating or cooling today?",
      prompts: ['My AC just stopped cooling and it is 95 degrees. Can someone come tonight?', 'Do you cover Cypress? How much is a visit?', 'Mi aire no enfría. ¿Hablan español?', 'Can the tech be here by 2 pm tomorrow?'] },
    { id: 'katy-pipeworks', company: 'Katy Pipeworks', trade: 'Plumbing', owner: 'Dana', area: 'Katy, Fulshear, Richmond', earlier: [['5:30 pm', 'Drain clearing booked, Mon 1 to 5', 'A. Whitfield'], ['11:05 am', 'Question answered: repipe timeline', 'K. Patel']],
      problem: 'Plumbing. Katy, Fulshear, Richmond. 24/7 for leaks and no water.',
      greeting: "Katy Pipeworks front desk here. What's going on with your plumbing?",
      prompts: ['My water heater is leaking. How much to replace it?', 'I smell gas near the stove, what do I do?', 'Do you do emergency calls on Sunday?', 'Can you give me a discount on drain clearing?'] },
    { id: 'brazos-electric', company: 'Brazos Electric Co.', trade: 'Electrical', owner: 'Luis', area: 'Pearland, League City, Clear Lake', earlier: [['11:20 am', 'Ceiling fan install booked, Wed 8 to 12', 'B. Morales'], ['9:02 am', 'Surge protector quote accepted', 'T. Lindqvist']],
      problem: 'Electrical. Pearland, League City, Clear Lake. Weekdays, emergencies any time.',
      greeting: "Thanks for reaching out to Brazos Electric. What can we help you with?",
      prompts: ['How much to install an EV charger in my garage?', 'There is a burning smell from my breaker panel.', 'Can you come out this Saturday?', 'I need a quote for a panel upgrade.'] },
    { id: 'gulf-coast-roofing', company: 'Gulf Coast Roofing', trade: 'Roofing', owner: 'Pam', area: 'The Woodlands, Spring, Conroe', earlier: [['3:15 pm', 'Inspection booked, Tue 8 to 10', 'S. Alvarez'], ['1:48 pm', 'Gutter quote requested', 'J. Brooks']],
      problem: 'Roofing. The Woodlands, Spring, Conroe. Free inspections.',
      greeting: "Gulf Coast Roofing front desk. Storm damage, a leak, or something else?",
      prompts: ['We had hail last night. Can someone look at my roof?', 'Will my insurance cover a new roof?', 'How much is a new roof?', 'I have water dripping from the ceiling right now.'] },
    { id: 'westheimer-maids', company: 'Westheimer Maids', trade: 'Cleaning', owner: 'Nia', area: 'Galleria, Memorial, Bellaire', earlier: [['6:18 pm', 'Biweekly clean booked, Fri 10 to 12', 'M. Chen'], ['2:40 pm', 'Move-out quote requested', 'R. Dawson']],
      problem: 'Cleaning. Galleria, Memorial, Bellaire. Standard clean from $129.',
      greeting: "Hi, this is the Westheimer Maids front desk. Are you looking for a one-time clean or regular service?",
      prompts: ['How much for a move-out clean on a 3 bedroom, 2 bath this Friday?', 'Do you bring your own supplies?', '¿Cuánto cuesta una limpieza profunda?', 'Can you do Sunday morning?'] },
    { id: 'mc', company: 'Machines & Cloud', trade: 'Us', owner: 'Steve', area: 'Houston', earlier: [['Today', 'Pilot questionnaire sent', 'A Katy plumbing company'], ['Yesterday', 'Agent went live', 'A Spring roofing company']],
      problem: 'Our own front desk. Ask about the pilot, or leave your details and Steve will call you.',
      greeting: "Hi, I'm the Machines & Cloud front desk agent. I'm an AI, and I'm the same product we install for your business. Ask me what it costs or how the pilot works.",
      prompts: ['What does the free pilot include?', 'What happens if the agent does not know an answer?', 'I run an HVAC company in Katy. How do I start?', 'Where did Steve work before?'] },
  ];

  var state = { scenario: SCENARIOS[0], transcripts: {}, notifications: {}, busy: false };

  root.innerHTML =
    '<div class="demo-grid">' +
      '<section class="demo-chat" aria-label="Customer chat">' +
        '<header class="demo-chat-head">' +
          '<label class="demo-picker"><span class="demo-picker-label">Company</span><select id="demoSelect" aria-label="Choose a company"></select></label>' +
          '<button type="button" class="demo-reset" id="demoReset">Start over</button>' +
        '</header>' +
        '<p class="demo-problem"></p>' +
        '<div class="demo-messages" id="demoMessages" aria-live="polite"></div>' +
        '<div class="demo-prompts" id="demoPrompts"><span class="demo-prompts-label">Try:</span></div>' +
        '<form class="demo-form" id="demoForm"><label for="demoInput" class="sr-only">Your message</label><textarea id="demoInput" rows="1" maxlength="1500" placeholder="Type a message" required></textarea><button type="submit" class="btn btn-primary" id="demoSend">Send</button></form>' +
      '</section>' +
      '<aside class="demo-phone" aria-label="What the owner receives">' +
        '<div class="demo-phone-frame"><div class="demo-phone-top"><span class="demo-phone-owner"></span><span class="demo-phone-time">now</span></div><div class="demo-phone-body" id="demoPhone"></div></div>' +
        '<p class="demo-phone-note">What the owner receives.</p>' +
      '</aside>' +
    '</div>';

  var pick = document.getElementById('demoSelect');
  var problemEl = root.querySelector('.demo-problem');
  var list = document.getElementById('demoMessages');
  var promptsEl = document.getElementById('demoPrompts');
  var form = document.getElementById('demoForm');
  var input = document.getElementById('demoInput');
  var sendBtn = document.getElementById('demoSend');
  var phone = document.getElementById('demoPhone');
  var ownerEl = root.querySelector('.demo-phone-owner');

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function linkify(e) { return e.replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>'); }

  SCENARIOS.forEach(function (s) {
    var o = document.createElement('option'); o.value = s.id; o.textContent = s.company + (s.id === 'mc' ? ' (our own front desk)' : ' · ' + s.trade);
    pick.appendChild(o);
  });
  pick.addEventListener('change', function () { select(pick.value); input.focus(); });

  function addMsg(role, text) {
    var el = document.createElement('div');
    el.className = 'demo-msg ' + (role === 'user' ? 'user' : 'agent');
    el.innerHTML = linkify(esc(text)).replace(/\n/g, '<br>');
    list.appendChild(el); list.scrollTop = list.scrollHeight; return el;
  }
  function typing() {
    var el = document.createElement('div'); el.className = 'demo-msg agent demo-typing'; el.innerHTML = '<span></span><span></span><span></span>';
    list.appendChild(el); list.scrollTop = list.scrollHeight; return el;
  }

  function resting(s) {
    var now = new Date(); var h = now.getHours(); var m = now.getMinutes(); var clock = ((h % 12) || 12) + ':' + (m < 10 ? '0' : '') + m + (h < 12 ? ' am' : ' pm');
    return '<div class="phone-lock"><div class="phone-clock">' + clock + '</div><div class="phone-day">' + esc(s.owner) + ' is on a job</div></div>' +
      '<div class="phone-earlier-label">Earlier</div>' +
      (s.earlier || []).map(function (e) { return '<div class="phone-earlier"><span class="phone-earlier-time">' + esc(e[0]) + '</span><span class="phone-earlier-text">' + esc(e[1]) + '</span><span class="phone-earlier-who">' + esc(e[2]) + '</span></div>'; }).join('');
  }
  function renderPhone() {
    var s = state.scenario; var notes = state.notifications[s.id] || [];
    ownerEl.textContent = s.owner + "'s phone";
    var cards = notes.map(function (n) {
      if (n.type === 'lead_captured') {
        return '<div class="demo-notif"><div class="demo-notif-head">Machines &amp; Cloud front desk</div><div class="demo-notif-body"><div><span>Lead</span>New pilot request. Steve replies within one business day.</div></div></div>';
      }
      var d = n.data || {};
      var urg = { emergency: 'EMERGENCY', today: 'Today', this_week: 'This week', flexible: 'Flexible' }[d.urgency] || '';
      return '<div class="demo-notif' + (d.urgency === 'emergency' ? ' is-emergency' : '') + '">' +
        '<div class="demo-notif-head">' + esc(n.company) + ' front desk' + (urg ? ' · <b>' + urg + '</b>' : '') + '</div>' +
        '<div class="demo-notif-body">' +
          '<div><span>Customer</span>' + esc(d.customer_name || '') + '</div>' +
          '<div><span>Phone</span>' + esc(d.phone || '') + '</div>' +
          (d.address ? '<div><span>Where</span>' + esc(d.address) + '</div>' : '') +
          '<div><span>Issue</span>' + esc(d.issue || '') + '</div>' +
          (d.requested_window ? '<div><span>Window</span>' + esc(d.requested_window) + '</div>' : '') +
          (d.language === 'es' ? '<div><span>Language</span>Spanish</div>' : '') +
        '</div></div>';
    }).reverse().join('');
    var rest = resting(s);
    if (notes.length) rest = rest.replace(esc(s.owner) + ' is on a job', 'New message from the front desk');
    phone.innerHTML = rest.replace('<div class="phone-earlier-label">', cards + '<div class="phone-earlier-label">');
  }

  function renderPrompts() {
    promptsEl.innerHTML = '<span class="demo-prompts-label">Ask:</span>';
    state.scenario.prompts.forEach(function (p) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'demo-prompt'; b.textContent = p;
      b.addEventListener('click', function () { send(p); });
      promptsEl.appendChild(b);
    });
  }

  function select(id) {
    state.scenario = SCENARIOS.filter(function (s) { return s.id === id; })[0] || SCENARIOS[0];
    var s = state.scenario;
    pick.value = s.id;
    problemEl.textContent = s.problem;
    list.innerHTML = '';
    addMsg('agent', s.greeting);
    (state.transcripts[s.id] || []).forEach(function (m) { addMsg(m.role, m.content); });
    renderPrompts(); renderPhone();
    if (root.dataset.focused === 'true') input.focus();
  }

  function send(text) {
    text = (text || '').trim();
    if (!text || state.busy) return;
    var s = state.scenario;
    state.busy = true; sendBtn.disabled = true; input.value = ''; input.style.height = 'auto';
    var t = state.transcripts[s.id] = state.transcripts[s.id] || [];
    t.push({ role: 'user', content: text });
    addMsg('user', text);
    promptsEl.hidden = true;
    var ty = typing();
    fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ persona: s.id, messages: t.slice(-20), page: window.location.pathname + '#demo' }) })
      .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (r) {
        ty.remove();
        if (!r.ok || !r.data || typeof r.data.reply !== 'string') {
          addMsg('agent', (r.data && r.data.error === 'busy') ? 'A lot of people are trying the demo right now. Give it a minute and try again.' : OFFLINE);
          t.pop(); return;
        }
        t.push({ role: 'assistant', content: r.data.reply });
        addMsg('agent', r.data.reply);
        (r.data.events || []).forEach(function (ev) {
          var n = state.notifications[s.id] = state.notifications[s.id] || [];
          n.push(ev);
        });
        renderPhone();
        if ((r.data.events || []).length) {
          var frame = root.querySelector('.demo-phone-frame'); frame.classList.remove('is-buzz'); void frame.offsetWidth; frame.classList.add('is-buzz');
        }
      })
      .catch(function () { ty.remove(); addMsg('agent', OFFLINE); t.pop(); })
      .then(function () { state.busy = false; sendBtn.disabled = false; input.focus(); });
  }

  form.addEventListener('submit', function (e) { e.preventDefault(); send(input.value); });
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  input.addEventListener('input', function () { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 120) + 'px'; });
  input.addEventListener('focus', function () { root.dataset.focused = 'true'; });
  document.getElementById('demoReset').addEventListener('click', function () {
    delete state.transcripts[state.scenario.id]; delete state.notifications[state.scenario.id]; promptsEl.hidden = false; select(state.scenario.id);
  });

  // Deep links: #demo=katy-pipeworks, or any [data-demo="id"] element
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-demo]'); if (!t) return;
    e.preventDefault(); select(t.dataset.demo); root.scrollIntoView({ behavior: 'smooth', block: 'start' }); setTimeout(function () { input.focus(); }, 500);
  });
  var m = /demo=([a-z-]+)/.exec(window.location.hash || '');
  select(m ? m[1] : SCENARIOS[0].id);
})();
