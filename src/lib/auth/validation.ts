/** 邮箱注册 / 重置密码的表单校验（纯函数，服务端必校验，客户端用于即时反馈）。 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const DISPLAY_NAME_MAX_LENGTH = 24;

export interface RegistrationInput {
  email: string;
  displayName: string;
  password: string;
  confirmPassword: string;
}

export interface PasswordResetInput {
  password: string;
  confirmPassword: string;
}

export interface FieldErrors {
  email?: string;
  displayName?: string;
  password?: string;
  confirmPassword?: string;
  code?: string;
}

export const SIGNUP_CODE_PATTERN = /^\d{6}$/;

export function isValidSignupCode(code: string): boolean {
  return SIGNUP_CODE_PATTERN.test(code.trim());
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  if (email.length === 0 || email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** 展示用脱敏：`ming@example.com` → `mi***@example.com`。 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return '你的邮箱';
  const at = email.indexOf('@');
  if (at <= 0) return '你的邮箱';
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const visible = local.slice(0, Math.min(2, Math.max(1, local.length - 1)));
  return `${visible}***${domain}`;
}

/** 返回密码不合规的原因；null 表示合规。 */
export function passwordIssue(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `密码至少 ${PASSWORD_MIN_LENGTH} 位`;
  if (password.length > PASSWORD_MAX_LENGTH) return `密码最多 ${PASSWORD_MAX_LENGTH} 位`;
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return '密码需同时包含字母和数字';
  return null;
}

export function validateRegistration(
  input: RegistrationInput,
): { ok: true; email: string; displayName: string; password: string } | { ok: false; errors: FieldErrors } {
  const email = normalizeEmail(input.email);
  const displayName = input.displayName.trim();
  const errors: FieldErrors = {};

  if (!isValidEmail(email)) errors.email = '请输入有效的邮箱地址';
  if (displayName.length === 0) errors.displayName = '请填写昵称';
  else if (displayName.length > DISPLAY_NAME_MAX_LENGTH) {
    errors.displayName = `昵称最多 ${DISPLAY_NAME_MAX_LENGTH} 个字`;
  }
  const issue = passwordIssue(input.password);
  if (issue) errors.password = issue;
  if (input.password !== input.confirmPassword) errors.confirmPassword = '两次输入的密码不一致';

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, email, displayName, password: input.password };
}

export function validatePasswordReset(
  input: PasswordResetInput,
): { ok: true; password: string } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const issue = passwordIssue(input.password);
  if (issue) errors.password = issue;
  if (input.password !== input.confirmPassword) errors.confirmPassword = '两次输入的密码不一致';
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, password: input.password };
}
