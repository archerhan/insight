"use client";

import { useActionState } from 'react';
import { AlertCircle, LifeBuoy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  rescueMigrateAction,
  type TopicActionState,
} from '@/app/topics/[id]/actions';
import type { ArenaClaimNode } from '@/db/services/arena';

const initialActionState: TopicActionState = { error: null };

export interface RescueMigrateFormsProps {
  topicId: string;
  newParentId: string;
  claims: ArenaClaimNode[];
}

/**
 * 抢救迁移入口：旧版被修订后，仍有效的悬空子论点可迁移到新版（本焦点）下，
 * 只允许论点作者本人操作（服务层二次校验）。
 */
export function RescueMigrateForms({ topicId, newParentId, claims }: RescueMigrateFormsProps) {
  const [state, action] = useActionState(rescueMigrateAction, initialActionState);

  return (
    <section
      className="mt-4 rounded-xl border border-dashed border-amber/50 bg-amber-bg/40 p-3.5"
      aria-label="抢救迁移"
    >
      <h3 className="flex items-center gap-1.5 text-[13px] font-medium text-amber">
        <LifeBuoy className="size-4" aria-hidden="true" />
        可抢救的悬空子论点（{claims.length}）
      </h3>
      <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
        旧版论点已被修订，以下支撑子论点仍可迁移到当前修订版名下。
      </p>
      <div className="mt-2.5 flex flex-col gap-2">
        {claims.map((claim) => (
          <div
            key={claim.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-3 py-2"
          >
            <p className="min-w-0 flex-1 text-[13px] leading-5">{claim.contentTitle}</p>
            <form action={action} className="flex items-center gap-2">
              <input type="hidden" name="topicId" value={topicId} />
              <input type="hidden" name="claimId" value={claim.id} />
              <input type="hidden" name="newParentId" value={newParentId} />
              <Button type="submit" variant="outline" size="sm">
                迁移到本修订版
              </Button>
            </form>
          </div>
        ))}
      </div>
      {state.error && (
        <p role="alert" className="mt-2 flex items-start gap-1.5 text-[12.5px] text-con">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {state.error}
        </p>
      )}
    </section>
  );
}
