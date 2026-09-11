"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { authErrorMessage } from '@/lib/auth/errors';
import { sameOriginPath } from '@/lib/auth/url';
import { AuthAlert, AuthField } from './form-parts';

export function EmailSignInForm({ callbackUrl = '/' }: { callbackUrl?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const result = await signIn('credentials', { email, password, redirect: false });
    if (!result || result.error) {
      setError(authErrorMessage(result?.error ?? 'CredentialsSignin'));
      setPending(false);
      return;
    }
    router.push(sameOriginPath(result.url, callbackUrl, window.location.origin));
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <AuthField
        id="email"
        label="邮箱"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        placeholder="you@example.com"
      />
      <AuthField
        id="password"
        label="密码"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="current-password"
        placeholder="请输入密码"
      />
      {error && <AuthAlert kind="error">{error}</AuthAlert>}
      <Button type="submit" className="h-10 w-full" disabled={pending}>
        {pending ? '登录中…' : '登录'}
      </Button>
    </form>
  );
}
