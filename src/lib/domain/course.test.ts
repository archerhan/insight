import { describe, expect, it } from 'vitest';
import { hasCompletedCourse, publishGateError } from './course';

describe('理性讨论须知完成门槛', () => {
  it('未登录 / 未完成 / 无效时间都视为未完成', () => {
    expect(hasCompletedCourse(null)).toBe(false);
    expect(hasCompletedCourse(undefined)).toBe(false);
    expect(hasCompletedCourse({ courseCompletedAt: null })).toBe(false);
    expect(hasCompletedCourse({ courseCompletedAt: undefined })).toBe(false);
    expect(hasCompletedCourse({ courseCompletedAt: 'not-a-date' })).toBe(false);
  });

  it('有有效完成时间即视为已完成', () => {
    expect(hasCompletedCourse({ courseCompletedAt: new Date('2026-09-09T08:00:00Z') })).toBe(true);
    expect(hasCompletedCourse({ courseCompletedAt: '2026-09-09T08:00:00Z' })).toBe(true);
  });

  it('发布资格校验给出统一文案', () => {
    expect(publishGateError({ courseCompletedAt: null })).toContain('理性讨论须知');
    expect(publishGateError({ courseCompletedAt: new Date() })).toBeNull();
  });
});
