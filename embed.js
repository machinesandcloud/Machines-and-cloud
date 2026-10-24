/**
 * Front desk embed for a client's website.
 * <script src="https://www.machinesandcloud.com/embed.js" data-client="SLUG" async></script>
 * Loads the public config, renders the chat, streams replies from /api/chat with the client id.
 */
(function () {
  'use strict';
  var me = document.currentScript || (function () { var s = document.getElementsByTagName('script'); return s[s.length - 1]; })();
  var slug = me && me.getAttribute('data-client');
  if (!slug || document.getElementById('mcDesk')) return;
  // data-api on the script tag overrides the API origin (for when embed.js is served from a static host).
  var BASE = (me && me.getAttribute('data-api')) || (me.src || '').replace(/\/embed\.js.*$/, '') || 'https://www.machinesandcloud.com';
  var ENDPOINT = BASE + '/api/chat';
  var STORE = 'mc_desk_' + slug;
  var CHECK_STORE='mc_website_setup_'+slug, setupCheck=null, setupInvalid=false, setupStorageId=null, checkReady=false, configReady=false;
  try {
    var checkHash=location.hash.match(/^#mc-website-check=([a-f0-9]{32})\.([a-f0-9]{64})$/);
    if(checkHash){setupCheck={id:checkHash[1],challenge:checkHash[2],origin:location.origin,contact:'websitecheck_'+checkHash[1],expiresAt:null,pending:null};history.replaceState(history.state,'',location.pathname+location.search);sessionStorage.setItem(CHECK_STORE,JSON.stringify(setupCheck));}
    else if(location.hash.indexOf('#mc-website-check=')===0)setupInvalid=true;
    else{var prior=JSON.parse(sessionStorage.getItem(CHECK_STORE)||'null');if(prior&&prior.ended===true&&prior.origin===location.origin){setupInvalid=true;setupStorageId=/^[a-f0-9]{32}$/.test(prior.id||'')?prior.id:null;}else if(prior&&/^[a-f0-9]{32}$/.test(prior.id)&&/^[a-f0-9]{64}$/.test(prior.challenge)&&prior.origin===location.origin)setupCheck=prior;}
  } catch(error){if(location.hash.indexOf('#mc-website-check=')===0)setupInvalid=true;}
  if(setupCheck||setupInvalid)STORE+=':setup:'+(setupCheck?setupCheck.id:setupStorageId||'invalid');
  function persistCheck(){if(!setupCheck)return;try{sessionStorage.setItem(CHECK_STORE,JSON.stringify(setupCheck));}catch(error){/* In-memory recovery remains available. */}}

  var state = { contact: null, transcript: [] };
  try { var saved = JSON.parse(sessionStorage.getItem(STORE) || 'null'); if (saved && saved.contact) state = saved; } catch (e) { /* ignore */ }
  if(setupCheck)state.contact=setupCheck.contact;
  if (!state.contact) state.contact = 'w' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  function persist() { try { sessionStorage.setItem(STORE, JSON.stringify({ contact: state.contact, transcript: state.transcript.slice(-20), pendingTurn:state.pendingTurn||null })); } catch (e) { /* ignore */ } }

  var css = '#mcDesk{position:fixed;right:16px;bottom:16px;z-index:2147483000;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif;font-size:14px;line-height:1.45}' +
    '#mcDesk *{box-sizing:border-box}' +
    '#mcDesk .l{display:inline-flex;align-items:center;gap:8px;padding:12px 18px;border:0;border-radius:999px;background:#2563EB;color:#fff;font-weight:600;font-size:14px;cursor:pointer;box-shadow:0 10px 30px rgba(37,99,235,.35)}' +
    '#mcDesk .l i{width:8px;height:8px;border-radius:50%;background:#fff;display:inline-block}' +
    '#mcDesk .p{position:absolute;right:0;bottom:60px;width:min(370px,calc(100vw - 32px));height:min(540px,calc(100vh - 100px));display:none;flex-direction:column;background:#fff;color:#111827;border:1px solid #e5e7eb;border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.25);overflow:hidden}' +
    '#mcDesk.open .p{display:flex}' +
    '#mcDesk .h{display:flex;justify-content:space-between;align-items:flex-start;padding:14px 16px;background:#2563EB;color:#fff}' +
    '#mcDesk .h b{display:block;font-size:15px}#mcDesk .h small{opacity:.85;font-size:11px}' +
    '#mcDesk .x{background:none;border:0;color:#fff;font-size:22px;cursor:pointer;line-height:1}' +
    '#mcDesk .m{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:#f9fafb}' +
    '#mcDesk .b{max-width:86%;padding:10px 13px;border-radius:14px;white-space:pre-wrap;word-wrap:break-word}' +
    '#mcDesk .b.u{align-self:flex-end;background:#2563EB;color:#fff;border-bottom-right-radius:4px}' +
    '#mcDesk .b.a{align-self:flex-start;background:#fff;border:1px solid #e5e7eb;border-bottom-left-radius:4px}' +
    '#mcDesk .appt{align-self:stretch;padding:14px;border:1px solid #cbdcf7;border-radius:12px;background:#eef4ff;color:#19345c;white-space:normal}#mcDesk .appt b{display:block;font-size:14px}#mcDesk .appt p{margin:8px 0;font-size:12px;line-height:1.5}#mcDesk .appt a{color:#194ca6;text-decoration:underline}#mcDesk .appt a.sms{display:inline-block;padding:9px 12px;background:#2563eb;border-radius:8px;color:white;font-weight:600;text-decoration:none}' +
    '#mcDesk .t span{display:inline-block;width:6px;height:6px;margin-right:3px;border-radius:50%;background:#9ca3af;animation:mcdk 1.2s infinite}#mcDesk .t span:nth-child(2){animation-delay:.2s}#mcDesk .t span:nth-child(3){animation-delay:.4s}' +
    '@keyframes mcdk{0%,80%,100%{opacity:.3}40%{opacity:1}}' +
    '#mcDesk form{display:flex;gap:8px;padding:10px;border-top:1px solid #e5e7eb;background:#fff}' +
    '#mcDesk textarea{flex:1;resize:none;min-height:40px;max-height:110px;padding:10px;border:1px solid #d1d5db;border-radius:10px;font:inherit}' +
    '#mcDesk button.s{padding:0 16px;border:0;border-radius:10px;background:#2563EB;color:#fff;font-weight:600;cursor:pointer}' +
    '#mcDesk button.s:disabled{background:#dbe2ee;color:#69788e;cursor:not-allowed;box-shadow:none}' +
    '#mcDesk .recovery{padding:8px 12px;background:#edf4ff}#mcDesk .recover-reply{padding:8px 12px;border:1px solid #c9d7eb;border-radius:8px;background:white;color:#214ca8;cursor:pointer}'+
    '#mcDesk .f{margin:0;padding:0 12px 8px;font-size:10px;color:#6b7280;background:#fff}' +
    '#mcDesk .check{padding:12px 14px;background:#edf4ff;border-bottom:1px solid #d8e4f5;color:#233f65;font-size:12px}#mcDesk .check b{display:block;margin-bottom:5px}#mcDesk .check p{margin:5px 0;line-height:1.5}#mcDesk .check button,#mcDesk .check a{font:inherit;min-height:32px;padding:6px 9px;margin:5px 6px 0 0;border:1px solid #c9d7eb;border-radius:8px;background:#fff;color:#214ca8;cursor:pointer}#mcDesk .check button:disabled{opacity:.6;cursor:wait}' +
    '@media(max-width:480px){#mcDesk .p{position:fixed;left:8px;right:8px;bottom:70px;width:auto;height:min(76vh,600px)}}';
  var style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  var root = document.createElement('div'); root.id = 'mcDesk';
  root.innerHTML = '<button type="button" class="l" aria-expanded="false"><i></i><span>Chat with us</span></button>' +
    '<section class="p" role="dialog" aria-label="Chat"><header class="h"><div><b>Front desk</b><small>Automated front desk</small></div><button type="button" class="x" aria-label="Close">&times;</button></header>' +
    '<div class="m"></div><form><textarea rows="1" maxlength="1500" placeholder="Type your message" aria-label="Your message" required disabled></textarea><button type="submit" class="s" disabled>Send</button></form>' +
    '<div class="recovery" hidden><p class="f" role="status">The previous reply is unconfirmed. Check its saved answer before sending the request again.</p><button type="button" class="recover-reply">Check previous reply</button></div><p class="f">For urgent help, use the shop’s contact details on this website.</p></section>';
  document.body.appendChild(root);
  var launcher = root.querySelector('.l'), panel = root.querySelector('.p'), list = root.querySelector('.m'), form = root.querySelector('form'), input = root.querySelector('textarea'), sendBtn = root.querySelector('.s');
  var recovery=root.querySelector('.recovery'),recoverButton=root.querySelector('.recover-reply');
  var checkBanner=null,checkMessage=null,checkStatusButton=null,checkAckButton=null,sampleButton=null,sampleDetails={service:'',area:''};
  var cfg = { name: 'Front desk', greeting: 'Hi! What can we help with today?', available: false };
  var busy = false, rendered = false;

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function add(role, text) { var el = document.createElement('div'); el.className = 'b ' + (role === 'user' ? 'u' : 'a'); el.innerHTML = esc(text).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>'); list.appendChild(el); list.scrollTop = list.scrollHeight; return el; }
  function typing() { var el = document.createElement('div'); el.className = 'b a t'; el.innerHTML = '<span></span><span></span><span></span>'; list.appendChild(el); list.scrollTop = list.scrollHeight; return el; }
  function appointmentTexts(value) {
    if (!value || value.version !== 1 || !/^\+1[2-9]\d{9}$/.test(value.number || '') || !['APPOINTMENTS','CITAS'].includes(value.keyword) || typeof value.business !== 'string' || value.business.length > 100) return;
    var card=document.createElement('section');card.className='appt';card.setAttribute('aria-label',value.language==='es'?'Mensajes de citas opcionales':'Optional appointment texts');
    var spanish=value.language==='es',heading=document.createElement('b'),instructions=document.createElement('p'),disclosure=document.createElement('p'),link=document.createElement('a'),policies=document.createElement('p');
    heading.textContent=spanish?'¿Quiere mensajes sobre sus citas?':'Want appointment texts?';
    instructions.textContent=spanish?'Desde el móvil guardado para su visita, envíe '+value.keyword+' al '+value.number+'. Le responderemos con una pregunta; responda SÍ para aceptar.':'From the mobile saved for your visit, text '+value.keyword+' to '+value.number+'. We will reply with a question; reply YES to agree.';
    if(value.restartRequired)instructions.textContent+=(spanish?' Primero envíe START para quitar el bloqueo anterior.':' First send START to remove your previous texting block.');
    disclosure.textContent=spanish?value.business+': confirmaciones, recordatorios y cancelaciones de citas, incluidas visitas futuras. Frecuencia variable. Pueden aplicarse tarifas de mensajes y datos. HELP para ayuda; STOP/ALTO/PARAR para terminar. Puede reservar sin mensajes.':value.business+': appointment confirmations, reminders and cancellations, including future visits. Frequency varies. Message and data rates may apply. HELP for help; STOP/ALTO/PARAR to end. Booking is available without texts.';
    link.className='sms';link.href='sms:'+value.number+'?body='+encodeURIComponent(value.keyword);link.textContent=spanish?'Abrir mensaje de texto':'Open text message';
    policies.appendChild(document.createTextNode(spanish?'Abrir no envía nada. ':'Opening sends nothing. '));
    [['terms',spanish?'Términos':'Texting terms'],['privacy',spanish?'Privacidad':'Privacy']].forEach(function(item,index){if(index)policies.appendChild(document.createTextNode(' · '));var a=document.createElement('a');a.href=BASE+'/policy?c='+encodeURIComponent(slug)+'&page='+item[0];a.target='_blank';a.rel='noopener noreferrer';a.textContent=item[1];policies.appendChild(a);});
    card.append(heading,instructions,link,disclosure,policies);list.appendChild(card);list.scrollTop=list.scrollHeight;
  }
  function render() { list.innerHTML = ''; add('a', cfg.greeting); state.transcript.forEach(function (m) { add(m.role, m.content); if(m.role==='assistant')appointmentTexts(m.appointmentTexts); }); rendered = true; }

  function unavailable(message) { configReady=false;cfg.available = false; cfg.greeting = message || 'Website chat is unavailable right now. Please use the shop’s contact details on this website.'; input.disabled = true; sendBtn.disabled = true;recovery.hidden=!!setupCheck||!state.pendingTurn; if (rendered) render(); }
  function checkNote(text){if(checkMessage)checkMessage.textContent=text;}
  function checkControls(){var available=configReady&&(!setupCheck&&!setupInvalid||checkReady&&!setupCheck.pending);recovery.hidden=!!setupCheck||!state.pendingTurn;recoverButton.disabled=busy;if(!setupCheck&&state.pendingTurn)available=false;cfg.available=!!available;input.disabled=!available;sendBtn.disabled=busy||!available;if(sampleButton)sampleButton.disabled=!available;}
  function checkPayload(action,extra){return Object.assign({action:action,client:slug,checkId:setupCheck.id,challenge:setupCheck.challenge},extra||{});}
  async function checkRequest(action,extra){var controller=new AbortController(),timeout=setTimeout(function(){controller.abort();},15000);try{var response=await fetch(BASE+'/api/website-installation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(checkPayload(action,extra)),signal:controller.signal}),result=await response.json();if(!response.ok||result.error){var error=new Error(result.message||'The website check could not be confirmed. Return to your workspace.');error.status=response.status;throw error;}return result;}finally{clearTimeout(timeout);}}
  async function acknowledgeCheck(){var focused=document.activeElement===checkAckButton,pending=setupCheck&&setupCheck.pending;if(!pending||!pending.completionRef)return;checkAckButton.disabled=true;try{await checkRequest('acknowledge',{turnId:pending.id,completionRef:pending.completionRef});if(setupCheck.pending!==pending)return;setupCheck.pending=null;persistCheck();checkAckButton.hidden=true;checkNote(pending.record?'Your sample request is saved. Open your workspace to review it.':'Answer confirmed. Continue the sample conversation until a callback request is saved.');}catch(error){checkNote('The answer arrived, but its check receipt is not confirmed. Retry the receipt without sending the message again.');checkAckButton.hidden=false;}finally{checkAckButton.disabled=false;checkControls();if(focused&&document.activeElement===document.body&&root.classList.contains('open')){if(!checkAckButton.hidden)checkAckButton.focus();else if(!input.disabled)input.focus();else checkStatusButton.focus();}}}
  async function checkStatus(observe){if(!setupCheck)return;var focused=document.activeElement===checkStatusButton;checkStatusButton.disabled=true;try{var pending=setupCheck.pending,result=await checkRequest(observe&&!pending?'observe':'status',pending?{turnId:pending.id}:{}),check=result.check;if(!check||check.id!==setupCheck.id||check.origin!==location.origin||check.contact!==setupCheck.contact)throw new Error('This check belongs to a different website. Return to your workspace.');sampleDetails={service:typeof check.sample?.service==='string'?check.sample.service.slice(0,160):'',area:typeof check.sample?.area==='string'?check.sample.area.slice(0,160):''};setupCheck.expiresAt=check.expiresAt;checkReady=!!check.observed&&check.chatAvailable===true;persistCheck();
      if(pending){if(check.turn?.answerObserved){setupCheck.pending=null;persistCheck();checkAckButton.hidden=true;checkNote(check.turn.record?'Your sample request is saved. Open your workspace to review it.':'The previous answer is confirmed. You can continue the sample conversation.');}else{checkNote(check.turn?.record?'Your sample request is saved; its answer is not confirmed. Open your workspace before sending it again.':'The previous message may already have been processed. Check its outcome in your workspace before sending it again.');if(pending.completionRef)checkAckButton.hidden=false;}}
      else checkNote(check.chatAvailable?'Widget found. Try the sample request below, then send it when you are ready.':('Widget found. '+(check.reason||'Finish your setup in the workspace before trying a request.')));
    }catch(error){checkReady=false;if([401,403,410].includes(error.status)){setupInvalid=true;setupCheck.challenge='';setupCheck.pending=null;try{sessionStorage.setItem(CHECK_STORE,JSON.stringify({ended:true,id:setupCheck.id,origin:location.origin}));}catch(storageError){/* The in-memory challenge is cleared. */}}checkNote(error.message||'The check is unavailable. Return to your workspace to start again.');}finally{checkStatusButton.disabled=setupInvalid;checkControls();if(focused&&document.activeElement===document.body&&root.classList.contains('open')){if(!checkStatusButton.disabled)checkStatusButton.focus();else checkBanner.querySelector('a').focus();}}}
  if(setupCheck||setupInvalid){
    checkBanner=document.createElement('div');checkBanner.className='check';checkBanner.innerHTML='<b>Website setup check</b><p role="status" aria-live="polite"></p><p>Creates a labeled sample request using your customer-chat allowance. Your usual request notifications may run.</p><button type="button" data-check-sample>Use sample details</button><button type="button" data-check-status>Check saved status</button><button type="button" data-check-ack hidden>Retry check receipt</button><a target="_blank" rel="noopener noreferrer">Open my workspace</a>';
    list.before(checkBanner);checkMessage=checkBanner.querySelector('[role="status"]');sampleButton=checkBanner.querySelector('[data-check-sample]');checkStatusButton=checkBanner.querySelector('[data-check-status]');checkAckButton=checkBanner.querySelector('[data-check-ack]');checkBanner.querySelector('a').href=BASE+'/desk.html?c='+encodeURIComponent(slug)+'#leads';root.querySelector('.h small').textContent='Website setup check';
    sampleButton.addEventListener('click',function(){input.value="Hi, I'm Alex Test. I'd like a callback about "+(sampleDetails.service||"one of your services")+(sampleDetails.area?" in "+sampleDetails.area:"")+". My number is (713) 555-0142. This is a setup check.";input.focus();});checkStatusButton.addEventListener('click',function(){checkStatus(false);});checkAckButton.addEventListener('click',acknowledgeCheck);
    if(setupInvalid){checkNote('This setup check is invalid or has ended. Return to your workspace to start again.');sampleButton.disabled=true;checkStatusButton.disabled=true;}else{checkNote('Checking this website…');checkStatus(true);}
  }
  fetch(BASE + '/api/client?c=' + encodeURIComponent(slug)).then(function (r) { if (!r.ok) throw new Error('unavailable'); return r.json(); }).then(function (d) {
    if (!d || !d.name) throw new Error('unavailable');
    if (d && d.name) { cfg.name = d.name; cfg.greeting = d.greeting || cfg.greeting; root.querySelector('.h b').textContent = cfg.name; }
    if (d.webAvailable === false || d.status === 'paused' || d.status === 'cancelled') { unavailable(); return; }
    configReady=true;checkControls();
    if (rendered) render();
  }).catch(function () { unavailable(); });

  function open() { root.classList.add('open'); launcher.setAttribute('aria-expanded', 'true'); if (!rendered) render(); setTimeout(function () { input.focus(); }, 50); }
  function close() { root.classList.remove('open'); launcher.setAttribute('aria-expanded', 'false'); launcher.focus(); }
  root.addEventListener('keydown',function(event){if(event.key==='Escape'&&root.classList.contains('open')){event.preventDefault();close();}});
  launcher.addEventListener('click', function () { root.classList.contains('open') ? close() : open(); });
  root.querySelector('.x').addEventListener('click', close);
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  function sendMessage(recover) {
    var text = input.value.trim(); if (busy || (!recover && (!text || !cfg.available || input.disabled)) || (recover && (!state.pendingTurn?.request || setupCheck))) return;
    if(setupCheck){var bytes=new Uint8Array(16);crypto.getRandomValues(bytes);setupCheck.pending={id:Array.from(bytes).map(function(value){return value.toString(16).padStart(2,'0');}).join(''),completionRef:null,record:null};persistCheck();}
    busy = true; sendBtn.disabled = true; input.value = '';
    if(!recover){state.transcript.push({ role: 'user', content: text });persist();add('user',text);}
    var tp = typing(), bubble = null, full = '', done = false, reader = null;
    var interrupted = 'The reply was interrupted, so we couldn’t confirm the outcome. Please use the shop’s contact details on this website before sending the same request again.';
    var abort = typeof AbortController === 'function' ? new AbortController() : null, timer;
    // One bounded attempt. An interrupted reply can follow a saved request, so never resend it here.
    var deadline = new Promise(function (resolve, reject) {
      timer = setTimeout(function () {
        if (abort) abort.abort();
        reject(new Error('Chat response timed out'));
      }, 90000);
    });
    function bounded(promise) { return Promise.race([promise, deadline]); }
    function delta(t) { if (!bubble) { tp.remove(); bubble = add('a', ''); } full += t; bubble.textContent = full; list.scrollTop = list.scrollHeight; }
    function finish(reply,events) { if (done) return; if (typeof reply !== 'string' || !reply.trim()) { fail(interrupted); return; } done = true;state.pendingTurn=null; if (tp.parentNode) tp.remove(); if (!bubble) bubble = add('a', reply); else bubble.textContent = reply; var invitation=Array.isArray(events)&&events.find(function(event){return event.type==='booking'&&event.appointmentTexts;});state.transcript.push({ role: 'assistant', content: reply, ...(invitation?{appointmentTexts:invitation.appointmentTexts}:{}) });if(invitation)appointmentTexts(invitation.appointmentTexts);persist();if(setupCheck){var receipt=Array.isArray(events)&&events.find(function(event){return event.type==='website_check'&&event.checkId===setupCheck.id&&event.turnId===setupCheck.pending?.id&&/^[a-f0-9]{64}$/.test(event.completionRef||'');});if(receipt){setupCheck.pending.completionRef=receipt.completionRef;setupCheck.pending.record=receipt.record||null;persistCheck();acknowledgeCheck();}else checkNote('The answer arrived, but this check has no matching receipt. Check the saved outcome in your workspace.');} }
    function fail(message) { if (done) return; done = true; if (tp.parentNode) tp.remove(); var text = typeof message === 'string' ? message : interrupted; if (!bubble) bubble = add('a', text); else bubble.textContent = text; bubble.setAttribute('role', 'status');if(setupCheck)checkNote('The reply was interrupted. Your request may already be saved; check its status before sending it again.'); }
    function release() {
      clearTimeout(timer);
      // A terminal packet completes the turn; do not wait indefinitely for the connection to close.
      if (reader) { try { var cancelled = reader.cancel(); if (cancelled && cancelled.catch) cancelled.catch(function () {}); } catch (e) { /* already closed */ } }
      busy = false;checkControls();if(root.classList.contains('open')){if(!input.disabled)input.focus();else if(setupCheck&&checkStatusButton&&!checkStatusButton.disabled)checkStatusButton.focus();else if(bubble){bubble.tabIndex=-1;bubble.focus();}}
    }
    var body;
    if(recover)body=Object.assign({},state.pendingTurn.request,{recoverTurn:true});
    else{var turnBytes=new Uint8Array(16);crypto.getRandomValues(turnBytes);var turnId=Array.from(turnBytes).map(function(value){return value.toString(16).padStart(2,'0');}).join('');var requestMessages=state.transcript.slice(-19);if(requestMessages[0]?.role==='assistant')requestMessages.shift();body={client:slug,contact:state.contact,turnId:turnId,messages:requestMessages,page:location.pathname,stream:true};if(setupCheck)body.websiteCheck={checkId:setupCheck.id,challenge:setupCheck.challenge,turnId:setupCheck.pending.id};else{state.pendingTurn={id:turnId,at:new Date().toISOString(),request:body};persist();}}
    var request = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    if (abort) request.signal = abort.signal;
    bounded(fetch(ENDPOINT, request))
      .then(function (res) {
        var type = res.headers.get('content-type') || '';
        if (!res.ok) { if (res.status === 429) { configReady=false;cfg.available = false; input.disabled = true; } return bounded(res.json()).then(function(error){if(!setupCheck&&error.turnNotProcessed===true){state.pendingTurn=null;persist();}fail(error.message || (res.status === 429 ? 'Chat has reached its daily limit. Please contact the shop directly using the details on this website.' : interrupted));},function(){fail(interrupted);}); }
        if (type.indexOf('ndjson') !== -1 && res.body && res.body.getReader) {
          reader = res.body.getReader(); var dec = new TextDecoder(), buf = '';
          function packet(line) {
            if (done || !line.trim()) return;
            var value; try { value = JSON.parse(line); } catch (e) { fail(interrupted); return; }
            if (!value || typeof value !== 'object') { fail(interrupted); return; }
            if (value.t === 'delta' && typeof value.text === 'string') delta(value.text);
            else if (value.t === 'done') finish(value.reply,value.events);
            else fail(interrupted);
          }
          return (function pump() { return bounded(reader.read()).then(function (r) {
            if (r.done) { buf += dec.decode(); if (buf.trim()) packet(buf); if (!done) fail(interrupted); return; }
            buf += dec.decode(r.value, { stream: true }); var lines = buf.split('\n'); buf = lines.pop();
            lines.forEach(packet);
            if (done) return;
            return pump();
          }); })();
        }
        return bounded(res.json()).then(function (d) { if (d && d.t === 'done') finish(d.reply,d.events); else fail(interrupted); });
      })
      .catch(function () { fail(interrupted); })
      .then(release, release);
  }
  form.addEventListener('submit',function(event){event.preventDefault();sendMessage(false);});recoverButton.addEventListener('click',function(){sendMessage(true);});
})();
