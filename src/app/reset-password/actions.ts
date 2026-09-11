"use server";

import { consumePasswordResetToken } from '@/db/services/password-reset';
import { validatePasswordReset, type FieldErrors } from '@/lib/auth/validation';

export interface ResetPasswordActionResult {
  ok: boolean;
  message?: string;
  errors?: FieldErrors;
}

export async function resetPassword(formData: FormData): Promise<ResetPasswordActionResult> {
  const token = String(formData.get('token') ?? '');
  const validated = validatePasswordReset({
    password: String(formData.get('password') ?? ''),
    confirmPassword: String(formData.get('confirmPassword') ?? ''),
  });
  if (!validated.ok) return { ok: false, errors: validated.errors };

  const consumed = await consumePasswordResetToken(token, validated.password);
  if (!consumed.ok) {
    return {
      ok: false,
      message:
        consumed.reason === 'expired'
          ? '重置链接已过期，请重新申请'
          : '重置链接无效或已被使用，请重新申请',
    };
  }

  return { ok: true, message: '密码已更新，请用新密码登录' };
}
