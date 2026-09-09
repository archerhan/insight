import { NextResponse } from 'next/server';
import { advanceFollowupPrompts } from '@/db/services/predictions';
import { advanceChallengeTimers } from '@/db/services/timers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Vercel Cron 入口。Hobby 计划仅支持每日一次（vercel.json 03:00 UTC）。
 * 计时粒度的保障不依赖高频调度：
 * 1) 3/7/14 天为天级阈值，每日扫描足够（advanceChallengeTimers 幂等推进阶段）；
 * 2) 页面读取路径（M1/M3）会先调用 advanceChallengeTimers 做惰性兜底；
 * 3) 需要更高频率时改用 GitHub Actions 定时或升级 Pro。
 * 14 天后的默认判负/惩罚等治理动作需陪审体系（第二期）接入；
 * M5 追加：到期回访/揭晓提醒（followup_due / reveal_reminder 站内信）。
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const [advanced, followups] = await Promise.all([
    advanceChallengeTimers(),
    advanceFollowupPrompts(),
  ]);
  const written = advanced.filter((entry) => entry.eventWritten).length;
  return NextResponse.json({
    scanned: advanced.length,
    phaseEventsWritten: written,
    followupReminders: followups.length,
  });
}
