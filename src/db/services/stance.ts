import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import { db, type DbTx } from '@/db/client';
import {
  claimEvents,
  claims,
  conclusionItems,
  reputationEvents,
  stanceChanges,
  topics,
  users,
} from '@/db/schema';
import {
  evaluateStanceNovelty,
  validateStanceChangeDraft,
} from '@/lib/domain/stance';

/**
 * M4 立场变更写/读服务：
 * - recordStanceChange：novelty 校验通过 → stance_changes + claim_events(stance_changed)
 *   → 改换者 honesty 战绩 + 来源作者 persuasion 战绩（同事务）；
 * - getStanceTimeline：个人页立场时间线（带证词与说服来源）；
 * - getProfileCounts：个人页“被采纳/说服/诚实”计数。
 */

type Tx = DbTx;

export interface RecordStanceChangeInput {
  topicId: string;
  userId: string;
  fromStance: string;
  toStance: string;
  statement: string;
  /** 说服来源论点；可为空（自主改主意，不授予说服战绩）。 */
  sourceClaimId?: string | null;
}

export interface StanceTimelineEntry {
  topicId: string;
  topicTitle: string;
  topicStatus: string;
  fromStance: string;
  toStance: string;
  statement: string;
  sourceClaimId: string | null;
  sourceClaimTitle: string | null;
  sourceAuthorId: string | null;
  sourceAuthorName: string | null;
  noveltyPass: boolean;
  createdAt: Date;
}

async function stanceAnchorInTx(
  tx: Tx,
  input: { topicId: string; userId: string; topicOwnerId: string },
): Promise<Date> {
  const [topicRow] = await tx
    .select({ createdAt: topics.createdAt })
    .from(topics)
    .where(eq(topics.id, input.topicId))
    .limit(1);
  if (!topicRow) throw new Error('Unknown topic');
  const [userRow] = await tx
    .select({ createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);

  const rows = await tx
    .select({ createdAt: claims.createdAt, authorId: claims.authorId, parentId: claims.parentId })
    .from(claims)
    .where(and(eq(claims.topicId, input.topicId), eq(claims.authorId, input.userId)))
    .orderBy(asc(claims.createdAt))
    .limit(50);
  if (rows.length === 0) return userRow?.createdAt ?? topicRow.createdAt;

  // 楼主：以自己的最初根立场发布时间为锚（原立场何时“立”下）；
  // 参与者：以自己在该话题最早发言为锚。
  const ownAnchor =
    input.userId === input.topicOwnerId
      ? rows.find((row) => row.parentId === null && row.authorId === input.userId) ?? rows[0]
      : rows[0];
  return ownAnchor.createdAt;
}

/** 记录一次公开立场变更（幂等由 UNIQUE(topic_id, user_id) 兜底）。 */
export async function recordStanceChange(input: RecordStanceChangeInput) {
  return db.transaction(async (tx) => {
    const draftErrors = validateStanceChangeDraft({
      fromStance: input.fromStance,
      toStance: input.toStance,
      statement: input.statement,
    });
    if (draftErrors.length > 0) throw new Error(draftErrors[0]);

    const [userRow] = await tx
      .select({ id: users.id, status: users.status })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1);
    if (!userRow || userRow.status !== 'active') throw new Error('Unknown or inactive user');

    const [topicRow] = await tx
      .select({
        id: topics.id,
        ownerId: topics.ownerId,
        visibility: topics.visibility,
        createdAt: topics.createdAt,
        title: topics.title,
      })
      .from(topics)
      .where(eq(topics.id, input.topicId))
      .limit(1);
    if (!topicRow || topicRow.visibility !== 'public') throw new Error('Unknown topic');

    const existingRows = await tx
      .select({ id: stanceChanges.id })
      .from(stanceChanges)
      .where(and(eq(stanceChanges.topicId, input.topicId), eq(stanceChanges.userId, input.userId)))
      .limit(1);
    if (existingRows.length > 0) {
      throw new Error('该话题你已经记录过公开立场变更，一个话题只保留一次有效更新');
    }

    let source: {
      id: string;
      topicId: string;
      authorId: string;
      createdAt: Date;
      contentTitle: string;
    } | null = null;
    if (input.sourceClaimId) {
      const sourceRows = await tx
        .select({
          id: claims.id,
          topicId: claims.topicId,
          authorId: claims.authorId,
          createdAt: claims.createdAt,
          contentTitle: claims.contentTitle,
        })
        .from(claims)
        .where(eq(claims.id, input.sourceClaimId))
        .limit(1);
      const row = sourceRows[0];
      if (!row || row.topicId !== input.topicId) {
        throw new Error('说服来源必须来自当前话题');
      }
      if (row.authorId === input.userId) {
        throw new Error('说服来源不能是自己发布的论点；如果是自主改主意，可以不选来源');
      }
      source = row;
    }

    const anchorAt = await stanceAnchorInTx(tx, {
      topicId: input.topicId,
      userId: input.userId,
      topicOwnerId: topicRow.ownerId,
    });
    const noveltyPass = evaluateStanceNovelty({
      sourceClaimId: source?.id ?? null,
      sourceClaimAuthorId: source?.authorId ?? null,
      sourceClaimCreatedAt: source?.createdAt ?? null,
      anchorAt,
      userId: input.userId,
    });

    const now = new Date();
    const [stanceChange] = await tx
      .insert(stanceChanges)
      .values({
        topicId: input.topicId,
        userId: input.userId,
        fromStance: input.fromStance.trim(),
        toStance: input.toStance.trim(),
        sourceClaimId: source?.id ?? null,
        persuaderUserId: source?.authorId ?? null,
        statement: input.statement.trim(),
        noveltyPass,
      })
      .returning();

    await tx.insert(claimEvents).values({
      topicId: input.topicId,
      claimId: source?.id ?? null,
      type: 'stance_changed',
      actorUserId: input.userId,
      detail: {
        stanceChangeId: stanceChange.id,
        fromStance: input.fromStance.trim(),
        toStance: input.toStance.trim(),
        sourceClaimId: source?.id ?? null,
        noveltyPass,
      },
    });

    if (noveltyPass) {
      await tx.insert(reputationEvents).values({
        userId: input.userId,
        type: 'honesty',
        outcome: 'positive',
        claimId: source?.id ?? null,
        topicId: input.topicId,
        weight: '1',
        occurredAt: now,
      });
      if (source?.authorId) {
        await tx.insert(reputationEvents).values({
          userId: source.authorId,
          type: 'persuasion',
          outcome: 'positive',
          claimId: source.id,
          topicId: input.topicId,
          weight: '1',
          occurredAt: now,
        });
      }
    }

    return { stanceChange, noveltyPass };
  });
}

/** 某用户的立场时间线（最新在前）。 */
export async function getStanceTimeline(userId: string): Promise<StanceTimelineEntry[]> {
  const rows = await db
    .select({
      topicId: topics.id,
      topicTitle: topics.title,
      topicStatus: topics.status,
      fromStance: stanceChanges.fromStance,
      toStance: stanceChanges.toStance,
      statement: stanceChanges.statement,
      sourceClaimId: stanceChanges.sourceClaimId,
      sourceClaimTitle: claims.contentTitle,
      sourceAuthorId: claims.authorId,
      sourceAuthorName: users.displayName,
      noveltyPass: stanceChanges.noveltyPass,
      createdAt: stanceChanges.createdAt,
    })
    .from(stanceChanges)
    .innerJoin(topics, eq(stanceChanges.topicId, topics.id))
    .leftJoin(claims, eq(stanceChanges.sourceClaimId, claims.id))
    .leftJoin(users, eq(claims.authorId, users.id))
    .where(eq(stanceChanges.userId, userId))
    .orderBy(desc(stanceChanges.createdAt));

  return rows.map((row) => ({
    topicId: row.topicId,
    topicTitle: row.topicTitle,
    topicStatus: row.topicStatus,
    fromStance: row.fromStance,
    toStance: row.toStance,
    statement: row.statement,
    sourceClaimId: row.sourceClaimId,
    sourceClaimTitle: row.sourceClaimTitle ?? null,
    sourceAuthorId: row.sourceAuthorId ?? null,
    sourceAuthorName: row.sourceAuthorName ?? null,
    noveltyPass: row.noveltyPass,
    createdAt: row.createdAt,
  }));
}

/** 立场变更向导的“说服来源”候选：本话题内他人发布的活性论点。 */
export async function listStanceSourceClaims(
  topicId: string,
  userId: string,
): Promise<Array<{ id: string; contentTitle: string; authorName: string | null }>> {
  const rows = await db
    .select({
      id: claims.id,
      contentTitle: claims.contentTitle,
      authorName: users.displayName,
    })
    .from(claims)
    .leftJoin(users, eq(claims.authorId, users.id))
    .where(
      and(
        eq(claims.topicId, topicId),
        // 本人论点不算“被说服来源”
        ne(claims.authorId, userId),
        inArray(claims.status, ['active', 'challenged', 'responded', 'disputed']),
      ),
    )
    .orderBy(asc(claims.createdAt));
  return rows.map((row) => ({
    id: row.id,
    contentTitle: row.contentTitle,
    authorName: row.authorName ?? null,
  }));
}

export interface ProfileCounts {
  adoptedCount: number;
  persuasionCount: number;
  honestyCount: number;
}

/** 个人页战绩计数（从可回溯账本派生；后续 user_stats 落地后可换近因加权物化）。 */
export async function getProfileCounts(userId: string): Promise<ProfileCounts> {
  const [adoptedRows, persuasionRows, honestyRows] = await Promise.all([
    db
      .select({ id: conclusionItems.id })
      .from(conclusionItems)
      .innerJoin(claims, eq(conclusionItems.claimId, claims.id))
      .where(eq(claims.authorId, userId)),
    db
      .select({ id: reputationEvents.id })
      .from(reputationEvents)
      .where(
        and(
          eq(reputationEvents.userId, userId),
          eq(reputationEvents.type, 'persuasion'),
          eq(reputationEvents.outcome, 'positive'),
        ),
      ),
    db
      .select({ id: stanceChanges.id })
      .from(stanceChanges)
      .where(eq(stanceChanges.userId, userId)),
  ]);
  return {
    adoptedCount: adoptedRows.length,
    persuasionCount: persuasionRows.length,
    honestyCount: honestyRows.length,
  };
}
