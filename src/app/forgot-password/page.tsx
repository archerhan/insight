import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/components/auth/auth-card';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';

export const metadata: Metadata = {
  title: '忘记密码 · 灼见',
};

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="忘记密码"
      description="填写注册邮箱，我们会发送一封带重置链接的邮件。"
      footer={
        <p className="mt-5 text-[13px] text-muted-foreground">
          想起来了？{' '}
          <Link href="/login" className="text-primary hover:underline">
            返回登录
          </Link>
        </p>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
