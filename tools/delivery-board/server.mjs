import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';

const base = dirname(fileURLToPath(import.meta.url));
const source = resolve(process.env.MC_DELIVERY_SOURCE || '/Users/stevengoumnai/Desktop/Repositories/machines-and-cloud/product/LAUNCH-CONTROL.json');
const port = Number(process.env.MC_DELIVERY_PORT || 4573);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid board port');
const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
const assets = new Map([['/', ['index.html','text/html']], ['/board.css',['board.css','text/css']], ['/board.js',['board.js','text/javascript']], ['/render.js',['render.js','text/javascript']], ['/format.js',['format.js','text/javascript']]]);
const statuses = new Set(['ready','active','blocked','awaiting_review','awaiting_integration','verified','deferred']);
const safe = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g,' ').slice(0,4000) : '';
const list = (value,max=100) => Array.isArray(value) ? value.slice(0,max) : [];
function project(raw) {
  const b = raw.deliveryBoard;
  if (!b || b.version !== 1 || !Array.isArray(b.tasks) || !Array.isArray(b.teams)) throw new Error('Task board is not configured');
  const teams = b.teams.map(t => ({id:safe(t.id),name:safe(t.name || t.label),lead:safe(t.lead || t.owner),description:safe(t.description || t.responsibility)}));
  const ids = new Set(teams.map(t=>t.id));
  const tasks = list(b.tasks,500).map(t => {
    if (!t.id || !statuses.has(t.status) || !ids.has(t.teamId)) throw new Error('Invalid task record');
    return Object.fromEntries([
      ...['id','title','outcome','teamId','owner','reviewer','status','priority','environment','sourceCommit','releaseStatus','nextAction','blocker','updatedAt'].map(k=>[k,safe(t[k])]),
      ['acceptance',list(t.acceptance).map(safe)],
      ['evidence',list(t.evidence).map(e=>({label:safe(e.label),path:/^(?:product|qa-artifacts|scratchpad)\/[A-Za-z0-9_./-]+$/.test(e.path || '') && !e.path.split('/').includes('..') ? e.path : '',sha256:/^[a-f0-9]{64}$/.test(e.sha256 || '')?e.sha256:'',summary:safe(e.summary)}))],
      ['history',list(t.history,200).map(e=>({at:safe(e.at),status:statuses.has(e.status)?e.status:'',note:safe(e.note)}))]
    ]);
  });
  if (new Set(tasks.map(t=>t.id)).size!==tasks.length) throw new Error('Duplicate task identity');
  return {version:1,updatedAt:safe(b.updatedAt),teams,tasks,capacity:{maximumActiveAgents:Number(b.capacity?.maximumActiveAgents)||4,executionMode:'session'},production:{commit:/^[a-f0-9]{40}$/.test(raw.production?.commit||'')?raw.production.commit:'',launchDecision:safe(typeof raw.launchDecision==='string'?raw.launchDecision:raw.launchDecision?.state || raw.launchDecision?.status || 'Not accepted for full launch')}};
}

const server = http.createServer(async (req,res) => {
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Cache-Control','no-store');
  if (!hosts.has(req.headers.host)) {res.writeHead(403);return res.end('Unsupported host');}
  if (req.headers.origin && ![...hosts].some(h=>req.headers.origin===`http://${h}`)) {res.writeHead(403);return res.end('Unsupported origin');}
  if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405,{Allow:'GET, HEAD'});return res.end('Read-only board');}
  let path;try {path=new URL(req.url,`http://127.0.0.1:${port}`).pathname;}catch{res.writeHead(400);return res.end('Invalid address');}
  try {
    if (path==='/api/board') {
      const data = project(JSON.parse(await readFile(source,'utf8')));
      const revision=createHash('sha256').update(JSON.stringify(data)).digest('hex');
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
      return res.end(req.method==='HEAD'?undefined:JSON.stringify({...data,revision,observedAt:new Date().toISOString()}));
    }
    const asset=assets.get(path);
    if (!asset) {res.writeHead(404);return res.end('Not found');}
    const body=await readFile(resolve(base,asset[0]));
    res.writeHead(200,{'Content-Type':`${asset[1]}; charset=utf-8`});
    res.end(req.method==='HEAD'?undefined:body);
  } catch {
    res.writeHead(503,{'Content-Type':'application/json; charset=utf-8'});
    res.end(JSON.stringify({error:'Task records are temporarily unavailable. Your last view is retained; retry shortly.'}));
  }
});
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  server.listen(port,'127.0.0.1',()=>console.log(`Delivery board: http://127.0.0.1:${port}`));
}
export {project};
