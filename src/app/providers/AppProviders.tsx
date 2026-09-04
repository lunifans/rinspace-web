import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { MotionConfig } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { Notice, ToastProvider } from 'components/ui';
import { LanguageProvider, useLanguage } from '@/i18n/LanguageProvider';
import { ThemeProvider } from './ThemeProvider';

function AppErrorFallback() {
  const { t } = useTranslation('common');
  return <main className="rin-page-grid"><Notice tone="destructive" title={t('boundaries.appTitle')}>{t('boundaries.appMessage')}</Notice></main>;
}

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Rinspace application error', error, info); }
  render() { return this.state.error ? <AppErrorFallback /> : this.props.children; }
}

export function RouteAnnouncer() {
  const location = useLocation();
  const { resolvedLocale } = useLanguage();
  const { t } = useTranslation('common');
  useEffect(() => {
    const heading = document.querySelector('main h1');
    const message = heading?.textContent?.trim() || document.title || t('pageLoaded');
    const region = document.getElementById('rin-route-announcer');
    if (region) region.textContent = message;
  }, [location.pathname, location.search, resolvedLocale, t]);
  return <div id="rin-route-announcer" className="rin-visually-hidden" aria-live="polite" aria-atomic="true" />;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return <LanguageProvider><ThemeProvider><MotionConfig reducedMotion="user" transition={{ duration: .22 }}><ToastProvider><AppErrorBoundary>{children}</AppErrorBoundary></ToastProvider></MotionConfig></ThemeProvider></LanguageProvider>;
}
