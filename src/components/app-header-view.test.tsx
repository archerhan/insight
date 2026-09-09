import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const usePathnameMock = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => usePathnameMock(),
}));

vi.mock('@/app/actions/auth', () => ({
  signOutAction: vi.fn(),
}));

import { AppHeaderView } from './app-header-view';

describe('全局顶栏', () => {
  afterEach(cleanup);

  beforeEach(() => {
    usePathnameMock.mockReturnValue('/');
  });

  it('未登录：展示品牌、导航与登录入口', () => {
    render(<AppHeaderView user={null} />);
    expect(screen.getByRole('link', { name: /灼见首页/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: '广场' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '我的战绩' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '发起话题' }).getAttribute('href')).toBe('/topics/new');
    expect(screen.getByRole('link', { name: '登录' }).getAttribute('href')).toBe('/login');
  });

  it('已登录：显示头像昵称与退出按钮', () => {
    render(
      <AppHeaderView
        user={{ displayName: '明', avatarUrl: null }}
      />,
    );
    expect(screen.getAllByText('明').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /退出登录/ })).toBeTruthy();
    expect(screen.queryByRole('link', { name: '登录' })).toBeNull();
  });

  it('我的战绩页高亮对应导航项', () => {
    usePathnameMock.mockReturnValue('/me');
    render(<AppHeaderView user={null} />);
    expect(screen.getByRole('link', { name: '我的战绩' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(screen.getByRole('link', { name: '广场' }).getAttribute('aria-current')).toBeNull();
  });

  it('有头像时展示头像图而不是首字占位', () => {
    const { container } = render(
      <AppHeaderView
        user={{ displayName: '辩手', avatarUrl: 'https://example.com/avatar.png' }}
      />,
    );
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'https://example.com/avatar.png',
    );
    expect(screen.queryByText('辩')).toBeNull();
  });
});
