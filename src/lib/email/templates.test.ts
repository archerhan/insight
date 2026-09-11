import { describe, expect, it } from 'vitest';
import { passwordResetEmail, signupCodeEmail } from './templates';

describe('重置密码邮件模板', () => {
  const mail = passwordResetEmail({
    displayName: '明',
    link: 'https://burninginsight.com/reset-password?token=abc123',
    appUrl: 'https://burninginsight.com',
    expiresInMinutes: 60,
  });

  it('标题与正文包含链接、有效期与身份信息', () => {
    expect(mail.subject).toContain('灼见');
    expect(mail.text).toContain('明：');
    expect(mail.text).toContain('https://burninginsight.com/reset-password?token=abc123');
    expect(mail.text).toContain('60 分钟内有效');
    expect(mail.text).toContain('只能使用一次');
  });

  it('HTML 版本转义注入内容', () => {
    const risky = passwordResetEmail({
      displayName: '<script>alert(1)</script>',
      link: 'https://example.com/r?t=1&x=2',
      appUrl: 'https://example.com',
      expiresInMinutes: 30,
    });
    expect(risky.html).not.toContain('<script>');
    expect(risky.html).toContain('&lt;script&gt;');
    expect(risky.html).toContain('t=1&amp;x=2');
    expect(risky.html).toContain('30 分钟');
  });

  it('没有昵称时使用通用称呼', () => {
    const mail2 = passwordResetEmail({
      displayName: '   ',
      link: 'https://example.com/r?t=1',
      appUrl: 'https://example.com',
      expiresInMinutes: 60,
    });
    expect(mail2.text.startsWith('你好：')).toBe(true);
  });

  it('注册验证码邮件包含验证码与有效期', () => {
    const codeMail = signupCodeEmail({
      code: '654321',
      appUrl: 'https://burninginsight.com',
      expiresInMinutes: 10,
    });
    expect(codeMail.subject).toContain('验证码');
    expect(codeMail.text).toContain('654321');
    expect(codeMail.text).toContain('10 分钟内有效');
    expect(codeMail.html).toContain('654321');
    expect(codeMail.html).toContain('请勿转发');
  });
});
