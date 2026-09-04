import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/app/providers/ThemeProvider';
import { useOptionalBootstrap } from '@/app/bootstrap/context';
import AvatarName from '@/components/AvatarName';
import TopbarSessionPlaceholder from '@/components/TopbarSessionPlaceholder';
import { AnimateButton, AnimateIconButton, AnimateThemeToggler } from 'components/ui';
import { BrandNavigation } from 'features/topbar';
import { createCloudBaseAuthAdapter } from '@/platform/auth/adapters';
import { AuthProvider, useAuthAdapter, useAuthSnapshot } from '@/platform/auth/context';
import { authDialogRequestEvent } from '@/utils/authDialog';
import DemoControlPanel from '@/demo/DemoControlPanel';

type SiteTopbarProps = {
  ariaLabel?: string;
  onSessionChange?: () => void | Promise<void>;
  authRequestVersion?: number;
};

type SessionPresentation = 'anonymous' | 'restoring' | 'authenticated';

type RegisterSessionChange = (
  callback: () => void | Promise<void>,
) => () => void;

const SiteTopbarHostContext = createContext<RegisterSessionChange | null>(null);
const loadFullSiteTopbar = () => import('./SiteTopbar');
const FullSiteTopbar = lazy(loadFullSiteTopbar);

function SiteTopbarInstance({
  ariaLabel,
  onSessionChange,
}: SiteTopbarProps) {
  const { t } = useTranslation('navigation');
  const { t: tCommon } = useTranslation('common');
  const bootstrap = useOptionalBootstrap();
  const auth = useAuthAdapter();
  const authSnapshot = useAuthSnapshot();
  const isDemo = bootstrap?.config.mode === 'demo';
  const demoPersona = isDemo
    ? authSnapshot.status === 'authenticated' ? 'member' : 'guest'
    : null;
  const [interactive, setInteractive] = useState(
    () => !isDemo && authSnapshot.status !== 'guest',
  );
  const sessionPresentation: SessionPresentation = authSnapshot.status === 'guest'
    ? 'anonymous'
    : authSnapshot.status;
  const [authRequestVersion, setAuthRequestVersion] = useState(0);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const { resolved, setPreference } = useTheme();

  const activateLogin = useCallback(() => {
    if (isDemo) {
      auth.setDemoPersona?.('member');
      void onSessionChange?.();
      return;
    }
    void loadFullSiteTopbar();
    setInteractive(true);
    setAuthRequestVersion((version) => version + 1);
  }, [auth, isDemo, onSessionChange]);

  useEffect(() => {
    window.addEventListener(authDialogRequestEvent, activateLogin);
    return () => window.removeEventListener(authDialogRequestEvent, activateLogin);
  }, [activateLogin]);

  useEffect(() => {
    if (!isDemo && authSnapshot.status !== 'guest') setInteractive(true);
  }, [authSnapshot.status, isDemo]);

  const lightweightControls = (
    <>
      <form
        className="topbar-search"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          const next = query.trim();
          if (next) navigate(`/search?q=${encodeURIComponent(next)}`);
        }}
      >
        <input
          value={query}
          maxLength={60}
          placeholder={t('search.placeholder')}
          aria-label={t('search.community')}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        <AnimateIconButton icon={<Search />} label={t('search.label')} type="submit" />
      </form>
      <nav className="account-nav" aria-label={ariaLabel || t('landmark')}>
        <AnimateThemeToggler
          className="topbar-pill"
          label={resolved === 'light' ? t('theme.toDark') : t('theme.toLight')}
          resolved={resolved}
          onToggle={() => setPreference(resolved === 'light' ? 'dark' : 'light')}
        />
        {authSnapshot.status === 'authenticated' && authSnapshot.user ? (
          <span className="account-menu-trigger" aria-label={t('account.menu')}>
            <AvatarName
              name={authSnapshot.user.displayName || t('account.anonymousName')}
              imageUrl={authSnapshot.user.avatarUrl || undefined}
            />
          </span>
        ) : sessionPresentation === 'restoring' ? (
          <TopbarSessionPlaceholder />
        ) : (
          <AnimateButton
            unstyled
            className="topbar-auth-button"
            onClick={activateLogin}
            onFocus={() => void loadFullSiteTopbar()}
            onPointerEnter={() => void loadFullSiteTopbar()}
          >
            {isDemo ? tCommon('demo.enterMember') : t('account.signInOrRegister')}
          </AnimateButton>
        )}
      </nav>
    </>
  );

  return (
    <header
      className="topbar rin-topbar-shell"
      data-session-state={sessionPresentation}
      data-bootstrap-mode={bootstrap?.config.mode}
      data-demo-persona={demoPersona ?? undefined}
    >
      <BrandNavigation />
      {interactive ? (
        <Suspense fallback={lightweightControls}>
          <FullSiteTopbar
            ariaLabel={ariaLabel}
            onSessionChange={onSessionChange}
            authRequestVersion={authRequestVersion}
          />
        </Suspense>
      ) : lightweightControls}
    </header>
  );
}

export function SiteTopbarHost({ children }: { children: ReactNode }) {
  const bootstrap = useOptionalBootstrap();
  const [fallbackAuth] = useState(() => createCloudBaseAuthAdapter());
  const auth = bootstrap?.ports.auth ?? fallbackAuth;
  const sessionChangeCallbacks = useRef(
    new Set<() => void | Promise<void>>(),
  );
  const registerSessionChange = useCallback<RegisterSessionChange>((callback) => {
    sessionChangeCallbacks.current.add(callback);
    return () => sessionChangeCallbacks.current.delete(callback);
  }, []);
  const notifySessionChange = useCallback(async () => {
    await Promise.all(
      Array.from(sessionChangeCallbacks.current, (callback) => callback()),
    );
  }, []);

  return (
    <AuthProvider adapter={auth}>
      <SiteTopbarHostContext.Provider value={registerSessionChange}>
        <div className="rin-app-shell">
          <SiteTopbarInstance onSessionChange={notifySessionChange} />
          <DemoControlPanel />
          {children}
        </div>
      </SiteTopbarHostContext.Provider>
    </AuthProvider>
  );
}

export default function SiteTopbarShell(props: SiteTopbarProps) {
  const registerSessionChange = useContext(SiteTopbarHostContext);
  const onSessionChange = props.onSessionChange;

  useEffect(() => {
    if (!registerSessionChange || !onSessionChange) return undefined;
    return registerSessionChange(onSessionChange);
  }, [onSessionChange, registerSessionChange]);

  if (registerSessionChange) return null;
  return <StandaloneSiteTopbar {...props} />;
}

function StandaloneSiteTopbar(props: SiteTopbarProps) {
  const bootstrap = useOptionalBootstrap();
  const [fallbackAuth] = useState(() => createCloudBaseAuthAdapter());
  return (
    <AuthProvider adapter={bootstrap?.ports.auth ?? fallbackAuth}>
      <SiteTopbarInstance {...props} />
    </AuthProvider>
  );
}
