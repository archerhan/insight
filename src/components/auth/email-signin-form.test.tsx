import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const signInMock = vi.fn();
const pushMock = vi.fn();
const refreshMock = vi.fn();

vi.mock('next-auth/react', () => ({ signIn: (...args: unknown[]) => signInMock(...args) }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

import { EmailSignInForm } from './email-signin-form';

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'ming@example.com' } });
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'zhuojian2026' } });
  fireEvent.click(screen.getByRole('button', { name: '登录' }));
}

describe('邮箱登录表单', () => {
  beforeEach(() => {
    signInMock.mockReset();
    pushMock.mockReset();
    refreshMock.mockReset();
  });

  it('提交时走 credentials provider（redirect: false 以便展示错误）', async () => {
    signInMock.mockResolvedValueOnce({ error: null, url: '/guide' });
    render(<EmailSignInForm callbackUrl="/guide" />);
    fillAndSubmit();

    await waitFor(() =>
      expect(signInMock).toHaveBeenCalledWith('credentials', {
        email: 'ming@example.com',
        password: 'zhuojian2026',
        redirect: false,
      }),
    );
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/guide'));
  });

  it('密码错误时给出中文提示', async () => {
    signInMock.mockResolvedValueOnce({ error: 'CredentialsSignin' });
    render(<EmailSignInForm />);
    fillAndSubmit();
    expect((await screen.findByRole('alert')).textContent).toContain('邮箱或密码不正确');
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('服务端配置错误时原样提示 Configuration', async () => {
    signInMock.mockResolvedValueOnce({ error: 'Configuration' });
    render(<EmailSignInForm />);
    fillAndSubmit();
    expect((await screen.findByRole('alert')).textContent).toContain('Configuration');
  });

  it('没有返回结果时按凭证错误处理', async () => {
    signInMock.mockResolvedValueOnce(undefined);
    render(<EmailSignInForm />);
    fillAndSubmit();
    expect((await screen.findByRole('alert')).textContent).toContain('邮箱或密码不正确');
  });
});
