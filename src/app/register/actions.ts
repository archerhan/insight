"use server";

import { headers } from 'next/headers';
import { findUserByEmail } from '@/db/services/users';
import { registerEmailUser } from '@/db/services/registration';
import { issueSignupCode, SIGNUP_CODE_TTL_MINUTES } from '@/db/services/email-verification';
import { consumeRateLimit, RATE_LIMITS } from '@/lib/auth/rate-limit';
import {
  isValidSignupCode,
  maskEmail,
  normalizeEmail,
  isValidEmail,
  validateRegistration,
  type FieldErrors,
} from '@/lib/auth/validation';
import { mailerMode, sendMail } from '@/lib/email/mailer';
import { signupCodeEmail } from '@/lib/email/templates';
import { publicAppUrl } from '@/lib/auth/url';

export interface RegisterActionResult {
  ok: boolean;
  /** 表单级错误（限流、系统异常等）。 */
  message?: string;
  /** 字段级错误。 */
  errors?: FieldErrors;
}

export interface SendSignupCodeResult {
  ok: boolean;
  message: string;
  /** 冷却中返回剩余秒数，前端据此显示倒计时。 */
  retryAfterSeconds?: number;
}

async function clientIp(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || 'unknown';
}

export async function registerAccount(formData: FormData): Promise<RegisterActionResult> {
  const email = normalizeEmail(String(formData.get('email') ?? ''));
  const code = String(formData.get('code') ?? '').trim();

  const validated = validateRegistration({
    email,
    displayName: String(formData.get('displayName') ?? ''),
    password: String(formData.get('password') ?? ''),
    confirmPassword: String(formData.get('confirmPassword') ?? ''),
  });
  if (!validated.ok) return { ok: false, errors: validated.errors };
  if (!isValidSignupCode(code)) {
    return { ok: false, errors: { code: '请填写 6 位邮箱验证码' } };
  }

  const allowed = consumeRateLimit(`register:${await clientIp()}`, RATE_LIMITS.register).allowed;
  if (!allowed) {
    return { ok: false, message: '注册过于频繁，请稍后再试' };
  }

  const registered = await registerEmailUser({
    email: validated.email,
    displayName: validated.displayName,
    password: validated.password,
    code,
  });
  if (!registered.ok) {
    if (registered.reason === 'email_taken') {
      return { ok: false, errors: { email: '该邮箱已注册，请直接登录或使用忘记密码' } };
    }
    return {
      ok: false,
      errors: {
        code:
          registered.reason === 'expired_code'
            ? '验证码已过期，请重新获取'
            : registered.reason === 'too_many_attempts'
              ? '验证码错误次数过多，请重新获取'
              : '验证码不正确',
      },
    };
  }

  return { ok: true };
}

/** 发送注册验证码；邮箱是否已注册在此明确提示，避免用户白填一遍表单。 */
export async function sendSignupCode(formData: FormData): Promise<SendSignupCodeResult> {
  const email = normalizeEmail(String(formData.get('email') ?? ''));
  if (!isValidEmail(email)) {
    return { ok: false, message: '请先填写有效的邮箱地址' };
  }

  if (mailerMode() === 'disabled') {
    return { ok: false, message: '邮件服务尚未配置，暂时无法发送验证码，请联系管理员' };
  }

  if (await findUserByEmail(email)) {
    return { ok: false, message: '该邮箱已注册，请直接登录或使用忘记密码' };
  }

  const ip = await clientIp();
  const cooldown = consumeRateLimit(`signup-code:cooldown:${email}`, RATE_LIMITS.signupCodeCooldown);
  if (!cooldown.allowed) {
    const seconds = Math.ceil(cooldown.retryAfterMs / 1000);
    return { ok: false, message: `请 ${seconds} 秒后再获取验证码`, retryAfterSeconds: seconds };
  }
  if (!consumeRateLimit(`signup-code:email:${email}`, RATE_LIMITS.signupCodePerEmail).allowed) {
    return { ok: false, message: '该邮箱获取验证码过于频繁，请稍后再试' };
  }
  if (!consumeRateLimit(`signup-code:ip:${ip}`, RATE_LIMITS.signupCodePerIp).allowed) {
    return { ok: false, message: '获取验证码过于频繁，请稍后再试' };
  }

  const { code } = await issueSignupCode(email);
  const mail = signupCodeEmail({
    code,
    appUrl: publicAppUrl(),
    expiresInMinutes: SIGNUP_CODE_TTL_MINUTES,
  });
  const sent = await sendMail({ to: email, subject: mail.subject, text: mail.text, html: mail.html });
  if (!sent.ok) {
    console.error('[auth] 注册验证码发送失败', sent.error, sent.detail ?? '');
    return {
      ok: false,
      message: sent.error === 'not_configured' ? '邮件服务尚未配置，暂时无法发送验证码' : '验证码发送失败，请稍后重试',
    };
  }

  return {
    ok: true,
    message: `验证码已发送到 ${maskEmail(email)}，${SIGNUP_CODE_TTL_MINUTES} 分钟内有效`,
    retryAfterSeconds: 60,
  };
}
