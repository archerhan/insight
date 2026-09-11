import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/app/reset-password/actions', () => ({ resetPassword: vi.fn() }));

vi.mock('@/db/services/password-reset', () => ({ findPasswordResetToken: vi.fn() }));

import { findPasswordResetToken } from '@/db/services/password-reset';
import ResetPasswordPage from './page';

const findMock = vi.mocked(findPasswordResetToken);

function lookup(overrides: Record<string, unknown> = {}) {
  return {
    tokenId: 't-1',
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
    user: { id: 'u-1', email: 'ming@example.com', displayName: '明' },
    ...overrides,
  } as never;
}

describe('重置密码页', () => {
  it('令牌有效时展示脱敏邮箱与新密码表单', async () => {
    findMock.mockResolvedValueOnce(lookup());
    const markup = renderToStaticMarkup(
      await ResetPasswordPage({ searchParams: Promise.resolve({ token: 'tok-1' }) }),
    );
    expect(markup).toContain('设置新密码');
    expect(markup).toContain('mi***@example.com');
    expect(markup).toContain('name="password"');
  });

  it('没有 token 时提示重新申请', async () => {
    const markup = renderToStaticMarkup(
      await ResetPasswordPage({ searchParams: Promise.resolve({}) }),
    );
    expect(markup).toContain('重置链接已失效');
    expect(markup).toContain('href="/forgot-password"');
    expect(findMock).not.toHaveBeenCalled();
  });

  it('令牌过期或已使用时同样提示重新申请', async () => {
    findMock.mockResolvedValueOnce(lookup({ expiresAt: new Date(Date.now() - 1000) }));
    const expired = renderToStaticMarkup(
      await ResetPasswordPage({ searchParams: Promise.resolve({ token: 'tok-1' }) }),
    );
    expect(expired).toContain('重置链接已失效');

    findMock.mockResolvedValueOnce(lookup({ usedAt: new Date() }));
    const used = renderToStaticMarkup(
      await ResetPasswordPage({ searchParams: Promise.resolve({ token: 'tok-1' }) }),
    );
    expect(used).toContain('重置链接已失效');
  });
});
