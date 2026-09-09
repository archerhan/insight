import { describe, expect, it, vi } from 'vitest';

vi.mock('@/auth', () => ({
  signOut: vi.fn(),
}));

import { signOut } from '@/auth';
import { signOutAction } from './auth';

const signOutMock = vi.mocked(signOut);

describe('退出登录动作', () => {
  it('调用 Auth.js signOut 并回到广场', async () => {
    signOutMock.mockResolvedValueOnce(undefined);
    await signOutAction();
    expect(signOutMock).toHaveBeenCalledWith({ redirectTo: '/' });
  });
});
