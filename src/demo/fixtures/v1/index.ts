import fixtureDocumentInput from './dataset.json';
import seedManifest from './seed-manifest.generated.json';

import { DemoRepositoryError } from '@/demo/repository/errors';
import { createDemoSeed } from '@/demo/repository/seed';
import type {
  DemoBlobRecord,
  DemoRepository,
  DemoSeed,
  DemoSeedPayload,
} from '@/demo/repository/types';
import { parseDemoFixtureDocument } from './schema';

const fixtureDocument = parseDemoFixtureDocument(fixtureDocumentInput);

function sortedByKey<RecordType extends Readonly<{ key: string }>>(records: readonly RecordType[]): RecordType[] {
  return [...records].sort((left, right) => left.key.localeCompare(right.key));
}

function fixtureBlobs(): DemoBlobRecord[] {
  return sortedByKey(fixtureDocument.assets.map((asset) => ({
    key: asset.key,
    name: asset.name,
    type: asset.type,
    bytes: new TextEncoder().encode(asset.text),
    createdAt: asset.createdAt,
  })));
}

export const rinspaceDemoFixtureMetadata = Object.freeze({
  schemaVersion: fixtureDocument.schemaVersion,
  datasetVersion: fixtureDocument.datasetVersion,
  fixedNow: fixtureDocument.fixedNow,
  provenance: fixtureDocument.provenance,
  license: fixtureDocument.license,
  declaredEmptyStates: fixtureDocument.declaredEmptyStates,
  checksum: seedManifest.checksum,
});

export async function createRinspaceDemoSeed(): Promise<DemoSeed> {
  const payload: DemoSeedPayload = {
    datasetVersion: fixtureDocument.datasetVersion,
    entities: sortedByKey(fixtureDocument.entities),
    relations: sortedByKey(fixtureDocument.relations),
    drafts: sortedByKey(fixtureDocument.drafts),
    blobs: fixtureBlobs(),
    preferences: sortedByKey(fixtureDocument.preferences),
  };
  const seed = await createDemoSeed(payload);
  if (seed.checksum !== seedManifest.checksum) {
    throw new DemoRepositoryError('seed_invalid', 'Generated demo seed manifest does not match the fixture.', false);
  }
  return seed;
}

export async function seedRinspaceDemoRepository(repository: DemoRepository) {
  return repository.ensureSeed(await createRinspaceDemoSeed());
}

export { parseDemoFixtureDocument } from './schema';
