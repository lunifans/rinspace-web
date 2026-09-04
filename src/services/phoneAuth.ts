import { publicEnv } from '@/app/config/env';

function cloudbaseAuthEndpoint() {
  const env = publicEnv.cloudbaseEnvId || '';
  return {
    env,
    gateway: `https://${env}.api.tcloudbasegateway.com/auth/v1`,
  };
}
const sessionKey = 'rinspace-auth-session';
const sessionFallbackKey = 'rinspace-auth-session-fallback';
const deviceKey = 'rinspace-device-id';
const deviceFallbackKey = 'rinspace-device-id-fallback';
const accessTokenRefreshWindowMs = 60_000;
const authRequestTimeoutMs = 8_000;
const evictableStorageKeys = ['rinspace-topbar-session-cache'];
const evictableStoragePrefixes = [
  'rinspace-response-cache:',
  'rinspace-rin-chat-local-messages',
];

let currentUserRequest: Promise<CloudUser | null> | null = null;
let refreshSessionRequest: {
  refreshToken: string;
  request: Promise<StoredSession | null>;
} | null = null;
let inMemoryDeviceId = '';

export type StoredSession = {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  sub?: string;
  issued_at?: number;
};

export type OtpChallenge = {
  verificationId: string;
  phoneNumber: string;
  isUser: boolean;
};

type AuthApiResponse = {
  verification_id?: string;
  verification_token?: string;
  is_user?: boolean;
  token_type?: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  sub?: string;
  code?: string;
  error?: string;
  error_description?: string;
  message?: string;
};

type AuthUserResponse = {
  sub?: string;
  user_id?: string;
  username?: string;
  preferred_username?: string;
  name?: string;
  nickname?: string;
  picture?: string;
  avatar_url?: string;
  phone_number?: string;
  user_metadata?: Record<string, unknown>;
  is_anonymous?: boolean;
};

export type CloudUser = {
  id?: string;
  username?: string;
  phone?: string;
  user_metadata?: Record<string, unknown>;
  is_anonymous?: boolean;
};

type ParsedPayload = Record<string, unknown> | string | null;

class AuthHttpError extends Error {
  status: number;
  payload: ParsedPayload;

  constructor(message: string, status: number, payload: ParsedPayload) {
    super(message);
    this.name = 'AuthHttpError';
    this.status = status;
    this.payload = payload;
  }
}

class AuthRequestTimeoutError extends Error {
  constructor() {
    super('CloudBase Auth 请求超时。');
    this.name = 'AuthRequestTimeoutError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function createDeviceId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function getDeviceId() {
  const existing =
    readStoredValue(window.localStorage, deviceKey) ||
    readStoredValue(window.sessionStorage, deviceFallbackKey);
  if (existing) return existing;
  if (inMemoryDeviceId) return inMemoryDeviceId;
  const next = createDeviceId();
  if (!writeStoredValue(window.localStorage, deviceKey, next)) {
    if (!writeStoredValue(window.sessionStorage, deviceFallbackKey, next)) {
      inMemoryDeviceId = next;
    }
  }
  return next;
}

export function getAuthDeviceId() {
  return getDeviceId();
}

function parseJson(text: string): ParsedPayload {
  if (!text) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return text;
  }
}

function getMessage(payload: unknown, fallback: string) {
  if (typeof payload === 'string' && payload.trim()) return payload;
  if (isRecord(payload) && typeof payload.error_description === 'string') return payload.error_description;
  if (isRecord(payload) && typeof payload.message === 'string') return payload.message;
  if (isRecord(payload) && typeof payload.error === 'string') return payload.error;
  if (isRecord(payload) && typeof payload.code === 'string') return payload.code;
  return fallback;
}

async function fetchAuth(input: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), authRequestTimeoutMs);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new AuthRequestTimeoutError();
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function removeStoredValue(storage: Storage, key: string) {
  try {
    storage.removeItem(key);
  } catch {
    // Ignore unavailable browser storage.
  }
}

function readStoredValue(storage: Storage, key: string) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeStoredValue(storage: Storage, key: string, value: string) {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function clearEvictableLocalStorage() {
  try {
    for (const key of evictableStorageKeys) {
      window.localStorage.removeItem(key);
    }
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (!key) continue;
      if (evictableStoragePrefixes.some((prefix) => key.startsWith(prefix))) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // If localStorage is unavailable, the sessionStorage fallback below still applies.
  }
}

function serializedStoredSession(session: StoredSession) {
  return JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in,
    sub: session.sub,
    issued_at: session.issued_at || Date.now(),
  });
}

function saveStoredSession(session: StoredSession) {
  const value = serializedStoredSession(session);
  removeStoredValue(window.sessionStorage, sessionFallbackKey);
  if (writeStoredValue(window.localStorage, sessionKey, value)) return;
  removeStoredValue(window.localStorage, sessionKey);
  clearEvictableLocalStorage();
  if (writeStoredValue(window.localStorage, sessionKey, value)) return;
  if (writeStoredValue(window.sessionStorage, sessionFallbackKey, value)) return;
  throw new Error('浏览器本地存储空间不足，无法保存登录会话。请清理本站缓存后重试。');
}

export function replaceStoredSession(session: StoredSession) {
  saveStoredSession(session);
}

export function clearStoredSession() {
  removeStoredValue(window.localStorage, sessionKey);
  removeStoredValue(window.sessionStorage, sessionFallbackKey);
}

export function getStoredSession(): StoredSession | null {
  const raw =
    readStoredValue(window.localStorage, sessionKey) ||
    readStoredValue(window.sessionStorage, sessionFallbackKey);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (
      parsed &&
      typeof parsed.access_token === 'string' &&
      typeof parsed.refresh_token === 'string'
    ) {
      return parsed as StoredSession;
    }
  } catch {
    clearStoredSession();
  }
  return null;
}

async function postAuth(path: string, body: Record<string, unknown>) {
  const endpoint = cloudbaseAuthEndpoint();
  const response = await fetchAuth(`${endpoint.gateway}${path}?client_id=${encodeURIComponent(endpoint.env)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-device-id': getDeviceId(),
    },
    body: JSON.stringify(body),
  });

  const payload = parseJson(await response.text());
  if (!isRecord(payload)) {
    throw new Error('CloudBase Auth 返回格式异常。');
  }
  if (!response.ok || payload.error || payload.code) {
    throw new AuthHttpError(
      getMessage(payload, 'CloudBase Auth 请求失败。'),
      response.status,
      payload,
    );
  }
  return payload as AuthApiResponse;
}

function isDefinitiveAuthFailure(error: unknown) {
  if (!(error instanceof AuthHttpError)) return false;
  if (error.status === 401 || error.status === 403) return true;
  if (!isRecord(error.payload)) return false;
  return (
    error.payload.error === 'unauthorized' ||
    error.payload.code === 'UNAUTHENTICATED' ||
    error.payload.code === 'INVALID_REFRESH_TOKEN' ||
    error.payload.error === 'invalid_grant'
  );
}

async function refreshStoredSessionOnce(session: StoredSession) {
  const refreshToken = session.refresh_token;
  try {
    const payload = await postAuth('/token', {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });

    if (typeof payload.access_token !== 'string' || typeof payload.refresh_token !== 'string') {
      throw new Error('CloudBase Auth 刷新会话失败。');
    }

    const nextSession: StoredSession = {
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
      expires_in: payload.expires_in,
      sub: payload.sub || session.sub,
    };
    saveStoredSession(nextSession);
    return nextSession;
  } catch (error) {
    if (isDefinitiveAuthFailure(error)) {
      const latestSession = getStoredSession();
      if (latestSession && latestSession.refresh_token !== refreshToken) {
        return latestSession;
      }
      clearStoredSession();
    }
    throw error;
  }
}

async function refreshStoredSession() {
  const session = getStoredSession();
  if (!session) return null;

  if (refreshSessionRequest?.refreshToken === session.refresh_token) {
    return refreshSessionRequest.request;
  }

  const request = refreshStoredSessionOnce(session).finally(() => {
    if (refreshSessionRequest?.request === request) {
      refreshSessionRequest = null;
    }
  });
  refreshSessionRequest = {
    refreshToken: session.refresh_token,
    request,
  };
  return request;
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    '=',
  );
  return window.atob(padded);
}

function accessTokenExpiryMs(accessToken: string) {
  const [, payload] = accessToken.split('.');
  if (!payload) return null;
  try {
    const decoded: unknown = JSON.parse(decodeBase64Url(payload));
    if (isRecord(decoded) && typeof decoded.exp === 'number') {
      return decoded.exp * 1000;
    }
  } catch {
    return null;
  }
  return null;
}

function storedSessionExpiryMs(session: StoredSession) {
  const tokenExpiryMs = accessTokenExpiryMs(session.access_token);
  if (tokenExpiryMs) return tokenExpiryMs;
  if (
    typeof session.expires_in === 'number' &&
    session.expires_in > 0 &&
    typeof session.issued_at === 'number'
  ) {
    return session.issued_at + session.expires_in * 1000;
  }
  return null;
}

async function getFreshStoredSession() {
  const session = getStoredSession();
  if (!session) return null;

  const expiryMs = storedSessionExpiryMs(session);
  if (!expiryMs || expiryMs - Date.now() > accessTokenRefreshWindowMs) {
    return session;
  }

  return refreshStoredSession();
}

export async function getFreshAuthSession() {
  return getFreshStoredSession();
}

// Force-refreshes the CloudBase session regardless of token age. Destructive
// operations on the server require a freshly issued token; callers retry with
// the refreshed token after a 401 "sign in again" response.
export async function forceRefreshAuthSession(): Promise<StoredSession | null> {
  const session = getStoredSession();
  if (!session) return null;
  try {
    return await refreshStoredSession();
  } catch {
    return null;
  }
}

async function requestWithSession(
  path: string,
  method: 'GET' | 'POST',
  body: Record<string, unknown> | null,
  session: StoredSession,
) {
  const endpoint = cloudbaseAuthEndpoint();
  const response = await fetchAuth(`${endpoint.gateway}${path}?client_id=${encodeURIComponent(endpoint.env)}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      'x-device-id': getDeviceId(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = parseJson(await response.text());
  return { response, payload };
}

async function authedRequest(path: string, method: 'GET' | 'POST', body: Record<string, unknown> | null = null) {
  const session = getStoredSession();
  if (!session) return null;

  let { response, payload } = await requestWithSession(path, method, body, session);
  if (
    response.status === 401 ||
    (isRecord(payload) && (payload.error === 'unauthorized' || payload.code === 'UNAUTHENTICATED'))
  ) {
    const refreshedSession = await refreshStoredSession();
    if (!refreshedSession) return null;
    ({ response, payload } = await requestWithSession(path, method, body, refreshedSession));
  }

  if (
    !response.ok ||
    (isRecord(payload) && (payload.error || payload.code))
  ) {
    throw new Error(
      getMessage(payload, 'CloudBase Auth 请求失败。'),
    );
  }
  return payload;
}

function stripChinaPrefix(phone: string) {
  return phone.replace(/^\+86\s*/, '').replace(/\s+/g, '');
}

async function loadCurrentAuthUser(): Promise<CloudUser | null> {
  const payload = await authedRequest('/user/me', 'GET');
  if (!payload || !isRecord(payload)) return null;

  const authPayload = payload as AuthUserResponse;
  const id = authPayload.sub || authPayload.user_id;
  if (!id) return null;

  const nickname = authPayload.nickname || authPayload.name || '';
  const avatarUrl = authPayload.avatar_url || authPayload.picture || '';
  const username =
    (typeof authPayload.user_metadata?.username === 'string' && authPayload.user_metadata.username.trim()) ||
    (typeof authPayload.user_metadata?.preferred_username === 'string' && authPayload.user_metadata.preferred_username.trim()) ||
    authPayload.preferred_username ||
    authPayload.username ||
    '';
  return {
    id,
    username,
    phone: typeof authPayload.phone_number === 'string' ? stripChinaPrefix(authPayload.phone_number) : '',
    user_metadata: {
      ...(authPayload.user_metadata || {}),
      nickName: nickname,
      nickname,
      avatarUrl,
      avatar_url: avatarUrl,
      picture: avatarUrl,
      ...(username ? { username, preferred_username: username } : {}),
    },
    is_anonymous: false,
  };
}

export async function getCurrentAuthUser(): Promise<CloudUser | null> {
  if (!getStoredSession()) return null;
  if (!currentUserRequest) {
    currentUserRequest = loadCurrentAuthUser().finally(() => {
      currentUserRequest = null;
    });
  }
  return currentUserRequest;
}

export async function getAuthAccessToken() {
  const session = await getFreshStoredSession();
  return session?.access_token || '';
}

export async function sendPhoneOtp(phone: string): Promise<OtpChallenge> {
  const phoneNumber = `+86 ${phone}`;
  const payload = await postAuth('/verification', {
    phone_number: phoneNumber,
  });

  const verificationId = typeof payload.verification_id === 'string' ? payload.verification_id : '';
  if (!verificationId) {
    throw new Error('验证码发送成功但缺少 verification_id。');
  }

  return {
    verificationId,
    phoneNumber,
    isUser: payload.is_user === true,
  };
}

export async function completePhoneOtp(challenge: OtpChallenge, token: string) {
  const verified = await postAuth('/verification/verify', {
    verification_id: challenge.verificationId,
    verification_code: token,
  });
  const verificationToken = typeof verified.verification_token === 'string' ? verified.verification_token : '';
  if (!verificationToken) {
    throw new Error('验证码校验成功但缺少登录凭证。');
  }

  const tokenPayload = challenge.isUser
    ? await postAuth('/signin', { verification_token: verificationToken })
    : await postAuth('/signup', {
        phone_number: challenge.phoneNumber,
        verification_token: verificationToken,
      });

  if (typeof tokenPayload.access_token !== 'string' || typeof tokenPayload.refresh_token !== 'string') {
    throw new Error('CloudBase Auth 登录成功但缺少会话令牌。');
  }

  saveStoredSession({
    access_token: tokenPayload.access_token,
    refresh_token: tokenPayload.refresh_token,
    expires_in: tokenPayload.expires_in,
    sub: tokenPayload.sub,
  });

  return getCurrentAuthUser();
}
