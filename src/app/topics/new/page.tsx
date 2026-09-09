import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Compass, FileText, ListTree, Scale } from 'lucide-react';
import { getCurrentUserOrRedirect } from '@/lib/auth/current-user';
import { hasCompletedCourse } from '@/lib/domain/course';

export const metadata: Metadata = {
  title: '发起话题 · 灼见',
};

const STEPS = [
  { icon: Scale, label: '类型', note: '我在做选择 / 验证一个观点' },
  { icon: FileText, label: '主张与论据', note: '一句话主张 + 背景 + 首条论据' },
  { icon: ListTree, label: '规则与发布', note: '立帖为证日期、公开范围与预览' },
];

export default async function NewTopicPage() {
  const user = await getCurrentUserOrRedirect('/topics/new');
  if (!hasCompletedCourse(user)) {
    redirect('/guide?next=%2Ftopics%2Fnew');
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        灼见 · 发布
      </p>
      <h1 className="mt-1 text-2xl font-medium tracking-tight">发起话题</h1>
      <p className="mt-2 text-[14px] leading-6 text-muted-foreground">
        三步向导在 M2 落地：类型 → 主张与论据 → 规则与发布。发布前系统会再次校验讨论须知。
      </p>

      <ol className="mt-8 flex flex-col gap-3">
        {STEPS.map((step, index) => (
          <li
            key={step.label}
            className="flex items-center gap-4 rounded-xl border border-border bg-card p-5 opacity-70"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted-foreground">
              <step.icon className="size-4.5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-medium">
                <span className="mr-2 text-muted-foreground">{index + 1}.</span>
                {step.label}
              </p>
              <p className="mt-0.5 text-[13px] text-muted-foreground">{step.note}</p>
            </div>
            <span className="ml-auto shrink-0 rounded-full bg-violet-bg px-2.5 py-1 text-[11px] font-medium text-violet">
              待开放
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-8 flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-[13px] text-muted-foreground">
        <Compass className="size-4 shrink-0 text-primary" aria-hidden="true" />
        发布即公开，发帖人与楼主不可自行删除，只可修订留痕——这是灼见的默认规则。
      </div>
    </main>
  );
}
