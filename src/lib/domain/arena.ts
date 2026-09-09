/**
 * 对线视图展示口径（纯函数）：
 * 关系/立场标签、论点状态 chip、反驳计时阶段文案。
 * DB 查询与 UI 共用同一套口径，避免两端各自翻译造成不一致。
 */

import type { ClaimRelation, ClaimStatus } from './states';
import type { ChallengePhase } from './challenges';

export type ClaimSide = 'root' | 'pro' | 'con';

export const RELATION_LABELS: Record<ClaimRelation, string> = {
  root: '主论点',
  pro: '支持方',
  con: '反对方',
  addon: '补充',
  question: '澄清请求',
};

/** 子论点归到对线视图的哪一侧：支持列（pro/addon）或反驳列（con/question）。 */
export function childSide(relation: ClaimRelation): 'pro' | 'con' | 'clarify' {
  if (relation === 'pro' || relation === 'addon') return 'pro';
  if (relation === 'con') return 'con';
  return 'clarify';
}

export interface StatusMeta {
  label: string;
  /** 与 globals.css 语义色配套：default 不渲染 chip。 */
  tone: 'default' | 'amber' | 'violet' | 'gray';
}

export const CLAIM_STATUS_META: Record<ClaimStatus, StatusMeta> = {
  pending: { label: '待检查', tone: 'gray' },
  active: { label: '有效', tone: 'default' },
  challenged: { label: '未回应', tone: 'amber' },
  disputed: { label: '仲裁中', tone: 'amber' },
  responded: { label: '已回应', tone: 'default' },
  refuted: { label: '已击穿', tone: 'gray' },
  orphaned: { label: '支撑链断裂', tone: 'gray' },
  moot: { label: '目标已移除', tone: 'gray' },
  merged: { label: '已采纳', tone: 'violet' },
  collapsed: { label: '已折叠', tone: 'gray' },
  superseded: { label: '已被修订', tone: 'gray' },
  adjudicated: { label: '已终审', tone: 'violet' },
};

export function statusMeta(status: string): StatusMeta {
  const meta = CLAIM_STATUS_META[status as ClaimStatus];
  return meta ?? { label: status, tone: 'gray' };
}

export const CHALLENGE_PHASE_LABELS: Record<ChallengePhase, string> = {
  open: '挂红中',
  orange: '已超 3 天未回应',
  red: '已超 7 天未回应',
  due: '已逾期 14 天',
};

/** 从打开时间算起的整天数（不足一天按 0）。 */
export function daysSince(now: Date, openedAt: Date): number {
  const diff = now.getTime() - openedAt.getTime();
  if (diff < 0) return 0;
  return Math.floor(diff / 86_400_000);
}

/** 未决红条上的计时文案：天数为主、阶段为语义。 */
export function openChallengeTimerText(phase: ChallengePhase, openedDays: number): string {
  const dayText = openedDays <= 0 ? '今天挂上' : `已挂红 ${openedDays} 天`;
  return `${dayText} · ${CHALLENGE_PHASE_LABELS[phase]}`;
}
