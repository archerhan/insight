import { describe, expect, it } from 'vitest';
import {
  followupGateError,
  followupWaveLabel,
  isFollowupLevel,
  isPredictionOutcome,
  judgmentPercent,
  outcomeLabel,
  predictionChipMeta,
  predictionGateError,
  PREDICTION_LIMITS,
  realityResultLabel,
  settleForRealityResult,
  validatePredictionDraft,
} from './predictions';

const now = new Date('2026-09-09T12:00:00Z');
const future = new Date('2026-11-01T12:00:00Z');
const past = new Date('2026-08-01T12:00:00Z');

function gate(overrides: Partial<Parameters<typeof predictionGateError>[0]> = {}) {
  return predictionGateError({
    topicStatus: 'open',
    topicType: 'decision',
    stakeEnabled: true,
    revealAt: future,
    now,
    isOwner: false,
    alreadyStaked: false,
    openCount: 0,
    ...overrides,
  });
}

describe('押注草稿校验', () => {
  it('合法草稿通过', () => {
    expect(
      validatePredictionDraft({ statement: '我押楼主三个月内会后悔', predictedOutcome: 'regret' }),
    ).toEqual([]);
  });

  it('押注原话过短/过长均报错', () => {
    expect(validatePredictionDraft({ statement: '押', predictedOutcome: 'regret' }).length).toBe(1);
    expect(
      validatePredictionDraft({
        statement: 'x'.repeat(PREDICTION_LIMITS.statementMax + 1),
        predictedOutcome: 'regret',
      }).length,
    ).toBe(1);
  });

  it('非法押注方向报错', () => {
    expect(
      validatePredictionDraft({ statement: '我押楼主会后悔', predictedOutcome: 'maybe' }).length,
    ).toBe(1);
  });
});

describe('押注登记门槛', () => {
  it('未开启立帖为证的话题不能登记', () => {
    expect(gate({ stakeEnabled: false })).toMatch(/没有开启立帖为证/);
  });

  it('公共议题第一版不开放押注', () => {
    expect(gate({ topicType: 'claim' })).toMatch(/仅支持个人决策话题/);
  });

  it('已收敛话题与已过揭晓日均截止登记', () => {
    expect(gate({ topicStatus: 'converged' })).toMatch(/已收敛/);
    expect(gate({ revealAt: past })).toMatch(/等待楼主回访/);
  });

  it('楼主不能自押；一人一话题只记一次', () => {
    expect(gate({ isOwner: true })).toMatch(/不能押自己/);
    expect(gate({ alreadyStaked: true })).toMatch(/一个话题只记一次/);
  });

  it('达到开放数量上限后拦截', () => {
    expect(gate({ openCount: PREDICTION_LIMITS.perTopicOpenCap })).toMatch(/数量封顶/);
  });

  it('满足全部条件时放行', () => {
    expect(gate()).toBeNull();
  });
});

describe('揭晓结算映射', () => {
  it('后悔 → 押后悔命中，押不后悔未命中', () => {
    expect(settleForRealityResult('regret', 'regret')).toBe('hit');
    expect(settleForRealityResult('no_regret', 'regret')).toBe('miss');
  });

  it('不后悔 → 押不后悔命中', () => {
    expect(settleForRealityResult('no_regret', 'no_regret')).toBe('hit');
    expect(settleForRealityResult('regret', 'no_regret')).toBe('miss');
  });

  it('部分后悔与作废时双方押注都作废（不判输赢）', () => {
    expect(settleForRealityResult('regret', 'partial')).toBe('void');
    expect(settleForRealityResult('no_regret', 'partial')).toBe('void');
    expect(settleForRealityResult('regret', 'void')).toBe('void');
  });
});

describe('展示口径', () => {
  it('状态 chip：待揭晓/揭晓中/命中/未中/作废', () => {
    expect(predictionChipMeta('open', future, now)).toEqual({ label: '待揭晓', tone: 'amber' });
    expect(predictionChipMeta('open', past, now)).toEqual({ label: '揭晓中', tone: 'amber' });
    expect(predictionChipMeta('hit', null, now).label).toBe('已押中');
    expect(predictionChipMeta('miss', null, now).label).toBe('未押中');
    expect(predictionChipMeta('void', null, now).label).toBe('已作废');
  });

  it('文案：方向/结果/回访标签', () => {
    expect(outcomeLabel('regret')).toBe('押楼主会后悔');
    expect(outcomeLabel('no_regret')).toBe('押楼主不会后悔');
    expect(realityResultLabel('no_regret')).toBe('楼主没有后悔');
    expect(realityResultLabel('partial')).toBe('楼主部分后悔');
    expect(followupWaveLabel(30)).toBe('T+30 回访');
  });

  it('类型守卫与判断力命中率', () => {
    expect(isPredictionOutcome('regret')).toBe(true);
    expect(isPredictionOutcome('affirmed')).toBe(false);
    expect(isFollowupLevel('partial')).toBe(true);
    expect(isFollowupLevel('skipped')).toBe(false);
    expect(judgmentPercent(8, 12)).toBe(66.67);
    expect(judgmentPercent(0, 0)).toBeNull();
    expect(followupGateError({ status: 'pending', dueAt: future, now })).toBeNull();
    expect(followupGateError({ status: 'done', dueAt: future, now })).toMatch(/已完成/);
  });
});
