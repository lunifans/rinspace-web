import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import process from 'node:process';

import AxeBuilder from '@axe-core/playwright';
import { expect } from '@playwright/test';
import { chromium, firefox, webkit } from 'playwright';

const requestedURL = process.env.RINSPACE_PREVIEW_URL;
const previewURL = new URL(requestedURL || 'http://127.0.0.1:4199/rinspace-demo/');
const basePath = previewURL.pathname === '/' ? '/' : `${previewURL.pathname.replace(/\/+$/, '')}/`;
const appURL = new URL(basePath, previewURL.origin).toString();
const browserCatalog = { chromium, firefox, webkit };
const browserEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !['LOGNAME', 'USER', 'XDG_RUNTIME_DIR'].includes(key)),
);
const selectedNames = process.env.RINSPACE_DEMO_CREATION_BROWSERS
  ? process.env.RINSPACE_DEMO_CREATION_BROWSERS.split(',').map((value) => value.trim()).filter(Boolean)
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

async function pasteMarkdown(page, markdown) {
  const editor = page.locator('.ProseMirror');
  await editor.waitFor({ state: 'visible', timeout: 20_000 });
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.evaluate((plainText) => {
    const target = document.activeElement?.closest?.('.ProseMirror') || document.querySelector('.ProseMirror');
    if (!target) throw new Error('Markdown editor is missing.');
    const data = new DataTransfer();
    data.setData('text/plain', plainText);
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, 'clipboardData', { configurable: true, value: data });
    target.dispatchEvent(pasteEvent);
  }, markdown);
  await page.waitForTimeout(900);
}

async function validateBrowser(browserName) {
  const checkpoint = (label) => process.stderr.write(`[demo-creation:${browserName}] ${label}\n`);
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

    const title = `本地创作验收 ${browserName}`;
    const longParagraph = '这个长段落只保存在浏览器演示仓储中，用于验证自动保存、刷新恢复和本地发布边界。'.repeat(80);
    const markdown = [
      `# ${title}`,
      '',
      longParagraph,
      '',
      '$$',
      'E = mc^2 + \\sum_{i=1}^{n} i',
      '$$',
      '',
      '```ts',
      `const browserEngine = '${browserName}';`,
      'const productionNetworkCalls = 0;',
      '```',
    ].join('\n');

    await gotoStable(page, 'write/markdown?demoPersona=member');
    await expect(page.locator('.demo-creation-capability-note')).toContainText('草稿与发布内容只保存在本设备');
    await pasteMarkdown(page, markdown);
    await expect(page.locator('#markdown-title')).toHaveValue(title, { timeout: 15_000 });
    await expect(page.locator('.ProseMirror')).toContainText('productionNetworkCalls');
    checkpoint('markdown-edited');

    await page.waitForTimeout(9_500);
    await expect(page.getByText(/已自动保存到本地|已自动保存并同步/).first()).toBeVisible({ timeout: 10_000 });
    const storageState = await page.evaluate(async () => {
      const databases = typeof indexedDB.databases === 'function'
        ? (await indexedDB.databases()).map((database) => database.name)
        : [];
      return { databases };
    });
    assert.ok(storageState.databases.includes('rinspace.demo.repository'));
    assert.ok(!storageState.databases.includes('rinspace-milkdown-autosave'));
    assert.ok(!storageState.databases.includes('rinspace-rin-writer-autosave'));
    checkpoint('autosaved');

    await page.goto(new URL('write/markdown?demoPersona=member', appURL).toString(), { waitUntil: 'domcontentloaded' });
    await page.locator('.ProseMirror').waitFor({ state: 'visible', timeout: 20_000 });
    await expect(page.locator('#markdown-title')).toHaveValue(title, { timeout: 15_000 });
    await expect(page.locator('.ProseMirror')).toContainText('productionNetworkCalls');
    await assertAccessible(page);
    checkpoint('restored');

    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.waitForURL((url) => url.pathname.includes('/a/'), { timeout: 20_000 });
    await page.locator('.detail-shell').waitFor({ state: 'visible', timeout: 20_000 });
    await expect(page.getByRole('heading', { level: 1 })).toContainText(title);
    await expect(page.locator('main')).toContainText('productionNetworkCalls');
    await assertAccessible(page);
    checkpoint('published');

    await gotoStable(page, 'creator');
    await expect(page.locator('.demo-creation-capability-note')).toContainText('代码工作区');
    await expect(page.locator('main')).toContainText(title);
    await page.locator('a[href*="/creator?view=content"]').first().click();
    await expect(page.locator('main')).toContainText(title);
    await assertAccessible(page);
    checkpoint('creator');

    await gotoStable(page, 'notifications');
    await expect(page.locator('main')).toContainText(title);
    checkpoint('notification');

    await gotoStable(page, 'write');
    await expect(page.locator('.demo-creation-capability-note')).toContainText('服务端渲染');
    const latexTitle = `本地 LaTeX 验收 ${browserName}`;
    const latexSource = [
      '\\documentclass{article}',
      `\\title{${latexTitle}}`,
      '\\begin{document}',
      '\\maketitle',
      'Local-only formula: $\\Delta x = \\sum_{i=1}^{n} i$.',
      '\\end{document}',
    ].join('\n');
    const latexEditor = page.getByRole('textbox', { name: 'LaTeX source' });
    await expect(latexEditor).toBeVisible({ timeout: 20_000 });
    await page.locator('#writer-title').fill(latexTitle);
    await latexEditor.fill(latexSource);
    await expect(page.locator('.demo-rin-editor-preview')).toContainText('Delta x');
    const publishLatex = page.locator('.writer-topbar-actions').getByRole('button', { name: '发布', exact: true });
    await expect(publishLatex).toBeEnabled({ timeout: 10_000 });
    await publishLatex.click();
    await page.waitForURL((url) => url.pathname.includes('/a/'), { timeout: 20_000 });
    await page.locator('.detail-shell').waitFor({ state: 'visible', timeout: 20_000 });
    await expect(page.getByRole('heading', { level: 1 })).toContainText(latexTitle);
    await expect(page.locator('main')).toContainText('Delta x');
    checkpoint('latex-published');

    await page.locator('[data-rin-demo-badge="true"]').click();
    await page.locator('[data-rin-demo-reset="true"]').click();
    await expect(page.locator('.rin-demo-control-status')).toContainText('演示数据已恢复');
    await gotoStable(page, 'creator');
    await expect(page.locator('main')).toContainText('把局部误差折成一张可读的地图', { timeout: 15_000 });
    await expect(page.locator('.creator-panel-state .loading-state')).toHaveCount(0);
    await expect(page.locator('main')).not.toContainText(title);
    await expect(page.locator('main')).not.toContainText(latexTitle);
    checkpoint('reset');

    await gotoStable(page, 'write/markdown?demoPersona=guest');
    await expect(page.getByText('需要登录', { exact: true })).toBeVisible();
    await expect(page.locator('.ProseMirror')).toHaveCount(0);
    checkpoint('guest-gate');

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
      routes: ['markdown-writer', 'published-article', 'creator', 'notifications', 'latex-writer', 'latex-published', 'guest-gate'],
      persistence: ['single-repository-autosave', 'refresh-restore', 'local-publication', 'reset'],
      content: ['long-text', 'math', 'code'],
      accessibility: ['writer', 'reader', 'creator'],
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
