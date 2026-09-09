import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Quote,
  RefreshCcw,
  Scale,
  Swords,
  Target,
} from 'lucide-react';
import { ProfileTabs, type ProfileTabPanel } from '@/components/me/profile-tabs';
import { StatusChip } from '@/components/status-chip';
import { getCurrentUserOrRedirect } from '@/lib/auth/current-user';
import { hasCompletedCourse } from '@/lib/domain/course';
import {
  getMyPredictions,
  getMyTopics,
  type MyTopicRecord,
  type UserPredictionRecord,
} from '@/db/services/predictions';
import { getStanceTimeline, type StanceTimelineEntry } from '@/db/services/stance';
import { refreshUserStats } from '@/db/services/stats';
import {
  outcomeLabel,
  predictionChipMeta,
  realityResultLabel,
} from '@/lib/domain/predictions';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: '我的战绩 · 灼见',
};

function topicStatusChip(status: string) {
  if (status === 'converged') return { label: '已收敛', tone: 'violet' as const };
  if (status === 'risk_closed') return { label: '带险关闭', tone: 'amber' as const };
  return { label: '进行中', tone: 'amber' as const };
}

function StatCell({
  value,
  label,
  sub,
}: {
  value: string | number;
  label: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg bg-surface-2 px-4 py-3">
      <p className="text-lg font-medium tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground/80">{sub}</p>}
    </div>
  );
}

function EmptyBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface-2/50 px-4 py-8 text-center">
      <p className="text-[13px] leading-6 text-muted-foreground">{children}</p>
    </div>
  );
}

function TopicRow({ topic }: { topic: MyTopicRecord }) {
  const chip = topicStatusChip(topic.status);
  const meta = [
    topic.role,
    topic.role === '参与' ? `你写了 ${topic.ownClaimCount} 条论点` : null,
    topic.conclusionVersionNo ? `结论书 v${topic.conclusionVersionNo}` : null,
    topic.stakeEnabled && topic.revealAt && topic.status === 'open'
      ? `揭晓日 ${topic.revealAt.toLocaleDateString('zh-CN')}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg border-b border-border py-3 last:border-b-0 sm:px-1">
      <div className="min-w-0 flex-1">
        <Link
          href={`/topics/${encodeURIComponent(topic.topicId)}`}
          className="text-[13.5px] font-medium text-foreground hover:text-violet hover:underline"
        >
          {topic.title}
        </Link>
        <p className="mt-1 text-[12px] text-muted-foreground">{meta}</p>
      </div>
      <StatusChip label={chip.label} tone={chip.tone} />
    </li>
  );
}

function PredictionRow({
  record,
}: {
  record: UserPredictionRecord;
}) {
  const chip = predictionChipMeta(record.status, record.revealAt);
  return (
    <li className="flex flex-wrap items-start gap-3 rounded-lg border-b border-border py-3 last:border-b-0 sm:px-1">
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium leading-6">
          <Quote className="mr-1 inline size-3.5 text-muted-foreground" aria-hidden="true" />
          {record.statement}
        </p>
        <Link
          href={`/topics/${encodeURIComponent(record.topicId)}?tab=conclusion`}
          className="mt-1 inline-block text-[12px] text-violet hover:underline"
        >
          {record.topicTitle}
        </Link>
        <p className="mt-0.5 text-[11.5px] text-muted-foreground">
          {outcomeLabel(record.predictedOutcome)} · 登记于{' '}
          {record.createdAt.toLocaleDateString('zh-CN')}
          {record.status === 'open' && record.revealAt
            ? ` · 到期 ${record.revealAt.toLocaleDateString('zh-CN')}`
            : ''}
          {record.realityResult ? ` · 现实：${realityResultLabel(record.realityResult)}` : ''}
        </p>
      </div>
      <StatusChip label={chip.label} tone={chip.tone} />
    </li>
  );
}

function TimelineEntry({ entry }: { entry: StanceTimelineEntry }) {
  return (
    <li className="relative border-l-2 border-violet/40 pl-4 sm:pl-5">
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
  );
}

function timelinePanel(timeline: StanceTimelineEntry[]) {
  return (
    <section className="rounded-xl border border-border bg-card p-5 sm:p-6" aria-label="立场时间线">
      <h2 className="flex items-center gap-1.5 text-[15px] font-medium">
        <RefreshCcw className="size-4 text-violet" aria-hidden="true" />
        立场时间线
        <span className="text-xs font-normal text-muted-foreground">
          每一次改变都有证词，可被公开查看
        </span>
      </h2>
      {timeline.length === 0 ? (
        <div className="mt-4">
          <EmptyBox>
            还没有公开的立场变更。当你在某个话题上被说服并公开“我改主意了”后，
            这里会留下带证词的时间线——诚实是可展示的资产。
          </EmptyBox>
        </div>
      ) : (
        <>
          <ol className="mt-4 flex flex-col gap-4">
            {timeline.map((entry) => (
              <TimelineEntry key={entry.topicId} entry={entry} />
            ))}
          </ol>
          <p className="mt-4 text-[12px] text-muted-foreground">
            加入灼见至今共 {timeline.length} 次公开立场更新，每次均附有证词。
          </p>
        </>
      )}
    </section>
  );
}

function topicsPanel(myTopics: MyTopicRecord[]) {
  return myTopics.length === 0 ? (
    <EmptyBox>还没有相关话题。发起一个真实的纠结，或去广场围观别人的决定。</EmptyBox>
  ) : (
    <ul className="flex flex-col">
      {myTopics.map((topic) => (
        <TopicRow key={topic.topicId} topic={topic} />
      ))}
    </ul>
  );
}

function betsPanel(myPredictions: UserPredictionRecord[]) {
  return myPredictions.length === 0 ? (
    <EmptyBox>
      还没有立帖为证。去广场找一个开启立帖为证的个人决策话题，把判断押在时间上。
    </EmptyBox>
  ) : (
    <ul className="flex flex-col">
      {myPredictions.map((record) => (
        <PredictionRow key={record.id} record={record} />
      ))}
    </ul>
  );
}

export default async function MePage() {
  const user = await getCurrentUserOrRedirect('/me');
  const completed = hasCompletedCourse(user);
  const [stats, timeline, myTopics, myPredictions] = await Promise.all([
    refreshUserStats(user.id),
    getStanceTimeline(user.id),
    getMyTopics(user.id),
    getMyPredictions(user.id),
  ]);

  const panels: ProfileTabPanel[] = [
    { id: 'topics', label: '我的话题', content: topicsPanel(myTopics) },
    { id: 'bets', label: '我的押注', content: betsPanel(myPredictions) },
  ];

  const badges: Array<{ icon: string; name: string; detail: string; active: boolean }> = [
    {
      icon: '预',
      name: '早期预言家',
      detail:
        stats.predictionTotal > 0
          ? `押中 ${stats.predictionHit}/${stats.predictionTotal}`
          : '押注首中后解锁',
      active: stats.predictionHit > 0,
    },
    {
      icon: '诚',
      name: '敢于认错',
      detail: stats.honestyCount > 0 ? `公开立场变更 ×${stats.honestyCount}` : '公开认错后解锁',
      active: stats.honestyCount > 0,
    },
    {
      icon: '献',
      name: '观点贡献者',
      detail:
        stats.contributionCount > 0
          ? `被采纳 ×${stats.contributionCount}`
          : '论据进结论书后解锁',
      active: stats.contributionCount > 0,
    },
    {
      icon: '裁',
      name: '裁定权重',
      detail: `${stats.adjudicatorWeight} · 第二期陪审接入`,
      active: true,
    },
  ];

  return (
    <main className="mx-auto w-full max-w-[1120px] px-4 py-8 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">我的战绩</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            判断力、贡献与诚实分开记账；战绩不可购买，只能靠真实行为积累
          </p>
        </div>
        <span className="rounded-full bg-violet-bg px-3 py-1 text-xs font-medium text-violet">
          立场时间线 · 我的话题 · 我的押注
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
          <StatCell
            value={
              stats.predictionTotal > 0
                ? `${stats.predictionHit}/${stats.predictionTotal}`
                : '—'
            }
            label="判断力 · 押中"
            sub={
              stats.judgmentScore !== null
                ? `命中率 ${stats.judgmentScore}%`
                : '首条押注揭晓后计分'
            }
          />
          <StatCell value={stats.contributionCount} label="贡献 · 被采纳" sub={`说服 ×${stats.persuasionCount}`} />
          <StatCell value={stats.honestyCount} label="诚实 · 改换阵营" sub="附证词才算数" />
          <StatCell value={stats.adjudicatorWeight} label="裁定权重" sub="第二期陪审接入" />
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="flex min-w-0 flex-col gap-6">
          {timelinePanel(timeline)}
          <ProfileTabs panels={panels} />
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <section className="rounded-xl border border-border bg-card p-5" aria-label="徽章墙">
            <h2 className="flex items-center gap-1.5 text-[15px] font-medium">
              <Target className="size-4 text-violet" aria-hidden="true" />
              徽章墙
              <span className="text-xs font-normal text-muted-foreground">（战绩派生占位）</span>
            </h2>
            <ul className="mt-4 flex flex-col gap-2.5">
              {badges.map((badge) => (
                <li
                  key={badge.name}
                  className={cn(
                    'flex items-center gap-2.5 rounded-lg border px-3 py-2.5',
                    badge.active ? 'border-violet/30 bg-violet-bg/50' : 'border-border bg-surface-2/40',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-7 shrink-0 place-items-center rounded-md text-[13px] font-medium',
                      badge.active ? 'bg-violet-bg text-violet' : 'bg-surface-2 text-muted-foreground',
                    )}
                  >
                    {badge.icon}
                  </span>
                  <span className="min-w-0">
                    <span className={cn('block text-[13px] font-medium', !badge.active && 'text-muted-foreground')}>
                      {badge.name}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">{badge.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-border bg-card p-5" aria-label="战绩说明">
            <h2 className="flex items-center gap-1.5 text-[15px] font-medium">
              <Scale className="size-4 text-violet" aria-hidden="true" />
              战绩说明
            </h2>
            <ul className="mt-3 flex flex-col gap-2 text-[12px] leading-5 text-muted-foreground">
              <li className="flex gap-2">
                <Swords className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                判断力来自立帖为证的揭晓结果，命中率即校准分。
              </li>
              <li className="flex gap-2">
                <Quote className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                被采纳的论据计入贡献；说服他人改换阵营另有说服战绩。
              </li>
              <li className="flex gap-2">
                <RefreshCcw className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                只有引用新证据的公开改换阵营，才计诚实战绩。
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </main>
  );
}
