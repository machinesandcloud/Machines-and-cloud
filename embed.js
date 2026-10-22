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
  var state = { contact: null, transcript: [] };
  try { var saved = JSON.parse(sessionStorage.getItem(STORE) || 'null'); if (saved && saved.contact) state = saved; } catch (e) { /* ignore */ }
  if (!state.contact) state.contact = 'w' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  function persist() { try { sessionStorage.setItem(STORE, JSON.stringify({ contact: state.contact, transcript: state.transcript.slice(-20) })); } catch (e) { /* ignore */ } }

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
    '#mcDesk .t span{display:inline-block;width:6px;height:6px;margin-right:3px;border-radius:50%;background:#9ca3af;animation:mcdk 1.2s infinite}#mcDesk .t span:nth-child(2){animation-delay:.2s}#mcDesk .t span:nth-child(3){animation-delay:.4s}' +
    '@keyframes mcdk{0%,80%,100%{opacity:.3}40%{opacity:1}}' +
    '#mcDesk form{display:flex;gap:8px;padding:10px;border-top:1px solid #e5e7eb;background:#fff}' +
    '#mcDesk textarea{flex:1;resize:none;min-height:40px;max-height:110px;padding:10px;border:1px solid #d1d5db;border-radius:10px;font:inherit}' +
    '#mcDesk button.s{padding:0 16px;border:0;border-radius:10px;background:#2563EB;color:#fff;font-weight:600;cursor:pointer}' +
    '#mcDesk .f{margin:0;padding:0 12px 8px;font-size:10px;color:#6b7280;background:#fff}' +
    '@media(max-width:480px){#mcDesk .p{position:fixed;left:8px;right:8px;bottom:70px;width:auto;height:min(76vh,600px)}}';
  var style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  var root = document.createElement('div'); root.id = 'mcDesk';
  root.innerHTML = '<button type="button" class="l" aria-expanded="false"><i></i><span>Chat with us</span></button>' +
    '<section class="p" role="dialog" aria-label="Chat"><header class="h"><div><b>Front desk</b><small>Automated front desk</small></div><button type="button" class="x" aria-label="Close">&times;</button></header>' +
    '<div class="m"></div><form><textarea rows="1" maxlength="1500" placeholder="Type your message" aria-label="Your message" required disabled></textarea><button type="submit" class="s" disabled>Send</button></form>' +
    '<p class="f">For urgent help, use the shop’s contact details on this website.</p></section>';
  document.body.appendChild(root);
  var launcher = root.querySelector('.l'), panel = root.querySelector('.p'), list = root.querySelector('.m'), form = root.querySelector('form'), input = root.querySelector('textarea'), sendBtn = root.querySelector('.s');
  var cfg = { name: 'Front desk', greeting: 'Hi! What can we help with today?', available: false };
  var busy = false, rendered = false;

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function add(role, text) { var el = document.createElement('div'); el.className = 'b ' + (role === 'user' ? 'u' : 'a'); el.innerHTML = esc(text).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>'); list.appendChild(el); list.scrollTop = list.scrollHeight; return el; }
  function typing() { var el = document.createElement('div'); el.className = 'b a t'; el.innerHTML = '<span></span><span></span><span></span>'; list.appendChild(el); list.scrollTop = list.scrollHeight; return el; }
  function render() { list.innerHTML = ''; add('a', cfg.greeting); state.transcript.forEach(function (m) { add(m.role, m.content); }); rendered = true; }

  function unavailable(message) { cfg.available = false; cfg.greeting = message || 'Website chat is unavailable right now. Please use the shop’s contact details on this website.'; input.disabled = true; sendBtn.disabled = true; if (rendered) render(); }
  fetch(BASE + '/api/client?c=' + encodeURIComponent(slug)).then(function (r) { if (!r.ok) throw new Error('unavailable'); return r.json(); }).then(function (d) {
    if (!d || !d.name) throw new Error('unavailable');
    if (d && d.name) { cfg.name = d.name; cfg.greeting = d.greeting || cfg.greeting; root.querySelector('.h b').textContent = cfg.name; }
    if (d.webAvailable === false || d.status === 'paused' || d.status === 'cancelled') { unavailable(); return; }
    cfg.available = true; input.disabled = false; sendBtn.disabled = false;
    if (rendered) render();
  }).catch(function () { unavailable(); });

  function open() { root.classList.add('open'); launcher.setAttribute('aria-expanded', 'true'); if (!rendered) render(); setTimeout(function () { input.focus(); }, 50); }
  function close() { root.classList.remove('open'); launcher.setAttribute('aria-expanded', 'false'); }
  launcher.addEventListener('click', function () { root.classList.contains('open') ? close() : open(); });
  root.querySelector('.x').addEventListener('click', close);
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = input.value.trim(); if (!text || busy) return;
    busy = true; sendBtn.disabled = true; input.value = '';
    state.transcript.push({ role: 'user', content: text }); persist(); add('user', text);
    var tp = typing(), bubble = null, full = '', done = false;
    function delta(t) { if (!bubble) { tp.remove(); bubble = add('a', ''); } full += t; bubble.textContent = full; list.scrollTop = list.scrollHeight; }
    function finish(reply) { if (done) return; done = true; if (tp.parentNode) tp.remove(); if (!bubble) bubble = add('a', reply); else bubble.textContent = reply; state.transcript.push({ role: 'assistant', content: reply }); persist(); }
    function fail(message) { if (done) return; done = true; if (tp.parentNode) tp.remove(); add('a', typeof message === 'string' ? message : 'Chat is unavailable right now. Please use the shop’s contact details on this website.'); }
    fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client: slug, contact: state.contact, messages: state.transcript.slice(-20), page: location.pathname, stream: true }) })
      .then(function (res) {
        var type = res.headers.get('content-type') || '';
        if (!res.ok) { if (res.status === 429) { cfg.available = false; input.disabled = true; } fail(res.status === 429 ? 'Chat has reached its daily limit. Please contact the shop directly using the details on this website.' : undefined); return; }
        if (type.indexOf('ndjson') !== -1 && res.body && res.body.getReader) {
          var reader = res.body.getReader(), dec = new TextDecoder(), buf = '';
          return (function pump() { return reader.read().then(function (r) {
            if (r.done) { if (!done) { if (full) finish(full); else fail(); } return; }
            buf += dec.decode(r.value, { stream: true }); var lines = buf.split('\n'); buf = lines.pop();
            lines.forEach(function (l) { if (!l.trim()) return; try { var o = JSON.parse(l); if (o.t === 'delta') delta(o.text || ''); else if (o.t === 'done') finish(o.reply || full); else if (o.t === 'error') fail(); } catch (e) { /* ignore */ } });
            return pump();
          }); })();
        }
        return res.json().then(function (d) { if (d && typeof d.reply === 'string') finish(d.reply); else fail(); });
      })
      .catch(fail)
      .then(function () { busy = false; sendBtn.disabled = !cfg.available; input.focus(); });
  });
})();
