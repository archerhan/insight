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

import { getCurrentUserOrRedirect } from '@/lib/auth/current-user';
import NewTopicPage from './page';

const guardMock = vi.mocked(getCurrentUserOrRedirect);

describe('发起话题占位页', () => {
  it('已通过须知时展示三步向导骨架', async () => {
    guardMock.mockResolvedValueOnce({
      id: 'u-1',
      displayName: '明',
      courseCompletedAt: new Date('2026-09-09T08:30:00Z'),
    } as never);
    const markup = renderToStaticMarkup(await NewTopicPage());
    expect(markup).toContain('发起话题');
    expect(markup).toContain('类型');
    expect(markup).toContain('主张与论据');
    expect(markup).toContain('规则与发布');
  });

  it('未完成须知时跳转须知页并带回跳地址', async () => {
    guardMock.mockResolvedValueOnce({
      id: 'u-2',
      displayName: '辩手',
      courseCompletedAt: null,
    } as never);
    await expect(NewTopicPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(redirectMock).toHaveBeenCalledWith('/guide?next=%2Ftopics%2Fnew');
  });
});
