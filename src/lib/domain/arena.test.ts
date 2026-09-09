import { describe, expect, it } from 'vitest';
import {
  CHALLENGE_PHASE_LABELS,
  childSide,
  CLAIM_STATUS_META,
  daysSince,
  openChallengeTimerText,
  RELATION_LABELS,
  statusMeta,
} from './arena';

describe('对线视图关系口径', () => {
  it('四种子论点关系都有展示标签', () => {
    expect(RELATION_LABELS.root).toBe('主论点');
    expect(RELATION_LABELS.pro).toBe('支持方');
    expect(RELATION_LABELS.con).toBe('反对方');
    expect(RELATION_LABELS.addon).toBe('补充');
    expect(RELATION_LABELS.question).toBe('澄清请求');
  });

  it('子论点分栏：pro/addon 归支持列，con 归反驳列，question 单列澄清', () => {
    expect(childSide('pro')).toBe('pro');
    expect(childSide('addon')).toBe('pro');
    expect(childSide('con')).toBe('con');
    expect(childSide('question')).toBe('clarify');
  });
});

describe('状态 chip 口径', () => {
  it('全部声明状态都有中文标签与语义色', () => {
    for (const [status, meta] of Object.entries(CLAIM_STATUS_META)) {
      expect(meta.label.length).toBeGreaterThan(0);
      expect(['default', 'amber', 'violet', 'gray']).toContain(meta.tone);
      expect(status).toBeTruthy();
    }
  });

  it('未知状态回退为灰色原文', () => {
    expect(statusMeta('mystery')).toEqual({ label: 'mystery', tone: 'gray' });
  });

  it('关键状态语义正确', () => {
    expect(statusMeta('refuted').label).toBe('已击穿');
    expect(statusMeta('orphaned').label).toBe('支撑链断裂');
    expect(statusMeta('challenged')).toMatchObject({ label: '未回应', tone: 'amber' });
  });
});

describe('反驳计时展示', () => {
  it('天数为整天向下取整，未来时间按 0', () => {
    const now = new Date('2026-09-09T12:00:00Z');
    expect(daysSince(now, new Date('2026-09-06T00:00:00Z'))).toBe(3);
    expect(daysSince(now, new Date('2026-09-09T11:00:00Z'))).toBe(0);
    expect(daysSince(now, new Date('2026-09-10T00:00:00Z'))).toBe(0);
  });

  it('四个阶段都有文案', () => {
    expect(CHALLENGE_PHASE_LABELS.open).toContain('挂红');
    expect(CHALLENGE_PHASE_LABELS.orange).toContain('3 天');
    expect(CHALLENGE_PHASE_LABELS.red).toContain('7 天');
    expect(CHALLENGE_PHASE_LABELS.due).toContain('14 天');
  });

  it('计时文案：天数为零显示“今天挂上”，阶段语义追加在后', () => {
    expect(openChallengeTimerText('open', 0)).toBe('今天挂上 · 挂红中');
    expect(openChallengeTimerText('orange', 4)).toBe('已挂红 4 天 · 已超 3 天未回应');
    expect(openChallengeTimerText('due', 16)).toBe('已挂红 16 天 · 已逾期 14 天');
  });
});
