import { demoMemberId } from '@/demo/identity';
import {
  getDemoRepositoryRuntime,
  type DemoDraftRecord,
  type DemoRepository,
} from '@/demo/repository';

const demoAutosavePrefix = 'demo-autosave:';

export type DemoAutosaveEnvelope<Draft> = Readonly<{
  draft: Draft;
  revision: number;
  sourceId: string;
  updatedAt: string;
}>;

function storageKey(key: string): string {
  return `${demoAutosavePrefix}${encodeURIComponent(key)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseEnvelope<Draft>(record: DemoDraftRecord | undefined): DemoAutosaveEnvelope<Draft> | null {
  if (!record) return null;
  try {
    const value: unknown = JSON.parse(record.body);
    if (!isRecord(value) || !isRecord(value.draft)) return null;
    return {
      draft: value.draft as Draft,
      revision: typeof value.revision === 'number' && Number.isInteger(value.revision)
        ? value.revision
        : record.revision,
      sourceId: typeof value.sourceId === 'string' ? value.sourceId : '',
      updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : record.updatedAt,
    };
  } catch {
    return null;
  }
}

function draftTitle(value: unknown): string {
  return isRecord(value) && typeof value.title === 'string'
    ? value.title.slice(0, 150)
    : '';
}

function draftFormat(value: unknown): DemoDraftRecord['format'] {
  if (isRecord(value) && value.kind === 'blog-markdown') return 'markdown';
  return 'latex';
}

function draftContentType(value: unknown): DemoDraftRecord['contentType'] {
  if (isRecord(value) && (value.mode === 'book' || value.kind === 'markdown-book-section')) return 'book';
  return 'blog';
}

function draftSavedAt(value: unknown, fallback: string): string {
  if (isRecord(value) && typeof value.savedAt === 'number' && Number.isFinite(value.savedAt)) {
    const date = new Date(value.savedAt);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return fallback;
}

function recordForEnvelope<Draft>(
  key: string,
  envelope: DemoAutosaveEnvelope<Draft>,
  existing?: DemoDraftRecord,
): DemoDraftRecord {
  const updatedAt = draftSavedAt(envelope.draft, envelope.updatedAt);
  return {
    key: storageKey(key),
    ownerId: demoMemberId,
    contentType: draftContentType(envelope.draft),
    title: draftTitle(envelope.draft),
    body: JSON.stringify(envelope),
    locale: 'zh-CN',
    format: draftFormat(envelope.draft),
    revision: envelope.revision,
    createdAt: existing?.createdAt ?? updatedAt,
    updatedAt,
  };
}

export function activeDemoDraftRepository(): DemoRepository | null {
  return getDemoRepositoryRuntime();
}

export async function readDemoAutosaveEnvelope<Draft>(
  repository: DemoRepository,
  key: string,
): Promise<DemoAutosaveEnvelope<Draft> | null> {
  return repository.transaction(['drafts'], 'readonly', async (transaction) => (
    parseEnvelope<Draft>(await transaction.get('drafts', storageKey(key)))
  ));
}

export async function writeDemoAutosaveDraft<Draft>(
  repository: DemoRepository,
  key: string,
  draft: Draft,
): Promise<void> {
  await repository.transaction(['drafts'], 'readwrite', async (transaction) => {
    const existing = await transaction.get('drafts', storageKey(key));
    const current = parseEnvelope<Draft>(existing);
    const updatedAt = draftSavedAt(draft, new Date().toISOString());
    await transaction.put('drafts', recordForEnvelope(key, {
      draft,
      revision: current?.revision ?? 0,
      sourceId: current?.sourceId ?? '',
      updatedAt,
    }, existing));
  });
}

export async function writeDemoAutosaveEnvelope<Draft>(
  repository: DemoRepository,
  key: string,
  input: Readonly<{ draft: Draft; sourceId: string; expectedRevision: number }>,
): Promise<DemoAutosaveEnvelope<Draft>> {
  const result = await repository.transaction(['drafts'], 'readwrite', async (transaction) => {
    const existing = await transaction.get('drafts', storageKey(key));
    const current = parseEnvelope<Draft>(existing);
    if (current && input.expectedRevision < current.revision && input.sourceId !== current.sourceId) {
      return { conflictRevision: current.revision } as const;
    }
    const updatedAt = draftSavedAt(input.draft, new Date().toISOString());
    const envelope: DemoAutosaveEnvelope<Draft> = {
      draft: input.draft,
      revision: (current?.revision ?? 0) + 1,
      sourceId: input.sourceId,
      updatedAt,
    };
    await transaction.put('drafts', recordForEnvelope(key, envelope, existing));
    return envelope;
  });
  if ('conflictRevision' in result) throw new DemoDraftConflictError(result.conflictRevision);
  return result;
}

export async function deleteDemoAutosaveDraft(repository: DemoRepository, key: string): Promise<void> {
  await repository.transaction(['drafts'], 'readwrite', (transaction) => (
    transaction.delete('drafts', storageKey(key))
  ));
}

export class DemoDraftConflictError extends Error {
  readonly code = 'demo.draft.conflict';

  constructor(readonly revision: number) {
    super('The demo draft changed in another editor.');
    this.name = 'DemoDraftConflictError';
  }
}
