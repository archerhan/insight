import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' })),
}));

vi.mock('@/db/services/users', () => ({ findUserByEmail: vi.fn() }));
vi.mock('@/db/services/registration', () => ({ registerEmailUser: vi.fn() }));
vi.mock('@/db/services/email-verification', async () => {
  const actual = await vi.importActual<typeof import('@/db/services/email-verification')>(
    '@/db/services/email-verification',
  );
  return { ...actual, issueSignupCode: vi.fn() };
});
vi.mock('@/lib/email/mailer', () => ({
  mailerMode: vi.fn(() => 'console'),
  sendMail: vi.fn(),
}));

vi.mock('@/lib/auth/rate-limit', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/auth/rate-limit')>('@/lib/auth/rate-limit');
  return {
    ...actual,
    consumeRateLimit: vi.fn(() => ({ allowed: true, remaining: 1, retryAfterMs: 0 })),
  };
});

import { findUserByEmail } from '@/db/services/users';
import { registerEmailUser } from '@/db/services/registration';
import { issueSignupCode } from '@/db/services/email-verification';
import { mailerMode, sendMail } from '@/lib/email/mailer';
import { consumeRateLimit } from '@/lib/auth/rate-limit';
import { registerAccount, sendSignupCode } from './actions';

const findUserByEmailMock = vi.mocked(findUserByEmail);
const registerEmailUserMock = vi.mocked(registerEmailUser);
const issueSignupCodeMock = vi.mocked(issueSignupCode);
const sendMailMock = vi.mocked(sendMail);
const mailerModeMock = vi.mocked(mailerMode);
const consumeRateLimitMock = vi.mocked(consumeRateLimit);

function formData(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  data.set('email', 'Ming@Example.com');
  data.set('code', '123456');
  data.set('displayName', '明');
  data.set('password', 'zhuojian2026');
  data.set('confirmPassword', 'zhuojian2026');
  for (const [key, value] of Object.entries(overrides)) data.set(key, value);
  return data;
}

function allow() {
  consumeRateLimitMock.mockReturnValue({ allowed: true, remaining: 1, retryAfterMs: 0 });
}

describe('注册动作', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    allow();
    mailerModeMock.mockReturnValue('console');
    sendMailMock.mockResolvedValue({ ok: true });
    issueSignupCodeMock.mockResolvedValue({ code: '654321', expiresAt: new Date() });
    registerEmailUserMock.mockResolvedValue({ ok: true, userId: 'u-1' });
  });

  it('校验失败时不核销验证码、不建账号', async () => {
    const result = await registerAccount(formData({ password: 'short' }));
    expect(result.ok).toBe(false);
    expect(result.errors?.password).toBeTruthy();
    expect(registerEmailUserMock).not.toHaveBeenCalled();
  });

  it('验证码格式不对时直接提示', async () => {
    const result = await registerAccount(formData({ code: 'abc' }));
    expect(result.ok).toBe(false);
    expect(result.errors?.code).toContain('6 位');
    expect(registerEmailUserMock).not.toHaveBeenCalled();
  });

  it('注册成功：调用 registerEmailUser 并规范化邮箱', async () => {
    const result = await registerAccount(formData());
    expect(result).toEqual({ ok: true });
    expect(registerEmailUserMock).toHaveBeenCalledWith({
      email: 'ming@example.com',
      displayName: '明',
      password: 'zhuojian2026',
      code: '123456',
    });
  });

  it('验证码错误 / 过期 / 次数超限分别给出对应提示', async () => {
    registerEmailUserMock.mockResolvedValueOnce({ ok: false, reason: 'invalid_code' });
    expect((await registerAccount(formData())).errors?.code).toContain('不正确');

    registerEmailUserMock.mockResolvedValueOnce({ ok: false, reason: 'expired_code' });
    expect((await registerAccount(formData())).errors?.code).toContain('已过期');

    registerEmailUserMock.mockResolvedValueOnce({ ok: false, reason: 'too_many_attempts' });
    expect((await registerAccount(formData())).errors?.code).toContain('次数过多');
  });

  it('邮箱已注册时引导去登录', async () => {
    registerEmailUserMock.mockResolvedValueOnce({ ok: false, reason: 'email_taken' });
    const result = await registerAccount(formData());
    expect(result.errors?.email).toContain('已注册');
  });

  it('限流时直接拒绝', async () => {
    consumeRateLimitMock.mockReturnValueOnce({ allowed: false, remaining: 0, retryAfterMs: 1000 });
    const result = await registerAccount(formData());
    expect(result.message).toContain('过于频繁');
    expect(registerEmailUserMock).not.toHaveBeenCalled();
  });
});

describe('发送注册验证码', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    allow();
    mailerModeMock.mockReturnValue('console');
    sendMailMock.mockResolvedValue({ ok: true });
    issueSignupCodeMock.mockResolvedValue({ code: '654321', expiresAt: new Date() });
    findUserByEmailMock.mockResolvedValue(null);
  });

  it('邮箱格式不对时拒绝', async () => {
    const result = await sendSignupCode(formData({ email: 'nope' }));
    expect(result.ok).toBe(false);
    expect(issueSignupCodeMock).not.toHaveBeenCalled();
  });

  it('邮件服务未配置时明确告知（且不消耗冷却）', async () => {
    mailerModeMock.mockReturnValueOnce('disabled');
    const result = await sendSignupCode(formData());
    expect(result.ok).toBe(false);
    expect(result.message).toContain('邮件服务尚未配置');
    expect(consumeRateLimitMock).not.toHaveBeenCalled();
  });

  it('邮箱已注册时提示去登录', async () => {
    findUserByEmailMock.mockResolvedValueOnce({ id: 'u-1' } as never);
    const result = await sendSignupCode(formData());
    expect(result.ok).toBe(false);
    expect(result.message).toContain('已注册');
    expect(issueSignupCodeMock).not.toHaveBeenCalled();
  });

  it('冷却中返回剩余秒数', async () => {
    consumeRateLimitMock.mockReturnValueOnce({ allowed: false, remaining: 0, retryAfterMs: 42_000 });
    const result = await sendSignupCode(formData());
    expect(result.ok).toBe(false);
    expect(result.retryAfterSeconds).toBe(42);
    expect(result.message).toContain('42 秒');
  });

  it('成功时签发验证码并发送邮件', async () => {
    const result = await sendSignupCode(formData());
    expect(result.ok).toBe(true);
    expect(result.message).toContain('mi***@example.com');
    expect(issueSignupCodeMock).toHaveBeenCalledWith('ming@example.com');
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ming@example.com',
        subject: expect.stringContaining('验证码'),
        text: expect.stringContaining('654321'),
      }),
    );
  });

  it('发送失败时给出错误提示', async () => {
    sendMailMock.mockResolvedValueOnce({ ok: false, error: 'send_failed' });
    const result = await sendSignupCode(formData());
    expect(result.ok).toBe(false);
    expect(result.message).toContain('发送失败');
  });
});
