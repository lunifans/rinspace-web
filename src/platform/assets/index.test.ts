import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadBlobAsset, loadTextAsset } from './index';

describe('asset transport boundary', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses same-origin credentials only for local text assets', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('template'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadTextAsset('/templates/article.md')).resolves.toBe('template');
    expect(fetchMock).toHaveBeenCalledWith(
      `${window.location.origin}/templates/article.md`,
      { credentials: 'same-origin' },
    );
  });

  it('omits credentials for external blob assets', async () => {
    const expected = new Blob(['archive']);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(expected));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadBlobAsset('https://assets.example/archive.zip')).resolves.toEqual(
      expect.objectContaining({ size: 13 }),
    );
    expect(fetchMock).toHaveBeenCalledWith('https://assets.example/archive.zip', { credentials: 'omit' });
  });

  it.each([
    'javascript:alert(1)',
    'https://member:secret@assets.example/private',
  ])('rejects an unsafe asset URL before fetch: %s', async (url) => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadTextAsset(url)).rejects.toThrow('The asset URL is not allowed.');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
