import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import process from 'node:process';

import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { chromium, firefox, webkit } from 'playwright';

const requestedURL = process.env.RINSPACE_PREVIEW_URL;
const previewURL = new URL(requestedURL || 'http://127.0.0.1:4197/rinspace-demo/');
const basePath = previewURL.pathname === '/' ? '/' : `${previewURL.pathname.replace(/\/+$/, '')}/`;
const appURL = new URL(basePath, previewURL.origin).toString();
const browserCatalog = { chromium, firefox, webkit };
const browserEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !['LOGNAME', 'USER', 'XDG_RUNTIME_DIR'].includes(key)),
);
const selectedNames = process.env.RINSPACE_DEMO_DISCOVERY_BROWSERS
  ? process.env.RINSPACE_DEMO_DISCOVERY_BROWSERS.split(',').map((value) => value.trim()).filter(Boolean)
  : Object.keys(browserCatalog);

for (const name of selectedNames) {
  if (!(name in browserCatalog)) throw new Error(`Unknown browser: ${name}`);
}

async function waitForServer(url) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The source server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function withSourceServer(operation) {
  if (requestedURL) return operation();
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(previewURL.port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      RINSPACE_RUNTIME_CONFIG_FILE: basePath === '/' ? 'runtime.demo.json' : 'runtime.demo.subpath.json',
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  try {
    await waitForServer(appURL);
    return await operation();
  } finally {
    server.kill('SIGTERM');
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 2_000);
      server.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
}

async function gotoStable(page, relativePath) {
  await page.goto(new URL(relativePath, appURL).toString(), { waitUntil: 'domcontentloaded' });
  await page.locator('header.topbar').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('main').first().waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(900);
}

async function navigateInApp(page, relativePath) {
  const target = new URL(relativePath, appURL).toString();
  await page.evaluate((url) => {
    window.history.pushState({ demoDiscovery: true }, '', url);
    window.dispatchEvent(new PopStateEvent('popstate', { state: { demoDiscovery: true } }));
  }, target);
}

async function assertAccessible(page, include = 'main') {
  const report = await new AxeBuilder({ page })
    .include(include)
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  assert.deepEqual(
    report.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.map((node) => node.target),
    })),
    [],
  );
}

async function validateBrowser(browserName) {
  const browserType = browserCatalog[browserName];
  const browser = await browserType.launch({
    headless: true,
    args: browserName === 'chromium' ? ['--no-sandbox'] : [],
    env: browserEnvironment,
  });
  try {
    const context = await browser.newContext({
      locale: 'zh-CN',
      reducedMotion: 'reduce',
      viewport: { width: 1280, height: 800 },
    });
    await context.addInitScript(() => {
      localStorage.setItem('rinspace-language-preference-v1', JSON.stringify({ preference: 'zh-CN' }));
    });
    const page = await context.newPage();
    const browserRequests = [];
    const runtimeErrors = [];
    page.on('request', (request) => browserRequests.push(request.url()));
    page.on('pageerror', (error) => runtimeErrors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`);
    });

    await gotoStable(page, '?demoPersona=member');
    await expect(page.locator('header.topbar')).toHaveAttribute('data-demo-persona', 'member');
    await expect(page.getByText('把局部误差折成一张可读的地图', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('为什么迭代器的边界条件总在最后一个样例才暴露？', { exact: true }).first()).toBeVisible();
    const brokenMediaCard = page.locator('article').filter({ hasText: '窄屏边界实验' }).first();
    await brokenMediaCard.scrollIntoViewIfNeeded();
    await expect(brokenMediaCard.locator('[data-content-media-state="broken"]')).toHaveAttribute('aria-label', '媒体加载失败');
    const pagination = await page.evaluate(async (apiBase) => {
      const first = await fetch(`${apiBase}content?type=blog&page=1&size=1`).then((response) => response.json());
      const second = await fetch(`${apiBase}content?type=blog&page=2&size=1`).then((response) => response.json());
      return { first, second };
    }, `${appURL}api/`);
    assert.equal(pagination.first.count, 3);
    assert.equal(pagination.first.items.length, 1);
    assert.equal(pagination.second.page, 2);
    assert.notEqual(pagination.first.items[0].id, pagination.second.items[0].id);
    await assertAccessible(page);

    await gotoStable(page, 'search?q=%E5%8F%AF%E5%A4%8D%E7%8E%B0%E6%80%A7');
    await expect(page.locator('.search-result-card')).toHaveCount(6);
    await navigateInApp(page, 'search?q=definitely-no-demo-result');
    await expect(page.locator('.state-strip')).toContainText('无结果');

    await gotoStable(page, 'tags');
    await expect(page.getByRole('heading', { name: '知识目录' })).toBeVisible();
    await expect(page.locator('.tag-directory-card')).toHaveCount(6);

    await gotoStable(page, 'users');
    await expect(page.getByText('轨道读者', { exact: true }).first()).toBeVisible();

    await gotoStable(page, 'questions/1030');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('为什么迭代器的边界条件');
    await expect(page.locator('.answer-card')).toHaveCount(1);
    await page.waitForTimeout(1_200);

    await gotoStable(page, 'books');
    await expect(page.getByText('从纸带到星图：可复现实验笔记', { exact: true }).first()).toBeVisible();
    await gotoStable(page, 'books/1040/read/paper-to-orbit');
    await expect(page.locator('.book-reader-article')).toContainText('把状态写成向量');
    await expect(page.locator('.book-reader-toc')).toContainText('误差不会自动解释自己');

    await gotoStable(page, 'blog/1010');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('把局部误差折成一张可读的地图');
    await expect(page.locator('code').filter({ hasText: 'const observation' }).first()).toBeVisible();
    await expect(page.getByRole('region', { name: '可横向滚动的公式' })).toBeVisible();
    const like = page.locator('button.repository-like-action').first();
    if (await like.getAttribute('aria-pressed') !== 'true') await like.click();
    await expect(like).toHaveAttribute('aria-pressed', 'true');
    await expect(like).toContainText('2');

    const collection = page.locator('button').filter({ hasText: /收藏/ }).first();
    if (await collection.getAttribute('aria-pressed') !== 'true') {
      await collection.click();
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog.getByText('默认收藏夹', { exact: true }).first()).toBeVisible();
      await dialog.getByRole('button', { name: '确认收藏' }).click();
    }
    await expect(collection).toHaveAttribute('aria-pressed', 'true');

    const commentText = `Task 17 ${browserName} 本地评论`;
    const commentEditor = page.locator('.inline-comment-form [role="textbox"]');
    await commentEditor.fill(commentText);
    await page.locator('.inline-comment-form button[type="submit"]').click();
    await expect(page.getByText(commentText, { exact: true })).toBeVisible();
    await page.waitForTimeout(1_200);
    await page.goto(page.url(), { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('把局部误差折成一张可读的地图', { timeout: 15_000 });
    await expect(page.locator('button.repository-like-action').first()).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('button').filter({ hasText: /收藏/ }).first()).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText(commentText, { exact: true })).toBeVisible();
    await assertAccessible(page);

    await gotoStable(page, 'tags');
    const followedTag = page.locator('.tag-directory-card').filter({ hasText: '可复现性' }).first();
    const followButton = followedTag.getByRole('button', { name: '关注' });
    await followButton.click();
    await expect(followedTag.getByRole('button', { name: '取消关注' })).toBeVisible();
    await page.waitForTimeout(500);
    await page.goto(page.url(), { waitUntil: 'domcontentloaded' });
    const persistedTag = page.locator('.tag-directory-card').filter({ hasText: '可复现性' }).first();
    await expect(persistedTag.getByRole('button', { name: '取消关注' })).toBeVisible({ timeout: 15_000 });
    assert.deepEqual(runtimeErrors, []);
    runtimeErrors.length = 0;

    await page.evaluate(() => localStorage.setItem('rinspace.demo.scenario.v1', 'latency'));
    await navigateInApp(page, 'search?q=reproducibility');
    await expect(page.locator('.loading-state-panel')).toBeVisible();
    await expect(page.locator('.search-result-card').first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1_000);
    await page.evaluate(() => localStorage.setItem('rinspace.demo.scenario.v1', 'server-error'));
    await navigateInApp(page, 'search?q=forced-error');
    await expect(page.locator('.rin-ui-toast-region [data-tone="destructive"]')).toBeVisible();
    await page.evaluate(() => localStorage.setItem('rinspace.demo.scenario.v1', 'normal'));
    await page.waitForTimeout(1_000);

    await gotoStable(page, 'blog/1010?demoPersona=guest');
    await expect(page.locator('header.topbar')).toHaveAttribute('data-demo-persona', 'guest');
    await expect(page.locator('.inline-comment-form')).toHaveCount(0);
    const guestWrite = await page.evaluate(async (apiBase) => {
      const response = await fetch(`${apiBase}comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetType: 'blog', slug: 'local-error-atlas', body: 'guest write' }),
      });
      return { status: response.status, payload: await response.json() };
    }, `${appURL}api/`);
    assert.equal(guestWrite.status, 401);
    assert.equal(guestWrite.payload.error.code, 'authentication.required');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(page.url(), { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('把局部误差折成一张可读的地图', { timeout: 15_000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await assertAccessible(page);

    assert.deepEqual(runtimeErrors.filter((message) => (
      !message.includes('the server responded with a status of 500')
      && !message.includes('the server responded with a status of 401')
    )), []);
    const externalRequests = browserRequests.filter((requestURL) => {
      const url = new URL(requestURL);
      return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== previewURL.origin;
    });
    assert.deepEqual(externalRequests, []);
    await page.evaluate(async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    });
    await context.close();
    return {
      browser: browserName,
      routes: 9,
      memberWrites: ['like', 'collection', 'follow', 'comment'],
      states: ['loading', 'empty', 'error', 'pagination', 'broken-media'],
      accessibility: ['desktop', 'mobile'],
    };
  } finally {
    await browser.close();
  }
}

await withSourceServer(async () => {
  const results = [];
  for (const browserName of selectedNames) results.push(await validateBrowser(browserName));
  process.stdout.write(`${JSON.stringify({ passed: true, results }, null, 2)}\n`);
});
