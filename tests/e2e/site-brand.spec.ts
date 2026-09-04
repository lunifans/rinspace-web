import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

const readConfig = (name: string) => JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'config', name), 'utf8'),
) as Record<string, unknown>;

test('default demo has neutral metadata, manifest, navigation, and legal content', async ({ page, request }) => {
  await page.goto('/legal');
  await expect(page.locator('header.topbar')).toContainText('Rinspace Web Demo');
  await expect(page.locator('.brand-mark img')).toHaveCount(0);
  await expect(page).toHaveTitle(/Rinspace Web Demo/);
  await expect(page.locator('meta[name="author"]')).toHaveCount(0);
  await expect(page.locator('link[rel="icon"]')).toHaveCount(0);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(0);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/site.webmanifest');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'http://localhost:4173/legal');
  await expect(page.locator('body')).not.toContainText('沪ICP备2025152146号-2');
  await expect(page.locator('body')).not.toContainText('沪公网安备31012102000206号');
  await expect(page.locator('body')).not.toContainText('lunifans@outlook.com');
  await expect(page.getByRole('link', { name: '源代码' }).first()).toHaveAttribute(
    'href',
    'https://github.com/lunifans/rinspace-web',
  );

  const manifestResponse = await request.get('/site.webmanifest');
  expect(manifestResponse.ok()).toBe(true);
  await expect(manifestResponse.json()).resolves.toMatchObject({
    name: 'Rinspace Web Demo',
    start_url: '/',
    scope: '/',
    icons: [],
  });
});

test('official config restores official public brand metadata and filings', async ({ page }) => {
  const official = readConfig('runtime.official.example.json');
  await page.route('**/runtime-config.json', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(official) });
  });
  await page.goto('/legal');
  await expect(page.locator('header.topbar')).toContainText('芥子环');
  await expect(page.locator('.brand-mark img')).toHaveAttribute('src', '/assets/brand/rinspace-mark-128.png');
  await expect(page.locator('meta[name="author"]')).toHaveAttribute('content', '任务优先（上海）网络科技有限责任公司');
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.ico');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/apple-touch-icon.png');
  await expect(page.locator('body')).toContainText('沪ICP备2025152146号-2');
  await expect(page.locator('body')).toContainText('沪公网安备31012102000206号');
  await expect(page.locator('body')).toContainText('lunifans@outlook.com');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://rinspace.com/legal');
});

test('integration config changes public site identity without component edits', async ({ page }) => {
  const integration = readConfig('runtime.example.json');
  const site = integration.site as Record<string, unknown>;
  site.name = 'Independent Knowledge Garden';
  site.shortName = 'Knowledge Garden';
  site.description = 'A separately branded integration deployment.';
  site.contactEmail = 'hello@example.com';
  await page.route('**/runtime-config.json', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(integration) });
  });
  await page.goto('/rinspace/legal');
  await expect(page.locator('header.topbar')).toContainText('Independent Knowledge Garden');
  await expect(page).toHaveTitle(/Independent Knowledge Garden/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    'Independent Knowledge Garden 的运营主体、备案信息和公开联系方式。',
  );
  await expect(page.locator('body')).toContainText('hello@example.com');
  await expect(page.locator('body')).not.toContainText('lunifans@outlook.com');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://web.example.com/rinspace/legal',
  );
});
