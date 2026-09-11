import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({ 'x-forwarded-for': '203.0.113.9' })),
}));

vi.mock('@/db/services/users', () => ({ findUserByEmail: vi.fn() }));
vi.mock('@/db/services/password-reset', () => ({ issuePasswordResetToken: vi.fn() }));
vi.mock('@/lib/email/mailer', () => ({ sendMail: vi.fn() }));

vi.mock('@/lib/auth/rate-limit', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth/rate-limit')>('@/lib/auth/rate-limit');
  return { ...actual, consumeRateLimit: vi.fn(() => ({ allowed: true, remaining: 1, retryAfterMs: 0 })) };
});

import { findUserByEmail } from '@/db/services/users';
import { issuePasswordResetToken } from '@/db/services/password-reset';
import { sendMail } from '@/lib/email/mailer';
import { consumeRateLimit } from '@/lib/auth/rate-limit';
import { requestPasswordReset } from './actions';

const findUserByEmailMock = vi.mocked(findUserByEmail);
const issueMock = vi.mocked(issuePasswordResetToken);
const sendMailMock = vi.mocked(sendMail);
const consumeRateLimitMock = vi.mocked(consumeRateLimit);

const activeUser = {
  id: 'u-1',
  email: 'ming@example.com',
  displayName: '明',
  passwordHash: 'scrypt$...',
  status: 'active',
} as never;

function formData(email: string): FormData {
  const data = new FormData();
  data.set('email', email);
  return data;
}

describe('忘记密码动作', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consumeRateLimitMock.mockReturnValue({ allowed: true, remaining: 1, retryAfterMs: 0 });
    sendMailMock.mockResolvedValue({ ok: true });
  });

  it('邮箱格式不对时直接提示', async () => {
    const result = await requestPasswordReset(formData('bad'));
    expect(result.ok).toBe(false);
    expect(findUserByEmailMock).not.toHaveBeenCalled();
  });

  it('邮箱不存在时也返回统一文案（避免枚举）', async () => {
    findUserByEmailMock.mockResolvedValueOnce(null);
    const result = await requestPasswordReset(formData('nobody@example.com'));
    expect(result.ok).toBe(true);
    expect(result.message).toContain('如果该邮箱已经注册');
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('GitHub 账号（无密码）不发重置邮件', async () => {
    findUserByEmailMock.mockResolvedValueOnce({ ...(activeUser as object), passwordHash: null } as never);
    const result = await requestPasswordReset(formData('ming@example.com'));
    expect(result.ok).toBe(true);
    expect(issueMock).not.toHaveBeenCalled();
  });

  it('正常用户：签发令牌并发送带链接的邮件', async () => {
    findUserByEmailMock.mockResolvedValueOnce(activeUser);
    issueMock.mockResolvedValueOnce({ token: 'tok-123', expiresAt: new Date() });
    const result = await requestPasswordReset(formData('Ming@Example.com'));

    expect(result.ok).toBe(true);
    expect(issueMock).toHaveBeenCalledWith('u-1');
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ming@example.com',
        subject: expect.stringContaining('重置'),
        text: expect.stringContaining('/reset-password?token=tok-123'),
      }),
    );
  });

  it('邮件服务未配置时明确告知用户', async () => {
    findUserByEmailMock.mockResolvedValueOnce(activeUser);
    issueMock.mockResolvedValueOnce({ token: 'tok-123', expiresAt: new Date() });
    sendMailMock.mockResolvedValueOnce({ ok: false, error: 'not_configured' });
    const result = await requestPasswordReset(formData('ming@example.com'));
    expect(result.ok).toBe(false);
    expect(result.message).toContain('邮件服务尚未配置');
  });

  it('限流时仍然返回统一文案，且不发邮件', async () => {
    consumeRateLimitMock.mockReturnValueOnce({ allowed: false, remaining: 0, retryAfterMs: 1000 });
    const result = await requestPasswordReset(formData('ming@example.com'));
    expect(result.ok).toBe(true);
    expect(findUserByEmailMock).not.toHaveBeenCalled();
  });
});
