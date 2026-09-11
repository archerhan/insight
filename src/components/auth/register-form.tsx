"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { registerAccount, sendSignupCode } from '@/app/register/actions';
import type { FieldErrors } from '@/lib/auth/validation';
import { sameOriginPath } from '@/lib/auth/url';
import { AuthAlert, AuthField } from './form-parts';

export function RegisterForm({ callbackUrl = '/guide' }: { callbackUrl?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [codeNotice, setCodeNotice] = useState<{ kind: 'info' | 'error'; text: string } | null>(
    null,
  );

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((value) => (value <= 1 ? 0 : value - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function handleSendCode() {
    setCodeNotice(null);
    setSending(true);
    const formData = new FormData();
    formData.set('email', email);
    const result = await sendSignupCode(formData);
    setSending(false);
    setCodeNotice({ kind: result.ok ? 'info' : 'error', text: result.message });
    if (result.retryAfterSeconds) setCooldown(result.retryAfterSeconds);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setMessage(null);
    setPending(true);

    const formData = new FormData();
    formData.set('email', email);
    formData.set('code', code);
    formData.set('displayName', displayName);
    formData.set('password', password);
    formData.set('confirmPassword', confirmPassword);

    const result = await registerAccount(formData);
    if (!result.ok) {
      setErrors(result.errors ?? {});
      setMessage(result.message ?? null);
      setPending(false);
      return;
    }

    // 注册成功即自动登录，直接进入须知页（首次登录的唯一门槛）
    const signedIn = await signIn('credentials', { email, password, redirect: false });
    if (!signedIn || signedIn.error) {
      // 极小概率：注册成功但自动登录失败，退回登录页让用户手动登录
      router.push('/login?registered=1');
      setPending(false);
      return;
    }
    router.push(sameOriginPath(signedIn.url, callbackUrl, window.location.origin));
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
        error={errors.email}
      />
      <AuthField
        id="code"
        label="邮箱验证码"
        value={code}
        onChange={setCode}
        autoComplete="one-time-code"
        inputMode="numeric"
        placeholder="6 位数字"
        error={errors.code}
        action={
          <Button
            type="button"
            variant="outline"
            className="mt-1.5 shrink-0"
            onClick={handleSendCode}
            disabled={sending || cooldown > 0}
          >
            {cooldown > 0 ? `${cooldown}s 后重发` : sending ? '发送中…' : '发送验证码'}
          </Button>
        }
      />
      {codeNotice && (
        <AuthAlert kind={codeNotice.kind === 'info' ? 'info' : 'error'}>{codeNotice.text}</AuthAlert>
      )}
      <AuthField
        id="displayName"
        label="昵称"
        value={displayName}
        onChange={setDisplayName}
        autoComplete="nickname"
        placeholder="别人怎么称呼你（可随时改）"
        error={errors.displayName}
      />
      <AuthField
        id="password"
        label="密码"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        placeholder="至少 8 位，含字母和数字"
        error={errors.password}
      />
      <AuthField
        id="confirmPassword"
        label="确认密码"
        type="password"
        value={confirmPassword}
        onChange={setConfirmPassword}
        autoComplete="new-password"
        placeholder="再输入一次"
        error={errors.confirmPassword}
      />
      {message && <AuthAlert kind="error">{message}</AuthAlert>}
      <Button type="submit" className="h-10 w-full" disabled={pending}>
        {pending ? '创建中…' : '创建账号'}
      </Button>
      <p className="text-[12.5px] leading-5 text-muted-foreground">
        注册后可随时用邮箱登录；我们只会用这个邮箱发与账号相关的通知。
      </p>
    </form>
  );
}
