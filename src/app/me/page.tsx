import type { Metadata } from 'next';
import Link from 'next/link';
import { CheckCircle2, Clock3, Landmark } from 'lucide-react';
import { getCurrentUserOrRedirect } from '@/lib/auth/current-user';
import { hasCompletedCourse } from '@/lib/domain/course';

export const metadata: Metadata = {
  title: '我的战绩 · 灼见',
};

export default async function MePage() {
  const user = await getCurrentUserOrRedirect('/me');
  const completed = hasCompletedCourse(user);

  return (
    <main className="mx-auto w-full max-w-[1120px] px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">我的战绩</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            立场时间线、我的话题与押注战绩会在 M5 落地
          </p>
        </div>
        <span className="rounded-full bg-violet-bg px-3 py-1 text-xs font-medium text-violet">
          M5 建设中
        </span>
      </div>

      <section className="mt-6 rounded-xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center gap-4">
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.avatarUrl}
              alt=""
              className="size-14 rounded-full border border-border"
            />
          ) : (
            <span
              aria-hidden="true"
              className="grid size-14 place-items-center rounded-full bg-violet-bg text-xl font-medium text-violet"
            >
              {user.displayName.slice(0, 1)}
            </span>
          )}
          <div className="min-w-0">
            <p className="text-lg font-medium">{user.displayName}</p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {user.bio?.trim() ? user.bio : '还没有自我介绍'}
            </p>
          </div>
          <div className="ml-auto">
            {completed ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-pro-bg px-3 py-1 text-xs font-medium text-pro">
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
                已完成理性讨论须知
              </span>
            ) : (
              <Link
                href="/guide"
                className="inline-flex items-center gap-1.5 rounded-full bg-amber-bg px-3 py-1 text-xs font-medium text-amber hover:underline"
              >
                <Clock3 className="size-3.5" aria-hidden="true" />
                未完成理性讨论须知
              </Link>
            )}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: '被采纳论据', value: '—' },
            { label: '说服战绩', value: '—' },
            { label: '诚实更新', value: '—' },
            { label: '裁定权重', value: '1' },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg bg-surface-2 px-4 py-3">
              <p className="text-lg font-medium tabular-nums">{stat.value}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-dashed border-border bg-surface-2/60 p-6 text-center">
        <Landmark className="mx-auto size-7 text-muted-foreground" aria-hidden="true" />
        <p className="mt-2 text-sm font-medium">立场时间线将在这里展开</p>
        <p className="mx-auto mt-1 max-w-md text-[13px] leading-6 text-muted-foreground">
          当你被说服并公开改换立场、附上证词后，这条记录会成为你“判断力”战绩的一部分
          ——诚实在这里是可展示的资产。
        </p>
      </section>
    </main>
  );
}
