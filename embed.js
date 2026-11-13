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
  // The contact id keys this visitor's saved conversation on the server, so a new one is 'w' + 32 hex (128 random bits,
  // within chat.mjs's [a-zA-Z0-9_-]{<=60}). A stored id is kept as is so a returning visitor's chat continues; rotating it
  // would not protect the server copy of an older, weaker id. Without crypto.getRandomValues (very old browsers only),
  // the same format is filled from Math.random: still random and unique in practice, but not cryptographically strong.
  function newContact() {
    var hex = '', i, bytes, c = window.crypto || window.msCrypto;
    try { if (c && c.getRandomValues && typeof Uint8Array === 'function') { bytes = new Uint8Array(16); c.getRandomValues(bytes); for (i = 0; i < 16; i++) hex += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16); } } catch (e) { hex = ''; }
    if (hex.length !== 32) for (hex = '', i = 0; i < 32; i++) hex += Math.floor(Math.random() * 16).toString(16);
    return 'w' + hex;
  }
  if (!state.contact) state.contact = newContact();
  // The server binds a conversation's saved history to the browser that started it: the first reply carries a conversation
  // token (header X-MC-Conversation-Token) that is kept beside the contact id and sent on every later turn. When the server
  // cannot verify this browser (no or wrong token) it starts a new conversation and names its id in X-MC-Contact; the
  // widget adopts both, including in a pending turn, so "Check previous reply" asks about the conversation that ran it.
  // If the server cannot continue this conversation at all (conversation_reload_required) or says a lost turn ran in a
  // conversation this tab cannot reach (conversation_turn_moved), the widget starts a new conversation id itself and drops
  // that unanswered message from the transcript it sends (it stays on screen), so the next turn is a valid exchange; after
  // reload_required the dropped text goes back into the input box so the visitor only presses Send. A transcript restored
  // from an older widget may hold unanswered user messages in a row: every request sends only the last of each run.
  if (setupCheck || !/^[a-f0-9]{64}$/.test(state.token || '')) state.token = null;
  function persist() { try { sessionStorage.setItem(STORE, JSON.stringify({ contact: state.contact, token: state.token || null, transcript: state.transcript.slice(-20), pendingTurn:state.pendingTurn||null })); } catch (e) { /* ignore */ } }
  function alternating(messages) { return messages.filter(function (m, i, a) { return !(m && m.role === 'user' && a[i + 1] && a[i + 1].role === 'user'); }); }
  function adoptConversation(res) {
    if (setupCheck || !res || !res.headers) return;
    var contact = res.headers.get('X-MC-Contact'), token = res.headers.get('X-MC-Conversation-Token');
    if (!/^[a-f0-9]{64}$/.test(token || '') || !/^[a-zA-Z0-9_-]{1,60}$/.test(contact || '')) return;
    if (contact === state.contact && token === state.token) return;
    state.contact = contact; state.token = token;
    if (state.pendingTurn && state.pendingTurn.request) { state.pendingTurn.request.contact = contact; state.pendingTurn.request.conversationToken = token; }
    persist();
  }

  var css = '#mcDesk{position:fixed;right:16px;bottom:calc(16px + var(--mcd-kb,0px));z-index:2147483000;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif;font-size:14px;line-height:1.45}' +
    '#mcDesk *{box-sizing:border-box}' +
    '#mcDesk .l{display:inline-flex;align-items:center;gap:8px;padding:12px 18px;border:0;border-radius:999px;background:#2563EB;color:#fff;font-weight:600;font-size:14px;cursor:pointer;box-shadow:0 10px 30px rgba(37,99,235,.35)}' +
    '#mcDesk .l i{width:8px;height:8px;border-radius:50%;background:#fff;display:inline-block}' +
    '#mcDesk .p{position:absolute;right:0;bottom:60px;width:min(370px,calc(100vw - 32px));height:min(540px,calc(var(--mcd-vh,100vh) - 100px));display:none;flex-direction:column;background:#fff;color:#111827;border:1px solid #e5e7eb;border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.25);overflow:hidden}' +
    '#mcDesk.open .p{display:flex}' +
    '#mcDesk .h{display:flex;justify-content:space-between;align-items:flex-start;padding:14px 16px;background:#2563EB;color:#fff}' +
    '#mcDesk .h b{display:block;font-size:15px}#mcDesk .h small{opacity:.85;font-size:11px}' +
    '#mcDesk .x{display:inline-flex;align-items:center;justify-content:center;flex:none;width:44px;height:44px;margin:-10px -12px -10px 8px;padding:0;background:none;border:0;border-radius:10px;color:#fff;font-size:26px;cursor:pointer;line-height:1}' +
    '#mcDesk .m{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;background:#f9fafb}' +
    '#mcDesk .b{max-width:86%;padding:10px 13px;border-radius:14px;white-space:pre-wrap;word-wrap:break-word}' +
    '#mcDesk .b.u{align-self:flex-end;background:#2563EB;color:#fff;border-bottom-right-radius:4px}' +
    '#mcDesk .b.a{align-self:flex-start;background:#fff;border:1px solid #e5e7eb;border-bottom-left-radius:4px}' +
    '#mcDesk .appt{align-self:stretch;padding:14px;border:1px solid #cbdcf7;border-radius:12px;background:#eef4ff;color:#19345c;white-space:normal}#mcDesk .appt b{display:block;font-size:14px}#mcDesk .appt p{margin:8px 0;font-size:12px;line-height:1.5}#mcDesk .appt a{color:#194ca6;text-decoration:underline}#mcDesk .appt a.sms{display:inline-block;padding:9px 12px;background:#2563eb;border-radius:8px;color:white;font-weight:600;text-decoration:none}' +
    '#mcDesk .t span{display:inline-block;width:6px;height:6px;margin-right:3px;border-radius:50%;background:#9ca3af;animation:mcdk 1.2s infinite}#mcDesk .t span:nth-child(2){animation-delay:.2s}#mcDesk .t span:nth-child(3){animation-delay:.4s}' +
    '@keyframes mcdk{0%,80%,100%{opacity:.3}40%{opacity:1}}' +
    '#mcDesk form{display:flex;gap:8px;padding:10px;border-top:1px solid #e5e7eb;background:#fff}' +
    '#mcDesk textarea{flex:1;resize:none;min-height:40px;max-height:110px;padding:10px;border:1px solid #d1d5db;border-radius:10px;font:inherit;font-size:16px}' +
    '#mcDesk button.s{padding:0 16px;border:0;border-radius:10px;background:#2563EB;color:#fff;font-weight:600;cursor:pointer}' +
    '#mcDesk button.s:disabled{background:#dbe2ee;color:#69788e;cursor:not-allowed;box-shadow:none}' +
    '#mcDesk .recovery{padding:8px 12px;background:#edf4ff}#mcDesk .recover-reply{padding:8px 12px;border:1px solid #c9d7eb;border-radius:8px;background:white;color:#214ca8;cursor:pointer}'+
    '#mcDesk .cfg{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 12px;background:#edf4ff;border-top:1px solid #d8e4f5}#mcDesk .cfg[hidden]{display:none}#mcDesk .cfg p{flex:1 1 160px;margin:0;font-size:12px;color:#233f65}#mcDesk .cfg button{min-height:44px;padding:8px 14px;border:1px solid #c9d7eb;border-radius:8px;background:#fff;color:#214ca8;font:inherit;font-weight:600;cursor:pointer}#mcDesk .cfg button[aria-disabled=true]{opacity:.6;cursor:wait}' +
    '#mcDesk .sr{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}#mcDesk :focus-visible{outline:2px solid #1d4ed8;outline-offset:2px}#mcDesk .h :focus-visible{outline-color:#fff}' +
    '#mcDesk .len{margin:0;padding:6px 12px;border-top:1px solid #fecaca;background:#fef2f2;color:#991b1b;font-size:12px}#mcDesk .len[hidden]{display:none}' +
    '#mcDesk .f{margin:0;padding:0 12px 8px;font-size:10px;color:#6b7280;background:#fff}' +
    '#mcDesk .check{padding:12px 14px;background:#edf4ff;border-bottom:1px solid #d8e4f5;color:#233f65;font-size:12px}#mcDesk .check b{display:block;margin-bottom:5px}#mcDesk .check p{margin:5px 0;line-height:1.5}#mcDesk .check button,#mcDesk .check a{font:inherit;display:inline-block;box-sizing:border-box;white-space:nowrap;text-decoration:none;min-height:32px;padding:6px 9px;margin:5px 6px 0 0;border:1px solid #c9d7eb;border-radius:8px;background:#fff;color:#214ca8;cursor:pointer}#mcDesk .check button:disabled{opacity:.6;cursor:wait}#mcDesk .check [hidden]{display:none}' +
    '#mcDesk .followup{margin:10px 0;padding:14px;background:#f3f7ff;border:1px solid #d8e4f5;border-radius:12px;font-size:12px;line-height:1.6;overflow-wrap:anywhere}#mcDesk .followup h3{font-size:14px;margin:0 0 8px}#mcDesk .followup h4{font-size:12px;margin:14px 0 5px}#mcDesk .followup p{margin:8px 0}#mcDesk .followup a.sms,#mcDesk .followup button{display:inline-flex;align-items:center;min-height:44px;margin:5px 6px 5px 0;padding:8px 10px;border:1px solid #b7cbea;border-radius:8px;background:#fff;color:#214ca8;font:inherit;text-decoration:none;cursor:pointer}#mcDesk .followup .invitation-status{font-size:11px}#mcDesk .followup summary{cursor:pointer;color:#214ca8}#mcDesk .followup select{display:block;width:100%;min-height:40px;margin:5px 0;padding:6px;font:inherit;font-size:16px;border:1px solid #b7cbea;border-radius:6px}'+
    '@media(max-width:480px){#mcDesk .p{position:fixed;left:8px;right:8px;bottom:calc(70px + var(--mcd-kb,0px));width:auto;height:min(76vh,600px,calc(var(--mcd-vh,100vh) - 86px))}}';
  var style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  var root = document.createElement('div'); root.id = 'mcDesk';
  root.innerHTML = '<button type="button" class="l" aria-expanded="false"><i></i><span>Chat with us</span></button>' +
    '<section class="p" role="dialog" aria-label="Chat"><header class="h"><div><b>Front desk</b><small>Automated front desk</small></div><button type="button" class="x" aria-label="Close">&times;</button></header>' +
    '<div class="m" role="log" aria-live="off" aria-label="Conversation"></div><div class="cfg" hidden><p>Chat didn’t load. Check your connection, then try again.</p><button type="button" class="retry-config">Try again</button></div><p class="len" id="mcDeskLen" hidden></p><form><textarea rows="1" maxlength="1500" placeholder="Type your message" aria-label="Your message" aria-describedby="mcDeskLen" required disabled></textarea><button type="submit" class="s" disabled>Send</button></form>' +
    '<div class="recovery" hidden><p class="f" role="status">The previous reply is unconfirmed. Check its saved answer before sending the request again.</p><button type="button" class="recover-reply">Check previous reply</button></div><p class="f">For urgent help, use the shop’s contact details on this website.</p><p class="sr" role="status" aria-live="polite" aria-atomic="true"></p></section>';
  document.body.appendChild(root);
  var launcher = root.querySelector('.l'), panel = root.querySelector('.p'), list = root.querySelector('.m'), form = root.querySelector('form'), input = root.querySelector('textarea'), sendBtn = root.querySelector('.s');
  var recovery=root.querySelector('.recovery'),recoverButton=root.querySelector('.recover-reply'),closeButton=root.querySelector('.x'),liveRegion=root.querySelector('.sr[role="status"]');
  var cfgRow=root.querySelector('.cfg'),cfgText=cfgRow.querySelector('p'),cfgButton=cfgRow.querySelector('button'),configState='loading',configLoading=false,retryTimer=null,retryAt=0,autoRetries=0,RETRY_DELAYS=[4000,12000,25000],lastConfigRead=0,notBefore=0,controlsTimer=null,everOpened=false,busyConfig=false,notice=null,fallbackFocus=null,focusIntent=null,lastPanelFocus=null;
  var checkBanner=null,checkMessage=null,checkStatusButton=null,checkAckButton=null,sampleButton=null,sampleNote=null,checkSeen=false,sampleDetails={service:'',area:''};
  var cfg = { name: 'Front desk', greeting: 'Hi! What can we help with today?', available: false };
  var busy = false, rendered = false, configSequence = 0;
  // A refused "Check previous reply" (403 or paused/not_live/forbidden) says nothing about the original turn, so the pending
  // turn is kept, but the check is not offered again until a later config read shows chat back (closed -> ready), or a
  // ready read arrives REFUSAL_HOLD after the refusal (for refusals config cannot see, such as a forbidden origin).
  // Rev 7 (QA09 r6 R6-1): shown after a message whose outcome this shop's chat cannot check (legacy recoverTurn refused). The
  // message is marked unconfirmed in the transcript, so the note survives a reload; the server ignores the flag (sanitizeMessages).
  var UNCONFIRMED_NOTE='We couldn\u2019t confirm whether the shop received this message. Please contact the shop before sending it again.';
  var recoveryText=root.querySelector('.recovery p'),RECOVERY_COPY=recoveryText.textContent,REFUSED_COPY='Chat isn’t available right now, so we couldn’t check your earlier message. It may already be saved. Please contact the shop directly instead of sending it again.',REFUSAL_HOLD=300000,recheckTimer=null,pollTimer=null,recheckPending=false,recoveryBubble=null;

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function add(role, text) { var el = document.createElement('div'); el.className = 'b ' + (role === 'user' ? 'u' : 'a'); el.innerHTML = esc(text).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>'); list.appendChild(el); list.scrollTop = list.scrollHeight; return el; }
  function typing() { var el = document.createElement('div'); el.className = 'b a t'; el.innerHTML = '<span></span><span></span><span></span>'; list.appendChild(el); list.scrollTop = list.scrollHeight; return el; }
  function appointmentTexts(value) {
    if (!value || value.version !== 1 || !/^\+1[2-9]\d{9}$/.test(value.number || '') || !['APPOINTMENTS','CITAS'].includes(value.keyword) || typeof value.business !== 'string' || value.business.length > 100) return;
    var card=document.createElement('section');card.className='appt';card.setAttribute('aria-label',value.language==='es'?'Mensajes de citas opcionales':'Optional appointment texts');
    var spanish=value.language==='es',heading=document.createElement('b'),instructions=document.createElement('p'),disclosure=document.createElement('p'),link=document.createElement('a'),policies=document.createElement('p');
    heading.textContent=spanish?'¿Quiere mensajes sobre sus citas?':'Want appointment texts?';
    instructions.textContent=spanish?'Desde el celular que registró para su visita, envíe '+value.keyword+' al '+value.number+'. Le responderemos con una pregunta; responda SÍ para aceptar.':'From the mobile saved for your visit, text '+value.keyword+' to '+value.number+'. We will reply with a question; reply YES to agree.';
    if(value.restartRequired)instructions.textContent+=(spanish?' Primero envíe START o EMPEZAR para quitar el bloqueo anterior.':' First send START to remove your previous texting block.');
    disclosure.textContent=spanish?value.business+': confirmaciones, recordatorios y cancelaciones de citas, incluidas visitas futuras. Frecuencia variable. Pueden aplicarse tarifas de mensajes y datos. HELP para ayuda; STOP/ALTO/PARAR para terminar. Puede reservar sin mensajes.':value.business+': appointment confirmations, reminders and cancellations, including future visits. Frequency varies. Message and data rates may apply. HELP for help; STOP/ALTO/PARAR to end. Booking is available without texts.';
    link.className='sms';link.href='sms:'+value.number+'?body='+encodeURIComponent(value.keyword);link.textContent=spanish?'Abrir mensaje de texto':'Open text message';
    policies.appendChild(document.createTextNode(spanish?'Abrir no envía nada. ':'Opening sends nothing. '));
    [['terms',spanish?'Términos':'Texting terms'],['privacy',spanish?'Privacidad':'Privacy']].forEach(function(item,index){if(index)policies.appendChild(document.createTextNode(' · '));var a=document.createElement('a');a.href=BASE+'/policy?c='+encodeURIComponent(slug)+'&page='+item[0];a.target='_blank';a.rel='noopener noreferrer';a.textContent=item[1];policies.appendChild(a);});
    card.append(heading,instructions,link,disclosure,policies);list.appendChild(card);list.scrollTop=list.scrollHeight;
  }
  function followupTexts(value,entry) {
    if(!value||entry?.followupDismissed||value.version!==1||!/^\+1[2-9]\d{9}$/.test(value.number||'')||!/^\+1[2-9]\d{9}$/.test(value.phone||'')||!/^[a-zA-Z0-9_-]{1,80}$/.test(value.requestId||'')||typeof value.business!=='string'||value.business.length>100)return;
    var choices=(Array.isArray(value.choices)?value.choices:[]).filter(function(choice){return choice&&['request_followup','quote_followup'].includes(choice.purpose)&&choice.command===(choice.purpose==='quote_followup'?'QUOTE ':'REQUEST ')+value.requestId;});if(!choices.length)return;
    var card=document.createElement('section'),heading=document.createElement('h3'),intro=document.createElement('p'),instructions=document.createElement('p'),link=document.createElement('a'),copy=document.createElement('button'),scope=document.createElement('p'),details=document.createElement('details'),summary=document.createElement('summary'),disclosure=document.createElement('p'),policies=document.createElement('p'),status=document.createElement('p'),decline=document.createElement('button'),choice=choices.find(function(row){return row.purpose==='request_followup';})||choices[0];
    card.className='followup';card.setAttribute('aria-label','Optional one-time customer text');heading.textContent='Want one text about this request?';intro.textContent='From your saved mobile '+value.phone+', ask '+value.business+' for one follow-up.';card.append(heading,intro);
    function selected(){instructions.textContent='Text '+choice.command+' to '+value.number+'.';link.href='sms:'+value.number+'?body='+encodeURIComponent(choice.command);}
    if(choices.length>1){var label=document.createElement('label'),select=document.createElement('select');label.textContent='What would you like?';select.setAttribute('aria-label','Optional text purpose');choices.forEach(function(row){var option=document.createElement('option');option.value=row.purpose;option.textContent=row.purpose==='quote_followup'?'One text about the quote already sent':'One text about this service request';select.append(option);});select.value=choice.purpose;select.addEventListener('change',function(){choice=choices.find(function(row){return row.purpose===select.value;});selected();});label.append(select);card.append(label);}
    link.className='sms';link.textContent='Open text';copy.type='button';copy.textContent='Copy instructions';copy.addEventListener('click',async function(){var text='From '+value.phone+', text '+choice.command+' to '+value.number+' to ask '+value.business+' for one '+(choice.purpose==='quote_followup'?'quote':'request')+' follow-up. Answer the separate permission question to agree.';try{await navigator.clipboard.writeText(text);status.textContent='Instructions copied. Your texting permission has not changed.';}catch(error){status.textContent='Select and copy: '+text;}});
    scope.textContent='Opening a text sends nothing. Send this request, then answer the separate permission question.';summary.textContent='How permission works';disclosure.textContent='You choose one follow-up for this exact request by replying YES with its purpose and reference to the separate text question. No promotions. Message and data rates may apply. HELP for help; STOP/ALTO/PARAR to end. Service is available without texts.';[['terms','Texting terms'],['privacy','Privacy']].forEach(function(item,index){if(index)policies.appendChild(document.createTextNode(' · '));var policy=document.createElement('a');policy.href=BASE+'/policy?c='+encodeURIComponent(slug)+'&page='+item[0];policy.target='_blank';policy.rel='noopener noreferrer';policy.textContent=item[1];policies.appendChild(policy);});details.append(summary,disclosure,policies);status.className='invitation-status';status.setAttribute('role','status');decline.type='button';decline.textContent='Continue without texts';decline.addEventListener('click',function(){if(entry){entry.followupDismissed=true;persist();}card.remove();input.focus();});selected();card.append(instructions,link,copy,scope,details,decline,status);list.appendChild(card);list.scrollTop=list.scrollHeight;
  }
  function render() { list.innerHTML = ''; add('a', notice || cfg.greeting); state.transcript.forEach(function (m) { add(m.role, m.content); if(m.role==='user'&&m.unconfirmed)add('a',UNCONFIRMED_NOTE); if(m.role==='assistant'){appointmentTexts(m.appointmentTexts);followupTexts(m.followupTexts,m);} }); rendered = true; }

  // Same wording as PUBLIC_WEB_DAILY_CLOSED in netlify/functions/lib/self-service-ai.mjs (the 429 refusal).
  var DAILY_CLOSED='Website chat has reached today\'s limit and reopens after midnight, Houston time. Please contact the shop directly.';
  function unavailable(message) { configReady=false;cfg.available = false; notice = message || 'Website chat is unavailable right now. Please use the shop’s contact details on this website.'; input.disabled = true; sendBtn.disabled = true;recoveryControls(); if (rendered) render(); cfgControls(); }
  function recoveryControls(){var refused=!!(state.pendingTurn&&state.pendingTurn.refused);recovery.hidden=!!setupCheck||!state.pendingTurn;recoverButton.hidden=refused;recoverButton.disabled=busy;var text=refused?REFUSED_COPY:RECOVERY_COPY;if(recoveryText.textContent!==text)recoveryText.textContent=text;}
  // Config reads made because of a refused or failed check keep the open/online spacing (5s) and any 429 back-off.
  function recheckConfig(){if(recheckTimer)return;var wait=Math.max(notBefore-Date.now(),lastConfigRead+5000-Date.now());if(wait<=0&&!configLoading){refreshConfig();return;}recheckTimer=setTimeout(function(){recheckTimer=null;if(configLoading)recheckConfig();else refreshConfig();},Math.max(wait,250));}
  function refuseRecovery(code){if(!state.pendingTurn)return;state.pendingTurn.refused={at:new Date().toISOString(),code:String(code||'refused').slice(0,20),closedSeen:false};persist();recheckConfig();}
  // Config said chat is closed: a refused check stays held; a check that failed without a readable answer is now known refused.
  function configClosed(){var pending=state.pendingTurn;if(pending&&!setupCheck){if(!pending.refused&&recheckPending)pending.refused={at:new Date().toISOString(),code:'unavailable',closedSeen:true};else if(pending.refused)pending.refused.closedSeen=true;persist();}recheckPending=false;}
  function configOpen(){var pending=state.pendingTurn,refused=pending&&pending.refused;recheckPending=false;if(!refused||!(refused.closedSeen||Date.now()-Date.parse(refused.at)>=REFUSAL_HOLD))return false;delete pending.refused;persist();return true;}
  // While a refused check is shown and the panel stays open, re-read config slowly (60-120s, jittered) and once right when
  // REFUSAL_HOLD ends, so a resumed chat re-offers the check without a close/reopen. Never while closed, failed or backing off.
  function refusedPoll(){clearTimeout(pollTimer);pollTimer=null;var refused=state.pendingTurn&&state.pendingTurn.refused;if(!refused||setupCheck||!root.classList.contains('open')||configState==='failed')return;
    var delay=Math.round(60000+Math.random()*60000),hold=Date.parse(refused.at)+REFUSAL_HOLD-Date.now();if(!refused.closedSeen&&hold>0)delay=Math.min(delay,hold+250);
    delay=Math.max(delay,notBefore-Date.now(),lastConfigRead+5000-Date.now());pollTimer=setTimeout(function(){pollTimer=null;if(configLoading||recheckTimer)return refusedPoll();if(state.pendingTurn&&state.pendingTurn.refused&&root.classList.contains('open')&&Date.now()>=notBefore)refreshConfig();else refusedPoll();},delay);}
  // Screen-reader announcements go through one persistent polite region; streamed deltas are not announced piecemeal.
  function announce(text){liveRegion.textContent='';if(text)setTimeout(function(){liveRegion.textContent=text;},30);}
  // The button is only unavailable while a read is in flight. During a 429 back-off a press schedules the read for when the
  // back-off ends, so the copy only promises an automatic retry while one is actually scheduled.
  function cfgControls(){var waiting=Date.now()<notBefore;clearTimeout(controlsTimer);controlsTimer=null;cfgRow.hidden=configState!=='failed';cfgButton.setAttribute('aria-disabled',configLoading?'true':'false');
    cfgText.textContent=configLoading?'Trying again…':!busyConfig?'Chat didn’t load. Check your connection, then try again.':retryTimer?'Chat is busy right now. We’ll try again automatically.':waiting?'Chat is busy right now. Try again in a few minutes.':'Chat is busy right now. Try again in a minute.';
    if(configState==='failed'&&busyConfig&&waiting&&!retryTimer)controlsTimer=setTimeout(cfgControls,notBefore-Date.now()+50);}
  function focusFirst(){fallbackFocus=null;if(!input.disabled){input.focus();return;}var target=!cfgRow.hidden?cfgButton:!recovery.hidden&&!recoverButton.disabled&&!recoverButton.hidden?recoverButton:closeButton;target.focus();if(target===closeButton)fallbackFocus=closeButton;}
  // Focus is re-homed only while the customer is working in the panel (their last focus or pointer was inside it)
  // and the control they were on disappeared or became disabled. Focus on the host page or its body is never pulled into the widget.
  function focusGone(node){return !node||!node.isConnected||node.disabled||!!node.closest('[hidden]')||!node.getClientRects().length;}
  function keepFocus(){if(!root.classList.contains('open')||focusIntent!=='panel')return;var active=document.activeElement;
    if(active&&active!==document.body){if(root.contains(active)&&(active===fallbackFocus&&!input.disabled||focusGone(active)))focusFirst();return;}
    if(focusGone(lastPanelFocus))focusFirst();}
  document.addEventListener('focusin',function(event){focusIntent=root.contains(event.target)?'panel':'host';if(focusIntent==='panel')lastPanelFocus=event.target;},true);
  document.addEventListener('pointerdown',function(event){focusIntent=root.contains(event.target)?'panel':'host';},{capture:true,passive:true});
  function checkNote(text){if(checkMessage)checkMessage.textContent=text;}
  function checkControls(){var available=configReady&&(!setupCheck&&!setupInvalid||checkReady&&!setupCheck.pending);recoveryControls();if(!setupCheck&&state.pendingTurn)available=false;cfg.available=!!available;input.disabled=!available;sendBtn.disabled=busy||!available;if(sampleButton)sampleButton.disabled=!available;if(sampleNote)sampleNote.hidden=!!available||busy||setupInvalid||!checkSeen||!!(setupCheck&&setupCheck.pending);}
  function checkPayload(action,extra){return Object.assign({action:action,client:slug,checkId:setupCheck.id,challenge:setupCheck.challenge},extra||{});}
  async function checkRequest(action,extra){var controller=new AbortController(),timeout=setTimeout(function(){controller.abort();},15000);try{var response=await fetch(BASE+'/api/website-installation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(checkPayload(action,extra)),signal:controller.signal}),result=await response.json();if(!response.ok||result.error){var error=new Error(result.message||'The website check could not be confirmed. Return to your workspace.');error.status=response.status;throw error;}return result;}finally{clearTimeout(timeout);}}
  async function acknowledgeCheck(){var focused=document.activeElement===checkAckButton,pending=setupCheck&&setupCheck.pending;if(!pending||!pending.completionRef)return;checkAckButton.disabled=true;try{await checkRequest('acknowledge',{turnId:pending.id,completionRef:pending.completionRef});if(setupCheck.pending!==pending)return;setupCheck.pending=null;persistCheck();checkAckButton.hidden=true;checkNote(pending.record?'Your sample request is saved. Open your workspace to review it.':'Answer confirmed. Continue the sample conversation until a callback request is saved.');}catch(error){checkNote('The answer arrived, but its check receipt is not confirmed. Retry the receipt without sending the message again.');checkAckButton.hidden=false;}finally{checkAckButton.disabled=false;checkControls();if(focused&&document.activeElement===document.body&&root.classList.contains('open')){if(!checkAckButton.hidden)checkAckButton.focus();else if(!input.disabled)input.focus();else checkStatusButton.focus();}}}
  async function checkStatus(observe){if(!setupCheck)return;var focused=document.activeElement===checkStatusButton;checkStatusButton.disabled=true;try{var pending=setupCheck.pending,result=await checkRequest(observe&&!pending?'observe':'status',pending?{turnId:pending.id}:{}),check=result.check;if(!check||check.id!==setupCheck.id||check.origin!==location.origin||check.contact!==setupCheck.contact)throw new Error('This check belongs to a different website. Return to your workspace.');sampleDetails={service:typeof check.sample?.service==='string'?check.sample.service.slice(0,160):'',area:typeof check.sample?.area==='string'?check.sample.area.slice(0,160):''};setupCheck.expiresAt=check.expiresAt;checkReady=!!check.observed&&check.chatAvailable===true;checkSeen=!!check.observed;persistCheck();
      if(pending){if(check.turn?.answerObserved){setupCheck.pending=null;persistCheck();checkAckButton.hidden=true;checkNote(check.turn.record?'Your sample request is saved. Open your workspace to review it.':'The previous answer is confirmed. You can continue the sample conversation.');}else{checkNote(check.turn?.record?'Your sample request is saved; its answer is not confirmed. Open your workspace before sending it again.':'The previous message may already have been processed. Check its outcome in your workspace before sending it again.');if(pending.completionRef)checkAckButton.hidden=false;}}
      else checkNote(check.chatAvailable?'Widget found. Try the sample request below, then send it when you are ready.':('Widget found. '+(check.chatAction==='activate_web'?'Website chat is not on yet. Return to your workspace, select Activate website chat, then select Check saved status here.':(check.reason||'Finish your setup in the workspace before trying a request.')+' Then select Check saved status here.')));
      // The owner may activate chat after this tab first observes the widget.
      // Re-read its public availability without reloading or repeating a turn.
      if(check.chatAvailable===true)await refreshConfig();
    }catch(error){checkReady=false;if([401,403,410].includes(error.status)){setupInvalid=true;setupCheck.challenge='';setupCheck.pending=null;try{sessionStorage.setItem(CHECK_STORE,JSON.stringify({ended:true,id:setupCheck.id,origin:location.origin}));}catch(storageError){/* The in-memory challenge is cleared. */}}checkNote(error.message||'The check is unavailable. Return to your workspace to start again.');}finally{checkStatusButton.disabled=setupInvalid;checkControls();if(focused&&document.activeElement===document.body&&root.classList.contains('open')){if(!checkStatusButton.disabled)checkStatusButton.focus();else checkBanner.querySelector('a').focus();}}}
  if(setupCheck||setupInvalid){
    checkBanner=document.createElement('div');checkBanner.className='check';checkBanner.innerHTML='<b>Website setup check</b><p role="status" aria-live="polite"></p><p>Creates a labeled sample request using your customer-chat allowance. Your usual request notifications may run.</p><p id="mcCheckSampleNote" data-check-sample-note hidden>Sample details turn on once website chat is active.</p><button type="button" data-check-sample aria-describedby="mcCheckSampleNote">Use sample details</button><button type="button" data-check-status>Check saved status</button><button type="button" data-check-ack hidden>Retry check receipt</button><a target="_blank" rel="noopener noreferrer">Open my workspace</a>';
    list.before(checkBanner);checkMessage=checkBanner.querySelector('[role="status"]');sampleButton=checkBanner.querySelector('[data-check-sample]');sampleNote=checkBanner.querySelector('[data-check-sample-note]');checkStatusButton=checkBanner.querySelector('[data-check-status]');checkAckButton=checkBanner.querySelector('[data-check-ack]');checkBanner.querySelector('a').href=BASE+'/desk.html?c='+encodeURIComponent(slug)+'#leads';root.querySelector('.h small').textContent='Website setup check';
    sampleButton.addEventListener('click',function(){input.value="Hi, I'm Alex Test. I'd like a callback about "+(sampleDetails.service||"one of your services")+(sampleDetails.area?" in "+sampleDetails.area:"")+". My number is (713) 555-0142. This is a setup check.";input.focus();});checkStatusButton.addEventListener('click',function(){checkStatus(false);});checkAckButton.addEventListener('click',acknowledgeCheck);
    if(setupInvalid){checkNote('This setup check is invalid or has ended. Return to your workspace to start again.');sampleButton.disabled=true;checkStatusButton.disabled=true;}else{checkNote('Checking this website…');checkStatus(true);}
  }
  async function refreshConfig() {
    var sequence=++configSequence,controller=new AbortController(),timeout=setTimeout(function(){controller.abort();},15000);
    clearTimeout(retryTimer);retryTimer=null;lastConfigRead=Date.now();configLoading=true;cfgControls();
    try {
      var response=await fetch(BASE+'/api/client?c='+encodeURIComponent(slug),{cache:'no-store',signal:controller.signal});
      if(!response.ok){var failure=new Error('unavailable');failure.closed=response.status===404;if(response.status===429)failure.retryAfter=retryAfterMs(response.headers.get('Retry-After'));throw failure;}var d=await response.json();
      if(!d||!d.name)throw new Error('unavailable');if(sequence!==configSequence)return;
      cfg.name=d.name;cfg.greeting=d.greeting||cfg.greeting;root.querySelector('.h b').textContent=cfg.name;
      if(d.webAvailable===false||d.status==='paused'||d.status==='cancelled'){configState='closed';configClosed();unavailable(d.webClosed==='daily_limit'?DAILY_CLOSED:undefined);return;}
      var recovered=configState==='failed',reopened=configOpen();configState='ready';autoRetries=0;notBefore=0;busyConfig=false;notice=null;
      configReady=true;checkControls();if(rendered)render();if(root.classList.contains('open')&&(recovered||reopened))announce(reopened?'Chat is available again. You can check your earlier message.':'Chat is ready.');
    }catch(error){if(sequence===configSequence){configState=error&&error.closed?'closed':'failed';if(configState==='closed')configClosed();else recheckPending=false;
      // 429: honour Retry-After (at least 30s, at most 10 min) for every kind of read, including the customer's own retry.
      busyConfig=!!(error&&error.retryAfter);if(busyConfig)notBefore=Date.now()+error.retryAfter;unavailable();
      // Automatic re-reads start only after the customer has opened chat, are jittered and stop after three.
      if(configState==='failed'){if(root.classList.contains('open'))announce(busyConfig?'Chat is busy right now.':'Chat didn’t load. You can try again.');if(everOpened&&autoRetries<RETRY_DELAYS.length){scheduleConfig(Math.max(notBefore-Date.now(),Math.round(RETRY_DELAYS[autoRetries]*(0.8+Math.random()*0.4))));autoRetries++;}}}}
    finally{clearTimeout(timeout);if(sequence===configSequence){configLoading=false;cfgControls();keepFocus();refusedPoll();}}
  }
  function retryAfterMs(value){var seconds=/^\d+$/.test(value||'')?Number(value):value?(Date.parse(value)-Date.now())/1000:NaN;return Math.min(600000,Math.max(30000,isFinite(seconds)?seconds*1000:60000));}
  function scheduleConfig(delay){var at=Date.now()+Math.max(0,delay);if(retryTimer&&retryAt<=at)return;clearTimeout(retryTimer);retryAt=at;retryTimer=setTimeout(function(){retryTimer=null;if(configState==='failed'&&!configLoading)refreshConfig();else cfgControls();},Math.max(0,delay));cfgControls();}
  // Open and reconnect re-read at most once per 5s (and never before a 429 Retry-After); the button skips the 5s spacing only.
  function retryConfig(reason){if(configState!=='failed'||configLoading)return;if(reason!=='button'&&!everOpened)return;var wait=Math.max(notBefore-Date.now(),reason==='button'?0:lastConfigRead+5000-Date.now());if(wait<=0)refreshConfig();else scheduleConfig(wait);}
  cfgButton.addEventListener('click',function(){retryConfig('button');});
  window.addEventListener('online',function(){retryConfig('online');if(everOpened&&state.pendingTurn&&state.pendingTurn.refused&&configState!=='failed')recheckConfig();});
  refreshConfig();

  function fitViewport(){var view=window.visualViewport;if(!view||!root.classList.contains('open')||Math.abs((view.scale||1)-1)>0.01){root.style.removeProperty('--mcd-kb');root.style.removeProperty('--mcd-vh');return;}root.style.setProperty('--mcd-kb',Math.max(0,Math.round(window.innerHeight-view.height-view.offsetTop))+'px');root.style.setProperty('--mcd-vh',Math.round(view.height)+'px');}
  if(window.visualViewport){window.visualViewport.addEventListener('resize',fitViewport);window.visualViewport.addEventListener('scroll',fitViewport);}
  // At 480px or less the open panel covers the page, so it behaves as a modal dialog: aria-modal, and Tab and Shift+Tab
  // wrap inside the panel. Escape and Close still return focus to the launcher. Wider panels stay non-modal.
  var narrow = window.matchMedia ? window.matchMedia('(max-width:480px)') : { matches: false };
  function modalSync() { if (root.classList.contains('open') && narrow.matches) panel.setAttribute('aria-modal', 'true'); else panel.removeAttribute('aria-modal'); }
  if (narrow.addEventListener) narrow.addEventListener('change', modalSync);
  function panelStops() { return Array.prototype.filter.call(panel.querySelectorAll('a[href],button,textarea,input,select,summary,[tabindex]:not([tabindex="-1"])'), function (node) { return !node.disabled && !node.closest('[hidden]') && node.getClientRects().length > 0; }); }
  // Listen on the document, not the widget: after a tap or click on the visible host strip, focus is on the host page and Tab
  // must still return to the panel. A host modal (native dialog or aria-modal) that owns focus is left alone.
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Tab' || event.isComposing || !root.classList.contains('open') || !narrow.matches) return;
    var stops = panelStops(); if (!stops.length) return; var first = stops[0], last = stops[stops.length - 1], active = document.activeElement;
    if (active && !root.contains(active) && active.closest && active.closest('dialog[open],[aria-modal="true"]')) return;
    if (event.shiftKey ? (active === first || !panel.contains(active)) : (active === last || !panel.contains(active))) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
  });
  function open() { root.classList.add('open'); launcher.setAttribute('aria-expanded', 'true'); modalSync(); fitViewport(); if (!rendered) render(); everOpened=true; focusIntent='panel'; retryConfig('open'); if(state.pendingTurn&&state.pendingTurn.refused&&configState!=='failed'){recheckConfig();refusedPoll();} setTimeout(function () { var active=document.activeElement; if(root.classList.contains('open')&&focusIntent==='panel'&&(!active||active===document.body||root.contains(active)))focusFirst(); }, 50); }
  function close() { root.classList.remove('open');clearTimeout(pollTimer);pollTimer=null; launcher.setAttribute('aria-expanded', 'false'); modalSync(); fitViewport(); launcher.focus(); }
  // Above 480px the panel is non-modal: Tab moves on to the host page as usual (at 480px or less Tab wraps, see above). Esc closes (not while an IME composition is open).
  root.addEventListener('keydown',function(event){if(!root.classList.contains('open')||event.isComposing||event.keyCode===229)return;if(event.key==='Escape'){event.preventDefault();close();}});
  launcher.addEventListener('click', function () { root.classList.contains('open') ? close() : open(); });
  closeButton.addEventListener('click', close);
  // QA09 r4 (adopted in rev 5): a not-sent message is put back in the box only once any open IME composition has been
  // committed. Restored + typed text can exceed maxlength (script assignment bypasses it) and the server cuts messages at
  // 1,500 characters, so an over-long box is reported in a visible note (and on Send) and never sent or cut.
  var MAX_LEN=1500,lenNote=root.querySelector('.len'),composing=false,heldBack=null;
  function lengthOk(){var n=input.value.trim().length;if(n<=MAX_LEN){if(!lenNote.hidden){lenNote.hidden=true;lenNote.textContent='';input.removeAttribute('aria-invalid');}return true;}lenNote.textContent='Your message is '+n.toLocaleString('en-US')+' characters. Please shorten it to 1,500 or fewer before sending; nothing has been cut.';lenNote.hidden=false;input.setAttribute('aria-invalid','true');return false;}
  function mergeBack(text,quiet){var typed=input.value;input.value=typed.trim()?text+'\n'+typed:text;if(!lengthOk()&&!quiet)announce(lenNote.textContent);}
  input.addEventListener('compositionstart',function(){composing=true;});
  input.addEventListener('compositionend',function(){composing=false;if(heldBack!==null){var t=heldBack;heldBack=null;setTimeout(function(){mergeBack(t);},0);}});
  input.addEventListener('input',lengthOk);
  // QA09 r5: after a keyboard edit an over-long box is also tooLong to the browser, whose bubble would replace the note: keep the note.
  // Rev 6: preventing the bubble also stops the browser focusing the box, so focus it here (as a blocked Send does).
  // Rev 7 (QA09 r6 R6-2): 'invalid' also fires when host script validates every form on the page; the bubble is always kept
  // away, but the note is spoken and the box focused only for the widget's own Send/Enter (open panel, focus intent in it).
  input.addEventListener('invalid',function(e){if(input.validity.tooLong&&!lengthOk()){e.preventDefault();if(root.classList.contains('open')&&focusIntent==='panel'){announce(lenNote.textContent);input.focus();}}});
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); form.requestSubmit(); } });
  function sendMessage(recover) {
    var text = input.value.trim(); if (busy || (!recover && (!text || !cfg.available || input.disabled)) || (recover && (!state.pendingTurn?.request || state.pendingTurn.refused || setupCheck))) return;
    if (!recover && !lengthOk()) { announce(lenNote.textContent); input.focus(); return; }
    // At most one bubble reports the outcome of "Check previous reply": a repeat check replaces the previous one.
    if(recover&&recoveryBubble){recoveryBubble.remove();recoveryBubble=null;}
    if(setupCheck){var bytes=new Uint8Array(16);crypto.getRandomValues(bytes);setupCheck.pending={id:Array.from(bytes).map(function(value){return value.toString(16).padStart(2,'0');}).join(''),completionRef:null,record:null};persistCheck();}
    busy = true; sendBtn.disabled = true; if(!recover)input.value=''; /* rev 6: a recovery check never clears what the visitor typed */
    var sent=null;if(!recover){state.transcript.push({ role: 'user', content: text });persist();sent=add('user',text);}
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
    function finish(reply,events) { if (done) return; if (typeof reply !== 'string' || !reply.trim()) { fail(interrupted); return; } done = true;state.pendingTurn=null; if (tp.parentNode) tp.remove(); if (!bubble) bubble = add('a', reply); else bubble.textContent = reply; announce(reply); var invitation=Array.isArray(events)&&events.find(function(event){return event.type==='booking'&&event.appointmentTexts;}),followup=Array.isArray(events)&&events.find(function(event){return event.type==='lead'&&event.followupTexts;}),entry={ role: 'assistant', content: reply, ...(invitation?{appointmentTexts:invitation.appointmentTexts}:{}),...(followup?{followupTexts:followup.followupTexts}:{}) };state.transcript.push(entry);if(invitation)appointmentTexts(invitation.appointmentTexts);if(followup)followupTexts(followup.followupTexts,entry);persist();if(setupCheck){var receipt=Array.isArray(events)&&events.find(function(event){return event.type==='website_check'&&event.checkId===setupCheck.id&&event.turnId===setupCheck.pending?.id&&/^[a-f0-9]{64}$/.test(event.completionRef||'');});if(receipt){setupCheck.pending.completionRef=receipt.completionRef;setupCheck.pending.record=receipt.record||null;persistCheck();acknowledgeCheck();}else checkNote('The answer arrived, but this check has no matching receipt. Check the saved outcome in your workspace.');} }
    function fail(message) { if (done) return; done = true; if (tp.parentNode) tp.remove(); if (message === null) return; /* the recovery strip (role=status) states the refusal */ var text = typeof message === 'string' ? message : interrupted; if (!bubble) bubble = add('a', text); else bubble.textContent = text; // announced once through the .sr status region, not also as a live bubble
      if(recover)recoveryBubble=bubble;announce(lenNote.hidden?text:text+' '+lenNote.textContent);if(setupCheck)checkNote('The reply was interrupted. Your request may already be saved; check its status before sending it again.'); }
    function release() {
      clearTimeout(timer);
      // A terminal packet completes the turn; do not wait indefinitely for the connection to close.
      if (reader) { try { var cancelled = reader.cancel(); if (cancelled && cancelled.catch) cancelled.catch(function () {}); } catch (e) { /* already closed */ } }
      busy = false;checkControls();var active=document.activeElement;if(root.classList.contains('open')&&focusIntent==='panel'&&(active&&active!==document.body?root.contains(active):focusGone(lastPanelFocus)||form.contains(lastPanelFocus))){if(!input.disabled)input.focus();else if(setupCheck&&checkStatusButton&&!checkStatusButton.disabled)checkStatusButton.focus();else if(bubble){bubble.tabIndex=-1;bubble.focus();}else focusFirst();}
    }
    var body;
    if(recover){body=Object.assign({},state.pendingTurn.request,{recoverTurn:true});if(Array.isArray(body.messages))body.messages=alternating(body.messages);if(!body.conversationToken&&state.token&&body.contact===state.contact)body.conversationToken=state.token;}
    else{var turnBytes=new Uint8Array(16);crypto.getRandomValues(turnBytes);var turnId=Array.from(turnBytes).map(function(value){return value.toString(16).padStart(2,'0');}).join('');var requestMessages=alternating(state.transcript.slice(-19));if(requestMessages[0]?.role==='assistant')requestMessages.shift();body={client:slug,contact:state.contact,turnId:turnId,messages:requestMessages,page:location.pathname,stream:true};if(!setupCheck&&state.token)body.conversationToken=state.token;if(setupCheck)body.websiteCheck={checkId:setupCheck.id,challenge:setupCheck.challenge,turnId:setupCheck.pending.id};else{state.pendingTurn={id:turnId,at:new Date().toISOString(),request:body};persist();}}
    var request = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    if (abort) request.signal = abort.signal;
    bounded(fetch(ENDPOINT, request))
      .then(function (res) {
        adoptConversation(res);
        var type = res.headers.get('content-type') || '';
        if (!res.ok) { if (res.status === 429) { configReady=false;cfg.available = false; input.disabled = true; } return bounded(res.json()).then(function(error){error=error&&typeof error==='object'?error:{};var refused=false;var backInBox=function(text){if(!text)return false;var shown=sent;if(!shown){var us=list.querySelectorAll('.b.u');shown=us.length&&us[us.length-1].textContent===text?us[us.length-1]:null;}if(shown&&shown.parentNode)shown.remove();if(composing)heldBack=heldBack===null?text:heldBack+'\n'+text;else mergeBack(text,true);return true;};if(!setupCheck&&(error.error==='conversation_reload_required'||error.error==='conversation_turn_moved')){state.contact=newContact();state.token=null;state.pendingTurn=null;var tail=state.transcript[state.transcript.length-1];var dropped=tail&&tail.role==='user'?state.transcript.pop().content:'';persist();if(error.error==='conversation_reload_required'){error.message='This chat restarted here. Your message was not sent and is back in the box: press Send to send it again.';backInBox(dropped);}else error.message='That message was answered in an earlier chat this window can no longer show. This chat has restarted here; please contact the shop before sending the same request again.';}else if(!setupCheck&&(error.turnNotProcessed===true||res.status===400)){state.pendingTurn=null;var last=state.transcript[state.transcript.length-1],restored=false;if(!recover&&last&&last.role==='user'){state.transcript.pop();restored=backInBox(last.content);}if(res.status===400)error.message=recover?'That earlier message was not sent, so nothing was submitted. You can send it again.':'Your message was not sent and is back in the box: press Send to send it again.';else if(restored)error.message=(typeof error.message==='string'&&error.message?error.message+' ':'')+'Your message was not sent and is back in the box.';persist();}else if(recover&&!setupCheck&&error.error==='conversation_recovery_unavailable'){/* Rev 7 (QA09 r6 R6-1): mark the lost message unconfirmed (render() explains it after a reload). */var lostUser=(state.pendingTurn.request&&Array.isArray(state.pendingTurn.request.messages)?state.pendingTurn.request.messages:[]).filter(function(m){return m&&m.role==='user';}).pop();for(var li=state.transcript.length-1;lostUser&&li>=0;li--){if(state.transcript[li].role==='user'&&state.transcript[li].content===lostUser.content){state.transcript[li].unconfirmed=true;break;}}/* Rev 6: this shop's chat cannot check a saved reply (it is never re-run): retire the strip and reopen the box; the outcome stays unknown, so nothing is put back in it. */state.pendingTurn=null;persist();if(typeof error.message!=='string'||!error.message)error.message='We can\u2019t check a saved reply for this chat. Please contact the shop before sending the request again.';}else if(recover&&(res.status===403||['paused','not_live','forbidden'].includes(error.error))){refused=true;refuseRecovery(error.error||'forbidden');}fail(typeof error.message==='string'&&error.message?error.message:refused?null:res.status === 429 ? 'Chat has reached its daily limit. Please contact the shop directly using the details on this website.' : interrupted);},function(){if(recover&&res.status===403){refuseRecovery('forbidden');fail(null);}else fail(interrupted);}); }
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
      // A cross-origin 403 without CORS headers is indistinguishable here from a lost connection. After a failed check, one
      // spaced config read tells them apart only when config shows chat closed (paused, cancelled, unavailable).
      .catch(function () { if(recover&&!done&&state.pendingTurn&&!state.pendingTurn.refused){recheckPending=true;recheckConfig();} fail(interrupted); })
      .then(release, release);
  }
  form.addEventListener('submit',function(event){event.preventDefault();sendMessage(false);});recoverButton.addEventListener('click',function(){sendMessage(true);});
})();
