import type { CreatorAnalyticsGranularity } from './api';
import { formatDate } from '@/i18n/format';
import type { LocaleId } from '@/i18n/types';

export type { CreatorAnalyticsGranularity } from './api';

// Calendar semantics are shared by the complete analytics feature.

type CalendarDate = {
  year: number;
  month: number;
  day: number;
};

const shanghaiDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
});

function calendarDate(value: Date): CalendarDate {
  const parts = shanghaiDateFormatter.formatToParts(value);
  const numberPart = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value || 0);
  return { year: numberPart('year'), month: numberPart('month'), day: numberPart('day') };
}

function utcDate(value: CalendarDate) {
  return new Date(Date.UTC(value.year, value.month - 1, value.day));
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function isoWeekParts(value: Date) {
  const working = new Date(value.getTime());
  const weekday = working.getUTCDay() || 7;
  working.setUTCDate(working.getUTCDate() + 4 - weekday);
  const isoYear = working.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil((((working.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  return { year: isoYear, week };
}

function isoWeekStart(year: number, week: number) {
  const januaryFourth = new Date(Date.UTC(year, 0, 4));
  const weekday = januaryFourth.getUTCDay() || 7;
  januaryFourth.setUTCDate(januaryFourth.getUTCDate() - weekday + 1 + ((week - 1) * 7));
  return januaryFourth;
}

function parsedPeriodStart(granularity: CreatorAnalyticsGranularity, period: string) {
  if (granularity === 'week') {
    const match = /^(\d{4})-W(\d{2})$/.exec(period);
    if (!match) return null;
    const year = Number(match[1]);
    const week = Number(match[2]);
    const start = isoWeekStart(year, week);
    const normalized = isoWeekParts(start);
    return normalized.year === year && normalized.week === week ? start : null;
  }
  if (granularity === 'month') {
    const match = /^(\d{4})-(\d{2})$/.exec(period);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12) return null;
    return new Date(Date.UTC(year, month - 1, 1));
  }
  if (!/^\d{4}$/.test(period)) return null;
  return new Date(Date.UTC(Number(period), 0, 1));
}

function periodKeyFromUTCDate(granularity: CreatorAnalyticsGranularity, value: Date) {
  if (granularity === 'week') {
    const { year, week } = isoWeekParts(value);
    return `${year}-W${pad(week)}`;
  }
  if (granularity === 'month') return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}`;
  return String(value.getUTCFullYear());
}

export function creatorAnalyticsGranularity(value: string | null): CreatorAnalyticsGranularity {
  return value === 'week' || value === 'year' ? value : 'month';
}

export function currentCreatorPeriod(granularity: CreatorAnalyticsGranularity, now = new Date()) {
  return periodKeyFromUTCDate(granularity, utcDate(calendarDate(now)));
}

export function normalizeCreatorPeriod(granularity: CreatorAnalyticsGranularity, value: string | null, now = new Date()) {
  const current = currentCreatorPeriod(granularity, now);
  const start = value ? parsedPeriodStart(granularity, value) : null;
  if (!start || (value && value > current)) return current;
  return value || current;
}

export function shiftCreatorPeriod(granularity: CreatorAnalyticsGranularity, period: string, delta: -1 | 1) {
  const start = parsedPeriodStart(granularity, period);
  if (!start) return period;
  if (granularity === 'week') start.setUTCDate(start.getUTCDate() + (delta * 7));
  if (granularity === 'month') start.setUTCMonth(start.getUTCMonth() + delta);
  if (granularity === 'year') start.setUTCFullYear(start.getUTCFullYear() + delta);
  return periodKeyFromUTCDate(granularity, start);
}

export type CreatorPeriodDescriptor = Readonly<{
  start: Date;
  end: Date;
  year: number;
  week?: number;
}>;

export function creatorPeriodDescriptor(
  granularity: CreatorAnalyticsGranularity,
  period: string,
): CreatorPeriodDescriptor | null {
  const start = parsedPeriodStart(granularity, period);
  if (!start) return null;
  if (granularity === 'week') {
    const { year, week } = isoWeekParts(start);
    const end = new Date(start.getTime());
    end.setUTCDate(end.getUTCDate() + 6);
    return { start, end, year, week };
  }
  const end = new Date(start.getTime());
  if (granularity === 'month') end.setUTCMonth(end.getUTCMonth() + 1);
  else end.setUTCFullYear(end.getUTCFullYear() + 1);
  return { start, end, year: start.getUTCFullYear() };
}

export function creatorPeriodValues(
  granularity: CreatorAnalyticsGranularity,
  createdAtSeconds: number,
  now = new Date(),
) {
  const current = currentCreatorPeriod(granularity, now);
  const createdAt = createdAtSeconds > 0 ? new Date(createdAtSeconds * 1000) : now;
  const first = currentCreatorPeriod(granularity, createdAt);
  const values: string[] = [];
  let value = current;
  for (let index = 0; index < 800; index += 1) {
    values.push(value);
    if (value <= first) break;
    value = shiftCreatorPeriod(granularity, value, -1);
  }
  return values;
}

function pointDate(key: string) {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3] || 1);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const value = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(value.getTime()) ? null : value;
}

export function creatorAnalyticsPointLabel(
  locale: LocaleId,
  granularity: CreatorAnalyticsGranularity,
  key: string,
) {
  const value = pointDate(key);
  if (!value) return key;
  if (granularity === 'week') {
    return formatDate(locale, value, { weekday: 'short', timeZone: 'UTC' });
  }
  if (granularity === 'month') {
    return formatDate(locale, value, { day: 'numeric', timeZone: 'UTC' });
  }
  return formatDate(locale, value, { month: 'short', timeZone: 'UTC' });
}

export function shanghaiDateKeyFromTimestamp(timestampSeconds: number) {
  const date = calendarDate(new Date(timestampSeconds * 1000));
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}

export function recentContributionCalendar(now = new Date()) {
  const today = utcDate(calendarDate(now));
  const first = new Date(today.getTime());
  first.setUTCDate(first.getUTCDate() - 364);
  const gridStart = new Date(first.getTime());
  const weekday = gridStart.getUTCDay() || 7;
  gridStart.setUTCDate(gridStart.getUTCDate() - weekday + 1);
  const gridEnd = new Date(today.getTime());
  const endWeekday = gridEnd.getUTCDay() || 7;
  gridEnd.setUTCDate(gridEnd.getUTCDate() + (7 - endWeekday));

  const days: Array<{ key: string; month: number; day: number; withinRange: boolean }> = [];
  for (const day = new Date(gridStart.getTime()); day <= gridEnd; day.setUTCDate(day.getUTCDate() + 1)) {
    days.push({
      key: `${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}`,
      month: day.getUTCMonth() + 1,
      day: day.getUTCDate(),
      withinRange: day >= first && day <= today,
    });
  }
  return { days, firstKey: days.find((day) => day.withinRange)?.key || '', todayKey: `${today.getUTCFullYear()}-${pad(today.getUTCMonth() + 1)}-${pad(today.getUTCDate())}` };
}
