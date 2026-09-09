import { describe, expect, it } from 'vitest';
import {
  adoptionEligibilityError,
  buildConclusionMarkdown,
  buildSupportChain,
  planConclusionSettlement,
  validateConclusionDraft,
  type ClaimForAdoption,
} from './conclusion';

function claim(overrides: Partial<ClaimForAdoption> = {}): ClaimForAdoption {
  return {
    id: 'c-root',
    topicId: 't-1',
    parentId: null,
    relation: 'root',
    status: 'active',
    contentTitle: '先验证再裸辞，是更稳的自由路径',
    authorId: 'u-owner',
    createdAt: new Date('2026-08-01T00:00:00Z'),
    ...overrides,
  };
}

describe('结论书采纳资格', () => {
  it('理由层 root 且状态活性时可通过', () => {
    for (const status of ['active', 'challenged', 'responded', 'disputed']) {
      expect(adoptionEligibilityError(claim({ status }))).toBeNull();
    }
  });

  it('缺失/非理由层节点一律拒绝', () => {
    expect(adoptionEligibilityError(null as unknown as ClaimForAdoption)).toMatch(/找不到/);
    expect(adoptionEligibilityError(claim({ parentId: 'parent', relation: 'pro' }))).toMatch(
      /理由层/,
    );
    expect(adoptionEligibilityError(claim({ relation: 'pro' }))).toMatch(/理由层/);
  });

  it('失效/已归档/已被修订状态不能采纳', () => {
    for (const status of [
      'pending',
      'refuted',
      'orphaned',
      'moot',
      'merged',
      'collapsed',
      'superseded',
      'adjudicated',
    ]) {
      expect(adoptionEligibilityError(claim({ status }))).toMatch(/不能采纳/);
    }
  });
});

function chainClaims() {
  return [
    { id: 'root', parentId: null, relation: 'root', status: 'active', contentTitle: '根', authorId: 'u1', createdAt: new Date('2026-08-01T00:00:00Z') },
    { id: 'p1', parentId: 'root', relation: 'pro', status: 'active', contentTitle: '理由一', authorId: 'u2', createdAt: new Date('2026-08-02T00:00:00Z') },
    { id: 'p2', parentId: 'p1', relation: 'pro', status: 'active', contentTitle: '理由一的分论点', authorId: 'u3', createdAt: new Date('2026-08-03T00:00:00Z') },
    { id: 'addon1', parentId: 'root', relation: 'addon', status: 'responded', contentTitle: '补充', authorId: 'u4', createdAt: new Date('2026-08-04T00:00:00Z') },
    { id: 'con1', parentId: 'root', relation: 'con', status: 'active', contentTitle: '反驳', authorId: 'u5', createdAt: new Date('2026-08-05T00:00:00Z') },
    { id: 'con1-child', parentId: 'con1', relation: 'pro', status: 'active', contentTitle: '反驳链上的论点', authorId: 'u6', createdAt: new Date('2026-08-06T00:00:00Z') },
    { id: 'q1', parentId: 'root', relation: 'question', status: 'active', contentTitle: '澄清', authorId: 'u7', createdAt: new Date('2026-08-07T00:00:00Z') },
    { id: 'p-refuted', parentId: 'root', relation: 'pro', status: 'refuted', contentTitle: '被击穿的理由', authorId: 'u8', createdAt: new Date('2026-08-08T00:00:00Z') },
    { id: 'p-refuted-child', parentId: 'p-refuted', relation: 'pro', status: 'active', contentTitle: '悬空链上的分论点', authorId: 'u9', createdAt: new Date('2026-08-09T00:00:00Z') },
    { id: 'p-orphan', parentId: 'root', relation: 'pro', status: 'orphaned', contentTitle: '悬空的理由', authorId: 'u10', createdAt: new Date('2026-08-10T00:00:00Z') },
  ];
}

function chainEvidence() {
  return [
    { claimId: 'p1', id: 'e1' },
    { claimId: 'p1', id: 'e2' },
    { claimId: 'p2', id: 'e3' },
    { claimId: 'con1', id: 'e4' },
  ];
}

describe('支撑链快照', () => {
  it('只收录活性 pro/addon 子孙并按层级稳定排序，附各节点论据 id', () => {
    const chain = buildSupportChain(chainClaims(), chainEvidence(), 'root');
    expect(chain.map((entry) => entry.claimId)).toEqual(['p1', 'addon1', 'p2']);
    expect(chain[0]).toMatchObject({ claimId: 'p1', contentTitle: '理由一', authorId: 'u2' });
    expect(chain[0].evidenceIds).toEqual(['e1', 'e2']);
    expect(chain[2]).toMatchObject({ claimId: 'p2', evidenceIds: ['e3'] });
  });

  it('con/question 与失效节点不进入，也不沿其子树继续下探', () => {
    const chain = buildSupportChain(chainClaims(), [], 'root');
    const ids = chain.map((entry) => entry.claimId);
    expect(ids).not.toContain('con1');
    expect(ids).not.toContain('con1-child');
    expect(ids).not.toContain('q1');
    expect(ids).not.toContain('p-refuted');
    expect(ids).not.toContain('p-refuted-child');
    expect(ids).not.toContain('p-orphan');
  });

  it('未知被采纳节点抛出错误', () => {
    expect(() => buildSupportChain(chainClaims(), [], 'missing')).toThrow(/Unknown claim/);
  });

  it('无支撑子论点时返回空数组', () => {
    const claims = [
      {
        id: 'root',
        parentId: null,
        relation: 'root',
        status: 'active',
        contentTitle: '根',
        authorId: 'u1',
        createdAt: new Date('2026-08-01T00:00:00Z'),
      },
    ];
    expect(buildSupportChain(claims, [], 'root')).toEqual([]);
  });
});

describe('带险关闭结算', () => {
  it('无未决反驳 → provisional', () => {
    expect(
      planConclusionSettlement({ openChallengeIds: [], acknowledgedChallengeIds: [] }),
    ).toEqual({ settlement: 'provisional' });
  });

  it('有未决反驳且逐条勾选完全一致 → risk_closed', () => {
    expect(
      planConclusionSettlement({
        openChallengeIds: ['a', 'b'],
        acknowledgedChallengeIds: ['b', 'a'],
      }),
    ).toEqual({ settlement: 'risk_closed' });
  });

  it('漏勾任何一条都拒绝发布', () => {
    const result = planConclusionSettlement({
      openChallengeIds: ['a', 'b', 'c'],
      acknowledgedChallengeIds: ['a', 'b'],
    });
    expect(result.settlement).toBe('risk_closed');
    expect(result.error).toMatch(/还有 1 条未决反驳未确认/);
  });

  it('勾选集合包含已不在未决状态的反驳也拒绝', () => {
    const result = planConclusionSettlement({
      openChallengeIds: ['a'],
      acknowledgedChallengeIds: ['a', 'b'],
    });
    expect(result.error).toMatch(/刷新后重试/);
  });
});

describe('出结论书草稿校验', () => {
  it('空采纳列表与过短结论被拦截', () => {
    const errors = validateConclusionDraft({ verdictText: '太短', adoptedClaimIds: [] });
    expect(errors.some((error) => error.includes('至少采纳'))).toBe(true);
    expect(errors.some((error) => error.includes('结论需要'))).toBe(true);
  });

  it('合法草稿通过', () => {
    expect(
      validateConclusionDraft({
        verdictText: '不建议直接裸辞：先用年假完成实地验证再决定是否投入',
        adoptedClaimIds: ['a'],
      }),
    ).toEqual([]);
  });

  it('建议行动/适用前提超长被拦截', () => {
    const errors = validateConclusionDraft({
      verdictText: '结论结论结论结论结论结论结论',
      recommendationText: 'x'.repeat(1001),
      premises: 'y'.repeat(1001),
      adoptedClaimIds: ['a'],
    });
    expect(errors).toEqual(['建议行动最长 1000 字', '适用前提最长 1000 字']);
  });
});

describe('简要版 Markdown 导出', () => {
  const base = {
    topicTitle: '要不要裸辞去大理开民宿？',
    topicStatus: 'converged',
    versionNo: 1,
    settlement: 'provisional',
    publishedAt: new Date('2026-09-09T08:00:00Z'),
    verdictText: '不建议直接裸辞，先试住验证再决定。',
    recommendationText: '先用年假试住 3–4 周。',
    premises: '存款可支撑 6 个月空窗。',
    adoptedItems: [
      {
        position: 1,
        contentTitle: '先用年假试住验证，成本可控',
        authorName: '老张',
        status: 'active',
        chain: [{ contentTitle: '民宿牌照周期可并行办理', authorName: '证照老手', evidenceCount: 2 }],
      },
    ],
    risks: [
      {
        targetTitle: '先用年假试住验证，成本可控',
        challengerTitle: '淡季现金流撑不住 6 个月',
        challengerAuthorName: '阿哲',
        openedDays: 9,
      },
    ],
  };

  it('输出头部、结论、建议、前提、采纳理由与风险', () => {
    const markdown = buildConclusionMarkdown(base);
    expect(markdown).toContain('# 要不要裸辞去大理开民宿？');
    expect(markdown).toContain('已收敛 · 第 1 版');
    expect(markdown).toContain('不建议直接裸辞，先试住验证再决定。');
    expect(markdown).toContain('先用年假试住 3–4 周。');
    expect(markdown).toContain('存款可支撑 6 个月空窗。');
    expect(markdown).toContain('1. 先用年假试住验证，成本可控');
    expect(markdown).toContain('支撑链（脚注）');
    expect(markdown).toContain('民宿牌照周期可并行办理（证照老手 · 论据 2）');
    expect(markdown).toContain('淡季现金流撑不住 6 个月');
  });

  it('带险关闭在头部标注为带险关闭', () => {
    const markdown = buildConclusionMarkdown({ ...base, topicStatus: 'risk_closed', settlement: 'risk_closed' });
    expect(markdown).toContain('带险关闭');
    expect(markdown).toContain('未决风险');
  });

  it('无建议/前提/风险/条目时不渲染空段', () => {
    const markdown = buildConclusionMarkdown({
      ...base,
      recommendationText: null,
      premises: null,
      adoptedItems: [],
      risks: [],
    });
    expect(markdown).not.toContain('建议行动');
    expect(markdown).not.toContain('适用前提');
    expect(markdown).not.toContain('未决风险');
    expect(markdown).toContain('（本版本没有可展示的采纳条目）');
  });
});
