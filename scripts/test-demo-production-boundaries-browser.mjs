import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import process from 'node:process';

import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { chromium, firefox, webkit } from 'playwright';

const requestedURL = process.env.RINSPACE_PREVIEW_URL;
const previewURL = new URL(requestedURL || 'http://127.0.0.1:4200/rinspace-demo/');
const basePath = previewURL.pathname === '/' ? '/' : `${previewURL.pathname.replace(/\/+$/, '')}/`;
const appURL = new URL(basePath, previewURL.origin).toString();
const browserCatalog = { chromium, firefox, webkit };
const browserEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !['LOGNAME', 'USER', 'XDG_RUNTIME_DIR'].includes(key)),
);
const selectedNames = process.env.RINSPACE_DEMO_BOUNDARY_BROWSERS
  ? process.env.RINSPACE_DEMO_BOUNDARY_BROWSERS.split(',').map((value) => value.trim()).filter(Boolean)
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
      server.once('exit', () => { clearTimeout(timeout); resolve(); });
    });
  }
}

async function gotoStable(page, relativePath) {
  await page.goto(new URL(relativePath, appURL).toString(), { waitUntil: 'domcontentloaded' });
  await page.locator('header.topbar').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('main').first().waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForLoadState('networkidle');
}

async function assertAccessible(page) {
  const report = await new AxeBuilder({ page })
    .include('main')
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
  const checkpoint = (label) => process.stderr.write(`[demo-boundaries:${browserName}] ${label}\n`);
  const browser = await browserCatalog[browserName].launch({
    headless: true,
    args: browserName === 'chromium' ? ['--no-sandbox'] : [],
    env: browserEnvironment,
  });
  try {
    const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1360, height: 900 } });
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

    await gotoStable(page, '?demoPersona=member');
    await page.locator('[data-rin-demo-badge="true"]').click();
    await page.getByText('生产能力边界', { exact: true }).click();
    await expect(page.locator('.rin-demo-capabilities li')).toHaveCount(7);
    await expect(page.locator('[data-rin-demo-capability-state="local-only"]')).toHaveCount(1);
    await expect(page.locator('[data-rin-demo-capability-state="unavailable"]')).toHaveCount(6);
    checkpoint('capability-catalog');

    await gotoStable(page, 'admin?view=home&demoPersona=member');
    await expect(page.getByRole('heading', { name: '需要权限' })).toBeVisible();
    await assertAccessible(page);
    await gotoStable(page, 'admin?view=review&demoPersona=member');
    await expect(page.getByRole('heading', { name: '需要权限' })).toBeVisible();
    assert.equal(requests.some((url) => /\/admin\/api\//.test(new URL(url).pathname)), false);
    checkpoint('admin-review-denied');

    await gotoStable(page, 'git-auth?next=%2Fgit%2Frinspace%2Ftags&demoPersona=member');
    await expect(page.locator('[data-rin-demo-capability="gitea"]')).toBeVisible();
    await expect(page.locator('main')).toContainText('不会同步 Gitea 身份');
    assert.ok(new URL(page.url()).pathname.endsWith('/git-auth'));
    await assertAccessible(page);
    checkpoint('gitea-route');

    await gotoStable(page, 'tags/demo-tag-reproducibility/info/history/reproducibility?demoPersona=member');
    await expect(page.locator('[data-rin-demo-capability="gitea"]')).toBeVisible();
    assert.ok(new URL(page.url()).pathname.includes('/info/history/'));
    checkpoint('gitea-history');

    await gotoStable(page, 'sponsor?demoPersona=member');
    await expect(page.locator('[data-rin-demo-capability="payments"]')).toBeVisible();
    await expect(page.locator('main')).toContainText('不会创建订单');
    await expect(page.getByRole('button', { name: /支付/ })).toHaveCount(0);
    await assertAccessible(page);
    checkpoint('payments-route');

    await gotoStable(page, '?demoPersona=guest#login');
    await expect(page.locator('input[type="tel"]')).toHaveCount(0);
    await page.getByRole('button', { name: '以演示成员进入' }).first().evaluate((button) => button.click());
    const smsBoundary = page.locator('[data-rin-demo-sms-boundary="true"]');
    if (await smsBoundary.count()) {
      await expect(smsBoundary).toContainText('不会发送短信');
      await smsBoundary.getByRole('button', { name: '以演示成员进入' }).click();
    }
    await expect(page.locator('header.topbar')).toHaveAttribute('data-demo-persona', 'member');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1_000);
    await page.waitForLoadState('networkidle');
    checkpoint('sms-boundary');

    await gotoStable(page, 'write/markdown?demoPersona=member');
    const quiverButton = page.getByRole('button', { name: 'Quiver 交换图' });
    await expect(quiverButton).toBeVisible({ timeout: 20_000 });
    await quiverButton.click();
    await expect(page.getByText(/演示不会加载 Quiver/).first()).toBeVisible();
    await expect(page.locator('iframe.rin-quiver-frame')).toHaveCount(0);
    checkpoint('quiver-boundary');

    const localWorkspaceTitle = `本地工作区边界 ${browserName}`;
    await gotoStable(page, 'write?demoPersona=member');
    await expect(page.locator('header.topbar')).toHaveAttribute('data-demo-persona', 'member');
    const latexEditor = page.getByRole('textbox', { name: 'LaTeX source' });
    await expect(latexEditor).toBeVisible({ timeout: 20_000 });
    await page.locator('#writer-title').fill(localWorkspaceTitle);
    await latexEditor.fill([
      '\\documentclass{article}',
      `\\title{${localWorkspaceTitle}}`,
      '\\begin{document}',
      'Local workspace boundary.',
      '\\end{document}',
    ].join('\n'));
    await expect(page.locator('.demo-rin-editor-preview')).toContainText('Local workspace boundary.');
    await expect(page.locator('#writer-title')).toHaveValue(localWorkspaceTitle);
    const publishLatex = page.locator('.writer-topbar-actions').getByRole('button', { name: '发布', exact: true });
    await expect(publishLatex).toBeEnabled({ timeout: 10_000 });
    await publishLatex.click();
    await page.waitForURL((url) => url.pathname.includes('/a/'), { timeout: 20_000 });
    await page.waitForLoadState('networkidle');
    await gotoStable(page, 'creator?view=content&demoPersona=member');
    const workspaceRow = page.locator('.creator-row').filter({ hasText: localWorkspaceTitle });
    await expect(workspaceRow).toBeVisible({ timeout: 20_000 });
    await workspaceRow.getByRole('button', { name: '编辑' }).click();
    await expect(page.getByText(/演示不会打开生产代码工作区/).first()).toBeVisible();
    assert.ok(new URL(page.url()).pathname.endsWith('/creator'));
    checkpoint('workspace-boundary');

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
    const productionOnlyRequests = requests.filter((requestURL) => {
      const pathname = new URL(requestURL).pathname;
      return /\/(?:git\/api|api\/gitea|api\/sponsor|quiver\/|workspace(?:\/|$)|render(?:er)?\/(?:jobs?|imports?)|api\/content\/[^/]+\/publication-progress)/.test(pathname);
    });
    assert.deepEqual(productionOnlyRequests, []);

    await page.evaluate(async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    });
    await context.close();
    return {
      browser: browserName,
      boundaries: ['admin', 'review', 'gitea', 'tag-history', 'payments', 'sms', 'quiver', 'workspace'],
      capabilityStates: { unavailable: 6, localOnly: 1 },
      network: { externalRequests: 0, productionOnlyRequests: 0 },
      accessibility: ['admin-denied', 'gitea-capability', 'payments-capability'],
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
