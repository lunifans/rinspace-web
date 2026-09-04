import type { ApiErrorResponse } from '@/generated/api-contract';

type ParsedApiError = Readonly<{
  code: string;
  message: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function errorDetail(value: unknown): ParsedApiError | null {
  if (!isRecord(value) || typeof value.code !== 'string' || typeof value.message !== 'string') return null;
  return { code: value.code, message: value.message };
}

export function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  return errorDetail(value) !== null || (isRecord(value) && errorDetail(value.error) !== null);
}

export function parseApiErrorResponse(value: unknown): ParsedApiError | null {
  const direct = errorDetail(value);
  if (direct) return direct;
  return isRecord(value) ? errorDetail(value.error) : null;
}
