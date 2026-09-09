import { beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('@/db/services/notifications', () => ({
  markAllNotificationsRead: vi.fn(),
}));

import { auth } from '@/auth';
import { getUserById } from '@/db/services/users';
import { markAllNotificationsRead } from '@/db/services/notifications';
import { markAllNotificationsReadAction } from './actions';

const authMock = vi.mocked(auth);
const getUserByIdMock = vi.mocked(getUserById);
const markAllNotificationsReadMock = vi.mocked(markAllNotificationsRead);

beforeEach(() => {
  redirectMock.mockClear();
  authMock.mockReset();
  getUserByIdMock.mockReset();
  markAllNotificationsReadMock.mockReset();
});

describe('通知动作', () => {
  it('未登录跳转登录页', async () => {
    authMock.mockResolvedValueOnce(null as never);
    await expect(markAllNotificationsReadAction()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith('/login?callbackUrl=%2Fnotifications');
    expect(markAllNotificationsReadMock).not.toHaveBeenCalled();
  });

  it('登录用户把全部通知标为已读并回到通知页', async () => {
    authMock.mockResolvedValueOnce({ user: { id: 'u-1' } } as never);
    getUserByIdMock.mockResolvedValueOnce({ id: 'u-1', status: 'active' } as never);
    markAllNotificationsReadMock.mockResolvedValueOnce(4);

    await expect(markAllNotificationsReadAction()).rejects.toThrow('NEXT_REDIRECT');
    expect(markAllNotificationsReadMock).toHaveBeenCalledWith('u-1');
    expect(redirectMock).toHaveBeenCalledWith('/notifications');
  });
});
