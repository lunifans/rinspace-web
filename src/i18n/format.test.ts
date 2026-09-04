import { describe, expect, it } from 'vitest';

import { formatDate, formatList, formatNumber, formatRelativeTime } from './format';

describe('locale-aware formatters', () => {
  it('formats numbers with the selected interface locale', () => {
    expect(formatNumber('zh-CN', 12345)).toBe('12,345');
    expect(formatNumber('en', 12345)).toBe('12,345');
  });

  it('formats dates with an explicit time zone', () => {
    const value = '2026-08-27T00:00:00Z';
    const options: Intl.DateTimeFormatOptions = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    };
    expect(formatDate('zh-CN', value, options)).toContain('2026');
    expect(formatDate('en', value, options)).toContain('2026');
  });

  it('formats relative time and product-owned lists', () => {
    expect(formatRelativeTime('en', -1, 'day')).toBe('yesterday');
    expect(formatRelativeTime('zh-CN', -1, 'day')).toBe('昨天');
    expect(formatList('en', ['Blogs', 'Books'])).toBe('Blogs and Books');
  });
});
