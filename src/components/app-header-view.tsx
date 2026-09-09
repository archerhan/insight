"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, Scale } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { signOutAction } from '@/app/actions/auth';

export interface AppHeaderUser {
  displayName: string;
  avatarUrl: string | null;
}

const NAV_ITEMS = [
  { href: '/', label: '广场' },
  { href: '/me', label: '我的战绩' },
] as const;

export function AppHeaderView({ user }: { user: AppHeaderUser | null }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-[1120px] items-center gap-5 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="灼见首页">
          <span className="grid size-6 place-items-center rounded-md bg-primary text-primary-foreground">
            <Scale className="size-4" aria-hidden="true" />
          </span>
          <span className="text-base font-medium tracking-tight">灼见</span>
        </Link>

        <nav className="hidden items-center gap-1 text-sm sm:flex" aria-label="主导航">
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                  active && 'bg-muted font-medium text-foreground',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link href="/topics/new" className={cn(buttonVariants({ variant: 'default' }))}>
            发起话题
          </Link>
          {user ? (
            <div className="flex items-center gap-1.5">
              <span
                className="flex items-center gap-2 rounded-full py-0.5 pl-0.5 pr-2 text-sm text-muted-foreground"
                title={user.displayName}
              >
                {user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.avatarUrl}
                    alt=""
                    className="size-7 rounded-full border border-border"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="grid size-7 place-items-center rounded-full bg-primary/10 text-xs font-medium text-primary"
                  >
                    {user.displayName.slice(0, 1)}
                  </span>
                )}
                <span className="hidden max-w-24 truncate lg:inline">{user.displayName}</span>
              </span>
              <form action={signOutAction}>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  type="submit"
                  aria-label={`退出登录（${user.displayName}）`}
                  title="退出登录"
                >
                  <LogOut aria-hidden="true" />
                </Button>
              </form>
            </div>
          ) : (
            <Link
              href="/login"
              className={cn(buttonVariants({ variant: 'outline' }), 'hidden sm:inline-flex')}
            >
              登录
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
