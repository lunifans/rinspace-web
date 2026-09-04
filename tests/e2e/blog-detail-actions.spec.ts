import { expect, test } from '@playwright/test';

const now = new Date().toISOString();

const blogFixture = {
  id: '101',
  slug: 'contextual-preview',
  type: 'blog',
  title: '博客详情操作验收',
  author: 'Lunifans',
  authorId: 'lunifans',
  authorUid: 'user-42',
  authorAvatar: '/avatar.jpg',
  authorRank: 1403,
  meta: '浏览器验收',
  excerpt: '用于验证博客详情页操作。',
  interactions: '20 阅读 · 7 收藏',
  heat: '20',
  tags: [],
  images: [],
  coverUrl: '',
  editor: 'rin',
  body: '[[RIN_WRITER]]<p>博客正文。</p>[[/RIN_WRITER]]',
  readCount: 20,
  favoriteCount: 7,
  collected: false,
  liked: true,
  likeCount: 12,
  createdAt: now,
  updatedAt: now,
};

const profileFixture = {
  id: 'user-42',
  created_at: 1,
  last_login_date: 1,
  username: 'lunifans',
  follow_count: 13,
  following_count: 14,
  answer_count: 2,
  question_count: 3,
  rank: 1403,
  display_name: 'Lunifans',
  avatar: '/avatar.jpg',
  cover_url: '/cover.jpg',
  mobile: '',
  bio: '最高权限管理员。',
  bio_html: '',
  website: 'lunifans.com',
  location: '代数几何',
  about_html: '',
  status: 'active',
  suspended_until: 0,
  is_follower: false,
};

const bookFixture = {
  ...blogFixture,
  id: '202',
  slug: 'book-actions',
  type: 'book',
  title: '书籍详情操作验收',
  excerpt: '用于验证书籍详情页喜欢和收藏数量。',
  interactions: '30 阅读 · 9 收藏',
  body: '[[RIN_WRITER]]<p>书籍简介。</p>[[/RIN_WRITER]]',
  readCount: 30,
  favoriteCount: 9,
  collected: false,
  liked: false,
  likeCount: 6,
};

test('blog detail uses Heart while preserving collection counts and report', async ({ page }) => {
  await page.addInitScript(() => {
    const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }));
    localStorage.setItem('rinspace-auth-session', JSON.stringify({
      access_token: `e30.${payload}.signature`,
      refresh_token: 'refresh',
      expires_in: 3600,
      sub: 'reader-7',
      issued_at: Date.now(),
    }));
  });
  await page.route('**/auth/v1/user/me', (route) => route.fulfill({
    json: { sub: 'reader-7', username: 'reader' },
  }));
  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname.replace(/^\/rinspace(?=\/)/, '');
    if (pathname === '/api/content/101') {
      await route.fulfill({ json: blogFixture });
      return;
    }
    if (pathname === '/api/comments') {
      await route.fulfill({ json: { items: [] } });
      return;
    }
    if (pathname === '/api/personal/user/info') {
      await route.fulfill({ json: profileFixture });
      return;
    }
    await route.fulfill({ json: {} });
  });

  await page.goto('/a/101/contextual-preview', { waitUntil: 'domcontentloaded' });

  const articleActions = page.locator('.blog-like-section:not(.side)');
  const sideActions = page.locator('.blog-like-section.side');
  await expect(articleActions).toBeVisible({ timeout: 20_000 });
  const articleHeart = articleActions.getByRole('button', { name: /已喜欢，12 次/ });
  await expect(articleHeart).toContainText('12');
  await expect(articleHeart.locator('.rin-icon--heart-fill')).toHaveAttribute('fill', 'currentColor');
  await expect(articleActions.getByRole('button', { name: /收藏，7 次/ })).toContainText('7');
  await expect(articleActions.getByRole('button', { name: /收藏，7 次/ })).toContainText('收藏');

  const compactCollection = sideActions.getByRole('button', { name: /收藏，7 次/ });
  await expect(sideActions.getByRole('button', { name: /已喜欢，12 次/ })).toHaveText('12');
  await expect(compactCollection).toHaveText('7');
  await expect(sideActions.getByRole('button', { name: '举报文章' })).toBeVisible();
  await expect(page.locator('.blog-side-author')).not.toContainText('查看作者主页');

  await sideActions.getByRole('button', { name: '举报文章' }).click();
  await expect(page.getByRole('dialog', { name: '举报' })).toBeVisible();
});

test('book detail places public Heart and collection counts together', async ({ page }) => {
  let likePayload: Record<string, unknown> | null = null;
  await page.addInitScript(() => {
    const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }));
    localStorage.setItem('rinspace-auth-session', JSON.stringify({
      access_token: `e30.${payload}.signature`,
      refresh_token: 'refresh',
      expires_in: 3600,
      sub: 'reader-7',
      issued_at: Date.now(),
    }));
  });
  await page.route('**/auth/v1/user/me', (route) => route.fulfill({
    json: { sub: 'reader-7', username: 'reader' },
  }));
  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname.replace(/^\/rinspace(?=\/)/, '');
    if (route.request().method() === 'POST' && pathname === '/api/like') {
      likePayload = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        json: {
          targetType: 'book',
          targetId: '202',
          liked: true,
          likeCount: 7,
        },
      });
      return;
    }
    if (pathname === '/api/content/202') {
      await route.fulfill({ json: bookFixture });
      return;
    }
    if (pathname === '/api/comments') {
      await route.fulfill({ json: { items: [] } });
      return;
    }
    if (pathname === '/api/personal/user/info') {
      await route.fulfill({ json: profileFixture });
      return;
    }
    await route.fulfill({ json: {} });
  });

  await page.goto('/books/202/book-actions', { waitUntil: 'domcontentloaded' });

  const actions = page.locator('.book-detail-header .blog-header-actions');
  await expect(actions).toBeVisible({ timeout: 20_000 });
  const heart = actions.getByRole('button', { name: /喜欢，6 次/ });
  const collection = actions.getByRole('button', { name: /收藏，9 次/ });
  await expect(heart).toContainText('6');
  await expect(heart.locator('.rin-icon--heart')).toBeVisible();
  await expect(collection).toContainText('9');
  await expect(collection).toContainText('收藏');
  const heartBeforeCollection = await heart.evaluate((element) => {
    const collectionElement = element.parentElement?.querySelector(
      'button[aria-label*="收藏"]',
    );
    return Boolean(
      collectionElement &&
      (element.compareDocumentPosition(collectionElement) & Node.DOCUMENT_POSITION_FOLLOWING),
    );
  });
  expect(heartBeforeCollection).toBe(true);
  await heart.click();
  const activeHeart = actions.getByRole('button', { name: /已喜欢，7 次/ });
  await expect(activeHeart).toContainText('7');
  await expect(activeHeart.locator('.rin-icon--heart-fill')).toHaveAttribute('fill', 'currentColor');
  expect(likePayload).toMatchObject({
    targetType: 'post',
    slug: 'book-actions',
    bookmark: true,
    isCancel: false,
  });
});
