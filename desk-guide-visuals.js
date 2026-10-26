/* Instructional scenes only. These illustrations never represent saved service status. */
(() => {
  'use strict';
  const ns = 'http://www.w3.org/2000/svg';
  let sequence = 0;
  const icons = {
    web: '<rect x="-12" y="-10" width="24" height="20" rx="3"/><path d="M-12-3h24M-7-6h.1M-3-6h.1"/>',
    phone: '<path d="M-8-12h5l3 7-4 3a19 19 0 0 0 7 7l3-4 7 3v5c0 3-3 5-6 4C-4 10-12 2-13-7c-1-3 1-5 5-5Z"/>',
    sms: '<path d="M-12-10h24v17H-4l-8 6V-10Z"/><path d="M-6-4H6M-6 1h8"/>',
    calendar: '<rect x="-12" y="-10" width="24" height="23" rx="3"/><path d="M-7-14v7M7-14v7M-12-2h24M-6 4h.1M0 4h.1M6 4h.1M-6 9h.1M0 9h.1"/>',
    person: '<circle cy="-6" r="5"/><path d="M-11 13v-3a11 11 0 0 1 22 0v3"/>',
    check: '<path d="m-8 0 5 5L9-7"/>',
    shield: '<path d="m0-14 12 5v9c0 8-12 15-12 15S-12 8-12 0v-9Z"/><path d="m-5-1 4 4 7-8"/>',
    inbox: '<path d="M-12-9h24v21h-24Z"/><path d="m-12 3 7 0 3 4h4l3-4h7"/>',
    clock: '<circle r="13"/><path d="M0-7v8l6 3"/>',
    code: '<path d="m-6-8-8 8 8 8M6-8l8 8-8 8M3-12-3 12"/>',
    rules: '<path d="M-11-13h22v26h-22ZM-6-5h12M-6 1h12M-6 7h7"/>',
    link: '<path d="m-3-6 3-3a8 8 0 0 1 11 11l-5 5M3 6 0 9A8 8 0 0 1-11-2l5-5M-5 5 5-5"/>'
  };
  const icon = (name, x, y, className = '') => `<g class="gvis-icon ${className}" transform="translate(${x} ${y})">${icons[name] || icons.rules}</g>`;
  const check = (x,y) => `<g class="gvis-confirm" transform="translate(${x} ${y})"><circle r="12"/>${icon('check',0,0,'gvis-check')}</g>`;
  const line = (x,y,w,className='') => `<rect class="gvis-line ${className}" x="${x}" y="${y}" width="${w}" height="5" rx="2.5"/>`;
  const panel = (x,y,w,h,content,className='') => `<g class="${className}"><rect class="gvis-panel" x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/>${content}</g>`;
  const browser = (x,y,w,h,content) => panel(x,y,w,h,`<path class="gvis-divider" d="M${x} ${y+20}h${w}"/><g class="gvis-browser-dots"><circle cx="${x+12}" cy="${y+10}" r="2"/><circle cx="${x+20}" cy="${y+10}" r="2"/><circle cx="${x+28}" cy="${y+10}" r="2"/></g>${content}`);
  const badge = (name,x,y) => `<g transform="translate(${x} ${y})"><rect class="gvis-icon-bg" x="-22" y="-22" width="44" height="44" rx="11"/>${icon(name,0,0)}</g>`;
  const route = (y=94,x=159,w=76) => `<path class="gvis-route" d="M${x} ${y}h${w}"/><path class="gvis-arrow" d="m${x+w-5} ${y-4} 5 4-5 4"/><circle class="gvis-travel" cx="${x+3}" cy="${y}" r="4" style="--gvis-travel:${w-6}px"/>`;
  const record = (x,y,{person=false,checkmark=true}={}) => panel(x,y,127,106,`${badge(person?'person':'inbox',x+28,y+29)}${line(x+58,y+19,51)}${line(x+58,y+31,37)}<path class="gvis-divider" d="M${x+15} ${y+58}h97"/>${line(x+15,y+71,88)}${line(x+15,y+83,65)}${checkmark?check(x+111,y+92):''}`,'gvis-result');
  const phone = (x,y,content) => panel(x,y,74,130,`<rect class="gvis-phone-camera" x="${x+27}" y="${y+8}" width="20" height="3" rx="1.5"/><path class="gvis-divider" d="M${x+28} ${y+119}h18"/>${content}`);
  const bubble = (x,y,w,h,side='left',className='') => `<g class="gvis-bubble ${className}"><path d="M${x+7} ${y}h${w-14}a7 7 0 0 1 7 7v${h-14}a7 7 0 0 1-7 7H${x+(side==='left'?8:w-14)}l${side==='left'?'-8 6v-6':'6 6v-6'}H${x+7}a7 7 0 0 1-7-7V${y+7}a7 7 0 0 1 7-7Z"/>${line(x+10,y+10,w-20)}${h>29?line(x+10,y+20,w-34):''}</g>`;
  const scenes = {
    prepare: {
      title: 'Choose services once',
      description: 'Illustration: website chat, phone, text and Calendar choices collect into one shared workspace.',
      markup: () => `${panel(20,24,131,142,`${badge('web',55,61)}${badge('phone',116,61)}${badge('sms',55,125)}${badge('calendar',116,125)}${check(71,78)}${check(132,142)}`,'gvis-source')}${route()}${record(250,42,{person:true})}`
    },
    profile: {
      title: 'One business profile, shared across services',
      description: 'Illustration: your business answers flow into the shared instructions used by phone, text and website chat.',
      markup: () => `${panel(23,34,129,123,`${icon('person',46,60)}${line(66,51,63)}${line(66,63,44)}<path class="gvis-divider" d="M38 84h99"/>${line(38,98,95)}${line(38,112,78)}${line(38,126,87)}`,'gvis-source')}${route()}${panel(249,23,130,143,`${badge('rules',278,55)}${line(308,44,49)}${line(308,57,35)}${line(264,91,98)}${line(264,104,77)}${icon('web',273,143)}${icon('phone',314,143)}${icon('sms',355,143)}`,'gvis-result')}`
    },
    practice: {
      title: 'See a question become useful job details',
      description: 'Illustration: a customer question and front-desk reply produce an organized request to review.',
      markup: () => `${browser(18,27,154,137,`${bubble(32,61,105,35,'left','gvis-source')}${bubble(55,109,103,34,'right','gvis-reply')}`)}${route(94,181,53)}${record(249,43)}`
    },
    website: {
      title: 'Add chat to your website',
      description: 'Illustration: the installation snippet places a front-desk chat entry on a business website.',
      markup: () => `${panel(20,56,91,78,`${icon('code',65,95)}`,'gvis-source')}${route(94,121,55)}${browser(192,21,188,147,`<rect class="gvis-website-photo" x="207" y="55" width="64" height="67" rx="5"/>${line(283,60,78)}${line(283,73,61)}${line(283,86,69)}<rect class="gvis-website-button" x="283" y="104" width="63" height="16" rx="4"/><g class="gvis-result">${bubble(254,128,107,27,'right')}${icon('sms',234,143)}</g>`)}`
    },
    phone: {
      title: 'A call becomes an organized request',
      description: 'Illustration: a customer call reaches the front desk, which collects the job details for your workspace.',
      markup: () => `${phone(19,30,`${icon('phone',56,92,'gvis-source')}`)}${route(95,104,45)}<g class="gvis-reply">${badge('sms',196,95)}<path class="gvis-agent-wave" d="M182 129h3m5 0h3m5 0h3m5 0h3"/></g>${route(95,234,27)}${record(271,42)}`
    },
    sms: {
      title: 'Keep the text and the job details together',
      description: 'Illustration: a two-way text conversation is organized into a request, with the conversation retained.',
      markup: () => `${phone(30,30,`${bubble(39,53,47,29,'left','gvis-source')}${bubble(42,94,50,30,'right','gvis-reply')}`)}${route(94,122,106)}${record(249,42)}`
    },
    calendar: {
      title: 'Give permission, then choose available time',
      description: 'Illustration: your permission connects Calendar, so an appointment can use a free time slot. This does not represent a granted permission.',
      markup: () => `${panel(21,39,129,115,`${badge('shield',85,78)}${line(47,116,77)}${line(58,128,55)}`,'gvis-source')}${route()}${panel(249,24,130,142,`<path class="gvis-divider" d="M249 57h130M279 25v13M348 25v13"/><path class="gvis-calendar-grid" d="M264 83h100M264 108h100M264 133h100M288 69v81M314 69v81M340 69v81"/><rect class="gvis-slot gvis-result" x="291" y="88" width="45" height="16" rx="4"/>${check(354,143)}`)}`
    },
    thumbtack: {
      title: 'Bring a lead into your requests',
      description: 'Illustration: a lead from your selected platform flows into one inbox, where you can review the customer and reply.',
      markup: () => platformScene()
    },
    angi: {
      title: 'Bring a lead into your requests',
      description: 'Illustration: a lead from your selected platform flows into one inbox, where you can review the customer and reply.',
      markup: () => platformScene()
    },
    waiting: {
      title: 'Keep your place while setup continues',
      description: 'Illustration: saved setup stays in place while an outside check is pending. A clock marks the wait, not completion.',
      markup: () => `${panel(24,42,128,108,`${badge('rules',54,72)}${line(83,61,50)}${line(83,74,33)}${line(39,107,97)}${line(39,122,74)}`,'gvis-source')}${route(95,164,56)}${panel(241,34,134,124,`${badge('clock',308,82)}<circle class="gvis-wait-dot" cx="287" cy="131" r="3"/><circle class="gvis-wait-dot" cx="308" cy="131" r="3"/><circle class="gvis-wait-dot" cx="329" cy="131" r="3"/>`,'gvis-result')}`
    },
    ready: {
      title: 'Find the next customer request in your workspace',
      description: 'Illustration: customer conversations collect into an organized inbox. Your actual service status appears in the guide text.',
      markup: () => `<g class="gvis-source">${badge('web',49,44)}${badge('phone',49,95)}${badge('sms',49,146)}<path class="gvis-join" d="M81 44h25v102H81M106 95h39"/></g>${route(95,155,78)}${record(249,42)}`
    }
  };
  function platformScene() {
    return `${browser(19,28,138,135,`${badge('person',49,76)}${line(80,65,57)}${line(80,78,37)}${line(34,113,107)}${line(34,127,82)}`)}${route()}${record(249,42,{checkmark:false})}`;
  }
  function render(kind) {
    const key = Object.hasOwn(scenes,kind) ? kind : 'prepare';
    const scene = scenes[key];
    const id = `mc-guide-visual-${++sequence}`;
    return `<div class="guide-visual guide-visual-${key}" data-guide-visual="${key}"><svg xmlns="${ns}" class="guide-visual-scene" viewBox="0 0 400 190" role="img" aria-labelledby="${id}-title ${id}-desc" focusable="false"><title id="${id}-title">${scene.title}</title><desc id="${id}-desc">${scene.description}</desc><path class="gvis-baseline" d="M20 177h360"/>${scene.markup()}</svg></div>`;
  }
  window.MCSetupVisuals = Object.freeze({render});
})();
