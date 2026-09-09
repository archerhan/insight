import { describe, expect, it } from 'vitest';
import {
  charBigrams,
  coverageOver,
  duplicateCheck,
  findInsultTerm,
  insultCheck,
  jaccardSimilarity,
  normalizeForCompare,
  paraphraseCheck,
  REPLY_LIMITS,
  runProgramChecks,
  validateReplyDraft,
  type ProgramCheckResult,
} from './rebuttal-checks';

const TARGET_TITLE = 'AI 编程能显著提高开发效率';
const TARGET_BODY = '样板任务占比过半，返工可控';

describe('文本归一化与相似度工具', () => {
  it('归一化去掉标点、空白并统一大小写', () => {
    expect(normalizeForCompare('AI 编程，真的能提高！？ EFFICIENCY')).toBe(
      'ai编程真的能提高efficiency',
    );
  });

  it('二元组：单字文本按整体返回', () => {
    expect([...charBigrams('好')]).toEqual(['好']);
    expect(charBigrams('')).toEqual(new Set());
  });

  it('jaccard：完全相同为 1、完全无关为 0', () => {
    expect(jaccardSimilarity('先租后买', '先租后买')).toBe(1);
    expect(jaccardSimilarity('先租后买', '社保断缴')).toBe(0);
  });

  it('coverageOver：计算参考文本被候选覆盖的比例', () => {
    const target = 'AI 编程能提高效率';
    const candidate = '你说 AI 编程能提高效率，我同意一半';
    expect(coverageOver(target, candidate)).toBeGreaterThan(0.5);
    expect(coverageOver(target, '完全无关的一句话')).toBe(0);
  });
});

describe('复述检验 paraphraseCheck', () => {
  it('太短：拒绝空复述与一句话敷衍', () => {
    expect(paraphraseCheck(TARGET_TITLE, null, '').status).toBe('flagged');
    expect(paraphraseCheck(TARGET_TITLE, null, '好').status).toBe('flagged');
  });

  it('超长：拒绝整段搬运', () => {
    const tooLong = '字'.repeat(REPLY_LIMITS.paraphrase.max + 1);
    const result = paraphraseCheck(TARGET_TITLE, null, tooLong);
    expect(result.status).toBe('flagged');
    expect(result.detail?.reason).toBe('too_long');
  });

  it('未覆盖对方核心观点：标记并给出改写提示', () => {
    const result = paraphraseCheck(TARGET_TITLE, null, '我觉得民宿行业适合年轻人创业');
    expect(result.status).toBe('flagged');
    expect(result.detail?.reason).toBe('low_coverage');
    expect(result.message).toMatch(/核心内容/);
  });

  it('整段照抄对方：提示用自己的话复述', () => {
    const result = paraphraseCheck(TARGET_TITLE, null, TARGET_TITLE);
    expect(result.status).toBe('flagged');
    expect(result.detail?.reason).toBe('copy_of_target');
  });

  it('覆盖核心关键词、用自己的话重组的复述通过', () => {
    const result = paraphraseCheck(
      TARGET_TITLE,
      TARGET_BODY,
      '你主张的是：用 AI 编程工具能显著提高开发效率，因为样板任务占比过半',
    );
    expect(result.status).toBe('approved');
    expect(result.detail?.coverage).toBeGreaterThanOrEqual(0.35);
  });
});

describe('重复检测 duplicateCheck', () => {
  it('与同层论点标题完全相同：标记重复', () => {
    const result = duplicateCheck({
      title: '先租后买、分批投入，风险可控',
      existingTitles: ['先租后买、分批投入，风险可控'],
    });
    expect(result.status).toBe('flagged');
    expect(result.detail?.reason).toBe('duplicate_sibling');
  });

  it('换一种说法复述既有论点：仍被识别为重复', () => {
    const result = duplicateCheck({
      title: '风险可控的做法是先租后买，并且分批投入',
      existingTitles: ['先租后买、分批投入，风险可控'],
    });
    expect(result.status).toBe('flagged');
  });

  it('没有相近论点时通过', () => {
    const result = duplicateCheck({
      title: '民宿的淡旺季现金流模型需要至少六个月的备用金',
      existingTitles: ['先租后买、分批投入，风险可控'],
    });
    expect(result.status).toBe('approved');
  });
});

describe('侮辱识别 insultCheck', () => {
  it('命中词表（人身攻击）时标记', () => {
    expect(findInsultTerm('你说的就是傻逼逻辑')).toBe('傻逼');
    expect(insultCheck(['你说的就是傻逼逻辑']).status).toBe('flagged');
    expect(insultCheck(['你的观点有漏洞', '数据来源存疑']).status).toBe('approved');
  });

  it('允许标点符号干扰的命中', () => {
    expect(findInsultTerm('你 是 脑 残 吗')).toBe('脑残');
  });
});

describe('runProgramChecks 编排', () => {
  const existingTitles = ['先租后买、分批投入，风险可控'];

  it('rebuttal 模式：复述通过 + 不重复 + 无侮辱 → 放行', () => {
    const report = runProgramChecks({
      mode: 'rebuttal',
      targetTitle: TARGET_TITLE,
      targetBody: TARGET_BODY,
      paraphrase: '你主张用 AI 编程能显著提高开发效率，样板任务占比过半是前提',
      title: '但 AI 生成的隐蔽错误会让返工成本吃掉提速',
      existingTitles,
    });
    expect(report.passed).toBe(true);
    expect(report.checks.map((check) => check.kind)).toEqual([
      'paraphrase',
      'duplicate',
      'insult',
    ]);
  });

  it('任一检查失败即整体不放行', () => {
    const report = runProgramChecks({
      mode: 'rebuttal',
      targetTitle: TARGET_TITLE,
      paraphrase: '你主张用 AI 编程能显著提高开发效率',
      title: '先租后买、分批投入，风险可控',
      existingTitles,
    });
    expect(report.passed).toBe(false);
    expect(report.checks.find((check) => check.kind === 'duplicate')?.status).toBe('flagged');
  });

  it('侮辱命中时（即使复述合格）不放行', () => {
    const report = runProgramChecks({
      mode: 'rebuttal',
      targetTitle: TARGET_TITLE,
      paraphrase: '你主张用 AI 编程能显著提高开发效率',
      title: '你这个傻逼根本不懂开发',
      existingTitles,
    });
    expect(report.passed).toBe(false);
    const insult = report.checks.find((check) => check.kind === 'insult') as ProgramCheckResult;
    expect(insult.status).toBe('flagged');
    expect(insult.detail?.term).toBe('傻逼');
  });

  it('support 模式不要求复述，只查重复与侮辱', () => {
    const report = runProgramChecks({
      mode: 'support',
      targetTitle: TARGET_TITLE,
      title: '样板任务返工率有公开数据可查',
      existingTitles,
    });
    expect(report.passed).toBe(true);
    expect(report.checks.map((check) => check.kind)).toEqual(['duplicate', 'insult']);
  });

  it('缺少复述的 rebuttal 输入不执行复述检验（由表单层保证必填）', () => {
    const report = runProgramChecks({
      mode: 'rebuttal',
      targetTitle: TARGET_TITLE,
      title: '该反驳缺少复述步骤',
      existingTitles: [],
    });
    expect(report.checks.some((check) => check.kind === 'paraphrase')).toBe(false);
  });
});

describe('validateReplyDraft 表单校验', () => {
  it('标题长度/必填与正文上限', () => {
    expect(validateReplyDraft({ mode: 'support', title: '短' }).length).toBeGreaterThan(0);
    expect(validateReplyDraft({ mode: 'support', title: '先租后买、分批投入，风险可控' })).toEqual(
      [],
    );
    expect(
      validateReplyDraft({
        mode: 'support',
        title: '合法标题',
        body: '长'.repeat(REPLY_LIMITS.body.max + 1),
      }),
    ).toHaveLength(1);
  });

  it('rebuttal 模式强制复述长度', () => {
    expect(
      validateReplyDraft({
        mode: 'rebuttal',
        title: '反驳标题',
        paraphrase: '',
      }).length,
    ).toBeGreaterThan(0);
    expect(
      validateReplyDraft({
        mode: 'rebuttal',
        title: '反驳标题',
        paraphrase: '你主张用 AI 编程能显著提高开发效率',
      }),
    ).toEqual([]);
  });
});
