import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { SafeError, SERVICE_IDS, VIEWS, WorkspaceReader } from './workspace.js';

const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const stepSchema = z.object({ id: z.string(), label: z.string(), detail: z.string(), state: z.enum(['complete','current','waiting','upcoming']), actor: z.enum(['customer','platform','provider']), reviewUrl: z.string() });
const guideSchema = z.object({ overview: z.string(), automationSummary: z.string(), steps: z.array(stepSchema) });
const serviceSchema = z.object({ id: z.enum(SERVICE_IDS), label: z.string(), status: z.string(), requested: z.boolean(), retained: z.boolean(), active: z.boolean(), detail: z.string(), nextStep: z.string(), guideAvailable: z.boolean(), reviewUrl: z.string(), guide: guideSchema.optional(), ownerActionNeeded: z.boolean().optional(), capabilities: z.object({ receiveLeads: z.boolean(), receiveMessages: z.boolean(), sendNativeReplies: z.boolean() }).optional() });
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

export function createServer(reader: WorkspaceReader): McpServer {
  const server = new McpServer({ name: 'machines-and-cloud-mcp-server', version: '0.1.0' }, {
    maxToolInputElements: 8,
    instructions: 'Optional read-only setup assistance. These tools cannot connect accounts, approve access, activate services, send messages, buy leads or open a browser. Use returned review links for the owner to inspect the existing workspace. Credentials and provider setup details are never tool output. Discovery entries are possibilities, not active integrations.'
  });
  server.registerTool('mc_get_setup_status', {
    title: 'Read current setup status',
    description: 'Read a fresh sanitized setup plan for the one configured owner workspace. Includes current service guides and discovery options; no customer records or private connection details.',
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
  return server;
}
