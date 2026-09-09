/**
 * M3 对线视图读服务集成测试：只在 TEST_DATABASE_URL 上运行。
 * 覆盖：焦点下钻/面包屑、支持反驳分栏、未决红条、子论点挂红计数、
 * 读取时惰性推进计时、未决反驳清单（结论书降权展示的数据源）。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { and, eq, inArray, like } from 'drizzle-orm';
import { db } from '../client';
import {
  aiFlags,
  challenges,
  claimEvents,
  claims,
  conclusionItems,
  conclusionVersions,
  evidence,
  topics,
  users,
} from '../schema';

const connectionString = process.env.TEST_DATABASE_URL;
const describeDb = describe.runIf(connectionString);

describeDb('对线视图读服务（集成）', () => {
  let sql: ReturnType<typeof postgres>;
  let tree: typeof import('./tree');
  let rebuttal: typeof import('./rebuttal');
  let arena: typeof import('./arena');
  let conclusion: typeof import('./conclusion');
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let userSeq = 0;
  const topicIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(async () => {
    sql = postgres(connectionString!, { max: 1, prepare: false });
    process.env.DATABASE_URL = connectionString!;
    tree = await import('./tree');
    rebuttal = await import('./rebuttal');
    arena = await import('./arena');
    conclusion = await import('./conclusion');
  });

  afterAll(async () => {
    for (const topicId of topicIds) {
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
        await db.delete(aiFlags).where(inArray(aiFlags.claimId, claimIds));
      }
      await db.delete(claimEvents).where(eq(claimEvents.topicId, topicId));
      await db.delete(challenges).where(eq(challenges.topicId, topicId));
      await db.delete(claims).where(eq(claims.topicId, topicId));
      await db.delete(topics).where(eq(topics.id, topicId));
    }
    await db.delete(users).where(like(users.authId, `%${nonce}%`));
    await sql.end();
  });

  async function createUsers() {
    const seq = userSeq++;
    const rows = await db
      .insert(users)
      .values([
        { authId: `arena-owner-${nonce}-${seq}`, displayName: '对线读集成楼主' },
        { authId: `arena-rebutter-${nonce}-${seq}`, displayName: '对线读集成反驳者' },
      ])
      .returning({ id: users.id });
    userIds.push(rows[0].id, rows[1].id);
    return { ownerId: rows[0].id, rebutterId: rows[1].id };
  }

  async function openTopic(ownerId: string, suffix: string) {
    const created = await tree.createTopicWithRoot({
      ownerId,
      type: 'decision',
      title: `对线读 ${suffix} ${nonce}`,
      rootContentTitle: '裸辞去大理开民宿，是实现自由生活的现实路径',
    });
    topicIds.push(created.topic.id);
    return created;
  }

  it('默认焦点为当前根立场；支持/反驳分栏与子论点计数正确', async () => {
    const { ownerId, rebutterId } = await createUsers();
    const { topic, root } = await openTopic(ownerId, '分栏');
    const pro = await tree.createClaimUnder({
      topicId: topic.id,
      parentId: root.id,
      relation: 'pro',
      contentTitle: '先入股旧院试运营半年，试错成本可控',
      authorId: ownerId,
    });
    await tree.createClaimUnder({
      topicId: topic.id,
      parentId: pro.id,
      relation: 'pro',
      contentTitle: '朋友愿意转让 20 万入股额度',
      authorId: ownerId,
    });
    await rebuttal.postRebutal({
      topicId: topic.id,
      targetClaimId: root.id,
      authorId: rebutterId,
      paraphrase: '对方主张裸辞去大理开民宿是实现自由生活的现实路径',
      title: '牌照拿证周期长，现金流撑不住',
    });
    await db.insert(evidence).values({
      claimId: pro.id,
      kind: 'experience',
      summary: '同院股东先试水 5 个月后全职',
      createdById: ownerId,
    });

    const view = await arena.getArenaView(topic.id);
    expect(view?.focus?.id).toBe(root.id);
    expect(view?.supports.map((claim) => claim.id)).toEqual([pro.id]);
    expect(view?.rebuttals).toHaveLength(1);
    expect(view?.supports[0]?.evidenceCount).toBe(1);
    expect(view?.childChallengeCounts[pro.id]).toBe(0);

    // 焦点下钻：pro 为焦点时面包屑回到根，支持列出现其子论点
    const drilled = await arena.getArenaView(topic.id, pro.id);
    expect(drilled?.focus?.id).toBe(pro.id);
    expect(drilled?.breadcrumbs.map((claim) => claim.id)).toEqual([root.id]);
    expect(drilled?.supports.map((claim) => claim.contentTitle)).toEqual([
      '朋友愿意转让 20 万入股额度',
    ]);
  });

  it('未决红条：焦点上的 open 反驳带阶段与天数；回应后从红条消失', async () => {
    const { ownerId, rebutterId } = await createUsers();
    const { topic, root } = await openTopic(ownerId, '红条');
    const posted = await rebuttal.postRebutal({
      topicId: topic.id,
      targetClaimId: root.id,
      authorId: rebutterId,
      paraphrase: '对方主张裸辞去大理开民宿是实现自由生活的现实路径',
      title: '民宿经营是生意不是生活',
    });
    if (!posted.ok || !posted.challenge) throw new Error('setup failed');

    const now = new Date('2026-09-09T12:00:00Z');
    const openedAt = new Date(now.getTime() - 4 * 86_400_000);
    await db
      .update(challenges)
      .set({
        openedAt,
        orangeAt: new Date(openedAt.getTime() + 3 * 86_400_000),
        redAt: new Date(openedAt.getTime() + 7 * 86_400_000),
        defaultLossAt: new Date(openedAt.getTime() + 14 * 86_400_000),
      })
      .where(eq(challenges.id, posted.challenge.id));

    const view = await arena.getArenaView(topic.id, undefined, now);
    expect(view?.focusChallenges).toHaveLength(1);
    expect(view?.focusChallenges[0]).toMatchObject({
      phase: 'orange',
      openedDays: 4,
      challengerTitle: '民宿经营是生意不是生活',
    });

    await rebuttal.respondToChallenge({
      challengeId: posted.challenge.id,
      authorId: ownerId,
      title: '开民宿是经营选择也是生活方式选择，两者不冲突',
    });
    const after = await arena.getArenaView(topic.id, undefined, now);
    expect(after?.focusChallenges).toHaveLength(0);
    expect(after?.focus?.status).toBe('responded');
  });

  it('读取时惰性推进：过期反驳在读取路径自动补写计时事件且幂等', async () => {
    const { ownerId, rebutterId } = await createUsers();
    const { topic, root } = await openTopic(ownerId, '惰性计时');
    const posted = await rebuttal.postRebutal({
      topicId: topic.id,
      targetClaimId: root.id,
      authorId: rebutterId,
      paraphrase: '对方主张裸辞去大理开民宿是实现自由生活的现实路径',
      title: '七天以上未回应即挂红',
    });
    if (!posted.ok || !posted.challenge) throw new Error('setup failed');

    const openedAt = new Date(Date.now() - 16 * 86_400_000);
    await db
      .update(challenges)
      .set({ openedAt })
      .where(eq(challenges.id, posted.challenge.id));

    const now = new Date();
    const view = await arena.getArenaView(topic.id, undefined, now);
    expect(view?.focusChallenges[0]?.phase).toBe('due');

    const timerEvents = (
      await db
        .select({ detail: claimEvents.detail })
        .from(claimEvents)
        .where(
          and(
            eq(claimEvents.topicId, topic.id),
            eq(claimEvents.type, 'challenge_timer'),
          ),
        )
    ).filter((event) => event.detail && event.detail.challengeId === posted.challenge!.id);
    expect(timerEvents.map((event) => event.detail?.phase).sort()).toEqual([
      'due',
      'orange',
      'red',
    ]);

    // 幂等：再次读取不再补写
    await arena.getArenaView(topic.id, undefined, now);
    const after = (
      await db
        .select({ detail: claimEvents.detail })
        .from(claimEvents)
        .where(
          and(
            eq(claimEvents.topicId, topic.id),
            eq(claimEvents.type, 'challenge_timer'),
          ),
        )
    ).filter((event) => event.detail && event.detail.challengeId === posted.challenge!.id);
    expect(after).toHaveLength(3);
  });

  it('未决反驳清单：只返回 open，带目标论点与作者展示信息', async () => {
    const { ownerId, rebutterId } = await createUsers();
    const { topic, root } = await openTopic(ownerId, '未决清单');
    const posted = await rebuttal.postRebutal({
      topicId: topic.id,
      targetClaimId: root.id,
      authorId: rebutterId,
      paraphrase: '对方主张裸辞去大理开民宿是实现自由生活的现实路径',
      title: '新手民宿亏损率约九成',
    });
    if (!posted.ok || !posted.challenge) throw new Error('setup failed');

    const list = await arena.getUnresolvedChallenges(topic.id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      challengerTitle: '新手民宿亏损率约九成',
      targetTitle: root.contentTitle,
      targetAuthorName: '对线读集成楼主',
    });
    expect(list[0].phase).toBeTruthy();

    await tree.concedeToChallenge({ challengeId: posted.challenge.id, actorId: ownerId });
    expect(await arena.getUnresolvedChallenges(topic.id)).toEqual([]);
  });

  it('revise 后新版焦点列出旧版悬空子论点（供抢救迁移入口）', async () => {
    const { ownerId, rebutterId } = await createUsers();
    const { topic, root } = await openTopic(ownerId, '抢救读');
    const pro = await tree.createClaimUnder({
      topicId: topic.id,
      parentId: root.id,
      relation: 'pro',
      contentTitle: '先入股旧院试运营半年可验证可行性',
      authorId: ownerId,
    });
    const posted = await rebuttal.postRebutal({
      topicId: topic.id,
      targetClaimId: root.id,
      authorId: rebutterId,
      paraphrase: '对方主张裸辞去大理开民宿是实现自由生活的现实路径',
      title: '裸辞后没有安全垫',
    });
    if (!posted.ok || !posted.challenge) throw new Error('setup failed');
    await tree.concedeToChallenge({ challengeId: posted.challenge.id, actorId: ownerId });
    const revision = await tree.reviseClaim({
      claimId: root.id,
      authorId: ownerId,
      contentTitle: '先驻留大理三个月完成调研再决定是否裸辞',
    });

    const view = await arena.getArenaView(topic.id, revision.id);
    expect(view?.focus?.supersedesClaimId).toBe(root.id);
    expect(view?.rescuableClaims.map((claim) => claim.id)).toEqual([pro.id]);
    expect(view?.rebuttals.some((claim) => claim.id === pro.id)).toBe(false);
  });

  it('收敛并采纳后，merged 根立场仍可在对线视图下钻浏览', async () => {
    const { ownerId, rebutterId } = await createUsers();
    const { topic, root } = await openTopic(ownerId, '收敛浏览');
    const killer = await tree.attachRebuttal({
      topicId: topic.id,
      targetClaimId: root.id,
      contentTitle: '先用年假试住验证，再决定是否裸辞',
      authorId: rebutterId,
    });
    await tree.concedeToChallenge({ challengeId: killer.id, actorId: ownerId });

    const killerClaim = (
      await db
        .select({ id: claims.id })
        .from(claims)
        .where(eq(claims.id, killer.challengerClaimId))
        .limit(1)
    )[0];
    await conclusion.publishConclusion({
      topicId: topic.id,
      actorId: ownerId,
      verdictText: '先用年假完成实地验证再决定是否投入',
      adoptedClaimIds: [killerClaim!.id],
    });

    const view = await arena.getArenaView(topic.id);
    expect(view?.topicStatus).toBe('converged');
    expect(view?.rootId).toBe(killerClaim!.id);
    expect(view?.focus).toMatchObject({ id: killerClaim!.id, status: 'merged' });
  });
});
