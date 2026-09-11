import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sendMailMock = vi.fn();
const createTransportMock = vi.fn((config: unknown) => {
  void config;
  return { sendMail: sendMailMock };
});

vi.mock('nodemailer', () => ({
  default: { createTransport: (config: unknown) => createTransportMock(config) },
}));

import {
  fromAddress,
  isMailerConfigured,
  isResendConfigured,
  mailerMode,
  resetMailerCache,
  resolveResendConfig,
  resolveSmtpConfig,
  resolveMailProvider,
  sendMail,
} from './mailer';

const SMTP_ENV = {
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: '465',
  SMTP_USER: 'no-reply@example.com',
  SMTP_PASS: 'secret',
  SMTP_FROM: '灼见 <no-reply@example.com>',
};

describe('邮件发送', () => {
  beforeEach(() => {
    resetMailerCache();
    sendMailMock.mockReset();
    createTransportMock.mockClear();
  });

  afterEach(() => vi.restoreAllMocks());

  it('配置判定与运行模式', () => {
    expect(isMailerConfigured({})).toBe(false);
    expect(isMailerConfigured({ SMTP_HOST: 'smtp.example.com' })).toBe(false);
    expect(isMailerConfigured(SMTP_ENV)).toBe(true);
    expect(mailerMode({ NODE_ENV: 'development' })).toBe('console');
    expect(mailerMode({ NODE_ENV: 'production' })).toBe('disabled');
    expect(mailerMode({ ...SMTP_ENV, NODE_ENV: 'production' })).toBe('smtp');
  });

  it('解析 SMTP 配置：465 默认加密，587 默认明文，可显式覆盖', () => {
    expect(resolveSmtpConfig(SMTP_ENV)).toMatchObject({ port: 465, secure: true });
    expect(
      resolveSmtpConfig({ ...SMTP_ENV, SMTP_PORT: '587', SMTP_SECURE: 'false' }),
    ).toMatchObject({ port: 587, secure: false });
    expect(resolveSmtpConfig({ ...SMTP_ENV, SMTP_PORT: 'abc' })).toMatchObject({ port: 465 });
    expect(resolveSmtpConfig({})).toBeNull();
    expect(resolveSmtpConfig({ ...SMTP_ENV, SMTP_USER: '', SMTP_PASS: '' })).toMatchObject({
      user: undefined,
      pass: undefined,
    });
  });

  it('开发环境未配置 SMTP 时打印到日志并视为成功', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const result = await sendMail(
      { to: 'ming@example.com', subject: '重置密码', text: '链接：https://example.com/r?t=1' },
      { NODE_ENV: 'development' },
    );
    expect(result).toEqual({ ok: true });
    expect(info).toHaveBeenCalledOnce();
    expect(String(info.mock.calls[0][0])).toContain('https://example.com/r?t=1');
  });

  it('生产环境未配置 SMTP 时返回 not_configured', async () => {
    const result = await sendMail(
      { to: 'ming@example.com', subject: 'x', text: 'y' },
      { NODE_ENV: 'production' },
    );
    expect(result).toEqual({ ok: false, error: 'not_configured' });
  });

  it('SMTP 模式下调用 transporter 发送', async () => {
    sendMailMock.mockResolvedValueOnce({ messageId: '1' });
    const result = await sendMail(
      { to: 'ming@example.com', subject: '重置密码', text: '正文', html: '<p>正文</p>' },
      { ...SMTP_ENV, NODE_ENV: 'production' },
    );
    expect(result).toEqual({ ok: true });
    expect(createTransportMock).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      auth: { user: 'no-reply@example.com', pass: 'secret' },
    });
    expect(sendMailMock).toHaveBeenCalledWith({
      from: '灼见 <no-reply@example.com>',
      to: 'ming@example.com',
      subject: '重置密码',
      text: '正文',
      html: '<p>正文</p>',
    });
  });

  it('SMTP 报错时返回 send_failed 并带上原因', async () => {
    sendMailMock.mockRejectedValueOnce(new Error('550 mailbox unavailable'));
    const result = await sendMail(
      { to: 'ming@example.com', subject: 'x', text: 'y' },
      { ...SMTP_ENV, NODE_ENV: 'production' },
    );
    expect(result).toMatchObject({ ok: false, error: 'send_failed' });
    if (!result.ok) expect(result.detail).toContain('550');
  });

  it('发件人优先取 MAIL_FROM，兼容 SMTP_FROM', () => {
    expect(fromAddress({ MAIL_FROM: ' 灼见 <a@example.com> ' })).toBe('灼见 <a@example.com>');
    expect(fromAddress({ SMTP_FROM: 'b@example.com' })).toBe('b@example.com');
    expect(fromAddress({ MAIL_FROM: 'a@example.com', SMTP_FROM: 'b@example.com' })).toBe(
      'a@example.com',
    );
    expect(fromAddress({})).toBe('');
  });

  it('MAIL_PROVIDER 可显式指定通道（避免 Resend key 残留时抢优先级）', () => {
    const both = {
      RESEND_API_KEY: 're_key',
      SMTP_HOST: 'smtpdm.aliyun.com',
      MAIL_FROM: '灼见 <no-reply@burninginsight.com>',
      NODE_ENV: 'production',
    };
    expect(resolveMailProvider(both)).toBe('resend');
    expect(resolveMailProvider({ ...both, MAIL_PROVIDER: 'smtp' })).toBe('smtp');
    expect(mailerMode({ ...both, MAIL_PROVIDER: 'smtp' })).toBe('smtp');
    expect(mailerMode({ ...both, MAIL_PROVIDER: 'resend' })).toBe('resend');
    // 指定了通道但没配齐 → 生产环境判定为未配置
    expect(mailerMode({ MAIL_PROVIDER: 'smtp', NODE_ENV: 'production' })).toBe('disabled');
    expect(mailerMode({ MAIL_PROVIDER: 'smtp', NODE_ENV: 'development' })).toBe('console');
    // 非法值按自动选择处理
    expect(resolveMailProvider({ ...both, MAIL_PROVIDER: 'whatever' })).toBe('resend');
  });
});

describe('Resend 通道', () => {
  const RESEND_ENV = {
    RESEND_API_KEY: 're_test_key',
    MAIL_FROM: '灼见 <no-reply@burninginsight.com>',
    NODE_ENV: 'production',
  };

  beforeEach(() => {
    resetMailerCache();
    vi.unstubAllGlobals();
  });

  it('配了 RESEND_API_KEY 就优先走 Resend（即使是生产环境）', () => {
    expect(isResendConfigured(RESEND_ENV)).toBe(true);
    expect(mailerMode(RESEND_ENV)).toBe('resend');
    expect(mailerMode({ RESEND_API_KEY: 'k', NODE_ENV: 'production' })).toBe('disabled');
    expect(mailerMode({ ...RESEND_ENV, SMTP_HOST: 'smtp.example.com' })).toBe('resend');
  });

  it('解析配置：默认官方端点，可用 RESEND_API_URL 覆盖', () => {
    expect(resolveResendConfig(RESEND_ENV)).toMatchObject({
      apiKey: 're_test_key',
      from: '灼见 <no-reply@burninginsight.com>',
      endpoint: 'https://api.resend.com/emails',
    });
    expect(resolveResendConfig({ ...RESEND_ENV, RESEND_API_URL: 'https://proxy.test/send' })).toMatchObject(
      { endpoint: 'https://proxy.test/send' },
    );
    expect(resolveResendConfig({ RESEND_API_KEY: 'k' })).toBeNull();
  });

  it('通过 HTTP API 发送，带上 Bearer 与 from/to/subject', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'mail-1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendMail(
      { to: 'ming@example.com', subject: '注册验证码', text: '654321', html: '<p>654321</p>' },
      RESEND_ENV,
    );

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_test_key');
    expect(JSON.parse(String(init.body))).toEqual({
      from: '灼见 <no-reply@burninginsight.com>',
      to: ['ming@example.com'],
      subject: '注册验证码',
      text: '654321',
      html: '<p>654321</p>',
    });
  });

  it('Resend 返回错误时带上状态码与响应体，方便排查', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"message":"domain is not verified"}', { status: 403 })),
    );
    const result = await sendMail(
      { to: 'ming@example.com', subject: 'x', text: 'y' },
      RESEND_ENV,
    );
    expect(result).toMatchObject({ ok: false, error: 'send_failed' });
    if (!result.ok) {
      expect(result.detail).toContain('403');
      expect(result.detail).toContain('domain is not verified');
    }
  });

  it('网络异常（如被墙/超时）返回 send_failed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('fetch failed');
      }),
    );
    const result = await sendMail({ to: 'ming@example.com', subject: 'x', text: 'y' }, RESEND_ENV);
    expect(result).toMatchObject({ ok: false, error: 'send_failed' });
  });
});
