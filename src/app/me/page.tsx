import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Clock3, Quote, RefreshCcw } from 'lucide-react';
import { getCurrentUserOrRedirect } from '@/lib/auth/current-user';
import { hasCompletedCourse } from '@/lib/domain/course';
import {
  getProfileCounts,
  getStanceTimeline,
} from '@/db/services/stance';

export const metadata: Metadata = {
  title: '我的战绩 · 灼见',
};

export default async function MePage() {
  const user = await getCurrentUserOrRedirect('/me');
  const completed = hasCompletedCourse(user);
  const [counts, timeline] = await Promise.all([
    getProfileCounts(user.id),
    getStanceTimeline(user.id),
  ]);

  return (
    <main className="mx-auto w-full max-w-[1120px] px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">我的战绩</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            立场时间线已随每次公开改换阵营留痕；押注等战绩随后续版本接入
          </p>
        </div>
        <span className="rounded-full bg-violet-bg px-3 py-1 text-xs font-medium text-violet">
          立场时间线
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
            { label: '被采纳论据', value: counts.adoptedCount },
            { label: '说服战绩', value: counts.persuasionCount },
            { label: '诚实更新', value: counts.honestyCount },
            { label: '裁定权重', value: '1' },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg bg-surface-2 px-4 py-3">
              <p className="text-lg font-medium tabular-nums">{stat.value}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-border bg-card p-5 sm:p-6" aria-label="立场时间线">
        <h2 className="flex items-center gap-1.5 text-[15px] font-medium">
          <RefreshCcw className="size-4 text-violet" aria-hidden="true" />
          立场时间线
          <span className="text-xs font-normal text-muted-foreground">
            每一次改变都有证词，可被公开查看
          </span>
        </h2>

        {timeline.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-border bg-surface-2/50 px-4 py-8 text-center">
            <Quote className="mx-auto size-6 text-muted-foreground/70" aria-hidden="true" />
            <p className="mt-2 text-[13.5px] font-medium">还没有公开的立场变更</p>
            <p className="mx-auto mt-1 max-w-md text-[12.5px] leading-5 text-muted-foreground">
              当你在某个话题上被说服并公开“我改主意了”后，这里会留下带证词的时间线——
              诚实是可展示的资产。
            </p>
          </div>
        ) : (
          <ol className="mt-4 flex flex-col gap-4">
            {timeline.map((entry) => (
              <li key={entry.topicId} className="relative border-l-2 border-violet/40 pl-4 sm:pl-5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Link
                    href={`/topics/${encodeURIComponent(entry.topicId)}?tab=conclusion`}
                    className="text-[13px] font-medium text-violet hover:underline"
                  >
                    {entry.topicTitle}
                  </Link>
                  <span className="text-[11.5px] text-muted-foreground">
                    {entry.createdAt.toLocaleDateString('zh-CN')}
                  </span>
                </div>
                <p className="mt-2 text-[14px] leading-6">
                  <span className="rounded bg-con-bg px-1.5 py-0.5 text-[13px] text-con">
                    {entry.fromStance}
                  </span>
                  <ArrowRight className="mx-1.5 inline size-3.5 text-muted-foreground" aria-hidden="true" />
                  <span className="rounded bg-pro-bg px-1.5 py-0.5 text-[13px] text-pro">
                    {entry.toStance}
                  </span>
                </p>
                <blockquote className="mt-2.5 rounded-lg border-l-[3px] border-violet bg-surface-2/60 px-3.5 py-2.5 text-[13px] leading-6 text-muted-foreground">
                  “{entry.statement}”
                </blockquote>
                <p className="mt-2 text-[11.5px] text-muted-foreground">
                  {entry.sourceClaimTitle ? (
                    <>
                      被「{entry.sourceClaimTitle}」（{entry.sourceAuthorName ?? '匿名'}）说服 ·
                      {entry.noveltyPass ? (
                        <span className="text-pro"> 诚实 +1</span>
                      ) : (
                        ' 该来源早于你的既有立场，不计战绩'
                      )}
                    </>
                  ) : (
                    '自主改主意（未引用说服来源）'
                  )}
                </p>
              </li>
            ))}
          </ol>
        )}
        {timeline.length > 0 && (
          <p className="mt-4 text-[12px] text-muted-foreground">
            加入灼见至今共 {timeline.length} 次公开立场更新，每次均附有证词。
          </p>
        )}
      </section>
    </main>
  );
}
