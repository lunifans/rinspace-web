import { expect, test } from '@playwright/test';

const expectedWebCommit = process.env.RINSPACE_CROSS_REPO_WEB_COMMIT || '';
const expectedBackendCommit = process.env.RINSPACE_CROSS_REPO_BACKEND_COMMIT || '';
const expectedContractVersion = process.env.RINSPACE_CROSS_REPO_CONTRACT_VERSION || '';
const expectedRuntimeChannel = process.env.RINSPACE_CROSS_REPO_RUNTIME_CHANNEL || '';

test.skip(!expectedWebCommit, 'Runs only in the private controlled cross-repository staging workflow.');

test('exact public frontend consumes the exact private backend through one same-origin application', async ({ page }) => {
  expect(expectedWebCommit).toMatch(/^[0-9a-f]{40}$/);
  expect(expectedBackendCommit).toMatch(/^[0-9a-f]{40}$/);
  expect(expectedContractVersion).toBe('v1');
  expect(expectedRuntimeChannel).toBe('runtime.integration.json');

  const applicationOrigin = new URL(process.env.RINSPACE_PREVIEW_URL || 'http://127.0.0.1:5173/rinspace/').origin;
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== applicationOrigin) {
      externalRequests.push(request.url());
    }
  });

  await page.goto('/rinspace/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-rin-bootstrap-error="true"]')).toHaveCount(0);
  await expect(page.locator('header.topbar')).toHaveAttribute('data-session-state', 'anonymous');

  const runtimeResponse = await page.request.get('/rinspace/runtime-config.json');
  expect(runtimeResponse.ok()).toBe(true);
  const runtime = await runtimeResponse.json() as {
    mode: string;
    basePath: string;
    api: { contractVersion: string; baseUrl: string };
  };
  expect(runtime).toMatchObject({
    mode: 'integration',
    basePath: '/rinspace/',
    api: { contractVersion: expectedContractVersion, baseUrl: '/rinspace/api/' },
  });

  const healthResponse = await page.request.get('/rinspace/api/health');
  expect(healthResponse.ok()).toBe(true);
  await expect(healthResponse.json()).resolves.toMatchObject({
    service: 'rinspace',
    status: 'ok',
    basePath: '/rinspace',
  });
  expect(externalRequests).toEqual([]);
});
