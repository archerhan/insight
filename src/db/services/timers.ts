import { and, eq, inArray } from 'drizzle-orm';
import { db, type DbTx } from '@/db/client';
import { challenges, claimEvents, claims } from '@/db/schema';
import { challengePhaseAt, type ChallengePhase } from '@/lib/domain/challenges';
import { notifyInTx } from './notifications';

/**
 * 3/7/14 天计时推进（Vercel Cron 每日调用 + 后续读取路径的惰性兜底）。
 *
 * 语义（《裁判机制设计》）：反驳挂上即 challenge open；
 * 3 天到橙色、7 天到红色、14 天到期——阶段推进写 claim_events 留痕。
 * 14 天后的"默认判负"需要轻陪审（L2，二期）确认，本层不做判负。
 * 幂等：同一 challenge 的同一 phase 只留一条事件。
 */

export interface TimerAdvanceResult {
  challengeId: string;
  phase: ChallengePhase | 'open';
  eventWritten: boolean;
}

/** 当前阶段之前经过的所有阶段（含当前），供补写缺失的事件。 */
function phasesUpTo(phase: ChallengePhase): ChallengePhase[] {
  if (phase === 'open') return [];
  const order: ChallengePhase[] = ['orange', 'red', 'due'];
  return order.slice(0, order.indexOf(phase) + 1);
}

async function advanceRowsInTx(
  tx: DbTx,
  now: Date,
  rows: Array<{ id: string; topicId: string; targetClaimId: string; openedAt: Date }>,
): Promise<TimerAdvanceResult[]> {
  const targetIds = [...new Set(rows.map((row) => row.targetClaimId))];
  const targetRows = targetIds.length
    ? await tx
        .select({ id: claims.id, authorId: claims.authorId, contentTitle: claims.contentTitle })
        .from(claims)
        .where(inArray(claims.id, targetIds))
    : [];
  const targetById = new Map(targetRows.map((row) => [row.id, row]));
  const phaseNotify: Record<ChallengePhase, { title: string; body: string }> = {
    orange: {
      title: '你的论点被反驳后已进入橙色提醒',
      body: '对方反驳已 3 天未得到回应，尽快正面回应或承认击穿。',
    },
    red: {
      title: '你的论点被反驳后已进入红色警示',
      body: '未回应反驳已满 7 天，结论书展示时会被降权。',
    },
    due: {
      title: '你的论点反驳已到期（14 天）',
      body: '若你仍活跃未回应，对方可申请“默认判负”（需轻陪审确认）。',
    },
    open: { title: '', body: '' },
  };
  const results: TimerAdvanceResult[] = [];
  for (const challenge of rows) {
    const phase = challengePhaseAt(now.toISOString(), challenge.openedAt.toISOString());
    if (phase === 'open') {
      results.push({ challengeId: challenge.id, phase, eventWritten: false });
      continue;
    }

    const existing = await tx
      .select({ detail: claimEvents.detail })
      .from(claimEvents)
      .where(
        and(
          eq(claimEvents.topicId, challenge.topicId),
          eq(claimEvents.claimId, challenge.targetClaimId),
          eq(claimEvents.type, 'challenge_timer'),
        ),
      );
    let eventWritten = false;
    for (const phaseToLog of phasesUpTo(phase)) {
      const alreadyLogged = existing.some(
        (event) => event.detail && event.detail.phase === phaseToLog,
      );
      if (!alreadyLogged) {
        await tx.insert(claimEvents).values({
          topicId: challenge.topicId,
          claimId: challenge.targetClaimId,
          type: 'challenge_timer',
          detail: { challengeId: challenge.id, phase: phaseToLog, loggedAt: now.toISOString() },
        });
        const target = targetById.get(challenge.targetClaimId);
        if (target?.authorId) {
          await notifyInTx(tx, {
            userId: target.authorId,
            type: 'challenge_timer',
            title: phaseNotify[phaseToLog].title,
            body: phaseNotify[phaseToLog].body,
            dedupeKey: `challenge_timer:${challenge.id}:${phaseToLog}`,
            payload: {
              challengeId: challenge.id,
              topicId: challenge.topicId,
              claimId: challenge.targetClaimId,
              claimTitle: target.contentTitle,
              phase: phaseToLog,
            },
          });
        }
        eventWritten = true;
      }
    }
    results.push({ challengeId: challenge.id, phase, eventWritten });
  }
  return results;
}

export async function advanceChallengeTimers(
  now: Date = new Date(),
  limit = 100,
): Promise<TimerAdvanceResult[]> {
  return db.transaction(async (tx) => {
    const openChallenges = await tx
      .select({
        id: challenges.id,
        topicId: challenges.topicId,
        targetClaimId: challenges.targetClaimId,
        openedAt: challenges.openedAt,
      })
      .from(challenges)
      .where(eq(challenges.status, 'open'))
      .limit(limit);
    return advanceRowsInTx(tx, now, openChallenges);
  });
}

/** 读取路径的惰性兜底：只推进单个话题内的未决反驳（幂等）。 */
export async function advanceChallengeTimersForTopic(
  topicId: string,
  now: Date = new Date(),
): Promise<TimerAdvanceResult[]> {
  return db.transaction(async (tx) => {
    const openChallenges = await tx
      .select({
        id: challenges.id,
        topicId: challenges.topicId,
        targetClaimId: challenges.targetClaimId,
        openedAt: challenges.openedAt,
      })
      .from(challenges)
      .where(and(eq(challenges.topicId, topicId), eq(challenges.status, 'open')));
    return advanceRowsInTx(tx, now, openChallenges);
  });
}
