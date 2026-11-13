(function(){
  'use strict';
  var root=document.getElementById('workspaceBilling');if(!root)return;
  var $=function(id){return document.getElementById(id);},data=null,state=null,review=null,busy=false,reading=false,epoch=0,currentToken=null,checkoutRequestId=null,checkoutUncertain=false,cancelUncertain=false,portalRequestId=null,statusUncertain=false;
  var base=(document.querySelector('meta[name="mc-api-base"]')?.content||'').replace(/\/$/,'');
  // desk.js keeps the signed-in session in memory once it is read at load, so billing keeps working when the browser
  // later blocks storage. While storage can be read it stays the identity check: a removed or different session there
  // stops billing for good. Expiry clears it for good; sign-out clears it unless storage still holds the original.
  function storedSession(){try{return sessionStorage.getItem('mc-onboarding-session-v1');}catch{return undefined;}}
  var loaded=storedSession()||null,owner=loaded,revoked=!loaded;
  function session(){var stored=storedSession();if(stored!==undefined&&stored!==loaded)revoked=true;if(revoked)return null;if(!owner&&stored===loaded)owner=loaded;return owner;}
  // An interrupted, unreadable or server-error reply is an unknown outcome: say so and offer the saved status check.
  var unknownText={read:'We couldn’t confirm your billing status. Nothing was changed here. Check payment status to try again.',refresh:'We couldn’t confirm your billing status. Nothing was changed here. Check payment status to try again.',review:'We couldn’t confirm your monthly offer. Nothing was charged. Check payment status, then review the offer again.',portal:'We couldn’t confirm the secure payment link, so payment details were not opened. Check payment status, then open payment details again.'};
  function unknown(code){return Object.assign(new Error(unknownText.read),{uncertain:true,code:code||'billing_response_unconfirmed'});}
  function isRecord(value){return value!==null&&typeof value==='object'&&!Array.isArray(value);}
  // Require the fields consumed by the renderer before replacing the last confirmed snapshot.
  function isBillingView(value){
    return isRecord(value)&&typeof value.status==='string'&&value.status.length>0
      &&(!Object.prototype.hasOwnProperty.call(value,'availablePlans')
        ||Array.isArray(value.availablePlans)&&value.availablePlans.every(function(plan){
          return isRecord(plan)&&typeof plan.id==='string'&&typeof plan.name==='string'
            &&Number.isSafeInteger(plan.amountCents)&&plan.amountCents>=0;
        }));
  }
  function isOfferReview(value){
    var offer=value?.offer,terms=offer?.terms;
    return isRecord(value)
      &&typeof value.reviewId==='string'&&value.reviewId.length>0
      &&typeof value.expiresAt==='string'&&Number.isFinite(Date.parse(value.expiresAt))
      &&isRecord(offer)&&typeof offer.name==='string'
      &&Number.isSafeInteger(offer.amountCents)&&offer.amountCents>=0
      &&Array.isArray(offer.services)&&offer.services.length>0
      &&offer.services.every(function(service){return typeof service==='string';})
      &&typeof offer.limitsDescription==='string'
      &&isRecord(terms)&&typeof terms.text==='string'&&typeof terms.url==='string'
      &&typeof offer.livemode==='boolean';
  }
  function validSuccessPayload(body,result){
    var action=body?.action;
    if(!action||['refresh','checkout','cancel_renewal'].includes(action))return isBillingView(result.billing);
    if(action==='review')return isOfferReview(result.review);
    if(action==='portal')return isRecord(result.portal)&&typeof result.portal.url==='string';
    return true;
  }
  function valid(generation,token){return generation===epoch&&token===session()&&currentToken===token&&root.isConnected;}
  function note(text,error){$('billingMessage').textContent=text;$('billingMessage').dataset.error=error?'true':'false';}
  function money(cents){return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(cents/100);}
  function date(value){try{return new Intl.DateTimeFormat('en-US',{dateStyle:'medium'}).format(new Date(value));}catch{return 'the end of your paid period';}}
  function checkoutURL(value){try{var url=new URL(value);return url.protocol==='https:'&&url.hostname==='checkout.stripe.com'&&!url.username&&!url.password&&!url.port?url.href:null;}catch{return null;}}
  var capacityUnits=[['voiceMinutes','voice','Call minutes'],['smsSegments','sms','Text segments'],['aiAnswers','sms','AI text replies']];
  function capacityOfferText(offer){
    if(!Object.prototype.hasOwnProperty.call(offer,'capacity'))return '';
    var capacity=offer.capacity,limits=capacity?.limits;
    if(capacity?.version!==1||capacity.period!=='paid_invoice'||!limits||capacityUnits.some(function(unit){return !Number.isSafeInteger(limits[unit[0]])||limits[unit[0]]<0;}))throw new Error('The included usage could not be confirmed. Check the offer again before continuing.');
    var included=capacityUnits.filter(function(unit){return offer.services.includes(unit[1]);}).map(function(unit){return new Intl.NumberFormat('en-US').format(limits[unit[0]])+' '+unit[2].toLowerCase();});
    if(!included.length)return '';
    return 'Included each paid billing period: '+included.join(', ')+'. Call legs round up separately; long texts may use several segments. AI text replies count when delivered.';
  }
  function renderCapacity(){
    var panel=$('billingCapacity'),usage=state?.capacity,rows=$('billingCapacityRows'),selected=Array.isArray(state?.services)?state.services:[];rows.replaceChildren();panel.hidden=!usage?.metered||!capacityUnits.some(function(unit){return selected.includes(unit[1]);});if(panel.hidden)return;
    $('billingCapacityPeriod').textContent=usage.period?'From '+date(usage.period.start*1000)+' to '+date(usage.period.end*1000)+'.':'';
    $('billingCapacityState').textContent=!usage.funded?'Payment needs confirmation before this period’s allowance can be used.':!usage.allowed?(data?.client?.status==='paused'?'Your front desk is paused. Recorded usage is kept.':'Your front desk is stopped. Recorded usage is kept.'):'';
    if(!usage.units)return;
    capacityUnits.filter(function(unit){return selected.includes(unit[1]);}).forEach(function(unit){
      var values=usage.units[unit[0]];if(!values||['used','held','remaining'].some(function(key){return !Number.isSafeInteger(values[key])||values[key]<0;})){$('billingCapacityState').textContent='Usage could not be confirmed. Check payment status to try again.';return;}
      var item=document.createElement('section'),title=document.createElement('h5'),metrics=document.createElement('dl');item.className='billing-capacity-row';title.textContent=unit[2];metrics.className='billing-capacity-metrics';
      [['used','Used'],['held','Reserved'],['remaining','Remaining']].forEach(function(metric){var cell=document.createElement('div'),label=document.createElement('dt'),amount=document.createElement('dd');label.textContent=metric[1];amount.textContent=new Intl.NumberFormat('en-US').format(values[metric[0]]);cell.append(label,amount);metrics.appendChild(cell);});item.append(title,metrics);rows.appendChild(item);
    });
  }
  // The plan the owner chose during setup is a saved preference, not a subscription. Say which one it is and what
  // happens next, without implying a payment or an activation. The node is created here so desk.html is unchanged.
  var preferenceNode=document.createElement('p');preferenceNode.id='billingPreference';preferenceNode.className='billing-preference';preferenceNode.hidden=true;$('billingSummary').insertAdjacentElement('afterend',preferenceNode);
  var preferenceNames={starter:'Coverage',growth:'Follow-through',pro:'Pro'};
  function renderPreference(subscribed,waiting){
    var plan=data?.client?.plan,name=preferenceNames[plan],price=Number.isFinite(data?.plan?.price)&&name?data.plan.price:null;
    preferenceNode.hidden=!state||subscribed||waiting;if(preferenceNode.hidden){preferenceNode.textContent='';return;}
    // Workspaces created before planChoice existed had Follow-through preselected, so their saved plan may not be a choice.
    var explicit=data?.client?.onboarding?.planChoice===1,noted=name?(price?name+', $'+price+'/month':name):'';
    var chosen=name&&explicit?'Preferred plan: '+noted+'. Not started: no payment has been taken and this choice does not activate any service.':name?'Plan noted at setup: '+noted+'. It may have been preselected for you. Not started: no payment has been taken and nothing was activated.':'Preferred plan: Not chosen yet. Saving your workspace did not choose a paid plan for you.';
    var next=state.offerAvailable?' Next: review the monthly offer below before entering any payment details.':' Next: paid service is not offered for this workspace yet. When it is, you’ll review the services, included usage and monthly terms here before entering any payment details.';
    preferenceNode.textContent=chosen+next;
  }
  function clearSnapshot(){state=null;review=null;$('billingCancel').close();['billingTerms','billingReviewTitle','billingScope','billingLimits','billingMessage','billingCapacityPeriod','billingCapacityState','billingCancelDetail'].forEach(function(id){$(id).textContent='';});$('billingTermsLink').removeAttribute('href');$('billingAgree').checked=false;$('billingCapacity').hidden=true;$('billingCapacityRows').replaceChildren();$('billingOfferForm').hidden=true;$('billingReview').hidden=true;['billingContinue','billingPortal','billingEnd'].forEach(function(id){$(id).hidden=true;});$('billingContinue').href='#';$('billingRefresh').hidden=false;$('billingStatus').textContent='Checking saved status';$('billingSummary').textContent='Checking this workspace’s plan and billing.';preferenceNode.hidden=true;preferenceNode.textContent='';}
  function controls(){root.setAttribute('aria-busy',busy?'true':'false');root.querySelectorAll('button,input,select').forEach(function(el){el.disabled=busy;});$('billingKeep').disabled=busy;$('billingEndConfirm').disabled=busy;}
  async function request(body){var token=session(),generation=epoch,controller=new AbortController(),timeout;if(!token||token!==currentToken)throw Object.assign(new Error('Sign in again to manage billing. Nothing was sent.'),{notSent:true});timeout=setTimeout(function(){controller.abort();},15000);try{var response;try{response=await fetch(base+'/api/workspace-billing?c='+encodeURIComponent(data.client.slug),{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:controller.signal});}catch{if(!valid(generation,token))throw Object.assign(new Error('This billing view changed.'),{stale:true});throw unknown('billing_response_interrupted');}if(!valid(generation,token))throw Object.assign(new Error('This billing view changed.'),{stale:true});if(response.status===401||response.status===403){document.dispatchEvent(new CustomEvent('mc:session-expired'));throw Object.assign(new Error('Sign in again to manage billing.'),{stale:true});}var result;try{result=await response.json();}catch{if(!valid(generation,token))throw Object.assign(new Error('This billing view changed.'),{stale:true});throw unknown('billing_response_unreadable');}if(!valid(generation,token))throw Object.assign(new Error('This billing view changed.'),{stale:true});if(response.status>=500||!response.ok&&response.status<400||!result||typeof result!=='object'||Array.isArray(result))throw unknown(result?.error);if(!response.ok||result.error)throw Object.assign(new Error(result.message||'Billing could not be confirmed. Check its saved status before trying again.'),{code:result.error});if(!validSuccessPayload(body,result))throw unknown('billing_response_shape_unconfirmed');return result;}finally{clearTimeout(timeout);}}
  function render(){
    if(!state)return;
    var subscribed=state.status!=='none'&&!['canceled','incomplete_expired'].includes(state.status),renewalWaiting=cancelUncertain||['pending','uncertain'].includes(state.cancellationState),waiting=checkoutUncertain||state.checkout&&['pending','uncertain'].includes(state.checkout.state),fundingWaiting=state.livemode===true&&subscribed&&state.serviceFunding?.paid===false;
    $('billingStatus').textContent=fundingWaiting?'Payment needs confirmation':subscribed?state.cancelAtPeriodEnd?'Renewal ends '+date(state.currentPeriodEnd):renewalWaiting?'Renewal cancellation pending':state.status==='active'?'Subscription active':state.status==='past_due'||state.status==='unpaid'?'Payment needs attention':state.status.replace(/_/g,' '):state.status==='canceled'?'Subscription ended':state.status==='incomplete_expired'?'Checkout expired':'No subscription started';
    $('billingSummary').textContent=subscribed?(state.name||'Your subscription')+(state.currentPeriodEnd?' · Current period ends '+date(state.currentPeriodEnd):'')+'.':waiting?'Your checkout request is saved. Check payment status before starting another.':state.status==='canceled'?'This subscription has ended.':state.status==='incomplete_expired'?'Checkout expired before the subscription started.':'Your workspace is free to prepare. You review the full paid offer before entering payment details.';
    if(state.livemode===true&&['paused','cancelled','archived'].includes(data.client.status))$('billingSummary').textContent+=data.client.status==='paused'?' Your front desk is paused. Payment confirmation does not resume it.':' Your front desk is stopped. Payment confirmation does not restart it.';
    if(fundingWaiting)$('billingSummary').textContent+=' Payment for this service period needs confirmation. Your free workspace and website chat are kept. Check payment status or open payment details.';
    if(state.cancellationState&&state.cancellationState!=='complete')$('billingSummary').textContent+=' Your request to end renewal is saved; confirmation is being checked.';
    $('billingOfferForm').hidden=subscribed||!state.offerAvailable||waiting||state.checkout?.state==='open';
    var select=$('billingPlan'),selected=select.value;select.replaceChildren();(state.availablePlans||[]).forEach(function(plan){var option=document.createElement('option');option.value=plan.id;option.textContent=plan.name+' · '+money(plan.amountCents)+'/month';select.appendChild(option);});if([].some.call(select.options,function(option){return option.value===selected;}))select.value=selected;else if(data.client.onboarding?.planChoice===1&&['starter','growth'].includes(data.client.plan)&&[].some.call(select.options,function(option){return option.value===data.client.plan;}))select.value=data.client.plan;
    var url=checkoutURL(state.checkout?.url);$('billingContinue').hidden=!url;$('billingContinue').href=url||'#';$('billingEnd').hidden=!subscribed||state.cancelAtPeriodEnd||renewalWaiting;$('billingPortal').hidden=!state.portalAvailable;$('billingReview').hidden=!review||waiting;$('billingRefresh').hidden=!state.checkout&&!subscribed&&!checkoutUncertain&&!cancelUncertain&&!statusUncertain;
    renderPreference(subscribed,waiting);
    renderCapacity();
    controls();
  }
  async function read(){if(reading||busy||!data||!currentToken)return;reading=true;var generation=epoch;try{var result=await request();if(generation!==epoch)return;if(!result.billing||typeof result.billing!=='object')throw unknown();state=result.billing;render();}catch(error){if(!error.stale&&generation===epoch){if(error.uncertain){statusUncertain=true;$('billingRefresh').hidden=false;}note(error.uncertain?unknownText.read:error.message,true);}}finally{if(generation===epoch)reading=false;}}
  async function action(body,task){if(busy||!data||!currentToken)return;var generation=epoch;busy=true;controls();try{await task(await request(body));}catch(error){if(!error.stale&&generation===epoch){if(error.notSent){note(error.message,true);}else if(body.action==='checkout'){checkoutUncertain=true;render();note('Checkout could not be confirmed. Your request may already be saved. Check payment status before continuing.',true);}else if(body.action==='cancel_renewal'){cancelUncertain=true;$('billingCancel').close();render();note('Your renewal request could not be confirmed. It may already be saved. Check payment status before trying again.',true);}else if(error.uncertain){statusUncertain=true;$('billingRefresh').hidden=false;note(unknownText[body.action]||unknownText.read,true);}else {if(body.action==='portal'&&error.code==='billing_portal_expired')portalRequestId=null;note(error.message,true);}$('billingMessage').focus({preventScroll:true});}}finally{if(generation===epoch){busy=false;controls();}}}
  document.addEventListener('mc:desk',function(event){var next=event.detail;if(next?.client?.onboarding?.version!==1||!session()){root.hidden=true;return;}var token=session();if(data?.client?.slug!==next.client.slug||currentToken!==token){checkoutRequestId=null;checkoutUncertain=false;cancelUncertain=false;statusUncertain=false;portalRequestId=null;clearSnapshot();}if(data?.client?.slug!==next.client.slug||data?.configurationRevision!==next.configurationRevision||data?.client?.status!==next.client.status||currentToken!==token){review=null;$('billingReview').hidden=true;$('billingAgree').checked=false;epoch++;busy=false;reading=false;}data=next;currentToken=token;root.hidden=false;controls();read();});
  function clear(){epoch++;data=null;currentToken=null;owner=null;revoked=true;checkoutRequestId=null;checkoutUncertain=false;cancelUncertain=false;statusUncertain=false;portalRequestId=null;busy=false;reading=false;clearSnapshot();root.hidden=true;}
  document.addEventListener('mc:session-expired',clear);
  $('deskSignOut')?.addEventListener('click',function(){if($('accountServiceControls')?.getAttribute('aria-busy')==='true')return;epoch++;currentToken=null;owner=null;review=null;busy=false;reading=false;$('billingReview').hidden=true;$('billingCancel').close();},true);
  $('billingOfferForm').addEventListener('submit',function(event){event.preventDefault();if(busy)return;review=null;$('billingReview').hidden=true;$('billingAgree').checked=false;note('Checking your service and monthly offer…');action({action:'review',plan:$('billingPlan').value,expectedRevision:data.configurationRevision},function(result){var offer=result.review.offer,capacityText=capacityOfferText(offer);review=result.review;$('billingReviewTitle').textContent=offer.name+' · '+money(offer.amountCents)+'/month';$('billingScope').textContent='Your services: '+offer.services.map(function(service){return {web:'Website chat',voice:'Phone answering',sms:'Text messaging',calendar:'Google Calendar'}[service];}).join(', ')+'.';$('billingLimits').textContent=(capacityText?capacityText+'\n\n':'')+offer.limitsDescription;$('billingTerms').textContent=offer.terms.text;$('billingTermsLink').href=offer.terms.url;$('billingMode').hidden=offer.livemode!==false;$('billingAgree').checked=false;$('billingReview').hidden=false;note('Review the monthly renewal and service terms below.');$('billingReviewTitle').focus({preventScroll:true});});});
  $('billingCheckoutForm').addEventListener('submit',function(event){event.preventDefault();if(!review)return;if(!$('billingAgree').checked){note('Please agree to the reviewed monthly price and service terms to continue.',true);$('billingAgree').focus();return;}var bytes=new Uint8Array(16);crypto.getRandomValues(bytes);var id=state?.checkout?.requestId||checkoutRequestId||Array.from(bytes).map(function(value){return value.toString(16).padStart(2,'0');}).join('');checkoutRequestId=id;note('Preparing secure checkout…');action({action:'checkout',reviewId:review.reviewId,requestId:id,acceptedTerms:true,expectedRevision:data.configurationRevision},function(result){state=result.billing;checkoutUncertain=false;render();var url=checkoutURL(state.checkout?.url);if(url)location.assign(url);else note('Your checkout request is saved. Check payment status before trying again.',true);});});
  $('billingRefresh').addEventListener('click',function(){note('Checking payment status…');action({action:'refresh'},function(result){if(!result.billing||typeof result.billing!=='object')throw unknown();state=result.billing;checkoutUncertain=false;cancelUncertain=false;statusUncertain=false;review=null;render();note(state.livemode===true&&state.serviceFunding?.paid===false?'Saved billing status checked. Payment for this service period needs confirmation.':state.cancelAtPeriodEnd?'Renewal cancellation confirmed. Your subscription ends '+date(state.currentPeriodEnd)+'.':['pending','uncertain'].includes(state.cancellationState)?'Your request to end renewal is saved. Confirmation is still being checked.':state.status==='active'?'Payment confirmed. Your subscription is active.':'Saved payment status updated.');});});
  $('billingPortal').addEventListener('click',function(){if(!portalRequestId){var bytes=new Uint8Array(16);crypto.getRandomValues(bytes);portalRequestId=Array.from(bytes).map(function(value){return value.toString(16).padStart(2,'0');}).join('');}note('Opening secure payment details…');action({action:'portal',requestId:portalRequestId},function(result){var url;try{url=new URL(result.portal.url);}catch{throw new Error('The secure payment link could not be confirmed.');}if(url.protocol!=='https:'||url.hostname!=='billing.stripe.com'||url.username||url.password||url.port)throw new Error('The secure payment link could not be confirmed.');location.assign(url.href);});});
  $('billingEnd').addEventListener('click',function(){$('billingCancelDetail').textContent='End monthly renewal? Your current subscription period ends '+date(state.currentPeriodEnd)+'. Saved customer records are kept. This does not request a refund.';$('billingCancel').showModal();$('billingKeep').focus();});
  function closeCancel(){if(busy)return;$('billingCancel').close();$('billingEnd').focus();}
  $('billingKeep').addEventListener('click',closeCancel);$('billingCancel').addEventListener('cancel',function(event){if(busy)event.preventDefault();});
  $('billingEndConfirm').addEventListener('click',function(){var bytes=new Uint8Array(16);crypto.getRandomValues(bytes);var id=Array.from(bytes).map(function(value){return value.toString(16).padStart(2,'0');}).join('');note('Saving your request to end renewal…');action({action:'cancel_renewal',requestId:id,confirmed:true},function(result){state=result.billing;$('billingCancel').close();render();note(state.cancelAtPeriodEnd?'Renewal ends '+date(state.currentPeriodEnd)+'.':'Your request is saved. Confirmation is being checked automatically.');$('billingMessage').focus({preventScroll:true});});});
})();
