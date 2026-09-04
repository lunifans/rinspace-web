import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { ensureLocaleNamespaces, i18n } from '@/i18n';
import { createContent, updateContent } from '@/services/domains/article';
import type { PostDetail } from '@/services/feed';

import BookProfileDialog from './BookProfileDialog';
import PublishCreateDialog from './PublishCreateDialog';

vi.mock('@/components/TagPicker', () => ({
  default: ({ placeholder }: { placeholder?: string }) => (
    <input aria-label="tag-picker" placeholder={placeholder} />
  ),
}));

vi.mock('@/components/ImageCropDialog', () => ({
  default: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock('@/services/domains/article', () => ({
  createContent: vi.fn(),
  updateContent: vi.fn(),
  isContentModerationSubmission: (value: object) => 'submissionId' in value,
}));

vi.mock('@/services/domains/publication', () => ({
  openArticleCodeWorkspace: vi.fn(),
  uploadAnswerFile: vi.fn(),
}));

vi.mock('@/services/profile', () => ({ uploadCoverFile: vi.fn() }));

vi.mock('@/utils/pdfToc', () => ({
  extractPDFTOC: vi.fn(),
  renderPDFCover: vi.fn(),
}));

const authoredBook = {
  id: 'book-42',
  slug: 'algebraic-geometry',
  type: 'book',
  title: '代数几何讲义',
  excerpt: '作者写下的中文简介',
  body: '',
  tags: ['algebraic-geometry'],
  coverUrl: '',
  book: {
    kind: 'original',
    bookTitle: '代数几何讲义',
    authors: [],
  },
} as unknown as PostDetail;

beforeEach(() => {
  vi.mocked(createContent).mockReset();
  vi.mocked(updateContent).mockReset();
});

afterEach(async () => {
  await act(async () => {
    await i18n.changeLanguage('zh-CN');
  });
});

test('renders the English book profile UI while preserving authored Chinese values', async () => {
  await ensureLocaleNamespaces('en', ['creation']);
  await act(async () => {
    await i18n.changeLanguage('en');
  });

  const view = render(
    <BookProfileDialog
      open
      post={authoredBook}
      user={{ id: 'author-1' }}
      onClose={() => {}}
      onSaved={() => {}}
    />,
  );

  expect(await view.findByRole('heading', { name: 'Edit profile' })).toBeTruthy();
  expect(view.getByDisplayValue('代数几何讲义')).toBeTruthy();
  expect(view.getByDisplayValue('作者写下的中文简介')).toBeTruthy();
  expect(view.getByPlaceholderText('Search or enter a new tag')).toBeTruthy();
  expect(view.getByRole('button', { name: 'Save profile' })).toBeTruthy();
  expect(view.getByRole('button', { name: 'Close book profile editor' })).toBeTruthy();
});

test('keeps the active book profile visible while a repository commit awaits activation', async () => {
  await ensureLocaleNamespaces('en', ['creation']);
  await act(async () => {
    await i18n.changeLanguage('en');
  });
  vi.mocked(updateContent).mockResolvedValue({
    ...authoredBook,
    publicationPending: true,
    pendingCommit: 'a'.repeat(40),
  });
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const view = render(
    <BookProfileDialog
      open
      post={authoredBook}
      user={{ id: 'author-1' }}
      onClose={onClose}
      onSaved={onSaved}
    />,
  );
  fireEvent.click(await view.findByRole('button', { name: 'Save profile' }));
  await waitFor(() => expect(view.getByRole('status').textContent).toContain('awaiting validation and activation'));
  expect(onSaved).toHaveBeenCalledTimes(1);
  expect(onClose).not.toHaveBeenCalled();
  expect(view.getByRole('heading', { name: 'Edit profile' })).toBeTruthy();
});

test('uses a localized moderation state instead of the backend message', async () => {
  await ensureLocaleNamespaces('en', ['creation']);
  await act(async () => {
    await i18n.changeLanguage('en');
  });
  vi.mocked(createContent).mockResolvedValue({
    submissionId: 'submission-42',
    state: 'manual_review_pending',
    message: '内容已进入人工审核。',
  });

  const view = render(
    <MemoryRouter>
      <PublishCreateDialog
        open
        mode="blog"
        user={{ id: 'author-1' }}
        onClose={() => {}}
      />
    </MemoryRouter>,
  );

  expect(await view.findByRole('heading', { name: 'Create LaTeX blog' })).toBeTruthy();
  fireEvent.change(view.getByLabelText('Title'), { target: { value: 'A derived category' } });
  fireEvent.change(view.getByLabelText('Summary'), { target: { value: 'An introduction' } });
  fireEvent.click(view.getByRole('button', { name: 'Create and edit' }));

  await waitFor(() => expect(view.getByRole('status').textContent).toBe('Content submitted for review.'));
  expect(view.baseElement.textContent).not.toContain('内容已进入人工审核');
});

test('localizes PDF creation controls and validation', async () => {
  await ensureLocaleNamespaces('en', ['creation']);
  await act(async () => {
    await i18n.changeLanguage('en');
  });

  const view = render(
    <MemoryRouter>
      <PublishCreateDialog
        open
        mode="pdf-book"
        user={{ id: 'author-1' }}
        onClose={() => {}}
      />
    </MemoryRouter>,
  );

  expect(await view.findByRole('heading', { name: 'Upload PDF book' })).toBeTruthy();
  expect(view.getByText('Upload PDF (≤80 MB)')).toBeTruthy();
  fireEvent.change(view.getByLabelText('Title'), { target: { value: 'Algebraic geometry' } });
  fireEvent.click(view.getByRole('button', { name: 'Create and edit' }));
  expect(await view.findByText('Upload a PDF file first.')).toBeTruthy();
});
