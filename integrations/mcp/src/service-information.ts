import { randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import { OwnerAccess, SafeError, workspaceLink } from './workspace.js';

export const INFORMATION_SERVICES = ['web', 'voice', 'calendar'] as const;
export type InformationService = typeof INFORMATION_SERVICES[number];
export type ServiceInformationInput = { serviceId: InformationService; fields: Record<string, string> };
export type ServiceInformationResult = {
  state: 'preview' | 'saved' | 'uncertain'; previewId: string; serviceId: InformationService;
  changedFields: { id: string; label: string; value: string }[];
  expiresAt: string; detail: string; reviewUrl: string;
};
type Row = Record<string, unknown>;
const object = (value: unknown): Row | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null ? value as Row : null;
};
const hex = (value: unknown, length = 64): value is string => typeof value === 'string' && new RegExp(`^[a-f0-9]{${length}}$`).test(value);
const fail = (code: string, message: string): never => { throw new SafeError(code, message); };
const SECTIONS: Record<InformationService, string> = { web: 'preferences', voice: 'routing', calendar: 'preferences' };
const FIELDS: Record<InformationService, readonly string[]> = {
  web: ['website', 'builder', 'installationBy'],
  voice: ['forwardingMode', 'businessNumber', 'carrier', 'forwarding', 'ownerPhone'],
  calendar: ['accountEmail']
};
const LABELS: Record<string, string> = {
  website: 'Business website', builder: 'Website builder', installationBy: 'Website installation contact',
  forwardingMode: 'Phone setup', businessNumber: 'Business phone number', carrier: 'Phone provider',
  forwarding: 'Calls to answer', ownerPhone: 'Contact cell', accountEmail: 'Google account preference'
};
const ENUMS: Record<string, readonly string[]> = {
  builder: ['wordpress', 'wix', 'squarespace', 'webflow', 'shopify', 'other'], installationBy: ['me', 'web_person'],
  forwardingMode: ['forward_business_line', 'use_new_number'], carrier: ['att', 'verizon', 'tmobile', 'voip', 'other'],
  forwarding: ['missed', 'all', 'none']
};

function normalizedWebsite(value: string): string {
  if (!value) return '';
  if (/[\u0000-\u0020\u007f]/.test(value)) return fail('invalid_information', 'Use your public HTTPS business website without private URL details.');
  let url: URL;
  try { url = new URL(value); } catch { return fail('invalid_information', 'Use your public HTTPS business website.'); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash ||
      isIP(host.replace(/^\[|\]$/g, '')) || host.split('.').length < 2 ||
      host.split('.').some(part => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(part)) ||
      /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|example)$/.test(host) ||
      /^(?:www\.)?machinesandcloud\.com$/.test(host) || /^(?:[a-z0-9-]+--)?machines-and-cloud\.netlify\.app$/.test(host)) {
    return fail('invalid_information', 'Use your own public HTTPS website without credentials, query details, a custom port or a fragment.');
  }
  return url.href;
}
function normalizedPhone(value: string): string {
  if (!value) return '';
  if (value.length > 40 || !/^[+()\d .-]+$/.test(value) || /\+/.test(value.slice(1))) return fail('invalid_information', 'Use a valid US phone number, including its area code.');
  const digits = value.replace(/\D/g, ''), result = value.startsWith('+') ? '+' + digits : digits.length === 10 ? '+1' + digits : '+' + digits;
  return /^\+1[2-9]\d{2}[2-9]\d{6}$/.test(result) ? result : fail('invalid_information', 'Use a valid US phone number, including its area code.');
}
function normalize(service: InformationService, field: string, value: unknown): string {
  const max = field === 'website' ? 300 : field === 'accountEmail' ? 254 : 100;
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) return fail('invalid_information', 'Review the listed information fields.');
  let result = value.trim();
  if (field === 'website') result = normalizedWebsite(result);
  if (field === 'businessNumber' || field === 'ownerPhone') result = normalizedPhone(result);
  if (field === 'accountEmail' && result) {
    result = result.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) return fail('invalid_information', 'Use a valid Google account email address.');
  }
  if (result && ENUMS[field] && !ENUMS[field].includes(result)) return fail('invalid_information', 'Choose one of the listed information options.');
  if (!FIELDS[service].includes(field)) return fail('invalid_information', 'Only the listed service information can be saved.');
  return result;
}
function input(value: ServiceInformationInput): Readonly<ServiceInformationInput> {
  const row = object(value), fields = object(row?.fields);
  if (!row || Object.keys(row).some(key => !['serviceId', 'fields'].includes(key)) ||
      !INFORMATION_SERVICES.includes(row.serviceId as InformationService) || !fields || !Object.keys(fields).length ||
      Object.keys(fields).some(field => !FIELDS[row.serviceId as InformationService].includes(field))) {
    return fail('invalid_information', 'Provide only the listed information for website, phone or Calendar setup.');
  }
  const serviceId = row.serviceId as InformationService;
  const normalized = Object.fromEntries(FIELDS[serviceId].filter(field => Object.hasOwn(fields, field)).map(field => [field, normalize(serviceId, field, fields[field])]));
  if (serviceId === 'voice' && normalized.forwardingMode === 'forward_business_line' && normalized.businessNumber && normalized.businessNumber === normalized.ownerPhone) {
    return fail('invalid_information', 'Use different numbers for the business line and contact cell.');
  }
  return Object.freeze({ serviceId, fields: Object.freeze(normalized) });
}

type Current = { token: string | null; canSave: boolean; lastSubmissionId: string | null; selected: boolean; fields: Row };
type Preview = {
  readonly id: string; readonly submissionId: string; readonly token: string;
  readonly input: Readonly<ServiceInformationInput>; readonly expiresAt: number;
  attempted: boolean; rejected: boolean; resolved: boolean;
};

// An optional assistant writes the same encrypted drafts as the portal. Provider
// permissions, registration, application, payment and activation stay out of scope.
export class ServiceInformation {
  private previewRecord: Preview | null = null;
  private saving = false;
  constructor(private readonly access: OwnerAccess, private readonly now: () => number = Date.now) {}

  private async current(serviceId: InformationService, dto?: Row): Promise<Current> {
    const value = dto || await this.access.request(), client = object(value.client), intake = object(value.serviceIntake),
      row = object(intake?.[serviceId]), fields = object(row?.[SECTIONS[serviceId]]), setup = object(value.setup), journey = object(setup?.connectionJourney);
    const channels = Array.isArray(journey?.channels) ? journey.channels : [];
    if (client?.slug !== this.access.config.slug || !intake || !row || !fields ||
        typeof intake.available !== 'boolean' || typeof intake.canSave !== 'boolean' || typeof row.canSave !== 'boolean' ||
        !(intake.token === null || hex(intake.token)) ||
        !(intake.lastSubmissionId === null || typeof intake.lastSubmissionId === 'string' && /^[a-f0-9]{32,64}$/.test(intake.lastSubmissionId)) ||
        !channels.some(value => object(value)?.id === serviceId && typeof object(value)?.requested === 'boolean') ||
        FIELDS[serviceId].some(field => typeof fields[field] !== 'string' || String(fields[field]).length > (field === 'website' ? 300 : field === 'accountEmail' ? 254 : 100))) {
      return fail('information_unavailable', 'Current service information could not be verified. Open Connections in your workspace.');
    }
    return { token: intake.token as string | null, canSave: intake.available && intake.canSave && row.canSave,
      lastSubmissionId: intake.lastSubmissionId as string | null,
      selected: channels.some(value => object(value)?.id === serviceId && object(value)?.requested === true), fields };
  }
  private result(record: Preview, state: ServiceInformationResult['state']): ServiceInformationResult {
    return { state, previewId: record.id, serviceId: record.input.serviceId,
      changedFields: Object.entries(record.input.fields).map(([field, value]) => ({ id: field, label: LABELS[field],
        value: !value ? 'Clear this field' : field === 'ownerPhone' || field === 'businessNumber' ? 'Phone number provided' :
          field === 'accountEmail' ? 'Email address provided' : value })),
      expiresAt: new Date(record.expiresAt).toISOString(), reviewUrl: workspaceLink(this.access.config, 'setup'),
      detail: state === 'preview' ? 'Review these supplied fields before saving. Other saved information is kept. Saving selects this service and preserves its setup details; it does not connect or activate it.' :
        state === 'saved' ? 'Your service information is saved. Continue its next step in Connections; no account permission, installation, purchase or activation was performed.' :
          'The save result is uncertain. Check Connections before further changes. This tool will only check the same operation and will not repeat the save.' };
  }
  private matches(current: Current, record: Preview): boolean {
    return current.canSave && hex(current.token) && current.token !== record.token && current.selected &&
      current.lastSubmissionId === record.submissionId && Object.entries(record.input.fields).every(([field, value]) => current.fields[field] === value);
  }
  async preview(value: ServiceInformationInput): Promise<ServiceInformationResult> {
    const proposed = input(value);
    if (this.saving) return fail('save_in_progress', 'A service information save is being checked. Wait for its result.');
    // Resolve an earlier uncertain operation against its own service, never a new
    // service's state or matching values supplied by a different operation.
    const previous = this.previewRecord;
    if (previous?.attempted && !previous.rejected && !previous.resolved) {
      const current = await this.current(previous.input.serviceId);
      if (this.saving) return fail('save_in_progress', 'A service information save is being checked. Wait for its result.');
      if (!this.matches(current, previous)) return fail('operation_uncertain', 'A previous save is still uncertain. Review Connections before starting another preview.');
      previous.resolved = true;
    }
    const current = await this.current(proposed.serviceId);
    if (this.saving) return fail('save_in_progress', 'A service information save is being checked. Wait for its result.');
    if (!current.canSave || !hex(current.token)) return fail('information_protected', 'Continue this service through its current workspace controls. Existing setup is kept.');
    const record: Preview = { id: randomBytes(16).toString('hex'), submissionId: randomBytes(16).toString('hex'),
      token: current.token, input: proposed, expiresAt: this.now() + 600_000, attempted: false, rejected: false, resolved: false };
    this.previewRecord = record;
    return this.result(record, 'preview');
  }
  async save(previewId: string, confirm: true): Promise<ServiceInformationResult> {
    if (this.saving) return fail('save_in_progress', 'A service information save is being checked. Wait; do not repeat the save.');
    this.saving = true;
    try { return await this.saveOnce(previewId, confirm); } finally { this.saving = false; }
  }
  private async saveOnce(previewId: string, confirm: true): Promise<ServiceInformationResult> {
    const record = this.previewRecord;
    if (confirm !== true || !record || record.id !== previewId || !hex(previewId, 32)) return fail('preview_required', 'Preview the fields and confirm the exact matching preview before saving.');
    if (record.rejected) return fail('information_rejected', 'This save was rejected. Review the latest service information and create a fresh preview.');
    let current: Current;
    try { current = await this.current(record.input.serviceId); }
    catch (cause) { if (record.attempted) return this.result(record, 'uncertain'); throw cause; }
    if (record.attempted) {
      if (this.matches(current, record)) { record.resolved = true; return this.result(record, 'saved'); }
      if (record.resolved) return fail('information_changed', 'This save was previously confirmed, and your setup has changed since then. Review the current information before preparing another change.');
      return this.result(record, 'uncertain');
    }
    if (this.now() >= record.expiresAt) return fail('preview_expired', 'This preview expired. Review a fresh preview before saving.');
    if (!current.canSave || current.token !== record.token) return fail('information_changed', 'Your setup changed. Review a fresh preview before saving.');
    record.attempted = true;
    try {
      const dto = await this.access.request({ action: 'save_service_intake', expectedIntakeToken: record.token,
        submissionId: record.submissionId, service: record.input.serviceId, section: SECTIONS[record.input.serviceId],
        fields: { ...record.input.fields }, selectService: true });
      const saved = await this.current(record.input.serviceId, dto), receipt = object(dto.intake);
      if (receipt?.state === 'saved' && receipt.submissionId === record.submissionId && this.matches(saved, record)) { record.resolved = true; return this.result(record, 'saved'); }
    } catch (cause) {
      if (cause instanceof SafeError && cause.status && cause.status >= 400 && cause.status < 500) { record.rejected = true; throw cause; }
    }
    try { current = await this.current(record.input.serviceId); if (this.matches(current, record)) { record.resolved = true; return this.result(record, 'saved'); } return this.result(record, 'uncertain'); }
    catch { return this.result(record, 'uncertain'); }
  }
}
