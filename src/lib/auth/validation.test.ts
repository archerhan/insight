import { describe, expect, it } from 'vitest';
import {
  isValidEmail,
  isValidSignupCode,
  maskEmail,
  normalizeEmail,
  passwordIssue,
  validatePasswordReset,
  validateRegistration,
} from './validation';

const validRegistration = {
  email: 'Ming@Example.com ',
  displayName: ' 明 ',
  password: 'zhuojian2026',
  confirmPassword: 'zhuojian2026',
};

describe('邮箱与密码校验', () => {
  it('邮箱统一小写并去空格', () => {
    expect(normalizeEmail('  Ming@Example.com')).toBe('ming@example.com');
    expect(isValidEmail('ming@example.com')).toBe(true);
    expect(isValidEmail('ming@example')).toBe(false);
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail(`${'a'.repeat(250)}@example.com`)).toBe(false);
  });

  it('密码需 8 位以上且含字母和数字', () => {
    expect(passwordIssue('short1')).toContain('至少 8 位');
    expect(passwordIssue('12345678')).toContain('字母');
    expect(passwordIssue('abcdefgh')).toContain('数字');
    expect(passwordIssue('a'.repeat(129) + '1')).toContain('最多');
    expect(passwordIssue('zhuojian2026')).toBeNull();
  });

  it('注册表单通过时返回规范化后的值', () => {
    const result = validateRegistration(validRegistration);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.email).toBe('ming@example.com');
      expect(result.displayName).toBe('明');
    }
  });

  it('注册表单逐项报错', () => {
    const result = validateRegistration({
      email: 'bad-email',
      displayName: ' ',
      password: '12345678',
      confirmPassword: '87654321',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.email).toBeTruthy();
      expect(result.errors.displayName).toBeTruthy();
      expect(result.errors.password).toBeTruthy();
      expect(result.errors.confirmPassword).toBe('两次输入的密码不一致');
    }
  });

  it('昵称过长会被拒绝', () => {
    const result = validateRegistration({
      ...validRegistration,
      displayName: '名'.repeat(25),
    });
    expect(result.ok).toBe(false);
  });

  it('重置密码复用同一套密码规则', () => {
    expect(validatePasswordReset({ password: 'zhuojian2026', confirmPassword: 'zhuojian2026' })).toEqual({
      ok: true,
      password: 'zhuojian2026',
    });
    const mismatch = validatePasswordReset({
      password: 'zhuojian2026',
      confirmPassword: 'zhuojian2027',
    });
    expect(mismatch.ok).toBe(false);
  });

  it('邮箱脱敏用于重置页展示', () => {
    expect(maskEmail('ming@example.com')).toBe('mi***@example.com');
    expect(maskEmail('a@example.com')).toBe('a***@example.com');
    expect(maskEmail(null)).toBe('你的邮箱');
    expect(maskEmail('weird')).toBe('你的邮箱');
  });

  it('注册验证码必须是 6 位数字', () => {
    expect(isValidSignupCode('654321')).toBe(true);
    expect(isValidSignupCode(' 654321 ')).toBe(true);
    expect(isValidSignupCode('65432')).toBe(false);
    expect(isValidSignupCode('65432a')).toBe(false);
    expect(isValidSignupCode('')).toBe(false);
  });
});
