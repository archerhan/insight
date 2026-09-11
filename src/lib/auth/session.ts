/**
 * 会话失效判定：token 里记着签发时的 password_changed_at，
 * 若账户当前的 password_changed_at 与 token 里的不一致，说明密码在本次会话之后被改过/重置过，旧会话作废。
 */

export interface SessionStaleUser {
  passwordChangedAt: Date | null;
}

export function isSessionStale(
  user: SessionStaleUser,
  tokenPasswordChangedAt: string | null | undefined,
): boolean {
  const current = user.passwordChangedAt ? user.passwordChangedAt.toISOString() : null;
  return current !== (tokenPasswordChangedAt ?? null);
}
