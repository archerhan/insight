import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const resetPasswordMock = vi.fn();
const pushMock = vi.fn();

vi.mock('@/app/reset-password/actions', () => ({
  resetPassword: (...args: unknown[]) => resetPasswordMock(...args),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
}));

import { ResetPasswordForm } from './reset-password-form';

function fill(password: string, confirmPassword: string) {
  fireEvent.change(screen.getByLabelText('新密码'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('确认新密码'), { target: { value: confirmPassword } });
}

describe('重置密码表单', () => {
  beforeEach(() => {
    resetPasswordMock.mockReset();
    pushMock.mockReset();
  });

  it('成功后回到登录页', async () => {
    resetPasswordMock.mockResolvedValueOnce({ ok: true, message: '密码已更新' });
    render(<ResetPasswordForm token="tok-1" />);
    fill('zhuojian2026', 'zhuojian2026');
    fireEvent.click(screen.getByRole('button', { name: '保存新密码' }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login?reset=1'));
  });

  it('令牌失效时展示服务端提示', async () => {
    resetPasswordMock.mockResolvedValueOnce({ ok: false, message: '重置链接已过期，请重新申请' });
    render(<ResetPasswordForm token="tok-1" />);
    fill('zhuojian2026', 'zhuojian2026');
    fireEvent.click(screen.getByRole('button', { name: '保存新密码' }));
    expect((await screen.findByRole('alert')).textContent).toContain('已过期');
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('字段错误展示在对应输入框下', async () => {
    resetPasswordMock.mockResolvedValueOnce({ ok: false, errors: { password: '密码至少 8 位' } });
    render(<ResetPasswordForm token="tok-1" />);
    fill('short', 'short');
    fireEvent.click(screen.getByRole('button', { name: '保存新密码' }));
    expect(await screen.findByText('密码至少 8 位')).toBeTruthy();
  });
});
