import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/app/forgot-password/actions', () => ({ requestPasswordReset: vi.fn() }));

import ForgotPasswordPage from './page';

describe('忘记密码页', () => {
  it('展示邮箱输入与返回登录入口', () => {
    const markup = renderToStaticMarkup(<ForgotPasswordPage />);
    expect(markup).toContain('忘记密码');
    expect(markup).toContain('name="email"');
    expect(markup).toContain('发送重置链接');
    expect(markup).toContain('href="/login"');
  });
});
