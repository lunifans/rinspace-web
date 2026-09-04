import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { parseRuntimeConfig, type RuntimeConfig } from '@/app/config/runtime';
import type { AuthAdapter, RuntimeAuthSnapshot } from '@/platform/runtime';

import {
  createNetworkPolicyFetch,
  createRuntimeHttpTransport,
  installBrowserNetworkPolicy,
  resetBrowserNetworkPolicy,
  RuntimeHttpError,
} from './index';

const readConfig = (name: string) => parseRuntimeConfig(JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'config', name), 'utf8'),
) as unknown);
const demo = readConfig('runtime.demo.json');
const integration = readConfig('runtime.example.json');

function snapshot(status: RuntimeAuthSnapshot['status']): RuntimeAuthSnapshot {
  return {
    status,
    user: status === 'authenticated' ? {
      id: 'member-1', username: 'member', publicUserId: 'member', displayName: 'Member',
      avatarUrl: null, language: '', colorScheme: '',
    } : null,
    roles: status === 'authenticated' ? ['member'] : [],
    capabilities: new Set(),
  };
}

function auth(
  status: RuntimeAuthSnapshot['status'],
  token: string | null = null,
  deviceId: string | null = null,
): AuthAdapter {
  const current = snapshot(status);
  return {
    kind: status === 'authenticated' ? 'compatible-auth' : 'demo-auth',
    getSnapshot: () => current,
    getAccessToken: async () => token,
    getDeviceId: () => deviceId,
    subscribe: () => () => undefined,
    start: () => () => undefined,
    restore: async () => current,
    signOut: async () => snapshot('guest'),
    sendPhoneOtp: async () => { throw new Error('not used'); },
    completePhoneOtp: async () => current,
    updatePreferences: () => current,
  };
}

describe('runtime HTTP transport and NetworkPolicy', () => {
  afterEach(() => resetBrowserNetworkPolicy());

  it('allows registered demo API routes without fabricating a bearer token', async () => {
    const fetchImpl = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({ accepted: true }));
    const transport = createRuntimeHttpTransport(demo, auth('authenticated'), 'demo-msw-http', fetchImpl);
    await expect(transport.request({
      path: 'reports', method: 'POST', auth: 'required', body: { reason: 'spam' },
    })).resolves.toEqual({ accepted: true });
    expect(fetchImpl).toHaveBeenCalledWith('/api/reports', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      headers: expect.not.objectContaining({ Authorization: expect.anything() }),
    }));
  });

  it('blocks external and unregistered demo requests before fetch', async () => {
    const fetchImpl = vi.fn<typeof globalThis.fetch>();
    const externalConfig = {
      ...demo,
      api: { ...demo.api, baseUrl: 'https://unexpected.example/api/' },
    } as RuntimeConfig;
    await expect(createRuntimeHttpTransport(externalConfig, auth('guest'), 'demo-msw-http', fetchImpl)
      .request({ path: 'reports' })).rejects.toEqual(expect.objectContaining({
        code: 'network.external_blocked',
    }) as RuntimeHttpError);
    await expect(createRuntimeHttpTransport(demo, auth('guest'), 'demo-msw-http', fetchImpl)
      .request({ path: 'unregistered' })).rejects.toEqual(expect.objectContaining({
        code: 'network.path_unregistered',
      }) as RuntimeHttpError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('guards legacy browser fetch calls after bootstrap installation', async () => {
    const original = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({ ok: true }));
    const target = { fetch: original };
    installBrowserNetworkPolicy(demo, target);

    await expect(target.fetch('/api/unregistered')).rejects.toEqual(expect.objectContaining({
      code: 'network.path_unregistered',
      diagnosticDetail: 'Demo NetworkPolicy rejected GET /api/unregistered',
    }) as RuntimeHttpError);
    await expect(target.fetch('https://api.rinspace.example/v1/profile')).rejects.toEqual(expect.objectContaining({
      code: 'network.external_blocked',
    }) as RuntimeHttpError);
    expect(original).not.toHaveBeenCalled();

    await expect(target.fetch('/api/reports', { method: 'POST' })).resolves.toBeInstanceOf(Response);
    await expect(target.fetch('/assets/local.svg')).resolves.toBeInstanceOf(Response);
    expect(original).toHaveBeenCalledTimes(2);

    resetBrowserNetworkPolicy();
    expect(target.fetch).toBe(original);
  });

  it('blocks every production integration family and unregistered methods before the browser sends them', async () => {
    const original = vi.fn<typeof globalThis.fetch>();
    const guarded = createNetworkPolicyFetch(demo, original);
    for (const url of [
      'https://rinspace.com/api/feed',
      'https://demo.ap-shanghai.app.tcloudbase.com/api/feed',
      'https://example.tcloudbasegateway.com/auth/v1/user',
      'https://gitea.example.invalid/api/v1/user',
      'https://pay.example.invalid/checkout',
      'https://upload.example.invalid/object',
      'https://renderer.example.invalid/render',
    ]) {
      await expect(guarded(url)).rejects.toMatchObject({ code: 'network.external_blocked' });
    }
    await expect(guarded('/api/content', { method: 'PATCH' })).rejects.toMatchObject({
      code: 'network.path_unregistered',
      diagnosticDetail: 'Demo NetworkPolicy rejected PATCH /api/content',
    });
    await expect(guarded('/api/content?type=blog')).resolves.toBeUndefined();
    expect(original).toHaveBeenCalledOnce();
  });

  it('fails required guest auth before fetch and attaches adapter credentials remotely', async () => {
    const blockedFetch = vi.fn<typeof globalThis.fetch>();
    await expect(createRuntimeHttpTransport(demo, auth('guest'), 'demo-msw-http', blockedFetch)
      .request({ path: 'reports', method: 'POST', auth: 'required' })).rejects.toEqual(expect.objectContaining({
        status: 401,
        code: 'authentication.required',
      }) as RuntimeHttpError);
    expect(blockedFetch).not.toHaveBeenCalled();

    const remoteFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({ ok: true }));
    const remote = createRuntimeHttpTransport(
      integration,
      auth('authenticated', 'token-1', 'device-1'),
      'compatible-http',
      remoteFetch,
    );
    await remote.request({ path: 'articles', auth: 'required' });
    expect(remoteFetch).toHaveBeenCalledWith('https://api.example.com/v1/articles', expect.objectContaining({
      credentials: 'omit',
      headers: expect.objectContaining({
        Authorization: 'Bearer token-1',
        'x-device-id': 'device-1',
      }),
    }));
  });

  it('preserves multipart bodies and accepts explicit text responses', async () => {
    const fetchImpl = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response('<svg>diagram</svg>', {
        status: 200,
        headers: { 'Content-Type': 'image/svg+xml' },
      }));
    const form = new FormData();
    form.set('source', 'diagram');
    const transport = createRuntimeHttpTransport(
      integration,
      auth('authenticated', 'token'),
      'compatible-http',
      fetchImpl,
    );

    await expect(transport.request({
      path: 'render',
      method: 'POST',
      auth: 'required',
      body: form,
      bodyEncoding: 'form-data',
      responseType: 'text',
    })).resolves.toBe('<svg>diagram</svg>');
    const [, init] = fetchImpl.mock.calls[0];
    expect(init?.body).toBe(form);
    expect(new Headers(init?.headers).has('Content-Type')).toBe(false);
  });

  it.each([401, 403])('preserves structured HTTP %s failures', async (status) => {
    const fetchImpl = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({
      error: { code: 'permission_denied', message: 'Not allowed' },
    }, { status }));
    const transport = createRuntimeHttpTransport(integration, auth('authenticated', 'token'), 'compatible-http', fetchImpl);
    await expect(transport.request({ path: 'articles', auth: 'required' })).rejects.toEqual(expect.objectContaining({
      status,
      code: 'permission_denied',
      message: 'Not allowed',
    }) as RuntimeHttpError);
  });

  it('normalizes timeout, cancellation, network, and non-JSON responses', async () => {
    const neverFetch = vi.fn<typeof globalThis.fetch>((_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    const transport = createRuntimeHttpTransport(integration, auth('authenticated', 'token'), 'compatible-http', neverFetch);
    await expect(transport.request({ path: 'articles', auth: 'required', timeoutMs: 1 })).rejects.toEqual(
      expect.objectContaining({ code: 'http.timeout', recoverable: true }) as RuntimeHttpError,
    );

    const controller = new AbortController();
    controller.abort();
    await expect(transport.request({ path: 'articles', signal: controller.signal })).rejects.toEqual(
      expect.objectContaining({ code: 'http.cancelled' }) as RuntimeHttpError,
    );

    const networkFetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new TypeError('private network detail'));
    await expect(createRuntimeHttpTransport(integration, auth('guest'), 'compatible-http', networkFetch)
      .request({ path: 'articles' })).rejects.toEqual(expect.objectContaining({
        code: 'http.network',
        message: 'Network request failed',
      }) as RuntimeHttpError);

    const unreadable = new Response('{"ok":true}', { status: 200 });
    vi.spyOn(unreadable, 'text').mockRejectedValue(new TypeError('response stream failed'));
    const unreadableFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(unreadable);
    await expect(createRuntimeHttpTransport(integration, auth('guest'), 'compatible-http', unreadableFetch)
      .request({ path: 'articles' })).rejects.toEqual(expect.objectContaining({
        code: 'http.network',
        diagnosticDetail: 'TypeError',
      }) as RuntimeHttpError);

    const invalidFetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response('<html>bad gateway</html>', { status: 200 }));
    await expect(createRuntimeHttpTransport(integration, auth('guest'), 'compatible-http', invalidFetch)
      .request({ path: 'articles' })).rejects.toEqual(expect.objectContaining({
        code: 'http.invalid_json',
        status: 502,
      }) as RuntimeHttpError);
  });
});
