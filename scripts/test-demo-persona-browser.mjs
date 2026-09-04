import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import process from 'node:process';

import { expect } from '@playwright/test';
import { chromium, firefox, webkit } from 'playwright';

const requestedURL = process.env.RINSPACE_PREVIEW_URL;
const previewURL = new URL(requestedURL || 'http://127.0.0.1:4196/rinspace-demo/');
const basePath = previewURL.pathname === '/' ? '/' : `${previewURL.pathname.replace(/\/+$/, '')}/`;
const appURL = new URL(basePath, previewURL.origin).toString();
const browserCatalog = { chromium, firefox, webkit };
const browserEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !['LOGNAME', 'USER', 'XDG_RUNTIME_DIR'].includes(key)),
);
const selectedNames = process.env.RINSPACE_DEMO_PERSONA_BROWSERS
  ? process.env.RINSPACE_DEMO_PERSONA_BROWSERS.split(',').map((value) => value.trim()).filter(Boolean)
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

async function relationCount(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('rinspace.demo.repository');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const database = open.result;
      const request = database.transaction('relations', 'readonly').objectStore('relations').count();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        database.close();
        resolve(request.result);
      };
    };
  }));
}

async function addLocalRelation(page) {
  await page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('rinspace.demo.repository');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const database = open.result;
      const transaction = database.transaction('relations', 'readwrite');
      transaction.objectStore('relations').put({
        key: 'demo-task16-local-relation',
        kind: 'like',
        sourceKind: 'user',
        sourceId: 'demo-user-member',
        targetKind: 'content',
        targetId: 'demo-content-mobile-edge',
        createdAt: '2026-06-01T12:00:00.000Z',
      });
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => {
        database.close();
        resolve(undefined);
      };
    };
  }));
}

async function openControls(page) {
  const controls = page.locator('[data-rin-demo-controls]');
  if (await controls.getAttribute('data-open') !== 'true') {
    await page.locator('[data-rin-demo-badge]').click();
  }
  await expect(controls).toHaveAttribute('data-open', 'true');
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
      locale: 'en-US',
      reducedMotion: 'reduce',
      viewport: { width: 1280, height: 800 },
    });
    await context.addInitScript(() => {
      if (!localStorage.getItem('rinspace-theme-v2')) localStorage.setItem('rinspace-theme-v2', 'dark');
      if (!localStorage.getItem('rinspace-language-preference-v1')) {
        localStorage.setItem('rinspace-language-preference-v1', JSON.stringify({ preference: 'en' }));
      }
      const events = [];
      Object.defineProperty(window, '__rinTask16HeaderEvents', { value: events, configurable: true });
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
    const page = await context.newPage();
    const requests = [];
    page.on('request', (request) => requests.push(request.url()));

    await page.goto(`${appURL}?ref=task16&demoPersona=member`, { waitUntil: 'domcontentloaded' });
    const header = page.locator('header.topbar');
    await expect(header).toHaveAttribute('data-demo-persona', 'member');
    await expect(header).toHaveAttribute('data-session-state', 'authenticated');
    await expect(header).toContainText('轨道读者');
    await expect(header.locator('.avatar-name-mark img')).toHaveAttribute('src', /^data:image\/svg\+xml/);
    await expect(page.locator('[data-rin-demo-badge]')).toBeVisible();
    expect(new URL(page.url()).searchParams.get('demoPersona')).toBeNull();
    expect(new URL(page.url()).searchParams.get('ref')).toBe('task16');
    expect(await page.evaluate(() => window.__rinTask16HeaderEvents)).toEqual(['added']);
    expect(await page.locator('html').getAttribute('data-theme')).toBe('dark');

    await openControls(page);
    await page.locator('.rin-demo-diagnostics summary').click();
    await expect(page.locator('[data-rin-demo-dataset]')).toHaveText('rinspace-demo-v1');
    const panelMotion = await page.locator('.rin-demo-control-panel').evaluate((element) => {
      const style = getComputedStyle(element);
      return { animation: style.animationDuration, transition: style.transitionDuration };
    });
    expect(panelMotion).toEqual({ animation: '0s', transition: '0s' });

    const peerPromise = context.waitForEvent('page');
    await page.evaluate((url) => { window.open(url, '_blank'); }, appURL);
    const peer = await peerPromise;
    await expect(peer.locator('header.topbar')).toHaveAttribute('data-demo-persona', 'member', { timeout: 15_000 });
    await openControls(peer);
    await page.locator('[data-rin-demo-persona-option="guest"]').click();
    await expect(peer.locator('header.topbar')).toHaveAttribute('data-demo-persona', 'guest');
    await peer.locator('[data-rin-demo-persona-option="member"]').click();
    await expect(page.locator('header.topbar')).toHaveAttribute('data-demo-persona', 'member');

    await page.evaluate((path) => {
      window.history.pushState({ task: 16 }, '', path);
      window.dispatchEvent(new PopStateEvent('popstate', { state: { task: 16 } }));
    }, `${basePath}questions`);
    await expect(page).toHaveURL(`${appURL}questions`);
    await expect(page.locator('header.topbar')).toHaveAttribute('data-demo-persona', 'member');
    await page.goBack();
    expect(new URL(page.url()).searchParams.get('demoPersona')).toBeNull();
    await expect(page.locator('header.topbar')).toHaveAttribute('data-demo-persona', 'member');
    await page.goForward();
    await expect(page.locator('header.topbar')).toHaveAttribute('data-demo-persona', 'member');

    await page.goto(page.url(), { waitUntil: 'domcontentloaded' });
    await expect(page.locator('header.topbar')).toHaveAttribute('data-demo-persona', 'member', { timeout: 15_000 });
    await expect(page.locator('header.topbar')).toContainText('轨道读者');
    expect(await page.evaluate(() => window.__rinTask16HeaderEvents)).toEqual(['added']);

    await openControls(page);

    await addLocalRelation(page);
    const modifiedRelationCount = await relationCount(page);
    await page.evaluate(() => {
      localStorage.setItem('unrelated.preference', 'keep');
    });
    await page.locator('[data-rin-demo-scenario]').selectOption('server-error');
    await page.locator('[data-rin-demo-reset]').click();
    await expect(page.getByRole('status')).toContainText(/restored|恢复/);
    expect(await relationCount(page)).toBeLessThan(modifiedRelationCount);
    const preserved = await page.evaluate(() => ({
      persona: localStorage.getItem('rinspace.demo.persona.v1'),
      scenario: localStorage.getItem('rinspace.demo.scenario.v1'),
      theme: localStorage.getItem('rinspace-theme-v2'),
      language: localStorage.getItem('rinspace-language-preference-v1'),
      unrelated: localStorage.getItem('unrelated.preference'),
    }));
    expect(preserved).toEqual({
      persona: 'member',
      scenario: 'normal',
      theme: 'dark',
      language: JSON.stringify({ preference: 'en' }),
      unrelated: 'keep',
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await openControls(page);
    const panelBox = await page.locator('.rin-demo-control-panel').boundingBox();
    assert.ok(panelBox);
    assert.ok(panelBox.x >= 0 && panelBox.x + panelBox.width <= 390);
    assert.ok(panelBox.y >= 0 && panelBox.y + panelBox.height <= 844);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.locator('.topbar-pill').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.locator('.topbar-pill').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    const externalRequests = requests.filter((requestURL) => new URL(requestURL).origin !== previewURL.origin);
    expect(externalRequests).toEqual([]);
    await Promise.all([page, peer].map((currentPage) => currentPage.evaluate(async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    })));
    await context.close();
    return {
      browser: browserName,
      basePath,
      persona: 'guest/member',
      reset: true,
      multiTab: true,
      mobile: true,
      reducedMotion: true,
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
