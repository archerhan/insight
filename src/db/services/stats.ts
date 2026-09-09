import { and, eq, inArray } from 'drizzle-orm';
import { db, type Db, type DbTx } from '@/db/client';
import {
  claims,
  conclusionItems,
  predictions,
  reputationEvents,
  stanceChanges,
  topics,
  userStats,
} from '@/db/schema';
import { judgmentPercent } from '@/lib/domain/predictions';

/**
 * 战绩速览（M5）：user_stats 是可重算物化结果，源数据在
 * reputation_events / stance_changes / conclusion_items / predictions。
 * 判断力先做押注命中率；裁定权重先置 1；其余治理列留空/零值待第二期。
 */

export interface UserStatsView {
  judgmentScore: number | null;
  predictionHit: number;
  predictionTotal: number;
  contributionCount: number;
  persuasionCount: number;
  honestyCount: number;
  abandonCount: number;
  adjudicatorWeight: number;
  driftLevel: string;
  riskClosuresTotal: number;
  updatedAt: Date;
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
}

async function computeSnapshot(
  exec: Db | DbTx,
  userId: string,
): Promise<{
  predictionHit: number;
  predictionTotal: number;
  contributionCount: number;
  persuasionCount: number;
  honestyCount: number;
  riskClosuresTotal: number;
}> {
  const settledRows = await exec
    .select({ status: predictions.status })
    .from(predictions)
    .where(and(eq(predictions.bettorId, userId), inArray(predictions.status, ['hit', 'miss'])));
  const predictionHit = settledRows.filter((row) => row.status === 'hit').length;
  const predictionTotal = settledRows.length;

  const [adoptedRows, persuasionRows, honestyRows, riskClosedRows] = await Promise.all([
    exec
      .select({ id: conclusionItems.id })
      .from(conclusionItems)
      .innerJoin(claims, eq(conclusionItems.claimId, claims.id))
      .where(eq(claims.authorId, userId)),
    exec
      .select({ id: reputationEvents.id })
      .from(reputationEvents)
      .where(
        and(
          eq(reputationEvents.userId, userId),
          eq(reputationEvents.type, 'persuasion'),
          eq(reputationEvents.outcome, 'positive'),
        ),
      ),
    exec
      .select({ id: stanceChanges.id })
      .from(stanceChanges)
      .where(eq(stanceChanges.userId, userId)),
    exec
      .select({ id: topics.id })
      .from(topics)
      .where(and(eq(topics.ownerId, userId), eq(topics.status, 'risk_closed'))),
  ]);

  return {
    predictionHit,
    predictionTotal,
    contributionCount: adoptedRows.length,
    persuasionCount: persuasionRows.length,
    honestyCount: honestyRows.length,
    riskClosuresTotal: riskClosedRows.length,
  };
}

async function refreshInTx(exec: Db | DbTx, userId: string): Promise<UserStatsView> {
  const snapshot = await computeSnapshot(exec, userId);
  const judgment = judgmentPercent(snapshot.predictionHit, snapshot.predictionTotal);
  const now = new Date();
  await exec
    .insert(userStats)
    .values({
      userId,
      judgmentScore: judgment === null ? null : `${judgment}`,
      predictionHit: snapshot.predictionHit,
      predictionTotal: snapshot.predictionTotal,
      contributionCount: snapshot.contributionCount,
      persuasionCount: snapshot.persuasionCount,
      honestyCount: snapshot.honestyCount,
      abandonCount: 0,
      adjudicatorWeight: '1',
      driftLevel: 'low',
      openPenalties: 0,
      riskClosuresTotal: snapshot.riskClosuresTotal,
      riskClosuresValidated: 0,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userStats.userId,
      set: {
        judgmentScore: judgment === null ? null : `${judgment}`,
        predictionHit: snapshot.predictionHit,
        predictionTotal: snapshot.predictionTotal,
        contributionCount: snapshot.contributionCount,
        persuasionCount: snapshot.persuasionCount,
        honestyCount: snapshot.honestyCount,
        abandonCount: 0,
        adjudicatorWeight: '1',
        driftLevel: 'low',
        openPenalties: 0,
        riskClosuresTotal: snapshot.riskClosuresTotal,
        riskClosuresValidated: 0,
        updatedAt: now,
      },
    });

  return {
    judgmentScore: judgment,
    predictionHit: snapshot.predictionHit,
    predictionTotal: snapshot.predictionTotal,
    contributionCount: snapshot.contributionCount,
    persuasionCount: snapshot.persuasionCount,
    honestyCount: snapshot.honestyCount,
    abandonCount: 0,
    adjudicatorWeight: 1,
    driftLevel: 'low',
    riskClosuresTotal: snapshot.riskClosuresTotal,
    updatedAt: now,
  };
}

/** 在同事务内重算并物化某用户的战绩（押注结算/采纳/立场变更后调用）。 */
export async function refreshUserStatsInTx(tx: DbTx, userId: string): Promise<UserStatsView> {
  return refreshInTx(tx, userId);
}

/** 事务外重算（读取兜底：个人战绩页总是先刷新再展示）。 */
export async function refreshUserStats(userId: string): Promise<UserStatsView> {
  return db.transaction(async (tx) => refreshInTx(tx, userId));
}

function toView(row: typeof userStats.$inferSelect): UserStatsView {
  return {
    judgmentScore: toNumber(row.judgmentScore),
    predictionHit: row.predictionHit,
    predictionTotal: row.predictionTotal,
    contributionCount: row.contributionCount,
    persuasionCount: row.persuasionCount,
    honestyCount: row.honestyCount,
    abandonCount: row.abandonCount,
    adjudicatorWeight: toNumber(row.adjudicatorWeight) ?? 1,
    driftLevel: row.driftLevel,
    riskClosuresTotal: row.riskClosuresTotal,
    updatedAt: row.updatedAt,
  };
}

/** 读取战绩速览：若尚未物化则先按账本重算一次。 */
export async function getUserStatsView(userId: string): Promise<UserStatsView> {
  const rows = await db
    .select()
    .from(userStats)
    .where(eq(userStats.userId, userId))
    .limit(1);
  if (rows[0]) return toView(rows[0]);
  return refreshUserStats(userId);
}
