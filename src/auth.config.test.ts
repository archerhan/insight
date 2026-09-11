import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/db/services/users', () => ({
  findOrCreateUserFromOAuth: vi.fn(),
  getUserById: vi.fn(),
  verifyUserCredentials: vi.fn(),
}));

vi.mock('@/lib/auth/rate-limit', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/auth/rate-limit')>('@/lib/auth/rate-limit');
  return {
    ...actual,
    consumeRateLimit: vi.fn(() => ({ allowed: true, remaining: 5, retryAfterMs: 0 })),
  };
});

import {
  findOrCreateUserFromOAuth,
  getUserById,
  verifyUserCredentials,
} from '@/db/services/users';
import { consumeRateLimit } from '@/lib/auth/rate-limit';
import { authConfig } from './auth.config';

const callbacks = authConfig.callbacks!;
const findOrCreateMock = vi.mocked(findOrCreateUserFromOAuth);
const getUserByIdMock = vi.mocked(getUserById);
const verifyCredentialsMock = vi.mocked(verifyUserCredentials);
const consumeRateLimitMock = vi.mocked(consumeRateLimit);

/**
 * Auth.js 会把用户传入的配置合并到 provider 根对象上（`{...provider, ...provider.options}`），
 * 这里直接取 options 里的 authorize 来测，等价于运行时的行为。
 */
const credentialsProvider = authConfig.providers[1] as unknown as {
  options: {
    authorize: (
      credentials: Record<string, unknown>,
      request: Request,
    ) => Promise<{ id?: string; name?: string | null; email?: string | null } | null>;
  };
};

function authorize(credentials: Record<string, unknown>, ip = '203.0.113.9') {
  return credentialsProvider.options.authorize(
    credentials,
    new Request('https://burninginsight.com/api/auth/callback/credentials', {
      headers: { 'x-forwarded-for': `${ip}, 10.0.0.1` },
    }),
  );
}

describe('NextAuth 配置（GitHub 建档回调）', () => {
  beforeEach(() => {
    consumeRateLimitMock.mockReturnValue({ allowed: true, remaining: 5, retryAfterMs: 0 });
  });

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
      token: { userId: 'uuid-1', pwdAt: '2026-09-11T08:00:00.000Z' },
    } as never);
    expect(session?.user.id).toBe('uuid-1');
    expect(session?.user.pwdAt).toBe('2026-09-11T08:00:00.000Z');
  });
});

describe('邮箱密码 provider', () => {
  beforeEach(() => {
    verifyCredentialsMock.mockReset();
    consumeRateLimitMock.mockReturnValue({ allowed: true, remaining: 5, retryAfterMs: 0 });
  });

  it('校验通过时返回最小用户信息（邮箱做规范化）', async () => {
    verifyCredentialsMock.mockResolvedValueOnce({
      id: 'u-1',
      displayName: '明',
      email: 'ming@example.com',
    } as never);
    const user = await authorize({ email: ' Ming@Example.com ', password: 'zhuojian2026' });
    expect(verifyCredentialsMock).toHaveBeenCalledWith('ming@example.com', 'zhuojian2026');
    expect(user).toEqual({ id: 'u-1', name: '明', email: 'ming@example.com' });
  });

  it('邮箱格式不合法或密码为空时直接拒绝', async () => {
    expect(await authorize({ email: 'bad', password: 'zhuojian2026' })).toBeNull();
    expect(await authorize({ email: 'ming@example.com', password: '' })).toBeNull();
    expect(verifyCredentialsMock).not.toHaveBeenCalled();
  });

  it('密码错误时返回 null', async () => {
    verifyCredentialsMock.mockResolvedValueOnce(null);
    expect(await authorize({ email: 'ming@example.com', password: 'wrong-password' })).toBeNull();
  });

  it('触发限流时不再查库', async () => {
    consumeRateLimitMock.mockReturnValueOnce({ allowed: false, remaining: 0, retryAfterMs: 1000 });
    expect(await authorize({ email: 'ming@example.com', password: 'zhuojian2026' })).toBeNull();
    expect(verifyCredentialsMock).not.toHaveBeenCalled();
  });

  it('jwt 回调按库中账号写入 token（含密码修改时间）', async () => {
    getUserByIdMock.mockResolvedValueOnce({
      id: 'u-1',
      displayName: '明',
      email: 'ming@example.com',
      avatarUrl: null,
      status: 'active',
      passwordChangedAt: new Date('2026-09-11T08:00:00Z'),
    } as never);
    const token = await callbacks.jwt?.({
      token: {},
      account: { provider: 'credentials' },
      user: { id: 'u-1' },
    } as never);
    expect(token).toMatchObject({
      userId: 'u-1',
      name: '明',
      email: 'ming@example.com',
      pwdAt: '2026-09-11T08:00:00.000Z',
    });
  });

  it('账号被停用或已删除时返回 null（不签发会话）', async () => {
    getUserByIdMock.mockResolvedValueOnce({ id: 'u-1', status: 'suspended' } as never);
    const suspended = await callbacks.jwt?.({
      token: {},
      account: { provider: 'credentials' },
      user: { id: 'u-1' },
    } as never);
    expect(suspended).toBeNull();

    getUserByIdMock.mockResolvedValueOnce(null);
    const missing = await callbacks.jwt?.({
      token: {},
      account: { provider: 'credentials' },
      user: { id: 'u-2' },
    } as never);
    expect(missing).toBeNull();
  });
});
