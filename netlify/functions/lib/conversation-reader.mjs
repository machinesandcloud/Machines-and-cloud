// Read-only owner pagination. Cursors bind one immutable snapshot, conversation and
// workspace incarnation; neither query parameters nor stored paths confer authority.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { strictRead, normalizeAccountEmail } from './accounts.mjs';
import { supportedWorkspace, workspaceTenant } from './workspace-identity.mjs';
import { assertCurrentWorkspace, conversationReference, readConversationArchive, readArchivedMessages, ConversationHistoryError } from './store.mjs';
const fail = (code, message, status = 409) => { throw new ConversationHistoryError(code, message, status); };
const PAGE = 20;
async function owner(client, session) {
  const [current, access] = await Promise.all([strictRead('clients', client.slug), session?.sessionHash ? strictRead('access_sessions', session.sessionHash) : null]);
  if (!access || access.scope !== 'onboarding' || access.status !== 'active' || !Number.isFinite(Date.parse(access.expiresAt)) || Date.parse(access.expiresAt) <= Date.now() || normalizeAccountEmail(access.email) !== normalizeAccountEmail(session?.email)) fail('verification_required', 'Sign in again to open this conversation.', 401);
  if (!supportedWorkspace(current) || workspaceTenant(current) !== workspaceTenant(client) || normalizeAccountEmail(current.owner?.email) !== normalizeAccountEmail(access.email)) fail('forbidden', 'This conversation is not available in this workspace.', 403);
  return current;
}
function signature(client, text) { return createHmac('sha256', client.ownerKey).update('conversation-page-v1\0'+workspaceTenant(client)+'\0'+text).digest('hex'); }
function cursor(client, data) { const text=Buffer.from(JSON.stringify(data)).toString('base64url'); return text+'.'+signature(client,text); }
function decode(client, text, ref, total) {
  if (typeof text !== 'string' || text.length > 700 || !/^[a-zA-Z0-9_-]+\.[a-f0-9]{64}$/.test(text)) fail('invalid_conversation_page','Reload this conversation before opening earlier messages.',400);
  const [body, signed]=text.split('.'), expected=signature(client,body);
  if(!timingSafeEqual(Buffer.from(signed),Buffer.from(expected)))fail('invalid_conversation_page','Reload this conversation before opening earlier messages.',400);
  let data; try{data=JSON.parse(Buffer.from(body,'base64url').toString());}catch{fail('invalid_conversation_page','Reload this conversation before opening earlier messages.',400);}
  if(data.v!==1||data.ref!==ref||data.tenant!==workspaceTenant(client)||!Number.isInteger(data.upper)||data.upper<0||data.upper>total||!Number.isInteger(data.before)||data.before<0||data.before>data.upper)fail('invalid_conversation_page','Reload this conversation before opening earlier messages.',400);
  return data;
}
export async function ownerConversationPage(client, session, {reference, contact, page = null}) {
  const current=await owner(client,session);
  if(!/^[a-f0-9]{64}$/.test(reference||'')||!(/^[a-zA-Z0-9_-]{1,60}$/).test(contact||'')||reference!==conversationReference(current,'web',contact))fail('invalid_conversation','Choose a saved website conversation.',400);
  const conv=await readConversationArchive(current,'web',contact),total=conv.history?.total??conv.messages.length;
  const snapshot=page===null?{v:1,ref:reference,tenant:workspaceTenant(current),upper:total,before:total}:decode(current,page,reference,total);
  const start=Math.max(0,snapshot.before-PAGE),messages=await readArchivedMessages(conv,start,snapshot.before);
  await owner(current,session); await assertCurrentWorkspace(current);
  return {ok:true,conversation:{reference,channel:'web',contact,updatedAt:conv.updatedAt||conv.createdAt,complete:conv.history?.complete===true,boundary:conv.history?.complete===true?'Saved from the start of this conversation.':'Earlier messages may not have been retained before saved history was upgraded.',total:snapshot.upper,start,end:snapshot.before,messages,next:start?cursor(current,{...snapshot,before:start}):null,previous:snapshot.before<snapshot.upper?cursor(current,{...snapshot,before:Math.min(snapshot.upper,snapshot.before+PAGE)}):null}};
}
