import type { DemoRepositoryStatusEvent } from './types';

export const demoRepositoryStatusEventName = 'rinspace:demo-repository-status';

const noticeText: Partial<Record<DemoRepositoryStatusEvent['kind'], string>> = {
  blocked: 'Demo data upgrade is waiting for another Rinspace tab. Close the other tab, then retry.',
  versionchange: 'Demo data was upgraded in another tab. Reload this tab to continue safely.',
  quota: 'Browser storage is full. Reset demo data or free storage, then retry.',
};

export function announceDemoRepositoryStatus(
  status: DemoRepositoryStatusEvent,
  target: Pick<Window, 'dispatchEvent'> = window,
  documentTarget: Document = document,
): void {
  target.dispatchEvent(new CustomEvent(demoRepositoryStatusEventName, { detail: status }));
  const message = noticeText[status.kind];
  if (!message) return;
  const existing = documentTarget.querySelector<HTMLElement>('[data-rin-demo-repository-status]');
  const notice = existing ?? documentTarget.createElement('div');
  notice.dataset.rinDemoRepositoryStatus = status.kind;
  notice.setAttribute('role', 'alert');
  notice.textContent = message;
  notice.style.cssText = 'position:fixed;inset:auto 16px 16px;z-index:2147483647;padding:12px 16px;border-radius:8px;background:#24262b;color:#fff;font:14px/1.5 system-ui,sans-serif';
  if (!existing) documentTarget.body.append(notice);
}
