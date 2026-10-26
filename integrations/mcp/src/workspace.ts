export const VIEWS = ['setup', 'know', 'test', 'leads', 'convs', 'availability', 'today', 'account'] as const;
export const SERVICE_IDS = ['web', 'voice', 'sms', 'calendar', 'thumbtack', 'angi'] as const;
export type View = typeof VIEWS[number];
export type ServiceId = typeof SERVICE_IDS[number];
type JsonObject = Record<string, unknown>;

const LABELS: Record<ServiceId, string> = {
  web: 'Website chat', voice: 'Phone answering', sms: 'Text messages',
  calendar: 'Google Calendar', thumbtack: 'Thumbtack', angi: 'Angi'
};
const DISCOVERY = {
  google_local_services_ads: 'Google Local Services Ads', yelp: 'Yelp quote requests',
  meta_messaging: 'Facebook & Instagram messages', houzz: 'Houzz Pro',
  nextdoor: 'Nextdoor', porch: 'Porch'
} as const;
const STEP_STATES = new Set(['complete', 'current', 'waiting', 'upcoming']);
const ACTORS = new Set(['customer', 'platform', 'provider']);
const DISCOVERY_MODES = new Set(['google_ads_api', 'partner_api_or_bridge', 'messaging_api', 'lead_import', 'external_handoff', 'inbound_delivery_research']);
const DISCOVERY_AVAILABILITY = new Set(['research', 'partner_required']);
const STATUSES = new Set(['needs_action', 'not_selected', 'closed', 'paused', 'limited', 'active',
  'waiting_platform', 'ready_for_website', 'connected', 'cleanup_pending', 'cleanup_uncertain',
  'cancel_pending', 'cancelled', 'waiting_carrier', 'checking', 'needs_attention', 'working',
  'disconnected', 'partner_required', 'receiving', 'not_connected', 'unknown']);
const FOCUS_VIEWS: Record<string, View> = {
  business: 'know', selection: 'setup', connection: 'setup', verification: 'setup',
  inbox: 'leads', schedule: 'availability'
};
const OMITTED = '[Private connection details omitted; review in your workspace.]';
const MAX_RESPONSE_BYTES = 1_048_576;
const object = (value: unknown): JsonObject | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;

export class SafeError extends Error {
  constructor(readonly code: string, message: string, readonly status?: number) { super(message); }
}
const invalidConfig = () => new SafeError('configuration_invalid',
  'Review MC_WORKSPACE_URL and MC_OWNER_BEARER. Use your existing workspace URL and current owner session.');

export type Configuration = Readonly<{ origin: string; slug: string; bearer: string }>;
export function readConfiguration(env: NodeJS.ProcessEnv): Configuration {
  const raw = env.MC_WORKSPACE_URL, bearer = env.MC_OWNER_BEARER;
  if (!raw || raw.length > 400 || !bearer || !/^[A-Za-z0-9._~-]{20,4096}$/.test(bearer)) throw invalidConfig();
  let url: URL;
  try { url = new URL(raw); } catch { throw invalidConfig(); }
  const production = url.origin === 'https://machinesandcloud.com';
  const loopback = env.MC_MCP_ALLOW_LOOPBACK === '1' &&
    ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) &&
    ['http:', 'https:'].includes(url.protocol);
  if ((!production && !loopback) || url.username || url.password ||
      !['/desk', '/desk.html'].includes(url.pathname) ||
      [...url.searchParams.keys()].some(key => key !== 'c') ||
      url.searchParams.getAll('c').length !== 1 ||
      (url.hash && !VIEWS.includes(url.hash.slice(1) as View))) throw invalidConfig();
  const slug = url.searchParams.get('c')!;
  if (!/^[a-z0-9][a-z0-9-]{1,99}$/.test(slug)) throw invalidConfig();
  return Object.freeze({ origin: url.origin, slug, bearer });
}

export function workspaceLink(config: Configuration, view: View): string {
  if (!VIEWS.includes(view)) throw new SafeError('view_invalid', 'Choose a listed workspace view.');
  const url = new URL('/desk', config.origin);
  url.searchParams.set('c', config.slug);
  url.hash = view;
  return url.href;
}

// Collect private values solely to remove accidental interpolation from the
// allowlisted public guidance. The original DTO is never a tool result.
function privateValues(dto: JsonObject, bearer: string): string[] {
  const values = new Set<string>([bearer]);
  const walk = (value: unknown, path: string, depth: number): void => {
    if (depth > 12) return;
    if (Array.isArray(value)) { value.slice(0, 400).forEach(item => walk(item, path, depth + 1)); return; }
    const row = object(value);
    if (!row) return;
    for (const [key, child] of Object.entries(row)) {
      const location = path + '.' + key;
      if (typeof child === 'string' && child.length >= 3 &&
          (/email|phone|address|secret|token|password|authorization|api.?key|webhook|endpoint|^key$/i.test(key) ||
           /customer_name|businessName/i.test(key) || (key === 'name' && /owner|business|client|customer/i.test(path)))) {
        values.add(child);
        if (key === 'name') child.split(/\s+/).filter(part => part.length >= 3).forEach(part => values.add(part));
      }
      walk(child, location, depth + 1);
    }
  };
  walk(dto, '', 0);
  return [...values].sort((a, b) => b.length - a.length);
}

function cleaner(dto: JsonObject, bearer: string) {
  const privateStrings = privateValues(dto, bearer);
  return (value: unknown, limit = 1200): string => {
    if (typeof value !== 'string') return '';
    let text = value.trim();
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) return OMITTED;
    for (const secret of privateStrings) text = text.split(secret).join('[redacted]');
    return text
      .replace(/\b(?:https?:\/\/|www\.)[^\s<>"']+/gi, '[link omitted]')
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email omitted]')
      .replace(/(?:\+?\d[\d ().-]{6,}\d)/g, '[number omitted]')
      .replace(/\bBearer\s+\S+/gi, '[credential omitted]')
      .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[identifier omitted]').slice(0, limit);
  };
}

export type SafeGuide = {
  overview: string; automationSummary: string;
  steps: { id: string; label: string; detail: string; state: string; actor: string; reviewUrl: string }[];
};
export type SafeService = {
  id: ServiceId; label: string; status: string; requested: boolean; retained: boolean;
  active: boolean; detail: string; nextStep: string; guideAvailable: boolean;
  reviewUrl: string; guide?: SafeGuide;
  capabilities?: { receiveLeads: boolean; receiveMessages: boolean; sendNativeReplies: boolean };
  ownerActionNeeded?: boolean;
  information: SafeInformation;
};
export type SafeInformation = {
  entry: 'assistant' | 'secure_workspace' | 'provider_workspace';
  canSave: boolean; complete: boolean | null;
  needsReview: boolean;
  fields: { id: string; inputKey: string | null; label: string; required: boolean; provided: boolean; options: string[] }[];
  missingFields: string[];
  nextActor: 'customer' | 'platform' | 'provider' | 'complete';
};
export type SafeSnapshot = {
  observedAt: string; mode: 'read_only'; summary: string;
  nextAction: { label: string; reviewUrl: string };
  services: SafeService[];
  discovery: { id: string; label: string; fit: string; connectionMode: string; availability: string; detail: string }[];
};

function project(dto: JsonObject, config: Configuration): SafeSnapshot {
  const client = object(dto.client), setup = object(dto.setup), journey = object(setup?.connectionJourney);
  if (!client || client.slug !== config.slug || !journey || !Array.isArray(journey.channels)) {
    throw new SafeError('setup_unavailable', 'The authenticated setup plan is unavailable. Open your workspace and check your current sign-in.');
  }
  const clean = cleaner(dto, config.bearer);
  const guide = (value: unknown): SafeGuide | undefined => {
    const row = object(value);
    if (!row || !Array.isArray(row.steps)) return undefined;
    const steps = row.steps.slice(0, 12).flatMap((value, index) => {
      const step = object(value);
      if (!step || !STEP_STATES.has(String(step.state)) || !ACTORS.has(String(step.actor))) return [];
      return [{
        id: 'step_' + (index + 1), label: clean(step.label, 160), detail: clean(step.detail),
        state: String(step.state), actor: String(step.actor),
        reviewUrl: workspaceLink(config, step.id === 'practice' ? 'test' : FOCUS_VIEWS[String(step.focus)] || 'setup')
      }];
    });
    return { overview: clean(row.overview), automationSummary: clean(row.automationSummary), steps };
  };
  const rows = [...journey.channels, ...(Array.isArray(journey.leadSources) ? journey.leadSources : [])];
  const intake = object(dto.serviceIntake);
  const fieldLabels: Record<string, string> = {
    'web.preferences.website':'Business website', 'web.preferences.builder':'Website platform', 'web.preferences.installationBy':'Who manages the website',
    'voice.routing.forwardingMode':'New number or existing business line', 'voice.routing.businessNumber':'Existing business line',
    'voice.routing.carrier':'Business phone provider', 'voice.routing.forwarding':'When to answer calls', 'voice.routing.ownerPhone':'Contact cell',
    'calendar.preferences.accountEmail':'Google account preference (optional)',
    'sms.business.legalName':'Registered business name','sms.business.ein':'Business EIN','sms.business.businessType':'Business type',
    'sms.business.street':'Business street address','sms.business.city':'Business city','sms.business.state':'Business state',
    'sms.business.zip':'Business ZIP code','sms.business.website':'Business website',
    'sms.representative.firstName':'Representative first name','sms.representative.lastName':'Representative last name',
    'sms.representative.email':'Representative email','sms.representative.phone':'Representative phone',
    'sms.representative.title':'Representative title','sms.representative.jobPosition':'Representative role'
  };
  const information = (id: ServiceId, row: JsonObject): SafeInformation => {
    const state = object(intake?.[id]), entry = ['web','voice','calendar'].includes(id) ? 'assistant' : id === 'sms' ? 'secure_workspace' : 'provider_workspace';
    const missing = (Array.isArray(state?.missingFields) ? state.missingFields : []).filter((key): key is string => typeof key === 'string' && key.startsWith(id + '.') && Object.hasOwn(fieldLabels,key));
    const fields = Object.keys(fieldLabels).filter(key => key.startsWith(id + '.')).map(key => {
      const [,section,field] = key.split('.'), values = object(state?.[section]);
      const required = id === 'sms' || id === 'web' && field === 'website' || id === 'voice' &&
        (['forwardingMode','ownerPhone'].includes(field) || object(state?.routing)?.forwardingMode === 'forward_business_line');
      const options:Record<string,string[]>={builder:['wordpress','wix','squarespace','webflow','shopify','other'],installationBy:['me','web_person'],forwardingMode:['forward_business_line','use_new_number'],carrier:['att','verizon','tmobile','voip','other'],forwarding:['missed','all','none']};
      return { id:key, inputKey:entry==='assistant'?field:null, label:fieldLabels[key], required, provided:id === 'sms' ? Array.isArray(state?.missingFields) && (state?.complete === true || !missing.includes(key)) : typeof values?.[field] === 'string' && values[field].trim().length > 0, options:entry==='assistant'?options[field]||[]:[] };
    });
    const guideSteps = object(row.guide)?.steps;
    const pending = Array.isArray(guideSteps) ? guideSteps.map(object).find(step=>step && step.state !== 'complete') : null;
    const rawActor = row.responsibility || (row.ownerActionNeeded === true ? 'customer' : pending?.actor);
    const nextActor = rawActor === 'carrier' ? 'provider' : ['customer','platform','provider','complete'].includes(String(rawActor)) ? rawActor as SafeInformation['nextActor'] : 'platform';
    return { entry, canSave:entry === 'assistant' && intake?.available === true && intake.canSave === true && state?.canSave === true,
      needsReview:state?.complete === false && missing.length === 0,
      complete:typeof state?.complete === 'boolean' ? state.complete : null, fields, missingFields:missing, nextActor };
  };
  const services = SERVICE_IDS.flatMap(id => {
    const row = rows.map(object).find(row => row?.id === id);
    if (!row) return [];
    const serviceGuide = guide(row.guide);
    const status = typeof row.status === 'string' && STATUSES.has(row.status) ? row.status : 'unknown';
    const capabilities = object(row.capabilities);
    return [{
      id, label: LABELS[id], status, requested: row.requested === true, retained: row.retained === true,
      active: row.active === true, detail: clean(row.detail), nextStep: clean(row.nextStep, 300),
      guideAvailable: Boolean(serviceGuide), reviewUrl: workspaceLink(config, 'setup'),
      information: information(id,row),
      ...(id === 'thumbtack' || id === 'angi' ? {
        ownerActionNeeded: row.ownerActionNeeded === true,
        capabilities: { receiveLeads: capabilities?.receiveLeads === true,
          receiveMessages: capabilities?.receiveMessages === true, sendNativeReplies: capabilities?.sendNativeReplies === true }
      } : {}),
      ...(serviceGuide ? { guide: serviceGuide } : {})
    }];
  });
  const next = object(journey.nextAction);
  const nextView = next?.kind === 'route' && VIEWS.includes(next.target as View) ? next.target as View : 'setup';
  const discovery = (Array.isArray(journey.discovery) ? journey.discovery : []).slice(0, 12).flatMap(value => {
    const row = object(value);
    if (!row || !Object.hasOwn(DISCOVERY, String(row.id))) return [];
    const id = String(row.id) as keyof typeof DISCOVERY;
    return [{
      id, label: DISCOVERY[id], fit: clean(row.fit, 300),
      connectionMode: DISCOVERY_MODES.has(String(row.connectionMode)) ? String(row.connectionMode) : 'unknown',
      availability: DISCOVERY_AVAILABILITY.has(String(row.availability)) ? String(row.availability) : 'unknown', detail: clean(row.detail)
    }];
  });
  return {
    observedAt: new Date().toISOString(), mode: 'read_only', summary: clean(journey.summary),
    nextAction: { label: clean(next?.label, 160) || 'Review your current setup', reviewUrl: workspaceLink(config, nextView) },
    services, discovery
  };
}

// Shared fixed owner transport; no caller controls destination, headers or action.
export class OwnerAccess {
  constructor(readonly config: Configuration,
    private readonly transport: typeof fetch = globalThis.fetch,
    private readonly timeoutMs = 8000) {}

  async request(body?: Record<string, unknown>): Promise<JsonObject> {
    const url = new URL('/api/client', this.config.origin);
    url.searchParams.set('c', this.config.slug);
    if (!body) url.searchParams.set('setup_assistance', '1');
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.transport(url, {
        method: body ? 'POST' : 'GET', redirect: 'error', credentials: 'omit', cache: 'no-store',
        headers: { Authorization: 'Bearer ' + this.config.bearer, Accept: 'application/json', 'Cache-Control': 'no-store', ...(body ? { 'Content-Type': 'application/json', Origin: this.config.origin } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal
      });
      if (response.status === 401 || response.status === 403) {
        throw new SafeError('session_expired', 'Your owner session is unavailable or expired. Sign in to your existing workspace before retrying.', response.status);
      }
      if (body && response.status >= 400 && response.status < 500) {
        throw new SafeError('write_rejected', 'The workspace did not accept this preparation. Review the latest setup before preparing it again.', response.status);
      }
      if (!response.ok || response.redirected || (response.url && response.url !== url.href)) {
        throw new SafeError('setup_unavailable', 'The setup status could not be read. Review your workspace or retry this read later.');
      }
      if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') || '') ||
          Number(response.headers.get('content-length') || 0) > MAX_RESPONSE_BYTES || !response.body) {
        throw new SafeError('invalid_response', 'The workspace returned an unsupported setup response.');
      }
      const reader = response.body.getReader(), parts: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          const result = await reader.read();
          if (result.done) break;
          length += result.value.byteLength;
          if (length > MAX_RESPONSE_BYTES) {
            await reader.cancel();
            throw new SafeError('response_too_large', 'The workspace response is too large for this setup reader. Open the workspace directly.');
          }
          parts.push(result.value);
        }
      } finally { reader.releaseLock(); }
      const dto = object(JSON.parse(Buffer.concat(parts).toString('utf8')));
      if (!dto || dto.error || dto.ok === false) throw new SafeError('setup_unavailable', 'The setup status could not be confirmed. Open your workspace.');
      return dto;
    } catch (error) {
      if (error instanceof SafeError) throw error;
      throw new SafeError('read_failed', body ? 'The preparation result could not be confirmed. Check the workspace before further changes.' : 'The setup read did not complete. Check your sign-in or retry this read; no service change was made.');
    } finally { clearTimeout(timer); }
  }
}

export class WorkspaceReader {
  private readonly access: OwnerAccess;
  constructor(private readonly config: Configuration,
    transport: typeof fetch = globalThis.fetch, timeoutMs = 8000) {
    this.access = new OwnerAccess(config, transport, timeoutMs);
  }
  link(view: View): string { return workspaceLink(this.config, view); }
  async snapshot(): Promise<SafeSnapshot> { return project(await this.access.request(), this.config); }
}
