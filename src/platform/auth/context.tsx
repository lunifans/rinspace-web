import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import type { AuthAdapter, RuntimeAuthSnapshot } from '@/platform/runtime';

const AuthContext = createContext<AuthAdapter | null>(null);

export function AuthProvider({ adapter, children }: { adapter: AuthAdapter; children: ReactNode }) {
  useEffect(() => {
    const stop = adapter.start();
    void adapter.restore();
    return stop;
  }, [adapter]);
  return <AuthContext.Provider value={adapter}>{children}</AuthContext.Provider>;
}

export function useAuthAdapter(): AuthAdapter {
  const adapter = useContext(AuthContext);
  if (!adapter) throw new Error('AuthProvider is required before reading authentication state.');
  return adapter;
}

export function useAuthSnapshot(): RuntimeAuthSnapshot {
  const adapter = useAuthAdapter();
  return useSyncExternalStore(
    adapter.subscribe,
    adapter.getSnapshot,
    adapter.getSnapshot,
  );
}

const subscribeToNothing = () => () => undefined;
const readNoSnapshot = () => null;

export function useOptionalAuthSnapshot(): RuntimeAuthSnapshot | null {
  const adapter = useContext(AuthContext);
  return useSyncExternalStore(
    adapter?.subscribe ?? subscribeToNothing,
    adapter?.getSnapshot ?? readNoSnapshot,
    adapter?.getSnapshot ?? readNoSnapshot,
  );
}
