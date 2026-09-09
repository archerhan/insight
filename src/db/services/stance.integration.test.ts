/**
 * M4 立场变更服务集成测试：只在 TEST_DATABASE_URL 的测试库运行。
 * 覆盖“我改主意了”向导写入顺序：novelty 校验 → stance_changes →
 * claim_events(stance_changed) → honesty/persuasion 战绩 → 时间线可见。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { and, asc, eq, inArray, like } from 'drizzle-orm';
import { db } from '../client';
import {
  claimEvents,
  claims,
  reputationEvents,
  stanceChanges,
  topics,
  users,
} from '../schema';

const connectionString = process.env.TEST_DATABASE_URL;
const describeDb = describe.runIf(connectionString);

describeDb('立场变更服务（集成）', () => {
  let pg: ReturnType<typeof postgres>;
  let tree: typeof import('./tree');
  let stance: typeof import('./stance');
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let userSeq = 0;
  const topicIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(async () => {
    pg = postgres(connectionString!, { max: 1, prepare: false });
    process.env.DATABASE_URL = connectionString!;
    tree = await import('./tree');
    stance = await import('./stance');
  });

  afterAll(async () => {
    for (const topicId of topicIds) {
      await db.delete(reputationEvents).where(eq(reputationEvents.topicId, topicId));
      await db.delete(stanceChanges).where(eq(stanceChanges.topicId, topicId));
      await db.delete(claimEvents).where(eq(claimEvents.topicId, topicId));
      const claimIds = (
        await db.select({ id: claims.id }).from(claims).where(eq(claims.topicId, topicId))
      ).map((row) => row.id);
      if (claimIds.length > 0) {
        await db.delete(claims).where(inArray(claims.id, claimIds));
      }
      await db.delete(topics).where(eq(topics.id, topicId));
    }
    await db.delete(users).where(like(users.authId, `%${nonce}%`));
    await pg.end();
  });

  async function createUser(label: string) {
    const seq = userSeq++;
    const [row] = await db
      .insert(users)
      .values({
        authId: `stance-user-${nonce}-${seq}-${label}`,
        displayName: `立场集成用户 ${seq}-${label}`,
        courseCompletedAt: new Date(),
      })
      .returning({ id: users.id });
    userIds.push(row.id);
    return row.id;
  }

  async function openTopic(ownerId: string, title: string) {
    const created = await tree.createTopicWithRoot({
      ownerId,
      type: 'decision',
      title: `${title} ${nonce}`,
      rootContentTitle: `原立场-${title}-${nonce}`,
    });
    topicIds.push(created.topic.id);
    return created;
  }

  async function eventsOf(topicId: string) {
    return db
      .select({ type: claimEvents.type, claimId: claimEvents.claimId })
      .from(claimEvents)
      .where(eq(claimEvents.topicId, topicId))
      .orderBy(asc(claimEvents.id));
  }

  it('被新论点说服：stance_changes + stance_changed 事件 + honesty/persuasion 战绩 + 时间线', async () => {
    const ownerId = await createUser('owner');
    const persuaderId = await createUser('persuader');
    const { topic, root } = await openTopic(ownerId, '民宿');
    const source = await tree.createClaimUnder({
      topicId: topic.id,
      parentId: root.id,
      relation: 'pro',
      contentTitle: '先用年假试住 3–4 周再决定是否辞职',
      authorId: persuaderId,
    });

    const result = await stance.recordStanceChange({
      topicId: topic.id,
      userId: ownerId,
      fromStance: root.contentTitle,
      toStance: '倾向先试住 3–4 周再决定',
      statement: '对方的试住方案击中了我的盲区：我赌的是生活方式，而不是经营能力。',
      sourceClaimId: source.id,
    });
    expect(result.noveltyPass).toBe(true);

    const [row] = await db
      .select()
      .from(stanceChanges)
      .where(eq(stanceChanges.id, result.stanceChange.id));
    expect(row).toMatchObject({
      topicId: topic.id,
      userId: ownerId,
      sourceClaimId: source.id,
      persuaderUserId: persuaderId,
      noveltyPass: true,
    });

    const events = await eventsOf(topic.id);
    expect(events.some((event) => event.type === 'stance_changed')).toBe(true);

    const ownerEvents = await db
      .select({ type: reputationEvents.type })
      .from(reputationEvents)
      .where(and(eq(reputationEvents.userId, ownerId), eq(reputationEvents.topicId, topic.id)));
    expect(ownerEvents.map((event) => event.type)).toContain('honesty');

    const persuaderEvents = await db
      .select({ type: reputationEvents.type })
      .from(reputationEvents)
      .where(and(eq(reputationEvents.userId, persuaderId), eq(reputationEvents.topicId, topic.id)));
    expect(persuaderEvents.map((event) => event.type)).toContain('persuasion');

    const timeline = await stance.getStanceTimeline(ownerId);
    expect(timeline[0]).toMatchObject({
      topicId: topic.id,
      fromStance: root.contentTitle,
      toStance: '倾向先试住 3–4 周再决定',
      sourceClaimTitle: '先用年假试住 3–4 周再决定是否辞职',
      sourceAuthorName: expect.any(String),
      noveltyPass: true,
    });

    const counts = await stance.getProfileCounts(ownerId);
    expect(counts.honestyCount).toBe(1);
    const persuaderCounts = await stance.getProfileCounts(persuaderId);
    expect(persuaderCounts.persuasionCount).toBe(1);
  });

  it('引用自己/其他话题的论点作为来源被拒绝', async () => {
    const ownerId = await createUser('owner-self');
    const otherId = await createUser('other-self');
    const topicA = await openTopic(ownerId, '自己来源');
    const topicB = await openTopic(otherId, '跨话题来源');
    const ownClaim = await tree.createClaimUnder({
      topicId: topicA.topic.id,
      parentId: topicA.root.id,
      relation: 'pro',
      contentTitle: '我自己发布的支持理由',
      authorId: ownerId,
    });
    const otherTopicClaim = await tree.createClaimUnder({
      topicId: topicB.topic.id,
      parentId: topicB.root.id,
      relation: 'pro',
      contentTitle: '另一个话题里的论点',
      authorId: otherId,
    });

    await expect(
      stance.recordStanceChange({
        topicId: topicA.topic.id,
        userId: ownerId,
        fromStance: topicA.root.contentTitle,
        toStance: '想改成新立场',
        statement: '引用自己的论点不算被说服，证词足够长。',
        sourceClaimId: ownClaim.id,
      }),
    ).rejects.toThrow('不能是自己发布的论点');

    await expect(
      stance.recordStanceChange({
        topicId: topicA.topic.id,
        userId: ownerId,
        fromStance: topicA.root.contentTitle,
        toStance: '想改成新立场',
        statement: '引用其它话题的论点作为来源应被拒绝。',
        sourceClaimId: otherTopicClaim.id,
      }),
    ).rejects.toThrow('必须来自当前话题');
  });

  it('陈旧来源（早于既有立场）仍留档但 novelty=false 且不发战绩', async () => {
    const ownerId = await createUser('owner-stale');
    const otherId = await createUser('other-stale');
    const { topic, root } = await openTopic(ownerId, '陈旧');
    const source = await tree.createClaimUnder({
      topicId: topic.id,
      parentId: root.id,
      relation: 'pro',
      contentTitle: '早于楼主既有立场的论据',
      authorId: otherId,
    });
    await db
      .update(claims)
      .set({ createdAt: new Date(root.createdAt.getTime() - 86_400_000) })
      .where(eq(claims.id, source.id));

    const result = await stance.recordStanceChange({
      topicId: topic.id,
      userId: ownerId,
      fromStance: root.contentTitle,
      toStance: '考虑先试住',
      statement: '虽然来源较早，但这让我重新审视了自己的立场。',
      sourceClaimId: source.id,
    });
    expect(result.noveltyPass).toBe(false);

    const events = await db
      .select({ type: reputationEvents.type })
      .from(reputationEvents)
      .where(and(eq(reputationEvents.userId, ownerId), eq(reputationEvents.topicId, topic.id)));
    expect(events).toHaveLength(0);
  });

  it('同一话题内第二次变更被拒绝；跨话题可继续记录', async () => {
    const ownerId = await createUser('owner-twice');
    const otherId = await createUser('other-twice');
    const first = await openTopic(ownerId, '第一次');
    const second = await openTopic(ownerId, '第二次');
    const source1 = await tree.createClaimUnder({
      topicId: first.topic.id,
      parentId: first.root.id,
      relation: 'pro',
      contentTitle: '来源论点一',
      authorId: otherId,
    });
    const source2 = await tree.createClaimUnder({
      topicId: second.topic.id,
      parentId: second.root.id,
      relation: 'pro',
      contentTitle: '来源论点二',
      authorId: otherId,
    });

    await stance.recordStanceChange({
      topicId: first.topic.id,
      userId: ownerId,
      fromStance: first.root.contentTitle,
      toStance: '新立场一',
      statement: '第一次被说服，证词足够长以便通过校验。',
      sourceClaimId: source1.id,
    });
    await expect(
      stance.recordStanceChange({
        topicId: first.topic.id,
        userId: ownerId,
        fromStance: '新立场一',
        toStance: '又改了',
        statement: '第二次想在同一话题再改，不应被允许。',
        sourceClaimId: source1.id,
      }),
    ).rejects.toThrow('一个话题只保留一次有效更新');

    await stance.recordStanceChange({
      topicId: second.topic.id,
      userId: ownerId,
      fromStance: second.root.contentTitle,
      toStance: '新立场二',
      statement: '跨话题再次被说服，证词足够长以便通过校验。',
      sourceClaimId: source2.id,
    });
    const timeline = await stance.getStanceTimeline(ownerId);
    expect(timeline.map((entry) => entry.topicId)).toEqual(
      expect.arrayContaining([first.topic.id, second.topic.id]),
    );
  });
});
