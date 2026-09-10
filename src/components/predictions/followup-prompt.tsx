"use client";

import { useActionState, useState } from 'react';
import { AlertCircle, MessageSquareReply } from 'lucide-react';
import { respondFollowupAction, type TopicActionState } from '@/app/topics/[id]/actions';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const initialActionState: TopicActionState = { error: null };

export interface FollowupPromptProps {
  topicId: string;
  wave: number;
  dueAt: string;
  /** 是否已到回访日（由服务端按当前时间判定，避免客户端渲染期调用 Date.now）。 */
  overdue: boolean;
}

const LEVEL_OPTIONS = [
  { value: 'no_regret', label: '没有后悔', hint: '当初的决定是对的' },
  { value: 'partial', label: '部分后悔', hint: '方向对，但有代价' },
  { value: 'regret', label: '后悔了', hint: '再来一次会改' },
] as const;

/**
 * 楼主回访提示条（T+30 先做）：到期待答 → 回访表单；
 * 未到期 → 展示预计时间。回答会落 reality_check 并揭晓大家的押注。
 */
export function FollowupPrompt({ topicId, wave, dueAt, overdue }: FollowupPromptProps) {
  const [level, setLevel] = useState<string>('no_regret');
  const [state, action, pending] = useActionState(respondFollowupAction, initialActionState);
  const due = new Date(dueAt);
  const dateLabel = due.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <section className="mt-5 rounded-xl border border-amber/50 bg-amber-bg/60 p-4 sm:p-5" aria-label="楼主回访">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="flex items-center gap-1.5 text-[15px] font-medium">
          <MessageSquareReply className="size-4 text-amber" aria-hidden="true" />
          楼主回访 · T+{wave}
        </h2>
        <span className="text-[12.5px] text-muted-foreground">
          {overdue ? `你的决定已过去 ${wave} 天，回答会揭晓大家立的帖` : `预计 ${dateLabel} 生成回访提醒`}
        </span>
      </div>

      {overdue ? (
        <form action={action} className="mt-3">
          <input type="hidden" name="topicId" value={topicId} />
          <input type="hidden" name="wave" value={String(wave)} />
          <p className="text-[12.5px] text-muted-foreground">
            现在回头看，当初的决定你后悔了吗？（公开留档）
          </p>
          <div className="mt-2.5 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="后悔程度">
            {LEVEL_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={cn(
                  'cursor-pointer rounded-lg border bg-card px-3.5 py-2.5 transition-colors',
                  level === option.value
                    ? 'border-amber/70 bg-amber-bg'
                    : 'border-border hover:bg-surface-2',
                )}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="regretLevel"
                    value={option.value}
                    checked={level === option.value}
                    onChange={() => setLevel(option.value)}
                    className="accent-amber"
                  />
                  <span className="text-[13.5px] font-medium">{option.label}</span>
                </span>
                <span className="mt-1 block pl-6 text-[11.5px] text-muted-foreground">
                  {option.hint}
                </span>
              </label>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? '提交中…' : '确认并揭晓押注'}
            </Button>
          </div>
          {state.error && (
            <p role="alert" className="mt-2 flex items-start gap-1.5 text-[12.5px] text-con">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {state.error}
            </p>
          )}
        </form>
      ) : (
        <p className="mt-2 rounded-lg bg-card/70 px-4 py-2.5 text-[12.5px] leading-5 text-muted-foreground">
          到时候我们会站内提醒你回访；你的回答会写入现实揭晓（reality check），
          并结算所有围绕这个话题的“立帖为证”。
        </p>
      )}
    </section>
  );
}
