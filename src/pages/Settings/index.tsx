import { Icon , useNoticeToasts } from 'components/ui';
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Form } from '@/components/ui/compat';
import { RuntimeHelmet as Helmet } from '@/components/RuntimeHelmet';
import { Link } from 'react-router-dom';
import SiteTopbar from '@/components/SiteTopbarShell';

import LoadingState from '@/components/LoadingState';
import CodeRecoveryCenter from '@/components/CodeRecoveryCenter';
import { i18n, normalizeLanguagePreference } from '@/i18n';
import { useLanguage } from '@/i18n/LanguageProvider';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import type { PersistedLanguagePreference } from '@/i18n/types';
import { loadUserNotificationConfig, updateUserInterfaceConfig, updateUserNotificationConfig } from '@/services/domains/identity';
import type { UserNotificationConfig } from '@/services/contracts';
import { profilePath as routeProfilePath } from '@/utils/routes';
import { useAuthAdapter, useAuthSnapshot } from '@/platform/auth/context';
import { useOptionalBootstrap } from '@/app/bootstrap/context';

type NotificationKey = keyof UserNotificationConfig;

const defaultNotificationConfig: UserNotificationConfig = {
  inbox: { key: 'email', enable: false },
  allNewQuestion: { key: 'email', enable: false },
  allNewQuestionForFollowingTags: { key: 'email', enable: false },
};

const notificationRows: NotificationKey[] = [
  'inbox',
  'allNewQuestion',
  'allNewQuestionForFollowingTags',
];

function normalizeNotificationConfig(config: Partial<UserNotificationConfig> | null | undefined): UserNotificationConfig {
  return {
    inbox: config?.inbox || defaultNotificationConfig.inbox,
    allNewQuestion: config?.allNewQuestion || defaultNotificationConfig.allNewQuestion,
    allNewQuestionForFollowingTags:
      config?.allNewQuestionForFollowingTags || defaultNotificationConfig.allNewQuestionForFollowingTags,
  };
}

function updateNotificationChannel(
  config: UserNotificationConfig,
  key: NotificationKey,
  patch: Partial<UserNotificationConfig[NotificationKey]>,
): UserNotificationConfig {
  return {
    ...config,
    [key]: {
      ...defaultNotificationConfig[key],
      ...(config[key] || {}),
      ...patch,
    },
  };
}

function SettingsPage() {
  const { t, ready } = useFeatureTranslation('settings');
  const {
    preference,
    preparePreference,
    commitPreparedPreference,
    syncAccountPreference,
  } = useLanguage();
  const auth = useAuthAdapter();
  const bootstrap = useOptionalBootstrap();
  const isDemo = bootstrap?.config.mode === 'demo';
  const authSnapshot = useAuthSnapshot();
  const currentUser = authSnapshot.status === 'authenticated' ? authSnapshot.user : null;
  const currentUserRef = useRef(currentUser);
  const syncAccountPreferenceRef = useRef(syncAccountPreference);
  currentUserRef.current = currentUser;
  syncAccountPreferenceRef.current = syncAccountPreference;
  const identity = currentUser?.id || null;
  const [language, setLanguage] = useState<PersistedLanguagePreference>(preference);
  const [colorScheme, setColorScheme] = useState('light');
  const [notificationConfig, setNotificationConfig] = useState<UserNotificationConfig>(defaultNotificationConfig);
  const [loading, setLoading] = useState(true);
  const [savingInterface, setSavingInterface] = useState(false);
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const profilePath = useMemo(
    () => routeProfilePath(currentUser?.publicUserId || currentUser?.username || currentUser?.id),
    [currentUser?.id, currentUser?.publicUserId, currentUser?.username],
  );

  const reload = useCallback(async () => {
    const user = currentUserRef.current;
    if (!user) {
      setNotificationConfig(defaultNotificationConfig);
      return;
    }

    const config = await loadUserNotificationConfig();
    const accountPreference = normalizeLanguagePreference(user.language);
    setLanguage(accountPreference);
    if (user.language) await syncAccountPreferenceRef.current(user.language);
    setColorScheme(user.colorScheme || 'light');
    setNotificationConfig(normalizeNotificationConfig(config));
  }, []);

  useNoticeToasts({
    error, notice,
  });
  useEffect(() => {
    let cancelled = false;
    setLoading(authSnapshot.status === 'restoring' || Boolean(identity));
    setError('');
    setNotice('');
    void reload()
      .catch((loadError) => {
        console.error('Failed to load Settings', loadError);
        if (!cancelled) setError(i18n.t('errors:interface.loadFailed'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authSnapshot.status, identity, reload]);

  const saveInterface = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingInterface(true);
    setError('');
    setNotice('');
    try {
      const prepared = await preparePreference(language, ['settings']);
      const nextConfig = await updateUserInterfaceConfig({
        language: prepared.preference,
        colorScheme,
      });
      const accountPreference = normalizeLanguagePreference(nextConfig.language);
      setLanguage(accountPreference);
      setColorScheme(nextConfig.colorScheme);
      await commitPreparedPreference({ ...prepared, preference: accountPreference });
      auth.updatePreferences({
        language: nextConfig.language,
        colorScheme: nextConfig.colorScheme,
      });
      setNotice(t('interface.saved'));
    } catch (interfaceError) {
      console.error('Failed to save interface settings', interfaceError);
      setError(t('errors:interface.saveFailed'));
    } finally {
      setSavingInterface(false);
    }
  };

  const saveNotifications = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingNotifications(true);
    setError('');
    setNotice('');
    try {
      const nextConfig = await updateUserNotificationConfig(notificationConfig);
      setNotificationConfig(normalizeNotificationConfig(nextConfig));
      setNotice(t('notifications.saved'));
    } catch (notificationError) {
      console.error('Failed to save notification settings', notificationError);
      setError(t('errors:notifications.saveFailed'));
    } finally {
      setSavingNotifications(false);
    }
  };

  const renderNotificationRow = (row: NotificationKey) => {
    const config = notificationConfig[row] || defaultNotificationConfig[row];
    const title = t(`notifications.rows.${row}.title`);
    return (
      <div className="settings-notification-row" key={row}>
        <div>
          <strong>{title}</strong>
          <p>{t(`notifications.rows.${row}.detail`)}</p>
        </div>
        <Form.Select
          value={config.key}
          aria-label={t('notifications.channelLabel', { title })}
          onChange={(event) => {
            const nextKey = event.currentTarget.value;
            setNotificationConfig((current) => updateNotificationChannel(current, row, { key: nextKey }));
          }}
        >
          {(['email', 'site'] as const).map((channel) => (
            <option value={channel} key={channel} disabled={isDemo && channel === 'email'}>{t(`notifications.channels.${channel}`)}</option>
          ))}
        </Form.Select>
        <Form.Check
          type="checkbox"
          id={`settings-${row}`}
          label={config.enable ? t('notifications.enabled') : t('notifications.disabled')}
          checked={config.enable}
          onChange={(event) => {
            const nextEnable = event.currentTarget.checked;
            setNotificationConfig((current) => updateNotificationChannel(current, row, { enable: nextEnable }));
          }}
        />
      </div>
    );
  };

  return (
    <>
      <Helmet title={t('pageTitle')} />
      <SiteTopbar />

      <main className="settings-shell">
        <section className="panel directory-toolbar settings-toolbar">
          <div className="detail-kicker">
            <span>{t('title')}</span>
            <strong>{authSnapshot.status === 'authenticated' ? t('scope.signedIn') : t('scope.signedOut')}</strong>
          </div>
          <h1>{t('title')}</h1>
          <p />
        </section>

        {loading || !ready ? (
          <LoadingState variant="panel" />
        ) : !currentUser ? (
          <section className="panel settings-login-panel">
            <div className="panel-heading">
              <span>{t('signedOut')}</span>
              <strong>{t('visitor')}</strong>
            </div>
            <p />
            <Link className="primary-link-button" to="/#login">{t('signIn')}</Link>
          </section>
        ) : (
          <section className="settings-grid">
            <aside className="panel settings-profile-card">
              <div className="section-label">
                <Icon name="sliders" />
                {t('title')}
              </div>
              <h2>{currentUser.displayName || currentUser.username || t('navigation:account.anonymousName')}</h2>
              <p>{currentUser.username || currentUser.id}</p>
              <div className="settings-profile-actions">
                <Link to={profilePath}>{t('profile')}</Link>
                <Link to="/notifications">{t('notificationsLink')}</Link>
              </div>
              <p className="settings-scope-note" />
            </aside>

            <div className="settings-main">
              {isDemo ? (
                <section className="panel settings-demo-boundary" role="note">
                  <Icon name="patch-check" />
                  <p>{t('demoBoundary')}</p>
                </section>
              ) : null}
              <Form className="panel settings-form" onSubmit={saveInterface}>
                <div className="panel-heading large">
                  <div>
                    <span>{t('interface.heading')}</span>
                    <strong>{t('interface.caption')}</strong>
                  </div>
                </div>
                <div className="settings-two-column">
                  <Form.Group controlId="settings-language">
                    <Form.Label>{t('interface.language')}</Form.Label>
                    <Form.Select id="settings-language" value={language} onChange={(event) => setLanguage(normalizeLanguagePreference(event.currentTarget.value))}>
                      {(['system', 'zh-CN', 'en'] as const).map((option) => (
                        <option value={option} key={option}>{t(`language.${option}`)}</option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                  <Form.Group controlId="settings-color-scheme">
                    <Form.Label>{t('interface.displayMode')}</Form.Label>
                    <Form.Select id="settings-color-scheme" value={colorScheme} onChange={(event) => setColorScheme(event.currentTarget.value)}>
                      {(['light', 'dark', 'system'] as const).map((option) => (
                        <option value={option} key={option}>{t(`colorScheme.${option}`)}</option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </div>
                <div className="composer-actions">
                  <Button className="primary-button" type="submit" disabled={savingInterface}>
                    {savingInterface ? t('interface.saving') : t('interface.save')}
                  </Button>
                </div>
              </Form>

              <Form className="panel settings-form" onSubmit={saveNotifications}>
                <div className="panel-heading large">
                  <div>
                    <span>{t('notifications.heading')}</span>
                    <strong>{t('notifications.caption')}</strong>
                  </div>
                </div>
                <div className="settings-notification-list">
                  {notificationRows.map(renderNotificationRow)}
                </div>
                <div className="composer-actions">
                  <Button className="primary-button" type="submit" disabled={savingNotifications}>
                    {savingNotifications ? t('notifications.saving') : t('notifications.save')}
                  </Button>
                </div>
              </Form>

              {!isDemo ? <CodeRecoveryCenter /> : null}
            </div>
          </section>
        )}
      </main>
    </>
  );
}

export default SettingsPage;
