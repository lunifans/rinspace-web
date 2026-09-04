import { describe, expect, it, vi } from 'vitest';

import { demoWorkerRegistrationStorageKey } from './demoRuntime';
import { resetBootstrapState } from './errorPage';

describe('bootstrap safe reset', () => {
  it('only clears Rinspace demo keys and its exact recorded worker', async () => {
    localStorage.clear();
    localStorage.setItem('rinspace.demo.persona.v1', 'member');
    localStorage.setItem('rinspace.demo.entities.v1', 'local-demo-data');
    localStorage.setItem('unrelated.preference', 'keep-me');
    localStorage.setItem(demoWorkerRegistrationStorageKey, JSON.stringify({
      schemaVersion: 1,
      scriptURL: 'http://localhost/mockServiceWorker.js',
      scope: 'http://localhost/',
    }));
    const unregisterExpected = vi.fn(async () => true);
    const unregisterOther = vi.fn(async () => true);
    const serviceWorker = {
      getRegistrations: vi.fn(async () => ([
        {
          scope: 'http://localhost/',
          active: { scriptURL: 'http://localhost/mockServiceWorker.js' },
          waiting: null,
          installing: null,
          unregister: unregisterExpected,
        },
        {
          scope: 'http://localhost/other/',
          active: { scriptURL: 'http://localhost/other-worker.js' },
          waiting: null,
          installing: null,
          unregister: unregisterOther,
        },
      ] as unknown as ServiceWorkerRegistration[])),
    };
    const deleteRepository = vi.fn(async () => undefined);
    await resetBootstrapState({ storage: localStorage, serviceWorker, deleteRepository });
    expect(localStorage.getItem('rinspace.demo.persona.v1')).toBeNull();
    expect(localStorage.getItem('rinspace.demo.entities.v1')).toBeNull();
    expect(localStorage.getItem('unrelated.preference')).toBe('keep-me');
    expect(unregisterExpected).toHaveBeenCalledOnce();
    expect(unregisterOther).not.toHaveBeenCalled();
    expect(deleteRepository).toHaveBeenCalledOnce();
  });
});
