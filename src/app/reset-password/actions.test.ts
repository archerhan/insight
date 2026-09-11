import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/db/services/password-reset', () => ({ consumePasswordResetToken: vi.fn() }));

import { consumePasswordResetToken } from '@/db/services/password-reset';
import { resetPassword } from './actions';

const consumeMock = vi.mocked(consumePasswordResetToken);

function formData(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  data.set('token', 'tok-123');
  data.set('password', 'zhuojian2026');
  data.set('confirmPassword', 'zhuojian2026');
  for (const [key, value] of Object.entries(overrides)) data.set(key, value);
  return data;
}

describe('重置密码动作', () => {
  beforeEach(() => consumeMock.mockReset());

  it('新密码不合规时不消费令牌', async () => {
    const result = await resetPassword(formData({ password: '12345678' }));
    expect(result.ok).toBe(false);
    expect(result.errors?.password).toBeTruthy();
    expect(consumeMock).not.toHaveBeenCalled();
  });

  it('两次输入不一致时提示', async () => {
    const result = await resetPassword(formData({ confirmPassword: 'zhuojian2027' }));
    expect(result.ok).toBe(false);
    expect(result.errors?.confirmPassword).toContain('不一致');
  });

  it('令牌无效时提示重新申请', async () => {
    consumeMock.mockResolvedValueOnce({ ok: false, reason: 'invalid' });
    const result = await resetPassword(formData());
    expect(result.ok).toBe(false);
    expect(result.message).toContain('无效或已被使用');
  });

  it('令牌过期时提示重新申请', async () => {
    consumeMock.mockResolvedValueOnce({ ok: false, reason: 'expired' });
    const result = await resetPassword(formData());
    expect(result.ok).toBe(false);
    expect(result.message).toContain('已过期');
  });

  it('成功时返回可登录提示', async () => {
    consumeMock.mockResolvedValueOnce({ ok: true, userId: 'u-1' });
    const result = await resetPassword(formData());
    expect(result).toEqual({ ok: true, message: '密码已更新，请用新密码登录' });
    expect(consumeMock).toHaveBeenCalledWith('tok-123', 'zhuojian2026');
  });
});
