type RinRequestOptions = Readonly<{
  method: 'POST';
  body: unknown | FormData;
  responseType: 'json' | 'blob';
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function requestRin(path: string, options: RinRequestOptions): Promise<unknown | Blob> {
  const formData = options.body instanceof FormData;
  const response = await fetch(`/rin/api/${path.replace(/^\/+/, '')}`, {
    method: options.method,
    headers: formData ? undefined : { 'Content-Type': 'application/json' },
    body: formData ? options.body : JSON.stringify(options.body),
  });
  if (options.responseType === 'blob') {
    const blob = await response.blob();
    if (!response.ok) {
      let message = 'Rin request failed.';
      try {
        const payload: unknown = JSON.parse(await blob.text());
        if (isRecord(payload) && typeof payload.error === 'string') message = payload.error;
      } catch {
        // Retain the stable public fallback.
      }
      throw new Error(message);
    }
    return blob;
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(isRecord(payload) && typeof payload.error === 'string' ? payload.error : 'Rin request failed.');
  }
  return payload;
}

export function exportRinProject(input: unknown): Promise<Blob> {
  return requestRin('projects/export', { method: 'POST', body: input, responseType: 'blob' }) as Promise<Blob>;
}

export function renderRinProject(input: FormData): Promise<unknown> {
  return requestRin('projects/render', { method: 'POST', body: input, responseType: 'json' });
}

export function importRinProject(input: FormData): Promise<unknown> {
  return requestRin('projects/import', { method: 'POST', body: input, responseType: 'json' });
}
