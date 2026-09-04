import { describe, expect, it } from 'vitest';

import {
  beginEditorOpenTrace,
  editorOpenTraceHeader,
  editorOpenTraceStoragePrefix,
} from './editorOpenTrace';

describe('editor open trace', () => {
  it('creates a random 128-bit trace and stores only its click epoch', () => {
    const writes = new Map<string, string>();
    const trace = beginEditorOpenTrace({
      crypto: { getRandomValues: (value) => {
        value.forEach((_, index) => { value[index] = index; });
        return value;
      } },
      storage: { setItem: (key, value) => writes.set(key, value) },
      now: () => 1724888888123,
    });
    expect(trace.traceId).toBe('000102030405060708090a0b0c0d0e0f');
    expect(trace.headers).toEqual({ [editorOpenTraceHeader]: trace.traceId });
    expect(writes.get(`${editorOpenTraceStoragePrefix}${trace.traceId}`)).toBe('{"startedAtEpochMs":1724888888123}');
  });

  it('does not break an editor open when browser crypto is unavailable', () => {
    expect(beginEditorOpenTrace({ crypto: { getRandomValues: () => { throw new Error('unavailable'); } } }))
      .toEqual({ traceId: '', headers: {} });
  });
});
