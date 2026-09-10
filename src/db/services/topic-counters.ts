import { and, count, eq, ne } from 'drizzle-orm';
import type { DbTx } from '@/db/client';
import { challenges, claims, conclusionItems, predictions, topics } from '@/db/schema';

/**
 * 事务内重算话题计数列，保证反规范化计数与明细始终一致。
 * node_count：未折叠论点；open_challenge_count：未决反驳；
 * adopted_count：当前结论书版本采纳条目；prediction_count：未作废押注。
 */
export async function refreshTopicCountersInTx(tx: DbTx, topicId: string): Promise<void> {
  const [nodeRow] = await tx
    .select({ value: count() })
    .from(claims)
    .where(and(eq(claims.topicId, topicId), ne(claims.status, 'collapsed')));
  const [openRow] = await tx
    .select({ value: count() })
    .from(challenges)
    .where(and(eq(challenges.topicId, topicId), eq(challenges.status, 'open')));
  const [predictionRow] = await tx
    .select({ value: count() })
    .from(predictions)
    .where(and(eq(predictions.topicId, topicId), ne(predictions.status, 'void')));
  const [topicRow] = await tx
    .select({ currentVersionId: topics.currentVersionId })
    .from(topics)
    .where(eq(topics.id, topicId))
    .limit(1);

  let adoptedCount = 0;
  if (topicRow?.currentVersionId) {
    const [adoptedRow] = await tx
      .select({ value: count() })
      .from(conclusionItems)
      .where(eq(conclusionItems.versionId, topicRow.currentVersionId));
    adoptedCount = adoptedRow?.value ?? 0;
  }

  await tx
    .update(topics)
    .set({
      currentNodeCount: nodeRow?.value ?? 0,
      openChallengeCount: openRow?.value ?? 0,
      adoptedCount,
      predictionCount: predictionRow?.value ?? 0,
      lastActivityAt: new Date(),
    })
    .where(eq(topics.id, topicId));
}
