import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/auth/current-user', () => ({
  getCurrentUserOrRedirect: vi.fn(),
}));

vi.mock('@/db/services/notifications', () => ({
  listNotifications: vi.fn(),
  getUnreadNotificationCount: vi.fn(),
}));

vi.mock('./actions', () => ({
  markAllNotificationsReadAction: vi.fn(),
}));

import { getCurrentUserOrRedirect } from '@/lib/auth/current-user';
import {
  getUnreadNotificationCount,
  listNotifications,
} from '@/db/services/notifications';
import NotificationsPage from './page';

const guardMock = vi.mocked(getCurrentUserOrRedirect);
const listNotificationsMock = vi.mocked(listNotifications);
const getUnreadNotificationCountMock = vi.mocked(getUnreadNotificationCount);

describe('通知中心', () => {
  it('展示未读徽标与“全部标为已读”入口', async () => {
    guardMock.mockResolvedValueOnce({ id: 'u-1' } as never);
    listNotificationsMock.mockResolvedValueOnce([] as never);
    getUnreadNotificationCountMock.mockResolvedValueOnce(2);
    const markup = renderToStaticMarkup(await NotificationsPage());
    expect(markup).toContain('通知');
    expect(markup).toContain('全部标为已读（2）');
    expect(markup).toContain('暂时没有通知');
  });

  it('展示站内收件列表（挂红/回访/揭晓）并深链到话题', async () => {
    guardMock.mockResolvedValueOnce({ id: 'u-1' } as never);
    listNotificationsMock.mockResolvedValueOnce([
      {
        id: 'n-1',
        type: 'challenge_timer',
        title: '你的论点被反驳后已进入红色警示',
        body: '未回应反驳已满 7 天。',
        payload: { topicId: 'topic-1', claimId: 'claim-1' },
        readAt: null,
        createdAt: new Date('2026-09-09T00:00:00Z'),
      },
      {
        id: 'n-2',
        type: 'followup_due',
        title: 'T+30 回访提醒',
        body: '回访一下当初的决定。',
        payload: { topicId: 'topic-2' },
        readAt: new Date('2026-09-08T00:00:00Z'),
        createdAt: new Date('2026-09-08T00:00:00Z'),
      },
    ] as never);
    getUnreadNotificationCountMock.mockResolvedValueOnce(1);
    const markup = renderToStaticMarkup(await NotificationsPage());
    expect(markup).toContain('你的论点被反驳后已进入红色警示');
    expect(markup).toContain('挂红提醒');
    expect(markup).toContain('T+30 回访提醒');
    expect(markup).toContain('href="/topics/topic-1?tab=arena&amp;claim=claim-1"');
    expect(markup).toContain('href="/topics/topic-2?tab=conclusion"');
    expect(markup).toContain('全部标为已读（1）');
  });
});
