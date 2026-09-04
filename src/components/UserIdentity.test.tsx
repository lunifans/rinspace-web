import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AnswerUserInfo } from '@/services/feed';

const { followTarget, getCurrentUser, loadPersonalUserInfo } = vi.hoisted(() => ({
  loadPersonalUserInfo: vi.fn(),
  followTarget: vi.fn(),
  getCurrentUser: vi.fn(),
}));

vi.mock('@/services/domains/identity', () => ({
  loadPersonalUserInfo,
  followTarget,
}));

vi.mock('@/services/profile', () => ({
  getCurrentUser,
}));

import UserIdentity from './UserIdentity';

function profile(overrides: Partial<AnswerUserInfo> = {}): AnswerUserInfo {
  return {
    id: 'user-42',
    created_at: 0,
    last_login_date: 0,
    username: 'lunifans',
    follow_count: 13,
    following_count: 14,
    answer_count: 2,
    question_count: 3,
    rank: 1403,
    display_name: 'Lunifans',
    avatar: '/avatar.jpg',
    cover_url: '/cover.jpg',
    mobile: '',
    bio: '最高权限管理员。',
    bio_html: '',
    website: 'lunifans.com',
    location: '代数几何',
    about_html: '',
    status: 'active',
    suspended_until: 0,
    is_follower: false,
    ...overrides,
  };
}

function renderIdentity(username: string) {
  return render(
    <MemoryRouter>
      <UserIdentity name="Lunifans" username={username} imageUrl="/avatar.jpg" rank={1403} />
    </MemoryRouter>,
  );
}

describe('UserIdentity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue({ id: 'viewer-7', username: 'reader' });
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
  });

  it('keeps its profile link and waits for intent before loading profile data', async () => {
    loadPersonalUserInfo.mockResolvedValue(profile({ username: 'intent-user' }));
    renderIdentity('intent-user');

    const link = screen.getByRole('link', { name: /Lunifans/ });
    expect(link.getAttribute('href')).toBe('/@intent-user');
    expect(loadPersonalUserInfo).not.toHaveBeenCalled();

    fireEvent.focus(link);
    expect(await screen.findByText('最高权限管理员。')).toBeTruthy();
    expect(loadPersonalUserInfo).toHaveBeenCalledWith('intent-user');
  });

  it('uses the real follow response for follow and unfollow state', async () => {
    loadPersonalUserInfo.mockResolvedValue(profile({ username: 'follow-user' }));
    followTarget
      .mockResolvedValueOnce({ targetType: 'user', targetId: 'user-42', following: true, followerCount: 14 })
      .mockResolvedValueOnce({ targetType: 'user', targetId: 'user-42', following: false, followerCount: 13 });
    renderIdentity('follow-user');

    fireEvent.focus(screen.getByRole('link', { name: /Lunifans/ }));
    const card = await screen.findByLabelText('Lunifans 的个人资料预览');
    const followButton = await within(card).findByRole('button', { name: '关注' });
    fireEvent.click(followButton);
    await waitFor(() => expect(within(card).getByRole('button', { name: '取消关注' })).toBeTruthy());
    expect(within(card).getByText((_, element) => element?.textContent === '14 粉丝')).toBeTruthy();
    expect(followTarget).toHaveBeenNthCalledWith(1, {
      targetType: 'user',
      targetId: 'user-42',
      isCancel: false,
    });

    fireEvent.click(within(card).getByRole('button', { name: '取消关注' }));
    await waitFor(() => expect(within(card).getByRole('button', { name: '关注' })).toBeTruthy());
    expect(followTarget).toHaveBeenNthCalledWith(2, {
      targetType: 'user',
      targetId: 'user-42',
      isCancel: true,
    });
  });

  it('preserves follow state and hides the raw API error when the request fails', async () => {
    loadPersonalUserInfo.mockResolvedValue(profile({ username: 'error-user' }));
    followTarget.mockRejectedValue(new Error('请先登录后关注。'));
    getCurrentUser.mockResolvedValue(null);
    renderIdentity('error-user');

    fireEvent.focus(screen.getByRole('link', { name: /Lunifans/ }));
    const card = await screen.findByLabelText('Lunifans 的个人资料预览');
    fireEvent.click(await within(card).findByRole('button', { name: '关注' }));
    expect(await within(card).findByText('关注状态更新失败。')).toBeTruthy();
    expect(within(card).queryByText('请先登录后关注。')).toBeNull();
    expect(within(card).getByRole('button', { name: '关注' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('does not show a follow control on the current user card', async () => {
    loadPersonalUserInfo.mockResolvedValue(profile({ username: 'self-user' }));
    getCurrentUser.mockResolvedValue({ id: 'user-42', username: 'self-user' });
    renderIdentity('self-user');

    fireEvent.focus(screen.getByRole('link', { name: /Lunifans/ }));
    expect(await screen.findByText('最高权限管理员。')).toBeTruthy();
    const card = screen.getByLabelText('Lunifans 的个人资料预览');
    expect(within(card).queryByRole('button', { name: '关注' })).toBeNull();
  });
});
