/**
 * M5 立帖为证最小版领域纯函数：
 * - 押注登记门槛（数量封顶、楼主自押拦截、揭晓日后停止登记）；
 * - 揭晓结算映射（楼主回访结果 → 每条押注 hit/miss/void）；
 * - 展示口径（结果/状态 chip 文案、判断力命中率）。
 * 与 DB 无关，便于单测；Server Action 与页面共用同一套口径。
 */

export const PREDICTION_OUTCOMES = ['regret', 'no_regret'] as const;
export type PredictionOutcome = (typeof PREDICTION_OUTCOMES)[number];

export const PREDICTION_STATUSES = ['open', 'hit', 'miss', 'void'] as const;
export type PredictionStatus = (typeof PREDICTION_STATUSES)[number];

export const DECISION_REALITY_RESULTS = ['regret', 'no_regret', 'partial', 'void'] as const;
export type DecisionRealityResult = (typeof DECISION_REALITY_RESULTS)[number];

export const FOLLOWUP_WAVES = [30, 90, 180] as const;
export type FollowupWave = (typeof FOLLOWUP_WAVES)[number];

export const PREDICTION_LIMITS = {
  /** 一句话押注的最短/最长字数。 */
  statementMin: 4,
  statementMax: 200,
  /** 同一话题同时开放的押注数量上限（数量封顶）。 */
  perTopicOpenCap: 20,
  /** 同话题历史押注条数上限（含已结算，防止占位刷记录）。 */
  perTopicTotalCap: 60,
} as const;

export const FOLLOWUP_LEVELS = ['no_regret', 'partial', 'regret'] as const;
export type FollowupLevel = (typeof FOLLOWUP_LEVELS)[number];

export interface PredictionDraft {
  statement: string;
  predictedOutcome: string;
}

/** 登记押注的草稿校验，返回人类可读错误列表；空数组 = 可提交。 */
export function validatePredictionDraft(draft: PredictionDraft): string[] {
  const errors: string[] = [];
  const statement = draft.statement.trim();
  if (
    statement.length < PREDICTION_LIMITS.statementMin ||
    statement.length > PREDICTION_LIMITS.statementMax
  ) {
    errors.push(
      `押注原话需要 ${PREDICTION_LIMITS.statementMin}–${PREDICTION_LIMITS.statementMax} 字`,
    );
  }
  if (!PREDICTION_OUTCOMES.includes(draft.predictedOutcome as PredictionOutcome)) {
    errors.push('请选择押注方向：楼主会后悔，还是不会后悔');
  }
  return errors;
}

export interface PredictionGateInput {
  topicStatus: string;
  topicType: string;
  stakeEnabled: boolean;
  revealAt: Date | null;
  now: Date;
  /** 是否楼主本人（立帖为证由围观者发起，楼主等回访揭晓）。 */
  isOwner: boolean;
  /** 已登记过（同话题一人一票）。 */
  alreadyStaked: boolean;
  /** 当前该话题 open 押注数（话题级封顶）。 */
  openCount: number;
}

/** 登记资格门槛：返回 null 可登记，否则返回展示/阻断文案。 */
export function predictionGateError(input: PredictionGateInput): string | null {
  if (!input.stakeEnabled) return '该话题没有开启立帖为证';
  if (input.topicType !== 'decision') {
    return '立帖为证第一版仅支持个人决策话题，公共议题的揭晓口径将在后续版本开放';
  }
  if (input.topicStatus !== 'open') return '话题已收敛，押注登记已截止';
  if (input.revealAt && input.revealAt.getTime() <= input.now.getTime()) {
    return '已到揭晓日：正在等待楼主回访，登记已截止';
  }
  if (input.isOwner) return '楼主不能押自己：你会通过回访揭晓结果';
  if (input.alreadyStaked) return '你已在该话题立帖为证，一个话题只记一次';
  if (input.openCount >= PREDICTION_LIMITS.perTopicOpenCap) {
    return `该话题押注已满 ${PREDICTION_LIMITS.perTopicOpenCap} 条（数量封顶）`;
  }
  return null;
}

/** 揭晓结算：楼主回访结果 → 押注状态。部分后悔按"双方都部分成立"作废。 */
export function settleForRealityResult(
  predicted: PredictionOutcome,
  result: DecisionRealityResult,
): PredictionStatus {
  if (result === 'partial' || result === 'void') return 'void';
  const hit =
    (result === 'regret' && predicted === 'regret') ||
    (result === 'no_regret' && predicted === 'no_regret');
  return hit ? 'hit' : 'miss';
}

export function isPredictionOutcome(value: string): value is PredictionOutcome {
  return PREDICTION_OUTCOMES.includes(value as PredictionOutcome);
}

export function isFollowupLevel(value: string): value is FollowupLevel {
  return FOLLOWUP_LEVELS.includes(value as FollowupLevel);
}

export function outcomeLabel(outcome: PredictionOutcome): string {
  return outcome === 'regret' ? '押楼主会后悔' : '押楼主不会后悔';
}

export function realityResultLabel(result: string): string {
  switch (result) {
    case 'regret':
      return '楼主后悔了';
    case 'no_regret':
      return '楼主没有后悔';
    case 'partial':
      return '楼主部分后悔';
    case 'void':
      return '已作废';
    default:
      return result;
  }
}

export type ChipTone = 'amber' | 'pro' | 'con' | 'muted' | 'violet';

export interface PredictionChipMeta {
  label: string;
  tone: ChipTone;
}

/** 押注当前展示状态：揭晓日过后仍无 reality_check 时为"揭晓中"。 */
export function predictionChipMeta(
  status: PredictionStatus,
  revealAt: Date | null,
  now: Date = new Date(),
): PredictionChipMeta {
  if (status === 'hit') return { label: '已押中', tone: 'pro' };
  if (status === 'miss') return { label: '未押中', tone: 'con' };
  if (status === 'void') return { label: '已作废', tone: 'muted' };
  if (revealAt && revealAt.getTime() <= now.getTime()) {
    return { label: '揭晓中', tone: 'amber' };
  }
  return { label: '待揭晓', tone: 'amber' };
}

export interface FollowupGateInput {
  status: string;
  dueAt: Date | null;
  now: Date;
}

/** 楼主回访作答门槛：pending 即可作答；已作答/不存在时给提示。 */
export function followupGateError(input: FollowupGateInput): string | null {
  if (input.status !== 'pending') return '这条回访已完成或已跳过';
  return null;
}

export function followupWaveLabel(wave: number): string {
  return `T+${wave} 回访`;
}

/** 判断力命中率（0–100，保留两位）；还没有已结算押注时返回 null。 */
export function judgmentPercent(hit: number, total: number): number | null {
  if (total <= 0) return null;
  const percent = (hit / total) * 100;
  return Math.round(percent * 100) / 100;
}
