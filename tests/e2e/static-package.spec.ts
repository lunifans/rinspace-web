import { expect, test } from '@playwright/test';

const previewBasePath = process.env.RINSPACE_PREVIEW_BASE_PATH || '/';
const route = (pathname: string) => `${previewBasePath === '/' ? '/' : `${previewBasePath.replace(/\/+$/, '')}/`}${pathname.replace(/^\/+/, '')}`;

test('packaged BrowserRouter supports a direct deep-route refresh with scoped assets and worker', async ({ page, request }) => {
  await page.goto(route('/a/1010/local-error-atlas'), { waitUntil: 'domcontentloaded' });
  await expect(page.locator('header.topbar')).toBeVisible();
  await expect(page.locator('meta[name="rinspace-runtime-config"]')).toHaveAttribute(
    'content',
    route('/runtime-config.json'),
  );
  const config = await request.get(route('/runtime-config.json'));
  expect(config.status()).toBe(200);
  expect(config.headers()['cache-control']).toBe('no-store');
  const worker = await request.get(route('/mockServiceWorker.js'));
  expect(worker.status()).toBe(200);
  expect(worker.headers()['service-worker-allowed']).toBe(previewBasePath === '/' ? '/' : `${previewBasePath.replace(/\/+$/, '')}/`);
});
