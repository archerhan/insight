import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/auth/current-user', () => ({
  getCurrentUserOrRedirect: vi.fn(),
}));

vi.mock('@/db/services/stance', () => ({
  getProfileCounts: vi.fn(),
  getStanceTimeline: vi.fn(),
}));

import { getCurrentUserOrRedirect } from '@/lib/auth/current-user';
import {
  getProfileCounts,
  getStanceTimeline,
} from '@/db/services/stance';
import MePage from './page';

const guardMock = vi.mocked(getCurrentUserOrRedirect);
const getProfileCountsMock = vi.mocked(getProfileCounts);
const getStanceTimelineMock = vi.mocked(getStanceTimeline);

function resetMocks() {
  guardMock.mockReset();
  getProfileCountsMock.mockReset();
  getStanceTimelineMock.mockReset();
}

describe('我的战绩页（M4：立场时间线）', () => {
  it('展示用户资料与须知完成状态', async () => {
    resetMocks();
    getProfileCountsMock.mockResolvedValueOnce({
      adoptedCount: 7,
      persuasionCount: 2,
      honestyCount: 2,
    } as never);
    getStanceTimelineMock.mockResolvedValueOnce([] as never);
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
    expect(markup).toContain('还没有公开的立场变更');
  });

  it('未完成须知时给出引导链接', async () => {
    resetMocks();
    getProfileCountsMock.mockResolvedValueOnce({
      adoptedCount: 0,
      persuasionCount: 0,
      honestyCount: 0,
    } as never);
    getStanceTimelineMock.mockResolvedValueOnce([] as never);
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

  it('展示带证词的立场时间线与战绩计数', async () => {
    resetMocks();
    getProfileCountsMock.mockResolvedValueOnce({
      adoptedCount: 7,
      persuasionCount: 2,
      honestyCount: 2,
    } as never);
    getStanceTimelineMock.mockResolvedValueOnce([
      {
        topicId: 'topic-1',
        topicTitle: '要不要裸辞去大理开民宿？',
        topicStatus: 'converged',
        fromStance: '支持裸辞开民宿',
        toStance: '倾向先试住 3–4 周再决定',
        statement: '对方的试住方案击中我的盲区：先验证再辞职更稳。',
        sourceClaimId: 'claim-1',
        sourceClaimTitle: '先用年假试住验证，成本可控',
        sourceAuthorId: 'u-2',
        sourceAuthorName: '老张',
        noveltyPass: true,
        createdAt: new Date('2026-08-30T00:00:00Z'),
      },
    ] as never);
    guardMock.mockResolvedValueOnce({
      id: 'u-1',
      displayName: '明',
      avatarUrl: null,
      bio: null,
      courseCompletedAt: new Date('2026-09-09T08:30:00Z'),
    } as never);

    const markup = renderToStaticMarkup(await MePage());
    expect(markup).toContain('支持裸辞开民宿');
    expect(markup).toContain('倾向先试住 3–4 周再决定');
    expect(markup).toContain('对方的试住方案击中我的盲区：先验证再辞职更稳。');
    expect(markup).toContain('先用年假试住验证，成本可控');
    expect(markup).toContain('诚实 +1');
    expect(markup).toContain('href="/topics/topic-1?tab=conclusion"');
  });
});
