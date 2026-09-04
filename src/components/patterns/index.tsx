import type { HTMLAttributes, ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';

import { Button, Dialog, DialogContent, Notice, Skeleton } from 'components/ui';
import { cn } from 'components/ui/cn';

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return <header className="rin-page-header">{eyebrow ? <div className="rin-eyebrow">{eyebrow}</div> : null}<div className="rin-header-row"><div><h1>{title}</h1>{description ? <p>{description}</p> : null}</div>{actions ? <div className="rin-action-cluster">{actions}</div> : null}</div></header>;
}

export function SectionHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return <header className="rin-section-header"><div><h2>{title}</h2>{description ? <p>{description}</p> : null}</div>{actions ? <div className="rin-action-cluster">{actions}</div> : null}</header>;
}

export function ResultRow({ title, href, summary, metadata, leading, trailing }: { title: ReactNode; href: string; summary?: ReactNode; metadata?: ReactNode; leading?: ReactNode; trailing?: ReactNode }) {
  return <motion.article className="rin-result-row" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .18 }}>{leading}<div className="rin-result-body"><a href={href} className="rin-result-title">{title}</a>{summary ? <p>{summary}</p> : null}{metadata ? <Metadata>{metadata}</Metadata> : null}</div>{trailing}</motion.article>;
}

export function PublicationCard({ title, href, kind, summary, metadata, actions }: { title: ReactNode; href: string; kind?: ReactNode; summary?: ReactNode; metadata?: ReactNode; actions?: ReactNode }) {
  return <motion.article className="rin-publication-card" layout transition={{ duration: .18 }}>{kind ? <div className="rin-eyebrow">{kind}</div> : null}<h3><a href={href}>{title}</a></h3>{summary ? <p>{summary}</p> : null}{metadata ? <Metadata>{metadata}</Metadata> : null}{actions ? <ActionCluster>{actions}</ActionCluster> : null}</motion.article>;
}

export function IdentityStrip({ avatar, name, detail, actions }: { avatar?: ReactNode; name: ReactNode; detail?: ReactNode; actions?: ReactNode }) {
  return <motion.div className="rin-identity-strip" layout>{avatar}<div><strong>{name}</strong>{detail ? <div className="rin-ui-help">{detail}</div> : null}</div>{actions ? <ActionCluster>{actions}</ActionCluster> : null}</motion.div>;
}

export function FilterBar({ children, label }: { children: ReactNode; label?: string }) {
  const { t } = useTranslation('common');
  return <section className="rin-filter-bar" aria-label={label || t('states.filter')}>{children}</section>;
}
export function Metadata({ children }: { children: ReactNode }) { return <div className="rin-metadata">{children}</div>; }
export function ActionCluster({ children }: { children: ReactNode }) { return <div className="rin-action-cluster">{children}</div>; }

export function AsyncState({ state, title, children, retry }: { state: 'loading' | 'empty' | 'error' | 'ready'; title?: string; children?: ReactNode; retry?: () => void }) {
  const { t } = useTranslation('common');
  const content = state === 'loading' ? <div role="status" aria-label={title || t('states.loading')}><Skeleton className="rin-state-skeleton" /></div> : state === 'empty' ? <Notice title={title || t('states.emptyTitle')}>{children || t('states.emptyDescription')}</Notice> : state === 'error' ? <Notice tone="destructive" title={title || t('states.loadFailed')}>{children || t('states.tryAgain')}{retry ? <div><Button onClick={retry}>{t('actions.retry')}</Button></div> : null}</Notice> : <>{children}</>;
  return <AnimatePresence mode="wait"><motion.div key={state} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -2 }} transition={{ duration: .16 }}>{content}</motion.div></AnimatePresence>;
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, destructive, pending, onConfirm }: { open: boolean; onOpenChange(open: boolean): void; title: ReactNode; description?: ReactNode; confirmLabel?: string; destructive?: boolean; pending?: boolean; onConfirm(): void }) {
  const { t } = useTranslation('common');
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent title={title} description={description}><ActionCluster><Button onClick={() => onOpenChange(false)}>{t('actions.cancel')}</Button><Button variant={destructive ? 'destructive' : 'primary'} pending={pending} onClick={onConfirm}>{confirmLabel || t('actions.confirm')}</Button></ActionCluster></DialogContent></Dialog>;
}

export function ResponsiveRail({ main, rail, className, ...props }: { main: ReactNode; rail: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn('rin-page-grid rin-responsive-rail', className)} data-rails="context"><main>{main}</main><aside>{rail}</aside></div>;
}
