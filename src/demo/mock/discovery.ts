import type {
  DemoBlobRecord,
  DemoCommentEntity,
  DemoContentEntity,
  DemoEntityRecord,
  DemoPreferenceRecord,
  DemoRelationRecord,
  DemoRepository,
  DemoTagEntity,
  DemoUserEntity,
} from '@/demo/repository';
import type { ApiSchemas } from '@/generated/api-contract';
import { demoProfilePreferenceKey } from '@/demo/identity';
import { markdownToHtml } from '@/utils/blogBody';
import { demoStoredMarkdownBody } from './markdownRender';
import {
  DemoRequestError,
  normalizedDemoQuery,
  paginateDemoItems,
  readDemoPagination,
  stableDemoSort,
} from './request';

const demoMemberId = 'demo-user-member';
const fallbackClock = '2026-06-01T12:00:00.000Z';

type DemoCollectionFolderPayload = Readonly<{
  id: string;
  parentId?: string;
  name: string;
  position: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}>;

type DemoDiscoverySnapshot = Readonly<{
  entities: readonly DemoEntityRecord[];
  relations: readonly DemoRelationRecord[];
  blobs: readonly DemoBlobRecord[];
  preferences: readonly DemoPreferenceRecord[];
  users: readonly DemoUserEntity[];
  tags: readonly DemoTagEntity[];
  content: readonly DemoContentEntity[];
  comments: readonly DemoCommentEntity[];
  clock: string;
}>;

type DemoIndexes = Readonly<{
  userIds: ReadonlyMap<string, string>;
  tagIds: ReadonlyMap<string, string>;
  contentIds: ReadonlyMap<string, string>;
  users: ReadonlyMap<string, DemoUserEntity>;
  tags: ReadonlyMap<string, DemoTagEntity>;
  content: ReadonlyMap<string, DemoContentEntity>;
  blobs: ReadonlyMap<string, DemoBlobRecord>;
}>;

function seconds(value: string): number {
  return Math.floor(new Date(value).getTime() / 1_000);
}

function pageParameters(searchParams: URLSearchParams, pageSize = 20): URLSearchParams {
  const normalized = new URLSearchParams(searchParams);
  if (!normalized.has('size')) {
    const alias = normalized.get('page_size') ?? normalized.get('limit');
    if (alias) normalized.set('size', alias);
  }
  if (!normalized.has('size')) normalized.set('size', String(pageSize));
  return normalized;
}

function preferenceObject(value: DemoPreferenceRecord['value'] | undefined): Readonly<Record<string, unknown>> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : null;
}

async function readSnapshot(repository: DemoRepository): Promise<DemoDiscoverySnapshot> {
  const value = await repository.transaction(
    ['entities', 'relations', 'blobs', 'preferences'],
    'readonly',
    async (transaction) => ({
      entities: await transaction.getAll('entities'),
      relations: await transaction.getAll('relations'),
      blobs: await transaction.getAll('blobs'),
      preferences: await transaction.getAll('preferences'),
      clock: await transaction.get('preferences', 'demo.seed.feature-clock'),
    }),
  );
  const entities = stableDemoSort(value.entities, (left, right) => left.key.localeCompare(right.key));
  return Object.freeze({
    entities,
    relations: stableDemoSort(value.relations, (left, right) => left.key.localeCompare(right.key)),
    blobs: stableDemoSort(value.blobs, (left, right) => left.key.localeCompare(right.key)),
    preferences: stableDemoSort(value.preferences, (left, right) => left.key.localeCompare(right.key)),
    users: entities.filter((entity): entity is DemoUserEntity => entity.kind === 'user'),
    tags: entities.filter((entity): entity is DemoTagEntity => entity.kind === 'tag'),
    content: stableDemoSort(
      entities.filter((entity): entity is DemoContentEntity => entity.kind === 'content'),
      (left, right) => left.data.sortOrder - right.data.sortOrder || left.key.localeCompare(right.key),
    ),
    comments: stableDemoSort(
      entities.filter((entity): entity is DemoCommentEntity => entity.kind === 'comment'),
      (left, right) => left.data.createdAt.localeCompare(right.data.createdAt) || left.key.localeCompare(right.key),
    ),
    clock: typeof value.clock?.value === 'string' ? value.clock.value : fallbackClock,
  });
}

function indexes(snapshot: DemoDiscoverySnapshot): DemoIndexes {
  return Object.freeze({
    userIds: new Map(snapshot.users.map((user, index) => [user.id, String(101 + index)])),
    tagIds: new Map(snapshot.tags.map((tag, index) => [tag.id, String(201 + index)])),
    contentIds: new Map(snapshot.content.map((content) => [content.id, String(1_000 + content.data.sortOrder)])),
    users: new Map(snapshot.users.map((user) => [user.id, user])),
    tags: new Map(snapshot.tags.map((tag) => [tag.id, tag])),
    content: new Map(snapshot.content.map((content) => [content.id, content])),
    blobs: new Map(snapshot.blobs.map((blob) => [blob.key, blob])),
  });
}

function svgDataUrl(blob: DemoBlobRecord | undefined): string {
  if (!blob || blob.type !== 'image/svg+xml') return '';
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new TextDecoder().decode(blob.bytes))}`;
}

function asset(snapshotIndexes: DemoIndexes, reference: string | null): string {
  if (!reference) return '';
  return svgDataUrl(snapshotIndexes.blobs.get(reference.replace(/^demo-asset:/, '')));
}

function memberRequest(request: Request): boolean {
  return request.headers.get('x-rinspace-demo-persona') === 'member';
}

function requireMember(request: Request): void {
  if (!memberRequest(request)) {
    throw new DemoRequestError(401, 'authentication.required', 'Demo member persona is required.');
  }
}

function publicContentId(content: DemoContentEntity, snapshotIndexes: DemoIndexes): string {
  return snapshotIndexes.contentIds.get(content.id) ?? content.id;
}

function publicUserId(user: DemoUserEntity, snapshotIndexes: DemoIndexes): string {
  return snapshotIndexes.userIds.get(user.id) ?? user.id;
}

function publicTagId(tag: DemoTagEntity, snapshotIndexes: DemoIndexes): string {
  return snapshotIndexes.tagIds.get(tag.id) ?? tag.id;
}

function resolveContent(
  reference: string,
  snapshot: DemoDiscoverySnapshot,
  snapshotIndexes: DemoIndexes,
): DemoContentEntity | null {
  const normalized = decodeURIComponent(reference).trim();
  return snapshot.content.find((content) => (
    content.id === normalized
    || content.data.slug === normalized
    || publicContentId(content, snapshotIndexes) === normalized
  )) ?? null;
}

function resolveTag(
  reference: string,
  snapshot: DemoDiscoverySnapshot,
  snapshotIndexes: DemoIndexes,
): DemoTagEntity | null {
  const normalized = decodeURIComponent(reference).trim();
  return snapshot.tags.find((tag) => (
    tag.id === normalized
    || tag.data.slug === normalized
    || tag.data.name === normalized
    || publicTagId(tag, snapshotIndexes) === normalized
  )) ?? null;
}

function resolveUser(
  reference: string,
  snapshot: DemoDiscoverySnapshot,
  snapshotIndexes: DemoIndexes,
): DemoUserEntity | null {
  const normalized = decodeURIComponent(reference).trim();
  return snapshot.users.find((user) => (
    user.id === normalized
    || user.data.username === normalized
    || publicUserId(user, snapshotIndexes) === normalized
  )) ?? null;
}

function relationCount(snapshot: DemoDiscoverySnapshot, kind: DemoRelationRecord['kind'], targetId: string): number {
  return snapshot.relations.filter((relation) => relation.kind === kind && relation.targetId === targetId).length;
}

function memberRelation(snapshot: DemoDiscoverySnapshot, kind: DemoRelationRecord['kind'], targetId: string): boolean {
  return snapshot.relations.some((relation) => (
    relation.kind === kind
    && relation.sourceId === demoMemberId
    && relation.targetId === targetId
  ));
}

function userPayload(user: DemoUserEntity, snapshotIndexes: DemoIndexes) {
  return {
    id: publicUserId(user, snapshotIndexes),
    username: user.data.username,
    rank: user.id === demoMemberId ? 17 : user.data.locale === 'zh-CN' ? 14 : 11,
    display_name: user.data.displayName,
    avatar: asset(snapshotIndexes, user.data.avatarUrl),
    status: 'normal',
  };
}

function tagPayload(tag: DemoTagEntity, snapshot: DemoDiscoverySnapshot, snapshotIndexes: DemoIndexes) {
  const tagged = snapshot.content.filter((content) => content.data.tags.includes(tag.id));
  const follows = relationCount(snapshot, 'follow', tag.id);
  return {
    tag_id: publicTagId(tag, snapshotIndexes),
    slug_name: tag.data.slug,
    display_name: tag.data.name,
    description: tag.data.description,
    excerpt: tag.data.description,
    original_text: tag.data.description,
    parsed_text: `<p>${tag.data.description}</p>`,
    follow_count: follows,
    question_count: tagged.filter((content) => content.data.type === 'question').length,
    is_follower: memberRelation(snapshot, 'follow', tag.id),
    created_at: seconds(tag.updatedAt),
    updated_at: seconds(tag.updatedAt),
    recommend: true,
    reserved: false,
    repository_state: 'active',
    repository_id: Number(publicTagId(tag, snapshotIndexes)),
    usage_excerpt: tag.data.description,
  };
}

function contentMetrics(content: DemoContentEntity, snapshot: DemoDiscoverySnapshot) {
  const commentCount = snapshot.comments.filter((comment) => comment.data.targetId === content.id).length;
  const likeCount = relationCount(snapshot, 'like', content.id);
  const collectionCount = relationCount(snapshot, 'collection', content.id);
  const readPreference = snapshot.preferences.find((item) => item.key === `demo.read.${content.id}`);
  const readPreferenceValue = preferenceObject(readPreference?.value);
  const recordedReads = typeof readPreferenceValue?.count === 'number'
    ? readPreferenceValue.count
    : 0;
  const readCount = 320 - content.data.sortOrder + commentCount * 7 + recordedReads;
  return { commentCount, likeCount, collectionCount, readCount };
}

function feedPayload(
  content: DemoContentEntity,
  snapshot: DemoDiscoverySnapshot,
  snapshotIndexes: DemoIndexes,
) {
  const author = snapshotIndexes.users.get(content.data.authorId);
  const tags = content.data.tags
    .map((tagId) => snapshotIndexes.tags.get(tagId))
    .filter((tag): tag is DemoTagEntity => Boolean(tag));
  const metrics = contentMetrics(content, snapshot);
  const authorName = author?.data.displayName ?? 'Rinspace Demo Member';
  const coverUrl = content.id === 'demo-content-mobile-edge'
    ? 'data:image/png;base64,AA=='
    : asset(snapshotIndexes, content.data.coverAssetKey);
  const book = content.data.type === 'book' ? {
    kind: 'original',
    bookTitle: content.data.title,
    authors: [authorName],
    topics: tags.map((tag) => tag.data.name),
    keywords: tags.map((tag) => tag.data.slug),
    toc: [
      { title: '把状态写成向量', page: 1, level: 2 },
      { title: '误差不会自动解释自己', page: 2, level: 2 },
      { title: '回到同一个起点', page: 3, level: 2 },
    ],
  } : undefined;
  return {
    id: publicContentId(content, snapshotIndexes),
    revisionId: `demo-revision-${publicContentId(content, snapshotIndexes)}`,
    type: content.data.type,
    status: content.data.status,
    repositoryStatus: content.data.status,
    sourceVisibility: content.data.status === 'published' ? 'open' : 'private',
    title: content.data.title,
    author: authorName,
    authorId: author ? publicUserId(author, snapshotIndexes) : undefined,
    authorUid: author?.id,
    authorAvatar: author ? asset(snapshotIndexes, author.data.avatarUrl) : '',
    authorRank: author?.id === demoMemberId ? 17 : 12,
    createdAt: content.data.createdAt,
    updatedAt: content.updatedAt,
    publishedAt: content.data.publishedAt ?? undefined,
    contentUpdatedAt: content.updatedAt,
    meta: content.data.locale === 'zh-CN' ? '合成演示内容' : 'Synthetic demo content',
    excerpt: content.data.summary,
    tags: tags.map((tag) => tag.data.name),
    tag_items: tags.map((tag) => ({
      tag_id: publicTagId(tag, snapshotIndexes),
      slug_name: tag.data.slug,
      display_name: tag.data.name,
    })),
    images: coverUrl ? [coverUrl] : [],
    coverUrl,
    editor: content.data.format === 'markdown' ? 'markdown' : 'rin',
    markdownServerRender: false,
    interactions: `${metrics.readCount} 阅读 · ${metrics.commentCount} 评论`,
    heat: `${metrics.likeCount + metrics.commentCount + 1}°`,
    readCount: metrics.readCount,
    voteScore: metrics.likeCount,
    answerCount: content.data.type === 'question' ? metrics.commentCount : 0,
    commentCount: metrics.commentCount,
    replyCount: metrics.commentCount,
    favoriteCount: metrics.collectionCount,
    shareCount: 0,
    liked: memberRelation(snapshot, 'like', content.id),
    likeCount: metrics.likeCount,
    followCount: relationCount(snapshot, 'follow', content.id),
    isFollowed: memberRelation(snapshot, 'follow', content.id),
    reaction_summary: [
      {
        emoji: 'heart',
        count: metrics.likeCount,
        tooltip: '喜欢',
        is_active: memberRelation(snapshot, 'like', content.id),
      },
      { emoji: 'smile', count: 0, tooltip: '会心', is_active: false },
      { emoji: 'frown', count: 0, tooltip: '疑问', is_active: false },
    ],
    book,
    bookRating: content.data.type === 'book' ? {
      averageScore: 8.6,
      reviewCount: metrics.commentCount,
      breakdown: [],
    } : undefined,
  };
}

function compactPayload(
  content: DemoContentEntity,
  snapshot: DemoDiscoverySnapshot,
  snapshotIndexes: DemoIndexes,
) {
  const feed = feedPayload(content, snapshot, snapshotIndexes);
  return { ...feed, accent: content.data.type };
}

function publishedContent(snapshot: DemoDiscoverySnapshot): DemoContentEntity[] {
  return snapshot.content.filter((content) => content.data.status === 'published');
}

async function readerBody(content: DemoContentEntity): Promise<string> {
  if (content.data.type === 'question' || content.data.type === 'book') return content.data.body;
  if (content.data.body.includes('[[RIN_WRITER]]')) return content.data.body;
  if (content.data.format === 'markdown') {
    return demoStoredMarkdownBody(content.data.body, content.data.title, content.id);
  }
  return `[[RIN_WRITER]]\n${markdownToHtml(content.data.body, { deferMath: true })}\n[[/RIN_WRITER]]`;
}

function filterContent(
  request: Request,
  snapshot: DemoDiscoverySnapshot,
  snapshotIndexes: DemoIndexes,
  forcedType?: ApiSchemas['ContentType'],
): DemoContentEntity[] {
  const url = new URL(request.url);
  const requestedType = forcedType ?? url.searchParams.get('type');
  const allowedTypes = new Set<ApiSchemas['ContentType']>([
    'announcement', 'blog', 'book', 'discussion', 'dynamic', 'forum', 'question', 'status', 'tag', 'task',
  ]);
  if (requestedType && !allowedTypes.has(requestedType as ApiSchemas['ContentType'])) {
    throw new DemoRequestError(422, 'demo.invalid_content_type', 'The requested content type is not supported.', { field: 'type' });
  }
  const username = normalizedDemoQuery(url.searchParams.get('username'));
  const tagReference = url.searchParams.get('tag_id') ?? url.searchParams.get('tag');
  const tag = tagReference ? resolveTag(tagReference, snapshot, snapshotIndexes) : null;
  const includeDrafts = ['1', 'true'].includes((url.searchParams.get('include_drafts') ?? '').toLowerCase())
    && memberRequest(request);
  let items = snapshot.content.filter((content) => (
    (content.data.status === 'published' || (includeDrafts && content.data.authorId === demoMemberId))
    && (!requestedType || content.data.type === requestedType)
    && (!username || normalizedDemoQuery(snapshotIndexes.users.get(content.data.authorId)?.data.username ?? '') === username)
    && (!tagReference || (tag !== null && content.data.tags.includes(tag.id)))
  ));
  if (url.searchParams.get('order') === 'latest') {
    items = stableDemoSort(items, (left, right) => (
      right.data.createdAt.localeCompare(left.data.createdAt) || left.key.localeCompare(right.key)
    ));
  }
  return items;
}

export async function demoContentPage(request: Request, repository: DemoRepository, forcedType?: ApiSchemas['ContentType']) {
  const snapshot = await readSnapshot(repository);
  const snapshotIndexes = indexes(snapshot);
  const pagination = readDemoPagination(pageParameters(new URL(request.url).searchParams));
  const page = paginateDemoItems(filterContent(request, snapshot, snapshotIndexes, forcedType), pagination);
  return {
    ...page,
    items: page.items.map((content) => feedPayload(content, snapshot, snapshotIndexes)),
    generatedAt: snapshot.clock,
  };
}

export async function demoHomeFeed(request: Request, repository: DemoRepository) {
  const snapshot = await readSnapshot(repository);
  const snapshotIndexes = indexes(snapshot);
  const url = new URL(request.url);
  const mode = url.searchParams.get('mode') ?? 'hot';
  if (!['hot', 'latest', 'following', 'unanswered'].includes(mode)) {
    throw new DemoRequestError(422, 'demo.invalid_feed_mode', 'The requested feed mode is not supported.', { field: 'mode' });
  }
  let items = publishedContent(snapshot);
  if (mode === 'latest') {
    items = stableDemoSort(items, (left, right) => right.data.createdAt.localeCompare(left.data.createdAt));
  } else if (mode === 'following') {
    const followed = new Set(snapshot.relations
      .filter((relation) => relation.kind === 'follow' && relation.sourceId === demoMemberId)
      .map((relation) => relation.targetId));
    items = items.filter((content) => followed.has(content.data.authorId) || content.data.tags.some((tag) => followed.has(tag)));
  } else if (mode === 'unanswered') {
    items = items.filter((content) => content.data.type === 'question' && contentMetrics(content, snapshot).commentCount === 0);
  }
  const pagination = readDemoPagination(pageParameters(url.searchParams, 12));
  const stream = paginateDemoItems(items, pagination).items;
  const featured = publishedContent(snapshot).find((content) => content.data.type === 'blog');
  if (!featured) throw new DemoRequestError(500, 'demo.fixture.featured_missing', 'The demo fixture has no featured article.');
  return {
    featuredBlog: feedPayload(featured, snapshot, snapshotIndexes),
    stream: stream.map((content) => feedPayload(content, snapshot, snapshotIndexes)),
    questionHotlist: publishedContent(snapshot)
      .filter((content) => content.data.type === 'question')
      .map((content) => compactPayload(content, snapshot, snapshotIndexes)),
    community: publishedContent(snapshot)
      .filter((content) => ['discussion', 'dynamic', 'forum', 'status'].includes(content.data.type))
      .map((content) => compactPayload(content, snapshot, snapshotIndexes)),
    announcements: publishedContent(snapshot)
      .filter((content) => content.data.type === 'announcement')
      .map((content) => compactPayload(content, snapshot, snapshotIndexes)),
    tasks: publishedContent(snapshot)
      .filter((content) => content.data.type === 'task')
      .map((content) => compactPayload(content, snapshot, snapshotIndexes)),
    followedTags: snapshot.tags
      .filter((tag) => memberRelation(snapshot, 'follow', tag.id))
      .map((tag) => tag.data.name),
    generatedAt: snapshot.clock,
  };
}

export async function demoHomeSidebar(request: Request, repository: DemoRepository) {
  const snapshot = await readSnapshot(repository);
  const snapshotIndexes = indexes(snapshot);
  const limit = readDemoPagination(pageParameters(new URL(request.url).searchParams, 4)).pageSize;
  return {
    metrics: {
      todayReads: publishedContent(snapshot).reduce((total, content) => total + contentMetrics(content, snapshot).readCount, 0),
      todayNewFans: snapshot.relations.filter((relation) => relation.kind === 'follow').length,
    },
    hotDiscussions: publishedContent(snapshot)
      .filter((content) => ['discussion', 'question'].includes(content.data.type))
      .slice(0, limit)
      .map((content) => compactPayload(content, snapshot, snapshotIndexes)),
    recommendedUsers: snapshot.users.slice(0, limit).map((user) => userPayload(user, snapshotIndexes)),
    source: 'demo-repository',
    generatedAt: snapshot.clock,
  };
}

export async function demoKnowledgeGraph(repository: DemoRepository) {
  const snapshot = await readSnapshot(repository);
  const snapshotIndexes = indexes(snapshot);
  return {
    nodes: [
      ...snapshot.tags.map((tag) => ({
        id: `tag-${publicTagId(tag, snapshotIndexes)}`,
        kind: 'tag',
        label: tag.data.name,
        slug: tag.data.slug,
        url: `/tags/${publicTagId(tag, snapshotIndexes)}/${tag.data.slug}`,
        count: snapshot.content.filter((content) => content.data.tags.includes(tag.id)).length,
        weight: 2,
      })),
      ...publishedContent(snapshot).map((content) => ({
        id: `content-${publicContentId(content, snapshotIndexes)}`,
        kind: 'content',
        label: content.data.title,
        type: content.data.type,
        slug: content.data.slug,
        url: `/${content.data.type}/${publicContentId(content, snapshotIndexes)}/${content.data.slug}`,
        author: snapshotIndexes.users.get(content.data.authorId)?.data.displayName ?? '',
        meta: content.data.summary,
        tags: content.data.tags.map((id) => snapshotIndexes.tags.get(id)?.data.name ?? id),
        weight: 1,
      })),
    ],
    edges: snapshot.relations
      .filter((relation) => relation.kind === 'tag-content')
      .map((relation) => ({
        id: relation.key,
        source: `tag-${snapshotIndexes.tagIds.get(relation.sourceId) ?? relation.sourceId}`,
        target: `content-${snapshotIndexes.contentIds.get(relation.targetId) ?? relation.targetId}`,
        kind: 'tag-content',
      })),
    generatedAt: snapshot.clock,
  };
}

export async function demoContentDetail(reference: string, repository: DemoRepository, request?: Request) {
  const snapshot = await readSnapshot(repository);
  const snapshotIndexes = indexes(snapshot);
  const content = resolveContent(reference, snapshot, snapshotIndexes);
  const canReadPrivate = Boolean(request && memberRequest(request) && content?.data.authorId === demoMemberId);
  if (!content || (content.data.status !== 'published' && !canReadPrivate)) {
    throw new DemoRequestError(404, 'demo.content.not_found', 'The requested demo content was not found.');
  }
  return {
    ...feedPayload(content, snapshot, snapshotIndexes),
    slug: content.data.slug,
    body: await readerBody(content),
    readCount: contentMetrics(content, snapshot).readCount,
    collected: memberRelation(snapshot, 'collection', content.id),
    createdAt: content.data.createdAt,
    updatedAt: content.updatedAt,
  };
}

export async function demoQuestionDetail(reference: string, repository: DemoRepository) {
  const snapshot = await readSnapshot(repository);
  const snapshotIndexes = indexes(snapshot);
  const content = resolveContent(reference, snapshot, snapshotIndexes);
  if (!content || content.data.type !== 'question' || content.data.status !== 'published') {
    throw new DemoRequestError(404, 'demo.question.not_found', 'The requested demo question was not found.');
  }
  const questionId = Number(publicContentId(content, snapshotIndexes));
  const answers = snapshot.comments
    .filter((comment) => comment.data.targetId === content.id)
    .map((comment, index) => {
      const author = snapshotIndexes.users.get(comment.data.authorId);
      return {
        id: 3_001 + index,
        questionId,
        author: author?.data.displayName ?? 'Rinspace Demo Member',
        authorId: author ? publicUserId(author, snapshotIndexes) : undefined,
        authorAvatar: author ? asset(snapshotIndexes, author.data.avatarUrl) : '',
        authorRank: 12,
        body: comment.data.body,
        html: `<p>${comment.data.body}</p>`,
        accepted: index === 0,
        voteCount: index === 0 ? 2 : 0,
        commentCount: 0,
        status: 1,
        createdAt: comment.data.createdAt,
        updatedAt: comment.updatedAt,
      };
    });
  return {
    question: {
      ...feedPayload(content, snapshot, snapshotIndexes),
      slug: content.data.slug,
      createdAt: content.data.createdAt,
      updatedAt: content.updatedAt,
      viewCount: contentMetrics(content, snapshot).readCount,
      voteCount: contentMetrics(content, snapshot).likeCount,
      answerCount: answers.length,
      followCount: relationCount(snapshot, 'follow', content.id),
      isFollowed: memberRelation(snapshot, 'follow', content.id),
      collected: memberRelation(snapshot, 'collection', content.id),
      acceptedAnswerId: answers[0]?.id ?? 0,
      lastAnswerId: answers.at(-1)?.id ?? 0,
      status: 1,
      pin: 0,
      show: 1,
    },
    body: content.data.body,
    answers,
  };
}

function answerQuestionPayload(
  content: DemoContentEntity,
  snapshot: DemoDiscoverySnapshot,
  snapshotIndexes: DemoIndexes,
) {
  const author = snapshotIndexes.users.get(content.data.authorId);
  const metrics = contentMetrics(content, snapshot);
  return {
    id: publicContentId(content, snapshotIndexes),
    title: content.data.title,
    url_title: content.data.slug,
    description: content.data.summary,
    tags: content.data.tags.map((tagId) => {
      const tag = snapshotIndexes.tags.get(tagId);
      return { slug_name: tag?.data.slug ?? tagId, display_name: tag?.data.name ?? tagId };
    }),
    vote_count: metrics.likeCount,
    answer_count: metrics.commentCount,
    accepted_answer_id: metrics.commentCount ? '3001' : '',
    create_time: seconds(content.data.createdAt),
    update_time: seconds(content.updatedAt),
    status: 1,
    user_info: author ? userPayload(author, snapshotIndexes) : undefined,
  };
}

export async function demoQuestionPage(request: Request, repository: DemoRepository) {
  const snapshot = await readSnapshot(repository);
  const snapshotIndexes = indexes(snapshot);
  const url = new URL(request.url);
  const pagination = readDemoPagination(pageParameters(url.searchParams));
  const tagReference = url.searchParams.get('tag_id') ?? url.searchParams.get('tag');
  const tag = tagReference ? resolveTag(tagReference, snapshot, snapshotIndexes) : null;
  const questions = publishedContent(snapshot).filter((content) => (
    content.data.type === 'question'
    && (!tagReference || (tag !== null && content.data.tags.includes(tag.id)))
  ));
  const page = paginateDemoItems(questions, pagination);
  return { count: page.count, items: page.items.map((content) => answerQuestionPayload(content, snapshot, snapshotIndexes)) };
}

export async function demoSearch(request: Request, repository: DemoRepository) {
  const snapshot = await readSnapshot(repository);
  const snapshotIndexes = indexes(snapshot);
  const url = new URL(request.url);
  const query = normalizedDemoQuery(url.searchParams.get('q'));
  if (!query) throw new DemoRequestError(422, 'demo.search.query_required', 'A search query is required.', { field: 'q' });
  const type = url.searchParams.get('type') ?? 'all';
  const order = url.searchParams.get('order') ?? 'relevance';
  const allowedTypes = new Set(['all', 'question', 'answer', 'tag', 'user', 'post', 'blog', 'book', 'discussion', 'dynamic', 'forum', 'status']);
  if (!allowedTypes.has(type)) throw new DemoRequestError(422, 'demo.search.invalid_type', 'The search type is not supported.', { field: 'type' });
  const includes = (...parts: string[]) => normalizedDemoQuery(parts.join(' ')).includes(query);
  const contentResults = publishedContent(snapshot)
    .filter((content) => (
      (type === 'all' || type === 'post' || type === content.data.type)
      && includes(content.data.title, content.data.summary, content.data.body, ...content.data.tags.map((id) => snapshotIndexes.tags.get(id)?.data.name ?? ''))
    ))
    .map((content) => {
      const author = snapshotIndexes.users.get(content.data.authorId);
      const metrics = contentMetrics(content, snapshot);
      return {
        objectType: content.data.type,
        id: publicContentId(content, snapshotIndexes),
        slug: content.data.slug,
        title: content.data.title,
        excerpt: content.data.summary,
        author: author?.data.displayName ?? 'Rinspace Demo Member',
        avatarUrl: author ? asset(snapshotIndexes, author.data.avatarUrl) : '',
        tags: content.data.tags.map((id) => snapshotIndexes.tags.get(id)?.data.name ?? id),
        voteCount: metrics.likeCount,
        answerCount: content.data.type === 'question' ? metrics.commentCount : 0,
        createdAt: content.data.createdAt,
        updatedAt: content.updatedAt,
      };
    });
  const tagResults = type === 'all' || type === 'tag' ? snapshot.tags
    .filter((tag) => includes(tag.data.name, tag.data.slug, tag.data.description))
    .map((tag) => ({
      objectType: 'tag',
      id: publicTagId(tag, snapshotIndexes),
      slug: tag.data.slug,
      title: tag.data.name,
      excerpt: tag.data.description,
      author: 'Rinspace Demo',
      voteCount: snapshot.content.filter((content) => content.data.tags.includes(tag.id)).length,
      createdAt: tag.updatedAt,
      updatedAt: tag.updatedAt,
    })) : [];
  const userResults = type === 'all' || type === 'user' ? snapshot.users
    .filter((user) => includes(user.data.displayName, user.data.username, user.data.bio, user.data.headline))
    .map((user) => ({
      objectType: 'user',
      id: publicUserId(user, snapshotIndexes),
      userId: user.data.username,
      title: user.data.displayName,
      excerpt: user.data.bio,
      author: user.data.username,
      avatarUrl: asset(snapshotIndexes, user.data.avatarUrl),
      voteCount: relationCount(snapshot, 'follow', user.id),
      createdAt: user.updatedAt,
      updatedAt: user.updatedAt,
    })) : [];
  let results = [...contentResults, ...tagResults, ...userResults];
  if (order === 'newest' || order === 'active') {
    results = stableDemoSort(results, (left, right) => right.updatedAt.localeCompare(left.updatedAt));
  } else if (order === 'score') {
    results = stableDemoSort(results, (left, right) => right.voteCount - left.voteCount);
  }
  const page = paginateDemoItems(results, readDemoPagination(pageParameters(url.searchParams, 10)));
  return { count: page.count, items: page.items };
}

export async function demoTagPage(request: Request, repository: DemoRepository) {
  const snapshot = await readSnapshot(repository);
  const snapshotIndexes = indexes(snapshot);
  const url = new URL(request.url);
  const query = normalizedDemoQuery(url.searchParams.get('slug_name'));
  let tags = snapshot.tags.filter((tag) => !query || normalizedDemoQuery(`${tag.data.slug} ${tag.data.name}`).includes(query));
  if (url.searchParams.get('query_cond') !== 'newest') {
    tags = stableDemoSort(tags, (left, right) => (
      relationCount(snapshot, 'follow', right.id) - relationCount(snapshot, 'follow', left.id)
      || left.key.localeCompare(right.key)
    ));
  } else {
    tags = stableDemoSort(tags, (left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }
  const page = paginateDemoItems(tags, readDemoPagination(pageParameters(url.searchParams, 36)));
  return {
    count: page.count,
    page: page.page,
    page_size: page.pageSize,
    items: page.items.map((tag) => tagPayload(tag, snapshot, snapshotIndexes)),
  };
}

export async function demoTagDirectory(request: Request, repository: DemoRepository) {
  const snapshot = await readSnapshot(repository);
  const snapshotIndexes = indexes(snapshot);
  const url = new URL(request.url);
  const view = url.searchParams.get('view') ?? 'all';
  if (!['all', 'unclassified', 'review', 'repository'].includes(view)) {
    throw new DemoRequestError(422, 'demo.tags.invalid_view', 'The tag directory view is not supported.', { field: 'view' });
  }
  const parentTagId = Number(url.searchParams.get('parentId') ?? 0);
  const parentRelations = snapshot.relations.filter((relation) => relation.kind === 'parent');
  let tags = snapshot.tags;
  if (parentTagId > 0) {
    const parent = resolveTag(String(parentTagId), snapshot, snapshotIndexes);
    tags = parent ? tags.filter((tag) => parentRelations.some((relation) => relation.sourceId === tag.id && relation.targetId === parent.id)) : [];
  } else if (view === 'unclassified') {
    tags = tags.filter((tag) => !parentRelations.some((relation) => relation.sourceId === tag.id));
  }
  return {
    view,
    parentTagId,
    items: tags.map((tag) => ({
      id: Number(publicTagId(tag, snapshotIndexes)),
      displayName: tag.data.name,
      usageScope: tag.data.description,
      parentTagIds: parentRelations
        .filter((relation) => relation.sourceId === tag.id)
        .map((relation) => Number(snapshotIndexes.tagIds.get(relation.targetId) ?? 0))
        .filter(Boolean),
      lifecycleState: 'active',
      reviewState: view === 'review' ? 'unreviewed' : 'reviewed',
      repositoryState: 'active',
      repositoryId: Number(publicTagId(tag, snapshotIndexes)),
      version: 1,
    })),
  };
}

export async function demoTagDetail(request: Request, repository: DemoRepository) {
  const snapshot = await readSnapshot(repository);
  const snapshotIndexes = indexes(snapshot);
  const url = new URL(request.url);
  const reference = url.searchParams.get('tag_id') ?? url.searchParams.get('tag_name') ?? '';
  const tag = resolveTag(reference, snapshot, snapshotIndexes);
  if (!tag) throw new DemoRequestError(404, 'demo.tag.not_found', 'The requested demo tag was not found.');
  const basic = tagPayload(tag, snapshot, snapshotIndexes);
  return {
    id: Number(publicTagId(tag, snapshotIndexes)),
    tag_id: basic.tag_id,
    slug: tag.data.slug,
    slug_name: tag.data.slug,
    name: tag.data.name,
    displayName: tag.data.name,
    excerpt: tag.data.description,
    originalText: tag.data.description,
    parsedText: `<p>${tag.data.description}</p>`,
    html: `<p>${tag.data.description}</p>`,
    followCount: basic.follow_count,
    questionCount: basic.question_count,
    status: 1,
    createdAt: tag.updatedAt,
    updatedAt: tag.updatedAt,
    repository_state: 'active',
    repository_id: Number(publicTagId(tag, snapshotIndexes)),
    usage_excerpt: tag.data.description,
    parent_tags: [],
    outgoing_references: [],
    incoming_references: [],
    outgoing_object_references: [],
    incoming_object_references: [],
  };
}

export async function demoTagStats(request: Request, repository: DemoRepository) {
  const snapshot = await readSnapshot(repository);
  const snapshotIndexes = indexes(snapshot);
  const url = new URL(request.url);
  const reference = url.searchParams.get('tag_id') ?? url.searchParams.get('tag_name') ?? '';
  const tag = resolveTag(reference, snapshot, snapshotIndexes);
  if (!tag) throw new DemoRequestError(404, 'demo.tag.not_found', 'The requested demo tag was not found.');
  const content = publishedContent(snapshot).filter((item) => item.data.tags.includes(tag.id));
  return {
    tag_id: publicTagId(tag, snapshotIndexes),
    slug_name: tag.data.slug,
    total: content.length,
    questions: content.filter((item) => item.data.type === 'question').length,
    blogs: content.filter((item) => item.data.type === 'blog').length,
    discussions: content.filter((item) => ['discussion', 'forum'].includes(item.data.type)).length,
    dynamics: content.filter((item) => ['dynamic', 'status'].includes(item.data.type)).length,
    announcements: content.filter((item) => item.data.type === 'announcement').length,
  };
}

export async function demoTagActivity(request: Request, repository: DemoRepository) {
  const page = await demoContentPage(request, repository);
  return { items: page.items };
}

export async function demoFollowingTags(request: Request, repository: DemoRepository) {
  requireMember(request);
  const snapshot = await readSnapshot(repository);
  const snapshotIndexes = indexes(snapshot);
  return {
    items: snapshot.tags
      .filter((tag) => memberRelation(snapshot, 'follow', tag.id))
      .map((tag) => ({
        tag_id: publicTagId(tag, snapshotIndexes),
        slug_name: tag.data.slug,
        display_name: tag.data.name,
        main_tag_slug_name: '',
        recommend: true,
        reserved: false,
      })),
  };
}

export async function demoUserRanking(repository: DemoRepository) {
  const snapshot = await readSnapshot(repository);
  const snapshotIndexes = indexes(snapshot);
  const users = snapshot.users.map((user) => ({
    ...userPayload(user, snapshotIndexes),
    vote_count: snapshot.relations.filter((relation) => relation.sourceId === user.id && relation.kind === 'like').length,
  }));
  return {
    users_with_the_most_reputation: stableDemoSort(users, (left, right) => right.rank - left.rank),
    users_with_the_most_vote: stableDemoSort(users, (left, right) => right.vote_count - left.vote_count),
    staffs: [],
  };
}

function commentPayload(
  comment: DemoCommentEntity,
  index: number,
  targetType: string,
  targetId: number,
  snapshotIndexes: DemoIndexes,
) {
  const author = snapshotIndexes.users.get(comment.data.authorId);
  return {
    id: 3_001 + index,
    targetType,
    targetId,
    author: author?.data.displayName ?? 'Rinspace Demo Member',
    authorId: author ? publicUserId(author, snapshotIndexes) : undefined,
    authorUid: author?.id,
    authorAvatar: author ? asset(snapshotIndexes, author.data.avatarUrl) : '',
    authorRank: author?.id === demoMemberId ? 17 : 12,
    body: comment.data.body,
    voteCount: 0,
    upVoteCount: 0,
    downVoteCount: 0,
    viewerVoteStatus: 'none',
    createdAt: comment.data.createdAt,
    updatedAt: comment.updatedAt,
  };
}

function commentTarget(
  targetType: string,
  targetId: string,
  slug: string,
  snapshot: DemoDiscoverySnapshot,
  snapshotIndexes: DemoIndexes,
): DemoContentEntity | null {
  if (slug) return resolveContent(slug, snapshot, snapshotIndexes);
  if (targetId) return resolveContent(targetId, snapshot, snapshotIndexes);
  return targetType ? null : null;
}

export async function demoComments(request: Request, repository: DemoRepository) {
  const snapshot = await readSnapshot(repository);
  const snapshotIndexes = indexes(snapshot);
  const url = new URL(request.url);
  const targetType = url.searchParams.get('targetType') ?? 'post';
  const requestedTargetId = url.searchParams.get('targetId') ?? '';
  if (targetType === 'answer') {
    if (!/^\d+$/.test(requestedTargetId)) {
      throw new DemoRequestError(422, 'demo.comment.invalid_answer_id', 'A numeric answer ID is required.', { field: 'targetId' });
    }
    const matching = snapshot.comments.filter((comment) => comment.data.targetId === `demo-answer-${requestedTargetId}`);
    const page = paginateDemoItems(matching, readDemoPagination(pageParameters(url.searchParams, 24)));
    return {
      items: page.items.map((comment) => commentPayload(
        comment,
        snapshot.comments.findIndex((item) => item.id === comment.id),
        targetType,
        Number(requestedTargetId),
        snapshotIndexes,
      )),
      count: page.count,
      page: page.page,
      pageSize: page.pageSize,
    };
  }
  const target = commentTarget(
    targetType,
    requestedTargetId,
    url.searchParams.get('slug') ?? '',
    snapshot,
    snapshotIndexes,
  );
  if (!target) throw new DemoRequestError(404, 'demo.comment.target_not_found', 'The comment target was not found.');
  const matching = snapshot.comments.filter((comment) => comment.data.targetId === target.id);
  const page = paginateDemoItems(matching, readDemoPagination(pageParameters(url.searchParams, 24)));
  return {
    items: page.items.map((comment) => commentPayload(
      comment,
      snapshot.comments.findIndex((item) => item.id === comment.id),
      targetType,
      Number(publicContentId(target, snapshotIndexes)),
      snapshotIndexes,
    )),
    count: page.count,
    page: page.page,
    pageSize: page.pageSize,
  };
}

async function jsonObject(request: Request): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new DemoRequestError(422, 'demo.invalid_json', 'A JSON request body is required.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DemoRequestError(422, 'demo.invalid_json', 'A JSON object request body is required.');
  }
  return value as Record<string, unknown>;
}

export async function demoCreateComment(request: Request, repository: DemoRepository) {
  requireMember(request);
  const input = await jsonObject(request);
  const body = typeof input.body === 'string' ? input.body.trim() : '';
  if (body.length < 2 || body.length > 2_000) {
    throw new DemoRequestError(422, 'demo.comment.invalid_body', 'Comment body must contain between 2 and 2000 characters.', { field: 'body' });
  }
  const snapshot = await readSnapshot(repository);
  const snapshotIndexes = indexes(snapshot);
  const targetType = typeof input.targetType === 'string' ? input.targetType : 'post';
  const target = commentTarget(
    targetType,
    typeof input.targetId === 'number' || typeof input.targetId === 'string' ? String(input.targetId) : '',
    typeof input.slug === 'string' ? input.slug : '',
    snapshot,
    snapshotIndexes,
  );
  if (!target) throw new DemoRequestError(404, 'demo.comment.target_not_found', 'The comment target was not found.');
  const localIndex = snapshot.comments.filter((comment) => comment.id.startsWith('demo-comment-local-')).length + 1;
  const createdAt = new Date(new Date(snapshot.clock).getTime() + localIndex * 60_000).toISOString();
  const record: DemoCommentEntity = {
    key: `comment:demo-comment-local-${localIndex}`,
    kind: 'comment',
    id: `demo-comment-local-${localIndex}`,
    updatedAt: createdAt,
    data: {
      targetId: target.id,
      authorId: demoMemberId,
      body,
      createdAt,
      locale: 'zh-CN',
    },
  };
  await repository.transaction(['entities'], 'readwrite', (transaction) => transaction.put('entities', record));
  return commentPayload(
    record,
    snapshot.comments.length,
    targetType,
    Number(publicContentId(target, snapshotIndexes)),
    snapshotIndexes,
  );
}

function targetFromInput(
  input: Record<string, unknown>,
  snapshot: DemoDiscoverySnapshot,
  snapshotIndexes: DemoIndexes,
): Readonly<{ kind: 'content' | 'tag' | 'user'; id: string; publicId: string }> | null {
  const targetType = typeof input.targetType === 'string'
    ? input.targetType
    : typeof input.object_type === 'string' ? input.object_type : 'content';
  const reference = typeof input.targetId === 'string' || typeof input.targetId === 'number'
    ? String(input.targetId)
    : typeof input.object_id === 'string' || typeof input.object_id === 'number'
      ? String(input.object_id)
      : typeof input.slug === 'string' ? input.slug : '';
  if (targetType === 'tag') {
    const tag = resolveTag(reference, snapshot, snapshotIndexes);
    return tag ? { kind: 'tag', id: tag.id, publicId: publicTagId(tag, snapshotIndexes) } : null;
  }
  if (targetType === 'user') {
    const user = resolveUser(reference, snapshot, snapshotIndexes);
    return user ? { kind: 'user', id: user.id, publicId: publicUserId(user, snapshotIndexes) } : null;
  }
  const content = resolveContent(reference, snapshot, snapshotIndexes);
  return content ? { kind: 'content', id: content.id, publicId: publicContentId(content, snapshotIndexes) } : null;
}

async function toggleRelation(
  request: Request,
  repository: DemoRepository,
  kind: 'collection' | 'follow' | 'like',
) {
  requireMember(request);
  const input = await jsonObject(request);
  const snapshot = await readSnapshot(repository);
  const snapshotIndexes = indexes(snapshot);
  const target = targetFromInput(input, snapshot, snapshotIndexes);
  if (!target) throw new DemoRequestError(404, `demo.${kind}.target_not_found`, 'The interaction target was not found.');
  const explicitCancel = input.isCancel === true || input.reaction === 'deactivate';
  const existing = snapshot.relations.find((relation) => (
    relation.kind === kind && relation.sourceId === demoMemberId && relation.targetId === target.id
  ));
  const active = explicitCancel ? false : !existing;
  const key = `demo-relation-${kind}-member-${target.kind}-${target.id.replace(/^demo-/, '')}`;
  await repository.transaction(['relations'], 'readwrite', async (transaction) => {
    if (active) {
      const relation: DemoRelationRecord = {
        key,
        kind,
        sourceKind: 'user',
        sourceId: demoMemberId,
        targetKind: target.kind,
        targetId: target.id,
        createdAt: snapshot.clock,
      };
      await transaction.put('relations', relation);
    } else if (existing) {
      await transaction.delete('relations', existing.key);
    }
  });
  const count = snapshot.relations.filter((relation) => relation.kind === kind && relation.targetId === target.id).length
    + (active && !existing ? 1 : 0)
    - (!active && existing ? 1 : 0);
  return { input, target, active, count };
}

export async function demoFollow(request: Request, repository: DemoRepository) {
  const result = await toggleRelation(request, repository, 'follow');
  return { targetType: result.target.kind, targetId: result.target.publicId, following: result.active, followerCount: result.count };
}

export async function demoCollection(request: Request, repository: DemoRepository) {
  const result = await toggleRelation(request, repository, 'collection');
  return {
    targetType: result.target.kind,
    targetId: result.target.publicId,
    bookmarked: result.active,
    collectionCount: result.count,
    collectionId: result.active ? `demo-collection-${result.target.publicId}` : undefined,
    folderId: 'demo-folder-default',
  };
}

export async function demoLike(request: Request, repository: DemoRepository) {
  const result = await toggleRelation(request, repository, 'like');
  return { targetType: result.target.kind, targetId: result.target.publicId, liked: result.active, likeCount: result.count };
}

export async function demoReactions(request: Request, repository: DemoRepository) {
  const snapshot = await readSnapshot(repository);
  const snapshotIndexes = indexes(snapshot);
  const url = new URL(request.url);
  const content = resolveContent(url.searchParams.get('object_id') ?? '', snapshot, snapshotIndexes);
  if (!content) throw new DemoRequestError(404, 'demo.reaction.target_not_found', 'The reaction target was not found.');
  const count = relationCount(snapshot, 'like', content.id);
  return {
    reaction_summary: [
      { emoji: 'heart', count, tooltip: '喜欢', is_active: memberRelation(snapshot, 'like', content.id) },
      { emoji: 'smile', count: 0, tooltip: '会心', is_active: false },
      { emoji: 'frown', count: 0, tooltip: '疑问', is_active: false },
    ],
  };
}

export async function demoUpdateReaction(request: Request, repository: DemoRepository) {
  const input = await jsonObject(request);
  if (input.emoji !== 'heart') {
    requireMember(request);
    return {
      reaction_summary: [
        { emoji: 'heart', count: 0, tooltip: '喜欢', is_active: false },
        { emoji: 'smile', count: input.emoji === 'smile' && input.reaction === 'activate' ? 1 : 0, tooltip: '会心', is_active: input.emoji === 'smile' && input.reaction === 'activate' },
        { emoji: 'frown', count: input.emoji === 'frown' && input.reaction === 'activate' ? 1 : 0, tooltip: '疑问', is_active: input.emoji === 'frown' && input.reaction === 'activate' },
      ],
    };
  }
  const result = await toggleRelation(new Request(request.url, {
    method: 'PUT',
    headers: request.headers,
    body: JSON.stringify(input),
  }), repository, 'like');
  return {
    reaction_summary: [
      { emoji: 'heart', count: result.count, tooltip: '喜欢', is_active: result.active },
      { emoji: 'smile', count: 0, tooltip: '会心', is_active: false },
      { emoji: 'frown', count: 0, tooltip: '疑问', is_active: false },
    ],
  };
}

export async function demoPersonalCollections(request: Request, repository: DemoRepository) {
  const snapshot = await readSnapshot(repository);
  const snapshotIndexes = indexes(snapshot);
  const url = new URL(request.url);
  const reference = url.searchParams.get('username') ?? url.searchParams.get('user_id');
  if (!reference) requireMember(request);
  const storedUsername = preferenceObject(
    snapshot.preferences.find((item) => item.key === demoProfilePreferenceKey)?.value,
  )?.username;
  const targetUser = reference
    ? resolveUser(reference, snapshot, snapshotIndexes)
      ?? (storedUsername === decodeURIComponent(reference).trim() ? snapshotIndexes.users.get(demoMemberId) ?? null : null)
    : snapshotIndexes.users.get(demoMemberId) ?? null;
  if (!targetUser) throw new DemoRequestError(404, 'demo.user.not_found', 'The demo user was not found.');
  const collectedIds = new Set(snapshot.relations
    .filter((relation) => relation.kind === 'collection' && relation.sourceId === targetUser.id)
    .map((relation) => relation.targetId));
  const pagination = readDemoPagination(pageParameters(url.searchParams));
  const page = paginateDemoItems(publishedContent(snapshot).filter((content) => collectedIds.has(content.id)), pagination);
  return {
    ...page,
    items: page.items.map((content) => feedPayload(content, snapshot, snapshotIndexes)),
    generatedAt: snapshot.clock,
  };
}

function collectionFolders(snapshot: DemoDiscoverySnapshot): DemoCollectionFolderPayload[] {
  const defaultFolder: DemoCollectionFolderPayload = {
    id: 'demo-folder-default',
    name: '默认收藏夹',
    position: 0,
    isDefault: true,
    createdAt: snapshot.clock,
    updatedAt: snapshot.clock,
  };
  const preference = snapshot.preferences.find((item) => item.key === 'demo.collection-folders');
  const stored = Array.isArray(preference?.value)
    ? preference.value.flatMap((item): DemoCollectionFolderPayload[] => {
      if (
        !item
        || typeof item !== 'object'
        || Array.isArray(item)
        || typeof item.id !== 'string'
        || typeof item.name !== 'string'
        || typeof item.position !== 'number'
        || typeof item.createdAt !== 'string'
        || typeof item.updatedAt !== 'string'
      ) return [];
      return [{
        id: item.id,
        parentId: typeof item.parentId === 'string' ? item.parentId : undefined,
        name: item.name,
        position: item.position,
        isDefault: false,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }];
    })
    : [];
  return [defaultFolder, ...stored];
}

function collectionFolderPayload(
  folder: DemoCollectionFolderPayload,
  folders: readonly DemoCollectionFolderPayload[],
  snapshot: DemoDiscoverySnapshot,
) {
  const defaultItemCount = snapshot.relations.filter((relation) => (
    relation.kind === 'collection' && relation.sourceId === demoMemberId
  )).length;
  return {
    ...folder,
    scope: 'collection',
    itemCount: folder.isDefault ? defaultItemCount : 0,
    childCount: folders.filter((item) => item.parentId === folder.id).length,
  };
}

export async function demoCollectionFolderPage(request: Request, repository: DemoRepository) {
  requireMember(request);
  const snapshot = await readSnapshot(repository);
  const folders = collectionFolders(snapshot);
  const payloads = folders.map((folder) => collectionFolderPayload(folder, folders, snapshot));
  const requestedFolderId = new URL(request.url).searchParams.get('folderId') ?? 'demo-folder-default';
  const current = payloads.find((folder) => folder.id === requestedFolderId) ?? payloads[0];
  const tree = payloads
    .filter((folder) => !folder.parentId)
    .map((folder) => ({
      ...folder,
      children: payloads.filter((child) => child.parentId === folder.id).map((child) => ({ ...child, children: [] })),
    }));
  return {
    ownerUserId: demoMemberId,
    ownerUid: demoMemberId,
    canManage: true,
    defaultId: 'demo-folder-default',
    currentId: current.id,
    folders: payloads,
    tree,
    breadcrumbs: current.parentId
      ? payloads.filter((folder) => folder.id === current.parentId || folder.id === current.id)
      : [current],
    children: payloads.filter((folder) => folder.parentId === current.id),
    items: [],
    count: 0,
  };
}

export async function demoCreateCollectionFolder(request: Request, repository: DemoRepository) {
  requireMember(request);
  const input = await jsonObject(request);
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (name.length < 1 || name.length > 80) {
    throw new DemoRequestError(422, 'demo.collection_folder.invalid_name', 'Collection folder name must contain 1 to 80 characters.', { field: 'name' });
  }
  const snapshot = await readSnapshot(repository);
  const folders = collectionFolders(snapshot);
  const localIndex = folders.filter((folder) => folder.id.startsWith('demo-folder-local-')).length + 1;
  const created: DemoCollectionFolderPayload = {
    id: `demo-folder-local-${localIndex}`,
    parentId: typeof input.parentId === 'string' && folders.some((folder) => folder.id === input.parentId)
      ? input.parentId
      : 'demo-folder-default',
    name,
    position: folders.length,
    isDefault: false,
    createdAt: snapshot.clock,
    updatedAt: snapshot.clock,
  };
  const customFolders = [...folders.filter((folder) => !folder.isDefault), created];
  await repository.transaction(['preferences'], 'readwrite', (transaction) => transaction.put('preferences', {
    key: 'demo.collection-folders',
    value: customFolders,
    updatedAt: snapshot.clock,
  }));
  return collectionFolderPayload(created, [...folders, created], snapshot);
}

export async function demoBookReviews(reference: string, repository: DemoRepository) {
  const snapshot = await readSnapshot(repository);
  const snapshotIndexes = indexes(snapshot);
  const book = resolveContent(reference, snapshot, snapshotIndexes);
  if (!book || book.data.type !== 'book') throw new DemoRequestError(404, 'demo.book.not_found', 'The requested demo book was not found.');
  const comments = snapshot.comments.filter((comment) => comment.data.targetId === book.id);
  const items = comments.map((comment, index) => {
    const author = snapshotIndexes.users.get(comment.data.authorId);
    return {
      id: `demo-review-${index + 1}`,
      bookId: publicContentId(book, snapshotIndexes),
      score: index === 0 ? 9 : 8,
      stars: index === 0 ? 4.5 : 4,
      body: comment.data.body,
      author: author?.data.displayName ?? 'Rinspace Demo Member',
      authorId: author ? publicUserId(author, snapshotIndexes) : undefined,
      authorAvatar: author ? asset(snapshotIndexes, author.data.avatarUrl) : '',
      voteCount: 0,
      voteStatus: 'none',
      createdAt: comment.data.createdAt,
      updatedAt: comment.updatedAt,
    };
  });
  return {
    items,
    rating: {
      averageScore: items.length ? items.reduce((sum, review) => sum + review.score, 0) / items.length : 0,
      reviewCount: items.length,
      breakdown: [],
    },
  };
}

export async function demoRelatedBooks(reference: string, request: Request, repository: DemoRepository) {
  const snapshot = await readSnapshot(repository);
  const snapshotIndexes = indexes(snapshot);
  const book = resolveContent(reference, snapshot, snapshotIndexes);
  if (!book || book.data.type !== 'book') throw new DemoRequestError(404, 'demo.book.not_found', 'The requested demo book was not found.');
  const limit = readDemoPagination(pageParameters(new URL(request.url).searchParams, 6)).pageSize;
  const items = publishedContent(snapshot)
    .filter((content) => content.data.type === 'book' && content.id !== book.id)
    .slice(0, limit)
    .map((content) => feedPayload(content, snapshot, snapshotIndexes));
  return { items, count: items.length, page: 1, pageSize: limit, generatedAt: snapshot.clock };
}

export async function demoBookActivity(reference: string, request: Request, repository: DemoRepository) {
  const snapshot = await readSnapshot(repository);
  const snapshotIndexes = indexes(snapshot);
  const book = resolveContent(reference, snapshot, snapshotIndexes);
  if (!book || book.data.type !== 'book') throw new DemoRequestError(404, 'demo.book.not_found', 'The requested demo book was not found.');
  const pageSize = readDemoPagination(pageParameters(new URL(request.url).searchParams, 10)).pageSize;
  return {
    bookId: publicContentId(book, snapshotIndexes),
    items: [],
    counts: { discussion: 0, question: 0, blog: 0, errata: 0, openErrata: 0 },
    total: 0,
    page: 1,
    pageSize,
    generatedAt: snapshot.clock,
  };
}

export async function demoBookReader(reference: string, repository: DemoRepository) {
  const snapshot = await readSnapshot(repository);
  const snapshotIndexes = indexes(snapshot);
  const book = resolveContent(reference, snapshot, snapshotIndexes);
  if (!book || book.data.type !== 'book') throw new DemoRequestError(404, 'demo.book.not_found', 'The requested demo book was not found.');
  const post = {
    ...feedPayload(book, snapshot, snapshotIndexes),
    slug: book.data.slug,
    body: book.data.body,
    readCount: contentMetrics(book, snapshot).readCount,
    collected: memberRelation(snapshot, 'collection', book.id),
    createdAt: book.data.createdAt,
    updatedAt: book.updatedAt,
  };
  const toc = [
    { id: 'state-vector', text: '把状态写成向量', level: 2 },
    { id: 'error-explanation', text: '误差不会自动解释自己', level: 2 },
    { id: 'same-origin', text: '回到同一个起点', level: 2 },
  ];
  return {
    post,
    toc,
    page: { id: toc[0].id, text: toc[0].text, level: 2, html: `<article><p>${book.data.body}</p></article>` },
    pageIndex: 0,
    pageCount: 1,
    source: 'demo-repository',
    capabilities: {
      annotationsRead: true,
      annotationsWrite: false,
      annotationsWriteAvailable: false,
      erratumSync: false,
      erratumSyncAvailable: false,
    },
  };
}

export async function demoRevisions(request: Request, repository: DemoRepository) {
  const snapshot = await readSnapshot(repository);
  const snapshotIndexes = indexes(snapshot);
  const url = new URL(request.url);
  const reference = url.searchParams.get('objectId') ?? '';
  const content = resolveContent(reference, snapshot, snapshotIndexes);
  if (!content) return { items: [] };
  const author = snapshotIndexes.users.get(content.data.authorId);
  return {
    items: [{
      id: 9_000 + content.data.sortOrder,
      userId: author ? publicUserId(author, snapshotIndexes) : '',
      author: author?.data.displayName ?? 'Rinspace Demo Member',
      authorAvatar: author ? asset(snapshotIndexes, author.data.avatarUrl) : '',
      objectType: url.searchParams.get('objectType') ?? content.data.type,
      objectId: Number(publicContentId(content, snapshotIndexes)),
      title: content.data.title,
      content: content.data.body,
      reason: '演示数据的初始发布版本',
      status: 2,
      createdAt: content.data.createdAt,
      updatedAt: content.updatedAt,
    }],
  };
}

export async function demoQuestionInviteUsers(request: Request, repository: DemoRepository) {
  const snapshot = await readSnapshot(repository);
  const snapshotIndexes = indexes(snapshot);
  const question = resolveContent(new URL(request.url).searchParams.get('id') ?? '', snapshot, snapshotIndexes);
  if (!question || question.data.type !== 'question') {
    throw new DemoRequestError(404, 'demo.question.not_found', 'The requested demo question was not found.');
  }
  return snapshot.users
    .filter((user) => user.id !== question.data.authorId)
    .map((user) => userPayload(user, snapshotIndexes));
}

export async function demoBookContext(reference: string, repository: DemoRepository) {
  const snapshot = await readSnapshot(repository);
  const snapshotIndexes = indexes(snapshot);
  const content = resolveContent(reference, snapshot, snapshotIndexes);
  if (!content) throw new DemoRequestError(404, 'demo.content.not_found', 'The requested demo content was not found.');
  if (content.data.type === 'book') return { items: [], generatedAt: snapshot.clock };
  const book = publishedContent(snapshot).find((item) => item.data.type === 'book');
  if (!book) return { items: [], generatedAt: snapshot.clock };
  const kind = content.data.type === 'question'
    ? 'question'
    : content.data.type === 'blog' ? 'blog' : 'discussion';
  return {
    items: [{
      bookId: publicContentId(book, snapshotIndexes),
      bookTitle: book.data.title,
      bookSlug: book.data.slug,
      chapterKey: 'state-vector',
      chapterTitle: '把状态写成向量',
      chapterPath: ['演示读本', '把状态写成向量'],
      chapterPage: 1,
      kind,
    }],
    generatedAt: snapshot.clock,
  };
}

export async function demoBookChapterActivity(
  reference: string,
  request: Request,
  repository: DemoRepository,
) {
  const snapshot = await readSnapshot(repository);
  const snapshotIndexes = indexes(snapshot);
  const book = resolveContent(reference, snapshot, snapshotIndexes);
  if (!book || book.data.type !== 'book') {
    throw new DemoRequestError(404, 'demo.book.not_found', 'The requested demo book was not found.');
  }
  const chapters = [
    { key: 'state-vector', title: '把状态写成向量', page: 1, level: 2 },
    { key: 'error-explanation', title: '误差不会自动解释自己', page: 2, level: 2 },
    { key: 'same-origin', title: '回到同一个起点', page: 3, level: 2 },
  ].map((chapter) => ({
    ...chapter,
    counts: { discussion: 0, question: 0, blog: 0, errata: 0, openErrata: 0 },
  }));
  const selectedKey = new URL(request.url).searchParams.get('chapterKey');
  const selectedChapter = chapters.find((chapter) => chapter.key === selectedKey);
  return {
    bookId: publicContentId(book, snapshotIndexes),
    chapters,
    ...(selectedChapter ? {
      selected: {
        ...selectedChapter,
        links: { discussions: [], questions: [], blogs: [] },
        threads: { discussions: [], questions: [] },
        errata: [],
      },
    } : {}),
  };
}

export async function demoRecordContentRead(
  reference: string,
  request: Request,
  repository: DemoRepository,
) {
  const input = await jsonObject(request);
  const requestId = typeof input.requestId === 'string' ? input.requestId.trim() : '';
  if (!requestId || requestId.length > 200) {
    throw new DemoRequestError(422, 'demo.read.invalid_request_id', 'A stable read request ID is required.', { field: 'requestId' });
  }
  const snapshot = await readSnapshot(repository);
  const snapshotIndexes = indexes(snapshot);
  const content = resolveContent(reference, snapshot, snapshotIndexes);
  if (!content) throw new DemoRequestError(404, 'demo.content.not_found', 'The requested demo content was not found.');
  const key = `demo.read.${content.id}`;
  const existing = snapshot.preferences.find((item) => item.key === key);
  const existingValue = preferenceObject(existing?.value);
  const previousCount = typeof existingValue?.count === 'number'
    ? existingValue.count
    : 0;
  const previousIds = Array.isArray(existingValue?.requestIds)
    ? existingValue.requestIds.filter((item): item is string => typeof item === 'string')
    : [];
  const counted = !previousIds.includes(requestId);
  const nextCount = previousCount + (counted ? 1 : 0);
  if (counted) {
    await repository.transaction(['preferences'], 'readwrite', (transaction) => transaction.put('preferences', {
      key,
      value: { count: nextCount, requestIds: [...previousIds, requestId].slice(-100) },
      updatedAt: snapshot.clock,
    }));
  }
  return {
    counted,
    readCount: contentMetrics(content, snapshot).readCount + (counted ? 1 : 0),
  };
}
