import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db, type Db } from '@/db/client';
import { emailVerificationCodes } from '@/db/schema';

/**
 * 邮箱验证码（注册）：6 位数字，10 分钟有效，最多试 5 次。
 * 库里只存 HMAC-SHA256 摘要（密钥 AUTH_SECRET），即使库被读走也不能离线爆破 6 位数字。
 * 同一邮箱重新发送会让旧验证码立即作废。
 */

export const SIGNUP_CODE_TTL_MINUTES = 10;
export const SIGNUP_CODE_MAX_ATTEMPTS = 5;
export const SIGNUP_CODE_LENGTH = 6;

const PURPOSE_SIGNUP = 'signup';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export function generateEmailCode(): string {
  return String(randomInt(0, 10 ** SIGNUP_CODE_LENGTH)).padStart(SIGNUP_CODE_LENGTH, '0');
}

export function codeSecret(env: Record<string, string | undefined> = process.env): string {
  return env.AUTH_SECRET?.trim() || 'zhuojian-dev-code-secret';
}

export function hashEmailCode(email: string, code: string, secret: string = codeSecret()): string {
  return createHmac('sha256', secret).update(`${email}:${code}`).digest('hex');
}

export function verifyEmailCodeHash(
  email: string,
  code: string,
  storedHash: string,
  secret: string = codeSecret(),
): boolean {
  const expected = Buffer.from(storedHash, 'hex');
  const actual = Buffer.from(hashEmailCode(email, code, secret), 'hex');
  if (expected.length !== actual.length || expected.length === 0) return false;
  return timingSafeEqual(expected, actual);
}

export interface IssuedSignupCode {
  code: string;
  expiresAt: Date;
}

/** 签发注册验证码：作废旧码 → 写入新码摘要。 */
export async function issueSignupCode(
  email: string,
  now: Date = new Date(),
  ttlMinutes: number = SIGNUP_CODE_TTL_MINUTES,
): Promise<IssuedSignupCode> {
  const code = generateEmailCode();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60_000);

  await db.transaction(async (tx: Tx) => {
    await tx
      .update(emailVerificationCodes)
      .set({ consumedAt: now })
      .where(
        and(
          eq(emailVerificationCodes.email, email),
          eq(emailVerificationCodes.purpose, PURPOSE_SIGNUP),
          isNull(emailVerificationCodes.consumedAt),
        ),
      );
    await tx.insert(emailVerificationCodes).values({
      email,
      purpose: PURPOSE_SIGNUP,
      codeHash: hashEmailCode(email, code),
      expiresAt,
    });
  });

  return { code, expiresAt };
}

export type VerifySignupCodeResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'expired' | 'too_many_attempts' };

interface CodeRow {
  id: string;
  codeHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  attempts: number;
}

async function latestCodeRow(tx: Tx, email: string): Promise<CodeRow | null> {
  const rows = await tx
    .select({
      id: emailVerificationCodes.id,
      codeHash: emailVerificationCodes.codeHash,
      expiresAt: emailVerificationCodes.expiresAt,
      consumedAt: emailVerificationCodes.consumedAt,
      attempts: emailVerificationCodes.attempts,
    })
    .from(emailVerificationCodes)
    .where(
      and(
        eq(emailVerificationCodes.email, email),
        eq(emailVerificationCodes.purpose, PURPOSE_SIGNUP),
      ),
    )
    .orderBy(desc(emailVerificationCodes.createdAt))
    .limit(1)
    .for('update');
  return rows[0] ?? null;
}

function evaluate(row: CodeRow | null, email: string, code: string, now: Date): VerifySignupCodeResult {
  if (!row || row.consumedAt) return { ok: false, reason: 'invalid' };
  if (row.attempts >= SIGNUP_CODE_MAX_ATTEMPTS) return { ok: false, reason: 'too_many_attempts' };
  if (row.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: 'expired' };
  if (!verifyEmailCodeHash(email, code, row.codeHash)) return { ok: false, reason: 'invalid' };
  return { ok: true };
}

/** 只校验不消费（错误时累计尝试次数）。 */
export async function verifySignupCode(
  email: string,
  code: string,
  now: Date = new Date(),
): Promise<VerifySignupCodeResult> {
  return db.transaction(async (tx: Tx) => {
    const row = await latestCodeRow(tx, email);
    const result = evaluate(row, email, code, now);
    if (!result.ok && row && !row.consumedAt && result.reason === 'invalid') {
      await tx
        .update(emailVerificationCodes)
        .set({ attempts: row.attempts + 1 })
        .where(eq(emailVerificationCodes.id, row.id));
    }
    return result;
  });
}

/** 校验并消费：注册成功后同一个验证码不能再用。 */
export async function consumeSignupCode(
  email: string,
  code: string,
  now: Date = new Date(),
): Promise<VerifySignupCodeResult> {
  return db.transaction(async (tx: Tx) => {
    const row = await latestCodeRow(tx, email);
    const result = evaluate(row, email, code, now);
    if (!result.ok) {
      if (row && !row.consumedAt && result.reason === 'invalid') {
        await tx
          .update(emailVerificationCodes)
          .set({ attempts: row.attempts + 1 })
          .where(eq(emailVerificationCodes.id, row.id));
      }
      return result;
    }
    await tx
      .update(emailVerificationCodes)
      .set({ consumedAt: now })
      .where(and(eq(emailVerificationCodes.id, row!.id), isNull(emailVerificationCodes.consumedAt)));
    return { ok: true } as const;
  });
}
