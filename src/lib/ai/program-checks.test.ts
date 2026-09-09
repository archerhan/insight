import { describe, expect, it, vi } from 'vitest';
import { runProgramChecksWithLlm } from './program-checks';

vi.mock('./llm-program-check', () => ({
  runLlmProgramChecks: vi.fn(),
}));

import { runLlmProgramChecks } from './llm-program-check';

const runLlmMock = vi.mocked(runLlmProgramChecks);

const REBUTTAL_INPUT = {
  mode: 'rebuttal' as const,
  targetTitle: 'AI 编程能显著提高开发效率',
  targetBody: '样板任务占比过半',
  paraphrase: '你主张 AI 编程能显著提高开发效率，样板任务占大头',
  title: 'AI 生成的隐蔽错误会让返工吃掉提速',
  existingTitles: ['先租后买、分批投入，风险可控'],
};

describe('runProgramChecksWithLlm 编排', () => {
  it('LLM 未启用时仅返回本地启发式条目', async () => {
    runLlmMock.mockResolvedValueOnce([]);
    const output = await runProgramChecksWithLlm(REBUTTAL_INPUT);
    expect(output.passed).toBe(true);
    expect(output.entries.every((entry) => entry.source === 'heuristic')).toBe(true);
    expect(output.entries.map((entry) => entry.kind)).toEqual([
      'paraphrase',
      'duplicate',
      'insult',
    ]);
  });

  it('LLM 命中侮辱时合并进结果并整体不放行', async () => {
    runLlmMock.mockResolvedValueOnce([
      { kind: 'insult', status: 'flagged', message: '模型认为存在人身攻击' },
    ]);
    const output = await runProgramChecksWithLlm(REBUTTAL_INPUT);
    expect(output.passed).toBe(false);
    const insult = output.entries.find(
      (entry) => entry.source === 'llm' && entry.kind === 'insult',
    );
    expect(insult).toMatchObject({ status: 'flagged', message: '模型认为存在人身攻击' });
  });

  it('本地检查失败时即使 LLM 通过也整体不放行', async () => {
    runLlmMock.mockResolvedValueOnce([
      { kind: 'paraphrase', status: 'approved' },
      { kind: 'duplicate', status: 'approved' },
      { kind: 'insult', status: 'approved' },
    ]);
    const output = await runProgramChecksWithLlm({
      ...REBUTTAL_INPUT,
      title: '先租后买、分批投入，风险可控', // 与既有论点重复
    });
    expect(output.passed).toBe(false);
    expect(
      output.entries.filter((entry) => entry.source === 'heuristic').some(
        (entry) => entry.kind === 'duplicate' && entry.status === 'flagged',
      ),
    ).toBe(true);
  });
});
