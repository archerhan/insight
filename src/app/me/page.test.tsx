import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/auth/current-user', () => ({
  getCurrentUserOrRedirect: vi.fn(),
}));

vi.mock('@/db/services/stance', () => ({
  getStanceTimeline: vi.fn(),
}));

vi.mock('@/db/services/stats', () => ({
  refreshUserStats: vi.fn(),
}));

vi.mock('@/db/services/predictions', () => ({
  getMyTopics: vi.fn(),
  getMyPredictions: vi.fn(),
}));

import { getCurrentUserOrRedirect } from '@/lib/auth/current-user';
import { getStanceTimeline } from '@/db/services/stance';
import { refreshUserStats } from '@/db/services/stats';
import { getMyPredictions, getMyTopics } from '@/db/services/predictions';
import MePage from './page';

const guardMock = vi.mocked(getCurrentUserOrRedirect);
const getStanceTimelineMock = vi.mocked(getStanceTimeline);
const refreshUserStatsMock = vi.mocked(refreshUserStats);
const getMyTopicsMock = vi.mocked(getMyTopics);
const getMyPredictionsMock = vi.mocked(getMyPredictions);

function resetMocks() {
  guardMock.mockReset();
  getStanceTimelineMock.mockReset();
  refreshUserStatsMock.mockReset();
  getMyTopicsMock.mockReset();
  getMyPredictionsMock.mockReset();
}

function userFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u-1',
    displayName: '明',
    avatarUrl: null,
    bio: null,
    courseCompletedAt: new Date('2026-09-09T08:30:00Z'),
    ...overrides,
  } as never;
}

function statsFixture(overrides: Record<string, unknown> = {}) {
  return {
    judgmentScore: 66.67,
    predictionHit: 8,
    predictionTotal: 12,
    contributionCount: 7,
    persuasionCount: 2,
    honestyCount: 2,
    abandonCount: 0,
    adjudicatorWeight: 1,
    driftLevel: 'low',
    riskClosuresTotal: 0,
    updatedAt: new Date(),
    ...overrides,
  } as never;
}

describe('我的战绩页（M5：立场时间线 + 我的话题 + 我的押注 + 徽章占位）', () => {
  it('展示用户资料、战绩计数与空态', async () => {
    resetMocks();
    guardMock.mockResolvedValueOnce(userFixture());
    refreshUserStatsMock.mockResolvedValueOnce(statsFixture());
    getStanceTimelineMock.mockResolvedValueOnce([] as never);
    getMyTopicsMock.mockResolvedValueOnce([] as never);
    getMyPredictionsMock.mockResolvedValueOnce([] as never);

    const markup = renderToStaticMarkup(await MePage());
    expect(markup).toContain('我的战绩');
    expect(markup).toContain('明');
    expect(markup).toContain('已完成理性讨论须知');
    expect(markup).toContain('8/12');
    expect(markup).toContain('命中率 66.67%');
    expect(markup).toContain('贡献 · 被采纳');
    expect(markup).toContain('还没有公开的立场变更');
    expect(markup).toContain('还没有相关话题');
    expect(markup).toContain('早期预言家');
  });

  it('展示立场时间线、我的话题与我的押注记录', async () => {
    resetMocks();
    guardMock.mockResolvedValueOnce(userFixture());
    refreshUserStatsMock.mockResolvedValueOnce(statsFixture());
    getStanceTimelineMock.mockResolvedValueOnce([
      {
        topicId: 'topic-1',
        topicTitle: '要不要裸辞去大理开民宿？',
        topicStatus: 'converged',
        fromStance: '支持裸辞开民宿',
        toStance: '倾向先试住 3–4 周再决定',
        statement: '对方的试住方案击中我的盲区。',
        sourceClaimId: 'claim-1',
        sourceClaimTitle: '先用年假试住验证，成本可控',
        sourceAuthorId: 'u-2',
        sourceAuthorName: '老张',
        noveltyPass: true,
        createdAt: new Date('2026-08-30T00:00:00Z'),
      },
    ] as never);
    getMyTopicsMock.mockResolvedValueOnce([
      {
        topicId: 'topic-1',
        title: '要不要裸辞去大理开民宿？',
        type: 'decision',
        status: 'converged',
        role: '发起',
        stakeEnabled: true,
        revealAt: new Date('2026-12-01T00:00:00Z'),
        lastActivityAt: new Date('2026-09-09T00:00:00Z'),
        conclusionVersionNo: 1,
        ownClaimCount: 0,
      },
    ] as never);
    getMyPredictionsMock.mockResolvedValueOnce([
      {
        id: 'pred-1',
        topicId: 'topic-1',
        topicTitle: '要不要裸辞去大理开民宿？',
        topicStatus: 'converged',
        statement: '裸辞开民宿三个月内会后悔',
        predictedOutcome: 'regret',
        status: 'hit',
        revealAt: new Date('2026-12-01T00:00:00Z'),
        realityResult: 'regret',
        createdAt: new Date('2026-09-01T00:00:00Z'),
      },
    ] as never);

    const markup = renderToStaticMarkup(await MePage());
    expect(markup).toContain('支持裸辞开民宿');
    expect(markup).toContain('对方的试住方案击中我的盲区。');
    expect(markup).toContain('我的话题');
    expect(markup).toContain('我的押注');
    expect(markup).toContain('结论书 v1');
  });
});
