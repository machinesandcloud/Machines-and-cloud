import { recoverThumbtackConnections } from './lib/thumbtack-connection.mjs';
import { atomicUpdate } from './lib/store.mjs';
export const config={schedule:'*/10 * * * *'};
export default async()=>{
  const at=new Date().toISOString();let result;
  try{result={at,...await recoverThumbtackConnections({limit:1,deadlineAt:Date.now()+15000})};}
  catch{result={at,examined:0,recovered:0,error:'thumbtack_recovery_unconfirmed'};}
  await atomicUpdate('health','leadConnections:lastRun',previous=>!previous||previous.at<=at?{value:result}:{});
  return Response.json(result,{status:result.error?503:200,headers:{'Cache-Control':'no-store'}});
};
