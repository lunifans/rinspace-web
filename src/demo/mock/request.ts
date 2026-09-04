import { HttpResponse } from 'msw';

import type { ApiErrorResponse } from '@/generated/api-contract';

export class DemoRequestError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500 | 501 | 507,
    readonly code: string,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'DemoRequestError';
  }
}

export type DemoPagination = Readonly<{ page: number; pageSize: number }>;

function positiveInteger(value: string | null, fallback: number, maximum: number, name: string): number {
  if (value === null || value === '') return fallback;
  if (!/^\d+$/.test(value)) {
    throw new DemoRequestError(422, 'demo.invalid_pagination', `${name} must be a positive integer.`, { field: name });
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new DemoRequestError(422, 'demo.invalid_pagination', `${name} is outside the supported range.`, {
      field: name,
      maximum,
    });
  }
  return parsed;
}

export function readDemoPagination(
  searchParams: URLSearchParams,
  defaults: Readonly<{ page?: number; pageSize?: number; maximumPageSize?: number }> = {},
): DemoPagination {
  const maximumPageSize = defaults.maximumPageSize ?? 100;
  return Object.freeze({
    page: positiveInteger(searchParams.get('page'), defaults.page ?? 1, Number.MAX_SAFE_INTEGER, 'page'),
    pageSize: positiveInteger(searchParams.get('size'), defaults.pageSize ?? 20, maximumPageSize, 'size'),
  });
}

export function stableDemoSort<Item>(
  items: readonly Item[],
  compare: (left: Item, right: Item) => number,
): Item[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => compare(left.item, right.item) || left.index - right.index)
    .map(({ item }) => item);
}

export function paginateDemoItems<Item>(items: readonly Item[], pagination: DemoPagination) {
  const offset = (pagination.page - 1) * pagination.pageSize;
  return Object.freeze({
    items: items.slice(offset, offset + pagination.pageSize),
    count: items.length,
    page: pagination.page,
    pageSize: pagination.pageSize,
  });
}

export function normalizedDemoQuery(value: string | null): string {
  return (value ?? '').normalize('NFKC').trim().toLocaleLowerCase('en-US');
}

export function demoErrorResponse(error: DemoRequestError): Response {
  const payload: ApiErrorResponse = {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    },
  };
  const headers = error.status === 429 ? { 'Retry-After': '30' } : undefined;
  return HttpResponse.json(payload, { status: error.status, headers });
}
