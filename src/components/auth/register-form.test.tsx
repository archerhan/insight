import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const registerAccountMock = vi.fn();
const sendSignupCodeMock = vi.fn();
const signInMock = vi.fn();
const pushMock = vi.fn();
const refreshMock = vi.fn();

vi.mock('@/app/register/actions', () => ({
  registerAccount: (...args: unknown[]) => registerAccountMock(...args),
  sendSignupCode: (...args: unknown[]) => sendSignupCodeMock(...args),
}));
vi.mock('next-auth/react', () => ({ signIn: (...args: unknown[]) => signInMock(...args) }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

import { RegisterForm } from './register-form';

function fill(overrides: Record<string, string> = {}) {
  const values = {
    邮箱: 'ming@example.com',
    昵称: '明',
    密码: 'zhuojian2026',
    确认密码: 'zhuojian2026',
    ...overrides,
  };
  for (const [label, value] of Object.entries(values)) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
}

describe('注册表单', () => {
  beforeEach(() => {
    registerAccountMock.mockReset();
    sendSignupCodeMock.mockReset();
    signInMock.mockReset();
    pushMock.mockReset();
    refreshMock.mockReset();
  });

  it('注册成功后自动登录并跳到目标页', async () => {
    registerAccountMock.mockResolvedValueOnce({ ok: true });
    signInMock.mockResolvedValueOnce({ error: null, url: '/guide' });
    render(<RegisterForm callbackUrl="/guide" />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: '创建账号' }));

    await waitFor(() => expect(registerAccountMock).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(signInMock).toHaveBeenCalledWith('credentials', {
        email: 'ming@example.com',
        password: 'zhuojian2026',
        redirect: false,
      }),
    );
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/guide'));
  });

  it('字段错误来自服务端校验', async () => {
    registerAccountMock.mockResolvedValueOnce({
      ok: false,
      errors: { email: '该邮箱已注册，请直接登录或使用忘记密码' },
    });
    render(<RegisterForm />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: '创建账号' }));
    expect(await screen.findByText(/该邮箱已注册/)).toBeTruthy();
    expect(signInMock).not.toHaveBeenCalled();
  });

  it('表单级错误（如限流）展示在顶部', async () => {
    registerAccountMock.mockResolvedValueOnce({ ok: false, message: '注册过于频繁，请稍后再试' });
    render(<RegisterForm />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: '创建账号' }));
    expect(await screen.findByText('注册过于频繁，请稍后再试')).toBeTruthy();
  });

  it('自动登录失败时退回登录页', async () => {
    registerAccountMock.mockResolvedValueOnce({ ok: true });
    signInMock.mockResolvedValueOnce({ error: 'CredentialsSignin' });
    render(<RegisterForm />);
    fill();
    fireEvent.click(screen.getByRole('button', { name: '创建账号' }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login?registered=1'));
  });

  it('点击"发送验证码"调用服务端并进入倒计时', async () => {
    sendSignupCodeMock.mockResolvedValueOnce({
      ok: true,
      message: '验证码已发送到 mi***@example.com，10 分钟内有效',
      retryAfterSeconds: 60,
    });
    render(<RegisterForm />);
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'ming@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: '发送验证码' }));

    expect(await screen.findByText(/验证码已发送到/)).toBeTruthy();
    expect(sendSignupCodeMock).toHaveBeenCalledWith(expect.any(FormData));
    await waitFor(() => expect(screen.getByRole('button', { name: /后重发/ })).toBeTruthy());
  });

  it('发送验证码失败时展示错误原因', async () => {
    sendSignupCodeMock.mockResolvedValueOnce({
      ok: false,
      message: '该邮箱已注册，请直接登录或使用忘记密码',
    });
    render(<RegisterForm />);
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'ming@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: '发送验证码' }));
    expect((await screen.findByRole('alert')).textContent).toContain('已注册');
  });
});
