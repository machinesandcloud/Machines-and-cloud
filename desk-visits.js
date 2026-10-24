(function(){
  'use strict';
  var $=function(id){return document.getElementById(id);},dialog=$('visitDialog'),root=$('visitAvailability');if(!dialog||!root)return;
  var q=new URLSearchParams(location.search),slug=q.get('c'),base=(document.querySelector('meta[name="mc-api-base"]')?.content||'').replace(/\/$/,''),context=null,snapshot=null,controller=null,expiry=null,sequence=0,checking=false,saving=false,data=null;
  function session(){try{return sessionStorage.getItem('mc-onboarding-session-v1');}catch{return null;}}
  function current(run,token){return run===sequence&&dialog.open&&context&&token===session();}
  function note(text,error){$('visitAvailabilityStatus').textContent=text;$('visitAvailabilityStatus').dataset.error=error?'true':'false';}
  function cancel(){sequence++;if(controller)controller.abort();controller=null;checking=false;if(expiry)clearTimeout(expiry);expiry=null;}
  function emptyWindows(){var option=document.createElement('option');option.value='';option.textContent='Check available times';$('visitWindow').replaceChildren(option);$('visitWindow').disabled=true;}
  function controls(){$('visitFindTimes').disabled=checking||saving||!!context?.pending;$('visitAvailableTimes').querySelectorAll('button').forEach(function(button){button.disabled=checking||saving||!!context?.pending;});}
  function clear(message){cancel();snapshot=null;$('visitAvailableTimes').replaceChildren();if(context&&!context.pending)emptyWindows();if(message)note(message);controls();}
  function valid(){return snapshot&&Date.parse(snapshot.expiresAt)>Date.now()&&snapshot.configurationRevision===context?.configurationRevision;}
  function dateLabel(date){return new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',weekday:'short',month:'short',day:'numeric'}).format(new Date(date+'T12:00:00Z'));}
  function today(){var p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).filter(function(v){return v.type!=='literal';}).map(function(v){return [v.type,v.value];}));return p.year+'-'+p.month+'-'+p.day;}
  function fillWindows(date,selected){
    if(!valid()){emptyWindows();return;}
    var day=snapshot.openings.find(function(row){return row.date===date;}),placeholder=document.createElement('option');placeholder.value='';placeholder.textContent=!day?'Check availability for this date':day.windows.length?'Choose an available window':'No available window on this date';$('visitWindow').replaceChildren(placeholder);
    (day?.windows||[]).forEach(function(window){var option=document.createElement('option');option.value=window;option.textContent=window;$('visitWindow').appendChild(option);});$('visitWindow').disabled=saving||!day?.windows.length;if(selected&&(day?.windows||[]).includes(selected))$('visitWindow').value=selected;
  }
  function draw(){
    $('visitAvailableTimes').replaceChildren();var count=0;
    var later=document.createElement('details'),summary=document.createElement('summary');summary.textContent='More available dates';later.appendChild(summary);var daysShown=0;
    snapshot.openings.forEach(function(day){if(!day.windows.length)return;var group=document.createElement('div');group.className='visit-available-day';var label=document.createElement('strong');label.textContent=dateLabel(day.date);group.appendChild(label);var choices=document.createElement('div');choices.className='visit-available-windows';group.appendChild(choices);day.windows.forEach(function(window){count++;var button=document.createElement('button');button.type='button';button.className='visit-available-time';button.textContent=window;button.setAttribute('aria-label',dateLabel(day.date)+' · '+window);button.addEventListener('click',function(){if(checking||saving||context?.pending)return;if(!valid()){clear('These results expired. Check available times again.');return;}$('visitDate').value=day.date;fillWindows(day.date,window);$('visitAvailableTimes').querySelectorAll('button').forEach(function(item){item.setAttribute('aria-pressed',item===button?'true':'false');});note('Selected '+dateLabel(day.date)+' · '+window+'. We check again when you save.');$('visitWindow').focus();});choices.appendChild(button);});if(daysShown++<3)$('visitAvailableTimes').appendChild(group);else later.appendChild(group);});if(later.children.length>1)$('visitAvailableTimes').appendChild(later);
    fillWindows($('visitDate').value,'');note(count?(snapshot.source==='workspace_and_google'?'Checked your schedule and connected Google Calendar. ':'Checked your saved schedule. ')+snapshot.message:'No available times were found in these seven days. Choose a later date and check again.');
    expiry=setTimeout(function(){if(snapshot)clear('These results expired. Check available times again.');},Math.max(1,Math.min(60000,Date.parse(snapshot.expiresAt)-Date.now())));controls();
  }
  async function find(){
    if(!context||context.pending||saving||checking||!dialog.open)return;var token=session();if(!token)return;
    var date=$('visitDate').value||today();$('visitDate').value=date;if(!$('visitDate').checkValidity()){note('Choose a real date first.',true);$('visitDate').focus();return;}
    clear();var run=sequence;checking=true;controller=new AbortController();controls();note('Checking available times…');
    var body={action:'visit_availability',expectedRevision:context.configurationRevision,date:date,days:7};if(context.visitId){body.visitId=context.visitId;body.expectedVisitRevision=context.visitRevision;}
    var timeout=setTimeout(function(){controller?.abort();},20000);
    try{var response=await fetch(base+'/api/client?c='+encodeURIComponent(slug),{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:controller.signal});var result=await response.json();if(!current(run,token))return;if(response.status===401||response.status===403){document.dispatchEvent(new CustomEvent('mc:session-expired'));return;}if(!response.ok||!result.availability)throw Object.assign(new Error(result.message||'Available times could not be confirmed. Try again; no visit has changed.'),{code:result.error});
      var found=result.availability;if(found.configurationRevision!==context.configurationRevision||found.visitId!==context.visitId||found.visitRevision!==context.visitRevision||found.timezone!=='America/Chicago'||!Array.isArray(found.openings)||found.openings.length>7||!Number.isFinite(Date.parse(found.expiresAt))||Date.parse(found.expiresAt)<=Date.now())throw new Error('The schedule changed. Check available times again.');snapshot=found;draw();
    }catch(error){if(current(run,token)){snapshot=null;emptyWindows();note(error.name==='AbortError'?'The availability check took too long. Try again; no visit has changed.':error.message,true);}}
    finally{clearTimeout(timeout);if(run===sequence){checking=false;controller=null;controls();}}
  }
  $('visitFindTimes').addEventListener('click',find);
  $('visitDate').addEventListener('change',function(){if(!context||context.pending)return;if(checking){clear('Date changed. Check available times for this date.');return;}if(valid()){fillWindows($('visitDate').value,'');note('Choose a checked available time, or check again for this date.');}else clear('Check available times for this date.');});
  document.addEventListener('mc:visit-open',function(event){cancel();context=event.detail;snapshot=null;saving=false;root.hidden=!context.canChange||context.pending;$('visitAvailableTimes').replaceChildren();if(!context.pending){emptyWindows();note('Find a free time before choosing an arrival window.');}controls();});
  document.addEventListener('mc:visit-busy',function(event){saving=event.detail.busy;if(context)context.pending=event.detail.pending;if(saving){cancel();}controls();});
  document.addEventListener('mc:visit-availability-invalid',function(){if(context){context.pending=false;root.hidden=false;clear('The schedule may have changed. Check available times again.');}});
  document.addEventListener('mc:desk',function(event){data=event.detail;if(context&&dialog.open&&data.configurationRevision!==context.configurationRevision){clear('Your business rules changed. Close this visit and refresh its details before checking times.');$('visitFindTimes').disabled=true;}});
  document.addEventListener('mc:session-expired',function(){clear();context=null;root.hidden=true;});
  dialog.addEventListener('close',function(){clear();context=null;});
  $('visitChangeForm').addEventListener('submit',function(event){if(context&&!context.pending&&(!valid()||!snapshot.openings.some(function(day){return day.date===$('visitDate').value&&day.windows.includes($('visitWindow').value);} ))){event.preventDefault();event.stopImmediatePropagation();clear('Check available times and choose a listed opening before saving.');$('visitFindTimes').focus();}},true);
})();
