import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/auth/current-user', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('./actions', () => ({
  completeCourse: vi.fn(),
}));

import { getCurrentUser } from '@/lib/auth/current-user';
import GuidePage from './page';

const getCurrentUserMock = vi.mocked(getCurrentUser);
const baseUser = {
  id: 'u-1',
  displayName: '明',
  avatarUrl: null,
  courseCompletedAt: null,
};

describe('理性讨论须知页', () => {
  it('未登录时引导登录并保留回跳地址', async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    const markup = renderToStaticMarkup(
      await GuidePage({
        searchParams: Promise.resolve({ next: '/topics/new' }),
      }),
    );
    expect(markup).toContain('使用 GitHub 登录并继续');
    expect(markup).toContain('/login?callbackUrl=%2Fguide%3Fnext%3D%252Ftopics%252Fnew');
  });

  it('已登录未完成时展示六条规则与完成按钮', async () => {
    getCurrentUserMock.mockResolvedValueOnce(baseUser as never);
    const markup = renderToStaticMarkup(
      await GuidePage({
        searchParams: Promise.resolve({ next: '/topics/new' }),
      }),
    );
    expect(markup).toContain('对论点，不对人');
    expect(markup).toContain('反驳前先复述');
    expect(markup).toContain('我已读完并理解');
    expect(markup).toContain('name="next" value="/topics/new"');
  });

  it('已完成后展示通过时间与发起入口', async () => {
    getCurrentUserMock.mockResolvedValueOnce({
      ...baseUser,
      courseCompletedAt: new Date('2026-09-09T08:30:00Z'),
    } as never);
    const markup = renderToStaticMarkup(
      await GuidePage({ searchParams: Promise.resolve({}) }),
    );
    expect(markup).toContain('你已于');
    expect(markup).toContain('去发起话题');
  });
});
