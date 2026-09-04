import { expect, test } from '@playwright/test';

const currentUser = {
  id: 'identity-browser-1',
  created_at: Date.parse('2026-01-01T00:00:00Z') / 1000,
  last_login_date: Date.parse('2026-08-28T00:00:00Z') / 1000,
  username: 'identity-browser',
  display_name: '作者保留姓名',
  avatar: { type: 'custom', gravatar: '', custom: '' },
  cover_url: '',
  mobile: '',
  bio: '',
  bio_html: '',
  website: '',
  location: '',
  about_html: '',
  language: 'en',
  color_scheme: 'light',
  access_token: 'identity-browser-token',
  role_id: 1,
  role_name: 'member',
  rank: 125,
  status: 'available',
  have_password: false,
  visit_token: '',
  suspended_until: 0,
};

const reportNotification = {
  id: 'notification-report-1',
  object_info: {
    title: '作者保留举报对象',
    object_id: 'comment-1',
    object_map: { comment: 'comment-1' },
    object_type: 'comment',
  },
  rank: 0,
  notification_action: 'report_resolved',
  is_read: true,
  update_time: Date.parse('2026-08-28T08:00:00Z') / 1000,
  type: 'report',
  target_type: 'comment',
  target_id: 'comment-1',
  message: '不应显示的服务端中文消息',
  report_result: {
    outcome: 'action_taken',
    reportId: '73',
    targetType: 'comment',
    targetSummary: '作者保留举报对象',
    targetAvailable: false,
  },
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }));
    localStorage.setItem('rinspace-auth-session', JSON.stringify({
      access_token: `e30.${payload}.signature`,
      refresh_token: 'identity-browser-refresh',
      expires_in: 3600,
      issued_at: Date.now(),
      sub: 'identity-browser-1',
    }));
    if (!localStorage.getItem('rinspace-language-preference-v1')) {
      localStorage.setItem(
        'rinspace-language-preference-v1',
        JSON.stringify({ preference: 'en' }),
      );
    }
  });

  await page.route('**/auth/v1/user/me*', (route) => route.fulfill({
    json: {
      sub: 'identity-browser-1',
      username: 'identity-browser',
      nickname: '作者保留姓名',
      user_metadata: { username: 'identity-browser', rank: 125 },
    },
  }));
  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname.replace(/^\/rinspace(?=\/)/, '');
    if (pathname === '/api/user/info') {
      const preference = await page.evaluate(() => {
        const raw = localStorage.getItem('rinspace-language-preference-v1');
        if (!raw) return 'en';
        const parsed = JSON.parse(raw) as { preference?: string };
        return parsed.preference === 'zh-CN' ? 'zh-CN' : 'en';
      });
      await route.fulfill({ json: { ...currentUser, language: preference } });
      return;
    }
    if (pathname === '/api/notifications') {
      await route.fulfill({ json: { items: [] } });
      return;
    }
    if (pathname === '/api/profile' || pathname === '/api/gitea/sso') {
      await route.fulfill({ status: 204 });
      return;
    }
    if (pathname === '/api/notification/page') {
      await route.fulfill({
        json: {
          count: 1,
          page: 1,
          page_size: 12,
          items: [reportNotification],
        },
      });
      return;
    }
    if (pathname === '/api/notification/status') {
      await route.fulfill({
        json: { inbox: 0, achievement: 0, revision: 0, can_revision: false },
      });
      return;
    }
    await route.fulfill({ status: 404, json: { message: 'not mocked' } });
  });
});

test('production notifications localize structured report outcomes without overflow', async ({ page }, testInfo) => {
  test.skip(
    !['desktop-light', 'desktop-dark', 'mobile-light', 'mobile-dark'].includes(testInfo.project.name),
    'The identity localization matrix covers desktop and mobile in both themes.',
  );

  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  if (testInfo.project.name.startsWith('desktop-')) {
    await page.setViewportSize({ width: 1440, height: 900 });
  }

  await page.goto('/notifications', { waitUntil: 'domcontentloaded' });

  await expect(page.getByText('The content you reported has been handled.')).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByRole('link', { name: '作者保留举报对象' })).toBeVisible();
  await expect(page.getByText('不应显示的服务端中文消息')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    ),
  ).toBe(false);

  await page.evaluate(() => {
    localStorage.setItem(
      'rinspace-language-preference-v1',
      JSON.stringify({ preference: 'zh-CN' }),
    );
  });
  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page.getByText('你举报的内容已处理。')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('link', { name: '作者保留举报对象' })).toBeVisible();
  await expect(page.getByText('不应显示的服务端中文消息')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    ),
  ).toBe(false);
  expect(browserErrors).toEqual([]);
});
