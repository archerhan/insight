/**
 * 用户档案服务集成测试：只在使用 TEST_DATABASE_URL 的测试库上运行。
 * 覆盖：OAuth 首次建档、幂等复用、头像同步、须知完成时间写入。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { like } from 'drizzle-orm';
import { db } from '../client';
import { users } from '../schema';

const connectionString = process.env.TEST_DATABASE_URL;
const describeDb = describe.runIf(connectionString);

describeDb('用户档案服务（集成）', () => {
  let sql: ReturnType<typeof postgres>;
  let userService: typeof import('./users');
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const authId = `github:test-${nonce}`;
  const userIds: string[] = [];

  beforeAll(async () => {
    sql = postgres(connectionString!, { max: 1, prepare: false });
    process.env.DATABASE_URL = connectionString!;
    userService = await import('./users');
  });

  afterAll(async () => {
    if (userIds.length > 0) {
      await db.delete(users).where(like(users.authId, `%${nonce}%`));
    }
    await sql.end();
  });

  it('首次 OAuth 登录自动建档，可再次幂等取出', async () => {
    const created = await userService.findOrCreateUserFromOAuth({
      authId,
      displayName: '测试辩手',
      avatarUrl: 'https://example.com/a.png',
    });
    userIds.push(created.id);
    expect(created.authId).toBe(authId);
    expect(created.displayName).toBe('测试辩手');
    expect(created.courseCompletedAt).toBeNull();

    const again = await userService.findOrCreateUserFromOAuth({
      authId,
      displayName: '测试辩手',
      avatarUrl: 'https://example.com/a.png',
    });
    expect(again.id).toBe(created.id);
    expect(await userService.findUserByAuthId(authId)).toMatchObject({ id: created.id });
    expect(await userService.getUserById(created.id)).toMatchObject({ id: created.id });
  });

  it('头像可同步，假名不被覆盖', async () => {
    const user = await userService.findOrCreateUserFromOAuth({
      authId,
      displayName: '不应覆盖的名字',
      avatarUrl: 'https://example.com/b.png',
    });
    expect(user.id).toBe(userIds[0]);
    expect(user.displayName).toBe('测试辩手');
    expect(user.avatarUrl).toBe('https://example.com/b.png');
  });

  it('完成须知后写入 course_completed_at', async () => {
    const completedAt = new Date('2026-09-09T08:30:00Z');
    const updated = await userService.markCourseCompleted(userIds[0], completedAt);
    expect(updated?.courseCompletedAt?.toISOString()).toBe(completedAt.toISOString());
  });
});

/** 邮箱账号：注册建档、密码校验、改密后 password_changed_at 前移。 */
describeDb('邮箱账号服务（集成）', () => {
  let sql: ReturnType<typeof postgres>;
  let userService: typeof import('./users');
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `ming-${nonce}@example.com`;
  let createdId = '';

  beforeAll(async () => {
    sql = postgres(connectionString!, { max: 1, prepare: false });
    process.env.DATABASE_URL = connectionString!;
    userService = await import('./users');
  });

  afterAll(async () => {
    await db.delete(users).where(like(users.email, `%${nonce}%`));
    await sql.end();
  });

  it('注册建档：邮箱统一小写，密码只存哈希', async () => {
    const created = await userService.createEmailUser({
      email: `Ming-${nonce}@Example.com`,
      displayName: '明',
      password: 'zhuojian2026',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    createdId = created.user.id;
    expect(created.user.email).toBe(email);
    expect(created.user.passwordHash).toMatch(/^scrypt\$/);
    expect(created.user.passwordHash).not.toContain('zhuojian2026');
    expect(created.user.passwordChangedAt).toBeInstanceOf(Date);
    expect(await userService.findUserByEmail(email)).toMatchObject({ id: createdId });
  });

  it('邮箱唯一：重复注册返回 email_taken', async () => {
    const again = await userService.createEmailUser({
      email,
      displayName: '另一个明',
      password: 'zhuojian2026',
    });
    expect(again).toEqual({ ok: false, reason: 'email_taken' });
  });

  it('密码校验：正确通过，错误返回 null', async () => {
    expect(await userService.verifyUserCredentials(email, 'zhuojian2026')).toMatchObject({
      id: createdId,
    });
    expect(await userService.verifyUserCredentials(email, 'wrong-password-1')).toBeNull();
    expect(await userService.verifyUserCredentials('nobody@example.com', 'zhuojian2026')).toBeNull();
  });

  it('改密码会刷新 password_changed_at（旧会话据此失效）', async () => {
    const before = await userService.getUserById(createdId);
    const changedAt = new Date(Date.now() + 1000);
    const updated = await userService.updateUserPassword(createdId, 'zhuojian2027', changedAt);
    expect(updated?.passwordChangedAt?.toISOString()).toBe(changedAt.toISOString());
    expect(updated!.passwordChangedAt!.getTime()).toBeGreaterThan(
      before!.passwordChangedAt!.getTime(),
    );
    expect(await userService.verifyUserCredentials(email, 'zhuojian2027')).toMatchObject({
      id: createdId,
    });
    expect(await userService.verifyUserCredentials(email, 'zhuojian2026')).toBeNull();
  });
});
