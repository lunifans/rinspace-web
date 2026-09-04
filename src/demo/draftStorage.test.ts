import { describe, expect, it } from 'vitest';

import {
  DemoRepositoryError,
  createMemoryDemoRepository,
  type DemoRepository,
} from '@/demo/repository';
import { createRinspaceDemoSeed } from '@/demo/fixtures/v1';
import {
  deleteDemoAutosaveDraft,
  readDemoAutosaveEnvelope,
  writeDemoAutosaveDraft,
  writeDemoAutosaveEnvelope,
} from './draftStorage';

describe('demo autosave repository boundary', () => {
  it('keeps autosave state in the DemoRepository and removes it precisely', async () => {
    const repository = createMemoryDemoRepository();
    await repository.ensureSeed(await createRinspaceDemoSeed());
    const key = 'demo-user-member:article:new';
    const draft = { key, title: 'Local draft', savedAt: Date.parse('2026-06-01T13:00:00.000Z') };

    await writeDemoAutosaveDraft(repository, key, draft);
    await expect(readDemoAutosaveEnvelope(repository, key)).resolves.toMatchObject({ draft, revision: 0 });
    await expect(writeDemoAutosaveEnvelope(repository, key, {
      draft,
      sourceId: 'tab-a',
      expectedRevision: 0,
    })).resolves.toMatchObject({ revision: 1, sourceId: 'tab-a' });
    await deleteDemoAutosaveDraft(repository, key);
    await expect(readDemoAutosaveEnvelope(repository, key)).resolves.toBeNull();
    repository.close();
  });

  it('preserves recoverable quota errors instead of falling back to a second persistence system', async () => {
    const repository = createMemoryDemoRepository();
    await repository.ensureSeed(await createRinspaceDemoSeed());
    const quotaRepository: DemoRepository = {
      name: repository.name,
      schemaVersion: repository.schemaVersion,
      transaction: async (stores, mode, operation) => {
        if (mode === 'readwrite') {
          throw new DemoRepositoryError('quota_exceeded', 'Browser storage quota was exceeded.', true);
        }
        return repository.transaction(stores, mode, operation);
      },
      getMetadata: () => repository.getMetadata(),
      ensureSeed: (seed) => repository.ensureSeed(seed),
      reset: (seed) => repository.reset(seed),
      subscribe: (listener) => repository.subscribe(listener),
      close: () => repository.close(),
    };
    await expect(writeDemoAutosaveDraft(quotaRepository, 'quota-test', {
      key: 'quota-test', title: 'Quota', savedAt: Date.now(),
    })).rejects.toMatchObject({ code: 'quota_exceeded', recoverable: true });
    repository.close();
  });
});
