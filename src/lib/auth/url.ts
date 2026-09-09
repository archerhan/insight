/** 只放行站内相对路径，防止 callbackUrl 被用于开放重定向。 */
export function safeRelativeUrl(value: string | null | undefined, fallback = '/'): string {
  if (!value) return fallback;
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  return value;
}

export function loginHref(callbackUrl: string): string {
  return `/login?callbackUrl=${encodeURIComponent(safeRelativeUrl(callbackUrl))}`;
}
