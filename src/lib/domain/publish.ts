/**
 * 发起话题向导的领域纯函数（M2）：
 * 表单解析、发布草稿校验、揭晓日期解析。
 * 与 DB 无关，便于单测；Server Action 与页面共用同一套口径。
 */

export const TOPIC_TYPES = ['decision', 'claim'] as const;
export type TopicType = (typeof TOPIC_TYPES)[number];

export const OWNER_LEANS = ['pro', 'neutral', 'con'] as const;
export type OwnerLean = (typeof OWNER_LEANS)[number];

export const TOPIC_TYPE_LABELS: Record<TopicType, string> = {
  decision: '个人决策',
  claim: '公共议题',
};

export const OWNER_LEAN_LABELS: Record<OwnerLean, string> = {
  pro: '倾向支持',
  neutral: '中立求验证',
  con: '倾向反对',
};

/** 与示意稿一致的内置标签池；允许任意文本标签，但单标签长度与数量受限制。 */
export const SUGGESTED_TAGS = ['职业', '生活方式', '创业', '财务', '感情', '科技', '公共议题'] as const;

export const PUBLISH_LIMITS = {
  title: { min: 4, max: 80 },
  body: { max: 2000 },
  stance: { min: 4, max: 200 },
  evidence: { max: 500 },
  tagName: { max: 12 },
  maxTags: 3,
} as const;

export interface PublishDraft {
  type: TopicType;
  title: string;
  body: string;
  /** 理由层根立场：一句话主张（会作为讨论树的根节点发布）。 */
  stance: string;
  lean: OwnerLean;
  tags: string[];
  evidenceSummary: string;
  stakeEnabled: boolean;
  /** yyyy-mm-dd；未开启立帖为证时可为空字符串。 */
  revealDate: string;
  bountyEnabled: boolean;
  allowPublicRebuttal: boolean;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function firstString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function boolValue(formData: FormData, name: string): boolean {
  return firstString(formData, name) === 'true';
}

/** 从最终步骤的隐藏字段解析发布草稿（字符串一律 trim，标签去空去重）。 */
export function parsePublishForm(formData: FormData): PublishDraft {
  const type = firstString(formData, 'type');
  const lean = firstString(formData, 'lean') || 'neutral';
  const tags = formData
    .getAll('tag')
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean);

  return {
    type: (TOPIC_TYPES as readonly string[]).includes(type) ? (type as TopicType) : 'decision',
    title: firstString(formData, 'title'),
    body: firstString(formData, 'body'),
    stance: firstString(formData, 'stance'),
    lean: (OWNER_LEANS as readonly string[]).includes(lean) ? (lean as OwnerLean) : 'neutral',
    tags: [...new Set(tags)],
    evidenceSummary: firstString(formData, 'evidenceSummary'),
    stakeEnabled: boolValue(formData, 'stakeEnabled'),
    revealDate: firstString(formData, 'revealDate'),
    bountyEnabled: boolValue(formData, 'bountyEnabled'),
    allowPublicRebuttal: boolValue(formData, 'allowPublicRebuttal'),
  };
}

/** 校验发布草稿，返回人类可读错误列表；空数组 = 可发布。 */
export function validatePublishDraft(draft: PublishDraft, now: Date = new Date()): string[] {
  const errors: string[] = [];

  if (!TOPIC_TYPES.includes(draft.type)) {
    errors.push('请先选择话题类型');
  }

  const titleLength = draft.title.trim().length;
  if (titleLength < PUBLISH_LIMITS.title.min || titleLength > PUBLISH_LIMITS.title.max) {
    errors.push(`标题需要 ${PUBLISH_LIMITS.title.min}–${PUBLISH_LIMITS.title.max} 字，一句话说清你在纠结或验证什么`);
  }

  const bodyLength = draft.body.trim().length;
  if (bodyLength > PUBLISH_LIMITS.body.max) {
    errors.push(`背景与约束最长 ${PUBLISH_LIMITS.body.max} 字`);
  }

  const stanceLength = draft.stance.trim().length;
  if (stanceLength < PUBLISH_LIMITS.stance.min || stanceLength > PUBLISH_LIMITS.stance.max) {
    errors.push(`你的立场主张需要 ${PUBLISH_LIMITS.stance.min}–${PUBLISH_LIMITS.stance.max} 字，它将成为讨论树的根`);
  }

  if (!OWNER_LEANS.includes(draft.lean)) {
    errors.push('请选择当前倾向');
  }

  const tagNames = draft.tags.map((tag) => tag.trim()).filter(Boolean);
  if (tagNames.length > PUBLISH_LIMITS.maxTags) {
    errors.push(`最多选择 ${PUBLISH_LIMITS.maxTags} 个标签`);
  }
  for (const tag of tagNames) {
    if (tag.length > PUBLISH_LIMITS.tagName.max) {
      errors.push(`单个标签最长 ${PUBLISH_LIMITS.tagName.max} 字`);
      break;
    }
  }

  if (draft.evidenceSummary.trim().length > PUBLISH_LIMITS.evidence.max) {
    errors.push(`首条论据最长 ${PUBLISH_LIMITS.evidence.max} 字`);
  }

  const reveal = parseRevealDate(draft.revealDate);
  if (draft.stakeEnabled) {
    if (!reveal) {
      errors.push('开启立帖为证后需要选择揭晓日期');
    } else if (reveal.getTime() < startOfDay(now).getTime()) {
      errors.push('揭晓日期不能早于今天');
    }
  }

  return errors;
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** 解析 yyyy-mm-dd；非法返回 null。 */
export function parseRevealDate(value: string): Date | null {
  const raw = value.trim();
  if (!DATE_RE.test(raw)) return null;
  const [year, month, day] = raw.split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

export function defaultRevealDate(now: Date = new Date(), days = 30): string {
  const date = new Date(now.getTime() + days * 86_400_000);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}
