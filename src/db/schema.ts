import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * 灼见 M0 表结构（对应《数据库设计.md》v0.2 的 P0 集合 + 闭环最小补充）。
 * 状态字段用 text + 应用层校验（见 src/lib/domain），便于后续演进。
 */

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  authId: text('auth_id').unique(),
  /** 邮箱登录标识（统一小写存储）；GitHub 用户暂不写入。 */
  email: text('email').unique(),
  /** scrypt 哈希（格式见 src/lib/auth/password.ts）；仅邮箱注册用户有值。 */
  passwordHash: text('password_hash'),
  /** 最近一次设置/重置密码的时间：用于让旧会话（JWT）失效。 */
  passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),
  /** 邮箱验证通过时间（注册验证码校验通过时写入）。 */
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  displayName: text('display_name').notNull(),
  avatarUrl: text('avatar_url'),
  bio: text('bio'),
  courseCompletedAt: timestamp('course_completed_at', { withTimezone: true }),
  coinBalance: bigint('coin_balance', { mode: 'number' }).notNull().default(0),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * 一次性令牌：邮箱注册/找回密码等场景。
 * 只落库 sha256 摘要（原文只在邮件链接里），带有效期与使用时间，单次有效。
 */
export const userTokens = pgTable(
  'user_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // password_reset | email_verification
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('user_tokens_token_hash_idx').on(table.tokenHash),
    index('user_tokens_user_type_idx').on(table.userId, table.type),
  ],
);

/**
 * 邮箱验证码：注册时证明邮箱归属。
 * 只存 HMAC-SHA256 摘要（密钥用 AUTH_SECRET），带有效期、尝试次数与消费时间。
 * 注册阶段用户还不存在，所以不复用 user_tokens（那里 user_id 是必填外键）。
 */
export const emailVerificationCodes = pgTable(
  'email_verification_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    purpose: text('purpose').notNull().default('signup'), // signup | ...
    codeHash: text('code_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('email_verification_codes_email_idx').on(table.email, table.purpose)],
);

export const topics = pgTable(
  'topics',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id),
    type: text('type').notNull(), // decision | claim
    status: text('status').notNull().default('open'), // open | converged | risk_closed
    title: text('title').notNull(),
    body: text('body'),
    visibility: text('visibility').notNull().default('public'),
    allowPublicRebuttal: boolean('allow_public_rebuttal').notNull().default(true),
    closeMode: text('close_mode').notNull().default('owner'),
    stakeEnabled: boolean('stake_enabled').notNull().default(false),
    revealAt: timestamp('reveal_at', { withTimezone: true }),
    bountyEnabled: boolean('bounty_enabled').notNull().default(false),
    currentNodeCount: integer('node_count').notNull().default(0),
    adoptedCount: integer('adopted_count').notNull().default(0),
    openChallengeCount: integer('open_challenge_count').notNull().default(0),
    predictionCount: integer('prediction_count').notNull().default(0),
    currentVersionId: uuid('current_version_id'),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('topics_last_activity_idx').on(table.lastActivityAt)],
);

export const tags = pgTable('tags', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const topicTags = pgTable(
  'topic_tags',
  {
    topicId: uuid('topic_id')
      .notNull()
      .references(() => topics.id),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id),
  },
  (table) => [uniqueIndex('topic_tags_topic_tag_idx').on(table.topicId, table.tagId)],
);

export const claims = pgTable(
  'claims',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => topics.id),
    parentId: uuid('parent_id'),
    relation: text('relation').notNull(), // root | pro | con | addon | question
    contentTitle: text('content_title').notNull(),
    contentBody: text('content_body'),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id),
    status: text('status').notNull().default('pending'),
    depth: integer('depth').notNull().default(0),
    ancestors: uuid('ancestors').array().notNull().default(sql`'{}'::uuid[]`),
    supersedesClaimId: uuid('supersedes_claim_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('claims_topic_parent_idx').on(table.topicId, table.parentId),
    index('claims_topic_ancestors_idx').using('gin', table.ancestors),
    index('claims_status_idx').on(table.status),
  ],
);

export const claimTags = pgTable(
  'claim_tags',
  {
    claimId: uuid('claim_id')
      .notNull()
      .references(() => claims.id),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id),
  },
  (table) => [uniqueIndex('claim_tags_claim_tag_idx').on(table.claimId, table.tagId)],
);

export const evidence = pgTable('evidence', {
  id: uuid('id').primaryKey().defaultRandom(),
  claimId: uuid('claim_id')
    .notNull()
    .references(() => claims.id),
  kind: text('kind').notNull().default('source'),
  summary: text('summary').notNull(),
  sourceTitle: text('source_title'),
  url: text('url'),
  status: text('status').notNull().default('pending'),
  verifierUserId: uuid('verifier_user_id').references(() => users.id),
  createdById: uuid('created_by_id')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const challenges = pgTable(
  'challenges',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => topics.id),
    targetClaimId: uuid('target_claim_id')
      .notNull()
      .references(() => claims.id),
    challengerClaimId: uuid('challenger_claim_id')
      .notNull()
      .references(() => claims.id),
    status: text('status').notNull().default('open'),
    resolutionReason: text('resolution_reason'),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    orangeAt: timestamp('orange_at', { withTimezone: true }),
    redAt: timestamp('red_at', { withTimezone: true }),
    defaultLossAt: timestamp('default_loss_at', { withTimezone: true }),
    respondedClaimId: uuid('responded_claim_id').references(() => claims.id),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('challenges_target_challenger_idx').on(table.targetClaimId, table.challengerClaimId),
    index('challenges_status_deadline_idx').on(table.status, table.defaultLossAt),
  ],
);

export const claimEvents = pgTable(
  'claim_events',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => topics.id),
    claimId: uuid('claim_id').references(() => claims.id),
    type: text('type').notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    detail: jsonb('detail').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('claim_events_topic_time_idx').on(table.topicId, table.createdAt)],
);

export const stanceChanges = pgTable(
  'stance_changes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => topics.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    fromStance: text('from_stance').notNull(),
    toStance: text('to_stance').notNull(),
    sourceClaimId: uuid('source_claim_id').references(() => claims.id),
    persuaderUserId: uuid('persuader_user_id').references(() => users.id),
    statement: text('statement').notNull(),
    noveltyPass: boolean('novelty_pass').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('stance_changes_topic_user_idx').on(table.topicId, table.userId)],
);

export const reputationEvents = pgTable('reputation_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  type: text('type').notNull(),
  outcome: text('outcome').notNull().default('neutral'),
  claimId: uuid('claim_id').references(() => claims.id),
  topicId: uuid('topic_id').references(() => topics.id),
  weight: numeric('weight', { precision: 5, scale: 2 }).notNull().default('1'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
});

export const conclusionVersions = pgTable(
  'conclusion_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => topics.id),
    versionNo: integer('version_no').notNull(),
    status: text('status').notNull().default('draft'),
    verdictText: text('verdict_text').notNull(),
    recommendationText: text('recommendation_text'),
    premises: text('premises'),
    settlement: text('settlement').notNull().default('provisional'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    summarySnapshot: jsonb('summary_snapshot').$type<Record<string, unknown>>(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('conclusion_versions_topic_no_idx').on(table.topicId, table.versionNo)],
);

export const conclusionItems = pgTable(
  'conclusion_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    versionId: uuid('version_id')
      .notNull()
      .references(() => conclusionVersions.id),
    claimId: uuid('claim_id')
      .notNull()
      .references(() => claims.id),
    position: integer('position').notNull(),
    role: text('role').notNull().default('adopted_reason'),
    /** 发布时的正文标题与作者名快照，避免后续改名改写历史结论。 */
    contentTitle: text('content_title'),
    authorName: text('author_name'),
    supportChain: jsonb('support_chain').$type<
      Array<{
        claimId: string;
        contentTitle: string;
        authorId: string;
        authorName?: string | null;
        evidenceIds?: string[];
      }>
    >(),
    note: text('note'),
    adoptedByUserId: uuid('adopted_by_user_id').references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('conclusion_items_version_idx').on(table.versionId)],
);

/**
 * M5 闭环补充表（对应《数据库设计.md》v0.2 的 P1 集合最小列）：
 * - predictions / reality_checks：立帖为证登记与揭晓（记录级，不开放可花费逻辑币）；
 * - decision_followups：结论书发布后 T+30/90/180 楼主回访；
 * - notifications：站内通知最小集（挂红阶段、揭晓/回访提醒）；
 * - user_stats：战绩速览（源数据在账本/事件表，本表为可重算物化结果）。
 */

export const realityChecks = pgTable(
  'reality_checks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => topics.id),
    targetClaimId: uuid('target_claim_id').references(() => claims.id),
    kind: text('kind').notNull().default('decision'), // decision | claim
    result: text('result').notNull(), // regret | no_regret | partial | void | affirmed | refuted
    decidedBy: text('decided_by').notNull().default('user'), // auto | user | jury
    evidenceNote: text('evidence_note'),
    sourceUrl: text('source_url'),
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('reality_checks_topic_idx').on(table.topicId)],
);

export const predictions = pgTable(
  'predictions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => topics.id),
    bettorId: uuid('bettor_id')
      .notNull()
      .references(() => users.id),
    targetType: text('target_type').notNull().default('decision'), // decision | claim
    targetClaimId: uuid('target_claim_id').references(() => claims.id),
    statement: text('statement').notNull(),
    predictedOutcome: text('predicted_outcome').notNull(), // regret | no_regret
    amount: bigint('amount', { mode: 'number' }).notNull().default(0),
    multiplier: numeric('multiplier', { precision: 6, scale: 2 }).notNull().default('1'),
    status: text('status').notNull().default('open'), // open | hit | miss | void
    realityCheckId: uuid('reality_check_id').references(() => realityChecks.id),
    payout: bigint('payout', { mode: 'number' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('predictions_topic_bettor_idx').on(table.topicId, table.bettorId),
    index('predictions_bettor_idx').on(table.bettorId),
    index('predictions_topic_status_idx').on(table.topicId, table.status),
  ],
);

export const decisionFollowups = pgTable(
  'decision_followups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => topics.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    wave: integer('wave').notNull(), // 30 / 90 / 180
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    regretLevel: text('regret_level'),
    mostValuableClaimId: uuid('most_valuable_claim_id').references(() => claims.id),
    status: text('status').notNull().default('pending'), // pending | done | skipped
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('decision_followups_topic_wave_idx').on(table.topicId, table.wave),
    index('decision_followups_due_idx').on(table.dueAt, table.status),
  ],
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    type: text('type').notNull(), // challenge_timer | reveal_reminder | followup_due | reveal_result ...
    dedupeKey: text('dedupe_key'),
    title: text('title').notNull(),
    body: text('body').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('notifications_user_type_key_idx').on(
      table.userId,
      table.type,
      table.dedupeKey,
    ),
    index('notifications_user_read_idx').on(table.userId, table.readAt),
  ],
);

export const userStats = pgTable(
  'user_stats',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id),
    judgmentScore: numeric('judgment_score', { precision: 5, scale: 2 }),
    predictionHit: integer('prediction_hit').notNull().default(0),
    predictionTotal: integer('prediction_total').notNull().default(0),
    contributionCount: integer('contribution_count').notNull().default(0),
    persuasionCount: integer('persuasion_count').notNull().default(0),
    honestyCount: integer('honesty_count').notNull().default(0),
    abandonCount: integer('abandon_count').notNull().default(0),
    adjudicatorWeight: numeric('adjudicator_weight', { precision: 4, scale: 2 })
      .notNull()
      .default('1'),
    calibrationRate: numeric('calibration_rate', { precision: 5, scale: 2 }),
    driftLevel: text('drift_level').notNull().default('low'),
    openPenalties: integer('open_penalties').notNull().default(0),
    decisionScore: numeric('decision_score', { precision: 5, scale: 2 }),
    riskClosuresTotal: integer('risk_closures_total').notNull().default(0),
    riskClosuresValidated: integer('risk_closures_validated').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

export const aiFlags = pgTable('ai_flags', {
  id: uuid('id').primaryKey().defaultRandom(),
  claimId: uuid('claim_id').references(() => claims.id),
  kind: text('kind').notNull(),
  detail: jsonb('detail').$type<Record<string, unknown>>(),
  confidence: numeric('confidence', { precision: 4, scale: 3 }),
  status: text('status').notNull().default('flagged'),
  aiVersion: text('ai_version'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Topic = typeof topics.$inferSelect;
export type Claim = typeof claims.$inferSelect;
export type Challenge = typeof challenges.$inferSelect;
export type ClaimEvent = typeof claimEvents.$inferSelect;
