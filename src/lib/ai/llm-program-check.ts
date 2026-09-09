/**
 * 可开关的 LLM 复述/查重增强校验（OpenAI 兼容 chat 接口）。
 *
 * 开关：AI_PROGRAM_LLM_ENABLED=true 且配置 AI_PROGRAM_LLM_URL / AI_PROGRAM_LLM_API_KEY
 * 后才会发起调用；未启用、未配置或调用失败一律返回空数组（本地启发式兜底），
 * 避免把“程序检查”变成第三方依赖的故障点。返回的 JSON 只描述程序判定，
 * 模型建议一律先落 ai_flags，再决定是否阻断提交。
 */

import type { ProgramCheckResult, RebuttalChecksInput } from '@/lib/domain/rebuttal-checks';

export const LLM_PROMPT = `你是一个中文理性讨论社区的程序裁判。你只做三类程序性检查，不评判观点真伪：
1. paraphrase（复述检验）：反驳者的"复述"是否覆盖了对方核心观点，且不是原样照抄；
2. duplicate（重复检测）：新论点是否与同一父节点下已有论点高度重复；
3. insult（侮辱识别）：是否含有人身攻击、贴标签或辱骂用语。
请以 JSON 数组返回，不要输出其他文字，格式：
[{"kind":"paraphrase","status":"approved"|"flagged","message":"（flagged 时的中文提示）"}]
其中未检查到的类别不要返回。`;

function env(name: string): string | undefined {
  return process.env[name];
}

export function isLlmProgramEnabled(): boolean {
  return (
    env('AI_PROGRAM_LLM_ENABLED') === 'true' &&
    Boolean(env('AI_PROGRAM_LLM_URL')) &&
    Boolean(env('AI_PROGRAM_LLM_API_KEY'))
  );
}

function buildUserMessage(input: RebuttalChecksInput): string {
  const lines = [
    `模式：${input.mode === 'rebuttal' ? '反驳' : '支持'}`,
    `被回应的观点标题：${input.targetTitle}`,
    `被回应的观点正文：${input.targetBody ?? '（无）'}`,
    `同层既有观点：${input.existingTitles.length > 0 ? input.existingTitles.join('；') : '（无）'}`,
  ];
  if (input.paraphrase) lines.push(`反驳者的复述：${input.paraphrase}`);
  lines.push(`新论点标题：${input.title}`);
  if (input.body) lines.push(`新论点正文：${input.body}`);
  return lines.join('\n');
}

/** 宽容解析：允许模型在 JSON 外包 ``` 或夹杂少量说明文字。 */
export function parseLlmJson(raw: string): ProgramCheckResult[] {
  const trimmed = raw.trim();
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/) ?? [null, trimmed];
  const body = (match[1] ?? trimmed).trim();
  const start = body.indexOf('[');
  const end = body.lastIndexOf(']');
  if (start === -1 || end === -1) return [];
  try {
    const parsed = JSON.parse(body.slice(start, end + 1)) as unknown;
    if (!Array.isArray(parsed)) return [];
    const allowed = new Set(['paraphrase', 'duplicate', 'insult']);
    return parsed
      .filter(
        (item): item is Record<string, unknown> =>
          typeof item === 'object' &&
          item !== null &&
          typeof item.kind === 'string' &&
          allowed.has(item.kind) &&
          (item.status === 'approved' || item.status === 'flagged'),
      )
      .map((item) => ({
        kind: item.kind as ProgramCheckResult['kind'],
        status: item.status as ProgramCheckResult['status'],
        ...(typeof item.message === 'string' ? { message: item.message.slice(0, 200) } : {}),
      }));
  } catch {
    return [];
  }
}

export async function runLlmProgramChecks(
  input: RebuttalChecksInput,
): Promise<ProgramCheckResult[]> {
  if (!isLlmProgramEnabled()) return [];

  const url = env('AI_PROGRAM_LLM_URL');
  const apiKey = env('AI_PROGRAM_LLM_API_KEY');
  const model = env('AI_PROGRAM_LLM_MODEL') ?? 'gpt-4o-mini';
  if (!url || !apiKey) return [];

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: 'system', content: LLM_PROMPT },
          { role: 'user', content: buildUserMessage(input) },
        ],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return [];
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return [];
    return parseLlmJson(content);
  } catch {
    // 第三方检查失败不阻塞用户：返回空，启发式结果继续生效
    return [];
  }
}
