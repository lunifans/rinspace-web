import { useCallback, useEffect, useRef, useState } from 'react';

export type AsyncState<T> = { status: 'idle' | 'loading'; data?: T; error?: never } | { status: 'success'; data: T; error?: never } | { status: 'error'; data?: T; error: Error };
function asError(value: unknown) { return value instanceof Error ? value : new Error(String(value)); }

export function useAsyncResource<T>(load: () => Promise<T>, dependencies: readonly unknown[] = []) {
  const [state, setState] = useState<AsyncState<T>>({ status: 'idle' });
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const current = ++generation.current;
    setState((previous) => ({ status: 'loading', data: previous.data }));
    try { const data = await load(); if (generation.current === current) setState({ status: 'success', data }); return data; }
    catch (error) { if (generation.current === current) setState((previous) => ({ status: 'error', data: previous.data, error: asError(error) })); throw error; }
  // The caller owns the dependency list just like useEffect/useCallback.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);
  useEffect(() => { void reload().catch(() => undefined); return () => { generation.current += 1; }; }, [reload]);
  return { ...state, reload };
}

export function useExclusiveMutation<TArgs extends readonly unknown[], TResult>(mutate: (...args: TArgs) => Promise<TResult>) {
  const pending = useRef<Promise<TResult> | null>(null);
  const [state, setState] = useState<AsyncState<TResult>>({ status: 'idle' });
  const run = useCallback((...args: TArgs) => {
    if (pending.current) return pending.current;
    setState({ status: 'loading' });
    const operation = mutate(...args).then((data) => { setState({ status: 'success', data }); return data; }, (error) => { setState({ status: 'error', error: asError(error) }); throw error; }).finally(() => { pending.current = null; });
    pending.current = operation;
    return operation;
  }, [mutate]);
  return { ...state, run };
}
