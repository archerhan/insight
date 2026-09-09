import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/auth/current-user', () => ({
  getCurrentUserOrRedirect: vi.fn(),
}));

import { getCurrentUserOrRedirect } from '@/lib/auth/current-user';
import MePage from './page';

const guardMock = vi.mocked(getCurrentUserOrRedirect);

describe('我的战绩占位页', () => {
  it('展示用户资料与须知完成状态', async () => {
    guardMock.mockResolvedValueOnce({
      id: 'u-1',
      displayName: '明',
      avatarUrl: null,
      bio: null,
      courseCompletedAt: new Date('2026-09-09T08:30:00Z'),
    } as never);
    const markup = renderToStaticMarkup(await MePage());
    expect(markup).toContain('我的战绩');
    expect(markup).toContain('明');
    expect(markup).toContain('已完成理性讨论须知');
  });

  it('未完成须知时给出引导链接', async () => {
    guardMock.mockResolvedValueOnce({
      id: 'u-2',
      displayName: '辩手',
      avatarUrl: null,
      bio: null,
      courseCompletedAt: null,
    } as never);
    const markup = renderToStaticMarkup(await MePage());
    expect(markup).toContain('未完成理性讨论须知');
    expect(markup).toContain('href="/guide"');
  });
});
