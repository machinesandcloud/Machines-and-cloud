import { recoverWorkspaceBilling } from './lib/workspace-billing.mjs';
import { atomicUpdate } from './lib/store.mjs';
export const config={schedule:'*/10 * * * *'};
export default async()=>{const at=new Date().toISOString();let result;try{result=await recoverWorkspaceBilling({limit:3});}catch{result={ok:false,visited:0,outcomes:[{state:'unconfirmed'}]};}await atomicUpdate('health','workspaceBilling:lastRun',()=>({value:{at,...result}}));return Response.json({at,...result},{status:result.ok?200:503,headers:{'Cache-Control':'no-store'}});};
