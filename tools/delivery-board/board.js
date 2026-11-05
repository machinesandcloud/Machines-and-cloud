import {el,date,labels,teamName} from './format.js';
import {board,teams,activity,detail} from './render.js';
const $=s=>document.querySelector(s), content=$('#content');
let data=null,pending=false,lastRevision='',focusTask='';
const state={view:'board',team:'',q:'',task:''};
function readURL(){const q=new URLSearchParams(location.search);state.view=['board','teams','activity'].includes(q.get('view'))?q.get('view'):'board';state.team=q.get('team')||'';state.q=q.get('q')||'';state.task=q.get('task')||'';$('#search').value=state.q;}
function navigate(changes,replace=false){Object.assign(state,changes);const p=new URLSearchParams();for(const [k,v]of Object.entries(state))if(v&&!(k==='view'&&v==='board'))p.set(k,v);history[replace?'replaceState':'pushState']({},'',`${location.pathname}${p.size?'?'+p:''}`);render();}
function openTask(id){focusTask=id;navigate({task:id});content.querySelector('h2')?.focus();}
function back(){navigate({task:'',view:'board'});(content.querySelector(`[data-task="${CSS.escape(focusTask)}"]`)||$('#main')).focus();}
function render(){
  if(!data)return;
  const positions=new Map([...content.querySelectorAll('[data-task]')].map(n=>[n.dataset.task,n.getBoundingClientRect()]));
  const focused=document.activeElement?.dataset?.focusKey;
  const nav=$('#team-nav');nav.replaceChildren();
  for(const team of [{id:'',name:'All teams'},...data.teams]){const b=el('button',`team-button${state.team===team.id?' selected':''}`);b.type='button';b.dataset.focusKey=`team-filter:${team.id}`;b.setAttribute('aria-pressed',String(state.team===team.id));b.append(el('span',null,team.name),el('span','team-count',String(data.tasks.filter(t=>!team.id||t.teamId===team.id).length)));b.addEventListener('click',()=>navigate({team:team.id,task:''}));nav.append(b);}
  const select=$('#team-select');select.replaceChildren();for(const team of [{id:'',name:'All teams'},...data.teams]){const o=el('option',null,team.name);o.value=team.id;select.append(o);}select.value=state.team;
  for(const b of document.querySelectorAll('[data-view]'))b.setAttribute('aria-pressed',String(b.dataset.view===state.view));
  $('#scope-label').textContent=state.team?teamName(data,state.team):'All teams';
  $('#board-note').hidden=!!state.task;
  const task=data.tasks.find(t=>t.id===state.task);
  if(state.task&&!task){const p=el('div','empty-state');p.append(el('h2',null,'This task is no longer in the current board'));const b=el('button','text-button','Back to board');b.addEventListener('click',back);p.append(b);content.replaceChildren(p);}
  else content.replaceChildren(task?detail(task,data,back):state.view==='teams'?teams(data,state,id=>navigate({team:id,view:'board',task:''})):state.view==='activity'?activity(data,state,openTask):board(data,state,openTask));
  content.setAttribute('aria-busy','false');
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches)for(const n of content.querySelectorAll('[data-task]')){const old=positions.get(n.dataset.task);if(old){const r=n.getBoundingClientRect();if(Math.abs(old.x-r.x)+Math.abs(old.y-r.y)>2)n.animate([{transform:`translate(${old.x-r.x}px,${old.y-r.y}px)`},{transform:'translate(0,0)'}],{duration:240,easing:'cubic-bezier(.16,1,.3,1)'});}}
  content.querySelector('.detail-title')?.setAttribute('tabindex','-1');
  if(focused)document.querySelector(`[data-focus-key="${CSS.escape(focused)}"]`)?.focus({preventScroll:true});
  $('#capacity').textContent=`Up to ${data.capacity.maximumActiveAgents} active agents, including the CTO.`;
  $('#production').textContent=data.production.commit?`Production ${data.production.commit.slice(0,8)}`:'';
  $('#source-time').textContent=`Task records updated ${date(data.updatedAt)}`;
}
async function refresh(){
  if(pending)return;pending=true;$('#refresh').disabled=true;
  try{
    const response=await fetch('/api/board',{cache:'no-store'});if(!response.ok)throw new Error('unavailable');const next=await response.json();if(!Array.isArray(next.tasks)||!Array.isArray(next.teams))throw new Error('invalid');
    if(next.revision!==lastRevision){const previous=new Map((data?.tasks||[]).map(t=>[t.id,t.status]));const changes=next.tasks.filter(t=>previous.has(t.id)&&previous.get(t.id)!==t.status);data=next;lastRevision=next.revision;render();if(changes.length)$('#update-announcement').textContent=changes.slice(0,3).map(t=>`${t.id} moved to ${labels[t.status]}`).join('. ');}
    $('#error').hidden=true;$('#connection').textContent='Board synced';$('#connection').className='connected';
  }catch{
    $('#error').textContent='Task records could not be refreshed. Your last view is still here. Retrying automatically; you can also press Refresh.';$('#error').hidden=false;$('#connection').textContent='Refresh delayed';$('#connection').className='delayed';content.setAttribute('aria-busy','false');
    if(!data)content.replaceChildren(el('p','empty-state','The board is waiting for its task records. Refresh will retry without losing this page.'));
  }finally{pending=false;$('#refresh').disabled=false;}
}
$('#refresh').addEventListener('click',refresh);
$('#search').addEventListener('input',e=>navigate({q:e.target.value,task:''},true));
$('#team-select').addEventListener('change',e=>navigate({team:e.target.value,task:''}));
for(const b of document.querySelectorAll('[data-view]'))b.addEventListener('click',()=>navigate({view:b.dataset.view,task:''}));
window.addEventListener('popstate',()=>{const previousTask=state.task;readURL();render();if(previousTask&&!state.task){focusTask=previousTask;(content.querySelector(`[data-task="${CSS.escape(previousTask)}"]`)||$('#main')).focus();}else if(state.task)content.querySelector('.detail-title')?.focus();});
readURL();refresh();setInterval(()=>{if(!document.hidden)refresh();},2500);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
