function assetUrl(value: string): URL {
  const url = new URL(value, window.location.origin);
  if (!['http:', 'https:', 'blob:', 'data:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('The asset URL is not allowed.');
  }
  return url;
}

async function requestAsset(value: string): Promise<Response> {
  const url = assetUrl(value);
  const response = await fetch(url.toString(), {
    credentials: url.origin === window.location.origin ? 'same-origin' : 'omit',
  });
  if (!response.ok) throw new Error(`Asset request failed (${response.status}).`);
  return response;
}

export async function loadTextAsset(value: string): Promise<string> {
  return (await requestAsset(value)).text();
}

export async function loadBlobAsset(value: string): Promise<Blob> {
  return (await requestAsset(value)).blob();
}
