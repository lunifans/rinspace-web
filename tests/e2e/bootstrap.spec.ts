import fs from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

const demoConfig = fs.readFileSync(path.join(process.cwd(), 'config/runtime.demo.json'), 'utf8');
const previewURL = new URL(process.env.RINSPACE_PREVIEW_URL || new URL(
  process.env.RINSPACE_PREVIEW_BASE_PATH || '/',
  'http://127.0.0.1:4173',
));
const previewBasePath = previewURL.pathname === '/'
  ? '/'
  : `${previewURL.pathname.replace(/\/+$/, '')}/`;

function appRoute(pathname = '') {
  return `${previewBasePath}${pathname.replace(/^\/+/, '')}`;
}

async function observeHeaderLifecycle(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const events: string[] = [];
    Object.defineProperty(window, '__rinHeaderEvents', { value: events, configurable: true });
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element && (node.matches('header.topbar') || node.querySelector('header.topbar'))) events.push('added');
        }
        for (const node of record.removedNodes) {
          if (node instanceof Element && (node.matches('header.topbar') || node.querySelector('header.topbar'))) events.push('removed');
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });
}

test('slow bootstrap mounts one stable guest header only after config is ready', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' || /duplicate component|cloudbase/i.test(message.text())) {
      browserErrors.push(`${message.type()}: ${message.text()}`);
    }
  });
  await observeHeaderLifecycle(page);
  let releaseConfig: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => { releaseConfig = resolve; });
  let sawRequest: (() => void) | undefined;
  const requested = new Promise<void>((resolve) => { sawRequest = resolve; });
  await page.route('**/runtime-config.json', async (route) => {
    sawRequest?.();
    await gate;
    await route.fulfill({ status: 200, contentType: 'application/json', body: demoConfig });
  });
  await page.goto(appRoute(), { waitUntil: 'domcontentloaded' });
  await requested;
  await expect(page.locator('header.topbar')).toHaveCount(0);
  releaseConfig?.();
  const header = page.locator('header.topbar');
  await expect(header).toHaveCount(1);
  await expect(header).toHaveAttribute('data-session-state', 'anonymous');
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => (window as Window & { __rinHeaderEvents?: string[] }).__rinHeaderEvents)).toEqual(['added']);
  expect(browserErrors).toEqual([]);
});

test('demo member refresh starts at the final member header without replacement', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('rinspace.demo.persona.v1', 'member'));
  await observeHeaderLifecycle(page);
  await page.goto(appRoute());
  const header = page.locator('header.topbar');
  await expect(header).toHaveCount(1);
  await expect(header).toHaveAttribute('data-demo-persona', 'member');
  await expect(header).toHaveAttribute('data-session-state', 'authenticated');
  await expect(header).toContainText('轨道读者');
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => (window as Window & { __rinHeaderEvents?: string[] }).__rinHeaderEvents)).toEqual(['added']);
});

test('invalid runtime config shows a non-React diagnostic and never mounts navigation', async ({ page }) => {
  await observeHeaderLifecycle(page);
  await page.route('**/runtime-config.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ schemaVersion: 2, unexpectedSecret: 'must-not-be-rendered' }),
    });
  });
  await page.goto(appRoute());
  await expect(page.locator('[data-rin-bootstrap-error="true"]')).toBeVisible();
  await expect(page.locator('header.topbar')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('must-not-be-rendered');
  expect(await page.evaluate(() => (window as Window & { __rinHeaderEvents?: string[] }).__rinHeaderEvents)).toEqual([]);
});

test('one auth snapshot gates a member route for demo guest and member personas', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('rinspace.demo.persona.v1')) {
      localStorage.setItem('rinspace.demo.persona.v1', 'guest');
    }
  });
  await page.goto(appRoute('settings'));
  await expect(page.locator('header.topbar')).toHaveAttribute('data-session-state', 'anonymous');
  await expect(page.getByRole('status')).toContainText('需要登录');

  await page.evaluate(() => localStorage.setItem('rinspace.demo.persona.v1', 'member'));
  await page.reload();
  await expect(page.locator('header.topbar')).toHaveAttribute('data-session-state', 'authenticated');
  await expect(page.locator('.settings-profile-card')).toContainText('轨道读者');
  await expect(page.getByRole('status')).toHaveCount(0);
});

test('demo member receives the standard unauthorized result for the administration route', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('rinspace.demo.persona.v1', 'member'));
  const capabilityRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/admin/api/workspace/capabilities')) capabilityRequests.push(request.url());
  });

  await page.goto(appRoute('admin'));

  await expect(page.locator('header.topbar')).toHaveAttribute('data-session-state', 'authenticated');
  await expect(page.getByRole('heading', { name: '需要权限' })).toBeVisible();
  await expect(page.locator('.admin-workspace-shell')).toHaveCount(0);
  expect(capabilityRequests).toEqual([]);
});

test('demo startup and topbar fail closed before external or unregistered auth requests', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('rinspace.demo.persona.v1', 'member'));
  const observedRequests: string[] = [];
  page.on('request', (request) => observedRequests.push(request.url()));

  await page.goto(appRoute('settings'));
  await expect(page.locator('header.topbar')).toHaveAttribute('data-session-state', 'authenticated');
  await page.waitForTimeout(500);

  const externalRequests = observedRequests.filter((requestUrl) => {
    const url = new URL(requestUrl);
    return ['http:', 'https:'].includes(url.protocol) && url.origin !== previewURL.origin;
  });
  expect(externalRequests).toEqual([]);
  expect(observedRequests.some((requestUrl) => /\/(?:auth\/v1|api\/gitea\/sso|api\/notifications)(?:[/?]|$)/.test(requestUrl))).toBe(false);
});
