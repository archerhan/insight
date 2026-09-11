import type { ReactNode } from 'react';
import { Scale } from 'lucide-react';

/** 登录/注册/找回密码共用的居中卡片布局。 */
export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-[calc(100dvh-3.5rem)] w-full max-w-md flex-col items-center justify-center px-4 py-12">
      <div className="w-full rounded-xl border border-border bg-card p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Scale className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-xl font-medium tracking-tight">{title}</h1>
            <p className="mt-1 text-[13px] leading-6 text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="mt-6">{children}</div>
      </div>
      {footer}
    </main>
  );
}
