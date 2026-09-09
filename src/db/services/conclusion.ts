import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { db, type DbTx } from '@/db/client';
import {
  challenges,
  claimEvents,
  claims,
  conclusionItems,
  conclusionVersions,
  evidence,
  topics,
  users,
} from '@/db/schema';
import {
  ADOPTABLE_CLAIM_STATUSES,
  adoptionEligibilityError,
  buildConclusionMarkdown,
  buildSupportChain,
  planConclusionSettlement,
  validateConclusionDraft,
  type ConclusionMarkdownInput,
} from '@/lib/domain/conclusion';
import { canTransition, type ClaimStatus } from '@/lib/domain/states';
import type { TopicType } from '@/lib/domain/publish';
import { getUnresolvedChallenges, type UnresolvedChallenge } from './arena';

/**
 * M4 结论书写/读服务：
 * - publishConclusion：楼主在单事务内出 v1——采纳理由层节点（附支撑链快照）→
 *   建 published 版本 → 未决反驳存在时须逐条勾选（risk_closed）；
 * - getConclusionView / getAdoptionDraftContext：结论书视图与采纳向导的数据源；
 * - buildConclusionMarkdownForTopic：简要版 Markdown 导出。
 */

type Tx = DbTx;
type VersionRow = typeof conclusionVersions.$inferSelect;

export type ConclusionRisk = UnresolvedChallenge;

export interface ConclusionSupportEntry {
  claimId: string;
  contentTitle: string;
  authorId: string;
  authorName: string | null;
  evidenceCount: number;
}

export interface ConclusionItemView {
  id: string;
  position: number;
  role: string;
  claimId: string;
  contentTitle: string;
  claimStatus: string;
  authorId: string;
  authorName: string | null;
  note: string | null;
  supportChain: ConclusionSupportEntry[];
}

export interface ConclusionView {
  topicId: string;
  topicTitle: string;
  topicBody: string | null;
  topicType: TopicType;
  topicStatus: string;
  closeMode: string;
  ownerId: string;
  ownerName: string | null;
  createdAt: Date;
  closedAt: Date | null;
  version: {
    id: string;
    versionNo: number;
    status: string;
    verdictText: string;
    recommendationText: string | null;
    premises: string | null;
    settlement: string;
    summarySnapshot: Record<string, unknown> | null;
    publishedAt: Date | null;
  };
  items: ConclusionItemView[];
  risks: ConclusionRisk[];
  nodeCount: number;
  adoptedCount: number;
  participantCount: number;
}

export interface AdoptionRootOption {
  id: string;
  contentTitle: string;
  authorId: string;
  authorName: string | null;
  status: string;
  openChallengeCount: number;
  createdAt: Date;
}

export interface ConclusionDraftContext {
  topicId: string;
  topicTitle: string;
  topicType: TopicType;
  topicStatus: string;
  closeMode: string;
  ownerId: string;
  roots: AdoptionRootOption[];
  openChallenges: ConclusionRisk[];
}

async function assertOwnerCanCloseInTx(
  tx: Tx,
  topicId: string,
  actorId: string,
) {
  const rows = await tx
    .select({
      id: topics.id,
      ownerId: topics.ownerId,
      status: topics.status,
      type: topics.type,
      title: topics.title,
      closeMode: topics.closeMode,
      visibility: topics.visibility,
      createdAt: topics.createdAt,
      closedAt: topics.closedAt,
    })
    .from(topics)
    .where(eq(topics.id, topicId))
    .limit(1);
  const topic = rows[0];
  if (!topic) throw new Error('Unknown topic');
  if (topic.ownerId !== actorId) throw new Error('只有楼主可以发布结论书');
  if (topic.status !== 'open') throw new Error('话题已收敛/关闭，不能重复出结论书');
  if (topic.closeMode !== 'owner') {
    throw new Error('公共议题由社区收敛机制关闭，楼主没有单独关闭权（后续版本支持）');
  }
  return topic;
}

async function loadAdoptedClaimsInTx(
  tx: Tx,
  topicId: string,
  adoptedClaimIds: string[],
) {
  const uniqueIds = [...new Set(adoptedClaimIds)];
  if (uniqueIds.length === 0) throw new Error('至少采纳一条理由层论点');
  const rows = await tx
    .select({
      id: claims.id,
      topicId: claims.topicId,
      parentId: claims.parentId,
      relation: claims.relation,
      status: claims.status,
      contentTitle: claims.contentTitle,
      authorId: claims.authorId,
      createdAt: claims.createdAt,
    })
    .from(claims)
    .where(and(eq(claims.topicId, topicId), inArray(claims.id, uniqueIds)));
  const byId = new Map(rows.map((row) => [row.id, row]));
  const result: Array<(typeof rows)[number]> = [];
  for (const id of uniqueIds) {
    const claim = byId.get(id);
    if (!claim || claim.topicId !== topicId) {
      throw new Error(`Unknown claim ${id}`);
    }
    const eligibilityError = adoptionEligibilityError(claim);
    if (eligibilityError) throw new Error(eligibilityError);
    result.push(claim);
  }
  return result;
}

async function nextVersionNoInTx(tx: Tx, topicId: string): Promise<number> {
  const rows = await tx
    .select({ versionNo: conclusionVersions.versionNo })
    .from(conclusionVersions)
    .where(eq(conclusionVersions.topicId, topicId));
  return rows.length === 0 ? 1 : Math.max(...rows.map((row) => row.versionNo)) + 1;
}

async function loadOpenChallengesInTx(tx: Tx, topicId: string) {
  return tx
    .select({
      id: challenges.id,
      targetClaimId: challenges.targetClaimId,
      challengerClaimId: challenges.challengerClaimId,
      openedAt: challenges.openedAt,
      defaultLossAt: challenges.defaultLossAt,
    })
    .from(challenges)
    .where(and(eq(challenges.topicId, topicId), eq(challenges.status, 'open')));
}

export interface PublishConclusionInput {
  topicId: string;
  actorId: string;
  verdictText: string;
  recommendationText?: string;
  premises?: string;
  adoptedClaimIds: string[];
  /** 带险关闭时逐条勾选的未决反驳 id。 */
  acknowledgedChallengeIds?: string[];
  note?: string;
}

/** 楼主出结论书 v1（单事务）：校验 → 快照采纳 → published 版本 → 话题收敛/带险关闭。 */
export async function publishConclusion(
  input: PublishConclusionInput,
): Promise<{ version: VersionRow }> {
  return db.transaction(async (tx) => {
    await assertOwnerCanCloseInTx(tx, input.topicId, input.actorId);

    const draftErrors = validateConclusionDraft({
      verdictText: input.verdictText,
      recommendationText: input.recommendationText,
      premises: input.premises,
      adoptedClaimIds: input.adoptedClaimIds,
    });
    if (draftErrors.length > 0) throw new Error(draftErrors[0]);

    const adopted = await loadAdoptedClaimsInTx(tx, input.topicId, input.adoptedClaimIds);
    const openChallenges = await loadOpenChallengesInTx(tx, input.topicId);
    const settlementPlan = planConclusionSettlement({
      openChallengeIds: openChallenges.map((challenge) => challenge.id),
      acknowledgedChallengeIds: input.acknowledgedChallengeIds ?? [],
    });
    if (settlementPlan.error) throw new Error(settlementPlan.error);

    // 支撑链快照：只取被采纳节点当时的活性 pro/addon 子孙及其证据 id
    const allClaims = await tx
      .select({
        id: claims.id,
        parentId: claims.parentId,
        relation: claims.relation,
        status: claims.status,
        contentTitle: claims.contentTitle,
        authorId: claims.authorId,
        createdAt: claims.createdAt,
      })
      .from(claims)
      .where(eq(claims.topicId, input.topicId))
      .orderBy(asc(claims.createdAt));
    const allEvidence = allClaims.length
      ? await tx
          .select({ claimId: evidence.claimId, id: evidence.id })
          .from(evidence)
          .where(
            inArray(
              evidence.claimId,
              allClaims.map((claim) => claim.id),
            ),
          )
      : [];
    const chainByRoot = new Map<string, ReturnType<typeof buildSupportChain>>();
    for (const claim of adopted) {
      chainByRoot.set(claim.id, buildSupportChain(allClaims, allEvidence, claim.id));
    }

    // 快照里的 authorName 也一并冻结，避免用户改名改写历史导出
    const chainAuthorIds = [
      ...new Set(
        [...chainByRoot.values()]
          .flat()
          .map((entry) => entry.authorId)
          .filter(Boolean),
      ),
    ];
    const chainAuthors = chainAuthorIds.length
      ? await tx
          .select({ id: users.id, displayName: users.displayName })
          .from(users)
          .where(inArray(users.id, chainAuthorIds))
      : [];
    const chainAuthorName = new Map(chainAuthors.map((row) => [row.id, row.displayName]));

    const now = new Date();
    const versionNo = await nextVersionNoInTx(tx, input.topicId);
    const riskSnapshot = openChallenges.map((challenge) => ({
      id: challenge.id,
      targetClaimId: challenge.targetClaimId,
      challengerClaimId: challenge.challengerClaimId,
      openedAt: challenge.openedAt.toISOString(),
      defaultLossAt: challenge.defaultLossAt?.toISOString() ?? null,
    }));
    const [version] = await tx
      .insert(conclusionVersions)
      .values({
        topicId: input.topicId,
        versionNo,
        status: 'published',
        verdictText: input.verdictText.trim(),
        recommendationText: input.recommendationText?.trim() || null,
        premises: input.premises?.trim() || null,
        settlement: settlementPlan.settlement,
        createdByUserId: input.actorId,
        publishedAt: now,
        summarySnapshot: {
          versionNo,
          settlement: settlementPlan.settlement,
          nodeCount: allClaims.length,
          adoptedCount: adopted.length,
          openChallengeCount: openChallenges.length,
          participantCount: new Set(allClaims.map((claim) => claim.authorId)).size,
          riskChallenges: riskSnapshot,
        },
      })
      .returning();

    const itemValues = adopted.map((claim, index) => {
      const chain = chainByRoot.get(claim.id) ?? [];
      return {
        versionId: version.id,
        claimId: claim.id,
        position: index + 1,
        role: 'adopted_reason',
        supportChain: chain.map((entry) => ({
          claimId: entry.claimId,
          contentTitle: entry.contentTitle,
          authorId: entry.authorId,
          authorName: chainAuthorName.get(entry.authorId) ?? null,
          evidenceIds: entry.evidenceIds,
        })),
        note: input.note?.trim() || null,
        adoptedByUserId: input.actorId,
      };
    });
    await tx.insert(conclusionItems).values(itemValues);

    // 采纳即状态迁移：无未决反驳指向的节点置 merged 并写事件；
    // 带险采纳的节点保留挂红状态，待楼主后续回应/现实审计。
    const openByTarget = new Map<string, number>();
    for (const challenge of openChallenges) {
      openByTarget.set(challenge.targetClaimId, (openByTarget.get(challenge.targetClaimId) ?? 0) + 1);
    }
    for (const claim of adopted) {
      const hasOpenChallenge = (openByTarget.get(claim.id) ?? 0) > 0;
      if (!hasOpenChallenge && canTransition(claim.status as ClaimStatus, 'merged')) {
        await tx.update(claims).set({ status: 'merged', updatedAt: now }).where(eq(claims.id, claim.id));
      }
      await tx.insert(claimEvents).values({
        topicId: input.topicId,
        claimId: claim.id,
        type: 'adopted',
        actorUserId: input.actorId,
        detail: {
          versionId: version.id,
          versionNo,
          riskAccepted: hasOpenChallenge,
          settlement: settlementPlan.settlement,
        },
      });
    }

    const status = settlementPlan.settlement === 'risk_closed' ? 'risk_closed' : 'converged';
    await tx
      .update(topics)
      .set({
        status,
        currentVersionId: version.id,
        adoptedCount: adopted.length,
        closedAt: now,
        lastActivityAt: now,
        updatedAt: now,
      })
      .where(eq(topics.id, input.topicId));

    return { version };
  });
}

/** 采纳向导数据源：楼主可采纳的理由层候选 + 未决反驳清单（带险勾选用）。 */
export async function getAdoptionDraftContext(
  topicId: string,
): Promise<ConclusionDraftContext | null> {
  const topicRows = await db
    .select({
      id: topics.id,
      title: topics.title,
      type: topics.type,
      status: topics.status,
      closeMode: topics.closeMode,
      ownerId: topics.ownerId,
      visibility: topics.visibility,
    })
    .from(topics)
    .where(and(eq(topics.id, topicId), eq(topics.visibility, 'public')))
    .limit(1);
  const topic = topicRows[0];
  if (!topic) return null;

  const [rootRows, openChallenges] = await Promise.all([
    db
      .select({
        id: claims.id,
        contentTitle: claims.contentTitle,
        authorId: claims.authorId,
        authorName: users.displayName,
        status: claims.status,
        createdAt: claims.createdAt,
      })
      .from(claims)
      .leftJoin(users, eq(claims.authorId, users.id))
      .where(
        and(
          eq(claims.topicId, topicId),
          isNull(claims.parentId),
          eq(claims.relation, 'root'),
          inArray(claims.status, [...ADOPTABLE_CLAIM_STATUSES]),
        ),
      )
      .orderBy(asc(claims.createdAt)),
    getUnresolvedChallenges(topicId),
  ]);

  const openByTarget = new Map<string, number>();
  for (const challenge of openChallenges) {
    openByTarget.set(challenge.targetClaimId, (openByTarget.get(challenge.targetClaimId) ?? 0) + 1);
  }

  return {
    topicId: topic.id,
    topicTitle: topic.title,
    topicType: topic.type === 'claim' ? 'claim' : 'decision',
    topicStatus: topic.status,
    closeMode: topic.closeMode,
    ownerId: topic.ownerId,
    roots: rootRows.map((row) => ({
      id: row.id,
      contentTitle: row.contentTitle,
      authorId: row.authorId,
      authorName: row.authorName,
      status: row.status,
      createdAt: row.createdAt,
      openChallengeCount: openByTarget.get(row.id) ?? 0,
    })),
    openChallenges,
  };
}

/** 结论书视图：当前 published 版本 + 采纳条目（含支撑链快照）+ 实时未决风险。 */
export async function getConclusionView(
  topicId: string,
): Promise<ConclusionView | null> {
  const topicRows = await db
    .select({
      id: topics.id,
      title: topics.title,
      body: topics.body,
      type: topics.type,
      status: topics.status,
      closeMode: topics.closeMode,
      ownerId: topics.ownerId,
      ownerName: users.displayName,
      createdAt: topics.createdAt,
      closedAt: topics.closedAt,
      currentVersionId: topics.currentVersionId,
      adoptedCount: topics.adoptedCount,
      visibility: topics.visibility,
    })
    .from(topics)
    .leftJoin(users, eq(topics.ownerId, users.id))
    .where(and(eq(topics.id, topicId), eq(topics.visibility, 'public')))
    .limit(1);
  const topic = topicRows[0];
  if (!topic || !topic.currentVersionId) return null;

  const [versionRows, itemRows, risks] = await Promise.all([
    db
      .select()
      .from(conclusionVersions)
      .where(
        and(
          eq(conclusionVersions.id, topic.currentVersionId),
          eq(conclusionVersions.status, 'published'),
        ),
      )
      .limit(1),
    db
      .select({
        id: conclusionItems.id,
        position: conclusionItems.position,
        role: conclusionItems.role,
        claimId: conclusionItems.claimId,
        contentTitle: claims.contentTitle,
        claimStatus: claims.status,
        authorId: claims.authorId,
        authorName: users.displayName,
        note: conclusionItems.note,
        supportChain: conclusionItems.supportChain,
      })
      .from(conclusionItems)
      .innerJoin(claims, eq(conclusionItems.claimId, claims.id))
      .leftJoin(users, eq(claims.authorId, users.id))
      .where(eq(conclusionItems.versionId, topic.currentVersionId))
      .orderBy(asc(conclusionItems.position)),
    getUnresolvedChallenges(topicId),
  ]);
  const version = versionRows[0];
  if (!version) return null;

  // 快照已冻结 authorName；缺失时才用当前用户名兜底（改名不应改写历史导出）
  const chainAuthorIds = [
    ...new Set(
      itemRows.flatMap((item) =>
        (item.supportChain ?? []).map((entry) => entry.authorId).filter(Boolean),
      ),
    ),
  ];
  const chainAuthors = chainAuthorIds.length
    ? await db
        .select({ id: users.id, displayName: users.displayName })
        .from(users)
        .where(inArray(users.id, chainAuthorIds))
    : [];
  const authorNames = new Map(chainAuthors.map((row) => [row.id, row.displayName]));

  const topicClaimRows = await db
    .select({ id: claims.id, authorId: claims.authorId })
    .from(claims)
    .where(eq(claims.topicId, topicId));
  const participantCount = new Set(topicClaimRows.map((row) => row.authorId)).size;

  const items: ConclusionItemView[] = itemRows.map((item) => ({
    id: item.id,
    position: item.position,
    role: item.role,
    claimId: item.claimId,
    contentTitle: item.contentTitle,
    claimStatus: item.claimStatus,
    authorId: item.authorId,
    authorName: item.authorName,
    note: item.note,
    supportChain: (item.supportChain ?? []).map((entry) => ({
      claimId: entry.claimId,
      contentTitle: entry.contentTitle,
      authorId: entry.authorId,
      authorName: entry.authorName ?? authorNames.get(entry.authorId) ?? null,
      evidenceCount: entry.evidenceIds?.length ?? 0,
    })),
  }));

  return {
    topicId: topic.id,
    topicTitle: topic.title,
    topicBody: topic.body,
    topicType: topic.type === 'claim' ? 'claim' : 'decision',
    topicStatus: topic.status,
    closeMode: topic.closeMode,
    ownerId: topic.ownerId,
    ownerName: topic.ownerName,
    createdAt: topic.createdAt,
    closedAt: topic.closedAt,
    version: {
      id: version.id,
      versionNo: version.versionNo,
      status: version.status,
      verdictText: version.verdictText,
      recommendationText: version.recommendationText,
      premises: version.premises,
      settlement: version.settlement,
      summarySnapshot: version.summarySnapshot,
      publishedAt: version.publishedAt,
    },
    items,
    risks,
    nodeCount: topicClaimRows.length,
    adoptedCount: topic.adoptedCount,
    participantCount,
  };
}

/** 简要版 Markdown 导出数据组装（路由/测试复用同一口径）。 */
export async function buildConclusionMarkdownForTopic(
  topicId: string,
): Promise<string | null> {
  const view = await getConclusionView(topicId);
  if (!view) return null;

  const input: ConclusionMarkdownInput = {
    topicTitle: view.topicTitle,
    topicStatus: view.topicStatus,
    versionNo: view.version.versionNo,
    settlement: view.version.settlement,
    publishedAt: view.version.publishedAt ?? view.createdAt,
    verdictText: view.version.verdictText,
    recommendationText: view.version.recommendationText,
    premises: view.version.premises,
    adoptedItems: view.items.map((item) => ({
      position: item.position,
      contentTitle: item.contentTitle,
      authorName: item.authorName,
      status: item.claimStatus,
      chain: item.supportChain.map((entry) => ({
        contentTitle: entry.contentTitle,
        authorName: entry.authorName,
        evidenceCount: entry.evidenceCount,
      })),
      note: item.note ?? undefined,
    })),
    risks: view.risks.map((risk) => ({
      targetTitle: risk.targetTitle,
      challengerTitle: risk.challengerTitle,
      challengerAuthorName: risk.challengerAuthorName,
      openedDays: risk.openedDays,
    })),
    participantCount: view.participantCount,
  };
  return buildConclusionMarkdown(input);
}
