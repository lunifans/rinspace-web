import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const representatives = ['/', '/a/254/fixture', '/users/fixture', '/creator', '/admin'];

test.beforeEach(async ({ page }, testInfo) => {
  const preference = testInfo.project.name.includes('dark') ? 'zh-CN' : 'en';
  await page.addInitScript((languagePreference) => {
    localStorage.setItem(
      'rinspace-language-preference-v1',
      JSON.stringify({ preference: languagePreference }),
    );
  }, preference);
  await page.route('**/auth/v1/**', (route) => route.fulfill({
    status: 401,
    json: { message: 'anonymous acceptance fixture' },
  }));
  await page.route('**/api/**', (route) => route.fulfill({ json: {} }));
});

test('representative page families have no serious axe violations in the resolved locale', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const expectedBrand = testInfo.project.name.includes('dark') ? /芥子环/ : /Rinspace/;
  for (const route of representatives) {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveTitle(expectedBrand);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const material = result.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious');
    expect(material.map(({ id, impact, nodes }) => ({ id, impact, targets: nodes.map((node) => node.target) })), route).toEqual([]);
  }
});
