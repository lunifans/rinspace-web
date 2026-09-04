import fs from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { parseRuntimeConfig } from '@/app/config/runtime';
import type { HttpTransport } from '@/platform/runtime';

import {
  loadHomeFeed,
  loadHomeSidebar,
  updateCurrentUserInfo,
} from './feed';
import {
  installHttpClientRuntime,
  resetHttpClientRuntimeForTests,
} from './httpClient';

const integration = parseRuntimeConfig(JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'config/runtime.example.json'), 'utf8'),
) as unknown);

describe('contracted feed service transport', () => {
  const request = vi.fn<HttpTransport['request']>();

  beforeEach(() => {
    resetHttpClientRuntimeForTests();
    request.mockReset().mockResolvedValue({});
    installHttpClientRuntime(integration, {
      kind: 'compatible-http',
      request,
      requestRaw: vi.fn(),
    });
  });

  it('sends home queries through the shared optional-auth transport', async () => {
    await expect(loadHomeFeed({ mode: 'following', page: 2, size: 20 }))
      .rejects.toThrow('首页聚合流返回格式异常。');
    await expect(loadHomeSidebar({ limit: 8 }))
      .rejects.toThrow('首页侧栏返回格式异常。');

    expect(request).toHaveBeenNthCalledWith(1, expect.objectContaining({
      path: 'feed',
      scope: 'api',
      auth: 'optional',
      query: { mode: 'following', page: 2, size: 20 },
    }));
    expect(request).toHaveBeenNthCalledWith(2, expect.objectContaining({
      path: 'home/sidebar',
      scope: 'api',
      auth: 'optional',
      query: { limit: 8 },
    }));
  });

  it('sends the generated snake-case profile update through required auth', async () => {
    await expect(updateCurrentUserInfo({
      displayName: 'Rin',
      avatar: { custom: 'https://example.test/avatar.png' },
    })).rejects.toThrow('用户资料更新返回格式异常。');

    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      path: 'user/info',
      scope: 'api',
      method: 'PUT',
      auth: 'required',
      body: expect.objectContaining({
        display_name: 'Rin',
        avatar: { custom: 'https://example.test/avatar.png' },
      }),
    }));
  });
});
