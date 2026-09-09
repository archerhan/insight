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

vi.mock('@/db/services/publish', () => ({
  publishTopic: vi.fn(),
}));

import { auth } from '@/auth';
import { getUserById } from '@/db/services/users';
import { publishTopic } from '@/db/services/publish';
import { publishTopicAction } from './actions';

const authMock = vi.mocked(auth);
const getUserByIdMock = vi.mocked(getUserById);
const publishTopicMock = vi.mocked(publishTopic);

function formDataWith(overrides: Record<string, string | string[]> = {}) {
  const form = new FormData();
  const defaults: Record<string, string | string[]> = {
    type: 'decision',
    title: '要不要裸辞去大理开民宿？',
    body: '30 岁，存款约 40 万。',
    stance: '裸辞去大理开民宿，是实现自由生活的现实路径',
    lean: 'pro',
    tag: ['职业', '生活方式'],
    evidenceSummary: '朋友的大理旧院已试运营两年',
    stakeEnabled: 'true',
    revealDate: '2026-12-06',
    bountyEnabled: 'false',
    allowPublicRebuttal: 'true',
    ...overrides,
  };
  for (const [key, value] of Object.entries(defaults)) {
    if (Array.isArray(value)) {
      value.forEach((item) => form.append(key, item));
    } else {
      form.set(key, value);
    }
  }
  return form;
}

function completedUser() {
  return {
    id: 'u-1',
    displayName: '明',
    courseCompletedAt: new Date('2026-09-09T08:30:00Z'),
  } as never;
}

describe('发起话题发布动作', () => {
  it('未登录时跳登录页并保留回跳地址', async () => {
    authMock.mockResolvedValueOnce(null as never);
    await expect(
      publishTopicAction({ error: null }, formDataWith()),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith('/login?callbackUrl=%2Ftopics%2Fnew');
    expect(publishTopicMock).not.toHaveBeenCalled();
  });

  it('未完成须知时跳须知页', async () => {
    authMock.mockResolvedValueOnce({ user: { id: 'u-1' } } as never);
    getUserByIdMock.mockResolvedValueOnce({
      id: 'u-1',
      courseCompletedAt: null,
    } as never);
    await expect(
      publishTopicAction({ error: null }, formDataWith()),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith('/guide?next=%2Ftopics%2Fnew');
    expect(publishTopicMock).not.toHaveBeenCalled();
  });

  it('草稿校验失败时返回错误且不落库', async () => {
    authMock.mockResolvedValueOnce({ user: { id: 'u-1' } } as never);
    getUserByIdMock.mockResolvedValueOnce(completedUser());
    const result = await publishTopicAction(
      { error: null },
      formDataWith({ title: '太短' }),
    );
    expect(result.error).toContain('标题需要 4–80 字');
    expect(publishTopicMock).not.toHaveBeenCalled();
  });

  it('通过校验后单事务发布并跳转到新话题', async () => {
    authMock.mockResolvedValueOnce({ user: { id: 'u-1' } } as never);
    getUserByIdMock.mockResolvedValueOnce(completedUser());
    publishTopicMock.mockResolvedValueOnce({
      topic: { id: 'topic-abc' },
      root: { id: 'root-abc' },
    } as never);

    await expect(
      publishTopicAction({ error: null }, formDataWith()),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(publishTopicMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: 'u-1',
        type: 'decision',
        title: '要不要裸辞去大理开民宿？',
        stance: '裸辞去大理开民宿，是实现自由生活的现实路径',
        tagNames: ['职业', '生活方式'],
        stakeEnabled: true,
        revealAt: expect.any(Date),
      }),
    );
    expect(redirectMock).toHaveBeenCalledWith('/topics/topic-abc');
  });

  it('关闭立帖为证时清空揭晓日期', async () => {
    authMock.mockResolvedValueOnce({ user: { id: 'u-1' } } as never);
    getUserByIdMock.mockResolvedValueOnce(completedUser());
    publishTopicMock.mockResolvedValueOnce({
      topic: { id: 'topic-def' },
      root: { id: 'root-def' },
    } as never);

    await expect(
      publishTopicAction(
        { error: null },
        formDataWith({ stakeEnabled: 'false', revealDate: '' }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(publishTopicMock).toHaveBeenCalledWith(
      expect.objectContaining({ stakeEnabled: false, revealAt: null }),
    );
  });
});
