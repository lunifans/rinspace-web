import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { chromium } from 'playwright';

const origin = 'http://127.0.0.1:4212';
const outputDirectory = path.resolve('docs/assets/screenshots');

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(origin)).ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Screenshot source server did not become ready.');
}

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4212'], {
  cwd: process.cwd(),
  env: { ...process.env, RINSPACE_RUNTIME_CONFIG_FILE: 'runtime.demo.json' },
  stdio: ['ignore', 'inherit', 'inherit'],
});

try {
  await waitForServer();
  fs.mkdirSync(outputDirectory, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const cases = [
      { name: 'demo-guest-desktop', persona: 'guest', viewport: { width: 1440, height: 1000 } },
      { name: 'demo-member-desktop', persona: 'member', viewport: { width: 1440, height: 1000 } },
      { name: 'demo-guest-mobile', persona: 'guest', viewport: { width: 390, height: 844 }, isMobile: true },
      { name: 'demo-member-mobile', persona: 'member', viewport: { width: 390, height: 844 }, isMobile: true },
    ];
    for (const screenshot of cases) {
      const context = await browser.newContext({
        colorScheme: 'light',
        deviceScaleFactor: 1,
        isMobile: screenshot.isMobile,
        locale: 'zh-CN',
        reducedMotion: 'reduce',
        viewport: screenshot.viewport,
      });
      await context.addInitScript(() => {
        localStorage.clear();
        localStorage.setItem('rinspace-language-preference-v1', JSON.stringify({ preference: 'zh-CN' }));
      });
      const page = await context.newPage();
      await page.goto(`${origin}/?demoPersona=${screenshot.persona}`, { waitUntil: 'networkidle' });
      await page.locator('header.topbar').waitFor({ state: 'visible' });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        animations: 'disabled',
        fullPage: false,
        path: path.join(outputDirectory, `${screenshot.name}.png`),
      });
      await context.close();
    }
    const files = Object.fromEntries(cases.map((screenshot) => {
      const name = `${screenshot.name}.png`;
      const body = fs.readFileSync(path.join(outputDirectory, name));
      return [name, {
        width: screenshot.viewport.width,
        height: screenshot.viewport.height,
        persona: screenshot.persona,
        sha256: crypto.createHash('sha256').update(body).digest('hex'),
      }];
    }));
    fs.writeFileSync(path.join(outputDirectory, 'manifest.json'), `${JSON.stringify({
      schemaVersion: 1,
      datasetVersion: 'rinspace-demo-v1',
      datasetChecksum: 'sha256:bb7bcdfb0821fe3c9d895ce4e520f2b3106966f10b62267886ea378b2d18d9c5',
      browser: 'chromium',
      colorScheme: 'light',
      reducedMotion: 'reduce',
      files,
    }, null, 2)}\n`);
  } finally {
    await browser.close();
  }
  process.stdout.write('Captured 4 deterministic demo screenshots.\n');
} finally {
  server.kill('SIGTERM');
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 2_000);
    server.once('exit', () => { clearTimeout(timeout); resolve(); });
  });
}
