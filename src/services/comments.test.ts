import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseRuntimeConfig } from '@/app/config/runtime';
import type { HttpTransport } from '@/platform/runtime';

import { loadComments } from './feed';
import {
  installHttpClientRuntime,
  resetHttpClientRuntimeForTests,
} from './httpClient';

const config = parseRuntimeConfig({
  schemaVersion: 1,
  mode: 'demo',
  basePath: '/',
  canonicalOrigin: 'https://rinspace.example',
  site: {
    name: 'Rinspace', shortName: 'Rin', description: 'Test', defaultLocale: 'zh-CN',
    contactEmail: null, sourceUrl: null, legalEntity: null,
    filings: { icp: null, publicSecurity: null },
    brand: { logoPath: null, faviconPath: null, appleTouchIconPath: null, manifestIcons: [] },
    verification: { baidu: null, qihoo360: null, sogou: null },
  },
  api: { baseUrl: '/api/', contractVersion: 'v1' },
  auth: { provider: 'demo', endpoint: null, cloudbase: null },
  integrations: {
    gitea: { enabled: false, baseUrl: null }, renderer: { enabled: false, baseUrl: null }, workspace: { enabled: false, baseUrl: null },
  },
  features: { demoControls: false, creator: true, notifications: true, externalIntegrations: false },
});

const request = vi.fn<HttpTransport['request']>();

const baseComment = {
  id: 41,
  targetType: 'post',
  targetId: 7,
  author: '评论者',
  body: '**Markdown** 评论',
  voteCount: 3,
  createdAt: '2026-08-25T00:00:00Z',
  updatedAt: '2026-08-25T00:00:00Z',
};

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  resetHttpClientRuntimeForTests();
  request.mockReset();
  installHttpClientRuntime(config, {
    kind: 'official-http',
    request,
    requestRaw: vi.fn(),
  });
});

afterEach(() => {
  resetHttpClientRuntimeForTests();
});

describe('comment vote summaries', () => {
  it('parses public like and dislike counts with viewer state', async () => {
    request.mockResolvedValue({
      items: [
        {
          ...baseComment,
          upVoteCount: 8,
          downVoteCount: 5,
          viewerVoteStatus: 'down',
        },
      ],
    });

    const [comment] = await loadComments({ targetType: 'post', targetId: 7 });
    expect(comment).toMatchObject({
      upVoteCount: 8,
      downVoteCount: 5,
      viewerVoteStatus: 'down',
    });
  });

  it('keeps old comment responses readable during rollout', async () => {
    request.mockResolvedValue({ items: [baseComment] });

    const [comment] = await loadComments({ targetType: 'post', targetId: 7 });
    expect(comment).toMatchObject({
      upVoteCount: 3,
      downVoteCount: 0,
      viewerVoteStatus: 'none',
    });
  });

  it('requests root-thread pagination with an explicit supported order', async () => {
    request.mockResolvedValue({ items: [baseComment] });

    await loadComments({
      targetType: 'post',
      targetId: 7,
      order: 'newest',
      threaded: true,
      limit: 12,
      page: 2,
    });

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      path: 'comments',
      auth: 'optional',
      query: expect.objectContaining({
        order: 'newest',
        threaded: true,
        limit: 12,
        page: 2,
      }),
    }));
  });
});
