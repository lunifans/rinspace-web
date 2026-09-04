import { beforeEach, describe, expect, it, vi } from 'vitest';

import { normalizeDemoRepositoryError } from './errors';
import { createMemoryDemoRepository } from './memory';
import { createDemoSeed, createFoundationDemoSeed } from './seed';
import { announceDemoRepositoryStatus, demoRepositoryStatusEventName } from './status';
import {
  demoEntityKey,
  demoRepositoryMetaKey,
  type DemoSeedPayload,
  type DemoUserEntity,
} from './types';

const timestamp = '2026-09-01T00:00:00.000Z';
const member: DemoUserEntity = {
  key: demoEntityKey('user', 'member-1'),
  kind: 'user',
  id: 'member-1',
  updatedAt: timestamp,
  data: {
    username: 'member',
    displayName: 'Demo Member',
    avatarUrl: null,
    bio: 'Synthetic test identity.',
    locale: 'en',
    headline: 'Repository test member',
  },
};

function payload(datasetVersion = 'test-v1'): DemoSeedPayload {
  return {
    datasetVersion,
    entities: [member],
    relations: [],
    drafts: [],
    blobs: [],
    preferences: [{ key: 'language', value: 'zh-CN', updatedAt: timestamp }],
  };
}

describe('DemoRepository foundation', () => {
  beforeEach(() => {
    document.querySelector('[data-rin-demo-repository-status]')?.remove();
  });

  it('creates deterministic checksums and rejects content drift', async () => {
    const first = await createDemoSeed(payload());
    const second = await createDemoSeed(payload());
    expect(first.checksum).toBe(second.checksum);
    expect(first.checksum).toMatch(/^sha256:[a-f0-9]{64}$/);

    const repository = createMemoryDemoRepository();
    await expect(repository.ensureSeed({ ...first, datasetVersion: 'tampered' }))
      .rejects.toEqual(expect.objectContaining({ code: 'seed_invalid' }));
  });

  it('seeds all records atomically and preserves a matching ready dataset', async () => {
    const repository = createMemoryDemoRepository();
    const seed = await createDemoSeed(payload());
    await expect(repository.ensureSeed(seed)).resolves.toMatchObject({ action: 'seeded' });
    await repository.transaction(['entities'], 'readwrite', (transaction) => transaction.put('entities', {
      ...member,
      data: { ...member.data, displayName: 'Locally Edited Member' },
    }));
    await expect(repository.ensureSeed(seed)).resolves.toMatchObject({ action: 'existing' });
    await expect(repository.transaction(['entities'], 'readonly', (transaction) => (
      transaction.get('entities', member.key)
    ))).resolves.toMatchObject({ data: { displayName: 'Locally Edited Member' } });
    await expect(repository.getMetadata()).resolves.toMatchObject({
      key: demoRepositoryMetaKey,
      state: 'ready',
      datasetVersion: 'test-v1',
    });
  });

  it('rolls back failed writes and replaces a stale dataset in one transaction', async () => {
    const repository = createMemoryDemoRepository();
    const first = await createDemoSeed(payload());
    await repository.ensureSeed(first);
    await expect(repository.transaction(['preferences'], 'readwrite', async (transaction) => {
      await transaction.put('preferences', { key: 'temporary', value: true, updatedAt: timestamp });
      throw new Error('rollback');
    })).rejects.toEqual(expect.objectContaining({ code: 'transaction_failed' }));
    await expect(repository.transaction(['preferences'], 'readonly', (transaction) => (
      transaction.get('preferences', 'temporary')
    ))).resolves.toBeUndefined();

    const next = await createDemoSeed({ ...payload('test-v2'), entities: [] });
    await expect(repository.ensureSeed(next)).resolves.toMatchObject({ action: 'recovered' });
    await expect(repository.transaction(['entities'], 'readonly', (transaction) => transaction.getAll('entities')))
      .resolves.toEqual([]);
  });

  it('updates schema metadata without discarding compatible records', async () => {
    const repository = createMemoryDemoRepository({ schemaVersion: 2 });
    const seed = await createDemoSeed(payload());
    await repository.ensureSeed(seed);
    const current = await repository.getMetadata();
    if (!current) throw new Error('expected metadata');
    await repository.transaction(['meta'], 'readwrite', (transaction) => transaction.put('meta', {
      ...current,
      schemaVersion: 1,
    }));
    await expect(repository.ensureSeed(seed)).resolves.toMatchObject({ action: 'migrated' });
    await expect(repository.transaction(['preferences'], 'readonly', (transaction) => (
      transaction.get('preferences', 'language')
    ))).resolves.toMatchObject({ value: 'zh-CN' });
  });

  it('supports typed index reads and reset to the original seed', async () => {
    const repository = createMemoryDemoRepository();
    const seed = await createDemoSeed(payload());
    await repository.ensureSeed(seed);
    await expect(repository.transaction(['entities'], 'readonly', (transaction) => (
      transaction.getAll('entities', { index: 'by-kind', query: 'user' })
    ))).resolves.toEqual([member]);
    await repository.transaction(['preferences'], 'readwrite', (transaction) => (
      transaction.put('preferences', { key: 'theme', value: 'dark', updatedAt: timestamp })
    ));
    await expect(repository.reset(seed)).resolves.toMatchObject({ action: 'reset' });
    await expect(repository.transaction(['preferences'], 'readonly', (transaction) => (
      transaction.get('preferences', 'theme')
    ))).resolves.toBeUndefined();
  });

  it('maps quota failures without committing partial seed state', async () => {
    const repository = createMemoryDemoRepository({ maxBytes: 16 });
    const events = vi.fn();
    repository.subscribe(events);
    await expect(repository.ensureSeed(await createDemoSeed(payload())))
      .rejects.toEqual(expect.objectContaining({ code: 'quota_exceeded', recoverable: true }));
    expect(events).toHaveBeenCalledWith(expect.objectContaining({ kind: 'quota' }));
    await expect(repository.getMetadata()).resolves.toBeNull();
  });

  it('provides an empty versioned foundation seed', async () => {
    const seed = await createFoundationDemoSeed();
    expect(seed).toMatchObject({ datasetVersion: 'foundation-v1', entities: [] });
  });

  it('maps platform quota errors and announces recoverable browser status', () => {
    expect(normalizeDemoRepositoryError(new DOMException('full', 'QuotaExceededError')))
      .toEqual(expect.objectContaining({ code: 'quota_exceeded' }));
    const listener = vi.fn();
    window.addEventListener(demoRepositoryStatusEventName, listener, { once: true });
    announceDemoRepositoryStatus({ kind: 'versionchange', databaseName: 'test' });
    expect(listener).toHaveBeenCalledOnce();
    expect(document.querySelector('[data-rin-demo-repository-status="versionchange"]')?.textContent)
      .toContain('Reload this tab');
  });
});
