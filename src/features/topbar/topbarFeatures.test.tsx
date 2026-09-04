import { AnimateButton } from 'components/ui';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { i18n } from '@/i18n';

import { BrandNavigation, DiscoverySearch, NotificationNavigation, PublishingActions, SessionMenu } from './index';

describe('topbar feature boundaries', () => {
  it('localizes the brand while keeping its home destination and search contract', async () => {
    await i18n.changeLanguage('zh-CN');
    const { container } = render(<MemoryRouter><BrandNavigation /><DiscoverySearch aria-label="发现"><input aria-label="查询" /></DiscoverySearch></MemoryRouter>);
    expect(screen.getByRole('link', { name: '芥子环首页' }).getAttribute('href')).toBe('/');
    expect(container.querySelector('.brand-word')?.textContent).toBe('芥子环');
    expect(container.querySelectorAll('.brand-word-motion > span > span')).toHaveLength(3);
    expect(container.querySelector<HTMLImageElement>('.brand-mark img')).toBeNull();
    expect(container.querySelector('.brand-mark')?.textContent).toBe('芥');
    expect(
      Array.from(container.querySelectorAll<HTMLElement>('.brand-word-motion > span > span'))
        .every((letter) => (
          letter.style.transform === '' &&
          letter.style.clipPath === ''
        )),
    ).toBe(true);
    expect(i18n.t('routes.home', { ns: 'common' })).toBe('以 Tag 为核心的长文社区');
    expect(screen.getByRole('search', { name: '发现' })).toBeTruthy();

    await act(async () => i18n.changeLanguage('en'));
    expect(screen.getByRole('link', { name: 'Rinspace home' }).getAttribute('href')).toBe('/');
    expect(container.querySelector('.brand-word')?.textContent).toBe('Rinspace');
    expect(i18n.t('routes.home', { ns: 'common' })).toBe('A long-form community organized by tags');

    await act(async () => i18n.changeLanguage('zh-CN'));
  });
  it('retains independent publishing, notification and session regions', () => {
    const { container } = render(<><PublishingActions><AnimateButton unstyled>发布</AnimateButton></PublishingActions><NotificationNavigation><a href="/notifications">通知</a></NotificationNavigation><SessionMenu><AnimateButton unstyled>账户</AnimateButton></SessionMenu></>);
    expect(container.querySelector('.publish-menu')).toBeTruthy();
    expect(screen.getByRole('link', { name: '通知' }).getAttribute('href')).toBe('/notifications');
    expect(container.querySelector('.account-menu')).toBeTruthy();
  });
});
