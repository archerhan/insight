import { eq } from 'drizzle-orm';
import {
  canTransition,
  validateClaimShape,
  type ClaimRelation,
  type ClaimStatus,
} from '@/lib/domain/states';
import { buildReparentPlan, childAncestors, type ClaimLike } from '@/lib/domain/tree';
import { planRefutationCascade } from '@/lib/domain/propagation';
import { db, type Db } from '@/db/client';
import { challenges, claimEvents, claims, topics, users } from '@/db/schema';

/**
 * 树操作服务层：所有影响树走向的写操作都在同一事务内完成，
 * 并同步写 claim_events（时间轴/审计）。状态校验复用 domain 纯函数。
 */

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 86_400_000);
}

async function insertClaimInTx(
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
  let depth = 0;
  if (input.parentId !== null) {
    const parentRows = await tx
      .select({ parentId: claims.parentId, ancestors: claims.ancestors, status: claims.status, topicId: claims.topicId })
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
    depth = 0 + 1; // depth 由应用层约束，正式版可存列；M0 用子级深度 1
  }

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
    const setFields: { status: string; parentId?: string | null; ancestors?: string[] } = {
      status: update.status,
    };
    if (update.parentId !== undefined) setFields.parentId = update.parentId;
    if (update.ancestors !== undefined) setFields.ancestors = update.ancestors;
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

export async function attachRebuttal(input: {
  topicId: string;
  targetClaimId: string;
  contentTitle: string;
  contentBody?: string;
  authorId: string;
}) {
  return db.transaction(async (tx) => {
    const targetRows = await tx
      .select({ id: claims.id, topicId: claims.topicId, status: claims.status })
      .from(claims)
      .where(eq(claims.id, input.targetClaimId))
      .limit(1);
    const target = targetRows[0];
    if (!target || target.topicId !== input.topicId) throw new Error('Unknown target claim');

    const rebuttal = await insertClaimInTx(tx, {
      topicId: input.topicId,
      parentId: input.targetClaimId,
      relation: 'con',
      contentTitle: input.contentTitle,
      contentBody: input.contentBody,
      authorId: input.authorId,
    });

    const now = new Date();
    const [challenge] = await tx
      .insert(challenges)
      .values({
        topicId: input.topicId,
        targetClaimId: input.targetClaimId,
        challengerClaimId: rebuttal.id,
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
      actorUserId: input.authorId,
      detail: { challengeId: challenge.id, rebuttalClaimId: rebuttal.id },
    });
    return challenge;
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
      .select({ id: claims.id, authorId: claims.authorId, topicId: claims.topicId })
      .from(claims)
      .where(eq(claims.id, challenge.targetClaimId))
      .limit(1);
    const target = targetRows[0];
    if (!target || target.authorId !== input.authorId) {
      throw new Error('Only the target claim author can respond');
    }

    const [response] = await tx
      .insert(claims)
      .values({
        topicId: challenge.topicId,
        parentId: challenge.challengerClaimId,
        relation: 'con',
        contentTitle: input.contentTitle,
        contentBody: input.contentBody,
        authorId: input.authorId,
        status: 'active',
        depth: 1,
        ancestors: [],
      })
      .returning();

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
    if (!challenge || challenge.status !== 'open') throw new Error('Challenge is not open');

    const targetRows = await tx
      .select({ id: claims.id, authorId: claims.authorId, topicId: claims.topicId })
      .from(claims)
      .where(eq(claims.id, challenge.targetClaimId))
      .limit(1);
    const target = targetRows[0];
    if (!target || target.authorId !== input.actorId) {
      throw new Error('Only the target claim author can concede');
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

export async function promoteClaimToReasonLayer(input: { claimId: string; actorId: string }) {
  return db.transaction(async (tx) => {
    const claimRows = await tx
      .select({
        id: claims.id,
        topicId: claims.topicId,
        parentId: claims.parentId,
        ancestors: claims.ancestors,
        relation: claims.relation,
        status: claims.status,
      })
      .from(claims)
      .where(eq(claims.id, input.claimId))
      .limit(1);
    const claim = claimRows[0];
    if (!claim) throw new Error('Unknown claim');
    if (claim.parentId === null) throw new Error('Claim is already in reason layer');

    const rows = await tx
      .select({
        id: claims.id,
        topicId: claims.topicId,
        parentId: claims.parentId,
        ancestors: claims.ancestors,
      })
      .from(claims)
      .where(eq(claims.topicId, claim.topicId));

    const plan = buildReparentPlan(rows, input.claimId, null);
    for (const [claimId, ancestors] of plan.ancestorsById) {
      const setFields: { ancestors: string[]; parentId?: string | null } = { ancestors };
      if (claimId === input.claimId) setFields.parentId = null;
      await tx.update(claims).set(setFields).where(eq(claims.id, claimId));
    }
    await tx.update(claims).set({ status: 'active' }).where(eq(claims.id, input.claimId));
    await tx.insert(claimEvents).values({
      topicId: claim.topicId,
      claimId: input.claimId,
      type: 'promoted',
      actorUserId: input.actorId,
      detail: { reason: 'promote_to_reason_layer' },
    });
  });
}
