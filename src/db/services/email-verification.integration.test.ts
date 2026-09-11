/**
 * 注册验证码集成测试（CI 测试库）：签发 → 错误累计 → 校验 → 核销 → 旧码作废 / 过期。
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { db } from '../client';
import { emailVerificationCodes } from '../schema';

const connectionString = process.env.TEST_DATABASE_URL;
const describeDb = describe.runIf(connectionString);

describeDb('注册邮箱验证码（集成）', () => {
  let sql: ReturnType<typeof postgres>;
  let service: typeof import('./email-verification');
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `signup-${nonce}@example.com`;

  beforeAll(async () => {
    sql = postgres(connectionString!, { max: 1, prepare: false });
    process.env.DATABASE_URL = connectionString!;
    service = await import('./email-verification');
  });

  afterAll(async () => {
    await db.delete(emailVerificationCodes).where(eq(emailVerificationCodes.email, email));
    await db.delete(emailVerificationCodes).where(eq(emailVerificationCodes.email, `${email}.old`));
    await sql.end();
  });

  it('正确验证码可核销，且不能重复使用', async () => {
    const { code } = await service.issueSignupCode(email);
    expect(await service.verifySignupCode(email, code)).toEqual({ ok: true });
    expect(await service.consumeSignupCode(email, code)).toEqual({ ok: true });
    expect(await service.consumeSignupCode(email, code)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('错误验证码累加尝试次数，超过上限后拒绝', async () => {
    const { code } = await service.issueSignupCode(`${email}.old`);
    for (let i = 0; i < service.SIGNUP_CODE_MAX_ATTEMPTS; i += 1) {
      const result = await service.verifySignupCode(`${email}.old`, '000000');
      expect(result.ok).toBe(false);
    }
    const blocked = await service.verifySignupCode(`${email}.old`, code);
    expect(blocked).toEqual({ ok: false, reason: 'too_many_attempts' });
  });

  it('过期验证码返回 expired', async () => {
    const { code } = await service.issueSignupCode(email, new Date(), -1);
    expect(await service.verifySignupCode(email, code)).toEqual({ ok: false, reason: 'expired' });
  });

  it('重新签发会让旧验证码立即作废', async () => {
    const first = await service.issueSignupCode(email);
    const second = await service.issueSignupCode(email);
    expect(await service.verifySignupCode(email, first.code)).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(await service.consumeSignupCode(email, second.code)).toEqual({ ok: true });
  });
});
