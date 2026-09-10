/**
 * 定时推进挑战阶段（替代 Vercel Cron）。
 *
 * vercel.json 配置的是每天 03:00 UTC 调用一次 /api/cron/advance，
 * 自建部署没有平台调度器，这里用最轻量的常驻进程顶上：
 * 每 CRON_TICK_SECONDS 检查一次，命中 UTC 目标小时后当天只调用一次。
 *
 * 推进逻辑本身是幂等的（可重复执行），因此即使重复触发也不会写坏数据。
 */
const url = process.env.CRON_URL ?? 'http://app:3000/api/cron/advance';
const hourUtc = Number(process.env.CRON_HOUR_UTC ?? 3);
const tickMs = Number(process.env.CRON_TICK_SECONDS ?? 300) * 1000;
const secret = process.env.CRON_SECRET;

if (!secret) {
  console.error('[scheduler] CRON_SECRET 未设置，退出');
  process.exit(1);
}

let lastRunDate = null;

async function tick() {
  const now = new Date();
  const dateKey = now.toISOString().slice(0, 10);
  if (now.getUTCHours() === hourUtc && lastRunDate !== dateKey) {
    lastRunDate = dateKey;
    try {
      const response = await fetch(url, {
        headers: { authorization: `Bearer ${secret}` },
      });
      console.log(
        `[scheduler] ${now.toISOString()} 触发 ${url} → ${response.status} ${await response.text()}`,
      );
    } catch (error) {
      console.error(`[scheduler] ${now.toISOString()} 调用失败`, error);
    }
  }
  setTimeout(tick, tickMs);
}

console.log(
  `[scheduler] 每 ${tickMs / 1000}s 检查一次，UTC ${hourUtc} 点触发 ${url}`,
);
void tick();
