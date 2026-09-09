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
  getUserById: vi.fn(),
}));

import { auth } from '@/auth';
import { getUserById } from '@/db/services/users';
import { getCurrentUser, getCurrentUserOrRedirect } from './current-user';

const authMock = vi.mocked(auth);
const getUserByIdMock = vi.mocked(getUserById);

describe('当前登录用户', () => {
  it('无会话时返回 null', async () => {
    authMock.mockResolvedValueOnce(null as never);
    expect(await getCurrentUser()).toBeNull();
  });

  it('有会话但档案缺失时返回 null', async () => {
    authMock.mockResolvedValueOnce({ user: { id: 'u-1' } } as never);
    getUserByIdMock.mockResolvedValueOnce(null as never);
    expect(await getCurrentUser()).toBeNull();
  });

  it('有会话且有档案时返回完整用户', async () => {
    const dbUser = { id: 'u-1', displayName: '明' };
    authMock.mockResolvedValueOnce({ user: { id: 'u-1' } } as never);
    getUserByIdMock.mockResolvedValueOnce(dbUser as never);
    expect(await getCurrentUser()).toEqual(dbUser);
  });

  it('未登录守卫跳转登录页并携带回跳地址', async () => {
    authMock.mockResolvedValueOnce(null as never);
    await expect(getCurrentUserOrRedirect('/new')).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith('/login?callbackUrl=%2Fnew');
  });

  it('已登录守卫直接返回用户', async () => {
    const dbUser = { id: 'u-2', displayName: '辩手' };
    authMock.mockResolvedValueOnce({ user: { id: 'u-2' } } as never);
    getUserByIdMock.mockResolvedValueOnce(dbUser as never);
    expect(await getCurrentUserOrRedirect('/me')).toEqual(dbUser);
  });
});
