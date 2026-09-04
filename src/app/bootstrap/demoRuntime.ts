import type { RuntimeConfig } from '@/app/config/runtime';
import {
  announceDemoRepositoryStatus,
  installDemoRepositoryRuntime,
  openIndexedDbDemoRepository,
  type DemoRepository,
  type DemoSeed,
} from '@/demo/repository';
import type { BootstrapModeRuntime, DemoPersona } from './types';
import {
  demoInterfaceIdentityFromPreference,
  demoInterfacePreferenceKey,
  demoProfileIdentityFromPreference,
  demoProfilePreferenceKey,
} from '@/demo/identity';
import {
  demoWorkerRegistrationSchemaVersion,
  demoWorkerRegistrationStorageKey,
  prepareDemoWorkerRegistration,
  unregisterExactDemoWorker,
  verifyDemoWorkerRegistration,
  type DemoWorkerDescriptor,
} from './demoWorkerLifecycle';

export const demoPersonaStorageKey = 'rinspace.demo.persona.v1';
export { demoWorkerRegistrationStorageKey } from './demoWorkerLifecycle';

export class DemoRuntimeInitializationError extends Error {
  constructor(
    readonly stage: 'worker_prepare' | 'worker_start' | 'worker_verify',
    cause: unknown,
  ) {
    super('The demo worker could not reach a safe ready state.', { cause });
    this.name = 'DemoRuntimeInitializationError';
  }
}

type DemoWorker = Readonly<{
  start: (options: {
    serviceWorker: { url: string; options: { scope: string } };
    onUnhandledRequest: 'error';
    quiet: boolean;
  }) => Promise<unknown>;
}>;

type DemoRuntimeDependencies = Readonly<{
  storage?: Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;
  locationOrigin?: string;
  locationHref?: string;
  replaceHistory?: (url: string) => void;
  serviceWorker?: Pick<ServiceWorkerContainer, 'getRegistration' | 'getRegistrations'>;
  createRepository?: (config: RuntimeConfig) => Promise<DemoRepository>;
  createSeed?: () => Promise<DemoSeed>;
  createWorker?: (config: RuntimeConfig, repository: DemoRepository) => Promise<DemoWorker>;
}>;

function storedPersona(storage: Pick<Storage, 'getItem'>): DemoPersona {
  try {
    return storage.getItem(demoPersonaStorageKey) === 'member' ? 'member' : 'guest';
  } catch {
    return 'guest';
  }
}

export function resolveDemoPersona(input: Readonly<{
  storage: Pick<Storage, 'getItem' | 'setItem'>;
  href: string;
  replaceHistory: (url: string) => void;
}>): DemoPersona {
  const url = new URL(input.href);
  const parameter = url.searchParams.get('demoPersona');
  const persona = parameter === 'member' || parameter === 'guest'
    ? parameter
    : parameter === null
      ? storedPersona(input.storage)
      : 'guest';
  if (parameter !== null) {
    input.storage.setItem(demoPersonaStorageKey, persona);
    url.searchParams.delete('demoPersona');
    input.replaceHistory(`${url.pathname}${url.search}${url.hash}`);
  }
  return persona;
}

function workerPath(basePath: string): string {
  return `${basePath}mockServiceWorker.js`;
}

function workerDescriptor(basePath: string, origin: string): DemoWorkerDescriptor {
  return Object.freeze({
    schemaVersion: demoWorkerRegistrationSchemaVersion,
    scriptURL: new URL(workerPath(basePath), origin).toString(),
    scope: new URL(basePath, origin).toString(),
  });
}

async function defaultCreateRepository(): Promise<DemoRepository> {
  return openIndexedDbDemoRepository({ onStatus: announceDemoRepositoryStatus });
}

async function defaultCreateSeed(): Promise<DemoSeed> {
  const { createRinspaceDemoSeed } = await import('@/demo/fixtures/v1');
  return createRinspaceDemoSeed();
}

async function defaultCreateWorker(config: RuntimeConfig, repository: DemoRepository): Promise<DemoWorker> {
  const { createDemoWorker } = await import('@/demo/mock/browser');
  return createDemoWorker(config, repository);
}

export async function initializeDemoRuntime(
  config: RuntimeConfig,
  dependencies: DemoRuntimeDependencies = {},
): Promise<BootstrapModeRuntime> {
  if (config.mode !== 'demo') throw new Error('Demo runtime can only initialize a demo configuration.');
  const storage = dependencies.storage ?? window.localStorage;
  const origin = dependencies.locationOrigin ?? window.location.origin;
  const href = dependencies.locationHref ?? window.location.href;
  const replaceHistory = dependencies.replaceHistory ?? ((url: string) => {
    window.history.replaceState(window.history.state, '', url);
  });
  const serviceWorker = dependencies.serviceWorker ?? navigator.serviceWorker;
  const persona = resolveDemoPersona({ storage, href, replaceHistory });
  const repository = await (dependencies.createRepository ?? defaultCreateRepository)(config);
  try {
    await repository.ensureSeed(await (dependencies.createSeed ?? defaultCreateSeed)());
  } catch (error) {
    repository.close();
    throw error;
  }
  const storedIdentity = await repository.transaction(
    ['preferences'],
    'readonly',
    async (transaction) => ({
      profile: await transaction.get('preferences', demoProfilePreferenceKey),
      interface: await transaction.get('preferences', demoInterfacePreferenceKey),
    }),
  );
  const demoMemberProfile = {
    ...(demoProfileIdentityFromPreference(storedIdentity.profile?.value) ?? {}),
    ...(demoInterfaceIdentityFromPreference(storedIdentity.interface?.value) ?? {}),
  };
  const worker = await (dependencies.createWorker ?? defaultCreateWorker)(config, repository);
  const path = workerPath(config.basePath);
  const descriptor = workerDescriptor(config.basePath, origin);
  try {
    try {
      await prepareDemoWorkerRegistration(descriptor, storage, serviceWorker);
    } catch (error) {
      throw new DemoRuntimeInitializationError('worker_prepare', error);
    }
    try {
      await worker.start({
        serviceWorker: { url: path, options: { scope: config.basePath } },
        onUnhandledRequest: 'error',
        quiet: true,
      });
    } catch (error) {
      throw new DemoRuntimeInitializationError('worker_start', error);
    }
    try {
      await verifyDemoWorkerRegistration(descriptor, storage, serviceWorker);
    } catch (error) {
      throw new DemoRuntimeInitializationError('worker_verify', error);
    }
  } catch (error) {
    await unregisterExactDemoWorker(descriptor, serviceWorker).catch(() => false);
    repository.close();
    throw error;
  }
  installDemoRepositoryRuntime(repository);
  storage.setItem(demoPersonaStorageKey, persona);
  return Object.freeze({
    mode: 'demo',
    persona,
    demoRepositoryReady: true,
    demoWorkerReady: true,
    adapters: Object.freeze({ auth: 'demo', http: 'msw' }),
    demoMemberIdentity: Object.keys(demoMemberProfile).length > 0 ? demoMemberProfile : null,
  });
}
