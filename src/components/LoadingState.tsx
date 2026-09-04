import { Spinner } from '@/components/ui/compat';
import { useTranslation } from 'react-i18next';

type LoadingStateVariant = 'panel' | 'strip' | 'compact' | 'inline';

type LoadingStateProps = {
  variant?: LoadingStateVariant;
  className?: string;
  label?: string;
};

export function PageLoadingState({ label }: { label?: string }) {
  const { t } = useTranslation('common');
  return (
    <main
      className="rin-page-loading"
      role="status"
      aria-label={label || t('pageLoading')}
      aria-busy="true"
    >
      <Spinner animation="border" size="sm" aria-hidden="true" />
    </main>
  );
}

export default function LoadingState({
  variant = 'strip',
  className = '',
  label,
}: LoadingStateProps) {
  const { t } = useTranslation('common');
  const resolvedLabel = label || t('loading');
  const classes = [
    'loading-state',
    variant === 'panel' ? 'loading-state-panel' : '',
    variant === 'strip' ? 'loading-state-strip' : '',
    variant === 'compact' ? 'loading-state-compact' : '',
    variant === 'inline' ? 'loading-state-inline' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (variant === 'inline') {
    return (
      <span className={classes} role="status" aria-label={resolvedLabel}>
        <Spinner animation="border" size="sm" aria-hidden="true" />
      </span>
    );
  }

  return (
    <div className={classes} role="status" aria-label={resolvedLabel}>
      <Spinner animation="border" size="sm" aria-hidden="true" />
    </div>
  );
}
