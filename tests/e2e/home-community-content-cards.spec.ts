import { expect, test } from '@playwright/test';

const publishedAt = '2026-08-19T05:30:00Z';
const contentUpdatedAt = '2026-08-23T12:04:00Z';

const baseItem = {
  status: 'published',
  repositoryStatus: 'published',
  sourceVisibility: 'open',
  author: 'Lunifans',
  authorId: 'lunifans',
  authorUid: 'uid-lunifans',
  authorAvatar: '',
  authorRank: 96,
  meta: '编辑精选',
  tags: ['Hodge 理论'],
  interactions: '4200 阅读 · 8 收藏 · 5 评论',
  heat: '精选',
  readCount: 4200,
  favoriteCount: 8,
  commentCount: 5,
  shareCount: 3,
  publishedAt,
  contentUpdatedAt,
  createdAt: publishedAt,
  updatedAt: contentUpdatedAt,
  reaction_summary: [
    { emoji: 'heart', count: 12, tooltip: '', is_active: true },
    { emoji: 'smile', count: 0, tooltip: '', is_active: false },
    { emoji: 'frown', count: 0, tooltip: '', is_active: false },
  ],
};

const blog = {
  ...baseItem,
  id: '77',
  type: 'blog',
  title: 'Existence and density of Hodge structures',
  excerpt: '这是一篇关于 Hodge 理论的论文阅读笔记。',
};

const dynamic = {
  ...baseItem,
  id: '78',
  type: 'dynamic',
  title: '关于社区卡片的一条动态',
  excerpt: '今天重新整理了社区流的卡片层级。',
};

const discussion = {
  ...baseItem,
  id: '79',
  type: 'discussion',
  title: '如何统一社区卡片的视觉语言',
  excerpt: '讨论深色模式下的信息层级和操作密度。',
  readCount: 860,
  replyCount: 9,
  commentCount: 9,
  favoriteCount: 4,
  lastReplyAt: contentUpdatedAt,
};

const question = {
  ...baseItem,
  id: '80',
  type: 'question',
  title: '深色卡片的对比度应该如何处理？',
  excerpt: '希望卡片背景、正文和次要信息能有稳定的对比。',
  readCount: 640,
  voteScore: 6,
  answerCount: 3,
  favoriteCount: 5,
};

const book = {
  ...baseItem,
  id: '88',
  type: 'book',
  title: '面向物理系的线性代数',
  excerpt: '从物理学问题出发介绍线性代数中的主要概念。',
  readCount: 1900,
  favoriteCount: 18,
  commentCount: 7,
  shareCount: 3,
  book: {
    kind: 'original',
    bookTitle: '面向物理系的线性代数',
    authors: ['Elysium'],
    publisher: '科学出版社',
    numberOfPages: '356',
  },
  bookRating: {
    averageScore: 9.6,
    reviewCount: 28,
    breakdown: [],
  },
};

const pdfBook = {
  ...book,
  id: '89',
  title: '原创 PDF 数学讲义',
  book: {
    ...book.book,
    bookTitle: '原创 PDF 数学讲义',
    pdfUrl: '/fixtures/original-book.pdf',
  },
};

const markdownBook = {
  ...book,
  id: '90',
  title: 'Markdown 代数笔记',
  editor: 'markdown',
  book: {
    ...book.book,
    kind: 'markdown',
    bookTitle: 'Markdown 代数笔记',
  },
};

const publishedBook = {
  ...book,
  id: '91',
  title: '不应出现的出版书籍',
  book: {
    ...book.book,
    kind: 'copyrighted',
    bookTitle: '不应出现的出版书籍',
    pdfUrl: '/fixtures/published-book.pdf',
  },
};

const comments = [
  {
    id: 1,
    targetType: 'post',
    targetId: 77,
    author: 'Lunifans',
    authorId: 'lunifans',
    authorUid: 'uid-lunifans',
    authorAvatar: '',
    authorRank: 40,
    body: '第一条根评论',
    voteCount: 12,
    upVoteCount: 12,
    downVoteCount: 0,
    viewerVoteStatus: 'none',
    createdAt: '2026-08-25T13:32:00Z',
    updatedAt: '2026-08-25T13:32:00Z',
  },
  ...Array.from({ length: 5 }, (_, index) => ({
    id: index + 2,
    targetType: 'post',
    targetId: 77,
    parentId: 1,
    replyToCommentId: 1,
    replyToAuthor: '第一位用户',
    author: `回复用户 ${index + 1}`,
    authorAvatar: '',
    authorRank: 20,
    body: `第 ${index + 1} 条回复`,
    voteCount: index,
    upVoteCount: index,
    downVoteCount: 0,
    viewerVoteStatus: 'none',
    createdAt: `2026-08-25T13:${String(33 + index).padStart(2, '0')}:00Z`,
    updatedAt: `2026-08-25T13:${String(33 + index).padStart(2, '0')}:00Z`,
  })),
];

test.beforeEach(async ({ page }) => {
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname.includes('tcloudbasegateway.com')) {
      await route.fulfill({ status: 401, json: { message: 'anonymous' } });
      return;
    }
    if (!url.pathname.includes('/api/')) {
      await route.continue();
      return;
    }
    if (url.pathname.endsWith('/api/feed')) {
      await route.fulfill({
        json: {
          featuredBlog: blog,
          stream: [blog, dynamic, discussion, question, book, pdfBook, markdownBook, publishedBook],
          questionHotlist: [],
          community: [],
          announcements: [],
          tasks: [],
          followedTags: [],
          generatedAt: contentUpdatedAt,
        },
      });
      return;
    }
    if (url.pathname.endsWith('/api/home/sidebar')) {
      await route.fulfill({
        json: {
          metrics: { todayReads: 0, todayNewFans: 0 },
          hotDiscussions: [],
          recommendedUsers: [],
          source: 'test',
          generatedAt: contentUpdatedAt,
        },
      });
      return;
    }
    if (url.pathname.endsWith('/api/tags/activity')) {
      await route.fulfill({
        json: { items: [book, pdfBook, markdownBook, publishedBook] },
      });
      return;
    }
    if (url.pathname.endsWith('/api/comments')) {
      await route.fulfill({ json: { items: comments } });
      return;
    }
    if (url.pathname.endsWith('/api/books/88/reviews')) {
      await route.fulfill({
        json: {
          items: [{
            id: '9',
            bookId: '88',
            score: 9,
            stars: 4.5,
            body: '适合作为入门材料。',
            author: 'Elysium',
            voteCount: 12,
            voteStatus: 'none',
            createdAt: '2026-08-21T06:26:00Z',
            updatedAt: '2026-08-21T06:26:00Z',
          }],
          rating: { averageScore: 9.6, reviewCount: 28, breakdown: [] },
        },
      });
      return;
    }
    await route.fulfill({ json: {} });
  });
});

test('desktop cards preserve original icon metrics and a centered comment dialog', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('desktop'));
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');
  const blogCard = page.locator('.stream-card-blog').filter({ hasText: blog.title }).first();
  const dynamicCard = page.locator('.stream-card-dynamic').filter({ hasText: dynamic.excerpt }).first();
  const discussionCard = page.locator('.stream-card-discussion').filter({ hasText: discussion.title }).first();
  const questionCard = page.locator('.stream-card-question').filter({ hasText: question.title }).first();
  const bookCard = page.locator('.home-book-card').filter({ hasText: book.title }).first();
  const pdfBookCard = page.locator('.home-book-card').filter({ hasText: pdfBook.title }).first();
  const markdownBookCard = page.locator('.home-book-card').filter({ hasText: markdownBook.title }).first();
  await expect(blogCard.getByText('2026/08/23 20:04')).toBeVisible();
  await expect(blogCard.getByLabel('发布于 2026/08/19 13:30；更新于 2026/08/23 20:04')).toBeVisible();
  const likeButton = blogCard.getByRole('button', { name: '喜欢，12' });
  await expect(likeButton).toBeVisible();
  await expect(likeButton).toHaveAttribute('aria-pressed', 'true');
  await expect(likeButton).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(likeButton.locator('.rin-community-action-icon--heart-fill')).toBeVisible();
  await expect(likeButton.locator('.home-card-action-label')).toHaveCount(0);
  await expect(likeButton.locator('.home-card-action-value')).toHaveText('12');
  await expect(blogCard.getByRole('button', { name: '分享，3' })).toBeVisible();
  await expect(blogCard.getByRole('button', { name: '评论，5' }).locator('.rin-community-action-icon--chat-dots')).toBeVisible();
  await expect(blogCard.getByRole('button', { name: '分享，3' }).locator('.rin-community-action-icon--share')).toBeVisible();
  await expect(blogCard.locator('.home-card-action')).toHaveCount(4);
  await expect(blogCard.locator('.home-card-action').evaluateAll((buttons) =>
    buttons.map((button) => button.getAttribute('aria-label')?.split('，')[0]),
  )).resolves.toEqual(['喜欢', '收藏', '评论', '分享']);
  await expect(blogCard.locator('.home-card-action-label')).toHaveCount(0);
  await expect(dynamicCard.locator('.stream-dynamic-action-buttons')).toHaveCount(0);
  await expect(dynamicCard.locator('.home-card-action')).toHaveCount(4);
  await expect(dynamicCard.locator('.stream-metrics span')).toHaveText(['4,200 阅读']);
  await expect(discussionCard.locator('.stream-metrics span').allTextContents())
    .resolves.not.toContain('9 回复');
  await expect(discussionCard.locator('.stream-metrics span').allTextContents())
    .resolves.not.toContain('4 收藏');
  await expect(discussionCard.locator('.stream-metrics')).toContainText('860 阅读');
  await expect(discussionCard.locator('.stream-metrics')).toContainText('最后回复');
  await expect(questionCard.locator('.stream-metrics')).not.toContainText('5 收藏');
  await expect(questionCard.locator('.stream-metrics')).toContainText('6 赞同');
  await expect(questionCard.locator('.stream-metrics')).toContainText('3 回答');
  if (testInfo.project.name === 'desktop-dark') {
    await expect(dynamicCard).toHaveCSS('background-color', 'rgb(17, 28, 37)');
    await expect(dynamicCard.locator('.stream-dynamic-lead')).toHaveCSS('color', 'rgb(232, 240, 245)');
    await expect(dynamicCard.locator('.home-card-action').first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  }
  await expect(bookCard).toHaveAttribute('data-book-format', 'latex');
  await expect(pdfBookCard).toHaveAttribute('data-book-format', 'pdf');
  await expect(markdownBookCard).toHaveAttribute('data-book-format', 'markdown');
  await expect(page.locator('.home-book-card').filter({ hasText: publishedBook.title })).toHaveCount(0);
  await bookCard.locator('[data-user-identity="lunifans"]').hover();
  await expect(page.getByLabel('Lunifans 的个人资料预览')).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(page.getByLabel('Lunifans 的个人资料预览')).toBeHidden();
  if (testInfo.project.name === 'desktop-light') {
    await testInfo.attach('home-blog-card-desktop', {
      body: await blogCard.screenshot(),
      contentType: 'image/png',
    });
    await testInfo.attach('home-original-book-card-desktop', {
      body: await bookCard.screenshot(),
      contentType: 'image/png',
    });
  }
  if (testInfo.project.name === 'desktop-dark') {
    await testInfo.attach('home-dynamic-card-dark', {
      body: await dynamicCard.screenshot(),
      contentType: 'image/png',
    });
    await testInfo.attach('home-discussion-card-dark', {
      body: await discussionCard.screenshot(),
      contentType: 'image/png',
    });
    await testInfo.attach('home-question-card-dark', {
      body: await questionCard.screenshot(),
      contentType: 'image/png',
    });
  }
  await blogCard.getByRole('button', { name: '评论，5' }).click();
  await expect(page.locator('.home-community-dialog')).toBeVisible();
  await expect(page.getByText('第一条根评论')).toBeVisible();
  await expect(page.getByRole('button', { name: '共 5 条回复，展开' })).toBeVisible();
  await expect(page.getByText('作者', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '登录后评论' })).toBeVisible();
  await expect(page.locator('.home-overlay-composer')).toHaveCount(0);
  if (testInfo.project.name === 'desktop-light') {
    await testInfo.attach('home-comment-dialog-desktop', {
      body: await page.locator('.home-community-dialog').screenshot(),
      contentType: 'image/png',
    });
  }
  expect(pageErrors).toEqual([]);
});

test('mobile uses a bottom sheet and book rating keeps Animate UI actions', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile'));
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');
  const bookCard = page.locator('.home-book-card').filter({ hasText: book.title }).first();
  await expect(bookCard).toHaveAttribute('data-book-format', 'latex');
  await expect(bookCard.getByText('9.6 分', { exact: true })).toBeVisible();
  await expect(bookCard.getByRole('button', { name: '评分，28' })).toBeVisible();
  await expect(bookCard.locator('.home-card-action').evaluateAll((buttons) =>
    buttons.map((button) => button.getAttribute('aria-label')?.split('，')[0]),
  )).resolves.toEqual(['评分', '喜欢', '收藏', '评论', '分享']);
  await expect(bookCard.locator('.home-card-action-label')).toHaveCount(0);
  await expect(bookCard.getByRole('button', { name: '评论，7' }).locator('.rin-community-action-icon--chat-dots')).toBeVisible();
  await expect(bookCard.getByRole('button', { name: '分享，3' }).locator('.rin-community-action-icon--share')).toBeVisible();
  await expect(bookCard.locator('[data-user-identity="lunifans"]')).toBeVisible();
  await expect(bookCard.getByText('科学出版社')).toHaveCount(0);
  await expect(bookCard.getByText('原创书籍', { exact: true })).toHaveCount(0);
  if (testInfo.project.name === 'mobile-light') {
    await testInfo.attach('home-original-book-card-mobile', {
      body: await bookCard.screenshot(),
      contentType: 'image/png',
    });
  }
  await bookCard.getByRole('button', { name: '评分，28' }).click();
  await expect(page.locator('.home-community-sheet')).toBeVisible();
  await expect(page.getByText('评分与书评', { exact: true })).toBeVisible();
  await expect(page.getByText('适合作为入门材料。')).toBeVisible();
  await page.getByRole('button', { name: '关闭' }).click();
  await expect(page.locator('.home-community-sheet')).toHaveCount(0);
  await bookCard.getByRole('button', { name: '评论，7' }).click();
  await expect(page.locator('.home-community-sheet')).toBeVisible();
  await expect(page.getByText('第一条根评论')).toBeVisible();
  await expect(page.getByRole('button', { name: '共 5 条回复，展开' })).toBeVisible();
  await expect(page.getByRole('link', { name: '登录后评论' })).toBeVisible();
  if (testInfo.project.name === 'mobile-light') {
    await testInfo.attach('home-comment-sheet-mobile', {
      body: await page.locator('.home-community-sheet').screenshot(),
      contentType: 'image/png',
    });
  }
  expect(pageErrors).toEqual([]);
});

test('comment overlay fits narrow desktop and compact mobile widths', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light');
  const viewports = [
    { width: 1024, height: 768, overlay: '.home-community-dialog' },
    { width: 390, height: 844, overlay: '.home-community-sheet' },
    { width: 360, height: 800, overlay: '.home-community-sheet' },
  ];

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/');
    const blogCard = page.locator('.stream-card-blog').filter({ hasText: blog.title }).first();
    await expect(blogCard).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    await blogCard.getByRole('button', { name: '评论，5' }).click();
    await expect(page.locator(viewport.overlay)).toBeVisible();
    await expect(page.getByRole('link', { name: '登录后评论' })).toBeVisible();
    await page.getByRole('button', { name: '关闭' }).click();
  }
});

test('all home views keep the three original book formats and exclude published books', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light');
  await page.goto('/');
  await page.getByRole('tab', { name: '标签' }).click();
  await expect(page.getByText('3 条标签动态', { exact: true })).toBeVisible();
  await expect(page.locator('.home-book-card[data-book-format="latex"]')).toHaveCount(1);
  await expect(page.locator('.home-book-card[data-book-format="pdf"]')).toHaveCount(1);
  await expect(page.locator('.home-book-card[data-book-format="markdown"]')).toHaveCount(1);
  await expect(page.locator('.home-book-card').filter({ hasText: publishedBook.title })).toHaveCount(0);
});

test('signed-in card actions keep authoritative counts across success and failure', async ({ page }, testInfo) => {
  test.skip(!['desktop-light', 'desktop-dark', 'mobile-light', 'mobile-dark'].includes(testInfo.project.name));
  const darkTheme = testInfo.project.name.endsWith('-dark');
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  let reaction = { count: 12, isActive: true };
  let favoriteCount = 8;
  let collected = true;
  let shareCount = 3;
  let reviewCount = 28;
  let failReaction = true;
  let failCollection = true;
  let failShare = false;
  let failRating = true;
  let feedRequestCount = 0;

  const currentRating = () => ({
    averageScore: reviewCount === 28 ? 9.6 : 9.8,
    reviewCount,
    breakdown: [],
    ...(reviewCount > 28
      ? {
          myReview: {
            id: 'viewer-review',
            bookId: book.id,
            score: 10,
            stars: 5,
            body: '',
            author: '测试用户',
            voteCount: 0,
            voteStatus: 'none',
            createdAt: contentUpdatedAt,
            updatedAt: contentUpdatedAt,
          },
        }
      : {}),
  });
  const currentBlog = () => ({
    ...blog,
    favoriteCount,
    shareCount,
    reaction_summary: [
      {
        emoji: 'heart',
        count: reaction.count,
        tooltip: '',
        is_active: reaction.isActive,
      },
    ],
  });
  const currentBook = () => ({
    ...book,
    bookRating: currentRating(),
  });

  await page.addInitScript((issuedAt) => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => undefined },
    });
    window.localStorage.setItem('rinspace-auth-session', JSON.stringify({
      access_token: 'home-card-e2e-access-token',
      refresh_token: 'home-card-e2e-refresh-token',
      expires_in: 3600,
      issued_at: issuedAt,
      sub: 'viewer',
    }));
  }, Date.now());

  await page.route(/\.api\.tcloudbasegateway\.com\/auth\/v1\//, async (route) => {
    await route.fulfill({
      json: {
        sub: 'viewer',
        username: 'viewer',
        nickname: '测试用户',
        user_metadata: { username: 'viewer', rank: 30 },
      },
    });
  });

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith('/api/feed')) {
      feedRequestCount += 1;
      await route.fulfill({
        json: {
          featuredBlog: currentBlog(),
          stream: [currentBlog(), currentBook(), pdfBook, markdownBook],
          questionHotlist: [],
          community: [],
          announcements: [],
          tasks: [],
          followedTags: [],
          generatedAt: contentUpdatedAt,
        },
      });
      return;
    }
    if (url.pathname.endsWith('/api/books') && request.method() === 'GET') {
      await route.fulfill({
        json: {
          items: [currentBook(), pdfBook, markdownBook],
          count: 3,
          page: 1,
          pageSize: 24,
          generatedAt: contentUpdatedAt,
        },
      });
      return;
    }
    if (url.pathname.endsWith('/api/personal/collection/page')) {
      await route.fulfill({
        json: {
          items: collected ? [currentBlog()] : [],
          count: collected ? 1 : 0,
          page: 1,
          pageSize: 100,
          generatedAt: contentUpdatedAt,
        },
      });
      return;
    }
    if (url.pathname.endsWith('/api/meta/reaction') && request.method() === 'PUT') {
      if (failReaction) {
        await route.fulfill({ status: 503, json: { message: '喜欢暂时失败。' } });
        return;
      }
      reaction = { count: 11, isActive: false };
      await route.fulfill({
        json: {
          reaction_summary: [
            {
              emoji: 'heart',
              count: reaction.count,
              tooltip: '',
              is_active: reaction.isActive,
            },
          ],
        },
      });
      return;
    }
    if (url.pathname.endsWith('/api/collections') && request.method() === 'POST') {
      if (failCollection) {
        await route.fulfill({ status: 503, json: { message: '收藏暂时失败。' } });
        return;
      }
      favoriteCount = 7;
      collected = false;
      await route.fulfill({
        json: {
          targetType: 'post',
          targetId: blog.id,
          bookmarked: false,
          collectionCount: favoriteCount,
        },
      });
      return;
    }
    if (url.pathname.endsWith('/api/content/share') && request.method() === 'POST') {
      if (failShare) {
        await route.fulfill({ status: 503, json: { message: '分享计数暂时失败。' } });
        return;
      }
      shareCount = 4;
      await route.fulfill({
        json: {
          targetType: 'blog',
          targetId: blog.id,
          shareCount,
        },
      });
      return;
    }
    if (url.pathname.endsWith(`/api/books/${book.id}/reviews`)) {
      if (request.method() === 'POST') {
        if (failRating) {
          await route.fulfill({ status: 503, json: { message: '评分暂时失败。' } });
          return;
        }
        reviewCount = 29;
        await route.fulfill({ json: { rating: currentRating() } });
        return;
      }
      await route.fulfill({
        json: {
          items: [],
          rating: currentRating(),
        },
      });
      return;
    }
    await route.fallback();
  });

  await page.goto('/');
  await expect.poll(() => feedRequestCount).toBeGreaterThan(0);
  const initialFeedRequestCount = feedRequestCount;
  const blogCard = page.locator('.stream-card-blog').filter({ hasText: blog.title }).first();
  const bookCard = page.locator('.home-book-card').filter({ hasText: book.title }).first();
  const likeButton = blogCard.getByRole('button', { name: '喜欢，12' });
  const collectButton = blogCard.getByRole('button', { name: '收藏，8' });
  const shareButton = blogCard.getByRole('button', { name: '分享，3' });

  await expect(likeButton).toHaveAttribute('aria-pressed', 'true');
  await expect(collectButton).toHaveAttribute('aria-pressed', 'true');
  await expect(likeButton).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(likeButton).toHaveCSS('color', darkTheme ? 'rgb(255, 122, 155)' : 'rgb(224, 36, 94)');
  await expect(collectButton).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(collectButton).toHaveCSS('color', darkTheme ? 'rgb(96, 165, 250)' : 'rgb(37, 99, 235)');
  await expect(blogCard.locator('.home-card-action').evaluateAll((buttons) =>
    buttons.every((button) => getComputedStyle(button).backgroundColor === 'rgba(0, 0, 0, 0)'),
  )).resolves.toBe(true);
  await expect(bookCard.locator('.home-card-action').evaluateAll((buttons) =>
    buttons.every((button) => getComputedStyle(button).backgroundColor === 'rgba(0, 0, 0, 0)'),
  )).resolves.toBe(true);
  await expect(bookCard.locator('.home-card-action').evaluateAll((buttons) =>
    buttons.every((button) => getComputedStyle(button).boxShadow === 'none'),
  )).resolves.toBe(true);
  await shareButton.hover();
  await expect(shareButton).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await shareButton.focus();
  await expect(shareButton).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

  const failedReactionResponse = page.waitForResponse((response) =>
    response.url().includes('/api/meta/reaction') && response.request().method() === 'PUT');
  await likeButton.click();
  await failedReactionResponse;
  await expect(likeButton).toBeEnabled();
  await expect(likeButton).toHaveAttribute('aria-pressed', 'true');
  await expect(likeButton).toHaveAccessibleName('喜欢，12');

  failReaction = false;
  await likeButton.scrollIntoViewIfNeeded();
  const likeScrollY = await page.evaluate(() => window.scrollY);
  await likeButton.click();
  await expect(blogCard.getByRole('button', { name: '喜欢，11' })).toHaveAttribute('aria-pressed', 'false');
  await page.waitForTimeout(100);
  expect(feedRequestCount).toBe(initialFeedRequestCount);
  expect(await page.evaluate(() => window.scrollY)).toBe(likeScrollY);

  const failedCollectionResponse = page.waitForResponse((response) =>
    response.url().includes('/api/collections') && response.request().method() === 'POST');
  await collectButton.click();
  await failedCollectionResponse;
  await expect(collectButton).toBeEnabled();
  await expect(collectButton).toHaveAttribute('aria-pressed', 'true');
  await expect(collectButton).toHaveAccessibleName('收藏，8');

  failCollection = false;
  await collectButton.scrollIntoViewIfNeeded();
  const collectionScrollY = await page.evaluate(() => window.scrollY);
  await collectButton.click();
  await expect(blogCard.getByRole('button', { name: '收藏，7' })).toHaveAttribute('aria-pressed', 'false');
  await page.waitForTimeout(100);
  expect(feedRequestCount).toBe(initialFeedRequestCount);
  expect(await page.evaluate(() => window.scrollY)).toBe(collectionScrollY);

  await shareButton.click();
  await expect(blogCard.getByRole('button', { name: '分享，4' })).toBeVisible();
  failShare = true;
  await blogCard.getByRole('button', { name: '分享，4' }).click();
  await expect(blogCard.getByRole('button', { name: '分享，4' })).toBeVisible();

  const ratingButton = bookCard.getByRole('button', { name: '评分，28' });
  await ratingButton.scrollIntoViewIfNeeded();
  const ratingScrollY = await page.evaluate(() => window.scrollY);
  await ratingButton.click();
  const failedRatingResponse = page.waitForResponse((response) =>
    response.url().includes(`/api/books/${book.id}/reviews`) && response.request().method() === 'POST');
  await page.getByRole('button', { name: '提交评价' }).click();
  await failedRatingResponse;
  await expect(page.getByRole('button', { name: '提交评价' })).toBeEnabled();
  await expect(bookCard.locator('.home-card-action[aria-label="评分，28"]')).toHaveCount(1);

  failRating = false;
  await page.getByRole('button', { name: '提交评价' }).click();
  await expect(page.getByText('29 人评价', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭' }).click();
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - ratingScrollY)).toBeLessThanOrEqual(8);
  const ratedButton = bookCard.getByRole('button', { name: '评分，29' });
  await expect(ratedButton).toBeVisible();
  await expect(ratedButton).toHaveClass(/active/);
  await expect(ratedButton).toHaveAttribute('data-tone', 'rating');
  await expect(ratedButton).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(ratedButton).toHaveCSS('color', darkTheme ? 'rgb(241, 199, 91)' : 'rgb(138, 90, 0)');
  await expect(ratedButton.locator('.rin-community-action-icon--star-fill')).toBeVisible();
  await page.waitForTimeout(100);
  expect(feedRequestCount).toBe(initialFeedRequestCount);

  await page.reload();
  const reloadedBookCard = page.locator('.home-book-card').filter({ hasText: book.title }).first();
  await expect(reloadedBookCard.getByRole('button', { name: '评分，29' })
    .locator('.rin-community-action-icon--star-fill')).toBeVisible();

  await page.getByRole('tab', { name: '书库' }).click();
  const libraryBookCard = page.locator('.home-book-card').filter({ hasText: book.title }).first();
  await expect(libraryBookCard.getByRole('button', { name: '评分，29' })
    .locator('.rin-community-action-icon--star-fill')).toBeVisible();
  expect(pageErrors).toEqual([]);
});
