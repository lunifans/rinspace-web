import { DemoRepositoryError, normalizeDemoRepositoryError } from './errors';
import { validateDemoSeed } from './seed';
import {
  demoRepositoryMetaKey,
  demoStoreNames,
  type DemoMetaRecord,
  type DemoRepository,
  type DemoRepositoryInitialization,
  type DemoSeed,
  type DemoTransaction,
} from './types';

function metadata(value: unknown): DemoMetaRecord | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const schemaVersion = candidate.schemaVersion;
  const datasetVersion = candidate.datasetVersion;
  const checksum = candidate.checksum;
  const state = candidate.state;
  const seededAt = candidate.seededAt;
  const updatedAt = candidate.updatedAt;
  if (
    candidate.key !== demoRepositoryMetaKey
    || typeof schemaVersion !== 'number'
    || !Number.isInteger(schemaVersion)
    || typeof datasetVersion !== 'string'
    || typeof checksum !== 'string'
    || (state !== 'seeding' && state !== 'ready' && state !== 'recovering')
    || typeof seededAt !== 'string'
    || typeof updatedAt !== 'string'
  ) return null;
  return Object.freeze({
    key: demoRepositoryMetaKey,
    schemaVersion,
    datasetVersion,
    checksum,
    state,
    seededAt,
    updatedAt,
  });
}

export async function readDemoRepositoryMetadata(repository: DemoRepository): Promise<DemoMetaRecord | null> {
  const value = await repository.transaction(['meta'], 'readonly', (transaction) => (
    transaction.get('meta', demoRepositoryMetaKey)
  ));
  if (value === undefined) return null;
  return metadata(value);
}

async function writeSeedRecords(transaction: DemoTransaction, seed: DemoSeed): Promise<void> {
  await Promise.all(demoStoreNames.map((store) => transaction.clear(store)));
  for (const record of seed.entities) await transaction.put('entities', record);
  for (const record of seed.relations) await transaction.put('relations', record);
  for (const record of seed.drafts) await transaction.put('drafts', record);
  for (const record of seed.blobs) await transaction.put('blobs', record);
  for (const record of seed.preferences) await transaction.put('preferences', record);
}

export async function initializeDemoRepository(
  repository: DemoRepository,
  seed: DemoSeed,
  forceReset = false,
): Promise<DemoRepositoryInitialization> {
  await validateDemoSeed(seed);
  const existing = await readDemoRepositoryMetadata(repository);
  if (
    !forceReset
    && existing?.state === 'ready'
    && existing.datasetVersion === seed.datasetVersion
    && existing.checksum === seed.checksum
  ) {
    if (existing.schemaVersion === repository.schemaVersion) {
      return { action: 'existing', metadata: existing };
    }
    const migrated = Object.freeze({
      ...existing,
      schemaVersion: repository.schemaVersion,
      updatedAt: new Date().toISOString(),
    });
    await repository.transaction(['meta'], 'readwrite', (transaction) => transaction.put('meta', migrated));
    return { action: 'migrated', metadata: migrated };
  }

  const now = new Date().toISOString();
  const next = Object.freeze({
    key: demoRepositoryMetaKey,
    schemaVersion: repository.schemaVersion,
    datasetVersion: seed.datasetVersion,
    checksum: seed.checksum,
    state: 'ready' as const,
    seededAt: now,
    updatedAt: now,
  });
  try {
    await repository.transaction(demoStoreNames, 'readwrite', async (transaction) => {
      await writeSeedRecords(transaction, seed);
      await transaction.put('meta', next);
    });
  } catch (error) {
    throw normalizeDemoRepositoryError(error, 'Demo seed transaction failed.');
  }
  return {
    action: forceReset ? 'reset' : existing ? 'recovered' : 'seeded',
    metadata: next,
  };
}

export function requireDemoRepositoryMetadata(value: unknown): DemoMetaRecord {
  const parsed = metadata(value);
  if (!parsed) throw new DemoRepositoryError('corrupt_metadata', 'Demo repository metadata is corrupt.', true);
  return parsed;
}
