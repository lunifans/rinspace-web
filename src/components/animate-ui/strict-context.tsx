import { createContext, useContext, type ReactNode } from 'react';

/**
 * Strict context factory mirroring Animate UI's `@/registry/lib/get-strict-context`.
 * Returns a [Provider, useHook] pair where useHook throws when used outside the provider.
 */
export function getStrictContext<T>(name: string) {
  const Context = createContext<T | undefined>(undefined);
  Context.displayName = name;

  function Provider({ value, children }: { value: T; children: ReactNode }) {
    return <Context.Provider value={value}>{children}</Context.Provider>;
  }

  function useStrictContext(): T {
    const context = useContext(Context);
    if (context === undefined) {
      throw new Error(`${name} must be used within its Provider.`);
    }
    return context;
  }

  return [Provider, useStrictContext] as const;
}
