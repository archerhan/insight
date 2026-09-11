"use client";

import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export const authInputClass =
  'mt-1.5 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 aria-invalid:border-destructive';

export function AuthField({
  id,
  label,
  type = 'text',
  value,
  onChange,
  autoComplete,
  placeholder,
  error,
  hint,
  action,
  inputMode,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  placeholder?: string;
  error?: string | null;
  hint?: string;
  /** 输入框右侧的操作（例如"发送验证码"按钮）。 */
  action?: ReactNode;
  inputMode?: 'text' | 'numeric';
}) {
  return (
    <div>
      <label htmlFor={id} className="text-[13.5px] font-medium">
        {label}
      </label>
      <div className={action ? 'flex items-start gap-2' : undefined}>
        <input
          id={id}
          name={id}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          inputMode={inputMode}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cn(authInputClass, action && 'mt-1.5 flex-1', error && 'border-destructive')}
        />
        {action}
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-[12.5px] text-con">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[12.5px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function AuthAlert({
  kind,
  children,
}: {
  kind: 'error' | 'success' | 'info';
  children: ReactNode;
}) {
  const styles = {
    error: 'bg-con-bg text-con',
    success: 'bg-pro-bg text-pro',
    info: 'bg-violet-bg text-violet',
  }[kind];
  const Icon = kind === 'success' ? CheckCircle2 : AlertCircle;
  return (
    <p
      role={kind === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-1.5 rounded-lg px-3 py-2 text-[12.5px] leading-5',
        styles,
      )}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
