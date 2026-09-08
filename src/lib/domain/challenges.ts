/**
 * 反驳挂红计时纯函数：3 天橙色、7 天红色、14 天默认判负。
 */

export const CHALLENGE_WINDOWS = {
  orangeDays: 3,
  redDays: 7,
  defaultLossDays: 14,
} as const;

export type ChallengePhase = 'open' | 'orange' | 'red' | 'due';

export function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * 86_400_000).toISOString();
}

export function challengePhaseAt(nowIso: string, openedAtIso: string): ChallengePhase {
  const elapsedDays = (new Date(nowIso).getTime() - new Date(openedAtIso).getTime()) / 86_400_000;
  if (elapsedDays < 0) return 'open';
  if (elapsedDays >= CHALLENGE_WINDOWS.defaultLossDays) return 'due';
  if (elapsedDays >= CHALLENGE_WINDOWS.redDays) return 'red';
  if (elapsedDays >= CHALLENGE_WINDOWS.orangeDays) return 'orange';
  return 'open';
}
