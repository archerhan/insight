/**
 * 状态机纯函数：合法状态、合法迁移、节点校验。
 */

export const CLAIM_STATUSES = [
  'pending',
  'active',
  'challenged',
  'disputed',
  'responded',
  'refuted',
  'orphaned',
  'moot',
  'merged',
  'collapsed',
  'superseded',
  'adjudicated',
] as const;

export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const CLAIM_RELATIONS = ['root', 'pro', 'con', 'addon', 'question'] as const;
export type ClaimRelation = (typeof CLAIM_RELATIONS)[number];

export const TOPIC_STATUSES = ['open', 'converged', 'risk_closed'] as const;
export type TopicStatus = (typeof TOPIC_STATUSES)[number];

export const CHALLENGE_STATUSES = [
  'open',
  'responded',
  'conceded',
  'default_lost',
  'moot',
  'withdrawn',
  'abandoned',
] as const;
export type ChallengeStatus = (typeof CHALLENGE_STATUSES)[number];

/** 状态机迁移白名单（只列 MVP 会走到的路径，未来裁决层再扩充）。 */
export const CLAIM_TRANSITIONS: Record<ClaimStatus, ClaimStatus[]> = {
  pending: ['active', 'collapsed'],
  active: ['challenged', 'refuted', 'merged', 'collapsed', 'adjudicated', 'superseded'],
  challenged: ['responded', 'disputed', 'refuted', 'orphaned', 'moot', 'collapsed', 'superseded'],
  disputed: ['active', 'refuted', 'collapsed', 'merged'],
  responded: ['challenged', 'refuted', 'merged', 'collapsed', 'superseded'],
  refuted: ['superseded', 'collapsed', 'adjudicated'],
  orphaned: ['active', 'refuted', 'collapsed', 'merged'],
  moot: ['collapsed'],
  merged: ['superseded', 'refuted', 'collapsed'],
  collapsed: ['active'],
  superseded: ['collapsed'],
  adjudicated: ['superseded', 'collapsed'],
};

export function canTransition(from: ClaimStatus, to: ClaimStatus): boolean {
  return CLAIM_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isRootRelation(relation: ClaimRelation): boolean {
  return relation === 'root';
}

export function validateClaimShape(input: {
  parentId: string | null;
  relation: ClaimRelation;
}): string | null {
  if (input.parentId === null && !isRootRelation(input.relation)) {
    return '理由层（parent 为空）的 relation 必须为 root';
  }
  if (input.parentId !== null && isRootRelation(input.relation)) {
    return 'root relation 只能用于理由层';
  }
  return null;
}
