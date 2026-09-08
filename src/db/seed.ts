/**
 * M0 种子数据：按"理由层口径"插入演示话题。
 * 运行：pnpm db:seed（需要 DATABASE_URL，先执行迁移）。
 */
import { eq } from 'drizzle-orm';
import { config } from 'dotenv';
import { db } from './client';
import { claimEvents, claims, evidence, topics, users } from './schema';

config({ path: ['.env.local', '.env'] });

async function main() {
  const [demoUser] = await db
    .insert(users)
    .values({
      displayName: '想飞的小明',
      bio: '正在学习做一个会认错的人 · 民宿议题发起人',
      authId: 'demo-user',
    })
    .onConflictDoNothing({ target: users.authId })
    .returning();

  const userId =
    demoUser?.id ??
    (await db.select({ id: users.id }).from(users).where(eq(users.authId, 'demo-user')).limit(1))[0].id;

  const [topic] = await db
    .insert(topics)
    .values({
      ownerId: userId,
      type: 'decision',
      title: '要不要裸辞去大理开民宿？',
      body: '30 岁，存款约 40 万，大理有朋友愿意合租改造旧院；担心社保断缴与经营亏损，也怕错过现在这股冲动。',
      closeMode: 'owner',
      stakeEnabled: true,
      revealAt: new Date('2026-12-06T00:00:00.000Z'),
      currentNodeCount: 1,
    })
    .returning();

  const [root] = await db
    .insert(claims)
    .values({
      topicId: topic.id,
      parentId: null,
      relation: 'root',
      contentTitle: '裸辞去大理开民宿，是实现自由生活的现实路径',
      contentBody: '逃离内卷，把日子过成生活；大理朋友愿意合租旧院，试错成本可控。',
      authorId: userId,
      status: 'active',
      depth: 0,
      ancestors: [],
    })
    .returning();

  await db.insert(evidence).values({
    claimId: root.id,
    kind: 'experience',
    summary: '朋友的大理旧院已试运营两年，转让价 20 万，可先入股试水半年',
    createdById: userId,
    status: 'pending',
  });
  await db.insert(claimEvents).values({
    topicId: topic.id,
    claimId: root.id,
    type: 'created',
    actorUserId: userId,
  });

  console.log('seed done:', { topic: topic.id, root: root.id, user: userId });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
