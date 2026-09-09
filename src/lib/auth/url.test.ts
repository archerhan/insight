import { describe, expect, it } from 'vitest';
import { loginHref, safeRelativeUrl } from './url';

describe('登录回调地址校验', () => {
  it('只放行站内相对路径', () => {
    expect(safeRelativeUrl('/new')).toBe('/new');
    expect(safeRelativeUrl('/me?tab=x')).toBe('/me?tab=x');
    expect(safeRelativeUrl('https://evil.example')).toBe('/');
    expect(safeRelativeUrl('//evil.example')).toBe('/');
    expect(safeRelativeUrl('javascript:alert(1)')).toBe('/');
    expect(safeRelativeUrl(null)).toBe('/');
  });

  it('生成带 callbackUrl 的登录链接', () => {
    expect(loginHref('/new')).toBe('/login?callbackUrl=%2Fnew');
    expect(loginHref('https://evil.example')).toBe('/login?callbackUrl=%2F');
  });
});
