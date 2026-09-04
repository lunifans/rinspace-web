import { describe, expect, it, vi } from 'vitest';

import {
  cleanupRecordedDemoWorker,
  demoWorkerRegistrationStorageKey,
  prepareDemoWorkerRegistration,
  verifyDemoWorkerRegistration,
  type DemoWorkerDescriptor,
} from './demoWorkerLifecycle';

const expected: DemoWorkerDescriptor = {
  schemaVersion: 1,
  scriptURL: 'http://localhost/rinspace/mockServiceWorker.js',
  scope: 'http://localhost/rinspace/',
};

function registration(
  scope: string,
  scriptURL: string,
  unregister = vi.fn(async () => true),
  update = vi.fn(async () => undefined),
) {
  return {
    scope,
    active: { scriptURL },
    waiting: null,
    installing: null,
    unregister,
    update,
  } as unknown as ServiceWorkerRegistration;
}

describe('demo worker lifecycle', () => {
  it('verifies the normalized subpath registration, requests an upgrade check, and records it', async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => { values.delete(key); },
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    const worker = registration(expected.scope, expected.scriptURL);
    await prepareDemoWorkerRegistration(expected, storage, { getRegistrations: vi.fn(async () => [worker]) });
    await verifyDemoWorkerRegistration(expected, storage, {
      getRegistration: vi.fn(async () => worker),
    });
    expect(JSON.parse(values.get(demoWorkerRegistrationStorageKey) ?? '{}')).toEqual(expected);
  });

  it('removes only the exact recorded worker during non-demo cleanup', async () => {
    const values = new Map([[demoWorkerRegistrationStorageKey, JSON.stringify(expected)]]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => { values.delete(key); },
    };
    const expectedRegistration = registration(expected.scope, expected.scriptURL);
    const unrelated = registration('http://localhost/unrelated/', 'http://localhost/other-worker.js');
    await expect(cleanupRecordedDemoWorker({
      storage,
      serviceWorker: { getRegistrations: vi.fn(async () => [expectedRegistration, unrelated]) },
    })).resolves.toBe(true);
    expect(expectedRegistration.unregister).toHaveBeenCalledOnce();
    expect(unrelated.unregister).not.toHaveBeenCalled();
    expect(values.has(demoWorkerRegistrationStorageKey)).toBe(false);
  });

  it('fails closed when the active scoped worker does not match the expected script', async () => {
    const storage = { setItem: vi.fn() };
    const unrelated = registration(expected.scope, 'http://localhost/rinspace/unexpected.js');
    await expect(verifyDemoWorkerRegistration(expected, storage, {
      getRegistration: vi.fn(async () => unrelated),
    })).rejects.toThrow('does not match');
    expect(unrelated.update).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
  });

});
