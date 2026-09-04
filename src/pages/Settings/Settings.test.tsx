import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers/AppProviders';
import { SiteTopbarHost } from '@/components/SiteTopbarShell';
import { i18n } from '@/i18n';
import type { CurrentUserInfo, UserNotificationConfig } from '@/services/contracts';
import {
  loadCurrentUserInfo,
  loadUserNotificationConfig,
  updateUserInterfaceConfig,
  updateUserNotificationConfig,
} from '@/services/domains/identity';
import { loadCodeRecoveries } from '@/services/recovery';
import SettingsPage from './index';

vi.mock('@/services/domains/identity', () => ({
  loadCurrentUserInfo: vi.fn(),
  loadUserNotificationConfig: vi.fn(),
  updateUserInterfaceConfig: vi.fn(),
  updateUserNotificationConfig: vi.fn(),
}));

vi.mock('@/services/recovery', () => ({
  loadCodeRecoveries: vi.fn(),
  createCodeRecoveryTicket: vi.fn(),
}));

const currentUser: CurrentUserInfo = {
  id: 'user-1',
  created_at: 1,
  last_login_date: 1,
  username: 'rin-user',
  display_name: 'Rin User',
  avatar: { type: 'custom', gravatar: '', custom: '' },
  cover_url: '',
  mobile: '',
  bio: '',
  bio_html: '',
  website: '',
  location: '',
  about_html: '',
  language: 'zh-CN',
  color_scheme: 'system',
  access_token: '',
  role_id: 1,
  role_name: 'member',
  rank: 0,
  status: 'available',
  have_password: false,
  visit_token: '',
  suspended_until: 0,
};

const notifications: UserNotificationConfig = {
  inbox: { key: 'email', enable: false },
  allNewQuestion: { key: 'email', enable: false },
  allNewQuestionForFollowingTags: { key: 'email', enable: false },
};

function renderSettings() {
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={['/settings']}>
        <AppProviders>
          <SiteTopbarHost><SettingsPage /></SiteTopbarHost>
        </AppProviders>
      </MemoryRouter>
    </HelmetProvider>,
  );
}

describe('Settings interface language', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh-CN');
    window.localStorage.clear();
    window.localStorage.setItem(
      'rinspace-language-preference-v1',
      JSON.stringify({ preference: 'zh-CN' }),
    );
    window.localStorage.setItem('rinspace-auth-session', JSON.stringify({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      sub: 'user-1',
    }));
    window.localStorage.setItem('rinspace-topbar-session-cache', JSON.stringify({
      authorizationSource: 'backend-identity-v1',
      user: { id: 'user-1', username: 'rin-user' },
      profile: { nickname: 'Rin User', avatarDataUrl: '' },
      nickname: 'Rin User',
      avatarDataUrl: '',
      publicUserId: 'rin-user',
      isAdmin: false,
      isModerator: false,
      language: 'zh-CN',
      colorScheme: 'system',
      cachedAt: Date.now(),
    }));
    vi.mocked(loadCurrentUserInfo).mockResolvedValue(currentUser);
    vi.mocked(loadUserNotificationConfig).mockResolvedValue(notifications);
    vi.mocked(updateUserNotificationConfig).mockResolvedValue(notifications);
    vi.mocked(updateUserInterfaceConfig).mockResolvedValue({
      language: 'en',
      colorScheme: 'system',
    });
    vi.mocked(loadCodeRecoveries).mockResolvedValue([]);
  });

  it('offers the three approved choices and switches atomically after save', async () => {
    renderSettings();
    const languageSelect = await screen.findByLabelText('语言');
    expect(Array.from((languageSelect as HTMLSelectElement).options, (option) => option.value)).toEqual([
      'system',
      'zh-CN',
      'en',
    ]);

    fireEvent.change(languageSelect, { target: { value: 'en' } });
    fireEvent.click(screen.getByRole('button', { name: '保存偏好' }));

    await waitFor(() => expect(updateUserInterfaceConfig).toHaveBeenCalledWith({
      language: 'en',
      colorScheme: 'system',
    }));
    await screen.findByRole('heading', { name: 'Settings', level: 1 });
    expect(document.documentElement.lang).toBe('en');
    expect(screen.getByLabelText('Language')).toBe(languageSelect);
  });
});
