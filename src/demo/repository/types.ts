import type { ApiSchemas } from '@/generated/api-contract';

export const demoRepositorySchemaVersion = 2;
export const demoRepositoryDatabaseName = 'rinspace.demo.repository';
export const demoRepositoryMetaKey = 'repository';

export const demoStoreNames = [
  'meta',
  'entities',
  'relations',
  'drafts',
  'blobs',
  'preferences',
] as const;

export type DemoStoreName = typeof demoStoreNames[number];
export type DemoRepositoryState = 'seeding' | 'ready' | 'recovering';

export type DemoMetaRecord = Readonly<{
  key: typeof demoRepositoryMetaKey;
  schemaVersion: number;
  datasetVersion: string;
  checksum: string;
  state: DemoRepositoryState;
  seededAt: string;
  updatedAt: string;
}>;

type DemoEntityBase<Kind extends string, Data> = Readonly<{
  key: string;
  kind: Kind;
  id: string;
  updatedAt: string;
  data: Readonly<Data>;
}>;

export type DemoUserEntity = DemoEntityBase<'user', {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  locale: 'en' | 'zh-CN';
  headline: string;
}>;

export type DemoContentEntity = DemoEntityBase<'content', {
  type: ApiSchemas['ContentType'];
  slug: string;
  title: string;
  summary: string;
  body: string;
  authorId: string;
  status: 'draft' | 'private' | 'published';
  tags: readonly string[];
  locale: 'en' | 'zh-CN';
  format: 'latex' | 'markdown' | 'pdf' | null;
  coverAssetKey: string | null;
  attachmentKeys: readonly string[];
  createdAt: string;
  publishedAt: string | null;
  sortOrder: number;
}>;

export type DemoTagEntity = DemoEntityBase<'tag', {
  slug: string;
  name: string;
  description: string;
  locale: 'en' | 'zh-CN';
}>;

export type DemoCommentEntity = DemoEntityBase<'comment', {
  targetId: string;
  authorId: string;
  body: string;
  createdAt: string;
  locale: 'en' | 'zh-CN';
}>;

export type DemoNotificationEntity = DemoEntityBase<'notification', {
  actorId: string;
  type: string;
  targetType: string;
  targetId: string;
  excerpt: string;
  readAt: string | null;
  createdAt: string;
  locale: 'en' | 'zh-CN';
}>;

export type DemoEntityRecord =
  | DemoUserEntity
  | DemoContentEntity
  | DemoTagEntity
  | DemoCommentEntity
  | DemoNotificationEntity;

export type DemoRelationRecord = Readonly<{
  key: string;
  kind: 'follow' | 'like' | 'collection' | 'tag-content' | 'parent';
  sourceKind: string;
  sourceId: string;
  targetKind: string;
  targetId: string;
  createdAt: string;
}>;

export type DemoDraftRecord = Readonly<{
  key: string;
  ownerId: string;
  contentType: ApiSchemas['ContentType'];
  title: string;
  body: string;
  locale: 'en' | 'zh-CN';
  format: 'latex' | 'markdown';
  revision: number;
  createdAt: string;
  updatedAt: string;
}>;

export type DemoBlobRecord = Readonly<{
  key: string;
  name: string;
  type: string;
  bytes: Uint8Array;
  createdAt: string;
}>;

export type DemoPreferenceValue =
  | null
  | boolean
  | number
  | string
  | readonly DemoPreferenceValue[]
  | Readonly<{ [key: string]: DemoPreferenceValue }>;

export type DemoPreferenceRecord = Readonly<{
  key: string;
  value: DemoPreferenceValue;
  updatedAt: string;
}>;

export type DemoStoreRecordMap = Readonly<{
  meta: DemoMetaRecord;
  entities: DemoEntityRecord;
  relations: DemoRelationRecord;
  drafts: DemoDraftRecord;
  blobs: DemoBlobRecord;
  preferences: DemoPreferenceRecord;
}>;

export type DemoTransactionMode = 'readonly' | 'readwrite';

export type DemoGetAllOptions = Readonly<{
  index?: string;
  query?: IDBValidKey | IDBKeyRange | null;
  count?: number;
}>;

export interface DemoTransaction {
  get<Store extends DemoStoreName>(store: Store, key: IDBValidKey): Promise<DemoStoreRecordMap[Store] | undefined>;
  getAll<Store extends DemoStoreName>(store: Store, options?: DemoGetAllOptions): Promise<DemoStoreRecordMap[Store][]>;
  put<Store extends DemoStoreName>(store: Store, value: DemoStoreRecordMap[Store]): Promise<IDBValidKey>;
  delete(store: DemoStoreName, key: IDBValidKey): Promise<void>;
  clear(store: DemoStoreName): Promise<void>;
}

export type DemoSeedPayload = Readonly<{
  datasetVersion: string;
  entities: readonly DemoEntityRecord[];
  relations: readonly DemoRelationRecord[];
  drafts: readonly DemoDraftRecord[];
  blobs: readonly DemoBlobRecord[];
  preferences: readonly DemoPreferenceRecord[];
}>;

export type DemoSeed = DemoSeedPayload & Readonly<{ checksum: string }>;

export type DemoRepositoryInitialization = Readonly<{
  action: 'existing' | 'migrated' | 'seeded' | 'recovered' | 'reset';
  metadata: DemoMetaRecord;
}>;

export type DemoRepositoryStatusEvent = Readonly<{
  kind: 'blocked' | 'versionchange' | 'quota' | 'ready' | 'reset';
  databaseName: string;
  detail?: string;
}>;

export interface DemoRepository {
  readonly name: string;
  readonly schemaVersion: number;
  transaction<Result>(
    stores: readonly DemoStoreName[],
    mode: DemoTransactionMode,
    operation: (transaction: DemoTransaction) => Promise<Result> | Result,
  ): Promise<Result>;
  getMetadata(): Promise<DemoMetaRecord | null>;
  ensureSeed(seed: DemoSeed): Promise<DemoRepositoryInitialization>;
  reset(seed: DemoSeed): Promise<DemoRepositoryInitialization>;
  subscribe(listener: (event: DemoRepositoryStatusEvent) => void): () => void;
  close(): void;
}

export function demoEntityKey(kind: DemoEntityRecord['kind'], id: string): string {
  return `${kind}:${id}`;
}
