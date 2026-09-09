import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users, type User } from '@/db/schema';

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
