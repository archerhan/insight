"use client";

import { useActionState, useState } from 'react';
import { AlertCircle, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  recordStanceChangeAction,
  type TopicActionState,
} from '@/app/topics/[id]/actions';

const initialActionState: TopicActionState = { error: null };

const inputClass =
  'mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40';

export interface StanceSourceOption {
  id: string;
  contentTitle: string;
  authorName: string | null;
}

export interface StanceChangeWizardProps {
  topicId: string;
  /** 当前视图，提交后回到同一 tab。 */
  tab: 'arena' | 'conclusion' | 'map';
  defaultFrom: string;
  /** 可作为“说服来源”的候选论点（服务端会二次校验归属与作者）。 */
  sources: StanceSourceOption[];
}

/**
 * “我改主意了”向导：from → to → 证词 → 可选说服来源。
 * 通过后会写入 stance_changes，并据 novelty 判定授予诚实/说服战绩。
 */
export function StanceChangeWizard({
  topicId,
  tab,
  defaultFrom,
  sources,
}: StanceChangeWizardProps) {
  const [open, setOpen] = useState(false);
  const [fromStance, setFromStance] = useState(defaultFrom);
  const [toStance, setToStance] = useState('');
  const [statement, setStatement] = useState('');
  const [state, action, pending] = useActionState(recordStanceChangeAction, initialActionState);

  return (
    <div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen((value) => !value)}
      >
        <RefreshCcw aria-hidden="true" />
        我改主意了
      </Button>
      {open && (
        <form action={action} className="mt-3 rounded-lg border border-border bg-surface-2/60 p-3 sm:p-4">
          <input type="hidden" name="topicId" value={topicId} />
          <input type="hidden" name="tab" value={tab} />
          <p className="text-[13px] font-medium leading-5">
            公开记录一次立场变更：诚实在这里是可展示的资产，不是难堪。
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-[12.5px] text-muted-foreground">
              原立场
              <input
                className={inputClass}
                name="fromStance"
                value={fromStance}
                onChange={(event) => setFromStance(event.target.value)}
                maxLength={200}
                placeholder="我之前主张…"
              />
            </label>
            <label className="block text-[12.5px] text-muted-foreground">
              新立场
              <input
                className={inputClass}
                name="toStance"
                value={toStance}
                onChange={(event) => setToStance(event.target.value)}
                maxLength={200}
                placeholder="我现在认为…"
              />
            </label>
          </div>

          <label className="mt-3 block text-[12.5px] text-muted-foreground">
            证词：你被什么说服、哪里想错了？（公开留档）
            <textarea
              className={cn(inputClass, 'min-h-20 resize-y')}
              name="statement"
              value={statement}
              onChange={(event) => setStatement(event.target.value)}
              maxLength={1000}
              placeholder="例如：对方的试住方案击中我的盲区——我赌的是生活方式，不是经营能力。"
            />
          </label>

          <label className="mt-3 block text-[12.5px] text-muted-foreground">
            说服来源（可选；选自本话题且晚于你既有立场的论点，才会计入说服战绩）
            <select
              className={inputClass}
              name="sourceClaimId"
              defaultValue=""
              onChange={() => undefined}
            >
              <option value="">自主改主意，不引用具体论点</option>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.contentTitle}（{source.authorName ?? '匿名'}）
                </option>
              ))}
            </select>
          </label>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? '提交中…' : '记录立场变更'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              取消
            </Button>
          </div>
          {state.error && (
            <p role="alert" className="mt-2 flex items-start gap-1.5 text-[12.5px] text-con">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {state.error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
