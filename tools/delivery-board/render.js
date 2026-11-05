import {groups,labels,el,date,release,teamName,filtered,pill} from './format.js';
function card(t,data,open){
  const b=el('button',`task-card state-${t.status}`);b.type='button';b.dataset.task=t.id;b.dataset.focusKey=`task:${t.id}`;
  const head=el('span','card-meta');head.append(el('span','task-id',t.id),el('span','priority',t.priority));b.append(head,el('strong','task-title',t.title));
  b.append(el('span','team-label',teamName(data,t.teamId)));
  if(t.blocker)b.append(el('span','card-blocker',t.blocker));
  if(t.status==='deferred'||t.status==='awaiting_integration')b.append(pill(t.status));
  const foot=el('span','card-foot');foot.append(el('span','owner',t.owner),el('span','release-label',release(t.releaseStatus)));b.append(foot);b.addEventListener('click',()=>open(t.id));return b;
}
export function board(data,state,open){
  const root=el('div','kanban');const tasks=filtered(data,state);
  for(const g of groups){
    const column=el('section','column');column.dataset.column=g.id;
    const list=tasks.filter(t=>g.states.includes(t.status));const h=el('div','column-heading');h.append(el('h2',null,g.label),el('span','count',String(list.length)));column.append(h);
    const lane=el('div','lane');for(const t of list)lane.append(card(t,data,open));
    if(!list.length)lane.append(el('p','empty-column',state.q?'No matching tasks.':g.description));column.append(lane);root.append(column);
  }
  return root;
}
export function teams(data,state,openTeam){
  const root=el('div','teams-list');
  for(const team of data.teams){
    const section=el('section','team-row');const tasks=data.tasks.filter(t=>t.teamId===team.id);
    const intro=el('div');intro.append(el('h2',null,team.name),el('p',null,team.description||'Shared ownership within the current delivery plan.'));
    const owner=el('div','team-owner');owner.append(el('strong',null,team.lead||'CTO coordinates assignment'),el('span',null,tasks.some(t=>t.status==='active')?'Has active work':'No active card'));
    const button=el('button','text-button',`${tasks.length} ${tasks.length===1?'task':'tasks'}`);button.dataset.focusKey=`team-open:${team.id}`;button.addEventListener('click',()=>openTeam(team.id));section.append(intro,owner,button);root.append(section);
  }return root;
}
export function activity(data,state,open){
  const entries=filtered(data,state).flatMap(t=>t.history.map(h=>({...h,task:t}))).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
  const root=el('div','activity-list');
  if(!entries.length)root.append(el('p','empty-state','No recorded activity matches this view.'));
  for(const entry of entries){const row=el('article','activity-row');const text=el('div');const link=el('button','text-button',`${entry.task.id} · ${entry.task.title}`);link.dataset.focusKey=`activity:${entry.task.id}:${entry.at}:${entry.status}`;link.addEventListener('click',()=>open(entry.task.id));text.append(link,el('p',null,entry.note));row.append(pill(entry.status),text,el('time',null,date(entry.at)));root.append(row);}return root;
}
export function detail(t,data,back){
  const root=el('article','task-detail');const nav=el('button','text-button back-button','← Back to board');nav.dataset.focusKey='task-back';nav.addEventListener('click',back);root.append(nav);
  const heading=el('div','detail-heading');heading.append(pill(t.status),el('span','task-id',t.id),el('span','priority',t.priority));root.append(heading,el('h2','detail-title',t.title),el('p','outcome',t.outcome));
  root.querySelector('.detail-title').dataset.focusKey=`task-title:${t.id}`;
  const facts=el('dl','facts');for(const [label,value] of [['Team',teamName(data,t.teamId)],['Owner',t.owner],['Reviewer',t.reviewer],['Environment',t.environment],['Release',release(t.releaseStatus)],['Source',t.sourceCommit?t.sourceCommit.slice(0,12):'Not yet frozen']]){const row=el('div');row.append(el('dt',null,label),el('dd',null,value||'Not assigned'));facts.append(row);}root.append(facts);
  if(t.blocker){const b=el('section','detail-blocker');b.append(el('h3',null,'What is blocking this'),el('p',null,t.blocker));root.append(b);}
  const next=el('section','detail-next');next.append(el('h3',null,'Next action'),el('p',null,t.nextAction||'The owner will record the next action.'));root.append(next);
  const acceptance=el('section');acceptance.append(el('h3',null,'Acceptance criteria'));const ul=el('ul','criteria');for(const a of t.acceptance)ul.append(el('li',null,a));if(!t.acceptance.length)ul.append(el('li',null,'Criteria have not been recorded.'));acceptance.append(ul);root.append(acceptance);
  const evidence=el('section');evidence.append(el('h3',null,'Verification evidence'));
  if(!t.evidence.length)evidence.append(el('p','muted','No evidence has been attached yet.'));
  for(const e of t.evidence){const row=el('div','evidence-row');row.append(el('strong',null,e.label),el('p',null,e.summary));if(e.path)row.append(el('code','evidence-path',e.path));if(e.sha256)row.append(el('small','muted',`SHA-256 ${e.sha256}`));evidence.append(row);}root.append(evidence);
  const history=el('section');history.append(el('h3',null,'Recorded history'));for(const h of [...t.history].reverse()){const row=el('div','history-row');row.append(el('time','muted',date(h.at)),pill(h.status),el('p',null,h.note));history.append(row);}if(!t.history.length)history.append(el('p','muted','No status history recorded.'));root.append(history);return root;
}
