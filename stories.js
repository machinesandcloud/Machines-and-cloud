/**
 * Scripted scenes that play on their own: a customer texts, the agent answers,
 * the owner's phone buzzes. Each scene plays once when it scrolls into view.
 * Clearly labeled as samples; the live demo further down is the real agent.
 */
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var SCENES = {
    'bayou-night': {
      company: 'Bayou Air & Heat', trade: 'HVAC', owner: 'Ray', when: 'Tuesday, 10:14 pm', lang: 'en',
      point: 'After hours. Published fees only. No promised time. Ray has the lead in two minutes.',
      msgs: [
        ['c', "Our AC just quit and it's 91 in the house. Anyone available tonight?"],
        ['a', "I'm sorry, that's miserable. We do after-hours visits for no cooling. The emergency fee is $189 plus the $89 diagnostic, and the diagnostic is applied to the repair. Want me to get a tech headed your way?"],
        ['c', "Yes. 4120 Kelliwood Dr, Katy."],
        ['a', "Katy is in our area. What name and number should the tech use?"],
        ['c', "Maria Lopez, 713 555 0142"],
        ['a', "Thanks Maria. Ray has your details and will text you an arrival window in a few minutes. Stay in the coolest room and drink water."]
      ],
      earlier: [['6:52 pm', 'Tune-up booked, Thu 8 to 12', 'D. Nguyen'], ['4:10 pm', 'Quote request, new system', 'The Okafors']],
      notif: { urgency: 'EMERGENCY', time: '10:16 pm', rows: [['Customer', 'Maria Lopez'], ['Phone', '713 555 0142'], ['Where', '4120 Kelliwood Dr, Katy'], ['Issue', 'No cooling, 91°F inside'], ['Window', 'Tonight, after hours']] }
    },
    'katy-sunday': {
      variant: 'flipped', tone: 'morning',
      company: 'Katy Pipeworks', trade: 'Plumbing', owner: 'Dana', when: 'Sunday, 7:40 am', lang: 'en',
      point: 'Safety first, a real starting price, and no "I\'ll be there by 9" that the plumber can\'t keep.',
      msgs: [
        ['c', "Water heater is leaking all over the garage. How much to replace it?"],
        ['a', "If you can reach it, shut the cold water valve on top of the heater. A standard 40 or 50 gallon replacement starts at $1,450 installed. We can come today. Sunday carries a $150 emergency fee."],
        ['c', "Fine. Can someone be here by 9?"],
        ['a', "I can't promise 9, but the first window is 8 to 12 and Dana will text you when the plumber is on the way. Name and number?"],
        ['c', "Tom Reyes, 281 555 0199"],
        ['a', "Done, Tom. Dana has it. Keep the valve closed until she arrives."]
      ],
      earlier: [['Sat 5:30 pm', 'Drain clearing booked, Mon 1 to 5', 'A. Whitfield'], ['Sat 11:05 am', 'Question answered: repipe timeline', 'K. Patel']],
      notif: { urgency: 'EMERGENCY', time: '7:42 am', rows: [['Customer', 'Tom Reyes'], ['Phone', '281 555 0199'], ['Issue', 'Leaking water heater, garage'], ['Window', 'Today, 8 to 12']] }
    },
    'maids-spanish': {
      variant: 'phone', tone: 'night',
      company: 'Westheimer Maids', trade: 'Cleaning', owner: 'Nia', when: 'Thursday, 9:05 pm', lang: 'es',
      point: 'The customer wrote in Spanish, so the agent answered in Spanish. Nia reads the summary in English.',
      msgs: [
        ['c', "Hola, ¿cuánto cuesta una limpieza profunda? Es un apartamento de 2 recámaras."],
        ['a', "¡Hola! Para 2 recámaras y 2 baños, la limpieza profunda empieza en $229. Nosotros traemos todo el equipo. ¿Qué día le conviene?"],
        ['c', "El sábado por la mañana."],
        ['a', "Tengo de 8 a 10 o de 10 a 12 el sábado. ¿Me da su nombre y teléfono?"],
        ['c', "Lucía Herrera, 832 555 0177"],
        ['a', "Listo, Lucía. Nia le confirma por mensaje."]
      ],
      earlier: [['6:18 pm', 'Biweekly clean booked, Fri 10 to 12', 'M. Chen'], ['2:40 pm', 'Move-out quote requested', 'R. Dawson']],
      notif: { urgency: 'This week', time: '9:07 pm', rows: [['Customer', 'Lucía Herrera'], ['Phone', '832 555 0177'], ['Issue', 'Deep clean, 2 bed 2 bath apartment'], ['Window', 'Saturday, 8 to 10'], ['Language', 'Spanish']] }
    },
    'thumbtack-lead': {
      variant: 'split', tone: 'day',
      company: 'Gulf Coast Roofing', trade: 'Roofing', owner: 'Pam', when: 'Wednesday, 2:14 pm', lang: 'en',
      earlier: [['11:50 am', 'Inspection booked, Fri 8 to 10', 'C. Reyes'], ['9:30 am', 'Gutter quote accepted', 'The Hendersons']],
      msgs: [
        ['s', "2:14 pm · Thumbtack lead: hail damage, Spring 77379 · sent to 4 roofers"],
        ['a', "Hi Marcus, this is Gulf Coast Roofing. You asked on Thumbtack about hail damage in Spring. Inspections are free. We have Thursday 8 to 10 or 1 to 3. Which works?"],
        ['s', "Texted 42 seconds after the lead arrived"],
        ['c', "Thursday 1 to 3. Is it really free?"],
        ['a', "Yes, free and no obligation. Pam texts you Thursday morning when the inspector is on the way. What's the address?"],
        ['c', "19127 Oak Hollow Ln"],
        ['a', "Booked Thursday 1 to 3 at 19127 Oak Hollow Ln. Thanks Marcus."],
        ['s', "Friday, job done · one review request texted to Marcus"]
      ],
      notif: { urgency: 'This week', time: '2:16 pm', rows: [['Customer', 'Marcus Bell'], ['Phone', '281 555 0164'], ['Where', '19127 Oak Hollow Ln, Spring'], ['Issue', 'Hail damage inspection (Thumbtack lead)'], ['Window', 'Thursday, 1 to 3']] }
    },
    'brazos-shopper': {
      variant: 'annotated', tone: 'day', notes: { 1: 'Published price only', 3: 'No promised time', 5: 'Still booked' },
      company: 'Brazos Electric Co.', trade: 'Electrical', owner: 'Luis', when: 'Monday, 12:30 pm', lang: 'en',
      point: 'Asked for a discount and a 2 pm promise. Got neither, and still booked. Luis sees "3 competing quotes."',
      msgs: [
        ['c', "How much to install an EV charger? And can you knock something off, I've got 3 other quotes."],
        ['a', "Installs start at $650 if your panel has room, and Luis confirms that on site. I can't change the price, but the $99 service call is applied to the work. Want a slot this week?"],
        ['c', "Will he be here by 2 tomorrow?"],
        ['a', "I can't promise an exact time. Tomorrow's windows are 8 to 12 or 12 to 5. Which works?"],
        ['c', "12 to 5. Jen Park, 346 555 0133"],
        ['a', "Booked for 12 to 5, Jen. Luis has it."]
      ],
      earlier: [['11:20 am', 'Ceiling fan install booked, Wed 8 to 12', 'B. Morales'], ['9:02 am', 'Surge protector quote accepted', 'T. Lindqvist']],
      notif: { urgency: 'This week', time: '12:33 pm', rows: [['Customer', 'Jen Park'], ['Phone', '346 555 0133'], ['Issue', 'EV charger install, 3 competing quotes'], ['Window', 'Tomorrow, 12 to 5']] }
    }
  };

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function resting(scene) {
    var clock = scene.when.split(', ')[1] || '';
    return '<div class="phone-lock"><div class="phone-clock">' + esc(clock) + '</div><div class="phone-day">' + esc(scene.when.split(', ')[0]) + ' · ' + esc(scene.owner) + ' is on a job</div></div>' +
      '<div class="phone-earlier-label">Earlier</div>' +
      scene.earlier.map(function (e) { return '<div class="phone-earlier"><span class="phone-earlier-time">' + esc(e[0]) + '</span><span class="phone-earlier-text">' + esc(e[1]) + '</span><span class="phone-earlier-who">' + esc(e[2]) + '</span></div>'; }).join('');
  }

  function build(el, scene) {
    var v = scene.variant || 'split';
    el.classList.add('scene-' + v);
    if (scene.tone) el.classList.add('tone-' + scene.tone);
    var chat = '<div class="scene-chat"><div class="scene-chat-head"><span class="scene-dot"></span><span class="scene-company">' + esc(scene.company) + '</span><span class="scene-when">' + esc(scene.when) + '</span></div><div class="scene-msgs"></div></div>';
    var phone = '<div class="scene-phone"><div class="scene-phone-frame"><div class="scene-phone-top"><span>' + esc(scene.owner) + "'s phone</span><span class=\"scene-phone-time\"></span></div><div class=\"scene-phone-body\">" + resting(scene) + '</div></div></div>';
    var replay = '<button type="button" class="scene-replay" hidden>Replay</button>';
    if (v === 'phone') {
      // The customer's own phone: one frame, SMS style, the owner's text arrives as a banner at the top.
      el.innerHTML = '<div class="scene-handset"><div class="scene-handset-top"><span class="scene-handset-name">' + esc(scene.company) + '</span><span class="scene-handset-when">' + esc(scene.when) + '</span></div><div class="scene-banner-slot"></div><div class="scene-msgs"></div><div class="scene-handset-bar"><span>Message</span></div></div>' +
        '<div class="scene-aside"><div class="scene-aside-card"><span class="scene-aside-label">Meanwhile, on ' + esc(scene.owner) + "'s phone</span><div class=\"scene-phone-body\">" + resting(scene) + '</div></div></div>' + replay;
    } else if (v === 'annotated') {
      el.innerHTML = chat + '<div class="scene-notes" aria-hidden="true"></div><div class="scene-sms"></div>' + replay;
    } else if (v === 'flipped') {
      el.innerHTML = phone + chat + replay;
    } else {
      el.innerHTML = chat + phone + replay;
    }
  }

  function play(el, scene) {
    if (el.dataset.playing === 'true') return;
    el.dataset.playing = 'true';
    var msgs = el.querySelector('.scene-msgs'), body = el.querySelector('.scene-phone-body'), replay = el.querySelector('.scene-replay'), ptime = el.querySelector('.scene-phone-time');
    var notesEl = el.querySelector('.scene-notes'), smsEl = el.querySelector('.scene-sms'), slot = el.querySelector('.scene-banner-slot');
    msgs.innerHTML = ''; if (body) body.innerHTML = resting(scene); replay.hidden = true; if (ptime) ptime.textContent = ''; if (notesEl) notesEl.innerHTML = ''; if (smsEl) smsEl.innerHTML = ''; if (slot) slot.innerHTML = '';
    var i = 0;
    function next() {
      if (i >= scene.msgs.length) return notify();
      var m = scene.msgs[i++]; var role = m[0], text = m[1];
      if (role === 's') {
        var sys = document.createElement('div'); sys.className = 'scene-sys'; sys.textContent = text; msgs.appendChild(sys); msgs.scrollTop = msgs.scrollHeight;
        setTimeout(next, reduce ? 0 : 900); return;
      }
      var delayType = reduce ? 0 : (role === 'a' ? 900 + Math.min(text.length * 12, 1400) : 500 + Math.min(text.length * 25, 1200));
      var ty = null;
      if (!reduce) { ty = document.createElement('div'); ty.className = 'scene-msg ' + (role === 'a' ? 'agent' : 'user') + ' scene-typing'; ty.innerHTML = '<span></span><span></span><span></span>'; msgs.appendChild(ty); msgs.scrollTop = msgs.scrollHeight; }
      setTimeout(function () {
        if (ty) ty.remove();
        var d = document.createElement('div'); d.className = 'scene-msg ' + (role === 'a' ? 'agent' : 'user'); d.textContent = text;
        var note = scene.notes && scene.notes[i - 1];
        if (note) { var tag = document.createElement('span'); tag.className = 'scene-note'; tag.textContent = note; d.appendChild(tag); }
        msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight;
        setTimeout(next, reduce ? 0 : 350);
      }, delayType);
    }
    function notify() {
      setTimeout(function () {
        var n = scene.notif; var v = scene.variant || 'split';
        var rowsHtml = n.rows.map(function (r) { return '<div><span>' + esc(r[0]) + '</span>' + esc(r[1]) + '</div>'; }).join('');
        var card = document.createElement('div'); card.className = 'scene-notif' + (n.urgency === 'EMERGENCY' ? ' is-emergency' : '');
        card.innerHTML = '<div class="scene-notif-head">' + esc(scene.company) + ' front desk · <b>' + esc(n.urgency) + '</b></div><div class="scene-notif-body">' + rowsHtml + '</div>';
        if (v === 'phone') {
          var banner = document.createElement('div'); banner.className = 'scene-banner';
          banner.innerHTML = '<span class="scene-banner-app">Front desk</span><span class="scene-banner-text">Sent to ' + esc(scene.owner) + ': ' + esc(n.rows[0][1]) + ', ' + esc(n.rows.filter(function (r) { return r[0] === 'Issue'; })[0][1]) + '</span>';
          slot.appendChild(banner);
          if (body) { body.querySelector('.phone-day').textContent = 'New message from the front desk'; body.insertBefore(card, body.querySelector('.phone-earlier-label')); }
        } else if (v === 'annotated') {
          smsEl.innerHTML = '<div class="scene-sms-bubble"><span class="scene-sms-to">Text to ' + esc(scene.owner) + ' · ' + esc(n.time) + '</span>' + esc(scene.company) + ' front desk: ' + n.rows.map(function (r) { return r[1]; }).join(' · ') + '</div>';
        } else {
          if (ptime) ptime.textContent = n.time;
          var lock = body.querySelector('.phone-lock'); if (lock) lock.querySelector('.phone-day').textContent = 'New message from the front desk';
          body.insertBefore(card, body.querySelector('.phone-earlier-label'));
          var frame = el.querySelector('.scene-phone-frame'); frame.classList.remove('is-buzz'); void frame.offsetWidth; frame.classList.add('is-buzz');
        }
        replay.hidden = false;
        el.dataset.playing = 'false';
        if (el.dataset.loop === 'true') setTimeout(function () { if (el.dataset.playing !== 'true') play(el, scene); }, 9000);
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
    }, { threshold: 0.35 });
    els.forEach(function (el) { io.observe(el); });
  } else {
    els.forEach(function (el) { play(el, SCENES[el.dataset.scene]); });
  }
})();
