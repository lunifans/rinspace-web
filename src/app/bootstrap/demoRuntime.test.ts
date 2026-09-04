import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseRuntimeConfig } from '@/app/config/runtime';
import { closeDemoRepositoryRuntime, createMemoryDemoRepository } from '@/demo/repository';
import {
  demoPersonaStorageKey,
  demoWorkerRegistrationStorageKey,
  initializeDemoRuntime,
  resolveDemoPersona,
} from './demoRuntime';

const demo = parseRuntimeConfig(JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'config/runtime.demo.json'), 'utf8'),
) as unknown);

describe('demo bootstrap barrier', () => {
  afterEach(() => closeDemoRepositoryRuntime());

  it('restores persona and waits for the scoped worker before becoming ready', async () => {
    const values = new Map<string, string>([[demoPersonaStorageKey, 'member']]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => { values.delete(key); },
      setItem: (key: string, value: string) => { values.set(key, value); },
    };
    let release: (() => void) | undefined;
    const start = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const repository = createMemoryDemoRepository();
    const serviceWorker = {
      getRegistrations: vi.fn(async () => [] as ServiceWorkerRegistration[]),
      getRegistration: vi.fn(async () => ({
        scope: 'http://localhost:4173/',
        active: { scriptURL: 'http://localhost:4173/mockServiceWorker.js' },
        waiting: null,
        installing: null,
        update: vi.fn(async () => undefined),
        unregister: vi.fn(async () => true),
      } as unknown as ServiceWorkerRegistration)),
    };
    const initialization = initializeDemoRuntime(demo, {
      storage,
      locationOrigin: 'http://localhost:4173',
      serviceWorker,
      createRepository: async () => repository,
      createWorker: async () => ({ start }),
    });
    let settled = false;
    void initialization.then(() => { settled = true; });
    await vi.waitFor(() => expect(start).toHaveBeenCalledOnce());
    expect(settled).toBe(false);
    release?.();
    await expect(initialization).resolves.toEqual({
      mode: 'demo',
      persona: 'member',
      demoRepositoryReady: true,
      demoWorkerReady: true,
      adapters: { auth: 'demo', http: 'msw' },
      demoMemberIdentity: null,
    });
    expect(start).toHaveBeenCalledWith({
      serviceWorker: { url: '/mockServiceWorker.js', options: { scope: '/' } },
      onUnhandledRequest: 'error',
      quiet: true,
    });
    expect(JSON.parse(values.get(demoWorkerRegistrationStorageKey) || '{}')).toEqual({
      schemaVersion: 1,
      scriptURL: 'http://localhost:4173/mockServiceWorker.js',
      scope: 'http://localhost:4173/',
    });
    await expect(repository.getMetadata()).resolves.toMatchObject({
      schemaVersion: 2,
      datasetVersion: 'rinspace-demo-v1',
      state: 'ready',
    });
  });

  it('uses guest for corrupt persona state and propagates worker startup failure', async () => {
    const storage = {
      getItem: () => 'operator',
      removeItem: vi.fn(),
      setItem: vi.fn(),
    };
    const serviceWorker = {
      getRegistrations: vi.fn(async () => [] as ServiceWorkerRegistration[]),
      getRegistration: vi.fn(),
    };
    await expect(initializeDemoRuntime(demo, {
      storage,
      serviceWorker,
      createRepository: async () => createMemoryDemoRepository(),
      createWorker: async () => ({ start: async () => { throw new Error('worker failed'); } }),
    })).rejects.toMatchObject({ stage: 'worker_start' });
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('applies and removes a stable demo persona query without losing other URL state', () => {
    const values = new Map<string, string>([[demoPersonaStorageKey, 'guest']]);
    const replaceHistory = vi.fn();
    const persona = resolveDemoPersona({
      storage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
      },
      href: 'https://demo.example/rinspace-demo/settings?tab=profile&demoPersona=member#account',
      replaceHistory,
    });

    expect(persona).toBe('member');
    expect(values.get(demoPersonaStorageKey)).toBe('member');
    expect(replaceHistory).toHaveBeenCalledWith('/rinspace-demo/settings?tab=profile#account');
  });

  it('fails closed to guest and cleans an invalid demo persona query', () => {
    const values = new Map<string, string>([[demoPersonaStorageKey, 'member']]);
    const replaceHistory = vi.fn();
    const persona = resolveDemoPersona({
      storage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
      },
      href: 'https://demo.example/?demoPersona=operator&ref=readme',
      replaceHistory,
    });

    expect(persona).toBe('guest');
    expect(values.get(demoPersonaStorageKey)).toBe('guest');
    expect(replaceHistory).toHaveBeenCalledWith('/?ref=readme');
  });
});
