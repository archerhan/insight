/**
 * 忘记密码集成测试：签发 → 校验 → 消费（单次有效）→ 旧令牌作废。
 * 只在 TEST_DATABASE_URL 存在时运行（CI 用 Postgres service）。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { like } from 'drizzle-orm';
import { db } from '../client';
import { users } from '../schema';

const connectionString = process.env.TEST_DATABASE_URL;
const describeDb = describe.runIf(connectionString);

describeDb('密码重置令牌（集成）', () => {
  let sql: ReturnType<typeof postgres>;
  let userService: typeof import('./users');
  let resetService: typeof import('./password-reset');
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `reset-${nonce}@example.com`;
  let userId = '';

  beforeAll(async () => {
    sql = postgres(connectionString!, { max: 1, prepare: false });
    process.env.DATABASE_URL = connectionString!;
    userService = await import('./users');
    resetService = await import('./password-reset');

    const created = await userService.createEmailUser({
      email,
      displayName: '重置测试',
      password: 'zhuojian2026',
    });
    if (!created.ok) throw new Error('建立测试账号失败');
    userId = created.user.id;
  });

  afterAll(async () => {
    // user_tokens 通过外键级联删除
    await db.delete(users).where(like(users.email, `%${nonce}%`));
    await sql.end();
  });

  it('签发的令牌可查到并消费，消费后密码更新且令牌失效', async () => {
    const issued = await resetService.issuePasswordResetToken(userId);
    const lookup = await resetService.findPasswordResetToken(issued.token);
    expect(lookup?.user.id).toBe(userId);

    const consumed = await resetService.consumePasswordResetToken(issued.token, 'zhuojian2028');
    expect(consumed).toEqual({ ok: true, userId });
    expect(await userService.verifyUserCredentials(email, 'zhuojian2028')).toMatchObject({
      id: userId,
    });

    // 同一个令牌不能再用
    const again = await resetService.consumePasswordResetToken(issued.token, 'zhuojian2029');
    expect(again).toEqual({ ok: false, reason: 'invalid' });
  });

  it('重新签发会让旧令牌立即作废', async () => {
    const first = await resetService.issuePasswordResetToken(userId);
    const second = await resetService.issuePasswordResetToken(userId);

    const firstLookup = await resetService.findPasswordResetToken(first.token);
    expect(firstLookup?.usedAt).not.toBeNull();

    const consumed = await resetService.consumePasswordResetToken(second.token, 'zhuojian2030');
    expect(consumed.ok).toBe(true);
  });

  it('过期令牌不能消费', async () => {
    const issued = await resetService.issuePasswordResetToken(userId, new Date(), -1);
    const consumed = await resetService.consumePasswordResetToken(issued.token, 'zhuojian2031');
    expect(consumed).toEqual({ ok: false, reason: 'expired' });
  });

  it('不存在的令牌返回 invalid', async () => {
    expect(await resetService.findPasswordResetToken('not-a-real-token')).toBeNull();
    expect(await resetService.consumePasswordResetToken('', 'zhuojian2032')).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });
});
