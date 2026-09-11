import { and, eq, isNull } from 'drizzle-orm';
import { db, type Db } from '@/db/client';
import { userTokens, users, type User } from '@/db/schema';
import { hashPassword } from '@/lib/auth/password';
import {
  generateToken,
  hashToken,
  isTokenUsable,
  PASSWORD_RESET_TTL_MINUTES,
  tokenExpiry,
} from '@/lib/auth/tokens';

/**
 * 忘记密码：签发一次性令牌 → 邮件发送原文 → 重置时校验摘要并消费。
 * 同一用户同一类型只保留最新的有效令牌（旧的立刻作废）。
 */

const TOKEN_TYPE = 'password_reset';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface IssuedToken {
  token: string;
  expiresAt: Date;
}

export async function issuePasswordResetToken(
  userId: string,
  now: Date = new Date(),
  ttlMinutes: number = PASSWORD_RESET_TTL_MINUTES,
): Promise<IssuedToken> {
  const token = generateToken();
  const expiresAt = tokenExpiry(now, ttlMinutes);

  await db.transaction(async (tx: Tx) => {
    await tx
      .update(userTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(userTokens.userId, userId),
          eq(userTokens.type, TOKEN_TYPE),
          isNull(userTokens.usedAt),
        ),
      );
    await tx.insert(userTokens).values({
      userId,
      type: TOKEN_TYPE,
      tokenHash: hashToken(token),
      expiresAt,
    });
  });

  return { token, expiresAt };
}

export interface PasswordResetLookup {
  tokenId: string;
  expiresAt: Date;
  usedAt: Date | null;
  user: User;
}

/** 按明文令牌查（页面渲染前判断链接是否还能用）。 */
export async function findPasswordResetToken(
  token: string,
): Promise<PasswordResetLookup | null> {
  if (!token) return null;
  const rows = await db
    .select({
      tokenId: userTokens.id,
      expiresAt: userTokens.expiresAt,
      usedAt: userTokens.usedAt,
      user: users,
    })
    .from(userTokens)
    .innerJoin(users, eq(users.id, userTokens.userId))
    .where(and(eq(userTokens.tokenHash, hashToken(token)), eq(userTokens.type, TOKEN_TYPE)))
    .limit(1);
  return rows[0] ?? null;
}

export type ConsumeResetResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'invalid' | 'expired' };

/**
 * 消费令牌并设置新密码（同一事务：令牌置为已用 + 写入新密码哈希）。
 * 重复提交同一个令牌会得到 invalid。
 */
export async function consumePasswordResetToken(
  token: string,
  password: string,
  now: Date = new Date(),
): Promise<ConsumeResetResult> {
  const lookup = await findPasswordResetToken(token);
  if (!lookup) return { ok: false, reason: 'invalid' };
  if (!isTokenUsable(lookup, now)) {
    return { ok: false, reason: lookup.usedAt ? 'invalid' : 'expired' };
  }

  return db.transaction(async (tx: Tx) => {
    const consumed = await tx
      .update(userTokens)
      .set({ usedAt: now })
      .where(and(eq(userTokens.id, lookup.tokenId), isNull(userTokens.usedAt)))
      .returning({ id: userTokens.id });
    if (consumed.length === 0) return { ok: false, reason: 'invalid' } as const;

    await tx
      .update(users)
      .set({
        passwordHash: hashPassword(password),
        passwordChangedAt: now,
        updatedAt: new Date(),
      })
      .where(eq(users.id, lookup.user.id));

    return { ok: true, userId: lookup.user.id } as const;
  });
}
