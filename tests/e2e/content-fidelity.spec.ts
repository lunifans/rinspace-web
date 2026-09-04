import { expect, test } from '@playwright/test';

const fixture = `<main class="rin-page-grid"><article class="rin-rich-content rin-reading-axis"><h1 id="title">有界性 / Boundedness</h1><p>中文与 Latin mixed typography；行内数学 <span class="math-fragment">x²+y²=z²</span>，引用 <a href="#ref-1">[1]</a>。</p><div class="math-display"><mjx-container display="true">∫₀¹ x² dx = ⅓</mjx-container></div><pre><code>const theorem = (fiber) =&gt; fiber.isBounded;</code></pre><div class="table-responsive"><table><thead><tr><th>对象</th><th>非常长的分类列</th><th>结论</th></tr></thead><tbody><tr><td>Calabi–Yau</td><td>Supercalifragilisticexpialidocious_不允许截断但允许在必要位置换行_0123456789</td><td>bounded</td></tr></tbody></table></div><figure><img alt="示例图" width="640" height="240" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='240'%3E%3Crect width='640' height='240' fill='%230f766e'/%3E%3C/svg%3E"/><figcaption>Figure 1 · 固定内容夹具</figcaption></figure><blockquote>长篇引用保持阅读轴和语义边界。</blockquote><p id="ref-1">[1] Fixture citation.</p></article></main>`;

test('rich content fixture preserves fidelity and localizes overflow', async ({ page }) => {
  await page.goto('/');
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator('#root').evaluate((root, html) => { root.innerHTML = html as string; }, fixture);
    await expect(page.getByRole('heading', { name: '有界性 / Boundedness' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), `${width}px page overflow`).toBe(false);
    expect(await page.locator('.table-responsive').evaluate((element) => getComputedStyle(element).overflowX)).toBe('auto');
  }
});
