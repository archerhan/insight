/**
 * M5 收尾集成测试：只在 TEST_DATABASE_URL 的测试库运行。
 * 覆盖：押注登记门槛与计数、出结论书自动生成 T+30 回访、
 * 楼主回访揭晓（reality_check + 批量结算 + 战绩/通知）、
 * worker 到期回访/揭晓提醒幂等、挂红阶段站内提醒幂等。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { and, asc, eq, inArray, like } from 'drizzle-orm';
import { db } from '../client';
import {
  challenges,
  claimEvents,
  claims,
  conclusionItems,
  conclusionVersions,
  decisionFollowups,
  evidence,
  notifications,
  predictions,
  realityChecks,
  reputationEvents,
  topics,
  users,
  userStats,
} from '../schema';

const connectionString = process.env.TEST_DATABASE_URL;
const describeDb = describe.runIf(connectionString);

describeDb('M5 押注/回访/通知（集成）', () => {
  let pg: ReturnType<typeof postgres>;
  let tree: typeof import('./tree');
  let conclusion: typeof import('./conclusion');
  let predictionsSvc: typeof import('./predictions');
  let timers: typeof import('./timers');
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let userSeq = 0;
  const topicIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(async () => {
    pg = postgres(connectionString!, { max: 1, prepare: false });
    process.env.DATABASE_URL = connectionString!;
    tree = await import('./tree');
    conclusion = await import('./conclusion');
    predictionsSvc = await import('./predictions');
    timers = await import('./timers');
  });

  afterAll(async () => {
    for (const topicId of topicIds) {
      await db.delete(decisionFollowups).where(eq(decisionFollowups.topicId, topicId));
      await db.delete(predictions).where(eq(predictions.topicId, topicId));
      await db.delete(realityChecks).where(eq(realityChecks.topicId, topicId));
      const versionRows = await db
        .select({ id: conclusionVersions.id })
        .from(conclusionVersions)
        .where(eq(conclusionVersions.topicId, topicId));
      const versionIds = versionRows.map((row) => row.id);
      if (versionIds.length > 0) {
        await db.delete(conclusionItems).where(inArray(conclusionItems.versionId, versionIds));
        await db.delete(conclusionVersions).where(inArray(conclusionVersions.id, versionIds));
      }
      const claimRows = await db
        .select({ id: claims.id })
        .from(claims)
        .where(eq(claims.topicId, topicId));
      const claimIds = claimRows.map((row) => row.id);
      if (claimIds.length > 0) {
        await db.delete(evidence).where(inArray(evidence.claimId, claimIds));
      }
      await db.delete(reputationEvents).where(eq(reputationEvents.topicId, topicId));
      await db.delete(claimEvents).where(eq(claimEvents.topicId, topicId));
      await db.delete(challenges).where(eq(challenges.topicId, topicId));
      await db.delete(claims).where(eq(claims.topicId, topicId));
      await db.delete(topics).where(eq(topics.id, topicId));
    }
    if (userIds.length > 0) {
      await db.delete(notifications).where(inArray(notifications.userId, userIds));
      await db.delete(userStats).where(inArray(userStats.userId, userIds));
    }
    await db.delete(users).where(like(users.authId, `%${nonce}%`));
    await pg.end();
  });

  async function createUsers(count = 3) {
    const seq = userSeq++;
    const rows = await db
      .insert(users)
      .values(
        Array.from({ length: count }, (_, index) => ({
          authId: `m5-user-${nonce}-${seq}-${index}`,
          displayName: `M5 集成用户 ${seq}-${index}`,
          courseCompletedAt: new Date(),
        })),
      )
      .returning({ id: users.id });
    userIds.push(...rows.map((row) => row.id));
    return rows.map((row) => row.id);
  }

  async function openStakedTopic(ownerId: string, suffix: string) {
    const created = await tree.createTopicWithRoot({
      ownerId,
      type: 'decision',
      title: `M5 ${suffix} ${nonce}`,
      rootContentTitle: `根立场-${suffix}-${nonce}`,
    });
    const revealAt = new Date(Date.now() + 60 * 86_400_000);
    await db
      .update(topics)
      .set({ stakeEnabled: true, revealAt })
      .where(eq(topics.id, created.topic.id));
    topicIds.push(created.topic.id);
    return { topic: { ...created.topic, stakeEnabled: true, revealAt }, root: created.root };
  }

  async function countNotifications(userId: string, type: string) {
    const rows = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.type, type)));
    return rows.length;
  }

  it('押注登记：合法登记 + 楼主自押/重复登记/未开启拦截', async () => {
    const [ownerId, bettorA] = await createUsers(2);
    const { topic } = await openStakedTopic(ownerId, '登记');

    const placed = await predictionsSvc.placePrediction({
      topicId: topic.id,
      bettorId: bettorA,
      statement: '我押楼主三个月内会后悔：现金流撑不住',
      predictedOutcome: 'regret',
    });
    expect(placed.status).toBe('open');
    const [topicRow] = await db
      .select({ predictionCount: topics.predictionCount })
      .from(topics)
      .where(eq(topics.id, topic.id));
    expect(topicRow.predictionCount).toBe(1);

    await expect(
      predictionsSvc.placePrediction({
        topicId: topic.id,
        bettorId: bettorA,
        statement: '我再押一次不后悔',
        predictedOutcome: 'no_regret',
      }),
    ).rejects.toThrow(/一个话题只记一次/);
    await expect(
      predictionsSvc.placePrediction({
        topicId: topic.id,
        bettorId: ownerId,
        statement: '我押自己不后悔',
        predictedOutcome: 'no_regret',
      }),
    ).rejects.toThrow(/不能押自己/);

    const [closedTopic] = await db
      .select({ id: topics.id })
      .from(topics)
      .where(eq(topics.id, topic.id));
    await db.update(topics).set({ stakeEnabled: false }).where(eq(topics.id, closedTopic.id));
    const [otherUser] = await createUsers(1);
    await expect(
      predictionsSvc.placePrediction({
        topicId: topic.id,
        bettorId: otherUser,
        statement: '这个话题没开立帖为证',
        predictedOutcome: 'no_regret',
      }),
    ).rejects.toThrow(/没有开启立帖为证/);
  });

  it('出结论书自动生成 T+30 回访；楼主回访揭晓批量结算并写 reality_check/战绩/通知', async () => {
    const [ownerId, regretBettor, noRegretBettor] = await createUsers(3);
    const { topic, root } = await openStakedTopic(ownerId, '结算');

    await predictionsSvc.placePrediction({
      topicId: topic.id,
      bettorId: regretBettor,
      statement: '我押楼主会后悔',
      predictedOutcome: 'regret',
    });
    await predictionsSvc.placePrediction({
      topicId: topic.id,
      bettorId: noRegretBettor,
      statement: '我押楼主不会后悔',
      predictedOutcome: 'no_regret',
    });

    const published = await conclusion.publishConclusion({
      topicId: topic.id,
      actorId: ownerId,
      verdictText: '先用年假验证，不急着裸辞',
      adoptedClaimIds: [root.id],
    });
    expect(published.version.status).toBe('published');

    const followups = await db
      .select()
      .from(decisionFollowups)
      .where(eq(decisionFollowups.topicId, topic.id));
    expect(followups).toHaveLength(1);
    expect(followups[0]).toMatchObject({
      userId: ownerId,
      wave: 30,
      status: 'pending',
    });

    const settlement = await predictionsSvc.respondToFollowup({
      topicId: topic.id,
      userId: ownerId,
      wave: 30,
      regretLevel: 'no_regret',
    });
    expect(settlement).toMatchObject({ result: 'no_regret', hit: 1, miss: 1, voided: 0 });

    const [reality] = await db
      .select()
      .from(realityChecks)
      .where(eq(realityChecks.topicId, topic.id));
    expect(reality).toMatchObject({ kind: 'decision', result: 'no_regret', decidedBy: 'user' });

    const settledRows = await db
      .select({ bettorId: predictions.bettorId, status: predictions.status })
      .from(predictions)
      .where(eq(predictions.topicId, topic.id))
      .orderBy(asc(predictions.createdAt));
    expect(settledRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bettorId: regretBettor, status: 'miss' }),
        expect.objectContaining({ bettorId: noRegretBettor, status: 'hit' }),
      ]),
    );

    const eventRows = await db
      .select({ type: claimEvents.type, detail: claimEvents.detail })
      .from(claimEvents)
      .where(and(eq(claimEvents.topicId, topic.id), eq(claimEvents.type, 'reality_changed')));
    expect(eventRows).toHaveLength(1);
    expect(eventRows[0].detail).toMatchObject({ result: 'no_regret', hit: 1, miss: 1 });

    expect(await countNotifications(regretBettor, 'reveal_result')).toBe(1);
    expect(await countNotifications(noRegretBettor, 'reveal_result')).toBe(1);

    const [missStats] = await db
      .select()
      .from(userStats)
      .where(eq(userStats.userId, regretBettor));
    expect(missStats).toMatchObject({ predictionHit: 0, predictionTotal: 1 });
    const [hitStats] = await db
      .select()
      .from(userStats)
      .where(eq(userStats.userId, noRegretBettor));
    expect(hitStats).toMatchObject({ predictionHit: 1, predictionTotal: 1 });
  });

  it('到期 worker：回访与揭晓提醒生成且幂等', async () => {
    const [ownerId, bettor] = await createUsers(2);
    const { topic, root } = await openStakedTopic(ownerId, '提醒');
    await predictionsSvc.placePrediction({
      topicId: topic.id,
      bettorId: bettor,
      statement: '我押三个月后见分晓',
      predictedOutcome: 'no_regret',
    });
    const published = await conclusion.publishConclusion({
      topicId: topic.id,
      actorId: ownerId,
      verdictText: '结论：先验证再决定',
      adoptedClaimIds: [root.id],
    });
    void published;

    await db
      .update(decisionFollowups)
      .set({ dueAt: new Date(Date.now() - 1 * 86_400_000) })
      .where(and(eq(decisionFollowups.topicId, topic.id), eq(decisionFollowups.wave, 30)));
    await db
      .update(topics)
      .set({ revealAt: new Date(Date.now() - 1 * 86_400_000) })
      .where(eq(topics.id, topic.id));

    const first = await predictionsSvc.advanceFollowupPrompts(new Date());
    expect(first).toHaveLength(1);
    expect(first[0].reminderCreated).toBe(true);
    expect(first[0].revealReminderCreated).toBe(true);
    expect(await countNotifications(ownerId, 'followup_due')).toBe(1);
    expect(await countNotifications(bettor, 'reveal_reminder')).toBe(1);

    await predictionsSvc.advanceFollowupPrompts(new Date());
    expect(await countNotifications(ownerId, 'followup_due')).toBe(1);
    expect(await countNotifications(bettor, 'reveal_reminder')).toBe(1);
  });

  it('挂红阶段推进时给被反驳作者发站内提醒（幂等）', async () => {
    const [ownerId, rebutterId] = await createUsers(2);
    const { topic, root } = await openStakedTopic(ownerId, '挂红');
    await tree.attachRebuttal({
      topicId: topic.id,
      targetClaimId: root.id,
      contentTitle: '民宿淡季现金流撑不住',
      authorId: rebutterId,
    });

    await timers.advanceChallengeTimersForTopic(topic.id, new Date(Date.now() + 4 * 86_400_000));
    expect(await countNotifications(ownerId, 'challenge_timer')).toBe(1);
    await timers.advanceChallengeTimersForTopic(topic.id, new Date(Date.now() + 4 * 86_400_000));
    expect(await countNotifications(ownerId, 'challenge_timer')).toBe(1);

    await timers.advanceChallengeTimersForTopic(topic.id, new Date(Date.now() + 8 * 86_400_000));
    expect(await countNotifications(ownerId, 'challenge_timer')).toBe(2);
  });
});
