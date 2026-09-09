import { eq, inArray } from 'drizzle-orm';
import { db, type Db } from '@/db/client';
import { claimEvents, claims, evidence, tags, topicTags, topics, users } from '@/db/schema';
import type { OwnerLean, TopicType } from '@/lib/domain/publish';

/**
 * 发起话题发布事务（M2 验收点）：
 * topic + 理由层根立场 + 可选首条论据 + tags 在单事务内落库，
 * 并写一条根立场 created 事件（初始倾向存事件 detail，作为可审计线索）。
 */

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface PublishTopicInput {
  ownerId: string;
  type: TopicType;
  title: string;
  body?: string;
  stance: string;
  lean: OwnerLean;
  tagNames?: string[];
  evidenceSummary?: string;
  stakeEnabled: boolean;
  revealAt: Date | null;
  bountyEnabled: boolean;
  allowPublicRebuttal: boolean;
}

export interface PublishTopicResult {
  topic: typeof topics.$inferSelect;
  root: typeof claims.$inferSelect;
}

async function ensureTagRows(tx: Tx, names: string[]) {
  const unique = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
  if (unique.length === 0) return [];
  await tx
    .insert(tags)
    .values(unique.map((name) => ({ name })))
    .onConflictDoNothing({ target: tags.name });
  return tx
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(inArray(tags.name, unique));
}

export async function publishTopic(input: PublishTopicInput): Promise<PublishTopicResult> {
  return db.transaction(async (tx) => {
    const ownerRows = await tx
      .select({ id: users.id, status: users.status })
      .from(users)
      .where(eq(users.id, input.ownerId))
      .limit(1);
    const owner = ownerRows[0];
    if (!owner || owner.status !== 'active') throw new Error('Unknown or inactive owner');

    const [topic] = await tx
      .insert(topics)
      .values({
        ownerId: input.ownerId,
        type: input.type,
        status: 'open',
        title: input.title.trim(),
        body: input.body?.trim() || null,
        visibility: 'public',
        allowPublicRebuttal: input.allowPublicRebuttal,
        closeMode: input.type === 'claim' ? 'community' : 'owner',
        stakeEnabled: input.stakeEnabled,
        revealAt: input.stakeEnabled ? input.revealAt : null,
        bountyEnabled: input.bountyEnabled,
        currentNodeCount: 1,
        openChallengeCount: 0,
        adoptedCount: 0,
        predictionCount: 0,
      })
      .returning();

    const [root] = await tx
      .insert(claims)
      .values({
        topicId: topic.id,
        parentId: null,
        relation: 'root',
        contentTitle: input.stance.trim(),
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
      detail: {
        parentId: null,
        relation: 'root',
        ownerLean: input.lean,
        source: 'wizard',
      },
    });

    const evidenceSummary = input.evidenceSummary?.trim();
    if (evidenceSummary) {
      await tx.insert(evidence).values({
        claimId: root.id,
        kind: 'other',
        summary: evidenceSummary,
        createdById: input.ownerId,
        status: 'pending',
      });
    }

    const tagRows = await ensureTagRows(tx, input.tagNames ?? []);
    if (tagRows.length > 0) {
      await tx
        .insert(topicTags)
        .values(tagRows.map((tag) => ({ topicId: topic.id, tagId: tag.id })))
        .onConflictDoNothing();
    }

    return { topic, root };
  });
}
