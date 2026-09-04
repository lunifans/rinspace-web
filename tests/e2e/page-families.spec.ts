import { expect, test } from '@playwright/test';

const families = {
  discovery: ['/', '/blog', '/books', '/questions', '/discussions', '/dynamics', '/tags', '/search?q=math', '/users', '/announcements'],
  knowledge: ['/a/254/fixture-title', '/test/a/254/fixture-title', '/q/254/fixture-title', '/d/254/fixture-title', '/s/254/fixture-title', '/books/254/fixture-title', '/books/254/read/fixture-title', '/books/254/fixture-title/activity', '/author/1', '/tags/1/fixture', '/tags/1/info/fixture', '/tags/1/info/history/fixture', '/linked/254', '/test/computer'],
  identity: ['/users/fixture', '/users/fixture/rank', '/badges', '/notifications', '/activity'],
  creation: ['/creator', '/write', '/write/markdown', '/questions/ask', '/books/new', '/tags/new'],
  operations: ['/admin', '/review', '/settings', '/sponsor', '/legal'],
} as const;

for (const [family, routes] of Object.entries(families)) {
  test(`${family} family renders without overflow`, async ({ page }) => {
    test.setTimeout(120_000);
    for (const route of routes) {
      const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
      expect(response?.status(), route).toBe(200);
      await expect(page.locator(`[data-page-family]`), route).toBeAttached();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      expect(overflow, `${route} overflows`).toBe(false);
    }
  });
}
