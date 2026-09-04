import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';

import { ensureLocaleNamespaces, i18n } from './index';
import { normalizeLanguagePreference, resolveLocale } from './resolveLocale';
import {
  coreTranslationNamespaces,
  type LocaleId,
  type PersistedLanguagePreference,
  type TranslationNamespace,
} from './types';

const storageKey = 'rinspace-language-preference-v1';

type PreparedLanguagePreference = Readonly<{
  preference: PersistedLanguagePreference;
  locale: LocaleId;
}>;

type LanguageContextValue = Readonly<{
  preference: PersistedLanguagePreference;
  resolvedLocale: LocaleId;
  preparePreference(
    preference: PersistedLanguagePreference,
    namespaces?: readonly TranslationNamespace[],
  ): Promise<PreparedLanguagePreference>;
  commitPreparedPreference(prepared: PreparedLanguagePreference): Promise<void>;
  setPreference(
    preference: PersistedLanguagePreference,
    namespaces?: readonly TranslationNamespace[],
  ): Promise<void>;
  syncAccountPreference(preference: string): Promise<void>;
  setActiveNamespaces(namespaces: readonly TranslationNamespace[]): void;
}>;

const LanguageContext = createContext<LanguageContextValue | null>(null);

function browserLanguages(): readonly string[] | undefined {
  if (typeof navigator === 'undefined') return undefined;
  if (Array.isArray(navigator.languages) && navigator.languages.length > 0) {
    return navigator.languages;
  }
  return navigator.language ? [navigator.language] : undefined;
}

function readDevicePreference(): PersistedLanguagePreference {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return 'system';
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && 'preference' in parsed) {
      return normalizeLanguagePreference((parsed as { preference?: unknown }).preference);
    }
    return normalizeLanguagePreference(parsed);
  } catch {
    return 'system';
  }
}

function writeDevicePreference(preference: PersistedLanguagePreference) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify({ preference }));
  } catch {
    // A device cache failure must not prevent an in-memory language switch.
  }
}

export function LanguageProvider({
  children,
  loadNamespaces = ensureLocaleNamespaces,
}: {
  children: ReactNode;
  loadNamespaces?: typeof ensureLocaleNamespaces;
}) {
  const [bootstrap] = useState(() => {
    const initialPreference = readDevicePreference();
    const initialLocale = resolveLocale(initialPreference, browserLanguages());
    document.documentElement.lang = initialLocale;
    if (i18n.language !== initialLocale) void i18n.changeLanguage(initialLocale);
    return { preference: initialPreference, locale: initialLocale };
  });
  const bootstrapPreference = bootstrap.preference;
  const bootstrapLocale = bootstrap.locale;
  const [preference, setStoredPreference] = useState(bootstrapPreference);
  const [resolvedLocale, setResolvedLocale] = useState(bootstrapLocale);
  const appliedLanguage = useRef({
    preference: bootstrapPreference,
    locale: bootstrapLocale,
  });
  const activeNamespaces = useRef<readonly TranslationNamespace[]>([]);
  const switchVersion = useRef(0);

  useLayoutEffect(() => {
    document.documentElement.lang = resolvedLocale;
    if (i18n.language !== resolvedLocale) void i18n.changeLanguage(resolvedLocale);
  }, [resolvedLocale]);

  const setActiveNamespaces = useCallback((namespaces: readonly TranslationNamespace[]) => {
    activeNamespaces.current = namespaces;
    void loadNamespaces(resolvedLocale, namespaces).catch((error: unknown) => {
      console.error('Failed to load active translation resources', error);
    });
  }, [loadNamespaces, resolvedLocale]);

  const preparePreference = useCallback(async (
    input: PersistedLanguagePreference,
    namespaces: readonly TranslationNamespace[] = activeNamespaces.current,
  ): Promise<PreparedLanguagePreference> => {
    const nextPreference = normalizeLanguagePreference(input);
    const locale = resolveLocale(nextPreference, browserLanguages());
    await loadNamespaces(locale, [
      ...coreTranslationNamespaces,
      ...namespaces,
    ]);
    return { preference: nextPreference, locale };
  }, [loadNamespaces]);

  const commitPreparedPreference = useCallback(async (
    prepared: PreparedLanguagePreference,
  ) => {
    if (
      appliedLanguage.current.preference === prepared.preference &&
      appliedLanguage.current.locale === prepared.locale &&
      i18n.language === prepared.locale
    ) {
      return;
    }
    const version = ++switchVersion.current;
    await i18n.changeLanguage(prepared.locale);
    if (version !== switchVersion.current) return;
    appliedLanguage.current = prepared;
    setStoredPreference(prepared.preference);
    setResolvedLocale(prepared.locale);
    writeDevicePreference(prepared.preference);
  }, []);

  const setPreference = useCallback(async (
    input: PersistedLanguagePreference,
    namespaces?: readonly TranslationNamespace[],
  ) => {
    const prepared = await preparePreference(input, namespaces);
    await commitPreparedPreference(prepared);
  }, [commitPreparedPreference, preparePreference]);

  const syncAccountPreference = useCallback(async (input: string) => {
    await setPreference(input);
  }, [setPreference]);

  useEffect(() => {
    if (preference !== 'system') return undefined;
    const handleLanguageChange = () => {
      void setPreference('system').catch((error: unknown) => {
        console.error('Failed to apply the changed system language', error);
      });
    };
    window.addEventListener('languagechange', handleLanguageChange);
    return () => window.removeEventListener('languagechange', handleLanguageChange);
  }, [preference, setPreference]);

  const value = useMemo<LanguageContextValue>(() => ({
    preference,
    resolvedLocale,
    preparePreference,
    commitPreparedPreference,
    setPreference,
    syncAccountPreference,
    setActiveNamespaces,
  }), [
    commitPreparedPreference,
    preference,
    preparePreference,
    resolvedLocale,
    setActiveNamespaces,
    setPreference,
    syncAccountPreference,
  ]);

  return (
    <I18nextProvider i18n={i18n}>
      <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
    </I18nextProvider>
  );
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useLanguage must be used inside LanguageProvider.');
  return value;
}

export function useOptionalLanguage() {
  return useContext(LanguageContext);
}

export function useResolvedLocale() {
  const language = useOptionalLanguage();
  const { i18n: translationInstance } = useTranslation();
  return language?.resolvedLocale
    ?? resolveLocale(
      translationInstance.resolvedLanguage || translationInstance.language,
      [],
    );
}

export function useRouteTranslationNamespaces(
  namespaces: readonly TranslationNamespace[],
) {
  const { setActiveNamespaces } = useLanguage();
  const namespaceKey = namespaces.join('|');
  useEffect(() => {
    setActiveNamespaces(namespaces);
  }, [namespaceKey, namespaces, setActiveNamespaces]);
}
