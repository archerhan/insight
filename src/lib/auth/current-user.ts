import { cache } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getUserById } from '@/db/services/users';
import { isSessionStale } from '@/lib/auth/session';
import { loginHref } from '@/lib/auth/url';

/**
 * M1 会话桥：Auth.js session 只存 users.id，
 * 需要完整档案的页面统一走这里（服务端，权限收敛在 repository 层）。
 * 用 React cache 做请求级去重：全局壳顶栏与页面在同一请求内只查一次用户。
 */
export const getCurrentUser = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await getUserById(session.user.id);
  if (!user) return null;
  // 密码被重置后，旧 JWT 仍在浏览器里，靠这一句把它们判为未登录。
  if (isSessionStale(user, session.user.pwdAt)) return null;
  return user;
});

/** 需要登录的页面入口；未登录跳转到 /login?callbackUrl=当前路径。 */
export async function getCurrentUserOrRedirect(callbackUrl: string) {
  const user = await getCurrentUser();
  if (!user) redirect(loginHref(callbackUrl));
  return user;
}
