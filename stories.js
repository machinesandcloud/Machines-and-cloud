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
      notif: { urgency: 'EMERGENCY', time: '10:16 pm', rows: [['Customer', 'Maria Lopez'], ['Phone', '713 555 0142'], ['Where', '4120 Kelliwood Dr, Katy'], ['Issue', 'No cooling, 91°F inside'], ['Window', 'Tonight, after hours']] }
    },
    'katy-sunday': {
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
      notif: { urgency: 'EMERGENCY', time: '7:42 am', rows: [['Customer', 'Tom Reyes'], ['Phone', '281 555 0199'], ['Issue', 'Leaking water heater, garage'], ['Window', 'Today, 8 to 12']] }
    },
    'maids-spanish': {
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
      notif: { urgency: 'This week', time: '9:07 pm', rows: [['Customer', 'Lucía Herrera'], ['Phone', '832 555 0177'], ['Issue', 'Deep clean, 2 bed 2 bath apartment'], ['Window', 'Saturday, 8 to 10'], ['Language', 'Spanish']] }
    },
    'brazos-shopper': {
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
      notif: { urgency: 'This week', time: '12:33 pm', rows: [['Customer', 'Jen Park'], ['Phone', '346 555 0133'], ['Issue', 'EV charger install, 3 competing quotes'], ['Window', 'Tomorrow, 12 to 5']] }
    }
  };

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function build(el, scene) {
    el.innerHTML =
      '<div class="scene-chat"><div class="scene-chat-head"><span class="scene-dot"></span><span class="scene-company">' + esc(scene.company) + ' front desk</span><span class="scene-when">' + esc(scene.when) + '</span></div>' +
      '<div class="scene-msgs"></div></div>' +
      '<div class="scene-phone"><div class="scene-phone-frame"><div class="scene-phone-top"><span>' + esc(scene.owner) + "'s phone</span><span class=\"scene-phone-time\"></span></div><div class=\"scene-phone-body\"><div class=\"scene-phone-empty\">" + esc(scene.owner) + ' is on a job. Watch what lands here.</div></div></div></div>' +
      '<button type="button" class="scene-replay" hidden>Replay</button>';
  }

  function play(el, scene) {
    if (el.dataset.playing === 'true') return;
    el.dataset.playing = 'true';
    var msgs = el.querySelector('.scene-msgs'), body = el.querySelector('.scene-phone-body'), replay = el.querySelector('.scene-replay'), ptime = el.querySelector('.scene-phone-time');
    msgs.innerHTML = ''; body.innerHTML = '<div class="scene-phone-empty">' + esc(scene.owner) + ' is on a job. Watch what lands here.</div>'; replay.hidden = true; ptime.textContent = '';
    var i = 0;
    function next() {
      if (i >= scene.msgs.length) return notify();
      var m = scene.msgs[i++]; var role = m[0], text = m[1];
      var delayType = reduce ? 0 : (role === 'a' ? 900 + Math.min(text.length * 12, 1400) : 500 + Math.min(text.length * 25, 1200));
      var ty = null;
      if (!reduce) { ty = document.createElement('div'); ty.className = 'scene-msg ' + (role === 'a' ? 'agent' : 'user') + ' scene-typing'; ty.innerHTML = '<span></span><span></span><span></span>'; msgs.appendChild(ty); msgs.scrollTop = msgs.scrollHeight; }
      setTimeout(function () {
        if (ty) ty.remove();
        var d = document.createElement('div'); d.className = 'scene-msg ' + (role === 'a' ? 'agent' : 'user'); d.textContent = text; msgs.appendChild(d); msgs.scrollTop = msgs.scrollHeight;
        setTimeout(next, reduce ? 0 : 350);
      }, delayType);
    }
    function notify() {
      setTimeout(function () {
        var n = scene.notif;
        ptime.textContent = n.time;
        body.innerHTML = '<div class="scene-notif' + (n.urgency === 'EMERGENCY' ? ' is-emergency' : '') + '"><div class="scene-notif-head">' + esc(scene.company) + ' front desk · <b>' + esc(n.urgency) + '</b></div><div class="scene-notif-body">' +
          n.rows.map(function (r) { return '<div><span>' + esc(r[0]) + '</span>' + esc(r[1]) + '</div>'; }).join('') + '</div></div>';
        var frame = el.querySelector('.scene-phone-frame'); frame.classList.remove('is-buzz'); void frame.offsetWidth; frame.classList.add('is-buzz');
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
