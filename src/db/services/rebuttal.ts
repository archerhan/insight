import { and, eq } from 'drizzle-orm';
import { db, type DbTx } from '@/db/client';
import { aiFlags, challenges, claimEvents, claims, topics, users } from '@/db/schema';
import { runProgramChecksWithLlm, type AiCheckEntry } from '@/lib/ai/program-checks';
import { insertClaimInTx, openChallengeInTx } from './tree';

/**
 * M3 对线写服务：程序检查（L0）+ 建节点/挂红/回应，全部在同一事务内完成，
 * 检查结果与论点同批写入 ai_flags（approved 也留痕，便于审计与调参）。
 *
 * 口径：AI 只把关“程序”（复述/重复/侮辱），不裁决论点真伪；
 * 未通过的提交不建节点，只留 flagged 审计记录（claim_id 为空）。
 */

export type Claim = typeof claims.$inferSelect;
export type Challenge = typeof challenges.$inferSelect;

export interface AiFlagContext {
  topicId: string;
  targetClaimId?: string | null;
}

export type NodeWriteOutcome =
  | {
      ok: true;
      claim: Claim;
      challenge?: Challenge;
      entries: AiCheckEntry[];
    }
  | { ok: false; error: string; entries: AiCheckEntry[] };

async function assertTopicOpenInTx(tx: DbTx, topicId: string) {
  const [topic] = await tx
    .select({
      id: topics.id,
      status: topics.status,
      ownerId: topics.ownerId,
      allowPublicRebuttal: topics.allowPublicRebuttal,
      visibility: topics.visibility,
    })
    .from(topics)
    .where(eq(topics.id, topicId))
    .limit(1);
  if (!topic) throw new Error(`Unknown topic ${topicId}`);
  if (topic.status !== 'open') throw new Error('话题已收敛/关闭，不能再新增论点');
  if (topic.visibility !== 'public') throw new Error('该话题不对外公开');
  return topic;
}

async function assertActiveAuthorInTx(tx: DbTx, authorId: string) {
  const [author] = await tx
    .select({ id: users.id, status: users.status })
    .from(users)
    .where(eq(users.id, authorId))
    .limit(1);
  if (!author || author.status !== 'active') throw new Error('Unknown or inactive author');
}

async function loadClaimInTx(tx: DbTx, topicId: string, claimId: string) {
  const [claim] = await tx
    .select({
      id: claims.id,
      topicId: claims.topicId,
      parentId: claims.parentId,
      relation: claims.relation,
      status: claims.status,
      contentTitle: claims.contentTitle,
      contentBody: claims.contentBody,
      authorId: claims.authorId,
    })
    .from(claims)
    .where(eq(claims.id, claimId))
    .limit(1);
  if (!claim || claim.topicId !== topicId) throw new Error(`Unknown claim ${claimId}`);
  return claim;
}

async function listSiblingTitlesInTx(tx: DbTx, parentId: string): Promise<string[]> {
  const rows = await tx
    .select({ contentTitle: claims.contentTitle })
    .from(claims)
    .where(and(eq(claims.parentId, parentId), eq(claims.status, 'active')));
  return rows.map((row) => row.contentTitle);
}

async function persistAiEntriesInTx(
  tx: DbTx,
  entries: AiCheckEntry[],
  context: AiFlagContext & { claimId: string | null },
) {
  if (entries.length === 0) return;
  await tx.insert(aiFlags).values(
    entries.map((entry) => ({
      claimId: context.claimId,
      kind: entry.kind,
      detail: {
        ...(entry.detail ?? {}),
        message: entry.message ?? null,
        source: entry.source,
        topicId: context.topicId,
        targetClaimId: context.targetClaimId ?? null,
      },
      status: entry.status,
      aiVersion: entry.source === 'llm' ? 'llm-v1' : 'heuristic-v1',
    })),
  );
}

function firstFlaggedError(entries: AiCheckEntry[]): string {
  const flagged = entries.find((entry) => entry.status === 'flagged');
  return flagged?.message ?? '内容未通过程序检查，请按提示修改后再提交';
}

function toOutcome(
  ok: boolean,
  entries: AiCheckEntry[],
  claim?: Claim,
  challenge?: Challenge,
): NodeWriteOutcome {
  if (!ok) return { ok: false, error: firstFlaggedError(entries), entries };
  return {
    ok: true,
    claim: claim as Claim,
    challenge,
    entries,
  };
}

/** 新增支持理由（pro 子节点）：查重 + 侮辱检查，通过后建节点。 */
export async function postSupport(input: {
  topicId: string;
  parentId: string;
  authorId: string;
  title: string;
  body?: string;
}): Promise<NodeWriteOutcome> {
  return db.transaction(async (tx) => {
    const topic = await assertTopicOpenInTx(tx, input.topicId);
    await assertActiveAuthorInTx(tx, input.authorId);
    const parent = await loadClaimInTx(tx, input.topicId, input.parentId);
    if (!topic.allowPublicRebuttal && topic.ownerId !== input.authorId) {
      throw new Error('该话题未开放公开补充与反驳');
    }
    const siblingTitles = await listSiblingTitlesInTx(tx, parent.id);

    const output = await runProgramChecksWithLlm({
      mode: 'support',
      targetTitle: parent.contentTitle,
      targetBody: parent.contentBody,
      title: input.title,
      body: input.body,
      existingTitles: siblingTitles,
    });

    if (!output.passed) {
      await persistAiEntriesInTx(tx, output.entries, {
        topicId: input.topicId,
        targetClaimId: parent.id,
        claimId: null,
      });
      return toOutcome(false, output.entries);
    }

    const claim = await insertClaimInTx(tx, {
      topicId: input.topicId,
      parentId: parent.id,
      relation: 'pro',
      contentTitle: input.title,
      contentBody: input.body,
      authorId: input.authorId,
    });
    await persistAiEntriesInTx(tx, output.entries, {
      topicId: input.topicId,
      targetClaimId: parent.id,
      claimId: claim.id,
    });
    return toOutcome(true, output.entries, claim);
  });
}

/** 发反驳：复述 + 查重 + 侮辱通过后，建 con 节点并挂红（challenge）。 */
export async function postRebutal(input: {
  topicId: string;
  targetClaimId: string;
  authorId: string;
  paraphrase: string;
  title: string;
  body?: string;
}): Promise<NodeWriteOutcome> {
  return db.transaction(async (tx) => {
    const topic = await assertTopicOpenInTx(tx, input.topicId);
    await assertActiveAuthorInTx(tx, input.authorId);
    const target = await loadClaimInTx(tx, input.topicId, input.targetClaimId);
    if (target.authorId === input.authorId) {
      throw new Error('不能反驳自己发布的论点：请让反驳来自另一方');
    }
    if (!topic.allowPublicRebuttal && topic.ownerId !== input.authorId) {
      throw new Error('该话题未开放公开反驳');
    }

    const siblingTitles = await listSiblingTitlesInTx(tx, target.id);
    const output = await runProgramChecksWithLlm({
      mode: 'rebuttal',
      targetTitle: target.contentTitle,
      targetBody: target.contentBody,
      paraphrase: input.paraphrase,
      title: input.title,
      body: input.body,
      existingTitles: siblingTitles,
    });

    if (!output.passed) {
      await persistAiEntriesInTx(tx, output.entries, {
        topicId: input.topicId,
        targetClaimId: target.id,
        claimId: null,
      });
      return toOutcome(false, output.entries);
    }

    const rebuttal = await insertClaimInTx(tx, {
      topicId: input.topicId,
      parentId: target.id,
      relation: 'con',
      contentTitle: input.title,
      contentBody: input.body,
      authorId: input.authorId,
    });
    const challenge = await openChallengeInTx(tx, {
      topicId: input.topicId,
      targetClaimId: target.id,
      challengerClaimId: rebuttal.id,
      actorUserId: input.authorId,
    });
    await persistAiEntriesInTx(tx, output.entries, {
      topicId: input.topicId,
      targetClaimId: target.id,
      claimId: rebuttal.id,
    });
    return toOutcome(true, output.entries, rebuttal, challenge);
  });
}

/** 作者回应挂红：必须是被反驳论点的作者；内容只做查重/侮辱检查（不要求复述）。 */
export async function respondToChallenge(input: {
  challengeId: string;
  authorId: string;
  title: string;
  body?: string;
}): Promise<NodeWriteOutcome> {
  return db.transaction(async (tx) => {
    await assertActiveAuthorInTx(tx, input.authorId);
    const [challenge] = await tx
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
    if (!challenge) throw new Error('Unknown challenge');
    if (challenge.status !== 'open') throw new Error('该反驳已不是未决状态');

    const target = await loadClaimInTx(tx, challenge.topicId, challenge.targetClaimId);
    if (target.authorId !== input.authorId) {
      throw new Error('Only the target claim author can respond');
    }
    if (target.status !== 'challenged') {
      throw new Error(`目标论点当前状态为 ${target.status}，不能回应这条反驳（请刷新查看）`);
    }
    const challenger = await loadClaimInTx(tx, challenge.topicId, challenge.challengerClaimId);
    const siblingTitles = await listSiblingTitlesInTx(tx, challenger.id);

    const output = await runProgramChecksWithLlm({
      mode: 'support',
      targetTitle: challenger.contentTitle,
      targetBody: challenger.contentBody,
      title: input.title,
      body: input.body,
      existingTitles: siblingTitles,
    });
    if (!output.passed) {
      await persistAiEntriesInTx(tx, output.entries, {
        topicId: challenge.topicId,
        targetClaimId: challenger.id,
        claimId: null,
      });
      return toOutcome(false, output.entries);
    }

    const response = await insertClaimInTx(tx, {
      topicId: challenge.topicId,
      parentId: challenger.id,
      relation: 'con',
      contentTitle: input.title,
      contentBody: input.body,
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
    await persistAiEntriesInTx(tx, output.entries, {
      topicId: challenge.topicId,
      targetClaimId: challenger.id,
      claimId: response.id,
    });
    return toOutcome(true, output.entries, response);
  });
}
