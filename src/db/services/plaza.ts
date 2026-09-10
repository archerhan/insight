import { and, asc, desc, eq, gt, inArray, isNotNull } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  challenges,
  claims,
  conclusionItems,
  conclusionVersions,
  stanceChanges,
  tags,
  topicTags,
  topics,
  users,
} from '@/db/schema';
import type { TopicType } from '@/lib/domain/publish';

/**
 * 广场读服务（M2，按《数据库设计》第六节查询模板落地）：
 * - 正在对线：status=open 的公开话题，按 last_activity_at 排序；
 * - 最新结论书：已发布结论书版本（current_version_id 指向 published）；
 * - 即将揭晓：stake_enabled 且有未来 reveal_at 的公开个人决策话题（第一版不含公共议题）；
 * - 右侧战绩速览：从可回溯的账本/事件表派生计数。
 * 计数不依赖反规范化列，读取时按真实数据聚合，避免后续 worker 未更新时展示失真。
 */

const ACTIVE_ROOT_STATUSES = ['active', 'challenged', 'responded', 'disputed'];

export interface PlazaOpenTopic {
  id: string;
  type: TopicType;
  title: string;
  body: string | null;
  stakeEnabled: boolean;
  revealAt: Date | null;
  lastActivityAt: Date;
  createdAt: Date;
  rootStance: string | null;
  rootAuthorName: string | null;
  tags: string[];
  nodeCount: number;
  openChallengeCount: number;
  participantCount: number;
}

export interface PlazaConclusion {
  topicId: string;
  type: TopicType;
  title: string;
  versionNo: number;
  verdictText: string;
  settlement: string;
  publishedAt: Date | null;
  adoptedCount: number;
}

export interface PlazaReveal {
  id: string;
  type: TopicType;
  title: string;
  revealAt: Date;
  ownerName: string | null;
  predictionCount: number;
}

export interface PlazaUserSummary {
  topicCount: number;
  adoptedCount: number;
  honestyCount: number;
}

export interface PlazaData {
  openTopics: PlazaOpenTopic[];
  conclusions: PlazaConclusion[];
  upcomingReveals: PlazaReveal[];
}

function asTopicType(value: string): TopicType {
  return value === 'claim' ? 'claim' : 'decision';
}

async function tagNamesByTopic(topicIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (topicIds.length === 0) return map;
  const rows = await db
    .select({ topicId: topicTags.topicId, name: tags.name })
    .from(topicTags)
    .innerJoin(tags, eq(topicTags.tagId, tags.id))
    .where(inArray(topicTags.topicId, topicIds));
  for (const row of rows) {
    const list = map.get(row.topicId) ?? [];
    if (!list.includes(row.name)) list.push(row.name);
    map.set(row.topicId, list);
  }
  return map;
}

export async function getPlazaSections(limit = 8): Promise<PlazaData> {
  // 三大板块互不依赖，第一轮并行发出
  const [openTopicRows, conclusionRows, revealRows] = await Promise.all([
    db
      .select({
        id: topics.id,
        type: topics.type,
        title: topics.title,
        body: topics.body,
        stakeEnabled: topics.stakeEnabled,
        revealAt: topics.revealAt,
        lastActivityAt: topics.lastActivityAt,
        createdAt: topics.createdAt,
        predictionCount: topics.predictionCount,
      })
      .from(topics)
      .where(and(eq(topics.status, 'open'), eq(topics.visibility, 'public')))
      .orderBy(desc(topics.lastActivityAt))
      .limit(limit),
    db
      .select({
        topicId: topics.id,
        type: topics.type,
        title: topics.title,
        versionNo: conclusionVersions.versionNo,
        verdictText: conclusionVersions.verdictText,
        settlement: conclusionVersions.settlement,
        publishedAt: conclusionVersions.publishedAt,
        versionId: conclusionVersions.id,
      })
      .from(topics)
      .innerJoin(conclusionVersions, eq(topics.currentVersionId, conclusionVersions.id))
      .where(and(eq(conclusionVersions.status, 'published'), eq(topics.visibility, 'public')))
      .orderBy(desc(conclusionVersions.publishedAt))
      .limit(limit),
    db
      .select({
        id: topics.id,
        type: topics.type,
        title: topics.title,
        revealAt: topics.revealAt,
        predictionCount: topics.predictionCount,
        ownerName: users.displayName,
      })
      .from(topics)
      .leftJoin(users, eq(topics.ownerId, users.id))
      .where(
        and(
          eq(topics.status, 'open'),
          eq(topics.visibility, 'public'),
          eq(topics.type, 'decision'),
          eq(topics.stakeEnabled, true),
          isNotNull(topics.revealAt),
          gt(topics.revealAt, new Date()),
        ),
      )
      .orderBy(asc(topics.revealAt))
      .limit(limit),
  ]);

  const openTopicIds = openTopicRows.map((row) => row.id);
  const versionIds = conclusionRows.map((row) => row.versionId);

  // 第二轮：依赖第一轮结果的明细查询，同样并行
  const [tagMap, challengeRows, claimRows, itemRows] = await Promise.all([
    tagNamesByTopic(openTopicIds),
    openTopicIds.length
      ? db
          .select({ topicId: challenges.topicId, id: challenges.id })
          .from(challenges)
          .where(and(inArray(challenges.topicId, openTopicIds), eq(challenges.status, 'open')))
      : Promise.resolve([]),
    openTopicIds.length
      ? db
          .select({
            id: claims.id,
            topicId: claims.topicId,
            parentId: claims.parentId,
            relation: claims.relation,
            status: claims.status,
            contentTitle: claims.contentTitle,
            authorId: claims.authorId,
            createdAt: claims.createdAt,
            authorName: users.displayName,
          })
          .from(claims)
          .leftJoin(users, eq(claims.authorId, users.id))
          .where(inArray(claims.topicId, openTopicIds))
      : Promise.resolve([]),
    versionIds.length
      ? db
          .select({ versionId: conclusionItems.versionId, id: conclusionItems.id })
          .from(conclusionItems)
          .where(inArray(conclusionItems.versionId, versionIds))
      : Promise.resolve([]),
  ]);
  const challengeCounts = new Map<string, number>();
  for (const row of challengeRows) {
    challengeCounts.set(row.topicId, (challengeCounts.get(row.topicId) ?? 0) + 1);
  }
  const itemCounts = new Map<string, number>();
  for (const row of itemRows) {
    itemCounts.set(row.versionId, (itemCounts.get(row.versionId) ?? 0) + 1);
  }

  const openTopics: PlazaOpenTopic[] = openTopicRows.map((topic) => {
    const topicClaims = claimRows.filter((row) => row.topicId === topic.id);
    const activeRoot = topicClaims.find(
      (row) =>
        row.parentId === null &&
        row.relation === 'root' &&
        ACTIVE_ROOT_STATUSES.includes(row.status),
    );
    return {
      id: topic.id,
      type: asTopicType(topic.type),
      title: topic.title,
      body: topic.body,
      stakeEnabled: topic.stakeEnabled,
      revealAt: topic.revealAt,
      lastActivityAt: topic.lastActivityAt,
      createdAt: topic.createdAt,
      rootStance: activeRoot?.contentTitle ?? null,
      rootAuthorName: activeRoot?.authorName ?? null,
      tags: tagMap.get(topic.id) ?? [],
      nodeCount: topicClaims.length,
      openChallengeCount: challengeCounts.get(topic.id) ?? 0,
      participantCount: new Set(topicClaims.map((row) => row.authorId)).size,
    };
  });

  const conclusions: PlazaConclusion[] = conclusionRows.map((row) => ({
    topicId: row.topicId,
    type: asTopicType(row.type),
    title: row.title,
    versionNo: row.versionNo,
    verdictText: row.verdictText,
    settlement: row.settlement,
    publishedAt: row.publishedAt,
    adoptedCount: itemCounts.get(row.versionId) ?? 0,
  }));

  const upcomingReveals: PlazaReveal[] = revealRows.map((row) => ({
    id: row.id,
    type: asTopicType(row.type),
    title: row.title,
    revealAt: row.revealAt as Date,
    ownerName: row.ownerName,
    predictionCount: row.predictionCount,
  }));

  return { openTopics, conclusions, upcomingReveals };
}

export async function getUserPlazaSummary(userId: string): Promise<PlazaUserSummary> {
  // 三组计数互相独立，并行查询（adopted 用 join 一次取出，避免二次子查询）
  const [topicRows, honestyRows, adoptedRows] = await Promise.all([
    db.select({ id: topics.id }).from(topics).where(eq(topics.ownerId, userId)),
    db
      .select({ id: stanceChanges.id })
      .from(stanceChanges)
      .where(eq(stanceChanges.userId, userId)),
    db
      .select({ id: conclusionItems.id })
      .from(conclusionItems)
      .innerJoin(claims, eq(conclusionItems.claimId, claims.id))
      .where(eq(claims.authorId, userId)),
  ]);

  return {
    topicCount: topicRows.length,
    honestyCount: honestyRows.length,
    adoptedCount: adoptedRows.length,
  };
}
