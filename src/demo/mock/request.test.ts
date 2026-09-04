import { describe, expect, it } from 'vitest';

import {
  DemoRequestError,
  normalizedDemoQuery,
  paginateDemoItems,
  readDemoPagination,
  stableDemoSort,
} from './request';

describe('demo handler request utilities', () => {
  it('parses bounded pagination and slices without changing totals', () => {
    const pagination = readDemoPagination(new URLSearchParams('page=2&size=2'));
    expect(paginateDemoItems(['a', 'b', 'c', 'd', 'e'], pagination)).toEqual({
      items: ['c', 'd'], count: 5, page: 2, pageSize: 2,
    });
    expect(() => readDemoPagination(new URLSearchParams('page=0'))).toThrow(DemoRequestError);
    expect(() => readDemoPagination(new URLSearchParams('size=101'))).toThrow('supported range');
  });

  it('keeps sorting stable and normalizes deterministic text filters', () => {
    const items = [
      { id: 'first', rank: 2 },
      { id: 'second', rank: 1 },
      { id: 'third', rank: 2 },
    ];
    expect(stableDemoSort(items, (left, right) => left.rank - right.rank).map((item) => item.id))
      .toEqual(['second', 'first', 'third']);
    expect(normalizedDemoQuery('  ＲＩＮＳＰＡＣＥ  ')).toBe('rinspace');
  });
});
