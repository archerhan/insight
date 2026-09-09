"use client";

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Quote, Target } from 'lucide-react';
import { placePredictionAction, type TopicActionState } from '@/app/topics/[id]/actions';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { StatusChip } from '@/components/status-chip';
import type { ChipTone } from '@/lib/domain/predictions';

const initialActionState: TopicActionState = { error: null };

export interface PredictionUserRecord {
  statement: string;
  outcomeLabel: string;
  chipLabel: string;
  chipTone: ChipTone;
  createdAtLabel: string;
}

export interface PredictionPanelProps {
  topicId: string;
  revealAt: string | null;
  openCount: number;
  openCap: number;
  regretOpenCount: number;
  noRegretOpenCount: number;
  settled: boolean;
  realityResultLabel: string | null;
  userPrediction: PredictionUserRecord | null;
  /** null = 无登记障碍（还需登录且话题开放）；否则给出一句可展示的原因。 */
  gateError: string | null;
  canRegister: boolean;
  loginHref: string | null;
}

const inputClass =
  'mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40';

function revealLabel(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * 话题页"立帖为证"登记/状态卡（M5 最小版）：
 * 已登记 → 只读展示；未登记且可押 → 一句话押注 + 方向选择；
 * 已过揭晓日/已回访 → 展示揭晓结果，登记关闭。
 */
export function PredictionPanel({
  topicId,
  revealAt,
  openCount,
  openCap,
  regretOpenCount,
  noRegretOpenCount,
  settled,
  realityResultLabel,
  userPrediction,
  gateError,
  canRegister,
  loginHref,
}: PredictionPanelProps) {
  const [open, setOpen] = useState(false);
  const [statement, setStatement] = useState('');
  const [outcome, setOutcome] = useState<'regret' | 'no_regret'>('regret');
  const [state, action] = useActionState(placePredictionAction, initialActionState);
  const dateLabel = revealLabel(revealAt);

  const registerVisible = canRegister && !settled && !userPrediction;

  return (
    <section
      className="mt-5 rounded-xl border border-border bg-card p-4 sm:p-5"
      aria-label="立帖为证"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="flex items-center gap-1.5 text-[15px] font-medium">
          <Target className="size-4 text-violet" aria-hidden="true" />
          立帖为证
        </h2>
        <span className="text-xs text-muted-foreground">
          {openCount} 人登记 · 押后悔 {regretOpenCount} · 押不后悔 {noRegretOpenCount}
          {dateLabel ? ` · 揭晓日 ${dateLabel}` : ''}
        </span>
        {settled && realityResultLabel && (
          <StatusChip label={`已揭晓：${realityResultLabel}`} tone="pro" />
        )}
      </div>

      {userPrediction && (
        <div className="mt-3 flex flex-wrap items-start gap-3 rounded-lg bg-surface-2/60 px-4 py-3">
          <Quote className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] leading-6">{userPrediction.statement}</p>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
              {userPrediction.outcomeLabel} · {userPrediction.createdAtLabel}
            </p>
          </div>
          <StatusChip label={userPrediction.chipLabel} tone={userPrediction.chipTone} />
        </div>
      )}

      {!registerVisible && !userPrediction && (gateError || !loginHref) && !settled && (
        <p className="mt-3 rounded-lg bg-surface-2/60 px-4 py-3 text-[12.5px] leading-5 text-muted-foreground">
          {gateError ?? '登录后即可立帖为证，把判断力押在时间上。'}
        </p>
      )}

      {!registerVisible && !userPrediction && !gateError && !settled && loginHref && (
        <div className="mt-3">
          <Link href={loginHref} className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
            登录后立帖为证
          </Link>
        </div>
      )}

      {registerVisible && (
        <form action={action} className="mt-3">
          <input type="hidden" name="topicId" value={topicId} />
          <p className="text-[12.5px] leading-5 text-muted-foreground">
            一句话把判断押在时间上：楼主揭晓后，命中即计入判断力战绩。
            同一话题每人只登记一次（开放登记上限 {openCap} 条，当前已开放 {openCount} 条）。
          </p>

          <div className="mt-2.5 flex flex-wrap gap-2" role="radiogroup" aria-label="押注方向">
            {(
              [
                { value: 'regret', label: '押楼主会后悔' },
                { value: 'no_regret', label: '押楼主不会后悔' },
              ] as const
            ).map((option) => (
              <label
                key={option.value}
                className={cn(
                  'flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] transition-colors',
                  outcome === option.value
                    ? 'border-violet/60 bg-violet-bg text-violet'
                    : 'border-border text-muted-foreground hover:bg-surface-2',
                )}
              >
                <input
                  type="radio"
                  name="predictedOutcome"
                  value={option.value}
                  checked={outcome === option.value}
                  onChange={() => setOutcome(option.value)}
                  className="sr-only"
                />
                {option.label}
              </label>
            ))}
          </div>

          <label className="mt-2.5 block text-[12.5px] text-muted-foreground">
            你的押注原话（公开留档）
            <textarea
              className={cn(inputClass, 'min-h-16 resize-y')}
              name="statement"
              value={statement}
              onChange={(event) => setStatement(event.target.value)}
              maxLength={200}
              placeholder="例如：我押你三个月内会后悔——民宿淡季现金流会被证照周期拖垮。"
            />
          </label>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm">
              立帖为证
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen((value) => !value)}>
              {open ? '收起' : '说明'}
            </Button>
          </div>
          {open && (
            <p className="mt-2 text-[12px] leading-5 text-muted-foreground">
              揭晓以楼主回访为准：后悔/没后悔对应双方命中；部分后悔双方押注作废。
              本阶段只记录战绩，不涉及真实币。
            </p>
          )}
          {state.error && (
            <p role="alert" className="mt-2 flex items-start gap-1.5 text-[12.5px] text-con">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {state.error}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
