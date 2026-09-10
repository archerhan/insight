/**
 * DB 服务层集成测试：只在使用 TEST_DATABASE_URL 的测试库上运行
 * （CI 用 Postgres service 提供；本地无该变量时自动跳过）。
 * 测试库可丢弃：迁移脚本建 schema，各用例用独立话题互不干扰。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { and, asc, eq, inArray, like } from 'drizzle-orm';
import { db } from '../client';
import { challenges, claimEvents, claims, evidence, notifications, topics, users } from '../schema';

const connectionString = process.env.TEST_DATABASE_URL;

const describeDb = describe.runIf(connectionString);

describeDb('树操作事务层（集成）', () => {
  let sql: ReturnType<typeof postgres>;
  let tree: typeof import('./tree');
  let timers: typeof import('./timers');
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let userSeq = 0;

  beforeAll(async () => {
    sql = postgres(connectionString!, { max: 1, prepare: false });
    process.env.DATABASE_URL = connectionString!;
    tree = await import('./tree');
    timers = await import('./timers');
  });

  afterAll(async () => {
    // 清理本文件创建的数据（测试库可丢弃，这里保证在共享开发库上运行也不留垃圾）
    const topicRows = await db
      .select({ id: topics.id })
      .from(topics)
      .where(like(topics.title, `%${nonce}%`));
    const topicIds = topicRows.map((row) => row.id);
    if (topicIds.length > 0) {
      const claimRows = await db
        .select({ id: claims.id })
        .from(claims)
        .where(inArray(claims.topicId, topicIds));
      const claimIds = claimRows.map((row) => row.id);
      if (claimIds.length > 0) {
        await db.delete(evidence).where(inArray(evidence.claimId, claimIds));
      }
      await db.delete(claimEvents).where(inArray(claimEvents.topicId, topicIds));
      await db.delete(challenges).where(inArray(challenges.topicId, topicIds));
      await db.delete(claims).where(inArray(claims.topicId, topicIds));
      await db.delete(topics).where(inArray(topics.id, topicIds));
    }
    const userRows = await db.select({ id: users.id }).from(users).where(like(users.authId, `%${nonce}%`));
    if (userRows.length > 0) {
      const userIds = userRows.map((row) => row.id);
      // 挂反驳/推进计时会给论点作者写站内信，先删通知再删用户，否则撞 notifications 外键
      await db.delete(notifications).where(inArray(notifications.userId, userIds));
      await db.delete(users).where(inArray(users.id, userIds));
    }
    await sql.end();
  });

  async function createDemoUsers() {
    const seq = userSeq++;
    const rows = await db
      .insert(users)
      .values([
        { authId: `owner-${nonce}-${seq}`, displayName: '集成测试楼主' },
        { authId: `rebutter-${nonce}-${seq}`, displayName: '集成测试反驳者' },
      ])
      .returning({ id: users.id });
    return { ownerId: rows[0].id, rebutterId: rows[1].id };
  }

  async function claimRow(id: string) {
    return (
      await db
        .select({
          id: claims.id,
          parentId: claims.parentId,
          relation: claims.relation,
          status: claims.status,
          depth: claims.depth,
          ancestors: claims.ancestors,
          supersedesClaimId: claims.supersedesClaimId,
        })
        .from(claims)
        .where(eq(claims.id, id))
        .limit(1)
    )[0];
  }

  async function eventsOf(topicId: string) {
    return db
      .select({ type: claimEvents.type, claimId: claimEvents.claimId, detail: claimEvents.detail })
      .from(claimEvents)
      .where(eq(claimEvents.topicId, topicId))
      .orderBy(asc(claimEvents.id));
  }

  it('验收链路：反驳挂上 → 作者承认击穿 → 击杀链自动提升，事件可回放', async () => {
    const { ownerId, rebutterId } = await createDemoUsers();
    const { topic, root } = await tree.createTopicWithRoot({
      ownerId,
      type: 'decision',
      title: `集成走查 ${nonce}`,
      rootContentTitle: '裸辞去大理开民宿，是实现自由生活的现实路径',
    });

    await tree.createClaimUnder({
      topicId: topic.id,
      parentId: root.id,
      relation: 'pro',
      contentTitle: '先入股旧院试运营半年，试错成本可控',
      authorId: ownerId,
    });

    const challenge = await tree.attachRebuttal({
      topicId: topic.id,
      targetClaimId: root.id,
      contentTitle: '社保断缴与旺季不可测会让试错成本失控',
      authorId: rebutterId,
    });
    expect((await claimRow(root.id))?.status).toBe('challenged');
    expect(challenge.status).toBe('open');

    await tree.concedeToChallenge({ challengeId: challenge.id, actorId: ownerId });

    const finalRows = await db
      .select({ id: claims.id, parentId: claims.parentId, relation: claims.relation, status: claims.status })
      .from(claims)
      .where(eq(claims.topicId, topic.id));
    const killer = finalRows.find((row) => row.id === challenge.challengerClaimId);
    const pro = finalRows.find((row) => row.id !== root.id && row.id !== killer?.id);
    expect(killer).toMatchObject({ status: 'active', parentId: null, relation: 'root' });
    expect(pro?.status).toBe('orphaned');
    expect((await claimRow(root.id))?.status).toBe('refuted');

    const events = await eventsOf(topic.id);
    expect(events.map((event) => event.type)).toEqual([
      'created', // root
      'created', // pro
      'created', // rebuttal
      'challenged', // root
      'refuted', // root
      'orphaned', // pro
      'promoted', // killer
    ]);
  });

  it('respond：回应节点的祖先链/深度按树不变量计算', async () => {
    const { ownerId, rebutterId } = await createDemoUsers();
    const { topic, root } = await tree.createTopicWithRoot({
      ownerId,
      type: 'claim',
      title: `回应测试 ${nonce}`,
      rootContentTitle: 'AI 编程能显著提高开发效率',
    });
    const challenge = await tree.attachRebuttal({
      topicId: topic.id,
      targetClaimId: root.id,
      contentTitle: 'AI 代码错误隐蔽，返工吃掉提速',
      authorId: rebutterId,
    });
    const response = await tree.respondToChallenge({
      challengeId: challenge.id,
      authorId: ownerId,
      contentTitle: '样板任务占比过半，返工可控制在两成以内',
    });

    const responseRow = await claimRow(response.id);
    expect(responseRow).toMatchObject({
      parentId: challenge.challengerClaimId,
      depth: 2,
      ancestors: [root.id, challenge.challengerClaimId],
    });
    expect((await claimRow(root.id))?.status).toBe('responded');
    const [challengeRow] = await db
      .select({ status: challenges.status, respondedClaimId: challenges.respondedClaimId })
      .from(challenges)
      .where(eq(challenges.id, challenge.id));
    expect(challengeRow).toMatchObject({ status: 'responded', respondedClaimId: response.id });
  });

  it('revise：生成 supersedes 新版，旧版置 superseded，反驳仍指向旧版', async () => {
    const { ownerId, rebutterId } = await createDemoUsers();
    const { topic, root } = await tree.createTopicWithRoot({
      ownerId,
      type: 'decision',
      title: `修订测试 ${nonce}`,
      rootContentTitle: '裸辞去大理开民宿，是实现自由生活的现实路径',
    });
    const challenge = await tree.attachRebuttal({
      topicId: topic.id,
      targetClaimId: root.id,
      contentTitle: '裸辞后现金流撑不住',
      authorId: rebutterId,
    });

    const revision = await tree.reviseClaim({
      claimId: root.id,
      authorId: ownerId,
      contentTitle: '先试住四周完成调研再决定是否裸辞',
    });

    expect((await claimRow(root.id))?.status).toBe('superseded');
    expect(revision).toMatchObject({
      parentId: null,
      relation: 'root',
      ancestors: [],
      supersedesClaimId: root.id,
    });
    const [challengeRow] = await db
      .select({ targetClaimId: challenges.targetClaimId })
      .from(challenges)
      .where(eq(challenges.id, challenge.id));
    expect(challengeRow.targetClaimId).toBe(root.id);
    expect((await eventsOf(topic.id)).map((event) => event.type)).toContain('superseded');
  });

  it('revise：非作者不能修订', async () => {
    const { ownerId, rebutterId } = await createDemoUsers();
    const { topic, root } = await tree.createTopicWithRoot({
      ownerId,
      type: 'decision',
      title: `修订权限测试 ${nonce}`,
      rootContentTitle: 'AI 编程能显著提高开发效率',
    });
    await expect(
      tree.reviseClaim({
        claimId: root.id,
        authorId: rebutterId,
        contentTitle: '别人替我改主张',
      }),
    ).rejects.toThrow(/Only the claim author/);
    expect(topic.id).toBeTruthy();
  });

  it('migrate/promote：同事务重写整棵子树祖先链与深度', async () => {
    const { ownerId } = await createDemoUsers();
    const { topic, root } = await tree.createTopicWithRoot({
      ownerId,
      type: 'decision',
      title: `迁移测试 ${nonce}`,
      rootContentTitle: '大理民宿项目评估',
    });
    const a = await tree.createClaimUnder({
      topicId: topic.id,
      parentId: root.id,
      relation: 'pro',
      contentTitle: '分支 A',
      authorId: ownerId,
    });
    const b = await tree.createClaimUnder({
      topicId: topic.id,
      parentId: a.id,
      relation: 'pro',
      contentTitle: '分支 B（待抢救）',
      authorId: ownerId,
    });
    const c = await tree.createClaimUnder({
      topicId: topic.id,
      parentId: root.id,
      relation: 'con',
      contentTitle: '分支 C（新挂载点）',
      authorId: ownerId,
    });

    await tree.migrateClaim({ claimId: b.id, actorId: ownerId, newParentId: c.id, reason: 'rescue' });
    expect(await claimRow(b.id)).toMatchObject({
      parentId: c.id,
      status: 'active',
      depth: 2,
      ancestors: [root.id, c.id],
    });

    await tree.promoteClaimToReasonLayer({ claimId: b.id, actorId: ownerId });
    expect(await claimRow(b.id)).toMatchObject({
      parentId: null,
      relation: 'root',
      status: 'active',
      depth: 0,
      ancestors: [],
    });
    const types = (await eventsOf(topic.id)).map((event) => event.type);
    expect(types).toContain('migrated');
    expect(types).toContain('promoted');
  });

  it('计时推进：3/7/14 天阶段事件按需写入且幂等', async () => {
    const { ownerId, rebutterId } = await createDemoUsers();
    const { topic, root } = await tree.createTopicWithRoot({
      ownerId,
      type: 'claim',
      title: `计时测试 ${nonce}`,
      rootContentTitle: '测试计时推进的根立场',
    });
    const challenge = await tree.attachRebuttal({
      topicId: topic.id,
      targetClaimId: root.id,
      contentTitle: '计时测试的反驳',
      authorId: rebutterId,
    });

    const openedAt = new Date(Date.now() - 15 * 86_400_000);
    await db
      .update(challenges)
      .set({ openedAt, orangeAt: new Date(openedAt.getTime() + 3 * 86_400_000), redAt: new Date(openedAt.getTime() + 7 * 86_400_000), defaultLossAt: new Date(openedAt.getTime() + 14 * 86_400_000) })
      .where(eq(challenges.id, challenge.id));

    const first = await timers.advanceChallengeTimers(new Date());
    const second = await timers.advanceChallengeTimers(new Date());
    expect(first.find((row) => row.challengeId === challenge.id)?.phase).toBe('due');
    expect(second.find((row) => row.challengeId === challenge.id)?.eventWritten).toBe(false);

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
    ).filter((event) => event.detail && event.detail.challengeId === challenge.id);
    expect(timerEvents.map((event) => event.detail?.phase).sort()).toEqual(['due', 'orange', 'red']);
    expect((await claimRow(root.id))?.status).toBe('challenged'); // 阶段推进不改论点状态（判负需陪审）
  });

  it('attachRebuttal 拒绝作者反驳自己的论点', async () => {
    const { ownerId } = await createDemoUsers();
    const { topic, root } = await tree.createTopicWithRoot({
      ownerId,
      type: 'decision',
      title: `自反驳测试 ${nonce}`,
      rootContentTitle: 'AI 编程能显著提高开发效率',
    });
    await expect(
      tree.attachRebuttal({
        topicId: topic.id,
        targetClaimId: root.id,
        contentTitle: '自己反驳自己',
        authorId: ownerId,
      }),
    ).rejects.toThrow(/不能反驳自己/);
  });

  it('作者已回应后仍可承认击穿：challenge 变 conceded，击杀链提升', async () => {
    const { ownerId, rebutterId } = await createDemoUsers();
    const { topic, root } = await tree.createTopicWithRoot({
      ownerId,
      type: 'claim',
      title: `回应后承认 ${nonce}`,
      rootContentTitle: 'AI 编程能显著提高开发效率',
    });
    const challenge = await tree.attachRebuttal({
      topicId: topic.id,
      targetClaimId: root.id,
      contentTitle: 'AI 错误隐蔽，返工吃掉提速',
      authorId: rebutterId,
    });
    await tree.respondToChallenge({
      challengeId: challenge.id,
      authorId: ownerId,
      contentTitle: '样板任务占比过半，返工可控',
    });
    await tree.concedeToChallenge({ challengeId: challenge.id, actorId: ownerId });

    const [challengeRow] = await db
      .select({ status: challenges.status, resolutionReason: challenges.resolutionReason })
      .from(challenges)
      .where(eq(challenges.id, challenge.id));
    expect(challengeRow).toMatchObject({
      status: 'conceded',
      resolutionReason: 'author_conceded',
    });
    const killer = await claimRow(challenge.challengerClaimId);
    expect(killer).toMatchObject({ parentId: null, relation: 'root', status: 'active' });
  });

  it('承认一条击穿后，同一目标的其他 open 反驳自动 moot', async () => {
    const { ownerId, rebutterId } = await createDemoUsers();
    const { topic, root } = await tree.createTopicWithRoot({
      ownerId,
      type: 'decision',
      title: `多挑战 moot ${nonce}`,
      rootContentTitle: '裸辞去大理开民宿，是实现自由生活的现实路径',
    });
    const first = await tree.attachRebuttal({
      topicId: topic.id,
      targetClaimId: root.id,
      contentTitle: '反驳甲',
      authorId: rebutterId,
    });
    const second = await tree.attachRebuttal({
      topicId: topic.id,
      targetClaimId: root.id,
      contentTitle: '反驳乙',
      authorId: rebutterId,
    });
    await tree.concedeToChallenge({ challengeId: first.id, actorId: ownerId });

    const [secondRow] = await db
      .select({ status: challenges.status, resolutionReason: challenges.resolutionReason })
      .from(challenges)
      .where(eq(challenges.id, second.id));
    expect(secondRow).toMatchObject({ status: 'moot', resolutionReason: 'target_refuted' });
  });

  it('migrate/promote 只允许论点作者本人操作', async () => {
    const { ownerId, rebutterId } = await createDemoUsers();
    const { topic, root } = await tree.createTopicWithRoot({
      ownerId,
      type: 'decision',
      title: `迁移权限 ${nonce}`,
      rootContentTitle: '大理民宿项目评估',
    });
    const a = await tree.createClaimUnder({
      topicId: topic.id,
      parentId: root.id,
      relation: 'pro',
      contentTitle: '需要被保护的论点',
      authorId: ownerId,
    });
    await expect(
      tree.migrateClaim({ claimId: a.id, actorId: rebutterId, newParentId: null }),
    ).rejects.toThrow(/claim author/);
  });
});
