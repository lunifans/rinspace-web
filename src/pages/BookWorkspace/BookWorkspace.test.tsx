import { act, fireEvent, render } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { ToastProvider } from 'components/ui';
import { ensureLocaleNamespaces, i18n } from '@/i18n';
import { loadContentDetail } from '@/services/domains/article';
import type { PostDetail } from '@/services/feed';
import { getCurrentUser } from '@/services/profile';

import BookWorkspacePage from './index';

vi.mock('@/components/SiteTopbarShell', () => ({ default: () => null }));
vi.mock('@/features/publish/BookProfileDialog', () => ({ default: () => null }));

vi.mock('@/services/domains/article', () => ({
  loadContentDetail: vi.fn(),
  updateContent: vi.fn(),
}));

vi.mock('@/services/domains/book', () => ({
  loadBookImportJob: vi.fn(),
  startBookImportJob: vi.fn(),
  openBookCodeWorkspace: vi.fn(),
}));

vi.mock('@/services/profile', () => ({ getCurrentUser: vi.fn() }));

const markdownProject = {
  version: '0.1',
  title: '代数几何讲义',
  files: [
    {
      id: 'chapter-1',
      path: '01-schemes.md',
      title: '概形',
      body: '# 概形\n\n作者正文',
      level: 2,
    },
  ],
  toc: [{ id: 'chapter-1', text: '概形', level: 2 }],
  pages: [{ id: 'chapter-1', text: '概形', level: 2, html: '<h1>概形</h1>' }],
};

const authoredBook = {
  id: 'book-42',
  slug: 'algebraic-geometry',
  type: 'book',
  title: '代数几何讲义',
  excerpt: '作者写下的中文简介',
  body: `[[RIN_MARKDOWN_BOOK]]\n${JSON.stringify(markdownProject)}\n[[/RIN_MARKDOWN_BOOK]]`,
  publishStatus: 'published',
  author: 'Author',
  authorId: 'author-1',
  authorUid: 'author-1',
  tags: ['algebraic-geometry'],
  coverUrl: '',
  book: {
    kind: 'markdown',
    bookTitle: '代数几何讲义',
    authors: [],
  },
} as unknown as PostDetail;

function renderWorkspace() {
  return render(
    <HelmetProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={['/books/book-42/workspace']}>
          <Routes>
            <Route path="/books/:postId/workspace" element={<BookWorkspacePage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </HelmetProvider>,
  );
}

beforeEach(() => {
  vi.mocked(loadContentDetail).mockReset();
  vi.mocked(getCurrentUser).mockReset();
  vi.mocked(loadContentDetail).mockResolvedValue(authoredBook);
  vi.mocked(getCurrentUser).mockResolvedValue({ id: 'author-1' });
});

afterEach(async () => {
  await act(async () => {
    await i18n.changeLanguage('zh-CN');
  });
});

test('switches workspace controls without losing authored or unsaved values', async () => {
  await ensureLocaleNamespaces('en', ['creation']);
  await ensureLocaleNamespaces('zh-CN', ['creation']);
  await act(async () => {
    await i18n.changeLanguage('en');
  });

  const view = renderWorkspace();

  expect(await view.findByText('Markdown book workspace')).toBeTruthy();
  expect(view.getByText('作者写下的中文简介')).toBeTruthy();
  expect(await view.findByText('概形')).toBeTruthy();
  expect(await view.findByText('1 page')).toBeTruthy();
  expect(view.getByText('1 file')).toBeTruthy();
  expect(document.title).toBe('代数几何讲义 workspace');

  const chapterInput = view.getByLabelText('New chapter title');
  fireEvent.change(chapterInput, { target: { value: '未保存的新章节' } });

  await act(async () => {
    await i18n.changeLanguage('zh-CN');
  });

  expect(await view.findByText('Markdown 书籍工作台')).toBeTruthy();
  expect((view.getByLabelText('新章节标题') as HTMLInputElement).value).toBe(
    '未保存的新章节',
  );
  expect(view.getByText('作者写下的中文简介')).toBeTruthy();
  expect(loadContentDetail).toHaveBeenCalledTimes(1);
});

test('does not expose a raw Chinese load failure in the English workspace', async () => {
  await ensureLocaleNamespaces('en', ['creation']);
  await act(async () => {
    await i18n.changeLanguage('en');
  });
  vi.mocked(loadContentDetail).mockRejectedValue(new Error('数据库暂时不可用。'));

  const view = renderWorkspace();

  expect(await view.findByText('The book workspace could not be loaded.')).toBeTruthy();
  expect(view.baseElement.textContent).not.toContain('数据库暂时不可用');
});
