import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  authSyncStorageKey,
  createCloudBaseAuthAdapter,
  createDemoAuthAdapter,
  runtimeRolesFromBackendIdentity,
} from './adapters';

const sessionKey = 'rinspace-auth-session';
const snapshotKey = 'rinspace-topbar-session-cache';

class MockBroadcastChannel {
  static latest: MockBroadcastChannel | null = null;

  readonly name: string;
  readonly messages: unknown[] = [];
  closed = false;
  private readonly listeners = new Set<(event: MessageEvent<unknown>) => void>();

  constructor(name: string) {
    this.name = name;
    MockBroadcastChannel.latest = this;
  }

  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void) {
    if (type === 'message') this.listeners.add(listener);
  }

  postMessage(value: unknown) {
    this.messages.push(value);
  }

  close() {
    this.closed = true;
  }

  dispatch(value: unknown) {
    for (const listener of this.listeners) {
      listener(new MessageEvent('message', { data: value }));
    }
  }
}

function capabilities(...values: string[]) {
  return new Set(values) as never;
}

function seedCachedMember() {
  window.localStorage.setItem(sessionKey, JSON.stringify({
    access_token: 'header.payload.signature',
    refresh_token: 'refresh-token',
    sub: 'user-1',
  }));
  window.localStorage.setItem(snapshotKey, JSON.stringify({
    authorizationSource: 'backend-identity-v1',
    user: { id: 'user-1', username: 'reader' },
    profile: { nickname: '月见', avatarDataUrl: '/avatar.png' },
    nickname: '月见',
    avatarDataUrl: '/avatar.png',
    publicUserId: 'reader',
    isAdmin: false,
    isModerator: false,
    cachedAt: 1,
  }));
}

describe('auth adapters', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.stubGlobal('BroadcastChannel', undefined);
    MockBroadcastChannel.latest = null;
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('maps only backend identity roles into member, moderator, and administrator UI roles', () => {
    expect(runtimeRolesFromBackendIdentity({ role_id: 1, role_name: 'member' })).toEqual(['member']);
    expect(runtimeRolesFromBackendIdentity({ role_id: 3, role_name: 'moderator' })).toEqual(['member', 'moderator']);
    expect(runtimeRolesFromBackendIdentity({ role_id: 2, role_name: 'admin' })).toEqual(['member', 'moderator', 'admin']);
  });

  it('represents both demo personas without creating a backend credential', async () => {
    const adapter = createDemoAuthAdapter('member', capabilities('content.read', 'content.create'));
    expect(adapter.getSnapshot()).toMatchObject({
      status: 'authenticated',
      user: {
        id: 'demo-user-member',
        username: 'demo-orbit-reader',
        publicUserId: 'demo-orbit-reader',
        displayName: '轨道读者',
      },
      roles: ['member', 'author'],
    });
    expect(adapter.getSnapshot().user?.avatarUrl).toMatch(/^data:image\/svg\+xml/);
    await expect(adapter.getAccessToken()).resolves.toBeNull();

    const observed: string[] = [];
    const unsubscribe = adapter.subscribe((snapshot) => observed.push(snapshot.status));
    adapter.setDemoPersona?.('guest');
    unsubscribe();

    expect(observed).toEqual(['guest']);
    expect(adapter.getSnapshot()).toMatchObject({ status: 'guest', user: null });
    expect(adapter.getSnapshot().capabilities.has('demo.reset')).toBe(true);
    expect(window.localStorage.getItem(sessionKey)).toBeNull();
  });

  it('uses the cached member as its first atomic snapshot and falls back to it offline', async () => {
    seedCachedMember();
    const adapter = createCloudBaseAuthAdapter();
    expect(adapter.getSnapshot()).toMatchObject({
      status: 'authenticated',
      user: {
        id: 'user-1',
        username: 'reader',
        publicUserId: 'reader',
        displayName: '月见',
        avatarUrl: '/avatar.png',
      },
    });
    await expect(adapter.restore()).resolves.toMatchObject({
      status: 'authenticated',
      user: { id: 'user-1', displayName: '月见' },
    });
  });

  it('rejects legacy cached administrator flags without backend identity provenance', async () => {
    window.localStorage.setItem(sessionKey, JSON.stringify({
      access_token: 'header.payload.signature',
      refresh_token: 'refresh-token',
      sub: 'user-1',
    }));
    window.localStorage.setItem(snapshotKey, JSON.stringify({
      user: { id: 'user-1', username: 'reader' },
      publicUserId: 'reader',
      isAdmin: true,
      isModerator: true,
      cachedAt: 1,
    }));

    const adapter = createCloudBaseAuthAdapter();
    expect(adapter.getSnapshot()).toMatchObject({ status: 'restoring', roles: [] });
    expect(window.localStorage.getItem(snapshotKey)).toBeNull();
    await expect(adapter.restore()).resolves.toMatchObject({
      status: 'authenticated',
      roles: ['member'],
    });
  });

  it('synchronizes a peer logout through the storage fallback and ignores corrupt messages', async () => {
    seedCachedMember();
    const adapter = createCloudBaseAuthAdapter();
    const stop = adapter.start();
    window.localStorage.removeItem(sessionKey);
    window.localStorage.removeItem(snapshotKey);

    window.dispatchEvent(new StorageEvent('storage', {
      key: authSyncStorageKey,
      newValue: '{broken',
    }));
    expect(adapter.getSnapshot().status).toBe('authenticated');

    window.dispatchEvent(new StorageEvent('storage', {
      key: authSyncStorageKey,
      newValue: JSON.stringify({
        version: 1,
        source: 'peer-tab',
        sequence: 1,
        action: 'signed-out',
      }),
    }));
    await vi.waitFor(() => expect(adapter.getSnapshot().status).toBe('guest'));
    stop();
  });

  it('uses BroadcastChannel when available and closes it with the adapter lifecycle', async () => {
    vi.stubGlobal('BroadcastChannel', MockBroadcastChannel);
    seedCachedMember();
    const adapter = createCloudBaseAuthAdapter();
    const stop = adapter.start();
    const channel = MockBroadcastChannel.latest;
    expect(channel?.name).toBe('rinspace-auth-v1');

    window.localStorage.removeItem(sessionKey);
    window.localStorage.removeItem(snapshotKey);
    channel?.dispatch({
      version: 1,
      source: 'peer-tab',
      sequence: 1,
      action: 'signed-out',
    });

    await vi.waitFor(() => expect(adapter.getSnapshot().status).toBe('guest'));
    stop();
    expect(channel?.closed).toBe(true);
  });

  it('broadcasts only a versioned change signal and keeps tokens out of cross-tab payloads', async () => {
    seedCachedMember();
    const writes: string[] = [];
    const originalSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItem(this: Storage, key, value) {
      if (key === authSyncStorageKey) writes.push(value);
      originalSetItem.call(this, key, value);
    });
    const adapter = createCloudBaseAuthAdapter();
    const stop = adapter.start();
    await adapter.signOut();
    stop();

    expect(writes).toHaveLength(1);
    expect(JSON.parse(writes[0] || '{}')).toMatchObject({
      version: 1,
      action: 'signed-out',
    });
    expect(writes[0]).not.toContain('access_token');
    expect(writes[0]).not.toContain('refresh-token');
  });

  it('does not let an obsolete restore authenticate the tab after sign-out', async () => {
    seedCachedMember();
    let resolveUser: ((response: Response) => void) | undefined;
    const userResponse = new Promise<Response>((resolve) => { resolveUser = resolve; });
    vi.mocked(globalThis.fetch).mockImplementation(async (input) => {
      if (String(input).includes('/auth/v1/user/me')) return userResponse;
      return new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const adapter = createCloudBaseAuthAdapter();
    const restoring = adapter.restore();

    await adapter.signOut();
    resolveUser?.(new Response(JSON.stringify({ sub: 'user-1', username: 'reader' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    await expect(restoring).resolves.toMatchObject({ status: 'guest', user: null });
    expect(adapter.getSnapshot()).toMatchObject({ status: 'guest', user: null });
    expect(window.localStorage.getItem(sessionKey)).toBeNull();
    expect(window.localStorage.getItem(snapshotKey)).toBeNull();
  });
});
