import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAsyncResource, useExclusiveMutation } from './useAsyncState';

describe('explicit async view models', () => {
  it('exposes loading and success states', async () => {
    const load = vi.fn(async () => '内容');
    const { result } = renderHook(() => useAsyncResource(load, []));
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toBe('内容'); expect(load).toHaveBeenCalledTimes(1);
  });
  it('deduplicates concurrent mutations', async () => {
    let finish!: (value: string) => void; const mutate = vi.fn((_value: string) => new Promise<string>((resolve) => { finish = resolve; }));
    const { result } = renderHook(() => useExclusiveMutation(mutate));
    let first!: Promise<string>; let second!: Promise<string>;
    act(() => { first = result.current.run('one'); second = result.current.run('two'); });
    expect(first).toBe(second); expect(mutate).toHaveBeenCalledTimes(1);
    await act(async () => finish('done')); expect(result.current.status).toBe('success');
  });
});
