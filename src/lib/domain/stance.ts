/**
 * M4 立场变更领域纯函数：
 * - novelty 校验：说服来源必须是“他人、本话题、晚于用户既有立场锚点”的论点，
 *   防止引用旧论点/自己的论点刷诚实与说服战绩；
 * - 输入校验：from/to/证词长度与必填。
 */

export const STANCE_LIMITS = {
  stanceText: { min: 2, max: 200 },
  statement: { min: 10, max: 1000 },
} as const;

export interface StanceChangeDraft {
  fromStance: string;
  toStance: string;
  statement: string;
}

export function validateStanceChangeDraft(draft: StanceChangeDraft): string[] {
  const errors: string[] = [];
  const fromLength = draft.fromStance.trim().length;
  const toLength = draft.toStance.trim().length;
  if (
    fromLength < STANCE_LIMITS.stanceText.min ||
    fromLength > STANCE_LIMITS.stanceText.max
  ) {
    errors.push(`原立场需要 ${STANCE_LIMITS.stanceText.min}–${STANCE_LIMITS.stanceText.max} 字`);
  }
  if (toLength < STANCE_LIMITS.stanceText.min || toLength > STANCE_LIMITS.stanceText.max) {
    errors.push(`新立场需要 ${STANCE_LIMITS.stanceText.min}–${STANCE_LIMITS.stanceText.max} 字`);
  }
  const statementLength = draft.statement.trim().length;
  if (
    statementLength < STANCE_LIMITS.statement.min ||
    statementLength > STANCE_LIMITS.statement.max
  ) {
    errors.push(
      `证词（你被什么说服、哪里想错了）需要 ${STANCE_LIMITS.statement.min}–${STANCE_LIMITS.statement.max} 字`,
    );
  }
  return errors;
}

export interface StanceNoveltyInput {
  /** 说服来源论点 id（可为空：自主改主意不算被说服，不授予说服战绩）。 */
  sourceClaimId: string | null;
  sourceClaimAuthorId: string | null;
  /** 来源论点创建时间（晚于立场锚点才算新证据）。 */
  sourceClaimCreatedAt: Date | string | null;
  /** 用户既有立场的锚点时间（楼主=最初根立场发布时间；参与者=其在该话题的首条论点/话题创建时间）。 */
  anchorAt: Date | string | null;
  userId: string;
}

/** novelty 通过 = 来源是他人论点且严格晚于用户既有立场锚点。 */
export function evaluateStanceNovelty(input: StanceNoveltyInput): boolean {
  if (!input.sourceClaimId) return false;
  if (!input.sourceClaimAuthorId || input.sourceClaimAuthorId === input.userId) return false;
  if (!input.sourceClaimCreatedAt || !input.anchorAt) return false;
  return new Date(input.sourceClaimCreatedAt).getTime() > new Date(input.anchorAt).getTime();
}
