import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ArrowRight, Check, Copy, X } from 'lucide-react';
import { AnimatePresence, motion, useScroll, useSpring } from 'motion/react';
import { useEffect, useState, type CSSProperties, type PointerEventHandler, type ReactNode } from 'react';

import { AnimateIconButton } from './icon-button';
import { AnimateTabs, AnimateTabsContent, AnimateTabsList, AnimateTabsTrigger } from './tabs';

/** Adapted from pinned Animate UI Copy Button with truthful controlled success. */
export function AnimateCopyButton({ text, label = '复制' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (!copied) return undefined; const timer = window.setTimeout(() => setCopied(false), 1600); return () => window.clearTimeout(timer); }, [copied]);
  return <AnimateIconButton active={copied} icon={<AnimatePresence mode="wait" initial={false}><motion.span key={copied ? 'check' : 'copy'} initial={{ opacity: 0, scale: .7 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: .7 }}>{copied ? <Check /> : <Copy />}</motion.span></AnimatePresence>} label={copied ? '已复制' : label} onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); }} />;
}

export function AnimateCodeTabs({ tabs }: { tabs: Array<{ label: string; code: string; language?: string }> }) {
  if (tabs.length === 0) return null;
  return <AnimateTabs className="rin-animate-code-tabs" defaultValue="0"><div className="rin-animate-code-head"><AnimateTabsList>{tabs.map((tab, index) => <AnimateTabsTrigger key={tab.label} value={String(index)}>{tab.label}</AnimateTabsTrigger>)}</AnimateTabsList></div>{tabs.map((tab, index) => <AnimateTabsContent key={tab.label} value={String(index)}><pre><code data-language={tab.language}>{tab.code}</code></pre><AnimateCopyButton text={tab.code} /></AnimateTabsContent>)}</AnimateTabs>;
}

/** Radix focus lifecycle plus Animate UI zoom continuity. */
export function AnimateImageZoom({ alt, src, children }: { alt: string; src: string; children?: ReactNode }) {
  return <DialogPrimitive.Root><DialogPrimitive.Trigger asChild>{children ?? <button className="rin-animate-image-trigger" type="button"><img alt={alt} src={src} /></button>}</DialogPrimitive.Trigger><DialogPrimitive.Portal><DialogPrimitive.Overlay className="rin-ui-overlay rin-animate-overlay" /><DialogPrimitive.Content aria-label={`${alt} 放大预览`} className="rin-animate-image-dialog"><motion.img alt={alt} layoutId={`image-${src}`} src={src} /><DialogPrimitive.Close asChild><AnimateIconButton className="rin-animate-image-close" icon={<X />} label="关闭图片预览" /></DialogPrimitive.Close></DialogPrimitive.Content></DialogPrimitive.Portal></DialogPrimitive.Root>;
}

export type AnimatePreviewLinkCardProps = {
  description?: string;
  href: string;
  title: string;
  eyebrow?: string;
  meta?: string;
  coverUrl?: string;
  loading?: boolean;
  className?: string;
  style?: CSSProperties;
  onPointerEnter?: PointerEventHandler<HTMLAnchorElement>;
  onPointerLeave?: PointerEventHandler<HTMLAnchorElement>;
};

export function AnimatePreviewLinkCard({
  className = '',
  coverUrl,
  description,
  eyebrow,
  href,
  loading = false,
  meta,
  onPointerEnter,
  onPointerLeave,
  style,
  title,
}: AnimatePreviewLinkCardProps) {
  return (
    <motion.a
      className={`rin-animate-preview-link ${className}`.trim()}
      data-loading={loading || undefined}
      href={href}
      style={style}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      whileHover={{ y: -1 }}
    >
      <span className="rin-animate-preview-link-cover" aria-hidden="true">
        {coverUrl ? <img src={coverUrl} alt="" /> : <i />}
      </span>
      <span className="rin-animate-preview-link-copy">
        {eyebrow ? <small className="rin-animate-preview-link-eyebrow">{eyebrow}</small> : null}
        <strong>{title}</strong>
        {description ? <span>{description}</span> : null}
        {meta ? <small className="rin-animate-preview-link-meta">{meta}</small> : null}
      </span>
      <ArrowRight className="rin-animate-preview-link-arrow" aria-hidden="true" />
    </motion.a>
  );
}

export function AnimateScrollProgress({ label = '阅读进度' }: { label?: string }) {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 180, damping: 32, restDelta: .001 });
  return <motion.div aria-label={label} className="rin-animate-scroll-progress" role="progressbar" style={{ scaleX }} />;
}
