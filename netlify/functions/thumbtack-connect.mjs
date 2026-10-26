import { completeThumbtackConnection } from './lib/thumbtack-connection.mjs';
export const config={path:'/api/thumbtack/connect'};
export default async req=>{
  if(req.method!=='GET')return new Response('Method not allowed',{status:405,headers:{'Cache-Control':'no-store'}});
  const url=new URL(req.url);
  if([...url.searchParams.keys()].some(key=>!['state','code','error','error_description','scope'].includes(key))||['state','code','error'].some(key=>url.searchParams.getAll(key).length>1))return new Response('Invalid authorization response',{status:400,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
  try{const result=await completeThumbtackConnection({state:url.searchParams.get('state'),code:url.searchParams.get('code'),error:url.searchParams.get('error')});return new Response(null,{status:303,headers:{Location:`https://machinesandcloud.com/desk?c=${encodeURIComponent(result.slug)}&connection=thumbtack#setup`,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});}
  catch{return new Response('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Check your Thumbtack connection</title><body><main><h1>Your Thumbtack connection needs another look.</h1><p>Return to your workspace to review this connection and continue. Your saved requests are kept.</p><a href="https://machinesandcloud.com/onboard.html">Return to your workspace</a></main></body></html>',{status:409,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'none'; frame-ancestors 'none'; base-uri 'none'"}});}
};
