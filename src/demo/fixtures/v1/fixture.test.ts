import { describe, expect, it } from 'vitest';

import { createMemoryDemoRepository } from '@/demo/repository/memory';
import fixtureDocumentInput from './dataset.json';
import seedManifest from './seed-manifest.generated.json';
import {
  createRinspaceDemoSeed,
  parseDemoFixtureDocument,
  rinspaceDemoFixtureMetadata,
  seedRinspaceDemoRepository,
} from './index';

describe('Rinspace original demo fixture v1', () => {
  it('matches the generated checksum and remains deterministic', async () => {
    const first = await createRinspaceDemoSeed();
    const second = await createRinspaceDemoSeed();
    expect(first.checksum).toBe(seedManifest.checksum);
    expect(second.checksum).toBe(first.checksum);
    expect(rinspaceDemoFixtureMetadata).toMatchObject({
      datasetVersion: 'rinspace-demo-v1',
      checksum: seedManifest.checksum,
      provenance: { containsProductionData: false, containsRealPersonalData: false },
      license: { status: 'approved-task-4', distributionApproved: true },
    });
  });

  it('seeds the shared repository graph, drafts, and original local assets', async () => {
    const repository = createMemoryDemoRepository();
    await expect(seedRinspaceDemoRepository(repository)).resolves.toMatchObject({ action: 'seeded' });
    const snapshot = await repository.transaction(
      ['entities', 'relations', 'drafts', 'blobs', 'preferences'],
      'readonly',
      async (transaction) => ({
        contents: await transaction.getAll('entities', { index: 'by-kind', query: 'content' }),
        relations: await transaction.getAll('relations'),
        drafts: await transaction.getAll('drafts', { index: 'by-owner', query: 'demo-user-member' }),
        blobs: await transaction.getAll('blobs'),
        preferences: await transaction.getAll('preferences'),
      }),
    );
    expect(snapshot.contents).toHaveLength(7);
    expect(snapshot.relations).toHaveLength(20);
    expect(snapshot.drafts).toHaveLength(2);
    expect(snapshot.blobs).toHaveLength(6);
    expect(snapshot.preferences).toHaveLength(3);
    expect(snapshot.blobs.every((record) => record.bytes.byteLength > 0)).toBe(true);
    expect(snapshot.contents.some((record) => (
      record.kind === 'content'
      && record.data.body.includes('```')
      && record.data.body.includes('$')
    ))).toBe(true);
  });

  it('keeps the required bilingual domains and declared empty states', () => {
    const fixture = parseDemoFixtureDocument(fixtureDocumentInput);
    const users = fixture.entities.filter((entity) => entity.kind === 'user');
    const contents = fixture.entities.filter((entity) => entity.kind === 'content');
    expect(new Set(users.map((entity) => entity.data.locale))).toEqual(new Set(['en', 'zh-CN']));
    expect(new Set(contents.map((entity) => entity.data.type))).toEqual(new Set([
      'blog', 'book', 'discussion', 'dynamic', 'question',
    ]));
    expect(contents.some((entity) => entity.data.type === 'announcement')).toBe(false);
    expect(fixture.declaredEmptyStates).toContain('announcements');
    expect(fixture.declaredEmptyStates).toContain('search-no-results');
  });

  it('rejects unknown fixture fields instead of trusting imported JSON', () => {
    expect(() => parseDemoFixtureDocument({ ...fixtureDocumentInput, unexpected: true })).toThrow();
    const unsafe = structuredClone(fixtureDocumentInput) as Record<string, unknown>;
    const entities = unsafe.entities;
    if (!Array.isArray(entities) || !entities[0] || typeof entities[0] !== 'object') throw new Error('invalid test fixture');
    const first = entities[0] as Record<string, unknown>;
    const data = first.data;
    if (!data || typeof data !== 'object') throw new Error('invalid test fixture data');
    (data as Record<string, unknown>).email = 'not-allowed@example.test';
    expect(() => parseDemoFixtureDocument(unsafe)).toThrow();
  });

  it('records zero privacy findings without claiming legal approval', () => {
    expect(seedManifest.privacy).toEqual({ scannedFields: 512, findings: 0, externalUrls: 0 });
    expect(seedManifest.license).toEqual({
      status: 'approved-task-4',
      candidateSpdx: 'CC0-1.0',
      effectiveSpdx: 'CC0-1.0',
      distributionApproved: true,
    });
    expect(Object.keys(seedManifest.assetDigests)).toHaveLength(6);
    expect(Object.values(seedManifest.assetDigests).every((digest) => /^sha256:[a-f0-9]{64}$/.test(digest))).toBe(true);
  });
});
