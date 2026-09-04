import { localeIds, type LocaleId, type PersistedLanguagePreference } from './types';

const legacyPreferences: Readonly<Record<string, PersistedLanguagePreference>> = {
  zh_CN: 'zh-CN',
  en_US: 'en',
};

function canonicalLanguageTag(value: string): string | null {
  try {
    return Intl.getCanonicalLocales(value.replaceAll('_', '-'))[0] || null;
  } catch {
    return null;
  }
}

export function normalizeLanguagePreference(
  value: unknown,
): PersistedLanguagePreference {
  if (typeof value !== 'string') return 'system';
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'system') return 'system';
  if (legacyPreferences[trimmed]) return legacyPreferences[trimmed];

  const canonical = canonicalLanguageTag(trimmed);
  if (!canonical) return 'system';
  if (canonical === 'en' || canonical.toLowerCase().startsWith('en-')) return 'en';
  if (canonical === 'zh-CN') return 'zh-CN';
  return canonical;
}

function matchSupportedLocale(value: string): LocaleId | null {
  const canonical = canonicalLanguageTag(value);
  if (!canonical) return null;
  const parsed = new Intl.Locale(canonical);
  if (parsed.language === 'en') return 'en';
  if (parsed.language !== 'zh') return null;

  const maximized = parsed.maximize();
  if (parsed.script === 'Hans' || maximized.script === 'Hans') return 'zh-CN';
  return null;
}

export function resolveSystemLocale(
  browserLanguages: readonly string[] | null | undefined,
): LocaleId {
  if (!browserLanguages || browserLanguages.length === 0) return 'zh-CN';
  for (const language of browserLanguages) {
    const matched = matchSupportedLocale(language);
    if (matched) return matched;
  }
  return 'en';
}

export function resolveLocale(
  preference: PersistedLanguagePreference,
  browserLanguages: readonly string[] | null | undefined =
    typeof navigator === 'undefined' ? undefined : navigator.languages,
): LocaleId {
  const normalized = normalizeLanguagePreference(preference);
  if (localeIds.includes(normalized as LocaleId)) return normalized as LocaleId;
  if (normalized === 'system') return resolveSystemLocale(browserLanguages);
  return matchSupportedLocale(normalized) || 'en';
}
