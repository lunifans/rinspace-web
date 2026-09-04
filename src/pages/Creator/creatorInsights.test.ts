import { describe, expect, it } from 'vitest';

import {
  creatorAnalyticsPointLabel,
  creatorPeriodDescriptor,
  creatorPeriodValues,
  currentCreatorPeriod,
  normalizeCreatorPeriod,
  recentContributionCalendar,
  shiftCreatorPeriod,
} from './creatorInsights';

const augustNow = new Date('2026-08-24T02:00:00.000Z');

describe('creator insights calendar', () => {
  it('uses ISO Monday weeks and navigates across year boundaries', () => {
    expect(currentCreatorPeriod('week', augustNow)).toBe('2026-W35');
    expect(shiftCreatorPeriod('week', '2026-W01', -1)).toBe('2025-W52');
    expect(shiftCreatorPeriod('week', '2025-W52', 1)).toBe('2026-W01');
    expect(creatorPeriodDescriptor('week', '2026-W35')).toMatchObject({
      year: 2026,
      week: 35,
    });
  });

  it('normalizes invalid and future periods to the current period', () => {
    expect(normalizeCreatorPeriod('month', '2026-13', augustNow)).toBe('2026-08');
    expect(normalizeCreatorPeriod('month', '2026-09', augustNow)).toBe('2026-08');
    expect(normalizeCreatorPeriod('year', '2025', augustNow)).toBe('2025');
  });

  it('offers exact periods from account creation to now', () => {
    const createdAt = Date.parse('2026-06-03T00:00:00.000Z') / 1000;
    const months = creatorPeriodValues('month', createdAt, augustNow);
    expect(months).toEqual(['2026-08', '2026-07', '2026-06']);
  });

  it('formats chart buckets from structured keys instead of server labels', () => {
    expect(creatorAnalyticsPointLabel('zh-CN', 'week', '2026-08-24')).toBe('周一');
    expect(creatorAnalyticsPointLabel('en', 'week', '2026-08-24')).toBe('Mon');
    expect(creatorAnalyticsPointLabel('en', 'month', '2026-08-24')).toBe('24');
    expect(creatorAnalyticsPointLabel('en', 'year', '2026-08')).toBe('Aug');
  });

  it('builds a Monday-aligned trailing-year contribution grid', () => {
    const calendar = recentContributionCalendar(augustNow);
    expect(calendar.todayKey).toBe('2026-08-24');
    expect(calendar.days.length % 7).toBe(0);
    expect(calendar.days.filter((day) => day.withinRange)).toHaveLength(365);
  });
});
