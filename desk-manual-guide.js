/* Instructional playback is a view of the owner's task, never completion evidence. */
(function () {
  'use strict';
  var tasks = new Map(), data = null, departure = null;
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function session() { try { return sessionStorage.getItem('mc-onboarding-session-v1'); } catch (_) { return null; } }
  function current() { return data && session() && document.body.dataset.workspaceState === 'ready'; }
  function safeLink(value) { try { var u = new URL(value); return (u.protocol === 'https:' && !u.username && !u.password || u.protocol === 'mailto:') ? u.href : null; } catch (_) { return null; } }
  function steps(task) { var headings=task.stepTitles||({wordpress:['Download the ZIP','Upload the plugin','Activate the plugin','Return and check'],phone:['Choose the business line','Set the dedicated destination','Call from another phone','Read the call result'],carrier:['Choose the business line','Set the dedicated destination','Call from another phone','Read the call result'],angi:['Review the prepared request','Send from your account','Report your sent request','Check the first delivered lead']}[task.scene]||[]);if(task.scene==='phone'&&(task.forwardingMode==='use_new_number'||/^Test your front desk number/.test(task.title||'')))headings=['Review the prepared number','Call from another phone','Read the call result'];return (task.steps || []).map(function (s,i) { return typeof s === 'string' ? {title:headings[i]||'Instruction '+(i+1), detail:s} : {title:s.title || s.label || headings[i] || 'Instruction '+(i+1), detail:s.detail || s.description || s.title || s.label || '', screen:s.screen || null, action:s.action || null}; }); }
  function scene(task, step, index) {
    var kind = task.scene || task.kind || '', screen = step.screen || task.title || 'Your provider account', action = step.action || step.title;
    var body;
    if (kind === 'wordpress') {
      screen = ['Your downloads','WordPress · Add Plugins','WordPress · Plugins','Machines & Cloud · Website check'][Math.min(index,3)];
      body = index === 0 ? '<div class="manual-file">ZIP<br><strong>'+esc(task.fileName || 'front-desk.zip')+'</strong><small>Keep this file zipped</small></div>' : index === 1 ? '<div class="manual-screen-row">Upload Plugin</div><div class="manual-file-input">Choose file <span>'+esc(task.fileName || 'front-desk.zip')+'</span></div><span class="manual-screen-button">Install Now</span>' : index === 2 ? '<div class="manual-screen-row">Machines &amp; Cloud Website Chat</div><span class="manual-screen-button">Activate Plugin</span>' : '<div class="manual-screen-row">Published website</div><span class="manual-screen-button">Check website</span><small>Actual saved results appear in your workspace</small>';
    } else if (kind === 'phone' || kind === 'carrier') {
      if(task.forwardingMode==='use_new_number'||/^Test your front desk number/.test(task.title||'')){
        screen=index===0?'Your front desk number':index===1?'A different phone':'Machines & Cloud · Call result';
        body='<div class="manual-screen-row">'+esc(index===0?task.destination||'Review the prepared front desk number':index===1?'Call the front desk number':'Read the signed call result')+'</div><span class="manual-screen-button">'+esc(index===0?'Review number':index===1?'Place the test call':'Check saved status')+'</span>';
      }else{
        screen = index === 0 ? 'Your business line' : index === 1 ? 'Forwarding destination' : index === 2 ? 'A different phone' : 'Machines & Cloud · Call result';
        body = '<div class="manual-screen-row">'+esc(index===0 ? task.businessNumber || 'Select the line customers call' : index===1 ? task.destination || 'Use your dedicated front desk number' : index===2 ? 'Call your business number' : 'Read the signed call result')+'</div><span class="manual-screen-button">'+esc(step.action || (index===0?'Call forwarding':index===1?'Save destination':index===2?'Place the test call':'Check saved status'))+'</span>';
      }
    } else if (kind === 'angi') {
      screen = ['Your prepared request','Your email account','Machines & Cloud · Angi','Machines & Cloud · Inbox'][Math.min(index,3)];
      body = '<div class="manual-screen-row">'+esc(index===0?'To: crmintegrations@angi.com':index===1?'From: your Angi account email':index===2?'Customer report, not delivery proof':'Waiting for a valid Angi lead')+'</div><span class="manual-screen-button">'+esc(index===0?'Review email to Angi':index===1?'Review and send':index===2?'I sent this request':'Check saved status')+'</span>';
    } else {
      var instruction=step.detail||step.title;var target=step.action||(step.title.startsWith('Instruction ')?instruction.split('. ')[0]:step.title);body = '<div class="manual-screen-row">'+esc(instruction)+'</div><span class="manual-screen-button">'+esc(target)+'</span>';
    }
    return '<div class="manual-screen" aria-hidden="true"><div class="manual-screen-bar"><i></i><i></i><i></i><span>'+esc(screen)+'</span></div><div class="manual-screen-content">'+body+'<span class="manual-pointer">↖</span></div></div>';
  }
  function render(task, service, key) {
    if (!task || !Array.isArray(task.steps) || !task.steps.length) return '';
    key = key || service; var prior = tasks.get(key), list = steps(task);
    tasks.set(key, {task:task, service:service, index:prior ? Math.min(prior.index,list.length-1) : 0});
    return '<section class="manual-task-guide" data-manual-guide="'+esc(key)+'" aria-label="'+esc(task.title || 'Instructions')+'"><h5>'+esc(task.title || 'Complete this step in your account')+'</h5><div class="manual-playback">'+list.map(function (step,i) { return '<div class="manual-slide" data-manual-slide="'+i+'"'+(i===tasks.get(key).index?'':' hidden')+'>'+scene(task,step,i)+'<p class="manual-slide-caption"><strong>Step '+(i+1)+' of '+list.length+': '+esc(step.title)+'</strong><span>'+esc(step.detail)+'</span></p></div>'; }).join('')+'</div><div class="manual-guide-nav"><button type="button" class="connection-guide-link" data-manual-back>Previous instruction</button><span data-manual-position>'+(tasks.get(key).index+1)+' / '+list.length+'</span><button type="button" class="connection-guide-link" data-manual-next>Next instruction</button></div><p class="manual-illustration-note">Example instructions</p><details class="manual-written-instructions"><summary>See all instructions</summary><ol class="manual-written-steps">'+list.map(function(s){return '<li>'+esc(s.detail)+'</li>';}).join('')+'</ol></details><div class="manual-task-links">'+(task.links || []).map(function(link){var href=safeLink(link.url);return href?'<a href="'+esc(href)+'" target="_blank" rel="noopener noreferrer" data-manual-external="'+esc(service)+'">'+esc(link.label)+'</a>':'';}).join('')+(safeLink(task.providerHelpURL)&&!(task.links||[]).some(function(link){return link.url===task.providerHelpURL;})?'<a href="'+esc(safeLink(task.providerHelpURL))+'" target="_blank" rel="noopener noreferrer" data-manual-external="'+esc(service)+'">'+esc(task.providerHelpLabel || task.label || 'Provider instructions')+'</a>':'')+'</div>'+(task.checkDescription?'<p class="manual-check-description"><strong>When you return:</strong> '+esc(task.checkDescription)+'</p>':'')+'<span class="sr-only" data-manual-announcement aria-live="polite"></span></section>';
  }
  function advance(node, delta, announce) {
    var state=tasks.get(node.dataset.manualGuide); if(!state)return;
    var slides=Array.from(node.querySelectorAll('[data-manual-slide]')); state.index=(state.index+delta+slides.length)%slides.length;
    slides.forEach(function(slide,i){slide.hidden=i!==state.index;}); node.querySelector('[data-manual-position]').textContent=(state.index+1)+' / '+slides.length;
    if(announce)node.querySelector('[data-manual-announcement]').textContent='Instruction '+(state.index+1)+' of '+slides.length;
  }
  function track(service) { if(!current())return;departure={service:service,slug:data.client.slug,session:session(),left:false,expires:Date.now()+30*60*1000}; }
  function left() { if(departure&&current())departure.left=true; }
  function returned() {
    var d=departure;if(!d||!d.left||document.hidden)return;
    departure=null;
    if(!current()||d.expires<Date.now()||d.slug!==data.client.slug||d.session!==session())return;
    document.dispatchEvent(new CustomEvent('mc:manual-return',{detail:{service:d.service,slug:d.slug}}));
  }
  document.addEventListener('click',function(event){var next=event.target.closest('[data-manual-next],[data-manual-back]');if(next){advance(next.closest('[data-manual-guide]'),next.hasAttribute('data-manual-next')?1:-1,true);return;}var link=event.target.closest('a[data-manual-external]');if(link&&!event.defaultPrevented&&safeLink(link.href))track(link.dataset.manualExternal);});
  window.addEventListener('blur',left); window.addEventListener('focus',returned);
  document.addEventListener('visibilitychange',function(){if(document.hidden)left();else returned();});
  // Only the cursor/highlight loops. Reading stays on the chosen instruction.
  document.addEventListener('mc:desk',function(event){data=event.detail;});
  document.addEventListener('mc:session-expired',function(){data=null;departure=null;tasks.clear();});
  document.getElementById('deskSignOut')?.addEventListener('click',function(){data=null;departure=null;tasks.clear();});
  window.MCManualGuide={render:render,track:track,safeLink:safeLink};
})();
