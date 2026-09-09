import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/client';
import { challenges, claims, evidence, topics, users } from '@/db/schema';
import { challengePhaseAt, type ChallengePhase } from '@/lib/domain/challenges';
import { daysSince } from '@/lib/domain/arena';
import type { ClaimRelation, ClaimStatus } from '@/lib/domain/states';
import type { TopicType } from '@/lib/domain/publish';
import { advanceChallengeTimersForTopic } from './timers';

/**
 * 对线视图读服务（M3）：
 * - 惰性推进本话题未决反驳计时（读取兜底）；
 * - 返回焦点 + 面包屑 + 支持/反驳两栏 + 焦点上的未决红条 + 子论点被反驳计数；
 * - 只做公开读与聚合，写操作一律走服务端写服务。
 */

const ACTIVE_ROOT_STATUSES: ClaimStatus[] = [
  'active',
  'challenged',
  'responded',
  'disputed',
];

/** 论点卡片数据（DTO，含展示所需作者与证据计数） */
export interface ArenaClaimNode {
  id: string;
  parentId: string | null;
  ancestors: string[];
  relation: ClaimRelation;
  status: ClaimStatus;
  contentTitle: string;
  contentBody: string | null;
  authorId: string;
  authorName: string | null;
  evidenceCount: number;
  createdAt: Date;
  supersedesClaimId: string | null;
}

export interface ArenaOpenChallenge {
  id: string;
  targetClaimId: string;
  challengerClaimId: string;
  challengerTitle: string;
  challengerBody: string | null;
  challengerAuthorId: string;
  challengerAuthorName: string | null;
  openedAt: Date;
  defaultLossAt: Date | null;
  phase: ChallengePhase;
  openedDays: number;
}

export interface ArenaView {
  topicId: string;
  topicTitle: string;
  topicStatus: string;
  topicType: TopicType;
  topicOwnerId: string;
  rootId: string | null;
  /** 焦点及其祖先路径（不含焦点本身）；仅由同话题内有效节点构成 */
  breadcrumbs: ArenaClaimNode[];
  focus: ArenaClaimNode | null;
  supports: ArenaClaimNode[];
  rebuttals: ArenaClaimNode[];
  clarifications: ArenaClaimNode[];
  /** 未决红条：直接反驳当前焦点的 open challenges */
  focusChallenges: ArenaOpenChallenge[];
  /** 各子论点当前挂红的数量（用于子卡片 mini 状态） */
  childChallengeCounts: Record<string, number>;
  /** 焦点是某论点的修订版时，旧版名下可抢救的悬空子论点 */
  rescuableClaims: ArenaClaimNode[];
}

export interface UnresolvedChallenge extends ArenaOpenChallenge {
  targetTitle: string;
  targetAuthorName: string | null;
}

async function loadAllClaims(topicId: string) {
  const rows = await db
    .select({
      id: claims.id,
      parentId: claims.parentId,
      ancestors: claims.ancestors,
      relation: claims.relation,
      status: claims.status,
      contentTitle: claims.contentTitle,
      contentBody: claims.contentBody,
      authorId: claims.authorId,
      authorName: users.displayName,
      createdAt: claims.createdAt,
      supersedesClaimId: claims.supersedesClaimId,
    })
    .from(claims)
    .leftJoin(users, eq(claims.authorId, users.id))
    .where(eq(claims.topicId, topicId))
    .orderBy(asc(claims.createdAt));
  return rows;
}

function toNode(
  row: Awaited<ReturnType<typeof loadAllClaims>>[number],
  evidenceCounts: Map<string, number>,
): ArenaClaimNode {
  return {
    id: row.id,
    parentId: row.parentId,
    ancestors: row.ancestors,
    relation: row.relation as ClaimRelation,
    status: row.status as ClaimStatus,
    contentTitle: row.contentTitle,
    contentBody: row.contentBody,
    authorId: row.authorId,
    authorName: row.authorName,
    evidenceCount: evidenceCounts.get(row.id) ?? 0,
    createdAt: row.createdAt,
    supersedesClaimId: row.supersedesClaimId,
  };
}

async function loadOpenChallenges(topicId: string, now: Date): Promise<ArenaOpenChallenge[]> {
  const rows = await db
    .select({
      id: challenges.id,
      targetClaimId: challenges.targetClaimId,
      challengerClaimId: challenges.challengerClaimId,
      challengerTitle: claims.contentTitle,
      challengerBody: claims.contentBody,
      challengerAuthorId: claims.authorId,
      challengerAuthorName: users.displayName,
      openedAt: challenges.openedAt,
      defaultLossAt: challenges.defaultLossAt,
    })
    .from(challenges)
    .innerJoin(claims, eq(challenges.challengerClaimId, claims.id))
    .leftJoin(users, eq(claims.authorId, users.id))
    .where(and(eq(challenges.topicId, topicId), eq(challenges.status, 'open')));

  return rows.map((row) => ({
    id: row.id,
    targetClaimId: row.targetClaimId,
    challengerClaimId: row.challengerClaimId,
    challengerTitle: row.challengerTitle,
    challengerBody: row.challengerBody,
    challengerAuthorId: row.challengerAuthorId,
    challengerAuthorName: row.challengerAuthorName,
    openedAt: row.openedAt,
    defaultLossAt: row.defaultLossAt,
    phase: challengePhaseAt(now.toISOString(), row.openedAt.toISOString()),
    openedDays: daysSince(now, row.openedAt),
  }));
}

function isClaimId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f-]{8,}$/i.test(value);
}

export async function getArenaView(
  topicId: string,
  focusClaimId?: string | null,
  now: Date = new Date(),
): Promise<ArenaView | null> {
  const [topic] = await db
    .select({
      id: topics.id,
      title: topics.title,
      status: topics.status,
      type: topics.type,
      ownerId: topics.ownerId,
      visibility: topics.visibility,
    })
    .from(topics)
    .where(and(eq(topics.id, topicId), eq(topics.visibility, 'public')))
    .limit(1);
  if (!topic) return null;

  // 读取兜底：先把本话题过期的未决反驳计时阶段补写事件，再按真实阶段渲染
  await advanceChallengeTimersForTopic(topicId, now);

  // 论点与未决反驳互不依赖，并行查询
  const [claimRows, openChallenges] = await Promise.all([
    loadAllClaims(topicId),
    loadOpenChallenges(topicId, now),
  ]);
  const evidenceIds = claimRows.map((row) => row.id);
  const countRows = evidenceIds.length
    ? await db
        .select({ claimId: evidence.claimId, id: evidence.id })
        .from(evidence)
        .where(inArray(evidence.claimId, evidenceIds))
    : [];
  const evidenceCounts = new Map<string, number>();
  for (const row of countRows) {
    evidenceCounts.set(row.claimId, (evidenceCounts.get(row.claimId) ?? 0) + 1);
  }
  const byId = new Map(claimRows.map((row) => [row.id, toNode(row, evidenceCounts)]));

  const rootClaims = claimRows
    .filter(
      (row) =>
        row.parentId === null &&
        row.relation === 'root' &&
        ACTIVE_ROOT_STATUSES.includes(row.status as ClaimStatus),
    )
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  let rootId = rootClaims.at(-1)?.id ?? null;
  // 收敛后采纳理由被置 merged、被击穿根立场置 refuted：仍允许在对线视图下钻浏览证据链。
  if (rootId === null && topic.status !== 'open') {
    const historicalRoots = claimRows
      .filter(
        (row) =>
          row.parentId === null &&
          row.relation === 'root' &&
          ['merged', 'refuted', 'adjudicated'].includes(row.status as ClaimStatus),
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    rootId = historicalRoots.at(-1)?.id ?? null;
  }

  let focus = rootId ? (byId.get(rootId) ?? null) : null;
  if (focusClaimId && isClaimId(focusClaimId) && byId.has(focusClaimId)) {
    // byId 只包含本话题论点；存在即属于当前话题
    focus = byId.get(focusClaimId) ?? null;
  }

  const focusChallenges = focus
    ? openChallenges.filter((challenge) => challenge.targetClaimId === focus.id)
    : [];

  const children = focus
    ? claimRows
        .filter(
          (row) =>
            row.parentId === focus.id &&
            !['collapsed', 'superseded'].includes(row.status),
        )
        .map((row) => toNode(row, evidenceCounts))
    : [];
  const supports = children.filter(
    (node) => node.relation === 'pro' || node.relation === 'addon',
  );
  const rebuttals = children.filter((node) => node.relation === 'con');
  const clarifications = children.filter((node) => node.relation === 'question');

  const childChallengeCounts: Record<string, number> = {};
  for (const child of children) {
    childChallengeCounts[child.id] = openChallenges.filter(
      (challenge) => challenge.targetClaimId === child.id,
    ).length;
  }

  const breadcrumbs: ArenaClaimNode[] = focus
    ? (focus.ancestors ?? [])
        .map((ancestorId) => byId.get(ancestorId))
        .filter((node): node is ArenaClaimNode => Boolean(node))
    : [];

  let rescuableClaims: ArenaClaimNode[] = [];
  if (focus?.supersedesClaimId) {
    rescuableClaims = claimRows
      .filter(
        (row) =>
          row.parentId === focus.supersedesClaimId && row.status === 'orphaned',
      )
      .map((row) => toNode(row, evidenceCounts));
  }

  return {
    topicId: topic.id,
    topicTitle: topic.title,
    topicStatus: topic.status,
    topicType: topic.type === 'claim' ? 'claim' : 'decision',
    topicOwnerId: topic.ownerId,
    rootId,
    breadcrumbs,
    focus,
    supports,
    rebuttals,
    clarifications,
    focusChallenges,
    childChallengeCounts,
    rescuableClaims,
  };
}

/** 未决反驳清单（M4 结论书"未决风险区/降权展示"的数据源查询，M3 先落地）。 */
export async function getUnresolvedChallenges(
  topicId: string,
  now: Date = new Date(),
): Promise<UnresolvedChallenge[]> {
  await advanceChallengeTimersForTopic(topicId, now);
  const challengesRows = await loadOpenChallenges(topicId, now);
  if (challengesRows.length === 0) return [];

  const targetRows = await db
    .select({
      id: claims.id,
      contentTitle: claims.contentTitle,
      authorName: users.displayName,
    })
    .from(claims)
    .leftJoin(users, eq(claims.authorId, users.id))
    .where(
      inArray(
        claims.id,
        challengesRows.map((challenge) => challenge.targetClaimId),
      ),
    );
  const targetById = new Map(targetRows.map((row) => [row.id, row]));
  return challengesRows.map((challenge) => ({
    ...challenge,
    targetTitle: targetById.get(challenge.targetClaimId)?.contentTitle ?? '（论点已失效）',
    targetAuthorName: targetById.get(challenge.targetClaimId)?.authorName ?? null,
  }));
}
