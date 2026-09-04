import { initializeDemoRepository, readDemoRepositoryMetadata } from './core';
import { DemoRepositoryError, normalizeDemoRepositoryError } from './errors';
import {
  demoRepositoryDatabaseName,
  demoRepositorySchemaVersion,
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

export type IndexedDbDemoRepositoryOptions = Readonly<{
  name?: string;
  indexedDB?: IDBFactory;
  onStatus?: (event: DemoRepositoryStatusEvent) => void;
}>;

function createVersionOneStores(database: IDBDatabase): void {
  const meta = database.createObjectStore('meta', { keyPath: 'key' });
  void meta;
  const entities = database.createObjectStore('entities', { keyPath: 'key' });
  entities.createIndex('by-kind', 'kind');
  const relations = database.createObjectStore('relations', { keyPath: 'key' });
  relations.createIndex('by-kind', 'kind');
  relations.createIndex('by-source', ['sourceKind', 'sourceId']);
  relations.createIndex('by-target', ['targetKind', 'targetId']);
  const drafts = database.createObjectStore('drafts', { keyPath: 'key' });
  drafts.createIndex('by-owner', 'ownerId');
  const blobs = database.createObjectStore('blobs', { keyPath: 'key' });
  blobs.createIndex('by-created-at', 'createdAt');
  const preferences = database.createObjectStore('preferences', { keyPath: 'key' });
  preferences.createIndex('by-updated-at', 'updatedAt');
}

function applyVersionTwoIndexes(transaction: IDBTransaction): void {
  const entities = transaction.objectStore('entities');
  if (!entities.indexNames.contains('by-kind-updated-at')) {
    entities.createIndex('by-kind-updated-at', ['kind', 'updatedAt']);
  }
  const drafts = transaction.objectStore('drafts');
  if (!drafts.indexNames.contains('by-owner-updated-at')) {
    drafts.createIndex('by-owner-updated-at', ['ownerId', 'updatedAt']);
  }
}

function requestResult<Result>(request: IDBRequest<Result>): Promise<Result> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

function transactionCompletion(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
  });
}

function openDatabase(
  factory: IDBFactory,
  name: string,
  emit: (kind: DemoRepositoryStatusEvent['kind'], detail?: string) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const request = factory.open(name, demoRepositorySchemaVersion);
    request.onupgradeneeded = (event) => {
      if (event.oldVersion < 1) createVersionOneStores(request.result);
      if (event.oldVersion < 2) applyVersionTwoIndexes(request.transaction as IDBTransaction);
    };
    request.onblocked = () => {
      emit('blocked', 'upgrade');
      if (!settled) {
        settled = true;
        reject(new DemoRepositoryError('upgrade_blocked', 'Another tab is blocking the demo data upgrade.', true));
      }
    };
    request.onerror = () => {
      if (!settled) {
        settled = true;
        reject(normalizeDemoRepositoryError(request.error, 'IndexedDB could not be opened.'));
      }
    };
    request.onsuccess = () => {
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      resolve(request.result);
    };
  });
}

export async function openIndexedDbDemoRepository(
  options: IndexedDbDemoRepositoryOptions = {},
): Promise<DemoRepository> {
  const name = options.name ?? demoRepositoryDatabaseName;
  const factory = options.indexedDB ?? globalThis.indexedDB;
  if (!factory) throw new DemoRepositoryError('unavailable', 'IndexedDB is unavailable.', false);
  const listeners = new Set<(event: DemoRepositoryStatusEvent) => void>();
  if (options.onStatus) listeners.add(options.onStatus);
  const emit = (kind: DemoRepositoryStatusEvent['kind'], detail?: string) => {
    const event = Object.freeze({ kind, databaseName: name, detail });
    listeners.forEach((listener) => listener(event));
  };
  const database = await openDatabase(factory, name, emit);
  let closed = false;
  let versionChanged = false;
  database.onversionchange = () => {
    versionChanged = true;
    closed = true;
    emit('versionchange');
    database.close();
  };

  const repository: DemoRepository = {
    name,
    schemaVersion: demoRepositorySchemaVersion,
    async transaction<Result>(
      stores: readonly DemoStoreName[],
      mode: DemoTransactionMode,
      operation: (transaction: DemoTransaction) => Promise<Result> | Result,
    ): Promise<Result> {
      if (closed) {
        throw new DemoRepositoryError(
          versionChanged ? 'version_changed' : 'closed',
          versionChanged ? 'The demo repository changed in another tab.' : 'Demo repository is closed.',
          true,
        );
      }
      const selectedStores = [...new Set(stores)];
      if (selectedStores.length === 0) throw new DemoRepositoryError('transaction_failed', 'A transaction requires at least one store.', false);
      let nativeTransaction: IDBTransaction;
      try {
        nativeTransaction = database.transaction(selectedStores, mode);
      } catch (error) {
        throw normalizeDemoRepositoryError(error);
      }
      const completion = transactionCompletion(nativeTransaction);
      const scopedStore = (store: DemoStoreName) => {
        if (!selectedStores.includes(store)) throw new DemoRepositoryError('transaction_failed', `Store ${store} is outside this transaction.`, false);
        return nativeTransaction.objectStore(store);
      };
      const transaction: DemoTransaction = {
        get: async <Store extends DemoStoreName>(store: Store, key: IDBValidKey) => (
          requestResult(scopedStore(store).get(key) as IDBRequest<DemoStoreRecordMap[Store] | undefined>)
        ),
        getAll: async <Store extends DemoStoreName>(store: Store, getAllOptions: DemoGetAllOptions = {}) => {
          const objectStore = scopedStore(store);
          const source = getAllOptions.index ? objectStore.index(getAllOptions.index) : objectStore;
          return requestResult(source.getAll(getAllOptions.query ?? null, getAllOptions.count) as IDBRequest<DemoStoreRecordMap[Store][]>);
        },
        put: async <Store extends DemoStoreName>(store: Store, value: DemoStoreRecordMap[Store]) => (
          requestResult(scopedStore(store).put(value))
        ),
        delete: async (store, key) => { await requestResult(scopedStore(store).delete(key)); },
        clear: async (store) => { await requestResult(scopedStore(store).clear()); },
      };
      try {
        const result = await operation(transaction);
        await completion;
        return result;
      } catch (error) {
        try { nativeTransaction.abort(); } catch { /* Transaction may already be inactive. */ }
        await completion.catch(() => undefined);
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
      if (closed) return;
      closed = true;
      database.close();
      listeners.clear();
    },
  };
  return repository;
}

export function deleteIndexedDbDemoRepository({
  name = demoRepositoryDatabaseName,
  indexedDB: factory = globalThis.indexedDB,
}: Readonly<{ name?: string; indexedDB?: IDBFactory }> = {}): Promise<void> {
  if (!factory) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const request = factory.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(normalizeDemoRepositoryError(request.error, 'Demo repository reset failed.'));
    request.onblocked = () => reject(new DemoRepositoryError('upgrade_blocked', 'Another tab is blocking demo data reset.', true));
  });
}
