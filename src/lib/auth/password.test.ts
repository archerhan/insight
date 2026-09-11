import { describe, expect, it } from 'vitest';
import { hashPassword, PASSWORD_HASH_ALGORITHM, verifyPassword } from './password';

describe('密码哈希（scrypt）', () => {
  it('同一密码每次哈希都不同，但都能校验通过', () => {
    const first = hashPassword('zhuojian2026');
    const second = hashPassword('zhuojian2026');
    expect(first).not.toBe(second);
    expect(first.startsWith(`${PASSWORD_HASH_ALGORITHM}$`)).toBe(true);
    expect(verifyPassword('zhuojian2026', first)).toBe(true);
    expect(verifyPassword('zhuojian2026', second)).toBe(true);
  });

  it('密码错误 / 空哈希 / 格式异常都返回 false', () => {
    const hash = hashPassword('zhuojian2026');
    expect(verifyPassword('Zhuojian2026', hash)).toBe(false);
    expect(verifyPassword('zhuojian2026', null)).toBe(false);
    expect(verifyPassword('zhuojian2026', '')).toBe(false);
    expect(verifyPassword('zhuojian2026', 'bcrypt$whatever')).toBe(false);
    expect(verifyPassword('zhuojian2026', 'scrypt$a$b$c$d$e')).toBe(false);
    expect(verifyPassword('zhuojian2026', 'scrypt$16384$8$1$not-base64!!$short')).toBe(false);
  });

  it('支持 unicode 密码（规范化后比较）', () => {
    const hash = hashPassword('灼见·password1');
    expect(verifyPassword('灼见·password1', hash)).toBe(true);
  });
});
