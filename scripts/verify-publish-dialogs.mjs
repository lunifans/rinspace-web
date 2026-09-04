// Browser acceptance for the publish-menu dialogs (LaTeX blog + three book
// kinds). Seeds a fake session snapshot so the topbar renders logged-in, then
// opens each dialog from the publish menu and asserts its title/fields.
//
//   BASE_URL=http://127.0.0.1:5173/rinspace/ node scripts/verify-publish-dialogs.mjs
import { chromium } from 'playwright';

const base = process.env.BASE_URL || 'https://rinspace.com/';

const fakeUser = {
  id: 'verify-publish-user',
  username: 'verify-publish',
  user_metadata: { nickname: '弹层验收' },
};

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', ...(/localhost|127\.0\.0\.1/.test(base) ? ['--no-proxy-server'] : [])],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(base, { waitUntil: 'domcontentloaded' });
// Mock the CloudBase /user/me auth probe so the topbar resolves a session.
await page.route('**/user/me?*', (route) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ sub: fakeUser.id, nickname: fakeUser.user_metadata.nickname, username: fakeUser.username }),
  }),
);
await page.evaluate(({ user, now }) => {
  localStorage.setItem('rinspace-auth-session', JSON.stringify({ access_token: 'verify', refresh_token: 'verify', sub: user.id }));
  localStorage.setItem('rinspace-topbar-session-cache', JSON.stringify({
    user,
    profile: { nickname: user.user_metadata.nickname },
    nickname: user.user_metadata.nickname,
    avatarDataUrl: '',
    publicUserId: user.username,
    isAdmin: false,
    isModerator: false,
    cachedAt: now,
  }));
  localStorage.setItem('rinspace-theme-v2', 'dark');
}, { user: fakeUser, now: Date.now() });
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);

const openDialog = async (subLabel, itemLabel, expectedTitle) => {
  await page.getByRole('button', { name: '发布' }).click();
  await page.getByRole('menuitem', { name: new RegExp(subLabel) }).first().hover();
  await page.waitForTimeout(400);
  await page.getByRole('menuitem', { name: new RegExp(itemLabel) }).first().click();
  await page.waitForTimeout(700);
  const dialog = page.locator('.publish-create-dialog, .latex-blog-dialog').last();
  await dialog.waitFor({ state: 'visible', timeout: 5000 });
  const title = await dialog.locator('.auth-dialog-title').textContent();
  const fields = await dialog.locator('input[type="text"], textarea, input[type="file"]').count();
  const hasSubmit = await dialog.getByRole('button', { name: '创建并编辑' }).count() > 0;
  const ok = title === expectedTitle && fields >= 2 && hasSubmit;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${itemLabel}: title="${title}" fields=${fields} submit=${hasSubmit}`);
  await page.screenshot({ path: `/tmp/publish-dialog-${itemLabel}.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  if (!ok) process.exitCode = 1;
};

await openDialog('书籍', 'PDF', '上传 PDF 书籍');
await openDialog('书籍', 'LaTeX', '创建 LaTeX 书籍');
await openDialog('书籍', 'Markdown', '创建 Markdown 书籍');
await openDialog('博客', 'LaTeX', '创建 LaTeX 博客');

await browser.close();
