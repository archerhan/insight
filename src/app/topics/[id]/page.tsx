import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Clock3, FileText, Scale, Swords, Users } from 'lucide-react';
import { TopicViewTabs } from '@/components/topic-view-tabs';
import { TopicArenaView } from '@/components/arena/topic-arena-view';
import { ConclusionContent } from '@/components/conclusion/conclusion-content';
import { ConclusionWizard } from '@/components/conclusion/conclusion-wizard';
import { StanceChangeWizard } from '@/components/conclusion/stance-change-wizard';
import { FollowupPrompt } from '@/components/predictions/followup-prompt';
import {
  PredictionPanel,
  type PredictionPanelProps,
  type PredictionUserRecord,
} from '@/components/predictions/prediction-panel';
import { getArenaView } from '@/db/services/arena';
import {
  getAdoptionDraftContext,
  getConclusionView,
} from '@/db/services/conclusion';
import {
  getPendingFollowup,
  getTopicPredictionContext,
  type TopicPredictionContext,
} from '@/db/services/predictions';
import { listStanceSourceClaims } from '@/db/services/stance';
import { getPublicTopicDetail, isTopicUuid } from '@/db/services/topics';
import { getCurrentUser } from '@/lib/auth/current-user';
import { loginHref } from '@/lib/auth/url';
import { resolveTopicView } from '@/lib/navigation/topic-view';
import {
  isPredictionOutcome,
  outcomeLabel,
  predictionChipMeta,
  realityResultLabel,
} from '@/lib/domain/predictions';
import { TOPIC_TYPE_LABELS } from '@/lib/domain/publish';

export const dynamic = 'force-dynamic';

interface TopicPageParams {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

function currentPath(topicId: string, focusClaimId?: string): string {
  const claim = focusClaimId ? `&claim=${encodeURIComponent(focusClaimId)}` : '';
  return `/topics/${encodeURIComponent(topicId)}?tab=arena${claim}`;
}

export async function generateMetadata({ params }: TopicPageParams): Promise<Metadata> {
  const { id } = await params;
  const topic = await getPublicTopicDetail(id);
  return {
    title: topic ? `${topic.title} · 灼见` : '话题 · 灼见',
  };
}

function StatusChip({ status }: { status: string }) {
  if (status === 'converged') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-violet-bg px-2.5 py-1 text-xs font-medium text-violet">
        已收敛
      </span>
    );
  }
  if (status === 'risk_closed') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-bg px-2.5 py-1 text-xs font-medium text-amber">
        带险关闭
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-bg px-2.5 py-1 text-xs font-medium text-amber">
      <Clock3 className="size-3.5" aria-hidden="true" />
      进行中
    </span>
  );
}

function StatItem({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Swords;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-lg font-medium tabular-nums">{value}</p>
      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
        <Icon className="size-3.5" aria-hidden="true" />
        {label}
      </p>
    </div>
  );
}

function predictionPanelProps(
  topicId: string,
  ctx: TopicPredictionContext,
  loginHref: string | null,
  now: Date = new Date(),
): PredictionPanelProps {
  const userRecord: PredictionUserRecord | null = ctx.userPrediction
    ? (() => {
        const outcome = isPredictionOutcome(ctx.userPrediction!.predictedOutcome)
          ? ctx.userPrediction!.predictedOutcome
          : 'no_regret';
        const chip = predictionChipMeta(ctx.userPrediction!.status, ctx.revealAt, now);
        return {
          statement: ctx.userPrediction!.statement,
          outcomeLabel: outcomeLabel(outcome),
          chipLabel: chip.label,
          chipTone: chip.tone,
          createdAtLabel: ctx.userPrediction!.createdAt.toLocaleDateString('zh-CN'),
        };
      })()
    : null;
  return {
    topicId,
    revealAt: ctx.revealAt?.toISOString() ?? null,
    openCount: ctx.openCount,
    openCap: ctx.perTopicOpenCap,
    regretOpenCount: ctx.regretOpenCount,
    noRegretOpenCount: ctx.noRegretOpenCount,
    settled: ctx.settled,
    realityResultLabel: ctx.realityResult ? realityResultLabel(ctx.realityResult) : null,
    userPrediction: userRecord,
    gateError: ctx.gateError,
    canRegister: loginHref === null && ctx.gateError === null && !ctx.settled,
    loginHref,
  };
}

function followupIsDue(dueAt: Date): boolean {
  return dueAt.getTime() <= Date.now();
}

function PlaceholderCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6 rounded-xl border border-dashed border-border bg-card/60 p-6 text-center">
      <h2 className="text-[15px] font-medium">{title}</h2>
      <p className="mx-auto mt-2 max-w-lg text-[13px] leading-6 text-muted-foreground">
        {children}
      </p>
    </section>
  );
}

export default async function TopicPage({ params, searchParams }: TopicPageParams) {
  const { id } = await params;
  if (!isTopicUuid(id)) notFound();
  const query = await searchParams;
  const focusClaimId = firstParam(query.claim);
  const explicitTab = firstParam(query.tab);
  // 默认视图取决于话题状态，未显式指定 tab 时并行取对线与结论书数据，
  // 显式指定时只取对应视图数据，省去串行等待。
  const wantArenaInParallel = explicitTab === undefined || explicitTab === 'arena';
  const wantConclusionInParallel = explicitTab === undefined || explicitTab === 'conclusion';
  const [topic, user, arenaInParallel] = await Promise.all([
    getPublicTopicDetail(id),
    getCurrentUser(),
    wantArenaInParallel ? getArenaView(id, focusClaimId) : Promise.resolve(null),
  ]);
  if (!topic) notFound();

  const fallbackView = topic.status === 'open' ? 'arena' : 'conclusion';
  const view = resolveTopicView(query, fallbackView);

  const arenaData = view === 'arena' ? arenaInParallel : null;
  const [conclusionData, adoptionCtx, predictionCtx, ownerFollowup] = await Promise.all([
    wantConclusionInParallel ? getConclusionView(id) : Promise.resolve(null),
    wantConclusionInParallel ? getAdoptionDraftContext(id) : Promise.resolve(null),
    topic.stakeEnabled ? getTopicPredictionContext(id, user?.id ?? null) : Promise.resolve(null),
    topic.status !== 'open' && user?.id === topic.ownerId
      ? getPendingFollowup(id, user.id)
      : Promise.resolve(null),
  ]);

  // 对线/结论书视图内为当前用户准备“我改主意了”的来源候选（仅登录用户）。
  let stanceSources: Array<{ id: string; contentTitle: string; authorName: string | null }> = [];
  let defaultFromStance = '';
  if (view !== 'map' && user?.id) {
    stanceSources = await listStanceSourceClaims(id, user.id);
    defaultFromStance =
      topic.rootClaims.at(-1)?.contentTitle ??
      arenaData?.focus?.contentTitle ??
      conclusionData?.items.at(-1)?.contentTitle ??
      '';
  }
  const topicPath = currentPath(id, focusClaimId);

  return (
    <main className="mx-auto w-full max-w-[1120px] px-4 py-8 sm:px-6 sm:py-10">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        回到广场
      </Link>

      <div className="mt-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status={topic.status} />
          <span className="inline-flex items-center gap-1 rounded-full bg-violet-bg px-2.5 py-1 text-xs font-medium text-violet">
            <Scale className="size-3.5" aria-hidden="true" />
            {TOPIC_TYPE_LABELS[topic.type]}
          </span>
          {topic.stakeEnabled && topic.revealAt && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-bg px-2.5 py-1 text-xs font-medium text-amber">
              <Clock3 className="size-3.5" aria-hidden="true" />
              {topic.revealAt.toLocaleDateString('zh-CN')} 揭晓
            </span>
          )}
        </div>
        <h1 className="mt-3 text-2xl font-medium leading-9 tracking-tight">{topic.title}</h1>
        {topic.body && (
          <p className="mt-2.5 max-w-3xl text-[14px] leading-7 text-muted-foreground">
            {topic.body}
          </p>
        )}
        <p className="mt-2 text-[12.5px] text-muted-foreground">
          楼主 {topic.ownerName ?? '匿名'}
          {topic.tags.length > 0 && ` · ${topic.tags.map((tag) => `#${tag}`).join(' ')}`}
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="grid flex-1 grid-cols-2 gap-3 sm:max-w-xl sm:grid-cols-4">
          <StatItem icon={Swords} label="论点" value={topic.nodeCount} />
          <StatItem icon={Users} label="未决反驳" value={topic.openChallengeCount} />
          <StatItem icon={Users} label="公开反驳" value={topic.allowPublicRebuttal ? '公开' : '受邀'} />
          <StatItem icon={FileText} label="立帖为证" value={topic.stakeEnabled ? '已开启' : '未开启'} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <TopicViewTabs defaultView={fallbackView} />
          {user?.id && view !== 'map' && (
            <StanceChangeWizard
              topicId={topic.id}
              tab={view}
              defaultFrom={defaultFromStance}
              sources={stanceSources}
            />
          )}
        </div>
      </div>

      {predictionCtx && (
        <PredictionPanel
          {...predictionPanelProps(
            topic.id,
            predictionCtx,
            user ? null : loginHref(`/topics/${encodeURIComponent(topic.id)}`),
          )}
        />
      )}

      {ownerFollowup && (
        <FollowupPrompt
          topicId={ownerFollowup.topicId}
          wave={ownerFollowup.wave}
          dueAt={ownerFollowup.dueAt.toISOString()}
          overdue={followupIsDue(ownerFollowup.dueAt)}
        />
      )}

      {view === 'arena' && arenaData && (
        <div className="mt-6">
          <TopicArenaView
            data={arenaData}
            currentUserId={user?.id ?? null}
            courseCompletedAt={user?.courseCompletedAt ?? null}
            loginHref={loginHref(topicPath)}
            guideHref={`/guide?next=${encodeURIComponent(topicPath)}`}
          />
        </div>
      )}

      {view === 'arena' && !arenaData && (
        <PlaceholderCard title="对线视图暂不可用">
          该话题可能已不对外公开，回到广场看看其它正在对线的话题。
        </PlaceholderCard>
      )}

      {view === 'conclusion' && (
        <>
          {topic.rootClaims.length > 0 && (
            <section className="mt-6 rounded-xl border border-border bg-card p-5" aria-label="根立场">
              <h2 className="text-[13.5px] font-medium text-muted-foreground">楼主的根立场</h2>
              <ul className="mt-3 flex flex-col gap-2.5">
                {topic.rootClaims.map((claim) => (
                  <li key={claim.id} className="rounded-lg border-l-[3px] border-violet bg-surface-2/70 px-4 py-3">
                    <p className="text-[14.5px] font-medium leading-6">{claim.contentTitle}</p>
                    <p className="mt-1 text-[12px] text-muted-foreground">
                      作者 {claim.authorName ?? '匿名'} · 状态 {claim.status}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {topic.status === 'open' && user?.id === topic.ownerId && topic.closeMode === 'owner' && (
            <ConclusionWizard
              topicId={topic.id}
              roots={adoptionCtx?.roots ?? []}
              openChallenges={adoptionCtx?.openChallenges ?? []}
            />
          )}
          {topic.status === 'open' && (user?.id !== topic.ownerId || topic.closeMode !== 'owner') && (
            <PlaceholderCard title="结论书尚未发布">
              {topic.closeMode === 'owner'
                ? `楼主还在整理采纳条目与结论。当前未决反驳 ${topic.openChallengeCount} 条，等楼主收敛后这里会呈现结论摘要、采纳理由与未决风险区。`
                : '公共议题的收敛由社区机制触发（后续版本支持），楼主没有单独关闭权。'}
            </PlaceholderCard>
          )}
          {topic.status !== 'open' &&
            (conclusionData ? (
              <ConclusionContent
                data={conclusionData}
              />
            ) : (
              <PlaceholderCard title="结论书暂不可用">
                该话题尚未发布可导出的结论书版本，请稍后再来。
              </PlaceholderCard>
            ))}
        </>
      )}

      {view === 'map' && (
        <PlaceholderCard title="论证地图视图规划中">
          对线过程会沉淀可回放的论点时间轴；论证地图（局部邻域 + 时间轴）将在后续版本开放。
        </PlaceholderCard>
      )}
    </main>
  );
}
