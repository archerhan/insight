"use server";

import { headers } from 'next/headers';
import { findUserByEmail } from '@/db/services/users';
import { issuePasswordResetToken } from '@/db/services/password-reset';
import { consumeRateLimit, RATE_LIMITS } from '@/lib/auth/rate-limit';
import { isValidEmail, normalizeEmail } from '@/lib/auth/validation';
import { PASSWORD_RESET_TTL_MINUTES } from '@/lib/auth/tokens';
import { publicAppUrl } from '@/lib/auth/url';
import { sendMail } from '@/lib/email/mailer';
import { passwordResetEmail } from '@/lib/email/templates';

export interface RequestResetResult {
  ok: boolean;
  message: string;
}

const GENERIC_MESSAGE = '如果该邮箱已经注册，我们已发送重置密码的邮件，请查收（含垃圾邮件箱）。';

async function clientIp(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || 'unknown';
}

export async function requestPasswordReset(formData: FormData): Promise<RequestResetResult> {
  const email = normalizeEmail(String(formData.get('email') ?? ''));
  if (!isValidEmail(email)) {
    return { ok: false, message: '请输入有效的邮箱地址' };
  }

  const limiterKey = `password-reset:${email}:${await clientIp()}`;
  if (!consumeRateLimit(limiterKey, RATE_LIMITS.passwordReset).allowed) {
    // 限流也不暴露账号是否存在，仍返回同样的文案
    return { ok: true, message: GENERIC_MESSAGE };
  }

  const user = await findUserByEmail(email);
  // 不区分「邮箱不存在 / 是 GitHub 账号 / 被停用」，统一文案，避免枚举注册邮箱
  if (!user || user.status !== 'active' || !user.passwordHash) {
    return { ok: true, message: GENERIC_MESSAGE };
  }

  const { token } = await issuePasswordResetToken(user.id);
  const appUrl = publicAppUrl();
  const link = `${appUrl}/reset-password?token=${encodeURIComponent(token)}`;
  const mail = passwordResetEmail({
    displayName: user.displayName,
    link,
    appUrl,
    expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
  });

  const sent = await sendMail({ to: email, subject: mail.subject, text: mail.text, html: mail.html });
  if (!sent.ok) {
    console.error('[auth] 重置密码邮件发送失败', sent.error, sent.detail ?? '');
    return {
      ok: false,
      message:
        sent.error === 'not_configured'
          ? '邮件服务尚未配置，暂时无法发送重置邮件，请联系管理员'
          : '邮件发送失败，请稍后重试',
    };
  }

  return { ok: true, message: GENERIC_MESSAGE };
}
