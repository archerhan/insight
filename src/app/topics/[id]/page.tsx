import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Clock3, FileText, Scale, Swords, Users } from 'lucide-react';
import { TopicViewTabs } from '@/components/topic-view-tabs';
import { TopicArenaView } from '@/components/arena/topic-arena-view';
import { getArenaView } from '@/db/services/arena';
import { getPublicTopicDetail } from '@/db/services/topics';
import { getCurrentUser } from '@/lib/auth/current-user';
import { loginHref } from '@/lib/auth/url';
import { resolveTopicView } from '@/lib/navigation/topic-view';
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
  const query = await searchParams;
  const focusClaimId = firstParam(query.claim);
  const explicitTab = firstParam(query.tab);
  // 默认/对线深链：对线数据与话题详情、会话并行取，省去串行等待
  const wantArenaInParallel = explicitTab === undefined || explicitTab === 'arena';
  const [topic, user, arenaInParallel] = await Promise.all([
    getPublicTopicDetail(id),
    getCurrentUser(),
    wantArenaInParallel ? getArenaView(id, focusClaimId) : Promise.resolve(null),
  ]);
  if (!topic) notFound();

  const fallbackView = topic.status === 'open' ? 'arena' : 'conclusion';
  const view = resolveTopicView(query, fallbackView);

  const arenaData = view === 'arena' ? arenaInParallel : null;
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
        <TopicViewTabs defaultView={fallbackView} />
      </div>

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
          <PlaceholderCard title="结论书视图将在 M4 接入">
            当前话题未决反驳 {topic.openChallengeCount} 条，收敛后这里会呈现结论摘要、采纳理由与未决风险区。
          </PlaceholderCard>
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
