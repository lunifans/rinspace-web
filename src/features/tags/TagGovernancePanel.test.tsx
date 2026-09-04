import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, expect, test, vi } from 'vitest';

import { ensureLocaleNamespaces, i18n } from '@/i18n';
import TagGovernancePanel from './TagGovernancePanel';

const suggest = vi.fn();
const rename = vi.fn();
const propose = vi.fn(async (..._args: unknown[]) => ({ id: 'statement-2', subjectTagId: 42, predicateTagId: 70, objectTagId: 9, evidence: {}, reviewState: 'proposed', rank: 0, reason: 'Need it.', version: 1, createdAt: '2026-08-21T00:00:00Z' }));

vi.mock('@/services/domains/tag', () => ({
  suggestTags: async (query: string) => [{ tagId: query === 'Context' ? '10' : '9', slug: query.toLowerCase(), name: query, displayName: query, postCount: 0, parentTags: [] }],
}));

vi.mock('@/services/tagV2', () => ({
  loadTagImpact: async () => ({ tagId: 42, version: 7, directChildren: 2, descendants: 5, associations: 11, aliases: 1, pendingParentReviews: 0, dependencies: 3, dependants: 2, references: 6, backlinks: 4, redirects: 0 }),
  loadTagAliases: async () => [{ id: 8, tagId: 42, tagVersion: 7, displayName: 'Old name', normalizedName: 'old name', reviewState: 'reviewed' }],
  loadTagGovernanceHistory: async () => [{ id: 4, eventType: 'tag.reparented', baseVersion: 6, newVersion: 7, reason: 'Clarify the hierarchy.', before: {}, after: {}, createdAt: '2026-08-21T00:00:00Z' }],
  suggestTagParents: (...args: unknown[]) => suggest(...args),
  renameCanonicalTag: (...args: unknown[]) => rename(...args),
  addCanonicalTagAlias: async () => ({ id: 9, tagId: 42, tagVersion: 8, displayName: 'Alias', normalizedName: 'alias', reviewState: 'unreviewed' }),
  proposeTagRequires: (...args: unknown[]) => propose(...args),
}));

const props = {
  tagId: 42,
  displayName: 'Current name',
  version: 7,
  parentTags: [{ tagId: '2', slugName: 'old-parent', displayName: '旧父标签' }],
};

beforeAll(async () => {
  await ensureLocaleNamespaces('zh-CN', ['reader']);
  await ensureLocaleNamespaces('en', ['reader']);
});

beforeEach(async () => {
  await act(async () => {
    await i18n.changeLanguage('zh-CN');
  });
});

test('opens maintenance in a dialog and shows the parent label without its id', async () => {
  render(<TagGovernancePanel {...props} />);
  fireEvent.click(screen.getByRole('button', { name: '维护标签' }));
  expect(screen.getByRole('dialog', { name: '维护标签' })).toBeTruthy();
  expect(screen.getByText('旧父标签')).toBeTruthy();
  expect(screen.queryByText('2')).toBeNull();
  await waitFor(() => expect(screen.getByText('关联内容')).toBeTruthy());
  expect(screen.queryByText('待审父级')).toBeNull();
});

test('preserves name input on a stale-version conflict', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  rename.mockRejectedValueOnce(new Error('tag_version_conflict（409）'));
  render(<TagGovernancePanel {...props} />);
  fireEvent.click(screen.getByRole('button', { name: '维护标签' }));
  fireEvent.click(screen.getByRole('tab', { name: '名称' }));
  const panel = within(screen.getByRole('tabpanel'));
  fireEvent.change(panel.getByLabelText(/变更理由/), { target: { value: 'Need a clearer name.' } });
  fireEvent.change(panel.getByLabelText('名称'), { target: { value: 'New name' } });
  fireEvent.click(panel.getByRole('button', { name: '重命名' }));
  await waitFor(() => expect(screen.getByText(/版本已变化/)).toBeTruthy());
  expect((panel.getByLabelText('名称') as HTMLInputElement).value).toBe('New name');
  consoleError.mockRestore();
});

test('submits a requires proposal using a selected tag', async () => {
  render(<TagGovernancePanel {...props} />);
  fireEvent.click(screen.getByRole('button', { name: '维护标签' }));
  fireEvent.click(screen.getByRole('tab', { name: '先修关系' }));
  const panel = within(screen.getByRole('tabpanel'));
  fireEvent.change(panel.getByLabelText(/变更理由/), { target: { value: 'Need it.' } });
  fireEvent.change(panel.getByLabelText('搜索先修标签'), { target: { value: 'Prerequisite' } });
  fireEvent.click(await panel.findByRole('button', { name: /Prerequisite/ }));
  fireEvent.click(panel.getByRole('button', { name: '提交提案' }));
  await waitFor(() => expect(propose).toHaveBeenCalledWith(42, expect.objectContaining({ objectTagId: 9, reason: 'Need it.' })));
});

test('renders English maintenance controls while preserving authored labels', async () => {
  await act(async () => {
    await i18n.changeLanguage('en');
  });
  render(<TagGovernancePanel {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Maintain tag' }));

  expect(screen.getByRole('dialog', { name: 'Maintain tag' })).toBeTruthy();
  expect(screen.getByText('旧父标签')).toBeTruthy();
  expect(screen.getByRole('tab', { name: 'Classification' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Submit for review' })).toBeTruthy();
  await waitFor(() => expect(screen.getByText('Related content')).toBeTruthy());
});
