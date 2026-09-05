import { useBootstrap } from 'app/bootstrap/context';
import { buildRouteHeadMetadata } from 'app/config/siteMetadata';
import { RouteLayout } from 'app/layouts';
import { AppProviders, RouteAnnouncer } from 'app/providers/AppProviders';
import { routeManifest, type RouteDefinition } from 'app/routing/routeManifest';
import { Component, lazy, Suspense, useEffect, useLayoutEffect, useState, type ErrorInfo, type ReactNode } from 'react';
import { Helmet, HelmetProvider } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';

import { AnimateButton, Notice } from 'components/ui';
import { PageLoadingState } from '@/components/LoadingState';
import { SiteTopbarHost } from '@/components/SiteTopbarShell';
import DemoProductionCapabilityPage from '@/demo/DemoProductionCapabilityPage';
import DemoRouteSupportPage from '@/demo/DemoRouteSupportPage';
import DemoWorldContractPage from '@/demo/DemoWorldContractPage';
import { demoProductionCapabilityForPath } from '@/demo/productionCapabilities';
import { resolveDemoWorldRoute } from '@/demo/worldContract';
import { useRouteTranslationNamespaces } from '@/i18n/LanguageProvider';
import { useAuthSnapshot } from '@/platform/auth/context';
import { requestAuthDialog } from '@/utils/authDialog';
import { hydrateRinMathJaxOfficialMenu } from '@/utils/rinMathJaxMenu';

const RinAssistant = lazy(() => import('components/RinAssistant'));

function DeferredRinAssistant() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), 15000);
    return () => window.clearTimeout(id);
  }, []);
  return ready ? <Suspense fallback={null}><RinAssistant /></Suspense> : null;
}

function RinMathJaxMenuBridge() {
  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => { void hydrateRinMathJaxOfficialMenu(event); };
    document.addEventListener('contextmenu', handleContextMenu);
    return () => document.removeEventListener('contextmenu', handleContextMenu);
  }, []);
  return null;
}

function RuntimeMetadataBridge() {
  useLayoutEffect(() => {
    document.head.querySelectorAll(
      'meta[data-rinspace-site="true"][name="description"], meta[data-rinspace-site="true"][property], link[data-rinspace-shell="true"][rel="canonical"]',
    ).forEach((node) => node.remove());
  }, []);
  return null;
}

class RinAssistantBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('RinAssistant crashed', error, info); }
  render() { return this.state.hasError ? null : this.props.children; }
}

class RouteErrorBoundary extends Component<{ children: ReactNode; path: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidUpdate(previous: { path: string }) { if (previous.path !== this.props.path && this.state.failed) this.setState({ failed: false }); }
  render() { return this.state.failed ? <RouteErrorFallback /> : this.props.children; }
}

function RouteErrorFallback() {
  const { t } = useTranslation('common');
  return <main className="rin-page-grid"><Notice tone="destructive" title={t('boundaries.routeTitle')}>{t('boundaries.routeMessage')}</Notice></main>;
}

function RouteDocument({ route }: { route: RouteDefinition }) {
  const location = useLocation();
  const { config } = useBootstrap();
  const { t } = useTranslation('common');
  const canonical = route.canonicalPath.includes(':') ? location.pathname : route.canonicalPath;
  const metadata = buildRouteHeadMetadata(config, canonical, t(route.titleKey));
  return (
    <Helmet title={metadata.title}>
      <meta name="description" content={metadata.description} />
      <link rel="canonical" href={metadata.canonicalUrl} />
      <meta property="og:type" content={metadata.openGraph.type} />
      <meta property="og:site_name" content={metadata.openGraph.siteName} />
      <meta property="og:title" content={metadata.openGraph.title} />
      <meta property="og:description" content={metadata.openGraph.description} />
      <meta property="og:url" content={metadata.openGraph.url} />
    </Helmet>
  );
}

function RouteBody({ route }: { route: RouteDefinition }) {
  const location = useLocation();
  const auth = useAuthSnapshot();
  const { config } = useBootstrap();
  const { t } = useTranslation('common');
  useRouteTranslationNamespaces(route.translationNamespaces);
  if (route.minimumRole !== 'none' && auth.status === 'restoring') {
    return <><RouteDocument route={route} /><RouteLayout kind={route.layout} family={route.family}><PageLoadingState /></RouteLayout></>;
  }
  if (route.minimumRole !== 'none' && auth.status === 'guest') {
    return (
      <>
        <RouteDocument route={route} />
        <RouteLayout kind={route.layout} family={route.family}>
          <main className="rin-page-grid">
            <Notice title={t('access.signInTitle')}>
              <p>{t('access.signInMessage')}</p>
              <AnimateButton unstyled className="primary-link-button" type="button" onClick={requestAuthDialog}>
                {t('access.signInAction')}
              </AnimateButton>
            </Notice>
          </main>
        </RouteLayout>
      </>
    );
  }
  const demoCapability = config.mode === 'demo'
    ? demoProductionCapabilityForPath(location.pathname)
    : null;
  const demoWorldRoute = config.mode === 'demo'
    ? resolveDemoWorldRoute(location.pathname, location.search)
    : null;
  if (demoWorldRoute) {
    return (
      <RouteErrorBoundary path={`${location.pathname}${location.search}`}>
        <RouteLayout kind={demoWorldRoute.kind === 'post' ? 'ReaderLayout' : 'PublicLayout'} family={demoWorldRoute.kind === 'post' ? 'knowledge' : 'discovery'}>
          <DemoWorldContractPage route={demoWorldRoute} />
        </RouteLayout>
      </RouteErrorBoundary>
    );
  }
  if (demoCapability) {
    return (
      <RouteErrorBoundary path={location.pathname}>
        <RouteDocument route={route} />
        <RouteLayout kind={route.layout} family={route.family}>
          <DemoProductionCapabilityPage capabilityId={demoCapability} />
        </RouteLayout>
      </RouteErrorBoundary>
    );
  }
  if (config.mode === 'demo' && route.demoSupport === 'not-yet-supported') {
    return (
      <RouteErrorBoundary path={location.pathname}>
        <RouteDocument route={route} />
        <RouteLayout kind={route.layout} family={route.family}>
          <DemoRouteSupportPage />
        </RouteLayout>
      </RouteErrorBoundary>
    );
  }
  return <RouteErrorBoundary path={location.pathname}><RouteDocument route={route} /><RouteLayout kind={route.layout} family={route.family}><Suspense fallback={<PageLoadingState />}>{route.element}</Suspense></RouteLayout></RouteErrorBoundary>;
}

function AppRoutes() {
  return <><RuntimeMetadataBridge /><RouteAnnouncer /><RinMathJaxMenuBridge /><RinAssistantBoundary><DeferredRinAssistant /></RinAssistantBoundary><Routes>{routeManifest.map((route) => <Route key={`${route.order}:${route.path}`} path={route.path} element={<RouteBody route={route} />} />)}</Routes></>;
}

function App() {
  const { config } = useBootstrap();
  return <HelmetProvider><BrowserRouter basename={config.basePath}><AppProviders><SiteTopbarHost><AppRoutes /></SiteTopbarHost></AppProviders></BrowserRouter></HelmetProvider>;
}

export default App;
