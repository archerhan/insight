import { and, eq, inArray } from 'drizzle-orm';
import {
  canTransition,
  validateClaimShape,
  type ClaimRelation,
  type ClaimStatus,
} from '@/lib/domain/states';
import { buildReparentPlan, childAncestors, type ClaimLike } from '@/lib/domain/tree';
import { planRefutationCascade } from '@/lib/domain/propagation';
import { db, type DbTx } from '@/db/client';
import { challenges, claimEvents, claims, topics, users } from '@/db/schema';

/**
 * 树操作服务层：所有影响树走向的写操作都在同一事务内完成，
 * 并同步写 claim_events（时间轴/审计）。状态校验复用 domain 纯函数。
 */

type Tx = DbTx;

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 86_400_000);
}

export async function insertClaimInTx(
  tx: Tx,
  input: {
    topicId: string;
    parentId: string | null;
    relation: ClaimRelation;
    contentTitle: string;
    contentBody?: string;
    authorId: string;
    status?: ClaimStatus;
  },
) {
  const shapeError = validateClaimShape({ parentId: input.parentId, relation: input.relation });
  if (shapeError) throw new Error(shapeError);

  let ancestors: string[] = [];
  if (input.parentId !== null) {
    const parentRows = await tx
      .select({
        parentId: claims.parentId,
        ancestors: claims.ancestors,
        status: claims.status,
        topicId: claims.topicId,
      })
      .from(claims)
      .where(eq(claims.id, input.parentId))
      .limit(1);
    const parent = parentRows[0];
    if (!parent) throw new Error(`Unknown parent ${input.parentId}`);
    if (parent.topicId !== input.topicId) throw new Error('Parent belongs to another topic');
    if (!['active', 'challenged', 'responded', 'disputed'].includes(parent.status)) {
      throw new Error(`Parent status ${parent.status} cannot accept new claims`);
    }
    const parentLike: ClaimLike = { id: input.parentId, parentId: null, ancestors: parent.ancestors };
    ancestors = childAncestors(parentLike);
  }
  // 树不变量：depth === ancestors.length（理由层为 0）
  const depth = ancestors.length;

  const [claim] = await tx
    .insert(claims)
    .values({
      topicId: input.topicId,
      parentId: input.parentId,
      relation: input.relation,
      contentTitle: input.contentTitle,
      contentBody: input.contentBody,
      authorId: input.authorId,
      status: input.status ?? 'active',
      depth,
      ancestors,
    })
    .returning();

  await tx.insert(claimEvents).values({
    topicId: input.topicId,
    claimId: claim.id,
    type: 'created',
    actorUserId: input.authorId,
    detail: { parentId: input.parentId, relation: input.relation },
  });
  return claim;
}

async function writeCascadeInTx(
  tx: Tx,
  topicId: string,
  refutedClaimId: string,
  killerClaimId: string | null,
  actorId: string,
  challengeId?: string,
) {
  const rows = await tx
    .select({
      id: claims.id,
      topicId: claims.topicId,
      parentId: claims.parentId,
      ancestors: claims.ancestors,
      relation: claims.relation,
      status: claims.status,
    })
    .from(claims)
    .where(eq(claims.topicId, topicId));

  const nodes = rows.map((row) => ({
    id: row.id,
    parentId: row.parentId,
    ancestors: row.ancestors,
    relation: row.relation as 'root' | 'pro' | 'con' | 'addon' | 'question',
  }));
  const plan = planRefutationCascade(nodes, refutedClaimId, killerClaimId);

  for (const update of plan.updates) {
    const setFields: {
      status: string;
      parentId?: string | null;
      ancestors?: string[];
      depth?: number;
      relation?: string;
    } = {
      status: update.status,
    };
    if (update.parentId !== undefined) {
      setFields.parentId = update.parentId;
      if (update.parentId === null) setFields.relation = 'root';
    }
    if (update.ancestors !== undefined) {
      setFields.ancestors = update.ancestors;
      setFields.depth = update.ancestors.length;
    }
    if (update.relation !== undefined) setFields.relation = update.relation;
    await tx.update(claims).set(setFields).where(eq(claims.id, update.claimId));
  }
  for (const event of plan.events) {
    await tx.insert(claimEvents).values({
      topicId,
      claimId: event.claimId,
      type: event.type,
      actorUserId: actorId,
      detail: challengeId ? { challengeId } : {},
    });
  }

  // 被击穿/悬空/目标失效的节点上若还有其它 open 反驳，一并置 moot（父论点已失效，不再判胜负）
  const invalidatedIds = plan.updates
    .filter((update) => ['refuted', 'orphaned', 'moot'].includes(update.status))
    .map((update) => update.claimId);
  if (invalidatedIds.length > 0) {
    const otherOpen = await tx
      .select({ id: challenges.id })
      .from(challenges)
      .where(
        and(
          eq(challenges.topicId, topicId),
          eq(challenges.status, 'open'),
          inArray(challenges.targetClaimId, invalidatedIds),
        ),
      );
    for (const row of otherOpen) {
      await tx
        .update(challenges)
        .set({
          status: 'moot',
          resolutionReason: 'target_refuted',
          resolvedAt: new Date(),
        })
        .where(eq(challenges.id, row.id));
    }
  }
}

export async function createTopicWithRoot(input: {
  ownerId: string;
  type: 'decision' | 'claim';
  title: string;
  body?: string;
  rootContentTitle: string;
  rootContentBody?: string;
}) {
  return db.transaction(async (tx) => {
    const owner = await tx.select({ id: users.id }).from(users).where(eq(users.id, input.ownerId)).limit(1);
    if (owner.length === 0) throw new Error('Unknown owner');

    const [topic] = await tx
      .insert(topics)
      .values({
        ownerId: input.ownerId,
        type: input.type,
        title: input.title,
        body: input.body,
        currentNodeCount: 1,
      })
      .returning();

    const [root] = await tx
      .insert(claims)
      .values({
        topicId: topic.id,
        parentId: null,
        relation: 'root',
        contentTitle: input.rootContentTitle,
        contentBody: input.rootContentBody,
        authorId: input.ownerId,
        status: 'active',
        depth: 0,
        ancestors: [],
      })
      .returning();

    await tx.insert(claimEvents).values({
      topicId: topic.id,
      claimId: root.id,
      type: 'created',
      actorUserId: input.ownerId,
    });
    return { topic, root };
  });
}

export async function createClaimUnder(input: {
  topicId: string;
  parentId: string;
  relation: ClaimRelation;
  contentTitle: string;
  contentBody?: string;
  authorId: string;
}) {
  return db.transaction(async (tx) =>
    insertClaimInTx(tx, {
      ...input,
      parentId: input.parentId,
      relation: input.relation,
    }),
  );
}

/** 事务内打开一条挂红：校验反驳节点形态后写 challenge + 目标状态 + 事件。 */
export async function openChallengeInTx(
  tx: Tx,
  input: {
    topicId: string;
    targetClaimId: string;
    challengerClaimId: string;
    actorUserId: string;
  },
) {
  const [challenger] = await tx
    .select({
      id: claims.id,
      topicId: claims.topicId,
      parentId: claims.parentId,
      relation: claims.relation,
    })
    .from(claims)
    .where(eq(claims.id, input.challengerClaimId))
    .limit(1);
  if (!challenger || challenger.topicId !== input.topicId) {
    throw new Error(`Unknown challenger claim ${input.challengerClaimId}`);
  }
  if (challenger.parentId !== input.targetClaimId || challenger.relation !== 'con') {
    throw new Error('challenger 必须是 target 的直接 con 子节点');
  }

  const [target] = await tx
    .select({ id: claims.id, topicId: claims.topicId, status: claims.status })
    .from(claims)
    .where(eq(claims.id, input.targetClaimId))
    .limit(1);
  if (!target || target.topicId !== input.topicId) throw new Error('Unknown target claim');

  const now = new Date();
  const [challenge] = await tx
    .insert(challenges)
    .values({
      topicId: input.topicId,
      targetClaimId: input.targetClaimId,
      challengerClaimId: input.challengerClaimId,
      openedAt: now,
      orangeAt: daysFromNow(3),
      redAt: daysFromNow(7),
      defaultLossAt: daysFromNow(14),
    })
    .returning();

  if (canTransition(target.status as ClaimStatus, 'challenged')) {
    await tx.update(claims).set({ status: 'challenged' }).where(eq(claims.id, target.id));
  }
  await tx.insert(claimEvents).values({
    topicId: input.topicId,
    claimId: target.id,
    type: 'challenged',
    actorUserId: input.actorUserId,
    detail: {
      challengeId: challenge.id,
      challengerClaimId: input.challengerClaimId,
      rebuttalClaimId: input.challengerClaimId,
    },
  });
  return challenge;
}

export async function attachRebuttal(input: {
  topicId: string;
  targetClaimId: string;
  contentTitle: string;
  contentBody?: string;
  authorId: string;
}) {
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({ id: claims.id, topicId: claims.topicId, status: claims.status, authorId: claims.authorId })
      .from(claims)
      .where(eq(claims.id, input.targetClaimId))
      .limit(1);
    if (!target || target.topicId !== input.topicId) throw new Error('Unknown target claim');
    if (target.authorId === input.authorId) {
      throw new Error('不能反驳自己发布的论点：请让反驳来自另一方');
    }

    const rebuttal = await insertClaimInTx(tx, {
      topicId: input.topicId,
      parentId: input.targetClaimId,
      relation: 'con',
      contentTitle: input.contentTitle,
      contentBody: input.contentBody,
      authorId: input.authorId,
    });
    return openChallengeInTx(tx, {
      topicId: input.topicId,
      targetClaimId: input.targetClaimId,
      challengerClaimId: rebuttal.id,
      actorUserId: input.authorId,
    });
  });
}

export async function respondToChallenge(input: {
  challengeId: string;
  authorId: string;
  contentTitle: string;
  contentBody?: string;
}) {
  return db.transaction(async (tx) => {
    const challengeRows = await tx
      .select({
        id: challenges.id,
        topicId: challenges.topicId,
        targetClaimId: challenges.targetClaimId,
        challengerClaimId: challenges.challengerClaimId,
        status: challenges.status,
      })
      .from(challenges)
      .where(eq(challenges.id, input.challengeId))
      .limit(1);
    const challenge = challengeRows[0];
    if (!challenge) throw new Error('Unknown challenge');
    if (challenge.status !== 'open') throw new Error('Challenge is not open');

    const targetRows = await tx
      .select({
        id: claims.id,
        authorId: claims.authorId,
        topicId: claims.topicId,
        status: claims.status,
      })
      .from(claims)
      .where(eq(claims.id, challenge.targetClaimId))
      .limit(1);
    const target = targetRows[0];
    if (!target || target.authorId !== input.authorId) {
      throw new Error('Only the target claim author can respond');
    }
    if (target.status !== 'challenged') {
      throw new Error(`目标论点当前状态为 ${target.status}，不能回应这条反驳（请刷新查看）`);
    }

    const response = await insertClaimInTx(tx, {
      topicId: challenge.topicId,
      parentId: challenge.challengerClaimId,
      relation: 'con',
      contentTitle: input.contentTitle,
      contentBody: input.contentBody,
      authorId: input.authorId,
    });

    await tx
      .update(challenges)
      .set({ status: 'responded', respondedClaimId: response.id, resolvedAt: new Date() })
      .where(eq(challenges.id, challenge.id));
    await tx.update(claims).set({ status: 'responded' }).where(eq(claims.id, target.id));
    await tx.insert(claimEvents).values({
      topicId: challenge.topicId,
      claimId: target.id,
      type: 'responded',
      actorUserId: input.authorId,
      detail: { challengeId: challenge.id, responseClaimId: response.id },
    });
    return response;
  });
}

export async function concedeToChallenge(input: { challengeId: string; actorId: string }) {
  return db.transaction(async (tx) => {
    const challengeRows = await tx
      .select({
        id: challenges.id,
        topicId: challenges.topicId,
        targetClaimId: challenges.targetClaimId,
        challengerClaimId: challenges.challengerClaimId,
        status: challenges.status,
      })
      .from(challenges)
      .where(eq(challenges.id, input.challengeId))
      .limit(1);
    const challenge = challengeRows[0];
    if (!challenge || !['open', 'responded'].includes(challenge.status)) {
      throw new Error('Challenge is not open or responded');
    }

    const targetRows = await tx
      .select({
        id: claims.id,
        authorId: claims.authorId,
        topicId: claims.topicId,
        status: claims.status,
      })
      .from(claims)
      .where(eq(claims.id, challenge.targetClaimId))
      .limit(1);
    const target = targetRows[0];
    if (!target || target.authorId !== input.actorId) {
      throw new Error('Only the target claim author can concede');
    }
    if (!['active', 'challenged', 'responded', 'disputed'].includes(target.status)) {
      throw new Error(`目标论点当前状态为 ${target.status}，不能再承认击穿（请刷新查看）`);
    }

    await writeCascadeInTx(
      tx,
      challenge.topicId,
      challenge.targetClaimId,
      challenge.challengerClaimId,
      input.actorId,
      challenge.id,
    );
    await tx
      .update(challenges)
      .set({ status: 'conceded', resolutionReason: 'author_conceded', resolvedAt: new Date() })
      .where(eq(challenges.id, challenge.id));
  });
}

export async function migrateClaim(input: {
  claimId: string;
  actorId: string;
  /** null = 提升到理由层；否则把该节点（及整棵子树）迁移到新父节点下。 */
  newParentId: string | null;
  reason?: string;
}) {
  return db.transaction(async (tx) => {
    const claimRows = await tx
      .select({
        id: claims.id,
        topicId: claims.topicId,
        parentId: claims.parentId,
        ancestors: claims.ancestors,
        relation: claims.relation,
        status: claims.status,
        authorId: claims.authorId,
      })
      .from(claims)
      .where(eq(claims.id, input.claimId))
      .limit(1);
    const claim = claimRows[0];
    if (!claim) throw new Error(`Unknown claim ${input.claimId}`);
    if (claim.authorId !== input.actorId) {
      throw new Error('Only the claim author can migrate/promote');
    }
    if (claim.parentId === input.newParentId) {
      throw new Error('Claim is already under the target parent');
    }
    if (claim.parentId === null && input.newParentId !== null) {
      throw new Error('Reason-layer claims cannot be migrated under another claim');
    }
    if (!['active', 'orphaned'].includes(claim.status)) {
      throw new Error(`Claim status ${claim.status} cannot be migrated`);
    }

    if (input.newParentId !== null) {
      const parentRows = await tx
        .select({ id: claims.id, topicId: claims.topicId, status: claims.status })
        .from(claims)
        .where(eq(claims.id, input.newParentId))
        .limit(1);
      const newParent = parentRows[0];
      if (!newParent) throw new Error(`Unknown parent ${input.newParentId}`);
      if (newParent.topicId !== claim.topicId) throw new Error('Parent belongs to another topic');
      if (!['active', 'challenged', 'responded', 'disputed'].includes(newParent.status)) {
        throw new Error(`Parent status ${newParent.status} cannot accept migrated claims`);
      }
    }

    const rows = await tx
      .select({
        id: claims.id,
        topicId: claims.topicId,
        parentId: claims.parentId,
        ancestors: claims.ancestors,
      })
      .from(claims)
      .where(eq(claims.topicId, claim.topicId));

    const plan = buildReparentPlan(rows, input.claimId, input.newParentId);
    for (const [claimId, ancestors] of plan.ancestorsById) {
      const setFields: {
        ancestors: string[];
        depth: number;
        parentId?: string | null;
        status?: string;
        relation?: string;
      } = { ancestors, depth: ancestors.length };
      if (claimId === input.claimId) {
        setFields.parentId = input.newParentId;
        setFields.status = 'active';
        if (input.newParentId === null) setFields.relation = 'root';
      }
      await tx.update(claims).set(setFields).where(eq(claims.id, claimId));
    }

    const promoted = input.newParentId === null;
    await tx.insert(claimEvents).values({
      topicId: claim.topicId,
      claimId: input.claimId,
      type: promoted ? 'promoted' : 'migrated',
      actorUserId: input.actorId,
      detail: {
        fromParentId: claim.parentId,
        toParentId: input.newParentId,
        reason: input.reason ?? (promoted ? 'promote_to_reason_layer' : 'rescue_migration'),
        movedClaims: plan.ancestorsById.size,
      },
    });
  });
}

export async function promoteClaimToReasonLayer(input: { claimId: string; actorId: string }) {
  return migrateClaim({ ...input, newParentId: null, reason: 'promote_to_reason_layer' });
}

export async function reviseClaim(input: {
  claimId: string;
  authorId: string;
  contentTitle: string;
  contentBody?: string;
}) {
  return db.transaction(async (tx) => {
    const claimRows = await tx
      .select({
        id: claims.id,
        topicId: claims.topicId,
        parentId: claims.parentId,
        ancestors: claims.ancestors,
        relation: claims.relation,
        status: claims.status,
        authorId: claims.authorId,
      })
      .from(claims)
      .where(eq(claims.id, input.claimId))
      .limit(1);
    const claim = claimRows[0];
    if (!claim) throw new Error(`Unknown claim ${input.claimId}`);
    if (claim.authorId !== input.authorId) throw new Error('Only the claim author can revise');
    if (!canTransition(claim.status as ClaimStatus, 'superseded')) {
      throw new Error(`Claim status ${claim.status} cannot be superseded`);
    }

    const [revision] = await tx
      .insert(claims)
      .values({
        topicId: claim.topicId,
        parentId: claim.parentId,
        relation: claim.relation as ClaimRelation,
        contentTitle: input.contentTitle,
        contentBody: input.contentBody,
        authorId: input.authorId,
        status: 'active',
        depth: claim.ancestors.length,
        ancestors: claim.ancestors,
        supersedesClaimId: claim.id,
      })
      .returning();

    await tx.update(claims).set({ status: 'superseded' }).where(eq(claims.id, claim.id));
    await tx.insert(claimEvents).values({
      topicId: claim.topicId,
      claimId: claim.id,
      type: 'superseded',
      actorUserId: input.authorId,
      detail: { supersededByClaimId: revision.id },
    });
    await tx.insert(claimEvents).values({
      topicId: claim.topicId,
      claimId: revision.id,
      type: 'created',
      actorUserId: input.authorId,
      detail: { parentId: claim.parentId, relation: claim.relation, supersedesClaimId: claim.id },
    });
    return revision;
  });
}
