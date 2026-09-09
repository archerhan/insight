"use client";

import { useActionState, useState } from 'react';
import { AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  concedeChallengeAction,
  respondChallengeAction,
  type TopicActionState,
} from '@/app/topics/[id]/actions';

/**
 * 未决红条上的作者操作：回应（解除挂红）或承认击穿（触发击穿传播）。
 * 承认击穿需要二次确认——该动作会传播 悬空/moot 并提升击杀链，不可撤销。
 */

const initialActionState: TopicActionState = { error: null };

export interface ChallengeResponsePanelProps {
  topicId: string;
  challengeId: string;
  targetClaimId: string;
  canPost: boolean;
}

export function ChallengeResponsePanel({
  topicId,
  challengeId,
  targetClaimId,
  canPost,
}: ChallengeResponsePanelProps) {
  const [respondTitle, setRespondTitle] = useState('');
  const [respondBody, setRespondBody] = useState('');
  const [confirmingConcede, setConfirmingConcede] = useState(false);
  const [respondState, respondAction] = useActionState(respondChallengeAction, initialActionState);
  const [concedeState, concedeAction] = useActionState(concedeChallengeAction, initialActionState);

  if (!canPost) {
    return (
      <p className="mt-2 text-[12px] text-muted-foreground">
        完成《理性讨论须知》后即可回应。
      </p>
    );
  }

  return (
    <div className="mt-3 border-t border-dashed border-border pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={!confirmingConcede}
          onClick={() => setConfirmingConcede(false)}
        >
          回应这条反驳
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => setConfirmingConcede(true)}
        >
          <ShieldAlert aria-hidden="true" />
          承认击穿
        </Button>
      </div>

      {confirmingConcede ? (
        <div className="mt-3 rounded-lg border border-con/30 bg-con-bg/40 p-3">
          <p className="text-[13px] leading-6">
            确认承认这条反驳击穿了你的论点？
            <span className="mt-1 block text-[12px] text-muted-foreground">
              该论点将标记为已击穿；其支撑型子论点变为悬空（可抢救），其它反驳型后代变为 moot，击杀链顶端自动提升为理由层。
            </span>
          </p>
          <form action={concedeAction} className="mt-2.5 flex flex-wrap items-center gap-2">
            <input type="hidden" name="topicId" value={topicId} />
            <input type="hidden" name="challengeId" value={challengeId} />
            <input type="hidden" name="targetClaimId" value={targetClaimId} />
            <Button type="submit" variant="destructive" size="sm">
              确认承认击穿
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirmingConcede(false)}
            >
              取消
            </Button>
          </form>
          {concedeState.error && (
            <p role="alert" className="mt-2 flex items-start gap-1.5 text-[12.5px] text-con">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {concedeState.error}
            </p>
          )}
        </div>
      ) : (
        <form action={respondAction} className="mt-3">
          <input type="hidden" name="topicId" value={topicId} />
          <input type="hidden" name="challengeId" value={challengeId} />
          <input type="hidden" name="targetClaimId" value={targetClaimId} />
          <label className="block text-[12.5px] text-muted-foreground">
            一句话回应（回应会作为反驳节点挂到这条反驳之下，解除本红条）
            <input
              className={cn(
                'mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none',
                'placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40',
              )}
              name="title"
              value={respondTitle}
              onChange={(event) => setRespondTitle(event.target.value)}
              placeholder="例如：拿证可与在职期并行推进，不必然裸辞"
              maxLength={200}
            />
          </label>
          <label className="mt-2 block text-[12.5px] text-muted-foreground">
            展开论证（可选）
            <textarea
              className={cn(
                'mt-1.5 min-h-16 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none',
                'placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40',
              )}
              name="body"
              value={respondBody}
              onChange={(event) => setRespondBody(event.target.value)}
              maxLength={2000}
            />
          </label>
          <div className="mt-2.5 flex items-center gap-3">
            <Button type="submit" size="sm">
              提交回应
            </Button>
            <span className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground">
              <CheckCircle2 className="size-3.5" aria-hidden="true" />
              提交前自动查重与识别不友善用语
            </span>
          </div>
          {respondState.error && (
            <p role="alert" className="mt-2 flex items-start gap-1.5 text-[12.5px] text-con">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {respondState.error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
