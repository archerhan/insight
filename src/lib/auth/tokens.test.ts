import { describe, expect, it } from 'vitest';
import {
  generateToken,
  hashToken,
  isTokenUsable,
  PASSWORD_RESET_TTL_MINUTES,
  tokenExpiry,
} from './tokens';

describe('一次性令牌', () => {
  it('生成 URL 安全的高熵令牌，摘要稳定且不可逆', () => {
    const token = generateToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).toHaveLength(64);
    expect(hashToken(token)).not.toContain(token);
    expect(generateToken()).not.toBe(token);
  });

  it('默认 60 分钟有效期', () => {
    const now = new Date('2026-09-11T08:00:00Z');
    const expires = tokenExpiry(now);
    expect(expires.toISOString()).toBe('2026-09-11T09:00:00.000Z');
    expect(PASSWORD_RESET_TTL_MINUTES).toBe(60);
  });

  it('过期与已使用都不可用', () => {
    const now = new Date('2026-09-11T08:00:00Z');
    expect(isTokenUsable({ expiresAt: '2026-09-11T08:30:00Z', usedAt: null }, now)).toBe(true);
    expect(isTokenUsable({ expiresAt: '2026-09-11T07:59:00Z', usedAt: null }, now)).toBe(false);
    expect(
      isTokenUsable(
        { expiresAt: '2026-09-11T08:30:00Z', usedAt: '2026-09-11T07:00:00Z' },
        now,
      ),
    ).toBe(false);
    expect(isTokenUsable({ expiresAt: 'not-a-date', usedAt: null }, now)).toBe(false);
  });
});
