import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

vi.mock('@/lib/auth/current-user', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('./actions', () => ({
  signInWithGithub: vi.fn(),
}));

import { getCurrentUser } from '@/lib/auth/current-user';
import LoginPage from './page';

const getCurrentUserMock = vi.mocked(getCurrentUser);

describe('登录页', () => {
  it('未登录时展示 GitHub 登录入口与回调地址', async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const markup = renderToStaticMarkup(
      await LoginPage({
        searchParams: Promise.resolve({ callbackUrl: '/guide' }),
      }),
    );
    expect(markup).toContain('使用 GitHub 登录');
    expect(markup).toContain('callbackUrl" value="/guide"');
  });

  it('未配置 GitHub OAuth 时给出配置提示并禁用按钮', async () => {
    const previous = process.env.AUTH_GITHUB_ID;
    delete process.env.AUTH_GITHUB_ID;
    try {
      getCurrentUserMock.mockResolvedValueOnce(null);
      const markup = renderToStaticMarkup(
        await LoginPage({ searchParams: Promise.resolve({}) }),
      );
      expect(markup).toContain('尚未配置');
      expect(markup).toContain('disabled=""');
    } finally {
      if (previous) process.env.AUTH_GITHUB_ID = previous;
    }
  });
});
