import { expect, test } from '@playwright/test';

const representatives = ['/', '/a/254/fixture', '/users/fixture', '/creator', '/admin'];

test.beforeEach(async ({ page }) => {
  await page.route('**/auth/v1/**', (route) => route.fulfill({
    status: 401,
    json: { message: 'anonymous acceptance fixture' },
  }));
  await page.route('**/api/**', (route) => route.fulfill({ json: {} }));
});

test('route families fit exact reference widths and 200% zoom equivalent', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light', 'The six-project matrix already covers theme, device and motion variants.');
  test.setTimeout(120_000);
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of representatives) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      expect(overflow, `${route} overflows at ${width}px`).toBe(false);
    }
  }
  await page.setViewportSize({ width: 720, height: 900 });
  for (const route of representatives) {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), `${route} overflows at 200% zoom equivalent`).toBe(false);
  }
});

test('keyboard navigation reaches content, search and route announcement', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-light');
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const skip = page.locator('a.rin-skip-link');
  await expect(skip).toBeAttached();
  await expect(skip).not.toHaveAccessibleName('');
  for (let index = 0; index < 30 && !(await skip.evaluate((element) => element === document.activeElement)); index += 1) await page.keyboard.press('Tab');
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#rin-main-content')).toBeFocused();
  await page.getByRole('search').getByRole('textbox').focus();
  await page.keyboard.type('Calabi Yau');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/search\?q=Calabi%20Yau$/);
  await expect(page.locator('#rin-route-announcer')).not.toHaveText('');
});

test('system theme resolves before representative content renders', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-dark');
  await page.addInitScript(() => localStorage.setItem('rinspace-theme-v2', 'system'));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
