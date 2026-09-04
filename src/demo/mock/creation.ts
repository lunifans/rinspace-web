import {
  DemoDraftConflictError,
  deleteDemoAutosaveDraft,
  readDemoAutosaveEnvelope,
  writeDemoAutosaveEnvelope,
} from '@/demo/draftStorage';
import { demoMemberId } from '@/demo/identity';
import {
  demoEntityKey,
  type DemoContentEntity,
  type DemoEntityRecord,
  type DemoNotificationEntity,
  type DemoPreferenceRecord,
  type DemoRelationRecord,
  type DemoRepository,
  type DemoTagEntity,
} from '@/demo/repository';
import type { ApiSchemas } from '@/generated/api-contract';
import { demoContentDetail } from './discovery';
import { demoStoredMarkdownBody } from './markdownRender';
import { DemoRequestError, normalizedDemoQuery, stableDemoSort } from './request';

const fallbackClock = '2026-06-01T12:00:00.000Z';
const maximumDraftBytes = 1024 * 1024;
const maximumContentBytes = 512 * 1024;

type ContentStatus = DemoContentEntity['data']['status'];

type DemoContentInput = Readonly<{
  type: ApiSchemas['ContentType'];
  status: ContentStatus;
  repositoryStatus: ContentStatus;
  sourceVisibility: 'open' | 'private';
  title: string;
  body: string;
  excerpt: string;
  tags: readonly string[];
  editor: 'rin' | 'markdown';
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireMember(request: Request): void {
  if (request.headers.get('x-rinspace-demo-persona') !== 'member') {
    throw new DemoRequestError(401, 'authentication.required', 'Demo member persona is required.');
  }
}

function contentType(value: unknown): ApiSchemas['ContentType'] | null {
  const allowed = new Set<ApiSchemas['ContentType']>([
    'announcement', 'blog', 'book', 'discussion', 'dynamic', 'forum', 'question', 'status', 'tag', 'task',
  ]);
  return typeof value === 'string' && allowed.has(value as ApiSchemas['ContentType'])
    ? value as ApiSchemas['ContentType']
    : null;
}

function contentStatus(value: unknown, fallback: ContentStatus): ContentStatus {
  return value === 'draft' || value === 'private' || value === 'published' ? value : fallback;
}

function parseContentInput(value: unknown, fallback?: DemoContentEntity): DemoContentInput {
  if (!isRecord(value)) {
    throw new DemoRequestError(422, 'demo.creation.invalid_body', 'Content input must be a JSON object.');
  }
  const type = contentType(value.type) ?? fallback?.data.type ?? null;
  const title = typeof value.title === 'string' ? value.title.trim() : fallback?.data.title ?? '';
  const body = typeof value.body === 'string' ? value.body : fallback?.data.body ?? '';
  if (!type) throw new DemoRequestError(422, 'demo.creation.invalid_type', 'A supported content type is required.', { field: 'type' });
  if (title.length < 1 || title.length > 150) {
    throw new DemoRequestError(422, 'demo.creation.invalid_title', 'The title must contain 1 to 150 characters.', { field: 'title' });
  }
  if (!body.trim()) {
    throw new DemoRequestError(422, 'demo.creation.empty_body', 'Content body cannot be empty.', { field: 'body' });
  }
  if (new TextEncoder().encode(body).byteLength > maximumContentBytes) {
    throw new DemoRequestError(422, 'demo.creation.body_too_large', 'Demo content is limited to 512 KiB.', { field: 'body' });
  }
  const tags = Array.isArray(value.tags)
    ? value.tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean)
    : fallback?.data.tags ?? [];
  if (tags.length > 6 || tags.some((tag) => tag.length > 48)) {
    throw new DemoRequestError(422, 'demo.creation.invalid_tags', 'Use at most six tags of up to 48 characters.', { field: 'tags' });
  }
  const status = contentStatus(value.status, fallback?.data.status ?? 'published');
  const repositoryStatus = contentStatus(value.repositoryStatus, status);
  const sourceVisibility = value.sourceVisibility === 'private' || value.sourceVisibility === 'open'
    ? value.sourceVisibility
    : status === 'published' ? 'open' : 'private';
  const editor = value.editor === 'markdown'
    ? 'markdown'
    : value.editor === 'rin'
      ? 'rin'
      : fallback?.data.format === 'markdown' ? 'markdown' : 'rin';
  const excerpt = typeof value.excerpt === 'string' && value.excerpt.trim()
    ? value.excerpt.trim().slice(0, 240)
    : body.replace(/\[\[[^\]]+\]\]/g, ' ').replace(/[#*_`\\{}]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
  return { type, status, repositoryStatus, sourceVisibility, title, body, excerpt, tags, editor };
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function demoStoredContentBody(input: DemoContentInput, identityHash: string): Promise<string> {
  if (input.editor !== 'markdown') return input.body;
  return demoStoredMarkdownBody(input.body, input.title, identityHash);
}

function slugSegment(title: string): string {
  return title.normalize('NFKC').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || 'local-demo-post';
}

async function clock(repository: DemoRepository): Promise<string> {
  return repository.transaction(['preferences'], 'readonly', async (transaction) => {
    const value = await transaction.get('preferences', 'demo.seed.feature-clock');
    return typeof value?.value === 'string' ? value.value : fallbackClock;
  });
}

function deterministicTime(base: string, digest: string): string {
  const offset = Number.parseInt(digest.slice(0, 8), 16) % (12 * 60 * 60 * 1000);
  return new Date(new Date(base).getTime() + offset).toISOString();
}

async function tagEntities(
  labels: readonly string[],
  existing: readonly DemoEntityRecord[],
  updatedAt: string,
): Promise<Readonly<{ ids: string[]; created: DemoTagEntity[] }>> {
  const tags = existing.filter((entity): entity is DemoTagEntity => entity.kind === 'tag');
  const ids: string[] = [];
  const created: DemoTagEntity[] = [];
  for (const label of labels) {
    const normalized = normalizedDemoQuery(label);
    const matched = tags.find((tag) => (
      normalizedDemoQuery(tag.data.slug) === normalized || normalizedDemoQuery(tag.data.name) === normalized
    ));
    if (matched) {
      ids.push(matched.id);
      continue;
    }
    const digest = await sha256(normalized);
    const id = `demo-tag-local-${digest.slice(0, 12)}`;
    const tag: DemoTagEntity = {
      key: demoEntityKey('tag', id),
      kind: 'tag',
      id,
      updatedAt,
      data: {
        slug: `${slugSegment(label)}-${digest.slice(0, 6)}`,
        name: label,
        description: 'A local tag created in the Rinspace browser demo.',
        locale: 'zh-CN',
      },
    };
    tags.push(tag);
    created.push(tag);
    ids.push(id);
  }
  return { ids, created };
}

async function contentReference(repository: DemoRepository, reference: string): Promise<DemoContentEntity | null> {
  const normalized = decodeURIComponent(reference).trim();
  return repository.transaction(['entities'], 'readonly', async (transaction) => {
    const entities = await transaction.getAll('entities');
    const content = entities.filter((entity): entity is DemoContentEntity => entity.kind === 'content');
    return content.find((entity) => (
      entity.id === normalized
      || entity.data.slug === normalized
      || String(1_000 + entity.data.sortOrder) === normalized
    )) ?? null;
  });
}

export async function demoCreateContent(request: Request, repository: DemoRepository, forcedType?: ApiSchemas['ContentType']) {
  requireMember(request);
  const raw: unknown = await request.json().catch(() => null);
  const input = parseContentInput(forcedType && isRecord(raw) ? { ...raw, type: forcedType } : raw);
  const digest = await sha256(JSON.stringify({
    type: input.type,
    title: input.title,
    body: input.body,
    tags: [...input.tags].sort(),
  }));
  const storedBody = await demoStoredContentBody(input, digest);
  const id = `demo-content-local-${digest.slice(0, 16)}`;
  const baseClock = await clock(repository);
  const updatedAt = deterministicTime(baseClock, digest);
  await repository.transaction(['entities', 'relations'], 'readwrite', async (transaction) => {
    const entities = await transaction.getAll('entities');
    const prior = entities.find((entity): entity is DemoContentEntity => entity.kind === 'content' && entity.id === id);
    const tags = await tagEntities(input.tags, entities, updatedAt);
    for (const tag of tags.created) await transaction.put('entities', tag);
    const sortOrder = 10_000 + (Number.parseInt(digest.slice(0, 8), 16) % 800_000);
    const entity: DemoContentEntity = {
      key: demoEntityKey('content', id),
      kind: 'content',
      id,
      updatedAt,
      data: {
        type: input.type,
        slug: `${slugSegment(input.title)}-${digest.slice(0, 8)}`,
        title: input.title,
        summary: input.excerpt,
        body: storedBody,
        authorId: demoMemberId,
        status: input.status,
        tags: tags.ids,
        locale: 'zh-CN',
        format: input.editor === 'markdown' ? 'markdown' : 'latex',
        coverAssetKey: null,
        attachmentKeys: [],
        createdAt: prior?.data.createdAt ?? updatedAt,
        publishedAt: input.status === 'published' ? prior?.data.publishedAt ?? updatedAt : null,
        sortOrder,
      },
    };
    await transaction.put('entities', entity);
    for (const tagId of tags.ids) {
      const relation: DemoRelationRecord = {
        key: `demo-relation-local-${digest.slice(0, 12)}-${tagId}`,
        kind: 'tag-content',
        sourceKind: 'tag',
        sourceId: tagId,
        targetKind: 'content',
        targetId: id,
        createdAt: updatedAt,
      };
      await transaction.put('relations', relation);
    }
    const notification: DemoNotificationEntity = {
      key: demoEntityKey('notification', `demo-notification-local-${digest.slice(0, 16)}`),
      kind: 'notification',
      id: `demo-notification-local-${digest.slice(0, 16)}`,
      updatedAt,
      data: {
        actorId: demoMemberId,
        type: input.status === 'draft' ? 'local_draft_saved' : 'local_content_published',
        targetType: input.type,
        targetId: id,
        excerpt: input.title,
        readAt: null,
        createdAt: updatedAt,
        locale: 'zh-CN',
      },
    };
    await transaction.put('entities', notification);
  });
  return demoContentDetail(id, repository, request);
}

export async function demoUpdateContent(reference: string, request: Request, repository: DemoRepository) {
  requireMember(request);
  const current = await contentReference(repository, reference);
  if (!current) throw new DemoRequestError(404, 'demo.content.not_found', 'The requested demo content was not found.');
  if (current.data.authorId !== demoMemberId) {
    throw new DemoRequestError(403, 'authorization.denied', 'Only the demo member’s content can be edited.');
  }
  const raw: unknown = await request.json().catch(() => null);
  const input = parseContentInput(raw, current);
  const updateHash = await sha256(`${current.id}:${input.title}:${input.body}`);
  const storedBody = await demoStoredContentBody(input, updateHash);
  const updatedAt = deterministicTime(await clock(repository), updateHash);
  await repository.transaction(['entities', 'relations'], 'readwrite', async (transaction) => {
    const entities = await transaction.getAll('entities');
    const tags = await tagEntities(input.tags, entities, updatedAt);
    for (const tag of tags.created) await transaction.put('entities', tag);
    await transaction.put('entities', {
      ...current,
      updatedAt,
      data: {
        ...current.data,
        type: input.type,
        title: input.title,
        summary: input.excerpt,
        body: storedBody,
        status: input.status,
        tags: tags.ids,
        format: input.editor === 'markdown' ? 'markdown' : 'latex',
        publishedAt: input.status === 'published' ? current.data.publishedAt ?? updatedAt : null,
      },
    });
    const relations = await transaction.getAll('relations');
    for (const relation of relations.filter((entry) => entry.kind === 'tag-content' && entry.targetId === current.id)) {
      await transaction.delete('relations', relation.key);
    }
    for (const tagId of tags.ids) {
      await transaction.put('relations', {
        key: `demo-relation-local-${updateHash.slice(0, 12)}-${tagId}`,
        kind: 'tag-content',
        sourceKind: 'tag',
        sourceId: tagId,
        targetKind: 'content',
        targetId: current.id,
        createdAt: updatedAt,
      });
    }
  });
  return demoContentDetail(current.id, repository, request);
}

export async function demoDeleteContent(reference: string, request: Request, repository: DemoRepository) {
  requireMember(request);
  const current = await contentReference(repository, reference);
  if (!current) throw new DemoRequestError(404, 'demo.content.not_found', 'The requested demo content was not found.');
  if (current.data.authorId !== demoMemberId) {
    throw new DemoRequestError(403, 'authorization.denied', 'Only the demo member’s content can be deleted.');
  }
  const response = await demoContentDetail(current.id, repository, request);
  await repository.transaction(['entities', 'relations'], 'readwrite', async (transaction) => {
    await transaction.delete('entities', current.key);
    const relations = await transaction.getAll('relations');
    for (const relation of relations.filter((entry) => entry.targetId === current.id || entry.sourceId === current.id)) {
      await transaction.delete('relations', relation.key);
    }
  });
  return response;
}

function draftKey(request: Request): string {
  const key = new URL(request.url).searchParams.get('key')?.trim() ?? '';
  if (!key || key.length > 512) {
    throw new DemoRequestError(422, 'demo.draft.invalid_key', 'A valid draft key is required.', { field: 'key' });
  }
  return key;
}

export async function demoReadDraft(request: Request, repository: DemoRepository) {
  requireMember(request);
  return readDemoAutosaveEnvelope<Record<string, unknown>>(repository, draftKey(request));
}

export async function demoWriteDraft(request: Request, repository: DemoRepository) {
  requireMember(request);
  const key = draftKey(request);
  const rawText = await request.text();
  if (new TextEncoder().encode(rawText).byteLength > maximumDraftBytes) {
    throw new DemoRequestError(422, 'demo.draft.too_large', 'Demo drafts are limited to 1 MiB.', { field: 'draft' });
  }
  let value: unknown = null;
  try {
    value = rawText ? JSON.parse(rawText) : null;
  } catch {
    throw new DemoRequestError(422, 'demo.draft.invalid_json', 'Draft input must be valid JSON.');
  }
  if (!isRecord(value) || !isRecord(value.draft) || value.draft.key !== key || typeof value.sourceId !== 'string') {
    throw new DemoRequestError(422, 'demo.draft.invalid_body', 'Draft input does not match the requested key.');
  }
  try {
    return await writeDemoAutosaveEnvelope(repository, key, {
      draft: value.draft,
      sourceId: value.sourceId,
      expectedRevision: typeof value.revision === 'number' && Number.isInteger(value.revision) ? value.revision : 0,
    });
  } catch (error) {
    if (error instanceof DemoDraftConflictError) {
      throw new DemoRequestError(409, error.code, error.message, { revision: error.revision });
    }
    throw error;
  }
}

export async function demoDeleteDraft(request: Request, repository: DemoRepository): Promise<void> {
  requireMember(request);
  await deleteDemoAutosaveDraft(repository, draftKey(request));
}

async function creatorContent(repository: DemoRepository): Promise<Readonly<{ content: DemoContentEntity[]; relations: DemoRelationRecord[]; clock: string }>> {
  return repository.transaction(['entities', 'relations', 'preferences'], 'readonly', async (transaction) => {
    const entities = await transaction.getAll('entities');
    const relations = await transaction.getAll('relations');
    const clockPreference = await transaction.get('preferences', 'demo.seed.feature-clock') as DemoPreferenceRecord | undefined;
    return {
      content: stableDemoSort(
        entities.filter((entity): entity is DemoContentEntity => entity.kind === 'content' && entity.data.authorId === demoMemberId),
        (left, right) => left.data.sortOrder - right.data.sortOrder,
      ),
      relations,
      clock: typeof clockPreference?.value === 'string' ? clockPreference.value : fallbackClock,
    };
  });
}

export async function demoCreatorAnalytics(request: Request, repository: DemoRepository) {
  requireMember(request);
  const url = new URL(request.url);
  const granularity = url.searchParams.get('granularity');
  const period = url.searchParams.get('period')?.trim() ?? '';
  if (granularity !== 'week' && granularity !== 'month' && granularity !== 'year') {
    throw new DemoRequestError(422, 'demo.creator.invalid_granularity', 'A supported analytics granularity is required.');
  }
  if (!period) throw new DemoRequestError(422, 'demo.creator.invalid_period', 'An analytics period is required.');
  const snapshot = await creatorContent(repository);
  const published = snapshot.content.filter((content) => content.data.status === 'published');
  const points = Array.from({ length: granularity === 'week' ? 7 : granularity === 'month' ? 12 : 10 }, (_, index) => ({
    key: `${period}-${String(index + 1).padStart(2, '0')}`,
    label: String(index + 1),
    reads: published.length * 9 + index * 3,
    likes: snapshot.relations.filter((relation) => relation.kind === 'like').length + (index % 3),
    favorites: snapshot.relations.filter((relation) => relation.kind === 'collection').length + (index % 2),
    newFollowers: index % 4 === 0 ? 1 : 0,
  }));
  const periodReads = points.reduce((sum, point) => sum + point.reads, 0);
  return {
    granularity,
    period,
    start: published[0]?.data.createdAt ?? snapshot.clock,
    end: snapshot.clock,
    cumulativeReads: periodReads + published.length * 320,
    periodReads,
    readHistoryStart: published[0]?.data.createdAt ?? snapshot.clock,
    topWorks: published.slice(0, 5).map((content) => ({
      id: String(1_000 + content.data.sortOrder),
      slug: content.data.slug,
      title: content.data.title,
      contentType: content.data.type,
      reads: 320 - Math.min(content.data.sortOrder, 250),
    })),
    points,
  };
}

export async function demoCreatorContributions(request: Request, repository: DemoRepository) {
  requireMember(request);
  const snapshot = await creatorContent(repository);
  const end = new Date(snapshot.clock).getTime();
  return Array.from({ length: 91 }, (_, index) => ({
    timestamp: Math.floor((end - (90 - index) * 86_400_000) / 1_000),
    contributions: (index + snapshot.content.length) % 5,
  }));
}
