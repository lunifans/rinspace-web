import { z } from 'zod';

const timestampSchema = z.string().datetime({ offset: true });
const localeSchema = z.enum(['en', 'zh-CN']);
const demoIdSchema = z.string().regex(/^demo-[a-z0-9]+(?:-[a-z0-9]+)*$/);
const recordKeySchema = z.string().regex(/^[a-z]+:demo-[a-z0-9]+(?:-[a-z0-9]+)*$/);
const assetReferenceSchema = z.string().regex(/^demo-asset:demo-asset-[a-z0-9]+(?:-[a-z0-9]+)*$/);

const entityBaseSchema = z.object({
  key: recordKeySchema,
  id: demoIdSchema,
  updatedAt: timestampSchema,
});

const userEntitySchema = entityBaseSchema.extend({
  kind: z.literal('user'),
  data: z.object({
    username: z.string().regex(/^demo-[a-z0-9-]+$/),
    displayName: z.string().min(1).max(80),
    avatarUrl: assetReferenceSchema.nullable(),
    bio: z.string().min(1).max(360),
    locale: localeSchema,
    headline: z.string().min(1).max(120),
  }).strict(),
}).strict();

const contentTypeSchema = z.enum([
  'blog', 'question', 'discussion', 'announcement', 'dynamic', 'book', 'forum', 'status', 'task', 'tag',
]);

const contentEntitySchema = entityBaseSchema.extend({
  kind: z.literal('content'),
  data: z.object({
    type: contentTypeSchema,
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.string().min(1).max(180),
    summary: z.string().min(1).max(360),
    body: z.string().min(1).max(30_000),
    authorId: demoIdSchema,
    status: z.enum(['draft', 'private', 'published']),
    tags: z.array(demoIdSchema).max(12),
    locale: localeSchema,
    format: z.enum(['latex', 'markdown', 'pdf']).nullable(),
    coverAssetKey: demoIdSchema.nullable(),
    attachmentKeys: z.array(demoIdSchema).max(8),
    createdAt: timestampSchema,
    publishedAt: timestampSchema.nullable(),
    sortOrder: z.number().int().nonnegative(),
  }).strict(),
}).strict();

const tagEntitySchema = entityBaseSchema.extend({
  kind: z.literal('tag'),
  data: z.object({
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string().min(1).max(80),
    description: z.string().min(1).max(360),
    locale: localeSchema,
  }).strict(),
}).strict();

const commentEntitySchema = entityBaseSchema.extend({
  kind: z.literal('comment'),
  data: z.object({
    targetId: demoIdSchema,
    authorId: demoIdSchema,
    body: z.string().min(1).max(2_000),
    createdAt: timestampSchema,
    locale: localeSchema,
  }).strict(),
}).strict();

const notificationEntitySchema = entityBaseSchema.extend({
  kind: z.literal('notification'),
  data: z.object({
    actorId: demoIdSchema,
    type: z.string().regex(/^[a-z][a-z0-9_]*$/),
    targetType: z.enum(['content', 'comment', 'user']),
    targetId: demoIdSchema,
    excerpt: z.string().min(1).max(240),
    readAt: timestampSchema.nullable(),
    createdAt: timestampSchema,
    locale: localeSchema,
  }).strict(),
}).strict();

const entitySchema = z.discriminatedUnion('kind', [
  userEntitySchema,
  contentEntitySchema,
  tagEntitySchema,
  commentEntitySchema,
  notificationEntitySchema,
]);

const relationSchema = z.object({
  key: demoIdSchema,
  kind: z.enum(['follow', 'like', 'collection', 'tag-content', 'parent']),
  sourceKind: z.enum(['user', 'tag']),
  sourceId: demoIdSchema,
  targetKind: z.enum(['user', 'content', 'tag']),
  targetId: demoIdSchema,
  createdAt: timestampSchema,
}).strict();

const draftSchema = z.object({
  key: demoIdSchema,
  ownerId: demoIdSchema,
  contentType: contentTypeSchema,
  title: z.string().min(1).max(180),
  body: z.string().min(1).max(30_000),
  locale: localeSchema,
  format: z.enum(['latex', 'markdown']),
  revision: z.number().int().positive(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
}).strict();

const assetSchema = z.object({
  key: demoIdSchema,
  name: z.string().regex(/^[a-z0-9][a-z0-9._-]+$/),
  type: z.enum(['image/svg+xml', 'text/markdown']),
  text: z.string().min(1).max(100_000),
  createdAt: timestampSchema,
  provenance: z.literal('rinspace-created-original'),
  licenseRef: z.literal('LicenseRef-Rinspace-Demo-Data-Pending'),
}).strict();

const preferenceSchema = z.object({
  key: z.string().regex(/^demo\.[a-z0-9.-]+$/),
  value: z.union([z.string(), z.boolean(), z.number(), z.array(z.string())]),
  updatedAt: timestampSchema,
}).strict();

export const demoFixtureDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  datasetVersion: z.literal('rinspace-demo-v1'),
  fixedNow: timestampSchema,
  provenance: z.object({
    contentOrigin: z.literal('rinspace-created-synthetic'),
    containsProductionData: z.literal(false),
    containsRealPersonalData: z.literal(false),
  }).strict(),
  license: z.object({
    status: z.literal('approved-task-4'),
    candidateSpdx: z.literal('CC0-1.0'),
    effectiveSpdx: z.literal('CC0-1.0'),
    distributionApproved: z.literal(true),
  }).strict(),
  declaredEmptyStates: z.array(z.enum(['announcements', 'blocked-users', 'search-no-results'])).min(1),
  entities: z.array(entitySchema),
  relations: z.array(relationSchema),
  drafts: z.array(draftSchema),
  assets: z.array(assetSchema),
  preferences: z.array(preferenceSchema),
}).strict();

export type DemoFixtureDocument = z.infer<typeof demoFixtureDocumentSchema>;

export function parseDemoFixtureDocument(input: unknown): DemoFixtureDocument {
  return demoFixtureDocumentSchema.parse(input);
}
