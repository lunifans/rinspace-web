import { expect, test } from '@playwright/test';

const currentUser = {
  id: 'profile-browser-viewer',
  created_at: Date.parse('2026-01-01T00:00:00Z') / 1000,
  last_login_date: Date.parse('2026-08-28T00:00:00Z') / 1000,
  username: 'profile-browser-viewer',
  display_name: 'Browser Viewer',
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
  access_token: 'profile-browser-token',
  role_id: 1,
  role_name: 'member',
  rank: 18,
  status: 'available',
  have_password: false,
  visit_token: '',
  suspended_until: 0,
};

const profileUser = {
  id: 'profile-browser-author',
  created_at: Date.parse('2025-01-01T00:00:00Z') / 1000,
  last_login_date: Date.parse('2026-08-27T00:00:00Z') / 1000,
  username: 'profile-author',
  follow_count: 8,
  following_count: 5,
  answer_count: 0,
  question_count: 0,
  rank: 125,
  display_name: '作者保留姓名',
  avatar: '',
  cover_url: '',
  mobile: '',
  bio: '作者保留简介',
  bio_html: '',
  website: '',
  location: '',
  about_html: '',
  status: 'available',
  suspended_until: 0,
  is_follower: false,
};

const authoredBlog = {
  id: 'profile-browser-blog',
  type: 'blog',
  title: '作者保留博客标题',
  author: '作者保留姓名',
  authorId: 'profile-author',
  createdAt: '2026-08-28T08:00:00Z',
  meta: '不应显示的服务端中文元数据',
  excerpt: '作者保留摘要',
  interactions: '不应显示的服务端中文交互',
  heat: '',
  readCount: 1234,
  likeCount: 2,
  favoriteCount: 1,
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }));
    localStorage.setItem('rinspace-auth-session', JSON.stringify({
      access_token: `e30.${payload}.signature`,
      refresh_token: 'profile-browser-refresh',
      expires_in: 3600,
      issued_at: Date.now(),
      sub: 'profile-browser-viewer',
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
      sub: 'profile-browser-viewer',
      username: 'profile-browser-viewer',
      nickname: 'Browser Viewer',
      user_metadata: { username: 'profile-browser-viewer', rank: 18 },
    },
  }));
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname.replace(/^\/rinspace(?=\/)/, '');
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
    if (pathname === '/api/personal/user/info') {
      await route.fulfill({ json: profileUser });
      return;
    }
    if (pathname === '/api/personal/qa/top') {
      await route.fulfill({ json: { answer: [], question: [] } });
      return;
    }
    if (
      pathname === '/api/personal/question/page'
      || pathname === '/api/personal/answer/page'
      || pathname === '/api/personal/comment/page'
      || pathname === '/api/badge/user/awards'
    ) {
      await route.fulfill({ json: { count: 0, items: [] } });
      return;
    }
    if (pathname === '/api/personal/collection/page') {
      await route.fulfill({
        json: { count: 0, page: 1, pageSize: 6, generatedAt: '2026-08-28T09:00:00Z', items: [] },
      });
      return;
    }
    if (pathname === '/api/content') {
      const items = url.searchParams.get('type') === 'blog' ? [authoredBlog] : [];
      await route.fulfill({
        json: { count: items.length, page: 1, pageSize: 50, generatedAt: '2026-08-28T09:00:00Z', items },
      });
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
    await route.fulfill({ status: 404, json: { message: 'not mocked' } });
  });
});

test('production Profile localizes structured metadata and preserves authored content without overflow', async ({ page }, testInfo) => {
  test.skip(
    !['desktop-light', 'desktop-dark', 'mobile-light', 'mobile-dark'].includes(testInfo.project.name),
    'The Profile localization matrix covers desktop and mobile in both themes.',
  );

  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  if (testInfo.project.name.startsWith('desktop-')) {
    await page.setViewportSize({ width: 1440, height: 900 });
  }

  await page.goto('/users/profile-author?tab=overview', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('tab', { name: /Overview/ })).toHaveAttribute('aria-selected', 'true', {
    timeout: 20_000,
  });
  await expect(page.getByRole('link', { name: /作者保留博客标题/ })).toBeVisible();
  await expect(page.getByText('作者保留简介')).toBeVisible();
  await expect(page.getByText('1,234 reads · 2 likes · 1 bookmark')).toBeVisible();
  await expect(page.getByText('不应显示的服务端中文元数据')).toHaveCount(0);
  await expect(page.getByText('不应显示的服务端中文交互')).toHaveCount(0);
  await expect(page).toHaveTitle('作者保留姓名 · Rinspace');
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

  await expect(page.getByRole('tab', { name: /综合/ })).toHaveAttribute('aria-selected', 'true', {
    timeout: 20_000,
  });
  await expect(page.getByRole('link', { name: /作者保留博客标题/ })).toBeVisible();
  await expect(page.getByText('作者保留简介')).toBeVisible();
  await expect(page.getByText('1,234 次阅读 · 2 个喜欢 · 1 次收藏')).toBeVisible();
  await expect(page.getByText('不应显示的服务端中文元数据')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    ),
  ).toBe(false);
  expect(browserErrors).toEqual([]);
});
