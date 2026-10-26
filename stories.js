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
  "sms": {
    "persona": "bayou-air",
    "company": "Bayou Air & Heat",
    "channel": "Customer conversation",
    "liveChannel": "Bayou Air & Heat",
    "lang": "en",
    "customer": "Customer",
    "agent": "Front desk",
    "greeting": "Hi! I’m the AI front desk for Bayou Air & Heat. Ask me about an AC problem, our area or a service visit.",
    "problem": "A customer is on your website. You’re on a job.",
    "promise": "See how the chat explains your fee and gathers the details you need to call back.",
    "ruleSummary": "Example shop · Katy · $89 diagnostic · Ray confirms visits",
    "rules": "Bayou Air & Heat serves Katy, Cypress, Memorial, the Energy Corridor, Sugar Land and Richmond. Not Pearland or The Woodlands. The $89 diagnostic goes toward an approved repair; repairs are quoted on site. Requested windows: 8 to 12 or 12 to 5. Exact times are not promised. Ray confirms requested visits.",
    "suggestion": "My AC runs but won’t cool. Do you come to Katy, and what’s the call-out fee?",
    "challenges": [
      [
        "Area + fee",
        "My AC runs but won’t cool. Do you come to Katy, and what’s the call-out fee?"
      ],
      [
        "Outside my area",
        "I’m in The Woodlands. Do you serve my area?"
      ],
      [
        "Only a callback",
        "I’m Alex, (713) 555-0142. Just have someone call me after 3 pm; don’t book a visit."
      ],
      [
        "An exact time?",
        "Can you guarantee someone will be here at exactly 2 pm?"
      ]
    ],
    "messages": [
      [
        "customer",
        "My AC runs but won’t cool. Do you come to Katy, and what’s the call-out fee?"
      ],
      [
        "agent",
        "Yes, we serve Katy. The diagnostic visit is $89, applied to the repair if you go ahead."
      ],
      [
        "customer",
        "Does that cover the whole repair? I don’t want a surprise price."
      ],
      [
        "agent",
        "The technician will give you a repair quote after inspecting the unit. The $89 diagnostic is credited toward the repair if you go ahead."
      ],
      [
        "customer",
        "Could I request tomorrow at exactly 2 pm?"
      ],
      [
        "agent",
        "You can request 8 to 12 or 12 to 5. Ray will need to confirm the window; which works better?"
      ],
      [
        "customer",
        "Tomorrow, 12 to 5 works. I’m Alex, (713) 555-0142, at 12 Oak St, Katy."
      ],
      [
        "agent",
        "Thanks, Alex. I’ve noted your AC problem, address and preferred window: tomorrow, 12 to 5. Ray still needs to confirm the visit."
      ],
      [
        "customer",
        "Actually, use (713) 555-0143 instead. The address is still 12 Oak St."
      ],
      [
        "agent",
        "Updated your number to (713) 555-0143. The Katy address and tomorrow’s 12-to-5 request stay the same."
      ],
      [
        "customer",
        "If that window doesn’t work, ask me before choosing a different one."
      ],
      [
        "agent",
        "Of course. Your request includes the corrected number and a note to check with you before changing the window."
      ]
    ],
    "first": [
      [
        "Job",
        "AC runs but won’t cool"
      ],
      [
        "Where",
        "Katy; street not provided"
      ],
      [
        "Requested",
        "No visit requested yet"
      ],
      [
        "Contact",
        "Not provided yet"
      ],
      [
        "Next",
        "Answer service-area and diagnostic-fee questions"
      ]
    ],
    "summary": [
      [
        "Job",
        "AC runs but won’t cool"
      ],
      [
        "Where",
        "12 Oak St, Katy"
      ],
      [
        "Requested",
        "Tomorrow, 12 to 5 · not confirmed"
      ],
      [
        "Contact",
        "Alex · (713) 555-0143"
      ],
      [
        "Next",
        "Ray to review; ask Alex before changing the window"
      ]
    ],
    "completeStatus": "Visit request · not confirmed",
    "checkpoints": [
      {
        "after": 1,
        "status": "Answering a question",
        "rows": [
          [
            "Job",
            "AC runs but won’t cool"
          ],
          [
            "Where",
            "Katy; street not provided"
          ],
          [
            "Requested",
            "No visit requested yet"
          ],
          [
            "Contact",
            "Not provided yet"
          ],
          [
            "Next",
            "Answer service-area and diagnostic-fee questions"
          ]
        ]
      },
      {
        "after": 3,
        "status": "Answering a question",
        "rows": [
          [
            "Job",
            "AC runs but won’t cool; asks about repair pricing"
          ],
          [
            "Where",
            "Katy; street not provided"
          ],
          [
            "Requested",
            "No visit requested yet"
          ],
          [
            "Contact",
            "Not provided yet"
          ],
          [
            "Next",
            "Explain the diagnostic fee and on-site repair quote"
          ]
        ]
      },
      {
        "after": 5,
        "status": "Visit request · time not confirmed",
        "rows": [
          [
            "Job",
            "AC runs but won’t cool"
          ],
          [
            "Where",
            "Katy; street not provided"
          ],
          [
            "Requested",
            "Tomorrow at 2 pm; exact times not promised"
          ],
          [
            "Contact",
            "Not provided yet"
          ],
          [
            "Next",
            "Choose a usual arrival window"
          ]
        ]
      },
      {
        "after": 7,
        "status": "Visit request · not confirmed",
        "rows": [
          [
            "Job",
            "AC runs but won’t cool"
          ],
          [
            "Where",
            "12 Oak St, Katy"
          ],
          [
            "Requested",
            "Tomorrow, 12 to 5 · not confirmed"
          ],
          [
            "Contact",
            "Alex · (713) 555-0142"
          ],
          [
            "Next",
            "Ray to review the requested window"
          ]
        ]
      },
      {
        "after": 9,
        "status": "Contact corrected",
        "rows": [
          [
            "Job",
            "AC runs but won’t cool"
          ],
          [
            "Where",
            "12 Oak St, Katy"
          ],
          [
            "Requested",
            "Tomorrow, 12 to 5 · not confirmed"
          ],
          [
            "Contact",
            "Alex · (713) 555-0143"
          ],
          [
            "Next",
            "Ray to review the request using the corrected number"
          ]
        ]
      },
      {
        "after": 11,
        "status": "Visit request · not confirmed",
        "rows": [
          [
            "Job",
            "AC runs but won’t cool"
          ],
          [
            "Where",
            "12 Oak St, Katy"
          ],
          [
            "Requested",
            "Tomorrow, 12 to 5 · not confirmed"
          ],
          [
            "Contact",
            "Alex · (713) 555-0143"
          ],
          [
            "Next",
            "Ray to review; ask Alex before changing the window"
          ]
        ]
      },
      {
        "after": 12,
        "status": "Visit request · not confirmed",
        "rows": [
          [
            "Job",
            "AC runs but won’t cool"
          ],
          [
            "Where",
            "12 Oak St, Katy"
          ],
          [
            "Requested",
            "Tomorrow, 12 to 5 · not confirmed"
          ],
          [
            "Contact",
            "Alex · (713) 555-0143"
          ],
          [
            "Next",
            "Ray to review; ask Alex before changing the window"
          ]
        ]
      }
    ]
  },
  "call": {
    "persona": "katy-pipeworks",
    "company": "Katy Pipeworks",
    "channel": "After-hours conversation",
    "liveChannel": "Katy Pipeworks",
    "lang": "en",
    "customer": "Customer",
    "agent": "Front desk",
    "greeting": "Hi! I’m the AI front desk for Katy Pipeworks. It’s after hours in this example. What can I help you with?",
    "problem": "Your business is closed. A visitor has an urgent question.",
    "promise": "See how an urgent question becomes a request for human review. You can type or try the separate voice practice demo.",
    "ruleSummary": "Example shop · Fulshear · $150 after-hours fee · Human callback",
    "rules": "Katy Pipeworks serves Katy, Fulshear, Richmond, Sugar Land, Cinco Ranch and Brookshire. Active leaks, no water and sewage backup get an urgent after-hours request. Published emergency fee: $150. Dana confirms any other charges before a visit. Slab leaks and repiping need an on-site quote. No arrival time or callback deadline is confirmed.",
    "suggestion": "It’s 10 pm and water is actively leaking at my home in Fulshear. Can a plumber help?",
    "challenges": [
      [
        "An active leak",
        "It’s 10 pm and water is actively leaking at my home in Fulshear. Can a plumber help?"
      ],
      [
        "Callback, not a visit",
        "I’m Sam, (713) 555-0151. Just have someone call me; don’t book a visit."
      ],
      [
        "A slab-leak quote?",
        "How much is the total price to repair a slab leak?"
      ],
      [
        "A gas smell",
        "I smell gas in the house. What should I do?"
      ]
    ],
    "messages": [
      [
        "customer",
        "It’s 10 pm and water is actively leaking at my home in Fulshear. Can a plumber help?"
      ],
      [
        "agent",
        "An active leak is an after-hours emergency for our shop. The emergency fee is $150. I can take your details for an urgent callback request; what’s your name and best number?"
      ],
      [
        "customer",
        "I’m Sam, (713) 555-0151, at 24 Pine St, Fulshear. I only want a call first, not a booked visit."
      ],
      [
        "agent",
        "Got it—you’re asking for an urgent callback, with no visit booked. I’ve noted your name, number and Fulshear address."
      ],
      [
        "customer",
        "Is the $150 the whole bill, or is there a service fee and repair cost too?"
      ],
      [
        "agent",
        "The $150 is the after-hours fee. The shop needs to confirm whether the $79 service-call fee also applies and quote the repair before you agree to a visit."
      ],
      [
        "customer",
        "Can you guarantee a call back within ten minutes?"
      ],
      [
        "agent",
        "I’ve noted that you’d like a callback within ten minutes. The team needs to confirm when they can call."
      ],
      [
        "customer",
        "Use (713) 555-0154 instead, and call only, please. Don’t text me."
      ],
      [
        "agent",
        "Your callback number is now (713) 555-0154. I’ve also noted: call only, no texts."
      ],
      [
        "customer",
        "The leak is under the kitchen sink. Don’t send anyone until we’ve spoken."
      ],
      [
        "agent",
        "Your request says: active leak under the kitchen sink, urgent callback only, and speak with you before arranging a visit. The corrected number is included."
      ]
    ],
    "first": [
      [
        "Job",
        "Active leak at 10 pm"
      ],
      [
        "Where",
        "Fulshear; street not provided"
      ],
      [
        "Priority",
        "Urgent after-hours request"
      ],
      [
        "Contact",
        "Not provided yet"
      ],
      [
        "Next",
        "Collect the caller’s preferred next step and callback details"
      ]
    ],
    "summary": [
      [
        "Job",
        "Active leak under kitchen sink at 10 pm"
      ],
      [
        "Where",
        "24 Pine St, Fulshear"
      ],
      [
        "Request",
        "Callback only; no texts; speak before any visit"
      ],
      [
        "Contact",
        "Sam · (713) 555-0154"
      ],
      [
        "Timing",
        "Within ten minutes requested · not confirmed"
      ],
      [
        "Next",
        "Dana to review urgent callback and fee questions; no dispatch arranged"
      ]
    ],
    "completeStatus": "Urgent callback request",
    "checkpoints": [
      {
        "after": 1,
        "status": "Urgent request",
        "rows": [
          [
            "Job",
            "Active leak at 10 pm"
          ],
          [
            "Where",
            "Fulshear; street not provided"
          ],
          [
            "Priority",
            "Urgent after-hours request"
          ],
          [
            "Contact",
            "Not provided yet"
          ],
          [
            "Next",
            "Collect the caller’s preferred next step and callback details"
          ]
        ]
      },
      {
        "after": 3,
        "status": "Urgent callback request",
        "rows": [
          [
            "Job",
            "Active leak at 10 pm"
          ],
          [
            "Where",
            "24 Pine St, Fulshear"
          ],
          [
            "Request",
            "Callback only; no visit"
          ],
          [
            "Contact",
            "Sam · (713) 555-0151"
          ],
          [
            "Timing",
            "Not provided; not confirmed"
          ],
          [
            "Next",
            "Dana to review the urgent callback request"
          ]
        ]
      },
      {
        "after": 5,
        "status": "Urgent callback request",
        "rows": [
          [
            "Job",
            "Active leak at 10 pm; asks about fees"
          ],
          [
            "Where",
            "24 Pine St, Fulshear"
          ],
          [
            "Request",
            "Callback only; no visit"
          ],
          [
            "Contact",
            "Sam · (713) 555-0151"
          ],
          [
            "Timing",
            "Not provided; not confirmed"
          ],
          [
            "Next",
            "Dana to review the request and confirm charges before any visit"
          ]
        ]
      },
      {
        "after": 7,
        "status": "Callback timing not confirmed",
        "rows": [
          [
            "Job",
            "Active leak at 10 pm; asks about fees"
          ],
          [
            "Where",
            "24 Pine St, Fulshear"
          ],
          [
            "Request",
            "Callback only; no visit"
          ],
          [
            "Contact",
            "Sam · (713) 555-0151"
          ],
          [
            "Timing",
            "Within ten minutes requested · not confirmed"
          ],
          [
            "Next",
            "Dana to review; no callback deadline guaranteed"
          ]
        ]
      },
      {
        "after": 9,
        "status": "Contact corrected · call only",
        "rows": [
          [
            "Job",
            "Active leak at 10 pm; asks about fees"
          ],
          [
            "Where",
            "24 Pine St, Fulshear"
          ],
          [
            "Request",
            "Callback only; no texts or visit"
          ],
          [
            "Contact",
            "Sam · (713) 555-0154"
          ],
          [
            "Timing",
            "Within ten minutes requested · not confirmed"
          ],
          [
            "Next",
            "Dana to review using the corrected number; confirm charges before any visit"
          ]
        ]
      },
      {
        "after": 11,
        "status": "Urgent callback request",
        "rows": [
          [
            "Job",
            "Active leak under kitchen sink at 10 pm"
          ],
          [
            "Where",
            "24 Pine St, Fulshear"
          ],
          [
            "Request",
            "Callback only; no texts; speak before any visit"
          ],
          [
            "Contact",
            "Sam · (713) 555-0154"
          ],
          [
            "Timing",
            "Within ten minutes requested · not confirmed"
          ],
          [
            "Next",
            "Dana to review urgent callback and fee questions; no dispatch arranged"
          ]
        ]
      },
      {
        "after": 12,
        "status": "Urgent callback request",
        "rows": [
          [
            "Job",
            "Active leak under kitchen sink at 10 pm"
          ],
          [
            "Where",
            "24 Pine St, Fulshear"
          ],
          [
            "Request",
            "Callback only; no texts; speak before any visit"
          ],
          [
            "Contact",
            "Sam · (713) 555-0154"
          ],
          [
            "Timing",
            "Within ten minutes requested · not confirmed"
          ],
          [
            "Next",
            "Dana to review urgent callback and fee questions; no dispatch arranged"
          ]
        ]
      }
    ]
  },
  "spanish": {
    "persona": "westheimer-maids",
    "company": "Westheimer Maids",
    "channel": "Conversación en español",
    "liveChannel": "Westheimer Maids",
    "lang": "es",
    "customer": "Cliente",
    "agent": "Recepción",
    "greeting": "¡Hola! Soy la recepción con IA de Westheimer Maids. ¿En qué puedo ayudarle?",
    "problem": "Your customer wants to explain it in Spanish.",
    "promise": "Ask in Spanish, change a detail and see the request stay accurate. The customer chooses the language.",
    "ruleSummary": "Example shop · Memorial · Deep clean from $229 · Nia confirms visits",
    "rules": "Westheimer Maids serves Memorial, Galleria, Uptown, Tanglewood, Bellaire, West University, River Oaks and Montrose; not outside Beltway 8. Ask bedrooms, bathrooms and square footage before quoting a deep clean from $229. Published extra bedroom charge: $25. Requested windows: 8–10, 10–12, 1–3 or 3–5; no exact time. Nia confirms visits.",
    "suggestion": "Hola, necesito una limpieza profunda en Memorial: dos habitaciones, dos baños y 1,000 pies cuadrados. ¿Cuánto cuesta?",
    "challenges": [
      [
        "Pedir una limpieza",
        "Hola, necesito una limpieza profunda en Memorial: dos habitaciones, dos baños y 1,000 pies cuadrados. ¿Cuánto cuesta?"
      ],
      [
        "Cambiar un dato",
        "En realidad son 3 recámaras, no 2. Los demás datos siguen iguales."
      ],
      [
        "¿Una hora exacta?",
        "¿Pueden garantizar que lleguen exactamente a las 9?"
      ],
      [
        "Fuera de la zona",
        "Estoy fuera del Beltway 8. ¿Atienden mi zona?"
      ]
    ],
    "messages": [
      [
        "customer",
        "Hola, necesito una limpieza profunda en Memorial. ¿Cuánto cuesta?"
      ],
      [
        "agent",
        "Sí, atendemos Memorial. Para orientarle sobre el precio, ¿cuántas habitaciones y baños tiene, y cuántos pies cuadrados son?"
      ],
      [
        "customer",
        "Son dos habitaciones, dos baños y 1,000 pies cuadrados."
      ],
      [
        "agent",
        "La limpieza profunda empieza desde $229; Nia debe confirmar el precio final. ¿Qué día y horario quiere solicitar?"
      ],
      [
        "customer",
        "El sábado. ¿Pueden garantizar que lleguen exactamente a las 9 de la mañana?"
      ],
      [
        "agent",
        "Puede solicitar la ventana de 8 a 10. Nia debe confirmar la disponibilidad; ¿le sirve ese horario?"
      ],
      [
        "customer",
        "Sí, de 8 a 10. Soy Ana, (713) 555-0152, en 36 Elm St, Memorial."
      ],
      [
        "agent",
        "Gracias, Ana. Ya tengo sus datos y la solicitud para el sábado, de 8 a 10. Nia debe confirmar la visita."
      ],
      [
        "customer",
        "En realidad son tres habitaciones, no dos. Los dos baños y los 1,000 pies cuadrados siguen igual."
      ],
      [
        "agent",
        "Actualizado: tres habitaciones, dos baños y 1,000 pies cuadrados. Nia debe revisar el precio final con ese cambio; su dirección y horario solicitado siguen iguales."
      ],
      [
        "customer",
        "Prefiero que me llamen antes de cambiar el horario. No elijan otro sin preguntarme."
      ],
      [
        "agent",
        "He anotado que desea una llamada antes de cualquier cambio. La solicitud incluye los datos corregidos y el sábado de 8 a 10 como horario preferido."
      ]
    ],
    "first": [
      [
        "Job",
        "Deep clean; size and room counts not provided"
      ],
      [
        "Where",
        "Memorial; street not provided"
      ],
      [
        "Requested",
        "No visit requested yet"
      ],
      [
        "Language",
        "Spanish"
      ],
      [
        "Next",
        "Collect bedrooms, bathrooms and square footage before quoting"
      ]
    ],
    "summary": [
      [
        "Job",
        "Deep clean · 3 beds, 2 baths · 1,000 sq ft"
      ],
      [
        "Where",
        "36 Elm St, Memorial"
      ],
      [
        "Requested",
        "Saturday, 8 to 10 · not confirmed"
      ],
      [
        "Contact",
        "Ana · (713) 555-0152"
      ],
      [
        "Language",
        "Spanish"
      ],
      [
        "Next",
        "Nia to review price and window; call before any window change"
      ]
    ],
    "completeStatus": "Visit request · not confirmed",
    "checkpoints": [
      {
        "after": 1,
        "status": "Answering a question",
        "rows": [
          [
            "Job",
            "Deep clean; size and room counts not provided"
          ],
          [
            "Where",
            "Memorial; street not provided"
          ],
          [
            "Requested",
            "No visit requested yet"
          ],
          [
            "Language",
            "Spanish"
          ],
          [
            "Next",
            "Collect bedrooms, bathrooms and square footage before quoting"
          ]
        ]
      },
      {
        "after": 3,
        "status": "Answering a question",
        "rows": [
          [
            "Job",
            "Deep clean · 2 beds, 2 baths · 1,000 sq ft"
          ],
          [
            "Where",
            "Memorial; street not provided"
          ],
          [
            "Requested",
            "No visit requested yet"
          ],
          [
            "Language",
            "Spanish"
          ],
          [
            "Next",
            "Explain the starting price; Nia to confirm the final quote"
          ]
        ]
      },
      {
        "after": 5,
        "status": "Visit request · time not confirmed",
        "rows": [
          [
            "Job",
            "Deep clean · 2 beds, 2 baths · 1,000 sq ft"
          ],
          [
            "Where",
            "Memorial; street not provided"
          ],
          [
            "Requested",
            "Saturday at 9 am; exact times not promised"
          ],
          [
            "Language",
            "Spanish"
          ],
          [
            "Next",
            "Choose a usual arrival window"
          ]
        ]
      },
      {
        "after": 7,
        "status": "Visit request · not confirmed",
        "rows": [
          [
            "Job",
            "Deep clean · 2 beds, 2 baths · 1,000 sq ft"
          ],
          [
            "Where",
            "36 Elm St, Memorial"
          ],
          [
            "Requested",
            "Saturday, 8 to 10 · not confirmed"
          ],
          [
            "Contact",
            "Ana · (713) 555-0152"
          ],
          [
            "Language",
            "Spanish"
          ],
          [
            "Next",
            "Nia to review the requested window and final price"
          ]
        ]
      },
      {
        "after": 9,
        "status": "Room count corrected",
        "rows": [
          [
            "Job",
            "Deep clean · 3 beds, 2 baths · 1,000 sq ft"
          ],
          [
            "Where",
            "36 Elm St, Memorial"
          ],
          [
            "Requested",
            "Saturday, 8 to 10 · not confirmed"
          ],
          [
            "Contact",
            "Ana · (713) 555-0152"
          ],
          [
            "Language",
            "Spanish"
          ],
          [
            "Next",
            "Nia to review the final price using the corrected room count"
          ]
        ]
      },
      {
        "after": 11,
        "status": "Visit request · not confirmed",
        "rows": [
          [
            "Job",
            "Deep clean · 3 beds, 2 baths · 1,000 sq ft"
          ],
          [
            "Where",
            "36 Elm St, Memorial"
          ],
          [
            "Requested",
            "Saturday, 8 to 10 · not confirmed"
          ],
          [
            "Contact",
            "Ana · (713) 555-0152"
          ],
          [
            "Language",
            "Spanish"
          ],
          [
            "Next",
            "Nia to review price and window; call before any window change"
          ]
        ]
      },
      {
        "after": 12,
        "status": "Visit request · not confirmed",
        "rows": [
          [
            "Job",
            "Deep clean · 3 beds, 2 baths · 1,000 sq ft"
          ],
          [
            "Where",
            "36 Elm St, Memorial"
          ],
          [
            "Requested",
            "Saturday, 8 to 10 · not confirmed"
          ],
          [
            "Contact",
            "Ana · (713) 555-0152"
          ],
          [
            "Language",
            "Spanish"
          ],
          [
            "Next",
            "Nia to review price and window; call before any window change"
          ]
        ]
      }
    ]
  }
};
  var scenario = 'sms', mode = 'watch', step = 1, playing = false, timer = null;
  var autoStarted = false, visible = false, generation = 0, controller = null, requestTimer = null;
  var history = [], pending = false, typing = null;
  var composerVisible = false, voiceActive = false, voiceController = null, voiceEpoch = 0, voiceLoader = null;
  var voicePartial = null, voiceTurns = [], lastVoiceFinal = '';
  var lastSummary = [], lastTicket = 'Waiting for details';
  function launcherVisibility() { document.body.classList.toggle('site-inline-chat-active', composerVisible || voiceActive); }
  function announce(text) { el('status').textContent = text; }
  function setTicket(text) {
    lastTicket = text; el('ticket-status').textContent = text;
    el('owner-dialog-status').textContent = text;
    el('peek-text').textContent = 'Owner preview · ' + text;
  }
  function rows(data) {
    lastSummary = data;
    [summary, el('owner-dialog-summary')].forEach(function (target) {
      target.replaceChildren();
      data.forEach(function (item) {
        var row = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
        dt.textContent = item[0]; dd.textContent = item[1]; row.append(dt, dd); target.appendChild(row);
      });
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
    var checkpoint = (ex.checkpoints || []).filter(function (item) { return item.after <= step; }).pop();
    var data = checkpoint ? checkpoint.rows : step === ex.messages.length ? ex.summary : ex.first;
    rows(data); setTicket(checkpoint ? checkpoint.status : step === ex.messages.length ? ex.completeStatus : scenario === 'call' ? 'Urgent request' : 'Gathering details');
  }
  function playbackControls() {
    var complete = step === examples[scenario].messages.length;
    el('play').hidden = complete;
    el('play').textContent = playing ? 'Pause' : complete ? 'Play again' : 'Play';
    el('play').setAttribute('aria-label', playing ? 'Pause the example' : complete ? 'Play the example again' : 'Play the example');
  }
  function pause() { clearTimeout(timer); timer = null; playing = false; removeTyping(); playbackControls(); }
  function nextMessage() {
    if (!playing || mode !== 'watch') return;
    if (step >= examples[scenario].messages.length) { pause(); return; }
    removeTyping(); var m = examples[scenario].messages[step]; bubble(m[0], m[1]); step++; watchSummary(); follow();
    announce(step === examples[scenario].messages.length ? 'Example complete. The owner summary is ready.' : m[0] === 'agent' ? 'Front desk replied. Owner details updated.' : 'Customer details added.');
    if (step === examples[scenario].messages.length) { pause(); return; }
    schedule();
  }
  function schedule() {
    showTyping(); follow();
    timer = setTimeout(nextMessage, 2300);
  }
  function watchStart() {
    pause(); messages.replaceChildren(); step = motion.matches ? examples[scenario].messages.length : 1;
    examples[scenario].messages.slice(0, step).forEach(function (m) { bubble(m[0], m[1]); });
    if (step === examples[scenario].messages.length) requestAnimationFrame(follow); else messages.scrollTop = 0; watchSummary(); playbackControls();
  }
  function play() {
    autoStarted = true;
    if (motion.matches) { watchStart(); announce('Complete example shown.'); return; }
    if (step === examples[scenario].messages.length) watchStart();
    playing = true; playbackControls(); schedule();
  }
  function cancelRequest() {
    generation++; if (controller) controller.abort(); controller = null;
    clearTimeout(requestTimer); requestTimer = null; pending = false;
    messages.setAttribute('aria-busy', 'false'); input.readOnly = false; el('send').disabled = !input.value.trim(); removeTyping();
  }
  function emptySummary() {
    rows([['Job', 'Waiting for your request'], ['Where', 'Not provided yet'], ['Window', 'Not chosen yet'], ['Contact', 'Not provided yet'], ['Next', 'Tell the front desk what you need']]);
    setTicket('Waiting for details');
  }
  function liveStart() {
    cancelRequest(); history = []; messages.replaceChildren(); bubble('agent', examples[scenario].greeting);
    input.value = ''; input.disabled = false; el('send').disabled = true; el('error').hidden = true;
    el('voice-status').textContent = '';
    emptySummary(); messages.scrollTop = 0;
  }
  function render(focus) {
    pause(); cancelRequest(); stopVoice(false);
    el('voice-status').textContent = '';
    var ex = examples[scenario], live = mode === 'live';
    wrap.dataset.mode = mode;
    launcherVisibility();
    buttons.forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.example === scenario));

    });
    el('mode-watch').setAttribute('aria-pressed', String(!live)); el('mode-live').setAttribute('aria-pressed', String(live));
    el('live').hidden = false; el('playback').hidden = live; el('reset').hidden = !live;
    el('channel').textContent = live ? ex.liveChannel : ex.channel;
    el('company').textContent = ex.company + ' · AI front desk';
    el('problem').textContent = ex.problem; el('promise').textContent = ex.promise;
    el('rule-summary').textContent = ex.ruleSummary; el('rules').textContent = ex.rules;
    el('badge').textContent = live ? 'Live AI' : 'Example';
    messages.lang = ex.lang;
    el('context').textContent = '';
    el('owner-foot').textContent = live ? 'See the customer’s details alongside the conversation, ready for your next step.' : 'A clear handoff, with the conversation there when you need it.';
    renderChallenges();
    input.lang = ex.lang; input.placeholder = ex.lang === 'es' ? 'Cuéntenos qué necesita…' : 'Tell the front desk what you need…';
    if (live) liveStart(); else { watchStart(); input.value = ''; el('send').disabled = true; }
    if (focus && live) input.focus({ preventScroll: true });
  }
  function liveSummary(events) {
    var event = (events || []).filter(function (e) { return e && e.type === 'owner_notification' && e.data && e.company === examples[scenario].company; }).pop();
    if (!event) return;
    var d = event.data, fields = ['issue', 'address', 'requested_window', 'customer_name', 'phone', 'language', 'urgency'];
    if (!fields.every(function (key) { return typeof d[key] === 'string' && d[key].length <= 2000; }) || !['en', 'es'].includes(d.language) || !['emergency', 'today', 'this_week', 'flexible'].includes(d.urgency)) return;
    var action = d.requested_action;
    if (!['visit_request', 'callback', 'question_only', 'emergency_handoff'].includes(action)) return;
    var ready = d.issue && d.customer_name && d.phone && (action !== 'visit_request' || (d.address && d.requested_window));
    var urgent = d.urgency === 'emergency' || action === 'emergency_handoff';
    var next = action === 'question_only' ? 'Review the conversation; no visit requested' : action === 'callback' ? (urgent ? 'Review urgent callback request' : 'Call the customer; confirm timing') : action === 'emergency_handoff' ? 'Human safety handoff; no dispatch confirmed' : ready ? 'Confirm the requested arrival window' : 'Collect the remaining request details';
    rows([['Job', d.issue || 'Not provided yet'], ['Where', d.address || (action === 'callback' ? 'Not needed for a callback' : 'Not provided yet')], [action === 'callback' ? 'Timing' : 'Requested', d.requested_window || 'Not confirmed'], ['Contact', [d.customer_name, d.phone].filter(Boolean).join(' · ') || 'Not provided yet'], ['Priority', { emergency: 'Urgent', today: 'Today', this_week: 'This week', flexible: 'Not specified' }[d.urgency]], ['Language', d.language === 'es' ? 'Spanish' : 'English'], ['Next', next]]);
    setTicket(action === 'emergency_handoff' ? 'Urgent human handoff' : action === 'callback' ? (urgent ? 'Urgent callback request' : 'Callback requested') : action === 'question_only' ? 'Question answered' : ready ? 'Visit request' : 'Gathering details');
    announce('Owner preview updated: ' + lastTicket + '. ' + next);
  }

  function friendlyError(error) {
    if (error.message === 'busy') return 'The front desk is busy. Please try again in a moment.';
    return 'The reply didn’t finish. Your message is below, ready to try again.';
  }
  async function send(event) {
    event.preventDefault();
    var text = input.value.trim();
    if (pending || voiceActive || !text) return;
    if (mode !== 'live') { mode = 'live'; render(false); input.value = text; }
    if (history.length >= 20) { el('error').hidden = false; el('error').textContent = 'You’ve reached the end of this practice conversation. Choose Start over to try another.'; return; }
    var id = ++generation, prior = history.slice(), userRow = bubble('customer', text), replyRow = null, final = null;
    pending = true; input.value = ''; input.readOnly = true; el('send').disabled = true; el('error').hidden = true;
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
  function frameConversation() {
    // 'auto' inherits the site's smooth scrolling. Finish this user-requested frame
    // before starting playback so an in-transit offscreen state cannot pause it.
    var root = document.documentElement, prior = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    wrap.querySelector('.site-conversation').scrollIntoView({ behavior: 'instant', block: 'start' });
    root.style.scrollBehavior = prior;
  }
  function renderChallenges() {
    var target = el('challenges'); target.querySelectorAll('button').forEach(function (button) { button.remove(); });
    examples[scenario].challenges.forEach(function (challenge) {
      var button = document.createElement('button'); button.type = 'button'; button.textContent = challenge[0]; button.lang = examples[scenario].lang;
      button.addEventListener('click', function () {
        if (pending || voiceActive) return;
        if (mode !== 'live') { mode = 'live'; render(false); }
        input.value = challenge[1]; el('send').disabled = false; input.focus({ preventScroll: true });
      }); target.appendChild(button);
    });
  }
  function voiceControls() {
    el('voice-card').hidden = scenario !== 'call';
    el('voice-start').hidden = voiceActive; el('voice-stop').hidden = !voiceActive;
    input.disabled = voiceActive; el('send').disabled = voiceActive || pending || !input.value.trim();
    el('challenges').querySelectorAll('button').forEach(function (button) { button.disabled = voiceActive || pending; });
    launcherVisibility();
  }
  function stopVoice(notify) {
    voiceEpoch++; if (voiceController) voiceController.destroy(); voiceController = null;
    if (voiceActive && notify) el('voice-status').textContent = 'Call ended. You can start again or type a message.';
    voiceActive = false; voicePartial = null; voiceControls();
  }
  function loadVoice() {
    if (window.MCDemoVoice) return Promise.resolve(window.MCDemoVoice);
    if (!voiceLoader) voiceLoader = new Promise(function (resolve, reject) {
      var script = document.createElement('script'); script.src = 'practice-voice.js';
      script.onload = function () { if (window.MCDemoVoice) resolve(window.MCDemoVoice); else reject(new Error('unavailable')); };
      script.onerror = function () { script.remove(); voiceLoader = null; reject(new Error('unavailable')); }; document.head.appendChild(script);
    }); return voiceLoader;
  }
  async function startVoice() {
    if (scenario !== 'call' || voiceActive || pending) return;
    mode = 'live'; render(false); frameConversation(); messages.replaceChildren(); history = []; voiceTurns = []; lastVoiceFinal = '';
    var epoch = ++voiceEpoch; voiceActive = true; voiceControls();
    el('voice-status').textContent = 'Allow microphone access to begin your practice call…';
    function active() { return epoch === voiceEpoch && voiceActive; }
    function ended() { if (!active()) return; voiceActive = false; voiceController = null; voicePartial = null; voiceControls(); }
    try {
      var bridge = await loadVoice(); if (!active()) return;
      voiceController = bridge.start({ persona: examples[scenario].persona, language: examples[scenario].lang,
        onStatus: function (event) { if (!active()) return; var labels = { connecting: 'Connecting your practice call…', listening: 'Listening. Tell the front desk what you need.', speaking: 'The front desk is speaking…', ended: 'Call ended. You can start again or type below.' }; el('voice-status').textContent = labels[event.state] || 'Call in progress…'; },
        onTranscript: function (event) {
          if (!active() || !event.text || !['user', 'assistant'].includes(event.role)) return;
          var marker = event.role + ':' + event.text;
          if (event.isFinal && marker === lastVoiceFinal) return;
          if (!voicePartial || voicePartial.role !== event.role) voicePartial = { role: event.role, row: bubble(event.role === 'user' ? 'customer' : 'agent', '') };
          voicePartial.row.querySelector('p').textContent = event.text; follow();
          if (event.isFinal) {
            lastVoiceFinal = marker; var last = voiceTurns[voiceTurns.length - 1];
            if (last && last.role === event.role) last.content += ' ' + event.text; else voiceTurns.push({ role: event.role, content: event.text });
            while (voiceTurns.length && voiceTurns[0].role !== 'user') voiceTurns.shift();
            history = voiceTurns.slice(-18); while (history.length && history[0].role !== 'user') history.shift();
            if (history.length && history[history.length - 1].role === 'user') history = history.slice(0, -1);
            voicePartial = null; announce((event.role === 'assistant' ? 'Front desk: ' : 'Customer: ') + event.text);
          }
        },
        onSummary: function (event) { if (active()) liveSummary([event]); },
        onError: function (error) {
          if (!active()) return;
          var labels = {
            permission_denied: 'Microphone access was blocked. Allow it in your browser, or type below.',
            microphone_denied: 'Microphone access was blocked. Allow it in your browser, or type below.',
            microphone_unavailable: 'No usable microphone was found. Check your device, or type below.',
            not_supported: 'Voice is unavailable in this browser. You can use the live typed chat below.',
            unsupported: 'Voice is unavailable in this browser. You can use the live typed chat below.',
            busy: 'Both practice calls are in use. Please try later, or type below.',
            rate_limited: 'You have reached the practice call limit for this hour. You can still type below.',
            daily_limit: 'Today’s practice call allowance has been used. The live typed chat is ready below.',
            storage_unavailable: 'Voice is temporarily unavailable. You can use the live typed chat below.',
            voice_unavailable: 'Voice is temporarily unavailable. You can use the live typed chat below.',
            offline: 'Voice is unavailable right now. The live typed chat is ready below.',
            timeout: 'The voice connection timed out. You can retry or type below.',
            connection_failed: 'The voice connection ended. You can retry or type below.'
          };
          el('voice-status').textContent = labels[error.code] || 'The call could not connect. You can retry or type below.';
          el('error').textContent = el('voice-status').textContent; el('error').hidden = false; ended();
        },
        onEnd: function () { if (!active()) return; el('voice-status').textContent = 'Call ended. Review the owner preview, start again or type below.'; ended(); }
      });
      await voiceController.ready;
    } catch (error) { if (active()) { el('voice-status').textContent = 'Voice could not load. You can retry or type a request below.'; ended(); } }
  }
  buttons.forEach(function (button) { button.addEventListener('click', function () {
    scenario = button.dataset.example; autoStarted = true; render(false); frameConversation();
    if (mode === 'watch') play(); announce(examples[scenario].problem + ' selected.');
  }); });
  el('mode-watch').addEventListener('click', function () { mode = 'watch'; autoStarted = true; render(false); play(); });
  el('mode-live').addEventListener('click', function () { if (mode === 'live') return; mode = 'live'; autoStarted = true; render(true); announce('Live AI practice ready. Choose a challenge, type or start a voice call.'); });
  el('play').addEventListener('click', function () { if (playing) { pause(); announce('Example paused.'); } else { frameConversation(); play(); } });
  el('replay').addEventListener('click', function () { watchStart(); frameConversation(); play(); announce('Example restarted.'); });
  el('reset').addEventListener('click', function () { stopVoice(false); liveStart(); input.focus({ preventScroll: true }); announce('New practice conversation started.'); });
  el('form').addEventListener('submit', send);
  input.addEventListener('focus', function () { if (mode === 'watch') { mode = 'live'; autoStarted = true; render(false); } });
  input.addEventListener('input', function () { el('send').disabled = pending || voiceActive || !input.value.trim(); });
  input.addEventListener('keydown', function (event) { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); el('form').requestSubmit(); } });
  el('voice-start').addEventListener('click', startVoice); el('voice-stop').addEventListener('click', function () { stopVoice(true); });
  el('summary-link').addEventListener('click', function () { el('owner-dialog').showModal(); });
  el('owner-close').addEventListener('click', function () { el('owner-dialog').close(); });
  el('owner-dialog').addEventListener('click', function (event) { if (event.target === el('owner-dialog')) { var r = event.target.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) event.target.close(); } });
  document.addEventListener('visibilitychange', function () { if (document.hidden) { if (playing) pause(); if (voiceActive) stopVoice(true); } });
  window.addEventListener('pagehide', function () { pause(); cancelRequest(); stopVoice(false); });
  motion.addEventListener('change', function () { if (mode === 'watch') { pause(); watchStart(); } });
  render(false); el('controls').hidden = false; wrap.classList.add('site-demo-ready');
  // A visitor-selected sales action opens the matching illustration, never its microphone.
  function showExample(value, focus) {
    if (['sms', 'call', 'spanish'].indexOf(value) >= 0) { scenario = value; mode = 'live'; autoStarted = true; render(false); }
    wrap.scrollIntoView({ block: 'start', behavior: 'instant' });
    if (focus) (scenario === 'call' && mode === 'live' ? el('voice-start') : mode === 'live' ? input : el('mode-live')).focus({ preventScroll: true });
  }
  document.addEventListener('mc:show-example', function (event) { showExample(event.detail && event.detail.scenario, true); });
  var selectedExample = new URLSearchParams(window.location.search).get('example');
  if (['sms', 'call', 'spanish'].indexOf(selectedExample) >= 0) showExample(selectedExample, false);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) { composerVisible = entries[0].isIntersecting; launcherVisibility(); }, { threshold: 0 }).observe(el('live'));
    new IntersectionObserver(function (entries) {
      // A scenario click can scroll to the tabs and back to the conversation in one
      // task. Read current geometry so an older queued entry cannot pause the new play.
      var rect = messages.getBoundingClientRect();
      visible = rect.bottom > 0 && rect.top < window.innerHeight;
      if (!visible && playing) pause();
      if (visible && !autoStarted && !document.hidden && !motion.matches && mode === 'watch') play();
    }, { threshold: 0 }).observe(messages);
  }
})();
