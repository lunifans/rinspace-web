export const editorOpenTraceHeader = 'X-Rinspace-Editor-Trace';
export const editorOpenTraceStoragePrefix = 'rinspace:editor-open:';

type EditorOpenTraceOptions = {
  crypto?: { getRandomValues: (value: Uint8Array) => Uint8Array };
  storage?: Pick<Storage, 'setItem'>;
  now?: () => number;
};

export function beginEditorOpenTrace(options: EditorOpenTraceOptions = {}) {
  const cryptoProvider = options.crypto || globalThis.crypto;
  if (!cryptoProvider?.getRandomValues) return { traceId: '', headers: {} as Record<string, string> };
  let bytes: Uint8Array;
  try {
    bytes = cryptoProvider.getRandomValues(new Uint8Array(16));
  } catch {
    return { traceId: '', headers: {} as Record<string, string> };
  }
  const traceId = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  const startedAtEpochMs = (options.now || Date.now)();
  try {
    const storage = options.storage || globalThis.sessionStorage;
    storage?.setItem(`${editorOpenTraceStoragePrefix}${traceId}`, JSON.stringify({ startedAtEpochMs }));
  } catch {
    // Metrics must never prevent an editor open.
  }
  return {
    traceId,
    headers: { [editorOpenTraceHeader]: traceId },
  };
}
