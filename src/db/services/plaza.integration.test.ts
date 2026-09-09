/**
 * 广场读服务集成测试：只在 TEST_DATABASE_URL 的测试库上运行。
 * 覆盖"正在对线 / 最新结论书 / 即将揭晓 / 右侧战绩速览"四类查询。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { eq, inArray, like } from 'drizzle-orm';
import { db } from '../client';
import {
  challenges,
  claimEvents,
  claims,
  conclusionItems,
  conclusionVersions,
  evidence,
  stanceChanges,
  tags,
  topicTags,
  topics,
  users,
} from '../schema';

const connectionString = process.env.TEST_DATABASE_URL;
const describeDb = describe.runIf(connectionString);

describeDb('广场读服务（集成）', () => {
  let sql: ReturnType<typeof postgres>;
  let publish: typeof import('./publish');
  let plaza: typeof import('./plaza');
  let tree: typeof import('./tree');
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let userSeq = 0;
  const topicIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(async () => {
    sql = postgres(connectionString!, { max: 1, prepare: false });
    process.env.DATABASE_URL = connectionString!;
    publish = await import('./publish');
    plaza = await import('./plaza');
    tree = await import('./tree');
  });

  afterAll(async () => {
    if (topicIds.length > 0) {
      if (userIds.length > 0) {
        await db.delete(stanceChanges).where(inArray(stanceChanges.userId, userIds));
      }
      const versionRows = await db
        .select({ id: conclusionVersions.id })
        .from(conclusionVersions)
        .where(inArray(conclusionVersions.topicId, topicIds));
      const versionIds = versionRows.map((row) => row.id);
      if (versionIds.length > 0) {
        await db.delete(conclusionItems).where(inArray(conclusionItems.versionId, versionIds));
        await db.delete(conclusionVersions).where(inArray(conclusionVersions.id, versionIds));
      }
      const claimIds = (
        await db
          .select({ id: claims.id })
          .from(claims)
          .where(inArray(claims.topicId, topicIds))
      ).map((row) => row.id);
      if (claimIds.length > 0) {
        await db.delete(evidence).where(inArray(evidence.claimId, claimIds));
      }
      await db.delete(challenges).where(inArray(challenges.topicId, topicIds));
      await db.delete(claimEvents).where(inArray(claimEvents.topicId, topicIds));
      await db.delete(topicTags).where(inArray(topicTags.topicId, topicIds));
      await db.delete(claims).where(inArray(claims.topicId, topicIds));
      await db.delete(topics).where(inArray(topics.id, topicIds));
    }
    await db.delete(tags).where(like(tags.name, `%${nonce}%`));
    if (userIds.length > 0) {
      await db.delete(users).where(inArray(users.id, userIds));
    }
    await sql.end();
  });

  async function createUsers() {
    const seq = userSeq++;
    const rows = await db
      .insert(users)
      .values([
        { authId: `plaza-owner-${nonce}-${seq}`, displayName: `广场集成楼主 ${seq}` },
        { authId: `plaza-rebutter-${nonce}-${seq}`, displayName: `广场集成反驳者 ${seq}` },
      ])
      .returning({ id: users.id });
    userIds.push(rows[0].id, rows[1].id);
    return { ownerId: rows[0].id, rebutterId: rows[1].id };
  }

  async function publishOpenTopic(ownerId: string, suffix: string) {
    const result = await publish.publishTopic({
      ownerId,
      type: 'decision',
      title: `广场测试 · ${suffix} ${nonce}`,
      body: '背景',
      stance: `广场测试根立场 · ${suffix}`,
      lean: 'neutral',
      tagNames: [`广场标签-${nonce}`],
      stakeEnabled: false,
      revealAt: null,
      bountyEnabled: false,
      allowPublicRebuttal: true,
    });
    topicIds.push(result.topic.id);
    return result;
  }

  it('正在对线：返回公开 open 话题、未决反驳数与参与人数', async () => {
    const { ownerId, rebutterId } = await createUsers();
    const first = await publishOpenTopic(ownerId, '一号');
    const second = await publishOpenTopic(ownerId, '二号');

    await tree.attachRebuttal({
      topicId: first.topic.id,
      targetClaimId: first.root.id,
      contentTitle: `广场集成反驳 ${nonce}`,
      authorId: rebutterId,
    });

    const data = await plaza.getPlazaSections(20);
    const listedFirst = data.openTopics.find((topic) => topic.id === first.topic.id);
    const listedSecond = data.openTopics.find((topic) => topic.id === second.topic.id);
    expect(listedFirst).toMatchObject({
      title: `广场测试 · 一号 ${nonce}`,
      rootStance: `广场测试根立场 · 一号`,
      nodeCount: 2,
      openChallengeCount: 1,
      participantCount: 2,
    });
    expect(listedFirst?.tags).toContain(`广场标签-${nonce}`);
    expect(listedSecond?.openChallengeCount).toBe(0);
    expect(listedSecond?.participantCount).toBe(1);
  });

  it('最新结论书：只返回已发布版本并带采纳条目数', async () => {
    const { ownerId } = await createUsers();
    const result = await publishOpenTopic(ownerId, '结论');

    const [version] = await db
      .insert(conclusionVersions)
      .values({
        topicId: result.topic.id,
        versionNo: 1,
        status: 'published',
        verdictText: `广场集成测试结论 ${nonce}`,
        settlement: 'provisional',
        createdByUserId: ownerId,
        publishedAt: new Date(),
      })
      .returning({ id: conclusionVersions.id });
    await db.insert(conclusionItems).values([
      {
        versionId: version.id,
        claimId: result.root.id,
        position: 1,
        role: 'adopted_reason',
      },
      {
        versionId: version.id,
        claimId: result.root.id,
        position: 2,
        role: 'adopted_reason',
      },
    ]);
    await db
      .update(topics)
      .set({ currentVersionId: version.id, status: 'converged' })
      .where(eq(topics.id, result.topic.id));

    const data = await plaza.getPlazaSections(20);
    const listed = data.conclusions.find((topic) => topic.topicId === result.topic.id);
    expect(listed).toMatchObject({
      title: `广场测试 · 结论 ${nonce}`,
      versionNo: 1,
      verdictText: `广场集成测试结论 ${nonce}`,
      adoptedCount: 2,
    });
  });

  it('即将揭晓：只返回开启立帖为证且有未来日期的公开话题', async () => {
    const { ownerId } = await createUsers();
    const soon = await publish.publishTopic({
      ownerId,
      type: 'claim',
      title: `即将揭晓 · 近 ${nonce}`,
      stance: `即将揭晓的近话题 ${nonce}`,
      lean: 'pro',
      stakeEnabled: true,
      revealAt: new Date(Date.now() + 15 * 86_400_000),
      bountyEnabled: false,
      allowPublicRebuttal: true,
    });
    topicIds.push(soon.topic.id);

    const past = await publish.publishTopic({
      ownerId,
      type: 'claim',
      title: `不应揭晓 · 过期 ${nonce}`,
      stance: `已过期的揭晓 ${nonce}`,
      lean: 'pro',
      stakeEnabled: true,
      revealAt: new Date(Date.now() - 3 * 86_400_000),
      bountyEnabled: false,
      allowPublicRebuttal: true,
    });
    topicIds.push(past.topic.id);

    const data = await plaza.getPlazaSections(20);
    const listed = data.upcomingReveals.find((topic) => topic.id === soon.topic.id);
    expect(listed?.title).toBe(`即将揭晓 · 近 ${nonce}`);
    expect(listed?.predictionCount).toBe(0);
    expect(data.upcomingReveals.some((topic) => topic.id === past.topic.id)).toBe(false);
  });

  it('战绩速览：统计我发布的话题、被采纳论据与公开改换阵营', async () => {
    const { ownerId, rebutterId } = await createUsers();
    const mine = await publishOpenTopic(ownerId, '速览');
    const [version] = await db
      .insert(conclusionVersions)
      .values({
        topicId: mine.topic.id,
        versionNo: 1,
        status: 'published',
        verdictText: '速览结论',
        publishedAt: new Date(),
      })
      .returning({ id: conclusionVersions.id });
    await db.insert(conclusionItems).values({
      versionId: version.id,
      claimId: mine.root.id,
      position: 1,
    });
    await db.insert(stanceChanges).values({
      topicId: mine.topic.id,
      userId: ownerId,
      fromStance: 'pro',
      toStance: 'neutral',
      statement: '被说服了',
    });

    const summary = await plaza.getUserPlazaSummary(ownerId);
    expect(summary.topicCount).toBeGreaterThanOrEqual(1);
    expect(summary.adoptedCount).toBe(1);
    expect(summary.honestyCount).toBe(1);
    void rebutterId;
  });
});
