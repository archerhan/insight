import { describe, expect, it, vi } from 'vitest';

vi.mock('@/db/services/users', () => ({
  findOrCreateUserFromOAuth: vi.fn(),
}));

import { findOrCreateUserFromOAuth } from '@/db/services/users';
import { authConfig } from './auth.config';

const callbacks = authConfig.callbacks!;
const findOrCreateMock = vi.mocked(findOrCreateUserFromOAuth);

describe('NextAuth 配置（GitHub 建档回调）', () => {
  it('首次登录用 github:{id} 作 auth_id 建档并写入 token', async () => {
    findOrCreateMock.mockResolvedValueOnce({ id: 'uuid-1' } as never);
    const token = await callbacks.jwt?.({
      token: {},
      account: { provider: 'github', providerAccountId: '424242' },
      profile: { name: 'Alice Chen', login: 'alice-c', avatar_url: 'https://a/1.png' },
    } as never);

    expect(findOrCreateMock).toHaveBeenCalledWith({
      authId: 'github:424242',
      displayName: 'Alice Chen',
      avatarUrl: 'https://a/1.png',
    });
    expect(token).toMatchObject({ userId: 'uuid-1', picture: 'https://a/1.png' });
  });

  it('无昵称时回退 GitHub login，仍无则用占位名', async () => {
    findOrCreateMock.mockResolvedValueOnce({ id: 'uuid-2' } as never);
    const token = await callbacks.jwt?.({
      token: {},
      account: { provider: 'github', providerAccountId: '7' },
      profile: { login: 'zhuojian-bot' },
    } as never);
    expect(findOrCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: 'zhuojian-bot' }),
    );
    expect(token?.userId).toBe('uuid-2');

    findOrCreateMock.mockResolvedValueOnce({ id: 'uuid-3' } as never);
    const fallback = await callbacks.jwt?.({
      token: {},
      account: { provider: 'github', providerAccountId: '8' },
      profile: {},
    } as never);
    expect(findOrCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: '灼见用户' }),
    );
    expect(fallback?.userId).toBe('uuid-3');
  });

  it('非 GitHub 账号不改写 token', async () => {
    const token = await callbacks.jwt?.({ token: { userId: 'keep' }, account: null } as never);
    expect(token).toMatchObject({ userId: 'keep' });
    expect(findOrCreateMock).not.toHaveBeenCalled();
  });

  it('session 回调把 token.userId 注入 session.user.id', async () => {
    const session = await callbacks.session?.({
      session: { user: { name: '明' } },
      token: { userId: 'uuid-1' },
    } as never);
    expect(session?.user.id).toBe('uuid-1');
  });
});
