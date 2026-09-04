import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider } from '@/platform/auth/context';
import type { AuthAdapter, RuntimeAuthSnapshot } from '@/platform/runtime';
import { loadAdminWorkspaceCapabilities } from '@/services/domains/operations';

import { useAdminWorkspaceAccess } from './useAdminWorkspaceAccess';

vi.mock('@/services/domains/operations', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/services/domains/operations')>();
  return { ...original, loadAdminWorkspaceCapabilities: vi.fn() };
});

const workspaceCapabilities = {
  views: { home: true, content: true, review: true, system: false },
  systemSections: { overview: false, events: false, publishing: false, consistency: false, records: false },
  capabilities: {},
  features: { moderationCasesV2: true, reportFeedback: false, systemOperations: false, controlCommands: false },
};

function authSnapshot(roles: readonly string[]): RuntimeAuthSnapshot {
  return {
    status: 'authenticated',
    user: {
      id: 'user-1',
      username: 'member',
      publicUserId: 'member',
      displayName: 'Member',
      avatarUrl: null,
      language: '',
      colorScheme: '',
    },
    roles,
    capabilities: new Set(),
  };
}

function adapter(
  snapshot: RuntimeAuthSnapshot,
  kind: AuthAdapter['kind'],
): AuthAdapter {
  return {
    kind,
    getSnapshot: () => snapshot,
    getAccessToken: async () => null,
    getDeviceId: () => null,
    subscribe: () => () => undefined,
    start: () => () => undefined,
    restore: async () => snapshot,
    signOut: async () => snapshot,
    sendPhoneOtp: async () => { throw new Error('not used'); },
    completePhoneOtp: async () => { throw new Error('not used'); },
    updatePreferences: () => snapshot,
  };
}

function wrapper(auth: AuthAdapter) {
  return function AuthWrapper({ children }: { children: ReactNode }) {
    return <AuthProvider adapter={auth}>{children}</AuthProvider>;
  };
}

describe('useAdminWorkspaceAccess', () => {
  beforeEach(() => {
    vi.mocked(loadAdminWorkspaceCapabilities).mockReset();
  });

  it('returns the standard denial for the demo member without requesting a remote capability', () => {
    const { result } = renderHook(() => useAdminWorkspaceAccess(), {
      wrapper: wrapper(adapter(authSnapshot(['member', 'author']), 'demo-auth')),
    });
    expect(result.current).toEqual({ kind: 'denied' });
    expect(loadAdminWorkspaceCapabilities).not.toHaveBeenCalled();
  });

  it('combines backend identity roles with the authoritative workspace capability response', async () => {
    vi.mocked(loadAdminWorkspaceCapabilities).mockResolvedValue(workspaceCapabilities);
    const { result } = renderHook(() => useAdminWorkspaceAccess(), {
      wrapper: wrapper(adapter(authSnapshot(['member', 'admin']), 'compatible-auth')),
    });
    await waitFor(() => expect(result.current.kind).toBe('ready'));
    expect(result.current).toMatchObject({
      kind: 'ready',
      access: { isAdmin: true, allowedViews: ['home', 'content', 'review'] },
    });
  });

  it('maps a backend capability refusal to denial even when the identity claims admin', async () => {
    vi.mocked(loadAdminWorkspaceCapabilities).mockRejectedValue({ status: 403 });
    const { result } = renderHook(() => useAdminWorkspaceAccess(), {
      wrapper: wrapper(adapter(authSnapshot(['member', 'admin']), 'cloudbase-auth')),
    });
    await waitFor(() => expect(result.current).toEqual({ kind: 'denied' }));
  });
});
