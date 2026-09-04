import { useEffect, useState } from 'react';

import { useAuthAdapter, useAuthSnapshot } from '@/platform/auth/context';
import { loadAdminWorkspaceCapabilities } from '@/services/domains/operations';

import {
  adminIdentitySignalsFromAuth,
  adminWorkspaceFailureState,
  deriveAdminWorkspaceAccess,
  type AdminWorkspaceAccessState,
} from './access';

type LoadedAccessState = Readonly<{
  identityKey: string;
  value: AdminWorkspaceAccessState;
}>;

export function useAdminWorkspaceAccess(): AdminWorkspaceAccessState {
  const auth = useAuthAdapter();
  const authSnapshot = useAuthSnapshot();
  const { isAdmin, isModerator } = adminIdentitySignalsFromAuth(authSnapshot);
  const identityKey = [
    auth.kind,
    authSnapshot.status,
    authSnapshot.user?.id || '',
    isAdmin ? 'admin' : isModerator ? 'moderator' : 'member',
  ].join(':');
  const [loaded, setLoaded] = useState<LoadedAccessState>({
    identityKey: '',
    value: { kind: 'loading' },
  });

  useEffect(() => {
    if (authSnapshot.status !== 'authenticated' || auth.kind === 'demo-auth') return undefined;
    let active = true;
    setLoaded({ identityKey, value: { kind: 'loading' } });
    const load = async () => {
      try {
        const capabilities = await loadAdminWorkspaceCapabilities();
        const access = deriveAdminWorkspaceAccess({ isAdmin, isModerator }, capabilities);
        if (!active) return;
        setLoaded({
          identityKey,
          value: access.allowedViews.length ? { kind: 'ready', access } : { kind: 'denied' },
        });
      } catch (error: unknown) {
        const failure = adminWorkspaceFailureState(error);
        if (failure.kind === 'unavailable') console.error('Admin workspace access failed', error);
        if (active) setLoaded({ identityKey, value: failure });
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [auth.kind, authSnapshot.status, identityKey, isAdmin, isModerator]);

  if (authSnapshot.status === 'restoring') return { kind: 'loading' };
  if (authSnapshot.status === 'guest' || auth.kind === 'demo-auth') return { kind: 'denied' };
  return loaded.identityKey === identityKey ? loaded.value : { kind: 'loading' };
}
