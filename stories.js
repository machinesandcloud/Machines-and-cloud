// A user-controlled product walkthrough. Static initial content also works without JavaScript.
(function () {
  'use strict';
  var buttons = document.querySelectorAll('[data-example]');
  var messages = document.getElementById('example-messages');
  var summary = document.getElementById('example-summary');
  if (!buttons.length || !messages || !summary) return;
  var examples = {
    sms: {
      channel: 'Text conversation', lang: 'en', customer: 'Customer', agent: 'Front desk',
      messages: [
        ['customer', 'My AC is running, but the house isn’t cooling. Do you come out to Katy?'],
        ['agent', 'Yes, Katy is in our service area. We have tomorrow, 8 to 12 or 12 to 5. Which works for you?'],
        ['customer', 'I’m Alex, (713) 555-0142, at 12 Oak St in Katy. 12 to 5 works.'],
        ['agent', 'You’re booked for tomorrow, 12 to 5. The tech will text when they’re on the way. You’ll get appointment texts from your shop; reply STOP any time to end them.']
      ],
      summary: [['Job', 'AC running, not cooling'], ['Where', '12 Oak St, Katy'], ['Window', 'Tomorrow, 12 to 5'], ['Contact', 'Alex · (713) 555-0142'], ['Next', 'Text when you’re on the way']]
    },
    call: {
      channel: 'Phone conversation', lang: 'en', customer: 'Caller', agent: 'Front desk',
      messages: [
        ['customer', 'The kitchen tap keeps dripping. Can a plumber come this week?'],
        ['agent', 'We can help with that. Thursday’s open windows are 8 to 12 or 12 to 5. Which works for you?'],
        ['customer', '8 to 12. I’m Sam, (713) 555-0151, at 24 Pine St in Katy.'],
        ['agent', 'You’re booked for Thursday, 8 to 12. The plumber will confirm the price on site and text when they’re on the way. You’ll get appointment texts from your shop; reply STOP any time to end them.']
      ],
      summary: [['Job', 'Dripping kitchen tap'], ['Where', '24 Pine St, Katy'], ['Window', 'Thursday, 8 to 12'], ['Contact', 'Sam · (713) 555-0151'], ['Next', 'Confirm the price on site']]
    },
    spanish: {
      channel: 'Website chat · Español', lang: 'es', customer: 'Cliente', agent: 'Recepción',
      messages: [
        ['customer', 'Hola, ¿hacen limpieza de apartamentos en Katy? Necesito una limpieza profunda.'],
        ['agent', '¡Sí! Atendemos Katy. Tenemos el sábado de 8 a 12 o de 12 a 5. ¿Qué horario le conviene?'],
        ['customer', 'De 8 a 12. Soy Ana, (713) 555-0152. La dirección es 36 Elm St, Katy.'],
        ['agent', 'Su visita está reservada para el sábado de 8 a 12. Recibirá mensajes de texto sobre su cita de su empresa. Responda STOP o ALTO cuando quiera para dejar de recibirlos.']
      ],
      summary: [['Job', 'Apartment deep clean'], ['Where', '36 Elm St, Katy'], ['Window', 'Saturday, 8 to 12'], ['Contact', 'Ana · (713) 555-0152'], ['Language', 'Spanish']]
    }
  };
  function render(id, announce) {
    var example = examples[id];
    if (!example) return;
    buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.example === id)); });
    document.getElementById('example-channel').textContent = example.channel;
    messages.lang = example.lang;
    messages.replaceChildren();
    example.messages.forEach(function (m) {
      var row = document.createElement('div'); row.className = 'site-message site-message-' + m[0];
      var speaker = document.createElement('span'); speaker.textContent = m[0] === 'agent' ? example.agent : example.customer;
      var text = document.createElement('p'); text.textContent = m[1];
      row.append(speaker, text); messages.appendChild(row);
    });
    summary.replaceChildren();
    example.summary.forEach(function (s) {
      var row = document.createElement('div'), label = document.createElement('dt'), value = document.createElement('dd');
      label.textContent = s[0]; value.textContent = s[1]; row.append(label, value); summary.appendChild(row);
    });
    if (announce) document.getElementById('example-status').textContent = example.channel + ' and owner summary shown.';
  }
  buttons.forEach(function (button) { button.addEventListener('click', function () { render(button.dataset.example, true); }); });
  render('sms', false);
})();
