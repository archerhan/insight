import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUserOrRedirect } from '@/lib/auth/current-user';
import { hasCompletedCourse } from '@/lib/domain/course';
import type { TopicType } from '@/lib/domain/publish';
import { NewTopicWizard } from './topic-wizard';

export const metadata: Metadata = {
  title: '发起话题 · 灼见',
};

function firstString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function NewTopicPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const initialType: TopicType = firstString(params.type) === 'claim' ? 'claim' : 'decision';

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
        三步完成：类型 → 主张与论据 → 规则与发布。发布前系统会再次校验讨论须知。
      </p>
      <div className="mt-8">
        <NewTopicWizard initialType={initialType} />
      </div>
    </main>
  );
}
