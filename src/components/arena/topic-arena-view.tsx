import Link from 'next/link';
import { ChevronRight, FileText, MessageSquareWarning, Scale, Swords } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ArenaClaimNode, ArenaView } from '@/db/services/arena';
import {
  CHALLENGE_PHASE_LABELS,
  childSide,
  CLAIM_STATUS_META,
  openChallengeTimerText,
  RELATION_LABELS,
} from '@/lib/domain/arena';
import type { ClaimRelation } from '@/lib/domain/states';
import { ArenaComposer } from './arena-composer';
import { ChallengeResponsePanel } from './challenge-response-panel';
import { RescueMigrateForms } from './rescue-migrate-forms';
import { ReviseClaimForm } from './revise-claim-form';

/**
 * 对线视图（服务端渲染）：焦点下钻 + 面包屑 + 支持/反驳两栏 + 未决红条 + 输入条。
 * 交互（回应/承认/修订/抢救/输入）由轻量客户端组件负责，写操作经 Server Actions。
 */

const toneClasses: Record<string, string> = {
  default: '',
  amber: 'bg-amber-bg text-amber',
  violet: 'bg-violet-bg text-violet',
  gray: 'bg-surface-2 text-muted-foreground',
};

function relationChipClass(relation: ClaimRelation): string {
  if (relation === 'root') return 'bg-violet-bg text-violet';
  if (relation === 'con' || relation === 'question') return 'bg-con-bg text-con';
  return 'bg-pro-bg text-pro';
}

function claimHref(topicId: string, claimId: string): string {
  return `/topics/${encodeURIComponent(topicId)}?tab=arena&claim=${encodeURIComponent(claimId)}`;
}

function StatusChip({ status }: { status: string }) {
  const meta = CLAIM_STATUS_META[status as keyof typeof CLAIM_STATUS_META];
  if (!meta || meta.tone === 'default') return null;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11.5px] font-medium',
        toneClasses[meta.tone],
      )}
    >
      {meta.label}
    </span>
  );
}

function MiniStatus({ status, challengeCount }: { status: string; challengeCount: number }) {
  if (challengeCount > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-bg px-1.5 py-0.5 text-[11px] font-medium text-amber">
        <Swords className="size-3" aria-hidden="true" />
        未决反驳 {challengeCount}
      </span>
    );
  }
  const meta = CLAIM_STATUS_META[status as keyof typeof CLAIM_STATUS_META];
  if (!meta || meta.tone === 'default') return null;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium',
        toneClasses[meta.tone],
      )}
    >
      {meta.label}
    </span>
  );
}

function ClaimCard({
  topicId,
  claim,
  challengeCount,
}: {
  topicId: string;
  claim: ArenaClaimNode;
  challengeCount: number;
}) {
  const side = childSide(claim.relation);
  return (
    <Link
      href={claimHref(topicId, claim.id)}
      className={cn(
        'block rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-surface-2/50',
        side === 'pro' && 'border-l-[3px] border-l-pro',
        side === 'con' && 'border-l-[3px] border-l-con',
      )}
    >
      <span className="flex items-start gap-2">
        <span className="min-w-0 flex-1 text-[13.5px] leading-6 text-foreground">
          {claim.contentTitle}
        </span>
        <ChevronRight
          className="mt-1 size-4 shrink-0 text-muted-foreground/60"
          aria-hidden="true"
        />
      </span>
      <span className="mt-1.5 flex flex-wrap items-center gap-2 text-[11.5px] text-muted-foreground">
        <span className="truncate">{claim.authorName ?? '匿名'}</span>
        {claim.evidenceCount > 0 && (
          <span className="inline-flex items-center gap-0.5">
            <FileText className="size-3" aria-hidden="true" />
            论据 {claim.evidenceCount}
          </span>
        )}
        <MiniStatus status={claim.status} challengeCount={challengeCount} />
      </span>
    </Link>
  );
}

function EmptyColumn({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card/50 px-4 py-6 text-center text-[12.5px] text-muted-foreground">
      {children}
    </div>
  );
}

export interface TopicArenaViewProps {
  data: ArenaView;
  currentUserId: string | null;
  courseCompletedAt: Date | null;
  loginHref: string;
  guideHref: string;
}

export function TopicArenaView({
  data,
  currentUserId,
  courseCompletedAt,
  loginHref,
  guideHref,
}: TopicArenaViewProps) {
  const focus = data.focus;
  if (!focus) {
    return (
      <EmptyColumn>这个话题还没有可展示的论点，等待楼主发布首条立场。</EmptyColumn>
    );
  }

  const canPost = Boolean(currentUserId && courseCompletedAt);
  const focusOwnedByViewer = currentUserId !== null && currentUserId === focus.authorId;
  const rescuableOwned = data.rescuableClaims.filter(
    (claim) => claim.authorId === currentUserId,
  );

  return (
    <div className="min-w-0">
      <nav aria-label="论证路径" className="flex flex-wrap items-center gap-1 text-[12.5px]">
        <Link
          href={`/topics/${encodeURIComponent(data.topicId)}?tab=arena`}
          className="rounded px-1 py-0.5 text-muted-foreground hover:text-foreground"
        >
          {data.topicTitle}
        </Link>
        {data.breadcrumbs.map((claim) => (
          <span key={claim.id} className="flex items-center gap-1">
            <ChevronRight className="size-3 text-muted-foreground/50" aria-hidden="true" />
            <Link
              href={claimHref(data.topicId, claim.id)}
              className="max-w-44 truncate rounded px-1 py-0.5 text-muted-foreground hover:text-foreground"
            >
              {claim.contentTitle}
            </Link>
          </span>
        ))}
      </nav>

      <section
        className="mt-3 rounded-xl border border-border bg-card p-4 sm:p-5"
        aria-label="焦点论点"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center rounded-md px-2 py-0.5 text-[11.5px] font-medium',
              relationChipClass(focus.relation),
            )}
          >
            {RELATION_LABELS[focus.relation]}
          </span>
          <StatusChip status={focus.status} />
          {data.focusChallenges.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-con-bg px-2 py-0.5 text-[11.5px] font-medium text-con">
              <Swords className="size-3" aria-hidden="true" />
              未决反驳 {data.focusChallenges.length}
            </span>
          )}
        </div>
        <h2 className="mt-3 text-[17px] font-medium leading-7 tracking-tight">
          {focus.contentTitle}
        </h2>
        {focus.contentBody && (
          <p className="mt-2 text-[13.5px] leading-6 text-muted-foreground">{focus.contentBody}</p>
        )}
        <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
          <span>{focus.authorName ?? '匿名'}</span>
          {focus.evidenceCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <FileText className="size-3.5" aria-hidden="true" />
              事实论据 {focus.evidenceCount}
            </span>
          )}
          {focusOwnedByViewer && (
            <span className="inline-flex items-center gap-1 text-violet">
              <Scale className="size-3.5" aria-hidden="true" />
              这是你的论点
            </span>
          )}
        </p>
        {focusOwnedByViewer && (
          <div className="mt-3 flex justify-end border-t border-dashed border-border pt-3">
            <ReviseClaimForm
              topicId={data.topicId}
              claimId={focus.id}
              claimTitle={focus.contentTitle}
            />
          </div>
        )}
      </section>

      {data.focusChallenges.length > 0 && (
        <section className="mt-4 rounded-xl border border-con/30 bg-con-bg/40 p-3 sm:p-4" aria-label="未决反驳">
          <h3 className="flex items-center gap-1.5 text-[13px] font-medium text-con">
            <MessageSquareWarning className="size-4" aria-hidden="true" />
            未决反驳 · 等待回应
          </h3>
          {data.focusChallenges.map((challenge) => (
            <div
              key={challenge.id}
              className="mt-2.5 rounded-lg border border-con/20 bg-card p-3 sm:p-3.5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 text-[13.5px] leading-6">
                  {challenge.challengerTitle}
                </p>
                <span className="inline-flex items-center rounded-full bg-amber-bg px-2 py-0.5 text-[11px] font-medium text-amber">
                  {openChallengeTimerText(challenge.phase, challenge.openedDays)}
                </span>
              </div>
              {challenge.challengerBody && (
                <p className="mt-1 text-[12.5px] leading-5 text-muted-foreground">
                  {challenge.challengerBody}
                </p>
              )}
              <p className="mt-1.5 text-[11.5px] text-muted-foreground">
                反驳者 {challenge.challengerAuthorName ?? '匿名'} · {CHALLENGE_PHASE_LABELS[challenge.phase]}
              </p>
              {currentUserId === focus.authorId && (
                <ChallengeResponsePanel
                  topicId={data.topicId}
                  challengeId={challenge.id}
                  targetClaimId={focus.id}
                  canPost={canPost}
                />
              )}
            </div>
          ))}
        </section>
      )}

      <div className="mt-4 grid items-start gap-3 lg:grid-cols-2">
        <section aria-labelledby="support-heading">
          <h3
            id="support-heading"
            className="mb-2 flex items-center gap-2 text-[13.5px] font-medium text-pro"
          >
            支持理由 <span className="text-xs text-muted-foreground">({data.supports.length})</span>
          </h3>
          {data.supports.length > 0 ? (
            <div className="flex flex-col gap-2">
              {data.supports.map((claim) => (
                <ClaimCard
                  key={claim.id}
                  topicId={data.topicId}
                  claim={claim}
                  challengeCount={data.childChallengeCounts[claim.id] ?? 0}
                />
              ))}
            </div>
          ) : (
            <EmptyColumn>还没有支持理由，来写第一条。</EmptyColumn>
          )}
        </section>
        <section aria-labelledby="rebuttal-heading">
          <h3
            id="rebuttal-heading"
            className="mb-2 flex items-center gap-2 text-[13.5px] font-medium text-con"
          >
            反驳 <span className="text-xs text-muted-foreground">({data.rebuttals.length})</span>
          </h3>
          {data.rebuttals.length > 0 ? (
            <div className="flex flex-col gap-2">
              {data.rebuttals.map((claim) => (
                <ClaimCard
                  key={claim.id}
                  topicId={data.topicId}
                  claim={claim}
                  challengeCount={data.childChallengeCounts[claim.id] ?? 0}
                />
              ))}
            </div>
          ) : (
            <EmptyColumn>还没有反驳，来写第一条。</EmptyColumn>
          )}
        </section>
      </div>

      {data.clarifications.length > 0 && (
        <section className="mt-4" aria-label="澄清请求">
          <h3 className="mb-2 text-[13px] font-medium text-muted-foreground">
            澄清请求 ({data.clarifications.length})
          </h3>
          <div className="flex flex-col gap-2">
            {data.clarifications.map((claim) => (
              <ClaimCard
                key={claim.id}
                topicId={data.topicId}
                claim={claim}
                challengeCount={data.childChallengeCounts[claim.id] ?? 0}
              />
            ))}
          </div>
        </section>
      )}

      {rescuableOwned.length > 0 && (
        <RescueMigrateForms
          topicId={data.topicId}
          newParentId={focus.id}
          claims={rescuableOwned}
        />
      )}

      <ArenaComposer
        topicId={data.topicId}
        focusId={focus.id}
        focusTitle={focus.contentTitle}
        focusBody={focus.contentBody}
        canPost={canPost}
        focusOwnedByViewer={focusOwnedByViewer}
        loginHref={loginHref}
        guideHref={guideHref}
      />
    </div>
  );
}
