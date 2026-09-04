import type { RuntimeConfig } from '@/app/config/runtime';
import type {
  AuthAdapter,
  HttpTransport,
  RuntimeHttpRequest,
} from '@/platform/runtime';
import { parseApiErrorResponse } from './apiError';
import { findDemoApiRoute } from './demoRoutes';

export * from './demoRoutes';

export type RuntimeHttpErrorCode =
  | `http.${number}`
  | 'authentication.required'
  | 'authentication.unavailable'
  | 'http.cancelled'
  | 'http.invalid_json'
  | 'http.network'
  | 'http.timeout'
  | 'network.external_blocked'
  | 'network.path_unregistered'
  | 'network.scope_unavailable';

export class RuntimeHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload: unknown,
    readonly code: RuntimeHttpErrorCode | string,
    readonly recoverable: boolean,
    readonly diagnosticDetail: string = message,
  ) {
    super(message);
    this.name = 'RuntimeHttpError';
  }
}

const defaultTimeoutMs = 8_000;
type FetchTarget = { fetch: typeof globalThis.fetch };
let installedNetworkPolicy: Readonly<{
  target: FetchTarget;
  original: typeof globalThis.fetch;
  guarded: typeof globalThis.fetch;
}> | null = null;

function pathWithinBase(pathname: string, basePath: string): boolean {
  return basePath === '/' || pathname.startsWith(basePath.endsWith('/') ? basePath : `${basePath}/`);
}

function normalizedRequestPath(pathname: string): string {
  const normalized = pathname.replace(/^\/+/, '');
  if (!normalized || normalized.includes('\\') || normalized.split('/').some((part) => part === '.' || part === '..')) {
    throw new RuntimeHttpError(
      'The request path is not registered.',
      0,
      null,
      'network.path_unregistered',
      false,
    );
  }
  return normalized;
}

function demoPolicyError(
  message: string,
  code: 'network.external_blocked' | 'network.path_unregistered' | 'network.scope_unavailable',
  method: string,
  url: URL,
): RuntimeHttpError {
  return new RuntimeHttpError(
    message,
    0,
    null,
    code,
    false,
    `Demo NetworkPolicy rejected ${method.toUpperCase()} ${url.pathname}`,
  );
}

function assertRegisteredDemoApiPath(config: RuntimeConfig, url: URL, method: string): void {
  const apiBase = new URL(config.api.baseUrl, window.location.origin);
  const logicalPath = url.pathname.slice(apiBase.pathname.length);
  if (!pathWithinBase(url.pathname, apiBase.pathname)
    || !findDemoApiRoute(method, logicalPath)) {
    throw demoPolicyError(
      'Demo mode blocked an unregistered API path.',
      'network.path_unregistered',
      method,
      url,
    );
  }
}

function apiShapedPath(pathname: string): boolean {
  return /\/(?:admin\/)?api(?:\/|$)/.test(pathname) || /\/auth\/v\d+(?:\/|$)/.test(pathname);
}

function configuredBaseUrl(config: RuntimeConfig, scope: NonNullable<RuntimeHttpRequest['scope']>): URL {
  const apiBase = new URL(config.api.baseUrl, window.location.origin);
  if (scope === 'api') return apiBase;
  if (scope === 'admin-api') {
    if (apiBase.pathname.endsWith('/api/')) {
      return new URL(`${apiBase.pathname.slice(0, -'/api/'.length)}/admin/api/`, apiBase.origin);
    }
    return new URL('admin/', apiBase);
  }
  if (config.auth.provider === 'compatible' && config.auth.endpoint) {
    return new URL(config.auth.endpoint, window.location.origin);
  }
  if (config.auth.provider === 'cloudbase' && config.auth.cloudbase) {
    return new URL(`https://${config.auth.cloudbase.envId}.api.tcloudbasegateway.com/auth/v1/`);
  }
  throw new RuntimeHttpError(
    'Authentication transport is unavailable in this runtime.',
    0,
    null,
    'network.scope_unavailable',
    false,
  );
}

function resolveRequestUrl(config: RuntimeConfig, request: RuntimeHttpRequest): URL {
  const scope = request.scope ?? 'api';
  const path = normalizedRequestPath(request.path);
  const url = new URL(path, configuredBaseUrl(config, scope));
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  if (scope === 'auth' && config.auth.provider === 'cloudbase' && config.auth.cloudbase) {
    url.searchParams.set('client_id', config.auth.cloudbase.envId);
  }
  return url;
}

function assertNetworkPolicy(
  config: RuntimeConfig,
  request: RuntimeHttpRequest,
  url: URL,
): void {
  if (url.username || url.password) {
    throw new RuntimeHttpError('Credential-bearing URLs are forbidden.', 0, null, 'network.external_blocked', false);
  }
  const scope = request.scope ?? 'api';
  if (config.mode === 'demo') {
    if (url.origin !== window.location.origin) {
      throw demoPolicyError('Demo mode blocked an external request.', 'network.external_blocked', request.method ?? 'GET', url);
    }
    if (scope !== 'api') {
      throw demoPolicyError('This request scope is unavailable in demo mode.', 'network.scope_unavailable', request.method ?? 'GET', url);
    }
    assertRegisteredDemoApiPath(config, url, request.method ?? 'GET');
    return;
  }
  const expectedOrigin = configuredBaseUrl(config, scope).origin;
  const expectedPath = configuredBaseUrl(config, scope).pathname;
  if (url.origin !== expectedOrigin || !pathWithinBase(url.pathname, expectedPath)) {
    throw new RuntimeHttpError('The request origin is outside the configured runtime.', 0, null, 'network.external_blocked', false);
  }
}

export function createNetworkPolicyFetch(
  config: RuntimeConfig,
  baseFetch: typeof globalThis.fetch,
): typeof globalThis.fetch {
  if (config.mode !== 'demo') return baseFetch;
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.origin);
    const method = init?.method || (input instanceof Request ? input.method : 'GET');
    if (url.origin !== window.location.origin) {
      throw demoPolicyError('Demo mode blocked an external request.', 'network.external_blocked', method, url);
    }
    const apiBase = new URL(config.api.baseUrl, window.location.origin);
    if (pathWithinBase(url.pathname, apiBase.pathname)) {
      assertRegisteredDemoApiPath(config, url, method);
    } else if (apiShapedPath(url.pathname)) {
      throw demoPolicyError('Demo mode blocked an unregistered API path.', 'network.path_unregistered', method, url);
    }
    return baseFetch(input, init);
  };
}

export function installBrowserNetworkPolicy(
  config: RuntimeConfig,
  target: FetchTarget = globalThis,
): void {
  if (installedNetworkPolicy) {
    if (installedNetworkPolicy.target.fetch === installedNetworkPolicy.guarded) {
      installedNetworkPolicy.target.fetch = installedNetworkPolicy.original;
    }
    installedNetworkPolicy = null;
  }
  if (config.mode !== 'demo') return;
  const original = target.fetch;
  const guarded = createNetworkPolicyFetch(config, original);
  target.fetch = guarded;
  installedNetworkPolicy = { target, original, guarded };
}

export function resetBrowserNetworkPolicy(): void {
  const installed = installedNetworkPolicy;
  if (installed && installed.target.fetch === installed.guarded) {
    installed.target.fetch = installed.original;
  }
  installedNetworkPolicy = null;
}

function responseErrorData(payload: unknown, status: number) {
  let code = `http.${status}`;
  let message = `Request failed (${status})`;
  const contracted = parseApiErrorResponse(payload);
  if (contracted) return contracted;
  if (payload && typeof payload === 'object') {
    if ('code' in payload && typeof payload.code === 'string') code = payload.code;
    if ('message' in payload && typeof payload.message === 'string') message = payload.message;
    if ('error' in payload && payload.error && typeof payload.error === 'object') {
      if ('code' in payload.error && typeof payload.error.code === 'string') code = payload.error.code;
      if ('message' in payload.error && typeof payload.error.message === 'string') message = payload.error.message;
    }
  }
  return { code, message };
}

function parsedJson(text: string): { valid: boolean; value: unknown } {
  if (!text) return { valid: true, value: null };
  try {
    return { valid: true, value: JSON.parse(text) as unknown };
  } catch {
    return { valid: false, value: null };
  }
}

function fetchTarget(url: URL): string {
  return url.origin === window.location.origin ? `${url.pathname}${url.search}` : url.toString();
}

export function createRuntimeHttpTransport(
  config: RuntimeConfig,
  auth: AuthAdapter,
  kind: HttpTransport['kind'],
  fetchImpl?: typeof globalThis.fetch,
): HttpTransport {
  const requestRaw = async (request: RuntimeHttpRequest): Promise<Response> => {
    const url = resolveRequestUrl(config, request);
    assertNetworkPolicy(config, request, url);
    const snapshot = auth.getSnapshot();
    const authMode = request.auth ?? 'none';
    if (authMode === 'required' && snapshot.status === 'guest') {
      throw new RuntimeHttpError('Authentication required', 401, null, 'authentication.required', false);
    }

    let token: string | null = null;
    if (authMode !== 'none' && snapshot.status !== 'guest') {
      try {
        token = await auth.getAccessToken();
      } catch (error) {
        if (authMode === 'required' && config.mode !== 'demo') {
          throw new RuntimeHttpError(
            'Authentication is temporarily unavailable',
            401,
            null,
            'authentication.unavailable',
            true,
            error instanceof Error ? error.name : 'authentication_error',
          );
        }
      }
    }
    if (authMode === 'required' && config.mode !== 'demo' && !token) {
      throw new RuntimeHttpError('Authentication required', 401, null, 'authentication.required', false);
    }

    const headers: Record<string, string> = {
      Accept: request.responseType === 'text' ? 'text/plain, text/html;q=0.9, application/json;q=0.8' : 'application/json',
      ...request.headers,
    };
    if (request.body !== undefined && request.bodyEncoding !== 'form-data') {
      headers['Content-Type'] ||= 'application/json';
    }
    if (config.mode === 'demo' && authMode !== 'none') {
      headers['X-Rinspace-Demo-Persona'] = snapshot.status === 'authenticated' ? 'member' : 'guest';
    }
    if (token) {
      headers.Authorization = `Bearer ${token}`;
      const deviceId = auth.getDeviceId();
      if (deviceId) headers['x-device-id'] = deviceId;
    }

    if (request.signal?.aborted) {
      throw new RuntimeHttpError('Request cancelled', 0, null, 'http.cancelled', true);
    }
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();
    request.signal?.addEventListener('abort', abortFromCaller, { once: true });
    let timedOut = false;
    const timeoutMs = request.timeoutMs ?? defaultTimeoutMs;
    const timeout = timeoutMs > 0 ? globalThis.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs) : null;
    try {
      const body = request.body === undefined
        ? undefined
        : request.bodyEncoding === 'form-data'
          ? request.body as BodyInit
          : JSON.stringify(request.body);
      return await (fetchImpl ?? globalThis.fetch)(fetchTarget(url), {
        method: request.method ?? 'GET',
        body,
        cache: request.cache,
        credentials: url.origin === window.location.origin ? 'include' : 'omit',
        headers,
        signal: controller.signal,
      });
    } catch (error) {
      if (timedOut) throw new RuntimeHttpError('Request timed out', 0, null, 'http.timeout', true);
      if (request.signal?.aborted) throw new RuntimeHttpError('Request cancelled', 0, null, 'http.cancelled', true);
      throw new RuntimeHttpError('Network request failed', 0, null, 'http.network', true, error instanceof Error ? error.name : 'network_error');
    } finally {
      if (timeout !== null) globalThis.clearTimeout(timeout);
      request.signal?.removeEventListener('abort', abortFromCaller);
    }
  };

  return Object.freeze({
    kind,
    requestRaw,
    async request(request: RuntimeHttpRequest) {
      const response = await requestRaw(request);
      if (response.status === 204) return request.responseType === 'text' ? '' : null;
      let text: string;
      try {
        text = await response.text();
      } catch (error) {
        throw new RuntimeHttpError(
          'Network request failed',
          0,
          null,
          'http.network',
          true,
          error instanceof Error ? error.name : 'response_read_error',
        );
      }
      const parsed = parsedJson(text);
      if (request.responseType === 'text') {
        if (!response.ok) {
          const failure = responseErrorData(parsed.valid ? parsed.value : null, response.status);
          throw new RuntimeHttpError(failure.message, response.status, parsed.valid ? parsed.value : null, failure.code, response.status >= 500);
        }
        return text;
      }
      if (!parsed.valid) {
        throw new RuntimeHttpError(
          response.ok ? 'The server returned invalid JSON.' : `Request failed (${response.status})`,
          response.ok ? 502 : response.status,
          null,
          response.ok ? 'http.invalid_json' : `http.${response.status}`,
          response.ok,
        );
      }
      if (!response.ok) {
        const failure = responseErrorData(parsed.value, response.status);
        throw new RuntimeHttpError(failure.message, response.status, parsed.value, failure.code, response.status >= 500);
      }
      return parsed.value;
    },
  });
}
