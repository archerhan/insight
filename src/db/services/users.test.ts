import { describe, expect, it } from 'vitest';
import { isUniqueViolation } from './users';

describe('唯一约束冲突识别', () => {
  it('识别 Postgres 23505（含 drizzle 包装后的 cause 链）', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true);
    expect(
      isUniqueViolation(Object.assign(new Error('Failed query'), { cause: { code: '23505' } })),
    ).toBe(true);
    expect(
      isUniqueViolation(
        Object.assign(new Error('outer'), {
          cause: Object.assign(new Error('inner'), { cause: { code: '23505' } }),
        }),
      ),
    ).toBe(true);
  });

  it('其他错误不误判', () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation(new Error('boom'))).toBe(false);
    expect(isUniqueViolation({ code: '23503' })).toBe(false);
    expect(isUniqueViolation({ cause: { code: 23505 } })).toBe(false);
  });
});
