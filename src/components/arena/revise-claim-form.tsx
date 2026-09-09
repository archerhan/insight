"use client";

import { useActionState, useState } from 'react';
import { AlertCircle, PencilLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  reviseClaimAction,
  type TopicActionState,
} from '@/app/topics/[id]/actions';

const initialActionState: TopicActionState = { error: null };

export interface ReviseClaimFormProps {
  topicId: string;
  claimId: string;
  claimTitle: string;
}

/**
 * 修订观点（作者本人）：生成 supersedes 新版并归档旧版；
 * 修订完成后可在新版焦点抢救迁移旧版的悬空子论点。
 */
export function ReviseClaimForm({ topicId, claimId, claimTitle }: ReviseClaimFormProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(claimTitle);
  const [body, setBody] = useState('');
  const [state, action] = useActionState(reviseClaimAction, initialActionState);

  return (
    <div>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen((value) => !value)}>
        <PencilLine aria-hidden="true" />
        修订观点
      </Button>
      {open && (
        <form action={action} className="mt-3 w-full rounded-lg border border-border bg-surface-2/60 p-3">
          <input type="hidden" name="topicId" value={topicId} />
          <input type="hidden" name="claimId" value={claimId} />
          <p className="text-[13px] font-medium">修订后旧版归档（superseded），反驳仍指向旧版</p>
          <label className="mt-2 block text-[12.5px] text-muted-foreground">
            修订后的一句话主张
            <input
              className={cn(
                'mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none',
                'placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40',
              )}
              name="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
            />
          </label>
          <label className="mt-2 block text-[12.5px] text-muted-foreground">
            修订说明 / 新论证（可选）
            <textarea
              className={cn(
                'mt-1.5 min-h-16 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none',
                'placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40',
              )}
              name="body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={2000}
            />
          </label>
          <div className="mt-2.5 flex items-center gap-2">
            <Button type="submit" size="sm">
              发布修订
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
