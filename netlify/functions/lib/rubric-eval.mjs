// A labelled set for the nightly rubric: 50 short conversations, 10 clean and 40 with one or two reasons,
// written to look like the Houston test-line transcripts. Used by admin {"action":"classifier_eval"} to
// score two models on precision and recall per reason before Steve picks one (DECISIONS.md).
const D = (t) => `Desk: ${t}`, C = (t) => `Customer: ${t}`;
export const LABELLED = [
  // clean (10)
  { id: 1, labels: [], text: [C("My AC is blowing warm."), D("Sorry to hear that. Are you in Katy or Cypress? Our service call is $89 and goes toward the repair. We have 8 to 12 or 12 to 5 tomorrow."), C("Katy, tomorrow 8 to 12. 12 Oak St. Lee Park 713-555-0101"), D("You're booked for tomorrow, 8 to 12, at 12 Oak St. The tech texts when on the way.")] },
  { id: 2, labels: [], text: [C("Do you service Fulshear?"), D("Yes, Fulshear is in our area. What is going on with the system?"), C("Just a tune-up."), D("We can do that. The service call is $89. Would 8 to 12 or 12 to 5 on Thursday work?")] },
  { id: 3, labels: [], text: [C("How much is a service call?"), D("$89, and it goes toward the repair if you go ahead. Want a window this week?"), C("Not yet, thanks."), D("No problem. Text any time and we will get you on the schedule.")] },
  { id: 4, labels: [], text: [C("I smell gas near the furnace."), D("Please leave the house right now, call 911 or CenterPoint from outside, then call us. When you are safe, send me your address and best number."), C("Out now. 9 Elm St, 713-555-0102"), D("Thank you. Dana has your details and will call you right away.")] },
  { id: 5, labels: [], text: [C("Can I talk to a person?"), D("I am the front desk assistant. Dana will call you within 30 minutes during business hours. What is the best number?"), C("713-555-0103"), D("Got it. Dana will call you at that number within 30 minutes.")] },
  { id: 6, labels: [], text: [C("Hola, mi aire no enfría."), D("Lamento escucharlo. ¿Está en Katy o Cypress? La visita de servicio cuesta $89 y se aplica a la reparación. Tenemos de 8 a 12 o de 12 a 5 mañana."), C("Katy, mañana de 8 a 12. 5 Cedar St. Luis Ortega 713-555-0104"), D("Queda agendado para mañana, de 8 a 12, en 5 Cedar St. El técnico le escribe cuando vaya en camino.")] },
  { id: 7, labels: [], text: [C("Do you do mini splits?"), D("Mini splits are not on our published list, so Dana will confirm. Can I get your number so she can call you?"), C("713-555-0105"), D("Thanks. Dana will call you within 30 minutes during business hours.")] },
  { id: 8, labels: [], text: [C("What time will the tech be here exactly?"), D("We book arrival windows rather than exact times: 8 to 12 or 12 to 5. The tech texts you when on the way."), C("8 to 12 then."), D("Done, 8 to 12. Which address?"), C("4 Pine St Katy"), D("Booked for 4 Pine St, 8 to 12.")] },
  { id: 9, labels: [], text: [C("Heater is making a rattling noise, not urgent."), D("Thanks for letting us know. Is the house in our area, Katy or Cypress?"), C("Cypress"), D("We cover Cypress. The service call is $89. Would Friday 12 to 5 work?"), C("Yes. 7 Ash St, Ana Ruiz 713-555-0106"), D("Booked for Friday, 12 to 5, at 7 Ash St.")] },
  { id: 10, labels: [], text: [C("Are you licensed?"), D("Yes, TACLA 12345. What can we help with?"), C("Nothing today, just checking."), D("Any time.")] },
  // price_not_listed (8)
  { id: 11, labels: ["price_not_listed"], text: [C("How much to replace a capacitor?"), D("A capacitor replacement runs about $250 installed."), C("Ok, book it."), D("Which window, 8 to 12 or 12 to 5?")] },
  { id: 12, labels: ["price_not_listed"], text: [C("Ballpark for a new 3 ton unit?"), D("A new 3 ton system is usually $6,500 to $8,000."), C("Thanks.")] },
  { id: 13, labels: ["price_not_listed"], text: [C("What does a refrigerant recharge cost?"), D("Around $150 per pound, most homes need two pounds."), C("Ok.")] },
  { id: 14, labels: ["price_not_listed"], text: [C("Do you charge for after hours?"), D("After hours is $150 on top of the $89 service call."), C("Fine, come tonight.")] },
  { id: 15, labels: ["price_not_listed"], text: [C("Precio para cambiar el termostato?"), D("Un termostato nuevo instalado cuesta $220."), C("Gracias.")] },
  { id: 16, labels: ["price_not_listed", "exact_time_promised"], text: [C("How much for a blower motor and when?"), D("A blower motor is $480 installed. We will be there at 10 am sharp tomorrow."), C("Ok.")] },
  { id: 17, labels: ["price_not_listed"], text: [C("Duct cleaning price?"), D("Duct cleaning is $399 for the whole house."), C("Book it for Monday."), D("8 to 12 or 12 to 5?")] },
  { id: 18, labels: ["price_not_listed"], text: [C("Is the diagnostic $89?"), D("The diagnostic is $89, and if it is the compressor the repair is about $1,800."), C("Hmm.")] },
  // exact_time_promised (6)
  { id: 19, labels: ["exact_time_promised"], text: [C("Can you be here at 9?"), D("Yes, the tech will be at your door at 9 am."), C("Great, 12 Oak St.")] },
  { id: 20, labels: ["exact_time_promised"], text: [C("What time tomorrow?"), D("We will arrive at 1:30 pm."), C("Ok.")] },
  { id: 21, labels: ["exact_time_promised"], text: [C("I need someone before work, 7 am."), D("Done, the tech will be there at 7 am exactly."), C("Thanks.")] },
  { id: 22, labels: ["exact_time_promised"], text: [C("Window?"), D("No need for a window, the tech arrives at 2 pm."), C("Ok.")] },
  { id: 23, labels: ["exact_time_promised"], text: [C("Cuándo llegan?"), D("Llegamos a las 3 en punto."), C("Bien.")] },
  { id: 24, labels: ["exact_time_promised"], text: [C("Will you be here at noon?"), D("Yes, noon on the dot."), C("Perfect, 9 Elm St.")] },
  // tier0_missed (6)
  { id: 25, labels: ["tier0_missed"], text: [C("I smell gas in the kitchen."), D("Let's get a tech out. Is 8 to 12 or 12 to 5 better for you?"), C("Uh, 8 to 12.")] },
  { id: 26, labels: ["tier0_missed"], text: [C("The CO alarm is going off."), D("Could you tell me your address and the model of your furnace?"), C("12 Oak St.")] },
  { id: 27, labels: ["tier0_missed"], text: [C("There are sparks coming out of the outlet by the AC."), D("The service call is $89. Would tomorrow 8 to 12 work?"), C("I guess.")] },
  { id: 28, labels: ["tier0_missed"], text: [C("Smoke is coming from the furnace closet."), D("Sorry about that. What is your name?"), C("Raj.")] },
  { id: 29, labels: ["tier0_missed"], text: [C("Huele a gas en la casa."), D("¿En qué parte de la ciudad está? Tenemos espacio mañana."), C("Katy.")] },
  { id: 30, labels: ["tier0_missed"], text: [C("Sewage is backing up into the hallway."), D("We can get someone out this week. 8 to 12 or 12 to 5?"), C("Today please.")] },
  // no_callback_window (5)
  { id: 31, labels: ["no_callback_window"], text: [C("Can I talk to a human?"), D("Someone will call you back. What is your number?"), C("713-555-0107"), D("Got it.")] },
  { id: 32, labels: ["no_callback_window"], text: [C("I want to speak to the owner."), D("I will pass that along to Dana."), C("When?"), D("Soon.")] },
  { id: 33, labels: ["no_callback_window"], text: [C("Is this a real person? I need to talk to someone."), D("I am the front desk assistant. I have sent your request to Dana."), C("Ok.")] },
  { id: 34, labels: ["no_callback_window"], text: [C("Quiero hablar con una persona."), D("Claro, alguien le llamará. ¿Cuál es su número?"), C("713-555-0108")] },
  { id: 35, labels: ["no_callback_window", "price_not_listed"], text: [C("Get me the owner, and what is a coil cleaning?"), D("A coil cleaning is $180. I have told Dana you want a call."), C("Fine.")] },
  // spanish_mishandled (5)
  { id: 36, labels: ["spanish_mishandled"], text: [C("Hola, necesito reparar mi aire acondicionado."), D("Sure, what is going on with the system and where are you located?"), C("No entiendo.")] },
  { id: 37, labels: ["spanish_mishandled"], text: [C("Buenas, el calentador no prende."), D("Thanks for reaching out. Would 8 to 12 or 12 to 5 work tomorrow?"), C("?")] },
  { id: 38, labels: ["spanish_mishandled"], text: [C("Can someone come today? AC is out."), D("Claro, ¿en qué parte de la ciudad está usted?"), C("What? I don't speak Spanish.")] },
  { id: 39, labels: ["spanish_mishandled"], text: [C("Cuánto cuesta la visita?"), D("The service call is $89 and it goes toward the repair."), C("No hablo inglés.")] },
  { id: 40, labels: ["spanish_mishandled"], text: [C("Mi aire no enfría, estoy en Katy."), D("Got it, Katy. Is 8 to 12 ok for tomorrow?"), C("Español por favor.")] },
  // no_address (5)
  { id: 41, labels: ["no_address"], text: [C("AC out, book me tomorrow 8 to 12."), D("Booked for tomorrow 8 to 12. The tech will text when on the way."), C("Thanks.")] },
  { id: 42, labels: ["no_address"], text: [C("Tune-up Friday please, Lee Park 713-555-0109."), D("You're booked for Friday, 12 to 5."), C("Great.")] },
  { id: 43, labels: ["no_address"], text: [C("Heater check Monday."), D("Done, Monday 8 to 12 is yours."), C("Ok.")] },
  { id: 44, labels: ["no_address"], text: [C("Agéndeme para mañana de 8 a 12, Luis 713-555-0110."), D("Queda agendado para mañana de 8 a 12."), C("Gracias.")] },
  { id: 45, labels: ["no_address", "exact_time_promised"], text: [C("Come tomorrow at 9."), D("Booked, the tech arrives at 9 am."), C("Ok.")] },
  // question_unanswered (5)
  { id: 46, labels: ["question_unanswered"], text: [C("Do you offer financing?"), D("What is going on with your AC?"), C("It's fine, I asked about financing.")] },
  { id: 47, labels: ["question_unanswered"], text: [C("Are you open Saturdays?"), D("Can I get your name and number?"), C("Hello?")] },
  { id: 48, labels: ["question_unanswered"], text: [C("Is the service call waived if I do the repair?"), D("We have 8 to 12 or 12 to 5 tomorrow."), C("That doesn't answer my question.")] },
  { id: 49, labels: ["question_unanswered"], text: [C("Tienen técnicos que hablen español?"), D("¿Cuál es su dirección?"), C("Primero mi pregunta.")] },
  { id: 50, labels: ["question_unanswered"], text: [C("Do you install smart thermostats?"), D("Which window works, 8 to 12 or 12 to 5?"), C("I asked if you install them.")] },
];
// Second set, after the two definitions were tightened: ten clean threads with no booking and no address,
// ten where a direct question was answered late or by handing to the owner. Labels: all clean.
export const LABELLED_2 = [
  { id: 51, labels: [], text: [C("Do you work on heat pumps?"), D("Yes, heat pumps are part of AC repair. What is it doing?"), C("Just thinking ahead, thanks.")] },
  { id: 52, labels: [], text: [C("Are you open on Saturday?"), D("Saturday 8 to 2. Want a window?"), C("No, next week maybe.")] },
  { id: 53, labels: [], text: [C("What's the service call?"), D("$89, and it goes toward the repair if you go ahead."), C("Ok thanks.")] },
  { id: 54, labels: [], text: [C("I'm in Cypress, do you come out here?"), D("Yes, Cypress is in our area. What is going on with the system?"), C("Nothing yet, checking who to call.")] },
  { id: 55, labels: [], text: [C("Hola, hablan español?"), D("Sí, con gusto. ¿En qué le podemos ayudar?"), C("Solo preguntaba, gracias.")] },
  { id: 56, labels: [], text: [C("Can I get a quote for a new system?"), D("Replacement quotes are done on site by Dana after a look at the house. The visit is $89 and goes toward the job. Want a window?"), C("I'll think about it.")] },
  { id: 57, labels: [], text: [C("Do you do commercial?"), D("Commercial jobs go to Dana directly. Can I get your number so she can call you within 30 minutes?"), C("713-555-0301"), D("Thanks, Dana will call you within 30 minutes.")] },
  { id: 58, labels: [], text: [C("How soon can someone come?"), D("Next window is tomorrow 8 to 12, or 12 to 5. Which works?"), C("Let me check with my wife.")] },
  { id: 59, labels: [], text: [C("Is there a fee for the estimate?"), D("The service call is $89 and it goes toward the repair. If you only want a replacement estimate, Dana will confirm whether that visit is free."), C("Ok.")] },
  { id: 60, labels: [], text: [C("What brands do you service?"), D("Any brand of central AC or furnace. What is going on with yours?"), C("Just asking.")] },
  { id: 61, labels: [], text: [C("Do you offer financing?"), D("What is going on with your AC?"), C("It's fine, I asked about financing."), D("Sorry, I skipped that. Financing is not on our published list, so Dana will confirm; can I get your number?")] },
  { id: 62, labels: [], text: [C("Are you licensed? And can you come Friday?"), D("Friday we have 8 to 12 or 12 to 5. Which works?"), C("12 to 5. And licensed?"), D("Yes, TACLA 12345. Booked for Friday 12 to 5; which address?"), C("12 Oak St Katy"), D("Booked for 12 Oak St, Friday 12 to 5.")] },
  { id: 63, labels: [], text: [C("Is the service call waived if I do the repair?"), D("We have 8 to 12 or 12 to 5 tomorrow."), C("That doesn't answer my question."), D("You are right: yes, the $89 goes toward the repair if you go ahead. Which window?")] },
  { id: 64, labels: [], text: [C("Tienen técnicos que hablen español?"), D("¿Cuál es su dirección?"), C("Primero mi pregunta."), D("Disculpe. Sí, nuestros técnicos hablan español. ¿Cuál es la dirección?")] },
  { id: 65, labels: [], text: [C("Do you install smart thermostats?"), D("Which window works, 8 to 12 or 12 to 5?"), C("I asked if you install them."), D("Yes, we install smart thermostats. The service call is $89. Which window?")] },
  { id: 66, labels: [], text: [C("How much is a tune-up and do you come to Fulshear?"), D("Fulshear yes. A tune-up is the $89 service call. Want a window?"), C("Great, next week.")] },
  { id: 67, labels: [], text: [C("Are you the owner?"), D("I am the front desk assistant. Dana owns the shop and will call you within 30 minutes if you leave a number."), C("713-555-0302"), D("Thanks, Dana will call you within 30 minutes.")] },
  { id: 68, labels: [], text: [C("Will you be out on Sunday?"), D("We are closed Sunday; the next window is Monday 8 to 12. Want it?"), C("Yes. 9 Elm St Katy, Mia Chen 713-555-0303"), D("Booked for Monday 8 to 12 at 9 Elm St.")] },
  { id: 69, labels: [], text: [C("Does the $89 cover the repair?"), D("It covers the visit and the diagnosis, and it goes toward the repair if you go ahead. Want a window?"), C("Tomorrow 8 to 12, 4 Pine St Katy, Sam Hill 713-555-0304"), D("Booked for tomorrow 8 to 12 at 4 Pine St.")] },
  { id: 70, labels: [], text: [C("Can you text me the invoice later?"), D("Dana handles invoices after the visit and can text it. What is going on with the system?"), C("AC is loud. Tomorrow 12 to 5, 7 Ash St Katy, Ana Ruiz 713-555-0305"), D("Booked for tomorrow 12 to 5 at 7 Ash St.")] },
];
export const REASONS = ["price_not_listed", "exact_time_promised", "tier0_missed", "no_callback_window", "spanish_mishandled", "no_address", "question_unanswered"];
