"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { requestPasswordReset } from '@/app/forgot-password/actions';
import { AuthAlert, AuthField } from './form-parts';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setPending(true);
    const formData = new FormData();
    formData.set('email', email);
    const result = await requestPasswordReset(formData);
    setOk(result.ok);
    setMessage(result.message);
    setPending(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <AuthField
        id="email"
        label="注册邮箱"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        placeholder="you@example.com"
        hint="我们会把重置链接发到这个邮箱，链接 60 分钟内有效。"
      />
      {message && <AuthAlert kind={ok ? 'success' : 'error'}>{message}</AuthAlert>}
      <Button type="submit" className="h-10 w-full" disabled={pending}>
        {pending ? '发送中…' : '发送重置链接'}
      </Button>
    </form>
  );
}
