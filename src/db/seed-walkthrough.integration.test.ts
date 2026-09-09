/**
 * M0 验收集成测试：真实执行种子脚本与走查脚本（disposable 测试库 / CI Postgres），
 * 断言两棵演示树落库、且走查话题能走到"击穿 + 击杀链自动提升 + 事件回放"。
 * 种子与走查均为幂等设计，可在共享开发库重复执行。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { asc, eq } from 'drizzle-orm';
import { db } from './client';
import { claimEvents, claims, topics } from './schema';

const connectionString = process.env.TEST_DATABASE_URL;

const describeDb = describe.runIf(connectionString);

describeDb('M0 种子与走查脚本（集成）', () => {
  let sql: ReturnType<typeof postgres>;

  beforeAll(async () => {
    sql = postgres(connectionString!, { max: 1, prepare: false });
    process.env.DATABASE_URL = connectionString!;
    const seed = await import('./seed');
    await seed.main();
    const demo = await import('./demo');
    await demo.main();
  });

  afterAll(async () => {
    await sql.end();
  });

  async function topicIdByTitle(title: string) {
    const row = await db.select({ id: topics.id }).from(topics).where(eq(topics.title, title)).limit(1);
    return row[0]?.id;
  }

  it('两棵演示树（理由层 → 子论点 → 证据）已落库', async () => {
    const minsuId = await topicIdByTitle('要不要裸辞去大理开民宿？');
    const aiId = await topicIdByTitle('AI 编程是否提高效率？');
    expect(minsuId).toBeTruthy();
    expect(aiId).toBeTruthy();

    for (const topicId of [minsuId!, aiId!]) {
      const rows = await db
        .select({ id: claims.id, parentId: claims.parentId, relation: claims.relation })
        .from(claims)
        .where(eq(claims.topicId, topicId));
      expect(rows.some((row) => row.parentId === null && row.relation === 'root')).toBe(true);
      expect(rows.filter((row) => row.parentId !== null).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('走查脚本把演示树走到击穿并自动提升击杀链，事件时间轴可回放', async () => {
    const walkthroughId = await topicIdByTitle('M0 走查 · 反驳到击穿自动提升');
    expect(walkthroughId).toBeTruthy();

    const rows = await db
      .select({ id: claims.id, contentTitle: claims.contentTitle, parentId: claims.parentId, relation: claims.relation, status: claims.status })
      .from(claims)
      .where(eq(claims.topicId, walkthroughId!));
    const killer = rows.find((row) => row.contentTitle === '社保断缴与旺季不可测会让试错成本失控');
    const root = rows.find((row) => row.contentTitle === '裸辞去大理开民宿，是实现自由生活的现实路径');
    expect(killer).toMatchObject({ parentId: null, relation: 'root', status: 'active' });
    expect(root?.status).toBe('refuted');

    const events = await db
      .select({ type: claimEvents.type, createdAt: claimEvents.createdAt })
      .from(claimEvents)
      .where(eq(claimEvents.topicId, walkthroughId!))
      .orderBy(asc(claimEvents.id));
    const types = events.map((event) => event.type);
    expect(types).toEqual(expect.arrayContaining(['created', 'challenged', 'refuted', 'orphaned', 'promoted']));
    expect(types.indexOf('refuted')).toBeLessThan(types.indexOf('promoted'));
    expect(events.length).toBeGreaterThanOrEqual(6);
  });
});
