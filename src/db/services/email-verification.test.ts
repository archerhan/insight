import { describe, expect, it } from 'vitest';
import {
  codeSecret,
  generateEmailCode,
  hashEmailCode,
  SIGNUP_CODE_LENGTH,
  SIGNUP_CODE_MAX_ATTEMPTS,
  SIGNUP_CODE_TTL_MINUTES,
  verifyEmailCodeHash,
} from './email-verification';

describe('邮箱验证码（纯逻辑）', () => {
  it('生成固定长度的纯数字验证码', () => {
    for (let i = 0; i < 20; i += 1) {
      const code = generateEmailCode();
      expect(code).toMatch(/^\d{6}$/);
      expect(code).toHaveLength(SIGNUP_CODE_LENGTH);
    }
  });

  it('摘要是 HMAC-SHA256，长度 64 且与邮箱、密钥绑定', () => {
    const hash = hashEmailCode('ming@example.com', '123456', 'secret-a');
    expect(hash).toHaveLength(64);
    expect(hashEmailCode('ming@example.com', '123456', 'secret-a')).toBe(hash);
    expect(hashEmailCode('ming@example.com', '123456', 'secret-b')).not.toBe(hash);
    expect(hashEmailCode('other@example.com', '123456', 'secret-a')).not.toBe(hash);
    expect(hash).not.toContain('123456');
  });

  it('校验只认匹配的验证码', () => {
    const hash = hashEmailCode('ming@example.com', '123456', 'secret-a');
    expect(verifyEmailCodeHash('ming@example.com', '123456', hash, 'secret-a')).toBe(true);
    expect(verifyEmailCodeHash('ming@example.com', '654321', hash, 'secret-a')).toBe(false);
    expect(verifyEmailCodeHash('ming@example.com', '123456', hash, 'secret-b')).toBe(false);
    expect(verifyEmailCodeHash('ming@example.com', '123456', 'not-hex', 'secret-a')).toBe(false);
    expect(verifyEmailCodeHash('ming@example.com', '123456', '', 'secret-a')).toBe(false);
  });

  it('密钥优先取 AUTH_SECRET，缺失时用开发占位值', () => {
    expect(codeSecret({ AUTH_SECRET: ' abc ' })).toBe('abc');
    expect(codeSecret({})).toBe('zhuojian-dev-code-secret');
  });

  it('常量符合产品约定（10 分钟 / 5 次）', () => {
    expect(SIGNUP_CODE_TTL_MINUTES).toBe(10);
    expect(SIGNUP_CODE_MAX_ATTEMPTS).toBe(5);
  });
});
