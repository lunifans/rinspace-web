#!/usr/bin/env node

import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseURL = process.env.RINSPACE_BROWSER_BASE_URL || 'http://127.0.0.1:5173/rinspace';
const chromiumPath = process.env.CHROMIUM_BIN;

const capabilities = {
  capabilities: {
    'operations.control.event_replay': true,
    'operations.control.dry_run': true,
    'operations.control.apply': true,
  },
  views: { home: true, content: true, review: true, system: true },
  systemSections: { overview: true, events: true, publishing: true, consistency: true, records: true },
  features: {
    moderationCasesV2: true,
    reportFeedback: false,
    systemOperations: true,
    controlCommands: true,
  },
};

const currentUser = {
  id: 'admin-uid',
  created_at: 1,
  last_login_date: 1,
  username: 'admin',
  display_name: '管理员',
  avatar: { type: 'custom', gravatar: '', custom: '' },
  cover_url: '',
  mobile: '',
  bio: '',
  bio_html: '',
  website: '',
  location: '',
  language: 'zh-CN',
  color_scheme: 'dark',
  access_token: 'access',
  role_id: 2,
  role_name: 'admin',
  rank: 1,
  status: 'normal',
  have_password: true,
  visit_token: '',
  suspended_until: 0,
};

const emptyQueue = {
  count: 0,
  page: 1,
  pageSize: 20,
  items: [],
  counts: { active: 0, pending: 0, deferred: 0, machine: 0, report: 0, hybrid: 0, closed: 0 },
  generatedAt: '2026-08-27T00:00:00Z',
};

const controlStatus = {
  state: 'available',
  sampledAt: '2026-08-27T00:00:00Z',
  dependencies: { controlPlane: 'available', gitea: 'unknown', renderer: 'unknown', codeServer: 'unknown' },
  events: { inboxPending: 2, inboxQuarantined: 1, inboxOldestAgeSeconds: 30, outboxPending: 1, outboxDead: 0, outboxOldestAgeSeconds: 15, giteaEffectsPending: 0, giteaEffectsDead: 0 },
  publishing: { provisionPending: 0, provisionFailed24h: 0, provisionP95Seconds: 2, publicationActive: 1, publicationFailed24h: 0, publicationDriftOpen: 0, pushObservationP95Seconds: 3, queueWaitP95Seconds: 4, renderDurationP95Seconds: 8, activationDelayP95Seconds: 1 },
  consistency: { branchPolicyDrift: 0, reconciliationRequired: 1, openFindings: 1, manualFindings: 0, reconciliationRepairRatio: 1 },
  runtime: {},
};

const browser = await chromium.launch({
  headless: true,
  ...(chromiumPath ? { executablePath: chromiumPath } : {}),
  args: ['--no-sandbox'],
});

let replayRequests = 0;
let dryRunRequests = 0;
let applyRequests = 0;

try {
  const context = await browser.newContext({
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => console.error(error));
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(message.text());
  });
  await page.addInitScript(() => {
    const token = `e30.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.signature`;
    localStorage.setItem('rinspace-auth-session', JSON.stringify({ access_token: token, refresh_token: 'refresh', expires_in: 3600, sub: 'admin-uid', issued_at: Date.now() }));
  });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/auth/v1/user/me')) {
      await route.fulfill({ json: { sub: 'admin-uid', nickname: '管理员', phone_number: '' } });
      return;
    }
    if (url.pathname.endsWith('/rinspace/api/user/info')) {
      await route.fulfill({ json: currentUser });
      return;
    }
    if (url.pathname.endsWith('/rinspace/admin/api/workspace/capabilities')) {
      await route.fulfill({ json: capabilities });
      return;
    }
    if (url.pathname.endsWith('/rinspace/admin/api/control/status')) {
      await route.fulfill({ json: controlStatus });
      return;
    }
    if (url.pathname.endsWith('/rinspace/admin/api/control/events/replay-review')) {
      await route.fulfill({ json: {
        id: 7, kind: 'inbox', source: 'gitea', eventId: 'event-7', eventType: 'repository.push', schemaVersion: '1',
        state: 'quarantined', attemptCount: 2, lastErrorCode: 'invalid_commit', occurredAt: '2026-08-27T00:00:00Z',
        updatedAt: '2026-08-27T00:01:00Z', replayable: true,
      } });
      return;
    }
    if (url.pathname.endsWith('/rinspace/admin/api/control/events/replay')) {
      replayRequests += 1;
      assert.equal(route.request().method(), 'POST');
      assert.match(route.request().postData() || '', /重放隔离事件/);
      await route.fulfill({ json: { replayed: true, kind: 'inbox', id: 7, correlationId: 'ops-browser-replay' } });
      return;
    }
    if (url.pathname.endsWith('/rinspace/admin/api/control/events')) {
      await route.fulfill({ json: { items: [{
        id: 7, kind: 'inbox', source: 'gitea', eventId: 'event-7', eventType: 'repository.push', schemaVersion: '1',
        state: 'quarantined', attemptCount: 2, lastErrorCode: 'invalid_commit', occurredAt: '2026-08-27T00:00:00Z',
        updatedAt: '2026-08-27T00:01:00Z',
      }], nextCursor: '' } });
      return;
    }
    if (url.pathname.endsWith('/rinspace/admin/api/control/reconciliation/dry-run')) {
      dryRunRequests += 1;
      await route.fulfill({ json: {
        tier: 'event', examined: 1, differences: 1, repaired: 0, manualRequired: 0, recoverable: 1,
        projectId: 'article:41', impactHash: 'a'.repeat(64), correlationId: 'ops-browser-check',
      } });
      return;
    }
    if (url.pathname.endsWith('/rinspace/admin/api/control/reconciliation/apply')) {
      applyRequests += 1;
      assert.match(route.request().postData() || '', new RegExp('a{64}'));
      await route.fulfill({ json: {
        tier: 'event', examined: 1, differences: 1, repaired: 1, manualRequired: 0, recoverable: 1,
        projectId: 'article:41', impactHash: 'a'.repeat(64), correlationId: 'ops-browser-apply',
      } });
      return;
    }
    if (url.pathname.endsWith('/rinspace/admin/api/control/findings')) {
      await route.fulfill({ json: { items: [{
        id: 9, subjectType: 'project', subjectId: 'article:41', checkCode: 'publication_event_gap', severity: 'critical',
        sourceTier: 'event', state: 'open', occurrenceCount: 1, lastSeenAt: '2026-08-27T00:01:00Z',
      }] } });
      return;
    }
    if (url.pathname.endsWith('/rinspace/admin/api/operations/audit')) {
      await route.fulfill({ json: { items: [], nextCursor: '' } });
      return;
    }
    if (url.pathname.endsWith('/rinspace/api/moderation/cases')) {
      await route.fulfill({ json: emptyQueue });
      return;
    }
    if (url.pathname.startsWith('/rinspace/api/')) {
      await route.fulfill({ json: {} });
      return;
    }
    await route.continue();
  });

  await page.goto(`${baseURL}/admin`, { waitUntil: 'domcontentloaded' });
  try {
    await page.getByRole('heading', { name: '管理中心', level: 1 }).waitFor({ timeout: 10_000 });
  } catch (error) {
    console.error(`URL: ${page.url()}`);
    console.error(await page.locator('body').innerText());
    throw error;
  }
  const navigation = page.getByRole('complementary', { name: '管理中心导航' });
  const navigationText = (await navigation.textContent()) || '';
  for (const label of ['管理中心', '管理主页', '内容管理', '审核台', '系统运营']) assert.match(navigationText, new RegExp(label));
  assert.equal(await page.getByText(/你可以|请先|从这里/).count(), 0);
  assert.match(await page.locator('html').evaluate((node) => getComputedStyle(node).colorScheme), /dark/);

  await page.getByRole('button', { name: '审核台' }).click();
  await page.locator('section[aria-label="审核台"]').waitFor();
  assert.equal(await page.getByRole('heading', { name: '审核台', level: 1 }).count(), 0);
  await page.getByText('没有案件').waitFor();
  assert.match(page.url(), /[?&]view=review(?:&|$)/);

  await page.getByRole('button', { name: '系统运营' }).click();
  await page.locator('section[aria-label="系统运营"]').waitFor();
  assert.equal(await page.getByRole('heading', { name: '系统运营', level: 1 }).count(), 0);
  await page.getByText('Control Plane').waitFor();
  await page.getByRole('tab', { name: '事件' }).click();
  await page.getByText('repository.push').waitFor();
  await page.getByRole('button', { name: '重放' }).click();
  const replayDialog = page.getByRole('dialog', { name: '重放隔离事件' });
  await replayDialog.getByRole('textbox', { name: '操作原因' }).fill('重放隔离事件');
  await replayDialog.getByRole('button', { name: '确认重放' }).click();
  await replayDialog.waitFor({ state: 'detached' });
  assert.equal(replayRequests, 1);

  await page.getByRole('tab', { name: '一致性' }).click();
  await page.getByText('publication_event_gap').waitFor();
  await page.getByRole('button', { name: '对账' }).click();
  const reconciliationDialog = page.getByRole('dialog', { name: '单项目对账' });
  await reconciliationDialog.getByRole('textbox', { name: '操作原因' }).fill('检查并修复发布漂移');
  await reconciliationDialog.getByRole('button', { name: '运行检查' }).click();
  await reconciliationDialog.getByText('a'.repeat(64)).waitFor();
  await reconciliationDialog.getByRole('button', { name: '应用修复' }).click();
  await reconciliationDialog.waitFor({ state: 'detached' });
  assert.equal(dryRunRequests, 1);
  assert.equal(applyRequests, 1);
  assert.equal(await page.evaluate(() => performance.getEntriesByType('navigation').length), 1);
  if (process.env.RINSPACE_BROWSER_SCREENSHOT_PATH) {
    await page.screenshot({ path: process.env.RINSPACE_BROWSER_SCREENSHOT_PATH, fullPage: true });
  }

  await page.getByRole('tab', { name: '记录' }).click();
  await page.getByText('暂无运营记录').waitFor();
  assert.match(page.url(), /[?&]view=system(?:&|$)/);
  assert.match(page.url(), /[?&]system=records(?:&|$)/);

  await page.setViewportSize({ width: 390, height: 844 });
  const overflowing = await page.evaluate(() => Array.from(document.querySelectorAll('.admin-workspace-shell *'))
    .filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.right > document.documentElement.clientWidth + 1 || rect.left < -1;
    })
    .map((node) => ({ tag: node.tagName, className: node.className, rect: node.getBoundingClientRect().toJSON() }))
    .slice(0, 12));
  assert.deepEqual(overflowing, []);
  const mobileToolbar = page.locator('.admin-workspace-mobile-toolbar');
  try {
    await mobileToolbar.waitFor({ state: 'visible', timeout: 10_000 });
  } catch (error) {
    console.error(await page.locator('body').innerText());
    throw error;
  }
  const mobileTrigger = mobileToolbar.getByRole('button');
  await mobileTrigger.click();
  await page.getByRole('dialog', { name: '管理中心导航' }).waitFor();

  await context.close();
} finally {
  await browser.close();
}

console.log('admin workspace browser acceptance passed');
