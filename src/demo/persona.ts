import type { RuntimeAuthSnapshot } from '@/platform/runtime';

const demoMemberAvatarSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="24" fill="#243447"/><circle cx="48" cy="48" r="27" fill="none" stroke="#9ed7c1" stroke-width="5"/><circle cx="67" cy="34" r="7" fill="#f5c26b"/><path d="M27 59c12-7 30-7 42 0" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/></svg>';

export const demoMemberIdentity = Object.freeze({
  id: 'demo-user-member',
  username: 'demo-orbit-reader',
  publicUserId: 'demo-orbit-reader',
  displayName: '轨道读者',
  avatarUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(demoMemberAvatarSvg)}`,
  language: 'zh-CN',
  colorScheme: 'system',
}) satisfies NonNullable<RuntimeAuthSnapshot['user']>;
