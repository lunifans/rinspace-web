import type { LocaleId } from './types';

type DateValue = Date | number | string;

function toDate(value: DateValue) {
  return value instanceof Date ? value : new Date(value);
}

export function formatDate(
  locale: LocaleId,
  value: DateValue,
  options?: Intl.DateTimeFormatOptions,
) {
  return new Intl.DateTimeFormat(locale, options).format(toDate(value));
}

export function formatNumber(
  locale: LocaleId,
  value: number,
  options?: Intl.NumberFormatOptions,
) {
  return new Intl.NumberFormat(locale, options).format(value);
}

export function formatRelativeTime(
  locale: LocaleId,
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  options: Intl.RelativeTimeFormatOptions = { numeric: 'auto' },
) {
  return new Intl.RelativeTimeFormat(locale, options).format(value, unit);
}

export function formatList(
  locale: LocaleId,
  values: readonly string[],
  options?: Intl.ListFormatOptions,
) {
  return new Intl.ListFormat(locale, options).format(values);
}
