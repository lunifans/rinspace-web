import { beforeEach, describe, expect, it, vi } from 'vitest';

import { parseRuntimeConfig } from '@/app/config/runtime';
import { RuntimeHttpError } from '@/platform/http';
import type { HttpTransport } from '@/platform/runtime';

import {
  adminApiPath,
  apiPath,
  installHttpClientRuntime,
  requestAdminJson,
  requestJson,
  requestText,
  resetHttpClientRuntimeForTests,
  ServiceError,
} from './httpClient';

const config = parseRuntimeConfig({
  schemaVersion: 1,
  mode: 'official',
  basePath: '/rinspace/',
  canonicalOrigin: 'https://rinspace.example',
  site: {
    name: 'Rinspace', shortName: 'Rin', description: 'Test', defaultLocale: 'zh-CN',
    contactEmail: null, sourceUrl: null, legalEntity: null,
    filings: { icp: null, publicSecurity: null },
    brand: { logoPath: null, faviconPath: null, appleTouchIconPath: null, manifestIcons: [] },
    verification: { baidu: null, qihoo360: null, sogou: null },
  },
  api: { baseUrl: '/rinspace/api/', contractVersion: 'v1' },
  auth: { provider: 'cloudbase', endpoint: null, cloudbase: { envId: 'test-env', region: 'ap-shanghai', publishableKey: null } },
  integrations: {
    gitea: { enabled: false, baseUrl: null }, renderer: { enabled: false, baseUrl: null }, workspace: { enabled: false, baseUrl: null },
  },
  features: { demoControls: false, creator: true, notifications: true, externalIntegrations: false },
});

function transport(request = vi.fn<HttpTransport['request']>()): HttpTransport {
  return {
    kind: 'official-http',
    request,
    requestRaw: vi.fn(),
  };
}

describe('shared service client contract', () => {
  beforeEach(() => resetHttpClientRuntimeForTests());

  it('forwards the runtime scope, pagination, auth and JSON body to the transport', async () => {
    const request = vi.fn<HttpTransport['request']>().mockResolvedValue({ ok: true });
    installHttpClientRuntime(config, transport(request));
    await expect(requestJson<{ ok: boolean }>('articles', {
      method: 'POST',
      auth: 'required',
      query: { page: 2, pageSize: 20, ignored: undefined },
      body: { title: '测试' },
    })).resolves.toEqual({ ok: true });
    expect(request).toHaveBeenCalledWith({
      path: 'articles',
      scope: 'api',
      method: 'POST',
      auth: 'required',
      body: { title: '测试' },
      bodyEncoding: undefined,
      responseType: 'json',
      headers: undefined,
      query: { page: 2, pageSize: 20, ignored: undefined },
      signal: undefined,
      timeoutMs: undefined,
      cache: undefined,
    });
    expect(apiPath('articles')).toBe('/rinspace/api/articles');
  });

  it('forwards text responses and multipart bodies without changing the shared request contract', async () => {
    const request = vi.fn<HttpTransport['request']>().mockResolvedValue('rendered');
    installHttpClientRuntime(config, transport(request));
    const body = new FormData();
    body.set('source', 'diagram');

    await expect(requestText('render', {
      method: 'POST',
      auth: 'required',
      body,
      bodyEncoding: 'form-data',
    })).resolves.toBe('rendered');
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      path: 'render',
      scope: 'api',
      method: 'POST',
      auth: 'required',
      body,
      bodyEncoding: 'form-data',
      responseType: 'text',
    }));
  });

  it('preserves the unified transport error DTO', async () => {
    const failure = new RuntimeHttpError('权限不足', 403, { message: '权限不足' }, 'permission_denied', false, 'correlation-id-redacted');
    const request = vi.fn<HttpTransport['request']>().mockRejectedValue(failure);
    installHttpClientRuntime(config, transport(request));
    await expect(requestJson('admin', { auth: 'optional' })).rejects.toEqual(
      expect.objectContaining({
        message: '权限不足',
        status: 403,
        payload: { message: '权限不足' },
        code: 'permission_denied',
        recoverable: false,
      }) as ServiceError,
    );
  });

  it('uses the admin BFF scope and fails closed before bootstrap installation', async () => {
    await expect(requestAdminJson('workspace/capabilities', { auth: 'required' })).rejects.toEqual(
      expect.objectContaining({ code: 'runtime.http_not_ready', status: 0 }) as ServiceError,
    );
    const request = vi.fn<HttpTransport['request']>().mockResolvedValue({ allowed: true });
    installHttpClientRuntime(config, transport(request));
    await requestAdminJson('workspace/capabilities', { auth: 'required' });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ scope: 'admin-api' }));
    expect(adminApiPath('workspace/capabilities')).toBe('/rinspace/admin/api/workspace/capabilities');
  });
});
