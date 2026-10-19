/**
 * Example conversations that play on their own, each in the channel it really
 * happens in (missed call to text, answered call, Thumbtack lead, website chat, SMS).
 * Each plays once when scrolled into view. Labeled as examples; no API needed.
 */
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var SCENES = {
    'bayou-missed-call': {
      channel: 'sms', loop: true,
      company: 'Bayou Air & Heat', owner: 'Ray', when: 'Tuesday, 10:14 pm',
      earlier: [['6:52 pm', 'Tune-up booked, Thu 8 to 12', 'D. Nguyen'], ['4:10 pm', 'Quote request, new system', 'The Okafors']],
      msgs: [
        ['s', 'Missed call from (713) 555 0142 · no voicemail'],
        ['a', "Hi, this is the Bayou Air & Heat front desk. Sorry we missed your call. Is this about heating or cooling, and is it urgent?"],
        ['c', "AC quit. It's 91 in the house. Can anyone come tonight?"],
        ['a', "Yes. We do after-hours visits for no cooling. The emergency fee is $189 plus the $89 diagnostic, and the diagnostic goes toward the repair. What's the address?"],
        ['c', "4120 Kelliwood Dr, Katy. Maria Lopez."],
        ['a', "Booked for tonight, Maria. Ray will text you an arrival window in a few minutes. Stay in the coolest room and drink water."]
      ],
      notif: { urgency: 'EMERGENCY', time: '10:16 pm', rows: [['Customer', 'Maria Lopez'], ['Phone', '713 555 0142'], ['Where', '4120 Kelliwood Dr, Katy'], ['Issue', 'No cooling, 91°F inside'], ['Window', 'Tonight, after hours']] }
    },
    'katy-call': {
      channel: 'call',
      company: 'Katy Pipeworks', owner: 'Dana', when: 'Sunday, 7:40 am',
      earlier: [['Sat 5:30 pm', 'Drain clearing booked, Mon 1 to 5', 'A. Whitfield'], ['Sat 11:05 am', 'Question answered: repipe timeline', 'K. Patel']],
      msgs: [
        ['s', 'Incoming call · answered on the first ring'],
        ['c', "My water heater is leaking all over the garage. How much to replace it?"],
        ['a', "Let's get the water off first. If you can reach it, close the cold water valve on top of the heater. A standard 40 or 50 gallon replacement starts at $1,450 installed. We can come today. Sunday carries a $150 emergency fee."],
        ['c', "Fine. Can someone be here by 9?"],
        ['a', "I can't promise 9. The first window is 8 to 12, and Dana will text you when the plumber is on the way. Can I get your name and the best number?"],
        ['c', "Tom Reyes. This number."],
        ['a', "Thanks, Tom. You're booked for 8 to 12. I'm texting you a confirmation now. Keep that valve closed until she arrives."]
      ],
      notif: { urgency: 'EMERGENCY', time: '7:42 am', rows: [['Customer', 'Tom Reyes'], ['Phone', '281 555 0199'], ['Issue', 'Leaking water heater, garage'], ['Window', 'Today, 8 to 12']] }
    },
    'gulf-thumbtack': {
      channel: 'lead',
      company: 'Gulf Coast Roofing', owner: 'Pam', when: 'Wednesday, 2:14 pm',
      earlier: [['11:50 am', 'Inspection booked, Fri 8 to 10', 'C. Reyes'], ['9:30 am', 'Gutter quote accepted', 'The Hendersons']],
      lead: { source: 'Thumbtack', title: 'Roof inspection, hail damage', detail: 'Spring, TX 77379 · sent to 4 roofers', name: 'Marcus B.' },
      msgs: [
        ['a', "Hi Marcus, this is Gulf Coast Roofing. You asked on Thumbtack about hail damage in Spring. Inspections are free. We have Thursday 8 to 10 or 1 to 3. Which works?"],
        ['s', 'Replied 42 seconds after the lead arrived'],
        ['c', "Thursday 1 to 3. Is it really free?"],
        ['a', "Yes, free and no obligation. Pam texts you Thursday morning when the inspector is on the way. What's the address?"],
        ['c', "19127 Oak Hollow Ln"],
        ['a', "Booked Thursday 1 to 3 at 19127 Oak Hollow Ln. Thanks Marcus."]
      ],
      notif: { urgency: 'This week', time: '2:16 pm', rows: [['Customer', 'Marcus Bell'], ['Phone', '281 555 0164'], ['Where', '19127 Oak Hollow Ln, Spring'], ['Issue', 'Hail damage inspection (Thumbtack)'], ['Window', 'Thursday, 1 to 3']] }
    },
    'maids-web': {
      channel: 'web',
      company: 'Westheimer Maids', owner: 'Nia', when: 'Thursday, 9:05 pm',
      earlier: [['6:18 pm', 'Biweekly clean booked, Fri 10 to 12', 'M. Chen'], ['2:40 pm', 'Move-out quote requested', 'R. Dawson']],
      msgs: [
        ['c', "Hola, ¿cuánto cuesta una limpieza profunda? Es un apartamento de 2 recámaras."],
        ['a', "¡Hola! Para 2 recámaras y 2 baños, la limpieza profunda empieza en $229. Nosotros traemos todo el equipo. ¿Qué día le conviene?"],
        ['c', "El sábado por la mañana."],
        ['a', "Tengo de 8 a 10 o de 10 a 12 el sábado. ¿Me da su nombre y teléfono?"],
        ['c', "Lucía Herrera, 832 555 0177"],
        ['a', "Listo, Lucía. Nia le confirma por mensaje."]
      ],
      notif: { urgency: 'This week', time: '9:07 pm', rows: [['Customer', 'Lucía Herrera'], ['Phone', '832 555 0177'], ['Issue', 'Deep clean, 2 bed 2 bath apartment'], ['Window', 'Saturday, 8 to 10'], ['Language', 'Spanish']] }
    },
    'brazos-sms': {
      channel: 'sms', notes: { 1: 'Published price only', 3: 'A window, not a promise', 5: 'Still booked' },
      company: 'Brazos Electric Co.', owner: 'Luis', when: 'Monday, 12:30 pm',
      earlier: [['11:20 am', 'Ceiling fan install booked, Wed 8 to 12', 'B. Morales'], ['9:02 am', 'Surge protector quote accepted', 'T. Lindqvist']],
      msgs: [
        ['c', "How much to install an EV charger? And can you knock something off, I've got 3 other quotes."],
        ['a', "Installs start at $650 if your panel has room, and Luis confirms that on site. I can't change the price, but the $99 service call is applied to the work. Want a slot this week?"],
        ['c', "Will he be here by 2 tomorrow?"],
        ['a', "I can't promise an exact time. Tomorrow's windows are 8 to 12 or 12 to 5. Which works?"],
        ['c', "12 to 5. Jen Park, 346 555 0133"],
        ['a', "Booked for 12 to 5, Jen. Luis has it, and you'll get a text when he's on the way."]
      ],
      notif: { urgency: 'This week', time: '12:33 pm', rows: [['Customer', 'Jen Park'], ['Phone', '346 555 0133'], ['Issue', 'EV charger install, 3 competing quotes'], ['Window', 'Tomorrow, 12 to 5']] }
    }
  };

  var CHANNEL = {
    sms: { label: 'Text message', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' },
    call: { label: 'Phone call', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>' },
    lead: { label: 'Thumbtack lead', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z"/></svg>' },
    web: { label: 'Website chat', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/></svg>' }
  };

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function resting(scene) {
    var parts = scene.when.split(', ');
    return '<div class="phone-lock"><div class="phone-clock">' + esc(parts[1] || '') + '</div><div class="phone-day">' + esc(parts[0]) + ' · ' + esc(scene.owner) + ' is on a job</div></div>' +
      '<div class="phone-earlier-label">Earlier</div>' +
      scene.earlier.map(function (e) { return '<div class="phone-earlier"><span class="phone-earlier-time">' + esc(e[0]) + '</span><span class="phone-earlier-text">' + esc(e[1]) + '</span><span class="phone-earlier-who">' + esc(e[2]) + '</span></div>'; }).join('');
  }

  function build(el, scene) {
    var ch = CHANNEL[scene.channel];
    el.classList.add('scene-' + scene.channel);
    var lead = scene.lead ? '<div class="scene-leadcard"><span class="scene-leadcard-src">' + esc(scene.lead.source) + ' · new lead</span><strong>' + esc(scene.lead.title) + '</strong><span>' + esc(scene.lead.detail) + '</span><span class="scene-leadcard-name">' + esc(scene.lead.name) + '</span></div>' : '';
    var head = '<div class="scene-chat-head"><span class="scene-ch">' + ch.icon + esc(ch.label) + '</span><span class="scene-company">' + esc(scene.company) + '</span><span class="scene-when">' + esc(scene.when) + '</span></div>';
    var chat = '<div class="scene-chat">' + head + lead + '<div class="scene-msgs"></div>' + (scene.channel === 'call' ? '<div class="scene-callbar"><span class="scene-wave"><i></i><i></i><i></i><i></i><i></i></span><span class="scene-calltime">00:00</span></div>' : '') + '</div>';
    var phone = '<div class="scene-phone"><div class="scene-phone-frame"><div class="scene-phone-top"><span>' + esc(scene.owner) + "'s phone</span><span class=\"scene-phone-time\"></span></div><div class=\"scene-phone-body\">" + resting(scene) + '</div></div></div>';
    el.innerHTML = chat + phone + '<button type="button" class="scene-replay" hidden>Replay</button>';
  }

  function play(el, scene) {
    if (el.dataset.playing === 'true') return;
    el.dataset.playing = 'true';
    var msgs = el.querySelector('.scene-msgs'), body = el.querySelector('.scene-phone-body'), replay = el.querySelector('.scene-replay'), ptime = el.querySelector('.scene-phone-time'), calltime = el.querySelector('.scene-calltime');
    msgs.innerHTML = ''; body.innerHTML = resting(scene); replay.hidden = true; ptime.textContent = '';
    var i = 0, t0 = Date.now(), timer = null;
    if (calltime) { timer = setInterval(function () { var s = Math.floor((Date.now() - t0) / 1000); calltime.textContent = '0' + Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); }, 1000); }
    function next() {
      if (i >= scene.msgs.length) return notify();
      var m = scene.msgs[i++]; var role = m[0], text = m[1];
      if (role === 's') {
        var sys = document.createElement('div'); sys.className = 'scene-sys'; sys.textContent = text; msgs.appendChild(sys); msgs.scrollTop = msgs.scrollHeight;
        setTimeout(next, reduce ? 0 : 1000); return;
      }
      var delay = reduce ? 0 : (role === 'a' ? 900 + Math.min(text.length * 12, 1500) : 500 + Math.min(text.length * 25, 1200));
      var ty = null;
      if (!reduce) { ty = document.createElement('div'); ty.className = 'scene-msg ' + (role === 'a' ? 'agent' : 'user') + ' scene-typing'; ty.innerHTML = '<span></span><span></span><span></span>'; msgs.appendChild(ty); msgs.scrollTop = msgs.scrollHeight; }
      setTimeout(function () {
        if (ty) ty.remove();
        var d = document.createElement('div'); d.className = 'scene-msg ' + (role === 'a' ? 'agent' : 'user');
        if (scene.channel === 'call') { d.innerHTML = '<span class="scene-speaker">' + (role === 'a' ? 'Front desk' : 'Caller') + '</span>'; d.appendChild(document.createTextNode(text)); }
        else { d.textContent = text; }
        var note = scene.notes && scene.notes[i - 1];
        if (note) { var tag = document.createElement('span'); tag.className = 'scene-note'; tag.textContent = note; d.appendChild(tag); }
        msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight;
        setTimeout(next, reduce ? 0 : 350);
      }, delay);
    }
    function notify() {
      if (timer) clearInterval(timer);
      setTimeout(function () {
        var n = scene.notif;
        ptime.textContent = n.time;
        var lock = body.querySelector('.phone-lock'); if (lock) lock.querySelector('.phone-day').textContent = 'New message from the front desk';
        var card = document.createElement('div'); card.className = 'scene-notif' + (n.urgency === 'EMERGENCY' ? ' is-emergency' : '');
        card.innerHTML = '<div class="scene-notif-head">' + esc(scene.company) + ' front desk · <b>' + esc(n.urgency) + '</b></div><div class="scene-notif-body">' + n.rows.map(function (r) { return '<div><span>' + esc(r[0]) + '</span>' + esc(r[1]) + '</div>'; }).join('') + '</div>';
        body.insertBefore(card, body.querySelector('.phone-earlier-label'));
        var frame = el.querySelector('.scene-phone-frame'); frame.classList.remove('is-buzz'); void frame.offsetWidth; frame.classList.add('is-buzz');
        replay.hidden = false;
        el.dataset.playing = 'false';
        if (scene.loop && el.dataset.loop !== 'false') setTimeout(function () { if (el.dataset.playing !== 'true') play(el, scene); }, 9000);
      }, reduce ? 0 : 600);
    }
    next();
  }

  var els = document.querySelectorAll('[data-scene]');
  if (!els.length) return;
  els.forEach(function (el) {
    var scene = SCENES[el.dataset.scene]; if (!scene) return;
    build(el, scene);
    el.querySelector('.scene-replay').addEventListener('click', function () { play(el, scene); });
  });
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting && e.target.dataset.played !== 'true') { e.target.dataset.played = 'true'; play(e.target, SCENES[e.target.dataset.scene]); io.unobserve(e.target); }
      });
    }, { threshold: 0.3 });
    els.forEach(function (el) { io.observe(el); });
  } else {
    els.forEach(function (el) { play(el, SCENES[el.dataset.scene]); });
  }
})();
