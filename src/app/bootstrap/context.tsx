import {
  createContext,
  useContext,
  type ReactNode,
} from 'react';

import type { RuntimeConfig } from '@/app/config/runtime';
import type { RuntimePorts } from '@/platform/runtime';
import type { BootstrapModeRuntime, DemoPersona } from './types';

export type { BootstrapAdapterSelection, BootstrapModeRuntime, DemoPersona } from './types';

export type BootstrapContextValue = Readonly<{
  config: RuntimeConfig;
  modeRuntime: BootstrapModeRuntime;
  ports: RuntimePorts;
}>;

const BootstrapContext = createContext<BootstrapContextValue | null>(null);

export function BootstrapProvider({
  value,
  children,
}: {
  value: BootstrapContextValue;
  children: ReactNode;
}) {
  return (
    <BootstrapContext.Provider value={value}>
      {children}
    </BootstrapContext.Provider>
  );
}

export function useBootstrap(): BootstrapContextValue {
  const value = useContext(BootstrapContext);
  if (value === null) throw new Error('BootstrapProvider is required before rendering the application.');
  return value;
}

export function useOptionalBootstrap(): BootstrapContextValue | null {
  return useContext(BootstrapContext);
}
