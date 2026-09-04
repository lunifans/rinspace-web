import i18next, { type i18n as I18nInstance } from 'i18next';
import { initReactI18next, setI18n } from 'react-i18next';

import { bundledCoreResources, loadLocaleResource } from './localeRegistry';
import { localeIds, type LocaleId, type TranslationNamespace } from './types';

export const i18n: I18nInstance = i18next.createInstance();

void i18n.use(initReactI18next).init({
  initImmediate: false,
  lng: 'zh-CN',
  fallbackLng: 'en',
  supportedLngs: [...localeIds],
  load: 'currentOnly',
  defaultNS: 'common',
  ns: ['common', 'navigation', 'auth', 'errors'],
  resources: bundledCoreResources,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
  returnNull: false,
  saveMissing: false,
});
setI18n(i18n);

const pendingResources = new Map<string, Promise<void>>();

export function hasLocaleNamespace(locale: LocaleId, namespace: TranslationNamespace) {
  return i18n.hasResourceBundle(locale, namespace);
}

export async function ensureLocaleNamespaces(
  locale: LocaleId,
  namespaces: readonly TranslationNamespace[],
): Promise<void> {
  await Promise.all(namespaces.map(async (namespace) => {
    if (hasLocaleNamespace(locale, namespace)) return;
    const key = `${locale}:${namespace}`;
    const existing = pendingResources.get(key);
    if (existing) return existing;

    const promise = loadLocaleResource(locale, namespace)
      .then((resource) => {
        i18n.addResourceBundle(locale, namespace, resource, true, true);
      })
      .finally(() => pendingResources.delete(key));
    pendingResources.set(key, promise);
    return promise;
  }));
}

export { localeRegistry } from './localeRegistry';
export * from './types';
export * from './resolveLocale';
