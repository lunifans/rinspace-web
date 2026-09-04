import { forwardRef, type FormHTMLAttributes, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { useOptionalBootstrap } from '@/app/bootstrap/context';
import { SplittingText } from 'components/ui';

export function BrandNavigation({ animate = true }: { animate?: boolean }) {
  const { t } = useTranslation('navigation');
  const bootstrap = useOptionalBootstrap();
  const brandName = bootstrap?.config.site.name ?? t('brandName');
  const logoPath = bootstrap?.config.site.brand.logoPath ?? null;
  return (
    <Link className="brand" to="/" aria-label={t('brandHome', { brandName })}>
      <motion.span
        className="brand-mark"
        whileHover={{ rotateY: 360 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        style={{ transformPerspective: 600 }}
      >
        {logoPath ? (
          <img
            src={logoPath}
            alt=""
            aria-hidden="true"
            draggable={false}
            width={128}
            height={128}
            decoding="sync"
            fetchPriority="high"
          />
        ) : <span aria-hidden="true">{brandName.slice(0, 1)}</span>}
      </motion.span>
      <span className="brand-word" aria-hidden="true">
        <SplittingText
          className="brand-word-motion"
          text={brandName}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          stagger={0.04}
          disableAnimation={!animate}
        />
      </span>
    </Link>
  );
}

export const DiscoverySearch = forwardRef<HTMLFormElement, FormHTMLAttributes<HTMLFormElement>>(function DiscoverySearch({ children, ...props }, ref) {
  return <form {...props} ref={ref} role="search">{children}</form>;
});

export function PublishingActions({ children }: { children: ReactNode }) { return <div className="publish-menu">{children}</div>; }
export function NotificationNavigation({ children }: { children: ReactNode }) { return <>{children}</>; }
export function SessionMenu({ children }: { children: ReactNode }) { return <div className="account-menu">{children}</div>; }
