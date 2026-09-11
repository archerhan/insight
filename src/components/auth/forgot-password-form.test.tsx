import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestMock = vi.fn();

vi.mock('@/app/forgot-password/actions', () => ({
  requestPasswordReset: (...args: unknown[]) => requestMock(...args),
}));

import { ForgotPasswordForm } from './forgot-password-form';

describe('忘记密码表单', () => {
  beforeEach(() => requestMock.mockReset());

  it('提交后展示服务端返回的通用文案', async () => {
    requestMock.mockResolvedValueOnce({ ok: true, message: '如果该邮箱已经注册，我们已发送重置密码的邮件。' });
    render(<ForgotPasswordForm />);
    fireEvent.change(screen.getByLabelText('注册邮箱'), { target: { value: 'ming@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: '发送重置链接' }));

    await waitFor(() =>
      expect(requestMock).toHaveBeenCalledWith(expect.any(FormData)),
    );
    expect((await screen.findByRole('status')).textContent).toContain('如果该邮箱已经注册');
  });

  it('邮件服务未配置时给出错误提示', async () => {
    requestMock.mockResolvedValueOnce({ ok: false, message: '邮件服务尚未配置，暂时无法发送重置邮件，请联系管理员' });
    render(<ForgotPasswordForm />);
    fireEvent.change(screen.getByLabelText('注册邮箱'), { target: { value: 'ming@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: '发送重置链接' }));
    expect((await screen.findByRole('alert')).textContent).toContain('邮件服务尚未配置');
  });
});
