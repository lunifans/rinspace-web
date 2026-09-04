import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import process from 'node:process';

import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { chromium, firefox, webkit } from 'playwright';

const requestedURL = process.env.RINSPACE_PREVIEW_URL;
const previewURL = new URL(requestedURL || 'http://127.0.0.1:4198/rinspace-demo/');
const basePath = previewURL.pathname === '/' ? '/' : `${previewURL.pathname.replace(/\/+$/, '')}/`;
const appURL = new URL(basePath, previewURL.origin).toString();
const browserCatalog = { chromium, firefox, webkit };
const browserEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !['LOGNAME', 'USER', 'XDG_RUNTIME_DIR'].includes(key)),
);
const selectedNames = process.env.RINSPACE_DEMO_IDENTITY_BROWSERS
  ? process.env.RINSPACE_DEMO_IDENTITY_BROWSERS.split(',').map((value) => value.trim()).filter(Boolean)
  : Object.keys(browserCatalog);

for (const name of selectedNames) {
  if (!(name in browserCatalog)) throw new Error(`Unknown browser: ${name}`);
}

async function waitForServer(url) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // The Vite source server is still starting.
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
      server.once('exit', () => { clearTimeout(timeout); resolve(); });
    });
  }
}

async function gotoStable(page, relativePath) {
  await page.goto(new URL(relativePath, appURL).toString(), { waitUntil: 'domcontentloaded' });
  await page.locator('header.topbar').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('main').first().waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(900);
}

async function assertAccessible(page, include = 'main') {
  const report = await new AxeBuilder({ page })
    .include(include)
    .exclude('iframe')
    .options({ iframes: false })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  assert.deepEqual(report.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    targets: violation.nodes.map((node) => node.target),
  })), []);
}

async function validateBrowser(browserName) {
  const checkpoint = (label) => process.stderr.write(`[demo-identity:${browserName}] ${label}\n`);
  const browser = await browserCatalog[browserName].launch({
    headless: true,
    args: browserName === 'chromium' ? ['--no-sandbox'] : [],
    env: browserEnvironment,
  });
  try {
    const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1280, height: 800 } });
    await context.addInitScript(() => {
      localStorage.setItem('rinspace-language-preference-v1', JSON.stringify({ preference: 'zh-CN' }));
    });
    const page = await context.newPage();
    const requests = [];
    const runtimeErrors = [];
    page.on('request', (request) => requests.push(request.url()));
    page.on('pageerror', (error) => runtimeErrors.push(`pageerror:${page.url()}:${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') runtimeErrors.push(`console:${page.url()}:${message.text()}`);
    });

    await gotoStable(page, 'users/demo-orbit-reader?demoPersona=member');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('轨道读者');
    await expect(page.getByRole('button', { name: '编辑资料' })).toBeVisible();
    checkpoint('profile-loaded');
    await page.locator('.profile-relation-stat').first().click();
    const relationDialog = page.locator('[role="dialog"]');
    await expect(relationDialog).toContainText('纸舟');
    await relationDialog.getByRole('button', { name: '关闭' }).click();

    await page.getByRole('button', { name: '编辑资料' }).click();
    await page.locator('#profile-display-name').fill(`轨道读者 ${browserName}`);
    await page.locator('#profile-user-id').fill(`demo-${browserName}-reader`);
    const png = await readFile(new URL('../public/assets/brand/rinspace-mark-128.png', import.meta.url));
    await page.locator('.avatar-upload-button input[type="file"]').setInputFiles({
      name: 'demo-avatar.png', mimeType: 'image/png', buffer: png,
    });
    const cropDialog = page.getByRole('dialog', { name: '裁剪头像' });
    await expect(cropDialog).toBeVisible();
    checkpoint('crop-open');
    await cropDialog.getByRole('button', { name: '应用裁剪' }).click();
    checkpoint('crop-submitted');
    await expect(cropDialog).toHaveCount(0, { timeout: 15_000 });
    checkpoint('crop-closed');
    await page.locator('.profile-save-button').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`轨道读者 ${browserName}`, { timeout: 15_000 });
    checkpoint('profile-saved');
    await expect(page.locator('header.topbar')).toContainText(`轨道读者 ${browserName}`);
    await expect(page.locator('.profile-avatar img')).toHaveAttribute('src', /^data:image\/jpeg;base64,/);
    await assertAccessible(page);
    checkpoint('profile-edit');

    await gotoStable(page, `users/demo-${browserName}-reader`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`轨道读者 ${browserName}`, { timeout: 15_000 });
    await expect(page.locator('header.topbar')).toContainText(`轨道读者 ${browserName}`);

    await gotoStable(page, 'notifications');
    await expect(page.locator('.notification-row')).toHaveCount(2);
    await expect(page.locator('.notification-row.is-unread')).toHaveCount(1);
    await page.getByRole('button', { name: '标记已读' }).click();
    await expect(page.locator('.notification-row.is-unread')).toHaveCount(0);
    await gotoStable(page, 'notifications');
    await expect(page.locator('.notification-row.is-unread')).toHaveCount(0, { timeout: 15_000 });
    await assertAccessible(page);
    checkpoint('notifications');

    await gotoStable(page, 'settings');
    await expect(page.getByRole('note')).toContainText('真实短信、邮件发送、账号绑定、支付和外部 OAuth 均已禁用');
    const inboxToggle = page.locator('.settings-notification-row').first().locator('input[type="checkbox"]');
    await expect(inboxToggle).toBeChecked();
    await page.locator('#settings-color-scheme').selectOption('dark');
    await inboxToggle.uncheck();
    await page.getByRole('button', { name: '保存偏好' }).click();
    await expect(page.getByText('界面偏好已保存。', { exact: true })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: '保存通知' }).click();
    await expect(page.getByText('通知偏好已保存。', { exact: true })).toBeVisible({ timeout: 15_000 });
    await gotoStable(page, 'settings');
    await expect(page.locator('#settings-color-scheme')).toHaveValue('dark', { timeout: 15_000 });
    await expect(page.locator('.settings-notification-row').first().locator('input[type="checkbox"]')).not.toBeChecked();
    checkpoint('settings');

    await gotoStable(page, 'activity?object_type=blog&object_id=1010');
    await expect(page.locator('main')).toContainText('补充了演示说明');
    checkpoint('activity');

    await gotoStable(page, 'settings?demoPersona=guest');
    await expect(page.locator('header.topbar')).toHaveAttribute('data-demo-persona', 'guest');
    await expect(page.getByText('需要登录', { exact: true })).toBeVisible();
    await expect(page.locator('.settings-grid')).toHaveCount(0);
    await gotoStable(page, `users/demo-${browserName}-reader`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`轨道读者 ${browserName}`);
    await expect(page.getByRole('button', { name: '编辑资料' })).toHaveCount(0);
    checkpoint('guest');

    await gotoStable(page, 'users/demo-orbit-reader?demoPersona=member');
    await expect(page.locator('header.topbar')).toHaveAttribute('data-demo-persona', 'member');
    await expect(page.locator('.profile-shell [role="status"]')).toHaveCount(0, { timeout: 15_000 });
    await page.locator('[data-rin-demo-badge="true"]').click();
    await page.locator('[data-rin-demo-reset="true"]').click();
    await expect(page.locator('.rin-demo-control-status')).toContainText('演示数据已恢复');
    await gotoStable(page, 'users/demo-orbit-reader');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('轨道读者');
    await expect(page.locator('header.topbar')).toContainText('轨道读者');
    checkpoint('reset');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(page.url(), { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('轨道读者', { timeout: 15_000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await assertAccessible(page);
    checkpoint('mobile');

    assert.deepEqual(runtimeErrors.filter((message) => {
      if (browserName === 'webkit' && message.endsWith(':The operation is insecure.')) return false;
      return ![
        'the server responded with a status of 401',
        "document is sandboxed and lacks the 'allow-same-origin' flag",
        "frame is sandboxed and the 'allow-scripts' permission is not set",
      ].some((expected) => message.includes(expected));
    }), []);
    const external = requests.filter((requestURL) => {
      const url = new URL(requestURL);
      return ['http:', 'https:'].includes(url.protocol) && url.origin !== previewURL.origin;
    });
    assert.deepEqual(external, []);
    await page.evaluate(async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    });
    await context.close();
    return {
      browser: browserName,
      routes: ['public-profile', 'own-profile', 'notifications', 'settings', 'activity', 'guest-gates'],
      persistence: ['profile', 'avatar', 'notification-read', 'interface', 'notification-settings'],
      reset: true,
      accessibility: ['desktop', 'mobile'],
    };
  } finally {
    await browser.close();
  }
}

await withSourceServer(async () => {
  const results = [];
  for (const name of selectedNames) results.push(await validateBrowser(name));
  process.stdout.write(`${JSON.stringify({ passed: true, results }, null, 2)}\n`);
});
