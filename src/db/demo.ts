/**
 * M0 验收走查脚本：用树操作事务层把一棵演示树从
 * "反驳挂上（challenge 自动建立）"走到"击穿并自动提升击杀链顶端"，
 * 最后打印论点状态与 claim_events 时间轴，验证事件表可回放。
 *
 * 运行：先 pnpm db:seed（准备演示用户），再 pnpm db:demo。
 * 幂等：已走查过的话题不会重复击穿，会直接回放时间轴；
 * 上次中断在"已挂反驳未承认"时，会补齐承认再回放。
 */
import { and, asc, eq } from 'drizzle-orm';
import { db } from './client';
import { challenges, claimEvents, claims, topics, users } from './schema';
import {
  attachRebuttal,
  concedeToChallenge,
  createClaimUnder,
  createTopicWithRoot,
} from './services/tree';

const DEMO_TOPIC_TITLE = 'M0 走查 · 反驳到击穿自动提升';
const ROOT_TITLE = '裸辞去大理开民宿，是实现自由生活的现实路径';
const PRO_TITLE = '先入股旧院试运营半年可验证可行性';
const REBUTTAL_TITLE = '社保断缴与旺季不可测会让试错成本失控';

export async function main() {
  const owner = (
    await db.select({ id: users.id }).from(users).where(eq(users.authId, 'demo-user')).limit(1)
  )[0];
  const rebutter = (
    await db.select({ id: users.id }).from(users).where(eq(users.authId, 'demo-user-2')).limit(1)
  )[0];
  if (!owner || !rebutter) {
    throw new Error('缺少演示用户，请先运行 pnpm db:seed');
  }

  let topic = (
    await db.select({ id: topics.id }).from(topics).where(eq(topics.title, DEMO_TOPIC_TITLE)).limit(1)
  )[0];

  let rootId: string;
  if (!topic) {
    const created = await createTopicWithRoot({
      ownerId: owner.id,
      type: 'decision',
      title: DEMO_TOPIC_TITLE,
      body: 'M0 验收走查专用：演示反驳挂上 → 作者承认击穿 → 击杀链顶端自动提升为理由层。',
      rootContentTitle: ROOT_TITLE,
      rootContentBody: '逃离内卷，把日子过成生活；大理朋友愿意合租旧院，试错成本可控。',
    });
    topic = { id: created.topic.id };
    rootId = created.root.id;
    await createClaimUnder({
      topicId: topic.id,
      parentId: rootId,
      relation: 'pro',
      contentTitle: PRO_TITLE,
      contentBody: '朋友愿意转让 20 万入股额度，先试半年再决定，回城退路仍在。',
      authorId: owner.id,
    });
    const challenge = await attachRebuttal({
      topicId: topic.id,
      targetClaimId: rootId,
      contentTitle: REBUTTAL_TITLE,
      contentBody: '试运营半年验证不了旺季现金流，也覆盖不了社保断缴后的长期风险。',
      authorId: rebutter.id,
    });
    await concedeToChallenge({ challengeId: challenge.id, actorId: owner.id });
    console.log('走查完成：反驳已挂上并被承认击穿，击杀链已自动提升。\n');
  } else {
    const root = (
      await db
        .select({ id: claims.id, status: claims.status })
        .from(claims)
        .where(and(eq(claims.topicId, topic.id), eq(claims.contentTitle, ROOT_TITLE)))
        .limit(1)
    )[0];
    if (!root) throw new Error(`走查话题已存在但找不到根立场：${ROOT_TITLE}`);
    rootId = root.id;

    const rebuttal = (
      await db
        .select({ id: claims.id })
        .from(claims)
        .where(and(eq(claims.topicId, topic.id), eq(claims.contentTitle, REBUTTAL_TITLE)))
        .limit(1)
    )[0];
    const openChallenge = (
      await db
        .select({ id: challenges.id })
        .from(challenges)
        .where(
          and(
            eq(challenges.topicId, topic.id),
            eq(challenges.targetClaimId, rootId),
            eq(challenges.status, 'open'),
          ),
        )
        .limit(1)
    )[0];

    if (root.status === 'active' && !rebuttal) {
      const challenge = await attachRebuttal({
        topicId: topic.id,
        targetClaimId: rootId,
        contentTitle: REBUTTAL_TITLE,
        contentBody: '试运营半年验证不了旺季现金流，也覆盖不了社保断缴后的长期风险。',
        authorId: rebutter.id,
      });
      await concedeToChallenge({ challengeId: challenge.id, actorId: owner.id });
      console.log('补齐上次中断的走查：本轮挂上反驳并承认击穿。\n');
    } else if (root.status === 'challenged' && openChallenge) {
      await concedeToChallenge({ challengeId: openChallenge.id, actorId: owner.id });
      console.log('补齐上次中断的走查：对已挂上的反驳承认击穿。\n');
    } else {
      console.log('该走查话题已完成（或无需再推进），直接回放事件时间轴。\n');
    }
  }

  const claimRows = await db
    .select({
      id: claims.id,
      contentTitle: claims.contentTitle,
      relation: claims.relation,
      status: claims.status,
      depth: claims.depth,
    })
    .from(claims)
    .where(eq(claims.topicId, topic.id))
    .orderBy(asc(claims.createdAt));

  console.log('=== 走查结果：树状态 ===');
  for (const row of claimRows) {
    console.log(
      `${'  '.repeat(Math.min(row.depth, 6))}[${row.relation}/${row.status}] ${row.contentTitle} (${row.id})`,
    );
  }

  const eventRows = await db
    .select({
      id: claimEvents.id,
      claimId: claimEvents.claimId,
      type: claimEvents.type,
      detail: claimEvents.detail,
      createdAt: claimEvents.createdAt,
    })
    .from(claimEvents)
    .where(eq(claimEvents.topicId, topic.id))
    .orderBy(asc(claimEvents.id));

  console.log('\n=== 事件时间轴（可回放） ===');
  for (const event of eventRows) {
    const phase = event.detail && typeof event.detail.phase === 'string' ? ` phase=${event.detail.phase}` : '';
    console.log(
      `#${event.id} ${event.createdAt.toISOString()} ${event.type} claim=${event.claimId ?? '-'}${phase}`,
    );
  }
  console.log(`\n共 ${eventRows.length} 条事件。`);
}
