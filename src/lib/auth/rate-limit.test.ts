import { beforeEach, describe, expect, it } from 'vitest';
import { consumeRateLimit, resetRateLimitStore, RATE_LIMITS } from './rate-limit';

describe('内存限流', () => {
  beforeEach(() => resetRateLimitStore());

  it('窗口内超过次数后拒绝，并给出重试时间', () => {
    const rule = { limit: 2, windowMs: 60_000 };
    const start = 1_000_000;
    expect(consumeRateLimit('k', rule, start).allowed).toBe(true);
    expect(consumeRateLimit('k', rule, start + 1).allowed).toBe(true);
    const blocked = consumeRateLimit('k', rule, start + 2);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(60_000 - 2);
  });

  it('窗口过期后重新计数', () => {
    const rule = { limit: 1, windowMs: 1_000 };
    expect(consumeRateLimit('k', rule, 0).allowed).toBe(true);
    expect(consumeRateLimit('k', rule, 500).allowed).toBe(false);
    expect(consumeRateLimit('k', rule, 1_500).allowed).toBe(true);
  });

  it('不同 key 互不影响，并暴露预设规则', () => {
    expect(consumeRateLimit('a', RATE_LIMITS.login).allowed).toBe(true);
    expect(consumeRateLimit('b', RATE_LIMITS.login).allowed).toBe(true);
    expect(RATE_LIMITS.passwordReset.limit).toBe(3);
  });
});
