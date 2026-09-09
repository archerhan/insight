import Link from 'next/link';
import {
  AlertCircle,
  Download,
  FileText,
  GitBranch,
  Landmark,
  Scale,
  Users,
} from 'lucide-react';
import type { ConclusionView } from '@/db/services/conclusion';
import { statusMeta } from '@/lib/domain/arena';

/**
 * 结论书视图主体（服务端渲染）：
 * 结论摘要 + 采纳理由（附支撑链脚注）+ 未决风险区 + 导出入口。
 */

function StatCell({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg bg-surface-2 px-4 py-3">
      <p className="text-lg font-medium tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function chainEvidenceText(count: number): string {
  return count > 0 ? ` · 论据 ${count}` : '';
}

export interface ConclusionContentProps {
  data: ConclusionView;
}

export function ConclusionContent({
  data,
}: ConclusionContentProps) {
  const snapshotRiskCount = Array.isArray(data.version.summarySnapshot?.riskChallenges)
    ? (data.version.summarySnapshot?.riskChallenges as unknown[]).length
    : 0;

  return (
    <div className="mt-6 min-w-0">
      <section className="rounded-xl border border-border bg-card p-4 sm:p-5" aria-label="结论摘要">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11.5px] font-medium tracking-wide text-violet">
            结 论（{data.version.settlement === 'risk_closed' ? '带险' : '暂定'} · 第 {data.version.versionNo} 版）
          </span>
          <span className="ml-auto text-[12px] text-muted-foreground">
            {data.version.publishedAt
              ? `${data.version.publishedAt.toLocaleDateString('zh-CN')} 发布`
              : '尚未发布'}
          </span>
        </div>
        <h2 className="mt-2 text-[17px] font-medium leading-7">
          {data.version.verdictText}
        </h2>
        {data.version.recommendationText && (
          <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
            <span className="font-medium text-foreground">建议行动：</span>
            {data.version.recommendationText}
          </p>
        )}
        {data.version.premises && (
          <p className="mt-1.5 text-[13px] leading-6 text-muted-foreground">
            <span className="font-medium text-foreground">适用前提：</span>
            {data.version.premises}
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-dashed border-border pt-3">
          <Link
            href={`/topics/${encodeURIComponent(data.topicId)}/conclusion.md`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary/80"
          >
            <Download className="size-4" aria-hidden="true" />
            导出 Markdown
          </Link>
        </div>
      </section>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCell label="论点" value={data.nodeCount} />
        <StatCell label="采纳理由" value={data.adoptedCount} />
        <StatCell label="未决反驳" value={data.risks.length} />
        <StatCell label="参与者" value={data.participantCount} />
      </div>

      <section className="mt-6" aria-label="采纳理由">
        <h2 className="flex items-center gap-1.5 text-[15px] font-medium">
          <Scale className="size-4 text-violet" aria-hidden="true" />
          采纳理由
          <span className="text-xs font-normal text-muted-foreground">
            （理由层 · 支撑链已随版本冻结）
          </span>
        </h2>
        {data.items.length === 0 ? (
          <p className="mt-3 rounded-lg border border-dashed border-border bg-surface-2/50 p-4 text-[13px] text-muted-foreground">
            本版本没有采纳条目。
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2.5">
            {data.items.map((item) => {
              const meta = statusMeta(item.claimStatus);
              return (
                <li
                  key={item.id}
                  className="rounded-xl border border-border bg-card p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-violet">#{item.position}</span>
                    <span className="rounded-full bg-violet-bg px-2 py-0.5 text-[11px] font-medium text-violet">
                      {meta.label}
                    </span>
                  </div>
                  <p className="mt-2 text-[15px] font-medium leading-7">{item.contentTitle}</p>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    采纳自 {item.authorName ?? '匿名'}
                    {item.note ? ` · ${item.note}` : ''}
                  </p>
                  {item.supportChain.length > 0 && (
                    <div className="mt-3 rounded-lg bg-surface-2/60 px-3 py-2.5">
                      <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-muted-foreground">
                        <GitBranch className="size-3.5" aria-hidden="true" />
                        支撑链（脚注 · {item.supportChain.length}）
                      </p>
                      <ul className="mt-1.5 flex flex-col gap-1 text-[12.5px] leading-5">
                        {item.supportChain.map((entry) => (
                          <li key={entry.claimId} className="text-muted-foreground">
                            {entry.contentTitle}
                            <span className="text-[11.5px]">
                              （{entry.authorName ?? '匿名'}
                              {chainEvidenceText(entry.evidenceCount)}）
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {data.risks.length > 0 && (
        <section className="mt-6 rounded-xl border border-con/30 bg-con-bg/40 p-4" aria-label="未决风险">
          <h2 className="flex items-center gap-1.5 text-[14px] font-medium text-con">
            <AlertCircle className="size-4" aria-hidden="true" />
            未决风险 · 当前 {data.risks.length} 条
          </h2>
          <p className="mt-1 text-[12px] text-con/80">
            结论书发布时仍有反驳未被回应：读者应把这些条目当作结论的已知弱点。
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {data.risks.map((risk) => (
              <li
                key={risk.id}
                className="rounded-lg border border-con/20 bg-card p-3"
              >
                <p className="text-[13.5px] leading-6">
                  「{risk.challengerTitle}」→ 影响「{risk.targetTitle}」
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-muted-foreground">
                  <span>{risk.challengerAuthorName ?? '匿名'}</span>
                  <span className="rounded-full bg-amber-bg px-2 py-0.5 text-amber">
                    已挂红 {risk.openedDays} 天
                  </span>
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.risks.length === 0 && snapshotRiskCount > 0 && (
        <p className="mt-4 flex items-center gap-1.5 rounded-lg border border-dashed border-border bg-card/60 px-3 py-2.5 text-[12px] text-muted-foreground">
          <Landmark className="size-3.5 shrink-0" aria-hidden="true" />
          本版本以带险关闭发布（{snapshotRiskCount} 条），发布后风险已陆续回应，当前无未决项。
        </p>
      )}

      <section className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border bg-card/60 p-4 text-[13px] text-muted-foreground">
        <FileText className="size-4 shrink-0" aria-hidden="true" />
        <span className="flex-1">
          本结论书为决策快照：新证据可发起修订，被现实验证后会自动更新；所有条目均可回溯到具体论点。
        </span>
        <Link
          href={`/topics/${encodeURIComponent(data.topicId)}?tab=arena`}
          className="inline-flex items-center gap-1 text-[12.5px] text-violet hover:underline"
        >
          <Users className="size-3.5" aria-hidden="true" />
          去对线视图查看完整论据
        </Link>
      </section>
    </div>
  );
}
