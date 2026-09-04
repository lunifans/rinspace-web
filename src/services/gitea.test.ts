import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { requestJson, ServiceError } from './httpClient';
import {
  clearGiteaSession,
  loadGiteaUserHeatmap,
  loadRecentGiteaRepositories,
  syncGiteaSession,
} from './gitea';

vi.mock('./httpClient', async (importOriginal) => {
  const original = await importOriginal<typeof import('./httpClient')>();
  return { ...original, requestJson: vi.fn() };
});

describe('Gitea session transport', () => {
  beforeEach(() => vi.mocked(requestJson).mockReset());
  afterEach(() => vi.unstubAllGlobals());

  it('uses required adapter auth for session synchronization', async () => {
    vi.mocked(requestJson).mockResolvedValueOnce(null);
    await expect(syncGiteaSession()).resolves.toBe(true);
    expect(requestJson).toHaveBeenCalledWith('gitea/sso', { method: 'POST', auth: 'required' });
  });

  it('keeps an anonymous synchronization attempt as a safe no-op', async () => {
    vi.mocked(requestJson).mockRejectedValueOnce(
      new ServiceError('Authentication required', 401, null, 'authentication.required'),
    );
    await expect(syncGiteaSession()).resolves.toBe(false);
  });

  it('clears the server session without attaching user credentials', async () => {
    vi.mocked(requestJson).mockResolvedValueOnce(null);
    await expect(clearGiteaSession()).resolves.toBeUndefined();
    expect(requestJson).toHaveBeenCalledWith('gitea/sso', { method: 'DELETE', auth: 'none' });
  });

  it('keeps the embedded Gitea reads on the audited same-origin boundary', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ contributions: 4 }))
      .mockResolvedValueOnce(Response.json([{ name: 'rinspace' }]));
    vi.stubGlobal('fetch', fetchMock);

    await expect(loadGiteaUserHeatmap('member/name')).resolves.toEqual({ contributions: 4 });
    await expect(loadRecentGiteaRepositories()).resolves.toEqual([{ name: 'rinspace' }]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/repos/api/v1/users/member%2Fname/heatmap',
      { credentials: 'same-origin', headers: { Accept: 'application/json' } },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/repos/api/v1/user/repos?limit=1&sort=updated',
      { credentials: 'same-origin', headers: { Accept: 'application/json' } },
    );
  });
});
