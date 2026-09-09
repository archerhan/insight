import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const redirectMock = vi.fn((...args: unknown[]) => {
  void args;
  throw new Error('NEXT_REDIRECT');
});

vi.mock('next/navigation', () => ({
  redirect: (...args: unknown[]) => redirectMock(...args),
}));

vi.mock('@/lib/auth/current-user', () => ({
  getCurrentUserOrRedirect: vi.fn(),
}));

vi.mock('./actions', () => ({
  publishTopicAction: vi.fn(async () => ({ error: null })),
}));

import { getCurrentUserOrRedirect } from '@/lib/auth/current-user';
import NewTopicPage from './page';

const guardMock = vi.mocked(getCurrentUserOrRedirect);

describe('发起话题页（M2 向导入口）', () => {
  it('已通过须知时渲染三步向导与类型选择', async () => {
    guardMock.mockResolvedValueOnce({
      id: 'u-1',
      displayName: '明',
      courseCompletedAt: new Date('2026-09-09T08:30:00Z'),
    } as never);
    const markup = renderToStaticMarkup(
      await NewTopicPage({ searchParams: Promise.resolve({}) }),
    );
    expect(markup).toContain('发起话题');
    expect(markup).toContain('我在做选择');
    expect(markup).toContain('我要验证一个观点');
    expect(markup).toContain('下一步');
    expect(markup).not.toContain('待开放');
  });

  it('未完成须知时跳转须知页并带回跳地址', async () => {
    guardMock.mockResolvedValueOnce({
      id: 'u-2',
      displayName: '辩手',
      courseCompletedAt: null,
    } as never);
    await expect(
      NewTopicPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith('/guide?next=%2Ftopics%2Fnew');
  });
});
