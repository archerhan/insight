import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/auth/current-user', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/db/services/plaza', () => ({
  getPlazaSections: vi.fn(),
  getUserPlazaSummary: vi.fn(),
}));

import { getCurrentUser } from '@/lib/auth/current-user';
import { getPlazaSections, getUserPlazaSummary } from '@/db/services/plaza';
import Home from './page';

const getCurrentUserMock = vi.mocked(getCurrentUser);
const getPlazaSectionsMock = vi.mocked(getPlazaSections);
const getUserPlazaSummaryMock = vi.mocked(getUserPlazaSummary);

function plazaData() {
  return {
    openTopics: [
      {
        id: 'topic-1',
        type: 'decision' as const,
        title: '要不要裸辞去大理开民宿？',
        body: null,
        stakeEnabled: true,
        revealAt: new Date(Date.now() + 55 * 86_400_000),
        lastActivityAt: new Date(),
        createdAt: new Date(),
        rootStance: '裸辞去大理开民宿，是实现自由生活的现实路径',
        rootAuthorName: '小明',
        tags: ['职业', '生活方式'],
        nodeCount: 12,
        openChallengeCount: 1,
        participantCount: 38,
      },
    ],
    conclusions: [
      {
        topicId: 'topic-2',
        type: 'decision' as const,
        title: '要不要回老家考编？',
        versionNo: 2,
        verdictText: '先看父母养老与职业空间再决定，不盲目跟风',
        settlement: 'provisional',
        publishedAt: new Date(Date.now() - 86_400_000),
        adoptedCount: 5,
      },
    ],
    upcomingReveals: [
      {
        id: 'topic-1',
        type: 'claim' as const,
        title: '「裸辞开民宿三个月内会后悔」',
        revealAt: new Date(Date.now() + 55 * 86_400_000),
        ownerName: '李四',
        predictionCount: 12,
      },
    ],
  };
}

describe('广场首页（M2）', () => {
  it('匿名访问：展示三大版块、空态与登录引导', async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    getPlazaSectionsMock.mockResolvedValueOnce({
      openTopics: [],
      conclusions: [],
      upcomingReveals: [],
    });

    render(await Home());
    expect(screen.getByRole('heading', { name: '广场' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /正在对线/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /最新结论书/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /立帖为证 · 即将揭晓/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: '登录 / 注册' })).toBeTruthy();
    expect(screen.queryByText('我的战绩速览')).toBeNull();
  });

  it('渲染正在对线 / 最新结论书 / 即将揭晓数据', async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    getPlazaSectionsMock.mockResolvedValueOnce(plazaData());

    render(await Home());
    expect(screen.getByRole('link', { name: '要不要裸辞去大理开民宿？' })).toBeTruthy();
    expect(screen.getByText('裸辞去大理开民宿，是实现自由生活的现实路径')).toBeTruthy();
    expect(screen.getByText('未决反驳 1')).toBeTruthy();
    expect(screen.getAllByText(/55 天后揭晓/).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: '要不要回老家考编？' })).toBeTruthy();
    expect(screen.getByText(/先看父母养老与职业空间/)).toBeTruthy();
    expect(screen.getByText('已收敛 · v2')).toBeTruthy();
    expect(screen.getByText(/李四/)).toBeTruthy();
  });

  it('已登录时展示战绩速览与到个人页入口', async () => {
    getCurrentUserMock.mockResolvedValueOnce({
      id: 'u-1',
      displayName: '明',
    } as never);
    getPlazaSectionsMock.mockResolvedValueOnce(plazaData());
    getUserPlazaSummaryMock.mockResolvedValueOnce({
      topicCount: 3,
      adoptedCount: 7,
      honestyCount: 2,
    });

    render(await Home());
    expect(screen.getByText('我的战绩速览')).toBeTruthy();
    expect(screen.getByText('我发布的话题')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByRole('link', { name: /查看完整战绩/ })).toBeTruthy();
  });
});
