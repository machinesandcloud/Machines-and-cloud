import {getClient} from './lib/store.mjs';
import {json} from './lib/agent.mjs';
import {supportedWorkspace} from './lib/workspace-identity.mjs';
import {receiveThumbtackNotification,LeadConnectionError} from './lib/lead-connections.mjs';

export const config={path:'/api/thumbtack/self-serve'};
export default async req=>{
  const headers={'Cache-Control':'no-store'};
  if(req.method!=='POST')return json({error:'method_not_allowed'},405,headers);
  const client=await getClient(new URL(req.url).searchParams.get('c')||'');
  if(!client)return json({error:'not_found'},404,headers);
  if(!supportedWorkspace(client))return json({error:'unsupported_workspace'},409,headers);
  try{return json(await receiveThumbtackNotification(req,client),200,headers);}
  catch(error){return json({error:error instanceof LeadConnectionError?error.code:'notification_save_unconfirmed',message:error instanceof LeadConnectionError?error.message:'The notification save is unconfirmed. Retry the same event.'},error instanceof LeadConnectionError?error.status:503,headers);}
};
