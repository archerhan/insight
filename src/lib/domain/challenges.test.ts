import { describe, expect, it } from 'vitest';
import { addDays, challengePhaseAt, CHALLENGE_WINDOWS } from './challenges';

describe('challenge windows', () => {
  const opened = '2026-09-01T00:00:00.000Z';

  it('3 天进入橙色，7 天进入红色，14 天到期', () => {
    expect(challengePhaseAt(opened, opened)).toBe('open');
    expect(challengePhaseAt(addDays(opened, 3), opened)).toBe('orange');
    expect(challengePhaseAt(addDays(opened, 7), opened)).toBe('red');
    expect(challengePhaseAt(addDays(opened, 14), opened)).toBe('due');
  });

  it('到期阈值按天数配置', () => {
    expect(CHALLENGE_WINDOWS).toEqual({ orangeDays: 3, redDays: 7, defaultLossDays: 14 });
  });
});
