import { afterEach, describe, expect, it, vi } from 'vitest';
import { isLlmProgramEnabled, parseLlmJson, runLlmProgramChecks } from './llm-program-check';

const BASE_INPUT = {
  mode: 'rebuttal' as const,
  targetTitle: 'AI 编程能显著提高开发效率',
  paraphrase: '你主张 AI 编程能显著提高开发效率',
  title: '但返工会吃掉提速',
  existingTitles: [],
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('LLM 程序检查开关', () => {
  it('未启用（默认）时返回空，不发请求', async () => {
    vi.stubEnv('AI_PROGRAM_LLM_ENABLED', 'false');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await runLlmProgramChecks(BASE_INPUT)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('启用但缺少 URL/Key 时不发请求', async () => {
    vi.stubEnv('AI_PROGRAM_LLM_ENABLED', 'true');
    vi.stubEnv('AI_PROGRAM_LLM_URL', 'https://example.com/v1/chat/completions');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await runLlmProgramChecks(BASE_INPUT)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('启用并配置后调用接口并把结果映射为程序检查条目', async () => {
    vi.stubEnv('AI_PROGRAM_LLM_ENABLED', 'true');
    vi.stubEnv('AI_PROGRAM_LLM_URL', 'https://example.com/v1/chat/completions');
    vi.stubEnv('AI_PROGRAM_LLM_API_KEY', 'sk-test');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content:
                '```json\n[{"kind":"paraphrase","status":"approved"},{"kind":"insult","status":"flagged","message":"请友善表达"}]\n```',
            },
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const results = await runLlmProgramChecks(BASE_INPUT);
    expect(results).toEqual([
      { kind: 'paraphrase', status: 'approved' },
      { kind: 'insult', status: 'flagged', message: '请友善表达' },
    ]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.com/v1/chat/completions');
    const body = JSON.parse(String(init.body)) as { messages: Array<{ role: string }> };
    expect(body.messages[0].role).toBe('system');
  });

  it('接口报错或返回异常 JSON 时降级为空，不抛错', async () => {
    vi.stubEnv('AI_PROGRAM_LLM_ENABLED', 'true');
    vi.stubEnv('AI_PROGRAM_LLM_URL', 'https://example.com/v1/chat/completions');
    vi.stubEnv('AI_PROGRAM_LLM_API_KEY', 'sk-test');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    expect(await runLlmProgramChecks(BASE_INPUT)).toEqual([]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network down')),
    );
    expect(await runLlmProgramChecks(BASE_INPUT)).toEqual([]);
  });
});

describe('parseLlmJson', () => {
  it('解析干净 JSON 数组', () => {
    expect(
      parseLlmJson(
        '[{"kind":"duplicate","status":"flagged","message":"重复"},{"kind":"paraphrase","status":"approved"}]',
      ),
    ).toHaveLength(2);
  });

  it('容忍 markdown 代码块与前后说明文字', () => {
    expect(parseLlmJson('判断如下：\n```json\n[{"kind":"insult","status":"approved"}]\n```\n完毕')).toEqual([
      { kind: 'insult', status: 'approved' },
    ]);
  });

  it('忽略未知类别与非法状态，非数组返回空', () => {
    expect(
      parseLlmJson('[{"kind":"truth","status":"approved"},{"kind":"insult","status":"maybe"}]'),
    ).toEqual([]);
    expect(parseLlmJson('{"kind":"insult"}')).toEqual([]);
    expect(parseLlmJson('not json at all')).toEqual([]);
  });
});

describe('isLlmProgramEnabled', () => {
  it('三者齐备才启用', () => {
    vi.stubEnv('AI_PROGRAM_LLM_ENABLED', 'true');
    expect(isLlmProgramEnabled()).toBe(false);
    vi.stubEnv('AI_PROGRAM_LLM_URL', 'https://example.com');
    expect(isLlmProgramEnabled()).toBe(false);
    vi.stubEnv('AI_PROGRAM_LLM_API_KEY', 'sk');
    expect(isLlmProgramEnabled()).toBe(true);
  });
});
