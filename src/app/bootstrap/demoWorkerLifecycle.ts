export const demoWorkerRegistrationStorageKey = 'rinspace.demo.worker.v1';
export const demoWorkerRegistrationSchemaVersion = 1;

export type DemoWorkerDescriptor = Readonly<{
  schemaVersion: typeof demoWorkerRegistrationSchemaVersion;
  scriptURL: string;
  scope: string;
}>;

type WorkerRegistrationLike = Pick<
  ServiceWorkerRegistration,
  'active' | 'installing' | 'scope' | 'unregister' | 'waiting'
>;

type WorkerContainerLike = Readonly<{
  getRegistration: (scope?: string) => Promise<ServiceWorkerRegistration | undefined>;
  getRegistrations: () => Promise<readonly ServiceWorkerRegistration[]>;
}>;

type WorkerLookup = Partial<Pick<WorkerContainerLike, 'getRegistration' | 'getRegistrations'>>;

function registrationScriptURLs(registration: WorkerRegistrationLike): string[] {
  return [registration.active, registration.waiting, registration.installing]
    .map((worker) => worker?.scriptURL)
    .filter((value): value is string => typeof value === 'string');
}

export function parseDemoWorkerDescriptor(raw: string | null): DemoWorkerDescriptor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const value = parsed as Record<string, unknown>;
    if (
      value.schemaVersion !== demoWorkerRegistrationSchemaVersion
      || typeof value.scriptURL !== 'string'
      || typeof value.scope !== 'string'
    ) return null;
    return Object.freeze({
      schemaVersion: demoWorkerRegistrationSchemaVersion,
      scriptURL: value.scriptURL,
      scope: value.scope,
    });
  } catch {
    return null;
  }
}

function registrationMatches(registration: WorkerRegistrationLike, expected: DemoWorkerDescriptor): boolean {
  return registration.scope === expected.scope && registrationScriptURLs(registration).includes(expected.scriptURL);
}

export async function unregisterExactDemoWorker(
  expected: DemoWorkerDescriptor,
  serviceWorker: WorkerLookup,
): Promise<boolean> {
  const registration = serviceWorker.getRegistration
    ? await serviceWorker.getRegistration(expected.scope)
    : undefined;
  const registrations = registration
    ? [registration]
    : serviceWorker.getRegistrations
      ? await serviceWorker.getRegistrations()
      : [];
  let removed = false;
  await Promise.all(registrations.map(async (registration) => {
    if (!registrationMatches(registration, expected)) return;
    removed = await registration.unregister() || removed;
  }));
  return removed;
}

export async function cleanupRecordedDemoWorker({
  storage = window.localStorage,
  serviceWorker = navigator.serviceWorker,
}: Readonly<{
  storage?: Pick<Storage, 'getItem' | 'removeItem'>;
  serviceWorker?: Pick<WorkerContainerLike, 'getRegistrations'>;
}> = {}): Promise<boolean> {
  const expected = parseDemoWorkerDescriptor(storage.getItem(demoWorkerRegistrationStorageKey));
  if (!expected) return false;
  const removed = await unregisterExactDemoWorker(expected, serviceWorker);
  storage.removeItem(demoWorkerRegistrationStorageKey);
  return removed;
}

export async function prepareDemoWorkerRegistration(
  expected: DemoWorkerDescriptor,
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
  serviceWorker: WorkerLookup,
): Promise<void> {
  const recorded = parseDemoWorkerDescriptor(storage.getItem(demoWorkerRegistrationStorageKey));
  if (!recorded || (recorded.scope === expected.scope && recorded.scriptURL === expected.scriptURL)) return;
  await unregisterExactDemoWorker(recorded, serviceWorker);
  storage.removeItem(demoWorkerRegistrationStorageKey);
}

export async function verifyDemoWorkerRegistration(
  expected: DemoWorkerDescriptor,
  storage: Pick<Storage, 'setItem'>,
  serviceWorker: Pick<WorkerContainerLike, 'getRegistration'>,
): Promise<void> {
  const registration = await serviceWorker.getRegistration(expected.scope);
  if (!registration || !registrationMatches(registration, expected)) {
    throw new Error('The scoped demo Service Worker registration does not match the expected script.');
  }
  storage.setItem(demoWorkerRegistrationStorageKey, JSON.stringify(expected));
}
