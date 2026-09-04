import type { ReactNode } from 'react';
import type { LayoutKind } from 'app/routing/routeManifest';
import { useTranslation } from 'react-i18next';

function Frame({ children, kind, family, frozen }: { children: ReactNode; kind: string; family?: string; frozen?: boolean }) {
  const { t } = useTranslation('common');
  return <div className="rin-app-frame" data-layout={kind} data-page-family={family} data-rin-ui-boundary={frozen ? 'frozen' : undefined}><a className="rin-skip-link" href="#rin-main-content">{t('accessibility.skipToMain')}</a><div id="rin-main-content" tabIndex={-1}>{children}</div></div>;
}
type LayoutProps = { children: ReactNode; family?: string };
export function PublicLayout({ children, family }: LayoutProps) { return <Frame kind="public" family={family}>{children}</Frame>; }
export function ReaderLayout({ children, family }: LayoutProps) { return <Frame kind="reader" family={family}>{children}</Frame>; }
export function WorkspaceLayout({ children, family }: LayoutProps) { return <Frame kind="workspace" family={family}>{children}</Frame>; }
export function AdminLayout({ children, family }: LayoutProps) { return <Frame kind="admin" family={family}>{children}</Frame>; }
export function FrozenIntegrationLayout({ children, family }: LayoutProps) { return <Frame kind="frozen" family={family} frozen>{children}</Frame>; }

const layouts = { PublicLayout, ReaderLayout, WorkspaceLayout, AdminLayout, FrozenIntegrationLayout };
export function RouteLayout({ kind, family, children }: { kind: LayoutKind; family?: string; children: ReactNode }) { const Layout = layouts[kind]; return <Layout family={family}>{children}</Layout>; }
