import { afterEach, describe, expect, it, vi } from 'vitest';

import { exportRinProject, importRinProject, renderRinProject } from './rinIntegration';

describe('Rin integration transport boundary', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('serializes project exports as JSON and returns the archive blob', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(new Blob(['archive']), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(exportRinProject({ title: 'Project' })).resolves.toEqual(
      expect.objectContaining({ size: 13 }),
    );
    expect(fetchMock).toHaveBeenCalledWith('/rin/api/projects/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Project' }),
    });
  });

  it.each([
    ['render', renderRinProject],
    ['import', importRinProject],
  ] as const)('preserves multipart %s requests without forcing a content type', async (operation, request) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ accepted: true }));
    vi.stubGlobal('fetch', fetchMock);
    const body = new FormData();
    body.set('project', new Blob(['payload']), 'project.rin');

    await expect(request(body)).resolves.toEqual({ accepted: true });
    expect(fetchMock).toHaveBeenCalledWith(`/rin/api/projects/${operation}`, {
      method: 'POST',
      headers: undefined,
      body,
    });
  });

  it('keeps the server error message for failed archive exports', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: '项目无法导出。' }), { status: 422 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(exportRinProject({})).rejects.toThrow('项目无法导出。');
  });
});
