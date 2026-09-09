import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Clock3,
  Compass,
  FileText,
  Scale,
  Sparkles,
  Swords,
} from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getCurrentUser } from '@/lib/auth/current-user';
import { loginHref } from '@/lib/auth/url';
import { getPlazaSections, getUserPlazaSummary } from '@/db/services/plaza';
import type { PlazaConclusion, PlazaOpenTopic, PlazaReveal } from '@/db/services/plaza';
import { TOPIC_TYPE_LABELS } from '@/lib/domain/publish';

export const metadata: Metadata = {
  title: '广场 · 灼见',
  description: '围观正在发生的对线，阅读已经收敛的结论。',
};

/** 广场数据来自 PostgreSQL，不做静态预渲染。 */
export const dynamic = 'force-dynamic';

function daysAgoLabel(date: Date): string {
  const diff = Date.now() - date.getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days <= 0) return '刚刚';
  if (days === 1) return '昨天';
  if (days < 30) return `${days} 天前`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months} 个月前` : `${Math.floor(months / 12)} 年前`;
}

function daysUntilLabel(date: Date): string {
  const diff = date.getTime() - Date.now();
  const days = Math.ceil(diff / 86_400_000);
  return days > 0 ? `${days} 天后揭晓` : '今天揭晓';
}

function revealDateLabel(date: Date): string {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month} 月 ${day} 日`;
}

function TypeChip({ type }: { type: 'decision' | 'claim' }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-violet-bg px-2 py-0.5 text-[11.5px] font-medium text-violet">
      <Scale className="size-3" aria-hidden="true" />
      {TOPIC_TYPE_LABELS[type]}
    </span>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  hint,
  id,
}: {
  icon: typeof Swords;
  title: string;
  hint?: string;
  id?: string;
}) {
  return (
    <div className="mb-2.5 flex items-baseline gap-2">
      <h2 id={id} className="flex items-center gap-1.5 text-[15px] font-medium">
        <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
        {title}
      </h2>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/60 px-4 py-6 text-center text-[13px] leading-6 text-muted-foreground">
      {children}
    </div>
  );
}

function OpenTopicRow({ topic }: { topic: PlazaOpenTopic }) {
  return (
    <article className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/topics/${topic.id}`}
            className="text-[15px] font-medium leading-6 hover:text-primary hover:underline"
          >
            {topic.title}
          </Link>
          {topic.openChallengeCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-con-bg px-2 py-0.5 text-[11.5px] font-medium text-con">
              <Swords className="size-3" aria-hidden="true" />
              未决反驳 {topic.openChallengeCount}
            </span>
          )}
          {topic.stakeEnabled && topic.revealAt && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-bg px-2 py-0.5 text-[11.5px] font-medium text-amber">
              <Clock3 className="size-3" aria-hidden="true" />
              {daysUntilLabel(topic.revealAt)}
            </span>
          )}
        </div>
        {topic.rootStance && (
          <p className="mt-1.5 truncate text-[13px] text-muted-foreground">
            <span className="mr-1.5 text-muted-foreground/80">根立场</span>
            {topic.rootStance}
          </p>
        )}
        {topic.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {topic.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3 text-[12px] text-muted-foreground sm:flex-col sm:items-end sm:gap-1">
        <TypeChip type={topic.type} />
        <span className="tabular-nums">
          {topic.nodeCount} 论点 · {topic.participantCount} 人参与
        </span>
        <span>{daysAgoLabel(topic.lastActivityAt)}活跃</span>
      </div>
    </article>
  );
}

function ConclusionRow({ item }: { item: PlazaConclusion }) {
  return (
    <article className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/topics/${item.topicId}`}
          className="text-[15px] font-medium leading-6 hover:text-primary hover:underline"
        >
          {item.title}
        </Link>
        <span className="inline-flex items-center rounded-full bg-violet-bg px-2 py-0.5 text-[11.5px] font-medium text-violet">
          已收敛 · v{item.versionNo}
        </span>
      </div>
      <p className="mt-1.5 text-[13px] leading-6 text-muted-foreground">
        <span className="mr-1 font-medium text-violet">结论</span>
        {item.verdictText}
      </p>
      <p className="mt-2 text-[12px] text-muted-foreground">
        采纳 {item.adoptedCount} · {item.publishedAt ? daysAgoLabel(item.publishedAt) : '刚发布'}
      </p>
    </article>
  );
}

function RevealRow({ item }: { item: PlazaReveal }) {
  return (
    <article className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/topics/${item.id}`}
          className="text-[15px] font-medium leading-6 hover:text-primary hover:underline"
        >
          {item.title}
        </Link>
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-bg px-2 py-0.5 text-[11.5px] font-medium text-amber">
          <CalendarDays className="size-3" aria-hidden="true" />
          {daysUntilLabel(item.revealAt)}
        </span>
      </div>
      <p className="mt-1.5 text-[12.5px] text-muted-foreground">
        {revealDateLabel(item.revealAt)} 揭晓 · 楼主 {item.ownerName ?? '匿名'} ·{' '}
        {item.predictionCount > 0 ? `${item.predictionCount} 人立帖为证` : '等待围观者立帖为证'}
      </p>
    </article>
  );
}

export default async function Home() {
  const user = await getCurrentUser();
  const plazaData = await getPlazaSections();
  const summary = user ? await getUserPlazaSummary(user.id) : null;

  return (
    <main className="mx-auto w-full max-w-[1120px] px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            灼见 · 广场
          </p>
          <h1 className="mt-1 text-2xl font-medium tracking-tight">广场</h1>
          <p className="mt-1.5 text-[13.5px] text-muted-foreground">
            围观正在发生的对线，阅读已经收敛的结论
          </p>
        </div>
      </div>

      <div className="mt-7 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-8">
          <section aria-labelledby="open-topics-title">
            <SectionTitle
              id="open-topics-title"
              icon={Swords}
              title="正在对线"
              hint="按最近活跃排序"
            />
            {plazaData.openTopics.length > 0 ? (
              <div className="flex flex-col gap-2.5">
                {plazaData.openTopics.map((topic) => (
                  <OpenTopicRow key={topic.id} topic={topic} />
                ))}
              </div>
            ) : (
              <EmptyRow>还没有正在对线的话题，去发起第一个吧。</EmptyRow>
            )}
          </section>

          <section aria-labelledby="conclusions-title">
            <SectionTitle id="conclusions-title" icon={FileText} title="最新结论书" />
            {plazaData.conclusions.length > 0 ? (
              <div className="flex flex-col gap-2.5">
                {plazaData.conclusions.map((item) => (
                  <ConclusionRow key={item.topicId} item={item} />
                ))}
              </div>
            ) : (
              <EmptyRow>
                还没有已收敛的结论书。发起话题并让讨论接受反驳，收敛后结论书会出现在这里。
              </EmptyRow>
            )}
          </section>

          <section aria-labelledby="reveals-title">
            <SectionTitle id="reveals-title" icon={Clock3} title="立帖为证 · 即将揭晓" />
            {plazaData.upcomingReveals.length > 0 ? (
              <div className="flex flex-col gap-2.5">
                {plazaData.upcomingReveals.map((item) => (
                  <RevealRow key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <EmptyRow>还没有即将揭晓的立帖为证。发布时开启立帖为证即可参与现实检验。</EmptyRow>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <div className="rounded-xl border border-transparent bg-violet-bg p-5">
            <h2 className="text-[13.5px] font-medium text-foreground">发起一个新话题</h2>
            <p className="mt-1.5 text-[13px] leading-6 text-muted-foreground">
              你的真实纠结，或你想验证的观点——让陌生人为你认真吵一架。
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Link
                href="/topics/new?type=decision"
                className={cn(buttonVariants({ variant: 'default' }), 'h-9 bg-surface text-foreground hover:bg-surface-2')}
              >
                <Compass aria-hidden="true" />
                我在做选择，帮我权衡
              </Link>
              <Link
                href="/topics/new?type=claim"
                className={cn(buttonVariants({ variant: 'outline' }), 'h-9 bg-surface')}
              >
                <Scale aria-hidden="true" />
                我想验证一个观点
              </Link>
            </div>
            <p className="mt-3 text-[12px] leading-5 text-muted-foreground">
              可设置立帖为证与悬赏最佳反驳，发布前需通过《理性讨论须知》。
            </p>
          </div>

          {user ? (
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="text-[13.5px] font-medium">我的战绩速览</h2>
              <dl className="mt-3 divide-y divide-dashed divide-border">
                {[
                  { label: '我发布的话题', value: summary?.topicCount ?? 0 },
                  { label: '论据被采纳', value: summary?.adoptedCount ?? 0 },
                  { label: '公开改换阵营', value: summary?.honestyCount ?? 0 },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between py-2 text-[13px]"
                  >
                    <dt className="text-muted-foreground">{row.label}</dt>
                    <dd className="font-medium tabular-nums">{row.value}</dd>
                  </div>
                ))}
              </dl>
              <Link
                href="/me"
                className={cn(buttonVariants({ variant: 'ghost' }), 'mt-3 h-8 w-full')}
              >
                查看完整战绩
                <ArrowRight data-icon="inline-end" aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="flex items-center gap-1.5 text-[13.5px] font-medium">
                <Sparkles className="size-4 text-violet" aria-hidden="true" />
                登录后沉淀你的战绩
              </h2>
              <p className="mt-1.5 text-[13px] leading-6 text-muted-foreground">
                被采纳的论据、公开改换阵营与未来的判断力战绩，都会记录在你的个人页。
              </p>
              <Link
                href={loginHref('/')}
                className={cn(buttonVariants({ variant: 'default' }), 'mt-4 h-8 w-full')}
              >
                登录 / 注册
              </Link>
              <Link
                href="/guide"
                className="mt-2 inline-flex h-7 w-full items-center justify-center gap-1 text-[12.5px] text-muted-foreground hover:text-foreground"
              >
                <BookOpen className="size-3.5" aria-hidden="true" />
                先读《理性讨论须知》
              </Link>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
