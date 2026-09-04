import { describe, expect, it } from 'vitest';

import {
  normalizeLanguagePreference,
  resolveLocale,
  resolveSystemLocale,
} from './resolveLocale';

describe('interface locale resolution', () => {
  it('normalizes legacy persisted values', () => {
    expect(normalizeLanguagePreference('zh_CN')).toBe('zh-CN');
    expect(normalizeLanguagePreference('en_US')).toBe('en');
  });

  it('canonicalizes future locale identifiers without losing them', () => {
    expect(normalizeLanguagePreference('fr_CA')).toBe('fr-CA');
  });

  it('honors the ordered browser language list', () => {
    expect(resolveSystemLocale(['fr-FR', 'zh-SG', 'en-US'])).toBe('zh-CN');
    expect(resolveSystemLocale(['en-GB', 'zh-CN'])).toBe('en');
  });

  it('matches only Simplified Chinese variants', () => {
    expect(resolveSystemLocale(['zh-Hans'])).toBe('zh-CN');
    expect(resolveSystemLocale(['zh-SG'])).toBe('zh-CN');
    expect(resolveSystemLocale(['zh-Hant', 'en-US'])).toBe('en');
  });

  it('uses the required unmatched and unavailable fallbacks', () => {
    expect(resolveSystemLocale(['fr-FR'])).toBe('en');
    expect(resolveSystemLocale(undefined)).toBe('zh-CN');
    expect(resolveSystemLocale([])).toBe('zh-CN');
  });

  it('preserves unsupported preferences while resolving a safe frontend locale', () => {
    const preference = normalizeLanguagePreference('fr-CA');
    expect(preference).toBe('fr-CA');
    expect(resolveLocale(preference, ['zh-CN'])).toBe('en');
  });
});
