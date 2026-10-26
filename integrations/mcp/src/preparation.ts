import { randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import { OwnerAccess, SafeError, workspaceLink } from './workspace.js';

export const PREPARATION_CHANNELS = ['web', 'voice', 'sms', 'calendar'] as const;
type Channel = typeof PREPARATION_CHANNELS[number];
export type PreparationInput = { desiredChannels: Channel[]; website?: string };
type Row = Record<string, unknown>;
const object = (value: unknown): Row | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Row : null;
const hex = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const error = (code: string, message: string): never => { throw new SafeError(code, message); };
const channels = (value: unknown): Channel[] => {
  if (!Array.isArray(value) || value.length > 4 || new Set(value).size !== value.length || value.some(id => !PREPARATION_CHANNELS.includes(id))) {
    return error('invalid_choices', 'Choose only the listed services, without duplicates.');
  }
  return PREPARATION_CHANNELS.filter(id => value.includes(id));
};
function website(value: unknown): string {
  if (typeof value !== 'string' || value.length > 300 || /[\u0000-\u0020\u007f]/.test(value)) return error('invalid_website', 'Use a public HTTPS business website, or leave it blank.');
  if (value === '') return '';
  let url: URL;
  try { url = new URL(value); } catch { return error('invalid_website', 'Use a full HTTPS business website.'); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || url.search ||
      isIP(host.replace(/^\[|\]$/g, '')) || host.split('.').length < 2 || host.split('.').some(part => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(part)) ||
      /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|example)$/.test(host) ||
      /^(?:www\.)?machinesandcloud\.com$/.test(host) || /^(?:[a-z0-9-]+--)?machines-and-cloud\.netlify\.app$/.test(host)) {
    return error('invalid_website', 'Use your public HTTPS business website without credentials, query details, a custom port or a fragment.');
  }
  return url.href;
}
function input(value: PreparationInput): PreparationInput {
  if (!object(value) || Object.keys(value).some(key => !['desiredChannels', 'website'].includes(key))) return error('invalid_choices', 'Review the listed preparation fields.');
  return { desiredChannels: channels(value.desiredChannels), ...(Object.hasOwn(value, 'website') ? { website: website(value.website) } : {}) };
}
type Current = { eligible: boolean; prepared: boolean; token: string | null; lastSubmissionId: string | null; desiredChannels: Channel[]; website: string };
type Preview = { id: string; submissionId: string; token: string; input: PreparationInput; expiresAt: number; attempted: boolean; rejected: boolean; resolved: boolean };
export type PreparationResult = {
  state: 'preview' | 'saved' | 'uncertain';
  previewId: string; desiredChannels: Channel[]; website?: string; websiteOrigin?: string | null;
  expiresAt: string; detail: string; reviewUrl: string;
};

// One immutable, bounded preview per process/workspace. No automatic POST retries.
export class SetupPreparer {
  private previewRecord: Preview | null = null;
  private saving = false;
  constructor(private readonly access: OwnerAccess, private readonly now: () => number = Date.now) {}

  private async current(dto?: Row): Promise<Current> {
    const value = dto || await this.access.request(), client = object(value.client), setup = object(value.setup), row = object(setup?.connectionPreparation);
    if (client?.slug !== this.access.config.slug || !row || typeof row.eligible !== 'boolean' || typeof row.prepared !== 'boolean' ||
        !(row.token === null || hex(row.token)) || !(row.lastSubmissionId === null || typeof row.lastSubmissionId === 'string' && /^[a-f0-9]{32,64}$/.test(row.lastSubmissionId)) ||
        typeof row.website !== 'string' || row.website.length > 300) {
      return error('preparation_unavailable', 'The current preparation could not be verified. Review Connections in your workspace.');
    }
    return { eligible: row.eligible, prepared: row.prepared, token: row.token, lastSubmissionId: row.lastSubmissionId,
      desiredChannels: channels(row.desiredChannels), website: row.website };
  }
  private result(record: Preview, state: PreparationResult['state']): PreparationResult {
    if(state==='saved')record.resolved=true;
    return {
      state, previewId: record.id, desiredChannels: [...record.input.desiredChannels],
      ...(Object.hasOwn(record.input, 'website') ? { website: record.input.website, websiteOrigin: record.input.website ? new URL(record.input.website).origin : null } : {}),
      expiresAt: new Date(record.expiresAt).toISOString(),
      detail: state === 'preview' ? 'Review these choices before saving. This prepares your selected services and exact website origin; account permissions, installation and activation remain in the workspace.' :
        state === 'saved' ? 'Your preparation is saved. Review your shared business details and try your front desk next.' :
          'The save result is uncertain. Check the workspace before making further changes. This tool will only check this operation again; it will not repeat the save.',
      reviewUrl: workspaceLink(this.access.config, state === 'saved' ? 'know' : 'setup')
    };
  }
  private matches(current: Current, record: Preview): boolean {
    return current.eligible && current.prepared && current.lastSubmissionId === record.submissionId && hex(current.token) &&
      JSON.stringify(current.desiredChannels) === JSON.stringify(record.input.desiredChannels) &&
      (!Object.hasOwn(record.input, 'website') || current.website === record.input.website);
  }
  async preview(value: PreparationInput): Promise<PreparationResult> {
    const proposed = input(value);
    if (this.saving) return error('save_in_progress', 'A preparation is being checked. Wait for its result before starting another preview.');
    const current = await this.current(), previous = this.previewRecord;
    if (this.saving) return error('save_in_progress', 'A preparation is being checked. Wait for its result before starting another preview.');
    if (previous?.attempted && !previous.rejected && !previous.resolved && !this.matches(current, previous)) {
      return error('operation_uncertain', 'A previous save is still uncertain. Review Connections before starting another preparation.');
    }
    if (!current.eligible || !hex(current.token)) return error('setup_protected', 'Setup has progressed. Continue with the saved connection controls in your workspace.');
    const record: Preview = { id: randomBytes(16).toString('hex'), submissionId: randomBytes(16).toString('hex'), token: current.token,
      input: proposed, expiresAt: this.now() + 600_000, attempted: false, rejected: false, resolved: false };
    this.previewRecord = record;
    return this.result(record, 'preview');
  }
  async save(previewId: string, confirm: true): Promise<PreparationResult> {
    if (this.saving) return error('save_in_progress', 'A preparation is being checked. Wait for its result; do not repeat the save.');
    this.saving = true;
    try { return await this.saveOnce(previewId, confirm); } finally { this.saving = false; }
  }
  private async saveOnce(previewId: string, confirm: true): Promise<PreparationResult> {
    const record = this.previewRecord;
    if (confirm !== true || !record || record.id !== previewId || !/^[a-f0-9]{32}$/.test(previewId)) return error('preview_required', 'Preview these choices and confirm the matching preview before saving.');
    if (record.rejected) return error('preparation_rejected', 'This preparation was rejected. Review the latest setup and create a new preview.');
    let current: Current;
    try { current = await this.current(); }
    catch (cause) { if (record.attempted) return this.result(record, 'uncertain'); throw cause; }
    if (record.attempted) {
      if(this.matches(current,record))return this.result(record,'saved');
      if(record.resolved)return error('preparation_changed','This save was confirmed, and your setup has changed since then. Review the current setup before preparing another change.');
      return this.result(record,'uncertain');
    }
    if (this.now() >= record.expiresAt) return error('preview_expired', 'This preview expired. Review a fresh preview before saving.');
    if (!current.eligible || current.token !== record.token) return error('preparation_changed', 'Your setup changed. Review a fresh preview before saving.');
    record.attempted = true; // Set before await so concurrent calls cannot submit twice.
    try {
      const dto = await this.access.request({ action: 'prepare_connections', expectedPreparationToken: record.token,
        submissionId: record.submissionId, ...record.input });
      const saved = await this.current(dto), receipt = object(dto.preparation);
      if (receipt?.state === 'saved' && receipt.submissionId === record.submissionId && this.matches(saved, record)) return this.result(record, 'saved');
    } catch (cause) {
      if (cause instanceof SafeError && cause.status && cause.status >= 400 && cause.status < 500) {
        record.rejected = true;
        throw cause;
      }
    }
    try { current = await this.current(); return this.result(record, this.matches(current, record) ? 'saved' : 'uncertain'); }
    catch { return this.result(record, 'uncertain'); }
  }
}
