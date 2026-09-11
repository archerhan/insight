import { describe, expect, it } from 'vitest';
import { isSessionStale } from './session';

describe('会话失效判定', () => {
  const changed = new Date('2026-09-11T08:00:00Z');

  it('token 记录的修改时间与库中一致 → 会话有效', () => {
    expect(isSessionStale({ passwordChangedAt: changed }, changed.toISOString())).toBe(false);
  });

  it('密码在签发之后被重置 → 旧会话作废', () => {
    expect(isSessionStale({ passwordChangedAt: changed }, null)).toBe(true);
    expect(
      isSessionStale({ passwordChangedAt: changed }, new Date('2026-09-10T00:00:00Z').toISOString()),
    ).toBe(true);
  });

  it('从未设置过密码的账号（GitHub 登录）不受影响', () => {
    expect(isSessionStale({ passwordChangedAt: null }, null)).toBe(false);
    expect(isSessionStale({ passwordChangedAt: null }, undefined)).toBe(false);
  });
});
