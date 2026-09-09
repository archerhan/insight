import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Scale } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getCurrentUser } from '@/lib/auth/current-user';
import { safeRelativeUrl } from '@/lib/auth/url';
import { signInWithGithub } from './actions';

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

export const metadata: Metadata = {
  title: '登录 · 灼见',
};

function firstString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeRelativeUrl(firstString(params.callbackUrl));
  const user = await getCurrentUser();
  if (user) redirect(next);

  const githubConfigured = Boolean(process.env.AUTH_GITHUB_ID);

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-md flex-col items-center justify-center px-4 py-12">
      <div className="w-full rounded-xl border border-border bg-card p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Scale className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-xl font-medium tracking-tight">登录灼见</h1>
            <p className="mt-1 text-[13px] leading-6 text-muted-foreground">
              用 GitHub 登录。首次登录会自动创建你的灼见档案，
              假名与战绩都会记录在你名下。
            </p>
          </div>
        </div>

        <form action={signInWithGithub} className="mt-6 flex flex-col gap-3">
          <input type="hidden" name="callbackUrl" value={next} />
          <button
            type="submit"
            disabled={!githubConfigured}
            className={cn(
              'inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#24292f] px-4 text-sm font-medium text-white transition-colors hover:bg-[#1b1f24] disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            <GitHubMark className="size-4" />
            使用 GitHub 登录
          </button>
        </form>

        {!githubConfigured && (
          <p className="mt-3 rounded-lg bg-amber-bg px-3 py-2 text-[12.5px] leading-5 text-amber">
            GitHub 登录尚未配置：请在 .env.local 中填入 AUTH_GITHUB_ID 与
            AUTH_GITHUB_SECRET（在 GitHub Settings → Developer settings → OAuth Apps 创建）。
          </p>
        )}
      </div>
      <Link href="/" className="mt-5 text-[13px] text-muted-foreground hover:text-foreground">
        暂不登录，先逛逛 →
      </Link>
    </main>
  );
}
