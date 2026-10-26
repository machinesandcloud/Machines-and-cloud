import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { SafeError, SERVICE_IDS, VIEWS, WorkspaceReader } from './workspace.js';
import { PREPARATION_CHANNELS, SetupPreparer } from './preparation.js';
import { INFORMATION_SERVICES, ServiceInformation } from './service-information.js';

const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const stepSchema = z.object({ id: z.string(), label: z.string(), detail: z.string(), state: z.enum(['complete','current','waiting','upcoming']), actor: z.enum(['customer','platform','provider']), reviewUrl: z.string() });
const guideSchema = z.object({ overview: z.string(), automationSummary: z.string(), steps: z.array(stepSchema) });
const informationSchema = z.object({entry:z.enum(['assistant','secure_workspace','provider_workspace']),canSave:z.boolean(),complete:z.boolean().nullable(),needsReview:z.boolean(),fields:z.array(z.object({id:z.string(),inputKey:z.string().nullable(),label:z.string(),required:z.boolean(),provided:z.boolean(),options:z.array(z.string())})),missingFields:z.array(z.string()),nextActor:z.enum(['customer','platform','provider','complete'])});
const serviceSchema = z.object({ id: z.enum(SERVICE_IDS), label: z.string(), status: z.string(), requested: z.boolean(), retained: z.boolean(), active: z.boolean(), detail: z.string(), nextStep: z.string(), guideAvailable: z.boolean(), reviewUrl: z.string(), guide: guideSchema.optional(), information:informationSchema, ownerActionNeeded: z.boolean().optional(), capabilities: z.object({ receiveLeads: z.boolean(), receiveMessages: z.boolean(), sendNativeReplies: z.boolean() }).optional() });
const snapshotSchema = z.object({
  observedAt: z.string(), mode: z.literal('read_only'), summary: z.string(),
  nextAction: z.object({ label: z.string(), reviewUrl: z.string() }),
  services: z.array(serviceSchema),
  discovery: z.array(z.object({ id: z.string(), label: z.string(), fit: z.string(), connectionMode: z.string(), availability: z.string(), detail: z.string() }))
});
const answer = (value: Record<string, unknown>) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value) }], structuredContent: value
});
function failure(error: unknown) {
  const safe = error instanceof SafeError ? error : new SafeError('read_failed', 'The setup read could not be completed. Open your workspace.');
  return { content: [{ type: 'text' as const, text: safe.message }], isError: true };
}

export function createServer(reader: WorkspaceReader, preparer?: SetupPreparer, information?: ServiceInformation): McpServer {
  let changing=false, unresolved:'preparation'|'information'|null=null;
  async function change<T extends {state:string}>(kind:'preparation'|'information',work:()=>Promise<T>):Promise<T>{
    if(changing)throw new SafeError('save_in_progress','A setup change is being checked. Wait for its result before another change.');
    if(unresolved&&unresolved!==kind)throw new SafeError('operation_uncertain','Check the earlier uncertain setup operation before changing another setup area.');
    changing=true;
    try{const result=await work();unresolved=result.state==='uncertain'?kind:null;return result;}finally{changing=false;}
  }
  const server = new McpServer({ name: 'machines-and-cloud-mcp-server', version: '0.3.0' }, {
    maxToolInputElements: 12,
    instructions: (preparer ? 'Initial setup preparation is enabled. Preview choices, obtain explicit confirmation, then save the matching preview. It only saves service choices and the exact website origin; it cannot grant access, activate, buy or send. Unknown saves are checked without repeating them. ' : '') + (information ? 'Service information drafts are enabled. Reuse saved fields marked provided; ask only missing information and obtain confirmation of the supplied changes. Save an exact immutable preview. Never request passwords, codes, EIN or registration details in chat; use the secure workspace. An uncertain save is checked, never repeated. ' : '') + 'Optional setup assistance. Provided means present, not validated: if information.needsReview is true, open its workspace review rather than treating the fields as complete. These tools cannot connect accounts, approve access, activate services, send messages, buy leads or open a browser. Use returned review links for the owner to inspect the existing workspace. Credentials and retained private connection details are never tool output. Discovery entries are possibilities, not active integrations.'
  });
  server.registerTool('mc_get_setup_status', {
    title: 'Read current setup status',
    description: 'Read a fresh sanitized six-service setup plan for the configured owner. Includes missing field IDs/labels, which fields are already provided, who acts next, current guides and discovery options. Reuse saved facts instead of asking again. No customer records or retained private field values.',
    inputSchema: z.object({}).strict(), outputSchema: snapshotSchema, annotations
  }, async () => { try { return answer(await reader.snapshot()); } catch (error) { return failure(error); } });
  server.registerTool('mc_get_service_guide', {
    title: 'Read a service setup guide',
    description: 'Read the current backend guide for one website, phone, texting, Calendar, Thumbtack or Angi service. A guide does not authorize or perform setup.',
    inputSchema: z.object({ serviceId: z.enum(SERVICE_IDS).describe('An existing workspace service, not a new discovery connector.') }).strict(),
    outputSchema: z.object({ observedAt: z.string(), service: serviceSchema }), annotations
  }, async ({ serviceId }) => {
    try {
      const snapshot = await reader.snapshot(), service = snapshot.services.find(row => row.id === serviceId);
      if (!service?.guideAvailable) throw new SafeError('guide_unavailable', 'This service guide is not available on the current workspace version. Open Connections to review its current status.');
      return answer({ observedAt: snapshot.observedAt, service });
    } catch (error) { return failure(error); }
  });
  server.registerTool('mc_get_workspace_link', {
    title: 'Get a workspace review link',
    description: 'Verify current owner access and return a fixed workspace review URL for a listed view. Returns a link only; never opens a browser or embeds credentials.',
    inputSchema: z.object({ view: z.enum(VIEWS).default('setup').describe('The existing workspace view to review.') }).strict(),
    outputSchema: z.object({ reviewUrl: z.string(), requiresBrowserSignIn: z.literal(true) }), annotations
  }, async ({ view }) => {
    try { await reader.snapshot(); return answer({ reviewUrl: reader.link(view), requiresBrowserSignIn: true }); }
    catch (error) { return failure(error); }
  });
  if (preparer) {
    const preparationSchema = z.object({ state: z.enum(['preview', 'saved', 'uncertain']), previewId: z.string(),
      desiredChannels: z.array(z.enum(PREPARATION_CHANNELS)), website: z.string().optional(), websiteOrigin: z.string().nullable().optional(),
      expiresAt: z.string(), detail: z.string(), reviewUrl: z.string() });
    server.registerTool('mc_preview_connection_setup', {
      title: 'Preview initial service preparation',
      description: 'Preview an initial owner setup patch for the configured workspace, without saving. Includes only supplied choices. Omit website to preserve it; blank clears the business URL and retains existing origin permissions. A supplied HTTPS website adds its exact origin when website chat is selected. It cannot connect or activate services.',
      inputSchema: z.object({ desiredChannels: z.array(z.enum(PREPARATION_CHANNELS)).max(4).refine(rows => new Set(rows).size === rows.length), website: z.string().max(300).optional() }).strict(),
      outputSchema: preparationSchema, annotations
    }, async args => { try { return answer(await change('preparation',()=>preparer.preview(args))); } catch (error) { return failure(error); } });
    server.registerTool('mc_save_connection_setup', {
      title: 'Save confirmed initial service preparation',
      description: 'Save the exact immutable preview only after the owner confirms it. Makes at most one fixed preparation POST per preview, with fresh owner access and revision checks. Repeated calls only reconcile that operation. An uncertain result is not success; review the workspace. Account grants, charges, registration, installation and activation are not authorized.',
      inputSchema: z.object({ previewId: z.string().regex(/^[a-f0-9]{32}$/), confirm: z.literal(true) }).strict(),
      outputSchema: preparationSchema,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true }
    }, async ({ previewId, confirm }) => { try { return answer(await change('preparation',()=>preparer.save(previewId, confirm))); } catch (error) { return failure(error); } });
  }
  if (information) {
    const resultSchema=z.object({state:z.enum(['preview','saved','uncertain']),previewId:z.string(),serviceId:z.enum(INFORMATION_SERVICES),changedFields:z.array(z.object({id:z.string(),label:z.string(),value:z.string()})),expiresAt:z.string(),detail:z.string(),reviewUrl:z.string()});
    server.registerTool('mc_preview_service_information', {
      title:'Preview connection information',
      description:'Preview supplied website preferences, phone routing or an optional Google account hint, without saving. Only fields the owner supplied are changed; saved defaults are reused. Phone/email values are masked in output. This drafts information and never grants access, applies routing, installs chat, purchases or activates service.',
      inputSchema:z.object({serviceId:z.enum(INFORMATION_SERVICES),fields:z.object({
        website:z.string().max(300).optional().describe('web only: public HTTPS website without query, credentials or fragment; blank clears this draft field.'),
        builder:z.enum(['wordpress','wix','squarespace','webflow','shopify','other']).optional().describe('web only: website platform.'),
        installationBy:z.enum(['me','web_person']).optional().describe('web only: me means owner; web_person means the owner’s website manager or agency.'),
        forwardingMode:z.enum(['forward_business_line','use_new_number']).optional().describe('voice only: keep an existing business line, or prepare a new number request.'),
        businessNumber:z.string().max(40).optional().describe('voice only: existing US business line, distinct from contact cell.'),
        carrier:z.enum(['att','verizon','tmobile','voip','other']).optional().describe('voice only: existing business phone provider.'),
        forwarding:z.enum(['missed','all','none']).optional().describe('voice only: missed or all for an existing line; none for a new-number draft.'),
        ownerPhone:z.string().max(40).optional().describe('voice only: US contact cell; omit to reuse its saved value.'),
        accountEmail:z.string().max(254).optional().describe('calendar only: optional Google sign-in hint; never a password, code or access grant.')
      }).strict().refine(value=>Object.keys(value).length>0&&Object.keys(value).length<=5,'Supply one to five fields for the chosen service.').describe('Use the inputKey/options from setup status: web permits website/builder/installationBy; voice permits forwardingMode/businessNumber/carrier/forwarding/ownerPhone; calendar permits accountEmail. Omit provided fields to retain them.')}).strict(),
      outputSchema:resultSchema,annotations
    },async args=>{try{return answer(await change('information',()=>information.preview(args)));}catch(error){return failure(error);}});
    server.registerTool('mc_save_service_information', {
      title:'Save confirmed connection information',
      description:'Save the exact immutable connection-information preview after owner confirmation. Uses existing protected encrypted portal drafts and selects that service. Rechecks current access and revision; repeated confirmation checks the same receipt without repeating its POST. Legal registration, provider consent, costs, routing application and activation remain in the workspace.',
      inputSchema:z.object({previewId:z.string().regex(/^[a-f0-9]{32}$/),confirm:z.literal(true)}).strict(),outputSchema:resultSchema,
      annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:true,openWorldHint:true}
    },async({previewId,confirm})=>{try{return answer(await change('information',()=>information.save(previewId,confirm)));}catch(error){return failure(error);}});
  }
  return server;
}
