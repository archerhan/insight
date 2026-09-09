/**
 * M3 反驳程序检查（L0 启发式，纯函数）：
 * - paraphrase：复述检验——反驳必须先准确复述对方核心观点（覆盖对方主张、不能整段照抄）；
 * - duplicate：重复检测——与同一父节点下已有论点高度相似时提示改写；
 * - insult：侮辱/人身攻击识别——命中词表时提示重写，不放行。
 *
 * 本文件不依赖 DB/网络，LLM 扩展由 lib/ai 编排层按环境开关追加；
 * 最终“是否落库”由服务端服务在事务内再次执行并留 ai_flags。
 */

export type ProgramCheckKind = 'paraphrase' | 'duplicate' | 'insult';

export type ProgramCheckStatus = 'approved' | 'flagged';

export interface ProgramCheckResult {
  kind: ProgramCheckKind;
  status: ProgramCheckStatus;
  message?: string;
  /** 供审计/调试的得分快照，如覆盖度、相似度、命中词。 */
  detail?: Record<string, unknown>;
}

export interface ProgramCheckReport {
  passed: boolean;
  checks: ProgramCheckResult[];
}

export const REPLY_LIMITS = {
  /** 一句话主张（论点标题） */
  title: { min: 4, max: 200 },
  body: { max: 2000 },
  paraphrase: { min: 4, max: 500 },
} as const;

export type ReplyMode = 'support' | 'rebuttal';

/** 归一化：NFKC + 小写 + 去掉标点/空白/符号，只保留语义字符。 */
export function normalizeForCompare(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, '');
}

/** 语义二元组：中文短文本比较比单字更稳。 */
export function charBigrams(text: string): Set<string> {
  const normalized = normalizeForCompare(text);
  const set = new Set<string>();
  if (normalized.length === 0) return set;
  if (normalized.length === 1) {
    set.add(normalized);
    return set;
  }
  for (let i = 0; i < normalized.length - 1; i += 1) {
    set.add(normalized.slice(i, i + 2));
  }
  return set;
}

export function jaccardSimilarity(a: string, b: string): number {
  const setA = charBigrams(a);
  const setB = charBigrams(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection += 1;
  }
  return intersection / (setA.size + setB.size - intersection);
}

/** b 中有多少比例的内容被 a 覆盖（用于复述是否覆盖对方主张）。 */
export function coverageOver(b: string, a: string): number {
  const setB = charBigrams(b);
  const setA = charBigrams(a);
  if (setB.size === 0) return 0;
  let hit = 0;
  for (const item of setA) {
    if (setB.has(item)) hit += 1;
  }
  return hit / setB.size;
}

const INSULT_TERMS = [
  '傻逼',
  '傻b',
  '脑残',
  '白痴',
  '智障',
  '弱智',
  '蠢货',
  '废物',
  '贱人',
  '滚蛋',
  '去死',
  '低能',
  '傻叉',
  '没脑子',
  '脑子进水',
  '猪脑',
  '吃屎',
  '欠揍',
  '垃圾人',
] as const;

export function findInsultTerm(text: string): string | null {
  const normalized = normalizeForCompare(text);
  for (const term of INSULT_TERMS) {
    if (normalized.includes(normalizeForCompare(term))) return term;
  }
  return null;
}

function ok(kind: ProgramCheckKind, detail?: Record<string, unknown>): ProgramCheckResult {
  return { kind, status: 'approved', detail };
}

function flag(
  kind: ProgramCheckKind,
  message: string,
  detail?: Record<string, unknown>,
): ProgramCheckResult {
  return { kind, status: 'flagged', message, detail };
}

/**
 * 复述检验：
 * 1. 长度过短/超长；
 * 2. 必须覆盖对方主张的核心内容（按二元组覆盖率）；
 * 3. 几乎原样照抄对方原文时提示用自己的话复述。
 */
export function paraphraseCheck(
  targetTitle: string,
  targetBody: string | null | undefined,
  paraphrase: string,
): ProgramCheckResult {
  const targetText = [targetTitle, targetBody].filter(Boolean).join(' ');
  const detailBase = { targetLength: targetText.length, paraphraseLength: paraphrase.length };

  const normalized = normalizeForCompare(paraphrase);
  if (normalized.length < REPLY_LIMITS.paraphrase.min) {
    return flag(
      'paraphrase',
      `复述太短（至少 ${REPLY_LIMITS.paraphrase.min} 个字）：请先用自己的话写出对方的核心观点`,
      { ...detailBase, reason: 'too_short' },
    );
  }
  if (paraphrase.length > REPLY_LIMITS.paraphrase.max) {
    return flag(
      'paraphrase',
      `复述最长 ${REPLY_LIMITS.paraphrase.max} 个字，提炼核心观点即可`,
      { ...detailBase, reason: 'too_long' },
    );
  }

  const coverage = coverageOver(targetText, paraphrase);
  const similarity = jaccardSimilarity(paraphrase, targetText);
  if (coverage < 0.35) {
    return flag(
      'paraphrase',
      '复述没有覆盖对方观点的核心内容：请先准确复述“对方主张了什么”，可引用其关键关键词',
      { ...detailBase, coverage: Number(coverage.toFixed(3)), reason: 'low_coverage' },
    );
  }
  if (similarity >= 0.88) {
    return flag(
      'paraphrase',
      '几乎是原样复制对方观点：请用自己的话复述，证明你真的读懂了',
      { ...detailBase, similarity: Number(similarity.toFixed(3)), reason: 'copy_of_target' },
    );
  }
  return ok('paraphrase', {
    ...detailBase,
    coverage: Number(coverage.toFixed(3)),
    similarity: Number(similarity.toFixed(3)),
  });
}

/**
 * 重复检测：新论点与同父节点下的既有论点（标题）是否高度相似。
 * 相似度取三种口径的最大值，覆盖“换说法复述已有论点”的常见形态。
 */
export function duplicateCheck(input: {
  title: string;
  body?: string;
  existingTitles: string[];
}): ProgramCheckResult {
  const { title, body, existingTitles } = input;
  const fullText = [title, body].filter(Boolean).join(' ');
  const candidates = existingTitles.filter(Boolean);

  let maxSimilarity = 0;
  let matched: string | null = null;
  for (const candidate of candidates) {
    const titleSim = jaccardSimilarity(title, candidate);
    const bodyOverCandidate = coverageOver(candidate, fullText);
    const candidateOverBody = coverageOver(fullText, candidate);
    const similarity = Math.max(titleSim, bodyOverCandidate, candidateOverBody);
    if (similarity > maxSimilarity) {
      maxSimilarity = similarity;
      matched = candidate;
    }
  }

  if (maxSimilarity >= 0.78 && matched) {
    return flag(
      'duplicate',
      '该论点与同层已有内容高度重复：请先下钻查看是否已被表达过，再决定是补充新角度还是放弃',
      {
        similarity: Number(maxSimilarity.toFixed(3)),
        matchedTitle: matched.slice(0, 60),
        reason: 'duplicate_sibling',
      },
    );
  }
  return ok('duplicate', { maxSimilarity: Number(maxSimilarity.toFixed(3)) });
}

export function insultCheck(texts: string[]): ProgramCheckResult {
  const hit = texts
    .map((text) => ({ text, term: findInsultTerm(text) }))
    .find((entry) => entry.term !== null);
  if (hit?.term) {
    return flag(
      'insult',
      '检测到可能的人身攻击用语：理性探讨比情绪发泄更有意义，请用更友好的语言重写一遍',
      { term: hit.term, reason: 'insult_term' },
    );
  }
  return ok('insult');
}

export interface RebuttalChecksInput {
  mode: ReplyMode;
  /** 被回应的论点（rebuttal 模式时用于复述检验；support 模式可省略） */
  targetTitle: string;
  targetBody?: string | null;
  paraphrase?: string;
  title: string;
  body?: string;
  /** 同父节点下既有论点标题（供查重）；空数组时跳过语义命中。 */
  existingTitles: string[];
}

export function runProgramChecks(input: RebuttalChecksInput): ProgramCheckReport {
  const checks: ProgramCheckResult[] = [];
  const insultTexts = [input.paraphrase, input.title, input.body].filter(
    (text): text is string => typeof text === 'string' && text.length > 0,
  );

  if (input.mode === 'rebuttal' && input.paraphrase !== undefined) {
    checks.push(
      paraphraseCheck(input.targetTitle, input.targetBody, input.paraphrase),
    );
  }
  checks.push(
    duplicateCheck({
      title: input.title,
      body: input.body,
      existingTitles: input.existingTitles,
    }),
  );
  checks.push(insultCheck(insultTexts));

  return { passed: checks.every((check) => check.status === 'approved'), checks };
}

/** 表单级校验（长度/必填），返回人类可读错误；空数组 = 可提交。 */
export function validateReplyDraft(input: {
  mode: ReplyMode;
  title: string;
  body?: string;
  paraphrase?: string;
}): string[] {
  const errors: string[] = [];
  const titleLength = input.title.trim().length;
  if (titleLength < REPLY_LIMITS.title.min || titleLength > REPLY_LIMITS.title.max) {
    errors.push(`论点主张需要 ${REPLY_LIMITS.title.min}–${REPLY_LIMITS.title.max} 字`);
  }
  if ((input.body?.length ?? 0) > REPLY_LIMITS.body.max) {
    errors.push(`补充说明最长 ${REPLY_LIMITS.body.max} 字`);
  }
  if (input.mode === 'rebuttal') {
    const paraphraseLength = (input.paraphrase ?? '').trim().length;
    if (
      paraphraseLength < REPLY_LIMITS.paraphrase.min ||
      paraphraseLength > REPLY_LIMITS.paraphrase.max
    ) {
      errors.push(
        `复述对方观点需要 ${REPLY_LIMITS.paraphrase.min}–${REPLY_LIMITS.paraphrase.max} 字`,
      );
    }
  }
  return errors;
}
