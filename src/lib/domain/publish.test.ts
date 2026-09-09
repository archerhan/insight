import { describe, expect, it } from 'vitest';
import {
  defaultRevealDate,
  OWNER_LEANS,
  parsePublishForm,
  parseRevealDate,
  validatePublishDraft,
  type PublishDraft,
} from './publish';

const now = new Date('2026-09-09T10:00:00+08:00');

function validDraft(overrides: Partial<PublishDraft> = {}): PublishDraft {
  return {
    type: 'decision',
    title: '要不要裸辞去大理开民宿？',
    body: '30 岁，存款约 40 万，大理有朋友愿意合租改造旧院。',
    stance: '裸辞去大理开民宿，是实现自由生活的现实路径',
    lean: 'pro',
    tags: ['职业', '生活方式'],
    evidenceSummary: '朋友的大理旧院已试运营两年，可先入股试水半年',
    stakeEnabled: true,
    revealDate: '2026-12-06',
    bountyEnabled: false,
    allowPublicRebuttal: true,
    ...overrides,
  };
}

describe('发起话题：发布草稿校验', () => {
  it('完整草稿通过校验', () => {
    expect(validatePublishDraft(validDraft(), now)).toEqual([]);
  });

  it('类型非法时报错', () => {
    const draft = validDraft({ type: 'decision' });
    expect(validatePublishDraft({ ...draft, type: 'other' as never }, now)).toContain(
      '请先选择话题类型',
    );
  });

  it('标题过短或过长时报错', () => {
    expect(validatePublishDraft(validDraft({ title: ' 是 ' }), now)).toContain(
      '标题需要 4–80 字，一句话说清你在纠结或验证什么',
    );
    expect(
      validatePublishDraft(validDraft({ title: '长'.repeat(81) }), now),
    ).toContain('标题需要 4–80 字，一句话说清你在纠结或验证什么');
  });

  it('根立场缺失或超长时报错', () => {
    expect(validatePublishDraft(validDraft({ stance: '' }), now)).toContain(
      '你的立场主张需要 4–200 字，它将成为讨论树的根',
    );
    expect(validatePublishDraft(validDraft({ stance: '长'.repeat(201) }), now)).toContain(
      '你的立场主张需要 4–200 字，它将成为讨论树的根',
    );
  });

  it('标签超过三个时报错', () => {
    expect(
      validatePublishDraft(validDraft({ tags: ['A', 'B', 'C', 'D'] }), now),
    ).toContain('最多选择 3 个标签');
  });

  it('开启立帖为证但缺少揭晓日期时报错', () => {
    expect(
      validatePublishDraft(validDraft({ stakeEnabled: true, revealDate: '' }), now),
    ).toContain('开启立帖为证后需要选择揭晓日期');
  });

  it('揭晓日期早于今天时报错，今天与未来通过', () => {
    expect(validatePublishDraft(validDraft({ revealDate: '2026-09-08' }), now)).toContain(
      '揭晓日期不能早于今天',
    );
    expect(validatePublishDraft(validDraft({ revealDate: '2026-09-09' }), now)).toEqual([]);
    expect(validatePublishDraft(validDraft({ revealDate: '2027-01-01' }), now)).toEqual([]);
  });
});

describe('发起话题：日期解析', () => {
  it('解析合法 yyyy-mm-dd', () => {
    const date = parseRevealDate('2026-12-06');
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(11);
    expect(date?.getDate()).toBe(6);
  });

  it('拒绝非法日期与格式', () => {
    expect(parseRevealDate('')).toBeNull();
    expect(parseRevealDate('2026-13-01')).toBeNull();
    expect(parseRevealDate('2026-02-30')).toBeNull();
    expect(parseRevealDate('2026/12/06')).toBeNull();
  });

  it('默认揭晓日期为 30 天后', () => {
    expect(defaultRevealDate(now)).toBe('2026-10-09');
  });
});

describe('发起话题：表单解析', () => {
  it('读取并修剪隐藏字段，去重标签', () => {
    const form = new FormData();
    form.set('type', 'claim');
    form.set('title', '  AI 编程是否提高效率？ ');
    form.set('body', '背景');
    form.set('stance', '  在熟悉代码库的前提下，AI 编程能显著提高开发效率 ');
    form.set('lean', 'pro');
    form.append('tag', '科技');
    form.append('tag', '科技');
    form.append('tag', '公共议题');
    form.set('evidenceSummary', '团队半年实测');
    form.set('stakeEnabled', 'false');
    form.set('revealDate', '');
    form.set('bountyEnabled', 'true');
    form.set('allowPublicRebuttal', 'true');

    expect(parsePublishForm(form)).toEqual({
      type: 'claim',
      title: 'AI 编程是否提高效率？',
      body: '背景',
      stance: '在熟悉代码库的前提下，AI 编程能显著提高开发效率',
      lean: 'pro',
      tags: ['科技', '公共议题'],
      evidenceSummary: '团队半年实测',
      stakeEnabled: false,
      revealDate: '',
      bountyEnabled: true,
      allowPublicRebuttal: true,
    });
  });

  it('未知类型与倾向回退到安全默认值', () => {
    const form = new FormData();
    form.set('type', 'hack');
    form.set('lean', 'other');
    form.set('allowPublicRebuttal', 'whatever');
    const parsed = parsePublishForm(form);
    expect(parsed.type).toBe('decision');
    expect(parsed.lean).toBe('neutral');
    expect(OWNER_LEANS).toContain(parsed.lean);
  });
});
