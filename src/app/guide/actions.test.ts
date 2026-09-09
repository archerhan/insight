import { describe, expect, it, vi } from 'vitest';

const redirectMock = vi.fn((...args: unknown[]) => {
  void args;
  throw new Error('NEXT_REDIRECT');
});

vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
}));

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/db/services/users', () => ({
  markCourseCompleted: vi.fn(),
}));

import { auth } from '@/auth';
import { markCourseCompleted } from '@/db/services/users';
import { completeCourse } from './actions';

const authMock = vi.mocked(auth);
const markCourseCompletedMock = vi.mocked(markCourseCompleted);

describe('须知完成动作', () => {
  it('未登录时不写库、不跳转', async () => {
    authMock.mockResolvedValueOnce(null as never);
    await expect(completeCourse(new FormData())).resolves.toBeUndefined();
    expect(markCourseCompletedMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('已登录时写入完成时间并跳转到安全回跳地址', async () => {
    authMock.mockResolvedValueOnce({ user: { id: 'u-1' } } as never);
    markCourseCompletedMock.mockResolvedValueOnce(null);
    const formData = new FormData();
    formData.set('next', '/topics/new');
    await expect(completeCourse(formData)).rejects.toThrow('NEXT_REDIRECT');
    expect(markCourseCompletedMock).toHaveBeenCalledWith('u-1');
    expect(redirectMock).toHaveBeenCalledWith('/topics/new');
  });

  it('异常回跳地址被拦截，落到发起话题页', async () => {
    authMock.mockResolvedValueOnce({ user: { id: 'u-1' } } as never);
    markCourseCompletedMock.mockResolvedValueOnce(null);
    const formData = new FormData();
    formData.set('next', '//evil.example');
    await expect(completeCourse(formData)).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith('/topics/new');
  });
});
