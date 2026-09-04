import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { ensureLocaleNamespaces, i18n } from '@/i18n';
import TagCreationFlow from './TagCreationFlow';

vi.mock('@/services/tagV2', () => ({
  compareCanonicalTags: async () => [{ id: 8, displayName: 'Sheaf', normalizedName: 'sheaf', usageScope: 'Algebraic geometry', parentTagIds: [2], version: 1 }],
  createCanonicalTag: async () => ({ operationId: 'op-42', state: 'active', tag: { id: 42, displayName: 'Sheaf', normalizedName: 'sheaf', usageScope: 'Category theory', parentTagIds: [], version: 1 } }),
  loadTagCreationOperation: async () => ({ operationId: 'op-42', tagId: 42, state: 'active', currentStep: 'active', retryable: false, version: 2 }),
  retryTagCreationOperation: async () => ({ operationId: 'op-42', tagId: 42, state: 'pending', currentStep: 'delivery', retryable: true, version: 2 }),
}));
vi.mock('@/services/domains/tag', () => ({ suggestTags: async () => [] }));

afterEach(async () => {
  await act(async () => {
    await i18n.changeLanguage('zh-CN');
  });
});

test('creates a parentless same-name tag after explicit context review', async () => {
  const created = vi.fn();
  const view = render(<TagCreationFlow open onOpenChange={() => {}} invocation={{ source: 'directory', initialName: 'Sheaf' }} onCreated={created} />);
  await view.findByText('ID 8');
  fireEvent.change(view.getByPlaceholderText('它在这里具体指什么？'), { target: { value: 'Category theory' } });
  expect(view.getByRole('dialog').textContent).not.toContain('知识节点');
  fireEvent.click(view.getByRole('button', { name: /创建标签/ }));
  await waitFor(() => expect(created).toHaveBeenCalled());
  expect(view.getByRole('status').textContent).toContain('已创建');
});

test('renders English controls without translating authored tag context', async () => {
  await ensureLocaleNamespaces('en', ['creation']);
  await act(async () => {
    await i18n.changeLanguage('en');
  });

  const view = render(
    <TagCreationFlow
      open
      onOpenChange={() => {}}
      invocation={{ source: 'directory', initialName: 'Sheaf' }}
    />,
  );

  await view.findByText('Tags with the same name');
  expect(view.getByRole('dialog').textContent).toContain('Algebraic geometry');
  expect(view.getByRole('dialog').textContent).toContain('Sheaf');
  expect(view.getByPlaceholderText('What does it mean in this context?')).toBeTruthy();
  expect(view.getByRole('button', { name: /Create tag/ })).toBeTruthy();
});

test('retains unsaved tag fields while switching the interface language', async () => {
  await ensureLocaleNamespaces('en', ['creation']);
  await ensureLocaleNamespaces('zh-CN', ['creation']);
  await act(async () => {
    await i18n.changeLanguage('en');
  });

  const view = render(
    <TagCreationFlow
      open
      onOpenChange={() => {}}
      invocation={{ source: 'directory', initialName: 'Derived category' }}
    />,
  );
  const scope = view.getByPlaceholderText('What does it mean in this context?');
  fireEvent.change(scope, { target: { value: '作者尚未提交的使用语境' } });

  await act(async () => {
    await i18n.changeLanguage('zh-CN');
  });

  expect((view.getByDisplayValue('Derived category') as HTMLInputElement).value).toBe(
    'Derived category',
  );
  expect(
    (view.getByPlaceholderText('它在这里具体指什么？') as HTMLTextAreaElement).value,
  ).toBe('作者尚未提交的使用语境');
});
