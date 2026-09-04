import type { RuntimeConfig } from '@/app/config/runtime';
import { RuntimeHttpError } from '@/platform/http';
import type { HttpTransport, RuntimeHttpRequest } from '@/platform/runtime';

export class ServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload: unknown,
    readonly code: string = `http.${status}`,
    readonly diagnosticDetail: string = message,
    readonly recoverable: boolean = status === 0 || status >= 500,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

export type RequestOptions = Readonly<{
  method?: RuntimeHttpRequest['method'];
  auth?: RuntimeHttpRequest['auth'];
  body?: unknown;
  bodyEncoding?: RuntimeHttpRequest['bodyEncoding'];
  headers?: Readonly<Record<string, string>>;
  query?: RuntimeHttpRequest['query'];
  signal?: AbortSignal;
  timeoutMs?: number;
  cache?: RequestCache;
}>;

type HttpClientRuntime = Readonly<{
  config: RuntimeConfig;
  transport: HttpTransport;
}>;

let runtime: HttpClientRuntime | null = null;

export function installHttpClientRuntime(config: RuntimeConfig, transport: HttpTransport): void {
  runtime = Object.freeze({ config, transport });
}

export function resetHttpClientRuntimeForTests(): void {
  runtime = null;
}

export function isHttpClientRuntimeReady(): boolean {
  return runtime !== null;
}

function requiredRuntime(): HttpClientRuntime {
  if (!runtime) {
    throw new ServiceError(
      'The request runtime is not ready.',
      0,
      null,
      'runtime.http_not_ready',
      'installHttpClientRuntime has not completed',
      true,
    );
  }
  return runtime;
}

function configuredPath(scope: 'api' | 'admin-api', pathname: string): string {
  const { config } = requiredRuntime();
  const base = scope === 'api'
    ? new URL(config.api.baseUrl, window.location.origin)
    : (() => {
      const apiBase = new URL(config.api.baseUrl, window.location.origin);
      return apiBase.pathname.endsWith('/api/')
        ? new URL(`${apiBase.pathname.slice(0, -'/api/'.length)}/admin/api/`, apiBase.origin)
        : new URL('admin/', apiBase);
    })();
  const url = new URL(pathname.replace(/^\/+/, ''), base);
  return url.origin === window.location.origin ? url.pathname : url.toString();
}

export function apiPath(pathname: string): string {
  return configuredPath('api', pathname);
}

export function adminApiPath(pathname: string): string {
  return configuredPath('admin-api', pathname);
}

function asServiceError(error: unknown): ServiceError {
  if (error instanceof ServiceError) return error;
  if (error instanceof RuntimeHttpError) {
    return new ServiceError(
      error.message,
      error.status,
      error.payload,
      error.code,
      error.diagnosticDetail,
      error.recoverable,
    );
  }
  return new ServiceError(
    'The request could not be completed.',
    0,
    null,
    'http.unexpected',
    error instanceof Error ? error.name : 'unknown_error',
    true,
  );
}

async function request<T>(
  scope: 'api' | 'admin-api',
  pathname: string,
  options: RequestOptions,
  responseType: NonNullable<RuntimeHttpRequest['responseType']> = 'json',
): Promise<T> {
  try {
    return await requiredRuntime().transport.request({
      path: pathname,
      scope,
      method: options.method,
      auth: options.auth,
      body: options.body,
      bodyEncoding: options.bodyEncoding,
      responseType,
      headers: options.headers,
      query: options.query,
      signal: options.signal,
      timeoutMs: options.timeoutMs,
      cache: options.cache,
    }) as T;
  } catch (error) {
    throw asServiceError(error);
  }
}

export function requestJson<T>(pathname: string, options: RequestOptions = {}): Promise<T> {
  return request<T>('api', pathname, options);
}

export function requestAdminJson<T>(pathname: string, options: RequestOptions = {}): Promise<T> {
  return request<T>('admin-api', pathname, options);
}

export function requestText(pathname: string, options: RequestOptions = {}): Promise<string> {
  return request<string>('api', pathname, options, 'text');
}
