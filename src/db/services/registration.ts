import { createEmailUser } from '@/db/services/users';
import { consumeSignupCode } from '@/db/services/email-verification';

/**
 * 邮箱注册：先核销验证码，再建档。
 * 顺序上先验码可以避免"注册了但没验证邮箱"的账号；
 * 极端并发（两个请求同时用同一验证码）由 consumeSignupCode 的行锁与 consumed_at 兜底。
 */

export interface RegisterEmailInput {
  email: string;
  displayName: string;
  password: string;
  code: string;
}

export type RegisterEmailResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'invalid_code' | 'expired_code' | 'too_many_attempts' | 'email_taken' };

export async function registerEmailUser(input: RegisterEmailInput): Promise<RegisterEmailResult> {
  const verified = await consumeSignupCode(input.email, input.code);
  if (!verified.ok) {
    return {
      ok: false,
      reason:
        verified.reason === 'expired'
          ? 'expired_code'
          : verified.reason === 'too_many_attempts'
            ? 'too_many_attempts'
            : 'invalid_code',
    };
  }

  const created = await createEmailUser({
    email: input.email,
    displayName: input.displayName,
    password: input.password,
  });
  if (!created.ok) return { ok: false, reason: 'email_taken' };
  return { ok: true, userId: created.user.id };
}
