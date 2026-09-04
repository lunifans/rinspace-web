import { useCallback, useEffect, useState } from 'react';
import { AnimateButton } from 'components/ui';

import LoadingState from '@/components/LoadingState';
import { formatDate } from '@/i18n/format';
import { useResolvedLocale } from '@/i18n/LanguageProvider';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { createCodeRecoveryTicket, loadCodeRecoveries, type CodeRecoveryRecord } from '@/services/recovery';

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function recoveryDownloadPath(value: string) {
  const parsed = new URL(value, window.location.origin);
  if (parsed.origin !== window.location.origin || parsed.pathname !== '/code/recovery/download' || !parsed.searchParams.get('ticket')) {
    throw new Error('invalid recovery download URL');
  }
  return `${parsed.pathname}${parsed.search}`;
}

export default function CodeRecoveryCenter() {
  const { t } = useFeatureTranslation('settings');
  const locale = useResolvedLocale();
  const [recoveries, setRecoveries] = useState<CodeRecoveryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRecoveries(await loadCodeRecoveries());
    } catch {
      setError(t('recovery.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void reload(); }, [reload]);

  const download = async (recovery: CodeRecoveryRecord) => {
    setDownloading(recovery.recoveryId);
    setError('');
    try {
      const ticket = await createCodeRecoveryTicket(recovery.recoveryId);
      const link = document.createElement('a');
      link.href = recoveryDownloadPath(ticket.url);
      link.download = '';
      link.rel = 'noreferrer';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      setError(t('recovery.downloadFailed'));
    } finally {
      setDownloading('');
    }
  };

  return (
    <section className="panel settings-form" id="code-recoveries" aria-labelledby="code-recoveries-heading">
      <div className="panel-heading large">
        <div>
          <span id="code-recoveries-heading">{t('recovery.heading')}</span>
          <strong>{t('recovery.caption')}</strong>
        </div>
        <AnimateButton unstyled className="secondary-button" type="button" onClick={() => void reload()} disabled={loading}>
          {t('recovery.refresh')}
        </AnimateButton>
      </div>
      <p>{t('recovery.detail')}</p>
      {error ? <p role="alert">{error}</p> : null}
      {loading ? <LoadingState variant="panel" /> : recoveries.length === 0 ? (
        <div className="state-strip">{t('recovery.empty')}</div>
      ) : (
        <div className="settings-notification-list" aria-label={t('recovery.listLabel')}>
          {recoveries.map((recovery) => (
            <article className="settings-notification-row" key={recovery.recoveryId}>
              <div>
                <strong>{recovery.branch || t('recovery.unknownBranch')}</strong>
                <p>
                  {Number.isFinite(new Date(recovery.generatedAt).getTime())
                    ? formatDate(locale, recovery.generatedAt, {
                      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
                    })
                    : t('recovery.unknownTime')}
                  {' · '}{formatBytes(recovery.bytes)}{' · '}
                  {t(`recovery.status.${recovery.status}`)}
                </p>
              </div>
              <AnimateButton
                unstyled
                className="primary-button"
                type="button"
                onClick={() => void download(recovery)}
                disabled={downloading === recovery.recoveryId}
              >
                {downloading === recovery.recoveryId ? t('recovery.preparing') : t('recovery.download')}
              </AnimateButton>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
