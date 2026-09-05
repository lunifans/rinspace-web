import { forwardRef, type FormHTMLAttributes, type ReactNode } from 'react';
import { RinspaceBrandNavigation, currentWorldHome, flipTarget, prepareWorldFlipNavigation, resolveWorld } from '@rinspace/world-shell';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';

import { useOptionalBootstrap } from '@/app/bootstrap/context';
import { SplittingText } from 'components/ui';

export function BrandNavigation({ animate = true }: { animate?: boolean }) {
  const { t } = useTranslation('navigation');
  const bootstrap = useOptionalBootstrap();
  const location = useLocation();
  const navigate = useNavigate();
  const brandName = bootstrap?.config.site.name ?? t('brandName');
  const logoPath = bootstrap?.config.site.brand.logoPath ?? null;
  const currentHref = `${location.pathname}${location.search}${location.hash}`;
  const resolution = resolveWorld(currentHref);
  const world = resolution.world ?? 'outer';
  const currentHomeHref = currentWorldHome(world);
  const oppositeWorld = world === 'outer' ? 'inner' : 'outer';
  const flipHref = flipTarget(currentHref, resolution) ?? currentWorldHome(oppositeWorld);
  return (
    <RinspaceBrandNavigation
      brandName={brandName}
      world={world}
      currentHomeHref={currentHomeHref}
      flipHref={flipHref}
      labels={{
        flip: world === 'outer' ? t('brandFlipToInner') : t('brandFlipToOuter'),
        home: t('brandCurrentHome'),
      }}
      brandMark={logoPath ? (
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
      wordmark={
        <SplittingText
          className="brand-word-motion"
          text={brandName}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          stagger={0.04}
          disableAnimation={!animate}
        />
      }
      classNames={{ root: 'brand', logo: 'brand-mark', wordmark: 'brand-word' }}
      ports={{
        navigation: {
          navigate: ({ href, reason }) => {
            if (reason === 'flip') {
              prepareWorldFlipNavigation(href);
              return false;
            }
            navigate(href);
            return true;
          },
        },
      }}
    />
  );
}

export const DiscoverySearch = forwardRef<HTMLFormElement, FormHTMLAttributes<HTMLFormElement>>(function DiscoverySearch({ children, ...props }, ref) {
  return <form {...props} ref={ref} role="search">{children}</form>;
});

export function PublishingActions({ children }: { children: ReactNode }) { return <div className="publish-menu">{children}</div>; }
export function NotificationNavigation({ children }: { children: ReactNode }) { return <>{children}</>; }
export function SessionMenu({ children }: { children: ReactNode }) { return <div className="account-menu">{children}</div>; }
