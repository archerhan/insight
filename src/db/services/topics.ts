import { cache } from 'react';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { challenges, claims, tags, topicTags, topics, users } from '@/db/schema';
import type { TopicType } from '@/lib/domain/publish';

/**
 * 话题公开读服务（M2 落点页）：按数据库设计"话题/论点公开读"口径，
 * 只返回 public 话题；理由层取当前仍有效的根立场（击杀链提升后自然切换）。
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface TopicDetail {
  id: string;
  type: TopicType;
  title: string;
  body: string | null;
  status: string;
  closeMode: string;
  stakeEnabled: boolean;
  revealAt: Date | null;
  bountyEnabled: boolean;
  allowPublicRebuttal: boolean;
  createdAt: Date;
  ownerName: string | null;
  ownerAvatarUrl: string | null;
  tags: string[];
  rootClaims: Array<{ id: string; contentTitle: string; status: string; authorName: string | null }>;
  nodeCount: number;
  openChallengeCount: number;
}

async function getPublicTopicDetailImpl(id: string): Promise<TopicDetail | null> {
  if (!UUID_RE.test(id)) return null;

  const rows = await db
    .select({
      id: topics.id,
      type: topics.type,
      title: topics.title,
      body: topics.body,
      status: topics.status,
      closeMode: topics.closeMode,
      stakeEnabled: topics.stakeEnabled,
      revealAt: topics.revealAt,
      bountyEnabled: topics.bountyEnabled,
      allowPublicRebuttal: topics.allowPublicRebuttal,
      createdAt: topics.createdAt,
      ownerName: users.displayName,
      ownerAvatarUrl: users.avatarUrl,
    })
    .from(topics)
    .leftJoin(users, eq(topics.ownerId, users.id))
    .where(and(eq(topics.id, id), eq(topics.visibility, 'public')))
    .limit(1);
  const topic = rows[0];
  if (!topic) return null;

  // 四组查询互不依赖，并行发出；总耗时从“4 次往返串行”降到单次往返量级
  const [tagRows, rootRows, challengeRows, nodeCountRows] = await Promise.all([
    db
      .select({ name: tags.name })
      .from(topicTags)
      .innerJoin(tags, eq(topicTags.tagId, tags.id))
      .where(eq(topicTags.topicId, id)),
    db
      .select({
        id: claims.id,
        contentTitle: claims.contentTitle,
        status: claims.status,
        authorName: users.displayName,
      })
      .from(claims)
      .leftJoin(users, eq(claims.authorId, users.id))
      .where(
        and(
          eq(claims.topicId, id),
          isNull(claims.parentId),
          eq(claims.relation, 'root'),
          eq(claims.status, 'active'),
        ),
      )
      .orderBy(asc(claims.createdAt))
      .limit(6),
    db
      .select({ id: challenges.id })
      .from(challenges)
      .where(and(eq(challenges.topicId, id), eq(challenges.status, 'open'))),
    db.select({ id: claims.id }).from(claims).where(eq(claims.topicId, id)),
  ]);

  return {
    id: topic.id,
    type: topic.type === 'claim' ? 'claim' : 'decision',
    title: topic.title,
    body: topic.body,
    status: topic.status,
    closeMode: topic.closeMode,
    stakeEnabled: topic.stakeEnabled,
    revealAt: topic.revealAt,
    bountyEnabled: topic.bountyEnabled,
    allowPublicRebuttal: topic.allowPublicRebuttal,
    createdAt: topic.createdAt,
    ownerName: topic.ownerName,
    ownerAvatarUrl: topic.ownerAvatarUrl,
    tags: tagRows.map((row) => row.name),
    rootClaims: rootRows,
    nodeCount: nodeCountRows.length,
    openChallengeCount: challengeRows.length,
  };
}

/**
 * 请求级去重：同一请求内 generateMetadata 与页面渲染共享一次查询。
 * （cache 只在 RSC 请求作用域内生效，脚本/集成测试不受影响。）
 */
export const getPublicTopicDetail = cache(getPublicTopicDetailImpl);
