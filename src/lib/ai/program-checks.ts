/**
 * M3 程序检查编排（L0）：
 * 本地启发式始终执行；LLM 校验按环境开关（AI_PROGRAM_LLM_ENABLED）追加，
 * 全部结果（含通过项）交给调用方写入 ai_flags 留痕。
 *
 * 口径：AI 只做程序性把关（复述/重复/侮辱），不裁决论点真伪；
 * 默认只有本地规则，LLM 未配置或调用失败时降级为本地结果，不阻塞用户。
 */

import {
  runProgramChecks,
  type ProgramCheckReport,
  type ProgramCheckResult,
  type RebuttalChecksInput,
} from '@/lib/domain/rebuttal-checks';
import { runLlmProgramChecks } from './llm-program-check';

export type CheckSource = 'heuristic' | 'llm';

export interface AiCheckEntry extends ProgramCheckResult {
  source: CheckSource;
}

export interface ProgramRunOutput {
  /** 本地启发式报告（表单即时反馈用） */
  local: ProgramCheckReport;
  /** 落库用条目：本地 + LLM，source 区分。 */
  entries: AiCheckEntry[];
  passed: boolean;
}

function entryFromLocal(check: ProgramCheckResult): AiCheckEntry {
  return { ...check, source: 'heuristic' };
}

function entryFromLlm(check: ProgramCheckResult): AiCheckEntry {
  return { ...check, source: 'llm' };
}

export async function runProgramChecksWithLlm(
  input: RebuttalChecksInput,
): Promise<ProgramRunOutput> {
  const local = runProgramChecks(input);
  const llmChecks = await runLlmProgramChecks(input);

  const localEntries = local.checks.map(entryFromLocal);
  const llmEntries = llmChecks.map(entryFromLlm);
  const entries = [...localEntries, ...llmEntries];
  return {
    local,
    entries,
    passed: entries.every((entry) => entry.status === 'approved'),
  };
}
