import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/auth/current-user', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/components/app-header-view', () => ({
  AppHeaderView: ({ user }: { user: { displayName: string } | null }) =>
    user ? <header data-session="on">{user.displayName}</header> : <header data-session="off" />,
}));

import { getCurrentUser } from '@/lib/auth/current-user';
import { AppHeader } from './app-header';

const getCurrentUserMock = vi.mocked(getCurrentUser);

describe('全局壳顶栏（服务端装配）', () => {
  it('未登录时把 null 传给视图', async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const markup = renderToStaticMarkup(await AppHeader());
    expect(markup).toContain('data-session="off"');
  });

  it('已登录时把展示名与头像传给视图', async () => {
    getCurrentUserMock.mockResolvedValueOnce({
      id: 'u-1',
      displayName: '明',
      avatarUrl: null,
    } as never);
    const markup = renderToStaticMarkup(await AppHeader());
    expect(markup).toContain('data-session="on"');
    expect(markup).toContain('明');
  });
});
