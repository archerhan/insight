/**
 * 发起话题发布事务集成测试：只在 TEST_DATABASE_URL 的测试库上运行。
 * 覆盖 M2 验收点——topic + 根立场 + 可选论据 + tags 单事务落库，
 * 发布后立即出现在广场"正在对线"。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { asc, eq, inArray, like } from 'drizzle-orm';
import { db } from '../client';
import {
  claimEvents,
  claims,
  conclusionItems,
  conclusionVersions,
  evidence,
  tags,
  topicTags,
  topics,
  users,
} from '../schema';

const connectionString = process.env.TEST_DATABASE_URL;
const describeDb = describe.runIf(connectionString);

describeDb('发起话题发布事务（集成）', () => {
  let sql: ReturnType<typeof postgres>;
  let publish: typeof import('./publish');
  let plaza: typeof import('./plaza');
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let userSeq = 0;
  const topicIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(async () => {
    sql = postgres(connectionString!, { max: 1, prepare: false });
    process.env.DATABASE_URL = connectionString!;
    publish = await import('./publish');
    plaza = await import('./plaza');
  });

  afterAll(async () => {
    if (topicIds.length > 0) {
      const versionRows = await db
        .select({ id: conclusionVersions.id })
        .from(conclusionVersions)
        .where(inArray(conclusionVersions.topicId, topicIds));
      const versionIds = versionRows.map((row) => row.id);
      if (versionIds.length > 0) {
        await db.delete(conclusionItems).where(inArray(conclusionItems.versionId, versionIds));
        await db.delete(conclusionVersions).where(inArray(conclusionVersions.id, versionIds));
      }
      await db.delete(evidence).where(
        inArray(
          evidence.claimId,
          (
            await db
              .select({ id: claims.id })
              .from(claims)
              .where(inArray(claims.topicId, topicIds))
          ).map((row) => row.id),
        ),
      );
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

  async function createOwner() {
    const seq = userSeq++;
    const rows = await db
      .insert(users)
      .values({
        authId: `publish-owner-${nonce}-${seq}`,
        displayName: `发布集成楼主 ${seq}`,
        courseCompletedAt: new Date(),
      })
      .returning({ id: users.id });
    const userId = rows[0].id;
    userIds.push(userId);
    return userId;
  }

  it('单事务发布 topic + 根立场 + 论据 + 标签，广场立即可见', async () => {
    const ownerId = await createOwner();
    const result = await publish.publishTopic({
      ownerId,
      type: 'decision',
      title: `要不要测试发布 ${nonce}？`,
      body: '背景：这是一条集成测试话题。',
      stance: '测试发布的立场主张：先验证再决定',
      lean: 'neutral',
      tagNames: [`测试-${nonce}-A`, `测试-${nonce}-B`],
      evidenceSummary: '首条论据：本地已有半年试运行数据',
      stakeEnabled: true,
      revealAt: new Date(Date.now() + 40 * 86_400_000),
      bountyEnabled: false,
      allowPublicRebuttal: true,
    });
    topicIds.push(result.topic.id);

    const topicRow = (
      await db
        .select()
        .from(topics)
        .where(eq(topics.id, result.topic.id))
        .limit(1)
    )[0];
    expect(topicRow).toMatchObject({
      type: 'decision',
      status: 'open',
      visibility: 'public',
      closeMode: 'owner',
      allowPublicRebuttal: true,
      currentNodeCount: 1,
    });
    expect(topicRow.revealAt).not.toBeNull();

    const root = (
      await db
        .select()
        .from(claims)
        .where(eq(claims.id, result.root.id))
        .limit(1)
    )[0];
    expect(root).toMatchObject({
      parentId: null,
      relation: 'root',
      status: 'active',
      depth: 0,
      ancestors: [],
      authorId: ownerId,
    });

    const [event] = await db
      .select()
      .from(claimEvents)
      .where(eq(claimEvents.claimId, result.root.id))
      .orderBy(asc(claimEvents.id))
      .limit(1);
    expect(event?.type).toBe('created');
    expect(event?.detail).toMatchObject({ ownerLean: 'neutral', relation: 'root' });

    const evidenceRows = await db
      .select()
      .from(evidence)
      .where(eq(evidence.claimId, result.root.id));
    expect(evidenceRows).toHaveLength(1);
    expect(evidenceRows[0].summary).toContain('首条论据');

    const tagNames = await db
      .select({ name: tags.name })
      .from(topicTags)
      .innerJoin(tags, eq(topicTags.tagId, tags.id))
      .where(eq(topicTags.topicId, result.topic.id));
    expect(tagNames.map((row) => row.name).sort()).toEqual(
      [`测试-${nonce}-A`, `测试-${nonce}-B`].sort(),
    );

    const plazaData = await plaza.getPlazaSections(10);
    const listed = plazaData.openTopics.find((topic) => topic.id === result.topic.id);
    expect(listed).toMatchObject({
      title: `要不要测试发布 ${nonce}？`,
      rootStance: '测试发布的立场主张：先验证再决定',
      nodeCount: 1,
      openChallengeCount: 0,
    });
    expect(listed?.tags).toEqual([`测试-${nonce}-A`, `测试-${nonce}-B`]);
  });

  it('claim 类型默认社区收敛；关闭立帖为证时不写揭晓日期', async () => {
    const ownerId = await createOwner();
    const result = await publish.publishTopic({
      ownerId,
      type: 'claim',
      title: `AI 编程是否提高效率 ${nonce}？`,
      body: '',
      stance: `在熟悉代码库时 AI 编程显著提效 ${nonce}`,
      lean: 'pro',
      tagNames: [],
      stakeEnabled: false,
      revealAt: null,
      bountyEnabled: true,
      allowPublicRebuttal: false,
    });
    topicIds.push(result.topic.id);

    const topicRow = (
      await db
        .select()
        .from(topics)
        .where(eq(topics.id, result.topic.id))
        .limit(1)
    )[0];
    expect(topicRow).toMatchObject({
      type: 'claim',
      closeMode: 'community',
      stakeEnabled: false,
      bountyEnabled: true,
      allowPublicRebuttal: false,
    });
    expect(topicRow.revealAt).toBeNull();
  });

  it('未知或非活跃楼主被拒绝', async () => {
    await expect(
      publish.publishTopic({
        ownerId: '00000000-0000-4000-8000-000000000000',
        type: 'decision',
        title: `不应落库 ${nonce}`,
        stance: '不应落库的立场',
        lean: 'neutral',
        stakeEnabled: false,
        revealAt: null,
        bountyEnabled: false,
        allowPublicRebuttal: true,
      }),
    ).rejects.toThrow(/Unknown or inactive owner/);
  });
});
