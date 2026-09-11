import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/auth/auth-card';
import { RegisterForm } from '@/components/auth/register-form';
import { getCurrentUser } from '@/lib/auth/current-user';
import { safeRelativeUrl } from '@/lib/auth/url';

export const metadata: Metadata = {
  title: '创建账号 · 灼见',
};

function firstString(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeRelativeUrl(firstString(params.callbackUrl), '/guide');
  const user = await getCurrentUser();
  if (user) redirect(next);

  return (
    <AuthCard
      title="创建灼见账号"
      description="用邮箱注册。注册后读完《理性讨论须知》，就可以发起话题了。"
      footer={
        <p className="mt-5 text-[13px] text-muted-foreground">
          已有账号？{' '}
          <Link
            href={`/login?callbackUrl=${encodeURIComponent(next)}`}
            className="text-primary hover:underline"
          >
            去登录
          </Link>
        </p>
      }
    >
      <RegisterForm callbackUrl={next} />
    </AuthCard>
  );
}
