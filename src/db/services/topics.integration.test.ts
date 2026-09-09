/**
 * 话题公开读服务集成测试：只在 TEST_DATABASE_URL 的测试库上运行。
 * 覆盖发布后的话题落点页所需的读查询与 404 分支。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { inArray, like } from 'drizzle-orm';
import { db } from '../client';
import { claimEvents, claims, evidence, tags, topicTags, topics, users } from '../schema';

const connectionString = process.env.TEST_DATABASE_URL;
const describeDb = describe.runIf(connectionString);

describeDb('话题公开读服务（集成）', () => {
  let sql: ReturnType<typeof postgres>;
  let publish: typeof import('./publish');
  let topicsService: typeof import('./topics');
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const topicIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(async () => {
    sql = postgres(connectionString!, { max: 1, prepare: false });
    process.env.DATABASE_URL = connectionString!;
    publish = await import('./publish');
    topicsService = await import('./topics');
  });

  afterAll(async () => {
    if (topicIds.length > 0) {
      const claimIds = (
        await db
          .select({ id: claims.id })
          .from(claims)
          .where(inArray(claims.topicId, topicIds))
      ).map((row) => row.id);
      if (claimIds.length > 0) {
        await db.delete(evidence).where(inArray(evidence.claimId, claimIds));
      }
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

  it('发布后按 id 可读回完整话题、楼主、标签与根立场', async () => {
    const [user] = await db
      .insert(users)
      .values({ authId: `topic-reader-${nonce}`, displayName: '话题读测试楼主' })
      .returning({ id: users.id });
    userIds.push(user.id);

    const result = await publish.publishTopic({
      ownerId: user.id,
      type: 'decision',
      title: `话题详情测试 ${nonce}`,
      body: '详情测试背景',
      stance: `详情测试根立场 ${nonce}`,
      lean: 'neutral',
      tagNames: [`详情标签-${nonce}`],
      stakeEnabled: false,
      revealAt: null,
      bountyEnabled: false,
      allowPublicRebuttal: true,
    });
    topicIds.push(result.topic.id);

    const detail = await topicsService.getPublicTopicDetail(result.topic.id);
    expect(detail).toMatchObject({
      id: result.topic.id,
      type: 'decision',
      title: `话题详情测试 ${nonce}`,
      body: '详情测试背景',
      status: 'open',
      ownerName: '话题读测试楼主',
      nodeCount: 1,
      openChallengeCount: 0,
      tags: [`详情标签-${nonce}`],
    });
    expect(detail?.rootClaims).toEqual([
      expect.objectContaining({
        id: result.root.id,
        contentTitle: `详情测试根立场 ${nonce}`,
        status: 'active',
        authorName: '话题读测试楼主',
      }),
    ]);
  });

  it('不存在的 id 与非法 uuid 返回 null', async () => {
    expect(
      await topicsService.getPublicTopicDetail('00000000-0000-4000-8000-000000000000'),
    ).toBeNull();
    expect(await topicsService.getPublicTopicDetail('not-a-uuid')).toBeNull();
    expect(await topicsService.getPublicTopicDetail('')).toBeNull();
  });
});
