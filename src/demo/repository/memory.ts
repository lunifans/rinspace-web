import { initializeDemoRepository, readDemoRepositoryMetadata } from './core';
import { DemoRepositoryError, normalizeDemoRepositoryError } from './errors';
import {
  demoRepositorySchemaVersion,
  demoStoreNames,
  type DemoGetAllOptions,
  type DemoRepository,
  type DemoRepositoryInitialization,
  type DemoRepositoryStatusEvent,
  type DemoSeed,
  type DemoStoreName,
  type DemoStoreRecordMap,
  type DemoTransaction,
  type DemoTransactionMode,
} from './types';

type AnyDemoRecord = DemoStoreRecordMap[DemoStoreName];
type StoreMaps = Record<DemoStoreName, Map<string, AnyDemoRecord>>;

function emptyStores(): StoreMaps {
  return Object.fromEntries(demoStoreNames.map((store) => [store, new Map<string, AnyDemoRecord>()])) as StoreMaps;
}

function serializedKey(key: IDBValidKey): string {
  if (key instanceof Date) return `date:${key.toISOString()}`;
  if (Array.isArray(key)) return `array:${JSON.stringify(key)}`;
  if (key instanceof ArrayBuffer || ArrayBuffer.isView(key)) {
    return `binary:${Array.from(new Uint8Array(key instanceof ArrayBuffer ? key : key.buffer)).join(',')}`;
  }
  return `${typeof key}:${String(key)}`;
}

function recordKey(record: AnyDemoRecord): IDBValidKey {
  return record.key;
}

function cloneRecord<RecordType>(record: RecordType): RecordType {
  return structuredClone(record);
}

function queryValue(record: AnyDemoRecord, index: string): IDBValidKey | undefined {
  if (index === 'by-kind' && 'kind' in record) return record.kind;
  if (index === 'by-kind-updated-at' && 'kind' in record && 'updatedAt' in record) return [record.kind, record.updatedAt];
  if (index === 'by-source' && 'sourceKind' in record) return [record.sourceKind, record.sourceId];
  if (index === 'by-target' && 'targetKind' in record) return [record.targetKind, record.targetId];
  if (index === 'by-owner' && 'ownerId' in record) return record.ownerId;
  if (index === 'by-owner-updated-at' && 'ownerId' in record && 'updatedAt' in record) return [record.ownerId, record.updatedAt];
  if (index === 'by-updated-at' && 'updatedAt' in record) return record.updatedAt;
  if (index === 'by-created-at' && 'createdAt' in record) return record.createdAt;
  return undefined;
}

function keyMatches(value: IDBValidKey | undefined, query: DemoGetAllOptions['query']): boolean {
  if (query === undefined || query === null) return true;
  if (typeof IDBKeyRange !== 'undefined' && query instanceof IDBKeyRange) return query.includes(value as IDBValidKey);
  return serializedKey(value as IDBValidKey) === serializedKey(query as IDBValidKey);
}

function estimatedBytes(stores: StoreMaps): number {
  let total = 0;
  for (const store of demoStoreNames) {
    for (const record of stores[store].values()) {
      if ('bytes' in record) total += record.bytes.byteLength;
      total += new TextEncoder().encode(JSON.stringify(record, (key, value) => (key === 'bytes' ? undefined : value))).byteLength;
    }
  }
  return total;
}

export function createMemoryDemoRepository({
  name = 'rinspace.demo.repository.memory',
  schemaVersion = demoRepositorySchemaVersion,
  maxBytes = Number.POSITIVE_INFINITY,
}: Readonly<{
  name?: string;
  schemaVersion?: number;
  maxBytes?: number;
}> = {}): DemoRepository {
  let stores = emptyStores();
  let closed = false;
  const listeners = new Set<(event: DemoRepositoryStatusEvent) => void>();
  const emit = (kind: DemoRepositoryStatusEvent['kind'], detail?: string) => {
    const event = Object.freeze({ kind, databaseName: name, detail });
    listeners.forEach((listener) => listener(event));
  };

  const repository: DemoRepository = {
    name,
    schemaVersion,
    async transaction<Result>(
      selectedStores: readonly DemoStoreName[],
      mode: DemoTransactionMode,
      operation: (transaction: DemoTransaction) => Promise<Result> | Result,
    ): Promise<Result> {
      if (closed) throw new DemoRepositoryError('closed', 'Demo repository is closed.', true);
      const uniqueStores = [...new Set(selectedStores)];
      if (uniqueStores.length === 0) throw new DemoRepositoryError('transaction_failed', 'A transaction requires at least one store.', false);
      const working = emptyStores();
      for (const store of demoStoreNames) {
        working[store] = new Map([...stores[store]].map(([key, value]) => [key, cloneRecord(value)]));
      }
      const requireStore = (store: DemoStoreName) => {
        if (!uniqueStores.includes(store)) throw new DemoRepositoryError('transaction_failed', `Store ${store} is outside this transaction.`, false);
      };
      const requireWrite = (store: DemoStoreName) => {
        requireStore(store);
        if (mode !== 'readwrite') throw new DemoRepositoryError('transaction_failed', 'Readonly transaction cannot mutate data.', false);
      };
      const transaction: DemoTransaction = {
        async get<Store extends DemoStoreName>(store: Store, key: IDBValidKey) {
          requireStore(store);
          const value = working[store].get(serializedKey(key));
          return value === undefined ? undefined : cloneRecord(value) as DemoStoreRecordMap[Store];
        },
        async getAll<Store extends DemoStoreName>(store: Store, options: DemoGetAllOptions = {}) {
          requireStore(store);
          const records = [...working[store].values()]
            .filter((record) => !options.index || keyMatches(queryValue(record, options.index), options.query))
            .slice(0, options.count)
            .map((record) => cloneRecord(record) as DemoStoreRecordMap[Store]);
          return records;
        },
        async put<Store extends DemoStoreName>(store: Store, value: DemoStoreRecordMap[Store]) {
          requireWrite(store);
          const key = recordKey(value);
          working[store].set(serializedKey(key), cloneRecord(value));
          return key;
        },
        async delete(store: DemoStoreName, key: IDBValidKey) {
          requireWrite(store);
          working[store].delete(serializedKey(key));
        },
        async clear(store: DemoStoreName) {
          requireWrite(store);
          working[store].clear();
        },
      };
      try {
        const result = await operation(transaction);
        if (mode === 'readwrite') {
          if (estimatedBytes(working) > maxBytes) {
            throw new DemoRepositoryError('quota_exceeded', 'Browser storage quota was exceeded.', true);
          }
          for (const store of uniqueStores) stores[store] = working[store];
        }
        return result;
      } catch (error) {
        const normalized = normalizeDemoRepositoryError(error);
        if (normalized.code === 'quota_exceeded') emit('quota');
        throw normalized;
      }
    },
    getMetadata: () => readDemoRepositoryMetadata(repository),
    async ensureSeed(seed: DemoSeed): Promise<DemoRepositoryInitialization> {
      const result = await initializeDemoRepository(repository, seed);
      emit('ready', result.action);
      return result;
    },
    async reset(seed: DemoSeed): Promise<DemoRepositoryInitialization> {
      const result = await initializeDemoRepository(repository, seed, true);
      emit('reset');
      return result;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    close() {
      closed = true;
      listeners.clear();
    },
  };
  return repository;
}
