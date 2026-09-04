import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers/AppProviders';
import { createCodeRecoveryTicket, loadCodeRecoveries } from '@/services/recovery';
import CodeRecoveryCenter from './CodeRecoveryCenter';

vi.mock('@/services/recovery', () => ({
  loadCodeRecoveries: vi.fn(),
  createCodeRecoveryTicket: vi.fn(),
}));

describe('CodeRecoveryCenter', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem('rinspace-language-preference-v1', JSON.stringify({ preference: 'zh-CN' }));
    vi.mocked(loadCodeRecoveries).mockResolvedValue([{
      recoveryId: 'AbCdEf0123456789_-ABCDEF.ZyXwVu9876543210_-FEDCBA',
      sessionId: 'AbCdEf0123456789_-ABCDEF',
      generatedAt: '2026-08-28T12:00:00.000Z',
      branch: 'main',
      status: 'recoverable',
      bytes: 1536,
      sha256: 'a'.repeat(64),
    }]);
    vi.mocked(createCodeRecoveryTicket).mockResolvedValue({
      url: '/code/recovery/download?ticket=short-ticket',
      expiresAt: '2026-08-28T12:05:00.000Z',
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('shows owner recovery metadata and downloads only the same-origin short ticket URL', async () => {
    render(<AppProviders><CodeRecoveryCenter /></AppProviders>);
    expect(await screen.findByText('main')).toBeTruthy();
    expect(screen.getByText(/1.5 KiB/)).toBeTruthy();
    expect(await screen.findByText(/含未提交内容/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '下载恢复包' }));
    await waitFor(() => expect(createCodeRecoveryTicket).toHaveBeenCalledWith('AbCdEf0123456789_-ABCDEF.ZyXwVu9876543210_-FEDCBA'));
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
  });

  it('reports an empty recovery center without offering a download', async () => {
    vi.mocked(loadCodeRecoveries).mockResolvedValue([]);
    render(<AppProviders><CodeRecoveryCenter /></AppProviders>);
    expect(await screen.findByText('当前没有可下载的编辑器恢复包。')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '下载恢复包' })).toBeNull();
  });

  it('rejects an external download URL returned by a compromised upstream', async () => {
    vi.mocked(createCodeRecoveryTicket).mockResolvedValue({
      url: 'https://example.invalid/recovery?ticket=stolen',
      expiresAt: '2026-08-28T12:05:00.000Z',
    });
    render(<AppProviders><CodeRecoveryCenter /></AppProviders>);
    fireEvent.click(await screen.findByRole('button', { name: '下载恢复包' }));
    expect((await screen.findByRole('alert')).textContent).toBe('恢复包下载链接生成失败。');
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });
});
