import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/db/services/timers', () => ({
  advanceChallengeTimers: vi.fn(async () => []),
}));

vi.mock('@/db/services/predictions', () => ({
  advanceFollowupPrompts: vi.fn(async () => []),
}));

import { advanceChallengeTimers } from '@/db/services/timers';
import { advanceFollowupPrompts } from '@/db/services/predictions';
import { GET } from './route';

describe('Cron 路由', () => {
  const secret = 'test-secret';

  beforeEach(() => {
    vi.mocked(advanceChallengeTimers).mockClear();
    vi.mocked(advanceFollowupPrompts).mockClear();
    process.env.CRON_SECRET = secret;
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it('密钥不匹配时拒绝并跳过推进', async () => {
    const request = new Request('http://localhost/api/cron/advance', {
      headers: { authorization: 'Bearer wrong' },
    });
    const response = await GET(request);
    expect(response.status).toBe(401);
    expect(advanceChallengeTimers).not.toHaveBeenCalled();
    expect(advanceFollowupPrompts).not.toHaveBeenCalled();
  });

  it('密钥匹配时执行阶段推进并返回统计', async () => {
    vi.mocked(advanceChallengeTimers).mockResolvedValueOnce([
      { challengeId: 'c1', phase: 'due', eventWritten: true },
      { challengeId: 'c2', phase: 'red', eventWritten: false },
    ]);
    vi.mocked(advanceFollowupPrompts).mockResolvedValueOnce([
      { followupId: 'f1', reminderCreated: true, revealReminderCreated: false },
    ]);
    const request = new Request('http://localhost/api/cron/advance', {
      headers: { authorization: `Bearer ${secret}` },
    });
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      scanned: 2,
      phaseEventsWritten: 1,
      followupReminders: 1,
    });
  });
});
