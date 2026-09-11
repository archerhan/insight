/** 只放行站内相对路径，防止 callbackUrl 被用于开放重定向。 */
export function safeRelativeUrl(value: string | null | undefined, fallback = '/'): string {
  if (!value) return fallback;
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  return value;
}

export function loginHref(callbackUrl: string): string {
  return `/login?callbackUrl=${encodeURIComponent(safeRelativeUrl(callbackUrl))}`;
}

/** 站点对外地址：邮件里的链接用它拼接（优先 AUTH_URL，与 OAuth 回调保持同一域名）。 */
export function publicAppUrl(env: Record<string, string | undefined> = process.env): string {
  const raw = env.AUTH_URL?.trim() || env.NEXTAUTH_URL?.trim() || 'http://localhost:3000';
  return raw.replace(/\/+$/, '');
}

/**
 * Auth.js 的 signIn(redirect:false) 可能返回绝对 URL，
 * Next 客户端路由只认站内路径：同源转成 path+query，跨域一律回退到 fallback。
 * baseOrigin 由浏览器侧传 window.location.origin（服务端可传 AUTH_URL）。
 */
export function sameOriginPath(
  url: string | null | undefined,
  fallback: string = '/',
  baseOrigin?: string,
): string {
  if (!url) return fallback;
  const trimmed = url.trim();
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
  try {
    const target = new URL(trimmed);
    if (!baseOrigin || target.origin !== baseOrigin) return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}
