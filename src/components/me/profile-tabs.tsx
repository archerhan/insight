"use client";

import { useState } from 'react';
import { cn } from '@/lib/utils';

export interface ProfileTabPanel {
  id: string;
  label: string;
  content: React.ReactNode;
}

/**
 * 我的战绩页 Tab（我的话题 / 我的押注）：
 * 纯展示切换，内容由服务端渲染后传入，避免重复查询。
 */
export function ProfileTabs({ panels }: { panels: ProfileTabPanel[] }) {
  const [activeId, setActiveId] = useState(panels[0]?.id);
  const active = panels.find((panel) => panel.id === activeId) ?? panels[0];

  return (
    <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap gap-1 border-b border-border pb-3" role="tablist" aria-label="内容分类">
        {panels.map((panel) => {
          const selected = panel.id === active?.id;
          return (
            <button
              key={panel.id}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`profile-panel-${panel.id}`}
              id={`profile-tab-${panel.id}`}
              onClick={() => setActiveId(panel.id)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground',
                selected && 'bg-violet-bg font-medium text-violet',
              )}
            >
              {panel.label}
            </button>
          );
        })}
      </div>

      <div
        key={active?.id}
        role="tabpanel"
        id={`profile-panel-${active?.id}`}
        aria-labelledby={`profile-tab-${active?.id}`}
        className="mt-4"
      >
        {active?.content}
      </div>
    </section>
  );
}
