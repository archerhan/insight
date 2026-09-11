import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('next-auth/react', () => ({
  signIn: vi.fn(),
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
  it('未登录时同时展示邮箱表单与 GitHub 登录入口', async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const markup = renderToStaticMarkup(
      await LoginPage({
        searchParams: Promise.resolve({ callbackUrl: '/guide' }),
      }),
    );
    expect(markup).toContain('name="email"');
    expect(markup).toContain('name="password"');
    expect(markup).toContain('还没有账号');
    expect(markup).toContain('使用 GitHub 登录');
    expect(markup).toContain('callbackUrl" value="/guide"');
  });

  it('展示 Auth.js 错误提示与注册/忘记密码入口', async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const markup = renderToStaticMarkup(
      await LoginPage({
        searchParams: Promise.resolve({ error: 'CredentialsSignin' }),
      }),
    );
    expect(markup).toContain('邮箱或密码不正确');
    expect(markup).toContain('href="/forgot-password"');
    expect(markup).toContain('href="/register?callbackUrl=%2F"');
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
