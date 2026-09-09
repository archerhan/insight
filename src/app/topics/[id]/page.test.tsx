import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const notFoundMock = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});
const usePathnameMock = vi.fn(() => '/topics/topic-1');
const useSearchParamsMock = vi.fn(() => new URLSearchParams());

vi.mock('next/navigation', () => ({
  notFound: () => notFoundMock(),
  usePathname: () => usePathnameMock(),
  useSearchParams: () => useSearchParamsMock(),
}));

vi.mock('@/db/services/topics', () => ({
  getPublicTopicDetail: vi.fn(),
}));

vi.mock('@/db/services/arena', () => ({
  getArenaView: vi.fn(),
}));

vi.mock('@/db/services/conclusion', () => ({
  getConclusionView: vi.fn(),
  getAdoptionDraftContext: vi.fn(),
}));

vi.mock('@/db/services/stance', () => ({
  listStanceSourceClaims: vi.fn(),
}));

vi.mock('@/db/services/predictions', () => ({
  getTopicPredictionContext: vi.fn(),
  getPendingFollowup: vi.fn(),
}));

vi.mock('@/lib/auth/current-user', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/app/topics/[id]/actions', () => ({
  postSupportAction: vi.fn(),
  postRebutalAction: vi.fn(),
  respondChallengeAction: vi.fn(),
  concedeChallengeAction: vi.fn(),
  reviseClaimAction: vi.fn(),
  rescueMigrateAction: vi.fn(),
  publishConclusionAction: vi.fn(),
  recordStanceChangeAction: vi.fn(),
  placePredictionAction: vi.fn(),
  respondFollowupAction: vi.fn(),
}));

import { getPublicTopicDetail } from '@/db/services/topics';
import { getArenaView } from '@/db/services/arena';
import {
  getAdoptionDraftContext,
  getConclusionView,
} from '@/db/services/conclusion';
import { listStanceSourceClaims } from '@/db/services/stance';
import { getPendingFollowup, getTopicPredictionContext } from '@/db/services/predictions';
import { getCurrentUser } from '@/lib/auth/current-user';
import TopicPage from './page';

const getPublicTopicDetailMock = vi.mocked(getPublicTopicDetail);
const getArenaViewMock = vi.mocked(getArenaView);
const getConclusionViewMock = vi.mocked(getConclusionView);
const getAdoptionDraftContextMock = vi.mocked(getAdoptionDraftContext);
const listStanceSourceClaimsMock = vi.mocked(listStanceSourceClaims);
const getTopicPredictionContextMock = vi.mocked(getTopicPredictionContext);
const getPendingFollowupMock = vi.mocked(getPendingFollowup);
const getCurrentUserMock = vi.mocked(getCurrentUser);

function topicFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'topic-1',
    type: 'decision',
    title: '要不要裸辞去大理开民宿？',
    body: '30 岁，存款约 40 万。',
    status: 'open',
    ownerId: 'u-owner',
    closeMode: 'owner',
    stakeEnabled: true,
    revealAt: new Date('2026-12-06T00:00:00Z'),
    bountyEnabled: false,
    allowPublicRebuttal: true,
    createdAt: new Date(),
    ownerName: '小明',
    ownerAvatarUrl: null,
    tags: ['职业'],
    rootClaims: [
      {
        id: 'claim-root',
        contentTitle: '裸辞去大理开民宿，是实现自由生活的现实路径',
        status: 'active',
        authorName: '小明',
      },
    ],
    nodeCount: 3,
    openChallengeCount: 1,
    ...overrides,
  };
}

function arenaFixture(overrides: Record<string, unknown> = {}) {
  const root = {
    id: 'claim-root',
    parentId: null,
    ancestors: [],
    relation: 'root',
    status: 'challenged',
    contentTitle: '裸辞去大理开民宿，是实现自由生活的现实路径',
    contentBody: null,
    authorId: 'u-owner',
    authorName: '小明',
    evidenceCount: 1,
    createdAt: new Date(),
    supersedesClaimId: null,
  };
  return {
    topicId: 'topic-1',
    topicTitle: '要不要裸辞去大理开民宿？',
    topicStatus: 'open',
    topicType: 'decision',
    topicOwnerId: 'u-owner',
    rootId: 'claim-root',
    breadcrumbs: [],
    focus: root,
    supports: [
      {
        id: 'claim-pro',
        parentId: 'claim-root',
        ancestors: ['claim-root'],
        relation: 'pro',
        status: 'active',
        contentTitle: '先租后买、分批投入，风险可控',
        contentBody: null,
        authorId: 'u-owner',
        authorName: '小明',
        evidenceCount: 0,
        createdAt: new Date(),
        supersedesClaimId: null,
      },
    ],
    rebuttals: [
      {
        id: 'claim-con',
        parentId: 'claim-root',
        ancestors: ['claim-root'],
        relation: 'con',
        status: 'active',
        contentTitle: '民宿牌照与消防拿证周期常超 6 个月',
        contentBody: null,
        authorId: 'u-rebutter',
        authorName: '阿哲',
        evidenceCount: 0,
        createdAt: new Date(),
        supersedesClaimId: null,
      },
    ],
    clarifications: [],
    focusChallenges: [
      {
        id: 'challenge-1',
        targetClaimId: 'claim-root',
        challengerClaimId: 'claim-con',
        challengerTitle: '民宿牌照与消防拿证周期常超 6 个月',
        challengerBody: null,
        challengerAuthorId: 'u-rebutter',
        challengerAuthorName: '阿哲',
        openedAt: new Date('2026-09-05T00:00:00Z'),
        defaultLossAt: new Date('2026-09-19T00:00:00Z'),
        phase: 'orange',
        openedDays: 4,
      },
    ],
    childChallengeCounts: { 'claim-pro': 0, 'claim-con': 0 },
    rescuableClaims: [],
    ...overrides,
  };
}

function conclusionFixture(overrides: Record<string, unknown> = {}) {
  return {
    topicId: 'topic-1',
    topicTitle: '要不要裸辞去大理开民宿？',
    topicBody: '30 岁，存款约 40 万。',
    topicType: 'decision',
    topicStatus: 'converged',
    closeMode: 'owner',
    ownerId: 'u-owner',
    ownerName: '小明',
    createdAt: new Date('2026-08-12T00:00:00Z'),
    closedAt: new Date('2026-09-09T00:00:00Z'),
    version: {
      id: 'version-1',
      versionNo: 1,
      status: 'published',
      verdictText: '不建议直接裸辞：先用年假完成实地验证，再决定是否投入。',
      recommendationText: '先用年假试住 3–4 周，完成牌照与成本调研。',
      premises: '存款可支撑 6 个月空窗。',
      settlement: 'provisional',
      summarySnapshot: null,
      publishedAt: new Date('2026-09-09T00:00:00Z'),
    },
    items: [
      {
        id: 'ci-1',
        position: 1,
        role: 'adopted_reason',
        claimId: 'claim-root',
        contentTitle: '先用年假试住验证，成本可控',
        claimStatus: 'merged',
        authorId: 'u-owner',
        authorName: '小明',
        note: null,
        supportChain: [
          {
            claimId: 'claim-pro',
            contentTitle: '民宿牌照周期可与在职阶段并行办理',
            authorId: 'u-rebutter',
            authorName: '阿哲',
            evidenceCount: 2,
          },
        ],
      },
    ],
    risks: [],
    nodeCount: 3,
    adoptedCount: 1,
    participantCount: 2,
    ...overrides,
  };
}

function adoptionCtxFixture(overrides: Record<string, unknown> = {}) {
  return {
    topicId: 'topic-1',
    topicTitle: '要不要裸辞去大理开民宿？',
    topicType: 'decision',
    topicStatus: 'open',
    closeMode: 'owner',
    ownerId: 'u-owner',
    roots: [
      {
        id: 'claim-root',
        contentTitle: '裸辞去大理开民宿，是实现自由生活的现实路径',
        authorId: 'u-owner',
        authorName: '小明',
        status: 'challenged',
        openChallengeCount: 1,
        createdAt: new Date('2026-08-12T00:00:00Z'),
      },
    ],
    openChallenges: [
      {
        id: 'challenge-1',
        targetClaimId: 'claim-root',
        challengerClaimId: 'claim-con',
        challengerTitle: '民宿牌照与消防拿证周期常超 6 个月',
        challengerBody: null,
        challengerAuthorId: 'u-rebutter',
        challengerAuthorName: '阿哲',
        openedAt: new Date('2026-09-05T00:00:00Z'),
        defaultLossAt: new Date('2026-09-19T00:00:00Z'),
        phase: 'orange',
        openedDays: 4,
        targetTitle: '裸辞去大理开民宿，是实现自由生活的现实路径',
        targetAuthorName: '小明',
      },
    ],
    ...overrides,
  };
}

function predictionCtxFixture(overrides: Record<string, unknown> = {}) {
  return {
    stakeEnabled: true,
    topicStatus: 'open',
    topicType: 'decision',
    topicOwnerId: 'u-owner',
    revealAt: new Date('2026-12-06T00:00:00Z'),
    openCount: 2,
    totalCount: 2,
    perTopicOpenCap: 20,
    perTopicTotalCap: 60,
    regretOpenCount: 1,
    noRegretOpenCount: 1,
    settled: false,
    realityResult: null,
    userPrediction: null,
    gateError: null,
    ...overrides,
  };
}

beforeEach(() => {
  notFoundMock.mockClear();
  useSearchParamsMock.mockReturnValue(new URLSearchParams());
  getPublicTopicDetailMock.mockReset();
  getArenaViewMock.mockReset();
  getConclusionViewMock.mockReset();
  getAdoptionDraftContextMock.mockReset();
  listStanceSourceClaimsMock.mockReset();
  listStanceSourceClaimsMock.mockResolvedValue([]);
  getTopicPredictionContextMock.mockReset();
  getTopicPredictionContextMock.mockResolvedValue(predictionCtxFixture() as never);
  getPendingFollowupMock.mockReset();
  getPendingFollowupMock.mockResolvedValue(null as never);
  getCurrentUserMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('议题页（M3：对线视图接入）', () => {
  it('进行中话题默认落在对线视图：焦点、支持/反驳两栏与未决红条', async () => {
    getPublicTopicDetailMock.mockResolvedValueOnce(topicFixture() as never);
    getArenaViewMock.mockResolvedValueOnce(arenaFixture() as never);
    getCurrentUserMock.mockResolvedValueOnce({
      id: 'u-owner',
      courseCompletedAt: new Date(),
    } as never);

    render(
      await TopicPage({
        params: Promise.resolve({ id: 'topic-1' }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(
      screen.getByRole('heading', { name: '要不要裸辞去大理开民宿？' }),
    ).toBeTruthy();
    expect(screen.getByRole('tab', { name: '对线' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('裸辞去大理开民宿，是实现自由生活的现实路径')).toBeTruthy();
    expect(screen.getByText('先租后买、分批投入，风险可控')).toBeTruthy();
    expect(screen.getAllByText('民宿牌照与消防拿证周期常超 6 个月').length).toBeGreaterThan(0);
    expect(screen.getByText(/已挂红 4 天/)).toBeTruthy();
    expect(screen.getByText('未决反驳 · 等待回应')).toBeTruthy();
  });

  it('深链 claim 参数会传给对线读取服务（焦点下钻）', async () => {
    getPublicTopicDetailMock.mockResolvedValueOnce(topicFixture() as never);
    getArenaViewMock.mockResolvedValueOnce(arenaFixture() as never);
    getCurrentUserMock.mockResolvedValueOnce(null as never);
    useSearchParamsMock.mockReturnValue(new URLSearchParams('tab=arena&claim=claim-con'));

    render(
      await TopicPage({
        params: Promise.resolve({ id: 'topic-1' }),
        searchParams: Promise.resolve({ tab: 'arena', claim: 'claim-con' }),
      }),
    );
    expect(getArenaViewMock).toHaveBeenCalledWith('topic-1', 'claim-con');
  });

  it('已收敛话题默认落结论书视图：摘要、采纳理由、支撑链与导出入口', async () => {
    getPublicTopicDetailMock.mockResolvedValueOnce(
      topicFixture({ status: 'converged' }) as never,
    );
    getConclusionViewMock.mockResolvedValueOnce(conclusionFixture() as never);
    getCurrentUserMock.mockResolvedValueOnce(null as never);

    render(
      await TopicPage({
        params: Promise.resolve({ id: 'topic-1' }),
        searchParams: Promise.resolve({}),
      }),
    );
    expect(
      screen.getByRole('tab', { name: '结论书' }).getAttribute('aria-selected'),
    ).toBe('true');
    expect(screen.getByText('已收敛')).toBeTruthy();
    expect(
      screen.getByText('不建议直接裸辞：先用年假完成实地验证，再决定是否投入。'),
    ).toBeTruthy();
    expect(screen.getByText('先用年假试住验证，成本可控')).toBeTruthy();
    expect(screen.getByText(/民宿牌照周期可与在职阶段并行办理/)).toBeTruthy();
    expect(screen.getByText('导出 Markdown').getAttribute('href')).toBe(
      '/topics/topic-1/conclusion.md',
    );
  });

  it('进行中的楼主在结论书 tab 看到出结论书向导，未决反驳逐条展示', async () => {
    getPublicTopicDetailMock.mockResolvedValueOnce(topicFixture() as never);
    getConclusionViewMock.mockResolvedValueOnce(null as never);
    getAdoptionDraftContextMock.mockResolvedValueOnce(adoptionCtxFixture() as never);
    getCurrentUserMock.mockResolvedValueOnce({
      id: 'u-owner',
      courseCompletedAt: new Date(),
    } as never);
    useSearchParamsMock.mockReturnValue(new URLSearchParams('tab=conclusion'));

    render(
      await TopicPage({
        params: Promise.resolve({ id: 'topic-1' }),
        searchParams: Promise.resolve({ tab: 'conclusion' }),
      }),
    );

    expect(screen.getByRole('heading', { name: '出结论书 v1' })).toBeTruthy();
    expect(screen.getByText('采纳进结论书的理由（1/1）')).toBeTruthy();
    expect(screen.getByText(/带险关闭：以下 1 条反驳仍未回应/)).toBeTruthy();
    expect(screen.getByText(/民宿牌照与消防拿证周期常超 6 个月/)).toBeTruthy();
    const publishButton = screen.getByRole('button', {
      name: '发布结论书',
    }) as HTMLButtonElement;
    expect(publishButton.disabled).toBe(true);
  });

  it('带险关闭结论书视图展示未决风险面板', async () => {
    getPublicTopicDetailMock.mockResolvedValueOnce(
      topicFixture({ status: 'risk_closed' }) as never,
    );
    getConclusionViewMock.mockResolvedValueOnce(
      conclusionFixture({
        topicStatus: 'risk_closed',
        version: {
          ...conclusionFixture().version,
          settlement: 'risk_closed',
        },
        risks: [
          {
            id: 'challenge-1',
            targetClaimId: 'claim-root',
            challengerClaimId: 'claim-con',
            challengerTitle: '民宿牌照与消防拿证周期常超 6 个月',
            challengerBody: null,
            challengerAuthorId: 'u-rebutter',
            challengerAuthorName: '阿哲',
            openedAt: new Date('2026-09-05T00:00:00Z'),
            defaultLossAt: new Date('2026-09-19T00:00:00Z'),
            phase: 'orange',
            openedDays: 4,
            targetTitle: '先用年假试住验证，成本可控',
            targetAuthorName: '小明',
          },
        ],
      }) as never,
    );
    getCurrentUserMock.mockResolvedValueOnce(null as never);

    render(
      await TopicPage({
        params: Promise.resolve({ id: 'topic-1' }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.getByText('带险关闭')).toBeTruthy();
    expect(screen.getByRole('heading', { name: /未决风险/ })).toBeTruthy();
    expect(screen.getByText(/已挂红 4 天/)).toBeTruthy();
  });

  it('找不到话题时返回 404', async () => {
    getPublicTopicDetailMock.mockResolvedValueOnce(null as never);
    await expect(
      TopicPage({
        params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000000' }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('开启立帖为证的话题展示登记面板，未登录给登录引导', async () => {
    getPublicTopicDetailMock.mockResolvedValueOnce(topicFixture() as never);
    getArenaViewMock.mockResolvedValueOnce(arenaFixture() as never);
    getCurrentUserMock.mockResolvedValueOnce(null as never);

    render(
      await TopicPage({
        params: Promise.resolve({ id: 'topic-1' }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.getByRole('heading', { name: '立帖为证' })).toBeTruthy();
    expect(screen.getByText(/2 人登记/)).toBeTruthy();
    expect(screen.getByRole('link', { name: '登录后立帖为证' })).toBeTruthy();
  });

  it('楼主看到 T+30 回访提示条（已到期可作答）', async () => {
    getPublicTopicDetailMock.mockResolvedValueOnce(
      topicFixture({ status: 'converged' }) as never,
    );
    getConclusionViewMock.mockResolvedValueOnce(conclusionFixture() as never);
    getCurrentUserMock.mockResolvedValueOnce({
      id: 'u-owner',
      courseCompletedAt: new Date(),
    } as never);
    getPendingFollowupMock.mockResolvedValueOnce({
      id: 'followup-1',
      topicId: 'topic-1',
      userId: 'u-owner',
      wave: 30,
      dueAt: new Date('2000-01-01T00:00:00Z'),
      respondedAt: null,
      regretLevel: null,
      status: 'pending',
    } as never);

    render(
      await TopicPage({
        params: Promise.resolve({ id: 'topic-1' }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.getByRole('heading', { name: /楼主回访 · T\+30/ })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /后悔了/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: '确认并揭晓押注' })).toBeTruthy();
  });
});
