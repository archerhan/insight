import type { Metadata } from 'next';
import Link from 'next/link';
import { BookOpen, CheckCircle2, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { getCurrentUser } from '@/lib/auth/current-user';
import { loginHref, safeRelativeUrl } from '@/lib/auth/url';
import { hasCompletedCourse } from '@/lib/domain/course';
import { completeCourse } from './actions';

export const metadata: Metadata = {
  title: '理性讨论须知 · 灼见',
};

const RULES = [
  {
    title: '对论点，不对人',
    body: '批评“这句话为什么站不住”，而不是“你动机不纯 / 你水平不行”。贴标签、人身攻击会被程序标记并挂红。',
  },
  {
    title: '反驳前先复述',
    body: '发反驳前，先用你自己的话复述对方观点。说不清对方在主张什么，就不算一次有效的反驳。',
  },
  {
    title: '区分事实、推断与偏好',
    body: '事实要给出来源，推断要说明推理链，偏好要明说“这是我想要”。拿不准就标注“未证”，不要把它当结论。',
  },
  {
    title: '允许被说服',
    body: '发现对方说得对，就公开承认并记录立场变化。“改主意”在这里是诚实的战绩，不是丢脸。',
  },
  {
    title: '一次一个论点',
    body: '一个论点只回应一次核心反驳；重复内容会被合并。刷屏不会让观点更正确，只会让讨论更难收敛。',
  },
  {
    title: '挂红是检验台，不是羞辱',
    body: '未回应计时是为了推动讨论收敛，让对方有机会回应，而不是给“吵架”记分。',
  },
];

function firstString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function formatTime(value: Date): string {
  return value.toLocaleString('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default async function GuidePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeRelativeUrl(firstString(params.next), '/topics/new');
  const user = await getCurrentUser();
  const completed = hasCompletedCourse(user);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="mb-8 flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-lg bg-violet-bg text-violet">
          <ShieldCheck className="size-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            灼见 · 入门
          </p>
          <h1 className="text-xl font-medium tracking-tight">理性讨论须知</h1>
        </div>
      </div>

      <section className="rounded-xl border border-border bg-card p-6 sm:p-8">
        <p className="text-[15px] leading-7">
          约 5 分钟。完成一次即可永久通过，通过后才能发布话题。
          这些规则不是“平台规定”，而是让一场讨论有机会收敛成结论的协作约定。
        </p>

        <ol className="mt-6 flex flex-col gap-4">
          {RULES.map((rule, index) => (
            <li key={rule.title} className="flex gap-3.5">
              <span
                aria-hidden="true"
                className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-medium text-muted-foreground"
              >
                {index + 1}
              </span>
              <div className="min-w-0">
                <h2 className="text-[15px] font-medium">{rule.title}</h2>
                <p className="mt-1 text-[13.5px] leading-6 text-muted-foreground">{rule.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-6 rounded-xl border border-border bg-card p-6 sm:p-8">
        {!user ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <div>
              <p className="text-[15px] font-medium">登录后完成，进度会记在你的档案里</p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                首次登录会自动创建灼见档案，只占用你的 GitHub 身份，不读取仓库。
              </p>
            </div>
            <Link
              href={loginHref(`/guide?next=${encodeURIComponent(next)}`)}
              className={cn('h-9 px-4', 'inline-flex items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/80')}
            >
              使用 GitHub 登录并继续
            </Link>
          </div>
        ) : completed ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className="size-8 text-pro" aria-hidden="true" />
            <div>
              <p className="text-[15px] font-medium">
                {user.displayName}，你已于 {formatTime(new Date(user.courseCompletedAt!))} 完成
              </p>
              <p className="mt-1 text-[13px] text-muted-foreground">现在可以发布话题了。</p>
            </div>
            <Link
              href={next}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/80"
            >
              去发起话题
            </Link>
          </div>
        ) : (
          <form action={completeCourse} className="flex flex-col items-center gap-4 text-center">
            <input type="hidden" name="next" value={next} />
            <p className="max-w-lg text-[13px] leading-6 text-muted-foreground">
              确认你理解了以上六条。完成后我会把通过时间写入你的档案；
              发布话题前，系统会再次校验这一门槛。
            </p>
            <Button type="submit" className="h-9 px-5">
              <BookOpen aria-hidden="true" />
              我已读完并理解
            </Button>
          </form>
        )}
      </section>
    </main>
  );
}
