/**
 * 极简滑动窗口限流（单实例内存版）。
 * 目前应用是单容器部署，用于给注册/找回密码/登录失败做最基本的节流；
 * 将来多实例时替换为 Redis/数据库实现即可，调用方接口不变。
 */

export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function consumeRateLimit(
  key: string,
  rule: RateLimitRule,
  now: number = Date.now(),
  store: Map<string, Bucket> = buckets,
): RateLimitResult {
  const existing = store.get(key);
  if (!existing || existing.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { allowed: true, remaining: rule.limit - 1, retryAfterMs: 0 };
  }

  if (existing.count >= rule.limit) {
    return { allowed: false, remaining: 0, retryAfterMs: existing.resetAt - now };
  }

  existing.count += 1;
  return { allowed: true, remaining: rule.limit - existing.count, retryAfterMs: 0 };
}

/** 测试用：清空计数。 */
export function resetRateLimitStore(store: Map<string, Bucket> = buckets): void {
  store.clear();
}

export const RATE_LIMITS = {
  login: { limit: 10, windowMs: 10 * 60_000 },
  register: { limit: 5, windowMs: 60 * 60_000 },
  passwordReset: { limit: 3, windowMs: 15 * 60_000 },
  /** 注册验证码：同一邮箱 60 秒一次、每小时最多 5 次；同一 IP 每小时最多 20 次。 */
  signupCodeCooldown: { limit: 1, windowMs: 60_000 },
  signupCodePerEmail: { limit: 5, windowMs: 60 * 60_000 },
  signupCodePerIp: { limit: 20, windowMs: 60 * 60_000 },
} as const;
