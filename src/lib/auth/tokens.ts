import { createHash, randomBytes } from 'node:crypto';

/** 一次性令牌：明文只出现在邮件链接里，落库只存 sha256 摘要。 */

export const PASSWORD_RESET_TTL_MINUTES = 60;

export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function tokenExpiry(
  now: Date = new Date(),
  ttlMinutes: number = PASSWORD_RESET_TTL_MINUTES,
): Date {
  return new Date(now.getTime() + ttlMinutes * 60_000);
}

export function isTokenUsable(
  token: { expiresAt: Date | string; usedAt: Date | string | null },
  now: Date = new Date(),
): boolean {
  if (token.usedAt) return false;
  const expiresAt = new Date(token.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) return false;
  return expiresAt.getTime() > now.getTime();
}
