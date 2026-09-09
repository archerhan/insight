import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { db, type DbTx } from '@/db/client';
import { notifications } from '@/db/schema';

/**
 * 站内通知最小集（M5）：
 * - 写：notifyInTx / notifyUser，worker 与事务内动作共用；
 * - 幂等：传入 dedupeKey 时按 (user_id, type, dedupe_key) 冲突即跳过；
 * - 读：未读数（顶栏铃铛）、收件列表（/notifications）、全部已读。
 */

export interface NotifyInput {
  userId: string;
  type: string;
  title: string;
  body: string;
  /** 去重键，如 `challenge_timer:${challengeId}:orange`；worker 幂等依赖它。 */
  dedupeKey?: string;
  payload?: Record<string, unknown>;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  payload: Record<string, unknown> | null;
  readAt: Date | null;
  createdAt: Date;
}

export async function notifyInTx(tx: DbTx, input: NotifyInput) {
  const values = {
    userId: input.userId,
    type: input.type,
    title: input.title.trim(),
    body: input.body.trim(),
    payload: input.payload ?? null,
  };
  if (input.dedupeKey) {
    await tx
      .insert(notifications)
      .values({ ...values, dedupeKey: input.dedupeKey })
      .onConflictDoNothing({
        target: [notifications.userId, notifications.type, notifications.dedupeKey],
      });
  } else {
    await tx.insert(notifications).values({ ...values, dedupeKey: null });
  }
}

/** 事务外通知（动作/服务直连库时的便捷入口）。 */
export async function notifyUser(input: NotifyInput) {
  await db.transaction(async (tx) => notifyInTx(tx, input));
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.value ?? 0;
}

export async function listNotifications(
  userId: string,
  limit = 50,
): Promise<NotificationItem[]> {
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    payload: row.payload ?? null,
    readAt: row.readAt,
    createdAt: row.createdAt,
  }));
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const rows = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return rows.length;
}
