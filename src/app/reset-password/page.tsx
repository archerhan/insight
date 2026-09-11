import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/components/auth/auth-card';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';
import { findPasswordResetToken } from '@/db/services/password-reset';
import { isTokenUsable } from '@/lib/auth/tokens';
import { maskEmail } from '@/lib/auth/validation';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: '重置密码 · 灼见',
};

function firstString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const token = firstString((await searchParams).token) ?? '';
  const lookup = token ? await findPasswordResetToken(token) : null;

  if (!lookup || !isTokenUsable(lookup)) {
    return (
      <AuthCard
        title="重置链接已失效"
        description="这个链接可能已经过期，或者已经被使用过了。重新申请一个即可。"
        footer={
          <p className="mt-5 text-[13px] text-muted-foreground">
            需要帮助？{' '}
            <Link href="/login" className="text-primary hover:underline">
              返回登录
            </Link>
          </p>
        }
      >
        <Link
          href="/forgot-password"
          className={cn(buttonVariants({ variant: 'default' }), 'h-10 w-full')}
        >
          重新申请重置链接
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="设置新密码"
      description={`为 ${maskEmail(lookup.user.email)} 设置新密码。`}
    >
      <ResetPasswordForm token={token} />
    </AuthCard>
  );
}
