import { and, eq, lt } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { challenges, claimEvents } from '@/db/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Vercel Cron 入口。Hobby 计划仅支持每日一次（vercel.json 03:00 UTC）。
 * 计时粒度的保障不依赖高频调度：
 * 1) 计时阈值是 3/7/14 天，每日扫描 + 读取时兜底足够；
 * 2) 读取路径（M1/M3 实现）会做"过期即迁移"的惰性推进；
 * 3) 需要更高频率时改用 GitHub Actions 定时或升级 Pro。
 * M0 骨架：只扫描到期 challenge 并写 challenge_timer 事件；
 * 真正的默认判负/惩罚等治理动作等陪审体系（第二期）接入。
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const due = await db
    .select({ id: challenges.id, topicId: challenges.topicId })
    .from(challenges)
    .where(and(eq(challenges.status, 'open'), lt(challenges.defaultLossAt, now)))
    .limit(100);

  for (const challenge of due) {
    await db.insert(claimEvents).values({
      topicId: challenge.topicId,
      type: 'challenge_timer',
      detail: { challengeId: challenge.id, phase: 'due' },
    });
  }

  return NextResponse.json({ scanned: due.length });
}
