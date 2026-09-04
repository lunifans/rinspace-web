import { act, fireEvent, render } from '@testing-library/react';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { ToastProvider } from 'components/ui';
import { ensureLocaleNamespaces, i18n } from '@/i18n';
import { searchContent } from '@/services/domains/activity';

import PublishPage from './index';

vi.mock('@/components/SiteTopbarShell', () => ({ default: () => null }));
vi.mock('@/components/SiteIcpLink', () => ({ default: () => null }));
vi.mock('@/components/ImageCropDialog', () => ({ default: () => null }));

vi.mock('@/components/CodeMirrorEditor', () => ({
  default: ({
    value,
    onChange,
    ariaLabel,
    placeholder,
  }: {
    value: string;
    onChange(value: string): void;
    ariaLabel: string;
    placeholder?: string;
  }) => (
    <textarea
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  ),
}));

vi.mock('@/components/RinMilkdownEditor', () => ({
  default: ({
    value,
    onChange,
    ariaLabel,
    placeholder,
  }: {
    value: string;
    onChange(value: string): void;
    ariaLabel: string;
    placeholder?: string;
  }) => (
    <textarea
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  ),
}));

vi.mock('@/components/TagPicker', () => ({
  default: ({ ariaLabel }: { ariaLabel?: string }) => <input aria-label={ariaLabel} />,
  splitTagValues: (value: string) => value.split(/[,\s]+/).filter(Boolean),
  joinTagValues: (values: string[]) => values.join(', '),
}));

vi.mock('@/services/phoneAuth', () => ({
  getStoredSession: () => ({ access_token: 'test-token' }),
}));

vi.mock('@/services/domains/activity', () => ({ searchContent: vi.fn() }));
vi.mock('@/services/domains/article', () => ({
  createContent: vi.fn(),
  updateContent: vi.fn(),
  loadContentDetail: vi.fn(),
  isContentModerationSubmission: (value: object) => 'submissionId' in value,
}));
vi.mock('@/services/domains/book', () => ({
  attachBookChapterLink: vi.fn(),
  createBookAuthor: vi.fn(),
  searchBookAuthors: vi.fn(),
}));
vi.mock('@/services/domains/identity', () => ({ moveWorkItem: vi.fn() }));
vi.mock('@/services/domains/publication', () => ({ uploadAnswerFile: vi.fn() }));
vi.mock('@/services/domains/question', () => ({
  createQuestion: vi.fn(),
  createQuestionByAnswer: vi.fn(),
}));
vi.mock('@/utils/pdfToc', () => ({
  extractPDFTOC: vi.fn(),
  renderPDFCover: vi.fn(),
}));

function renderPublish(path: string, mode: 'question' | 'book') {
  return render(
    <HelmetProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="*" element={<PublishPage mode={mode} />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </HelmetProvider>,
  );
}

beforeEach(() => {
  vi.mocked(searchContent).mockReset();
  vi.mocked(searchContent).mockResolvedValue({ items: [], count: 0 });
});

afterEach(async () => {
  await act(async () => {
    await i18n.changeLanguage('zh-CN');
  });
});

test('retains an unsaved question draft while switching the interface language', async () => {
  await ensureLocaleNamespaces('en', ['creation']);
  await ensureLocaleNamespaces('zh-CN', ['creation']);
  await act(async () => {
    await i18n.changeLanguage('en');
  });

  const view = renderPublish('/questions/ask', 'question');

  expect(await view.findByRole('heading', { name: 'Ask a mathematics question' })).toBeTruthy();
  expect(view.getByText('Publish check')).toBeTruthy();
  const titleInput = view.getByLabelText('Title');
  const bodyInput = view.getByLabelText('Question');
  fireEvent.change(titleInput, { target: { value: '未存题' } });
  fireEvent.change(bodyInput, { target: { value: '作者尚未提交的正文' } });

  await act(async () => {
    await i18n.changeLanguage('zh-CN');
  });

  expect(await view.findByRole('heading', { name: '提一个数学问题' })).toBeTruthy();
  expect((view.getByLabelText('标题') as HTMLInputElement).value).toBe('未存题');
  expect((view.getByLabelText('问题正文') as HTMLTextAreaElement).value).toBe(
    '作者尚未提交的正文',
  );
  expect(document.title).toBe('提一个数学问题');
});

test('renders localized original and external PDF book controls', async () => {
  await ensureLocaleNamespaces('en', ['creation']);
  await act(async () => {
    await i18n.changeLanguage('en');
  });

  const view = renderPublish('/books/new?kind=pdf', 'book');

  expect(await view.findByRole('heading', { name: 'Upload PDF book' })).toBeTruthy();
  expect(view.getByRole('group', { name: 'Book type' })).toBeTruthy();
  expect(view.getByRole('button', { name: 'Original PDF' })).toBeTruthy();
  expect(view.getByText('Upload PDF (≤80 MB)')).toBeTruthy();

  fireEvent.click(view.getByRole('button', { name: 'External PDF' }));

  expect(view.getByLabelText('Authors')).toBeTruthy();
  expect(view.getByLabelText('Source URL')).toBeTruthy();
  expect(view.getByLabelText('Publisher')).toBeTruthy();
  expect(view.getByLabelText('Copyright information')).toBeTruthy();
  expect(view.getByRole('button', { name: 'Upload external PDF' })).toBeTruthy();
});
