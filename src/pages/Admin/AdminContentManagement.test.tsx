import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider } from 'components/ui';
import { ensureLocaleNamespaces, i18n } from '@/i18n';
import type { AdminQuestionInfo } from '@/services/contracts';

const adminApi = vi.hoisted(() => ({
  adminDeleteContent: vi.fn(),
  adminUpdateAnswerStatus: vi.fn(),
  adminUpdateContentStatus: vi.fn(),
  adminUpdateContentTags: vi.fn(),
  adminUpdateQuestionStatus: vi.fn(),
  adminUpdateUserStatus: vi.fn(),
  loadAdminAnswerPage: vi.fn(),
  loadAdminContentPage: vi.fn(),
  loadAdminQuestionPage: vi.fn(),
  loadAdminUserPage: vi.fn(),
}));
const groupApi = vi.hoisted(() => ({ loadCultivationPermissions: vi.fn(), updateCultivationPermissions: vi.fn() }));
const questionApi = vi.hoisted(() => ({ operateQuestion: vi.fn(), reopenQuestion: vi.fn() }));
const tagApi = vi.hoisted(() => ({ deleteTag: vi.fn(), loadTagPage: vi.fn() }));

vi.mock('@/services/domains/admin', () => adminApi);
vi.mock('@/services/domains/group', () => groupApi);
vi.mock('@/services/domains/question', () => questionApi);
vi.mock('@/services/domains/tag', () => tagApi);

import { AdminContentManagement } from './index';

const question: AdminQuestionInfo = {
  id: 'question-1',
  title: '作者保留题目标题',
  vote_count: 1234,
  show: 1,
  pin: 0,
  answer_count: 2,
  accepted_answer_id: '',
  create_time: Date.parse('2026-08-28T08:00:00Z') / 1000,
  update_time: Date.parse('2026-08-28T08:10:00Z') / 1000,
  edit_time: 0,
  status: 'available',
  tags: ['projective morphism'],
};

async function switchLanguage(language: 'en' | 'zh-CN') {
  await act(async () => {
    await i18n.changeLanguage(language);
  });
}

beforeAll(async () => {
  await ensureLocaleNamespaces('en', ['admin', 'identity']);
  await ensureLocaleNamespaces('zh-CN', ['admin', 'identity']);
});

beforeEach(async () => {
  await switchLanguage('zh-CN');
  adminApi.loadAdminQuestionPage.mockReset();
  adminApi.loadAdminQuestionPage.mockResolvedValue({ count: 1, items: [question] });
});

afterEach(async () => {
  vi.clearAllMocks();
  await switchLanguage('zh-CN');
});

describe('AdminContentManagement localization', () => {
  it('keeps the active section, filter draft, and authored values across a live language switch', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ToastProvider>
          <AdminContentManagement isAdmin={false} section="questions" onSectionChange={vi.fn()} />
        </ToastProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '作者保留题目标题' })).toBeTruthy();
    const search = screen.getByRole('textbox', { name: '搜索题目' }) as HTMLInputElement;
    await user.type(search, '保留筛选条件');
    expect(screen.getByText((_, element) => element?.tagName === 'STRONG' && element.textContent?.includes('1,234 个赞') === true)).toBeTruthy();

    await switchLanguage('en');

    expect(screen.getByRole('tab', { name: 'Q&A' }).getAttribute('data-state')).toBe('active');
    expect((screen.getByRole('textbox', { name: 'Search questions' }) as HTMLInputElement).value).toBe('保留筛选条件');
    expect(screen.getByRole('heading', { name: '作者保留题目标题' })).toBeTruthy();
    expect(screen.getByText((_, element) => element?.tagName === 'STRONG' && element.textContent?.includes('1,234 votes') === true)).toBeTruthy();
    expect(screen.getByText('projective morphism')).toBeTruthy();
  });
});
