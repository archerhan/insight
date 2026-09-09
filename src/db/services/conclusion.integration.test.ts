/**
 * M4 结论书服务集成测试：只在 TEST_DATABASE_URL 的测试库运行。
 * 覆盖验收链路“采纳 → 出结论书 v1 → 导出”，含支撑链快照、
 * 带险关闭逐条勾选、权限/资格校验与广场可见性。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { and, asc, eq, inArray, like, sql } from 'drizzle-orm';
import { db } from '../client';
import {
  aiFlags,
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
  stanceChanges,
  topics,
  users,
  userStats,
} from '../schema';

const connectionString = process.env.TEST_DATABASE_URL;
const describeDb = describe.runIf(connectionString);

describeDb('结论书服务（集成）', () => {
  let pg: ReturnType<typeof postgres>;
  let tree: typeof import('./tree');
  let conclusion: typeof import('./conclusion');
  let plaza: typeof import('./plaza');
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let userSeq = 0;
  const topicIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(async () => {
    pg = postgres(connectionString!, { max: 1, prepare: false });
    process.env.DATABASE_URL = connectionString!;
    tree = await import('./tree');
    conclusion = await import('./conclusion');
    plaza = await import('./plaza');
  });

  afterAll(async () => {
    for (const topicId of topicIds) {
      await db.delete(decisionFollowups).where(eq(decisionFollowups.topicId, topicId));
      await db.delete(predictions).where(eq(predictions.topicId, topicId));
      await db.delete(realityChecks).where(eq(realityChecks.topicId, topicId));
      const claimRows = await db
        .select({ id: claims.id })
        .from(claims)
        .where(eq(claims.topicId, topicId));
      const claimIds = claimRows.map((row) => row.id);
      if (claimIds.length > 0) {
        await db.delete(evidence).where(inArray(evidence.claimId, claimIds));
        await db.delete(aiFlags).where(inArray(aiFlags.claimId, claimIds));
      }
      await db.delete(aiFlags).where(sql`detail ->> 'topicId' = ${topicId}`);
      await db.delete(reputationEvents).where(eq(reputationEvents.topicId, topicId));
      await db.delete(stanceChanges).where(eq(stanceChanges.topicId, topicId));
      const versionRows = await db
        .select({ id: conclusionVersions.id })
        .from(conclusionVersions)
        .where(eq(conclusionVersions.topicId, topicId));
      const versionIds = versionRows.map((row) => row.id);
      if (versionIds.length > 0) {
        await db.delete(conclusionItems).where(inArray(conclusionItems.versionId, versionIds));
        await db.delete(conclusionVersions).where(inArray(conclusionVersions.id, versionIds));
      }
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
          authId: `conclusion-user-${nonce}-${seq}-${index}`,
          displayName: `结论集成用户 ${seq}-${index}`,
          courseCompletedAt: new Date(),
        })),
      )
      .returning({ id: users.id });
    userIds.push(...rows.map((row) => row.id));
    return rows.map((row) => row.id);
  }

  async function openDecisionTopic(ownerId: string, suffix: string) {
    const created = await tree.createTopicWithRoot({
      ownerId,
      type: 'decision',
      title: `结论集成 ${suffix} ${nonce}`,
      rootContentTitle: `根立场-${suffix}-${nonce}`,
      rootContentBody: '背景约束',
    });
    topicIds.push(created.topic.id);
    return created;
  }

  async function addEvidence(claimId: string, createdById: string, summary: string) {
    const [row] = await db
      .insert(evidence)
      .values({ claimId, createdById, summary, kind: 'other', status: 'pending' })
      .returning({ id: evidence.id });
    return row.id;
  }

  async function eventsOf(topicId: string) {
    return db
      .select({ type: claimEvents.type, claimId: claimEvents.claimId })
      .from(claimEvents)
      .where(eq(claimEvents.topicId, topicId))
      .orderBy(asc(claimEvents.id));
  }

  it('验收链路：采纳理由层 + 支撑链快照 → published v1 → 话题收敛 → Markdown 可导出', async () => {
    const [ownerId, supporterId] = await createUsers(2);
    const { topic, root } = await openDecisionTopic(ownerId, '走查');
    const support = await tree.createClaimUnder({
      topicId: topic.id,
      parentId: root.id,
      relation: 'pro',
      contentTitle: '先用年假试住验证，成本可控',
      authorId: supporterId,
    });
    const evidenceId = await addEvidence(support.id, supporterId, '本地已有 6 个月试运营数据');

    const result = await conclusion.publishConclusion({
      topicId: topic.id,
      actorId: ownerId,
      verdictText: '不建议直接裸辞：先用年假完成实地验证，再决定是否投入',
      recommendationText: '先试住 3–4 周并完成牌照调研',
      premises: '存款可支撑 6 个月空窗',
      adoptedClaimIds: [root.id],
    });
    expect(result.version).toMatchObject({ versionNo: 1, status: 'published', settlement: 'provisional' });

    const topicRow = (
      await db.select().from(topics).where(eq(topics.id, topic.id)).limit(1)
    )[0];
    expect(topicRow).toMatchObject({
      status: 'converged',
      currentVersionId: result.version.id,
      adoptedCount: 1,
    });
    expect(topicRow.closedAt).toBeTruthy();

    const rootRow = (
      await db.select({ status: claims.status }).from(claims).where(eq(claims.id, root.id)).limit(1)
    )[0];
    expect(rootRow?.status).toBe('merged');

    const items = await db
      .select()
      .from(conclusionItems)
      .where(eq(conclusionItems.versionId, result.version.id));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ role: 'adopted_reason', claimId: root.id, position: 1 });
    expect(items[0].supportChain).toEqual([
      expect.objectContaining({
        claimId: support.id,
        contentTitle: '先用年假试住验证，成本可控',
        authorId: supporterId,
        evidenceIds: [evidenceId],
      }),
    ]);

    const events = await eventsOf(topic.id);
    const adoptedEvent = events.find((event) => event.type === 'adopted');
    expect(adoptedEvent).toBeTruthy();

    const view = await conclusion.getConclusionView(topic.id);
    expect(view?.version.verdictText).toContain('不建议直接裸辞');
    expect(view?.items[0].supportChain[0]).toMatchObject({ authorName: expect.any(String), evidenceCount: 1 });

    const markdown = await conclusion.buildConclusionMarkdownForTopic(topic.id);
    expect(markdown).toContain('# ');
    expect(markdown).toContain('先用年假试住验证，成本可控');
    expect(markdown).toContain('论据 1');

    const plazaConclusions = (await plaza.getPlazaSections()).conclusions;
    expect(plazaConclusions.some((item) => item.topicId === topic.id)).toBe(true);
  });

  it('只有楼主能发布；公共议题（community close）被拒绝', async () => {
    const [ownerId, otherId] = await createUsers(2);
    const { topic, root } = await openDecisionTopic(ownerId, '权限');

    await expect(
      conclusion.publishConclusion({
        topicId: topic.id,
        actorId: otherId,
        verdictText: '越权发布的结论结论结论',
        adoptedClaimIds: [root.id],
      }),
    ).rejects.toThrow('只有楼主可以发布结论书');

    await db
      .update(topics)
      .set({ closeMode: 'community', type: 'claim' })
      .where(eq(topics.id, topic.id));
    await expect(
      conclusion.publishConclusion({
        topicId: topic.id,
        actorId: ownerId,
        verdictText: '公共议题擅自关闭的结论结论',
        adoptedClaimIds: [root.id],
      }),
    ).rejects.toThrow('楼主没有单独关闭权');
  });

  it('拒绝采纳非理由层节点（深层论点需先提升）', async () => {
    const [ownerId, supporterId] = await createUsers(2);
    const { topic, root } = await openDecisionTopic(ownerId, '深层');
    const deep = await tree.createClaimUnder({
      topicId: topic.id,
      parentId: root.id,
      relation: 'pro',
      contentTitle: '深层支撑：先租后买分批投入',
      authorId: supporterId,
    });

    await expect(
      conclusion.publishConclusion({
        topicId: topic.id,
        actorId: ownerId,
        verdictText: '试图采纳深层节点的结论结论',
        adoptedClaimIds: [deep.id],
      }),
    ).rejects.toThrow('只有理由层论点');
  });

  it('带险关闭：漏勾任何一条未决反驳都拒绝；逐条勾选后 risk_closed 并冻结风险快照', async () => {
    const [ownerId, rebutterId] = await createUsers(2);
    const { topic, root } = await openDecisionTopic(ownerId, '带险');
    await tree.attachRebuttal({
      topicId: topic.id,
      targetClaimId: root.id,
      contentTitle: '淡季现金流撑不住 6 个月，试住验证不充分',
      authorId: rebutterId,
    });
    const [challengeRow] = await db
      .select({ id: challenges.id })
      .from(challenges)
      .where(
        and(eq(challenges.topicId, topic.id), eq(challenges.status, 'open')),
      )
      .limit(1);
    expect(challengeRow).toBeTruthy();

    await expect(
      conclusion.publishConclusion({
        topicId: topic.id,
        actorId: ownerId,
        verdictText: '带险发布的结论：试住方案仍值得采纳',
        adoptedClaimIds: [root.id],
        acknowledgedChallengeIds: [],
      }),
    ).rejects.toThrow('还有 1 条未决反驳未确认');

    const result = await conclusion.publishConclusion({
      topicId: topic.id,
      actorId: ownerId,
      verdictText: '带险发布的结论：试住方案仍值得采纳',
      adoptedClaimIds: [root.id],
      acknowledgedChallengeIds: [challengeRow!.id],
    });
    const topicRow = (
      await db.select().from(topics).where(eq(topics.id, topic.id)).limit(1)
    )[0];
    expect(topicRow.status).toBe('risk_closed');
    expect(result.version.settlement).toBe('risk_closed');
    const snapshot = result.version.summarySnapshot as { riskChallenges: unknown[] };
    expect(snapshot.riskChallenges).toHaveLength(1);

    // 带险采纳的节点不置 merged，仍保留未决反驳待楼主回应/现实审计
    const rootRow = (
      await db.select({ status: claims.status }).from(claims).where(eq(claims.id, root.id)).limit(1)
    )[0];
    expect(rootRow?.status).toBe('challenged');
    const view = await conclusion.getConclusionView(topic.id);
    expect(view?.risks).toHaveLength(1);

    const markdown = await conclusion.buildConclusionMarkdownForTopic(topic.id);
    expect(markdown).toContain('未决风险');
    expect(markdown).toContain('淡季现金流撑不住 6 个月');
  });

  it('采纳向导数据源：只列活性理由层候选与 open challenges', async () => {
    const [ownerId, rebutterId] = await createUsers(2);
    const { topic, root } = await openDecisionTopic(ownerId, '向导');
    await tree.attachRebuttal({
      topicId: topic.id,
      targetClaimId: root.id,
      contentTitle: '民宿牌照拿证周期常超 6 个月',
      authorId: rebutterId,
    });
    await tree.createClaimUnder({
      topicId: topic.id,
      parentId: root.id,
      relation: 'pro',
      contentTitle: '在职期可并行办证',
      authorId: ownerId,
    });

    const ctx = await conclusion.getAdoptionDraftContext(topic.id);
    expect(ctx?.roots).toHaveLength(1);
    expect(ctx?.roots[0]).toMatchObject({ id: root.id, openChallengeCount: 1 });
    expect(ctx?.openChallenges).toHaveLength(1);
  });
});
