import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { ToastProvider } from 'components/ui';
import { ensureLocaleNamespaces, i18n } from '@/i18n';
import { getCurrentUser } from '@/services/profile';

import BlogMarkdownPage from './index';

const crepeState = vi.hoisted(() => ({
  constructs: 0,
  creates: 0,
  destroys: 0,
  markdown: '',
}));

vi.mock('@milkdown/crepe', () => {
  class MockCrepe {
    static Feature = {
      CodeMirror: 'CodeMirror',
      Latex: 'Latex',
      Toolbar: 'Toolbar',
      BlockEdit: 'BlockEdit',
      TopBar: 'TopBar',
      Table: 'Table',
      ImageBlock: 'ImageBlock',
      LinkTooltip: 'LinkTooltip',
      Placeholder: 'Placeholder',
    };

    editor = {
      use: vi.fn(),
      action: vi.fn(),
    };

    constructor(options: { defaultValue?: string }) {
      crepeState.constructs += 1;
      crepeState.markdown = options.defaultValue || '';
    }

    on(callback: (listener: { markdownUpdated(handler: () => void): void }) => void) {
      callback({ markdownUpdated: vi.fn() });
      return this;
    }

    async create() {
      crepeState.creates += 1;
    }

    getMarkdown() {
      return crepeState.markdown;
    }

    destroy() {
      crepeState.destroys += 1;
    }
  }

  return { Crepe: MockCrepe };
});

vi.mock('@/components/SiteTopbarShell', () => ({ default: () => null }));
vi.mock('@/components/ImageCropDialog', () => ({ default: () => null }));
vi.mock('@/components/MilkdownMarkdownArticle', () => ({
  default: ({ markdown }: { markdown: string }) => <div>{markdown}</div>,
}));
vi.mock('@/components/CodeMirrorEditor', () => ({
  default: ({ ariaLabel, value }: { ariaLabel: string; value: string }) => (
    <textarea aria-label={ariaLabel} value={value} readOnly />
  ),
}));
vi.mock('@/components/TagPicker', () => ({
  default: ({ ariaLabel }: { ariaLabel?: string }) => <input aria-label={ariaLabel} />,
  splitTagValues: (value: string) => value.split(/[,\s]+/).filter(Boolean),
  joinTagValues: (values: string[]) => values.join(', '),
}));

vi.mock('@/services/profile', () => ({
  getCurrentUser: vi.fn(),
  uploadCoverFile: vi.fn(),
}));
vi.mock('@/services/phoneAuth', () => ({
  getAuthAccessToken: vi.fn().mockResolvedValue(''),
}));
vi.mock('@/services/domains/article', () => ({
  createContent: vi.fn(),
  updateContent: vi.fn(),
  loadContentDetail: vi.fn(),
  isContentModerationSubmission: () => false,
}));
vi.mock('@/services/domains/identity', () => ({ moveWorkItem: vi.fn() }));
vi.mock('@/services/domains/publication', () => ({
  cancelMarkdownRenderJob: vi.fn(),
  loadMarkdownRenderJob: vi.fn(),
  submitMarkdownRenderJob: vi.fn(),
  uploadAnswerFile: vi.fn(),
}));

function renderWriter() {
  return render(
    <HelmetProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={['/write/markdown']}>
          <Routes>
            <Route path="/write/markdown" element={<BlogMarkdownPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </HelmetProvider>,
  );
}

beforeEach(() => {
  crepeState.constructs = 0;
  crepeState.creates = 0;
  crepeState.destroys = 0;
  crepeState.markdown = '';
  vi.mocked(getCurrentUser).mockReset();
  vi.mocked(getCurrentUser).mockResolvedValue({ id: 'author-1' });
});

afterEach(async () => {
  await act(async () => {
    await i18n.changeLanguage('zh-CN');
  });
});

test('switches Markdown writer controls without rebuilding the editor or losing the title', async () => {
  await ensureLocaleNamespaces('en', ['creation']);
  await ensureLocaleNamespaces('zh-CN', ['creation']);
  await act(async () => {
    await i18n.changeLanguage('en');
  });

  const view = renderWriter();
  const titleInput = await view.findByLabelText('Article title');
  await waitFor(() => expect(crepeState.creates).toBe(1));
  fireEvent.change(titleInput, { target: { value: '未提交的同调代数笔记' } });

  expect(view.getByLabelText('Source visibility')).toBeTruthy();
  expect(view.getByLabelText('Page state')).toBeTruthy();
  expect(view.getByRole('button', { name: 'Summary' })).toBeTruthy();

  await act(async () => {
    await i18n.changeLanguage('zh-CN');
  });

  expect((view.getByLabelText('文章标题') as HTMLInputElement).value).toBe(
    '未提交的同调代数笔记',
  );
  expect(view.getByLabelText('源码可见性')).toBeTruthy();
  expect(view.getByLabelText('页面状态')).toBeTruthy();
  expect(crepeState.constructs).toBe(1);
  expect(crepeState.creates).toBe(1);
  expect(crepeState.destroys).toBe(0);
  expect(document.title).toBe('Markdown 写作');
});
