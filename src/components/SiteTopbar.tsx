import { AnimateThemeToggler, Icon, AnimateButton, AnimateBell, AnimateBellRing, AnimateChevronDown, AnimateKanban, AnimateLogOut, AnimatePlus, AnimateSearch, AnimateSettings, AnimateSparkles, AnimateUser, Dialog, DialogPortal, DialogOverlay, DialogBody, DialogTitle, DialogClose, Menu, MenuTrigger, MenuContent, MenuItem, MenuSub, MenuSubTrigger, MenuSubContent, Tooltip } from 'components/ui';
import { hrefInWorld, resolveWorld, type WorldState } from '@rinspace/world-shell';
import { useTheme } from '@/app/providers/ThemeProvider';
import {
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import katex from 'katex';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import AvatarName from '@/components/AvatarName';
import { useOptionalBootstrap } from '@/app/bootstrap/context';
import { MathInline } from '@/components/MathText';
import TopbarSessionPlaceholder from '@/components/TopbarSessionPlaceholder';
import TagCreationFlow from '@/features/tags/TagCreationFlow';
import { DiscoverySearch, NotificationNavigation, PublishingActions, SessionMenu } from '@/features/topbar';
import PublishCreateDialog, { type PublishDialogMode } from '@/features/publish/PublishCreateDialog';
import type { CloudUser } from '@/services/phoneAuth';
import { searchContent } from '@/services/domains/activity';
import { messageFromError } from '@/services/errors';
import { loadNotifications, notificationStateChangedEvent } from '@/services/domains/notification';
import type { NotificationItem, SearchResult } from '@/services/contracts';
import { useOptionalLanguage } from '@/i18n/LanguageProvider';
import {
  isMainlandPhone,
  normalizePhone,
} from '@/services/profile';
import { clearGiteaSession, syncGiteaSession } from '@/services/gitea';
import { useAuthAdapter, useAuthSnapshot } from '@/platform/auth/context';
import type { AuthOtpChallenge } from '@/platform/runtime';
import {
  answerPath,
  cleanUserId,
  contentPath,
  profilePath,
  tagReadOrLegacyPath,
} from '@/utils/routes';
import { slugify } from '@/utils/rinWriter';

type SiteTopbarProps = {
  ariaLabel?: string;
  onSessionChange?: () => void | Promise<void>;
  authRequestVersion?: number;
  onSessionPresentationChange?: (presentation: SessionPresentation) => void;
  world?: WorldState;
};

type SessionPresentation = 'anonymous' | 'restoring' | 'authenticated';

const texLogoHtml = katex.renderToString('\\TeX', {
  displayMode: false,
  throwOnError: false,
  strict: 'ignore',
  trust: false,
});

function searchResultPath(result: SearchResult) {
  const ref = result.id || result.slug;
  switch (result.objectType) {
    case 'question':
      return contentPath('question', ref, result.title);
    case 'answer':
      return answerPath(ref, result.id);
    case 'blog':
      return contentPath('blog', ref, result.title);
    case 'book':
      return contentPath('book', ref, result.title);
    case 'announcement':
      return contentPath('announcement', ref);
    case 'discussion':
    case 'forum':
      return contentPath('discussion', ref, result.title);
    case 'dynamic':
    case 'status':
      return contentPath('dynamic', ref, result.title);
    case 'tag':
      return tagReadOrLegacyPath(result.id, result.slug || result.title || result.id);
    case 'user':
      return profilePath(result.userId || result.author || result.id);
    default:
      return '/search';
  }
}

export function shouldShowTopbarSearchPreview(query: string, searchOpen: boolean) {
  return searchOpen && query.trim().length >= 2;
}

export default function SiteTopbar({
  ariaLabel,
  onSessionChange,
  authRequestVersion = 0,
  onSessionPresentationChange,
  world: providedWorld,
}: SiteTopbarProps) {
  const { t: tNavigation } = useTranslation('navigation');
  const { t: tAuth } = useTranslation('auth');
  const language = useOptionalLanguage();
  const syncAccountPreference = language?.syncAccountPreference;
  const navigate = useNavigate();
  const location = useLocation();
  const currentWorld = providedWorld ?? resolveWorld(`${location.pathname}${location.search}${location.hash}`).world ?? 'outer';
  const { resolved: resolvedTheme, setPreference: setThemePreference } = useTheme();
  const auth = useAuthAdapter();
  const bootstrap = useOptionalBootstrap();
  const demoMode = bootstrap?.config.mode === 'demo';
  const authSnapshot = useAuthSnapshot();
  const sessionPresentation: SessionPresentation = authSnapshot.status === 'guest'
    ? 'anonymous'
    : authSnapshot.status;
  const user: CloudUser | null = useMemo(() => authSnapshot.user
    ? {
        id: authSnapshot.user.id,
        username: authSnapshot.user.username,
        user_metadata: {
          nickname: authSnapshot.user.displayName,
          avatarUrl: authSnapshot.user.avatarUrl || '',
        },
        is_anonymous: false,
      }
    : null, [authSnapshot.user]);
  const publicUserId = authSnapshot.user?.publicUserId || '';
  const nickname = authSnapshot.user?.displayName || '';
  const avatarDataUrl = authSnapshot.user?.avatarUrl || '';
  const isAdmin = authSnapshot.roles.includes('admin');
  const isModerator = isAdmin || authSnapshot.roles.includes('moderator');
  const [busy, setBusy] = useState(false);
  const [publishMenuOpen, setPublishMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState('');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const searchFormRef = useRef<HTMLFormElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [searchPreviewItems, setSearchPreviewItems] = useState<SearchResult[]>(
    [],
  );
  const [searchPreviewCount, setSearchPreviewCount] = useState(0);
  const [searchPreviewLoading, setSearchPreviewLoading] = useState(false);
  const [searchPreviewError, setSearchPreviewError] = useState('');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [authPhone, setAuthPhone] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [authChallenge, setAuthChallenge] = useState<AuthOtpChallenge | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authStatus, setAuthStatus] = useState('');
  const [authError, setAuthError] = useState('');
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishDialogMode, setPublishDialogMode] = useState<PublishDialogMode>('blog');
  const [tagCreateDialogOpen, setTagCreateDialogOpen] = useState(false);

  const currentDisplayName =
    nickname ||
    user?.username ||
    tNavigation('account.anonymousName');
  const currentProfileRouteId = publicUserId || cleanUserId(user?.id);
  const trimmedSearchDraft = searchDraft.trim();
  const showSearchPreview = shouldShowTopbarSearchPreview(
    trimmedSearchDraft,
    mobileSearchOpen,
  );

  useLayoutEffect(() => {
    onSessionPresentationChange?.(sessionPresentation);
  }, [onSessionPresentationChange, sessionPresentation]);
  const searchTypeLabel: Record<string, string> = {
    answer: tNavigation('contentTypes.answer'),
    announcement: tNavigation('contentTypes.announcement'),
    blog: tNavigation('contentTypes.blog'),
    book: tNavigation('contentTypes.book'),
    discussion: tNavigation('contentTypes.discussion'),
    dynamic: tNavigation('contentTypes.dynamic'),
    forum: tNavigation('contentTypes.discussion'),
    post: tNavigation('contentTypes.post'),
    question: tNavigation('contentTypes.question'),
    status: tNavigation('contentTypes.dynamic'),
    tag: tNavigation('contentTypes.tag'),
    user: tNavigation('contentTypes.user'),
  };
  const searchResultSignal = (result: SearchResult) => {
    if (result.objectType === 'user') return tNavigation('contentTypes.user');
    if (result.objectType === 'tag') return tNavigation('search.relatedCount', { count: result.voteCount });
    if (typeof result.answerCount === 'number' && result.answerCount > 0) {
      return tNavigation('search.answerCount', { count: result.answerCount });
    }
    return tNavigation('search.voteCount', { count: result.voteCount });
  };

  useEffect(() => {
    if (authSnapshot.status !== 'authenticated' || demoMode) return;
    if (authSnapshot.user?.language && syncAccountPreference) {
      void syncAccountPreference(authSnapshot.user.language);
    }
    void syncGiteaSession().catch(() => {});
  }, [authSnapshot.status, authSnapshot.user?.language, demoMode, syncAccountPreference]);

  useEffect(() => {
    if (location.hash !== '#login' || sessionPresentation !== 'anonymous') return;
    setAuthDialogOpen(true);
  }, [location.hash, sessionPresentation]);

  useEffect(() => {
    if (authRequestVersion < 1 || sessionPresentation !== 'anonymous') return;
    setAuthDialogOpen(true);
  }, [authRequestVersion, sessionPresentation]);

  useEffect(() => {
    setMobileSearchOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setNotifications([]);
      return undefined;
    }

    const refreshNotifications = () => {
      void loadNotifications()
      .then((items) => {
        if (!cancelled) setNotifications(items);
      })
      .catch(() => {
        if (!cancelled) setNotifications([]);
      });
    };

    refreshNotifications();
    window.addEventListener(notificationStateChangedEvent, refreshNotifications);

    return () => {
      cancelled = true;
      window.removeEventListener(notificationStateChangedEvent, refreshNotifications);
    };
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    const query = searchDraft.trim();
    if (query.length < 2) {
      setSearchPreviewItems([]);
      setSearchPreviewCount(0);
      setSearchPreviewLoading(false);
      setSearchPreviewError('');
      return undefined;
    }

    setSearchPreviewLoading(true);
    setSearchPreviewError('');
    const timer = window.setTimeout(() => {
      void searchContent({
        query,
        type: 'all',
        order: 'relevance',
        page: 1,
        size: 4,
      })
        .then((result) => {
          if (!cancelled) {
            setSearchPreviewItems(result.items);
            setSearchPreviewCount(result.count);
          }
        })
        .catch((searchError) => {
          if (!cancelled) {
            setSearchPreviewItems([]);
            setSearchPreviewCount(0);
            setSearchPreviewError(messageFromError(searchError, 'discovery.searchFailed'));
          }
        })
        .finally(() => {
          if (!cancelled) {
            setSearchPreviewLoading(false);
          }
        });
    }, 240);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchDraft]);

  const submitTopbarSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchDraft.trim();
    if (!query) {
      if (mobileSearchOpen) closeMobileSearch();
      return;
    }
    navigate(hrefInWorld(`/search?q=${encodeURIComponent(query)}`, currentWorld));
  };

  const focusSearchInput = () => {
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  };

  const handleTopbarSearchButtonClick = (
    event: MouseEvent<HTMLButtonElement>,
  ) => {
    const isMobileTopbar = window.matchMedia('(max-width: 620px)').matches;
    if (!isMobileTopbar || mobileSearchOpen) return;
    event.preventDefault();
    setMobileSearchOpen(true);
    setPublishMenuOpen(false);
    setAccountMenuOpen(false);
    focusSearchInput();
  };

  const closeMobileSearch = () => {
    setMobileSearchOpen(false);
    searchInputRef.current?.blur();
  };

  useEffect(() => {
    if (!mobileSearchOpen) return undefined;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (searchFormRef.current?.contains(target)) return;
      closeMobileSearch();
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer, true);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer, true);
    };
  }, [mobileSearchOpen]);

  const handleTopbarSearchKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== 'Escape' || !mobileSearchOpen) return;
    event.preventDefault();
    closeMobileSearch();
  };

  const signOut = async () => {
    setBusy(true);
    try {
      if (!demoMode) await clearGiteaSession().catch(() => {});
      await auth.signOut();
      await onSessionChange?.();
    } finally {
      setBusy(false);
    }
  };

  const closeAuthDialog = () => {
    if (authBusy) return;
    setAuthDialogOpen(false);
    setAuthError('');
    setAuthStatus('');
    setAuthCode('');
    setAuthChallenge(null);
  };

  const openPublishDialog = (mode: PublishDialogMode) => {
    if (!user) {
      setAuthDialogOpen(true);
      return;
    }
    setPublishMenuOpen(false);
    setPublishDialogMode(mode);
    setPublishDialogOpen(true);
  };

  const openTagCreateDialog = () => {
    if (!user) {
      setAuthDialogOpen(true);
      return;
    }
    setPublishMenuOpen(false);
    setTagCreateDialogOpen(true);
  };

  const submitPhoneOtp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedPhone = normalizePhone(authPhone);
    if (!isMainlandPhone(normalizedPhone)) {
      setAuthError(tAuth('validation.mainlandPhone'));
      return;
    }
    setAuthBusy(true);
    setAuthError('');
    setAuthStatus('');
    try {
      const challenge = await auth.sendPhoneOtp(normalizedPhone);
      setAuthChallenge(challenge);
      setAuthCode('');
      setAuthPhone(normalizedPhone);
      setAuthStatus(
        challenge.isUser
          ? tAuth('status.existing')
          : tAuth('status.new'),
      );
    } catch (error) {
      setAuthError(messageFromError(error, 'authentication.otpSendFailed'));
    } finally {
      setAuthBusy(false);
    }
  };

  const submitPhoneLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!authChallenge) {
      await submitPhoneOtp(event);
      return;
    }
    const normalizedCode = authCode.trim();
    if (!/^\d{4,8}$/.test(normalizedCode)) {
      setAuthError(tAuth('validation.code'));
      return;
    }
    setAuthBusy(true);
    setAuthError('');
    setAuthStatus('');
    try {
      await auth.completePhoneOtp(authChallenge, normalizedCode);
      await onSessionChange?.();
      setAuthDialogOpen(false);
      setAuthPhone('');
      setAuthCode('');
      setAuthChallenge(null);
    } catch (error) {
      setAuthError(messageFromError(error, 'authentication.signInFailed'));
    } finally {
      setAuthBusy(false);
    }
  };

  return (
    <>
      <DiscoverySearch
          className={
            mobileSearchOpen
              ? 'topbar-search mobile-search-open'
              : 'topbar-search'
          }
          ref={searchFormRef}
          onSubmit={submitTopbarSearch}
          onKeyDown={handleTopbarSearchKeyDown}
        >
          <input
            ref={searchInputRef}
            value={searchDraft}
            maxLength={60}
            placeholder={tNavigation('search.placeholder')}
            aria-label={tNavigation('search.community')}
            onFocus={() => setMobileSearchOpen(true)}
            onChange={(event) => setSearchDraft(event.currentTarget.value)}
          />
          <AnimateButton unstyled
            type="submit"
            title={tNavigation('search.label')}
            aria-label={mobileSearchOpen ? tNavigation('search.label') : tNavigation('search.open')}
            onClick={handleTopbarSearchButtonClick}
          >
            <AnimateSearch animateOnHover size={16} />
          </AnimateButton>
          {showSearchPreview ? (
            <div className="topbar-search-preview" aria-live="polite">
              <div className="topbar-search-preview-head">
                <span>{tNavigation('search.liveIndex')}</span>
              <Link to={hrefInWorld(`/search?q=${encodeURIComponent(trimmedSearchDraft)}`, currentWorld)}>
                  {searchPreviewLoading ? tNavigation('search.loading') : tNavigation('search.resultCount', { count: searchPreviewCount })}
                </Link>
              </div>
              {searchPreviewError ? (
                <p className="topbar-search-preview-note">
                  {searchPreviewError}
                </p>
              ) : null}
              {!searchPreviewError &&
              searchPreviewLoading &&
              !searchPreviewItems.length ? (
                <p className="topbar-search-preview-note"> </p>
              ) : null}
              {!searchPreviewError &&
              !searchPreviewLoading &&
              !searchPreviewItems.length ? (
                <p className="topbar-search-preview-note">{tNavigation('search.noResults')}</p>
              ) : null}
              {searchPreviewItems.map((item) => (
                <Link
                  className="topbar-search-result"
                  to={hrefInWorld(searchResultPath(item), currentWorld)}
                  key={`${item.objectType}-${item.id}`}
                >
                  <span>{searchTypeLabel[item.objectType] || item.objectType}</span>
                  <strong>
                    <MathInline text={item.title} />
                  </strong>
                  <em>{searchResultSignal(item)}</em>
                </Link>
              ))}
              <Link
                className="topbar-search-all"
                to={hrefInWorld(`/search?q=${encodeURIComponent(trimmedSearchDraft)}`, currentWorld)}
              >
                {tNavigation('search.allResults')}
                <Icon name="arrow-right" />
              </Link>
            </div>
          ) : null}
      </DiscoverySearch>
      <nav className="account-nav" aria-label={ariaLabel || tNavigation('landmark')}>
          <Tooltip content={resolvedTheme === 'light' ? tNavigation('theme.toDark') : tNavigation('theme.toLight')}>
            <AnimateThemeToggler
              resolved={resolvedTheme}
              onToggle={() => setThemePreference(resolvedTheme === 'light' ? 'dark' : 'light')}
              label={resolvedTheme === 'light' ? tNavigation('theme.toDark') : tNavigation('theme.toLight')}
              className="topbar-pill"
            />
          </Tooltip>
          {sessionPresentation === 'restoring' ? (
            <TopbarSessionPlaceholder />
          ) : user ? (
            <>
              <Tooltip content={tNavigation('account.creator')}>
                <Link to="/creator" className="topbar-pill" aria-label={tNavigation('account.creator')}>
                  <AnimateSparkles animateOnHover size={18} />
                </Link>
              </Tooltip>
              <PublishingActions>
                <Menu onOpenChange={setPublishMenuOpen}>
                  <Tooltip content={tNavigation('publish.label')}>
                    <MenuTrigger asChild>
                      <AnimateButton unstyled
                        type="button"
                        className="topbar-pill"
                        aria-label={tNavigation('publish.label')}
                      >
                        <AnimatePlus animateOnHover size={16} />
                      </AnimateButton>
                    </MenuTrigger>
                  </Tooltip>
                  <MenuContent align="end" sideOffset={8}>
                    <MenuSub>
                      <MenuSubTrigger className="rin-ui-menu-item rin-ui-menu-sub-trigger">
                        <Icon name="journal-text" />
                        <span>{tNavigation('publish.blog')}</span>
                        <Icon name="chevron-right" />
                      </MenuSubTrigger>
                      <MenuSubContent className="rin-ui-panel rin-ui-menu">
                        <MenuItem onSelect={() => openPublishDialog('blog')}>
                          <span
                            className="latex-menu-mark"
                            aria-hidden="true"
                            dangerouslySetInnerHTML={{ __html: texLogoHtml }}
                          />
                          <span>LaTeX</span>
                        </MenuItem>
                        <MenuItem asChild>
                          <Link to="/write/markdown">
                            <Icon name="markdown" />
                            <span>Markdown</span>
                          </Link>
                        </MenuItem>
                      </MenuSubContent>
                    </MenuSub>
                    <MenuItem asChild>
                      <Link to="/questions/ask">
                        <Icon name="patch-question" />
                        <span>{tNavigation('publish.question')}</span>
                      </Link>
                    </MenuItem>
                    <MenuItem asChild>
                      <Link to="/discussions/new">
                        <Icon name="chat-square-text" />
                        <span>{tNavigation('publish.discussion')}</span>
                      </Link>
                    </MenuItem>
                    <MenuItem asChild>
                      <Link to="/dynamics/new">
                        <Icon name="lightning-charge" />
                        <span>{tNavigation('publish.dynamic')}</span>
                      </Link>
                    </MenuItem>
                    <MenuSub>
                      <MenuSubTrigger className="rin-ui-menu-item rin-ui-menu-sub-trigger">
                        <Icon name="book" />
                        <span>{tNavigation('publish.book')}</span>
                        <Icon name="chevron-right" />
                      </MenuSubTrigger>
                      <MenuSubContent className="rin-ui-panel rin-ui-menu">
                        <MenuItem onSelect={() => openPublishDialog('pdf-book')}>
                          <Icon name="filetype-pdf" />
                          <span>PDF</span>
                        </MenuItem>
                        <MenuItem onSelect={() => openPublishDialog('latex-book')}>
                          <span
                            className="latex-menu-mark"
                            aria-hidden="true"
                            dangerouslySetInnerHTML={{ __html: texLogoHtml }}
                          />
                          <span>LaTeX</span>
                        </MenuItem>
                        <MenuItem onSelect={() => openPublishDialog('markdown-book')}>
                          <Icon name="markdown" />
                          <span>Markdown</span>
                        </MenuItem>
                      </MenuSubContent>
                    </MenuSub>
                    <MenuItem onSelect={openTagCreateDialog}>
                      <Icon name="tags" />
                      <span>{tNavigation('publish.tag')}</span>
                    </MenuItem>
                    {isModerator ? (
                      <MenuItem asChild>
                        <Link to="/announcements/new">
                          <Icon name="megaphone" />
                          <span>{tNavigation('publish.announcement')}</span>
                        </Link>
                      </MenuItem>
                    ) : null}
                  </MenuContent>
                </Menu>
              </PublishingActions>
              <NotificationNavigation>
                <Tooltip content={tNavigation('account.notifications')}>
                  <Link className="notification-pill" to={hrefInWorld('/notifications', currentWorld)} aria-label={tNavigation('account.notifications')}>
                    {notifications.length ? <AnimateBellRing animateOnHover size={16} /> : <AnimateBell animateOnHover size={16} />}
                    {notifications.length ? <span>{notifications.length}</span> : null}
                  </Link>
                </Tooltip>
                {isModerator ? (
                  <Tooltip content={tNavigation('account.admin')}>
                    <Link className="notification-pill" to="/admin" aria-label={tNavigation('account.admin')}>
                      <AnimateKanban animateOnHover size={16} />
                    </Link>
                  </Tooltip>
                ) : null}
              </NotificationNavigation>
              <SessionMenu>
                <Menu onOpenChange={setAccountMenuOpen}>
                  <Tooltip content={tNavigation('account.menu')}>
                    <MenuTrigger asChild>
                      <AnimateButton unstyled
                        type="button"
                        className="account-menu-trigger"
                        aria-label={tNavigation('account.menu')}
                      >
                        <AvatarName name={currentDisplayName} imageUrl={avatarDataUrl} />
                        <AnimateChevronDown animateOnHover size={16} />
                      </AnimateButton>
                    </MenuTrigger>
                  </Tooltip>
                  <MenuContent align="end" sideOffset={8}>
                    <MenuItem asChild>
                      <Link to={profilePath(currentProfileRouteId)}>
                        <AnimateUser animateOnHover size={16} />
                        <span>{tNavigation('account.profile')}</span>
                      </Link>
                    </MenuItem>
                    <MenuItem asChild>
                      <Link to={hrefInWorld('/settings', currentWorld)}>
                        <AnimateSettings animateOnHover size={16} />
                        <span>{tNavigation('account.accountSettings')}</span>
                      </Link>
                    </MenuItem>
                    <MenuItem onSelect={() => void signOut()} disabled={busy}>
                      <AnimateLogOut animateOnHover size={16} />
                      <span>{busy ? tNavigation('account.signingOut') : tNavigation('account.signOut')}</span>
                    </MenuItem>
                  </MenuContent>
                </Menu>
              </SessionMenu>
            </>
          ) : (
            <AnimateButton unstyled
              type="button"
              className="topbar-auth-button"
              onClick={() => setAuthDialogOpen(true)}
            >
              {tNavigation('account.signInOrRegister')}
            </AnimateButton>
          )}
      </nav>
      <PublishCreateDialog
        open={publishDialogOpen}
        mode={publishDialogMode}
        user={user}
        onClose={() => setPublishDialogOpen(false)}
      />
      <TagCreationFlow open={tagCreateDialogOpen} onOpenChange={setTagCreateDialogOpen} invocation={{ source: 'topbar' }} />
      <Dialog open={authDialogOpen} onOpenChange={(open) => { if (!open) closeAuthDialog(); }}>
        <DialogPortal>
          <DialogOverlay className="rin-ui-overlay" />
          <DialogBody className="auth-dialog" aria-describedby={undefined}>
            <div className="auth-dialog-head">
              <DialogTitle className="auth-dialog-title">{tAuth('title')}</DialogTitle>
              <DialogClose asChild>
                <AnimateButton unstyled
                  type="button"
                  aria-label={tAuth('close')}
                  disabled={authBusy}
                >
                  <Icon name="x-lg" />
                </AnimateButton>
              </DialogClose>
            </div>
            {demoMode ? (
              <div className="auth-dialog-form" data-rin-demo-sms-boundary="true">
                <p>{tAuth('demoSmsUnavailable')}</p>
                <div className="auth-dialog-actions">
                  <AnimateButton
                    unstyled
                    type="button"
                    onClick={() => {
                      auth.setDemoPersona?.('member');
                      closeAuthDialog();
                    }}
                  >
                    {tAuth('enterDemoMember')}
                  </AnimateButton>
                </div>
              </div>
            ) : (
            <form
              className="auth-dialog-form"
              onSubmit={authChallenge ? submitPhoneLogin : submitPhoneOtp}
            >
              <label>
                <span>{tAuth('phone')}</span>
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder={tAuth('phonePlaceholder')}
                  value={authPhone}
                  disabled={Boolean(authChallenge) || authBusy}
                  onChange={(event) => setAuthPhone(event.currentTarget.value)}
                />
              </label>
              {authChallenge ? (
                <label>
                  <span>{tAuth('code')}</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder={tAuth('codePlaceholder')}
                    value={authCode}
                    disabled={authBusy}
                    onChange={(event) => setAuthCode(event.currentTarget.value)}
                  />
                </label>
              ) : null}
              {authError ? <p className="auth-dialog-error">{authError}</p> : null}
              {authStatus ? <p className="auth-dialog-status">{authStatus}</p> : null}
              <div className="auth-dialog-actions">
                {authChallenge ? (
                  <AnimateButton unstyled
                    type="button"
                    className="auth-dialog-link"
                    disabled={authBusy}
                    onClick={() => {
                      setAuthChallenge(null);
                      setAuthCode('');
                      setAuthStatus('');
                      setAuthError('');
                    }}
                  >
                    {tAuth('changePhone')}
                  </AnimateButton>
                ) : null}
                <AnimateButton unstyled type="submit" disabled={authBusy}>
                  {authBusy
                    ? tAuth('processing')
                    : authChallenge
                      ? tAuth('complete')
                      : tAuth('sendCode')}
                </AnimateButton>
              </div>
            </form>
            )}
          </DialogBody>
        </DialogPortal>
      </Dialog>
    </>
  );
}
