import { describe, expect, it } from 'vitest';
import { loginHref, publicAppUrl, safeRelativeUrl, sameOriginPath } from './url';

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

  it('对外地址优先取 AUTH_URL，并去掉结尾斜杠', () => {
    expect(publicAppUrl({ AUTH_URL: 'https://burninginsight.com/' })).toBe(
      'https://burninginsight.com',
    );
    expect(publicAppUrl({ NEXTAUTH_URL: 'https://old.example' })).toBe('https://old.example');
    expect(publicAppUrl({})).toBe('http://localhost:3000');
  });

  it('把 Auth.js 返回的绝对地址转成站内路径', () => {
    expect(
      sameOriginPath('https://burninginsight.com/guide?x=1', '/', 'https://burninginsight.com'),
    ).toBe('/guide?x=1');
    expect(sameOriginPath('/me', '/')).toBe('/me');
    expect(sameOriginPath('https://evil.example/phish', '/login', 'https://burninginsight.com')).toBe(
      '/login',
    );
    expect(sameOriginPath('//evil.example/phish', '/login', 'https://burninginsight.com')).toBe(
      '/login',
    );
    expect(sameOriginPath('/guide', '/', 'https://burninginsight.com')).toBe('/guide');
    expect(sameOriginPath('https://burninginsight.com/me', '/login')).toBe('/login');
    expect(sameOriginPath('', '/login')).toBe('/login');
    expect(sameOriginPath(null, '/login')).toBe('/login');
  });
});
