import { createPortal } from 'react-dom';
import { useEffect, useRef, useState, type RefObject } from 'react';

import { publicEnv } from '@/app/config/env';
import { AnimatePreviewLinkCard } from '@/components/ui/animate';
import { formatDate } from '@/i18n/format';
import { feedPresentationDate } from '@/i18n/feedPresentation';
import { useResolvedLocale } from '@/i18n/LanguageProvider';
import { useFeatureTranslation } from '@/i18n/useFeatureTranslation';
import { loadContentDetail } from '@/services/domains/article';
import type { PostDetail } from '@/services/contracts';
import {
  resolveInternalContentPreview,
  type InternalContentPreviewTarget,
} from '@/utils/internalContentPreview';

type ActivePreview = InternalContentPreviewTarget & {
  anchor: HTMLAnchorElement;
  label: string;
};

const contentPreviewCache = new Map<string, Promise<PostDetail>>();

function cachedContentPreview(slug: string) {
  const key = slug.toLocaleLowerCase();
  const existing = contentPreviewCache.get(key);
  if (existing) return existing;
  const request = loadContentDetail(slug).catch((error: unknown) => {
    contentPreviewCache.delete(key);
    throw error;
  });
  contentPreviewCache.set(key, request);
  return request;
}

function eligibleAnchor(target: EventTarget | null, root: HTMLElement) {
  if (!(target instanceof Element)) return null;
  const anchor = target.closest<HTMLAnchorElement>('a[href]');
  if (!anchor || !root.contains(anchor) || anchor.hasAttribute('download')) return null;
  const label = (anchor.textContent || '').trim();
  if (!label && anchor.querySelector('img, picture, svg')) return null;
  const preview = resolveInternalContentPreview(anchor.getAttribute('href') || '', {
    basePath: publicEnv.publicBasePath,
  });
  return preview ? { ...preview, anchor, label: label || preview.href } : null;
}

function previewPosition(anchor: HTMLAnchorElement) {
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(384, window.innerWidth - 24);
  const estimatedHeight = 180;
  const left = Math.min(
    window.innerWidth - width - 12,
    Math.max(12, rect.left + Math.min(rect.width / 2, 72) - 32),
  );
  const below = rect.bottom + 10;
  const top = below + estimatedHeight <= window.innerHeight
    ? below
    : Math.max(12, rect.top - estimatedHeight - 10);
  return { left, top, width };
}

export default function InternalContentLinkPreview({
  rootRef,
}: {
  rootRef: RefObject<HTMLElement | null>;
}) {
  const { t } = useFeatureTranslation('reader');
  const locale = useResolvedLocale();
  const [active, setActive] = useState<ActivePreview | null>(null);
  const [detail, setDetail] = useState<PostDetail | null>(null);
  const [position, setPosition] = useState({ left: 12, top: 12, width: 360 });
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);

  const clearOpenTimer = () => {
    if (openTimer.current !== null) window.clearTimeout(openTimer.current);
    openTimer.current = null;
  };
  const clearCloseTimer = () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const show = (next: ActivePreview, delay: number) => {
      clearOpenTimer();
      clearCloseTimer();
      openTimer.current = window.setTimeout(() => {
        setPosition(previewPosition(next.anchor));
        setDetail(null);
        setActive(next);
      }, delay);
    };
    const hide = () => {
      clearOpenTimer();
      clearCloseTimer();
      closeTimer.current = window.setTimeout(() => {
        setActive(null);
        setDetail(null);
      }, 180);
    };
    const onPointerOver = (event: PointerEvent) => {
      if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
      const next = eligibleAnchor(event.target, root);
      if (next) show(next, 400);
    };
    const onPointerOut = (event: PointerEvent) => {
      const anchor = event.target instanceof Element
        ? event.target.closest<HTMLAnchorElement>('a[href]')
        : null;
      if (!anchor || !root.contains(anchor)) return;
      if (event.relatedTarget instanceof Node && anchor.contains(event.relatedTarget)) return;
      hide();
    };
    const onFocusIn = (event: FocusEvent) => {
      const next = eligibleAnchor(event.target, root);
      if (next) show(next, 80);
    };
    const onFocusOut = (event: FocusEvent) => {
      const anchor = event.target instanceof Element
        ? event.target.closest<HTMLAnchorElement>('a[href]')
        : null;
      if (anchor && root.contains(anchor)) hide();
    };

    root.addEventListener('pointerover', onPointerOver);
    root.addEventListener('pointerout', onPointerOut);
    root.addEventListener('focusin', onFocusIn);
    root.addEventListener('focusout', onFocusOut);
    return () => {
      clearOpenTimer();
      clearCloseTimer();
      root.removeEventListener('pointerover', onPointerOver);
      root.removeEventListener('pointerout', onPointerOut);
      root.removeEventListener('focusin', onFocusIn);
      root.removeEventListener('focusout', onFocusOut);
    };
  }, [rootRef]);

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    void cachedContentPreview(active.slug)
      .then((nextDetail) => {
        if (!cancelled) setDetail(nextDetail);
      })
      .catch(() => {
        if (!cancelled) setActive(null);
      });
    const reposition = () => {
      if (active.anchor.isConnected) setPosition(previewPosition(active.anchor));
      else setActive(null);
    };
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      cancelled = true;
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [active]);

  if (!active || typeof document === 'undefined') return null;
  const kind = detail?.type && ['blog', 'book', 'question', 'discussion', 'dynamic', 'announcement'].includes(detail.type)
    ? detail.type as InternalContentPreviewTarget['kind']
    : active.kind;
  const detailDate = detail ? feedPresentationDate(detail) : null;
  const previewMeta = detail
    ? [
        detail.author.trim(),
        detailDate
          ? formatDate(locale, detailDate, {
              timeZone: 'Asia/Shanghai',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            })
          : '',
      ].filter(Boolean).join(' · ')
    : undefined;

  return createPortal(
    <AnimatePreviewLinkCard
      className="internal-content-preview-card"
      href={active.href}
      title={detail?.title || active.label}
      description={detail?.excerpt}
      eyebrow={t(`detail.type.${kind}`)}
      meta={previewMeta}
      coverUrl={detail?.coverUrl || detail?.images?.[0]}
      loading={!detail}
      style={{ left: position.left, top: position.top, width: position.width }}
      onPointerEnter={clearCloseTimer}
      onPointerLeave={() => {
        clearCloseTimer();
        closeTimer.current = window.setTimeout(() => {
          setActive(null);
          setDetail(null);
        }, 180);
      }}
    />,
    document.body,
  );
}
