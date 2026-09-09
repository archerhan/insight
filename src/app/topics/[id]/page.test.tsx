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
}));

import { getPublicTopicDetail } from '@/db/services/topics';
import { getArenaView } from '@/db/services/arena';
import { getCurrentUser } from '@/lib/auth/current-user';
import TopicPage from './page';

const getPublicTopicDetailMock = vi.mocked(getPublicTopicDetail);
const getArenaViewMock = vi.mocked(getArenaView);
const getCurrentUserMock = vi.mocked(getCurrentUser);

function topicFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'topic-1',
    type: 'decision',
    title: '要不要裸辞去大理开民宿？',
    body: '30 岁，存款约 40 万。',
    status: 'open',
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

beforeEach(() => {
  notFoundMock.mockClear();
  useSearchParamsMock.mockReturnValue(new URLSearchParams());
  getPublicTopicDetailMock.mockReset();
  getArenaViewMock.mockReset();
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

  it('已收敛话题默认结论书视图，仍展示根立场', async () => {
    getPublicTopicDetailMock.mockResolvedValueOnce(
      topicFixture({ status: 'converged' }) as never,
    );
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
    expect(screen.getByText('结论书视图将在 M4 接入')).toBeTruthy();
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
});
