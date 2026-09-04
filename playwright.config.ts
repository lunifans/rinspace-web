import { defineConfig, devices } from '@playwright/test';

const previewBasePath = process.env.RINSPACE_PREVIEW_BASE_PATH || '/';
const localPreviewURL = new URL(previewBasePath, 'http://127.0.0.1:4173').toString().replace(/\/$/, '');
const baseURL = process.env.RINSPACE_PREVIEW_URL || localPreviewURL;
const isContinuousIntegration = process.env.GITHUB_ACTIONS === 'true'
  || /^(1|true)$/i.test(process.env.CI || '');
const requestedWorkers = Number.parseInt(process.env.PLAYWRIGHT_WORKERS || '', 10);
const workers = Number.isInteger(requestedWorkers) && requestedWorkers > 0
  ? requestedWorkers
  : isContinuousIntegration ? 1 : undefined;

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results/playwright',
  snapshotDir: './tests/e2e/__snapshots__',
  forbidOnly: isContinuousIntegration,
  retries: isContinuousIntegration ? 1 : 0,
  workers,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL,
    locale: 'zh-CN',
    storageState: './playwright/.auth/anonymous.json',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: process.env.RINSPACE_PREVIEW_URL
    ? undefined
    : {
        command: 'pnpm preview:artifact',
        url: new URL(previewBasePath, 'http://127.0.0.1:4173').toString(),
        reuseExistingServer: !process.env.CI,
        env: { ...process.env, NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' },
      },
  projects: [
    { name: 'desktop-light', use: { ...devices['Desktop Chrome'], colorScheme: 'light' } },
    { name: 'desktop-dark', use: { ...devices['Desktop Chrome'], colorScheme: 'dark' } },
    { name: 'desktop-reduced', use: { ...devices['Desktop Chrome'], colorScheme: 'light', reducedMotion: 'reduce' } },
    { name: 'mobile-light', use: { ...devices['Pixel 7'], colorScheme: 'light' } },
    { name: 'mobile-dark', use: { ...devices['Pixel 7'], colorScheme: 'dark' } },
    { name: 'mobile-reduced', use: { ...devices['Pixel 7'], colorScheme: 'light', reducedMotion: 'reduce' } },
  ],
});
