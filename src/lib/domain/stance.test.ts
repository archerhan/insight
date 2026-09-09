import { describe, expect, it } from 'vitest';
import { evaluateStanceNovelty, validateStanceChangeDraft } from './stance';

describe('立场变更草稿校验', () => {
  it('from/to/证词必填且长度受限', () => {
    const errors = validateStanceChangeDraft({
      fromStance: '支持裸辞开民宿',
      toStance: '倾向先试住验证',
      statement: '',
    });
    expect(errors.some((error) => error.includes('证词'))).toBe(true);
  });

  it('过短的立场文本被拦截', () => {
    const errors = validateStanceChangeDraft({
      fromStance: '一',
      toStance: '二',
      statement: '对方的试住方案击中了我的盲区：我先验证再辞职。',
    });
    expect(errors.length).toBe(2);
    expect(errors.every((error) => error.includes('2–200'))).toBe(true);
  });

  it('合法草稿通过', () => {
    expect(
      validateStanceChangeDraft({
        fromStance: '支持裸辞开民宿',
        toStance: '倾向先试住 3–4 周再决定',
        statement: '对方用试错成本数据点醒了我，先验证再辞职更稳。',
      }),
    ).toEqual([]);
  });
});

describe('立场变更 novelty 校验', () => {
  const anchor = new Date('2026-08-10T00:00:00Z');
  const after = new Date('2026-08-11T00:00:00Z');

  it('来源是他人且晚于既有立场锚点 → 通过', () => {
    expect(
      evaluateStanceNovelty({
        sourceClaimId: 's1',
        sourceClaimAuthorId: 'u-other',
        sourceClaimCreatedAt: after,
        anchorAt: anchor,
        userId: 'u-me',
      }),
    ).toBe(true);
  });

  it('未指定来源（自主改主意）不通过', () => {
    expect(
      evaluateStanceNovelty({
        sourceClaimId: null,
        sourceClaimAuthorId: null,
        sourceClaimCreatedAt: after,
        anchorAt: anchor,
        userId: 'u-me',
      }),
    ).toBe(false);
  });

  it('引用自己的论点不算被说服', () => {
    expect(
      evaluateStanceNovelty({
        sourceClaimId: 's1',
        sourceClaimAuthorId: 'u-me',
        sourceClaimCreatedAt: after,
        anchorAt: anchor,
        userId: 'u-me',
      }),
    ).toBe(false);
  });

  it('来源早于或等于既有立场锚点不算新证据', () => {
    const before = new Date('2026-08-09T23:59:59Z');
    for (const sourceClaimCreatedAt of [before, anchor]) {
      expect(
        evaluateStanceNovelty({
          sourceClaimId: 's1',
          sourceClaimAuthorId: 'u-other',
          sourceClaimCreatedAt,
          anchorAt: anchor,
          userId: 'u-me',
        }),
      ).toBe(false);
    }
  });

  it('缺少锚点或时间无法解析时不通过', () => {
    expect(
      evaluateStanceNovelty({
        sourceClaimId: 's1',
        sourceClaimAuthorId: 'u-other',
        sourceClaimCreatedAt: after,
        anchorAt: null,
        userId: 'u-me',
      }),
    ).toBe(false);
    expect(
      evaluateStanceNovelty({
        sourceClaimId: 's1',
        sourceClaimAuthorId: 'u-other',
        sourceClaimCreatedAt: null,
        anchorAt: anchor,
        userId: 'u-me',
      }),
    ).toBe(false);
  });
});
