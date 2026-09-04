import { DemoRepositoryError } from './errors';
import type { DemoBlobRecord, DemoSeed, DemoSeedPayload, DemoStoreName } from './types';

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, '0')).join('');
}

async function sha256(value: ArrayBuffer | Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new DemoRepositoryError('unavailable', 'Cryptographic checksum support is unavailable.', false);
  }
  const source = value instanceof Uint8Array ? value : new Uint8Array(value);
  const input = new Uint8Array(source.byteLength);
  input.set(source);
  return hex(await globalThis.crypto.subtle.digest('SHA-256', input.buffer));
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  throw new DemoRepositoryError('seed_invalid', 'Demo seed contains a non-serializable value.', false);
}

async function canonicalBlob(record: DemoBlobRecord) {
  return {
    key: record.key,
    name: record.name,
    type: record.type,
    createdAt: record.createdAt,
    size: record.bytes.byteLength,
    sha256: await sha256(record.bytes),
  };
}

export async function computeDemoSeedChecksum(seed: DemoSeedPayload): Promise<string> {
  const blobs = await Promise.all(seed.blobs.map(canonicalBlob));
  const canonical = canonicalJson({ ...seed, blobs });
  return `sha256:${await sha256(new TextEncoder().encode(canonical))}`;
}

export async function createDemoSeed(payload: DemoSeedPayload): Promise<DemoSeed> {
  return Object.freeze({ ...payload, checksum: await computeDemoSeedChecksum(payload) });
}

export function createFoundationDemoSeed(): Promise<DemoSeed> {
  return createDemoSeed({
    datasetVersion: 'foundation-v1',
    entities: [],
    relations: [],
    drafts: [],
    blobs: [],
    preferences: [],
  });
}

const seededStores: readonly Exclude<DemoStoreName, 'meta'>[] = [
  'entities', 'relations', 'drafts', 'blobs', 'preferences',
];

export function validateDemoSeedKeys(seed: DemoSeed): void {
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(seed.datasetVersion)) {
    throw new DemoRepositoryError('seed_invalid', 'Demo seed datasetVersion is invalid.', false);
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(seed.checksum)) {
    throw new DemoRepositoryError('seed_invalid', 'Demo seed checksum is invalid.', false);
  }
  for (const store of seededStores) {
    const records = seed[store];
    const keys = new Set<string>();
    for (const record of records) {
      if (!record.key || keys.has(record.key)) {
        throw new DemoRepositoryError('seed_invalid', `Demo seed has a duplicate or empty ${store} key.`, false);
      }
      keys.add(record.key);
    }
  }
}

export async function validateDemoSeed(seed: DemoSeed): Promise<void> {
  validateDemoSeedKeys(seed);
  const { checksum: _checksum, ...payload } = seed;
  if (await computeDemoSeedChecksum(payload) !== seed.checksum) {
    throw new DemoRepositoryError('seed_invalid', 'Demo seed checksum does not match its contents.', false);
  }
}
