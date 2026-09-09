/**
 * M0 种子数据：按"理由层口径"插入两棵演示树（理由层 → 子论点 → 证据）。
 * 运行：pnpm db:seed（需要 DATABASE_URL，先执行迁移）。
 * 幂等：同一标题的话题/论点/论据不会重复插入；可安全重复执行。
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db } from './client';
import { claimEvents, claims, evidence, tags, topicTags, topics, users } from './schema';

const DEMO_USERS = [
  {
    authId: 'demo-user',
    displayName: '想飞的小明',
    bio: '正在学习做一个会认错的人 · 民宿议题发起人',
  },
  {
    authId: 'demo-user-2',
    displayName: '抬杠的阿哲',
    bio: '专挑论证结构里的漏洞 · AI 议题反驳方',
  },
] as const;

async function ensureUsers() {
  const usersById = new Map<string, string>();
  for (const demo of DEMO_USERS) {
    await db
      .insert(users)
      .values({ ...demo })
      .onConflictDoNothing({ target: users.authId });
    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.authId, demo.authId))
      .limit(1);
    if (row) usersById.set(demo.authId, row.id);
  }
  return {
    ownerId: usersById.get('demo-user')!,
    rebutterId: usersById.get('demo-user-2')!,
  };
}

async function findTopicByTitle(title: string) {
  return (
    await db
      .select({ id: topics.id, ownerId: topics.ownerId })
      .from(topics)
      .where(eq(topics.title, title))
      .limit(1)
  )[0];
}

async function findClaim(topicId: string, title: string) {
  return (
    await db
      .select({ id: claims.id, status: claims.status })
      .from(claims)
      .where(and(eq(claims.topicId, topicId), eq(claims.contentTitle, title)))
      .limit(1)
  )[0];
}

async function findEvidence(claimId: string, summary: string) {
  return (
    await db
      .select({ id: evidence.id })
      .from(evidence)
      .where(and(eq(evidence.claimId, claimId), eq(evidence.summary, summary)))
      .limit(1)
  )[0];
}

async function ensureClaim(input: {
  topicId: string;
  parentId: string | null;
  relation: 'root' | 'pro' | 'con';
  contentTitle: string;
  contentBody: string;
  authorId: string;
}): Promise<{ id: string; status: string }> {
  const existing = await findClaim(input.topicId, input.contentTitle);
  if (existing) return existing;

  const parent = input.parentId
    ? (await db.select({ ancestors: claims.ancestors }).from(claims).where(eq(claims.id, input.parentId)).limit(1))[0]
    : null;
  const ancestors = parent ? [...parent.ancestors, input.parentId!] : [];
  const [claim] = await db
    .insert(claims)
    .values({
      topicId: input.topicId,
      parentId: input.parentId,
      relation: input.relation,
      contentTitle: input.contentTitle,
      contentBody: input.contentBody,
      authorId: input.authorId,
      status: 'active',
      depth: ancestors.length,
      ancestors,
    })
    .returning();
  await db.insert(claimEvents).values({
    topicId: input.topicId,
    claimId: claim.id,
    type: 'created',
    actorUserId: input.authorId,
    detail: { parentId: input.parentId, relation: input.relation, seed: true },
  });
  return { id: claim.id, status: claim.status };
}

async function insertEvidence(input: {
  claimId: string;
  kind: 'stat' | 'source' | 'data' | 'experience' | 'other';
  summary: string;
  createdById: string;
}) {
  if (await findEvidence(input.claimId, input.summary)) return;
  await db.insert(evidence).values({
    claimId: input.claimId,
    kind: input.kind,
    summary: input.summary,
    createdById: input.createdById,
    status: 'pending',
  });
}

async function ensureTopicTags(topicId: string, names: string[]) {
  const unique = [...new Set(names)];
  if (unique.length === 0) return;
  await db
    .insert(tags)
    .values(unique.map((name) => ({ name })))
    .onConflictDoNothing({ target: tags.name });
  const tagRows = await db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(inArray(tags.name, unique));
  const existing = await db
    .select({ tagId: topicTags.tagId })
    .from(topicTags)
    .where(eq(topicTags.topicId, topicId));
  const existingIds = new Set(existing.map((row) => row.tagId));
  const missing = tagRows.filter((row) => !existingIds.has(row.id));
  if (missing.length > 0) {
    await db
      .insert(topicTags)
      .values(missing.map((row) => ({ topicId, tagId: row.id })))
      .onConflictDoNothing();
  }
}

async function seedMinsuTree(ownerId: string, rebutterId: string) {
  const topic =
    (await findTopicByTitle('要不要裸辞去大理开民宿？')) ??
    (
      await db
        .insert(topics)
        .values({
          ownerId,
          type: 'decision',
          title: '要不要裸辞去大理开民宿？',
          body: '30 岁，存款约 40 万，大理有朋友愿意合租改造旧院；担心社保断缴与经营亏损，也怕错过现在这股冲动。',
          closeMode: 'owner',
          stakeEnabled: true,
          revealAt: new Date('2026-12-06T00:00:00.000Z'),
        })
        .returning({ id: topics.id, ownerId: topics.ownerId })
    )[0];

  // 已有话题但根立场不匹配（例如被外部改动过）时不再往里补节点
  const root = await ensureClaim({
    topicId: topic.id,
    parentId: null,
    relation: 'root',
    contentTitle: '裸辞去大理开民宿，是实现自由生活的现实路径',
    contentBody: '逃离内卷，把日子过成生活；大理朋友愿意合租旧院，试错成本可控。',
    authorId: ownerId,
  });
  if (root.status === 'active') {
    const pro = await ensureClaim({
      topicId: topic.id,
      parentId: root.id,
      relation: 'pro',
      contentTitle: '先入股旧院试运营半年，试错成本可控',
      contentBody: '朋友愿意转让 20 万入股额度，先试半年再决定是否全职投入，回城退路仍在。',
      authorId: ownerId,
    });
    const con = await ensureClaim({
      topicId: topic.id,
      parentId: root.id,
      relation: 'con',
      contentTitle: '民宿牌照与消防拿证周期常超 6 个月，裸辞后现金流撑不住',
      contentBody: '经营合规前置条件多，拿证周期不可控，全职投入前缺少安全垫。',
      authorId: rebutterId,
    });
    await insertEvidence({
      claimId: root.id,
      kind: 'experience',
      summary: '朋友的大理旧院已试运营两年，转让价 20 万，可先入股试水半年',
      createdById: ownerId,
    });
    await insertEvidence({
      claimId: pro.id,
      kind: 'experience',
      summary: '同院另一股东先兼职试水 5 个月后离职全职，亏损在预算内',
      createdById: ownerId,
    });
    await insertEvidence({
      claimId: con.id,
      kind: 'source',
      summary: '大理民宿牌照与消防审查，实际拿证周期常超过 6 个月',
      createdById: rebutterId,
    });
  }
  return topic;
}

async function seedAiTopicTree(ownerId: string, rebutterId: string) {
  const topic =
    (await findTopicByTitle('AI 编程是否提高效率？')) ??
    (
      await db
        .insert(topics)
        .values({
          ownerId,
          type: 'claim',
          title: 'AI 编程是否提高效率？',
          body: '围绕"AI 编程是垃圾，还是极大地提高了效率"的正反两方演示树，用于广场与对线视图走查。',
        })
        .returning({ id: topics.id, ownerId: topics.ownerId })
    )[0];

  const root = await ensureClaim({
    topicId: topic.id,
    parentId: null,
    relation: 'root',
    contentTitle: '在熟悉代码库的前提下，AI 编程能显著提高开发效率',
    contentBody: '把可检验的主张作为根立场：效率指完成同等功能所需的总时间（含审查与返工）。',
    authorId: ownerId,
  });

  if (root.status === 'active') {
    const pro = await ensureClaim({
      topicId: topic.id,
      parentId: root.id,
      relation: 'pro',
      contentTitle: '样板代码与重复改动占日常开发一半以上，AI 补全能直接压缩这部分时间',
      contentBody: '补全、测试桩、脚手架与批量重构是 AI 最稳定的收益场景。',
      authorId: ownerId,
    });
    const con = await ensureClaim({
      topicId: topic.id,
      parentId: root.id,
      relation: 'con',
      contentTitle: 'AI 生成的代码错误隐蔽，审查与返工成本会吃掉提速',
      contentBody: '不熟悉的依赖与边界条件最容易被"看起来正确"的补全带偏。',
      authorId: rebutterId,
    });
    await insertEvidence({
      claimId: pro.id,
      kind: 'experience',
      summary: '团队 6 人试运行两个月，样板类任务平均耗时约为原先一半',
      createdById: ownerId,
    });
    await insertEvidence({
      claimId: con.id,
      kind: 'experience',
      summary: '同期约两成 AI 相关提交因隐蔽错误返工，集中在并发与边界条件',
      createdById: rebutterId,
    });
  }
  return topic;
}

export async function main() {
  const { ownerId, rebutterId } = await ensureUsers();
  const minsu = await seedMinsuTree(ownerId, rebutterId);
  const ai = await seedAiTopicTree(ownerId, rebutterId);
  await ensureTopicTags(minsu.id, ['职业', '生活方式', '创业']);
  await ensureTopicTags(ai.id, ['科技', '公共议题']);
  console.log('seed done:', { minsuTopic: minsu.id, aiTopic: ai.id });
}
