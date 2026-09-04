import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import {
  getAuthAccessToken,
  getCurrentAuthUser,
  getStoredSession,
  replaceStoredSession,
} from './phoneAuth';

const sessionKey = 'rinspace-auth-session';

function encodeBase64Url(value: string) {
  return window.btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function tokenWithExp(exp: number) {
  return [
    encodeBase64Url(JSON.stringify({ alg: 'none' })),
    encodeBase64Url(JSON.stringify({ exp })),
    'signature',
  ].join('.');
}

function saveSession(refreshToken: string, accessToken = tokenWithExp(1)) {
  window.localStorage.setItem(
    sessionKey,
    JSON.stringify({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 3600,
      sub: 'user-1',
      issued_at: Date.now() - 7200_000,
    }),
  );
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test('getAuthAccessToken shares one refresh request across concurrent callers', async () => {
  const nextAccessToken = tokenWithExp(Math.floor(Date.now() / 1000) + 3600);
  let refreshCount = 0;
  saveSession('old-refresh');

  globalThis.fetch = async () => {
    refreshCount += 1;
    return new Response(
      JSON.stringify({
        access_token: nextAccessToken,
        refresh_token: 'new-refresh',
        expires_in: 3600,
        sub: 'user-1',
      }),
      { status: 200 },
    );
  };

  const tokens = await Promise.all([
    getAuthAccessToken(),
    getAuthAccessToken(),
    getAuthAccessToken(),
  ]);

  expect(refreshCount).toBe(1);
  expect(tokens).toEqual([nextAccessToken, nextAccessToken, nextAccessToken]);
});

test('getAuthAccessToken keeps a newer stored session when a stale refresh token fails', async () => {
  const nextAccessToken = tokenWithExp(Math.floor(Date.now() / 1000) + 3600);
  let releaseRefresh: () => void = () => {};
  saveSession('old-refresh');

  globalThis.fetch = async () => {
    await new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    return new Response(
      JSON.stringify({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'invalid refresh token',
      }),
      { status: 401 },
    );
  };

  const tokenRequest = getAuthAccessToken();
  await Promise.resolve();
  saveSession('new-refresh', nextAccessToken);
  releaseRefresh();

  const token = await tokenRequest;
  expect(token).toBe(nextAccessToken);
  expect(JSON.parse(window.localStorage.getItem(sessionKey) || '{}').refresh_token).toBe('new-refresh');
});

test('getCurrentAuthUser times out a stalled request without clearing the session', async () => {
  vi.useFakeTimers();
  saveSession(
    'current-refresh',
    tokenWithExp(Math.floor(Date.now() / 1000) + 3600),
  );
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(
    (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true },
        );
      }),
  );

  const stalledRequest = getCurrentAuthUser();
  const stalledExpectation = expect(stalledRequest).rejects.toThrow(
    'CloudBase Auth 请求超时。',
  );
  await vi.advanceTimersByTimeAsync(8_000);

  await stalledExpectation;
  expect(getStoredSession()?.refresh_token).toBe('current-refresh');

  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ sub: 'user-1', username: 'reader' }), {
      status: 200,
    }),
  );
  await expect(getCurrentAuthUser()).resolves.toMatchObject({
    id: 'user-1',
    username: 'reader',
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('session persistence falls back to sessionStorage when localStorage is full', () => {
  const originalSetItem = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function setItem(this: Storage, key, value) {
    if (this === window.localStorage && key === sessionKey) {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    }
    originalSetItem.call(this, key, value);
  });

  replaceStoredSession({
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    sub: 'user-1',
  });

  expect(window.localStorage.getItem(sessionKey)).toBeNull();
  expect(getStoredSession()).toMatchObject({
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    sub: 'user-1',
  });
  expect(window.sessionStorage.length).toBe(1);
});

test('session persistence reports a recoverable capacity error when both stores are full', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('quota exceeded', 'QuotaExceededError');
  });

  expect(() => replaceStoredSession({
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    sub: 'user-1',
  })).toThrow('浏览器本地存储空间不足，无法保存登录会话。请清理本站缓存后重试。');
  expect(getStoredSession()).toBeNull();
});
