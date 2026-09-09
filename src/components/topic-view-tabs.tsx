"use client";

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  resolveTopicView,
  TOPIC_VIEWS,
  topicViewHref,
  type TopicView,
} from '@/lib/navigation/topic-view';

/**
 * 议题页内三视图切换条（M1 壳组件，M3 议题页接入）。
 * fallback 由页面按议题状态决定：进行中默认对线，已收敛默认结论书。
 */
export function TopicViewTabs({
  defaultView = 'arena',
  className,
}: {
  defaultView?: TopicView;
  className?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = Object.fromEntries(searchParams.entries());
  const active = resolveTopicView(query, defaultView);

  return (
    <div
      role="tablist"
      aria-label="议题视图"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg border border-border bg-muted/60 p-0.5',
        className,
      )}
    >
      {TOPIC_VIEWS.map((view) => {
        const isActive = active === view.id;
        return (
          <Link
            key={view.id}
            role="tab"
            aria-selected={isActive}
            href={topicViewHref(view.id, pathname, searchParams)}
            className={cn(
              'rounded-md px-3.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-background hover:text-foreground',
              isActive && 'bg-surface font-medium text-foreground shadow-sm',
            )}
          >
            {view.label}
          </Link>
        );
      })}
    </div>
  );
}
