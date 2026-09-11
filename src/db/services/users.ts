import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users, type User } from '@/db/schema';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { normalizeEmail } from '@/lib/auth/validation';

/**
 * 用户档案服务（M1：NextAuth 首次登录自动建档 / 档案同步 / 须知完成时间）。
 * 权限收敛口径与树服务一致：所有写操作只经服务端 repository 层。
 */

export interface OAuthUserInput {
  /** 形如 github:123456 的稳定外部标识，对应 users.auth_id。 */
  authId: string;
  displayName: string;
  avatarUrl?: string | null;
}

export interface EmailUserInput {
  email: string;
  displayName: string;
  password: string;
}

export async function findUserByAuthId(authId: string): Promise<User | null> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.authId, authId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getUserById(id: string): Promise<User | null> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizeEmail(email)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Postgres 唯一约束冲突（email/auth_id 已被占用）。
 * drizzle 会把驱动错误包成 DrizzleQueryError（真正的 PG code 在 cause 上），所以要顺着 cause 链找。
 */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current != null; depth += 1) {
    if (typeof current === 'object' && 'code' in current) {
      if ((current as { code?: unknown }).code === '23505') return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * 邮箱注册建档：邮箱唯一，密码只存 scrypt 摘要。
 * 邮箱已被占用时返回 email_taken（并发下由唯一约束兜底）。
 */
export async function createEmailUser(
  input: EmailUserInput,
): Promise<{ ok: true; user: User } | { ok: false; reason: 'email_taken' }> {
  const email = normalizeEmail(input.email);
  try {
    const [created] = await db
      .insert(users)
      .values({
        email,
        displayName: input.displayName.trim(),
        passwordHash: hashPassword(input.password),
        passwordChangedAt: new Date(),
        emailVerifiedAt: new Date(),
      })
      .returning();
    return { ok: true, user: created };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: 'email_taken' };
    throw error;
  }
}

/** 邮箱 + 密码校验；账号被停用或未设密码时一律返回 null（对外不区分原因）。 */
export async function verifyUserCredentials(email: string, password: string): Promise<User | null> {
  const user = await findUserByEmail(email);
  if (!user) return null;
  if (user.status !== 'active') return null;
  return verifyPassword(password, user.passwordHash) ? user : null;
}

/** 设置新密码：同时刷新 password_changed_at，让此前签发的会话作废。 */
export async function updateUserPassword(
  userId: string,
  password: string,
  changedAt: Date = new Date(),
): Promise<User | null> {
  const [row] = await db
    .update(users)
    .set({
      passwordHash: hashPassword(password),
      passwordChangedAt: changedAt,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();
  return row ?? null;
}

/**
 * 注册即建档：按 auth_id 查找，不存在则插入。
 * 已存在时只同步头像（假名视为用户资产，不被 OAuth 改名覆盖）；
 * 首次登录并发时以唯一约束兜底，冲突后重新读取。
 */
export async function findOrCreateUserFromOAuth(input: OAuthUserInput): Promise<User> {
  const existing = await findUserByAuthId(input.authId);
  if (existing) {
    if (input.avatarUrl && existing.avatarUrl !== input.avatarUrl) {
      const [updated] = await db
        .update(users)
        .set({ avatarUrl: input.avatarUrl, updatedAt: new Date() })
        .where(eq(users.id, existing.id))
        .returning();
      return updated ?? existing;
    }
    return existing;
  }

  try {
    const [created] = await db
      .insert(users)
      .values({
        authId: input.authId,
        displayName: input.displayName,
        avatarUrl: input.avatarUrl ?? null,
      })
      .returning();
    return created;
  } catch (error) {
    const raced = await findUserByAuthId(input.authId);
    if (raced) return raced;
    throw error;
  }
}

/** 记录《理性讨论须知》完成时间（幂等：重复点击只更新时间戳）。 */
export async function markCourseCompleted(
  userId: string,
  completedAt: Date = new Date(),
): Promise<User | null> {
  const [row] = await db
    .update(users)
    .set({ courseCompletedAt: completedAt, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return row ?? null;
}
