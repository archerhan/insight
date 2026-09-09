/**
 * M4 结论书领域纯函数：
 * - 采纳资格：只有理由层（parent 为空 + relation=root；含击杀链自动提升节点）可进正文；
 * - 支撑链快照：采纳时把关键支撑子论点（pro/addon 活性链）连同论据 id 一起落库；
 * - 带险关闭结算：存在未决反驳时必须逐条勾选，勾选集合与 open challenges 完全一致才放行；
 * - 简要版 Markdown 导出。
 * 不依赖 DB，便于单元测试与服务层复用。
 */

import { statusMeta } from './arena';
import type { ClaimStatus } from './states';

export const CONCLUSION_LIMITS = {
  verdictText: { min: 8, max: 500 },
  recommendationText: { max: 1000 },
  premises: { max: 1000 },
  note: { max: 500 },
} as const;

/** 可被采纳进结论书正文的节点状态（挂红未回应也可在带险关闭时采纳）。 */
export const ADOPTABLE_CLAIM_STATUSES = [
  'active',
  'challenged',
  'responded',
  'disputed',
] as const;

export type ConclusionSettlement = 'provisional' | 'risk_closed';

export interface ClaimForAdoption {
  id: string;
  topicId: string;
  parentId: string | null;
  relation: string;
  status: string;
  contentTitle: string;
  authorId: string;
  createdAt: Date;
}

/** 采纳资格校验：返回 null 表示可采纳，否则返回人类可读原因。 */
export function adoptionEligibilityError(claim: ClaimForAdoption): string | null {
  if (!claim) return '找不到该论点';
  if (claim.parentId !== null || claim.relation !== 'root') {
    return '只有理由层论点（含经提升通道进入理由层的节点）能被采纳进结论书正文';
  }
  if (!(ADOPTABLE_CLAIM_STATUSES as readonly string[]).includes(claim.status)) {
    return `该论点当前状态为 ${claim.status}，不能采纳进结论书`;
  }
  return null;
}

export interface SupportChainEntry {
  claimId: string;
  contentTitle: string;
  authorId: string;
  evidenceIds: string[];
}

interface ChainClaim {
  id: string;
  parentId: string | null;
  relation: string;
  status: string;
  contentTitle: string;
  authorId: string;
  createdAt: Date;
}

const SUPPORT_EDGE_RELATIONS = new Set(['pro', 'addon']);

/** 支撑链只收录仍活着的 pro/addon 子孙；被击穿/悬空/归档/修订后的节点不再代表该理由的支撑。 */
const LIVE_CHAIN_STATUSES = new Set(['active', 'challenged', 'responded', 'disputed']);

/**
 * 生成采纳理由的支撑链快照：从被采纳的理由层节点出发，沿 pro/addon 边向下，
 * 只收录活性节点，并附其证据 id。返回按层级、发布时间排序的条目。
 */
export function buildSupportChain(
  claims: ChainClaim[],
  evidence: Array<{ claimId: string; id: string }>,
  adoptedClaimId: string,
): SupportChainEntry[] {
  const root = claims.find((claim) => claim.id === adoptedClaimId);
  if (!root) throw new Error(`Unknown claim ${adoptedClaimId}`);

  const evidenceByClaim = new Map<string, string[]>();
  for (const row of evidence) {
    const list = evidenceByClaim.get(row.claimId) ?? [];
    list.push(row.id);
    evidenceByClaim.set(row.claimId, list);
  }

  const childrenByParent = new Map<string | null, ChainClaim[]>();
  for (const claim of claims) {
    const list = childrenByParent.get(claim.parentId) ?? [];
    list.push(claim);
    childrenByParent.set(claim.parentId, list);
  }

  const entries: SupportChainEntry[] = [];
  const queue: ChainClaim[] = [...(childrenByParent.get(adoptedClaimId) ?? [])];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    const isSupportEdge = SUPPORT_EDGE_RELATIONS.has(current.relation);
    const isLive = LIVE_CHAIN_STATUSES.has(current.status);
    if (!isSupportEdge || !isLive) continue; // con/question 或失效节点不进入支撑链，子树也不再下探
    entries.push({
      claimId: current.id,
      contentTitle: current.contentTitle,
      authorId: current.authorId,
      evidenceIds: evidenceByClaim.get(current.id) ?? [],
    });
    queue.push(...(childrenByParent.get(current.id) ?? []));
  }

  // BFS 天然按层级输出：先同层 pro/addon 子论点，再逐层向下，保持稳定可读顺序。
  return entries;
}

/**
 * 带险关闭结算：open challenges 为空 → provisional；
 * 非空时 acknowledged 必须与 open 完全一致（逐条勾选，不多不少）。
 */
export function planConclusionSettlement(input: {
  openChallengeIds: string[];
  acknowledgedChallengeIds: string[];
}): { settlement: ConclusionSettlement; error?: string } {
  const open = [...new Set(input.openChallengeIds)];
  const acknowledged = [...new Set(input.acknowledgedChallengeIds)];
  const missing = open.filter((id) => !acknowledged.includes(id));
  const extra = acknowledged.filter((id) => !open.includes(id));

  if (missing.length > 0) {
    return {
      settlement: 'risk_closed',
      error: `还有 ${missing.length} 条未决反驳未确认“已知晓并接受风险”，请逐条勾选后再发布`,
    };
  }
  if (extra.length > 0) {
    return {
      settlement: 'risk_closed',
      error: '勾选列表包含已不在未决状态的反驳，请刷新后重试',
    };
  }
  return { settlement: open.length > 0 ? 'risk_closed' : 'provisional' };
}

export interface ConclusionDraftInput {
  verdictText: string;
  recommendationText?: string;
  premises?: string;
  adoptedClaimIds: string[];
}

/** 出结论书草稿校验：返回人类可读错误列表；空数组 = 可发布。 */
export function validateConclusionDraft(draft: ConclusionDraftInput): string[] {
  const errors: string[] = [];
  const verdictLength = draft.verdictText.trim().length;
  if (
    verdictLength < CONCLUSION_LIMITS.verdictText.min ||
    verdictLength > CONCLUSION_LIMITS.verdictText.max
  ) {
    errors.push(
      `结论需要 ${CONCLUSION_LIMITS.verdictText.min}–${CONCLUSION_LIMITS.verdictText.max} 字，一句话说清“这件事最后怎么定”`,
    );
  }
  if ((draft.recommendationText ?? '').trim().length > CONCLUSION_LIMITS.recommendationText.max) {
    errors.push(`建议行动最长 ${CONCLUSION_LIMITS.recommendationText.max} 字`);
  }
  if ((draft.premises ?? '').trim().length > CONCLUSION_LIMITS.premises.max) {
    errors.push(`适用前提最长 ${CONCLUSION_LIMITS.premises.max} 字`);
  }
  if (draft.adoptedClaimIds.length === 0) {
    errors.push('至少采纳一条理由层论点');
  }
  return errors;
}

/* ---------------- 简要版 Markdown 导出 ---------------- */

export interface MarkdownAdoptedItem {
  position: number;
  contentTitle: string;
  authorName: string | null;
  status: ClaimStatus | string;
  /** 支撑链条目（展示用，作者名已解析）。 */
  chain: Array<{ contentTitle: string; authorName: string | null; evidenceCount: number }>;
  note?: string;
}

export interface MarkdownRisk {
  targetTitle: string;
  challengerTitle: string;
  challengerAuthorName: string | null;
  openedDays: number;
}

export interface ConclusionMarkdownInput {
  topicTitle: string;
  topicStatus: string;
  versionNo: number;
  settlement: string;
  publishedAt: Date;
  verdictText: string;
  recommendationText: string | null;
  premises: string | null;
  adoptedItems: MarkdownAdoptedItem[];
  risks: MarkdownRisk[];
  /** 发布时快照的参与统计（可选）。 */
  participantCount?: number;
}

/** 简要版导出物：结论 + 采纳理由（含支撑链脚注）+ 未决风险，适合群聊/社交传播。 */
export function buildConclusionMarkdown(input: ConclusionMarkdownInput): string {
  const lines: string[] = [];
  const statusLabel = input.topicStatus === 'risk_closed' ? '带险关闭' : '已收敛';
  lines.push(`# ${input.topicTitle}`);
  lines.push('');
  lines.push(`> 灼见 · 结论书导出（简要版）`);
  lines.push(`> - 状态：${statusLabel} · 第 ${input.versionNo} 版`);
  lines.push(
    `> - 导出时间：${input.publishedAt.toLocaleDateString('zh-CN')} ${input.publishedAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`,
  );
  if (input.participantCount !== undefined) {
    lines.push(`> - 参与者：${input.participantCount} 人`);
  }
  lines.push('');
  lines.push('## 结论');
  lines.push('');
  lines.push(input.verdictText);
  if (input.recommendationText?.trim()) {
    lines.push('');
    lines.push('**建议行动**：' + input.recommendationText.trim());
  }
  if (input.premises?.trim()) {
    lines.push('');
    lines.push('**适用前提**：' + input.premises.trim());
  }
  lines.push('');
  lines.push('## 采纳理由');
  lines.push('');

  if (input.adoptedItems.length === 0) {
    lines.push('（本版本没有可展示的采纳条目）');
    lines.push('');
  } else {
    for (const item of input.adoptedItems) {
      const meta = statusMeta(item.status);
      lines.push(`${item.position}. ${item.contentTitle}`);
      lines.push(`   - 作者：${item.authorName ?? '匿名'} · 状态：${meta.label}`);
      if (item.chain.length > 0) {
        lines.push('   - 支撑链（脚注）：');
        for (const chain of item.chain) {
          const evidence = chain.evidenceCount > 0 ? ` · 论据 ${chain.evidenceCount}` : '';
          lines.push(`     - ${chain.contentTitle}（${chain.authorName ?? '匿名'}${evidence}）`);
        }
      }
      if (item.note?.trim()) {
        lines.push(`   - 备注：${item.note.trim()}`);
      }
    }
  }

  if (input.risks.length > 0) {
    lines.push('');
    lines.push('## 未决风险');
    lines.push('');
    lines.push('本结论书在以下反驳仍未被有效回应时发布，请谨慎采信受影响条目：');
    for (const risk of input.risks) {
      lines.push(
        `- 「${risk.challengerTitle}」（${risk.challengerAuthorName ?? '匿名'}）→ 影响「${risk.targetTitle}」，已挂红 ${risk.openedDays} 天`,
      );
    }
  }

  lines.push('');
  lines.push('---');
  lines.push('本导出物为决策快照；新证据可发起修订，被现实验证后结论书会自动更新。');
  return lines.join('\n');
}
