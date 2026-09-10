"use client";

import { useActionState, useState } from 'react';
import { AlertCircle, CheckSquare2, FileCheck2, Swords } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  publishConclusionAction,
  type TopicActionState,
} from '@/app/topics/[id]/actions';
import type {
  AdoptionRootOption,
  ConclusionRisk,
} from '@/db/services/conclusion';
import { statusMeta } from '@/lib/domain/arena';

const initialActionState: TopicActionState = { error: null };

const inputClass =
  'mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40';

export interface ConclusionWizardProps {
  topicId: string;
  roots: AdoptionRootOption[];
  openChallenges: ConclusionRisk[];
}

/**
 * 楼主出结论书 v1 向导：
 * 勾选理由层采纳条目 → 填结论/建议/前提 → 存在未决反驳时逐条勾选后才能带险发布。
 */
export function ConclusionWizard({
  topicId,
  roots,
  openChallenges,
}: ConclusionWizardProps) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(roots.map((root) => root.id)),
  );
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());
  const [state, action, pending] = useActionState(publishConclusionAction, initialActionState);

  function toggleSelected(claimId: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(claimId)) next.delete(claimId);
      else next.add(claimId);
      return next;
    });
  }

  function toggleAcknowledged(challengeId: string) {
    setAcknowledged((previous) => {
      const next = new Set(previous);
      if (next.has(challengeId)) next.delete(challengeId);
      else next.add(challengeId);
      return next;
    });
  }

  const allRisksAcknowledged =
    openChallenges.length > 0 && openChallenges.every((challenge) => acknowledged.has(challenge.id));
  const canSubmit = selected.size > 0 && (openChallenges.length === 0 || allRisksAcknowledged);

  return (
    <section
      className="mt-6 rounded-xl border border-border bg-card p-4 sm:p-5"
      aria-label="出结论书向导"
    >
      <div className="flex items-center gap-2">
        <FileCheck2 className="size-5 text-violet" aria-hidden="true" />
        <h2 className="text-[15px] font-medium">出结论书 v1</h2>
      </div>
      <p className="mt-1.5 text-[13px] leading-6 text-muted-foreground">
        正文只收录理由层论点（含被击穿后自动提升到理由层的击杀链）；深层论据会作为支撑链快照随版本冻结。
      </p>

      <form action={action} className="mt-4">
        <input type="hidden" name="topicId" value={topicId} />

        <fieldset>
          <legend className="flex items-center gap-1.5 text-[13px] font-medium">
            <CheckSquare2 className="size-4 text-violet" aria-hidden="true" />
            采纳进结论书的理由（{selected.size}/{roots.length}）
          </legend>
          {roots.length === 0 ? (
            <p className="mt-2 rounded-lg border border-dashed border-border bg-surface-2/50 px-3 py-2.5 text-[12.5px] text-muted-foreground">
              当前没有可采纳的理由层论点——先发布你的根立场，或在击穿确认后等待击杀链自动提升。
            </p>
          ) : (
            <ul className="mt-2.5 flex flex-col gap-2">
              {roots.map((root) => {
                const meta = statusMeta(root.status);
                const checked = selected.has(root.id);
                return (
                  <li key={root.id}>
                    <label
                      className={cn(
                        'flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors',
                        checked
                          ? 'border-violet/40 bg-violet-bg/50'
                          : 'border-border bg-surface-2/40 hover:bg-surface-2/70',
                      )}
                    >
                      <input
                        type="checkbox"
                        name="adoptedClaimId"
                        value={root.id}
                        checked={checked}
                        onChange={() => toggleSelected(root.id)}
                        className="mt-1 accent-violet"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] leading-6">{root.contentTitle}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-muted-foreground">
                          <span>{root.authorName ?? '匿名'}</span>
                          <span className="rounded-full bg-surface-2 px-2 py-0.5">{meta.label}</span>
                          {root.openChallengeCount > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-bg px-2 py-0.5 text-amber">
                              <Swords className="size-3" aria-hidden="true" />
                              未决反驳 {root.openChallengeCount}
                            </span>
                          )}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </fieldset>

        <div className="mt-4 grid gap-3">
          <label className="block text-[12.5px] text-muted-foreground">
            结论（一句话说清这件事最后怎么定）
            <textarea
              className={cn(inputClass, 'min-h-20 resize-y')}
              name="verdictText"
              maxLength={500}
              placeholder="例如：不建议直接裸辞；先用年假完成实地验证与成本测算，再决定是否投入。"
              required
            />
          </label>
          <label className="block text-[12.5px] text-muted-foreground">
            建议行动（可选）
            <textarea
              className={cn(inputClass, 'min-h-16 resize-y')}
              name="recommendationText"
              maxLength={1000}
            />
          </label>
          <label className="block text-[12.5px] text-muted-foreground">
            适用前提（可选，例如“存款可支撑 6 个月空窗”）
            <textarea
              className={cn(inputClass, 'min-h-14 resize-y')}
              name="premises"
              maxLength={1000}
            />
          </label>
        </div>

        {openChallenges.length > 0 && (
          <div className="mt-4 rounded-lg border border-con/30 bg-con-bg/40 p-3">
            <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-con">
              <AlertCircle className="size-4" aria-hidden="true" />
              带险关闭：以下 {openChallenges.length} 条反驳仍未回应，逐条勾选后才能发布
            </p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {openChallenges.map((challenge) => {
                const checked = acknowledged.has(challenge.id);
                return (
                  <li key={challenge.id}>
                    <label className="flex cursor-pointer items-start gap-2 rounded-md bg-card/70 px-2.5 py-2 text-[12.5px]">
                      <input
                        type="checkbox"
                        name="acknowledgedChallengeId"
                        value={challenge.id}
                        checked={checked}
                        onChange={() => toggleAcknowledged(challenge.id)}
                        className="mt-0.5 accent-con"
                      />
                      <span className="min-w-0 leading-5">
                        <span className="block">
                          「{challenge.challengerTitle}」→ 影响「{challenge.targetTitle}」
                        </span>
                        <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
                          {challenge.challengerAuthorName ?? '匿名'} · 已挂红 {challenge.openedDays} 天 · 我已知晓并接受该风险
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={!canSubmit || pending}>
            {pending ? '发布中…' : '发布结论书'}
          </Button>
          {!canSubmit && selected.size === 0 && (
            <span className="text-[12px] text-muted-foreground">请至少勾选一条采纳理由</span>
          )}
          {!canSubmit && selected.size > 0 && openChallenges.length > 0 && (
            <span className="text-[12px] text-muted-foreground">
              还剩 {openChallenges.filter((challenge) => !acknowledged.has(challenge.id)).length} 条风险未确认
            </span>
          )}
          <span className="text-[12px] text-muted-foreground">
            发布后话题收敛，结论书对外可见并可导出 Markdown
          </span>
        </div>
        {state.error && (
          <p role="alert" className="mt-3 flex items-start gap-1.5 text-[12.5px] leading-5 text-con">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {state.error}
          </p>
        )}
      </form>

      <p className="mt-4 border-t border-dashed border-border pt-3 text-[12.5px] leading-5 text-muted-foreground">
        如果你在整理结论时发现被某条论据说服了，可以顺手记录一次公开立场变更——诚实会进入你的战绩。
      </p>
    </section>
  );
}
