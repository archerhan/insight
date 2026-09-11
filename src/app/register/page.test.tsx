import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const redirectMock = vi.fn();

vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('next-auth/react', () => ({ signIn: vi.fn() }));

vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser: vi.fn() }));

vi.mock('@/app/register/actions', () => ({ registerAccount: vi.fn() }));

import { getCurrentUser } from '@/lib/auth/current-user';
import RegisterPage from './page';

const getCurrentUserMock = vi.mocked(getCurrentUser);

describe('注册页', () => {
  it('展示邮箱注册表单与登录入口', async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const markup = renderToStaticMarkup(
      await RegisterPage({ searchParams: Promise.resolve({ callbackUrl: '/guide' }) }),
    );
    expect(markup).toContain('创建灼见账号');
    expect(markup).toContain('name="email"');
    expect(markup).toContain('name="code"');
    expect(markup).toContain('发送验证码');
    expect(markup).toContain('name="displayName"');
    expect(markup).toContain('name="confirmPassword"');
    expect(markup).toContain('/login?callbackUrl=%2Fguide');
  });

  it('已登录用户直接跳到目标页', async () => {
    getCurrentUserMock.mockResolvedValueOnce({ id: 'u-1' } as never);
    await RegisterPage({ searchParams: Promise.resolve({ callbackUrl: '/topics/abc' }) });
    expect(redirectMock).toHaveBeenCalledWith('/topics/abc');
  });

  it('非法回调地址回退到须知页', async () => {
    getCurrentUserMock.mockResolvedValueOnce({ id: 'u-1' } as never);
    await RegisterPage({ searchParams: Promise.resolve({ callbackUrl: 'https://evil.example' }) });
    expect(redirectMock).toHaveBeenCalledWith('/guide');
  });
});
