import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Bell, CheckCheck, Inbox } from 'lucide-react';
import { markAllNotificationsReadAction } from './actions';
import { getCurrentUserOrRedirect } from '@/lib/auth/current-user';
import { getUnreadNotificationCount, listNotifications } from '@/db/services/notifications';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: '通知 · 灼见',
};

function typeLabel(type: string): string {
  switch (type) {
    case 'challenge_timer':
      return '挂红提醒';
    case 'followup_due':
      return '回访提醒';
    case 'reveal_reminder':
      return '揭晓提醒';
    case 'reveal_result':
      return '揭晓结果';
    default:
      return '站内通知';
  }
}

function topicHref(payload: Record<string, unknown> | null, type: string): string | null {
  const topicId = typeof payload?.topicId === 'string' ? payload.topicId : null;
  if (!topicId) return null;
  const tab =
    type === 'reveal_result' || type === 'followup_due' || type === 'reveal_reminder'
      ? 'conclusion'
      : 'arena';
  const claimId = typeof payload?.claimId === 'string' ? payload.claimId : null;
  return `/topics/${encodeURIComponent(topicId)}?tab=${tab}${claimId ? `&claim=${encodeURIComponent(claimId)}` : ''}`;
}

export default async function NotificationsPage() {
  const user = await getCurrentUserOrRedirect('/notifications');
  const [items, unreadCount] = await Promise.all([
    listNotifications(user.id),
    getUnreadNotificationCount(user.id),
  ]);

  return (
    <main className="mx-auto w-full max-w-[820px] px-4 py-8 sm:px-6 sm:py-10">
      <Link
        href="/me"
        className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        返回我的战绩
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-medium tracking-tight">
            <Bell className="size-5 text-violet" aria-hidden="true" />
            通知
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            挂红计时、回访与揭晓结果都会在这里提醒你
          </p>
        </div>
        {unreadCount > 0 && (
          <form action={markAllNotificationsReadAction}>
            <Button variant="outline" size="sm" type="submit">
              <CheckCheck aria-hidden="true" />
              全部标为已读（{unreadCount}）
            </Button>
          </form>
        )}
      </div>

      <section className="mt-6 overflow-hidden rounded-xl border border-border bg-card" aria-label="通知列表">
        {items.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <Inbox className="mx-auto size-7 text-muted-foreground/70" aria-hidden="true" />
            <p className="mt-3 text-[13.5px] font-medium">暂时没有通知</p>
            <p className="mx-auto mt-1 max-w-sm text-[12.5px] leading-5 text-muted-foreground">
              当你被反驳的论点进入挂红阶段、结论书需要回访、或你立的帖揭晓时，会出现在这里。
            </p>
          </div>
        ) : (
          <ul className="flex flex-col">
            {items.map((item) => {
              const href = topicHref(item.payload, item.type);
              const body = (
                <>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[13.5px] font-medium text-foreground">{item.title}</span>
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted-foreground">
                      {typeLabel(item.type)}
                    </span>
                    {!item.readAt && (
                      <span className="size-2 rounded-full bg-violet" aria-label="未读" />
                    )}
                  </div>
                  <p className="mt-1 text-[12.5px] leading-5 text-muted-foreground">{item.body}</p>
                  <p className="mt-1.5 text-[11px] text-muted-foreground/80">
                    {item.createdAt.toLocaleString('zh-CN')}
                  </p>
                </>
              );
              return (
                <li
                  key={item.id}
                  className={
                    item.readAt
                      ? 'border-b border-border px-5 py-4 last:border-b-0'
                      : 'border-b border-border bg-violet-bg/40 px-5 py-4 last:border-b-0'
                  }
                >
                  {href ? (
                    <Link href={href} className="block hover:opacity-90">
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
