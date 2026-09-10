import { and, desc, eq, inArray, lt, ne } from 'drizzle-orm';
import { db, type Db, type DbTx } from '@/db/client';
import {
  claimEvents,
  claims,
  conclusionVersions,
  decisionFollowups,
  predictions,
  realityChecks,
  reputationEvents,
  topics,
  users,
} from '@/db/schema';
import {
  isFollowupLevel,
  outcomeLabel,
  predictionGateError,
  PREDICTION_LIMITS,
  realityResultLabel,
  settleForRealityResult,
  validatePredictionDraft,
  type DecisionRealityResult,
  type PredictionOutcome,
  type PredictionStatus,
} from '@/lib/domain/predictions';
import { notifyInTx } from './notifications';
import { refreshUserStatsInTx } from './stats';
import { refreshTopicCountersInTx } from './topic-counters';

/**
 * M5 立帖为证服务：
 * - placePrediction：话题页登记（数量封顶 + 一人一话题一票 + 楼主自押拦截）；
 * - respondToFollowup：楼主 T+30 回访 → reality_check 落库 → 批量结算 predictions
 *   → prediction_result 战绩 + 站内揭晓通知；
 * - getTopicPredictionContext / getMyPredictions / getMyTopics：页面数据源；
 * - advanceFollowupPrompts：worker 到期生成回访/揭晓提醒（幂等）。
 */

type Exec = Db | DbTx;

export interface UserPredictionRecord {
  id: string;
  topicId: string;
  topicTitle: string;
  topicStatus: string;
  statement: string;
  predictedOutcome: PredictionOutcome;
  status: PredictionStatus;
  revealAt: Date | null;
  realityResult: string | null;
  createdAt: Date;
}

export interface TopicPredictionContext {
  stakeEnabled: boolean;
  topicStatus: string;
  topicType: string;
  topicOwnerId: string;
  revealAt: Date | null;
  openCount: number;
  totalCount: number;
  perTopicOpenCap: number;
  perTopicTotalCap: number;
  regretOpenCount: number;
  noRegretOpenCount: number;
  settled: boolean;
  realityResult: string | null;
  userPrediction: UserPredictionRecord | null;
  gateError: string | null;
}

export interface MyTopicRecord {
  topicId: string;
  title: string;
  type: string;
  status: string;
  role: '发起' | '参与' | '立帖为证';
  stakeEnabled: boolean;
  revealAt: Date | null;
  lastActivityAt: Date;
  conclusionVersionNo: number | null;
  ownClaimCount: number;
}

export interface FollowupRecord {
  id: string;
  topicId: string;
  userId: string;
  wave: number;
  dueAt: Date;
  respondedAt: Date | null;
  regretLevel: string | null;
  status: string;
}

async function userExists(exec: Exec, userId: string): Promise<boolean> {
  const rows = await exec
    .select({ id: users.id, status: users.status })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows.length > 0 && rows[0].status === 'active';
}

async function loadPredictionRows(exec: Exec, topicId: string) {
  return exec
    .select({
      id: predictions.id,
      bettorId: predictions.bettorId,
      statement: predictions.statement,
      predictedOutcome: predictions.predictedOutcome,
      status: predictions.status,
      createdAt: predictions.createdAt,
    })
    .from(predictions)
    .where(eq(predictions.topicId, topicId));
}

/** 登记一条"立帖为证"（单事务：资格校验 → 插入 → 反规范化计数）。 */
export async function placePrediction(input: {
  topicId: string;
  bettorId: string;
  statement: string;
  predictedOutcome: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const draftErrors = validatePredictionDraft({
      statement: input.statement,
      predictedOutcome: input.predictedOutcome,
    });
    if (draftErrors.length > 0) throw new Error(draftErrors[0]);
    if (!(await userExists(tx, input.bettorId))) throw new Error('Unknown or inactive user');

    const [topic] = await tx
      .select({
        id: topics.id,
        ownerId: topics.ownerId,
        type: topics.type,
        status: topics.status,
        stakeEnabled: topics.stakeEnabled,
        revealAt: topics.revealAt,
        visibility: topics.visibility,
        predictionCount: topics.predictionCount,
      })
      .from(topics)
      .where(eq(topics.id, input.topicId))
      .limit(1);
    if (!topic || topic.visibility !== 'public') throw new Error('Unknown topic');

    const rows = await loadPredictionRows(tx, topic.id);
    const openCount = rows.filter((row) => row.status === 'open').length;
    const alreadyStaked = rows.some((row) => row.bettorId === input.bettorId);
    const gateError = predictionGateError({
      topicStatus: topic.status,
      topicType: topic.type,
      stakeEnabled: topic.stakeEnabled,
      revealAt: topic.revealAt,
      now,
      isOwner: topic.ownerId === input.bettorId,
      alreadyStaked,
      openCount,
    });
    if (gateError) throw new Error(gateError);
    if (rows.length >= PREDICTION_LIMITS.perTopicTotalCap) {
      throw new Error(`该话题押注记录已达 ${PREDICTION_LIMITS.perTopicTotalCap} 条上限`);
    }

    const [row] = await tx
      .insert(predictions)
      .values({
        topicId: topic.id,
        bettorId: input.bettorId,
        targetType: 'decision',
        statement: input.statement.trim(),
        predictedOutcome: input.predictedOutcome as PredictionOutcome,
        amount: 0,
        multiplier: '1',
        status: 'open',
      })
      .returning();

    await tx
      .update(topics)
      .set({ predictionCount: topic.predictionCount + 1, updatedAt: now })
      .where(eq(topics.id, topic.id));
    await refreshTopicCountersInTx(tx, topic.id);

    return row;
  });
}

async function latestRealityCheck(exec: Exec, topicId: string) {
  const rows = await exec
    .select({ id: realityChecks.id, result: realityChecks.result })
    .from(realityChecks)
    .where(eq(realityChecks.topicId, topicId))
    .orderBy(desc(realityChecks.decidedAt))
    .limit(1);
  return rows[0] ?? null;
}

/** 话题页"立帖为证"区块的数据源（含当前用户的登记状态与登记门槛文案）。 */
export async function getTopicPredictionContext(
  topicId: string,
  viewerId?: string | null,
  now: Date = new Date(),
): Promise<TopicPredictionContext | null> {
  const [topic] = await db
    .select({
      id: topics.id,
      status: topics.status,
      type: topics.type,
      ownerId: topics.ownerId,
      stakeEnabled: topics.stakeEnabled,
      revealAt: topics.revealAt,
      visibility: topics.visibility,
      title: topics.title,
    })
    .from(topics)
    .where(and(eq(topics.id, topicId), eq(topics.visibility, 'public')))
    .limit(1);
  if (!topic) return null;

  const [rows, reality] = await Promise.all([
    loadPredictionRows(db, topicId),
    latestRealityCheck(db, topicId),
  ]);
  const openRows = rows.filter((row) => row.status === 'open');
  const userPrediction = viewerId
    ? rows.find((row) => row.bettorId === viewerId) ?? null
    : null;

  let gateError: string | null = null;
  if (viewerId && !reality) {
    gateError = predictionGateError({
      topicStatus: topic.status,
      topicType: topic.type,
      stakeEnabled: topic.stakeEnabled,
      revealAt: topic.revealAt,
      now,
      isOwner: topic.ownerId === viewerId,
      alreadyStaked: Boolean(userPrediction),
      openCount: openRows.length,
    });
  }

  return {
    stakeEnabled: topic.stakeEnabled,
    topicStatus: topic.status,
    topicType: topic.type,
    topicOwnerId: topic.ownerId,
    revealAt: topic.revealAt,
    openCount: openRows.length,
    totalCount: rows.length,
    perTopicOpenCap: PREDICTION_LIMITS.perTopicOpenCap,
    perTopicTotalCap: PREDICTION_LIMITS.perTopicTotalCap,
    regretOpenCount: openRows.filter((row) => row.predictedOutcome === 'regret').length,
    noRegretOpenCount: openRows.filter((row) => row.predictedOutcome === 'no_regret').length,
    settled: Boolean(reality),
    realityResult: reality?.result ?? null,
    userPrediction: userPrediction
      ? {
          id: userPrediction.id,
          topicId,
          topicTitle: topic.title,
          topicStatus: topic.status,
          statement: userPrediction.statement,
          predictedOutcome: userPrediction.predictedOutcome as PredictionOutcome,
          status: userPrediction.status as PredictionStatus,
          revealAt: topic.revealAt,
          realityResult: reality?.result ?? null,
          createdAt: userPrediction.createdAt,
        }
      : null,
    gateError,
  };
}

/** /me"我的押注"：按话题标题、揭晓状态、回访结果组装记录。 */
export async function getMyPredictions(userId: string): Promise<UserPredictionRecord[]> {
  const rows = await db
    .select({
      id: predictions.id,
      topicId: predictions.topicId,
      topicTitle: topics.title,
      topicStatus: topics.status,
      statement: predictions.statement,
      predictedOutcome: predictions.predictedOutcome,
      status: predictions.status,
      revealAt: topics.revealAt,
      realityResult: realityChecks.result,
      createdAt: predictions.createdAt,
    })
    .from(predictions)
    .innerJoin(topics, eq(predictions.topicId, topics.id))
    .leftJoin(realityChecks, eq(predictions.realityCheckId, realityChecks.id))
    .where(eq(predictions.bettorId, userId))
    .orderBy(desc(predictions.createdAt));

  return rows.map((row) => ({
    id: row.id,
    topicId: row.topicId,
    topicTitle: row.topicTitle,
    topicStatus: row.topicStatus,
    statement: row.statement,
    predictedOutcome: row.predictedOutcome as PredictionOutcome,
    status: row.status as PredictionStatus,
    revealAt: row.revealAt,
    realityResult: row.realityResult ?? null,
    createdAt: row.createdAt,
  }));
}

/** /me"我的话题"：楼主发起 / 参与讨论 / 只立帖为证 的话题。 */
export async function getMyTopics(userId: string): Promise<MyTopicRecord[]> {
  const [ownedRows, myClaimRows, myPredictionRows] = await Promise.all([
    db.select({ id: topics.id }).from(topics).where(eq(topics.ownerId, userId)),
    db
      .select({ topicId: claims.topicId, claimId: claims.id })
      .from(claims)
      .where(eq(claims.authorId, userId)),
    db
      .select({ topicId: predictions.topicId })
      .from(predictions)
      .where(eq(predictions.bettorId, userId)),
  ]);
  const owned = new Set(ownedRows.map((row) => row.id));
  const staked = new Set(myPredictionRows.map((row) => row.topicId));
  const claimCountByTopic = new Map<string, number>();
  for (const row of myClaimRows) {
    claimCountByTopic.set(row.topicId, (claimCountByTopic.get(row.topicId) ?? 0) + 1);
  }
  const topicIds = [
    ...new Set([...owned, ...claimCountByTopic.keys(), ...staked]),
  ];
  if (topicIds.length === 0) return [];

  const topicRows = await db
    .select({
      id: topics.id,
      title: topics.title,
      type: topics.type,
      status: topics.status,
      ownerId: topics.ownerId,
      stakeEnabled: topics.stakeEnabled,
      revealAt: topics.revealAt,
      lastActivityAt: topics.lastActivityAt,
      versionNo: conclusionVersions.versionNo,
    })
    .from(topics)
    .leftJoin(conclusionVersions, eq(topics.currentVersionId, conclusionVersions.id))
    .where(inArray(topics.id, topicIds))
    .orderBy(desc(topics.lastActivityAt));

  return topicRows.map((row) => {
    const isOwner = row.ownerId === userId;
    const role: MyTopicRecord['role'] = isOwner
      ? '发起'
      : (claimCountByTopic.get(row.id) ?? 0) > 0
        ? '参与'
        : '立帖为证';
    return {
      topicId: row.id,
      title: row.title,
      type: row.type,
      status: row.status,
      role,
      stakeEnabled: row.stakeEnabled,
      revealAt: row.revealAt,
      lastActivityAt: row.lastActivityAt,
      conclusionVersionNo: row.versionNo ?? null,
      ownClaimCount: claimCountByTopic.get(row.id) ?? 0,
    };
  });
}

/** 创建回访行（wave=30 先做；幂等由 UNIQUE(topic_id, wave) 兜底）。 */
export async function createFollowupInTx(
  tx: DbTx,
  input: { topicId: string; userId: string; wave: number; dueAt: Date },
) {
  const [row] = await tx
    .insert(decisionFollowups)
    .values({
      topicId: input.topicId,
      userId: input.userId,
      wave: input.wave,
      dueAt: input.dueAt,
      status: 'pending',
    })
    .onConflictDoNothing({
      target: [decisionFollowups.topicId, decisionFollowups.wave],
    })
    .returning();
  return row ?? null;
}

/** 楼主待回访行（话题页提示条用）。 */
export async function getPendingFollowup(
  topicId: string,
  userId: string,
  wave = 30,
): Promise<FollowupRecord | null> {
  const rows = await db
    .select()
    .from(decisionFollowups)
    .where(
      and(
        eq(decisionFollowups.topicId, topicId),
        eq(decisionFollowups.userId, userId),
        eq(decisionFollowups.wave, wave),
        eq(decisionFollowups.status, 'pending'),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export interface FollowupSettlementResult {
  realityCheckId: string;
  followupId: string;
  result: string;
  hit: number;
  miss: number;
  voided: number;
}

/**
 * 楼主回访揭晓（单事务）：mark followup done → reality_check →
 * 按结果批量结算该话题所有 open 押注 → 战绩与通知 → 刷新押注者 user_stats。
 */
export async function respondToFollowup(input: {
  topicId: string;
  userId: string;
  wave: number;
  regretLevel: string;
  evidenceNote?: string;
}): Promise<FollowupSettlementResult> {
  return db.transaction(async (tx) => {
    if (!isFollowupLevel(input.regretLevel)) {
      throw new Error('请选择回访结果：没有后悔 / 部分后悔 / 后悔了');
    }
    const [topic] = await tx
      .select({
        id: topics.id,
        ownerId: topics.ownerId,
        type: topics.type,
        status: topics.status,
        predictionCount: topics.predictionCount,
      })
      .from(topics)
      .where(eq(topics.id, input.topicId))
      .limit(1);
    if (!topic || topic.type !== 'decision') throw new Error('该话题不支持回访揭晓');
    if (topic.ownerId !== input.userId) throw new Error('只有楼主可以回访揭晓');

    const [followup] = await tx
      .select()
      .from(decisionFollowups)
      .where(
        and(
          eq(decisionFollowups.topicId, input.topicId),
          eq(decisionFollowups.wave, input.wave),
        ),
      )
      .limit(1);
    if (!followup || followup.status !== 'pending') {
      throw new Error('回访不存在或已完成');
    }
    if (followup.userId !== input.userId) throw new Error('只有楼主可以回访揭晓');

    const now = new Date();
    await tx
      .update(decisionFollowups)
      .set({
        status: 'done',
        respondedAt: now,
        regretLevel: input.regretLevel,
        updatedAt: now,
      })
      .where(eq(decisionFollowups.id, followup.id));

    const [realityCheck] = await tx
      .insert(realityChecks)
      .values({
        topicId: input.topicId,
        kind: 'decision',
        result: input.regretLevel,
        decidedBy: 'user',
        evidenceNote: input.evidenceNote?.trim() || null,
        decidedAt: now,
      })
      .returning();

    const openRows = await tx
      .select({
        id: predictions.id,
        bettorId: predictions.bettorId,
        predictedOutcome: predictions.predictedOutcome,
      })
      .from(predictions)
      .where(and(eq(predictions.topicId, input.topicId), eq(predictions.status, 'open')));

    const outcomeByStatus = { hit: 0, miss: 0, voided: 0 };
    const affectedUserIds = new Set<string>();
    const reputationValues: Array<{
      userId: string;
      outcome: 'positive' | 'negative' | 'neutral';
      topicId: string;
    }> = [];

    for (const row of openRows) {
      const status = settleForRealityResult(
        row.predictedOutcome as PredictionOutcome,
        input.regretLevel as DecisionRealityResult,
      );
      if (status === 'hit') outcomeByStatus.hit += 1;
      else if (status === 'miss') outcomeByStatus.miss += 1;
      else outcomeByStatus.voided += 1;
      affectedUserIds.add(row.bettorId);

      await tx
        .update(predictions)
        .set({
          status,
          realityCheckId: realityCheck.id,
          payout: status === 'hit' ? 0 : null,
        })
        .where(eq(predictions.id, row.id));

      reputationValues.push({
        userId: row.bettorId,
        outcome: status === 'hit' ? 'positive' : status === 'miss' ? 'negative' : 'neutral',
        topicId: input.topicId,
      });
    }
    if (reputationValues.length > 0) {
      await tx.insert(reputationEvents).values(
        reputationValues.map((entry) => ({
          userId: entry.userId,
          type: 'prediction_result',
          outcome: entry.outcome,
          topicId: entry.topicId,
          weight: '1',
          occurredAt: now,
        })),
      );
    }

    const remainingRows = await tx
      .select({ id: predictions.id })
      .from(predictions)
      .where(and(eq(predictions.topicId, input.topicId), ne(predictions.status, 'void')));
    await tx
      .update(topics)
      .set({ predictionCount: remainingRows.length, updatedAt: now })
      .where(eq(topics.id, input.topicId));
    await refreshTopicCountersInTx(tx, input.topicId);

    await tx.insert(claimEvents).values({
      topicId: input.topicId,
      type: 'reality_changed',
      actorUserId: input.userId,
      detail: {
        followupId: followup.id,
        wave: input.wave,
        realityCheckId: realityCheck.id,
        result: input.regretLevel,
        settledOpen: openRows.length,
        hit: outcomeByStatus.hit,
        miss: outcomeByStatus.miss,
        voided: outcomeByStatus.voided,
      },
    });

    for (const row of openRows) {
      const status = settleForRealityResult(
        row.predictedOutcome as PredictionOutcome,
        input.regretLevel as DecisionRealityResult,
      );
      await notifyInTx(tx, {
        userId: row.bettorId,
        type: 'reveal_result',
        title: status === 'hit' ? '你的立帖为证押中了' : status === 'miss' ? '你的立帖为证未押中' : '你的立帖为证已作废',
        body: `${outcomeLabel(row.predictedOutcome as PredictionOutcome)}——${realityResultLabel(input.regretLevel)}，现实已揭晓。`,
        dedupeKey: `prediction_result:${row.id}`,
        payload: { topicId: input.topicId, predictionId: row.id, result: input.regretLevel },
      });
    }

    for (const userId of affectedUserIds) {
      await refreshUserStatsInTx(tx, userId);
    }

    return {
      realityCheckId: realityCheck.id,
      followupId: followup.id,
      result: input.regretLevel,
      hit: outcomeByStatus.hit,
      miss: outcomeByStatus.miss,
      voided: outcomeByStatus.voided,
    };
  });
}

export interface FollowupAdvanceResult {
  followupId: string;
  reminderCreated: boolean;
  revealReminderCreated: boolean;
}

/**
 * 到期回访/揭晓提醒（worker，幂等）：pending 且 due_at 已过的 T+30 回访
 * → 给楼主发站内提醒；话题开启立帖为证且已过揭晓日 → 给押注者发揭晓提醒。
 */
export async function advanceFollowupPrompts(
  now: Date = new Date(),
  limit = 100,
): Promise<FollowupAdvanceResult[]> {
  return db.transaction(async (tx) => {
    const dueRows = await tx
      .select({
        id: decisionFollowups.id,
        topicId: decisionFollowups.topicId,
        userId: decisionFollowups.userId,
        wave: decisionFollowups.wave,
        dueAt: decisionFollowups.dueAt,
      })
      .from(decisionFollowups)
      .where(
        and(eq(decisionFollowups.status, 'pending'), lt(decisionFollowups.dueAt, now)),
      )
      .limit(limit);

    const results: FollowupAdvanceResult[] = [];
    for (const followup of dueRows) {
      await notifyInTx(tx, {
        userId: followup.userId,
        type: 'followup_due',
        title: `T+${followup.wave} 回访提醒：你的决定过去 ${followup.wave} 天了`,
        body: '回访一下当初的决定：后悔了吗？哪条论据最值钱？你的回答会揭晓大家的“立帖为证”。',
        dedupeKey: `followup_due:${followup.id}`,
        payload: { topicId: followup.topicId, wave: followup.wave, dueAt: followup.dueAt.toISOString() },
      });

      const [topic] = await tx
        .select({ stakeEnabled: topics.stakeEnabled, revealAt: topics.revealAt })
        .from(topics)
        .where(eq(topics.id, followup.topicId))
        .limit(1);
      let revealReminderCreated = false;
      if (topic?.stakeEnabled && topic.revealAt && topic.revealAt.getTime() <= now.getTime()) {
        const bettorRows = await tx
          .select({ bettorId: predictions.bettorId })
          .from(predictions)
          .where(and(eq(predictions.topicId, followup.topicId), eq(predictions.status, 'open')));
        for (const bettorId of new Set(bettorRows.map((row) => row.bettorId))) {
          await notifyInTx(tx, {
            userId: bettorId,
            type: 'reveal_reminder',
            title: '你立的帖到了揭晓日',
            body: '楼主正在回访当初的决定，揭晓结果出来后你会第一时间收到通知。',
            dedupeKey: `reveal_reminder:${followup.topicId}`,
            payload: { topicId: followup.topicId },
          });
          revealReminderCreated = true;
        }
      }

      results.push({
        followupId: followup.id,
        reminderCreated: true,
        revealReminderCreated,
      });
    }
    return results;
  });
}
