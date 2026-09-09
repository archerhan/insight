/**
 * M3 对线写服务集成测试：只在 TEST_DATABASE_URL 上运行。
 * 覆盖验收链路“反驳 → 未回应挂红 → 回应或承认”，每步 claim_events，
 * 以及程序检查（复述/重复/侮辱）拦截、ai_flags 留痕、权限防护。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { asc, eq, inArray, like, sql } from 'drizzle-orm';
import { db } from '../client';
import {
  aiFlags,
  challenges,
  claimEvents,
  claims,
  evidence,
  topics,
  users,
} from '../schema';

const connectionString = process.env.TEST_DATABASE_URL;
const describeDb = describe.runIf(connectionString);

describeDb('对线写服务（集成）', () => {
  let pg: ReturnType<typeof postgres>;
  let tree: typeof import('./tree');
  let rebuttal: typeof import('./rebuttal');
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let userSeq = 0;
  const topicIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(async () => {
    pg = postgres(connectionString!, { max: 1, prepare: false });
    process.env.DATABASE_URL = connectionString!;
    tree = await import('./tree');
    rebuttal = await import('./rebuttal');
  });

  afterAll(async () => {
    for (const topicId of topicIds) {
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
      await db.delete(claimEvents).where(eq(claimEvents.topicId, topicId));
      await db.delete(challenges).where(eq(challenges.topicId, topicId));
      await db.delete(claims).where(eq(claims.topicId, topicId));
      await db.delete(topics).where(eq(topics.id, topicId));
    }
    await db.delete(users).where(like(users.authId, `%${nonce}%`));
    await pg.end();
  });

  async function createUsers() {
    const seq = userSeq++;
    const rows = await db
      .insert(users)
      .values([
        { authId: `rebuttal-owner-${nonce}-${seq}`, displayName: '对线集成楼主' },
        { authId: `rebuttal-rebutter-${nonce}-${seq}`, displayName: '对线集成反驳者' },
        { authId: `rebuttal-bystander-${nonce}-${seq}`, displayName: '对线集成路人' },
      ])
      .returning({ id: users.id });
    userIds.push(rows[0].id, rows[1].id, rows[2].id);
    return { ownerId: rows[0].id, rebutterId: rows[1].id, bystanderId: rows[2].id };
  }

  async function openTopic(ownerId: string, suffix: string) {
    const created = await tree.createTopicWithRoot({
      ownerId,
      type: 'decision',
      title: `对线集成 ${suffix} ${nonce}`,
      rootContentTitle: '裸辞去大理开民宿，是实现自由生活的现实路径',
    });
    topicIds.push(created.topic.id);
    return created;
  }

  async function claimRow(claimId: string) {
    return (
      await db
        .select({
          id: claims.id,
          parentId: claims.parentId,
          relation: claims.relation,
          status: claims.status,
          ancestors: claims.ancestors,
        })
        .from(claims)
        .where(eq(claims.id, claimId))
        .limit(1)
    )[0];
  }

  async function eventsOf(topicId: string) {
    return db
      .select({ type: claimEvents.type, claimId: claimEvents.claimId })
      .from(claimEvents)
      .where(eq(claimEvents.topicId, topicId))
      .orderBy(asc(claimEvents.id));
  }

  it('验收链路：复述通过 → 建反驳挂红 → 作者回应 → 承认击穿，事件可回放', async () => {
    const { ownerId, rebutterId } = await createUsers();
    const { topic, root } = await openTopic(ownerId, '走查');
    const pro = await tree.createClaimUnder({
      topicId: topic.id,
      parentId: root.id,
      relation: 'pro',
      contentTitle: '先入股旧院试运营半年，试错成本可控',
      authorId: ownerId,
    });

    const posted = await rebuttal.postRebutal({
      topicId: topic.id,
      targetClaimId: root.id,
      authorId: rebutterId,
      paraphrase: '对方主张裸辞去大理开民宿是实现自由生活的现实路径',
      title: '民宿牌照与消防拿证周期常超 6 个月，裸辞后现金流撑不住',
    });
    expect(posted.ok).toBe(true);
    if (!posted.ok) return;
    expect(posted.claim.parentId).toBe(root.id);
    expect(posted.challenge?.status).toBe('open');
    expect((await claimRow(root.id))?.status).toBe('challenged');

    const responded = await rebuttal.respondToChallenge({
      challengeId: posted.challenge!.id,
      authorId: ownerId,
      title: '可以先以兼职身份启动拿证流程，六个月内不裸辞',
    });
    expect(responded.ok).toBe(true);
    if (!responded.ok) return;
    expect((await claimRow(root.id))?.status).toBe('responded');
    const [challengeAfter] = await db
      .select({ status: challenges.status, respondedClaimId: challenges.respondedClaimId })
      .from(challenges)
      .where(eq(challenges.id, posted.challenge!.id));
    expect(challengeAfter).toMatchObject({
      status: 'responded',
      respondedClaimId: responded.claim.id,
    });

    await tree.concedeToChallenge({ challengeId: posted.challenge!.id, actorId: ownerId });
    const killerRow = await claimRow(posted.claim.id);
    expect(killerRow).toMatchObject({ parentId: null, relation: 'root', status: 'active' });
    expect((await claimRow(root.id))?.status).toBe('refuted');
    expect((await claimRow(pro.id))?.status).toBe('orphaned');

    const eventTypes = (await eventsOf(topic.id)).map((event) => event.type);
    for (const expected of [
      'created',
      'created',
      'created',
      'challenged',
      'created',
      'responded',
      'refuted',
      'orphaned',
      'promoted',
    ]) {
      expect(eventTypes).toContain(expected);
    }
  });

  it('程序检查拦截：复述不合格不建节点，ai_flags 以 flagged 留痕', async () => {
    const { ownerId, rebutterId } = await createUsers();
    const { topic, root } = await openTopic(ownerId, '拦截');

    const blocked = await rebuttal.postRebutal({
      topicId: topic.id,
      targetClaimId: root.id,
      authorId: rebutterId,
      paraphrase: '这篇内容跟民宿没有关系',
      title: '随便挑个毛病',
    });
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.error).toMatch(/复述/);
    expect(
      blocked.entries.some((entry) => entry.kind === 'paraphrase' && entry.status === 'flagged'),
    ).toBe(true);

    const allClaims = await db
      .select({ id: claims.id })
      .from(claims)
      .where(eq(claims.topicId, topic.id));
    expect(allClaims).toHaveLength(1); // 只有根立场，反驳没有落库
    const [flag] = await db
      .select({ kind: aiFlags.kind, status: aiFlags.status, claimId: aiFlags.claimId })
      .from(aiFlags)
      .where(sql`detail ->> 'topicId' = ${topic.id}`)
      .orderBy(asc(aiFlags.createdAt))
      .limit(1);
    expect(flag).toMatchObject({ kind: 'paraphrase', status: 'flagged', claimId: null });
  });

  it('侮辱内容被拦截并提示改写', async () => {
    const { ownerId, rebutterId } = await createUsers();
    const { topic, root } = await openTopic(ownerId, '侮辱');

    const blocked = await rebuttal.postRebutal({
      topicId: topic.id,
      targetClaimId: root.id,
      authorId: rebutterId,
      paraphrase: '对方主张裸辞去大理开民宿是实现自由生活的现实路径',
      title: '你这个傻逼想法根本不成立',
    });
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.error).toMatch(/人身攻击|友好/);
    const [flag] = await db
      .select({ kind: aiFlags.kind, status: aiFlags.status })
      .from(aiFlags)
      .where(sql`detail ->> 'topicId' = ${topic.id}`)
      .orderBy(asc(aiFlags.createdAt))
      .limit(1);
    expect(flag?.kind).toBe('paraphrase'); // 三条检查都会留痕，第一条按创建顺序是复述

    const flagged = await db
      .select({ kind: aiFlags.kind, status: aiFlags.status })
      .from(aiFlags)
      .where(
        sql`detail ->> 'topicId' = ${topic.id} AND status = 'flagged'`,
      );
    expect(flagged.some((row) => row.kind === 'insult')).toBe(true);
  });

  it('同层重复的反驳被拦截', async () => {
    const { ownerId, rebutterId } = await createUsers();
    const { topic, root } = await openTopic(ownerId, '查重');
    await rebuttal.postRebutal({
      topicId: topic.id,
      targetClaimId: root.id,
      authorId: rebutterId,
      paraphrase: '对方主张裸辞去大理开民宿是实现自由生活的现实路径',
      title: '民宿牌照拿证周期长，现金流撑不住',
    });

    const duplicate = await rebuttal.postRebutal({
      topicId: topic.id,
      targetClaimId: root.id,
      authorId: rebutterId,
      paraphrase: '对方主张裸辞去大理开民宿是实现自由生活的现实路径',
      title: '民宿牌照拿证周期长，现金流撑不住', // 与上一条完全相同
    });
    expect(duplicate.ok).toBe(false);
    if (duplicate.ok) return;
    expect(duplicate.error).toMatch(/重复/);
  });

  it('postSupport：通过查重后建支持节点并留 approved 审计', async () => {
    const { ownerId, bystanderId } = await createUsers();
    const { topic, root } = await openTopic(ownerId, '支持');

    const supported = await rebuttal.postSupport({
      topicId: topic.id,
      parentId: root.id,
      authorId: bystanderId,
      title: '大理朋友愿意合租旧院，试错成本可控',
    });
    expect(supported.ok).toBe(true);
    if (!supported.ok) return;
    expect(await claimRow(supported.claim.id)).toMatchObject({
      parentId: root.id,
      relation: 'pro',
      status: 'active',
      ancestors: [root.id],
    });
    const flags = await db
      .select({ status: aiFlags.status, claimId: aiFlags.claimId })
      .from(aiFlags)
      .where(eq(aiFlags.claimId, supported.claim.id));
    expect(flags.length).toBeGreaterThan(0);
    expect(flags.every((flag) => flag.status === 'approved')).toBe(true);
  });

  it('不能反驳自己发布的论点', async () => {
    const { ownerId } = await createUsers();
    const { topic, root } = await openTopic(ownerId, '自反驳');
    await expect(
      rebuttal.postRebutal({
        topicId: topic.id,
        targetClaimId: root.id,
        authorId: ownerId,
        paraphrase: '对方主张裸辞去大理开民宿是实现自由生活的现实路径',
        title: '自己反驳自己',
      }),
    ).rejects.toThrow(/不能反驳自己/);
  });

  it('回应权限：只有被反驳论点的作者能回应；非未决反驳不可回应', async () => {
    const { ownerId, rebutterId, bystanderId } = await createUsers();
    const { topic, root } = await openTopic(ownerId, '回应权限');
    const posted = await rebuttal.postRebutal({
      topicId: topic.id,
      targetClaimId: root.id,
      authorId: rebutterId,
      paraphrase: '对方主张裸辞去大理开民宿是实现自由生活的现实路径',
      title: '民宿现金流不可控',
    });
    if (!posted.ok || !posted.challenge) throw new Error('setup failed');

    await expect(
      rebuttal.respondToChallenge({
        challengeId: posted.challenge.id,
        authorId: bystanderId,
        title: '路人替楼主回应',
      }),
    ).rejects.toThrow(/target claim author/);

    const first = await rebuttal.respondToChallenge({
      challengeId: posted.challenge.id,
      authorId: ownerId,
      title: '六个月内不裸辞，先办证再决策',
    });
    expect(first.ok).toBe(true);
    await expect(
      rebuttal.respondToChallenge({
        challengeId: posted.challenge.id,
        authorId: ownerId,
        title: '重复回应已回应过的反驳',
      }),
    ).rejects.toThrow(/不是未决状态/);
  });

  it('承认一条击穿后，指向同一目标的其他 open 反驳自动 moot', async () => {
    const { ownerId, rebutterId, bystanderId } = await createUsers();
    const { topic, root } = await openTopic(ownerId, '多反驳');
    const first = await rebuttal.postRebutal({
      topicId: topic.id,
      targetClaimId: root.id,
      authorId: rebutterId,
      paraphrase: '对方主张裸辞去大理开民宿是实现自由生活的现实路径',
      title: '牌照周期拖垮现金流',
    });
    const second = await rebuttal.postRebutal({
      topicId: topic.id,
      targetClaimId: root.id,
      authorId: bystanderId,
      paraphrase: '对方主张裸辞去大理开民宿是实现自由生活的现实路径',
      title: '旺季淡季收入差三倍，备用金不够',
    });
    if (!first.ok || !first.challenge || !second.ok || !second.challenge) {
      throw new Error('setup failed');
    }
    const firstChallengeId = first.challenge.id;
    const secondChallengeId = second.challenge.id;

    await tree.concedeToChallenge({ challengeId: firstChallengeId, actorId: ownerId });
    const challengeRows = await db
      .select({
        id: challenges.id,
        status: challenges.status,
        resolutionReason: challenges.resolutionReason,
      })
      .from(challenges)
      .where(
        inArray(challenges.id, [firstChallengeId, secondChallengeId]),
      );
    const firstRow = challengeRows.find((row) => row.id === firstChallengeId);
    const secondRow = challengeRows.find((row) => row.id === secondChallengeId);
    expect(firstRow).toBeDefined();
    expect(secondRow).toBeDefined();
    if (!firstRow || !secondRow) return;
    expect(firstRow.status).toBe('conceded');
    expect(secondRow).toMatchObject({ status: 'moot', resolutionReason: 'target_refuted' });
  });

  it('修订后可从新版焦点抢救迁移旧版悬空子论点（仅作者本人）', async () => {
    const { ownerId, rebutterId, bystanderId } = await createUsers();
    const { topic, root } = await openTopic(ownerId, '抢救');
    const pro = await tree.createClaimUnder({
      topicId: topic.id,
      parentId: root.id,
      relation: 'pro',
      contentTitle: '先入股旧院试运营半年，试错成本可控',
      authorId: ownerId,
    });
    const posted = await rebuttal.postRebutal({
      topicId: topic.id,
      targetClaimId: root.id,
      authorId: rebutterId,
      paraphrase: '对方主张裸辞去大理开民宿是实现自由生活的现实路径',
      title: '裸辞后社保断缴风险无法对冲',
    });
    if (!posted.ok || !posted.challenge) throw new Error('setup failed');
    await tree.concedeToChallenge({ challengeId: posted.challenge.id, actorId: ownerId });

    const revision = await tree.reviseClaim({
      claimId: root.id,
      authorId: ownerId,
      contentTitle: '先以探亲签证常驻大理调研半年，再决定是否辞职开民宿',
    });
    expect(revision.supersedesClaimId).toBe(root.id);

    await expect(
      tree.migrateClaim({
        claimId: pro.id,
        actorId: bystanderId,
        newParentId: revision.id,
        reason: 'rescue_migration',
      }),
    ).rejects.toThrow(/claim author/);

    await tree.migrateClaim({
      claimId: pro.id,
      actorId: ownerId,
      newParentId: revision.id,
      reason: 'rescue_migration',
    });
    expect(await claimRow(pro.id)).toMatchObject({
      parentId: revision.id,
      status: 'active',
      ancestors: [revision.id],
    });
  });

  it('话题收敛后不能再新增反驳', async () => {
    const { ownerId, rebutterId } = await createUsers();
    const created = await openTopic(ownerId, '已关闭');
    await db.update(topics).set({ status: 'converged' }).where(eq(topics.id, created.topic.id));
    await expect(
      rebuttal.postRebutal({
        topicId: created.topic.id,
        targetClaimId: created.root.id,
        authorId: rebutterId,
        paraphrase: '对方主张裸辞去大理开民宿是实现自由生活的现实路径',
        title: '已收敛后不应能反驳',
      }),
    ).rejects.toThrow(/已收敛|关闭/);
  });
});
