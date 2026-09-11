"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { resetPassword } from '@/app/reset-password/actions';
import type { FieldErrors } from '@/lib/auth/validation';
import { AuthAlert, AuthField } from './form-parts';

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setMessage(null);
    setPending(true);

    const formData = new FormData();
    formData.set('token', token);
    formData.set('password', password);
    formData.set('confirmPassword', confirmPassword);

    const result = await resetPassword(formData);
    if (!result.ok) {
      setErrors(result.errors ?? {});
      setMessage(result.message ?? null);
      setPending(false);
      return;
    }
    router.push('/login?reset=1');
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <AuthField
        id="password"
        label="新密码"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        placeholder="至少 8 位，含字母和数字"
        error={errors.password}
      />
      <AuthField
        id="confirmPassword"
        label="确认新密码"
        type="password"
        value={confirmPassword}
        onChange={setConfirmPassword}
        autoComplete="new-password"
        placeholder="再输入一次"
        error={errors.confirmPassword}
      />
      {message && <AuthAlert kind="error">{message}</AuthAlert>}
      <Button type="submit" className="h-10 w-full" disabled={pending}>
        {pending ? '保存中…' : '保存新密码'}
      </Button>
      <p className="text-[12.5px] leading-5 text-muted-foreground">
        保存后其他设备上的登录会失效，需要用新密码重新登录。
      </p>
    </form>
  );
}
